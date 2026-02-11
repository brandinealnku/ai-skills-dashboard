let dashboardData;

async function loadData() {
  const response = await fetch('data.json');
  if (!response.ok) {
    throw new Error(`Failed to load data.json (${response.status})`);
  }
  return response.json();
}

function setHero(data) {
  document.getElementById('hero-title').textContent = data.hero.title;
  document.getElementById('hero-takeaway-1').textContent = data.hero.takeaway[0];
  document.getElementById('hero-takeaway-2').textContent = data.hero.takeaway[1];

  const lastUpdatedEl = document.getElementById('last-updated');
  lastUpdatedEl.textContent = data.lastUpdated;
  lastUpdatedEl.dateTime = data.lastUpdated;
}

function renderCoreSkills(data) {
  const grid = document.getElementById('core-skills-grid');
  grid.innerHTML = '';

  data.coreSkills.forEach((skill) => {
    const card = document.createElement('article');
    card.className = 'skill-card';
    card.setAttribute('role', 'listitem');

    const title = document.createElement('h3');
    title.textContent = skill.title;

    const description = document.createElement('p');
    description.textContent = skill.description;

    card.append(title, description);
    grid.append(card);
  });
}

function createLineChart(data) {
  const { labels, values, yAxisLabel } = data.charts.aiMentionsTrend;
  new Chart(document.getElementById('aiMentionsTrendChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: yAxisLabel,
        data: values,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.18)',
        fill: true,
        tension: 0.24,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yAxisLabel
          }
        }
      }
    }
  });
}

function createBarChart(data) {
  const { labels, values, xAxisLabel, yAxisLabel } = data.charts.aiMentionsByFamily;
  new Chart(document.getElementById('aiMentionsByFamilyChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: yAxisLabel,
        data: values,
        backgroundColor: ['#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#172554', '#60a5fa']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: xAxisLabel
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yAxisLabel
          }
        }
      }
    }
  });
}

function createDonutChart(data) {
  const { labels, values } = data.charts.aiOutsideITShare;
  new Chart(document.getElementById('aiOutsideITShareChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#2563eb', '#93c5fd']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

function renderJobFamilyExplorer(data) {
  const buttonGroup = document.getElementById('job-family-buttons');
  const title = document.getElementById('selected-family-title');
  const list = document.getElementById('selected-family-skills');

  const families = Object.keys(data.jobFamilies);

  function showFamily(familyName) {
    const family = data.jobFamilies[familyName];
    title.textContent = family.label;
    list.innerHTML = '';
    family.skills.forEach((skill) => {
      const item = document.createElement('li');
      item.textContent = skill;
      list.append(item);
    });

    [...buttonGroup.querySelectorAll('button')].forEach((btn) => {
      const isSelected = btn.dataset.family === familyName;
      btn.setAttribute('aria-selected', String(isSelected));
      btn.tabIndex = isSelected ? 0 : -1;
    });
  }

  families.forEach((familyName, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'family-btn';
    button.id = `tab-${familyName}`;
    button.dataset.family = familyName;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'selected-family-skills');
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.textContent = data.jobFamilies[familyName].label;

    button.addEventListener('click', () => showFamily(familyName));

    buttonGroup.append(button);
  });

  showFamily(families[0]);
}

function renderSources(data) {
  const list = document.getElementById('sources-list');
  list.innerHTML = '';

  data.sources.forEach((source) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = source.title;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    item.append(link);
    list.append(item);
  });
}

function init(data) {
  setHero(data);
  renderCoreSkills(data);
  createLineChart(data);
  createBarChart(data);
  createDonutChart(data);
  renderJobFamilyExplorer(data);
  renderSources(data);
}

loadData()
  .then((data) => {
    dashboardData = data;
    init(dashboardData);
  })
  .catch((error) => {
    const container = document.querySelector('.hero .container');
    const problem = document.createElement('p');
    problem.textContent = `Could not load dashboard data: ${error.message}`;
    problem.style.color = '#b91c1c';
    container.append(problem);
  });
