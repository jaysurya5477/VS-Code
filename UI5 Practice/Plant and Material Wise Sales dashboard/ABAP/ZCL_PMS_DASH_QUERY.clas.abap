*&---------------------------------------------------------------------*
*& Class ZCL_PMS_DASH_QUERY
*&---------------------------------------------------------------------*
*& Plant & Material Wise Sales Dashboard - backend query class.
*& See ../Documentation/ABAP_Backend_Plan.md (Part B/C) and
*& ../Documentation/CONTEXT_LOG.md (sec.3, sec.6) for the design this
*& implements - decisions referenced below (OD-1, OD-1c, OD-3, OD-4,
*& OD-5, Trap 1, Trap 2) are documented there, not repeated in full here.
*&
*& Read-only, no OData/RAP binding yet (Phase 2). Directly callable and
*& testable now via ZSD_PMS_DASH_TEST.prog.abap, mirroring the GRN
*& Dashboard's own Phase 1 (../../GRN Dashboard/ABAP NEW/ZCL_GRN_DASH_QUERY,
*& AD-1).
*&
*& Design: two independent bulk extractions (GL-grain via
*& ZSDD_PMS_GL_CDS, item-grain via ZSDD_PMS_ITEM_CDS - Trap 1), each
*& filtered once, then ALL aggregation (KPIs, trend, geo, scheme, plant
*& and material panels) happens in ABAP over those in-memory tables -
*& same philosophy as ZCL_GRN_DASH_QUERY and the ZFI_SR_NEW_OPT.abap
*& reference program (OD-4's source): one bulk SELECT, then HASHED/SORTED
*& lookup tables instead of per-row DB access inside loops.
*&
*& NOTE:IMPORTANT CAVEATS, read before importing:
*& 1. NOT YET LIVE-TESTED. Written without a working ADT connection (see
*&    CONTEXT_LOG.md sec.7 - client-100 credentials not set up yet). Every
*&    field type below is best-effort; verify against the real DDIC and
*&    adjust on import, exactly as ZCL_GRN_DASH_QUERY's own header notes.
*& 2. P0-0 GATES EVERYTHING. All the "18 units" / "109 plants" facts this
*&    class assumes come from client 120 (a near-empty sandbox) or the
*&    user's own word, not a live production read.
*& 3. Two mechanisms depend on Phase 0 checks not yet run: the per-material
*&    GST pivot and the material<->GL bridge (both OD-4, gated on P0-9
*&    confirming ALIMCO's own PRCD_ELEMENTS condition types), and the
*&    Unit-dot centroid (OD-5, gated on P0-10 once the 2 new lat/lon
*&    fields exist on ZSD_ZONE_PLANT).
*& 4. Known, NOT-yet-built gap: the Scheme filter does not restrict the
*&    material panel (get_item_rows below) - category lives only on the
*&    GL-grain fact, not on VBRP/VBRK. The reverse of resolve_material_gl_
*&    keys() (GL -> item) would close this; not attempted here to avoid
*&    shipping a second unverified cross-grain join in the same pass as
*&    the first one - see that method's own comment.
*&---------------------------------------------------------------------*
CLASS zcl_pms_dash_query DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    TYPES ty_period TYPE n LENGTH 2.

    TYPES:
      ty_range_werks    TYPE RANGE OF werks_d,
      ty_range_matnr    TYPE RANGE OF matnr,
      ty_range_regio    TYPE RANGE OF regio,
      " NOTE:ZSD_ZONE_PLANT-ALM_ZONE's real data element is unconfirmed (no live
      " DDIC access) - CHAR10 is a placeholder, retype once known.
      ty_range_zone     TYPE RANGE OF char10,
      " Confirmed real source (OD-4, from ZFI_SR_NEW_OPT.abap): the "scheme"
      " dimension is ZFI_SALES_GL-CATEGORY.
      ty_range_category TYPE RANGE OF zfi_sales_gl-category,
      ty_range_period   TYPE RANGE OF ty_period,

      BEGIN OF ty_filters,
        fy        TYPE gjahr,
        date_from TYPE dats,          " optional - blank means the whole FY
        date_to   TYPE dats,          " optional - blank means the whole FY
        zone      TYPE ty_range_zone,
        state     TYPE ty_range_regio,
        plant     TYPE ty_range_werks,
        material  TYPE ty_range_matnr,
        scheme    TYPE ty_range_category,
        period    TYPE ty_range_period,
      END OF ty_filters,

      BEGIN OF ty_kpi,
        id            TYPE string,
        label         TYPE string,
        curr_value    TYPE p LENGTH 15 DECIMALS 2,
        prior_value   TYPE p LENGTH 15 DECIMALS 2,
        delta_pct     TYPE p LENGTH 8 DECIMALS 2,
        " Only populated for the 4th ("Yesterday Sale" / "Month-End Sale")
        " KPI - OD-1c. Left initial for the net/tax/gross cards.
        snapshot_date TYPE dats,
        doc_count     TYPE i,
      END OF ty_kpi,
      ty_kpi_tab TYPE STANDARD TABLE OF ty_kpi WITH EMPTY KEY,

      " 12-period (FY Apr-Mar) net-value sparkline series, one row per
      " period actually present - a partial-year FY simply has fewer rows,
      " mirroring the template's seriesByPeriod().slice(...).
      BEGIN OF ty_trend,
        period    TYPE ty_period,
        net_value TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_trend,
      ty_trend_tab TYPE STANDARD TABLE OF ty_trend WITH EMPTY KEY,

      " India choropleth, state grain (OD-1: plant-based geography). Zone
      " is carried as an attribute so the frontend/UI5 can roll this up to
      " zone granularity by summing - assumes each state belongs to exactly
      " one zone, which holds for the 5 zones seen so far (P0-0).
      BEGIN OF ty_geo_row,
        regio         TYPE regio,
        state_text    TYPE char40,
        zone          TYPE char10,
        net_value     TYPE p LENGTH 15 DECIMALS 2,
        prior_value   TYPE p LENGTH 15 DECIMALS 2,
        delta_pct     TYPE p LENGTH 8 DECIMALS 2,
        plant_count   TYPE i,
        invoice_count TYPE i,
      END OF ty_geo_row,
      ty_geo_row_tab TYPE STANDARD TABLE OF ty_geo_row WITH EMPTY KEY,

      " Map dots, Unit grain (OD-3/OD-5) - NOT the same grain as ty_geo_row.
      BEGIN OF ty_unit_dot,
        unit        TYPE char10,   " ZSD_ZONE_PLANT-UNIT - retype once confirmed, P0-7
        net_value   TYPE p LENGTH 15 DECIMALS 2,
        prior_value TYPE p LENGTH 15 DECIMALS 2,
        delta_pct   TYPE p LENGTH 8 DECIMALS 2,
        latitude    TYPE zsd_latitude,   " ZSD_ZONE_PLANT-LATITUDE - retype once confirmed, P10 -decimals 7
        longitude   TYPE zsd_longitude,  " ZSD_ZONE_PLANT-LONGITUDE - retype once confirmed, P10 -decimals 7
        plant_count TYPE i,
      END OF ty_unit_dot,
      ty_unit_dot_tab TYPE STANDARD TABLE OF ty_unit_dot WITH EMPTY KEY,

      BEGIN OF ty_scheme_row,
        category      TYPE zfi_sales_gl-category,
        cat_desc      TYPE char40,
        net_value     TYPE p LENGTH 15 DECIMALS 2,
        share_pct     TYPE p LENGTH 8 DECIMALS 2,
        invoice_count TYPE i,
        delta_pct     TYPE p LENGTH 8 DECIMALS 2,
      END OF ty_scheme_row,
      ty_scheme_row_tab TYPE STANDARD TABLE OF ty_scheme_row WITH EMPTY KEY,

      " Sales by plant, Top 20, stacked Net+Tax=Gross. No YoY - not shown by
      " the template for this panel.
      BEGIN OF ty_plant_row,
        werks       TYPE werks_d,
        city        TYPE char40,
        net_value   TYPE p LENGTH 15 DECIMALS 2,
        tax_value   TYPE p LENGTH 15 DECIMALS 2,
        gross_value TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_plant_row,
      ty_plant_row_tab TYPE STANDARD TABLE OF ty_plant_row WITH EMPTY KEY,

      " Sales by material, Top 20, value+qty+GST breakdown (OD-4). No YoY -
      " not shown by the template for this panel.
      BEGIN OF ty_material_row,
        matnr             TYPE matnr,
        arktx             TYPE arktx,
        uom               TYPE vrkme,
        value             TYPE p LENGTH 15 DECIMALS 2,
        qty               TYPE p LENGTH 15 DECIMALS 3,
        igst              TYPE p LENGTH 15 DECIMALS 2,
        sgst              TYPE p LENGTH 15 DECIMALS 2,
        cgst              TYPE p LENGTH 15 DECIMALS 2,
        tcs               TYPE p LENGTH 15 DECIMALS 2,
        " Sum of Value across every material in scope, before the top-20
        " cut - denormalised onto each row (mirrors ZCL_GRN_DASH_QUERY's
        " ty_material_row-grand_total) so "% of total" divides by the true
        " scope total, not just the top-20 subset's own sum.
        grand_total_value TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_material_row,
      ty_material_row_tab TYPE STANDARD TABLE OF ty_material_row WITH EMPTY KEY,

      BEGIN OF ty_dashboard,
        kpis           TYPE ty_kpi_tab,
        trend          TYPE ty_trend_tab,
        geo            TYPE ty_geo_row_tab,
        unit_dots      TYPE ty_unit_dot_tab,
        scheme         TYPE ty_scheme_row_tab,
        plant_top20    TYPE ty_plant_row_tab,
        material_top20 TYPE ty_material_row_tab,
      END OF ty_dashboard.

    CLASS-METHODS:
      "! Current FY (Apr-Mar, containing today's date), full year, no other
      "! filters - mirrors the frozen HTML template's currentPeriodInfo()/
      "! state.fy default (both updated 2026-08-12 to compute this instead
      "! of hard-coding a year).
      default_filters
        RETURNING VALUE(rs_filters) TYPE ty_filters,

      "! Main entry point - runs the current period, the Trap-2-truncated
      "! prior-year period, and the OD-1c daily snapshot, returning
      "! everything the dashboard needs in one call.
      get_dashboard_data
        IMPORTING is_filters       TYPE ty_filters
        RETURNING VALUE(rs_result) TYPE ty_dashboard.

  PRIVATE SECTION.

    TYPES:
      " One row = one ZSDD_PMS_GL_CDS row = one GL account line (Trap 1).
      BEGIN OF ty_gl_row,
        belnr      TYPE belnr_d,
        gjahr      TYPE gjahr,
        hkont      TYPE hkont,
        vbeln      TYPE vbeln_vf,
        fkart      TYPE fkart,
        vtext      TYPE char40,
        category   TYPE zfi_sales_gl-category,
        cat_desc   TYPE char40,
        type       TYPE char2,
        month_num  TYPE ty_period,   " FY-period (Apr=1) once get_gl_rows converts it - see OD-7
        zmonth     TYPE char6,
        budat      TYPE dats,
        netwr      TYPE p LENGTH 15 DECIMALS 2,
        mwsbk      TYPE p LENGTH 15 DECIMALS 2,
        gross      TYPE p LENGTH 15 DECIMALS 2,
        kunnr      TYPE kunnr,
        kname      TYPE char40,
        werks      TYPE werks_d,
        alm_zone   TYPE char10,
        unit       TYPE char10,
        city       TYPE char40,
        latitude   TYPE zsd_latitude,
        longitude  TYPE zsd_longitude,
        regio      TYPE regio,
        state_text TYPE char40,
      END OF ty_gl_row,
      ty_gl_row_tab TYPE STANDARD TABLE OF ty_gl_row WITH EMPTY KEY,

      " One row = one ZSDD_PMS_ITEM_CDS row = one billing item.
      BEGIN OF ty_item_row,
        vbeln     TYPE vbeln_vf,
        posnr     TYPE posnr_va,
        aubel     TYPE vbeln_va,
        matnr     TYPE matnr,
        arktx     TYPE arktx,
        werks     TYPE werks_d,
        fkimg     TYPE fkimg,
        vrkme     TYPE vrkme,
        netwr     TYPE p LENGTH 15 DECIMALS 2,
        knumv_ana TYPE knumv,
        fkart     TYPE fkart,
        fkdat     TYPE dats,
        gjahr     TYPE gjahr,
        matkl     TYPE matkl,
      END OF ty_item_row,
      ty_item_row_tab TYPE STANDARD TABLE OF ty_item_row WITH EMPTY KEY,

      " Per-item GST, pivoted from PRCD_ELEMENTS (OD-4) - one row per
      " VBELN+POSNR, mirrors ZFI_SR_NEW_OPT.abap's get_line_item_data.
      BEGIN OF ty_item_tax,
        vbeln TYPE vbeln_vf,
        posnr TYPE posnr_va,
        igst  TYPE p LENGTH 15 DECIMALS 2,
        sgst  TYPE p LENGTH 15 DECIMALS 2,
        cgst  TYPE p LENGTH 15 DECIMALS 2,
        tcs   TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_item_tax,
      ty_item_tax_tab TYPE SORTED TABLE OF ty_item_tax WITH UNIQUE KEY vbeln posnr,

      " OD-4's material<->GL bridge key - see resolve_material_gl_keys().
      BEGIN OF ty_material_gl_key,
        vbeln TYPE vbeln_vf,
        hkont TYPE hkont,
      END OF ty_material_gl_key,
      ty_material_gl_key_tab TYPE HASHED TABLE OF ty_material_gl_key WITH UNIQUE KEY vbeln hkont.

    CLASS-METHODS:
      "! a/b as percent of b, i.e. (a-b)/|b|*100 when used for a YoY delta,
      "! or iv_part/iv_whole*100 when used for a share. Zero-whole-safe.
      pct
        IMPORTING iv_part       TYPE p
                  iv_whole      TYPE p
        RETURNING VALUE(rv_pct) TYPE wrbtr,

      "! Current FY (containing today) and current FY-period (1-12, Apr=1).
      current_period_info
        EXPORTING ev_fy     TYPE gjahr
                  ev_period TYPE ty_period,

      days_in_month
        IMPORTING iv_year        TYPE numc4
                  iv_month       TYPE numc2
        RETURNING VALUE(rv_days) TYPE i,

      "! Calendar date for FY iv_fy, FY-period iv_period (Apr=1..Mar=12),
      "! and a specific day-of-month - clamped to that month's real last
      "! day, so e.g. day 29 safely becomes the 28th in a February that
      "! isn't a leap month (same fallback shift_calendar_year uses for
      "! the OD-1c KPI). period_end_date is just this with iv_day = 31,
      "! since 31 always clamps down to the true last day of any month.
      period_day_date
        IMPORTING iv_fy          TYPE gjahr
                  iv_period      TYPE ty_period
                  iv_day         TYPE numc2
        RETURNING VALUE(rv_date) TYPE dats,

      "! Last calendar day of the given FY-period (Apr=1 .. Mar=12).
      period_end_date
        IMPORTING iv_fy          TYPE gjahr
                  iv_period      TYPE ty_period
        RETURNING VALUE(rv_date) TYPE dats,

      "! OD-7, confirmed live 2026-08-13: ZSD_SALE_ALL.month_num is the
      "! plain calendar month (Apr=04 .. Dec=12, Jan=01 .. Mar=03), NOT an
      "! already FY-shifted period - every other method in this class
      "! (get_trend, compute_truncation, current_period_info's own
      "! ev_period) assumes FY-period numbering (Apr=1 .. Mar=12). These
      "! two converters are the single point where that gap is bridged -
      "! get_gl_rows re-expresses month_num as an FY-period immediately
      "! after fetch, so everything downstream can keep assuming Apr=1.
      month_to_period
        IMPORTING iv_month         TYPE ty_period
        RETURNING VALUE(rv_period) TYPE ty_period,

      "! Inverse of month_to_period - used only to translate an FY-period
      "! filter (is_filters-period) back to a real calendar month before
      "! it can be used in a WHERE clause against month_num.
      period_to_month
        IMPORTING iv_period       TYPE ty_period
        RETURNING VALUE(rv_month) TYPE ty_period,

      "! Same calendar day, one year earlier (Feb-29 falls back to Feb-28).
      "! Used only for the OD-1c daily KPI's YoY delta - NOT the Trap-2
      "! same-periods-to-date truncation, which is a different rule (see
      "! compute_truncation).
      shift_calendar_year
        IMPORTING iv_date        TYPE dats
        RETURNING VALUE(rv_date) TYPE dats,

      "! OD-1c: which single day the 4th KPI card reports on, and whether
      "! that is literally "yesterday" (current FY+period selected) or a
      "! past month's last day (a different month/FY selected) - drives
      "! both the value and the card's label. Mirrors the frozen HTML
      "! template's referenceDateForDailyKpi() exactly.
      reference_date_for_daily_kpi
        IMPORTING is_filters      TYPE ty_filters
        EXPORTING ev_date         TYPE dats
                  ev_is_yesterday TYPE abap_bool,

      get_daily_kpi
        IMPORTING is_filters    TYPE ty_filters
        RETURNING VALUE(rs_kpi) TYPE ty_kpi,

      "! Trap 2 (ABAP_Backend_Plan.md sec.A4): the prior-year comparison
      "! truncates at the same FY-period AND day-of-month as TODAY, for
      "! the current FY - a naive full-prior-year comparison against a
      "! still-in-progress current FY makes every delta look
      "! catastrophically negative mid-year. A past (already-closed) FY
      "! is compared in full, with no truncation.
      compute_truncation
        IMPORTING is_filters     TYPE ty_filters
        EXPORTING ev_last_period TYPE ty_period
                  ev_last_day    TYPE numc2
                  et_periods     TYPE ty_range_period,

      "! OD-4: PRCD_ELEMENTS.sakn1 (the G/L account a condition posts to)
      "! matched against a GL row's own HKONT - ties a GL line back to the
      "! material/condition that produced it. Used only when a Material
      "! filter is active, to restrict the GL-grain panels (KPIs/geo/
      "! scheme/plant) to documents that actually contain that material.
      "! NOTE:Best-effort / P0-9-dependent - see this method's body comment.
      resolve_material_gl_keys
        IMPORTING iv_fy          TYPE gjahr
                  iv_date_from   TYPE dats
                  iv_date_to     TYPE dats
                  it_material    TYPE ty_range_matnr
        RETURNING VALUE(rt_keys) TYPE ty_material_gl_key_tab,

      get_gl_rows
        IMPORTING is_filters   TYPE ty_filters
        RETURNING VALUE(rt_gl) TYPE ty_gl_row_tab,

      get_gl_rows_prior
        IMPORTING is_filters      TYPE ty_filters
        RETURNING VALUE(rt_prior) TYPE ty_gl_row_tab,

      "! Credit-memo exclusion for the material panel - mirrors the
      "! template's type==='F2' (invoices only) filter. NOTE:'G2' is a
      "! placeholder guess, not a confirmed ALIMCO fkart value - see P0-2.
      apply_credit_memo_exclusion
        CHANGING ct_item TYPE ty_item_row_tab,

      get_item_rows
        IMPORTING is_filters     TYPE ty_filters
        RETURNING VALUE(rt_item) TYPE ty_item_row_tab,

      get_item_tax
        IMPORTING it_item       TYPE ty_item_row_tab
        RETURNING VALUE(rt_tax) TYPE ty_item_tax_tab,

      get_kpis
        IMPORTING it_curr       TYPE ty_gl_row_tab
                  it_prior      TYPE ty_gl_row_tab
        RETURNING VALUE(rt_kpi) TYPE ty_kpi_tab,

      get_trend
        IMPORTING it_curr         TYPE ty_gl_row_tab
        RETURNING VALUE(rt_trend) TYPE ty_trend_tab,

      get_geo
        IMPORTING it_curr       TYPE ty_gl_row_tab
                  it_prior      TYPE ty_gl_row_tab
        RETURNING VALUE(rt_geo) TYPE ty_geo_row_tab,

      "! OD-5: one dot per Unit, radius = f(net_value). Coordinates are a
      "! value-weighted centroid of the Unit's member plants' own lat/lon
      "! (ZSD_ZONE_PLANT, once the 2 new fields exist - P0-10); plants with
      "! no coordinates are excluded from the centroid but still counted in
      "! net_value. A Unit with NO coordinated plants at all is omitted
      "! entirely (no dot), same "warn and omit, don't crash" contract the
      "! template used for the old plant dots.
      get_unit_dots
        IMPORTING it_curr        TYPE ty_gl_row_tab
        RETURNING VALUE(rt_dots) TYPE ty_unit_dot_tab,

      get_scheme_agg
        IMPORTING it_curr          TYPE ty_gl_row_tab
                  it_prior         TYPE ty_gl_row_tab
        RETURNING VALUE(rt_scheme) TYPE ty_scheme_row_tab,

      get_plant_top20
        IMPORTING it_curr         TYPE ty_gl_row_tab
        RETURNING VALUE(rt_plant) TYPE ty_plant_row_tab,

      get_material_top20
        IMPORTING it_item       TYPE ty_item_row_tab
                  it_tax        TYPE ty_item_tax_tab
        RETURNING VALUE(rt_mat) TYPE ty_material_row_tab.

ENDCLASS.


CLASS zcl_pms_dash_query IMPLEMENTATION.

  METHOD pct.
    IF iv_whole = 0.
      rv_pct = COND #( WHEN iv_part = 0 THEN 0 ELSE 100 ).
    ELSE.
      rv_pct = iv_part / abs( iv_whole ) * 100.
    ENDIF.
  ENDMETHOD.


  METHOD current_period_info.
    DATA(lv_month_c) = sy-datum+4(2).
    DATA(lv_year_i)  = CONV i( sy-datum(4) ).
    DATA(lv_month_i) = CONV i( lv_month_c ).

    " GJAHR convention confirmed live 2026-08-13 (real system, not the
    " frozen template's display convention - see OD-6): FY is named after
    " the calendar year it STARTS in, e.g. Apr 2026-Mar 2027 = FY 2026, not
    " FY 2027. Aug 2026 -> FY 2026 period 05.
    IF lv_month_i >= 4.
      ev_fy     = lv_year_i.
      ev_period = lv_month_i - 3.
    ELSE.
      ev_fy     = lv_year_i - 1.
      ev_period = lv_month_i + 9.
    ENDIF.
  ENDMETHOD.


  METHOD days_in_month.
    DATA(lv_year_i) = CONV i( iv_year ).
    CASE iv_month.
      WHEN '04' OR '06' OR '09' OR '11'.
        rv_days = 30.
      WHEN '02'.
        IF lv_year_i MOD 4 = 0 AND ( lv_year_i MOD 100 <> 0 OR lv_year_i MOD 400 = 0 ).
          rv_days = 29.
        ELSE.
          rv_days = 28.
        ENDIF.
      WHEN OTHERS.
        rv_days = 31.
    ENDCASE.
  ENDMETHOD.


  METHOD period_day_date.
    " Period-to-calendar-month math, same shape as the frozen template's
    " periodDate(fy,per) (fyStartMonth = April, 0-indexed 3), but iv_fy is
    " the real GJAHR convention (OD-6): period 1 (April) falls in calendar
    " year iv_fy itself; period 12 (March) falls in iv_fy + 1.
    DATA(lv_raw)     = 3 + CONV i( iv_period ) - 1.
    DATA(lv_month_i) = lv_raw MOD 12 + 1.
    DATA(lv_year_i)  = CONV i( iv_fy ) + COND i( WHEN lv_raw >= 12 THEN 1 ELSE 0 ).

    DATA(lv_month)    = CONV numc2( |{ lv_month_i WIDTH = 2 PAD = '0' ALIGN = RIGHT }| ).
    DATA(lv_last_day) = days_in_month( iv_year = CONV numc4( lv_year_i ) iv_month = lv_month ).
    DATA(lv_day_i)    = nmin( val1 = CONV i( iv_day ) val2 = lv_last_day ).

    rv_date = |{ lv_year_i }{ lv_month }{ lv_day_i WIDTH = 2 PAD = '0' ALIGN = RIGHT }|.
  ENDMETHOD.


  METHOD period_end_date.
    rv_date = period_day_date( iv_fy = iv_fy iv_period = iv_period iv_day = '31' ).
  ENDMETHOD.


  METHOD month_to_period.
    DATA(lv_month_i) = CONV i( iv_month ).
    rv_period = COND #( WHEN lv_month_i >= 4 THEN lv_month_i - 3 ELSE lv_month_i + 9 ).
  ENDMETHOD.


  METHOD period_to_month.
    DATA(lv_period_i) = CONV i( iv_period ).
    rv_month = COND #( WHEN lv_period_i <= 9 THEN lv_period_i + 3 ELSE lv_period_i - 9 ).
  ENDMETHOD.


  METHOD shift_calendar_year.
    DATA(lv_year)     = iv_date(4).
    DATA(lv_month)    = iv_date+4(2).
    DATA(lv_day)      = iv_date+6(2).
    DATA(lv_new_year) = CONV numc4( CONV i( lv_year ) - 1 ).
    rv_date = |{ lv_new_year }{ lv_month }{ lv_day }|.

    " Feb 29 in a year where year-1 is not a leap year: fall back to Feb 28
    " (mirrors ZCL_GRN_DASH_QUERY=>shift_year exactly).
    IF lv_month = '02' AND lv_day = '29'.
      DATA(lv_year_i) = CONV i( lv_new_year ).
      IF NOT ( lv_year_i MOD 4 = 0 AND ( lv_year_i MOD 100 <> 0 OR lv_year_i MOD 400 = 0 ) ).
        rv_date = |{ lv_new_year }0228|.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD default_filters.
    current_period_info( IMPORTING ev_fy = rs_filters-fy ).
  ENDMETHOD.


  METHOD reference_date_for_daily_kpi.
    current_period_info( IMPORTING ev_fy = DATA(lv_cur_fy) ev_period = DATA(lv_cur_period) ).
    DATA(lv_same_fy) = xsdbool( is_filters-fy = lv_cur_fy ).

    IF is_filters-period IS NOT INITIAL.
      " Multiple periods selected -> use the latest one (mirrors the
      " template's Math.max(...state.months)).
      DATA(lv_period) = VALUE ty_period( ).
      LOOP AT is_filters-period INTO DATA(ls_per) WHERE sign = 'I' AND option = 'EQ'.
        IF ls_per-low > lv_period.
          lv_period = ls_per-low.
        ENDIF.
      ENDLOOP.

      IF lv_same_fy = abap_true AND lines( is_filters-period ) = 1 AND lv_period = lv_cur_period.
        ev_date = sy-datum - 1.
        ev_is_yesterday = abap_true.
      ELSE.
        ev_date = period_end_date( iv_fy = is_filters-fy iv_period = lv_period ).
        ev_is_yesterday = abap_false.
      ENDIF.

    ELSEIF lv_same_fy = abap_true.
      ev_date = sy-datum - 1.
      ev_is_yesterday = abap_true.

    ELSE.
      " Different FY, no specific month picked. Using period 12 (FY end,
      " March) is the simplest defensible default for a closed prior FY; if
      " the selected FY is still open this may land on a future date - the
      " caller (get_daily_kpi) already treats "date > today" as no billing.
      ev_date = period_end_date( iv_fy = is_filters-fy iv_period = 12 ).
      ev_is_yesterday = abap_false.
    ENDIF.
  ENDMETHOD.


  METHOD get_daily_kpi.
    reference_date_for_daily_kpi(
      EXPORTING is_filters      = is_filters
      IMPORTING ev_date         = DATA(lv_date)
                ev_is_yesterday = DATA(lv_is_yesterday) ).

    rs_kpi-id    = 'DAILY_SALE'.
    rs_kpi-label = COND #( WHEN lv_is_yesterday = abap_true THEN 'Yesterday Sale' ELSE 'Month-End Sale' ).

    IF lv_date > sy-datum.
      " Selected month/FY hasn't happened yet - no data can exist. Leave
      " values at their type-initial zero rather than querying.
      RETURN.
    ENDIF.

    rs_kpi-snapshot_date = lv_date.

    TYPES: BEGIN OF ty_daily_agg,
             netwr TYPE p LENGTH 15 DECIMALS 2,
             docs  TYPE i,
           END OF ty_daily_agg.

    SELECT SUM( netwr ) AS netwr, COUNT( DISTINCT vbeln ) AS docs
      FROM zsdd_pms_gl_cds
      WHERE budat    = @lv_date
        AND alm_zone IN @is_filters-zone
        AND regio    IN @is_filters-state
        AND werks    IN @is_filters-plant
        AND category IN @is_filters-scheme
      INTO @DATA(ls_curr_agg).

    DATA(lv_prior_date) = shift_calendar_year( lv_date ).
    DATA lv_prior_net TYPE p LENGTH 15 DECIMALS 2.

    SELECT SUM( netwr ) AS netwr
      FROM zsdd_pms_gl_cds
      WHERE budat    = @lv_prior_date
        AND alm_zone IN @is_filters-zone
        AND regio    IN @is_filters-state
        AND werks    IN @is_filters-plant
        AND category IN @is_filters-scheme
      INTO @lv_prior_net.

    rs_kpi-curr_value  = ls_curr_agg-netwr.
    rs_kpi-doc_count   = ls_curr_agg-docs.
    rs_kpi-prior_value = lv_prior_net.
    rs_kpi-delta_pct   = pct( iv_part = rs_kpi-curr_value - rs_kpi-prior_value iv_whole = rs_kpi-prior_value ).
  ENDMETHOD.


  METHOD compute_truncation.
    " The "as of" cutoff for a same-periods-to-date comparison is simply
    " TODAY's own (period, day) - not derived by scanning the fetched
    " current-year rows for their own latest one. Scanning the data was
    " fragile: if recent postings lag (P0-8), the newest row present can
    " sit well before today, silently truncating BOTH years earlier than
    " intended; a single stray future-dated correction could just as
    " easily push it later than today. Today's period/day works
    " identically for both years because periods are already FY-numbered
    " (Apr=1) the same way in both - the only wrinkle is Feb 29 falling in
    " a non-leap prior year, and that's harmless for a "<=" day cutoff (a
    " 28-day February is never excluded by day<=29) - unlike the OD-1c
    " daily KPI's exact-date lookup, which needs shift_calendar_year's
    " explicit Feb-29 fallback instead.
    current_period_info( IMPORTING ev_fy = DATA(lv_cur_fy) ev_period = DATA(lv_cur_period) ).

    IF is_filters-fy = lv_cur_fy.
      ev_last_period = lv_cur_period.
      ev_last_day    = sy-datum+6(2).
    ELSE.
      " Not the current FY (a closed past year, or a future one) -
      " nothing to truncate; compare the full FY in both years.
      ev_last_period = 12.
      ev_last_day    = '31'.
    ENDIF.

    IF is_filters-period IS NOT INITIAL.
      et_periods = is_filters-period.
    ELSE.
      DO ev_last_period TIMES.
        APPEND VALUE #( sign = 'I' option = 'EQ' low = sy-index ) TO et_periods.
      ENDDO.
    ENDIF.
  ENDMETHOD.


  METHOD resolve_material_gl_keys.
    TYPES: BEGIN OF ty_item_key,
             vbeln     TYPE vbeln_vf,
             posnr     TYPE posnr_va,
             knumv_ana TYPE knumv,
           END OF ty_item_key.
    DATA lt_item_raw TYPE STANDARD TABLE OF ty_item_key WITH EMPTY KEY.

    SELECT vbeln, posnr, knumv_ana
      FROM zsdd_pms_item_cds
      WHERE gjahr = @iv_fy
        AND fkdat BETWEEN @iv_date_from AND @iv_date_to
        AND matnr IN @it_material
      INTO CORRESPONDING FIELDS OF TABLE @lt_item_raw.

    IF lt_item_raw IS INITIAL.
      RETURN.
    ENDIF.

    TYPES: BEGIN OF ty_prcd_link,
             knumv TYPE prcd_elements-knumv,
             kposn TYPE prcd_elements-kposn,
             sakn1 TYPE prcd_elements-sakn1,
           END OF ty_prcd_link.
    DATA lt_prcd TYPE SORTED TABLE OF ty_prcd_link WITH NON-UNIQUE KEY knumv kposn.

    " OD-4: the exact material<->GL link. PRCD_ELEMENTS.sakn1 is the G/L
    " account a pricing condition posts to - matching it against a GL row's
    " own HKONT ties that GL line back to the material/condition that
    " produced it. Condition-type list is the union of both the item-level
    " (get_item_tax) and header/GL-level pulls in the reference program, so
    " this bridge catches a condition even if it only ever posts at GL
    " level (JOCG/JOUB never appear per-item in ZFI_SR_NEW_OPT.abap).
    " NOTE:Best-effort / P0-9-dependent: an item whose applicable condition
    " isn't one of these types (e.g. a fully tax-exempt line) produces NO
    " link row, so it will silently fail to restrict the GL-grain panels
    " when a Material filter is active. Verify condition-type coverage
    " during Phase 0 testing (cross-check against P0-1's total
    " reconciliation) before relying on this for production filtering.
    SELECT knumv, kposn, sakn1
      FROM prcd_elements
      FOR ALL ENTRIES IN @lt_item_raw
      WHERE knumv = @lt_item_raw-knumv_ana
        AND kposn = @lt_item_raw-posnr
        AND kschl IN ( 'JOIG', 'JOCG', 'JOSG', 'JTC1', 'JTC2', 'JTC4', 'JOUB' )
        AND kwert <> 0
        AND kstat = ' '
        AND sakn1 <> ' '
      INTO TABLE @lt_prcd.

    LOOP AT lt_item_raw INTO DATA(ls_item).
      LOOP AT lt_prcd INTO DATA(ls_prcd) WHERE knumv = ls_item-knumv_ana AND kposn = ls_item-posnr.
        READ TABLE rt_keys TRANSPORTING NO FIELDS WITH TABLE KEY vbeln = ls_item-vbeln hkont = ls_prcd-sakn1.
        IF sy-subrc <> 0.
          INSERT VALUE #( vbeln = ls_item-vbeln hkont = ls_prcd-sakn1 ) INTO TABLE rt_keys.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.


  METHOD get_gl_rows.
    " OD-6: FY iv_fy runs calendar Apr(iv_fy) .. Mar(iv_fy+1) - real GJAHR
    " convention, confirmed live 2026-08-13, NOT the frozen template's
    " display convention (see current_period_info's own header note).
    DATA(lv_date_from) = COND dats( WHEN is_filters-date_from IS NOT INITIAL THEN is_filters-date_from
                                     ELSE |{ is_filters-fy }0401| ).
    DATA(lv_date_to)   = COND dats( WHEN is_filters-date_to   IS NOT INITIAL THEN is_filters-date_to
                                     ELSE |{ is_filters-fy + 1 }0331| ).

    " OD-7: is_filters-period is FY-period (Apr=1), but the real month_num
    " column is a plain calendar month - translate the filter range before
    " it can be used against that column (see month_to_period's header).
    DATA(lt_month_filter) = VALUE ty_range_period( ).
    LOOP AT is_filters-period INTO DATA(ls_per_f).
      ls_per_f-low  = COND #( WHEN ls_per_f-low  IS NOT INITIAL THEN period_to_month( ls_per_f-low ) ).
      ls_per_f-high = COND #( WHEN ls_per_f-high IS NOT INITIAL THEN period_to_month( ls_per_f-high ) ).
      APPEND ls_per_f TO lt_month_filter.
    ENDLOOP.

    SELECT belnr, gjahr, hkont, vbeln, fkart, vtext, category, cat_desc, type,
           month_num, zmonth, budat, netwr, mwsbk, gross, kunnr, kname, werks,
           alm_zone, unit, city, latitude, longitude, regio, state_text
      FROM zsdd_pms_gl_cds
      WHERE gjahr     = @is_filters-fy
        AND budat     BETWEEN @lv_date_from AND @lv_date_to
        AND alm_zone  IN @is_filters-zone
        AND regio     IN @is_filters-state
        AND werks     IN @is_filters-plant
        AND category  IN @is_filters-scheme
        AND month_num IN @lt_month_filter
      ORDER BY belnr, gjahr, hkont
      INTO CORRESPONDING FIELDS OF TABLE @rt_gl.

    " Re-express month_num as FY-period (Apr=1) for every downstream
    " in-memory consumer (get_trend, compute_truncation, and
    " get_gl_rows_prior via its call back into this same method).
    LOOP AT rt_gl ASSIGNING FIELD-SYMBOL(<ls_gl_period>).
      <ls_gl_period>-month_num = month_to_period( <ls_gl_period>-month_num ).
    ENDLOOP.

    IF is_filters-material IS NOT INITIAL.
      DATA(lt_keys) = resolve_material_gl_keys(
        iv_fy = is_filters-fy iv_date_from = lv_date_from iv_date_to = lv_date_to
        it_material = is_filters-material ).

      DATA(lt_gl_filtered) = VALUE ty_gl_row_tab( ).
      LOOP AT rt_gl INTO DATA(ls_gl).
        READ TABLE lt_keys TRANSPORTING NO FIELDS WITH TABLE KEY vbeln = ls_gl-vbeln hkont = ls_gl-hkont.
        IF sy-subrc = 0.
          APPEND ls_gl TO lt_gl_filtered.
        ENDIF.
      ENDLOOP.
      rt_gl = lt_gl_filtered.
    ENDIF.
  ENDMETHOD.


  METHOD get_gl_rows_prior.
    compute_truncation(
      EXPORTING is_filters     = is_filters
      IMPORTING ev_last_period = DATA(lv_last_period)
                ev_last_day    = DATA(lv_last_day)
                et_periods     = DATA(lt_periods) ).

    DATA(ls_prior_filters)      = is_filters.
    ls_prior_filters-fy         = is_filters-fy - 1.
    ls_prior_filters-period     = lt_periods.
    " OD-6/OD-9: prior FY (is_filters-fy - 1) runs Apr(fy-1) .. Mar(fy), but
    " date_to is the Trap-2 cutoff itself (same FY-period + day as today,
    " from compute_truncation above), not the prior FY's full year-end -
    " get_gl_rows' own WHERE clause does the truncation directly, so there
    " is no full-year fetch to filter back down afterwards.
    ls_prior_filters-date_from  = |{ is_filters-fy - 1 }0401|.
    DATA(lv_prior_fy) = CONV gjahr( is_filters-fy - 1 ).
    ls_prior_filters-date_to    = period_day_date(
                                     iv_fy     = lv_prior_fy
                                     iv_period = lv_last_period
                                     iv_day    = lv_last_day ).

    rt_prior = get_gl_rows( ls_prior_filters ).
  ENDMETHOD.


  METHOD apply_credit_memo_exclusion.
    DELETE ct_item WHERE fkart = 'G2'.
  ENDMETHOD.


  METHOD get_item_rows.
    " OD-6: see get_gl_rows' note - iv_fy runs Apr(fy) .. Mar(fy+1).
    DATA(lv_date_from) = COND dats( WHEN is_filters-date_from IS NOT INITIAL THEN is_filters-date_from
                                     ELSE |{ is_filters-fy }0401| ).
    DATA(lv_date_to)   = COND dats( WHEN is_filters-date_to   IS NOT INITIAL THEN is_filters-date_to
                                     ELSE |{ is_filters-fy + 1 }0331| ).

    SELECT vbeln, posnr, aubel, matnr, arktx, werks, fkimg, vrkme, netwr,
           knumv_ana, fkart, fkdat, gjahr, matkl
      FROM zsdd_pms_item_cds
      WHERE gjahr = @is_filters-fy
        AND fkdat BETWEEN @lv_date_from AND @lv_date_to
        AND werks IN @is_filters-plant
        AND matnr IN @is_filters-material
      ORDER BY vbeln, posnr
      INTO CORRESPONDING FIELDS OF TABLE @rt_item.

    apply_credit_memo_exclusion( CHANGING ct_item = rt_item ).

    " NOTE:Known gap, not built in this pass: the Scheme filter (category) is
    " NOT applied here - category lives only on the GL-grain fact, not on
    " VBRP/VBRK. Closing this needs the mirror image of
    " resolve_material_gl_keys() (GL -> item via the same PRCD_ELEMENTS
    " bridge); left for a follow-up once that bridge is validated (P0-9).
  ENDMETHOD.


  METHOD get_item_tax.
    IF it_item IS INITIAL.
      RETURN.
    ENDIF.

    TYPES: BEGIN OF ty_prcd_raw,
             knumv TYPE prcd_elements-knumv,
             kposn TYPE prcd_elements-kposn,
             kschl TYPE prcd_elements-kschl,
             kwert TYPE prcd_elements-kwert,
           END OF ty_prcd_raw.
    DATA lt_prcd TYPE SORTED TABLE OF ty_prcd_raw WITH NON-UNIQUE KEY knumv kposn.

    " OD-4: VBRP.knumv_ana -> PRCD_ELEMENTS(knumv=knumv_ana, kposn=posnr).
    " Condition types per ZFI_SR_NEW_OPT.abap's get_line_item_data FORM:
    " JOIG=IGST, JOSG=SGST (CGST derived as equal - standard intrastate
    " 50/50 split, not read from a separate condition at item level),
    " JTC1/JTC2/JTC4=TCS. kstat = ' ' excludes statistical conditions;
    " kwert <> 0 drops zero-value rows. NOTE:Not yet confirmed these condition
    " types match ALIMCO's own pricing procedure (P0-9) - if they don't,
    " this method silently returns all-zero tax for every item rather than
    " failing loudly. Cross-check against P0-1's total reconciliation.
    SELECT knumv, kposn, kschl, kwert
      FROM prcd_elements
      FOR ALL ENTRIES IN @it_item
      WHERE knumv = @it_item-knumv_ana
        AND kposn = @it_item-posnr
        AND kschl IN ( 'JOIG', 'JOSG', 'JTC1', 'JTC2', 'JTC4' )
        AND kwert <> 0
        AND kstat = ' '
      INTO TABLE @lt_prcd.

    DATA lt_tax TYPE ty_item_tax_tab.

    LOOP AT it_item ASSIGNING FIELD-SYMBOL(<ls_item>).
      DATA(ls_tax) = VALUE ty_item_tax( vbeln = <ls_item>-vbeln posnr = <ls_item>-posnr ).

      LOOP AT lt_prcd INTO DATA(ls_prcd) WHERE knumv = <ls_item>-knumv_ana AND kposn = <ls_item>-posnr.
        CASE ls_prcd-kschl.
          WHEN 'JOSG'.
            ls_tax-sgst += ls_prcd-kwert.
            ls_tax-cgst += ls_prcd-kwert.
          WHEN 'JOIG'.
            ls_tax-igst += ls_prcd-kwert.
          WHEN 'JTC1' OR 'JTC2' OR 'JTC4'.
            ls_tax-tcs += ls_prcd-kwert.
        ENDCASE.
      ENDLOOP.

      INSERT ls_tax INTO TABLE lt_tax.
    ENDLOOP.

    rt_tax = lt_tax.
  ENDMETHOD.


  METHOD get_kpis.
    DATA lv_curr_gross  TYPE wrbtr.
    DATA lv_prior_gross TYPE wrbtr.

    DATA(lv_curr_net) = REDUCE #( INIT s TYPE wrbtr FOR ls IN it_curr NEXT s += ls-netwr ).
    DATA(lv_curr_tax) = REDUCE #( INIT s TYPE wrbtr FOR ls IN it_curr NEXT s += ls-mwsbk ).
    lv_curr_gross = lv_curr_net + lv_curr_tax.

    DATA(lv_prior_net) = REDUCE #( INIT s TYPE wrbtr FOR ls IN it_prior NEXT s += ls-netwr ).
    DATA(lv_prior_tax) = REDUCE #( INIT s TYPE wrbtr FOR ls IN it_prior NEXT s += ls-mwsbk ).
    lv_prior_gross = lv_prior_net + lv_prior_tax.

    APPEND VALUE #( id = 'NET' label = 'Total net value'
                    curr_value = lv_curr_net prior_value = lv_prior_net
                    delta_pct = pct( iv_part = lv_curr_net - lv_prior_net iv_whole = lv_prior_net ) ) TO rt_kpi.
    APPEND VALUE #( id = 'TAX' label = 'Total tax (GST)'
                    curr_value = lv_curr_tax prior_value = lv_prior_tax
                    delta_pct = pct( iv_part = lv_curr_tax - lv_prior_tax iv_whole = lv_prior_tax ) ) TO rt_kpi.
    APPEND VALUE #( id = 'GROSS' label = 'Total gross value'
                    curr_value = lv_curr_gross prior_value = lv_prior_gross
                    delta_pct = pct( iv_part = lv_curr_gross - lv_prior_gross iv_whole = lv_prior_gross ) ) TO rt_kpi.
  ENDMETHOD.


  METHOD get_trend.
    DATA lt_trend TYPE ty_trend_tab.

    LOOP AT it_curr ASSIGNING FIELD-SYMBOL(<ls_row>).
      ASSIGN lt_trend[ period = <ls_row>-month_num ] TO FIELD-SYMBOL(<ls_trend>).
      IF sy-subrc <> 0.
        INSERT VALUE #( period = <ls_row>-month_num ) INTO TABLE lt_trend ASSIGNING <ls_trend>.
      ENDIF.
      <ls_trend>-net_value += <ls_row>-netwr.
    ENDLOOP.

    SORT lt_trend BY period ASCENDING.
    rt_trend = lt_trend.
  ENDMETHOD.


  METHOD get_geo.
    DATA lt_geo TYPE ty_geo_row_tab.

    TYPES: BEGIN OF ty_seen_werks, regio TYPE regio, werks TYPE werks_d, END OF ty_seen_werks,
           BEGIN OF ty_seen_vbeln, regio TYPE regio, vbeln TYPE vbeln_vf, END OF ty_seen_vbeln.
    DATA lt_seen_werks TYPE HASHED TABLE OF ty_seen_werks WITH UNIQUE KEY regio werks.
    DATA lt_seen_vbeln TYPE HASHED TABLE OF ty_seen_vbeln WITH UNIQUE KEY regio vbeln.

    LOOP AT it_curr ASSIGNING FIELD-SYMBOL(<ls_row>).
      ASSIGN lt_geo[ regio = <ls_row>-regio ] TO FIELD-SYMBOL(<ls_geo>).
      IF sy-subrc <> 0.
        INSERT VALUE #( regio = <ls_row>-regio state_text = <ls_row>-state_text zone = <ls_row>-alm_zone )
          INTO TABLE lt_geo ASSIGNING <ls_geo>.
      ENDIF.
      <ls_geo>-net_value += <ls_row>-netwr.

      READ TABLE lt_seen_werks TRANSPORTING NO FIELDS WITH TABLE KEY regio = <ls_row>-regio werks = <ls_row>-werks.
      IF sy-subrc <> 0.
        INSERT VALUE #( regio = <ls_row>-regio werks = <ls_row>-werks ) INTO TABLE lt_seen_werks.
      ENDIF.
      READ TABLE lt_seen_vbeln TRANSPORTING NO FIELDS WITH TABLE KEY regio = <ls_row>-regio vbeln = <ls_row>-vbeln.
      IF sy-subrc <> 0.
        INSERT VALUE #( regio = <ls_row>-regio vbeln = <ls_row>-vbeln ) INTO TABLE lt_seen_vbeln.
      ENDIF.
    ENDLOOP.

    LOOP AT it_prior ASSIGNING FIELD-SYMBOL(<ls_prior>).
      ASSIGN lt_geo[ regio = <ls_prior>-regio ] TO <ls_geo>.
      IF sy-subrc <> 0.
        INSERT VALUE #( regio = <ls_prior>-regio state_text = <ls_prior>-state_text zone = <ls_prior>-alm_zone )
          INTO TABLE lt_geo ASSIGNING <ls_geo>.
      ENDIF.
      <ls_geo>-prior_value += <ls_prior>-netwr.
    ENDLOOP.

    LOOP AT lt_geo ASSIGNING <ls_geo>.
      <ls_geo>-delta_pct = pct( iv_part = <ls_geo>-net_value - <ls_geo>-prior_value iv_whole = <ls_geo>-prior_value ).

      DATA(lv_pc) = 0.
      LOOP AT lt_seen_werks TRANSPORTING NO FIELDS WHERE regio = <ls_geo>-regio.
        lv_pc += 1.
      ENDLOOP.
      <ls_geo>-plant_count = lv_pc.

      DATA(lv_ic) = 0.
      LOOP AT lt_seen_vbeln TRANSPORTING NO FIELDS WHERE regio = <ls_geo>-regio.
        lv_ic += 1.
      ENDLOOP.
      <ls_geo>-invoice_count = lv_ic.
    ENDLOOP.

    rt_geo = lt_geo.
  ENDMETHOD.


  METHOD get_unit_dots.
    " Step 1: per-plant totals within scope (value + its own, constant,
    " lat/lon/unit) - a unit's centroid is weighted by ITS PLANTS' values,
    " not by raw GL line count.
    TYPES: BEGIN OF ty_plant_acc,
             werks     TYPE werks_d,
             unit      TYPE char10,
             latitude  TYPE p LENGTH 9 DECIMALS 6,
             longitude TYPE p LENGTH 9 DECIMALS 6,
             has_coord TYPE abap_bool,
             value     TYPE p LENGTH 15 DECIMALS 2,
           END OF ty_plant_acc.
    DATA lt_plant TYPE STANDARD TABLE OF ty_plant_acc WITH EMPTY KEY.

    " Key on WERKS+UNIT together, not WERKS alone - one plant can bill
    " under more than one sales office (OD-8: the real unit-join key is
    " VKBUR, not WERKS), so the same plant can legitimately feed more than
    " one unit. Keying on WERKS alone pinned a plant to whichever unit its
    " first-seen row happened to carry and silently misattributed every
    " later row from that plant, regardless of its own real unit.
    LOOP AT it_curr ASSIGNING FIELD-SYMBOL(<ls_row>).
      ASSIGN lt_plant[ werks = <ls_row>-werks unit = <ls_row>-unit ] TO FIELD-SYMBOL(<ls_plant>).
      IF sy-subrc <> 0.
        INSERT VALUE #( werks = <ls_row>-werks unit = <ls_row>-unit
                         latitude = <ls_row>-latitude longitude = <ls_row>-longitude
                         has_coord = xsdbool( <ls_row>-latitude IS NOT INITIAL AND <ls_row>-longitude IS NOT INITIAL ) )
          INTO TABLE lt_plant ASSIGNING <ls_plant>.
      ENDIF.
      <ls_plant>-value += <ls_row>-netwr.
    ENDLOOP.

    " Step 2: roll plants up to units - OD-5 value-weighted centroid.
    TYPES: BEGIN OF ty_unit_acc,
             unit         TYPE char10,
             value        TYPE p LENGTH 15 DECIMALS 2,
             coord_weight TYPE p LENGTH 15 DECIMALS 2,   " sum of value across ONLY plants with coordinates
             lat_weighted TYPE p LENGTH 15 DECIMALS 6,
             lon_weighted TYPE p LENGTH 15 DECIMALS 6,
             plant_count  TYPE i,
           END OF ty_unit_acc.
    DATA lt_unit TYPE STANDARD TABLE OF ty_unit_acc WITH EMPTY KEY.

    LOOP AT lt_plant INTO DATA(ls_plant) WHERE unit IS NOT INITIAL.
      ASSIGN lt_unit[ unit = ls_plant-unit ] TO FIELD-SYMBOL(<ls_unit>).
      IF sy-subrc <> 0.
        INSERT VALUE #( unit = ls_plant-unit ) INTO TABLE lt_unit ASSIGNING <ls_unit>.
      ENDIF.
      <ls_unit>-value       += ls_plant-value.
      <ls_unit>-plant_count += 1.
      IF ls_plant-has_coord = abap_true.
        <ls_unit>-coord_weight += ls_plant-value.
        <ls_unit>-lat_weighted += ls_plant-value * ls_plant-latitude.
        <ls_unit>-lon_weighted += ls_plant-value * ls_plant-longitude.
      ENDIF.
    ENDLOOP.

    DATA lt_dots TYPE ty_unit_dot_tab.
    LOOP AT lt_unit INTO DATA(ls_unit).
      " No plant in this unit has coordinates yet (OD-5 fields not populated,
      " or none of this unit's plants billed in scope) - omit the dot rather
      " than plotting at a meaningless (0,0).
      CHECK ls_unit-coord_weight > 0.
      APPEND VALUE #( unit = ls_unit-unit
                       net_value = ls_unit-value
                       plant_count = ls_unit-plant_count
                       latitude  = ls_unit-lat_weighted / ls_unit-coord_weight
                       longitude = ls_unit-lon_weighted / ls_unit-coord_weight ) TO lt_dots.
    ENDLOOP.

    rt_dots = lt_dots.
  ENDMETHOD.


  METHOD get_scheme_agg.
    DATA lt_scheme TYPE ty_scheme_row_tab.

    TYPES: BEGIN OF ty_seen_vbeln, category TYPE zfi_sales_gl-category, vbeln TYPE vbeln_vf, END OF ty_seen_vbeln.
    DATA lt_seen_vbeln TYPE HASHED TABLE OF ty_seen_vbeln WITH UNIQUE KEY category vbeln.

    LOOP AT it_curr ASSIGNING FIELD-SYMBOL(<ls_row>).
      ASSIGN lt_scheme[ category = <ls_row>-category ] TO FIELD-SYMBOL(<ls_scheme>).
      IF sy-subrc <> 0.
        INSERT VALUE #( category = <ls_row>-category cat_desc = <ls_row>-cat_desc )
          INTO TABLE lt_scheme ASSIGNING <ls_scheme>.
      ENDIF.
      <ls_scheme>-net_value += <ls_row>-netwr.

      READ TABLE lt_seen_vbeln TRANSPORTING NO FIELDS WITH TABLE KEY category = <ls_row>-category vbeln = <ls_row>-vbeln.
      IF sy-subrc <> 0.
        INSERT VALUE #( category = <ls_row>-category vbeln = <ls_row>-vbeln ) INTO TABLE lt_seen_vbeln.
      ENDIF.
    ENDLOOP.

    LOOP AT it_prior ASSIGNING FIELD-SYMBOL(<ls_prior>).
      ASSIGN lt_scheme[ category = <ls_prior>-category ] TO <ls_scheme>.
      IF sy-subrc <> 0.
        INSERT VALUE #( category = <ls_prior>-category cat_desc = <ls_prior>-cat_desc )
          INTO TABLE lt_scheme ASSIGNING <ls_scheme>.
      ENDIF.
    ENDLOOP.

    DATA(lv_grand_total) = REDUCE #( INIT s TYPE wrbtr FOR ls IN lt_scheme NEXT s += ls-net_value ).

    LOOP AT lt_scheme ASSIGNING <ls_scheme>.
      <ls_scheme>-share_pct = pct( iv_part = <ls_scheme>-net_value iv_whole = lv_grand_total ).

      DATA(lv_ic) = 0.
      LOOP AT lt_seen_vbeln TRANSPORTING NO FIELDS WHERE category = <ls_scheme>-category.
        lv_ic += 1.
      ENDLOOP.
      <ls_scheme>-invoice_count = lv_ic.

      DATA(lv_prior_value) = REDUCE #(
        INIT s TYPE wrbtr FOR ls_p IN it_prior WHERE ( category = <ls_scheme>-category ) NEXT s += ls_p-netwr ).
      <ls_scheme>-delta_pct = pct( iv_part = <ls_scheme>-net_value - lv_prior_value iv_whole = lv_prior_value ).
    ENDLOOP.

    rt_scheme = lt_scheme.
  ENDMETHOD.


  METHOD get_plant_top20.
    DATA lt_plant TYPE ty_plant_row_tab.

    LOOP AT it_curr ASSIGNING FIELD-SYMBOL(<ls_row>).
      ASSIGN lt_plant[ werks = <ls_row>-werks ] TO FIELD-SYMBOL(<ls_plant>).
      IF sy-subrc <> 0.
        INSERT VALUE #( werks = <ls_row>-werks city = <ls_row>-city ) INTO TABLE lt_plant ASSIGNING <ls_plant>.
      ENDIF.
      <ls_plant>-net_value += <ls_row>-netwr.
      <ls_plant>-tax_value += <ls_row>-mwsbk.
    ENDLOOP.

    LOOP AT lt_plant ASSIGNING <ls_plant>.
      <ls_plant>-gross_value = <ls_plant>-net_value + <ls_plant>-tax_value.
    ENDLOOP.

    SORT lt_plant BY net_value DESCENDING.
    IF lines( lt_plant ) > 20.
      DELETE lt_plant FROM 21 TO lines( lt_plant ).
    ENDIF.

    rt_plant = lt_plant.
  ENDMETHOD.


  METHOD get_material_top20.
    DATA lt_mat TYPE ty_material_row_tab.

    LOOP AT it_item ASSIGNING FIELD-SYMBOL(<ls_item>).
      ASSIGN lt_mat[ matnr = <ls_item>-matnr ] TO FIELD-SYMBOL(<ls_mat>).
      IF sy-subrc <> 0.
        INSERT VALUE #( matnr = <ls_item>-matnr arktx = <ls_item>-arktx uom = <ls_item>-vrkme )
          INTO TABLE lt_mat ASSIGNING <ls_mat>.
      ENDIF.
      <ls_mat>-value += <ls_item>-netwr.
      <ls_mat>-qty   += <ls_item>-fkimg.

      READ TABLE it_tax INTO DATA(ls_tax) WITH TABLE KEY vbeln = <ls_item>-vbeln posnr = <ls_item>-posnr.
      IF sy-subrc = 0.
        <ls_mat>-igst += ls_tax-igst.
        <ls_mat>-sgst += ls_tax-sgst.
        <ls_mat>-cgst += ls_tax-cgst.
        <ls_mat>-tcs  += ls_tax-tcs.
      ENDIF.
    ENDLOOP.

    DATA(lv_grand_total) = REDUCE #( INIT s TYPE wrbtr FOR ls IN lt_mat NEXT s += ls-value ).

    SORT lt_mat BY value DESCENDING.
    IF lines( lt_mat ) > 20.
      DELETE lt_mat FROM 21 TO lines( lt_mat ).
    ENDIF.

    LOOP AT lt_mat ASSIGNING FIELD-SYMBOL(<ls_mat_out>).
      <ls_mat_out>-grand_total_value = lv_grand_total.
    ENDLOOP.

    rt_mat = lt_mat.
  ENDMETHOD.


  METHOD get_dashboard_data.
    DATA(lt_curr)  = get_gl_rows( is_filters ).
    DATA(lt_prior) = get_gl_rows_prior( is_filters ).

    rs_result-kpis = get_kpis( it_curr = lt_curr it_prior = lt_prior ).
    APPEND get_daily_kpi( is_filters ) TO rs_result-kpis.

    rs_result-trend       = get_trend( lt_curr ).
    rs_result-geo         = get_geo( it_curr = lt_curr it_prior = lt_prior ).
    rs_result-unit_dots   = get_unit_dots( lt_curr ).
    rs_result-scheme      = get_scheme_agg( it_curr = lt_curr it_prior = lt_prior ).
    rs_result-plant_top20 = get_plant_top20( lt_curr ).

    DATA(lt_item) = get_item_rows( is_filters ).
    DATA(lt_tax)  = get_item_tax( lt_item ).
    rs_result-material_top20 = get_material_top20( it_item = lt_item it_tax = lt_tax ).
  ENDMETHOD.

ENDCLASS.
