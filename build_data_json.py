from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Dict, Iterable, List, Tuple

import requests

HISTORIC_BASE = "https://data.usajobs.gov/api/historicjoa"

# -----------------------------
# Executive-friendly AI term set
# (transparent + editable)
# -----------------------------
AI_TITLE_PATTERNS = [
    r"\bai\b",
    r"artificial intelligence",
    r"machine learning",
    r"\bml\b",
    r"generative ai",
    r"\bllm\b",
    r"prompt engineering",
    r"natural language processing",
    r"\bnlp\b",
    r"data science",
    r"model risk",
]

AI_RE = re.compile("|".join(f"(?:{p})" for p in AI_TITLE_PATTERNS), flags=re.IGNORECASE)

# -----------------------------
# Job family rules (transparent)
# You can tailor these to NKU audiences.
# -----------------------------
FAMILY_RULES = {
    "Data & Analytics": [
        r"data", r"analytics", r"statistic", r"research", r"operations research",
        r"biostat", r"economist", r"modeler", r"scientist"
    ],
    "Marketing": [
        r"marketing", r"communications", r"brand", r"content", r"social media",
        r"seo", r"growth", r"digital marketing", r"market research"
    ],
    "Human Resources": [
        r"human resources", r"\bhr\b", r"talent", r"recruit", r"people analytics",
        r"learning", r"organizational", r"workforce"
    ],
    "IT/CS": [
        r"\bit\b", r"information technology", r"software", r"developer", r"engineer",
        r"cyber", r"security", r"cloud", r"systems", r"network", r"devops"
    ],
}

FAMILY_REGEX = {k: re.compile("|".join(f"(?:{p})" for p in v), re.IGNORECASE) for k, v in FAMILY_RULES.items()}

# A conservative set of occupational series often associated with IT/CS in federal hiring.
# (You can expand this later with USAJOBS code lists if you want.)
IT_SERIES = {"2210", "1550", "1560", "0854", "0855"}

# -----------------------------
# Helpers
# -----------------------------
def month_start_end(d: date) -> Tuple[date, date]:
    """Return (start_of_month, end_of_month) for a given date."""
    start = date(d.year, d.month, 1)
    if d.month == 12:
        end = date(d.year + 1, 1, 1)
    else:
        end = date(d.year, d.month + 1, 1)
    return start, end

def add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m-1])
    return date(y, m, day)

def fmt_mmddyyyy(d: date) -> str:
    return d.strftime("%m-%d-%Y")

def safe_series(record: dict) -> List[str]:
    # Historic JOA records have jobCategories with "series" values
    cats = record.get("jobCategories") or []
    series = []
    for c in cats:
        s = str(c.get("series", "")).strip()
        if s:
            series.append(s)
    return series

def classify_family(title: str) -> str:
    # Priority order matters (D&A before IT/CS, etc.)
    for family in ["Data & Analytics", "Marketing", "Human Resources", "IT/CS"]:
        if FAMILY_REGEX[family].search(title):
            return family
    return "Other"

def is_it_series(series_list: List[str]) -> bool:
    return any(s in IT_SERIES for s in series_list)

# -----------------------------
# USAJOBS Historic JOA fetch
# Public endpoint (no key required)
# Supports date range filters:
# StartPositionOpenDate / EndPositionOpenDate, etc.
# -----------------------------
def fetch_historicjoa(start_open: date, end_open: date) -> Iterable[dict]:
    params = {
        "StartPositionOpenDate": fmt_mmddyyyy(start_open),
        "EndPositionOpenDate": fmt_mmddyyyy(end_open),
        "PageSize": 1000,
    }

    url = HISTORIC_BASE
    continuation = None

    while True:
        p = dict(params)
        if continuation:
            p["ContinuationToken"] = continuation

        r = requests.get(url, params=p, timeout=60)
        r.raise_for_status()
        payload = r.json()

        for rec in payload.get("data", []):
            yield rec

        next_url = payload.get("paging", {}).get("next")
        continuation = payload.get("paging", {}).get("metadata", {}).get("continuationToken")

        # If no next link or token, stop.
        if not next_url or not continuation:
            break

# -----------------------------
# Metric builders
# -----------------------------
@dataclass
class WindowStats:
    label: str
    total: int
    ai: int

    @property
    def share(self) -> float:
        return (self.ai / self.total * 100.0) if self.total else 0.0

def compute_monthly_trend(months_back: int) -> List[WindowStats]:
    today = date.today()
    # Work from the start of this month going backwards; exclude partial current month
    first_of_this_month = date(today.year, today.month, 1)
    start_month = add_months(first_of_this_month, -months_back)

    stats: List[WindowStats] = []

    cursor = start_month
    while cursor < first_of_this_month:
        m_start, m_end = month_start_end(cursor)
        total = 0
        ai = 0

        for rec in fetch_historicjoa(m_start, m_end):
            title = (rec.get("positionTitle") or "").strip()
            if not title:
                continue
            total += 1
            if AI_RE.search(title):
                ai += 1

        stats.append(WindowStats(label=m_start.strftime("%b %Y"), total=total, ai=ai))
        cursor = m_end

    return stats

def compute_family_snapshot(snapshot_months_back: int) -> Dict[str, float]:
    today = date.today()
    first_of_this_month = date(today.year, today.month, 1)
    snap_month = add_months(first_of_this_month, -snapshot_months_back)
    snap_start, snap_end = month_start_end(snap_month)

    totals: Dict[str, int] = {}
    ai_totals: Dict[str, int] = {}

    for rec in fetch_historicjoa(snap_start, snap_end):
        title = (rec.get("positionTitle") or "").strip()
        if not title:
            continue

        family = classify_family(title)
        totals[family] = totals.get(family, 0) + 1

        if AI_RE.search(title):
            ai_totals[family] = ai_totals.get(family, 0) + 1

    # Convert to % share within each family
    shares: Dict[str, float] = {}
    for family, total in totals.items():
        ai_count = ai_totals.get(family, 0)
        shares[family] = (ai_count / total * 100.0) if total else 0.0

    return shares

def compute_outside_it_share(snapshot_months_back: int) -> Tuple[int, int]:
    """Return (outside_it_pct, it_pct) based on occupational series when available,
    else fallback to title family classification.
    """
    today = date.today()
    first_of_this_month = date(today.year, today.month, 1)
    snap_month = add_months(first_of_this_month, -snapshot_months_back)
    snap_start, snap_end = month_start_end(snap_month)

    it_ai = 0
    non_it_ai = 0

    for rec in fetch_historicjoa(snap_start, snap_end):
        title = (rec.get("positionTitle") or "").strip()
        if not title or not AI_RE.search(title):
            continue

        series = safe_series(rec)
        if series:
            if is_it_series(series):
                it_ai += 1
            else:
                non_it_ai += 1
        else:
            # Fallback: title rule
            fam = classify_family(title)
            if fam == "IT/CS":
                it_ai += 1
            else:
                non_it_ai += 1

    total_ai = it_ai + non_it_ai
    if total_ai == 0:
        return (0, 0)

    outside_pct = round(non_it_ai / total_ai * 100)
    it_pct = 100 - outside_pct
    return (outside_pct, it_pct)

# -----------------------------
# Write dashboard JSON
# -----------------------------
def build_dashboard_json() -> dict:
    months_back = int(os.getenv("MONTHS_BACK", "24"))
    snapshot_months_back = int(os.getenv("SNAPSHOT_MONTHS_BACK", "1"))

    trend = compute_monthly_trend(months_back=months_back)
    family_shares = compute_family_snapshot(snapshot_months_back=snapshot_months_back)
    outside_it, it_pct = compute_outside_it_share(snapshot_months_back=snapshot_months_back)

    # Select three “exec-friendly” families if present; otherwise pick top 3 by share
    preferred = ["Data & Analytics", "Marketing", "Human Resources"]
    available = {k: v for k, v in family_shares.items() if k != "Other"}

    labels = [f for f in preferred if f in available]
    if len(labels) < 3:
        # Fill with top remaining by share
        remaining = sorted(
            [k for k in available.keys() if k not in labels],
            key=lambda k: available[k],
            reverse=True
        )
        labels.extend(remaining[: (3 - len(labels))])

    values = [round(available.get(l, 0.0), 1) for l in labels]

    # Executive narrative: positive + specific
    pulled_on = date.today().isoformat()

    return {
        "lastUpdated": pulled_on,
        "takeaway": {
            "headline": "NKU can lead with confidence: universal AI literacy + discipline-specific depth is now the winning play.",
            "subhead": (
                "This dashboard auto-refreshes from public U.S. government job-posting data and transparent rules. "
                "It tracks how often AI-related language appears in postings over time, where it shows up by job family, "
                "and how frequently AI signals extend beyond traditional IT/CS roles."
            ),
            "executiveNotes": [
                "Leading indicator: job-posting language changes quickly and signals employer expectations in near real time.",
                "Durable story: government-grade datasets support credibility and repeatability for institutional planning.",
                f"Auto-refresh: metrics were rebuilt and published on {pulled_on} via scheduled GitHub Actions."
            ]
        },
        "coreSkills": [
            { "title": "AI literacy & judgment", "desc": "Limits, failure modes, verification habits, and when not to use AI." },
            { "title": "Prompting + iteration", "desc": "Clear constraints, examples, critique loops, and evaluation criteria." },
            { "title": "Data literacy", "desc": "Data quality, privacy basics, measurement, and experimentation mindset." },
            { "title": "Responsible AI", "desc": "Bias, privacy/security, transparency, and human oversight." },
            { "title": "Human skills amplified by AI", "desc": "Problem framing, communication, domain context, ethical reasoning." }
        ],
        "charts": {
            "aiMentionsTrend": {
                "title": "AI mentions in job postings are rising (USAJOBS Historic JOA — public U.S. government postings)",
                "labels": [w.label for w in trend],
                "values": [round(w.share, 2) for w in trend],
                "note": (
                    "Computed monthly as: (# postings with AI terms in title) ÷ (total postings opened that month) × 100. "
                    "AI terms are a transparent dictionary (e.g., 'artificial intelligence', 'machine learning', 'LLM', 'generative AI')."
                )
            },
            "aiMentionsByFamily": {
                "title": "AI mentions differ by job family (monthly snapshot from USAJOBS postings)",
                "labels": labels,
                "values": values,
                "note": (
                    "Computed for the snapshot month as: (# postings with AI terms in title within a family) ÷ "
                    "(total postings within that family) × 100. "
                    "Families are assigned using transparent title-based rules (editable in scripts/build_data_json.py)."
                )
            },
            "aiOutsideITShare": {
                "title": "AI demand extends beyond IT/CS (share of AI-flagged postings outside IT/CS)",
                "labels": ["Outside IT/CS", "IT/CS"],
                "values": [outside_it, it_pct],
                "note": (
                    "Computed from AI-flagged postings in the snapshot month. "
                    "Where available, occupational series codes are used to classify IT/CS (e.g., 2210). "
                    "When series codes aren’t present, a title-based fallback is used."
                )
            }
        },
        "jobFamilies": {
            "Non-technical": [
                "AI-assisted workflow design (SOPs + QA checklists)",
                "Tool evaluation (capabilities, cost, risk, governance)",
                "Data-informed decision making and impact measurement",
                "Change management and stakeholder communication"
            ],
            "Technical": [
                "LLM integration patterns (RAG, tool use, evaluation)",
                "Testing and evaluation (quality, bias, robustness)",
                "Monitoring and lifecycle (drift, feedback, incident response)",
                "Security and privacy engineering fundamentals"
            ],
            "High-stakes": [
                "Risk assessment + controls (auditability, oversight)",
                "Documentation (decision logs, transparency)",
                "Fairness/bias evaluation and mitigation",
                "Escalation paths and human-in-the-loop review"
            ]
        },
        "sources": [
            {
                "name": f"USAJOBS Historic JOA API (public U.S. government job postings) — pulled on {pulled_on}",
                "url": "https://developer.usajobs.gov/api-reference/get-api-historicjoa"
            },
            {
                "name": "USAJOBS Historic JOA tutorial (date-range parameters like StartPositionOpenDate / EndPositionOpenDate)",
                "url": "https://developer.usajobs.gov/tutorials/past-job-announcements"
            }
        ]
    }

def main() -> None:
    data = build_dashboard_json()
    out_path = os.path.join(os.getcwd(), "data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"Wrote {out_path} (lastUpdated={data['lastUpdated']})")

if __name__ == "__main__":
    main()
