@EndUserText.label: 'PMS Dashboard - scheme performance'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - see
// ZSD_PMS_KPI.ddls.asddls's header comment for the full parameter
// rationale and DDIC-prerequisite note, which applies identically here.
//
// 1 row per scheme (category) - ADIP, ADIP SSA, etc. (8 real values, see
// CONTEXT_LOG.md sec.3). SharePct is share of the FULL filtered scope's
// net value, not just the rows returned (there is no top-N cap on this
// panel, unlike Plant/Material).
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_SCHEME_QRY'
@UI.headerInfo: { typeName: 'Scheme', typeNamePlural: 'Schemes' }
define custom entity ZSD_PMS_SCHEME
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
  key Category      : abap.char(10);
      CatDesc       : abap.char(40);
      NetValue      : abap.dec(15,2);
      SharePct      : abap.dec(8,2);
      InvoiceCount  : abap.int4;
      DeltaPct      : abap.dec(8,2);
}
