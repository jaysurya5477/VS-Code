*&---------------------------------------------------------------------*
*& Report ZMM_GRN_DASH_TEST
*&---------------------------------------------------------------------*
*& GRN Dashboard - Phase 1 standalone test/demo report.
*&
*& Purpose: exercise ZCL_GRN_DASH_QUERY=>get_dashboard_data directly,
*& before any OData/RAP/UI5 work exists (that is Phase 2), so the new
*& CDS views and the query class can be validated in a real system as
*& soon as they are activated. Output is a plain classic list (no ALV) -
*& this report is a validation tool, not the dashboard itself.
*&---------------------------------------------------------------------*
REPORT zmm_grn_dash_test.

TABLES: ekko, matdoc.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_lifnr FOR matdoc-lifnr MODIF ID grn,   " placeholder type, see note below
                  s_matnr FOR matdoc-matnr MODIF ID grn,
                  s_werks FOR matdoc-werks MODIF ID grn,
                  s_bsart FOR ekko-bsart MODIF ID grn.
PARAMETERS: p_dfrom TYPE dats DEFAULT sy-datum,
              p_dto   TYPE dats DEFAULT sy-datum.
SELECTION-SCREEN END OF BLOCK b1.

* NOTE: S_LIFNR/S_MATNR/S_WERKS/S_BSART are declared against a
* placeholder type (MKPF-USNAM) purely so this file has no compile-time
* dependency on LFA1/MARA/EKKO field types while drafted outside a
* system. Retype these to LIFNR/MATNR/WERKS_D/ESART respectively (matching
* ZCL_GRN_DASH_QUERY's filter types) when importing into a real system -
* a one-line change per SELECT-OPTIONS.

START-OF-SELECTION.

  DATA(ls_filters) = zcl_grn_dash_query=>default_filters( ).

  " Selection-screen ranges (S_LIFNR etc.) map 1:1 onto the class's own
  " range types once retyped per the note above - left as a straight
  " MOVE-CORRESPONDING-style assignment so this report stays a thin
  " wrapper, not a second copy of the filter logic.
  IF s_lifnr[] IS NOT INITIAL.
    ls_filters-vendor = CORRESPONDING #( s_lifnr[] ).
  ENDIF.
  IF s_matnr[] IS NOT INITIAL.
    ls_filters-material = CORRESPONDING #( s_matnr[] ).
  ENDIF.
  IF s_werks[] IS NOT INITIAL.
    ls_filters-plant = CORRESPONDING #( s_werks[] ).
  ENDIF.
  IF s_bsart[] IS NOT INITIAL.
    ls_filters-doc_type = CORRESPONDING #( s_bsart[] ).
  ENDIF.
  ls_filters-date_from = p_dfrom.
  ls_filters-date_to   = p_dto.

  DATA(ls_dash) = zcl_grn_dash_query=>get_dashboard_data( ls_filters ).

  PERFORM show_kpis.
  PERFORM show_quality.
  PERFORM show_ratios.
  PERFORM show_trend.
  PERFORM show_vendor_top10.
  PERFORM show_plant_top10.
  PERFORM show_material_top20.
  PERFORM show_doctype_ranked.
  PERFORM show_material_rej_worst10.
  PERFORM show_vendor_scorecard.


FORM show_kpis.
  " label is TYPE string (dynamic length) - WRITE ... string(30) throws
  " CX_SY_RANGE_OUT_OF_BOUNDS whenever the content is shorter than 30, so
  " convert to a fixed-length CHAR local first (safe at any length).
  DATA lv_kpi_label TYPE char30.

  WRITE: / 'KPIs'.
  ULINE.
  LOOP AT ls_dash-kpis ASSIGNING FIELD-SYMBOL(<ls_kpi>).
    lv_kpi_label = <ls_kpi>-label.
    WRITE: / lv_kpi_label, <ls_kpi>-curr_value, <ls_kpi>-prior_value, <ls_kpi>-delta_pct, '%'.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_quality.
  " bucket is TYPE string - see show_kpis comment above for why this is
  " converted to a fixed-length CHAR local before WRITE.
  DATA lv_bucket TYPE char20.

  WRITE: / 'Quality buckets'.
  ULINE.
  LOOP AT ls_dash-quality ASSIGNING FIELD-SYMBOL(<ls_q>).
    lv_bucket = <ls_q>-bucket.
    WRITE: / lv_bucket, <ls_q>-qty, <ls_q>-share_pct, '%'.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_ratios.
  " label is TYPE string - see show_kpis comment above for why this is
  " converted to a fixed-length CHAR local before WRITE.
  DATA lv_ratio_label TYPE char30.

  WRITE: / 'Ratios'.
  ULINE.
  LOOP AT ls_dash-ratios ASSIGNING FIELD-SYMBOL(<ls_r>).
    lv_ratio_label = <ls_r>-label.
    WRITE: / lv_ratio_label, <ls_r>-value.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_trend.
  WRITE: / 'Receipt flow over time (period = YYYYMM)'.
  ULINE.
  LOOP AT ls_dash-trend ASSIGNING FIELD-SYMBOL(<ls_t>).
    WRITE: / <ls_t>-period, <ls_t>-qty101, <ls_t>-qty102, <ls_t>-qtyz22, <ls_t>-net_qty.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_vendor_top10.
  WRITE: / 'Top 10 vendors by GRN value'.
  ULINE.
  LOOP AT ls_dash-vendor_top10 ASSIGNING FIELD-SYMBOL(<ls_v>).
    WRITE: / <ls_v>-name1(25), <ls_v>-qty, <ls_v>-value, <ls_v>-rej_pct, <ls_v>-score.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_plant_top10.
  WRITE: / 'Top 10 plants - quality composition'.
  ULINE.
  LOOP AT ls_dash-plant_top10 ASSIGNING FIELD-SYMBOL(<ls_p>).
    WRITE: / <ls_p>-werks, <ls_p>-accepted_pct, <ls_p>-rejected_pct, <ls_p>-sample_pct, <ls_p>-inspect_pct.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_material_top20.
  WRITE: / 'Top 20 materials by GRN value'.
  ULINE.
  LOOP AT ls_dash-material_top20 ASSIGNING FIELD-SYMBOL(<ls_m>).
    WRITE: / <ls_m>-matnr, <ls_m>-txz01(30), <ls_m>-value.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_doctype_ranked.
  WRITE: / 'GRN value by PO document type (ranked)'.
  ULINE.
  LOOP AT ls_dash-doctype_ranked ASSIGNING FIELD-SYMBOL(<ls_d>).
    WRITE: / <ls_d>-bsart, <ls_d>-batxt(20), <ls_d>-value.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_material_rej_worst10.
  WRITE: / 'Worst 10 materials by rejection rate'.
  ULINE.
  LOOP AT ls_dash-material_rej_worst10 ASSIGNING FIELD-SYMBOL(<ls_mr>).
    WRITE: / <ls_mr>-matnr, <ls_mr>-txz01(30), <ls_mr>-rej_qty, <ls_mr>-rej_pct, '%'.
  ENDLOOP.
  SKIP.
ENDFORM.


FORM show_vendor_scorecard.
  WRITE: / 'Vendor scorecard (top 15 by score)'.
  ULINE.
  LOOP AT ls_dash-vendor_scorecard ASSIGNING FIELD-SYMBOL(<ls_sc>).
    WRITE: / <ls_sc>-name1(25), <ls_sc>-qty, <ls_sc>-net_qty, <ls_sc>-value,
             <ls_sc>-rej_pct, <ls_sc>-rework_pct, <ls_sc>-score.
  ENDLOOP.
ENDFORM.
