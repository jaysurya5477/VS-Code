@EndUserText.label: 'GRN Dash. - Top 20 materials by GRN val'
// See ZMM_GRN_DASH_KPI's header comment for the parameter-vs-$filter
// rationale and call pattern - identical here.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_MAT_TOP20_QRY'
@UI.headerInfo: { typeName: 'Material', typeNamePlural: 'Top Materials' }
define custom entity ZMM_GRN_DASH_MATERIAL_TOP20
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
      Value        : abap.dec(15,2);
      // Sum of Value across every material in scope, before the top-20 cut -
      // repeated on every row so "% of total value" divides by the true scope
      // total rather than just this top-20 subset's own sum.
      GrandTotal   : abap.dec(15,2);
}
