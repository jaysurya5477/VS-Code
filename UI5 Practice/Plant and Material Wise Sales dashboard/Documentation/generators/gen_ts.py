# -*- coding: utf-8 -*-
import sys
from docbuild import Doc

d = Doc("Plant & Material Wise Sales Dashboard",
        "Technical Documentation",
        "Application: ZSD_PMS_DASH   |   Version 1.0   |   August 2026")

# ============================================================== 1 ============
d.h1("1.  Purpose and Scope")
d.p("This document describes the technical construction of the Plant & Material Wise Sales "
    "Dashboard (SAP application ID ZSD_PMS_DASH). It is written for ABAP and SAP UI5 developers "
    "who need to maintain, extend or troubleshoot the application. It covers the two CDS fact "
    "views, the central compute class, the nine CDS custom entities exposed through one OData V4 "
    "service, the UI5 read layer and view model, and the custom controls that render the "
    "dashboard.")
d.p("For the business meaning of the KPIs and the configuration that drives them, refer to the "
    "Functional Documentation. For day-to-day operation of the screen, refer to the User Manual.")

d.h2("1.1  Component Summary")
d.spec([
    ("Application ID", "ZSD_PMS_DASH"),
    ("UI5 namespace", "com.sap.zsdpmsdash"),
    ("Repository folder", "Plant and Material Wise Sales dashboard/zsd_pms_dash"),
    ("Application type", "SAPUI5 freestyle (MVC), generated from @sap/generator-fiori:basic 1.21.0"),
    ("Minimum UI5 version", "1.102.8"),
    ("SAP libraries used", "sap.m, sap.ui.core"),
    ("Charting library", "Apache ECharts (bundled locally at webapp/libs/echarts.min.js)"),
    ("Theme", "sap_horizon"),
    ("OData service", "ZSD_PMS_DASH_O4, OData V4, nine entity sets"),
    ("ABAP package", "ZSD_PMSD"),
    ("Transport", "MEDK913313"),
    ("Backend host", "https://vhafbmedap01.hec.erp.alimco.in, client 120"),
    ("Currency presentation", "Indian Rupees; values displayed in Crore (Cr) and Lakh (L)"),
])

# ============================================================== 2 ============
d.h1("2.  Solution Architecture")
d.p("The dashboard is a three-layer solution. Two CDS fact views expose billing data at two "
    "different grains. A single ABAP compute class reads both, applies every filter once and "
    "performs ALL aggregation in memory. Nine thin RAP query provider classes sit behind nine CDS "
    "custom entities, each returning one slice of that computation, and one service definition "
    "publishes them as a single OData V4 service. The UI5 layer issues nine parallel reads, folds "
    "them into one $batch, and renders through custom controls rather than Fiori smart controls.")
d.callout("Why filters are entity parameters", "Every filter scopes the whole computation, not a "
          "row set — the prior-year comparison window, the daily snapshot date and the "
          "material-to-G/L resolution all depend on them. They therefore travel as entity "
          "PARAMETERS in the resource path, never as $filter.")

d.h2("2.1  Layer Map")
d.table(["Layer", "Object", "Responsibility"], [
    ["Database / Source", "ZSD_SALE_ALL", "Billing lines at G/L account grain — net, tax, gross, scheme, plant, sales office"],
    ["Database / Source", "ZSD_ZONE_PLANT", "Sales office to zone / Unit mapping, plus Unit name (Remarks) and latitude/longitude"],
    ["Database / Source", "T001W / T005U", "Plant master region, and its English state text"],
    ["Database / Source", "VBRP / VBRK / MARA", "Billing items, billing header, and material master (old material number)"],
    ["Database / Source", "PRCD_ELEMENTS", "Pricing conditions — per-item GST/TCS, and the G/L account each condition posts to"],
    ["CDS", "ZSDD_PMS_GL_CDS", "G/L-grain fact view — feeds KPIs, trend, map, scheme and plant panels"],
    ["CDS", "ZSDD_PMS_ITEM_CDS", "Item-grain fact view — feeds the material panel only"],
    ["ABAP", "ZCL_PMS_DASH_QUERY", "Central compute class — all filtering and all aggregation"],
    ["ABAP", "ZSD_PMS_* (9 custom entities)", "Typed OData shapes with the nine filter parameters"],
    ["ABAP", "ZCL_PMS_*_QRY (9 classes)", "IF_RAP_QUERY_PROVIDER shells — parameter parsing, paging, mapping"],
    ["Service", "ZSD_PMS_DASH_O4", "One OData V4 service definition exposing all nine entities"],
    ["UI5", "Component.js / manifest.json", "Bootstrap, router, OData V4 model (earlyRequests, autoExpandSelect)"],
    ["UI5", "model/dashboardService.js", "Read layer — builds parameterised paths, reads all nine sets"],
    ["UI5", "controller/zsd_pms_dash.controller.js", "Filter staging, catalog merging, KPI/scope derivation, render orchestration"],
    ["UI5", "view/zsd_pms_dash.view.xml", "Fiori filter bar plus custom-control panels"],
    ["UI5", "control/*.js", "Nine custom controls carrying the prototype's own markup"],
    ["UI5", "css/style.css", "Card, grid, map and KPI styling; light and dark token sets"],
])

d.h2("2.2  Request Flow at Startup")
d.numbers([
    "index.html bootstraps sap-ui-core.js with theme sap_horizon and resource root com.sap.zsdpmsdash.",
    "ComponentSupport instantiates Component.js, which initialises the router and the OData V4 model declared in manifest.json (preload true, earlyRequests true).",
    "The router resolves route Routezsd_pms_dash and renders view zsd_pms_dash.",
    "onInit builds the client-side JSON model named \"dash\", holding the fiscal year, the dropdown option lists, KPI placeholders, map state and the scope line.",
    "onInit calls _wireMaterialSearch(), which installs a custom filterFunction on the Material MultiComboBox so it can also be searched by old material number.",
    "appTheme.apply() resolves the light or dark token set and attaches a change listener.",
    "Promise.all([echartsLoader.load(), chartTheme.get()]) loads the vendored ECharts bundle and resolves the chart palette from the CSS custom properties.",
    "Once both resolve, _loadData() runs for the first and only automatic time — this is the single point at which the dashboard loads without the user pressing Go.",
    "dashboardService.readAll() issues nine parallel reads on the default $auto group, which UI5 folds into one $batch round trip.",
    "_render() transforms the response into the dash model, merges the filter catalogs, and rebuilds every panel.",
])
d.callout("Only one load in flight", "_loadData guards on a _bLoading flag. A second request "
          "arriving while one is in flight sets _bReloadQueued instead of overlapping, and is "
          "replayed from the finally() block once the first completes.")

# ============================================================== 3 ============
d.h1("3.  Data Model — CDS Views")

d.h2("3.1  ZSDD_PMS_GL_CDS — Sales at G/L Grain")
d.p("One row per ZSD_SALE_ALL line, keyed BELNR / GJAHR / HKONT — that is, one row per G/L "
    "account line, NOT one row per billing document. Every join outward from it is LEFT OUTER, so "
    "a plant missing its mapping or its region still contributes its sales.")
d.code("define view ZSDD_PMS_GL_CDS as\n"
       "select from zsd_sale_all as a\n"
       "  left outer join zsd_zone_plant as b on b.werks = a.vkbur\n"
       "  -- the UNIT's plant master (preferred) ...\n"
       "  left outer join t001w          as c on c.werks = b.werks\n"
       "  -- ... and the BILLING plant's (fallback)\n"
       "  left outer join t001w          as e on e.werks = a.werks\n"
       "  left outer join t005u          as d on d.land1 = 'IN'\n"
       "                                     and d.bland = c.regio\n"
       "                                     and d.spras = 'E'\n"
       "  left outer join t005u          as f on f.land1 = 'IN'\n"
       "                                     and f.bland = e.regio\n"
       "                                     and f.spras = 'E'\n"
       "{ ...\n"
       "  coalesce(c.regio, e.regio) as regio,\n"
       "  coalesce(d.bezei, f.bezei) as state_text }")
d.callout("The join key is VKBUR, not WERKS", "ZSD_ZONE_PLANT is joined on the SALES OFFICE "
          "(a.vkbur), not the billing plant. Despite its column being named WERKS, that table "
          "holds one row per UNIT. Joining on a.werks silently mis-attributes every Unit. "
          "a.vkbur is therefore not exposed as its own output column — it would simply "
          "duplicate b.werks.")
d.callout("State is the UNIT's, with the BILLING plant as a fallback (OD-10)", "Until 2026-08-18 "
          "the state came from a.werks alone, while zone, Unit, city and the dot coordinates all "
          "came from a.vkbur. Those two keys are independent — plant-to-unit is many-to-many — so "
          "a document billed by one plant and sold through another Unit put its state in a zone it "
          "had nothing to do with. Measured in production on 2026-08-18: the East zone reported 38 "
          "billing plants across 14 states for its 5 units, which painted Uttar Pradesh and "
          "Karnataka as East and made a Zone = East filter shade half the country.")
d.callout("Why COALESCE and not simply the Unit's state", "Taking the Unit's state alone was tried "
          "first and reverted. VKBUR only began in FY 2026, so FY 2025 rows mostly carry a blank "
          "one; those rows would have lost their state outright and dropped off the map, taking "
          "every prior-year state comparison with them. The fallback keeps them exactly where they "
          "are today, at their billing plant, while FY 2026 rows become consistent with the zone "
          "and dot beside them. It also de-risks the join: ZSD_ZONE_PLANT-WERKS is misleadingly "
          "named — it holds one row per Unit — so if it does not resolve in T001W at all, c.regio "
          "is simply always null and every row falls back. The failure mode is 'no improvement', "
          "not 'empty choropleth'. Both joins are plain field-to-field, so the coalesce sits only "
          "in the SELECT list and never in an ON condition.")
d.callout("Not yet activated", "This revision exists in ../ABAP/ZSDD_PMS_GL_CDS.ddls.asddls but has "
          "not been activated or transported. Until it is active in MEP the production choropleth "
          "keeps showing Uttar Pradesh and Karnataka under East. Activation order: ZSDD_PMS_GL_CDS, "
          "then ZCL_PMS_DASH_QUERY, then ZSD_PMS_SCHEME / ZCL_PMS_SCHEME_QRY, then republish "
          "ZSD_PMS_DASH_O4 — in both MED and MEP.")
d.h3("Key and Exposed Fields")
d.table(["Field", "Source", "Type / Note"], [
    ["belnr (key)", "a.belnr", "Accounting document number"],
    ["gjahr (key)", "a.gjahr", "Fiscal year — GJAHR Y means Apr Y to Mar Y+1"],
    ["hkont (key)", "a.hkont", "G/L account — the key the material bridge matches on"],
    ["vbeln", "a.vbeln", "Billing document; repeats across many G/L lines"],
    ["fkart / vtext", "a.fkart / a.vtext", "Billing type and its description"],
    ["category / cat_desc", "a.category / a.cat_desc", "Scheme code and description"],
    ["type", "a.type", "Credit-memo indicator carried through from the source"],
    ["month_num", "a.month_num", "PLAIN CALENDAR month (Apr=04 … Mar=03), not an FY period"],
    ["zmonth", "a.zmonth", "Month name"],
    ["budat", "a.budat", "Posting date — drives the date range and the daily KPI"],
    ["netwr / mwsbk / gross", "a.netwr / a.mwsbk / a.gross", "Net, tax and gross value"],
    ["kunnr / kname", "a.kunnr / a.kname", "Customer number and name — carried, not reported on"],
    ["werks", "a.werks", "Billing plant — the plant panel and the Plant filter. NOT the geography key"],
    ["alm_zone", "b.alm_zone", "Zone code. Type unconfirmed; treated as a CHAR10 placeholder"],
    ["unit", "b.werks", "Unit code — the map-dot aggregation key, 18 in production"],
    ["city", "b.remarks", "Unit name, shown on the map callouts and hover card"],
    ["latitude / longitude", "b.latitude / b.longitude", "DEC(10,7) — the Unit's coordinates"],
    ["regio", "coalesce(c.regio, e.regio)", "The UNIT's state code, falling back to the billing plant's (OD-10)"],
    ["state_text", "coalesce(d.bezei, f.bezei)", "English state name, from whichever of the two resolved"],
])

d.h2("3.2  ZSDD_PMS_ITEM_CDS — Materials at Item Grain")
d.p("One row per billing item (VBELN / POSNR). Feeds the Sales-by-material panel and the Material "
    "filter catalog, and nothing else.")
d.code("define view ZSDD_PMS_ITEM_CDS as\n"
       "select from vbrp as a\n"
       "  inner join      vbrk as b on b.vbeln = a.vbeln\n"
       "  left outer join mara as c on c.matnr = a.matnr\n"
       "  ...\n"
       "where a.matnr <> ' '")
d.p("It carries knumv_ana specifically so that ZCL_PMS_DASH_QUERY can query PRCD_ELEMENTS "
    "directly without a second round trip to VBRP, and bismt so the Material filter can be "
    "searched by old material number.")
d.callout("PRCD_ELEMENTS is deliberately NOT joined here", "An item can carry an IGST row, an SGST "
          "row and several TCS rows. Joining the conditions into this view would fan a clean "
          "one-row-per-item grain out to one row per item per condition type — the same "
          "double-count this architecture exists to avoid, one level down. The conditions are "
          "queried separately and pivoted in ABAP by get_item_tax( ) instead.")

d.h2("3.3  Trap 1 — Why the Two Views Are Never Joined")
d.p("ZSD_SALE_ALL carries no material and no quantity, and its grain is the G/L account line. "
    "Joining VBRP onto it multiplies rows and double-counts every net, tax and gross figure on "
    "the screen. The two facts are extracted independently, filtered independently, and "
    "aggregated independently. The single point of contact between them is "
    "resolve_material_gl_keys( ), described in 5.5.")

# ============================================================== 4 ============
d.h1("4.  Custom Entities and the OData V4 Service")

d.h2("4.1  Service Definition")
d.code("define service ZSD_PMS_DASH_O4 {\n"
       "  expose ZSD_PMS_KPI               as KPI;\n"
       "  expose ZSD_PMS_TREND             as Trend;\n"
       "  expose ZSD_PMS_GEO               as Geo;\n"
       "  expose ZSD_PMS_UNIT_DOTS         as UnitDots;\n"
       "  expose ZSD_PMS_SCHEME            as Scheme;\n"
       "  expose ZSD_PMS_PLANT             as Plant;\n"
       "  expose ZSD_PMS_PLANT_CATALOG     as PlantCatalog;\n"
       "  expose ZSD_PMS_MATERIAL          as Material;\n"
       "  expose ZSD_PMS_MATERIAL_CATALOG  as MaterialCatalog;\n"
       "}")

d.h2("4.2  The Nine Entity Sets")
d.table(["Entity set", "Custom entity", "Query provider", "Grain"], [
    ["KPI", "ZSD_PMS_KPI", "ZCL_PMS_KPI_QRY", "4 rows — NET, TAX, GROSS, DAILY_SALE"],
    ["Trend", "ZSD_PMS_TREND", "ZCL_PMS_TREND_QRY", "One row per FY period present"],
    ["Geo", "ZSD_PMS_GEO", "ZCL_PMS_GEO_QRY", "One row per state"],
    ["UnitDots", "ZSD_PMS_UNIT_DOTS", "ZCL_PMS_UNIT_DOTS_QRY", "One row per Unit with coordinates"],
    ["Scheme", "ZSD_PMS_SCHEME", "ZCL_PMS_SCHEME_QRY", "One row per scheme"],
    ["Plant", "ZSD_PMS_PLANT", "ZCL_PMS_PLANT_QRY", "Top 20 plants by net value"],
    ["PlantCatalog", "ZSD_PMS_PLANT_CATALOG", "ZCL_PMS_PLANT_CATALOG_QRY", "Every plant in scope, uncapped"],
    ["Material", "ZSD_PMS_MATERIAL", "ZCL_PMS_MATERIAL_QRY", "Top 20 materials by gross value"],
    ["MaterialCatalog", "ZSD_PMS_MATERIAL_CATALOG", "ZCL_PMS_MATERIAL_CATALOG_QRY", "Every material in scope, uncapped"],
])
d.callout("Four reserved-word renames", "Unit, Label, Value and Zone are reserved in this context, "
          "so four fields are renamed at the entity boundary: UnitCode, KpiLabel, MatValue and "
          "AlmZone. Any new consumer must use the renamed form.")

d.h2("4.3  The Parameter Contract")
d.p("Each custom entity declares nine parameters and no SelectFrom. The metadata therefore "
    "exposes each one as a “…Parameters” entity set whose Set navigation property "
    "carries the rows. The parameters are part of the RESOURCE PATH, not $filter:")
d.code("/KPI(P_Fy='2026',P_DateFrom=2026-04-01,P_DateTo=2027-03-31,\n"
       "     P_Zone='',P_State='',P_Plant='',P_Material='',\n"
       "     P_Scheme='',P_Period='')/Set")
d.table(["Parameter", "Type", "Format"], [
    ["P_Fy", "gjahr", "Edm.String — single-quoted, e.g. '2026'"],
    ["P_DateFrom / P_DateTo", "zsd_pms_date", "Edm.Date — UNQUOTED ISO, e.g. 2026-04-01"],
    ["P_Zone, P_State, P_Plant, P_Material, P_Scheme, P_Period", "zsd_pms_flt", "Edm.String — single-quoted comma-separated list; empty means “all”"],
])
d.callout("Getting the quoting wrong gives a 400", "A quoted date or an unquoted year is rejected "
          "by the Gateway rather than surfacing as a UI5 error, which is why buildPath( ) in "
          "dashboardService.js is the only place the path is assembled.")

d.h2("4.4  Query Provider Pattern")
d.p("All nine classes are the same thin shell. Each reads the nine parameters off the request, "
    "converts each CSV parameter into a RANGE with csv_to_range( ), calls "
    "ZCL_PMS_DASH_QUERY=>get_dashboard_data( ), maps its own slice of the result into the entity's "
    "flat structure, and applies paging.")
d.code("LOOP AT io_request->get_parameters( ) INTO DATA(ls_param).\n"
       "  CASE to_upper( ls_param-parameter_name ).\n"
       "    WHEN 'P_FY'.       ls_filters-fy       = ls_param-value.\n"
       "    WHEN 'P_DATEFROM'. ls_filters-date_from = ls_param-value.\n"
       "    WHEN 'P_ZONE'.     ls_filters-zone     = CORRESPONDING #( csv_to_range( ls_param-value ) ).\n"
       "    ...\n"
       "  ENDCASE.\n"
       "ENDLOOP.\n\n"
       "DATA(ls_dash) = zcl_pms_dash_query=>get_dashboard_data( ls_filters ).")
d.callout("Nine reads, nine full computations", "Every entity set recomputes the whole dashboard "
          "and returns one slice of it. This is the deliberate trade — it keeps each query "
          "provider trivial and keeps all business logic in one class — but it means a "
          "single dashboard refresh runs get_dashboard_data( ) nine times. Any optimisation work "
          "belongs here, behind a shared buffer, not in the individual providers.")

# ============================================================== 5 ============
d.h1("5.  The Compute Class ZCL_PMS_DASH_QUERY")
d.p("A single read-only class holding every filter and every aggregation. Two bulk extractions, "
    "each filtered once, then all aggregation over the resulting in-memory tables using "
    "HASHED/SORTED lookup tables rather than per-row database access inside loops.")

d.h2("5.1  Entry Point")
d.code("METHOD get_dashboard_data.\n"
       "  DATA(lt_curr)  = get_gl_rows( is_filters ).\n"
       "  DATA(lt_prior) = get_gl_rows_prior( is_filters ).\n\n"
       "  rs_result-kpis = get_kpis( it_curr = lt_curr it_prior = lt_prior ).\n"
       "  APPEND get_daily_kpi( is_filters ) TO rs_result-kpis.\n\n"
       "  rs_result-trend         = get_trend( lt_curr ).\n"
       "  rs_result-geo           = get_geo( it_curr = lt_curr it_prior = lt_prior ).\n"
       "  rs_result-unit_dots     = get_unit_dots( it_curr = lt_curr it_prior = lt_prior ).\n"
       "  rs_result-scheme        = get_scheme_agg( it_curr = lt_curr it_prior = lt_prior ).\n"
       "  rs_result-plant_top20   = get_plant_top20( lt_curr ).\n"
       "  rs_result-plant_catalog = get_plant_catalog( lt_curr ).\n\n"
       "  DATA(lt_item) = get_item_rows( is_filters = is_filters it_gl = lt_curr ).\n"
       "  DATA(lt_tax)  = get_item_tax( lt_item ).\n"
       "  rs_result-material_top20   = get_material_top20( it_item = lt_item it_tax = lt_tax ).\n"
       "  rs_result-material_catalog = get_material_catalog( lt_item ).\n"
       "ENDMETHOD.")

d.h2("5.2  Fiscal Year and Period Conversion")
d.p("Two conventions collide inside this class and are bridged at exactly one point.")
d.bullets([
    "GJAHR Y means calendar April Y to March Y+1. get_gl_rows derives its default date window as |{ fy }0401| to |{ fy + 1 }0331|.",
    "The dashboard, and every in-memory consumer, number periods Apr=1 … Mar=12.",
    "The source column month_num is a PLAIN CALENDAR month (Apr=04 … Dec=12, Jan=01 … Mar=03) — not already FY-shifted.",
])
d.p("month_to_period( ) and period_to_month( ) are the only converters. get_gl_rows translates an "
    "incoming FY-period filter into calendar months before the WHERE clause, and re-expresses "
    "month_num as an FY period immediately after the fetch:")
d.code("LOOP AT rt_gl ASSIGNING FIELD-SYMBOL(<ls_gl_period>).\n"
       "  <ls_gl_period>-month_num = month_to_period( <ls_gl_period>-month_num ).\n"
       "ENDLOOP.")
d.callout("Do not re-derive this elsewhere", "Everything downstream — get_trend, "
          "compute_truncation, and get_gl_rows_prior via its call back into get_gl_rows — "
          "assumes Apr=1. If period numbering is ever hand-derived somewhere else, remember that "
          "the raw column is Apr=04, not Apr=1.")

d.h2("5.3  Trap 2 — Prior-Period Truncation")
d.p("compute_truncation( ) decides how much of the prior fiscal year to compare against. For the "
    "CURRENT fiscal year it truncates at today's own FY period and day of month; for any other "
    "year it compares the full twelve periods.")
d.code("current_period_info( IMPORTING ev_fy = DATA(lv_cur_fy)\n"
       "                              ev_period = DATA(lv_cur_period) ).\n\n"
       "IF is_filters-fy = lv_cur_fy.\n"
       "  ev_last_period = lv_cur_period.\n"
       "  ev_last_day    = sy-datum+6(2).\n"
       "ELSE.\n"
       "  ev_last_period = 12.\n"
       "  ev_last_day    = '31'.\n"
       "ENDIF.")
d.callout("The cutoff is TODAY, not the newest row", "An earlier design scanned the fetched rows "
          "for their own latest posting. That was fragile in both directions: lagging postings "
          "silently truncated BOTH years too early, and one stray future-dated correction pushed "
          "the cutoff past today. Today's period and day work identically for both years because "
          "both are already FY-numbered the same way.")
d.p("get_gl_rows_prior( ) then re-runs get_gl_rows( ) with fy − 1 and date_to set to the "
    "truncation date, so the truncation happens in the WHERE clause rather than as a post-filter.")

d.h2("5.4  The Daily Snapshot KPI")
d.p("reference_date_for_daily_kpi( ) resolves which single day the fourth KPI card reports on, and "
    "whether it is literally yesterday. Unlike every other aggregate, get_daily_kpi( ) issues its "
    "own two SELECTs — one for the day, one for the same calendar day a year earlier via "
    "shift_calendar_year( ), which falls Feb 29 back to Feb 28. A reference date later than today "
    "returns immediately, leaving the card at its type-initial zero.")

d.h2("5.5  The Material-to-G/L Bridge")
d.p("When a Material filter is active, the G/L-grain panels have to be restricted too. "
    "resolve_material_gl_keys( ) reads the matching billing items, follows knumv_ana into "
    "PRCD_ELEMENTS, and collects the (VBELN, SAKN1) pairs — the G/L account each pricing "
    "condition posts to — which are then matched against a G/L row's own HKONT.")
d.code("SELECT knumv, kposn, sakn1\n"
       "  FROM prcd_elements\n"
       "  FOR ALL ENTRIES IN @lt_item_raw\n"
       "  WHERE knumv = @lt_item_raw-knumv_ana\n"
       "    AND kposn = @lt_item_raw-posnr\n"
       "    AND kschl IN ( 'JOIG', 'JOCG', 'JOSG', 'JTC1', 'JTC2', 'JTC4', 'JOUB' )\n"
       "    AND kwert <> 0\n"
       "    AND kstat = ' '\n"
       "    AND sakn1 <> ' '\n"
       "  INTO TABLE @lt_prcd.")
d.p("The bridge is exact but incomplete: an item whose applicable condition is not one of those "
    "seven types produces no key at all. get_gl_rows therefore applies a two-branch filter with a "
    "document-level fallback:")
d.code("LOOP AT rt_gl INTO DATA(ls_gl).\n"
       "  IF line_exists( lt_keys[ vbeln = ls_gl-vbeln hkont = ls_gl-hkont ] ).\n"
       "    \" Bridge resolved this exact line - keep it.\n"
       "    APPEND ls_gl TO lt_gl_filtered.\n"
       "  ELSEIF NOT line_exists( lt_keys[ vbeln = ls_gl-vbeln ] )\n"
       "     AND line_exists( lt_mat_docs[ vbeln = ls_gl-vbeln ] ).\n"
       "    \" Bridge resolved nothing for this document, but it does contain\n"
       "    \" the material - keep it rather than dropping it.\n"
       "    APPEND ls_gl TO lt_gl_filtered.\n"
       "  ENDIF.\n"
       "ENDLOOP.")
d.callout("Why the fallback exists", "Without it, an unresolvable document was dropped entirely, "
          "which blanked EVERY G/L-grain panel — the KPI cards, map, scheme list and trend "
          "— the moment a Material filter was set, while the material panel carried on "
          "working because it never needs the bridge. The fallback over-states on an unusual "
          "document rather than emptying the dashboard. Note the third path: a document the "
          "bridge DID resolve falls through both branches, so its other materials' lines are "
          "still correctly excluded.")

d.h2("5.6  Method Catalogue")
d.table(["Method", "Purpose"], [
    ["default_filters", "Current FY, full year, no other filters"],
    ["get_dashboard_data", "Public entry point — returns the whole ty_dashboard structure"],
    ["get_gl_rows", "Bulk G/L-grain fetch, period conversion, material bridge and fallback"],
    ["get_gl_rows_prior", "Prior year, truncated per compute_truncation"],
    ["get_item_rows", "Bulk item-grain fetch, credit-memo exclusion (fkart = 'G2'), and the zone/state/scheme/period intersection against the G/L documents"],
    ["get_item_tax", "Pivots PRCD_ELEMENTS into IGST / SGST / CGST / TCS per VBELN+POSNR"],
    ["get_kpis", "Net, tax and derived gross, current vs prior"],
    ["get_daily_kpi", "The single-day snapshot card (its own SELECTs)"],
    ["get_trend", "Net value per FY period, sorted ascending"],
    ["get_geo", "Per-state net, tax, derived gross, prior gross, delta, distinct plant and invoice counts"],
    ["get_unit_dots", "Value-weighted centroid per Unit, plus prior-year gross for the dot's growth — see 6.2"],
    ["get_scheme_agg", "Per-scheme net, share, invoice count and YoY delta"],
    ["get_plant_top20 / get_plant_catalog", "Top 20 plants by net; and the same scope uncapped"],
    ["get_material_top20 / get_material_catalog", "Top 20 materials with GST split; and the same scope uncapped"],
    ["pct", "Zero-denominator-safe percentage helper used by every delta and share"],
])

# ============================================================== 6 ============
d.h1("6.  Calculation Logic")

d.h2("6.1  KPIs, Trend, Geo and Scheme")
d.table(["Figure", "Computation"], [
    ["Total net value", "REDUCE over netwr across every current-year G/L row"],
    ["Total tax (GST)", "REDUCE over mwsbk"],
    ["Total gross value", "net + tax — DERIVED, not read from the gross column, so the three cards always reconcile"],
    ["Every delta_pct", "pct( part = curr − prior, whole = prior ) — returns 0 when prior is 0"],
    ["Trend", "netwr summed per month_num (already FY-period at this stage), sorted ascending"],
    ["Geo net / prior", "netwr summed per regio, from the current and prior row sets respectively"],
    ["Geo plant_count / invoice_count", "DISTINCT counts held in HASHED tables keyed regio+werks and regio+vbeln"],
    ["Scheme share_pct", "pct( part = scheme net, whole = sum of all scheme nets )"],
    ["Scheme invoice_count", "DISTINCT vbeln per category, from a HASHED seen-table"],
    ["Material % of total", "Each row carries grand_total_value — the sum across EVERY material in scope, computed BEFORE the top-20 cut"],
])
d.callout("Grand total before the cut", "grand_total_value is denormalised onto each material row "
          "deliberately, so that “% of total” divides by the true scope total rather than "
          "the top-20 subset's own sum. The listed shares therefore correctly add up to less than "
          "100%.")

d.h2("6.2  Unit Dots — the Value-Weighted Centroid")
d.p("A two-step roll-up. Step 1 accumulates per-plant totals; step 2 rolls plants up to Units, "
    "weighting each plant's coordinates by its own value.")
d.code("\" Step 2 accumulator\n"
       "<ls_unit>-value        += ls_plant-value.\n"
       "<ls_unit>-plant_count  += 1.\n"
       "IF ls_plant-has_coord = abap_true.\n"
       "  <ls_unit>-coord_weight += ls_plant-value.\n"
       "  <ls_unit>-lat_weighted += ls_plant-value * ls_plant-latitude.\n"
       "  <ls_unit>-lon_weighted += ls_plant-value * ls_plant-longitude.\n"
       "ENDIF.\n\n"
       "\" Emit\n"
       "CHECK ls_unit-coord_weight > 0.\n"
       "latitude  = ls_unit-lat_weighted / ls_unit-coord_weight\n"
       "longitude = ls_unit-lon_weighted / ls_unit-coord_weight")
d.callout("Step 1 keys on WERKS + UNIT together", "One plant can bill under more than one sales "
          "office, and the sales office is the real Unit key. Keying step 1 on WERKS alone pinned "
          "a plant to whichever Unit its first-seen row happened to carry and silently "
          "mis-attributed every later row from that plant. This was a real defect, found and "
          "fixed during Phase 1 live testing.")
d.p("A Unit whose coord_weight is zero — no member plant has coordinates — is omitted "
    "entirely rather than plotted at (0,0). Plants without coordinates are excluded from the "
    "centroid but still counted in the Unit's net value and plant count.")

# ============================================================== 7 ============
d.h1("7.  UI5 Application")

d.h2("7.1  Control Tree")
d.p("Only the filter bar is built from Fiori controls. Everything below it is the reviewed HTML "
    "prototype's own markup, rendered by the custom controls in webapp/control and styled by "
    "webapp/css/style.css.")
d.code("Page (id=page, showHeader=false)\n"
       "  Box .pmsTopBar\n"
       "    Head       - title, badge, subtitle, SCOPE line, theme Toggle\n"
       "    Box .pmsFilterRow\n"
       "      Select        fySelect       change=.onFyChange\n"
       "      MultiComboBox zoneFilter     selectionFinish / selectionChange\n"
       "      MultiComboBox stateFilter    (showSecondaryValues, showSelectAll)\n"
       "      MultiComboBox plantFilter\n"
       "      MultiComboBox schemeFilter\n"
       "      MultiComboBox materialFilter (custom filterFunction - old material no.)\n"
       "      MultiComboBox periodFilter\n"
       "      Button goBtn / resetBtn / refreshBtn\n"
       "    Text .pmsFilterHint\n"
       "  MessageStrip errorStrip\n"
       "  Box id=kpiGrid layout=hero      -> KpiCard x 4\n"
       "  Box layout=charts\n"
       "    Card span=8  -> IndiaMap  (+ granularity Toggle, DotSwitch)\n"
       "    Card span=4  -> SchemeList\n"
       "  Box layout=charts\n"
       "    Card span=6  -> EChart chartPlant\n"
       "    Card span=6  -> EChart chartMaterial")

d.h2("7.2  Custom Controls")
d.table(["Control", "Responsibility"], [
    ["Box", "Layout primitive — carries the hero / charts grid variants"],
    ["Card", "Panel shell — title, subtitle, badge and an actions slot"],
    ["Head", "Application header — title, module badge, subtitle and the SCOPE line"],
    ["KpiCard", "One KPI tile — gradient accent bar, eyebrow label, value, inline SVG sparkline, delta pill and mono sub-line"],
    ["IndiaMap", "The whole map panel — choropleth, zone unions, Unit dots, leader-line callouts, legend and hover card"],
    ["SchemeList", "Ranked scheme rows plus the Top-states roll-up, both click-to-filter"],
    ["EChart", "ECharts lifecycle wrapper — create, update, resize and dispose"],
    ["Toggle", "Segmented control — used for theme and map granularity"],
    ["DotSwitch", "The Unit-dot overlay switch"],
])

d.h2("7.3  The Read Layer — dashboardService.js")
d.p("A single ENTITIES map declares each entity set's name, its explicit $select list and its "
    "optional $orderby. readEntity( ) creates a throwaway ODataListBinding per read — an "
    "ODataListBinding owns its own cache, so a fresh binding guarantees a fresh request even when "
    "the user presses Go twice with identical filters — and readAll( ) runs all nine on the "
    "default $auto group so UI5 folds them into one $batch.")
d.code("unitDots: {\n"
       "    set: \"UnitDots\",\n"
       "    select: \"UnitCode,UnitName,NetValue,PriorValue,DeltaPct,\" +\n"
       "            \"Latitude,Longitude,PlantCount\"\n"
       "},")
d.callout("$select is an explicit allow-list", "Any property not named in an entity's select "
          "string is stripped from the response even when the backend returns it correctly. When "
          "adding a field to a CDS entity, this list is the fourth place that must be updated "
          "— after the custom entity, the compute class and the query provider — and it "
          "is the one that fails silently. UnitName was added end-to-end and still arrived blank "
          "for exactly this reason.")
d.callout("Two entities are optional", "PlantCatalog and MaterialCatalog are a filter-list "
          "enhancement, not core data. readAll( ) catches their failures and degrades them to an "
          "empty array, so a backend that has not yet been updated with those two entities 404s "
          "on them without taking the other seven panels down.")

d.h2("7.3a  Paging the Uncapped Catalogs")
d.p("SAP Gateway caps a page at 100 rows however large a $top is requested, so the Plant and Material filters listed only the first 100 codes. PlantCatalog and MaterialCatalog therefore carry paged: true and are read a page at a time until a page comes back EMPTY.")
d.code("var readPage = function (iStart, iLength) {\n"
       "    var oPage = oModel.bindList(sPath, null, [], [], mParameters);\n"
       "    return oPage.requestContexts(iStart, iLength).then(function (aContexts) {\n"
       "        oPage.destroy();\n"
       "        return aContexts.map(function (oContext) { return oContext.getObject(); });\n"
       "    });\n"
       "};")
d.callout("A fresh binding per page, and never stop on a short one", "Both halves matter. An ODataListBinding served fewer rows than it asked for treats its length as FINAL and answers every later requestContexts( ) from cache without reaching the server, so reusing one binding stops dead at the first capped page. And because a capped page IS short by definition, a short page cannot mean end-of-collection — only an empty one can. Verified against a stub capping at 100: 247 rows over $skip=0,100,200,247 with no duplicates.")
d.callout("The second cap was in the model", "Paging alone changed nothing on screen. sap.ui.model.Model defaults sizeLimit to 100 and applies it when an aggregation binding builds its contexts, so the MultiComboBoxes rendered the first 100 codes however many were fetched. The controller raises it on the dash model. Two independent caps of the same size sat in series — fixing either one alone still showed “Select All (0 of 100)”.")
d.p("Only these two entities page. The other seven have provable upper bounds inside a single page — at most 12 trend periods, 36 states, 18 Units, and Top-20 caps on the plant and material panels — so they keep the single-$batch refresh.")

d.h2("7.4  Filter Staging")
d.p("Changing a filter does not reload. Every filter event — selectionFinish, "
    "selectionChange (needed because removing a token from the closed input fires only that one), "
    "the fiscal-year Select's change, and every map / scheme / Top-state click routed through "
    "_toggleFilter — calls _markDirty( ), which sets /filtersDirty on the dash model. The Go "
    "button binds its type to that flag and turns Emphasized while a refresh is pending; "
    "_loadData clears it on success.")
d.code("onFilterSelectionFinish: function () { this._markDirty(); },\n"
       "onFilterSelectionChange: function () { this._markDirty(); },\n"
       "onFyChange:              function () { this._markDirty(); },\n\n"
       "_markDirty: function () {\n"
       "    this._dash().setProperty(\"/filtersDirty\", true);\n"
       "}")
d.p("Two exceptions load immediately: the initial bootstrap in onInit, and onReset — "
    "clearing is an explicit action rather than an edit in progress.")

d.h2("7.5  Catalog Merging")
d.p("The State, Plant, Scheme and Material dropdowns have no value-help entities. Their items are "
    "harvested from each response by _mergeCatalog( ) and ACCUMULATE across loads rather than "
    "being replaced.")
d.callout("Why they must accumulate", "Every result set is a top-N, so a code drops out of the "
          "response as soon as it is filtered on — and a MultiComboBox silently discards a "
          "selected key with no matching item. Replacing the list would therefore erase the user's "
          "own selection the moment they applied it. _mergeCatalog re-applies the selected keys "
          "after rebuilding each list for the same reason.")
d.p("Plant and Material each list two sources — the Top-20 panel entity AND the uncapped "
    "catalog entity. Both stay listed so the filter still gets some codes during a rollout window "
    "in which the catalog entities do not yet exist, and the full uncapped set as soon as they do; "
    "_mergeCatalog dedupes by key, so a code returned by both is listed once.")

d.h2("7.6  Client-Side Zone Masking")
d.p("The Zone filter is sent to the backend as P_Zone and matched against ALM_ZONE, a hand-typed "
    "CHAR10. _maskGeoByZoneFilter( ) re-filters the response client-side as a guard against a "
    "looser match than intended, comparing the row's own AlmZone against the selection with both "
    "sides put through formatter.zoneKey( ).")
d.code("_maskGeoByZoneFilter: function (aGeo) {\n"
       "    var aZones = (this._oFilters && this._oFilters.zone) || [];\n"
       "    if (!aZones.length) { return aGeo; }\n"
       "    var mSelected = aZones.reduce(function (m, s) {\n"
       "        m[formatter.zoneKey(s)] = true;\n"
       "        return m;\n"
       "    }, {});\n"
       "    return aGeo.filter(function (r) {\n"
       "        return !!mSelected[formatter.zoneKey(r.AlmZone)];\n"
       "    });\n"
       "}")
d.callout("This test used to be the wrong one", "Until 2026-08-18 the mask compared the zone the "
          "STATE sits in geographically, via INDIA.zoneOfState( ). It was written for a symptom "
          "— picking South and still colouring a northern state — that was not a loose "
          "ALM_ZONE match at all, but the CDS taking zone from the sales office and state from the "
          "billing plant. Testing the geographic zone silently DISCARDED every legitimate row "
          "whose business zone differs from its map position: selecting Central threw away Uttar "
          "Pradesh entirely. Both fields now come from the one mapping row, so the test is "
          "ALM_ZONE against ALM_ZONE.")
d.callout("Resolve a zone through formatter.zoneKey( ), always", "ALM_ZONE is maintained by hand, "
          "so the same zone can arrive padded or in a different case. zoneKey( ) trims and "
          "title-cases, folding “WEST” and “south ” onto the same key as "
          "their neighbours. An unrecognised code such as “Z1” passes through trimmed "
          "rather than being blanked, so bad master data appears on the map as its own labelled "
          "zone instead of vanishing. Any new code needing a zone must use it.")

d.h2("7.7  The IndiaMap Control")
d.p("A custom Control rendering a single SVG through RenderManager apiVersion 2. Its base geometry "
    "— the state paths and the projection constants — is ported verbatim from the "
    "reviewed HTML prototype; the Unit coordinates come from the UnitDots entity. The prototype's "
    "preset zone union paths are no longer drawn — see Zone granularity below.")
d.h3("Quantile colour scale")
d.p("quantile( ) bins by equal COUNT, not equal width, so a handful of very large states cannot "
    "wash the map into one colour. Degenerate inputs — a single distinct value, or fewer "
    "distinct values than steps — spread what there is across the ramp instead of collapsing. "
    "It returns the real min and max alongside the bins, because the per-swatch labels are each "
    "band's LOWER bound; without the true extremes the legend looks like it stops at the last "
    "break rather than running on to the largest value actually painted.")
d.h3("Zone granularity")
d.p("A zone is drawn as ONE path whose d is the concatenation of its member states' subpaths, stroked inline in its own fill colour. Drawing a path per state left every internal state border stroked, so a zone read as several states that happened to share a colour rather than as one region.")
d.callout("Why hover and selection use a filter", "The inline stroke outranks any selector, so the .pmsMapArea hover and selected rules cannot repaint it — which is deliberate: an ink stroke would outline every one of those subpaths again and undo exactly what the inline stroke achieves. Both states darken the whole region with a CSS filter instead, which works on any scale step and in both themes.")
d.callout("The limit of this approach", "Two ADJACENT zones landing in the same quantile bucket are indistinguishable, there being no divider line between them. A true union outline needs polygon boolean geometry, which is not worth carrying here; the fallback if it ever matters is a categorical palette for zone mode, one colour per zone, with value left to the hover card.")

d.h3("The hover card")
d.p("Three rows — Gross billed, Net value, Tax (GST) — and nothing else, on all three card types "
    "(state polygon, zone polygon, Unit dot). It carried growth against last year, share of India, "
    "plants billing and invoice counts until 2026-08-18, when they were removed as noise "
    "(OD-12); the zone and dot cards also lost the state / plant counts from their headers.")
d.callout("The state card's eyebrow reads AlmZone, not the geographic table", "It used "
          "INDIA.zoneOf[state] — the hardcoded geographic lookup — which would print 'UP - North' "
          "beside a panel that had just shaded Uttar Pradesh as Central. It now reads the row's own "
          "AlmZone through formatter.zoneKey( ), the same source the shading uses. A state with no "
          "billing shows its abbreviation alone.")
d.callout("What the removal made dead", "IndiaMap's deltaVisible and priorFyLabel properties and "
          "their view bindings, the per-zone prior / plants / invoices / states accumulators, the "
          "share-of-India denominator, and six of the fifteen mapTexts keys. All removed — a bound "
          "property that silently does nothing misleads whoever reads it next. deltaVisible still "
          "does real work on KpiCard and SchemeList. The i18n ENTRIES were deliberately left in the "
          "bundle unreferenced, so restoring a row stays a one-line change. tipHead( ) now omits "
          "the eyebrow span entirely when it is empty, since .pmsTipHead is display:block and an "
          "empty one still took a line.")
d.callout("Fields now fetched but unread", "Geo still $selects PriorValue (the hover card's old "
          "'last year' row) and UnitDots still $selects PriorValue / PriorGross / DeltaPct / "
          "PlantCount. Geo's PriorGross and DeltaPct are still genuinely used — by the Top-states "
          "rows under the Scheme panel, which do show a pill. Material's GrandTotalValue / "
          "GrandTotalGross became unread when the 'Grand total' line was dropped from that chart's "
          "tooltip. None of this is a bug; it is a $select worth trimming when next touched.")

d.h3("Callout gutters")
d.p("Labels are not fitted into gaps in the coastline. The viewBox is WIDENED by CALLOUT_GUTTER on "
    "each side to create dedicated label columns:")
d.code("oRm.attr(\"viewBox\", oControl.getShowDots() ?\n"
       "    (-CALLOUT_GUTTER) + \" 0 \" + (INDIA.w + 2 * CALLOUT_GUTTER) + \" \" + INDIA.h :\n"
       "    \"0 0 \" + INDIA.w + \" \" + INDIA.h);")
d.p("Dots are assigned to a side geographically, rebalanced across sides when one column overflows, "
    "then passed through a three-pass declutter sweep — push down, pull back up if past the "
    "lower bound, push down again — so no two leader lines collide.")
d.callout("SVG font-size scales with the viewBox", "font-size and stroke-width are in USER units. "
          "Widening the viewBox shrinks them on screen by the same factor, which is why "
          "GUTTER_SCALE exists and why the callout font size is set as an attribute in JS rather "
          "than in CSS. Setting it in CSS and then widening the viewBox silently undoes the "
          "change.")

d.h2("7.7a  Suppressing Untrustworthy Growth Indicators")
d.p("The sales-office concept (VKBUR) only began in FY 2026. Most FY 2025 rows therefore carry a "
    "blank one, which resolves to a null zone and is excluded by any ALM_ZONE IN predicate. A "
    "zone-filtered FY 2026 view was consequently dividing a nearly complete current year by a "
    "nearly empty prior one, producing five-digit percentages.")
d.callout("The arithmetic was never wrong", "pct( ) was checked against the ABAP debugger: "
          "IV_PART = 385,019,754.54 over IV_WHOLE = 2,105,569.94 is genuinely +18285.8%, and it "
          "reconciles with the Rs 38.71 Cr on the card. Capping or hiding large percentages before "
          "diagnosing this would have buried a master-data gap behind a cosmetic fix.")
d.code("var VKBUR_FIRST_FY = 2026;\n"
       "var SCOPE_FILTERS = [\"zone\", \"state\", \"plant\", \"scheme\", \"material\", \"period\"];\n"
       "\n"
       "_deltasUnreliable: function () {\n"
       "    var o = this._oFilters;\n"
       "    if (!o || parseInt(o.fy, 10) !== VKBUR_FIRST_FY) { return false; }\n"
       "    return SCOPE_FILTERS.some(function (sKey) {\n"
       "        return (o[sKey] || []).length > 0;\n"
       "    });\n"
       "}")
d.callout("Fiscal Year is deliberately not a scope filter", "An FY-only view totals both sides "
          "INCLUDING the blank-VKBUR rows, so nothing is excluded and the comparison is sound. "
          "Only a filter that narrows the comparison can break it. Hiding the pills on the FY "
          "selector too would have removed the one comparison that still works.")
d.callout("It expires on its own", "FY 2027 compares against FY 2026, which has VKBUR throughout. "
          "This is a dated workaround for a one-off master-data transition, not a permanent rule — "
          "the constant name says so, and no code change is needed when it lapses.")
d.p("The result is published once, as /deltaVisible, and bound by the view onto every control that "
    "still draws a pill — the KPI cards, the scheme rows and the top-states rows — so they all make "
    "one decision rather than each repeating it. The KPI cards additionally bind it per card, "
    "because the Yesterday Sale card is suppressed unconditionally:")
d.code("deltaVisible: oKpi.Id !== \"DAILY_SALE\" && bDeltasOk")
d.callout("The Yesterday Sale card never shows a pill, in any year", "A single day against the same "
          "single day a year earlier is noise, not a trend — a public holiday on one side of the "
          "comparison swings it completely. It was removed outright on 2026-08-18 rather than "
          "conditioned, because it was never meaningful.")

d.h2("7.8  Responsive Panel Sizing")
d.p("Panel heights are viewport-relative, not fixed: the map is 52vh and both charts 46vh, with the floor and ceiling set in CSS as min-height / max-height. The scheme list is bounded the same way and scrolls internally, so it cannot drive the grid row taller than the map beside it.")
d.callout("Why the bounds are in CSS and not in the vh value", "sap.ui.core.CSSSize validates against a regex that permits calc( ) but NOT clamp( ), so a clamp( ) height is rejected outright. Putting the bounds in CSS also survives the inline height the controls render, since min-height and max-height are not overridden by height.")
d.p("A @media (max-height: 820px) block trims the vertical chrome above the first panel row — top bar, grid gaps, card and KPI padding. It is keyed on HEIGHT, not width: a 1920x800 window has the same problem as a 1366x768 one and a width breakpoint would miss it. .pmsField also drops to a 9rem flex basis so seven filters and the button group fit one row at 1366px instead of wrapping Period onto a second.")
d.callout("What this does and does not solve", "The map card was 682px tall on a 629px viewport — taller than the screen, so that panel could never be seen whole. It is now 475px. The PAGE still scrolls: roughly 380px of filter bar and KPI cards sit above the first row, so on a 768px screen that row still begins below the fold.")

d.h2("7.9  Theming")
d.p("appTheme.js resolves auto / light / dark and stamps the choice on the root element; "
    "chartTheme.js reads the resulting CSS custom properties into an ECharts palette. A theme "
    "change re-resolves the palette and re-renders from the CACHED response — no round trip, "
    "since a theme change does not affect the data.")

# ============================================================== 8 ============
d.h1("8.  Build, Run and Deploy")

d.h2("8.1  npm Scripts")
d.table(["Script", "Command", "Purpose"], [
    ["start", "fiori run --open \"test/flp.html#app-preview\"", "Dev server against the real backend through the proxy"],
    ["start-local", "fiori run --config ./ui5-local.yaml", "Same, with local UI5 resources"],
    ["start-mock", "fiori run --config ./ui5-mock.yaml", "Runs against the local metadata copy"],
    ["start-prod", "fiori run --config ./ui5-prod.yaml --port 8098", "Local build against the PRODUCTION backend (MEP, client 300) — diagnosis only"],
    ["build", "ui5 build --config=ui5.yaml --clean-dest --dest dist", "Production build into dist/"],
    ["deploy", "npm run build && fiori deploy --config ui5-deploy.yaml", "Build then deploy to ABAP"],
    ["deploy-test", "… --testMode true", "Dry-run deployment"],
    ["undeploy", "npm run build && fiori undeploy --config ui5-deploy.yaml", "Remove the deployed app"],
])

d.h2("8.2  Dev Server Proxy")
d.p("fiori-tools-proxy routes /resources and /test-resources to https://ui5.sap.com, and every "
    "/sap path to the backend:")
d.code("backend:\n"
       "  - path: /sap\n"
       "    url: https://vhafbmedap01.hec.erp.alimco.in\n"
       "    client: '120'")

d.h2("8.3  Deployment Target")
d.spec([
    ("Target URL", "https://vhafbmedap01.hec.erp.alimco.in:443/"),
    ("Client", "120"),
    ("Auth", "basic"),
    ("BSP application", "ZSD_PMS_DASH"),
    ("Package", "ZSD_PMSD"),
    ("Transport", "MEDK913313"),
    ("Credentials", "env:med_user / env:med_pass"),
    ("Build excludes", "/test/**, /localService/**"),
])
d.callout("Credentials", "med_user and med_pass are read from the environment (the local .env file "
          "in zsd_pms_dash/). That file is git-ignored and must never be committed.")
d.callout("There is no PRODUCTION deploy target", "ui5-deploy.yaml has only ever pointed at "
          "vhafbmedap01 (MED, client 120). The app has never been deployed to MEP. ui5-prod.yaml "
          "is NOT a deploy target — it is a dev-server proxy that points a LOCAL build at the "
          "production backend for diagnosis, and it carries no credentials at all "
          "(fiori-tools-proxy prompts for them). Shipping to production needs a second deploy "
          "config, its own BSP application and its own transport.")

# ============================================================== 9 ============
d.h1("9.  Troubleshooting")
d.table(["Symptom", "Likely cause", "Fix"], [
    ["A field is populated in the ABAP debugger but blank in the browser",
     "The property is missing from that entity's $select list in dashboardService.js",
     "Add it to ENTITIES.<key>.select. Note the local test fixture bypasses the service layer and cannot catch this."],
    ["HTTP 400 from the Gateway on every read",
     "A malformed parameter in the resource path — a quoted date or an unquoted fiscal year",
     "Check buildPath( ); dates go in unquoted, everything else single-quoted."],
    ["Every panel blanks the moment a Material filter is set",
     "The material-to-G/L bridge resolved nothing and the document-level fallback is missing",
     "Verify the fallback branch in get_gl_rows is present; check the PRCD_ELEMENTS condition types against the live pricing procedure."],
    ["The GST columns on the material panel are all zero",
     "The hardcoded condition types do not match ALIMCO's pricing procedure",
     "Cross-check the kschl list in get_item_tax against real PRCD_ELEMENTS rows. This fails silently by design."],
    ["A state is painted while a different zone is filtered",
     "ALM_ZONE matched loosely on the backend",
     "The client-side mask should already prevent this; if not, the state is missing from INDIA.zoneOf."],
    ["A Unit is missing from the dot overlay",
     "No member plant carries latitude and longitude",
     "Maintain the coordinates on ZSD_ZONE_PLANT. The omission is deliberate, not a rendering fault."],
    ["The Plant or Material filter lists only 20 entries",
     "PlantCatalog / MaterialCatalog are not active on the backend",
     "Activate the two custom entities and their query providers, then republish the service. Until then the filter degrades to the Top-20 codes."],
    ["Callout labels are unreadably small after a layout change",
     "SVG font-size is in user units and scales with the viewBox",
     "Set the size as an attribute in JS, not in CSS, and compensate with GUTTER_SCALE."],
    ["Two callout labels overlap",
     "The declutter sweep did not converge, or a side overflowed without rebalancing",
     "Check rebalance( ) and the three-pass sweep in buildCallouts( )."],
    ["An error strip names an entity set",
     "That entity's query provider is inactive or is raising",
     "The message carries the backend's own text; check the named class in ADT."],
])

d.h2("9.1  Diagnostics")
d.p("The controller logs through sap/base/Log under component com.sap.zsdpmsdash. A failed load "
    "logs the stack at ERROR and names the failing entity via oError.pmsEntity, which is also what "
    "the on-screen error strip reports. An unavailable optional catalog entity logs at WARNING and "
    "does not interrupt the load. On the ABAP side, ZSD_PMS_DASH_TEST is a standalone report that "
    "calls get_dashboard_data( ) directly and prints every result table — the fastest way to "
    "separate a backend problem from a frontend one.")

# ============================================================= 10 ============
d.h1("10.  Known Constraints")
d.bullets([
    "The Scheme filter does not restrict the material panel. Category lives only on the G/L-grain fact, not on VBRP/VBRK. Closing this needs the mirror image of resolve_material_gl_keys( ) — item resolution from a G/L row — which was deliberately not attempted in the same pass as the first cross-grain join.",
    "The material-to-G/L bridge depends on a hardcoded list of seven condition types. Anything outside that list falls back to document-level inclusion, which over-states.",
    "Every entity set recomputes the whole dashboard, so one refresh runs get_dashboard_data( ) nine times. There is no shared buffer.",
    "ALM_ZONE's real data element was never confirmed; it is typed as a CHAR10 placeholder. It is also hand-maintained, which is why every read of it goes through formatter.zoneKey( ) — see 7.6. (Until 2026-08-18 the frontend derived zone from the state name instead; that is no longer true, and was the cause of the zone mismatch OD-11 fixed.)",
    "No value-help entities exist for Plant / Material / State type-ahead. The dropdowns are built from each response's own codes and therefore list only what has been in scope so far.",
    "Credit-memo exclusion is applied to the material panel only (fkart = 'G2'), not to the KPI cards or the G/L-grain panels.",
    "There is no free date-range picker — the fiscal year always spans Apr 1 to Mar 31; the Period filter narrows within it.",
    "All four KPI sparklines plot the same monthly Trend series. The prototype gives its daily card a trailing-12-day series, which has no backend equivalent at FY-period grain.",
    "IBM Plex / Archivo cannot be fetched (CDN access is blocked), so the font stacks fall back to SAP's own \"72\", which matches the Fiori filter bar.",
])
d.h2("10.1  Open at the Close of 2026-08-18")
d.bullets([
    "ABAP not yet activated or transported: ZSDD_PMS_GL_CDS (the OD-10 revision), ZCL_PMS_DASH_QUERY, ZSD_PMS_SCHEME, ZCL_PMS_SCHEME_QRY, ZSD_PMS_DASH_TEST (gained a p_zone parameter) and ZSD_PMS_ZONE_DIAG (new). Needed in BOTH MED and MEP. Until ZSDD_PMS_GL_CDS is active in MEP, the production choropleth keeps putting Uttar Pradesh and Karnataka under East.",
    "The app itself has never been deployed to production — see 8.3.",
    "Plant 4700 (RMC Jaipur) is zoned NORTH in MEP client 300 and CENTRAL in MED client 100. That is a master-data question for the business, not a code one, but it means the two systems will not agree on the map until it is settled.",
    "The ADT MCP server returns 401 on every call, so no live object-by-object comparison against MED or MEP could be run. Everything above was established from the repository and from the running app.",
    "Some fields are fetched but no longer read: Geo.PriorValue, UnitDots.PriorValue / PriorGross / DeltaPct / PlantCount, and Material.GrandTotalValue / GrandTotalGross. Harmless, but worth trimming from dashboardService.js when that file is next touched — see 7.7.",
])

# ============================================================= 11 ============
d.h1("11.  File Reference")
d.h2("11.1  ABAP Objects")
d.table(["Object", "What it is"], [
    ["ZSDD_PMS_GL_CDS", "G/L-grain fact view"],
    ["ZSDD_PMS_ITEM_CDS", "Item-grain fact view"],
    ["ZCL_PMS_DASH_QUERY", "Central compute class — all filtering and aggregation"],
    ["ZSD_PMS_KPI / TREND / GEO / UNIT_DOTS / SCHEME", "Custom entities for the five analytical panels"],
    ["ZSD_PMS_PLANT / PLANT_CATALOG", "Top-20 plant entity and its uncapped filter catalog"],
    ["ZSD_PMS_MATERIAL / MATERIAL_CATALOG", "Top-20 material entity and its uncapped filter catalog"],
    ["ZCL_PMS_*_QRY (9 classes)", "IF_RAP_QUERY_PROVIDER shells, one per custom entity"],
    ["ZSD_PMS_DASH_O4", "Service definition exposing all nine entities"],
    ["ZSD_PMS_DASH_TEST", "Standalone validation report — calls the compute class directly"],
    ["ZSD_PMS_ZONE_DIAG", "Read-only zone diagnostic (new, 2026-08-18) — current vs prior gross with and without a zone filter, VKBUR values missing from ZSD_ZONE_PLANT per year, and zones present per year. Standalone; nothing calls it"],
])
d.h2("11.2  UI5 Sources")
d.table(["Path", "What it is"], [
    ["webapp/manifest.json", "App descriptor — data source, model settings, routing"],
    ["webapp/Component.js", "Component bootstrap"],
    ["webapp/view/zsd_pms_dash.view.xml", "The whole screen layout"],
    ["webapp/controller/zsd_pms_dash.controller.js", "Filter staging, catalog merge, KPI/scope derivation, render"],
    ["webapp/model/dashboardService.js", "OData read layer — paths, $select, $batch, optional entities"],
    ["webapp/model/formatter.js", "Indian crore/lakh number and date formatting"],
    ["webapp/model/indiaGeo.js", "State paths, zone unions, projection constants, zone resolution"],
    ["webapp/model/chartOptions.js", "ECharts option builders for the plant and material panels"],
    ["webapp/model/chartTheme.js / appTheme.js", "Palette resolution and light/dark theme handling"],
    ["webapp/model/echartsLoader.js", "Loads the vendored ECharts bundle"],
    ["webapp/control/*.js", "The nine custom controls listed in 7.2"],
    ["webapp/css/style.css", "All dashboard styling and the light/dark token sets"],
    ["webapp/i18n/i18n.properties", "Every user-facing string"],
    ["webapp/localService/mainService/metadata.xml", "Local metadata copy for mock runs"],
])
d.callout("The local test fixture has a blind spot", "webapp/test/viewPreview.html sets the "
          "dashboard model directly and never calls the OData service. It is useful for exercising "
          "rendering and layout, but it cannot catch a missing $select entry, a bad resource path "
          "or any other service-layer defect.")

d.save(sys.argv[1])
print("TS written")
