*"* Query provider for custom entity ZSD_PMS_KPI.
*"* Thin shell: read parameters -> zcl_pms_dash_query=>default_filters( )
*"* + overrides -> get_dashboard_data( ) -> map -> return. Pattern mirrors
*"* the GRN Dashboard's own Phase 2 (../GRN Dashboard/ABAP NEW/
*"* ZCL_GRN_DASH_KPI_QRY.clas.abap) - full rationale there and in this
*"* project's ABAP_Backend_Plan.md Part B. This is the canonical example;
*"* the other 6 PMS query provider classes carry the identical parameter-
*"* reading and csv_to_range( ) blocks, differing only in which
*"* ls_dash-<subtable> they map and their own entity's field names.
CLASS zcl_pms_kpi_qry DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.
    TYPES: tt_matnr TYPE RANGE OF matnr.

  PRIVATE SECTION.
    "! Splits a comma-separated string parameter into an 'I'/'EQ' range
    "! table. Blank/empty tokens are dropped; a blank input yields an empty
    "! range (= no restriction). Returned as RANGE OF matnr (the widest of
    "! this entity's six range domains) so one helper serves all of them;
    "! CORRESPONDING # at the call site narrows into the specific range
    "! type ZCL_PMS_DASH_QUERY=>ty_filters expects for that dimension.
    METHODS csv_to_range
      IMPORTING iv_csv        TYPE string
      RETURNING VALUE(rt_out) TYPE tt_matnr.

ENDCLASS.


CLASS zcl_pms_kpi_qry IMPLEMENTATION.

  METHOD if_rap_query_provider~select.

    " ---- start from the class' own current-FY default, then override
    " only what the caller actually passed - mirrors ZSD_PMS_DASH_TEST.
    " prog.abap's own PARAMETERS handling exactly, so a blank P_Fy means
    " "current FY" here too, not an error. ----
    DATA(ls_filters) = zcl_pms_dash_query=>default_filters( ).

    LOOP AT io_request->get_parameters( ) INTO DATA(ls_param).
      CASE to_upper( ls_param-parameter_name ).
        WHEN 'P_FY'.
          IF ls_param-value IS NOT INITIAL.
            ls_filters-fy = ls_param-value.
          ENDIF.
        WHEN 'P_DATEFROM'. ls_filters-date_from = ls_param-value.
        WHEN 'P_DATETO'.   ls_filters-date_to   = ls_param-value.
        WHEN 'P_ZONE'.     ls_filters-zone      = CORRESPONDING #( csv_to_range( ls_param-value ) ).
        WHEN 'P_STATE'.    ls_filters-state     = CORRESPONDING #( csv_to_range( ls_param-value ) ).
        WHEN 'P_PLANT'.    ls_filters-plant     = CORRESPONDING #( csv_to_range( ls_param-value ) ).
        WHEN 'P_MATERIAL'. ls_filters-material  = CORRESPONDING #( csv_to_range( ls_param-value ) ).
        WHEN 'P_SCHEME'.   ls_filters-scheme    = CORRESPONDING #( csv_to_range( ls_param-value ) ).
        WHEN 'P_PERIOD'.   ls_filters-period    = CORRESPONDING #( csv_to_range( ls_param-value ) ).
      ENDCASE.
    ENDLOOP.

    DATA(ls_dash) = zcl_pms_dash_query=>get_dashboard_data( ls_filters ).

    " ---- map engine rows -> custom entity ----
    DATA lt_out TYPE STANDARD TABLE OF zsd_pms_kpi.
    lt_out = VALUE #( FOR ls IN ls_dash-kpis (
                        id           = ls-id
                        kpilabel     = ls-label
                        currvalue    = ls-curr_value
                        priorvalue   = ls-prior_value
                        deltapct     = ls-delta_pct
                        netvalue     = ls-net_value
                        taxvalue     = ls-tax_value
                        snapshotdate = ls-snapshot_date
                        doccount     = ls-doc_count ) ).

    " ---- $orderby: always consume, even though there is nothing this
    " entity needs to re-sort - RAP rejects the whole read with
    " RAP_RUNTIME/004 ("Query not fully covered by implementation") if the
    " caller sends $orderby and the provider never calls
    " get_sort_elements( ), even when the data is already in the right
    " order. Mirrors the GRN Dashboard's own documented workaround. ----
    io_request->get_sort_elements( ).

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
