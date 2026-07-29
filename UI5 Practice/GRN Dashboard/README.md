# ABAP NEW — GRN Dashboard, Phase 1 + Phase 2 (backend + OData V4)

The [`ABAP NEW/`](ABAP%20NEW/) folder holds the ABAP objects for **Phase 1** and **Phase 2** of
the GRN Dashboard build, per [`GRN Dashboard FS.md`](GRN%20Dashboard%20FS.md) (functional spec)
and [`MM-ALM-002_FS GRN_Dashboard.docx`](MM-ALM-002_FS%20GRN_Dashboard.docx) (formal FS document,
Technical Development No. **MM-ALM-002**). This README documents that folder from the project
root, alongside [`webapp_README.md`](webapp_README.md) (Phase 3) and
[`libs_README.md`](libs_README.md).

## What's built so far

- **Phase 1** — read-only backend: two new CDS views + one ABAP query class that together
  compute every KPI/ratio/chart the dashboard needs, callable and testable in a real SAP system
  today via a classic-list test report.
- **Phase 2** — OData V4 exposure of Phase 1's query class: 10 CDS custom entities + 10 thin
  query provider classes + 1 service definition. See "Phase 2: OData V4 design" below.
- **Phase 3** — the SAPUI5 front end, in [`zmm_grn_dash/`](zmm_grn_dash/). Built and building
  cleanly; **not yet run against the live service**. [`webapp_README.md`](webapp_README.md) is
  the reference for the app — this file covers only what Phase 3 means for the backend contract,
  under "Phase 3: what the front end assumes" below.

## Files in `ABAP NEW/`

### Phase 1 — backend

| File | What it is |
|---|---|
| `ZMMD_GRN_DASH_CDS.ddls.asddls` | Core 101-GRN-line fact view. Lean rebuild of `ZMMD_PO_CDS` (see file header for exactly which joins were kept/dropped and why). |
| `ZMMD_GRN_MVT_CDS.ddls.asddls` | Generic correction-movement view covering 102 and Z22 together (`BWART` discriminates), standalone from the core view — see "Why two separate CDS views" below. |
| `ZCL_GRN_DASH_QUERY.clas.abap` | The query class. Public API: `default_filters( )` and `get_dashboard_data( is_filters )`. All KPI/ratio/quality-bucket/chart logic lives here. |
| `ZMM_GRN_DASH_TEST.prog.abap` | Throwaway executable report to call the class and dump results as a classic list, so the class can be sanity-checked the moment the CDS views are activated. Not the dashboard — a validation tool only. |

### Phase 2 — OData V4

| File | What it is |
|---|---|
| `ZMM_GRN_DASH_KPI.ddls.asddls` | Custom entity — KPI cards (`KPI` in the service). |
| `ZMM_GRN_DASH_QUALITY.ddls.asddls` | Custom entity — quality buckets (`Quality`). |
| `ZMM_GRN_DASH_RATIO.ddls.asddls` | Custom entity — ratio strip (`Ratio`). |
| `ZMM_GRN_DASH_TREND.ddls.asddls` | Custom entity — receipt flow over time, monthly (`Trend`). |
| `ZMM_GRN_DASH_VENDOR_TOP10.ddls.asddls` | Custom entity — top 10 vendors by GRN value (`VendorTop10`). |
| `ZMM_GRN_DASH_PLANT_TOP10.ddls.asddls` | Custom entity — top 10 plants, quality composition (`PlantTop10`). |
| `ZMM_GRN_DASH_MATERIAL_TOP20.ddls.asddls` | Custom entity — top 20 materials by GRN value (`MaterialTop20`). |
| `ZMM_GRN_DASH_DOCTYPE_RANKED.ddls.asddls` | Custom entity — GRN value by PO doc type, ranked (`DoctypeRanked`). |
| `ZMM_GRN_DASH_MAT_REJ_WORST10.ddls.asddls` | Custom entity — worst 10 materials by rejection rate (`MaterialRejWorst10`). |
| `ZMM_GRN_DASH_VENDOR_SCORECARD.ddls.asddls` | Custom entity — vendor scorecard, top 15 by score (`VendorScorecard`). |
| `ZCL_GRN_DASH_KPI_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_KPI`. |
| `ZCL_GRN_DASH_QUALITY_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_QUALITY`. |
| `ZCL_GRN_DASH_RATIO_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_RATIO`. |
| `ZCL_GRN_DASH_TREND_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_TREND`. |
| `ZCL_GRN_DASH_VENDOR_TOP10_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_VENDOR_TOP10`. |
| `ZCL_GRN_DASH_PLANT_TOP10_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_PLANT_TOP10`. |
| `ZCL_GRN_DASH_MAT_TOP20_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_MATERIAL_TOP20`. |
| `ZCL_GRN_DASH_DOCTYPE_RANK_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_DOCTYPE_RANKED`. |
| `ZCL_GRN_DASH_MAT_REJ_W10_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_MAT_REJ_WORST10`. |
| `ZCL_GRN_DASH_VENDOR_SCORE_QRY.clas.abap` | Query provider for `ZMM_GRN_DASH_VENDOR_SCORECARD`. |
| `ZMM_GRN_DASH_O4.srvd.abap` | Service definition — exposes all 10 entities above. |

## Why two separate CDS views, not one

`ZMMD_GRN_DASH_CDS` is a flat 101-GRN-line view. 102/Z22 are each a **1:N relationship** to a
101 line (one GRN could have multiple rework cycles). Joining any of them into the flat view
would fan out and double-count the base GRN qty/value on aggregation. So corrections are queried
independently in `ZCL_GRN_DASH_QUERY`, each row carrying its own vendor/material/plant/doc-type
dimensions and its own posting date, and combined only in ABAP after each has already been
aggregated. This is explained in more detail in each view's header comment and in FS section 6.2.

### Why 102 and Z22 both live in *one* view (`ZMMD_GRN_MVT_CDS`)

Originally this was two views — one for 102 (self-joined back to its specific original 101 via
`MATDOC-LFBNR`), one for Z22 (traced through the custom table `ZMM_GR_REWORK`). Neither trace
turned out to be necessary: the dashboard only ever aggregates these movements by
vendor/material/plant/doc-type/date, never by "which specific 101 does this correction belong
to" (that granularity only matters for a line-item report like `ZMM_PO_HISTORY_VER2`, not for a
dashboard that just sums things). And since it's confirmed that Z22 rework movements post
against the *same* PO/PO-item as the original procurement (not a separate rework/subcontract PO),
both movement types resolve their vendor/material/plant identically: join `MATDOC` straight
to `EKPO`/`EKKO` on the movement's own `EBELN`/`EBELP`. That makes 102 and Z22 structurally
identical, so they're now one view with `BWART` exposed, and `ZCL_GRN_DASH_QUERY` just filters by
movement type per call site (`get_reversals` → `bwart = '102'`, `get_rework` → `bwart = 'Z22'`).
This also eliminates the custom Z-table dependency entirely.

**Requirement change: rework has no cancellation.** An earlier draft of this view also modelled a
Z23 "rework cancel" movement type, built as a `UNION ALL` branch validated via MATDOC's standard
SAP storno linkage (`Z23.SMBLN/SJAHR/SMBLP = Z22.MBLNR/MJAHR/ZEILE`). The business owner has since
confirmed **rework is never reversed** — there is no Z23 in this business process — so that
branch, and every Z23 reference in the class/FS/test report, has been removed. The view is now a
single `SELECT` (no `UNION ALL`).

`ZMMD_GRN_MVT_CDS` also applies an `LBBSA_SID` filter per movement type (102 keeps `'01'/'02'/' '`,
matching `ZMMD_GRN_DASH_CDS`'s 101 dedup rule; Z22 keeps `'07'`) to avoid double-counting MATDOC's
per-valuation-area/stock-split rows on aggregation.

## Phase 2: OData V4 design

**Pattern reused: CV Ageing dashboard's RAP custom entity approach**, not the Material Stock
(MB5B) dashboard's. Both exist in this workspace; they differ in one important way:

- **MB5B** runs a headless `SUBMIT` of another (expensive) report to produce its data, so its
  OData layer needed a cross-request, DB-backed TTL cache (`ZMB5B_QCACHE` /
  `ZCL_MB5B_SOURCE`) — otherwise every sibling entity read of one dashboard load would re-run
  the full `SUBMIT` from scratch.
- **CV Ageing** (and this dashboard) call a plain ABAP class directly — `ZCL_CV_AGEING` /
  `ZCL_GRN_DASH_QUERY` — which computes straight from CDS views/Open SQL in one method call, no
  report re-execution to amortise. So **no caching layer here**: each of the 10 query provider
  classes below calls `ZCL_GRN_DASH_QUERY=>get_dashboard_data( )` directly, every time, exactly
  like `ZCL_CV_AGEING_CUST_QRY`/`ZCL_CV_AGEING_VEND_QRY` call `ZCL_CV_AGEING=>get_ageing( )`
  directly. This was an explicit decision (see CV Ageing's own README for the source pattern) —
  don't add a cache layer without a concrete reason (e.g. the engine itself becoming expensive).

**One custom entity per result shape** (10 total — KPI, Quality, Ratio, Trend, VendorTop10,
PlantTop10, MaterialTop20, DoctypeRanked, MaterialRejWorst10, VendorScorecard), matching
`ty_dashboard`'s 10 sub-tables 1:1. Each is `STRUCTURE + parameters` only (no `SelectFrom` — the
data is computed in ABAP), with `@ObjectModel.query.implementedBy` delegating to its own query
provider class.

**All 10 entities share the same 6 parameters**: `P_DateFrom`, `P_DateTo` (obligatory, data
element `zmm_grn_dash_date`), and `P_Vendor` / `P_Material` / `P_Plant` / `P_DocType` (optional,
data element `zmm_grn_dash_flt`, comma-separated multi-value strings — blank = all, matching
`default_filters( )`). Parameters **must** reference DDIC data elements, not inline built-in
types (`dats`, `abap.char(1000)`) — using the built-ins compiles and activates fine, but Service
Binding creation then fails with `Parameter P_XXX has no data type` for every parameter on every
entity (ADT/RAP limitation on custom-entity `with parameters` typing, not specific to this
dashboard). Two Z data elements cover all 6: `zmm_grn_dash_date` (built on `DATS`, length 8) and
`zmm_grn_dash_flt` (built on `CHAR`, length 1000) — create both in SE11/ADT **before** the 10
custom entities. These are
modelled as **parameters, not `$filter`**, because they scope the *whole* computation (every
KPI/ratio/chart derives from the same filtered base/reversal/rework extraction) — unlike MB5B's
`$filter` on `matnr`/`werks`, which worked because those are real output columns on the entities
being filtered. Most of these 10 entities (KPI, Ratio, Quality, Trend in particular) carry no
vendor/material/plant/doctype column of their own, so `$filter` on those properties isn't even
possible; parameters are the only mechanism that reaches "filter everything that feeds this
entity," which is what the FS's Vendor/Material/Plant/PO Doc. Type filters actually need to do.

Each query provider class is a **thin shell** (mirrors `ZCL_CV_AGEING_CUST_QRY` almost exactly):
read the 6 parameters → split the 4 CSV strings into `'I'/'EQ'` ranges via a private
`csv_to_range( )` helper (`RANGE OF MATNR` — the widest of the four domains — then
`CORRESPONDING #` converts into whichever specific range type `ZCL_GRN_DASH_QUERY=>ty_filters`
expects for that dimension) → call `get_dashboard_data( )` → map its own sub-table into the
entity's `VALUE #( FOR ls IN ... )` → `$count` → `$skip`/`$top` → `set_data( )`. No entity depends
on another's query provider; build order among the 10 doesn't matter.

### Build order (ADT)

1. Confirm Phase 1 is already activated and `ZMM_GRN_DASH_TEST` reconciles against
   `ZMM_PO_HISTORY_VER2` — **do this before any OData work**, same rule as CV Ageing.
2. Create the two DDIC data elements the parameters need: `zmm_grn_dash_date` (`DATS`, 8) and
   `zmm_grn_dash_flt` (`CHAR`, 1000). Must exist before step 3 — see the parameter-typing note
   above.
3. Create the 10 `ZMM_GRN_DASH_*` custom entities (any order).
4. Create the 10 `ZCL_GRN_DASH_*_QRY` classes (any order) — each references exactly one entity
   and `ZCL_GRN_DASH_QUERY`, nothing else.
5. Create `ZMM_GRN_DASH_O4` service definition.
6. New ▸ **Service Binding** ▸ type **OData V4 - UI**, reference `ZMM_GRN_DASH_O4`, activate,
   **Publish**.

### Test the OData

Parameters are passed in the entity-set path (custom entity with parameters), same style as CV
Ageing:
```
.../KPI(P_DateFrom=2026-01-01,P_DateTo=2026-07-28,P_Vendor='',P_Material='',P_Plant='',P_DocType='')/Set
.../VendorTop10(P_DateFrom=2026-01-01,P_DateTo=2026-07-28,P_Vendor='',P_Material='',P_Plant='',P_DocType='')/Set?$orderby=Value desc
.../Trend(P_DateFrom=2026-01-01,P_DateTo=2026-07-28,P_Vendor='V001,V002',P_Material='',P_Plant='',P_DocType='')/Set?$orderby=Period
```
Use the Service Binding **Preview**, or the V4 service-test in `/n/IWFND/V4_ADMIN`.

### Things to verify / tune in your system

- **Parameter-reading API** in the `*_QRY` classes: the loop reads `parameter_name` / `value` —
  if your release names the component `name` instead, swap it (same note as CV Ageing's README).
- **CSV parsing assumption**: `P_Vendor`/`P_Material`/`P_Plant`/`P_DocType` are parsed as a plain
  comma list with `CONDENSE` per token (no escaping) — fine for vendor/material/plant/doc-type
  codes (no commas in the values themselves), but don't reuse `csv_to_range` for free-text.
  `abap.char(1000)` should comfortably hold a large multi-select (e.g. ~90 four-char plant codes)
  — widen it if a real selection ever needs more.
- **No `$top` ceiling risk** (unlike MB5B's documented open problem): every one of these 10
  result sets is pre-aggregated and capped at source (max ~20 rows, per FS section 12's NFR), so
  the plain `$skip`/`$top` handling here needs no special-casing.
- **`RANGE OF MATNR` in `csv_to_range`**: chosen because it's the widest of the four filter
  domains (`lifnr` 10 / `matnr` 40 / `werks_d` 4 / `esart` 4 chars) and already used elsewhere in
  this codebase (`ty_range_matnr`) — `CORRESPONDING #` narrows it into the specific range type
  per dimension at the call site. Real values in any of the four filters are well within 40
  chars, so this doesn't truncate in practice.
- **30-character ABAP object name limit**: four of the query provider classes (and one custom
  entity) originally combined `ZCL_GRN_DASH_`/`ZMM_GRN_DASH_` with a long descriptive suffix and
  `_QRY`, landing at 31–37 characters — over the limit. Shortened to fit: `MATERIAL` → `MAT`,
  `WORST10` → `W10`, `RANKED` → `RANK`, `SCORECARD` → `SCORE` (only on the class, since the
  entity `ZMM_GRN_DASH_VENDOR_SCORECARD` itself is already within limit at 29 chars). The one
  entity that also needed shortening is `ZMM_GRN_DASH_MAT_REJ_WORST10` (was
  `..._MATERIAL_REJ_WORST10`, 33 chars) — its exposed OData name (`MaterialRejWorst10`) is
  unaffected, only the underlying technical/repository name changed.

## Phase 3: what the front end assumes

The SAPUI5 app lives in [`zmm_grn_dash/`](zmm_grn_dash/) and is documented in
[`webapp_README.md`](webapp_README.md). Only the parts that constrain the `ABAP NEW/` folder are
recorded here — change any of them and the front end breaks.

**The iframe/postMessage bridge described in earlier drafts of this file was not built.**
This README previously nominated a SAPUI5 shell hosting `GRN Dashboard v2.dc.html` in an
`<iframe>`. The app instead reproduces the prototype as native UI5 controls with Apache
ECharts (vendored into `webapp/libs/`) rendering into custom `EChart` controls in the same
document. Nothing in the prototype needed a second document — only ECharts, which runs fine
in a UI5 control — and the iframe would have added a hand-rolled message protocol as the
only route for filter state, a second document to authenticate and theme, and no Launchpad
integration for the filter bar. `zmb5b_dash` (Material Stock) is therefore **no longer the
structural reference**; `zmm_grn_dash` is its own pattern and is the one to copy for the
next dashboard.

**The contract the front end depends on:**

- **The parameter path shape** documented under "Test the OData" above is exactly what
  `webapp/model/dashboardService.js` builds — `Edm.Date` parameters unquoted, the four
  filter strings single-quoted, always ending in `/Set`. That function is the single place
  it is assembled, so a backend parameter rename is a one-file change on the UI side.
- **All ten entities are read on every refresh**, in one `$batch`. There is no partial or
  lazy loading, so the "no caching layer" decision above means
  `ZCL_GRN_DASH_QUERY=>get_dashboard_data( )` runs **ten times per dashboard load**. That is
  the accepted design (the engine computes directly from CDS views, with no report
  re-execution to amortise), but it is also the first thing to look at if load time becomes
  a complaint — and the point at which a cache would earn its keep.
- **Field names are consumed literally.** Renaming an entity property (the
  `label` → `KpiLabel` / `value` → `RatioValue` reserved-word fixes, for instance) requires
  the matching edit in `dashboardService.js`'s `$select` lists and in
  `webapp/model/chartOptions.js`.
- **Two ID sets are treated as a stable contract**, because the UI keys card metadata off
  them rather than depending on row order:
  - `KPI.ID` — `GRN_QTY`, `GRN_VALUE`, `NET_QTY`, `NET_VALUE`
  - `Ratio.ID` — `REJ_RATE`, `RWK_RATE`, `NET_RATE`, `AVG_VALUE`

  An unexpected extra ID renders with neutral defaults rather than breaking, but a *renamed*
  one loses its movement-type badge, unit and formatting. `AVG_VALUE` in particular is
  formatted as currency while the other three ratios are formatted as percentages.
- **`Quality.Bucket` texts are also keys**: `Accepted`, `Rejected`, `Sample`,
  `Rework GRN Qty` drive the bucket colours and movement-type badges. Note the asymmetry
  with `PlantTop10`, which has an `InspectPct` (under inspection) that the `Quality` buckets
  do not — the front end renders both as-is; it is a contract quirk, not a UI bug.
- **`Trend.Period` is assumed to be `YYYYMM`**, rendered as "Apr 26". A different format
  falls back to displaying the raw string.
- **`Qty102`/`Val102` must stay signed negative.** The trend chart stacks them against the
  101 bars so the reversal hangs below the axis; the UI does not call `abs()` on them.
- **No value-help entity sets exist**, so the four code filters in the UI are free-text with
  suggestions harvested from whatever rows the current selection returned. If proper F4 is
  wanted, that is a backend addition to `ZMM_GRN_DASH_O4` (value-help entities, or exposing
  standard `I_Supplier`/`I_Product`/`I_Plant`), listed as open item 1 in the app's README.

## Key design decisions already made (don't re-litigate without reason)

- **No authorization-object checks** (`M_BEST_EKG`/`M_BEST_WRK`). Access is Fiori Launchpad
  role assignment only — the dashboard is restricted to a small, named group of users. Confirmed
  with the business owner (see FS section 8).
- **STO exclusion list**: `UB, ZP04, ZP05, ZP22, ZP23` excluded by default; `ZP03` stays
  selectable. Applied unconditionally in `apply_sto_exclusion`, on top of whatever the caller's
  own doc-type filter contains.
- **KPI 4 "Quality Rejected" is movement type 101 only**, not 101+102. Confirmed with the
  business owner: a 101 line can only be reversed via 102 *before* a quality decision is posted —
  the system blocks cancellation once a UD exists — so an already-Rejected/Accepted line can
  never carry a 102 to net out.
- **Vendor Quality Score weights are final, not illustrative**: `100 - (Rejection Rate x 9) -
  (Rework Rate x 1.6)`, clamped [0,100]. Confirmed with the business owner, same values the HTML
  prototype (`GRN Dashboard v2.dc.html`) already uses.
- **Rework has no cancellation.** Confirmed with the business owner: a Z22 rework issue is never
  reversed, so there is no Z23 movement type anywhere in this design. `ZMMD_GRN_MVT_CDS` is a
  single `SELECT` (102 + Z22 only, no `UNION ALL`), and rework quantity/value always *adds* — no
  netting logic in `period_totals`/`get_trend`/`get_vendor_agg`. This superseded an earlier draft
  that modelled Z23 via a validated storno-linkage `UNION ALL` branch.
- All of the above were open items in an earlier FS draft or requirement; they are now resolved
  in the FS and should not be re-asked.

## Open items / assumptions still needing verification

1. **Data-element types** used throughout the class/views (`menge_d`, `dmbtr`, `lifnr`,
   `werks_d`, `esart`, etc.) were inferred from the reviewed CDS views, not confirmed against a
   live DDIC. Expect minor retyping on import.
2. **`ZMM_GRN_DASH_TEST.prog.abap`'s SELECT-OPTIONS** are declared against a placeholder type
   (`MKPF-USNAM`) so the file has no compile-time DDIC dependency while drafted outside a system —
   retype to `LIFNR`/`MATNR`/`WERKS_D`/`ESART` on import (noted in the report's own header too).
3. A local ABAP static analyzer in this environment flagged a long tail of **purely cosmetic,
   and in places self-contradictory, style issues** on `ZCL_GRN_DASH_QUERY` (e.g. one rule
   demands `lv_`/`lt_`/`ls_` prefixes on locals, another flags those same prefixes as "hungarian
   notation"; several "align TYPE/parameters to column N" notices). These were deliberately not
   chased further — run the ABAP Pretty Printer (and whatever your team's actual linter config
   is) after import; that resolves all of them mechanically. All genuine correctness issues it
   raised (missing struct fields, non-ASCII characters, strict-SQL clause ordering, ambiguous
   `DELETE ... FROM n` syntax) were fixed.

## Not in scope for Phase 1/2 (or at all, per the FS)

- The SAPUI5 front end is **Phase 3 and lives in `zmm_grn_dash/`**, not in `ABAP NEW/`.
  Nothing in this folder should acquire a UI dependency.
- Editable "Send to Finance / Receive by Finance" workflow, PJ/invoice tracking, payment-voucher
  tracking, debit-note tracking, GST/tax breakup — out of scope entirely (FS section 2).

## How to pick this back up in a fresh conversation

1. Read `GRN Dashboard FS.md` for the full functional spec (filters, KPI formulas, chart
   specs, business rules).
2. Read this README for the backend (Phase 1 + Phase 2) and what's still open, including
   "Phase 3: what the front end assumes" for the contract the UI depends on.
3. Read [`webapp_README.md`](webapp_README.md) for the Phase 3 front end.
4. **The next step is the first live run**: activate/publish everything per the build order
   above, then `cd zmm_grn_dash && npm install && npm start`. All three phases are written;
   none of Phase 3 has been executed against `vhafbmedap01` yet, so expect the first run to
   surface either authentication/CSP issues or a parameter-path rejection — both are covered
   in the app README's open items.
