# ABAP NEW — GRN Dashboard, Phase 1 (backend data foundation)

This folder holds the ABAP objects for **Phase 1** of the GRN Dashboard build, per
[`../GRN Dashboard FS.md`](../GRN%20Dashboard%20FS.md) (functional spec) and
[`../MM-ALM-002_FS GRN_Dashboard.docx`](../MM-ALM-002_FS%20GRN_Dashboard.docx) (formal FS document,
Technical Development No. **MM-ALM-002**).

## What Phase 1 is

Read-only backend: two new CDS views + one ABAP query class that together compute every
KPI/ratio/chart the dashboard needs, callable and testable in a real SAP system today — **no
OData/RAP service, no UI5 app, no iframe wiring yet**. That is Phase 2.

## Files in this folder

| File | What it is |
|---|---|
| `ZMMD_GRN_DASH_CDS.ddls.asddls` | Core 101-GRN-line fact view. Lean rebuild of `ZMMD_PO_CDS` (see file header for exactly which joins were kept/dropped and why). |
| `ZMMD_GRN_MVT_CDS.ddls.asddls` | Generic correction-movement view covering 102, Z22 and Z23 together (`BWART` discriminates), standalone from the core view — see "Why two separate CDS views" below. |
| `ZCL_GRN_DASH_QUERY.clas.abap` | The query class. Public API: `default_filters( )` and `get_dashboard_data( is_filters )`. All KPI/ratio/quality-bucket/chart logic lives here. |
| `ZMM_GRN_DASH_TEST.prog.abap` | Throwaway executable report to call the class and dump results as a classic list, so the class can be sanity-checked the moment the CDS views are activated. Not the dashboard — a validation tool only. |

## Why two separate CDS views, not one

`ZMMD_GRN_DASH_CDS` is a flat 101-GRN-line view. 102/Z22/Z23 are each a **1:N relationship** to a
101 line (one GRN could have multiple rework cycles). Joining any of them into the flat view
would fan out and double-count the base GRN qty/value on aggregation. So corrections are queried
independently in `ZCL_GRN_DASH_QUERY`, each row carrying its own vendor/material/plant/doc-type
dimensions and its own posting date, and combined only in ABAP after each has already been
aggregated. This is explained in more detail in each view's header comment and in FS section 6.2.

### Why 102, Z22 and Z23 all live in *one* view (`ZMMD_GRN_MVT_CDS`)

Originally this was two views — one for 102 (self-joined back to its specific original 101 via
`MATDOC-LFBNR`), one for Z22/Z23 (traced through the custom table `ZMM_GR_REWORK`). Neither trace
turned out to be necessary: the dashboard only ever aggregates these movements by
vendor/material/plant/doc-type/date, never by "which specific 101 does this correction belong
to" (that granularity only matters for a line-item report like `ZMM_PO_HISTORY_VER2`, not for a
dashboard that just sums things). And since it's confirmed that Z22/Z23 rework movements post
against the *same* PO/PO-item as the original procurement (not a separate rework/subcontract PO),
all three movement types resolve their vendor/material/plant identically: join `MATDOC` straight
to `EKPO`/`EKKO` on the movement's own `EBELN`/`EBELP`. That makes 102, Z22 and Z23 structurally
identical, so they're now one view with `BWART` exposed, and `ZCL_GRN_DASH_QUERY` just filters by
movement type per call site (`get_reversals` → `bwart = '102'`, `get_rework` → `bwart IN ('Z22',
'Z23')`). This also eliminates the custom Z-table dependency entirely.

The view is built as a `UNION ALL` of two branches: 102+Z22 need no further validation, but Z23
rows are additionally required to trace back to a genuine Z22 via the confirmed, standard SAP
storno linkage — `Z23.SMBLN/SJAHR/SMBLP = Z22.MBLNR/MJAHR/ZEILE` — so a Z23 only counts if it
demonstrably cancels a real Z22, not merely because it carries that movement type code. This
supersedes the earlier draft's guess at a `ZMM_GR_REWORK`-based Z22/Z23 link, which is no longer
part of the design at all.

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
  prototype (`../GRN Dashboard v2.dc.html`) already uses.
- Both of the above were open items in an earlier FS draft; they are now resolved in the FS and
  should not be re-asked.

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

## Not in scope for Phase 1 (or at all, per the FS)

- OData V4 service / RAP business object exposure — **Phase 2**.
- SAPUI5 shell app + iframe/postMessage bridge to `GRN Dashboard v2.dc.html` — **Phase 2**.
- Editable "Send to Finance / Receive by Finance" workflow, PJ/invoice tracking, payment-voucher
  tracking, debit-note tracking, GST/tax breakup — out of scope entirely (FS section 2).

## How to pick this back up in a fresh conversation

1. Read `../GRN Dashboard FS.md` for the full functional spec (filters, KPI formulas, chart
   specs, business rules).
2. Read this README for what's built and what's still open.
3. The next step is Phase 2: OData V4 service design over `ZCL_GRN_DASH_QUERY`, then the UI5
   shell app. Nothing in Phase 2 has been started yet.
