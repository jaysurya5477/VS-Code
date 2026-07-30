@EndUserText.label: 'GRN Dashboard - Ratios'
// See ZMM_GRN_DASH_KPI's header comment for the parameter-vs-$filter
// rationale and call pattern - identical here.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_GRN_DASH_RATIO_QRY'
@UI.headerInfo: { typeName: 'Ratio', typeNamePlural: 'Ratios' }
define custom entity ZMM_GRN_DASH_RATIO
  with parameters
    P_DateFrom : zmm_grn_dash_date,
    P_DateTo   : zmm_grn_dash_date,
    P_Vendor   : zmm_grn_dash_flt,
    P_Material : zmm_grn_dash_flt,
    P_Plant    : zmm_grn_dash_flt,
    P_DocType  : zmm_grn_dash_flt,
    P_Uom      : zmm_grn_dash_flt
{
  key ID         : abap.char(20);
      RatioLabel : abap.char(60);
      RatioValue : abap.dec(8,2);
}
