@EndUserText.label: 'PMS Dashboard - map dots by Unit'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - see
// ZSD_PMS_KPI.ddls.asddls's header comment for the full parameter
// rationale and DDIC-prerequisite note, which applies identically here.
// See ZSD_PMS_GEO.ddls.asddls's header for why this is a separate entity
// rather than a "Granularity" slice of that one.
//
// 1 row per Unit (OD-3, <=18 in production), NOT per plant - map-dot
// aggregation key. Coordinates are a value-weighted centroid of the
// Unit's member plants (OD-5) - a Unit with no coordinate data on any
// member plant is omitted entirely by ZCL_PMS_DASH_QUERY=>get_unit_dots,
// so Latitude/Longitude are never blank on a row that IS returned.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_UNIT_DOTS_QRY'
@UI.headerInfo: { typeName: 'Unit Dot', typeNamePlural: 'Unit Dots' }
define custom entity ZSD_PMS_UNIT_DOTS
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
  key UnitCode    : abap.char(10);   // "Unit" alone is a reserved word, same issue as KPI's "Label"
      // ZSD_ZONE_PLANT-REMARKS, exposed as "city" on ZSDD_PMS_GL_CDS. That table holds one
      // row per Unit (see the GL CDS header), so REMARKS is the Unit's own descriptive name,
      // not a per-plant value - it needs no aggregation, just carrying through.
      UnitName    : abap.char(40);
      NetValue    : abap.dec(15,2);
      PriorValue  : abap.dec(15,2);
      DeltaPct    : abap.dec(8,2);
      Latitude    : abap.dec(10,7);
      Longitude   : abap.dec(10,7);
      PlantCount  : abap.int4;
}
