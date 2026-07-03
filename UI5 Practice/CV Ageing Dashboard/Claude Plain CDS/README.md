# CV Ageing — CDS / OData V4 (Milestone 1: prove the data)

Goal: replicate `ZFI_CUST_VEND_AGING_RPT` logic as CDS, expose as **OData V4**, and
verify the numbers **before** building any Fiori / ECharts UI.

## Object overview

| # | Object | Type | Purpose |
|---|--------|------|---------|
| 1 | `ZI_CV_Bucket_Days` | CDS view entity | Resolves `zfi_cv_bucket` rows into `[FromDays,ToDays]` at runtime (leap-safe) |
| 2 | `ZI_CV_Ageing_Cust_Doc` | CDS view entity | Customer open items + `DaysOld` |
| 3 | `ZI_CV_Ageing_Cust` | CDS view entity | Bucketed + aggregated (normalized) |
| 4 | `ZC_CV_Ageing_Cust` | CDS projection | Consumption view (exposed) |
| 5 | `ZI_CV_Ageing_Vend_Doc` | CDS view entity | Vendor open items + `DaysOld` |
| 6 | `ZI_CV_Ageing_Vend` | CDS view entity | Bucketed + aggregated |
| 7 | `ZC_CV_Ageing_Vend` | CDS projection | Consumption view (exposed) |
| 8 | `ZUI_CV_AGEING` | Service definition | Exposes both consumption views |
| 9 | Service Binding | (create in ADT) | OData **V4** — see below |

**No new DB table.** Buckets are read from the existing `zfi_cv_bucket`; the day
windows are computed in CDS from the `P_KeyDate` parameter.

Data flow:
```
zfi_cv_bucket ─► ZI_CV_Bucket_Days (FromDays/ToDays, leap-safe)
                              │
ACDOCA + KNA1/LFA1/SKAT       │
        │ (open-item filter via augdt, DaysOld via parameter)
        ▼                     ▼
  *_Doc  ──►  ZI_*_Ageing (inner join on DaysOld BETWEEN, GROUP BY, normalized)
        ▼
  ZC_*  ──►  ZUI_CV_AGEING  ──►  Service Binding (V4)
```

## Why this design (vs. the ABAP report)

- **Normalized, not pivoted.** The report builds a dynamic per-bucket column pivot.
  CDS can't emit a variable column set, and charting libraries want long format
  anyway. One row per bucket = one bar/segment.
- **Open items via `augdt`** directly on ACDOCA (`augdt = 0` OR `augdt > KeyDate`),
  so BSID/BSAD/BSIK/BSAK are not needed.
- **`DaysOld = KeyDate − PostingDate + 1`** (report's "+1, take from date too").
- **Leap-safe year buckets, no key-date drift.** `ZI_CV_Bucket_Days` reproduces the
  report's `get_days_for_years` with `dats_add_months( KeyDate, -12*years )`, which
  clamps Feb-29 → Feb-28 in non-leap years. Windows are recomputed for whatever
  `P_KeyDate` you pass — nothing is pre-stored.
  - `D`  → `from_sel .. to_sel`
  - `D+` → `from_sel .. 999999999`
  - `Y`  → `days_to(from_sel)+1 .. days_to(to_sel)`
  - `Y+` → `days_to(from_sel)+1 .. 999999999`

## Release note
Written as `define view entity` (S/4 1909+ / 7.55+). On older releases convert each
to classic `define view ... with @AbapCatalog.sqlViewName`.

## Step 1 — Create objects (ADT / Eclipse)
Create the 7 CDS view entities (`CDS/*.ddls`) in dependency order
(1; 2→3→4; 5→6→7), then the service definition `ZUI_CV_AGEING`. Activate all.

## Step 2 — Bucket config
Use a variant already in `zfi_cv_bucket` (e.g. `Debtors`). No new table to fill.

## Step 3 — Create the OData V4 Service Binding
In ADT: New ▸ Service Binding ▸ binding type **OData V4 - UI** (or **Web API**),
reference service definition `ZUI_CV_AGEING`. Activate, then **Publish**.

## Step 4 — Test the data (no UI yet)
Parameters go in the entity-set path. Examples (replace host/client/variant):

Metadata:
```
/sap/opu/odata4/sap/zui_cv_ageing/srvd/sap/zui_cv_ageing/0001/$metadata
```
Customer, as on 2026-06-29, company 1000, variant 'Debtors':
```
.../0001/CVAgeingCustomer(P_KeyDate=2026-06-29,P_CompanyCode='1000',P_Variant='Debtors')/Set?$orderby=BucketSeq
```
Sum per bucket ($apply):
```
.../Set?$apply=groupby((BucketKey,BucketLabel),aggregate(AgingAmount with sum as Total))
```
Vendor set is `CVAgeingVendor(P_KeyDate=...,P_CompanyCode='...',P_Variant='...')/Set`.

Easiest first check: the Service Binding editor's **Preview** button, or
`/n/IWFND/MAINT_SERVICE` ▸ test.

## Step 5 — Reconcile against the ABAP report
Run `ZFI_CUST_VEND_AGING_RPT` for the same company code + key date + variant and
compare each bucket column sum against the OData `AgingAmount` totals. Differences
usually trace to:
- the Advance/Normal (`umskz`) selection (OData returns both; filter `AgingStatus`),
- bucket gaps/overlaps in `zfi_cv_bucket`.

Once totals match → proceed to the Fiori app + ECharts/Chart.js (reads this same V4 service).
