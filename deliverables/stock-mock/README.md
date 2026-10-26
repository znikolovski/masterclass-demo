# WKND stock mock

A standalone, dependency-free finance-style dashboard. All prices and events are fictional. No site blocks, APIs, credentials, or live market data are used.

Branding follows the website's `styles/brand.css` and header: **Syncopate** headings, **Instrument Sans** body text, dark forest ink (`#0f1a14`), adventure orange (`#e8651a`), warm stone (`#f4f2ef`), rounded panels, pill controls, and the site's adventure symbol. Fonts and logo are bundled inside `assets/`, so the mock has no external asset requests or dependency on the rest of the site. Font redistribution licenses are included alongside the fonts.

## Open

From the repository root:

```sh
python3 -m http.server 3000 --bind 127.0.0.1
```

Open <http://localhost:3000/deliverables/stock-mock/>. Use HTTP rather than opening `index.html` directly, so the example JSON can load.

**Ticker-only presentation:** <http://localhost:3000/deliverables/stock-mock/?view=ticker>. Shows only the company identity, quote, price change, date range, and chart, with no narrative, event annotations, controls, or surrounding dashboard.

To present a custom simulation, configure it in the full dashboard and click **Ticker only** in the header. This preserves loaded datasets, active events, and the selected date/range without reloading. Use the browser's Back button to return to the controls. Opening the ticker URL directly starts with the default −15% scenario.

## Simulate

The default three-month baseline runs from **July 24 to October 22, 2026**, opening at **$100** and closing at **$85 (−15%)**. Daily fluctuations are deterministic, not live or random.

The default narrative is **product momentum is not stock momentum**: WKND has launched incredible new adventures in **Ladakh, India** and **Ohrid, North Macedonia**, both highly requested destinations, but its stock keeps trending down. The destination-launch dataset is enabled on first load, showing both launches on the chart and timeline. The dates are illustrative and the zero-percent event effects deliberately model **no sustained stock lift**, not a claim about actual market reactions. No demand counts, launch performance figures, or explanations for the decline are invented.

- Toggle the four example datasets independently. Multiple datasets can be active together. Booking outages and extreme weather are optional hypothetical disruptions; campaign recovery is an optional positive counterfactual, not part of the default story.
- Rewind with the date input or slider. Future events remain listed as upcoming, without affecting prices yet.
- Select 1W, 1M, or 3M to change the trailing chart window. The return compares the first and last prices in that window; the separate event-impact figure compares against the no-event baseline on the selected date.
- Load one or more JSON files with **Load datasets**. Imported datasets start off. Matching IDs replace existing datasets and switch them off.
- **Reset all** switches every dataset off and restores the default date, range, baseline visibility, and −15% result, retaining loaded datasets. Reloading the page restores only the bundled examples, with the destination launches switched on. Uploaded files and toggle state are not saved.

## Dataset format

Download the example in the dashboard, or copy `sample-data.json`. Files use this shape:

```json
{
  "datasets": [
    {
      "id": "custom-incident",
      "name": "Custom incident",
      "description": "Optional short context.",
      "events": [
        {
          "date": "2026-09-15",
          "label": "Incident announced",
          "impactPct": -10
        },
        {
          "date": "2026-10-01",
          "label": "Recovery milestone",
          "impactPct": 5
        }
      ]
    }
  ]
}
```

An event multiplies the baseline price by `1 + impactPct / 100` **on its date and every subsequent date**. Events compound across active datasets, irrespective of toggle order. A −10% event followed by +5% produces a combined −5.5% impact, not −5%. To reverse −10% completely, use approximately +11.1111%. Same-day events also compound.

Dates must be real calendar dates inside the fixed mock period (`2026-07-24` through `2026-10-22`). Event impacts must be numbers from −95 to +100. IDs use lowercase letters, numbers, and hyphens (1–60 characters). Names are 1–100 characters, optional descriptions 1–240, and event labels 1–160. Limits: 20 loaded datasets, 20 events per dataset, and 1 MB per file. Invalid imports report a visible error and leave all existing data untouched. Duplicate IDs across files in the same import are rejected.

Data is read locally in your browser and never uploaded. Chart dots have event tooltips; the timeline provides the same information without relying on hover or color.

## Checks

With the server running, from the repository root:

```sh
npx eslint deliverables/stock-mock/stock-mock.js deliverables/stock-mock/test.mjs
npx stylelint deliverables/stock-mock/styles.css
node deliverables/stock-mock/test.mjs
```

The browser checks use the repository's existing Playwright dependency. Pass an optional screenshot directory as the first argument to capture desktop, tablet, and mobile previews.
