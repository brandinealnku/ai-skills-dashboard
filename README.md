# AI Skills Panel Dashboard

A static, GitHub Pages-ready dashboard that answers:

1. What AI skills are most important to teach for job-market readiness?
2. Do skills differ by discipline/job type?

## Files

- `index.html` – page structure and sections
- `styles.css` – responsive styling + print mode
- `app.js` – data loading, rendering, and Chart.js visualizations
- `data.json` – all content and chart data used by the page

## Run locally

Because the page fetches `data.json`, serve the folder with a local web server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to your main branch and root (`/`).
3. Save; GitHub Pages will publish the static files directly.

No build step is required.
