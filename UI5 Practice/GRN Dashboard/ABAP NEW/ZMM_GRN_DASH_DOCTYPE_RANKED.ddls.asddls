@EndUserText.label: 'GRN Dash. - GRN value by PO doc ty. rank'
// See ZMM_GRN_DASH_KPI's header comment for the parameter-vs-$filter
// rationale and call pattern - identical here.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_DOCTYPE_RANK_QRY'
@UI.headerInfo: { typeName: 'Doc. Type', typeNamePlural: 'Doc. Types' }
define custom entity ZMM_GRN_DASH_DOCTYPE_RANKED
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt
{
  key DocType     : esart;
      DocTypeName : batxt;
      Value       : abap.dec(15,2);
}
