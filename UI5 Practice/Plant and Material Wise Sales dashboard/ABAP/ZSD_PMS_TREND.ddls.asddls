@EndUserText.label: 'PMS Dashboard - net-value trend'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - see
// ZSD_PMS_KPI.ddls.asddls's header comment for the full parameter
// rationale and DDIC-prerequisite note (ZSD_PMS_DATE/ZSD_PMS_FLT), which
// applies identically here.
//
// 1 row per FY-period actually present in scope (Apr=1..Mar=12, OD-7) -
// a partial-year FY simply has fewer rows. ZCL_PMS_DASH_QUERY=>get_trend
// already returns this pre-sorted by Period ascending.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_TREND_QRY'
@UI.headerInfo: { typeName: 'Trend Point', typeNamePlural: 'Trend Points' }
define custom entity ZSD_PMS_TREND
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
  key Period   : abap.numc(2);
      NetValue : abap.dec(15,2);
}
