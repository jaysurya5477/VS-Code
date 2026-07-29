@EndUserText.label: 'GRN Dashboard - OData V4'
// Service definition. Bind this with a Service Binding of type
// "OData V4 - UI" (or Web API) in ADT to publish the service - see
// README.md in this folder (Phase 2 section) for the full build order
// and test URLs.
define service ZMM_GRN_DASH_O4 {
  expose ZMM_GRN_DASH_KPI                 as KPI;
  expose ZMM_GRN_DASH_QUALITY              as Quality;
  expose ZMM_GRN_DASH_RATIO                as Ratio;
  expose ZMM_GRN_DASH_TREND                as Trend;
  expose ZMM_GRN_DASH_VENDOR_TOP10         as VendorTop10;
  expose ZMM_GRN_DASH_PLANT_TOP10          as PlantTop10;
  expose ZMM_GRN_DASH_MATERIAL_TOP20       as MaterialTop20;
  expose ZMM_GRN_DASH_DOCTYPE_RANKED       as DoctypeRanked;
  expose ZMM_GRN_DASH_MAT_REJ_WORST10 as MaterialRejWorst10;
  expose ZMM_GRN_DASH_VENDOR_SCORECARD     as VendorScorecard;
}
