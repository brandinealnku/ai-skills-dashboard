from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Dict, Iterable, List, Tuple

import requests

# ==========================================================
# 1) AI term dictionary (transparent & executive-defensible)
# ==========================================================
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

# ==========================================================
# 2) Dashboard families (simple, editable)
# ==========================================================
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

# Federal occupational series codes commonly associated with IT/CS
IT_SERIES = {"2210", "1550", "1560", "0854", "0855"}

def classify_family(title: str) -> str:
    for family in ["Data & Analytics", "Marketing", "Human Resources", "IT/CS"]:
        if FAMILY_REGEX[family].search(title):
            return family
    return "Other"

# ==========================================================
# 3) USAJOBS Historic JOA (public government postings)
# ==========================================================
HISTORIC_BASE = "https://data.usajobs.gov/api/historicjoa"  # public endpoint (no key)

def fmt_mmddyyyy(d: date) -> str:
    return d.strftime("%m-%d-%Y")

def add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m-1])
    return date(y, m, day)

def month_start_end(d: date) -> Tuple[date, date]:
    start = date(d.year, d.month, 1)
    if d.month == 12:
        end = date(d.year + 1, 1, 1)
    else:
        end = date(d.year, d.month + 1, 1)
    return start, end

def safe_series(record: dict) -> List[str]:
    cats = record.get("jobCategories") or []
    series = []
    for c in cats:
        s = str(c.get("series", "")).strip()
        if s:
            series.append(s)
    return series

def is_it_series(series_list: List[str]) -> bool:
    return any(s in IT_SERIES for s in series_list)

def fetch_historicjoa(start_open: date, end_open: date) -> Iterable[dict]:
    # Docs: GET /api/historicjoa with date range params :contentReference[oaicite:5]{index=5}
    params = {
        "StartPositionOpenDate": fmt_mmddyyyy(start_open),
        "EndPositionOpenDate": fmt_mmddyyyy(end_open),
        "PageSize": 1000,
    }
    continuation = None
    while True:
        p = dict(params)
        if continuation:
            p["ContinuationToken"] = continuation

        r = requests.get(HISTORIC_BASE, params=p, timeout=60)
        r.raise_for_status()
        payload = r.json()

        for rec in payload.get("data", []):
            yield rec

        continuation = payload.get("paging", {}).get("metadata", {}).get("continuationToken")
        next_url = payload.get("paging", {}).get("next")
        if not next_url or not continuation:
            break

@dataclass
class WindowStats:
    label: str
    total: int
    ai: int

    @property
    def share(self) -> float:
        return (self.ai / self.total * 100.0) if self.total else 0.0

def compute_usajobs_monthly_trend(months_back: int) -> Tuple[List[WindowStats], int]:
    today = date.today()
    first_of_this_month = date(today.year, today.month, 1)
    start_month = add_months(first_of_this_month, -months_back)

    stats: List[WindowStats] = []
    total_rows_seen = 0

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
            total_rows_seen += 1
            if AI_RE.search(title):
                ai += 1

        stats.append(WindowStats(label=m_start.strftime("%b %Y"), total=total, ai=ai))
        cursor = m_end

    return stats, total_rows_seen

def compute_usajobs_family_snapshot(snapshot_months_back: int) -> Dict[str, float]:
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

    shares: Dict[str, float] = {}
    for family, total in totals.items():
        shares[family] = (ai_totals.get(family, 0) / total * 100.0) if total else 0.0
    return shares

def compute_usajobs_outside_it_share(snapshot_months_back: int) -> Tuple[int, int, int]:
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
        if series and is_it_series(series):
            it_ai += 1
        elif series:
            non_it_ai += 1
        else:
            fam = classify_family(title)
            (it_ai if fam == "IT/CS" else non_it_ai) += 1

    total_ai = it_ai + non_it_ai
    if total_ai == 0:
        return (0, 0, 0)

    outside_pct = round(non_it_ai / total_ai * 100)
    return (outside_pct, 100 - outside_pct, total_ai)

# ==========================================================
# 4) Adzuna (broader market snapshot)
#    - Search endpoint returns job results including "created"
#    - Requires app_id + app_key :contentReference[oaicite:6]{index=6}
# ==========================================================
ADZUNA_ROOT = "https://api.adzuna.com/v1/api"

def adzuna_search(country: str, page: int, params: dict) -> dict:
    url = f"{ADZUNA_ROOT}/jobs/{country}/search/{page}"
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    return r.json()

def compute_adzuna_snapshot(country: str = "us", days: int = 30, pages: int = 5) -> dict:
    app_id = os.getenv("ADZUNA_APP_ID", "").strip()
    app_key = os.getenv("ADZUNA_APP_KEY", "").strip()
    if not app_id or not app_key:
        return {"enabled": False, "note": "Adzuna keys not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY secrets."}

    # Pull a representative slice: last N days, first few pages, max 50 each (limit varies; docs show results_per_page). :contentReference[oaicite:7]{index=7}
    base_params = {
        "app_id": app_id,
        "app_key": app_key,
        "content-type": "application/json",
        "results_per_page": 50,
        "max_days_old": days,
        "sort_by": "date",
    }

    total_jobs_seen = 0
    ai_jobs_seen = 0
    category_counts: Dict[str, int] = {}
    ai_term_counts: Dict[str, int] = {}

    term_list = [
        "artificial intelligence", "machine learning", "generative ai", "llm",
        "prompt engineering", "nlp", "data science", "model risk"
    ]
    term_res = [(t, re.compile(re.escape(t), re.IGNORECASE)) for t in term_list]

    for page in range(1, pages + 1):
        payload = adzuna_search(country, page, dict(base_params))
        results = payload.get("results", []) or []
        if not results:
            break

        for job in results:
            title = (job.get("title") or "").strip()
            if not title:
                continue
            total_jobs_seen += 1

            cat = (job.get("category") or {}).get("label") or "Uncategorized"
            category_counts[cat] = category_counts.get(cat, 0) + 1

            if AI_RE.search(title):
                ai_jobs_seen += 1
                for t, rx in term_res:
                    if rx.search(title):
                        ai_term_counts[t] = ai_term_counts.get(t, 0) + 1

    top_categories = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)[:6]
    top_terms = sorted(ai_term_counts.items(), key=lambda x: x[1], reverse=True)[:8]

    return {
        "enabled": True,
        "windowDays": days,
        "sampledPages": pages,
        "sampledResults": total_jobs_seen,
        "aiFlaggedResults": ai_jobs_seen,
        "aiShareInSamplePct": round((ai_jobs_seen / total_jobs_seen * 100.0), 2) if total_jobs_seen else 0.0,
        "topCategories": [{"name": k, "count": v} for k, v in top_categories],
        "topAITermsInTitles": [{"term": k, "count": v} for k, v in top_terms],
        "note": (
            "Adzuna snapshot is a sampled view of recent US postings (last N days, first pages). "
            "It is designed as a directional market pulse alongside the government postings trend."
        )
    }

# ==========================================================
# 5) O*NET Web Services v2 (skills taxonomy + hot technologies)
#    - Server-side Basic Authentication :contentReference[oaicite:8]{index=8}
#    - Hot Technologies endpoint :contentReference[oaicite:9]{index=9}
# ==========================================================
ONET_V2 = "https://api-v2.onetcenter.org/online"

# Choose a few occupations that resonate broadly across NKU:
# (Edit this list to match your programs / colleges.)
ONET_OCCUPATIONS = [
    ("15-2051.00", "Data Scientists"),
    ("15-1252.00", "Software Developers"),
    ("11-3021.00", "Computer and Information Systems Managers"),
    ("13-1111.00", "Management Analysts"),
]

def onet_basic_auth_header(username: str, password: str) -> dict:
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {token}", "Accept": "application/json"}

def fetch_onet_hot_tech(occ_code: str, headers: dict, top_n: int = 10) -> List[dict]:
    # Docs: /online/occupations/{code}/hot_technology :contentReference[oaicite:10]{index=10}
    url = f"{ONET_V2}/occupations/{occ_code}/hot_technology"
    params = {"start": 1, "end": top_n, "sort": "percentage"}
    r = requests.get(url, headers=headers, params=params, timeout=60)
    r.raise_for_status()
    payload = r.json()
    items = payload.get("example", []) or []
    out = []
    for it in items:
        out.append({
            "title": it.get("title"),
            "percentage": it.get("percentage"),
            "inDemand": bool(it.get("in_demand", False)),
            "hotTechnology": bool(it.get("hot_technology", False)),
            "href": it.get("href"),
        })
    return out

def compute_onet_hot_technologies() -> dict:
    username = os.getenv("ONET_USERNAME", "").strip()
    password = os.getenv("ONET_PASSWORD", "").strip()
    if not username or not password:
        return {"enabled": False, "note": "O*NET credentials not configured. Add ONET_USERNAME and ONET_PASSWORD secrets."}

    headers = onet_basic_auth_header(username, password)

    results = []
    for code, label in ONET_OCCUPATIONS:
        try:
            hot = fetch_onet_hot_tech(code, headers=headers, top_n=10)
            results.append({
                "onetSoc": code,
                "occupation": label,
                "hotTechnologies": hot
            })
        except Exception as e:
            results.append({
                "onetSoc": code,
                "occupation": label,
                "error": str(e)
            })

    return {
        "enabled": True,
        "occupations": results,
        "note": (
            "O*NET Hot Technologies provides standardized, occupation-linked technology signals published via the official O*NET Web Services API. "
            "Percentages reflect the ratio of postings mentioning the technology to all postings linked to that occupation (as defined by O*NET)."
        )
    }

# ==========================================================
# 6) Build final dashboard JSON (executive voice)
# ==========================================================
def build_dashboard_json() -> dict:
    months_back = int(os.getenv("MONTHS_BACK", "24"))
    snapshot_months_back = int(os.getenv("SNAPSHOT_MONTHS_BACK", "1"))

    pulled_on = date.today().isoformat()

    # USAJOBS backbone
    trend, usajobs_rows = compute_usajobs_monthly_trend(months_back=months_back)
    family_shares = compute_usajobs_family_snapshot(snapshot_months_back=snapshot_months_back)
    outside_it, it_pct, ai_total_snapshot = compute_usajobs_outside_it_share(snapshot_months_back=snapshot_months_back)

    # Pick headline families (prefer these; else top shares)
    preferred = ["Data & Analytics", "Marketing", "Human Resources"]
    available = {k: v for k, v in family_shares.items() if k != "Other"}
    labels = [f for f in preferred if f in available]
    if len(labels) < 3:
        remaining = sorted([k for k in available.keys() if k not in labels], key=lambda k: available[k], reverse=True)
        labels.extend(remaining[: (3 - len(labels))])
    values = [round(available.get(l, 0.0), 1) for l in labels]

    # Extra lenses
    adzuna = compute_adzuna_snapshot(country="us", days=30, pages=5)
    onet = compute_onet_hot_technologies()

    return {
        "lastUpdated": pulled_on,
        "takeaway": {
            "headline": "NKU is ahead of the curve: this dashboard auto-refreshes from credible labor-market signals to keep academic planning current.",
            "subhead": (
                "We pair public U.S. government job-posting trends (USAJOBS) with a broader commercial-market pulse (Adzuna) "
                "and standardized occupation-linked skills language (O*NET). The result is an executive-ready view of where AI is showing up, "
                "how fast expectations are shifting, and which skills map cleanly to curriculum outcomes across colleges."
            ),
            "executiveNotes": [
                f"Auto-refresh date: {pulled_on}. Dashboard data is rebuilt on schedule via GitHub Actions and published to GitHub Pages.",
                "Credibility by design: government postings + official skills taxonomy, supplemented by a broader market snapshot.",
                "Transparency: AI signal is measured using a published, editable dictionary of AI terms and clear job-family rules."
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
                "title": "AI mentions in job postings over time (USAJOBS Historic JOA — public U.S. government postings)",
                "labels": [w.label for w in trend],
                "values": [round(w.share, 2) for w in trend],
                "note": (
                    "Monthly metric computed as: (# postings with AI terms in title) ÷ (total postings opened that month) × 100. "
                    f"Rows analyzed for this trend window: ~{usajobs_rows:,} postings (counts vary by month)."
                )
            },
            "aiMentionsByFamily": {
                "title": "AI signal by job family (snapshot month, USAJOBS postings)",
                "labels": labels,
                "values": values,
                "note": (
                    "Snapshot metric computed as: (# postings with AI terms in title within a family) ÷ (total postings within that family) × 100. "
                    "Families are assigned using transparent title-based rules (editable in the script)."
                )
            },
            "aiOutsideITShare": {
                "title": "AI demand extends beyond IT/CS (share of AI-flagged postings outside IT/CS, snapshot month)",
                "labels": ["Outside IT/CS", "IT/CS"],
                "values": [outside_it, it_pct],
                "note": (
                    "Computed from AI-flagged postings in the snapshot month. "
                    f"AI-flagged postings in snapshot month: {ai_total_snapshot:,}. "
                    "Where available, federal occupational series codes are used to classify IT/CS; otherwise a title-based fallback is used."
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
        "marketLenses": {
            "adzunaUSSnapshot": adzuna,
            "onetHotTechnologies": onet
        },
        "sources": [
            {
                "name": f"USAJOBS Historic JOA API (public U.S. government job postings) — pulled on {pulled_on}",
                "url": "https://developer.usajobs.gov/api-reference/get-api-historicjoa"
            },
            {
                "name": "Adzuna Job Search API (commercial market snapshot; search results include created timestamps; requires app_id/app_key)",
                "url": "https://developer.adzuna.com/docs/search"
            },
            {
                "name": "O*NET Web Services (official) — server-side Basic Authentication + API reference",
                "url": "https://services.onetcenter.org/reference/"
            },
            {
                "name": "O*NET Web Services v2 — Hot Technologies endpoint (occupation-linked tech signals)",
                "url": "https://services.onetcenter.org/reference/online/occupation/technology"
            },
            {
                "name": "O*NET OnLine Help — Web Services authentication overview (Basic auth)",
                "url": "https://www.onetonline.org/help/onet/webservices"
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
