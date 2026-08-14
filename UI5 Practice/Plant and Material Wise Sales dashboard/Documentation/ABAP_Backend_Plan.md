# ABAP Backend Plan — Plant & Material Wise Sales Dashboard

Companion to [`CONTEXT_LOG.md`](CONTEXT_LOG.md) (verified facts, compact) — read that first.
Design source of truth: `../Final Template/sales-dashboard-india_claude V8.html`.
Architecture reference: `../../GRN Dashboard/ABAP NEW/`.

---

## Part A — Feasibility verdict

### A1. Fully possible from data that already exists ✅

| Template feature | Real source | Note |
|---|---|---|
| Total **net** value KPI | `ZSD_SALE_ALL.netwr` | direct |
| Total **tax (GST)** KPI | `ZSD_SALE_ALL.mwsbk` | **Better than the template** — real posted tax, not a derived rate |
| Total **gross** value KPI | `ZSD_SALE_ALL.gross` | direct (or `netwr + mwsbk`) |
| Invoice count | `count distinct vbeln` | direct |
| Plant count | `count distinct werks` | direct |
| **Scheme** dimension + roll-up panel | `category` / `cat_desc` | 1:1 with the template's `SCHEMES`. 8 real values vs 7 mocked |
| **Zone** roll-up + zone map granularity | `ZSD_ZONE_PLANT.alm_zone` | Values match `ZONE_ORDER` exactly |
| Plant names / cities | `ZSD_ZONE_PLANT.remarks` | 10 cities |
| **Unit** grouping (map-dot granularity) | `ZSD_ZONE_PLANT.unit` | **New (2026-08-12).** 18 Units in production per user; each groups multiple plants. Supersedes the plant/state dot debate — see N-1 |
| **Yesterday Sale** KPI (new 4th card, replaces Geographic reach) | `ZSD_SALE_ALL.budat` | Single-day sum of net/gross for yesterday, or the selected month's last day if a past month is filtered — see OD-1c in `CONTEXT_LOG.md` §6 |
| Sales-by-plant, **stacked Net + Tax** | `netwr` + `mwsbk` by `werks` | ⚠ The **Top-20 cap is real and load-bearing** — production has ~109 billing plants, so the scroll/cap behaviour and the "Top 20 of 109" hint text both matter *(earlier note that it was moot came from client-120 data)* |
| Month/period filter (Apr–Mar) | `month_num`, `zmonth` | Indian FY already modelled |
| Date-range filter | `budat` | direct |
| FY selector | `gjahr` | direct |
| YoY delta on every panel | `gjahr` − 1 | Must replicate the *same-periods-to-date* truncation (§A4) |
| 12-period sparkline / trend | `month_num` | direct |
| **Targets** (bonus, template doesn't use them) | `ZSD_CAT_PLANT.target` | Available per category × plant × year, in Crores. Worth adding an achievement % |

### A2. Possible, but requires new build work ⚠

| Template feature | Gap | Work required |
|---|---|---|
| **Sales by material** panel | `ZSD_SALE_ALL` has **no `matnr`** | New CDS fact view over `VBRP` joined to `VBRK`, keyed on the same billing docs. Must not be joined onto the GL-grain rows (§A4 double-count) |
| **Quantity** metric + UOM toggle | no qty in `ZSD_SALE_ALL` | `VBRP.fkimg`, `VBRP.vrkme` |
| Material description / group | — | `VBRP.arktx`, `MARA.matkl` (+ `T023T` text) |
| Per-material GST % | template derives it from material group | ✅ **UPGRADED (OD-4, 2026-08-12): real condition-based tax, not derived.** `VBRP.knumv_ana` joined to `PRCD_ELEMENTS` (`knumv=knumv_ana AND kposn=posnr`) gives per-item IGST/SGST/TCS directly — see `CONTEXT_LOG.md` §3 `PRCD_ELEMENTS` and the reference program `ZFI_SR_NEW_OPT.abap`. Better than either fallback in this row's original text |
| Credit-memo exclusion (template `F2` vs `G2`) | — | Map real `fkart` / `type` values. **Phase 0 check P0-2** |
| Plant → **state** | not in `ZSD_ZONE_PLANT` | `T001W.regio` + `T005U` for the state name, or extend `ZSD_ZONE_PLANT` with a `regio` field |
| Material filter with type-ahead | template ships all 4 680 materials to the browser | Server-side value-help entity with `$search` / `$filter startswith` + `$top`. Cannot be client-side |
| **Target achievement % KPI** (the replacement 4th card) | targets live in a separate table and a different unit | Join `ZSD_CAT_PLANT` on `category × gjahr × werks`. ⚠ Targets are in **Crores**, actuals in rupees — convert (×10 000 000). Must respect the scheme/plant filters so target and actual stay comparable |

### A3. Not possible as designed ❌ — needs a decision or a drop

| # | Template feature | Why not | Recommendation |
|---|---|---|---|
| **N-1** | Plant **lat/lon** dots on the map | Coordinates are not in SAP standard master data | ✅ **SOLVED twice over (2026-08-12).** **OD-3:** dots move from plant grain to Unit grain — `ZSD_ZONE_PLANT.unit` groups the ~109 plants into **18 Units** in production, small enough to plot cleanly (unlike raw plants). **OD-5 (supersedes the original "hand-geocode ≤18 unit cities as frontend config" plan):** the user is adding **two new lat/lon fields directly to `ZSD_ZONE_PLANT`**, business-maintained per plant — no frontend geocode table needed at all, and coordinates can be corrected in production without a UI5 redeploy. Open point: how to derive one representative point per **unit** from its member **plants'** coordinates — see OD-5 in the context log for the candidate rules (value-weighted centroid recommended). The projection machinery (`INDIA.cityLL`, `INDIA.proj`, `projLL()`) is still verified and reusable unchanged for rendering. Pending live verification of the `unit` column/count (**P0-7**) and the new lat/lon fields (**P0-10**) |
| **N-2** | ~~Full 36-state choropleth impossible~~ | ~~Only 10 plants in ~9 states~~ | ✅ **FINDING WITHDRAWN.** That rested on client-120 data. Production has **109 billing plants**, so the plant-state choropleth shows real national spread. **OD-1 (plant state) stands and is now the clearly right call** — `T001W.regio` → `T005U`, no customer-master join |
| **N-3** | KPI "Geographic reach **X/36** states" | Card was reinstated (OD-1b), then dropped again same day | ✅ **SUPERSEDED (OD-1c, 2026-08-12 afternoon): the 4th KPI card is now "Yesterday Sale", not Geographic reach.** Single-day sum of net/gross for `budat = today − 1`, or for the last calendar day of the selected month when the Month/FY filter picks a month other than the current one. No `T001W`/state join, no target join, no unit conversion. The state/zone geography used by the map panel (#2) is unaffected — this only changes the KPI card. `ZSD_CAT_PLANT` targets stay out of v1 scope |
| **N-9** | CSV export | Template builds 21 columns in JS from in-memory rows; will not scale server-side | **DECIDED (OD-2): dropped — not required.** `ZSD_PMS_LINES` is out of scope; entity count 11 → 10 |
| **N-4** | Client-side filtering of the entire dataset | Template holds every row in the browser and re-filters in JS on each interaction | Push all filters into the backend; each panel becomes its own aggregated OData call. This is **AD-3** and it is the single biggest structural change from template to product |
| **N-5** | Plant `closed` / `opened` flags | Synthetic mock markers with no SAP equivalent | **Drop.** (Or derive "no billing this FY" if a real signal is wanted) |
| **N-6** | 3 fiscal years always available (2025/26/27) | Depends entirely on what is posted. `ZSD_CAT_PLANT` confirms FY2026 only so far | Build the FY selector from `select distinct gjahr`, not a hard-coded list |
| **N-7** | Unit price per line | Not a master field | Derive `netwr / fkimg` in the item view. Fine, just note it is derived |
| **N-8** | Sub-second interactivity on every click | Template filters in-memory | Accept ~1–3 s per interaction, or pre-aggregate. Mitigation: one combined "dashboard" round-trip rather than 6 parallel calls, as GRN does |

### A4. Two traps to handle explicitly

**Trap 1 — GL-grain double counting.** `ZSD_SALE_ALL` is keyed `BELNR/GJAHR/HKONT`, i.e. one row
per GL account line, so a single billing document (`vbeln`) can appear many times. Any join to
`VBRP` (which is one row per billing *item*) produces a cartesian blow-up and inflated values.
**Baseline resolution (still valid, still the default):** treat the two grains as two independent
fact views — value/tax/scheme/plant/geo panels aggregate the **GL view** only; material/quantity
panels aggregate the **item view** (`VBRK`+`VBRP`+`PRCD_ELEMENTS`, see OD-4) only, restricted to the
same `vbeln` set the filters select. Never join them row-to-row.

✅ **Exact resolution available, owned by the user (decided 2026-08-12, OD-4).** Rather than relying
only on the aggregate cross-check below, `PRCD_ELEMENTS.sakn1` (the G/L account a pricing condition
posts to) can be matched against the actually-posted `hkont` for the same `knumv` — this ties a
specific GL line back to the exact material/condition that produced it, so "don't double-count"
becomes exact rather than approximate. See `CONTEXT_LOG.md` §3 `PRCD_ELEMENTS` for the full
mechanism, taken from the reference program `ZFI_SR_NEW_OPT.abap`.
⚠ **Edge case that mechanism must preserve:** the reference program discovered that a SAP posting
error can create **two finance documents (`belnr`) for the same invoice line** — so
`vbeln`+`matnr`+`posnr` can legitimately repeat under a different `belnr`. Any material/GL link in
`ZCL_PMS_DASH_QUERY` must be keyed by `vbeln+matnr+posnr`, never by `belnr`, or it will silently
drop or misattribute one of the two documents.

Cross-check the two totals in Phase 0 (**P0-1**); confirm the condition types apply to ALIMCO's own
pricing procedure first (**P0-9**) before building on the `sakn1` link.

**Trap 2 — YoY is "same periods to date", not full-year.** Template `recompute()` truncates the
prior year at the same period **and the same day-of-month** as the newest current-year record, so
a part-way-through FY compares like with like. Implement this in the query class; a naive
full-prior-year comparison will make every delta look catastrophically negative mid-year.

---

## Part B — Target object design

Naming: `ZSDD_PMS_*` CDS views · `ZSD_PMS_*` custom entities · `ZCL_PMS_*` classes · package `ZSD`.

### Panel → entity map

| # | Panel / need | Custom entity | Grain |
|---|---|---|---|
| 1 | 4 KPI cards (+YoY): net, tax, gross, **Yesterday Sale** | `ZSD_PMS_KPI` | 1 row per KPI. 4th row is a single-day snapshot per OD-1c, not a period aggregate — see note below the table |
| 2 | KPI sparklines + trend | `ZSD_PMS_TREND` | 1 row per FY period (12). Whether the 4th KPI gets a sparkline at all is open — a single day has no natural 12-period trend; default assumption is to show a 12-day (not 12-period) trend for that card only, pending confirmation |
| 3 | India map — choropleth (state/zone) + dots (**Unit**, OD-3) | `ZSD_PMS_GEO` | 1 row per state for the choropleth (zone rolls up, or `Granularity` param); dots add a **Unit**-grain slice off the same entity — 1 row per Unit (≤18) with aggregated value + representative lat/lon derived from `ZSD_ZONE_PLANT.latitude/longitude` (**OD-5**, new fields, per-plant — see the open centroid-rule question there), a third `Granularity` value alongside state/zone |
| 4 | Scheme performance rows | `ZSD_PMS_SCHEME` | 1 row per scheme |
| 5 | Top 8 states list | *reuse* `ZSD_PMS_GEO` | sort/slice in UI5 |
| 6 | Sales by plant (net+tax) | `ZSD_PMS_PLANT` | 1 row per plant |
| 7 | Sales by material (value+qty) | `ZSD_PMS_MATERIAL` | 1 row per material |
| 8 | Plant filter value help | `ZSD_PMS_VH_PLANT` | plant master + zone + city |
| 9 | Material filter value help | `ZSD_PMS_VH_MATERIAL` | searchable, `$top`-capped |
| 10 | Region filter value help | `ZSD_PMS_VH_REGION` | zone + state |

*(An 11th line-level entity `ZSD_PMS_LINES` was planned for CSV export — **dropped**, see N-9.)*

### Shared parameter signature (all entities, GRN-style)

```
P_Fy       : gjahr           " fiscal year, obligatory
P_DateFrom : zsd_pms_date    " optional
P_DateTo   : zsd_pms_date    " optional
P_Zone     : zsd_pms_flt     " comma-separated, blank = all
P_State    : zsd_pms_flt
P_Plant    : zsd_pms_flt
P_Material : zsd_pms_flt
P_Scheme   : zsd_pms_flt
P_Period   : zsd_pms_flt     " FY periods 1-12
```

Two new data elements needed: `ZSD_PMS_DATE` (DATS) and `ZSD_PMS_FLT` (CHAR 255) — mirrors
`zmm_grn_dash_date` / `zmm_grn_dash_flt`.

### Layers

```
ZSDD_PMS_GL_CDS      (GL-grain fact: ZSD_SALE_ALL + ZSD_ZONE_PLANT[zone, city, unit, lat, lon] + T001W + T005U)
ZSDD_PMS_ITEM_CDS    (item-grain fact: VBRK + VBRP + PRCD_ELEMENTS[material tax, OD-4] + MARA)
        |
ZCL_PMS_DASH_QUERY   (central compute: default_filters( ), get_dashboard_data( is_filters ))
        |
10 thin ZCL_PMS_*_QRY classes implementing IF_RAP_QUERY_PROVIDER
        |
ZSD_PMS_DASH_O4      (service definition) → OData V4 service binding
```
*(`ZSDD_PMS_GL_CDS` drops `KNA1` per OD-1 — geography is plant-based, not customer-based; that join
was already stale in this diagram before today's changes.)*

---

## Part C — Phased plan

### Phase 0 — Validation spikes (do this first, no objects created)

Cheap throwaway report / ADT data preview. Each check has a decision attached.

> **P0-0 GATES EVERYTHING ELSE.** All measurements so far came from **client 120**, which is a
> near-empty sandbox. Structure (fields, grains, `category` = scheme) is cross-client and safe;
> every *volume* is not. Run P0-0 on **production** first — it already overturned three
> conclusions (N-1, N-2, N-3).

| ID | Check | Decides |
|---|---|---|
| **P0-0** | On **client 100** *(config switched 120 → 100 on 2026-08-12; retried live on 2026-08-12 afternoon and got a 401 — user confirmed client 100 needs its own credentials, separate from client 120's, which are not yet set up; a restart alone won't fix this)*: `count distinct werks` in `ZSD_SALE_ALL` (expect ~109); row count of `ZSD_ZONE_PLANT` and whether every billing plant has a zone, a city, **and a `unit`**; `count distinct` city in `remarks`; `count distinct unit` (expect 18, see **P0-7**); `count distinct regio` via `T001W`; `count distinct gjahr` | Re-baselines every volume assumption. Drives the map-dot strategy (**N-1**, **OD-3**). The old "sizes the reach KPI's denominator" purpose is gone — that KPI was dropped (**N-3**, **OD-1c**). ⚠ Client 100 is a client copy with data only **to May**, so treat *counts* as a reliable floor but not FY-complete |
| **P0-1** | Sum `netwr` from `ZSD_SALE_ALL` for one FY vs sum `VBRP.netwr` for the same `vbeln` set. Also count rows per `vbeln` in `ZSD_SALE_ALL` | Confirms the double-count trap and which view owns which number. Cross-check against the exact `sakn1`↔`hkont` link once **P0-9** confirms it (**OD-4**) — the two should reconcile |
| **P0-2** | `select distinct fkart, vtext, type` from `ZSD_SALE_ALL` | The real credit-memo / invoice-type mapping (template's `F2`/`G2`) |
| **P0-3** | `select distinct category, cat_desc` | Final scheme list + display names (8 expected) |
| **P0-4** | `T001W.regio` for all 15 plants — is it filled, and does it resolve via `T005U`? | Whether the map can source plant state from `T001W` at all, or whether `ZSD_ZONE_PLANT` needs a `regio` column added (only 10–15 values either way) |
| **P0-5** | Distinct material count in `VBRP` for one FY; distinct `gjahr` in `ZSD_SALE_ALL` | Sizes the material value-help; builds the real FY list (**N-6**) |
| **P0-6** | `ZSD_CAT_PLANT.target` unit check — confirm Crores, and that summing targets across the filtered category × plant set is meaningful | Historical only — the Target achievement % KPI idea was dropped back at OD-1b and stays dropped under OD-1c. Keep the check on file for if/when targets return |
| **P0-7** | On production/client 100: confirm `ZSD_ZONE_PLANT` has a `unit` column; `count distinct unit` (expect 18); confirm every billing `VKBUR` (sales office — **OD-8**, the real join key, not `werks`) maps to a unit (no left-outer-join gaps, mirroring the zone-gap check in P0-0); pull one representative city/plant per unit for geocoding | Whether **OD-3** (Unit map dots) can proceed as designed. A missing column, a wrong count, or a `vkbur` without a matching `ZSD_ZONE_PLANT` row changes the map-dot approach |
| **P0-8** | `ZSD_SALE_ALL.budat` — confirm postings exist for yesterday's date and for month-end dates in past FY periods; check whether `budat` is populated same-day or lags (billing document creation vs. posting date) | **OD-1c** (Yesterday Sale KPI). If `budat` lags real-world "yesterday," the KPI may show ₹0 or stale data on the very days it matters most |
| **P0-9** | *(User-owned, per OD-4.)* For ALIMCO's own billing documents: confirm which `PRCD_ELEMENTS.kschl` condition types actually carry IGST/SGST/TCS (the reference program's `JOIG`/`JOSG`/`JOCG`/`JTC1`/`JTC2`/`JTC4`/`JOUB` list is from a different module/company code's pricing procedure) and confirm the `sakn1`↔posted-`hkont` link resolves cleanly, including the two-`belnr`-per-line edge case | Whether `ZSDD_PMS_ITEM_CDS` can be built exactly as designed (**OD-4**), or whether ALIMCO uses different condition types requiring the join list to change |
| **P0-10** | Once the user adds the 2 new fields to `ZSD_ZONE_PLANT` (**OD-5**): create them as `DEC(10,7)` (recommended 2026-08-13 — one shared domain for both fields; sign doesn't consume `LENGTH` digits under `DEC`, so 10,7 covers the full -180.0000000..180.0000000 range; 7 decimals matches what a human pastes in from Google Maps). Then confirm coverage (how many of the ~109 plants are populated vs. blank) and validate the value-weighted centroid rule already implemented in `ZCL_PMS_DASH_QUERY=>get_unit_dots` against real data | Whether `ZSD_PMS_GEO`'s unit-dot query can be built as designed, and whether the value-weighted centroid needs revisiting |

The **zone data gap** seen on client 120 (plants `4100, 4400, 4600, 4700, 4800` with no
`ZSD_ZONE_PLANT` row) is most likely a sandbox artifact — re-check on production via P0-0 before
raising it with the business. The underlying risk is real either way: `ZSD_ZONE_PLANT` is
left-outer-joined, so **any** plant missing from it silently yields a blank zone and drops out of
the zone roll-up. With 109 plants, add a coverage assertion to the Phase 1 test report.

### Phase 1 — Core backend (testable without any UI)

**Status: IMPORTED, ACTIVATED, AND LIVE-TESTED, 2026-08-13.** `ZSD_PMS_DASH_TEST` ran against real
data and reproduced every panel correctly — see CONTEXT_LOG.md §6 for the five real findings that
came out of live testing (OD-6 FY convention, OD-7 `month_num`, OD-8 `VKBUR` join key, OD-9 Trap-2
cutoff, the `get_unit_dots` plant/unit grouping bug), all fixed the same day.

1. `ZSD_PMS_DATE`, `ZSD_PMS_FLT` data elements. *(Still needed — for the Phase 2 custom-entity
   `with parameters` clauses specifically, e.g. `P_DateFrom : zsd_pms_date`. The Phase 1 class
   itself doesn't need them; `ZCL_PMS_DASH_QUERY=>ty_filters` uses plain built-in types since it's
   an internal ABAP signature, not a DDIC-exposed one — no source file to draft here, same as GRN's
   equivalent two data elements, which also have no file under `ABAP NEW/`.)*
2. `ZSDD_PMS_GL_CDS` — DRAFTED. GL-grain fact view. Joins `ZSD_SALE_ALL` → `ZSD_ZONE_PLANT` (zone,
   city, **unit**, and the two new **lat/lon** fields once added — OD-5 — all **left outer**, per
   the gap above) → `T001W` (regio) → `T005U` (state text). **No `KNA1` join** — geography is
   plant-based (OD-1). Does not yet join `ZSD_CAT_PLANT` for targets (out of v1 scope per OD-1c).
3. `ZSDD_PMS_ITEM_CDS` — DRAFTED. Item-grain fact view over `VBRK` + `VBRP` + `MARA` (+ `T023T`).
   Deliberately does **not** join `PRCD_ELEMENTS` into the view itself (would fan out to one row per
   item per matching condition type — the same problem Trap 1 exists to avoid, one level down; see
   that CDS file's own header). The OD-4 tax pivot happens in ABAP instead, keyed `knumv =
   VBRP.knumv_ana AND kposn = posnr`, deduped by `vbeln+matnr+posnr`, never `belnr` — see the Trap 1
   edge case in §A4.
4. `ZCL_PMS_DASH_QUERY` — DRAFTED, all methods implemented (not stubs): filter resolution, both
   grains, KPIs (incl. the `sakn1`↔`hkont` material-GL link, OD-4, and the OD-1c daily snapshot),
   YoY same-periods-to-date truncation (Trap 2), the value-weighted unit-centroid derivation for map
   dots (OD-5), scheme roll-up, plant/material Top-20. **New gap found while writing this, not
   previously documented:** the Scheme filter does not restrict the material panel (`get_item_rows`)
   — `category` lives only on the GL-grain fact, not on `VBRP`/`VBRK`. The mirror image of the
   material↔GL bridge (GL→item) would close this; not attempted in the same pass as the first
   unverified cross-grain join — see that method's own comment.
5. `ZSD_PMS_DASH_TEST` report — DRAFTED. Classic-list dump so every number is verifiable in SE38
   before any OData or UI5 exists. *(This step is why the GRN build went smoothly; keep it.)*

**Exit criterion: MET, 2026-08-13.** The test report reproduces every number the dashboard shows,
for one FY, with filters applied.

### Phase 2 — OData V4 exposure

**Status: DRAFTED as local source under [`../ABAP/`](../ABAP/), 2026-08-13 — not yet imported. Same
"written without confirming the exact target state ahead of time" caveat pattern as Phase 1, though
this time Phase 1 (the thing it delegates to) is fully tested, not a guess.**

Built as **7** custom entities, one per `ty_dashboard` sub-table — not the original 10-entity Part B
sketch (which planned `ZSD_PMS_GEO` to also carry the Unit-dot slice via a `Granularity` parameter,
and included 3 value-help entities). Two changes from that original sketch, both deliberate:
- **Unit dots are their own entity, `ZSD_PMS_UNIT_DOTS`**, not a `Granularity` slice of
  `ZSD_PMS_GEO` — `get_dashboard_data` returns them as two structurally different sub-tables (dots
  carry `Latitude`/`Longitude` and no `InvoiceCount`; states carry `InvoiceCount` and no
  coordinates), so merging them would need new, untested reshaping in the compute class. Exposing
  them separately keeps Phase 2 a thin pass-through over what Phase 1 actually returns, and matches
  the GRN Dashboard's own "one entity per result shape" convention.
- **The 3 value-help entities (`ZSD_PMS_VH_PLANT`/`VH_MATERIAL`/`VH_REGION`) are deferred, not
  built** — same call the GRN Dashboard made for its own equivalent filters: they're new,
  untested `SELECT DISTINCT`-style query logic, not a wrapper over the already-tested
  `get_dashboard_data`. Add them if/when the UI needs real F4 type-ahead.

1. `ZSD_PMS_DATE` (`DATS`), `ZSD_PMS_FLT` (`CHAR`, **1000** — widened from this doc's original 255
   guess, sized for a `P_Plant` CSV list spanning all ~109 production plants) — **must be created in
   SE11/ADT before any custom entity**, exactly like GRN's own documented gotcha: a parameter typed
   with an inline built-in type compiles and activates fine, but Service Binding creation then fails
   with "Parameter P_XXX has no data type" for every parameter on every entity.
2. 7 custom entities (`ZSD_PMS_KPI`, `TREND`, `GEO`, `UNIT_DOTS`, `SCHEME`, `PLANT`, `MATERIAL`),
   each `STRUCTURE + parameters` only (no `SelectFrom` — all computed in ABAP), each
   `@ObjectModel.query.implementedBy` its own query provider. All 7 share the same 9 parameters
   (`P_Fy`/`P_DateFrom`/`P_DateTo`/`P_Zone`/`P_State`/`P_Plant`/`P_Material`/`P_Scheme`/`P_Period`),
   mirroring `ZCL_PMS_DASH_QUERY=>ty_filters` exactly, since filters scope the whole computation,
   not just one entity's own columns.
3. 7 thin query-provider classes (`ZCL_PMS_*_QRY`) — each calls
   `zcl_pms_dash_query=>default_filters( )`, overrides only the parameters actually passed (so a
   blank `P_Fy` means "current FY," not an error — mirrors `ZSD_PMS_DASH_TEST`'s own PARAMETERS
   handling), then `get_dashboard_data( )`, maps its own sub-table, handles `$count`/paging, and
   consumes `get_sort_elements( )` unconditionally (RAP rejects the whole read with
   `RAP_RUNTIME/004` if a caller sends `$orderby` and the provider never consumes it, even when the
   data is already correctly ordered — GRN's documented workaround, applied here to all 7 rather
   than only the ones the engine happens to pre-sort, since any entity could receive `$orderby`).
4. `ZSD_PMS_DASH_O4` service definition, exposing all 7 with friendlier PascalCase aliases.
5. Service Binding (type OData V4 - UI) — no local source file (RAP bindings are runtime-activated,
   not materialized as ADT source); create and Publish directly in the system.
6. Verify each entity via its `/Set` URL with parameters in the browser.

**Known limitation, unrelated to Phase 2 itself:** `ZSD_PMS_MATERIAL`'s `P_Scheme` parameter is
accepted but has no effect — the Scheme filter can't reach the item-grain fact (see `get_item_rows`'s
own comment and Phase 1 point 4 above).

**Exit criterion (not yet met):** every entity returns correct JSON for a parameterised URL.

### Phase 3 — UI5 app (separate effort, not this plan)

Port template V8 panel-by-panel. Notes that matter for the backend contract:
- V8 uses **Chart.js**, not ECharts. The stray `echarts.min.js` at project root is from an earlier
  iteration — decide one charting library before starting and copy it **locally**
  (public CDNs are blocked in this environment; copy from a sibling UI5 project's `libs/`).
- The inline India SVG (paths, projection, city coords) is self-contained in V8 and ports as-is.
- **Unit** dot coordinates come from the OData `ZSD_PMS_UNIT_DOTS` entity (**N-1**, **OD-3**, **OD-5**
  — a separate entity from `ZSD_PMS_GEO`'s state rows, see Part C Phase 2) — nothing hard-coded in
  the UI5 app. Not plant coordinates, not the 36 state centroids either.
- Every filter interaction becomes an OData re-read, not a JS re-filter (**N-4**).
- The 4th KPI card is **"Yesterday Sale"**, not "Geographic reach" and not "Target achievement %"
  (**N-3**, **OD-1c**) — single-day value, business rule for which day is in `CONTEXT_LOG.md` §6.
- The map will show a properly populated national choropleth with **109 production plants** across
  their real states — keep the **Zone** granularity toggle prominent alongside it (**N-2**).
- The **Export CSV** button is already removed from the header (**N-9**, done 2026-08-13 — the
  button and its `btnCsv` click handler were still sitting in the frozen template despite the
  decision; both are gone now).
- **FY selector is a picker, not a segmented row** (decided 2026-08-12, already updated in the
  frozen HTML template) — same visual pattern as Region/Plant/Material, defaulting to whichever FY
  contains today's date (computed at runtime, not hard-coded). Carry this into the UI5 port.

---

## Part D — Summary for the impatient

- **~80 % of the dashboard is directly buildable** from tables that already exist. The scheme
  dimension, zones, net/tax/gross, YoY and all plant panels are real.
- **The material and quantity panels need a second fact view** over `VBRP` — `ZSD_SALE_ALL` simply
  does not carry material or quantity.
- **Geography stays plant-based** (decided) — and with ~109 production plants this now gives a
  properly populated choropleth, not the mostly-grey map originally feared.
- **CSV export is dropped** (decided), removing the one entity that needed server-side paging.
- **Map dots are solved at Unit grain (OD-3), pending live confirmation (P0-7).** `ZSD_ZONE_PLANT`
  carries an 18-value `unit` field that groups the 109 plants — the right size to plot cleanly.
  The projection machinery is verified and unchanged; only the aggregation key moves from `werks`
  to `unit`.
- **Dot coordinates come from the backend, not a hand-geocoded frontend table (OD-5, 2026-08-12).**
  Two new lat/lon fields are being added to `ZSD_ZONE_PLANT`, business-maintained per plant, spec'd
  as `DEC(10,7)` (2026-08-13 — see P0-10). The unit-level centroid rule (value-weighted, per OD-5)
  is already implemented in `ZCL_PMS_DASH_QUERY=>get_unit_dots` — remaining work is live validation
  against real coordinate data (P0-10), not the rule itself.
- **Material tax is now a solved design problem, not a placeholder (OD-4, 2026-08-12).** A
  user-supplied reference program (`ZFI_SR_NEW_OPT.abap`, a Finance Sales Register report) already
  computes real per-material GST via `VBRP.knumv_ana` → `PRCD_ELEMENTS`, and the same table's
  `sakn1` field gives an exact material↔GL link — turning Trap 1's double-count risk from an
  aggregate cross-check into an exact resolution. Condition types need confirming against ALIMCO's
  own pricing procedure first (P0-9), since the reference program is from a different module.
- **Real `GJAHR` fiscal-year convention confirmed live, and it's the opposite of the template's
  (OD-6, 2026-08-13).** Apr 2026–Mar 2027 is real-system `GJAHR` 2026 (starts-in year), not the
  frozen template's "FY 2027" (ends-in year). `ZCL_PMS_DASH_QUERY` now uses the real convention
  everywhere it touches FY (`current_period_info`, `period_end_date`, and the three date-range
  derivations in `get_gl_rows`/`get_gl_rows_prior`/`get_item_rows`). The template's FY display
  logic must NOT be ported into UI5 as-is — Phase 3 needs an explicit relabel-or-translate step.
- **`ZSD_SALE_ALL.month_num` is a plain calendar month, not an FY-shifted period (OD-7, confirmed
  against real Phase 1 test output, 2026-08-13).** Every other FY-period value in the class is
  Apr=1..Mar=12; `month_num` is Apr=04..Dec=12, Jan=01..Mar=03. Bridged with two new converters
  (`month_to_period`/`period_to_month`), applied at the single point `month_num` enters memory
  (`get_gl_rows`) — the period filter is translated to real months for the `WHERE`, and every
  fetched row is re-expressed as an FY-period right after, so `get_trend`/`compute_truncation`/
  `get_gl_rows_prior` need no changes of their own. Left unfixed, this would have silently misordered
  the trend once the FY reached Jan-Mar (`01-03` sorting before `04-12` instead of after).
- **The Unit join key is `VKBUR` (sales office), not `WERKS` (OD-8, corrected by user directly in
  `ZSDD_PMS_GL_CDS.ddls.asddls`, 2026-08-13).** `ZSD_ZONE_PLANT.WERKS` holds one row per Unit despite
  its name; the real link from `ZSD_SALE_ALL` is `B.WERKS = A.VKBUR`, not `A.WERKS`. `A.VKBUR` is
  only used as the join key, not exposed as its own output column. Also retired a now-dead `vkbur`
  field that had been sitting unused in `ZCL_PMS_DASH_QUERY`'s `ty_gl_row`. See P0-7 above, updated
  to check `VKBUR` coverage, not `WERKS`.
- **Trap 2's truncation cutoff is TODAY's (period, day), not scanned from the fetched data (OD-9,
  found via user review, 2026-08-13).** `compute_truncation` previously derived its same-periods-
  to-date cutoff from the latest row actually present in `it_curr` — fragile under the same posting
  lag already flagged at **P0-8**, since the newest row can sit well before today. Periods are
  already numbered identically in both years (Apr=1), so "today vs. the same period/day last year"
  needs no data lookup at all; Feb 29 in a non-leap prior year is harmless for a `<=` cutoff. Fixed
  to derive the cutoff from `current_period_info` for the current FY, and to apply **no** truncation
  for a past, already-closed FY (previously truncated those too, which was never intended). Dropped
  the now-unused `it_curr` parameter from `compute_truncation` and `get_gl_rows_prior`. **Follow-up,
  same day:** since the cutoff is now known before fetching, `get_gl_rows_prior` pushes it straight
  into `date_to` instead of fetching the full prior FY and post-filtering in ABAP — needed one new
  primitive, `period_day_date( iv_fy, iv_period, iv_day )`, with `period_end_date` now just that
  called with `iv_day = 31`.
- **The 4th KPI card is "Yesterday Sale," not Geographic reach (OD-1c, 2026-08-12).** A single-day
  snapshot — yesterday, or the selected month's last day if a past month is filtered — replacing
  the state-count card. This drops the `T001W`/`T005U` join from the KPI entity; the map panel's
  own state/zone geography is unaffected.
- **⚠ Everything measured so far came from client 120, a near-empty sandbox.** Structure is
  cross-client and safe; volumes are not. **P0-0 on production gates the rest of Phase 0.**
- **Phase 1 is imported, activated, and live-tested (2026-08-13).** Testing itself surfaced five
  real fixes (OD-6 through OD-9, plus the `get_unit_dots` plant/unit grouping bug — see Part D
  above and `CONTEXT_LOG.md` §6). One known gap remains, not a bug: the Scheme filter doesn't reach
  the material panel (see Phase 1 above).
- **Phase 2 is drafted (2026-08-13), not yet imported.** 7 custom entities + 7 query provider
  classes + 1 service definition exist under `../ABAP/`, built against the now-tested Phase 1
  engine — see Part C's Phase 2 section for the build order and the two deliberate deviations from
  the original 10-entity sketch (Unit dots split out, value-help entities deferred).
- **The real work is not the SQL — it is moving the aggregation server-side.** The template is an
  in-browser data engine; the product must be a set of parameterised aggregate reads.
