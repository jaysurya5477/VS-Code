@EndUserText.label: 'GRN Dashboard - Vendor scorecard, top 15'
// See ZMM_GRN_DASH_VENDOR_TOP10's header comment - same row shape, different
// ranking/truncation (top 15 by Score here, vs. top 10 by Value there).
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_VENDOR_SCORE_QRY'
@UI.headerInfo: { typeName: 'Vendor', typeNamePlural: 'Vendor Scorecard' }
define custom entity ZMM_GRN_DASH_VENDOR_SCORECARD
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
