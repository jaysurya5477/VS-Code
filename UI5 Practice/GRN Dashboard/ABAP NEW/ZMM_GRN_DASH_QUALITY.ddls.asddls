@EndUserText.label: 'GRN Dashboard - Quality buckets'
// See ZMM_GRN_DASH_KPI's header comment for the parameter-vs-$filter
// rationale and call pattern - identical here.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_QUALITY_QRY'
@UI.headerInfo: { typeName: 'Quality Bucket', typeNamePlural: 'Quality Buckets' }
define custom entity ZMM_GRN_DASH_QUALITY
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt
{
  key Bucket    : abap.char(30);
      Qty       : abap.dec(15,3);
      SharePct  : abap.dec(8,2);
}
