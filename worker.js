/**
 * NKU Jobs Proxy (Cloudflare Worker)
 * - Proxies USAJOBS Search API (adds required headers)
 * - Proxies Adzuna API (keeps app_id/app_key secret)
 * - Adds CORS so a GitHub Pages site can call it
 *
 * ENV VARS to set in Cloudflare Worker:
 *   USAJOBS_EMAIL   = your email used for User-Agent header
 *   USAJOBS_API_KEY = your USAJOBS Authorization-Key
 *   ADZUNA_APP_ID   = Adzuna app_id
 *   ADZUNA_APP_KEY  = Adzuna app_key
 *
 * Optional:
 *   ALLOWED_ORIGINS = comma-separated allowlist (e.g. "https://yourname.github.io")
 *     If not set, uses "*" (open CORS).
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- CORS helpers ---
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return json(
          {
            ok: true,
            endpoints: ["/usajobs", "/adzuna"],
            time: new Date().toISOString()
          },
          200,
          cors
        );
      }

      if (url.pathname === "/usajobs") {
        return await handleUSAJOBS(request, env, cors);
      }

      if (url.pathname === "/adzuna") {
        return await handleAdzuna(request, env, cors);
      }

      return json({ ok: false, error: "Not found" }, 404, cors);
    } catch (err) {
      return json(
        { ok: false, error: err?.message || String(err) },
        500,
        cors
      );
    }
  }
};

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "*";
  const allow = (env.ALLOWED_ORIGINS || "*").trim();

  let allowedOrigin = "*";
  if (allow !== "*") {
    const set = new Set(
      allow
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    );
    allowedOrigin = set.has(origin) ? origin : Array.from(set)[0] || "null";
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

async function handleUSAJOBS(request, env, cors) {
  if (!env.USAJOBS_EMAIL || !env.USAJOBS_API_KEY) {
    return json(
      {
        ok: false,
        error:
          "Missing USAJOBS_EMAIL or USAJOBS_API_KEY environment variables."
      },
      400,
      cors
    );
  }

  const u = new URL(request.url);
  // Pass-through query params from client: Keyword, ResultsPerPage, Page, LocationName, etc.
  const target = new URL("https://data.usajobs.gov/api/search");
  for (const [k, v] of u.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  const res = await fetch(target.toString(), {
    method: "GET",
    headers: {
      // USAJOBS requires these:
      "User-Agent": env.USAJOBS_EMAIL,
      "Authorization-Key": env.USAJOBS_API_KEY,
      "Host": "data.usajobs.gov",
      "Accept": "application/json"
    }
  });

  const text = await res.text();
  // Proxy raw JSON (or error text) to client
  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cors
    }
  });
}

async function handleAdzuna(request, env, cors) {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
    return json(
      { ok: false, error: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY env vars." },
      400,
      cors
    );
  }

  const u = new URL(request.url);
  const what = u.searchParams.get("what") || "";
  const page = u.searchParams.get("page") || "1";
  const resultsPerPage = u.searchParams.get("results_per_page") || "50";
  const country = u.searchParams.get("country") || "us";

  // Build Adzuna URL
  const target = new URL(
    `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${encodeURIComponent(page)}`
  );
  target.searchParams.set("app_id", env.ADZUNA_APP_ID);
  target.searchParams.set("app_key", env.ADZUNA_APP_KEY);
  target.searchParams.set("what", what);
  target.searchParams.set("results_per_page", resultsPerPage);

  // Optional extra filters can be passed through too:
  // e.g. where=, salary_min=, full_time=, etc.
  for (const [k, v] of u.searchParams.entries()) {
    if (["what", "page", "results_per_page", "country"].includes(k)) continue;
    target.searchParams.set(k, v);
  }

  const res = await fetch(target.toString(), {
    method: "GET",
    headers: { "Accept": "application/json" }
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cors
    }
  });
}
