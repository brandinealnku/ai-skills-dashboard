# AI Skills Panel Dashboard

A static, GitHub Pages-ready executive dashboard that answers:

1. What AI skills are most important to teach for job-market readiness?
2. How should priorities change by discipline and job type?

## Files

- `index.html` – page structure, nav, sections, and Evidence/Insight layout
- `styles.css` – responsive styling, interactions, accessibility, and print mode
- `app.js` – data loading, validation, chart drill-downs, state sync, and rendering
- `data.json` – all content, chart data, discipline profiles, and source metadata

## Run locally

Because the page fetches `data.json`, serve the folder with a local web server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Update the data model

The dashboard is fully driven by `data.json` and now uses these key structures:

- `sources` is an **object keyed by sourceId** (not an array).
- Each chart under `charts` includes:
  - `sourceId`
  - `asOfDate`
  - `method`
  - `drilldown` keyed by each label in the chart.
- `disciplines` is an object keyed by discipline name, each containing:
  - `topSkillsEmphasis`
  - `learningOutcomes`
  - `sampleAssignments`
  - `watchOuts`
  - `sources` (array of sourceIds)

When editing chart labels, make sure matching keys exist under each chart's `drilldown` block.

## How drilldown works

- Users click a chart element:
  - line chart point
  - bar chart bar
  - donut chart slice
- The Insight Drawer updates with:
  - headline
  - interpretation
  - why it matters
  - implications
  - recommended teaching focus
  - source + as-of date
- Users can clear drill-down with **Clear selection**.
- The selected discipline and chart selection are written to URL hash params so links are shareable.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to your main branch and root (`/`).
3. Save; GitHub Pages publishes these static files directly.

No build step is required.
