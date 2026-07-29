@EndUserText.label: 'GRN Dashboard - Receipt flow over time'
// See ZMM_GRN_DASH_KPI's header comment for the parameter-vs-$filter
// rationale and call pattern - identical here. Period is YYYYMM, one row
// per month in range. No QtyZ23/ValZ23 - rework has no cancellation
// counterpart (confirmed with the business owner, see
// ZCL_GRN_DASH_QUERY's header and FS section 6.2).
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_TREND_QRY'
@UI.headerInfo: { typeName: 'Trend Period', typeNamePlural: 'Trend Periods' }
define custom entity ZMM_GRN_DASH_TREND
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt
{
  key Period  : abap.numc(6);
      Qty101  : abap.dec(15,3);
      Qty102  : abap.dec(15,3);
      QtyZ22  : abap.dec(15,3);
      Val101  : abap.dec(15,2);
      Val102  : abap.dec(15,2);
      ValZ22  : abap.dec(15,2);
      NetQty  : abap.dec(15,3);
      NetVal  : abap.dec(15,2);
}
