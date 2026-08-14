@EndUserText.label: 'PMS Dashboard - KPI cards'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - the data is
// computed in ABAP by ZCL_PMS_DASH_QUERY (Phase 1, tested via
// ZSD_PMS_DASH_TEST.prog.abap), the query is delegated to ZCL_PMS_KPI_QRY.
// Pattern mirrors the GRN Dashboard's own Phase 2 (../GRN Dashboard/ABAP
// NEW/ZMM_GRN_DASH_KPI.ddls.asddls) exactly.
//
// Filters follow ZCL_PMS_DASH_QUERY=>ty_filters exactly: P_Fy is the only
// obligatory-in-spirit one (blank = current FY, via
// ZCL_PMS_DASH_QUERY=>default_filters - see each query provider's SELECT
// method), the rest are optional (blank = no restriction). P_Zone/P_State/
// P_Plant/P_Material/P_Scheme/P_Period are comma-separated multi-value
// strings, same convention as GRN's P_Vendor/P_Material/P_Plant/P_DocType.
// Modelled as parameters rather than $filter because they scope the WHOLE
// computation (every KPI/trend/geo/scheme/plant/material panel comes from
// one filtered extraction - see ZCL_PMS_DASH_QUERY's own header), not just
// this one entity's own output columns - most of the 7 PMS Dashboard
// entities (this one included) carry no zone/state/plant/material/scheme
// column of their own to filter on. Call as:
//   ZSD_PMS_KPI(P_Fy='',P_DateFrom='',P_DateTo='',P_Zone='',P_State='',
//               P_Plant='',P_Material='',P_Scheme='',P_Period='')/Set
//
// PREREQUISITE (must exist before this entity can activate - mirrors GRN's
// own documented gotcha exactly): create two DDIC data elements first,
// ZSD_PMS_DATE (built on DATS) and ZSD_PMS_FLT (built on CHAR, length 1000
// - wider than the Part B plan's original CHAR255 guess, because a
// P_Plant CSV list can realistically span all ~109 production plants).
// Parameters MUST reference real DDIC data elements, not inline built-in
// types (dats, abap.char(1000)) - using the built-ins compiles and
// activates fine, but Service Binding creation then fails with
// "Parameter P_XXX has no data type" for every parameter on every entity
// (a RAP/ADT limitation on custom-entity "with parameters" typing, not
// specific to this project - GRN hit the exact same thing).
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_KPI_QRY'
@UI.headerInfo: { typeName: 'KPI', typeNamePlural: 'KPIs' }
define custom entity ZSD_PMS_KPI
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
  key Id           : abap.char(20);
      KpiLabel     : abap.char(60);   // "Label" alone is a reserved word - see GRN's own ZMM_GRN_DASH_KPI
      CurrValue    : abap.dec(15,2);
      PriorValue   : abap.dec(15,2);
      DeltaPct     : abap.dec(8,2);
      SnapshotDate : abap.dats;    // OD-1c: only populated for the "Yesterday Sale" row
      DocCount     : abap.int4;
}
