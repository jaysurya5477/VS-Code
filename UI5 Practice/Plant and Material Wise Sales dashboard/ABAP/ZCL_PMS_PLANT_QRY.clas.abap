*"* Query provider for custom entity ZSD_PMS_PLANT.
*"* Thin shell - see ZCL_PMS_KPI_QRY.clas.abap's header comment for the
*"* overall pattern (identical parameter-reading and csv_to_range( )
*"* blocks). Maps ls_dash-plant_top20 - get_plant_top20( ) already returns
*"* this pre-sorted by NetValue descending and pre-capped at 20 rows, so
*"* get_sort_elements( ) below is purely the RAP $orderby-consumption
*"* workaround, not an actual re-sort.
CLASS zcl_pms_plant_qry DEFINITION
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


CLASS zcl_pms_plant_qry IMPLEMENTATION.

  METHOD if_rap_query_provider~select.

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

    DATA lt_out TYPE STANDARD TABLE OF zsd_pms_plant.
    lt_out = VALUE #( FOR ls IN ls_dash-plant_top20 (
                        werks      = ls-werks
                        city       = ls-city
                        netvalue   = ls-net_value
                        taxvalue   = ls-tax_value
                        grossvalue = ls-gross_value ) ).

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
