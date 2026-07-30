@EndUserText.label: 'GRN Dashboard - Hero KPI breakdown by UoM'
// Always-on per-UoM breakdown backing the hero KPI cards' "full split
// below" table (GRN Dashboard v3 requirement). Deliberately has NO
// P_Uom parameter, unlike every other GRN Dashboard entity - this one
// must always return every UoM regardless of the dashboard's UoM
// picker selection, which only ever filters the other entities (see
// ZCL_GRN_DASH_QUERY=>get_kpi_by_uom's header comment).
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_KPI_UOM_QRY'
@UI.headerInfo: { typeName: 'UoM Breakdown', typeNamePlural: 'KPI UoM Breakdown' }
define custom entity ZMM_GRN_DASH_KPI_BY_UOM
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt
{
  key Uom        : meins;
      GrossQty   : abap.dec(15,3);
      GrossValue : abap.dec(15,2);
      NetQty     : abap.dec(15,3);
      NetValue   : abap.dec(15,2);
}
