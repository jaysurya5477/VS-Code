@EndUserText.label: 'GRN Dash. - Top 10 vendors by GRN value'
// See ZMM_GRN_DASH_KPI's header comment for the parameter-vs-$filter
// rationale and call pattern - identical here. Same row shape as
// ZMM_GRN_DASH_VENDOR_SCORECARD (both sourced from ZCL_GRN_DASH_QUERY's
// ty_vendor_row), kept as separate entities because they are separately
// ranked/truncated by the engine (top 10 by value here; top 15 by score
// in the scorecard) - not the same result set at different $top values.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_VENDOR_TOP10_QRY'
@UI.headerInfo: { typeName: 'Vendor', typeNamePlural: 'Top Vendors' }
define custom entity ZMM_GRN_DASH_VENDOR_TOP10
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt
{
  key Vendor     : lifnr;
      VendorName : name1_gp;
      Qty        : abap.dec(15,3);
      NetQty     : abap.dec(15,3);
      Value      : abap.dec(15,2);
      RejPct     : abap.dec(8,2);
      ReworkPct  : abap.dec(8,2);
      Score      : abap.dec(8,0);
}
