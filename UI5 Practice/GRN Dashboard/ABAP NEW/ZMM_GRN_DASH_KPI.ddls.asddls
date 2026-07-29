@EndUserText.label: 'GRN Dashboard - KPI cards'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - the data is
// computed in ABAP by ZCL_GRN_DASH_QUERY (reused as-is, see FS section 6),
// the query is delegated to ZCL_GRN_DASH_KPI_QRY.
//
// Filters follow ZCL_GRN_DASH_QUERY=>ty_filters exactly: two obligatory
// date parameters, plus four optional multi-value parameters (comma-
// separated, blank = all) for Vendor/Material/Plant/PO Doc. Type - modelled
// as parameters rather than $filter because they scope the WHOLE
// computation (every KPI/ratio/chart), not just this one entity's own
// output columns, and most of the 10 GRN Dashboard entities (this one
// included) carry no vendor/material/plant/doctype column of their own to
// filter on. Call as:
//   ZMM_GRN_DASH_KPI(P_DateFrom=2026-01-01,P_DateTo=2026-07-28,
//                   P_Vendor='',P_Material='',P_Plant='',P_DocType='')/Set
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_KPI_QRY'
@UI.headerInfo: { typeName: 'KPI', typeNamePlural: 'KPIs' }
define custom entity ZMM_GRN_DASH_KPI
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt
{
  key ID         : abap.char(20);
      KpiLabel   : abap.char(60);
      CurrValue  : abap.dec(15,2);
      PriorValue : abap.dec(15,2);
      DeltaPct   : abap.dec(8,2);
}
