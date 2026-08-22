@EndUserText.label: 'PMS Dashboard - sales by plant'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - see
// ZSD_PMS_KPI.ddls.asddls's header comment for the full parameter
// rationale and DDIC-prerequisite note, which applies identically here.
//
// Top 20 plants by net value (stacked Net+Tax=Gross) - the cap is real
// and load-bearing, not a display truncation (production has ~109
// billing plants). No YoY - not shown by the template for this panel.
// ZCL_PMS_DASH_QUERY=>get_plant_top20 already returns this pre-sorted by
// NetValue descending and pre-capped at 20 rows.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_PLANT_QRY'
@UI.headerInfo: { typeName: 'Plant', typeNamePlural: 'Plants' }
define custom entity ZSD_PMS_PLANT
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
  key Werks       : abap.char(4);
      City        : abap.char(40);
      PlantName   : abap.char(40);
      NetValue    : abap.dec(15,2);
      TaxValue    : abap.dec(15,2);
      GrossValue  : abap.dec(15,2);
}
