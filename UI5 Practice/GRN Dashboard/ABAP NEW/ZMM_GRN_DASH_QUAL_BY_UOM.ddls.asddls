@EndUserText.label: 'GRN Dash. - Qualif. card breakdwn by UoM'
// Always-on per-UoM breakdown backing each qualification card's per-UoM
// table (GRN Dashboard v3 requirement). Like ZMM_GRN_DASH_KPI_BY_UOM,
// deliberately has no P_Uom parameter - always returns every UoM x all
// 5 buckets (Accepted/Rejected/Sample/Under Inspection/Rework)
// regardless of the dashboard's UoM picker selection.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_QUAL_UOM_QRY'
@UI.headerInfo: { typeName: 'UoM Breakdown', typeNamePlural: 'Quality UoM Breakdown' }
define custom entity ZMM_GRN_DASH_QUAL_BY_UOM
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt
{
  key Bucket : abap.char(30);
  key Uom    : meins;
      Qty    : abap.dec(15,3);
}
