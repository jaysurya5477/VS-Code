# PP Dashboard — RAP Custom Entities (OData V4 over the shared engine)

Phase 2: expose `ZCL_PP_DASHBOARD_ENGINE` (already validated against the old
`ZPP_DASHBOARD_TABLE_UPDATE` output) live via OData V4, so the Fiori app can be
built and benchmarked before deciding whether to retire `zpp_dash_all` /
`zpp_dash_main`. Same pattern as the CV Ageing dashboard's RAP layer: a RAP
**unmanaged query** (custom entity) per shape, each backed by a thin query
provider class that just calls the engine.

## Objects

| # | Object | Type | Role |
|---|--------|------|------|
| 1 | `ZCL_PP_DASHBOARD_ENGINE` | ABAP class | **Engine** (already built/validated) |
| 2 | `ZPP_C_Dash_Summary` | CDS custom entity | Werks/Category KPI + chart shape, params `P_Gjahr`/`P_AsOfDate` |
| 3 | `ZCL_PP_DASH_SUMMARY_QRY` | ABAP class | Query provider for (2) — calls `get_summary` |
| 4 | `ZPP_C_Dash_Detail` | CDS custom entity | Line-item drill-down shape, same params |
| 5 | `ZCL_PP_DASH_DETAIL_QRY` | ABAP class | Query provider for (4) — calls `get_detail` |
| 6 | `ZPP_DASHBOARD_O4` | Service definition | Exposes both entities |
| 7 | Service Binding | (create in ADT) | OData **V4** |

```
ZCL_PP_DASHBOARD_ENGINE (engine)
   ├── ZPP_C_Dash_Summary  → ZCL_PP_DASH_SUMMARY_QRY (if_rap_query_provider)
   └── ZPP_C_Dash_Detail   → ZCL_PP_DASH_DETAIL_QRY  (if_rap_query_provider)
              └── ZPP_DASHBOARD_O4 → Service Binding (V4)
```

`DashSummary` (werks + category, one row per combo) is what the KPI tiles and
the category/plant charts should bind to — it's the direct OData replacement
for `zpp_dash_main`. `DashDetail` (line-item grain, with `Budat`/`MonthNum`)
is for anything that needs to drill into individual postings or build a
monthly trend — the OData replacement for `zpp_dash_all`. Use `DashSummary`
first; only pull in `DashDetail` if a chart genuinely needs line-item data,
since it returns far more rows.

## Build order (ADT)
1. Confirm `ZCL_PP_DASHBOARD_ENGINE` is already active (it is, from Phase 1).
2. **`ZPP_C_Dash_Summary`** (CDS custom entity) — create, paste source, activate.
3. **`ZCL_PP_DASH_SUMMARY_QRY`** — create class, paste source, activate.
   Check parameter/filter names in ADT code completion (see note below).
4. **`ZPP_C_Dash_Detail`** + **`ZCL_PP_DASH_DETAIL_QRY`** — same steps.
5. **`ZPP_DASHBOARD_O4`** service definition — create, paste, activate.
6. New ▸ **Service Binding** ▸ type **OData V4 - UI**, reference
   `ZPP_DASHBOARD_O4`, activate, **Publish**.

## Test the OData
Parameters are passed in the entity-set path (custom entity with parameters):
```
.../DashSummary(P_Gjahr='2026',P_AsOfDate=2026-07-08)/Set?$filter=Werks eq '3500'
.../DashDetail(P_Gjahr='2026',P_AsOfDate=2026-07-08)/Set?$filter=Category eq 'XYZ'&$top=50
```
Use the Service Binding **Preview**, or `/n/IWFND/V4_ADMIN`.

## Things to verify / tune in your system
- **Parameter-reading API** in the `*_QRY` classes: the loop reads
  `parameter_name` / `value`. If your release names the component `name`
  instead, swap it (ADT code-completion on `ls_param-` shows the right one) —
  same caveat as the CV Ageing precedent.
- **$filter**: only `Werks`/`Category` (summary) and `Werks`/`Category`/`Matnr`
  (detail) are read from `$filter` today. Anything else in the URL is ignored
  server-side — add more `CASE` branches if the Fiori app needs to filter on
  more fields.
- **No $orderby handling** — rows come back in the engine's natural order
  (`get_summary`: werks/category; `get_detail`: unordered MATDOC join order).
  Sort client-side in UI5, or add `ORDER BY` handling here if needed.
- **This is the live path** — every OData request re-reads MATDOC + the price
  view through the engine. There is no caching. This is the actual thing to
  benchmark: hit `DashSummary` with realistic worst-case filters (full fiscal
  year, no plant/category restriction) and see whether response time holds up
  for an interactive dashboard. `DashDetail` will be slower and return more
  rows — test it with a narrow filter first.

## After this
If the benchmark holds up, point the Fiori app directly at this service and
move to the Phase 3 decision (retire `zpp_dash_all`/`zpp_dash_main` and
switch `ZPP_DASHBOARD_REPORT`/`ZPP_DASHBOARD_MAIL` to the live engine too).
If it's too slow — especially `DashDetail` on a wide filter — keep the
persisted tables as before; Phase 1's refactor already means the batch job,
the report, and the mail program share one calculation path regardless.
