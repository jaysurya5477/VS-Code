@EndUserText.label: 'PMS Dashboard - plant filter catalog'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - see
// ZSD_PMS_KPI.ddls.asddls's header comment for the full parameter
// rationale and DDIC-prerequisite note, which applies identically here.
//
// Every distinct plant billing in the filtered scope, uncapped - feeds the
// Plant filter dropdown. Deliberately NOT ZSD_PMS_PLANT (Top 20 by net
// value): that cap is real and load-bearing for the chart panel
// (production has ~109 billing plants) and must never limit what a user
// can pick in the filter itself. ZCL_PMS_DASH_QUERY=>get_plant_catalog
// builds this from the same in-scope GL rows, just without the cap and
// without the net/tax/gross aggregates the chart needs.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_PLANT_CATALOG_QRY'
@UI.headerInfo: { typeName: 'Plant', typeNamePlural: 'Plants' }
define custom entity ZSD_PMS_PLANT_CATALOG
  with parameters
    P_Fy       : gjahr,
    P_DateFrom : zsd_pms_date,
    P_DateTo   : zsd_pms_date,
    P_Zone     : zsd_pms_flt,
    P_State    : zsd_pms_flt,
    P_Plant    : zsd_pms_flt,
    P_Material : zsd_pms_flt,
    P_Scheme   : zsd_pms_flt,
    P_Period   : zsd_pms_flt
{
  key Werks : abap.char(4);
      City  : abap.char(40);
}
