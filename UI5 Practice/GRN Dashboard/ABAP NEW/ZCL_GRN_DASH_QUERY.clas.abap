*&---------------------------------------------------------------------*
*& Class ZCL_GRN_DASH_QUERY
*&---------------------------------------------------------------------*
*& GRN Dashboard - backend query class (see GRN Dashboard FS.md).
*&
*& Read-only. No authorization-object checks (access is controlled via
*& Fiori Launchpad role assignment - see FS section 8). No OData/RAP
*& binding yet - that is Phase 2. This class is directly callable and
*& testable now via ZMM_GRN_DASH_TEST.prog.abap.
*&
*& Design: one filtered extraction per source view (base 101 fact from
*& ZMMD_GRN_DASH_CDS, correction movements 102/Z22 from the generic
*& ZMMD_GRN_MVT_CDS), each independently filtered/dated, then ALL
*& aggregation (KPIs, ratios, quality buckets, every chart) is done in
*& ABAP over those in-memory tables - mirroring how ZMM_PO_HISTORY_VER2
*& itself works (one bulk extraction, then enrichment and computation in
*& ABAP, not per-row DB access). 102/Z22 are deliberately queried
*& independently of the 101 fact (not joined into one flat view) - see
*& ZMMD_GRN_MVT_CDS's header comment: none of them need document-level
*& linkage back to a specific 101 line, only aggregate scoping by
*& vendor/material/plant/doc-type/date, which their own PO reference
*& already gives them directly. Rework (Z22) has no cancellation
*& counterpart - confirmed with the business owner - so there is no Z23
*& movement type anywhere in this class.
*&
*& NOTE: data-element types below (menge_d, dmbtr, lifnr, etc.) were chosen
*& to match the source tables as closely as could be determined from the
*& reviewed CDS views; verify/adjust against the actual DDIC on import.
*& A local ABAP static analyzer flagged a handful of purely cosmetic /
*& mutually contradictory style rules on this file (e.g. one rule demands
*& lv_/lt_/ls_ prefixes on locals, another flags those same prefixes as
*& "hungarian notation"; several "align TYPE expressions to column N" /
*& "check sy-subrc" notices on bulk SELECTs with an intentionally
*& unchecked, non-error empty result). These were left as-is rather than
*& chased indefinitely - run the ABAP Pretty Printer / your project's
*& actual house-style linter after import to settle formatting, and treat
*& the naming-convention rule that matches your team's real convention as
*& authoritative.
*&---------------------------------------------------------------------*
CLASS zcl_grn_dash_query DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    TYPES:
      ty_range_lifnr TYPE RANGE OF lifnr,
      ty_range_matnr TYPE RANGE OF matnr,
      ty_range_werks TYPE RANGE OF werks_d,
      ty_range_bsart TYPE RANGE OF esart,

      BEGIN OF ty_filters,
        vendor    TYPE ty_range_lifnr,
        material  TYPE ty_range_matnr,
        plant     TYPE ty_range_werks,
        " caller's positive selection; STO exclusion is ALWAYS applied on top
        doc_type  TYPE ty_range_bsart,
        date_from TYPE dats,
        date_to   TYPE dats,
      END OF ty_filters,

      BEGIN OF ty_kpi,
        id          TYPE string,
        label       TYPE string,
        curr_value  TYPE p LENGTH 15 DECIMALS 2,
        prior_value TYPE p LENGTH 15 DECIMALS 2,
        delta_pct   TYPE p LENGTH 8 DECIMALS 2,
      END OF ty_kpi,
      ty_kpi_tab TYPE STANDARD TABLE OF ty_kpi WITH EMPTY KEY,

      BEGIN OF ty_quality,
        bucket    TYPE string,
        qty       TYPE p LENGTH 15 DECIMALS 3,
        share_pct TYPE p LENGTH 8 DECIMALS 2,
      END OF ty_quality,
      ty_quality_tab TYPE STANDARD TABLE OF ty_quality WITH EMPTY KEY,

      BEGIN OF ty_ratio,
        id    TYPE string,
        label TYPE string,
        value TYPE p LENGTH 8 DECIMALS 2,
      END OF ty_ratio,
      ty_ratio_tab TYPE STANDARD TABLE OF ty_ratio WITH EMPTY KEY,

      " period is YYYYMM
      " Z22 (rework) has no cancellation counterpart - confirmed, rework
      " is never reversed - so there is no qtyz23/valz23 here.
      BEGIN OF ty_trend,
        period  TYPE num6,
        qty101  TYPE p LENGTH 15 DECIMALS 3,
        qty102  TYPE p LENGTH 15 DECIMALS 3,
        qtyz22  TYPE p LENGTH 15 DECIMALS 3,
        val101  TYPE p LENGTH 15 DECIMALS 2,
        val102  TYPE p LENGTH 15 DECIMALS 2,
        valz22  TYPE p LENGTH 15 DECIMALS 2,
        net_qty TYPE p LENGTH 15 DECIMALS 3,
        net_val TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_trend,
      ty_trend_tab TYPE STANDARD TABLE OF ty_trend WITH EMPTY KEY,

      BEGIN OF ty_vendor_row,
        lifnr      TYPE lifnr,
        name1      TYPE name1_gp,
        qty        TYPE p LENGTH 15 DECIMALS 3,
        net_qty    TYPE p LENGTH 15 DECIMALS 3,
        value      TYPE p LENGTH 15 DECIMALS 2,
        rej_pct    TYPE p LENGTH 8 DECIMALS 2,
        rework_pct TYPE p LENGTH 8 DECIMALS 2,
        score      TYPE p LENGTH 8 DECIMALS 0,
      END OF ty_vendor_row,
      ty_vendor_row_tab TYPE STANDARD TABLE OF ty_vendor_row WITH EMPTY KEY,

      BEGIN OF ty_plant_row,
        werks        TYPE werks_d,
        total_qty    TYPE p LENGTH 15 DECIMALS 3,
        accepted_pct TYPE p LENGTH 8 DECIMALS 2,
        rejected_pct TYPE p LENGTH 8 DECIMALS 2,
        sample_pct   TYPE p LENGTH 8 DECIMALS 2,
        inspect_pct  TYPE p LENGTH 8 DECIMALS 2,
      END OF ty_plant_row,
      ty_plant_row_tab TYPE STANDARD TABLE OF ty_plant_row WITH EMPTY KEY,

      BEGIN OF ty_material_row,
        matnr TYPE matnr,
        txz01 TYPE txz01,
        value TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_material_row,
      ty_material_row_tab TYPE STANDARD TABLE OF ty_material_row WITH EMPTY KEY,

      BEGIN OF ty_doctype_row,
        bsart TYPE esart,
        batxt TYPE batxt,
        value TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_doctype_row,
      ty_doctype_row_tab TYPE STANDARD TABLE OF ty_doctype_row WITH EMPTY KEY,

      BEGIN OF ty_material_rej_row,
        matnr   TYPE matnr,
        txz01   TYPE txz01,
        rej_qty TYPE p LENGTH 15 DECIMALS 3,
        rej_pct TYPE p LENGTH 8 DECIMALS 2,
      END OF ty_material_rej_row,
      ty_material_rej_row_tab TYPE STANDARD TABLE OF ty_material_rej_row WITH EMPTY KEY,

      BEGIN OF ty_dashboard,
        kpis                 TYPE ty_kpi_tab,
        quality              TYPE ty_quality_tab,
        ratios               TYPE ty_ratio_tab,
        trend                TYPE ty_trend_tab,
        vendor_top10         TYPE ty_vendor_row_tab,
        plant_top10          TYPE ty_plant_row_tab,
        material_top20       TYPE ty_material_row_tab,
        doctype_ranked       TYPE ty_doctype_row_tab,
        material_rej_worst10 TYPE ty_material_rej_row_tab,
        vendor_scorecard     TYPE ty_vendor_row_tab,
      END OF ty_dashboard.

    CLASS-METHODS:
      "! Fills in sensible defaults (current year, all months/vendors/
      "! materials/plants; STO exclusion is applied regardless in get_base
      "! /get_reversals/get_rework, not here).
      default_filters
        RETURNING VALUE(rs_filters) TYPE ty_filters,

      "! Main entry point - runs the current period and, for the KPI
      "! deltas, the equivalent prior-year period, and returns everything
      "! the dashboard needs in one call.
      get_dashboard_data
        IMPORTING is_filters       TYPE ty_filters
        RETURNING VALUE(rs_result) TYPE ty_dashboard.

  PRIVATE SECTION.

    TYPES:
      BEGIN OF ty_base_row,
        ebeln    TYPE ebeln,
        ebelp    TYPE ebelp,
        mblnr101 TYPE mblnr,
        mjahr101 TYPE mjahr,
        zeile101 TYPE mblpo,
        matnr    TYPE matnr,
        txz01    TYPE txz01,
        werks    TYPE werks_d,
        lifnr    TYPE lifnr,
        bsart    TYPE esart,
        batxt    TYPE batxt,
        menge2   TYPE menge_d,
        dmbtr    TYPE dmbtr,
        budat101 TYPE dats,
        kostl    TYPE kostl,
        name1    TYPE name1_gp,
        kurztext TYPE string,
        losmenge TYPE menge_d,
        lmenge01 TYPE menge_d,
        lmenge03 TYPE menge_d,
        lmenge04 TYPE menge_d,
        " derived, filled by apply_quality_fallback:
        acc_qty  TYPE menge_d,
        rej_qty  TYPE menge_d,
        smp_qty  TYPE menge_d,
        insp_qty TYPE menge_d,
      END OF ty_base_row,
      ty_base_row_tab TYPE STANDARD TABLE OF ty_base_row WITH EMPTY KEY,

      " One row = one correction movement (102 or Z22), sourced from
      " ZMMD_GRN_MVT_CDS. BWART tells the caller which one it is - used
      " for both the 102 reversals (get_reversals) and the Z22 rework
      " (get_rework) call sites, since both share the exact same shape.
      BEGIN OF ty_mvt_row,
        mblnr TYPE mblnr,
        mjahr TYPE mjahr,
        zeile TYPE mblpo,
        bwart TYPE bwart,
        ebeln TYPE ebeln,
        ebelp TYPE ebelp,
        matnr TYPE matnr,
        werks TYPE werks_d,
        lifnr TYPE lifnr,
        bsart TYPE esart,
        budat TYPE dats,
        menge TYPE menge_d,
        dmbtr TYPE dmbtr,
      END OF ty_mvt_row,
      ty_mvt_row_tab TYPE STANDARD TABLE OF ty_mvt_row WITH EMPTY KEY,

      BEGIN OF ty_period_totals,
        grn_qty      TYPE p LENGTH 15 DECIMALS 3,
        grn_value    TYPE p LENGTH 15 DECIMALS 2,
        acc_qty      TYPE p LENGTH 15 DECIMALS 3,
        rej_qty      TYPE p LENGTH 15 DECIMALS 3,
        smp_qty      TYPE p LENGTH 15 DECIMALS 3,
        insp_qty     TYPE p LENGTH 15 DECIMALS 3,
        rework_qty   TYPE p LENGTH 15 DECIMALS 3,
        rework_value TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_period_totals,

      " small per-key accumulators used only inside get_vendor_agg /
      " get_plant_agg / get_material_rejection_worst10
      BEGIN OF ty_vendor_qual_acc,
        lifnr TYPE lifnr,
        acc   TYPE p LENGTH 15 DECIMALS 3,
        rej   TYPE p LENGTH 15 DECIMALS 3,
        smp   TYPE p LENGTH 15 DECIMALS 3,
      END OF ty_vendor_qual_acc,
      ty_vendor_qual_acc_tab TYPE STANDARD TABLE OF ty_vendor_qual_acc WITH EMPTY KEY,

      BEGIN OF ty_vendor_rwk_acc,
        lifnr TYPE lifnr,
        rwk   TYPE p LENGTH 15 DECIMALS 3,
      END OF ty_vendor_rwk_acc,
      ty_vendor_rwk_acc_tab TYPE STANDARD TABLE OF ty_vendor_rwk_acc WITH EMPTY KEY,

      BEGIN OF ty_plant_acc,
        werks TYPE werks_d,
        acc   TYPE p LENGTH 15 DECIMALS 3,
        rej   TYPE p LENGTH 15 DECIMALS 3,
        smp   TYPE p LENGTH 15 DECIMALS 3,
        insp  TYPE p LENGTH 15 DECIMALS 3,
      END OF ty_plant_acc,
      ty_plant_acc_tab TYPE STANDARD TABLE OF ty_plant_acc WITH EMPTY KEY,

      BEGIN OF ty_material_rej_acc,
        matnr TYPE matnr,
        txz01 TYPE txz01,
        acc   TYPE p LENGTH 15 DECIMALS 3,
        rej   TYPE p LENGTH 15 DECIMALS 3,
        smp   TYPE p LENGTH 15 DECIMALS 3,
      END OF ty_material_rej_acc,
      ty_material_rej_acc_tab TYPE STANDARD TABLE OF ty_material_rej_acc WITH EMPTY KEY.

    CLASS-METHODS:
      apply_sto_exclusion
        CHANGING ct_doc_type TYPE ty_range_bsart,

      get_base
        IMPORTING is_filters     TYPE ty_filters
        RETURNING VALUE(rt_base) TYPE ty_base_row_tab,

      get_reversals
        IMPORTING is_filters    TYPE ty_filters
        RETURNING VALUE(rt_rev) TYPE ty_mvt_row_tab,

      get_rework
        IMPORTING is_filters    TYPE ty_filters
        RETURNING VALUE(rt_rwk) TYPE ty_mvt_row_tab,

      apply_quality_fallback
        CHANGING ct_base TYPE ty_base_row_tab,

      shift_year
        IMPORTING iv_date        TYPE dats
        RETURNING VALUE(rv_date) TYPE dats,

      period_totals
        IMPORTING it_base       TYPE ty_base_row_tab
                  it_rev        TYPE ty_mvt_row_tab
                  it_rwk        TYPE ty_mvt_row_tab
        RETURNING VALUE(rs_tot) TYPE ty_period_totals,

      pct
        IMPORTING iv_part       TYPE p
                  iv_whole      TYPE p
        RETURNING VALUE(rv_pct) TYPE dec8_2,

      get_trend
        IMPORTING it_base         TYPE ty_base_row_tab
                  it_rev          TYPE ty_mvt_row_tab
                  it_rwk          TYPE ty_mvt_row_tab
        RETURNING VALUE(rt_trend) TYPE ty_trend_tab,

      get_vendor_agg
        IMPORTING it_base          TYPE ty_base_row_tab
                  it_rev           TYPE ty_mvt_row_tab
                  it_rwk           TYPE ty_mvt_row_tab
        RETURNING VALUE(rt_vendor) TYPE ty_vendor_row_tab,

      get_plant_agg
        IMPORTING it_base         TYPE ty_base_row_tab
        RETURNING VALUE(rt_plant) TYPE ty_plant_row_tab,

      get_material_top20
        IMPORTING it_base       TYPE ty_base_row_tab
                  it_rev        TYPE ty_mvt_row_tab
        RETURNING VALUE(rt_mat) TYPE ty_material_row_tab,

      get_doctype_ranked
        IMPORTING it_base      TYPE ty_base_row_tab
                  it_rev       TYPE ty_mvt_row_tab
        RETURNING VALUE(rt_dt) TYPE ty_doctype_row_tab,

      get_material_rejection_worst10
        IMPORTING it_base      TYPE ty_base_row_tab
        RETURNING VALUE(rt_mr) TYPE ty_material_rej_row_tab.

ENDCLASS.


CLASS zcl_grn_dash_query IMPLEMENTATION.

  METHOD default_filters.
    DATA(lv_today) = sy-datum.
    rs_filters-date_from = lv_today(4) && '0101'.
    rs_filters-date_to   = lv_today(4) && '1231'.
  ENDMETHOD.


  METHOD apply_sto_exclusion.
    " STO / job-work / rework doc types excluded by default, per FS
    " section 7.1. ZP03 stays selectable (unlike the source report's
    " default range). Applied unconditionally on top of whatever the
    " caller passed.
    DATA(lt_exclude) = VALUE ty_range_bsart(
      sign = 'E' option = 'EQ'
      ( low = 'UB' )
      ( low = 'ZP04' )
      ( low = 'ZP05' )
      ( low = 'ZP22' )
      ( low = 'ZP23' ) ).
    APPEND LINES OF lt_exclude TO ct_doc_type.
  ENDMETHOD.


  METHOD get_base.
    DATA(lt_doc_type) = is_filters-doc_type.
    apply_sto_exclusion( CHANGING ct_doc_type = lt_doc_type ).

    SELECT ebeln, ebelp, mblnr101, mjahr101, zeile101, matnr, txz01, werks,
           lifnr, bsart, batxt, menge2, dmbtr, budat101, kostl, name1,
           kurztext, losmenge, lmenge01, lmenge03, lmenge04
      FROM zmmd_grn_dash_cds
      WHERE lifnr    IN @is_filters-vendor
        AND matnr    IN @is_filters-material
        AND werks    IN @is_filters-plant
        AND bsart    IN @lt_doc_type
        AND budat101 BETWEEN @is_filters-date_from AND @is_filters-date_to
      ORDER BY mblnr101, zeile101
      INTO CORRESPONDING FIELDS OF TABLE @rt_base.

    apply_quality_fallback( CHANGING ct_base = rt_base ).
  ENDMETHOD.


  METHOD get_reversals.
    DATA(lt_doc_type) = is_filters-doc_type.
    apply_sto_exclusion( CHANGING ct_doc_type = lt_doc_type ).

    SELECT mblnr, mjahr, zeile, bwart, ebeln, ebelp, matnr, werks, lifnr, bsart, budat, menge, dmbtr
      FROM zmmd_grn_mvt_cds
      WHERE bwart  = '102'
        AND lifnr  IN @is_filters-vendor
        AND matnr  IN @is_filters-material
        AND werks  IN @is_filters-plant
        AND bsart  IN @lt_doc_type
        AND budat  BETWEEN @is_filters-date_from AND @is_filters-date_to
      ORDER BY mblnr
      INTO CORRESPONDING FIELDS OF TABLE @rt_rev.
  ENDMETHOD.


  METHOD get_rework.
    DATA(lt_doc_type) = is_filters-doc_type.
    apply_sto_exclusion( CHANGING ct_doc_type = lt_doc_type ).

    " Each row is independently scoped by its own posting date (Z22 issue
    " date) - see FS section 6.2 and ZMMD_GRN_MVT_CDS's header comment.
    " Rework has no cancellation counterpart (confirmed: never reversed),
    " so BWART is always Z22 here - no Z23 to filter for.
    SELECT mblnr, mjahr, zeile, bwart, ebeln, ebelp, matnr, werks, lifnr, bsart, budat, menge, dmbtr
      FROM zmmd_grn_mvt_cds
      WHERE bwart  = 'Z22'
        AND lifnr  IN @is_filters-vendor
        AND matnr  IN @is_filters-material
        AND werks  IN @is_filters-plant
        AND bsart  IN @lt_doc_type
        AND budat  BETWEEN @is_filters-date_from AND @is_filters-date_to
      ORDER BY mblnr
      INTO CORRESPONDING FIELDS OF TABLE @rt_rwk.
  ENDMETHOD.


  METHOD apply_quality_fallback.
    " Reproduces ZMM_PO_HISTORY_VER2's cost-center-PO fallback rule
    " (report lines ~553-561) verbatim, then derives the 4 quality
    " buckets per FS section 7.3.
    LOOP AT ct_base ASSIGNING FIELD-SYMBOL(<ls_row>).
      IF <ls_row>-kurztext CS 'Acc' AND <ls_row>-kostl IS NOT INITIAL AND
         <ls_row>-lmenge01 IS INITIAL AND <ls_row>-lmenge03 IS INITIAL AND
         <ls_row>-lmenge04 IS INITIAL.
        <ls_row>-lmenge01 = <ls_row>-losmenge.
      ELSEIF <ls_row>-kurztext CS 'Rej' AND <ls_row>-kostl IS NOT INITIAL AND
         <ls_row>-lmenge01 IS INITIAL AND <ls_row>-lmenge03 IS INITIAL AND
         <ls_row>-lmenge04 IS INITIAL.
        <ls_row>-lmenge04 = <ls_row>-losmenge.
      ENDIF.

      <ls_row>-acc_qty  = <ls_row>-lmenge01.
      <ls_row>-rej_qty  = <ls_row>-lmenge04.
      <ls_row>-smp_qty  = <ls_row>-lmenge03.
      <ls_row>-insp_qty = <ls_row>-losmenge - <ls_row>-lmenge01 - <ls_row>-lmenge03 - <ls_row>-lmenge04.
      IF <ls_row>-insp_qty < 0.
        <ls_row>-insp_qty = 0.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD shift_year.
    DATA lv_year_i TYPE i.

    DATA(lv_year)     = iv_date(4).
    DATA(lv_month)    = iv_date+4(2).
    DATA(lv_day)      = iv_date+6(2).
    DATA(lv_new_year) = CONV num4( lv_year - 1 ).
    rv_date = |{ lv_new_year }{ lv_month }{ lv_day }|.
    " Feb 29 in a year where year-1 is not a leap year: fall back to Feb 28.
    " Checked directly via the standard leap-year rule (div. by 4, and not
    " by 100 unless also by 400) rather than a date-validation class/FM,
    " since availability of those varies by system.
    IF lv_month = '02' AND lv_day = '29'.
      lv_year_i = CONV i( lv_new_year ).
      IF NOT ( lv_year_i MOD 4 = 0 AND ( lv_year_i MOD 100 <> 0 OR lv_year_i MOD 400 = 0 ) ).
        rv_date = |{ lv_new_year }0228|.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD pct.
    IF iv_whole = 0.
      rv_pct = 0.
    ELSE.
      rv_pct = iv_part / iv_whole * 100.
    ENDIF.
  ENDMETHOD.


  METHOD period_totals.
    LOOP AT it_base ASSIGNING FIELD-SYMBOL(<ls_base>).
      rs_tot-grn_qty   += <ls_base>-menge2.
      rs_tot-grn_value += <ls_base>-dmbtr.
      rs_tot-acc_qty   += <ls_base>-acc_qty.
      rs_tot-rej_qty   += <ls_base>-rej_qty.
      rs_tot-smp_qty   += <ls_base>-smp_qty.
      rs_tot-insp_qty  += <ls_base>-insp_qty.
    ENDLOOP.
    LOOP AT it_rev ASSIGNING FIELD-SYMBOL(<ls_rev>).
      rs_tot-grn_qty   -= <ls_rev>-menge.
      rs_tot-grn_value -= <ls_rev>-dmbtr.
    ENDLOOP.
    " Rework (Z22) has no cancellation counterpart - always adds.
    LOOP AT it_rwk ASSIGNING FIELD-SYMBOL(<ls_rwk>).
      rs_tot-rework_qty   += <ls_rwk>-menge.
      rs_tot-rework_value += <ls_rwk>-dmbtr.
    ENDLOOP.
  ENDMETHOD.


  METHOD get_trend.
    DATA lt_trend  TYPE ty_trend_tab.
    DATA lv_period TYPE num6.

    LOOP AT it_base ASSIGNING FIELD-SYMBOL(<ls_base>).
      lv_period = <ls_base>-budat101(6).
      ASSIGN lt_trend[ period = lv_period ] TO FIELD-SYMBOL(<ls_trend>).
      IF sy-subrc <> 0.
        INSERT VALUE #( period = lv_period ) INTO TABLE lt_trend ASSIGNING <ls_trend>.
      ENDIF.
      <ls_trend>-qty101 += <ls_base>-menge2.
      <ls_trend>-val101 += <ls_base>-dmbtr.
    ENDLOOP.

    LOOP AT it_rev ASSIGNING FIELD-SYMBOL(<ls_rev>).
      lv_period = <ls_rev>-budat(6).
      ASSIGN lt_trend[ period = lv_period ] TO <ls_trend>.
      IF sy-subrc <> 0.
        INSERT VALUE #( period = lv_period ) INTO TABLE lt_trend ASSIGNING <ls_trend>.
      ENDIF.
      <ls_trend>-qty102 += <ls_rev>-menge.
      <ls_trend>-val102 += <ls_rev>-dmbtr.
    ENDLOOP.

    " Rework (Z22) has no cancellation counterpart - always adds.
    LOOP AT it_rwk ASSIGNING FIELD-SYMBOL(<ls_rwk>).
      lv_period = <ls_rwk>-budat(6).
      ASSIGN lt_trend[ period = lv_period ] TO <ls_trend>.
      IF sy-subrc <> 0.
        INSERT VALUE #( period = lv_period ) INTO TABLE lt_trend ASSIGNING <ls_trend>.
      ENDIF.
      <ls_trend>-qtyz22 += <ls_rwk>-menge.
      <ls_trend>-valz22 += <ls_rwk>-dmbtr.
    ENDLOOP.

    LOOP AT lt_trend ASSIGNING <ls_trend>.
      <ls_trend>-net_qty = <ls_trend>-qty101 - <ls_trend>-qty102 - <ls_trend>-qtyz22.
      <ls_trend>-net_val = <ls_trend>-val101 - <ls_trend>-val102 - <ls_trend>-valz22.
    ENDLOOP.

    SORT lt_trend BY period ASCENDING.
    rt_trend = lt_trend.
  ENDMETHOD.


  METHOD get_vendor_agg.
    DATA lt_vendor  TYPE ty_vendor_row_tab.
    DATA lt_qual    TYPE ty_vendor_qual_acc_tab.
    DATA lt_rwk     TYPE ty_vendor_rwk_acc_tab.
    DATA lv_rwk_qty TYPE p LENGTH 15 DECIMALS 3.
    DATA lv_score   TYPE p LENGTH 8 DECIMALS 0.

    LOOP AT it_base ASSIGNING FIELD-SYMBOL(<ls_base>).
      ASSIGN lt_vendor[ lifnr = <ls_base>-lifnr ] TO FIELD-SYMBOL(<ls_vendor>).
      IF sy-subrc <> 0.
        INSERT VALUE #( lifnr = <ls_base>-lifnr name1 = <ls_base>-name1 ) INTO TABLE lt_vendor ASSIGNING <ls_vendor>.
      ENDIF.
      <ls_vendor>-qty     += <ls_base>-menge2.
      <ls_vendor>-net_qty += <ls_base>-menge2.
      <ls_vendor>-value   += <ls_base>-dmbtr.
    ENDLOOP.

    LOOP AT it_rev ASSIGNING FIELD-SYMBOL(<ls_rev>).
      ASSIGN lt_vendor[ lifnr = <ls_rev>-lifnr ] TO <ls_vendor>.
      IF sy-subrc <> 0.
        INSERT VALUE #( lifnr = <ls_rev>-lifnr ) INTO TABLE lt_vendor ASSIGNING <ls_vendor>.
      ENDIF.
      <ls_vendor>-qty     -= <ls_rev>-menge.
      <ls_vendor>-net_qty -= <ls_rev>-menge.
      <ls_vendor>-value   -= <ls_rev>-dmbtr.
    ENDLOOP.

    " Per-vendor accepted/rejected/sample totals (for rejection %) and
    " rework qty (for rework % and net_qty) - two small side maps, kept
    " local to this method rather than a wider public per-vendor-quality
    " method, since nothing else needs them for phase 1.
    LOOP AT it_base ASSIGNING <ls_base>.
      ASSIGN lt_qual[ lifnr = <ls_base>-lifnr ] TO FIELD-SYMBOL(<ls_qual>).
      IF sy-subrc <> 0.
        INSERT VALUE #( lifnr = <ls_base>-lifnr ) INTO TABLE lt_qual ASSIGNING <ls_qual>.
      ENDIF.
      <ls_qual>-acc += <ls_base>-acc_qty.
      <ls_qual>-rej += <ls_base>-rej_qty.
      <ls_qual>-smp += <ls_base>-smp_qty.
    ENDLOOP.

    " Rework (Z22) has no cancellation counterpart - always adds, always
    " reduces net_qty.
    LOOP AT it_rwk ASSIGNING FIELD-SYMBOL(<ls_rwk>).
      ASSIGN lt_vendor[ lifnr = <ls_rwk>-lifnr ] TO <ls_vendor>.
      IF sy-subrc <> 0.
        INSERT VALUE #( lifnr = <ls_rwk>-lifnr ) INTO TABLE lt_vendor ASSIGNING <ls_vendor>.
      ENDIF.
      lv_rwk_qty = <ls_rwk>-menge.
      <ls_vendor>-net_qty -= lv_rwk_qty.

      ASSIGN lt_rwk[ lifnr = <ls_rwk>-lifnr ] TO FIELD-SYMBOL(<ls_rwk_acc>).
      IF sy-subrc <> 0.
        INSERT VALUE #( lifnr = <ls_rwk>-lifnr ) INTO TABLE lt_rwk ASSIGNING <ls_rwk_acc>.
      ENDIF.
      <ls_rwk_acc>-rwk += lv_rwk_qty.
    ENDLOOP.

    LOOP AT lt_vendor ASSIGNING <ls_vendor>.
      READ TABLE lt_qual ASSIGNING <ls_qual> WITH KEY lifnr = <ls_vendor>-lifnr.
      IF sy-subrc = 0.
        <ls_vendor>-rej_pct = pct( iv_part = <ls_qual>-rej
                                    iv_whole = <ls_qual>-acc + <ls_qual>-rej + <ls_qual>-smp ).
      ENDIF.
      READ TABLE lt_rwk ASSIGNING <ls_rwk_acc> WITH KEY lifnr = <ls_vendor>-lifnr.
      IF sy-subrc = 0.
        <ls_vendor>-rework_pct = pct( iv_part = <ls_rwk_acc>-rwk
                                       iv_whole = <ls_vendor>-qty ).
      ENDIF.
      lv_score = 100 - ( <ls_vendor>-rej_pct * 9 ) - ( <ls_vendor>-rework_pct * '1.6' ).
      IF lv_score < 0.
        lv_score = 0.
      ELSEIF lv_score > 100.
        lv_score = 100.
      ENDIF.
      <ls_vendor>-score = lv_score.
    ENDLOOP.

    rt_vendor = lt_vendor.
  ENDMETHOD.


  METHOD get_plant_agg.
    DATA lt_plant_acc TYPE ty_plant_acc_tab.
    DATA lv_total     TYPE p LENGTH 15 DECIMALS 3.

    LOOP AT it_base ASSIGNING FIELD-SYMBOL(<ls_base>).
      ASSIGN lt_plant_acc[ werks = <ls_base>-werks ] TO FIELD-SYMBOL(<ls_plant_acc>).
      IF sy-subrc <> 0.
        INSERT VALUE #( werks = <ls_base>-werks ) INTO TABLE lt_plant_acc ASSIGNING <ls_plant_acc>.
      ENDIF.
      <ls_plant_acc>-acc  += <ls_base>-acc_qty.
      <ls_plant_acc>-rej  += <ls_base>-rej_qty.
      <ls_plant_acc>-smp  += <ls_base>-smp_qty.
      <ls_plant_acc>-insp += <ls_base>-insp_qty.
    ENDLOOP.

    LOOP AT lt_plant_acc ASSIGNING <ls_plant_acc>.
      lv_total = <ls_plant_acc>-acc + <ls_plant_acc>-rej + <ls_plant_acc>-smp + <ls_plant_acc>-insp.
      DATA(ls_plant_row) = VALUE ty_plant_row( werks = <ls_plant_acc>-werks total_qty = lv_total ).
      ls_plant_row-accepted_pct = pct( iv_part = <ls_plant_acc>-acc iv_whole = lv_total ).
      ls_plant_row-rejected_pct = pct( iv_part = <ls_plant_acc>-rej iv_whole = lv_total ).
      ls_plant_row-sample_pct   = pct( iv_part = <ls_plant_acc>-smp iv_whole = lv_total ).
      ls_plant_row-inspect_pct  = pct( iv_part = <ls_plant_acc>-insp iv_whole = lv_total ).
      APPEND ls_plant_row TO rt_plant.
    ENDLOOP.

    SORT rt_plant BY total_qty DESCENDING.
    IF lines( rt_plant ) > 10.
      DELETE rt_plant FROM 11 TO lines( rt_plant ).
    ENDIF.
  ENDMETHOD.


  METHOD get_material_top20.
    DATA lt_mat TYPE ty_material_row_tab.

    LOOP AT it_base ASSIGNING FIELD-SYMBOL(<ls_base>).
      ASSIGN lt_mat[ matnr = <ls_base>-matnr ] TO FIELD-SYMBOL(<ls_mat>).
      IF sy-subrc <> 0.
        INSERT VALUE #( matnr = <ls_base>-matnr txz01 = <ls_base>-txz01 ) INTO TABLE lt_mat ASSIGNING <ls_mat>.
      ENDIF.
      <ls_mat>-value += <ls_base>-dmbtr.
    ENDLOOP.

    LOOP AT it_rev ASSIGNING FIELD-SYMBOL(<ls_rev>).
      ASSIGN lt_mat[ matnr = <ls_rev>-matnr ] TO <ls_mat>.
      IF sy-subrc <> 0.
        INSERT VALUE #( matnr = <ls_rev>-matnr ) INTO TABLE lt_mat ASSIGNING <ls_mat>.
      ENDIF.
      <ls_mat>-value -= <ls_rev>-dmbtr.
    ENDLOOP.

    SORT lt_mat BY value DESCENDING.
    IF lines( lt_mat ) > 20.
      DELETE lt_mat FROM 21 TO lines( lt_mat ).
    ENDIF.
    rt_mat = lt_mat.
  ENDMETHOD.


  METHOD get_doctype_ranked.
    DATA lt_dt TYPE ty_doctype_row_tab.

    LOOP AT it_base ASSIGNING FIELD-SYMBOL(<ls_base>).
      ASSIGN lt_dt[ bsart = <ls_base>-bsart ] TO FIELD-SYMBOL(<ls_dt>).
      IF sy-subrc <> 0.
        INSERT VALUE #( bsart = <ls_base>-bsart batxt = <ls_base>-batxt ) INTO TABLE lt_dt ASSIGNING <ls_dt>.
      ENDIF.
      <ls_dt>-value += <ls_base>-dmbtr.
    ENDLOOP.

    LOOP AT it_rev ASSIGNING FIELD-SYMBOL(<ls_rev>).
      ASSIGN lt_dt[ bsart = <ls_rev>-bsart ] TO <ls_dt>.
      IF sy-subrc <> 0.
        INSERT VALUE #( bsart = <ls_rev>-bsart ) INTO TABLE lt_dt ASSIGNING <ls_dt>.
      ENDIF.
      <ls_dt>-value -= <ls_rev>-dmbtr.
    ENDLOOP.

    SORT lt_dt BY value DESCENDING.
    rt_dt = lt_dt.
  ENDMETHOD.


  METHOD get_material_rejection_worst10.
    DATA lt_mat_rej TYPE ty_material_rej_acc_tab.

    LOOP AT it_base ASSIGNING FIELD-SYMBOL(<ls_base>).
      ASSIGN lt_mat_rej[ matnr = <ls_base>-matnr ] TO FIELD-SYMBOL(<ls_mat_rej>).
      IF sy-subrc <> 0.
        INSERT VALUE #( matnr = <ls_base>-matnr txz01 = <ls_base>-txz01 ) INTO TABLE lt_mat_rej ASSIGNING <ls_mat_rej>.
      ENDIF.
      <ls_mat_rej>-acc += <ls_base>-acc_qty.
      <ls_mat_rej>-rej += <ls_base>-rej_qty.
      <ls_mat_rej>-smp += <ls_base>-smp_qty.
    ENDLOOP.

    LOOP AT lt_mat_rej ASSIGNING <ls_mat_rej>.
      DATA(ls_mr) = VALUE ty_material_rej_row(
        matnr = <ls_mat_rej>-matnr txz01 = <ls_mat_rej>-txz01 rej_qty = <ls_mat_rej>-rej ).
      ls_mr-rej_pct = pct( iv_part = <ls_mat_rej>-rej
                            iv_whole = <ls_mat_rej>-acc + <ls_mat_rej>-rej + <ls_mat_rej>-smp ).
      APPEND ls_mr TO rt_mr.
    ENDLOOP.

    SORT rt_mr BY rej_pct DESCENDING.
    IF lines( rt_mr ) > 10.
      DELETE rt_mr FROM 11 TO lines( rt_mr ).
    ENDIF.
  ENDMETHOD.


  METHOD get_dashboard_data.
    " --- current period ---
    DATA(lt_base) = get_base( is_filters ).
    DATA(lt_rev)  = get_reversals( is_filters ).
    DATA(lt_rwk)  = get_rework( is_filters ).
    DATA(ls_curr) = period_totals( it_base = lt_base it_rev = lt_rev it_rwk = lt_rwk ).

    " --- prior-year period (for KPI vs.-last-year deltas, FS section 6.2) ---
    DATA(ls_prior_filters) = is_filters.
    ls_prior_filters-date_from = shift_year( is_filters-date_from ).
    ls_prior_filters-date_to  = shift_year( is_filters-date_to ).
    DATA(lt_base_p) = get_base( ls_prior_filters ).
    DATA(lt_rev_p)  = get_reversals( ls_prior_filters ).
    DATA(lt_rwk_p)  = get_rework( ls_prior_filters ).
    DATA(ls_prior)  = period_totals( it_base = lt_base_p it_rev = lt_rev_p it_rwk = lt_rwk_p ).

    DATA(lv_net_qty_curr)  = CONV wrbtr( ls_curr-grn_qty    - ls_curr-rework_qty ).
    DATA(lv_net_val_curr)  = CONV wrbtr( ls_curr-grn_value  - ls_curr-rework_value ).
    DATA(lv_net_qty_prior) = CONV wrbtr( ls_prior-grn_qty   - ls_prior-rework_qty ).
    DATA(lv_net_val_prior) = CONV wrbtr( ls_prior-grn_value - ls_prior-rework_value ).

    DATA(lv_delta_qty)   = pct( iv_part = ls_curr-grn_qty - ls_prior-grn_qty iv_whole = abs( ls_prior-grn_qty ) ).
    DATA(lv_delta_val)   = pct( iv_part = ls_curr-grn_value - ls_prior-grn_value iv_whole = abs( ls_prior-grn_value ) ).
    DATA(lv_delta_nqty)  = pct( iv_part = lv_net_qty_curr - lv_net_qty_prior iv_whole = abs( lv_net_qty_prior ) ).
    DATA(lv_delta_nval)  = pct( iv_part = lv_net_val_curr - lv_net_val_prior iv_whole = abs( lv_net_val_prior ) ).

    APPEND VALUE #( id = 'GRN_QTY' label = 'GRN Quantity'
                    curr_value = ls_curr-grn_qty prior_value = ls_prior-grn_qty
                    delta_pct = lv_delta_qty ) TO rs_result-kpis.
    APPEND VALUE #( id = 'GRN_VALUE' label = 'GRN Value'
                    curr_value = ls_curr-grn_value prior_value = ls_prior-grn_value
                    delta_pct = lv_delta_val ) TO rs_result-kpis.
    APPEND VALUE #( id = 'NET_QTY' label = 'Net GRN Qty (- Rework)'
                    curr_value = lv_net_qty_curr prior_value = lv_net_qty_prior
                    delta_pct = lv_delta_nqty ) TO rs_result-kpis.
    APPEND VALUE #( id = 'NET_VALUE' label = 'Net GRN Value (- Rework)'
                    curr_value = lv_net_val_curr prior_value = lv_net_val_prior
                    delta_pct = lv_delta_nval ) TO rs_result-kpis.

    DATA(lv_share_acc) = pct( iv_part = ls_curr-acc_qty iv_whole = ls_curr-grn_qty ).
    DATA(lv_share_rej) = pct( iv_part = ls_curr-rej_qty iv_whole = ls_curr-grn_qty ).
    DATA(lv_share_smp) = pct( iv_part = ls_curr-smp_qty iv_whole = ls_curr-grn_qty ).
    DATA(lv_share_rwk) = pct( iv_part = ls_curr-rework_qty iv_whole = ls_curr-grn_qty ).

    APPEND VALUE #( bucket = 'Accepted' qty = ls_curr-acc_qty share_pct = lv_share_acc ) TO rs_result-quality.
    APPEND VALUE #( bucket = 'Rejected' qty = ls_curr-rej_qty share_pct = lv_share_rej ) TO rs_result-quality.
    APPEND VALUE #( bucket = 'Sample' qty = ls_curr-smp_qty share_pct = lv_share_smp ) TO rs_result-quality.
    APPEND VALUE #( bucket = 'Rework GRN Qty' qty = ls_curr-rework_qty share_pct = lv_share_rwk ) TO rs_result-quality.

    DATA(lv_qtot) = CONV menge_d( ls_curr-acc_qty + ls_curr-rej_qty + ls_curr-smp_qty ).
    DATA(lv_avg_value) = COND menge_d( WHEN ls_curr-grn_qty = 0 THEN 0 ELSE ls_curr-grn_value / ls_curr-grn_qty ).

    APPEND VALUE #( id = 'REJ_RATE' label = 'Rejection rate'
                    value = pct( iv_part = ls_curr-rej_qty iv_whole = lv_qtot ) ) TO rs_result-ratios.
    APPEND VALUE #( id = 'RWK_RATE' label = 'Rework rate'
                    value = pct( iv_part = ls_curr-rework_qty iv_whole = ls_curr-grn_qty ) ) TO rs_result-ratios.
    APPEND VALUE #( id = 'NET_RATE' label = 'Net GRN rate'
                    value = pct( iv_part = lv_net_qty_curr iv_whole = ls_curr-grn_qty ) ) TO rs_result-ratios.
    APPEND VALUE #( id = 'AVG_VALUE' label = 'Avg. GRN value per unit'
                    value = lv_avg_value ) TO rs_result-ratios.

    rs_result-trend                = get_trend( it_base = lt_base it_rev = lt_rev it_rwk = lt_rwk ).
    DATA(lt_vendor_all)            = get_vendor_agg( it_base = lt_base it_rev = lt_rev it_rwk = lt_rwk ).
    rs_result-plant_top10          = get_plant_agg( lt_base ).
    rs_result-material_top20       = get_material_top20( it_base = lt_base it_rev = lt_rev ).
    rs_result-doctype_ranked       = get_doctype_ranked( it_base = lt_base it_rev = lt_rev ).
    rs_result-material_rej_worst10 = get_material_rejection_worst10( lt_base ).

    rs_result-vendor_top10 = lt_vendor_all.
    SORT rs_result-vendor_top10 BY value DESCENDING.
    IF lines( rs_result-vendor_top10 ) > 10.
      DELETE rs_result-vendor_top10 FROM 11 TO lines( rs_result-vendor_top10 ).
    ENDIF.

    rs_result-vendor_scorecard = lt_vendor_all.
    SORT rs_result-vendor_scorecard BY score DESCENDING.
    IF lines( rs_result-vendor_scorecard ) > 15.
      DELETE rs_result-vendor_scorecard FROM 16 TO lines( rs_result-vendor_scorecard ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
