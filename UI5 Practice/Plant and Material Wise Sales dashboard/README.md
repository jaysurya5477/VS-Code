# Plant & Material Wise Sales Dashboard

A Fiori/SAPUI5 dashboard for plant- and material-wise sales (billing) analysis for **ALIMCO** —
government aid/appliance schemes (ADIP, ADIP SSA, …), Indian fiscal year (Apr–Mar).

## Current status

**Phase 1 and Phase 2 are both live and verified (2026-08-13). Phase 3 (UI5 app) has a working
basic template as of 2026-08-14.** The two fact CDS views and the central compute class were
imported, activated, and validated against real data via `ZSD_PMS_DASH_TEST` and the ADT debugger —
several real findings came out of that (OD-6 FY convention, OD-7 `month_num`, OD-8 `VKBUR` join key,
OD-9 Trap-2 cutoff, the `get_unit_dots` plant/unit grouping bug — see `CONTEXT_LOG.md` §6 for all of
them), all fixed. The 7 CDS custom entities + 7 RAP query provider classes + 1 service definition
under [`ABAP/`](ABAP/) were then imported, activated and Service-Bound — confirmed by reading the
live `$metadata` export, which showed all 7 entity sets, the four reserved-word renames
(`KpiLabel`/`AlmZone`/`MatValue`/`UnitCode`) and every field type/precision exactly as designed.

The [`zsd_pms_dash/`](zsd_pms_dash/) UI5 app (generated via the Fiori Application Generator against
the live service URL) now has a working first cut: filter bar (FY/Zone/State/Plant/Scheme/Material/
Period), 4 KPI cards, an India choropleth + Unit map-dot panel, and Scheme/Plant/Material panels,
following the GRN Dashboard's own control/model architecture (ECharts via a vendored
`libs/echarts.min.js`, custom Box/Card/Head/KpiCard controls, a `dashboardService.js` read layer).
`ui5 build` and a local `ui5 serve` smoke test both pass — see "Next action" below for what a real
browser/backend test would still need to confirm, and what's simplified vs. the full V8 design.
The HTML design template remains the design source of truth for anything not yet ported.

**Panel fidelity (2026-08-14).** Three panels were rebuilt to match V8 exactly rather than
approximate it in ECharts:

- **KPI cards** — the template's own anatomy: gradient accent bar, mono eyebrow label, value and
  inline SVG sparkline on one row, delta pill + mono sub-line on the next. The sub-line differs
  per card as V8 has it (un-abbreviated amount / effective GST rate / snapshot date + invoices).
- **India map** — quantile colour scale (not linear), zone granularity paints the zone unions
  rather than recolouring states, V8's dot-radius formula, a hover card, and a legend labelled with
  the real quantile breaks. *(The hover card carried share-of-India, plants-billing, invoices and
  growth until 2026-08-18; it now shows gross, net and tax only — see OD-12.)*
- **Scheme performance** — no longer a bar chart. It is V8's ranked list (colour chip, value,
  progress bar, share + invoice count, growth) plus the Top-states roll-up under a divider, with
  every row click-to-filter.

Sales trend, Sales by plant and Sales by material stay on ECharts, and the filter bar and theme
switch are unchanged. Both light and dark palettes were re-tuned at the same time — see the
`--pms-scale-*` / `--pms-dot` / `--pms-zonediv` tokens and the font-stack note in
[`webapp/css/style.css`](zsd_pms_dash/webapp/css/style.css).

**Live against production, and what that surfaced (2026-08-17 → 2026-08-18).** The app now runs
against the real service and has been driven by the business. Four things came out of it, all
recorded in full in `CONTEXT_LOG.md` §6:

- **OD-10 — state is the Unit's own, with the billing plant as a fallback.** Every geography field
  but one came from `VKBUR`; `REGIO` alone came from `WERKS`. In production the East zone carried
  38 billing plants across 14 states for its 5 units, so Uttar Pradesh and Karnataka rendered as
  East. `ZSDD_PMS_GL_CDS` now joins `T001W`/`T005U` twice and `coalesce( )`s the result.
  ⚠ **Not yet activated — the production choropleth stays wrong until it is.**
- **OD-11 — the map's zone comes from `ALM_ZONE`, not a geographic lookup**, so the Zone filter and
  the shading finally agree (2000 HQ is in Kanpur but belongs to Central). ⚠ **Superseded
  2026-08-22 (OD-15, below) — `ALM_ZONE` kept mis-assigning states on the map regardless.**
- **OD-12 — growth indicators are hidden for FY 2026 whenever a filter beyond Fiscal Year is set.**
  `VKBUR` began in FY 2026, so prior-year rows have a blank zone and are excluded by any zone
  predicate, which made a filtered comparison divide by an almost-empty base. The rule expires on
  its own in FY 2027. The Yesterday Sale card shows no pill in any year. ⚠ **Revised 2026-08-22
  (OD-14, below) — the FY-only exemption did not hold up.**
- **Both filter caps lifted.** Gateway pages at 100 *and* `sap.ui.model.Model` defaults `sizeLimit`
  to 100 — two independent caps in series, either of which alone still showed `(0 of 100)`.

`npm run start-prod` (port 8098, `ui5-prod.yaml`) points a local build at the production backend for
exactly this kind of diagnosis. It holds **no credentials** — the proxy prompts.

**FY floor, unconditional delta suppression, and the map's own zone table (2026-08-22).** Three
more decisions, all recorded in `CONTEXT_LOG.md` §6:

- **OD-13 — the FY picker is floored at `VKBUR_FIRST_FY` (2026).** `_fyOptions()` no longer offers
  any year before it — pre-2026 billing carries no sales office at all, so it can neither be
  grouped nor filtered by zone. The picker widens back to three years on its own once FY 2028
  makes FY 2026 the third year back.
- **OD-14 — growth pills are hidden for the whole of FY 2026, not only when a scope filter narrows
  it (supersedes OD-12).** The FY 2025 comparison base is unreliable either way, filtered or not.
  FY 2027 onward is unaffected. The scheme panel's subtitle now switches between "· vs FY {year}"
  and a plain "Gross value by scheme" (i18n `schemeVsFy` / `schemeNoVs`) to match.
- **OD-15 — the map's own zone choropleth reverts to a frontend hardcoded table (supersedes
  OD-11).** `ALM_ZONE` kept surfacing states under the wrong zone in production even after OD-11 —
  Karnataka and Uttar Pradesh under East, Odisha missing from East entirely in an unbilled period.
  `IndiaMap.js` now carries its own `ZONE_OF_STATE` table covering all 36 states/UTs across 5
  zones. Scoped to this control alone: the Zone filter dropdown, KPI totals and every other panel
  still match on `ALM_ZONE` server-side, unchanged; zone hover totals still aggregate live from
  the same Geo rows, just grouped by `ZONE_OF_STATE`.
- The choropleth's lightest colour step and "no billing" fill (`--pms-scale-0`, `--pms-nodata`)
  were also darkened slightly, so low-value and no-billing states stay visibly distinct from the
  white panel background in light theme. Dark theme untouched.

## Where things are

| Path | What it is |
|---|---|
| [`Final Template/sales-dashboard-india_claude V8.html`](Final%20Template/) | **The frozen design template.** Self-contained, 172 KB — Chart.js + inline India choropleth SVG, with mock data generated in-browser. This is the spec for the UI. |
| [`Old Templates/`](Old%20Templates/) | V1–V7 iterations, superseded. Not worth reading. |
| [`Documentation/CONTEXT_LOG.md`](Documentation/CONTEXT_LOG.md) | **Start here.** Compact, verified facts: real SAP data model, template panel inventory, decisions taken, open questions. Written to be read instead of the 172 KB template. |
| [`Documentation/ABAP_Backend_Plan.md`](Documentation/ABAP_Backend_Plan.md) | Full feasibility verdict (possible / needs-work / not-possible) plus the Phase 0–3 build plan and target object design. |
| `echarts.min.js` | Vendored ECharts bundle. V8 itself uses Chart.js, but the UI5 app (Phase 3) uses ECharts instead, matching the GRN Dashboard's own architecture — this file is copied into `zsd_pms_dash/webapp/libs/`. |
| [`zsd_pms_dash/`](zsd_pms_dash/) | The Phase 3 SAPUI5 app (Fiori-generator scaffold + hand-built dashboard). See its own filter bar, KPI/map/chart panels under `webapp/`. |
| `D:\New\VSCODE_ABAP\Sales Register Optimize\ZFI_SR_NEW_OPT.abap` | **Outside this project** (a Finance Sales Register report), but the reference implementation for material-level GST and the material↔GL link — see OD-4 in `CONTEXT_LOG.md` §3/§6. |
| [`ABAP/`](ABAP/) | **Phase 1: imported, activated, live-tested (2026-08-13).** `ZSDD_PMS_GL_CDS`/`ZSDD_PMS_ITEM_CDS` (the two fact views), `ZCL_PMS_DASH_QUERY` (central compute class — KPIs, trend, geo + Unit dots, scheme, plant/material top-20, Trap 1/2, OD-4's tax pivot and material↔GL bridge), `ZSD_PMS_DASH_TEST` (validation report, confirmed working against real data). **Phase 2: drafted, not yet imported.** 7 custom entities (`ZSD_PMS_KPI`/`TREND`/`GEO`/`UNIT_DOTS`/`SCHEME`/`PLANT`/`MATERIAL`), 7 query provider classes (`ZCL_PMS_*_QRY`), and the service definition `ZSD_PMS_DASH_O4`. |

## Architecture, in one paragraph

Copy the proven pattern from the sibling [`../GRN Dashboard/ABAP NEW/`](../GRN%20Dashboard/): two
core CDS fact views (one at GL grain, one at billing-item grain) feed a single central ABAP compute
class, which is exposed through thin `IF_RAP_QUERY_PROVIDER` classes behind CDS custom entities and
published as one OData V4 service. Filters travel as entity **parameters**, not `$filter`, because
they scope the whole computation. All aggregation is server-side — the template's in-browser
filtering model does not survive real data volumes.

## Things to know before starting

1. **The "scheme" dimension is real.** `ZSD_SALE_ALL.category` / `cat_desc` holds ADIP, ADIP SSA
   etc. — the template's scheme panel maps 1:1 onto existing data.
2. **`ZSD_SALE_ALL` has no material and no quantity**, and its grain is GL-account level
   (`BELNR/GJAHR/HKONT`), so joining `VBRP` onto it double-counts. Material and quantity need a
   second, independent fact view — and as of 2026-08-12 (**OD-4**) there's now a concrete design
   for it: `VBRP.knumv_ana` → `PRCD_ELEMENTS` gives real per-material GST, and
   `PRCD_ELEMENTS.sakn1` gives an exact material↔GL link that resolves the double-count trap
   precisely instead of by aggregate cross-check. See the reference program below.
3. **⚠ All volume measurements so far are from SAP client 120, a near-empty sandbox — production
   has ~109 billing plants, not 10.** DDIC *structure* is cross-client and still trustworthy;
   every *count* is not. Geography is keyed on **plant** state (decided), which with 109 plants
   gives a properly populated choropleth. CSV export is **dropped**.
4. **The 4th KPI card is "Yesterday Sale," not Geographic reach (decided 2026-08-12).** A
   single-day snapshot — yesterday's sale, or the selected month's last day if a past month is
   filtered — replaces the state-count card.
5. **Map dots are keyed on Unit, not Plant (decided 2026-08-12).** `ZSD_ZONE_PLANT.unit` groups
   the 109 plants into **18 Units** in production. Pending live confirmation via Phase 0 (P0-7).
   **The real join key is `VKBUR` (sales office), not `WERKS` (OD-8, corrected by user 2026-08-13)**
   — `ZSD_ZONE_PLANT.WERKS` holds one row per Unit despite its name.
6. **Dot coordinates will come from the backend, not a hand-geocoded frontend table (OD-5,
   2026-08-12).** Two new lat/lon fields are being added to `ZSD_ZONE_PLANT`, business-maintained
   per plant. Still open: how to derive one point per Unit from its member plants (P0-10).
7. **FY filter is now a picker, not a segmented row (decided 2026-08-12)** — same visual pattern as
   Region/Plant/Material, defaulting to the FY containing today's date (computed, not hard-coded).
   Implemented in the HTML template, **but don't port its FY-numbering as-is** — see point 8.
8. **The real `GJAHR` fiscal-year convention is the opposite of the template's (OD-6, confirmed
   live 2026-08-13).** Apr 2026–Mar 2027 is real-system `GJAHR` **2026** (named by the year it
   starts in); the template labels the same period "**2027**" (named by the year it ends in).
   `ZCL_PMS_DASH_QUERY` already uses the real convention. Phase 3's UI5 FY picker needs an explicit
   relabel-or-translate step, not a direct port of the template's `currentPeriodInfo()`/`FYS` logic.
9. **`ZSD_SALE_ALL.month_num` is a plain calendar month, not an FY-shifted period (OD-7, confirmed
   against real Phase 1 test output, 2026-08-13).** Fixed with two converters in
   `ZCL_PMS_DASH_QUERY` (`month_to_period`/`period_to_month`) applied once, in `get_gl_rows` — no
   other method needed to change. If this ever gets re-derived by hand elsewhere, remember: Apr=**04**
   here, not Apr=**1**.

## Next action

**Verify the Phase 3 basic template against the real backend, then round out the UI.** Everything
so far was verified with `ui5 build` and a local `ui5 serve` static-asset smoke test only — this
sandbox has no VPN/credentials to `vhafbmedap01.hec.erp.alimco.in`, so no request has actually
round-tripped through the live OData service or been eyeballed in a browser yet:

1. **Run `npm start` (or `npm run start-local`) against the real system and open it in a browser.**
   Confirm the 7 `/Set` reads batch correctly, the KPI cards/map/charts populate, and the Zone/
   State/Plant/Scheme/Material dropdowns fill in as each load's catalog merges (they start empty —
   no value-help entities exist yet, see below).
2. **Compare against `Final Template/sales-dashboard-india_claude V8.html`** for what is still
   deliberately simplified. KPI cards, the map and the scheme panel now match V8 (see "Panel
   fidelity" above); what remains different is:
   - no date-range picker — the FY filter always spans the full fiscal year, Apr 1–Mar 31;
   - no qty/value toggle on the material panel;
   - no click-to-drill on the plant/material bars (the map, the scheme rows and the Top-states
     rows all filter; the ECharts bars do not, mirroring GRN's vendor-bar precedent);
   - every KPI sparkline plots the same monthly Trend series — V8 gives its daily card a
     trailing-12-day series, which has no backend equivalent (Trend is FY-period grain);
   - the Unit-dot overlay is a stock Fiori `Switch`, not V8's red custom pill;
   - IBM Plex / Archivo cannot be fetched (CDNs are blocked here), so the stacks fall back to
     SAP's own "72" — which has the side benefit of matching the Fiori filter bar exactly.
3. **Known, deliberately-deferred gap:** no value-help entities exist yet for Plant/Material/Region
   type-ahead (the original Part B plan's `ZSD_PMS_VH_*` entities) — same call the GRN Dashboard
   made for its own equivalent filters. The dropdowns are built from each response's own codes
   instead (GRN's `_mergeCatalog` pattern), so they only ever list what's currently in scope.
4. **Still-open gap, unrelated to Phase 3:** the Scheme filter does not restrict the material
   panel — `category` lives only on the GL-grain fact, not on `VBRP`/`VBRK` (see
   `ZCL_PMS_DASH_QUERY=>get_item_rows`'s own comment). `ZSD_PMS_MATERIAL`'s `P_Scheme` parameter is
   accepted but currently has no effect on that entity's rows.

## Related projects in this workspace

- [`../GRN Dashboard/`](../GRN%20Dashboard/) — the RAP architecture reference (10 entities, 13 classes, OData V4).
- [`../Sales Dashboard/`](../Sales%20Dashboard/) — closest prior art; `ZSDD_CENTER_DASH_CDS` already joins the ALIMCO sales tables, and `zsd_zone_dash/` is a deployed UI5 app.
