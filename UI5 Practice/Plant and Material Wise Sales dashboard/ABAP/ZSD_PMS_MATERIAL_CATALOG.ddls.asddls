@EndUserText.label: 'PMS Dashboard - material filter catalog'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - see
// ZSD_PMS_KPI.ddls.asddls's header comment for the full parameter
// rationale and DDIC-prerequisite note, which applies identically here.
//
// Every distinct material billing in the filtered scope, uncapped - feeds
// the Material filter dropdown. Deliberately NOT ZSD_PMS_MATERIAL (Top 20
// by value): that cap is real and load-bearing for the chart panel and
// must never limit what a user can pick in the filter itself.
// ZCL_PMS_DASH_QUERY=>get_material_catalog builds this from the same
// in-scope billing items, just without the cap and without the
// value/qty/GST aggregates the chart needs. Bismt (old material number)
// is carried through for the same search convenience as ZSD_PMS_MATERIAL.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_MATERIAL_CATALOG_QRY'
@UI.headerInfo: { typeName: 'Material', typeNamePlural: 'Materials' }
define custom entity ZSD_PMS_MATERIAL_CATALOG
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
  key Matnr : abap.char(18);
      Arktx : abap.char(40);
      // Old material number (MARA-BISMT) - display/search convenience in the Material
      // filter only; the filter still sends Matnr as P_Material.
      Bismt : abap.char(18);
}
