*&---------------------------------------------------------------------*
*& Report ZSD_PMS_DASH_TEST
*&---------------------------------------------------------------------*
*& Plant & Material Wise Sales Dashboard - Phase 1 standalone test/demo
*& report.
*&
*& Purpose: exercise ZCL_PMS_DASH_QUERY=>get_dashboard_data directly,
*& before any OData/RAP/UI5 work exists (that is Phase 2), so the two new
*& CDS views and the query class can be validated in a real system as
*& soon as they are activated - mirrors the GRN Dashboard's own
*& ZMM_GRN_DASH_TEST.prog.abap (AD-1). Output is a plain classic list (no
*& ALV) - this report is a validation tool, not the dashboard itself.
*&
*& Each section below now prints a column heading row (fixed AT
*& positions, shared between header and data WRITEs so they line up)
*& purely to make the list readable while eyeballing it - added
*& 2026-08-13, no change to what is actually computed.
*&---------------------------------------------------------------------*
REPORT zsd_pms_dash_test.

TABLES: vbrp, t001w.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  SELECT-OPTIONS: s_werks FOR vbrp-werks MODIF ID pms,   " placeholder type, see note below
                  s_matnr FOR vbrp-matnr MODIF ID pms,
                  s_regio FOR t001w-regio MODIF ID pms.
  PARAMETERS: p_fy TYPE gjahr.
  " A plain PARAMETER, not a SELECT-OPTION: ALM_ZONE has no confirmed data
  " element to reference (see ZCL_PMS_DASH_QUERY's ty_range_zone note), and
  " one value is enough to reproduce the growth-indicator problem. Type it
  " exactly as the dashboard's Zone dropdown sends it, e.g. Central.
  PARAMETERS: p_zone TYPE char10.
SELECTION-SCREEN END OF BLOCK b1.

* NOTE: S_WERKS/S_MATNR/S_REGIO are declared against VBRP/T001W - standard
* tables, not the new Z objects - purely so this file has no compile-time
* dependency on ZSDD_PMS_GL_CDS/ZSDD_PMS_ITEM_CDS while drafted outside a
* system (no live DDIC access - see CONTEXT_LOG.md sec.7). These already
* match ZCL_PMS_DASH_QUERY's own filter types (werks_d/matnr/regio), so no
* retyping should be needed on import, unlike the GRN report's equivalent
* note (which used a deliberately unrelated placeholder type).

START-OF-SELECTION.

  DATA(ls_filters) = zcl_pms_dash_query=>default_filters( ).

  IF p_fy IS NOT INITIAL.
    ls_filters-fy = p_fy.
  ENDIF.
  IF s_werks[] IS NOT INITIAL.
    ls_filters-plant = CORRESPONDING #( s_werks[] ).
  ENDIF.
  IF s_matnr[] IS NOT INITIAL.
    ls_filters-material = CORRESPONDING #( s_matnr[] ).
  ENDIF.
  IF s_regio[] IS NOT INITIAL.
    ls_filters-state = CORRESPONDING #( s_regio[] ).
  ENDIF.
  IF p_zone IS NOT INITIAL.
    APPEND VALUE #( sign = 'I' option = 'EQ' low = p_zone ) TO ls_filters-zone.
  ENDIF.

  DATA(ls_dash) = zcl_pms_dash_query=>get_dashboard_data( ls_filters ).

  PERFORM show_kpis.
  PERFORM show_trend.
  PERFORM show_geo.
  PERFORM show_unit_dots.
  PERFORM show_scheme.
  PERFORM show_plant_top20.
  PERFORM show_material_top20.


FORM show_kpis.
  " label is TYPE string (dynamic length) - WRITE ... string(30) throws
  " CX_SY_RANGE_OUT_OF_BOUNDS whenever the content is shorter than 30, so
  " convert to a fixed-length CHAR local first (mirrors ZMM_GRN_DASH_TEST's
  " own show_kpis FORM exactly).
  DATA lv_label TYPE char30.

  WRITE: / 'KPIs (4th row = OD-1c Yesterday/Month-End Sale snapshot)'.
  WRITE: /1(30)  'KPI', 32(20) 'Current Value', 53(20) 'Prior Value',
          74(10) 'Delta %',    86(12) 'Snapshot Date', 99(10) 'Doc Count'.
  ULINE.
  LOOP AT ls_dash-kpis ASSIGNING FIELD-SYMBOL(<ls_kpi>).
    lv_label = <ls_kpi>-label.
    WRITE: /1(30)  lv_label,        32(20) <ls_kpi>-curr_value,
            53(20) <ls_kpi>-prior_value,
            74(10) <ls_kpi>-delta_pct,    84 '%',
            86(12) <ls_kpi>-snapshot_date, 99(10) <ls_kpi>-doc_count.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_trend.
  WRITE: / 'Net-value trend (FY period, Apr=1)'.
  WRITE: /1(8) 'Period', 10(20) 'Net Value'.
  ULINE.
  LOOP AT ls_dash-trend ASSIGNING FIELD-SYMBOL(<ls_t>).
    WRITE: /1(8) <ls_t>-period, 10(20) <ls_t>-net_value.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_geo.
  WRITE: / 'India map - by state (OD-1 plant-based geography)'.
  WRITE: /1(5)  'State', 7(20)  'State Name', 28(10) 'Zone',
          39(20) 'Net Value', 60(10) 'Delta %',
          71(8) 'Plants', 80(10) 'Invoices'.
  ULINE.
  LOOP AT ls_dash-geo ASSIGNING FIELD-SYMBOL(<ls_g>).
    WRITE: /1(5)  <ls_g>-regio, 7(20)  <ls_g>-state_text, 28(10) <ls_g>-zone,
            39(20) <ls_g>-net_value, 60(10) <ls_g>-delta_pct,
            71(8) <ls_g>-plant_count, 80(10) <ls_g>-invoice_count.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_unit_dots.
  WRITE: / 'Map dots - by Unit, not plant (OD-3), coords from ZSD_ZONE_PLANT (OD-5)'.
  WRITE: /1(8) 'Unit', 10(20) 'Net Value', 31(8) 'Plants',
          40(14) 'Latitude', 55(14) 'Longitude'.
  ULINE.
  LOOP AT ls_dash-unit_dots ASSIGNING FIELD-SYMBOL(<ls_u>).
    WRITE: /1(8) <ls_u>-unit, 10(20) <ls_u>-net_value, 31(8) <ls_u>-plant_count,
            40(14) <ls_u>-latitude, 55(14) <ls_u>-longitude.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_scheme.
  WRITE: / 'Scheme performance'.
  WRITE: /1(10) 'Scheme', 12(20) 'Scheme Name', 33(20) 'Net Value',
          54(10) 'Share %', 65(10) 'Invoices', 76(10) 'Delta %'.
  ULINE.
  LOOP AT ls_dash-scheme ASSIGNING FIELD-SYMBOL(<ls_s>).
    WRITE: /1(10) <ls_s>-category, 12(20) <ls_s>-cat_desc, 33(20) <ls_s>-net_value,
            54(10) <ls_s>-share_pct, 65(10) <ls_s>-invoice_count, 76(10) <ls_s>-delta_pct.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_plant_top20.
  WRITE: / 'Sales by plant - Top 20 (stacked Net+Tax=Gross)'.
  WRITE: /1(8) 'Plant', 10(20) 'City', 31(18) 'Net Value',
          50(18) 'Tax Value', 69(18) 'Gross Value'.
  ULINE.
  LOOP AT ls_dash-plant_top20 ASSIGNING FIELD-SYMBOL(<ls_p>).
    WRITE: /1(8) <ls_p>-werks, 10(20) <ls_p>-city, 31(18) <ls_p>-net_value,
            50(18) <ls_p>-tax_value, 69(18) <ls_p>-gross_value.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_material_top20.
  WRITE: / 'Sales by material - Top 20 (OD-4 GST breakdown: IGST/SGST/CGST/TCS)'.
  WRITE: /1(18)  'Material', 20(25) 'Description', 46(18) 'Value',
          65(14) 'Qty', 80(6) 'UOM',
          87(14) 'IGST', 102(14) 'SGST', 117(14) 'CGST', 132(14) 'TCS'.
  ULINE.
  LOOP AT ls_dash-material_top20 ASSIGNING FIELD-SYMBOL(<ls_m>).
    WRITE: /1(18)  <ls_m>-matnr, 20(25) <ls_m>-arktx, 46(18) <ls_m>-value,
            65(14) <ls_m>-qty, 80(6) <ls_m>-uom,
            87(14) <ls_m>-igst, 102(14) <ls_m>-sgst, 117(14) <ls_m>-cgst, 132(14) <ls_m>-tcs.
  ENDLOOP.
ENDFORM.
