# CONTEXT LOG — Plant & Material Wise Sales Dashboard

**Purpose:** compact context-recovery file. Read this first after a `/compact` or a new session
instead of re-reading the 172 KB template. Every fact below was verified against the live SAP
system or the template source on 2026-08-12.

---

## 1. What this project is

A Fiori/SAPUI5 dashboard for **plant- and material-wise sales (billing) analysis** for
**ALIMCO** (government aid/appliance schemes — ADIP etc.), Indian fiscal year (Apr–Mar).

- **Design template (frozen):** `Final Template/sales-dashboard-india_claude V8.html` (172 KB,
  self-contained, Chart.js + inline India SVG, mock data generated in-browser).
- **Old iterations:** `Old Templates/` — V1–V7, superseded. Do not read.
- **`echarts.min.js`** sits at project root but **V8 uses Chart.js, not ECharts.**
- **Current phase:** ABAP backend design. No ABAP objects written yet.

## 2. Reference projects in this workspace (proven patterns — reuse, don't reinvent)

| Path | Why it matters |
|---|---|
| `../GRN Dashboard/ABAP NEW/` | **The architecture to copy.** RAP custom entities + `IF_RAP_QUERY_PROVIDER` query classes + one central compute class + OData V4 service definition. 10 entities, 13 classes. |
| `../GRN Dashboard/README.md` | House documentation style; phase breakdown (P1 backend / P2 OData / P3 UI5). |
| `../Sales Dashboard/ZSDD_CENTER_DASH_CDS.ddls.asddls` | Existing CDS that already joins the ALIMCO sales tables. Closest prior art. |
| `../Sales Dashboard/zsd_zone_dash/` | Existing deployed UI5 app for the sibling zone dashboard. |
| `D:\New\VSCODE_ABAP\Sales Register Optimize\ZFI_SR_NEW_OPT.abap` | **New (2026-08-12), user-supplied.** A different module's (FI Sales Register) report, but it contains the real, working material-level GST condition logic — the exact mechanism `ZSDD_PMS_ITEM_CDS` needs. See §3 `PRCD_ELEMENTS` and **OD-4**. |

## 3. Live SAP data model

> ### ⚠⚠ CLIENT CAVEAT — READ BEFORE TRUSTING ANY NUMBER BELOW ⚠⚠
>
> Everything in this section was read via the ADT MCP on **client 120** of
> `vhafbmedap01.hec.erp.alimco.in` (the only endpoint configured in `~/.claude.json`).
> **Client 120 is nearly empty and is NOT representative.** Per the user (2026-08-12):
>
> | Client | Reality |
> |---|---|
> | **120** | sandbox, very little data — **what was measured below** |
> | **100** | client copy, data only up to May |
> | **PRODUCTION** (separate host, URL not yet known) | **109 plants with invoices in `ZSD_SALE_ALL`** |
>
> **Split the findings accordingly:**
> - ✅ **STRUCTURE IS STILL VALID** — DDIC is cross-client. Table/field lists, key definitions,
>   data grains, and the `category` = scheme mapping hold everywhere. The two traps in §A4 of the
>   plan (GL-grain double-count, YoY truncation) are unaffected.
> - ❌ **ALL VOLUMES AND MASTER-DATA COVERAGE ARE WRONG** — plant counts, the 10-row zone table,
>   the "5 plants missing a zone" gap, and every conclusion that depended on "only 10 plants"
>   (see §6 OD-1 and AD-5) must be **re-measured on production**. This is Phase 0 task **P0-0**.

### `ZSD_SALE_ALL` — "Sale Vs Target", the main fact table
Grain: **GL/accounting-document line**, key = `MANDT, BELNR, GJAHR, HKONT`.

Fields: `gl_desc, vbeln, fkart, vtext, category, cat_desc, type, month_num, zmonth, budat,
netwr, mwsbk, gross, kunnr, kname, werks, vkbur`.

- `category` / `cat_desc` = **the "scheme" dimension** (ADIP, ADIP SSA, …). This is the single
  most important mapping discovery — the template's `SCHEMES` array is real, not invented.
- `netwr` = net, `mwsbk` = tax (actual GST amount), `gross` = net+tax. **Real tax amounts exist**,
  so the template's "derive tax from a per-material-group GST rate" hack is not needed.
- ⚠ **NO `matnr`, NO quantity, NO UOM.** Material/qty must come from `VBRP` joined on `vbeln`.
- ⚠ Grain is GL-account level → **multiple rows per `vbeln`**. Naively joining `VBRP` will
  double-count. **Resolution path decided (2026-08-12):** the user will establish the exact
  material ↔ GL link (via `PRCD_ELEMENTS.sakn1`, see below) rather than relying on an aggregate
  cross-check — see **OD-4** in §6 and Phase 0 check P0-1.

### `PRCD_ELEMENTS` — pricing conditions: the material-tax AND material-GL link (new, 2026-08-12)
Discovered by reading the user-supplied reference program (see §2 table) — a Finance "Sales
Register" report (`ZFI_SR_NEW_OPT.abap`) that already computes real, working material-level GST and
already resolves the exact double-count problem this project has. Two distinct joins matter:

1. **Material → tax, item grain.** `VBRP.knumv_ana` (the item's own pricing/condition document
   number) joined to `PRCD_ELEMENTS` on `knumv = knumv_ana AND kposn = posnr`, filtered to specific
   condition types (`kschl`), `kwert <> 0`, `kstat = ' '` (excludes statistical conditions). This
   gives tax **per billing item** — no `BSEG`/GL involvement at all, so it cannot double-count.
   Condition types seen in the reference program: `JOIG` = IGST, `JOSG` = SGST (CGST is **derived
   as equal to SGST**, not read from a separate condition at item level — standard Indian
   intrastate GST 50/50 split), `JTC1`/`JTC2`/`JTC4` = TCS. (Header/GL-level pull in the same
   program additionally reads `JOCG` and `JOUB`, plus a special `ZS60`/`ZS40` percentage-derived
   bucket — likely scheme-specific; not yet confirmed these apply to ALIMCO's own pricing
   procedure, see P0-9.)
2. **Material → GL, the double-count resolution.** `PRCD_ELEMENTS.sakn1` is the G/L account a
   pricing condition **posts to**. The reference program matches `sakn1 = <posted hkont>` for the
   same `knumv` to tie a specific accounting line back to the condition (and therefore the
   material) that produced it. **This is the link the user will use to resolve Trap 1** — instead
   of an aggregate net-value cross-check (P0-1's original framing), each GL line can be attributed
   to its originating material line directly, so "join and don't double-count" becomes exact rather
   than approximate.
3. **⚠ Known edge case, explicitly handled in the reference program:** a SAP posting error can
   create **two finance documents (`belnr`) for the same invoice line**, so the same
   `vbeln`+`matnr`+`posnr` can legitimately reappear under a different `belnr`. The reference
   program's fix: key the material/tax lookup by `vbeln+matnr+posnr` (never by `belnr`) and never
   mutate that lookup table while processing — so every finance document that maps to the same
   invoice line reads the same correct tax figures. Any `ZSDD_PMS_ITEM_CDS` design must do the same
   (i.e. don't assume a 1:1 `belnr`↔`vbeln+matnr+posnr` relationship).

### `ZSD_CAT_PLANT` — targets
Key-ish: `category, gjahr, werks` → `target`. 120 rows = **8 categories × 15 plants**.
Targets look like **Crores** (values 0.00–60.00). FY 2026 present.
Plants: `2000, 3100, 3200, 3300, 3400, 3500, 3600, 4100, 4200, 4300, 4400, 4500, 4600, 4700, 4800`.

### `ZSD_ZONE_PLANT` — zone + unit + city master
Key `werks` → `alm_zone`, `unit`, `remarks` (= **city name**).

- **`unit` (new, per user 2026-08-12):** groups multiple plants under one organizational **Unit**.
  Production has **18 Units** total. Not yet re-read live (see caveat below) — the client-120
  sample pulled for this log predates the `unit` field being flagged, so it isn't shown in the
  table below. **Phase 0 check P0-7** confirms the column, the distinct-18 count, and that every
  billing plant maps to a unit.
- 18 Units is the right grain for **map dots** (see AD-5) — small enough to hand-geocode like the
  original 10-plant approach, but far more granular than the 36-state fallback.
- **Latitude/Longitude fields — decided 2026-08-12 (OD-5), supersedes hand-geocoding.** The user
  will add **two new fields to `ZSD_ZONE_PLANT`** (per-plant, business-maintained via table
  maintenance/user access) rather than shipping a frontend-hardcoded geocode table. See OD-5 in §6
  for how this changes the map-dot design.

⚠ **The 10 rows below are client 120 only.** Production has ~109 billing plants, so this table is
expected to be far larger there (or to be incomplete — that is itself a P0-0 finding). Treat the
list as a *sample proving the table's shape*, not as the plant population.

| Plant | Zone | City |
|---|---|---|
| 2000 | CENTRAL | Kanpur |
| 3100 | CENTRAL | Jabalpur |
| 3200 | SOUTH | Bengaluru |
| 3300 | WEST | Ujjain |
| 3400 | EAST | Bhubaneswar |
| 3500 | NORTH | Mohali |
| 3600 | NORTH | Faridabad |
| 4200 | EAST | Kolkata |
| 4300 | SOUTH | Hyderabad |
| 4500 | WEST | Mumbai |

- Zones = `CENTRAL, EAST, NORTH, SOUTH, WEST` — **exactly** the template's `ZONE_ORDER`. ✅
  *(This one holds — it is a domain value list, not a data volume.)*
- ⚠ Plants `4100, 4400, 4600, 4700, 4800` exist in `ZSD_CAT_PLANT` but have no zone/city row **on
  client 120**. `ZSDD_CENTER_DASH_CDS` left-outer-joins this table, so they return blank zone.
  **Probably a client-120 artifact — re-check on production before raising it with the business.**
  The left-outer-join risk is real regardless: any plant missing here yields a blank zone.

### Other confirmed objects
- `ZPMDK_PLANT` — `center_plant` → `pmdk_plant` mapping (used by the existing center dashboard).
- `ZSDD_CENTER_DASH_CDS` — joins `zsd_cat_plant` + `zpmdk_plant` + `zsd_sale_all` + `vbrk` +
  `zsd_zone_plant`. Has a commented-out `union all` branch for CENTER plant data.
- `ZSDD_DASH_TARG.ddls.asddls` — target view, in `../Sales Dashboard/`.

## 4. Template V8 inventory (what the backend must feed)

**Filters:** FY **picker** (single-select, same visual pattern as Region/Plant/Material — decided
2026-08-12, supersedes the original segmented-button row; defaults to whichever FY contains
today's date, computed, not hard-coded) · Region (zone + state multi-select) · Plant (multi) ·
Material (multi, searchable) · Month (12 FY periods) · Date range (from/to) · Scheme (by clicking
scheme rows) · filter chips + "Reset all".
*(Building the FY picker surfaced that the template's Month and Date-range picker buttons had no
open/close handler at all — dead UI in the original file, fixed as part of the same change since
it reuses the identical open/close mechanism.)*

**Panels:**
1. **4 KPI cards** — Total net value · Total tax (GST) · Total gross value · **Yesterday Sale**
   (**OD-1c, supersedes OD-1b** — see §6). Each has a YoY delta and a 12-period sparkline (sparkline
   for card 4 is TBD, see OD-1c).
2. **India choropleth map** — value by state *or* zone (granularity toggle), 5-bin quantile color
   scale, **Unit dots** at lat/lon (toggleable, **OD-3**, supersedes AD-5's plant-dot framing),
   click a state to filter.
3. **Scheme performance** — one row per scheme (value, % of India, invoice count, YoY %),
   clickable to filter. Plus a **Top 8 states** list with zone color + YoY.
4. **Sales by plant** — Top 20, horizontal **stacked Net + Tax = Gross** bars, scrollable, click
   to filter.
5. **Sales by material** — Top 20 vertical bars, **Value / Quantity toggle**, credit memos
   excluded (`type==='F2'` only), click to filter.
6. ~~**CSV export** — 21-column invoice-line dump.~~ **DROPPED** (OD-2, not required).
7. Last-refresh stamp.

**YoY logic (important, non-obvious):** the prior-FY comparison is *same-periods-to-date* — it
truncates the prior year at the same period **and same day-of-month** as the latest current-year
data (`recompute()`, template ~line 608). Replicate this, don't just compare full years.

## 5. Architecture decisions taken

- **AD-1** Copy the GRN Dashboard RAP pattern: core CDS fact views → one central ABAP compute
  class → thin per-entity `IF_RAP_QUERY_PROVIDER` classes → OData V4 service.
- **AD-2** Filters travel as **CDS entity parameters** (not `$filter`), exactly as GRN does,
  because they scope the whole computation and most entities carry no such column.
- **AD-3** All aggregation moves **server-side**. The template's "hold every row in the browser
  and filter in JS" model cannot survive real volumes.
- **AD-4** Naming prefix `ZSD_PMS_*` (entities) / `ZCL_PMS_*` (classes) / `ZSDD_PMS_*` (CDS
  views), package `ZSD`.

## 6. Decisions (settled 2026-08-12)

- **OD-1 — map geography = PLANT state.** ✅ *Decided by user.* The choropleth is keyed on the
  plant's own state (`T001W.regio` → `T005U` for the text). No customer-master join.
  **This decision is now BETTER than when it was made.** It was taken on the belief that only ~9
  states would ever colour; with **109 production plants** the plant-state choropleth will show
  genuine national spread, so the "mostly grey map" objection is **withdrawn**.
- **OD-1b — 4th KPI = "Geographic reach X/36 states"** (the template's original). ✅ *Decided by
  user, 2026-08-12, morning.* ⚠ **SUPERSEDED same day by OD-1c below** — do not implement this one.
  Kept here only for the paper trail: reinstated once because ~109 plants made it meaningful;
  Source was `count distinct` state over `T001W.regio`, sub-line = plant count + invoice count.
- **OD-1c — 4th KPI = "Yesterday Sale"** (replaces Geographic reach; supersedes OD-1b). ✅ *Decided
  by user, 2026-08-12, afternoon.*
  - **Default (selected period = current calendar month):** value = sum of net/gross for
    `budat = today − 1`.
  - **Selected period ≠ current calendar month (a past month picked via the Month/FY filter):**
    value = sum of net/gross for `budat` = the **last calendar day of that selected month**.
  - Card shows the value plus a YoY delta (same date, prior FY) — same-day comparison, not the
    panel-wide same-periods-to-date truncation in §A4 Trap 2, since this KPI is a single-day
    snapshot, not a period total.
  - ⚠ **Open question, non-blocking:** if the target day has zero postings (holiday, month-end
    cutoff timing), does the card show ₹0 or fall back to the nearest prior posting day? Assumption
    for v1: show the literal day's total, ₹0 included — confirm with business if it looks wrong in
    testing.
  - `T001W`/`T005U`/state-count logic from OD-1b is **dropped from the KPI entity** — the map panel
    (#2) still uses plant/state geography independently, unaffected by this change.
  - `ZSD_CAT_PLANT` targets remain out of scope for v1 (unchanged from OD-1b's note).
- **OD-2 — CSV export = DROPPED.** ✅ *Decided by user — not required.* The `ZSD_PMS_LINES`
  line-level entity is therefore out of scope, taking the entity count from 11 to 10. If
  row-level drill-down is ever wanted, that entity is the place to revive.
- **AD-5 — Plant map dots: ⚠ SOLUTION INVALIDATED by the 109-plant correction, then SUPERSEDED by
  OD-3 (Unit dots).** Original problem: [`plant_geo.js`](plant_geo.js) hard-codes **10** plants,
  which does not scale to 109, and `INDIA.cityLL`'s 147 mock industrial cities don't cover real
  ALIMCO plant cities. Three options were drafted (state-centroid / city-geocode / lat-lon column)
  — see **OD-3** below for the option that was actually picked.
  *(What remains verified regardless of granularity: `projLL()` reproduces `INDIA.cityXY` exactly,
  the template embeds `INDIA.cityLL`/`cityXY`/`proj`/`projLL()` at ~line 451, and lookups must key
  on a coded field — `werks` or now `unit` — never on `ZSD_ZONE_PLANT.remarks`, which is free text
  where one spelling variant would silently drop a dot.)*
- **OD-3 — Map dots keyed on `unit`, not `werks`.** ✅ *Decided by user, 2026-08-12.*
  `ZSD_ZONE_PLANT` carries a **`unit`** field (18 distinct values in production, per the user —
  pending live confirmation, **P0-7**); each Unit groups multiple plants. This lands squarely
  between the two extremes AD-5 was choosing between: **finer than the 36-state centroid fallback,
  coarse enough (18) to hand-geocode exactly like the original 10-plant approach did.**
  - Aggregate sales to `unit` (not `werks`) before plotting; one dot per unit, radius `f(value)`.
  - Coordinates: pick a representative city per unit (e.g. its largest/HQ plant's city from
    `remarks`) and geocode those ≤18 cities once, the same way Jabalpur/Ujjain/Mumbai were added
    to `cityLL` for the old 10-plant set. Ship as frontend config, same pattern as before.
  - Any plant with no `unit` assigned (mirrors the old zone-less-plant gap) has no dot —
    `unitDots()` should warn and omit, not crash, same as the old `plantDots()` contract.
  - The **"Sales by plant" bar panel (#6 in the inventory)** is unaffected — it stays at plant
    grain. Only the **map dots** move to Unit grain.
  - `ZSD_PMS_GEO` (or a sibling entity) must expose `unit` + aggregated value instead of `werks` +
    value for the dot layer specifically.
- **OD-5 — Unit dot coordinates sourced from 2 new `ZSD_ZONE_PLANT` fields, not hand-geocoding.**
  ✅ *Decided by user, 2026-08-12.* Supersedes OD-3's "hand-geocode ≤18 unit cities, ship as
  frontend config" plan. The user will add **latitude/longitude fields directly to
  `ZSD_ZONE_PLANT`** (per plant, business-maintained — end users can enter/correct coordinates via
  table maintenance, no redeploy needed to fix a wrong dot). This is AD-5's original "option 3"
  (business-maintained, transportable, correct long-term), now actually being built.
  - Coordinates are **per plant** (the table's grain), but dots are **per unit** (OD-3) — so the
    backend must still derive one representative point per unit from its member plants' lat/lon.
    ⚠ **Not yet decided which derivation rule** — candidates: (a) value-weighted centroid of member
    plants for the active filter context (dot visually tracks where the money is, mirrors what the
    mock HTML template does today), (b) simple unweighted centroid (simplest, but can land on a
    geographically meaningless point for a spread-out unit), (c) a single designated "anchor"
    plant per unit (needs a business-assigned flag, most stable visually). Recommend (a) for v1;
    confirm with user before building `ZSD_PMS_GEO`'s unit-dot query.
  - Plants with no lat/lon populated: exclude from the centroid calculation (don't let a missing
    value silently drag the average to 0,0). If **every** member plant of a unit is missing
    coordinates, that unit's dot is omitted — same "warn and omit, don't crash" contract as OD-3.
  - This removes the earlier plan to geocode a handful of unit-HQ cities and ship them as frontend
    config — coordinates now flow from the backend like every other field, which also means they
    can be corrected in production without a UI5 redeploy.
- **OD-4 — Material & tax CDS view sourced from `PRCD_ELEMENTS` via `VBRP.knumv_ana`.** ✅ *Decided
  by user, 2026-08-12*, based on the reference program `ZFI_SR_NEW_OPT.abap` (see §2, §3). Replaces
  the plan's earlier fallback ("derive tax from `MARA.matkl`" in `ABAP_Backend_Plan.md` §A2) with
  real, condition-based, per-material tax — see the full mechanism under §3 `PRCD_ELEMENTS` above.
  Also supplies the resolution mechanism for the double-count trap (**Trap 1**, §A4 of the plan) via
  `PRCD_ELEMENTS.sakn1` ↔ posted `hkont` — **this is now the user's own action item**, not an open
  project risk: confirm condition types against ALIMCO's pricing procedure first (**P0-9**, since
  the reference program is from a different module/company code and condition types are
  configuration-specific), then build `ZSDD_PMS_ITEM_CDS` on top.
- **OD-6 — Real `GJAHR` fiscal-year convention confirmed live: named by the STARTING calendar
  year, not the ending one.** ✅ *Confirmed by user via live ADT debugger, 2026-08-13.* Apr
  2026–Mar 2027 is **FY 2026** in the real system (period 05 = Aug 2026), not "FY 2027" as the
  frozen HTML template displays it (`FYS=[2025,2026,2027]`, `currentPeriodInfo()` labels the same
  period "2027"). The two conventions are opposite: template = ends-in year, real `GJAHR` =
  starts-in year. `ZCL_PMS_DASH_QUERY` now uses the real convention throughout
  (`current_period_info`, `period_end_date`, `get_gl_rows`, `get_gl_rows_prior`, `get_item_rows` —
  fixed 2026-08-13) since it queries the real tables directly. **Open point, deferred to Phase
  3:** the UI5 frontend's FY picker will need to either relabel to match the real value (simplest —
  show "2026", not "2027", for the current year) or keep a friendly display label while translating
  to the real `gjahr` value before calling the backend. Do not port the template's FY arithmetic
  as-is into UI5 without applying this fix.
- **OD-7 — `ZSD_SALE_ALL.month_num` is the plain calendar month, not an FY-shifted period.** ✅
  *Confirmed by user against the Phase 1 test report's real output, 2026-08-13* — the trend showed
  periods `04..08` with `08` (the smallest, most partial value) landing on August, the actual
  current month; under the "Apr=1" assumption period 08 would be November, a future month that
  can't have data yet. So `month_num` is `04=Apr .. 12=Dec, 01=Jan .. 03=Mar`, matching plain
  calendar-month notation, while every other FY-period value in this class (`ty_period`,
  `current_period_info`'s `ev_period`, `period_end_date`'s `iv_period`) is `Apr=1 .. Mar=12`. Left
  unconverted, this breaks two things: `get_trend`'s `SORT ... BY period ASCENDING` would put a
  future Jan/Feb/Mar (`01-03`) *before* the current FY's Apr-Dec (`04-12`) instead of after, and any
  month-picker filter would be off by a 3-month shift. **Fixed 2026-08-13**: two new converters,
  `ZCL_PMS_DASH_QUERY=>month_to_period`/`period_to_month`, with the single point of conversion in
  `get_gl_rows` — the `WHERE month_num IN ...` predicate is translated to real calendar months
  before hitting the CDS view, and every fetched row's `month_num` is re-expressed as an FY-period
  immediately after, so `get_trend`, `compute_truncation`, and `get_gl_rows_prior` (which calls back
  into `get_gl_rows`) all inherit correct FY-period values without needing their own changes.
- **OD-8 — The real join from `ZSD_SALE_ALL` to `ZSD_ZONE_PLANT` is on `VKBUR` (sales office), not
  `WERKS` (billing plant).** ✅ *Corrected by user directly in `ZSDD_PMS_GL_CDS.ddls.asddls`,
  2026-08-13.* `ZSD_ZONE_PLANT.WERKS` (despite the name) holds one row per **Unit**, not per
  billing plant — multiple billing plants share one `VKBUR`, and that's the real Unit-grouping key.
  The Phase 1 draft had originally guessed `b.werks = a.werks` (plant-to-plant); the view now reads
  `b.werks = a.vkbur`, and `A.VKBUR` is no longer exposed as its own output column (it was only ever
  needed as the join key — `unit` already comes out as `b.werks`). This also retires the now-dead
  `vkbur` field that had been sitting unused in `ZCL_PMS_DASH_QUERY`'s `ty_gl_row` (removed
  2026-08-13 — it was never in `get_gl_rows`' SELECT list once the view stopped exposing it). Updates
  **P0-7**'s wording too: the coverage check is "every billing `VKBUR` maps to a Unit," not `WERKS`.
  - **Corollary, found via user review 2026-08-13: Plant↔Unit is many-to-many, not one-to-many.**
    One billing plant (`WERKS`) can invoice under more than one sales office (`VKBUR`), so the same
    plant can legitimately feed **more than one** Unit — Units don't cleanly partition the 109
    plants into 18 disjoint groups. This had broken `get_unit_dots`' Step 1, which grouped
    `it_curr` by `werks` alone: a plant's first-seen row pinned it to one unit, and every later row
    from that same plant — even one carrying a genuinely different `unit` — silently added its value
    into that same (wrong) bucket. **Fixed 2026-08-13**: the grouping key is now `werks + unit`
    together, so a plant contributing to two units now correctly shows up (and is counted) in both.
- **OD-9 — Trap 2's same-periods-to-date cutoff is TODAY's (period, day), not derived from the
  fetched data.** ✅ *Found via user review, 2026-08-13.* `compute_truncation` previously scanned
  `it_curr` for its own latest (`month_num`, day) row and used that as the truncation cutoff for
  the prior-year comparison. That's fragile: if recent postings lag (**P0-8**, already an observed
  risk), the newest row present sits before today, and both years get silently truncated earlier
  than intended; a stray future-dated correction could push it the other way. Since FY-periods are
  already numbered identically in both years (Apr=1), comparing "today's period/day" against "the
  same period/day last year" is correct on its own, with no data lookup needed — the only wrinkle,
  Feb 29 in a non-leap prior year, is harmless for a `<=` day cutoff (a 28-day February is never
  excluded by `day <= 29`; contrast the OD-1c daily KPI's *exact*-date lookup, which genuinely needs
  `shift_calendar_year`'s Feb-29 fallback). **Fixed 2026-08-13**: `compute_truncation` now derives
  the cutoff from `current_period_info` when the selected FY is the current one, and applies no
  truncation at all (full FY vs. full prior FY) when a past, already-closed FY is selected — the
  previous data-scan approach truncated even closed-year comparisons, which was never intended.
  This also dropped the now-unused `it_curr` parameter from `compute_truncation` and
  `get_gl_rows_prior`.
  - **Follow-up, same day: push the cutoff into the SQL `date_to`, don't post-filter in ABAP.**
    Since the cutoff is now a deterministic `(period, day)` known *before* fetching, `get_gl_rows_
    prior` no longer fetches the full prior FY and loops over it to drop rows past the cutoff — it
    computes the exact prior-year cutoff *date* and passes it as `date_to`, so `get_gl_rows`' own
    `WHERE budat BETWEEN ...` does the truncation directly. Needed one new primitive,
    `period_day_date( iv_fy, iv_period, iv_day )` — `period_end_date` generalized to an arbitrary
    day-of-month (clamped to the real last day, so it doubles as `period_end_date` with
    `iv_day = 31`), since the existing helper only ever computed a month's *last* day.

- **OD-10 — State is the UNIT's own, falling back to the billing plant's.** ✅ *Decided 2026-08-18,
  revised the same day after production evidence.* Numbered **10, not 9** — OD-9 above is already
  the Trap-2 cutoff decision; both were briefly labelled OD-9 in the ABAP comments and that has
  been corrected. Every geography field on `ZSDD_PMS_GL_CDS` except one came from `A.VKBUR` (zone,
  Unit, city, dot lat/lon); `REGIO` alone came from `A.WERKS`. Those two keys are independent
  (**OD-8**'s corollary: plant↔unit is many-to-many), so a document billed by one plant and sold
  through another Unit landed its state in a zone it had nothing to do with. **Measured in
  production 2026-08-18: the East zone reported 38 billing plants across 14 states for its 5
  units** — which painted Uttar Pradesh and Karnataka as East on the choropleth and made a
  `Zone = East` filter shade half the country.
  - **Taking the unit's state *alone* was tried first and reverted by the user — correctly.**
    `VKBUR` only began this fiscal year (see **OD-12**), so FY 2025 rows mostly carry a blank one.
    Those rows would have lost their state outright and dropped off the map, taking every
    prior-year state comparison with them.
  - **The shipped form is a COALESCE fallback**: `T001W`/`T005U` are joined twice, once on
    `B.WERKS` (the Unit) and once on `A.WERKS` (the billing plant), and the SELECT list takes
    `coalesce(c.regio, e.regio)` / `coalesce(d.bezei, f.bezei)`. Both joins are plain
    field-to-field so no expression sits in an ON condition. FY 2026 rows become consistent with
    the zone and dot beside them; FY 2025 rows stay exactly where they are today.
  - **It also de-risks the join itself.** `ZSD_ZONE_PLANT-WERKS` is misleadingly named — it holds
    one row per *Unit*. If it turns out not to resolve in `T001W` at all, `C.REGIO` is simply
    always null and every row falls back to the billing plant, i.e. the behaviour before this
    change. The failure mode is "no improvement", not "empty choropleth".
- **OD-11 — Map zone comes from `ALM_ZONE`, not from a geographic table.** ✅ *Decided 2026-08-18.*
  The map took each state's zone from a hardcoded geographic lookup in `IndiaMap.js`, so ALIMCO's
  own `ALM_ZONE` — the field the Zone *filter* has always matched on — could not reach the screen.
  2000 HQ sits in Kanpur but is assigned to Central; the map insisted on North. Zone now comes from
  the row's own `AlmZone`, so filter and display agree. `formatter.zoneKey( )` trims and title-cases
  it, folding hand-typed variants (`"WEST"`, `"south "`) onto one key while passing an unrecognised
  code such as `"Z1"` through as its own labelled zone rather than blanking it. Zone granularity now
  draws **one path per zone** — its member states' subpaths concatenated, stroked in its own fill —
  so a zone reads as one region; the prototype's five preset zone outlines are gone, being
  geographic unions that cannot describe a Central reaching to Uttar Pradesh.
- **OD-12 — Growth indicators are suppressed for FY 2026 under any scope filter, and removed
  outright from the Yesterday card and the map hover.** ✅ *Root cause found by the user,
  2026-08-18.* The sales-office (`VKBUR`) concept only started in FY 2026, so most FY 2025 rows
  carry a blank one → a null zone → excluded by any `ALM_ZONE IN` predicate. Filtering by zone
  therefore compared a nearly-full current year against a nearly-empty prior one, producing
  five-digit percentages. `pct( )` itself was verified correct against the ABAP debugger
  (`IV_PART = 385,019,754.54`, `IV_WHOLE = 2,105,569.94` → +18285.8%) — the arithmetic was fine,
  the prior base was not.
  - **The rule** (`_deltasUnreliable( )`, `VKBUR_FIRST_FY = 2026`): hide every pill when the
    selected FY **is 2026** *and* at least one of `zone / state / plant / scheme / material /
    period` is set. Fiscal Year is deliberately **not** one of those — an FY-only view totals both
    sides including the blank-`VKBUR` rows, so its comparison is sound. **This expires on its own**:
    FY 2027 compares against FY 2026, which has `VKBUR` throughout.
  - **The Yesterday Sale card never shows a pill at all**, in any year — a single day against a
    single day a year earlier is noise, not a trend.
  - **The map hover card was cut to gross / net / tax**, dropping its growth, share-of-India,
    plants-billing, invoice and prior-FY rows, and the plant/state counts in its header. This made
    `IndiaMap`'s `deltaVisible` and `priorFyLabel` properties dead; both were removed along with
    the per-zone `prior`/`plants`/`invoices`/`states` accumulators and the share denominator.
    `deltaVisible` still does real work on `KpiCard` and `SchemeList`. The i18n entries for the
    removed rows are deliberately left in the bundle so restoring one stays a one-line change.
- **OD-13 — FY selector floored at `VKBUR_FIRST_FY`; only FY 2026 onward is offered.** ✅ *Decided
  2026-08-22.* `_fyOptions( )` used to offer the current fiscal year and the two before it
  unconditionally. Every year before `VKBUR_FIRST_FY` (2026) has no sales office on its billing
  (OD-8, OD-12), so it cannot be grouped or filtered by zone at all — offering it in the picker
  invited a selection the dashboard could never render correctly. `_fyOptions( )` now filters the
  same `[iCurr, iCurr-1, iCurr-2]` candidate list to `fy >= VKBUR_FIRST_FY`, so FY 2025 and earlier
  simply do not appear. The list widens back to three years on its own once FY 2028 makes FY 2026
  the third year back, at which point every offered year has VKBUR throughout.
- **OD-14 — growth pills suppressed for FY 2026 unconditionally, not only under a scope filter;
  supersedes OD-12's rule.** ✅ *Decided 2026-08-22.* OD-12 hid the pills only when FY 2026 was
  selected together with a scope filter (zone/state/plant/scheme/material/period), reasoning that
  an FY-only view totals both years' rows including the blank-VKBUR ones, so the comparison stayed
  sound. Revisited: the FY 2025 comparison base is unreliable regardless of whether a filter
  narrows it — the same missing-VKBUR rows sit in the total either way, just uncounted rather than
  excluded, and the base is still mostly missing the field the rest of the dashboard groups by.
  `_deltasUnreliable( )` now returns true for FY 2026 outright; `SCOPE_FILTERS` is deleted as dead
  code. FY 2027 onward is unaffected either way — VKBUR covers FY 2026 throughout, so the
  comparison base is sound and deltas show normally. The scheme panel's subtitle follows the same
  switch: "Gross value by scheme" (i18n `schemeNoVs`) when deltas are unreliable, "Gross value by
  scheme · vs FY {year}" (`schemeVsFy`) when they are not — previously it always showed the "vs
  FY" form even while the pills beside it were hidden.
- **OD-15 — map's zone choropleth reverted to a frontend hardcoded table; supersedes OD-11.** ✅
  *Decided 2026-08-22.* OD-11 (2026-08-18) moved the map's zone shading from a hardcoded
  geographic lookup to the row's own `ALM_ZONE`, so the Zone filter and the map would agree. In
  production `ALM_ZONE` kept surfacing states under the wrong zone anyway — Karnataka and Uttar
  Pradesh reporting under East, and Odisha not appearing under East at all in a period it had no
  billing — the same many-to-many plant↔Unit symptom OD-10 diagnosed, just not yet fixed by OD-10's
  own (still unactivated) backend COALESCE. `IndiaMap.js` now carries its own `ZONE_OF_STATE`
  table — all 36 states/UTs mapped to one of 5 zones (North/West/Central/East/South) per ALIMCO's
  real zonal map — and reads every state's zone from there instead. This is scoped to the map
  control alone: the Zone filter dropdown and every other panel (KPI totals, Top-states, scheme
  rows) still match on `ALM_ZONE` server-side, unchanged. Zone hover-card totals still aggregate
  live from the Geo entity's rows, just grouped by `ZONE_OF_STATE` instead of `AlmZone`; the card's
  three rows (gross/net/tax) are unchanged. The choropleth's lightest colour step and "no billing"
  fill (`--pms-scale-0`, `--pms-nodata`) were also darkened slightly in the same change, so both
  stay visibly distinct from the white panel background in light theme; dark theme was untouched.
- **OD-16 — the map's zone table is driven by each PLANT's own `ALM_ZONE`, and a state whose
  plants disagree is SPLIT rather than painted whole in one zone.** ✅ *Decided 2026-08-22.*
  OD-15's hardcoded `ZONE_OF_STATE` is now only a baseline (`ZONE_OF_STATE_BASELINE`): a state
  hosting plants takes the zone those plants carry on `ZSD_ZONE_PLANT-ALM_ZONE`, read off each
  Unit dot's own `AlmZone` (`ZSD_PMS_UNIT_DOTS`, one value per Unit — unambiguous, unlike the
  state-grain Geo row's `AlmZone` that OD-15 abandoned), with `PLANT_STATES` in `IndiaMap.js`
  mapping each plant to the state(s) it covers. Madhya Pradesh then broke the last assumption:
  it hosts **3300 RMC Ujjain (WEST)** and **3100 AAPC Jabalpur (CENTRAL)**, so no single zone is
  right for it, and painting the whole state Central contradicted the table's own WEST for
  Ujjain. `deriveStatePieces()` now returns one or more *pieces* per state — a state whose plants
  agree (or that has none) stays one whole-state piece, byte-identical to its `indiaGeo.js` path,
  while a state whose plants disagree is cut into each plant's Voronoi cell (Sutherland-Hodgman
  clip against the perpendicular bisector between the plants, on the projected coordinates the
  dots already carry) and the cells merged per zone. So West now reaches into MP as far as
  Ujjain's own half — Ujjain/Indore/Bhopal West, Jabalpur/Gwalior/Rewa Central — and the split
  disappears by itself if both plants are ever maintained into one zone. Each piece also carries
  the `share` of the state's own billing its plants account for in that response, so the zone
  hover totals move with the colour (MP's ₹16.28 Cr Ujjain billing counts under West, its
  ₹5.6 Cr Jabalpur billing under Central) and the five zone totals still sum exactly to the Geo
  rows' total. Still scoped to this control: the Zone filter, KPI totals and every other panel
  match on `ALM_ZONE` server-side, untouched, and the state-granularity view is unchanged except
  that a split state's hover eyebrow now names both zones ("MP · West / Central").

- **OD-17 — the zone view is a base map with zone-coloured dots, not a second choropleth.**
  ✅ *Decided 2026-08-22.* Zone granularity used to shade each zone's region by value, the same
  way the state view shades states, which put two encodings of the same zoning on top of each
  other and made the map answer "how much" twice instead of answering "which zone" once. It is
  now one flat land colour (`--pms-land`) with its state borders drawn, and the **Unit dots**
  carry the colour — one hue per zone (`ZONE_COLORS` in `IndiaMap.js` → `--pms-zone-*`) — with
  a legend below the map naming each colour. Dot SIZE still means gross value, as in the state
  view. Each dot's callout label reads `code · zone · value` there (the unit name moves to the
  hover card, which also gained a zone eyebrow), and the hidden-dots case tints the regions in
  the same five colours instead, so the toggle never lands on a map with nothing on it. A zone
  picked in the Zone filter is tinted in its own colour so a filtered map still shows where the
  filter applies. **The state view is untouched.** Palette: the five hues are NOT the chart ramp
  (`--pms-c1..c8`) — no five of those eight survive as five marks that can sit side by side on
  one map (worst pair ΔE 3.0 under deuteranopia, OKLab ×100, floor 6). The five chosen are the
  best-separated five available, measured in both themes: light passes every gate (worst pair
  15.6 normal-vision, 6.9 colour-vision), dark clears colour-vision at 6.5 but leaves
  **West↔East at 11.9 normal-vision, under the 15 floor** — five simultaneously-visible
  categories is past what any documented palette carries, so the residual is covered by naming
  the zone on every dot's own label, in the hover card and in the legend rather than by colour
  alone. Tightening it further means fewer colours (group two zones) or a second channel
  (dot shape per zone).

## 7. How to point the ADT MCP at another client / system

Config lives in `~/.claude.json` under `mcpServers → mcp-abap-adt → env`:

```
SAP_URL      https://vhafbmedap01.hec.erp.alimco.in:443
SAP_CLIENT   100          <-- CHANGED from 120 on 2026-08-12 (user decision)
SAP_LANGUAGE en
```

**Status:** `SAP_CLIENT` was changed **120 → 100** on 2026-08-12. Client 120 is a near-empty
sandbox and produced the wrong volumes; client 100 is a client copy with data up to May and is far
more representative. **This takes effect only after Claude Code is restarted** — MCP servers
receive `env` at launch, so a mid-session edit does nothing.

✅ **Resolved, 2026-08-13: client-100 access now works.** The user live-debugged
`ZCL_PMS_DASH_QUERY` directly in ADT (screenshot confirmed) and ran `ZSD_PMS_DASH_TEST` against
real data — see §6 OD-6 through OD-12. The `mcp-abap-adt` tools are also now listed as available in
this session. The `unit`/`VKBUR` facts in §3 and §6 (OD-3, OD-8) are therefore now **live-confirmed**,
not just the user's word.

⚠ *(Historical, kept for context.)* Re-tried `GetTable`/`GetTableContents` on `ZSD_ZONE_PLANT` on
2026-08-12 afternoon — both failed with `401 Nicht autorisiert` / missing CSRF token. Originally
logged as "probably just needs a restart," but the user confirmed (2026-08-12) **client 100 uses
different credentials than client 120** — so this is a genuine auth gap, not only a stale env var.
**Correction to the line below:** a different *client on the same host* can require its own auth
after all; do not assume otherwise for any future client switch. (Now resolved — see the ✅ note
above.)

If production itself is needed later, change `SAP_URL` too. Credentials are not in this repo's
config — they come from the `mcp-abap-adt` package's own store/auth flow, set up per client.

## 8. Status / next step

Planning complete → see `ABAP_Backend_Plan.md`. **P0-0 (re-measure on production) now gates
everything else**, because the client-120 volumes drove three separate design conclusions.

**2026-08-12 additions (same day, later):** four more decisions layered on top, none of which
change P0-0's gating role: FY filter UI reworked to a picker defaulting to the computed current FY
(frontend-only, already implemented in the HTML template); material/tax CDS now has a concrete
reference design (**OD-4**, `PRCD_ELEMENTS` via `ZFI_SR_NEW_OPT.abap`) and the double-count Trap 1
now has a resolution mechanism the **user owns** (`sakn1`↔`hkont`); map-dot coordinates move from
hand-geocoded frontend config to two new backend-maintained fields on `ZSD_ZONE_PLANT` (**OD-5**),
leaving open only how a unit's representative point is derived from its member plants' coordinates.

**2026-08-13: Phase 1 backend drafted** (`../ABAP/` — `ZSDD_PMS_GL_CDS`, `ZSDD_PMS_ITEM_CDS`,
`ZCL_PMS_DASH_QUERY`, `ZSD_PMS_DASH_TEST`), same "written without live access" situation as the rest
of this plan — see that class's own header comment for the full caveat list. Two things worth
recording here specifically:
- OD-4's material↔GL bridge (`resolve_material_gl_keys`) and the OD-5 unit-dot centroid (value-
  weighted, per that decision's recommendation) are now real, complete implementations, not just
  designs — both still gated on the same P0 checks (P0-9, P0-10) as before.
- **New gap found while writing the code:** the Scheme filter doesn't restrict the material panel —
  `category` lives only on the GL-grain fact, not on `VBRP`/`VBRK`. Closing it needs the mirror image
  of the material↔GL bridge (GL→item instead of item→GL), deliberately not attempted in the same
  pass as the first unverified cross-grain join. Tracked in `ABAP_Backend_Plan.md` alongside OD-4.

**2026-08-13, later: Phase 1 imported, activated, and live-tested — confirmed working.** Testing
surfaced five real fixes, all made and re-verified the same day: **OD-6** (real `GJAHR` convention
is starts-in-year, opposite of the frozen template's), **OD-7** (`month_num` is a plain calendar
month, not FY-shifted), **OD-8** (the Unit join key is `VKBUR`, not `WERKS`, plus its many-to-many
corollary), **OD-9** (Trap 2's cutoff is derived from today's date, not scanned from fetched rows —
and pushed into `get_gl_rows`' own `date_to` rather than post-filtered in ABAP), and a fix to
`get_unit_dots` itself (it grouped by `werks` alone, silently misattributing a multi-unit plant's
later rows to whichever unit its first row happened to carry). This also means client-100 access is
confirmed working end-to-end now, superseding the credentials blocker in §7.

**2026-08-13, later still: Phase 2 (OData V4) drafted**, built against the now-tested Phase 1
engine — 7 custom entities, 7 query provider classes, 1 service definition, all under `../ABAP/`,
not yet imported. See `ABAP_Backend_Plan.md` Part C's Phase 2 section for the full design, including
two deliberate deviations from the original 10-entity sketch: Unit dots are their own entity
(`ZSD_PMS_UNIT_DOTS`), not a `Granularity` slice of `ZSD_PMS_GEO`, since Phase 1 returns them as two
structurally different sub-tables; and the 3 value-help entities are deferred (same call the GRN
Dashboard made for its own equivalent filters) since they're new, untested query logic, not a
wrapper over `get_dashboard_data`. Two new DDIC data elements (`ZSD_PMS_DATE`, `ZSD_PMS_FLT`) must
be created before the entities import — see that section for why, and note `ZSD_PMS_FLT` is
`CHAR(1000)`, not the Part B sketch's original 255 guess.

**2026-08-14 to 2026-08-18: Phase 3 (UI5 app) built, live-tested against production, and hardened.**
`zsd_pms_dash/` is a working app on the real service — filter bar, 4 KPI cards, India map, scheme
roll-up, plant and material charts. What live use surfaced, beyond the OD-10/11/12 decisions in §6:

- **Two independent 100-row caps sat in series on the Plant and Material filters.** SAP Gateway
  pages at 100 server-side, *and* `sap.ui.model.Model` defaults `sizeLimit` to 100 and applies it
  when an aggregation binding builds its contexts. Fixing either alone still showed
  `Select All (0 of 100)`. The frontend was wrongly ruled out early because the search was for
  control settings (`growing`, `setLimit`) — `setSizeLimit` is a **Model** API, not a control one.
  Paging now issues a fresh binding per page and stops on an **empty** page, never a short one:
  `ODataListBinding` marks length final on a short read, after which `requestContexts` is answered
  from cache and simply returns nothing more.
- **Gross / net / tax are shown throughout**, and `PriorGross` was added to `ZSD_PMS_SCHEME` (plus
  `ty_scheme_row`, `ZCL_PMS_SCHEME_QRY`, the mock `metadata.xml` and the frontend `$select`) so a
  gross headline is compared against a gross prior rather than a net one.
- **Panels are sized to the viewport, not fixed.** The map card was 682px on a 629px usable
  viewport — taller than the screen. `sap.ui.core.CSSSize` accepts `calc( )` but **not** `clamp( )`,
  so the floors and ceilings live in CSS `min-height`/`max-height` beside a `vh` height.
- **A production-only zone bug was reproduced locally** by adding `ui5-prod.yaml` (proxy to
  `vhafbmepap01.hec.erp.alimco.in`, client 300) and an `npm run start-prod` script on port 8098.
  The config carries **no credentials** — `fiori-tools-proxy` prompts interactively, and `.env`
  (dev creds only) is git-ignored and untracked. An early hypothesis that production merely ran an
  older build was **wrong**: the new local build against the production backend reproduced it, which
  is what led to OD-10.
- **`ZSD_PMS_ZONE_DIAG`** (new, read-only) reports current-vs-prior gross with and without a zone
  filter, `VKBUR` values missing from `ZSD_ZONE_PLANT` per year, and zones present per year. It is
  standalone — nothing else calls it.

**Open at the close of 2026-08-18:**
- **ABAP not yet activated/transported.** Order: `ZSDD_PMS_GL_CDS` (the OD-10 COALESCE revision) →
  `ZCL_PMS_DASH_QUERY` → `ZSD_PMS_SCHEME` → `ZCL_PMS_SCHEME_QRY` → republish `ZSD_PMS_DASH_O4`.
  Also `ZSD_PMS_DASH_TEST` (gained a `p_zone` parameter) and `ZSD_PMS_ZONE_DIAG` (new). Needed in
  **both MED and MEP** — until `ZSDD_PMS_GL_CDS` is active in MEP, state-granularity views and any
  zone/state aggregate total (the Zone filter, KPI totals, Top-states) still fall back to the
  billing plant's own state rather than the Unit's. *(The zone-**granularity map view** itself no
  longer depends on this activation — see OD-15 below, 2026-08-22.)*
- **The app has never been deployed to production.** `ui5-deploy.yaml` only ever targeted
  `vhafbmedap01`; there is no MEP deploy target.
- **Plant 4700 (RMC Jaipur) is zoned differently per system** — NORTH in MEP 300, CENTRAL in MED
  100. A master-data question for the business, not a code one.
- **ADT MCP returns 401 on every call**, so a live object-by-object comparison against the systems
  could not be run; the server is configured outside this repo (see §7).

**2026-08-22: FY floor, unconditional delta suppression, and the map's zone reverted to a
hardcoded table.** Three more decisions layered on top of the 2026-08-18 batch, all in §6:

- **OD-13** floors the FY picker at `VKBUR_FIRST_FY` (2026) — pre-2026 billing has no sales office,
  so offering it invited a selection nothing on the dashboard could group or filter by zone.
- **OD-14** (supersedes OD-12) hides growth pills for the whole of FY 2026 unconditionally, not
  only under a scope filter — the FY 2025 comparison base turned out to be unreliable either way.
  The scheme panel's subtitle now tracks the same flag (`schemeVsFy` vs the new `schemeNoVs`).
- **OD-15** (supersedes OD-11) moves the map's own zone shading off `ALM_ZONE` and onto a
  hardcoded `ZONE_OF_STATE` table in `IndiaMap.js`, because `ALM_ZONE` kept mis-assigning states in
  production even after OD-11. This is scoped to the map control alone — the Zone filter, KPI
  totals and every other panel are unchanged. As a side effect, this also fixes the "Uttar Pradesh
  and Karnataka under East" symptom on the **zone-granularity map view** specifically, independent
  of whether the still-unactivated OD-10 backend revision ever lands.
- Unrelated small fix in the same commit: the choropleth's lightest colour step and "no billing"
  fill were darkened slightly (`--pms-scale-0`, `--pms-nodata`) — both used to sit within a few
  points of the white panel background, so a barely-billed state and an unbilled one could both
  read as blank. Dark theme was untouched.
