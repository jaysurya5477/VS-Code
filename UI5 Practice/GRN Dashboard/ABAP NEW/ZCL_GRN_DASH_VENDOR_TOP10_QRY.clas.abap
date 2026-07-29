*"* Query provider for custom entity ZMM_GRN_DASH_VENDOR_TOP10.
*"* Thin shell: reads parameters -> calls ZCL_GRN_DASH_QUERY -> maps -> returns.
*"* See ZCL_GRN_DASH_KPI_QRY's header comment for the overall pattern.
CLASS zcl_grn_dash_vendor_top10_qry DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.
    TYPES: tt_matnr TYPE RANGE OF matnr.
  PRIVATE SECTION.
    METHODS csv_to_range
      IMPORTING iv_csv        TYPE string
      RETURNING VALUE(rt_out) TYPE tt_matnr.

ENDCLASS.


CLASS zcl_grn_dash_vendor_top10_qry IMPLEMENTATION.

  METHOD if_rap_query_provider~select.

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

    DATA(ls_filters) = VALUE zcl_grn_dash_query=>ty_filters(
      date_from = lv_datefrom
      date_to   = lv_dateto
      vendor    = CORRESPONDING #( csv_to_range( lv_vendor ) )
      material  = CORRESPONDING #( csv_to_range( lv_material ) )
      plant     = CORRESPONDING #( csv_to_range( lv_plant ) )
      doc_type  = CORRESPONDING #( csv_to_range( lv_doctype ) ) ).

    DATA(ls_dash) = zcl_grn_dash_query=>get_dashboard_data( ls_filters ).

    DATA lt_out TYPE STANDARD TABLE OF zmm_grn_dash_vendor_top10.
    lt_out = VALUE #( FOR ls IN ls_dash-vendor_top10 (
                        vendor     = ls-lifnr
                        vendorname = ls-name1
                        qty        = ls-qty
                        netqty     = ls-net_qty
                        value      = ls-value
                        rejpct     = ls-rej_pct
                        reworkpct  = ls-rework_pct
                        score      = ls-score ) ).

    " ---- $orderby ----
    " get_dashboard_data() already returns this result set pre-sorted to match the one
    " $orderby the front end ever sends (ZCL_GRN_DASH_QUERY: SORT rs_result-vendor_top10 BY
    " value DESCENDING), so there is nothing further to apply. RAP still requires the
    " provider to consume get_sort_elements() whenever the request carries $orderby, or it
    " rejects the whole read with RAP_RUNTIME/004 ("Query not fully covered by
    " implementation") even though the data would have come back correctly ordered anyway.
    io_request->get_sort_elements( ).

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( lt_out ) ).
    ENDIF.

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
