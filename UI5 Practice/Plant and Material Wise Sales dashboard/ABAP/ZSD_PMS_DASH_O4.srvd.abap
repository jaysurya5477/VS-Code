@EndUserText.label: 'Plant & Mat. Wise Sales Dash. - OData V4'
define service ZSD_PMS_DASH_O4 {
  expose ZSD_PMS_KPI as KPI;
  expose ZSD_PMS_TREND as Trend;
  expose ZSD_PMS_GEO as Geo;
  expose ZSD_PMS_UNIT_DOTS as UnitDots;
  expose ZSD_PMS_SCHEME as Scheme;
  expose ZSD_PMS_PLANT as Plant;
  expose ZSD_PMS_PLANT_CATALOG as PlantCatalog;
  expose ZSD_PMS_MATERIAL as Material;
  expose ZSD_PMS_MATERIAL_CATALOG as MaterialCatalog;
}