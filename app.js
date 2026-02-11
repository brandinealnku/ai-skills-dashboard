/* ==========================================================
   NKU Executive Dashboard (Deans / Chairs) — “Wow” Script
   - Cleaner structure, premium interactions, KPI strip support
   - Better chart styling + accessibility
   - Resilient loading + graceful fallback UI
   ========================================================== */

let dashboardData;
let charts = { trend: null, family: null, donut: null };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function loadData() {
  const response = await fetch("./data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load data.json (${response.status})`);
  return response.json();
}

/* ---------------------------
   Executive header + takeaway
---------------------------- */
function setHero(data) {
  $("#hero-title").textContent = "NKU — AI Skills & Job-Market Readiness";

  $("#hero-takeaway-1").textContent = data.takeaway?.headline ?? "";
  $("#hero-takeaway-2").textContent = data.takeaway?.subhead ?? "";

  const updated = data.lastUpdated ?? "";
  const updatedEl = $("#last-updated");
  if (updatedEl) {
    updatedEl.textContent = updated;
    updatedEl.dateTime = updated;
  }

  // Optional: if you added the sticky topbar time element in the HTML rewrite
  const updatedTop = $("#last-updated-top");
  if (updatedTop) {
    updatedTop.textContent = updated;
    updatedTop.dateTime = updated;
  }

  // Optional badge in chart header (if present)
  const trendWindow = $("#trend-window");
  if (trendWindow) trendWindow.textContent = "Dec 2025 snapshot";
}

/* ---------------------------
   KPI strip (optional)
   Expects these IDs in your HTML:
   kpiTopFamily, kpiTopFamilySub
   kpiFastestGrowing, kpiFastestGrowingSub
   kpiCoverageGap, kpiCoverageGapSub
   kpiNextMove, kpiNextMoveSub
---------------------------- */
function setExecutiveKPIs(data) {
  // Safe lookups for when KPIs aren’t in the DOM yet
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // Pull from known chart structures as “best available”
  const byFamily = data.charts?.aiMentionsByFamily;
  const trend = data.charts?.aiMentionsTrend;

  // Top family = max in aiMentionsByFamily (if present)
  let topFamily = "—";
  let topFamilyVal = null;
  if (byFamily?.labels?.length && byFamily?.values?.length) {
    const pairs = byFamily.labels.map((label, i) => ({ label, value: Number(byFamily.values[i]) }));
    const best = pairs.reduce((a, b) => (b.value > a.value ? b : a), pairs[0]);
    topFamily = best?.label ?? "—";
    topFamilyVal = Number.isFinite(best?.value) ? best.value : null;
  }

  // Fastest growing = simple “last - first” on trend (placeholder logic)
  let fastest = "—";
  let fastestDelta = null;
  if (trend?.labels?.length && trend?.values?.length && trend.values.length >= 2) {
    const first = Number(trend.values[0]);
    const last = Number(trend.values[trend.values.length - 1]);
    if (Number.isFinite(first) && Number.isFinite(last)) {
      fastest = "AI Mentions";
      fastestDelta = last - first;
    }
  }

  // Coverage gap + next move: set as narrative defaults (you can later compute)
  setText("kpiTopFamily", topFamily);
  setText(
    "kpiTopFamilySub",
    topFamilyVal != null ? `Highest share: ${topFamilyVal.toFixed(1)}% of postings (snapshot)` : "Highest share of postings (snapshot)"
  );

  setText("kpiFastestGrowing", fastest);
  setText(
    "kpiFastestGrowingSub",
    fastestDelta != null ? `Change: +${fastestDelta.toFixed(1)} pts across the period shown` : "Largest increase in mentions over time"
  );

  setText("kpiCoverageGap", "Responsible AI");
  setText("kpiCoverageGapSub", "High employer signal + requires cross-college coverage");

  setText("kpiNextMove", "Baseline AI literacy in core + applied pathways");
  setText("kpiNextMoveSub", "1–2 week modules + role-based depth (power-user / builder / governance)");
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

    const title = document.createElement("h3");
    title.textContent = skill.title ?? "";

    const description = document.createElement("p");
    description.textContent = skill.desc ?? "";

    card.append(title, description);
    grid.append(card);
  });
}

/* ---------------------------
   Chart defaults (executive polish)
---------------------------- */
function chartDefaults() {
  // Subtle, executive look. Avoids “default demo chart” vibes.
  Chart.defaults.font.family =
    "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  Chart.defaults.font.size = 12;

  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
  Chart.defaults.plugins.tooltip.callbacks = {
    label: (ctx) => {
      const v = ctx.parsed?.y ?? ctx.parsed;
      if (typeof v === "number") return `${ctx.dataset.label}: ${v.toFixed(1)}%`;
      return `${ctx.dataset.label}: ${v}`;
    }
  };
}

/* ---------------------------
   Chart helpers
---------------------------- */
function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function createLineChart(data) {
  const trend = data.charts?.aiMentionsTrend;
  if (!trend) return;

  const canvas = $("#aiMentionsTrendChart");
  if (!canvas) return;

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
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0 }
        },
        y: {
          beginAtZero: true,
          grid: { drawBorder: false },
          title: { display: true, text: "Percent of postings (%)" }
        }
      }
    }
  });
}

function createBarChart(data) {
  const byFamily = data.charts?.aiMentionsByFamily;
  if (!byFamily) return;

  const canvas = $("#aiMentionsByFamilyChart");
  if (!canvas) return;

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
        x: {
          grid: { display: false },
          title: { display: true, text: "Job family" }
        },
        y: {
          beginAtZero: true,
          grid: { drawBorder: false },
          title: { display: true, text: "Percent of postings (%)" }
        }
      }
    }
  });
}

function createDonutChart(data) {
  const share = data.charts?.aiOutsideITShare;
  if (!share) return;

  const canvas = $("#aiOutsideITShareChart");
  if (!canvas) return;

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
            label: (ctx) => {
              const v = ctx.parsed;
              return `${ctx.label}: ${v}%`;
            }
          }
        }
      }
    }
  });
}

/* ---------------------------
   Job family explorer (exec feel)
   - Stronger focus management
   - Keyboard nav (left/right)
---------------------------- */
function renderJobFamilyExplorer(data) {
  const buttonGroup = $("#job-family-buttons");
  const title = $("#selected-family-title");
  const list = $("#selected-family-skills");
  if (!buttonGroup || !title || !list) return;

  buttonGroup.innerHTML = "";
  title.textContent = "";
  list.innerHTML = "";

  const families = Object.keys(data.jobFamilies ?? {});
  if (families.length === 0) return;

  function setSelectedButton(familyName) {
    $$("button", buttonGroup).forEach((btn) => {
      const isSelected = btn.dataset.family === familyName;
      btn.setAttribute("aria-selected", String(isSelected));
      btn.tabIndex = isSelected ? 0 : -1;
    });
  }

  function renderSkillList(skillsArray) {
    list.innerHTML = "";
    skillsArray.forEach((skill) => {
      const item = document.createElement("li");
      item.textContent = skill;
      list.append(item);
    });
  }

  function showFamily(familyName) {
    title.textContent = familyName;

    const skillsArray = data.jobFamilies?.[familyName] ?? [];
    renderSkillList(skillsArray);
    setSelectedButton(familyName);
  }

  function onKeyNav(e) {
    const buttons = $$("button", buttonGroup);
    const currentIndex = buttons.findIndex((b) => b.getAttribute("aria-selected") === "true");
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (e.key === "ArrowRight") nextIndex = Math.min(buttons.length - 1, currentIndex + 1);
    if (e.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
    if (nextIndex !== currentIndex) {
      e.preventDefault();
      buttons[nextIndex].focus();
      showFamily(buttons[nextIndex].dataset.family);
    }
  }

  families.forEach((familyName, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "family-btn";
    button.dataset.family = familyName;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "selected-family-skills");
    button.setAttribute("aria-selected", index === 0 ? "true" : "false");
    button.tabIndex = index === 0 ? 0 : -1;
    button.textContent = familyName;

    button.addEventListener("click", () => showFamily(familyName));
    button.addEventListener("keydown", onKeyNav);

    buttonGroup.append(button);
  });

  showFamily(families[0]);
}

/* ---------------------------
   Sources (executive format)
---------------------------- */
function renderSources(data) {
  const list = $("#sources-list");
  if (!list) return;

  list.innerHTML = "";

  (data.sources ?? []).forEach((source) => {
    const li = document.createElement("li");

    const a = document.createElement("a");
    a.href = source.url ?? "#";
    a.textContent = source.name ?? source.url ?? "Source";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    li.append(a);
    list.append(li);
  });
}

/* ---------------------------
   Error experience (feels “product”)
---------------------------- */
function showFatalError(error) {
  console.error(error);

  const heroContainer = document.querySelector(".hero .container") || document.body;

  const panel = document.createElement("div");
  panel.className = "explorer-panel";
  panel.style.borderLeft = "6px solid #b91c1c";

  const title = document.createElement("h3");
  title.textContent = "Dashboard data could not be loaded";

  const msg = document.createElement("p");
  msg.style.marginTop = "0.4rem";
  msg.style.color = "#7f1d1d";
  msg.textContent = `We couldn’t load data.json. ${error.message}`;

  const tip = document.createElement("p");
  tip.className = "meta";
  tip.style.marginTop = "0.5rem";
  tip.textContent = "Tip: If this is GitHub Pages, confirm data.json is in the same folder as index.html and the path is ./data.json.";

  panel.append(title, msg, tip);
  heroContainer.append(panel);
}

/* ---------------------------
   Init
---------------------------- */
function init(data) {
  chartDefaults();
  setHero(data);
  setExecutiveKPIs(data);
  renderCoreSkills(data);
  createLineChart(data);
  createBarChart(data);
  createDonutChart(data);
  renderJobFamilyExplorer(data);
  renderSources(data);
}

/* ---------------------------
   Boot
---------------------------- */
loadData()
  .then((data) => {
    dashboardData = data;
    init(dashboardData);
  })
  .catch(showFatalError);
