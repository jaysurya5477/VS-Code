@EndUserText.label: 'GRN Dash. - Top 10 plants, quality comp.'
// See ZMM_GRN_DASH_KPI's header comment for the parameter-vs-$filter
// rationale and call pattern - identical here.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_PLANT_TOP10_QRY'
@UI.headerInfo: { typeName: 'Plant', typeNamePlural: 'Top Plants' }
define custom entity ZMM_GRN_DASH_PLANT_TOP10
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt,
    P_Uom      : zmm_grn_dash_flt
{
  key Plant        : werks_d;
      TotalQty     : abap.dec(15,3);
      AcceptedPct  : abap.dec(8,2);
      RejectedPct  : abap.dec(8,2);
      SamplePct    : abap.dec(8,2);
      InspectPct   : abap.dec(8,2);
}
