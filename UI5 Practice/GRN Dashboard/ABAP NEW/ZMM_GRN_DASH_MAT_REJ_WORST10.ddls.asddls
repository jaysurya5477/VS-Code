@EndUserText.label: 'GRN Dash. - Worst 10 mat. by rejection'
// See ZMM_GRN_DASH_KPI's header comment for the parameter-vs-$filter
// rationale and call pattern - identical here.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_MAT_REJ_W10_QRY'
@UI.headerInfo: { typeName: 'Material', typeNamePlural: 'Worst Rejection Rate Materials' }
define custom entity ZMM_GRN_DASH_MAT_REJ_WORST10
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt,
    P_Uom      : zmm_grn_dash_flt
{
  key Material     : matnr;
      MaterialName : txz01;
      RejQty       : abap.dec(15,3);
      RejPct       : abap.dec(8,2);
}
