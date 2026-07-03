# CV Ageing — RAP Custom Entity (OData V4 over reused ABAP logic)

The aging logic lives once in a class (`ZCL_CV_AGEING`, lifted from
`ZFI_CUST_VEND_AGING_RPT`). The report, a test program, and the OData V4 service all
call it — so they can't disagree. OData is produced by a RAP **unmanaged query**
(custom entity), which sidesteps every pure-CDS limitation (variable bucket count,
pivot, leap-year math) while keeping the modern V4 protocol.

## Objects

| # | Object | Type | Role |
|---|--------|------|------|
| 1 | `ZCL_CV_AGEING` | ABAP class | **Engine** — buckets, open items, days, aggregation → normalized rows |
| 2 | `ZFI_CV_Ageing_Cust` | CDS custom entity | Customer shape + params |
| 3 | `ZCL_CV_AGEING_CUST_QRY` | ABAP class | Query provider (calls engine, partner type 'C') |
| 4 | `ZFI_CV_Ageing_Vend` | CDS custom entity | Vendor shape + params |
| 5 | `ZCL_CV_AGEING_VEND_QRY` | ABAP class | Query provider (partner type 'V') |
| 6 | `ZFI_CV_AGEING_O4` | Service definition | Exposes both entities |
| 7 | Service Binding | (create in ADT) | OData **V4** |
| 8 | `ZCV_AGEING_TEST` | Report | Milestone-1 test of the engine (no OData) |

```
ZCL_CV_AGEING (engine)
   ├── ZCV_AGEING_TEST (report)            ← test the numbers first
   └── *_QRY (if_rap_query_provider)
            └── ZFI_CV_Ageing_* (custom entity, params)
                     └── ZFI_CV_AGEING_O4 → Service Binding (V4)
```

## Build order (ADT)
1. **`ZCL_CV_AGEING`** — create class, paste source, activate. Check the data
   elements/views it uses exist in your system: `zfi_cv_bucket`, `zvariant`,
   `zduration_type`, `bsid_view`/`bsad_view`/`bsik_view`/`bsak_view`, `acdoca`,
   `skat`, `kna1`, `lfa1`, `lfb1`, `t059t`.
2. **`ZCV_AGEING_TEST`** — run it for a known company/date/variant and reconcile
   against `ZFI_CUST_VEND_AGING_RPT`. **Do this before any OData work.**
3. `ZFI_CV_Ageing_Cust` + `ZCL_CV_AGEING_CUST_QRY`, then the vendor pair.
4. `ZFI_CV_AGEING_O4` service definition.
5. New ▸ **Service Binding** ▸ type **OData V4 - UI**, reference `ZFI_CV_AGEING_O4`,
   activate, **Publish**.

## Test the OData
Parameters are passed in the entity-set path (custom entity with parameters):
```
.../CVAgeingCustomer(P_KeyDate=2026-06-29,P_CompanyCode='1000',P_Variant='DASHBOARD')/Set?$orderby=BucketSeq
.../CVAgeingVendor(P_KeyDate=2026-06-29,P_CompanyCode='1000',P_Variant='DASHBOARD')/Set
```
Use the Service Binding **Preview**, or the V4 service-test in `/n/IWFND/V4_ADMIN`.

## Things to verify / tune in your system
- **Parameter-reading API** in the `*_QRY` classes: the loop reads
  `parameter_name` / `value`. If your release names the component `name` instead,
  swap it (ADT code-completion on `ls_param-` shows the right one).
- **$filter / $orderby**: the query classes currently return the full computed set
  and apply only `$count` + paging. If you need server-side `$filter`, read
  `io_request->get_filter( )->get_as_ranges( )` and pass the ranges into
  `get_ageing( it_prctr / it_racct / it_partner )` (already supported by the engine).
- **Advance/Normal**: engine includes both by default; add params or a filter if the
  dashboard must split them (`AgingStatus` is in the output).
- **Overlapping buckets** (e.g. 91–120 then 120–150) double-count the boundary day —
  same as the report. Keep windows contiguous & non-overlapping in `zfi_cv_bucket`.
- `acdoca.hsl` currency is `rhcur` (company-code currency).

Once `ZCV_AGEING_TEST` matches the report and the V4 set returns the same totals →
build the Fiori/UI5 app and render with ECharts (load lib, draw into a div in
`onAfterRendering`).
