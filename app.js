let dashboardData;
const charts = {};
const state = {
  selectedInsight: null,
  selectedDiscipline: null,
  sourceFilter: "selection"
};

const iconMarkup = {
  judgment: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  iteration: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7h-8a4 4 0 0 0-4 4v8" stroke="currentColor" stroke-width="2"/><path d="M8 21 4 17l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3" stroke="currentColor" stroke-width="2"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" stroke="currentColor" stroke-width="2"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" stroke="currentColor" stroke-width="2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v6c0 5 3.4 8.8 7 10 3.6-1.2 7-5 7-10V6l-7-3Z" stroke="currentColor" stroke-width="2"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="9" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M3 20a6 6 0 0 1 12 0M14 20a4 4 0 0 1 7 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};

async function loadData() {
  const response = await fetch("./data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load data.json (${response.status})`);
  return response.json();
}

function showAlert(message) {
  const alertEl = document.getElementById("app-alert");
  alertEl.textContent = message;
  alertEl.hidden = false;
}

function clearAlert() {
  const alertEl = document.getElementById("app-alert");
  alertEl.hidden = true;
  alertEl.textContent = "";
}

function validateDataShape(data) {
  const errors = [];
  if (!data || typeof data !== "object") errors.push("Dashboard data is not a valid object.");
  if (!data.takeaway?.headline) errors.push("Missing takeaway.headline.");
  if (!Array.isArray(data.coreSkills)) errors.push("Missing coreSkills array.");
  if (!data.charts?.aiMentionsTrend?.sourceId) errors.push("Missing charts.aiMentionsTrend source metadata.");
  if (!data.charts?.aiMentionsByFamily?.sourceId) errors.push("Missing charts.aiMentionsByFamily source metadata.");
  if (!data.charts?.aiOutsideITShare?.sourceId) errors.push("Missing charts.aiOutsideITShare source metadata.");
  if (!data.sources || typeof data.sources !== "object" || Array.isArray(data.sources)) {
    errors.push("sources must be an object keyed by sourceId.");
  }
  if (!data.disciplines || typeof data.disciplines !== "object") errors.push("Missing disciplines object.");
  return errors;
}

function setHero(data) {
  document.getElementById("hero-title").textContent = "AI Skills for Job-Market Readiness";
  document.getElementById("hero-takeaway-1").textContent = data.takeaway?.headline ?? "";
  document.getElementById("hero-takeaway-2").textContent = data.takeaway?.subhead ?? "";

  const lastUpdatedEl = document.getElementById("last-updated");
  lastUpdatedEl.textContent = data.lastUpdated ?? "";
  lastUpdatedEl.dateTime = data.lastUpdated ?? "";
}

function renderCoreSkills(data) {
  const grid = document.getElementById("core-skills-grid");
  grid.innerHTML = "";

  (data.coreSkills ?? []).forEach((skill) => {
    const card = document.createElement("article");
    card.className = "skill-card";
    card.setAttribute("role", "listitem");

    const headingRow = document.createElement("div");
    headingRow.className = "skill-card__heading";

    const icon = document.createElement("div");
    icon.className = "skill-icon";
    icon.innerHTML = iconMarkup[skill.icon] ?? iconMarkup.judgment;

    const title = document.createElement("h3");
    title.textContent = skill.title ?? "";

    const description = document.createElement("p");
    description.textContent = skill.desc ?? "";

    headingRow.append(icon, title);
    card.append(headingRow, description);
    grid.append(card);
  });
}

function createSourceChips(targetId, sourceId, asOfDate, methodText) {
  const target = document.getElementById(targetId);
  target.innerHTML = "";
  const source = dashboardData.sources?.[sourceId];

  const sourceChip = document.createElement("span");
  sourceChip.className = "source-chip";
  sourceChip.textContent = `Source: ${source?.name ?? sourceId}`;

  const dateChip = document.createElement("span");
  dateChip.className = "source-chip";
  dateChip.textContent = `As of: ${asOfDate ?? "n/a"}`;

  const methodChip = document.createElement("span");
  methodChip.className = "source-chip";
  methodChip.textContent = "Method";
  methodChip.title = methodText ?? "No method provided.";

  target.append(sourceChip, dateChip, methodChip);
}

function getSelectionKey(chartKey, label) {
  return `${chartKey}::${label}`;
}

function updateHash() {
  const params = new URLSearchParams();
  if (state.selectedDiscipline) params.set("discipline", state.selectedDiscipline);
  if (state.selectedInsight) {
    params.set("chart", state.selectedInsight.chartKey);
    params.set("label", state.selectedInsight.label);
  }
  const hashString = params.toString();
  history.replaceState(null, "", `${location.pathname}${location.search}${hashString ? `#${hashString}` : ""}`);
}

function applyStateFromHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const disciplineParam = params.get("discipline");
  const chartParam = params.get("chart");
  const labelParam = params.get("label");

  if (disciplineParam) state.selectedDiscipline = disciplineParam;
  else state.selectedDiscipline = localStorage.getItem("selectedDiscipline") || null;

  if (chartParam && labelParam) {
    state.selectedInsight = { chartKey: chartParam, label: labelParam };
  }
}

function renderInsightDrawer() {
  const headlineEl = document.getElementById("insight-headline");
  const interpretationEl = document.getElementById("insight-interpretation");
  const whyEl = document.getElementById("insight-why");
  const implicationsEl = document.getElementById("insight-implications");
  const teachingEl = document.getElementById("insight-teaching");
  const sourceEl = document.getElementById("insight-source");

  implicationsEl.innerHTML = "";
  if (!state.selectedInsight) {
    headlineEl.textContent = "Select a chart point, bar, or slice to view a focused insight.";
    interpretationEl.textContent = "";
    whyEl.textContent = "";
    teachingEl.textContent = "";
    sourceEl.innerHTML = "";
    renderSources();
    return;
  }

  const chartObj = dashboardData.charts?.[state.selectedInsight.chartKey];
  const detail = chartObj?.drilldown?.[state.selectedInsight.label];
  const source = dashboardData.sources?.[chartObj?.sourceId];

  if (!detail) {
    headlineEl.textContent = "No drill-down details available for this selection.";
    interpretationEl.textContent = "";
    whyEl.textContent = "";
    teachingEl.textContent = "";
    sourceEl.innerHTML = "";
    renderSources();
    return;
  }

  headlineEl.textContent = detail.headline;
  interpretationEl.textContent = detail.interpretation;
  whyEl.textContent = detail.whyItMatters;
  (detail.implications ?? []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    implicationsEl.append(li);
  });
  teachingEl.textContent = detail.teachingFocus;

  sourceEl.innerHTML = `<strong>Source</strong><br><a href="${source?.url ?? "#"}" target="_blank" rel="noopener noreferrer">${source?.name ?? chartObj?.sourceId ?? "Unknown source"}</a><br><span>As of: ${chartObj?.asOfDate ?? "n/a"}</span>`;

  renderSources();
}

function handleSelection(chartKey, label) {
  const sameSelection = state.selectedInsight
    && getSelectionKey(state.selectedInsight.chartKey, state.selectedInsight.label) === getSelectionKey(chartKey, label);

  state.selectedInsight = sameSelection ? null : { chartKey, label };
  updateHash();
  updateAllChartStyles();
  renderInsightDrawer();
}

function pointColorFactory(chartKey, baseColor, selectedColor) {
  return (ctx) => {
    const label = ctx.chart.data.labels[ctx.dataIndex];
    const isSelected = state.selectedInsight?.chartKey === chartKey && state.selectedInsight?.label === label;
    return isSelected ? selectedColor : baseColor;
  };
}

function createLineChart(data) {
  const trend = data.charts?.aiMentionsTrend;
  if (!trend) return;

  document.getElementById("chart-1-heading").textContent = trend.title;
  createSourceChips("chart-1-meta", trend.sourceId, trend.asOfDate, trend.method);

  charts.aiMentionsTrend = new Chart(document.getElementById("aiMentionsTrendChart"), {
    type: "line",
    data: {
      labels: trend.labels ?? [],
      datasets: [{
        label: "Share of job postings mentioning AI (%)",
        data: trend.values ?? [],
        fill: true,
        tension: 0.24,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.15)",
        pointRadius: (ctx) => state.selectedInsight?.chartKey === "aiMentionsTrend" && state.selectedInsight?.label === ctx.chart.data.labels[ctx.dataIndex] ? 7 : 4,
        pointHoverRadius: 8,
        pointBackgroundColor: pointColorFactory("aiMentionsTrend", "#2563eb", "#1d4ed8")
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        handleSelection("aiMentionsTrend", trend.labels[idx]);
      },
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Percent of postings (%)" } }
      }
    }
  });
}

function createBarChart(data) {
  const byFamily = data.charts?.aiMentionsByFamily;
  if (!byFamily) return;

  document.getElementById("chart-2-heading").textContent = byFamily.title;
  createSourceChips("chart-2-meta", byFamily.sourceId, byFamily.asOfDate, byFamily.method);

  charts.aiMentionsByFamily = new Chart(document.getElementById("aiMentionsByFamilyChart"), {
    type: "bar",
    data: {
      labels: byFamily.labels ?? [],
      datasets: [{
        label: "Percent of postings (%)",
        data: byFamily.values ?? [],
        borderRadius: 8,
        backgroundColor: pointColorFactory("aiMentionsByFamily", "#60a5fa", "#1d4ed8")
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        handleSelection("aiMentionsByFamily", byFamily.labels[idx]);
      },
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Job family" } },
        y: { beginAtZero: true, title: { display: true, text: "Percent of postings (%)" } }
      }
    }
  });
}

function createDonutChart(data) {
  const share = data.charts?.aiOutsideITShare;
  if (!share) return;

  document.getElementById("chart-3-heading").textContent = share.title;
  createSourceChips("chart-3-meta", share.sourceId, share.asOfDate, share.method);

  charts.aiOutsideITShare = new Chart(document.getElementById("aiOutsideITShareChart"), {
    type: "doughnut",
    data: {
      labels: share.labels ?? [],
      datasets: [{
        data: share.values ?? [],
        borderWidth: 2,
        hoverOffset: 6,
        backgroundColor: pointColorFactory("aiOutsideITShare", "#93c5fd", "#1d4ed8")
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        handleSelection("aiOutsideITShare", share.labels[idx]);
      },
      plugins: { legend: { position: "bottom" } }
    }
  });
}

function updateAllChartStyles() {
  Object.values(charts).forEach((chart) => chart.update());
}

function renderJobFamilyExplorer(data) {
  const buttonGroup = document.getElementById("job-family-buttons");
  const title = document.getElementById("selected-family-title");
  const list = document.getElementById("selected-family-skills");

  buttonGroup.innerHTML = "";
  title.textContent = "";
  list.innerHTML = "";

  const families = Object.keys(data.jobFamilies ?? {});
  if (families.length === 0) return;

  function showFamily(familyName) {
    title.textContent = familyName;
    list.innerHTML = "";
    (data.jobFamilies[familyName] ?? []).forEach((skill) => {
      const item = document.createElement("li");
      item.textContent = skill;
      list.append(item);
    });
    [...buttonGroup.querySelectorAll("button")].forEach((btn) => {
      const isSelected = btn.dataset.family === familyName;
      btn.setAttribute("aria-selected", String(isSelected));
      btn.tabIndex = isSelected ? 0 : -1;
    });
  }

  families.forEach((familyName, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "family-btn";
    button.dataset.family = familyName;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "selected-family-skills");
    button.setAttribute("aria-selected", index === 0 ? "true" : "false");
    button.textContent = familyName;
    button.addEventListener("click", () => showFamily(familyName));
    buttonGroup.append(button);
  });

  showFamily(families[0]);
}

function renderList(targetId, items) {
  const list = document.getElementById(targetId);
  list.innerHTML = "";
  (items ?? []).forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    list.append(li);
  });
}

function renderDisciplineView(data) {
  const disciplines = Object.keys(data.disciplines ?? {});
  if (!disciplines.length) return;

  const buttonGroup = document.getElementById("discipline-buttons");
  buttonGroup.innerHTML = "";

  function showDiscipline(name) {
    const detail = data.disciplines[name];
    if (!detail) return;

    state.selectedDiscipline = name;
    localStorage.setItem("selectedDiscipline", name);
    updateHash();

    document.getElementById("discipline-title").textContent = name;
    renderList("discipline-skills", detail.topSkillsEmphasis);
    renderList("discipline-outcomes", detail.learningOutcomes);
    renderList("discipline-assignments", detail.sampleAssignments);
    renderList("discipline-watchouts", detail.watchOuts);

    const sourceList = document.getElementById("discipline-sources");
    sourceList.innerHTML = "";
    (detail.sources ?? []).forEach((sourceId) => {
      const source = data.sources[sourceId];
      const li = document.createElement("li");
      li.innerHTML = `<a href="${source?.url ?? "#"}" target="_blank" rel="noopener noreferrer">${source?.name ?? sourceId}</a>`;
      sourceList.append(li);
    });

    [...buttonGroup.querySelectorAll("button")].forEach((btn) => {
      const isSelected = btn.dataset.discipline === name;
      btn.setAttribute("aria-selected", String(isSelected));
      btn.tabIndex = isSelected ? 0 : -1;
    });

    renderSources();
  }

  disciplines.forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "discipline-btn";
    button.dataset.discipline = name;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "discipline-title");
    button.textContent = name;
    button.addEventListener("click", () => showDiscipline(name));
    buttonGroup.append(button);
  });

  showDiscipline(disciplines.includes(state.selectedDiscipline) ? state.selectedDiscipline : disciplines[0]);
}

function getSelectedSourceIds() {
  const set = new Set();
  if (state.selectedInsight) {
    const chart = dashboardData.charts[state.selectedInsight.chartKey];
    if (chart?.sourceId) set.add(chart.sourceId);
  }
  if (state.selectedDiscipline) {
    const discipline = dashboardData.disciplines[state.selectedDiscipline];
    (discipline?.sources ?? []).forEach((id) => set.add(id));
  }
  return [...set];
}

function renderSources() {
  const list = document.getElementById("sources-list");
  list.innerHTML = "";

  const allSources = Object.entries(dashboardData.sources ?? {});
  const sourceIds = state.sourceFilter === "all" ? allSources.map(([id]) => id) : getSelectedSourceIds();

  if (!sourceIds.length) {
    const empty = document.createElement("li");
    empty.textContent = "No sources tied to the current selection yet.";
    list.append(empty);
    return;
  }

  sourceIds.forEach((sourceId) => {
    const source = dashboardData.sources[sourceId];
    if (!source) return;
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url ?? "#";
    link.textContent = source.name ?? sourceId;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    item.append(link);
    list.append(item);
  });
}

function wireControls() {
  document.getElementById("clear-selection-button").addEventListener("click", () => {
    state.selectedInsight = null;
    updateHash();
    updateAllChartStyles();
    renderInsightDrawer();
  });

  document.getElementById("sources-filter-select").addEventListener("change", (event) => {
    state.sourceFilter = event.target.value;
    renderSources();
  });

  document.getElementById("copy-link-button").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showAlert("Link copied to clipboard.");
      setTimeout(clearAlert, 1600);
    } catch (_err) {
      showAlert("Could not copy link automatically. Please copy the URL from your browser address bar.");
    }
  });

  document.getElementById("download-snapshot-button").addEventListener("click", async () => {
    try {
      const target = document.getElementById("evidence-snapshot-area");
      const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#f8fafc" });
      const link = document.createElement("a");
      link.download = `evidence-snapshot-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (_error) {
      showAlert("Unable to generate snapshot in this browser.");
    }
  });
}

function init(data) {
  applyStateFromHash();
  setHero(data);
  renderCoreSkills(data);
  createLineChart(data);
  createBarChart(data);
  createDonutChart(data);
  renderInsightDrawer();
  renderDisciplineView(data);
  renderJobFamilyExplorer(data);
  wireControls();
  renderSources();

  if (state.selectedInsight) updateAllChartStyles();
}

loadData()
  .then((data) => {
    const issues = validateDataShape(data);
    if (issues.length) {
      showAlert(`Data validation problem: ${issues.join(" ")}`);
      throw new Error(issues.join(" "));
    }

    clearAlert();
    dashboardData = data;
    init(dashboardData);
  })
  .catch((error) => {
    console.error(error);
    showAlert(`Could not initialize dashboard: ${error.message}`);
  });
