# zmm_grn_dash — GRN Dashboard, Phase 3 (SAPUI5 front end)

The Fiori front end for the Goods Receipt (GRN) analysis dashboard, wired to the Phase 2
OData V4 service `ZMM_GRN_DASH_O4`. This file documents the [`zmm_grn_dash/`](zmm_grn_dash/)
subfolder but lives at the project root alongside it — every `webapp/...` path below is
relative to `zmm_grn_dash/`, and `cd zmm_grn_dash` first before running anything in
"Running it".

- Functional spec: [`GRN Dashboard FS.md`](GRN%20Dashboard%20FS.md) and
  `MM-ALM-002_FS GRN_Dashboard.docx` (Technical Development No. **MM-ALM-002**).
- Backend (Phase 1 + 2): [`README.md`](README.md).
- Visual reference: `GRN Dashboard v2.dc.html` — the reviewed HTML prototype this app
  reproduces.

## Generated project details

|               |
| ------------- |
|**Generation Date and Time**<br>Wed Jul 29 2026 11:39:34 GMT+0530 (India Standard Time)|
|**App Generator**<br>SAP Fiori Application Generator 1.21.0 (Basic V4 template)|
|**Service Type**<br>SAP System (ABAP On-Premise)|
|**Service URL**<br>https://vhafbmedap01.hec.erp.alimco.in/sap/opu/odata4/sap/zmm_grn_dash_o4/srvd_a2x/sap/zmm_grn_dash_o4/0001/|
|**Module / Namespace**<br>zmm_grn_dash / com.sap → component id `com.sap.zmmgrndash`|
|**BSP app name**<br>`ZMM_GRN_DASH` (package `ZMM`, transport `MEDK913140` — see `ui5-deploy.yaml`)|
|**UI5 Theme / Version**<br>sap_horizon / 1.102.8 minimum|

## Running it

```
cd zmm_grn_dash
npm install
npm start          # against the real system (prompts for SAP credentials via fiori-tools-proxy)
npm run start-mock # against webapp/localService/mainService/metadata.xml
npm run build      # -> dist/
npm run deploy     # build + deploy to the ABAP repository as BSP app ZMM_GRN_DASH
```

The dashboard fires its first read automatically on startup using the **Current FY (to
date)** preset and no code filters.

## Architecture

### Native rendering, not the iframe bridge

An earlier Phase 3 sketch (in the ABAP README) proposed a UI5 shell hosting the HTML
prototype in an `<iframe>` with a `postMessage` bridge. That was **not** built. The
prototype is reproduced as real UI5 controls plus ECharts canvases in the same document,
because the iframe approach would have cost a second document to authenticate and
theme, a hand-rolled message protocol as the only way to move filter state, no Fiori
Launchpad integration for the filter bar, and a second copy of the styling to maintain.
Nothing in the prototype needed an iframe — only ECharts, which runs fine in a UI5
control. See "Trade-offs accepted" below for what this did cost.

### Fiori filter bar, prototype panels

The split is deliberate and is the main thing to understand before editing:

- **The filter bar is stock SAP Fiori.** `Select`, `DateRangeSelection`, four
  `MultiComboBox`es and `Button`s. This is the region the user actually operates, and token
  handling, keyboard support and screen-reader behaviour are worth far more here than a
  bespoke look.
- **Everything below it is the HTML prototype, ported.** KPI tiles, quality tiles, the ratio
  strip, the chart panels and the vendor scorecard are the prototype's own markup, palette,
  typography and CSS grid — rendered by small custom controls in `webapp/control/` and
  styled by `webapp/css/style.css`. No `sap.m` card, no `sap.ui.layout.Grid`, no
  `sap.m.Table`.

The custom controls are thin: a renderer, a few properties and (where a panel contains a
chart) one aggregation. All numbers arrive pre-formatted from the controller, so the
controls never format anything and there is one place where crore/lakh notation and the
semantic thresholds live.

### Module map

| File | Responsibility |
|---|---|
| `webapp/view/zmm_grn_dash.view.xml` | The whole dashboard: Fiori filter bar, then the ported panels. |
| `webapp/controller/zmm_grn_dash.controller.js` | Filter state, load orchestration, response → view-model transformation, chart rebuilds. |
| `webapp/css/style.css` | The prototype's `--grn-*` token blocks (light + dark) and every panel style. |
| `webapp/model/appTheme.js` | Auto/light/dark: sets `data-grn-theme` and keeps the UI5 theme in step. |
| `webapp/model/dashboardService.js` | The only place that knows the OData contract: builds the parameterised paths and reads all ten entity sets. |
| `webapp/model/chartOptions.js` | Pure `(rows, ctx) → ECharts option` builders, one per visual. |
| `webapp/model/chartTheme.js` | Reads the chart palette out of the `--grn-*` CSS tokens. |
| `webapp/model/formatter.js` | Indian crore/lakh number formatting, percentages, period labels. |
| `webapp/model/echartsLoader.js` | Loads `webapp/libs/echarts.min.js` once. |
| `webapp/control/EChart.js` | Control wrapping one ECharts instance (resize, rerender, dispose). |
| `webapp/control/Box.js` | A `<div>` with children — the CSS-grid containers (`hero`, `quality`, `full`, `charts`). |
| `webapp/control/Head.js` | Page header: title, module chip, movement legend, actions, SCOPE line. |
| `webapp/control/Card.js` | Panel chrome: title, subtitle, badge, actions, content; `span` in the 12-column grid. |
| `webapp/control/KpiCard.js` | Hero tile: value, unit, delta pill, sparkline aggregation. |
| `webapp/control/QualCard.js` | Quality-bucket tile with share bar. |
| `webapp/control/RatioStrip.js` | The four-cell ratio strip. |
| `webapp/control/Scorecard.js` | Vendor scorecard as the prototype's CSS-grid table; rows are `<button>`s. |
| `webapp/control/Toggle.js` | The segmented pill (theme switch, qty/value toggle). |
| `webapp/control/Btn.js` | The prototype's flat uppercase button (Reset view). |
| `webapp/libs/` | Vendored ECharts 5.5.0 — see `../libs_README.md`. |

### How the OData reads work

All ten entities are CDS **custom entities with parameters**, so the metadata exposes each
as a `…Parameters` entity set whose `Set` navigation property carries the rows, and the six
filters are part of the resource path rather than `$filter`:

```
/KPI(P_DateFrom=2026-04-01,P_DateTo=2026-07-29,P_Vendor='',P_Material='',P_Plant='',P_DocType='')/Set
```

Consequences worth knowing before changing anything here:

- **`P_DateFrom`/`P_DateTo` are `Edm.Date` and go in unquoted**; the four filter parameters
  are `Edm.String` and must be single-quoted. Getting either wrong produces a 400 from the
  Gateway, not a UI5-side error. `dashboardService.buildPath()` is the single place this is
  assembled.
- **The parameter entity sets are annotated `Readable=false`** — reading `/KPI` directly is
  rejected by the backend. Only the `/Set` navigation returns data.
- **The four code filters are comma-separated strings**, parsed by `csv_to_range()` in each
  `ZCL_GRN_DASH_*_QRY` class. Empty means "all". Values are upper-cased in the UI to match
  the parameters' `IsUpperCase` annotation.
- **One `$batch` per refresh.** All ten reads go through `Promise.all` on the default
  `$auto` group, so UI5 folds them into a single round trip.
- **`autoExpandSelect` is `false`** in `manifest.json` and every read passes an explicit
  `$select`. These bindings have no dependent property bindings for the model to infer a
  projection from, so declaring the field list per entity is both cheaper and a readable
  record of what each chart consumes.
- **A fresh list binding is created and destroyed per read.** An `ODataListBinding` owns its
  cache, so this guarantees a real request even when the user presses Go twice with
  identical filters.
- **The first failure rejects the whole load** and names the offending entity set in the
  message. A dashboard silently missing one chart is more misleading than one that says it
  could not load.

### Theming

Two systems have to agree: the panels are styled by the `--grn-*` tokens in `style.css`
(selected by `data-grn-theme` on `<html>`), the filter bar by the UI5 theme. `appTheme.js`
keeps them in step from one **Auto / Light / Dark** switch in the header.

| Mode | Panels | UI5 theme |
|---|---|---|
| Auto (default), standalone | follows the OS colour scheme | switched to match |
| Auto, inside the Launchpad | follows the shell's theme | left alone — the shell owns it |
| Light / Dark | as chosen | `sap_horizon` / `sap_horizon_dark`, in the shell too |

Explicit light/dark switches the UI5 theme even inside the Launchpad, because a dark
dashboard with a light filter bar is worse than a theme change the user asked for.

Chart colours are read from the same CSS tokens (`chartTheme.js`), which is what keeps a
chart and the card around it in one palette. A theme change re-resolves the palette and
redraws from the cached response — no round trip. Token names are prefixed `--grn-` so
nothing collides with the `--sapXxx` parameters the filter controls rely on.

Typography is the prototype's: `"IBM Plex Sans"` first, falling back to SAP's `"72"` where
IBM Plex is not installed. No web font is fetched — an SAP-hosted BSP should not depend on
a font CDN.

Only light and dark are modelled. The high-contrast themes get the dark token block, which
is legible but not high-contrast.

## Deviations from the HTML prototype

| Prototype | Here | Why |
|---|---|---|
| GRN Year + GRN Month dropdowns | Date range + six presets (Current FY to date, Previous FY, Last 12 months, Calendar YTD, Current month, Custom) | The OData contract only has `P_DateFrom`/`P_DateTo`. Presets cover the year/month use cases and the fiscal year is April–March. |
| Vendor/Material/Plant/Doc-type dropdowns with full option lists | `MultiComboBox` whose lists are built from the codes seen so far | The service exposes **no value-help entity sets**. See open items. |
| Own light/dark theme toggle | Kept — Auto / Light / Dark, and it drives the Fiori theme too | See Theming. |
| 4 quality buckets incl. "Under inspection" | Accepted / Rejected / Sample / Rework GRN Qty | These are the four the backend actually emits (`ZCL_GRN_DASH_QUERY` line 781ff). "Under inspection" survives on the plant chart, which is fed by `PlantTop10.InspectPct`. |
| Per-KPI sparklines from a monthly series | Sparklines derived from the `Trend` entity | The `KPI` entity carries only current/prior/delta, but `Trend` has the same measures per period. |

## Conventions

- **All `.js` source is pure ASCII.** The rupee sign, middle dot and arrow that appear in
  the UI are built from `String.fromCharCode(...)` in `formatter.js` (`RUPEE`, `MIDDOT`,
  `RANGE_ARROW`, `NO_VALUE`) and reused from there, rather than written as literal
  characters — matching the same rule `ZCL_GRN_DASH_QUERY` follows on the ABAP side (see the
  backend README's open items). A BSP that serves `.js` without an explicit UTF-8 charset
  would otherwise mangle a literal rupee sign into mojibake. Comments are exempt (they never
  reach the rendered page); only string literals that reach the UI need the ASCII-safe form.
- **`i18n.properties` is pure ASCII too.** The middle dots that separate the clauses of the
  legend and the chart subtitles are written as `\u00b7`, the escape form the `.properties`
  parser resolves regardless of how the file is served.

## Trade-offs accepted

- **~1 MB of ECharts ships with the app.** `ui5.yaml` excludes `webapp/libs/` from the
  component preload and from re-minification, so it is fetched once as a standalone
  same-origin file instead of being inlined into `Component-preload.js` (which would double
  the payload and block startup) — but it is still a megabyte. Note the two exclude lists
  use *different* path conventions; the comments in `ui5.yaml` record which is which.
- **`flexEnabled` is `false`.** The scaffold set it true, which requires a stable ID on
  every control including those generated from aggregation templates. Key-user adaptation of
  a fixed chart dashboard has no real use case, and the ID requirement is pure noise here.
- **Charts are canvas, so they are not screen-reader accessible.** The vendor scorecard
  table is the accessible path to the same numbers; the other six charts have no table
  equivalent yet.

## Open items

1. **No value help for the four code filters.** The dropdown lists are harvested from the
   rows each load returns and *accumulate* across loads — they are never emptied, because
   every result set is a top-N and a `MultiComboBox` silently drops a selected key that has
   no matching item. Consequence: a code that has never appeared in a response cannot be
   selected at all (the old free-text `MultiInput` allowed it), and the lists grow as the
   user widens the date range. Proper F4 needs value-help entity sets (or standard
   `I_Supplier`/`I_Product`/`I_Plant` consumption) added to `ZMM_GRN_DASH_O4` and
   `sap.ui.comp` value-help wiring here.
2. **Not yet run against the live service.** The app has been run headlessly against
   `npm run start-mock` — it boots, the view renders, all ten reads complete and the empty
   states appear, with no console errors — but the mock server generates no rows for the
   parameterised `…/Set` navigations, so nothing has been rendered from real data end to
   end. Running against `vhafbmedap01` needs credentials; that is the moment to confirm the
   parameter-path format and the number formatting on real magnitudes.
3. **The `Trend` entity's `Period` is assumed to be `YYYYMM`.** `formatter.periodLabel()`
   renders it as "Apr 26" and falls back to the raw string if it is not six digits.
4. **No Fiori Launchpad tile yet** — no `sap.flp` / `crossNavigation` section in
   `manifest.json`. Add the semantic object/action when the tile is created, and note that
   the FS restricts access to a named group by role assignment (no authorization-object
   checks in the backend).
5. **The doc-type chart's zoom window is fitted on load, not on resize.** Resizing the
   browser rescales the canvas but does not re-fit how many bars are visible; the **Reset
   view** button rebuilds it at the current width.
