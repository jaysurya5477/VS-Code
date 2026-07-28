# Functional Specification — GRN Dashboard (SAP Fiori / ECharts)

| | |
|---|---|
| **Module** | MM — Materials Management |
| **Object type** | Fiori analytics dashboard (custom, non-transactional) |
| **Status** | Draft v1 — for review |
| **Author** | Prepared with Claude Code, from workspace source objects |
| **Date** | 2026-07-28 |

---

## 1. Purpose

Provide a single-screen analytical dashboard over Goods Receipt (GRN) activity — receipt volume/value, quality disposition, rework impact, vendor performance and PO document-type mix — for MM stakeholders, replacing manual analysis of the `ZMM_PO_HISTORY_VER2` ALV list with interactive KPIs and charts.

This is a **read-only analytics dashboard**. It reuses the data-selection logic already proven in `ZMM_PO_HISTORY_VER2` (see §6) and adds the aggregation logic needed to drive KPIs and charts that the existing report does not compute today (see §6.2).

## 2. Scope

### In scope
- KPI cards, ratio strip, and 7 charts + vendor scorecard table exactly as prototyped in `GRN Dashboard v2.dc.html`.
- Filters: Vendor, Material, Plant, PO Doc. Type, GRN Year, GRN Month, GRN Date range.
- Read-only OData V4 service exposing pre-aggregated data (no editable fields).
- A new, purpose-built CDS view for the dashboard (§6.1) — rebuilds only the join logic actually needed, rather than consuming `ZMMD_PO_CDS` as-is.

### Out of scope (this phase)
- The editable "Send to Finance / Receive by Finance" workflow (`ZPO_HIS_REC_SEND`, the `&DATA_SAVE` handler in the report).
- PJ / vendor-invoice tracking and payment-voucher tracking (`ZMMD_PYVC_CDS`).
- Debit-note tracking, GST/tax breakup display (SGST/CGST/IGST), rejection-print and inspection-remarks popups.
- Return-document linkage (`ZMMD_RETURN_CDS`) and the 313 stock-transfer join — not consumed by any dashboard KPI/chart.
- Row-level authority-object checks (`M_BEST_EKG` / `M_BEST_WRK`) and the report's AUDITOR/CAG_AUDITOR FY2025 special case — **not applicable**. Access is controlled at the Fiori Launchpad/role level, since the dashboard is assigned only to a small, named group of users (§8).

> Decisions confirmed with business owner: analytics-only scope, no transactional/finance-handshake features in v1; access restricted via role assignment, not in-app authorization checks.

## 3. Source Objects Reviewed

| Object | Type | Role |
|---|---|---|
| `ZMM_PO_HISTORY_VER2` | ABAP report | Primary reference logic — selection, joins, per-line enrichment, tax split, authorization |
| `ZMMD_PO_CDS` | CDS view | Core GRN extraction (EKPO ⋈ EKKO ⋈ MATDOC[101] ⋈ MKPF ⋈ rework/return/quality/payment CDS ⋈ LFA1 ⋈ T024/T161T/MARA) — the report's `it_ekpo` source |
| `ZMMD_RWK_CDS` | CDS view (referenced, not in bundle) | Links a 101 GRN line to its rework document numbers |
| `ZMM_GR_REWORK` | Transparent table | Rework linkage: request/rework/rejection/reversal doc numbers — **no quantity/value fields** |
| `ZMMD_RETURN_CDS` | CDS view | Links a 101 GRN to its return document (movement 122) |
| `ZMMD_QU_CDS` | CDS view | Quality inspection result per GRN line; `kurztext` defaults to `'Pending'` when no UD code exists yet |
| `ZMMD_PYVC_CDS` | CDS view | Payment-voucher linkage via GR-based IV — out of scope per §2 |
| `ZPO_HIS_REC_SEND` | Transparent table | Finance handshake state — out of scope per §2 |
| `GRN Dashboard v2.dc.html` | HTML/ECharts prototype | UI/interaction/chart specification (mock data) |
| `GRN_Dashboard_Plan.md` / `MM GRN Dashboard Initial Plan.docx` | Requirements | Filters, KPI list, conditions (source of truth for business requirements) |

## 4. Architecture

Follows the same pattern already in production for the MB5B Material Stock and CV Ageing dashboards in this workspace, for consistency and to reuse proven infrastructure:

```
SAPUI5 Fiori app (Fiori Launchpad tile — assigned only to named dashboard users)
  └─ shell controller
       └─ <iframe> hosting GRN Dashboard v2.dc.html (ECharts)
             ↔ postMessage bridge (filters out / data + pinned-state in)
                  ↕
       OData V4 service (custom RAP, read-only)
                  ↕
       ABAP query class ZCL_GRN_DASH_QUERY
         - selects from new CDS view ZMMD_GRN_DASH_CDS (§6.1 — trimmed join logic, not ZMMD_PO_CDS directly)
         - adds MATDOC lookups for 102 / Z22 / Z23 (§6.2)
         - returns pre-aggregated, chart-shaped JSON/OData results
```

**Why iframe + postMessage:** the dashboard's chart/interaction logic is already fully built and validated in `GRN Dashboard v2.dc.html`. Hosting it inside a thin UI5 shell (as done for MB5B/CV Ageing) lets the existing frontend be reused almost unchanged — only the mock `data()` generator is replaced by a `fetch()` against the new OData service, with filters/theme passed in via `postMessage` from the UI5 shell exactly as the sibling dashboards do.

**Backend:** a **new read-only custom RAP service** (`ZCL_GRN_DASH_QUERY`, unmanaged/query-only), not a reuse of the report's SUBMIT/ALV path and not a direct consumer of `ZMMD_PO_CDS`. It selects from a new, dashboard-specific CDS view (§6.1) that rebuilds `ZMMD_PO_CDS`'s core join logic minus the joins the dashboard has no use for, then performs the additional aggregation steps in §6.2, and returns results already shaped per chart (monthly series, top-N vendor, top-20 material, etc.) rather than a flat line list — the ~lines(it_final) row-by-row enrichment loop in the report is appropriate for a 1:1 ALV, not for pre-aggregated chart payloads, and should be replaced by GROUP BY / aggregate SELECTs plus the same lookup-table READ pattern the report already uses for enrichment (HASHED/SORTED internal tables, one bulk SELECT per lookup, no SELECT inside loops).

## 5. Filters

| # | Filter | Type | Cascades with | Backend mapping |
|---|---|---|---|---|
| 1 | Vendor | Multi-select, searchable | Material, Plant | `LIFNR` (`ZMMD_PO_CDS-lifnr`, joined `LFA1-name1`) |
| 2 | Material | Multi-select, searchable | Vendor, Plant | `MATNR` |
| 3 | Plant | Multi-select | Vendor, Material | `WERKS` |
| 4 | PO Doc. Type | Multi-select | — | `BSART`, **STO-excluded by default** (§7.1) |
| 5 | GRN Year | Single-select, default = current year | — | Year part of `BUDAT101` |
| 6 | GRN Month | Multi-select, default = all | — | Month part of `BUDAT101` |
| 7 | GRN Date | Date range, optional | Overrides Year/Month when set | `BUDAT101` between `dateFrom`/`dateTo` |

Cascading behaviour (Vendor/Material/Plant mutually narrowing) mirrors the prototype's `cascade()` helper — implement as: selecting a Plant re-queries the distinct Vendor/Material lists scoped to that Plant (small `SELECT DISTINCT ... FOR ALL ENTRIES` against the filtered result, not client-side filtering of the full master list).

## 6. Data Sourcing

### 6.1 New dashboard-specific CDS view, built from `ZMM_PO_HISTORY_VER2` / `ZMMD_PO_CDS` logic

`ZMMD_PO_CDS` is not consumed directly. It carries three `left outer join`s the dashboard has no use for — `ZMMD_RETURN_CDS`, `ZMMD_PYVC_CDS`, `ZPO_HIS_REC_SEND` — plus the `MATDOC` bwart-313 transfer join. These are plain joins, not CDS associations, so they execute on every query regardless of which fields a consumer selects; carrying them into a dashboard that aggregates across potentially large date ranges would be pure overhead.

Instead: a new view, **`ZMMD_GRN_DASH_CDS`**, rebuilds only the join logic the dashboard needs, using the same tables/keys/filter conditions as `ZMMD_PO_CDS` (so the numbers reconcile with the report) but omitting the out-of-scope joins:

| Kept from `ZMMD_PO_CDS` | Dropped |
|---|---|
| `EKPO` ⋈ `EKKO` (bstyp='F') ⋈ `MATDOC` (bwart='101', xauto=' ', lbbsa_sid IN ('01','02',' ')) ⋈ `MKPF` — core GRN fact | `ZMMD_RETURN_CDS` (return/122 linkage) — out of scope |
| `LFA1` — vendor name/GST | `ZMMD_PYVC_CDS` (payment voucher) — out of scope |
| `T024` (purchasing group desc.), `T161T` (doc type desc.), `MARA` (old material no.) | `ZPO_HIS_REC_SEND` (finance handshake) — out of scope |
| `ZMMD_RWK_CDS` — rework doc-number linkage (needed to drive the §6.2 Z22/Z23 lookup) | `MATDOC` bwart-313 transfer join — not used by any KPI/chart |
| `ZMMD_QU_CDS` — quality result per GRN line (needed for §7.3 buckets) | |

Fields/lookup patterns transferring into the new view and its consuming query class, with the same enrichment technique the report uses (bulk `SELECT ... FOR ALL ENTRIES` into HASHED/SORTED tables, `READ TABLE` per row where a join isn't practical in the view itself):

| Need | Source field(s) | Report pattern reused |
|---|---|---|
| GRN qty / value (101) | `menge2` (grn qty), `dmbtr` | Base `it_ekpo` selection |
| GRN date | `budat101` | — |
| Vendor / vendor name | `lifnr`, joined `name1` | — |
| Material / description | `matnr`, `txz01`, `bismt` | — |
| Plant / storage location | `werks`, `lgort` | — |
| PO doc type / description | `bsart`, joined `batxt` (`T161T`) | — |
| Purchasing group / description | `ekgrp`, joined `eknam` (`T024`) | — |
| Quality disposition text | `ZMMD_QU_CDS.kurztext` (`'Pending'` default) + `losmenge`, `lmenge01/03/04` | `wa_final-kurztext CS 'Acc'/'Rej'` fallback logic (report lines ~553–561) — reuse verbatim |
| Rework linkage (doc numbers only) | `rework_mblnr/mjahr` (via `ZMMD_RWK_CDS`) | — |
| Cancellation linkage | `MATDOC` bwart 102 where `lfbnr = mblnr101` | `it_cancel` build (report lines 438–448) — kept as a separate query, same as the report does (it's not part of `ZMMD_PO_CDS` either) |
| STO / excluded doc types | `BSART` range | Existing `r_bsart` default-exclude range (report lines 370–388) — **extend list**, see §7.1 |

### 6.2 New logic required (gaps not covered by current objects)

| Gap | Why it's missing today | Required addition |
|---|---|---|
| **102 (GR reversal) as its own time-series row** | `ZMMD_PO_CDS` is hard-filtered to `c.bwart = '101'` (view line 10) — 102 only ever appears as a cancellation *flag* on the original 101 line, never as its own dated row | Separate `SELECT` against `MATDOC` for `bwart = '102'`, keyed by `lfbnr = mblnr101`, carrying its **own** `budat` (a 102 can post in a later month than its 101) and `dmbtr`/`menge`, so the trend chart can bucket reversals by their actual posting month |
| **Z22 / Z23 rework quantity & value** | `ZMM_GR_REWORK` / `ZMMD_RWK_CDS` store only the rework document *number*, not its movement type, quantity or value | New `SELECT` against `MATDOC` using `mblnr = rework_mblnr` / `mjahr = rework_mjahr` (from `ZMMD_PO_CDS`), filtered to `bwart IN ('Z22','Z23')`, pulling `menge`/`dmbtr` and `budat` — **confirmed approach**, reuses the existing rework linkage, just extends it one join further into MATDOC exactly as the report already does for the 102 cancellation case |
| **Prior-year comparison ("vs last year" KPI delta)** | Report is a flat point-in-time list; no period-over-period logic exists | Service accepts the resolved date range, additionally re-runs the same aggregation for the equivalent prior-year range (same calendar days, year − 1), returns both periods; UI computes `%Δ` |
| **Quality bucket aggregation** | Per-line fields exist (`kurztext`, `losmenge`, `lmenge01/03/04`) but nothing aggregates them into the 4 dashboard buckets | Aggregate rule (see §9, Quality KPIs) built from existing fields — no new source data, just a GROUP BY/SUM layer |
| **Chart-shaped aggregates** (monthly series, top-10 vendor, top-20 material, plant composition, doc-type ranking, worst-10 material rejection) | Report returns a flat ALV line list only | New GROUP BY aggregate queries per chart, built on top of the same base extraction — see §10 |

## 7. Business Rules & Conditions

### 7.1 STO document type exclusion

**Confirmed exclusion list:** `UB`, `ZP04`, `ZP05`, `ZP22`, `ZP23`.

This overlaps almost entirely with the report's existing default-exclude range (`r_bsart`, report lines 370–382), which already excludes `ZP03`, `ZP04`, `ZP05`, `ZP22`, `ZP23` unless the `p_zp03` checkbox is set. **Action:** reuse that same range-table pattern for the dashboard's default PO Doc. Type filter, adjusted to: keep `ZP03` selectable (not excluded), add `UB` to the exclusion set. No new logic — a one-line change to an already-proven exclusion list.

Document the exclusion in the dashboard subtitle/footer, per the original plan's UX note (already present in the prototype: *"STO doc types excluded at source"*).

### 7.2 Negative-value display (102, Z23)

- `102` (GR reversal) quantities and values are shown as **negative** in all charts, KPI cards, and the vendor/material tables.
- `Z23` (rework cancel) quantities and values are shown as **negative**.
- Net calculations (`GRN Qty − Rework Qty`, `GRN Value − Rework Value`) use signed arithmetic — negative components subtract naturally, no separate "reversal" branch needed in formulas.
- Red color coding (`--neg` token) applied consistently, matching the prototype's palette.

### 7.3 Quality bucket derivation

Reusing the report's existing field semantics (report lines 553–561, `ZMMD_QU_CDS.kurztext`):

| Bucket | Rule |
|---|---|
| **Accepted** | `kurztext CS 'Acc'` → quantity = `lmenge01` (or `losmenge` when `kostl ≠ ' '` and `lmenge01/03/04` all blank — the cost-center-PO fallback the report already applies) |
| **Rejected** | `kurztext CS 'Rej'` → quantity = `lmenge04` (same fallback pattern, mirrored) |
| **Sample** | `lmenge03` (sample-retention quantity), summed independently of accept/reject status |
| **Under inspection** | `kurztext = 'Pending'` (the CDS view's own default when no UD/QAVE code exists yet) → quantity = `losmenge − lmenge01 − lmenge03 − lmenge04` |

## 8. Access Control

No row-level authority-object checks (`M_BEST_EKG` / `M_BEST_WRK`) and no port of the report's AUDITOR/CAG_AUDITOR FY2025 restriction. The dashboard is assigned to a small, named group of users via the Fiori Launchpad catalog/role — access is controlled entirely at that assignment level, not inside the query class. Every user who can open the tile sees the same (full) data scope.

## 9. KPI Definitions

| # | KPI | Movement types | Formula |
|---|---|---|---|
| 1 | GRN Qty | 101, 102 | `Σ menge2 (101) + Σ menge (102, negative)` |
| 2 | GRN Value | All | `Σ dmbtr (101) + Σ dmbtr (102, negative)` |
| 3 | Quality Accepted | 101 | Per §7.3 Accepted rule |
| 4 | Quality Rejected | 101 | Per §7.3 Rejected rule. **Confirmed**: 102 never applies here — a 101 line can only be reversed via 102 *before* a quality decision is posted (the system blocks cancellation once UD exists), so an already-Rejected/Accepted line can never carry a 102 to net out |
| 5 | Quality Sample | 101 | Per §7.3 Sample rule |
| 6 | Rework GRN Qty | Z22, Z23 | `Σ menge (Z22) + Σ menge (Z23, negative)` — new source, §6.2 |
| 7 | GRN Qty − Rework GRN Qty | — | KPI 1 − KPI 6 (net effective receipt qty) |
| 8 | GRN Value − Rework GRN Value | — | KPI 2 − rework value equivalent of KPI 6 |

All KPI cards additionally show a **vs. last year** delta (§6.2, prior-year re-aggregation) and a monthly sparkline.

## 10. Ratios

| Ratio | Formula |
|---|---|
| Rejection Rate % | `Rejected / (Accepted + Rejected + Sample) × 100` |
| Rework Rate % | `Rework GRN Qty / GRN Qty × 100` |
| Net GRN Rate | `(GRN Qty − Rework Qty) / GRN Qty` |
| Avg. GRN Value per Unit | `GRN Value / GRN Qty` |
| Vendor Quality Score | `100 − (Rejection Rate × 9) − (Rework Rate × 1.6)`, clamped [0,100] — **confirmed final weights**, per the prototype's values |

## 11. Chart Specifications

All charts implemented in `GRN Dashboard v2.dc.html` via ECharts 5.5; the backend must supply exactly the aggregates each chart consumes.

| Chart | Type | Dimensions | Measures | Notes |
|---|---|---|---|---|
| Receipt flow over time | Stacked bar + line | Month | 101 qty/value, 102 qty/value (neg), Z22 qty/value, Z23 qty/value (neg), net line | Qty/Value toggle switches unit basis, not the query |
| Quality disposition | Donut + gauge | Accepted/Rejected/Sample/Under inspection | Qty, Rejection Rate % (gauge) | §7.3 buckets |
| Top vendors by GRN value | Horizontal bar + scatter | Vendor (top 10 by value) | GRN Value, Rejection % (secondary axis) | |
| Quality composition — top 10 plants | 100% stacked horizontal bar | Plant (top 10) | % share Accepted/Rejected/Sample/Under inspection | |
| Top 20 materials by GRN value | Pie w/ leader lines | Material (top 20 by value) | GRN Value, % of total | |
| GRN value by PO doc type | Ranked bar, zoomable | Doc type (all, STO excluded) | GRN Value | Client-side zoom/slider; backend returns full ranked list |
| Materials with highest rejection rate | Horizontal bar + scatter | Material (worst 10 by rejection %) | Rejected qty, Rejection % | 2.0% target reference line |
| Vendor scorecard | Table | Vendor (top N) | Qty, Net Qty, Value, Rejection %, Rework %, Score | Row click filters whole dashboard to that vendor (frontend-only interaction, re-issues filtered query) |

## 12. Non-Functional Requirements

- **Performance**: aggregate in ABAP (GROUP BY / `SUM` in `SELECT`) rather than pulling line-level data to the app server — the report's row-by-row loop is appropriate for a 1:1 ALV, not for pre-aggregated chart payloads. Reuse the report's lookup-table technique (bulk `FOR ALL ENTRIES` into `HASHED`/`SORTED` tables) for any enrichment joins that can't be pushed into the aggregate `SELECT`.
- **Caching**: per prior work on the Material Stock dashboard in this workspace, any server-side result cache must key on `SY-UNAME` in addition to the filter set, to prevent cross-user data leakage.
- **Pagination**: not applicable — responses are pre-aggregated (max ~20 rows per chart), not raw line data, so no `$top`/`$skip` paging concerns like the Material Stock dashboard's 5000-row cap.
- **Theming**: light/dark/system, CSS custom-property driven, exactly as implemented in the prototype — no backend involvement.
- **Responsiveness**: 12-column grid layout as prototyped; must remain usable down to ~1024px (Fiori Launchpad tile / embedded scenarios).

## 13. Open Items

None outstanding — both items from the prior draft (Vendor Quality Score weighting, and the 102/quality-KPI interaction) were confirmed with the business owner and are now reflected in §9/§10.

## 14. Next Steps

1. Review and sign off this FS.
2. Build the new `ZMMD_GRN_DASH_CDS` view (§6.1).
3. Design the OData V4 service structure (entities/aggregation endpoints) for `ZCL_GRN_DASH_QUERY`.
4. Implement backend: base extraction (§6.1) → new MATDOC lookups (§6.2) → aggregation queries (§10/§11).
5. Build the thin UI5 shell app (iframe host + postMessage bridge), following the MB5B/CV Ageing pattern.
6. Wire `GRN Dashboard v2.dc.html`'s mock `data()` generator to the live OData service.
7. Assign the Fiori tile/role to the designated dashboard users (§8).
8. UAT against the current `ZMM_PO_HISTORY_VER2` ALV output for figure reconciliation.
