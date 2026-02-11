/* ==========================================================
   NKU AI Skills Dashboard (Executive Edition)
   - Clear modules + “wow” polish
   - Resilient loading + user-friendly failures
   - Chart lifecycle management (no duplicates)
   - KPI strip support + accessible explorer
   ========================================================== */

let dashboardData;
const charts = { trend: null, family: null, donut: null };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------------------
   Data loading
---------------------------- */
async function loadDashboardData() {
  const res = await fetch("./data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load data.json (${res.status})`);
  return res.json();
}

/* ---------------------------
   Hero + dates
---------------------------- */
function renderHero(data) {
  const titleEl = $("#hero-title");
  const t1 = $("#hero-takeaway-1");
  const t2 = $("#hero-takeaway-2");

  if (titleEl) titleEl.textContent = "NKU — AI Skills & Job-Market Readiness";
  if (t1) t1.textContent = data.takeaway?.headline ?? "";
  if (t2) t2.textContent = data.takeaway?.subhead ?? "";

  const updated = data.lastUpdated ?? "";
  const updatedMain = $("#last-updated");
  const updatedTop = $("#last-updated-top");

  if (updatedMain) {
    updatedMain.textContent = updated;
    updatedMain.dateTime = updated;
  }
  if (updatedTop) {
    updatedTop.textContent = updated;
    updatedTop.dateTime = updated;
  }

  const trendWindow = $("#trend-window");
  if (trendWindow) trendWindow.textContent = "Auto-updating window";
}

/* ---------------------------
   KPI strip
   (safe to run even if KPI elements are not present)
---------------------------- */
function renderKPIs(data) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  const byFamily = data.charts?.aiMentionsByFamily;
  const trend = data.charts?.aiMentionsTrend;

  // KPI 1 — Top family (snapshot)
  let topFamily = "—";
  let topFamilyVal = null;

  if (byFamily?.labels?.length && byFamily?.values?.length) {
    const pairs = byFamily.labels.map((label, i) => ({
      label,
      value: Number(byFamily.values[i])
    }));
    const best = pairs.reduce((a, b) => (b.value > a.value ? b : a), pairs[0]);
    topFamily = best?.label ?? "—";
    topFamilyVal = Number.isFinite(best?.value) ? best.value : null;
  }

  // KPI 2 — Growth (simple first/last delta)
  let trendDelta = null;
  if (trend?.values?.length >= 2) {
    const first = Number(trend.values[0]);
    const last = Number(trend.values[trend.values.length - 1]);
    if (Number.isFinite(first) && Number.isFinite(last)) trendDelta = last - first;
  }

  setText("kpiTopFamily", topFamily);
  setText(
    "kpiTopFamilySub",
    topFamilyVal != null
      ? `Highest AI signal: ${topFamilyVal.toFixed(1)}% (snapshot)`
      : "Highest AI signal (snapshot)"
  );

  setText("kpiFastestGrowing", "AI Mentions");
  setText(
    "kpiFastestGrowingSub",
    trendDelta != null
      ? `Net change across period: +${trendDelta.toFixed(1)} pts`
      : "Directionally rising across the period shown"
  );

  // These are intentionally leadership-forward defaults (you can compute later)
  setText("kpiCoverageGap", "Responsible AI");
  setText("kpiCoverageGapSub", "High employer relevance + cross-college readiness");

  setText("kpiNextMove", "Scale baseline AI literacy + role-based depth");
  setText("kpiNextMoveSub", "INF 125 + pathway modules (power-user / builder / governance)");
}

/* ---------------------------
   Core skills cards
---------------------------- */
function renderCoreSkills(data) {
  const grid = $("#core-skills-grid");
  if (!grid) return;

  grid.innerHTML = "";

  (data.coreSkills ?? []).forEach((skill) => {
    const card = document.createElement("article");
    card.className = "skill-card";
    card.setAttribute("role", "listitem");

    const h3 = document.createElement("h3");
    h3.textContent = skill.title ?? "";

    const p = document.createElement("p");
    p.textContent = skill.desc ?? "";

    card.append(h3, p);
    grid.append(card);
  });
}

/* ---------------------------
   Chart setup
---------------------------- */
function applyChartDefaults() {
  Chart.defaults.font.family =
    "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  Chart.defaults.font.size = 12;

  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
  Chart.defaults.plugins.tooltip.callbacks = {
    label: (ctx) => {
      const v = ctx.parsed?.y ?? ctx.parsed;
      if (typeof v === "number") return `${ctx.dataset.label}: ${v.toFixed(2)}%`;
      return `${ctx.dataset.label}: ${v}`;
    }
  };
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

/* ---------------------------
   Charts
---------------------------- */
function renderTrendChart(data) {
  const trend = data.charts?.aiMentionsTrend;
  const canvas = $("#aiMentionsTrendChart");
  if (!trend || !canvas) return;

  destroyChart("trend");

  const labels = trend.labels ?? [];
  const values = (trend.values ?? []).map((v) => Number(v));

  charts.trend = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Share of postings mentioning AI",
          data: values,
          fill: true,
          tension: 0.28,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0 } },
        y: {
          beginAtZero: true,
          grid: { drawBorder: false },
          title: { display: true, text: "Percent of postings (%)" }
        }
      }
    }
  });
}

function renderFamilyChart(data) {
  const byFamily = data.charts?.aiMentionsByFamily;
  const canvas = $("#aiMentionsByFamilyChart");
  if (!byFamily || !canvas) return;

  destroyChart("family");

  const labels = byFamily.labels ?? [];
  const values = (byFamily.values ?? []).map((v) => Number(v));

  charts.family = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Percent of postings",
          data: values,
          borderWidth: 1,
          borderRadius: 10,
          barThickness: 32,
          maxBarThickness: 38
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, title: { display: true, text: "Job family" } },
        y: {
          beginAtZero: true,
          grid: { drawBorder: false },
          title: { display: true, text: "Percent of postings (%)" }
        }
      }
    }
  });
}

function renderOutsideITChart(data) {
  const share = data.charts?.aiOutsideITShare;
  const canvas = $("#aiOutsideITShareChart");
  if (!share || !canvas) return;

  destroyChart("donut");

  const labels = share.labels ?? [];
  const values = (share.values ?? []).map((v) => Number(v));

  charts.donut = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed}%`
          }
        }
      }
    }
  });
}

/* ---------------------------
   Job Family Explorer
---------------------------- */
function renderJobFamilyExplorer(data) {
  const group = $("#job-family-buttons");
  const title = $("#selected-family-title");
  const list = $("#selected-family-skills");
  if (!group || !title || !list) return;

  group.innerHTML = "";
  title.textContent = "";
  list.innerHTML = "";

  const families = Object.keys(data.jobFamilies ?? {});
  if (!families.length) return;

  const setSelectedButton = (familyName) => {
    $$("button", group).forEach((btn) => {
      const selected = btn.dataset.family === familyName;
      btn.setAttribute("aria-selected", String(selected));
      btn.tabIndex = selected ? 0 : -1;
    });
  };

  const renderSkills = (skills) => {
    list.innerHTML = "";
    (skills ?? []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      list.append(li);
    });
  };

  const show = (familyName) => {
    title.textContent = familyName;
    renderSkills(data.jobFamilies?.[familyName] ?? []);
    setSelectedButton(familyName);
  };

  const onKeyNav = (e) => {
    const buttons = $$("button", group);
    const current = buttons.findIndex((b) => b.getAttribute("aria-selected") === "true");
    if (current < 0) return;

    let next = current;
    if (e.key === "ArrowRight") next = Math.min(buttons.length - 1, current + 1);
    if (e.key === "ArrowLeft") next = Math.max(0, current - 1);

    if (next !== current) {
      e.preventDefault();
      buttons[next].focus();
      show(buttons[next].dataset.family);
    }
  };

  families.forEach((familyName, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "family-btn";
    btn.dataset.family = familyName;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", "selected-family-skills");
    btn.setAttribute("aria-selected", idx === 0 ? "true" : "false");
    btn.tabIndex = idx === 0 ? 0 : -1;
    btn.textContent = familyName;

    btn.addEventListener("click", () => show(familyName));
    btn.addEventListener("keydown", onKeyNav);
    group.append(btn);
  });

  show(families[0]);
}

/* ---------------------------
   Sources
---------------------------- */
function renderSources(data) {
  const list = $("#sources-list");
  if (!list) return;

  list.innerHTML = "";

  (data.sources ?? []).forEach((src) => {
    const li = document.createElement("li");
    const a = document.createElement("a");

    a.href = src.url ?? "#";
    a.textContent = src.name ?? src.url ?? "Source";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    li.append(a);
    list.append(li);
  });
}
/* ---------------------------
   Market Pulse (Public-data edition)
   - Government signal: USAJOBS (open federal postings)
   - Skills language: O*NET Hot Technologies export

   Expects data.json:
   marketLenses.usajobsPulse: {
     enabled, windowDays, sampledResults, aiFlaggedResults, aiShareInSamplePct,
     topOrganizations: [{name,count}], topAITermsInTitles: [{term,count}], note
   }

   marketLenses.onetHotTechnologies: {
     enabled, asOf, topHotTechnologies: [{name, postings}], note
   }

   Uses existing HTML IDs (no HTML changes needed):
   - pulseAdzunaShare, pulseAdzunaMeta
   - pulseAdzunaCategories, pulseAdzunaTerms
   - pulseOnetBlock
---------------------------- */
function renderMarketPulse(data) {
  // ---------- USAJOBS ----------
  const gov = data.marketLenses?.usajobsPulse;

  const shareEl = document.getElementById("pulseAdzunaShare");
  const metaEl = document.getElementById("pulseAdzunaMeta");
  const orgsEl = document.getElementById("pulseAdzunaCategories");
  const termsEl = document.getElementById("pulseAdzunaTerms");

  if (shareEl && metaEl && orgsEl && termsEl) {
    orgsEl.innerHTML = "";
    termsEl.innerHTML = "";

    if (!gov) {
      shareEl.textContent = "—";
      metaEl.textContent = "Not available (marketLenses.usajobsPulse missing from data.json).";
      orgsEl.innerHTML = "<li>—</li>";
      termsEl.innerHTML = "<li>—</li>";
    } else if (!gov.enabled) {
      shareEl.textContent = "Not connected";
      metaEl.textContent = gov.note ?? "USAJOBS pulse is disabled or not configured.";
      orgsEl.innerHTML = "<li>—</li>";
      termsEl.innerHTML = "<li>—</li>";
    } else if (!gov.sampledResults || gov.sampledResults === 0) {
      shareEl.textContent = "—";
      metaEl.textContent =
        "Ready to auto-update. No USAJOBS results loaded yet — run your updater to populate marketLenses.usajobsPulse.";
      orgsEl.innerHTML = "<li>—</li>";
      termsEl.innerHTML = "<li>—</li>";
    } else {
      const pct = Number(gov.aiShareInSamplePct ?? 0);
      shareEl.textContent = `${pct.toFixed(2)}%`;

      metaEl.textContent = `USAJOBS (last ${gov.windowDays ?? "—"} days) • Sampled ${
        gov.sampledResults
      } postings • AI-flagged ${gov.aiFlaggedResults ?? "—"}`;

      (gov.topOrganizations ?? []).forEach((o) => {
        const li = document.createElement("li");
        li.textContent = `${o.name} (${o.count})`;
        orgsEl.appendChild(li);
      });
      if (!orgsEl.childElementCount) orgsEl.innerHTML = "<li>—</li>";

      (gov.topAITermsInTitles ?? []).forEach((t) => {
        const li = document.createElement("li");
        li.textContent = `${t.term} (${t.count})`;
        termsEl.appendChild(li);
      });
      if (!termsEl.childElementCount) termsEl.innerHTML = "<li>—</li>";
    }
  }

  // ---------- O*NET Hot Technologies ----------
  const onet = data.marketLenses?.onetHotTechnologies;
  const onetBlock = document.getElementById("pulseOnetBlock");

  if (onetBlock) {
    if (!onet) {
      onetBlock.innerHTML =
        `<p class="meta" style="margin:0;">Not available (marketLenses.onetHotTechnologies missing from data.json).</p>`;
      return;
    }

    if (!onet.enabled) {
      onetBlock.innerHTML =
        `<p class="meta" style="margin:0;">${onet.note ?? "O*NET lens is disabled or not configured."}</p>`;
      return;
    }

    const top = onet.topHotTechnologies ?? [];
    if (!top.length) {
      onetBlock.innerHTML =
        `<p class="meta" style="margin:0;">Ready to auto-update. No O*NET Hot Technologies loaded yet — run your updater to populate marketLenses.onetHotTechnologies.</p>`;
      return;
    }

    const asOf = onet.asOf ? `As of ${onet.asOf}` : "";

    const items = top
      .slice(0, 10)
      .map((x) => {
        const name = x.name ?? x.tech ?? "Technology";
        const postings = Number(x.postings ?? x.count ?? 0);
        const suffix = Number.isFinite(postings) && postings > 0
          ? ` <span class="meta">• ${postings.toLocaleString()} postings</span>`
          : "";
        return `<li style="margin:0.2rem 0;"><strong>${name}</strong>${suffix}</li>`;
      })
      .join("");

    onetBlock.innerHTML = `
      <div style="display:flex; align-items:baseline; justify-content:space-between; gap:1rem;">
        <strong>Hot Technologies (O*NET)</strong>
        <span class="meta" style="margin:0;">${asOf}</span>
      </div>
      <ul style="margin:0.5rem 0 0; padding-left:1.1rem;">
        ${items || "<li>—</li>"}
      </ul>
      ${onet.note ? `<p class="meta" style="margin:0.55rem 0 0;">${onet.note}</p>` : ""}
    `;
  }
}

/* ---------------------------
   Friendly fatal error panel
---------------------------- */
function renderFatalError(error) {
  console.error(error);

  const host = document.querySelector(".hero .container") || document.body;

  const panel = document.createElement("div");
  panel.className = "explorer-panel";
  panel.style.borderLeft = "6px solid #b91c1c";

  panel.innerHTML = `
    <h3 style="margin-top:0;">Dashboard data could not be loaded</h3>
    <p style="margin:0.4rem 0 0; color:#7f1d1d;">
      We couldn’t load <code>data.json</code>. ${error.message}
    </p>
    <p class="meta" style="margin:0.55rem 0 0;">
      Tip: If this is GitHub Pages, confirm <code>data.json</code> is in the same folder as <code>index.html</code>
      and the path is <code>./data.json</code>.
    </p>
  `;

  host.append(panel);
}

/* ---------------------------
   Orchestration
---------------------------- */
function renderDashboard(data) {
  applyChartDefaults();
  renderHero(data);
  renderKPIs(data);
  renderCoreSkills(data);

  renderTrendChart(data);
  renderFamilyChart(data);
  renderOutsideITChart(data);

  renderJobFamilyExplorer(data);
  renderMarketPulse(data);
  renderSources(data);
}

/* ---------------------------
   Boot
---------------------------- */
loadDashboardData()
  .then((data) => {
    dashboardData = data;
    renderDashboard(dashboardData);
  })
  .catch(renderFatalError);
