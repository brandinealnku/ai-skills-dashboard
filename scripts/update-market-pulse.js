import fs from "node:fs/promises";

const DATA_PATH = "./data.json";

/** ---- AI term list (keep short + executive) ---- */
const AI_TERMS = [
  "ai",
  "artificial intelligence",
  "generative ai",
  "chatgpt",
  "llm",
  "machine learning",
  "prompt"
];

function hasAiTerm(title = "") {
  const t = title.toLowerCase();
  return AI_TERMS.some((term) => t.includes(term));
}

function topCounts(items, keyFn, limit = 5) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function topTermCounts(titles, limit = 6) {
  const map = new Map();
  for (const title of titles) {
    const low = (title || "").toLowerCase();
    for (const term of AI_TERMS) {
      if (low.includes(term)) map.set(term, (map.get(term) || 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

/** ---- USAJOBS (requires API key) ----
 * Docs: Search API requires headers Host, User-Agent, Authorization-Key. :contentReference[oaicite:4]{index=4}
 */
async function fetchUsajobsPulse({ windowDays = 30, maxResults = 500 }) {
  const USAJOBS_KEY = process.env.USAJOBS_API_KEY;      // GitHub secret
  const USAJOBS_UA = process.env.USAJOBS_USER_AGENT;   // email recommended by docs
  if (!USAJOBS_KEY || !USAJOBS_UA) {
    return {
      enabled: false,
      note: "Missing USAJOBS_API_KEY / USAJOBS_USER_AGENT secrets.",
      windowDays
    };
  }

  // Pull a broad snapshot of current postings, keyword-filtered to reduce volume.
  // Use Keyword = AI to get a relevant sample; you can broaden later.
  const url = new URL("https://data.usajobs.gov/api/search");
  url.searchParams.set("ResultsPerPage", "500");
  url.searchParams.set("Page", "1");
  url.searchParams.set("Keyword", "AI OR \"artificial intelligence\" OR \"machine learning\" OR LLM OR ChatGPT OR \"generative AI\"");

  const res = await fetch(url, {
    headers: {
      Host: "data.usajobs.gov",
      "User-Agent": USAJOBS_UA,
      "Authorization-Key": USAJOBS_KEY
    }
  });

  if (!res.ok) throw new Error(`USAJOBS Search API error ${res.status}`);

  const json = await res.json();
  const items = json?.SearchResult?.SearchResultItems ?? [];

  const postings = items.slice(0, maxResults).map((x) => x.MatchedObjectDescriptor || {});
  const titles = postings.map((p) => p.PositionTitle || "");
  const orgs = postings.map((p) => p.OrganizationName || p.DepartmentName || "");

  const aiFlagged = titles.filter(hasAiTerm).length;

  return {
    enabled: true,
    windowDays,
    sampledResults: postings.length,
    aiFlaggedResults: aiFlagged,
    aiShareInSamplePct: postings.length ? (aiFlagged / postings.length) * 100 : 0,
    topOrganizations: topCounts(orgs, (v) => v, 5),
    topAITermsInTitles: topTermCounts(titles, 6),
    note: "Computed from USAJOBS Search API (open federal postings)."
  };
}

/** ---- O*NET Hot Technologies (public export) ----
 * O*NET Hot Tech page provides CSV/XLSX export (“Save Table”). :contentReference[oaicite:5]{index=5}
 * We’ll pull the CSV export (no key) and take the top rows.
 */
async function fetchOnetHotTechnologies() {
  // The Hot Tech page is stable, but the export link can change.
  // If this URL ever changes, we can switch to O*n-Lines "Save Table" CSV link.
  const csvUrl = "https://www.onetonline.org/dl_files/hot_tech.csv";

  const res = await fetch(csvUrl);
  if (!res.ok) {
    return {
      enabled: false,
      note: `Could not fetch O*NET Hot Tech CSV (${res.status}).`,
      topHotTechnologies: []
    };
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);

  // Expect header: "Job Postings,Hot Technology" (or similar)
  const rows = lines.slice(1).map((line) => {
    // naive CSV split; good enough for two columns in this export
    const parts = line.split(",");
    const postings = Number(String(parts[0]).replace(/"/g, "").replace(/,/g, ""));
    const tech = parts.slice(1).join(",").replace(/"/g, "").trim();
    return { postings: Number.isFinite(postings) ? postings : 0, tech };
  });

  const top = rows
    .filter((r) => r.tech)
    .sort((a, b) => b.postings - a.postings)
    .slice(0, 12)
    .map((r) => ({ name: r.tech, postings: r.postings }));

  return {
    enabled: true,
    asOf: new Date().toISOString().slice(0, 10),
    topHotTechnologies: top,
    note: "From O*NET OnLine Hot Technologies export (job-posting-derived skills)."
  };
}

async function main() {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  const data = JSON.parse(raw);

  data.marketLenses = data.marketLenses || {};

  // USAJOBS
  data.marketLenses.usajobsPulse = await fetchUsajobsPulse({ windowDays: 30, maxResults: 500 });

  // O*NET Hot Tech
  data.marketLenses.onetHotTechnologies = await fetchOnetHotTechnologies();

  // Keep lastUpdated current
  data.lastUpdated = new Date().toISOString().slice(0, 10);

  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
  console.log("Updated Market Pulse in data.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
