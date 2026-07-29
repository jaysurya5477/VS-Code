*"* Query provider for custom entity ZMM_GRN_DASH_KPI.
*"* Thin shell: reads parameters -> calls ZCL_GRN_DASH_QUERY -> maps -> returns.
*"* Pattern mirrors ZCL_CV_AGEING_CUST_QRY (CV Ageing dashboard) - no
*"* caching layer, since ZCL_GRN_DASH_QUERY computes directly from CDS
*"* views (no headless SUBMIT of another report to amortise, unlike the
*"* Material Stock dashboard's ZCL_MB5B_SOURCE).
CLASS zcl_grn_dash_kpi_qry DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.
    TYPES: tt_matnr TYPE RANGE OF matnr.

  PRIVATE SECTION.
    "! Splits a comma-separated string parameter into an 'I'/'EQ' range
    "! table. Blank/empty tokens are dropped; a blank input yields an empty
    "! range (= no restriction), matching ZCL_GRN_DASH_QUERY=>default_filters.
    "! Returned as RANGE OF matnr (the widest of the four filter domains -
    "! lifnr/matnr/werks_d/esart) so one helper serves all four dimensions;
    "! CORRESPONDING # at the call site converts into the specific range
    "! type ZCL_GRN_DASH_QUERY expects.
    METHODS csv_to_range
      IMPORTING iv_csv        TYPE string
      RETURNING VALUE(rt_out) TYPE tt_matnr.

ENDCLASS.


CLASS zcl_grn_dash_kpi_qry IMPLEMENTATION.

  METHOD if_rap_query_provider~select.

    " ---- read custom entity parameters ----
    DATA: lv_datefrom TYPE dats,
          lv_dateto   TYPE dats,
          lv_vendor   TYPE string,
          lv_material TYPE string,
          lv_plant    TYPE string,
          lv_doctype  TYPE string.

    LOOP AT io_request->get_parameters( ) INTO DATA(ls_param).
      CASE to_upper( ls_param-parameter_name ).
        WHEN 'P_DATEFROM'. lv_datefrom = ls_param-value.
        WHEN 'P_DATETO'.   lv_dateto   = ls_param-value.
        WHEN 'P_VENDOR'.   lv_vendor   = ls_param-value.
        WHEN 'P_MATERIAL'. lv_material = ls_param-value.
        WHEN 'P_PLANT'.    lv_plant    = ls_param-value.
        WHEN 'P_DOCTYPE'.  lv_doctype  = ls_param-value.
      ENDCASE.
    ENDLOOP.

    " ---- assemble filters and call the shared query class ----
    DATA(ls_filters) = VALUE zcl_grn_dash_query=>ty_filters(
      date_from = lv_datefrom
      date_to   = lv_dateto
      vendor    = CORRESPONDING #( csv_to_range( lv_vendor ) )
      material  = CORRESPONDING #( csv_to_range( lv_material ) )
      plant     = CORRESPONDING #( csv_to_range( lv_plant ) )
      doc_type  = CORRESPONDING #( csv_to_range( lv_doctype ) ) ).

    DATA(ls_dash) = zcl_grn_dash_query=>get_dashboard_data( ls_filters ).

    " ---- map engine rows -> custom entity ----
    DATA lt_out TYPE STANDARD TABLE OF zmm_grn_dash_kpi.
    lt_out = VALUE #( FOR ls IN ls_dash-kpis (
                        id         = ls-id
                        kpilabel   = ls-label
                        currvalue  = ls-curr_value
                        priorvalue = ls-prior_value
                        deltapct   = ls-delta_pct ) ).

    " ---- $count ----
    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( lt_out ) ).
    ENDIF.

    " ---- paging ($skip / $top) ----
    DATA(lv_offset)    = io_request->get_paging( )->get_offset( ).
    DATA(lv_page_size) = io_request->get_paging( )->get_page_size( ).

    IF lv_offset > 0.
      DELETE lt_out TO lv_offset.
    ENDIF.
    IF lv_page_size <> if_rap_query_paging=>page_size_unlimited
       AND lines( lt_out ) > lv_page_size.
      DELETE lt_out FROM lv_page_size + 1.
    ENDIF.

    io_response->set_data( lt_out ).

  ENDMETHOD.


  METHOD csv_to_range.
    DATA lt_tok TYPE TABLE OF string.
    SPLIT iv_csv AT ',' INTO TABLE lt_tok.
    LOOP AT lt_tok INTO DATA(lv_tok).
      CONDENSE lv_tok.
      IF lv_tok IS NOT INITIAL.
        APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_tok ) TO rt_out.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
