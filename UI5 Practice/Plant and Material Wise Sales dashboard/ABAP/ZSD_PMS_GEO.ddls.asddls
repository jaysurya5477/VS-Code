@EndUserText.label: 'PMS Dashboard - India map by state'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - see
// ZSD_PMS_KPI.ddls.asddls's header comment for the full parameter
// rationale and DDIC-prerequisite note, which applies identically here.
//
// 1 row per state (OD-1: plant-based geography, not customer-based).
// Zone is carried as an attribute so the frontend can roll this up to
// zone granularity by summing.
//
// NOTE: the original Part B sketch (ABAP_Backend_Plan.md) planned for a
// single ZSD_PMS_GEO entity to also carry the Unit map-dot slice via a
// "Granularity" parameter. Phase 1 as actually built and tested
// (ZCL_PMS_DASH_QUERY=>get_dashboard_data) returns state rows and Unit-dot
// rows as two structurally different sub-tables (geo vs. unit_dots -
// different fields, e.g. dots have Latitude/Longitude and no InvoiceCount,
// states have InvoiceCount and no coordinates) - merging them into one
// UNION-compatible shape would need new, untested reshaping in the compute
// class. Exposing them as two separate entities (this one +
// ZSD_PMS_UNIT_DOTS) instead matches what Phase 1 actually returns and
// keeps this Phase 2 layer a thin pass-through, per the "one entity per
// result shape" convention this project mirrors from the GRN Dashboard.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_GEO_QRY'
@UI.headerInfo: { typeName: 'State', typeNamePlural: 'States' }
define custom entity ZSD_PMS_GEO
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
  key Regio         : abap.char(3);
      StateText     : abap.char(40);
      AlmZone       : abap.char(10);   // "Zone" alone is a reserved word, same issue as KPI's "Label"
      NetValue      : abap.dec(15,2);
      PriorValue    : abap.dec(15,2);
      DeltaPct      : abap.dec(8,2);
      PlantCount    : abap.int4;
      InvoiceCount  : abap.int4;
}
