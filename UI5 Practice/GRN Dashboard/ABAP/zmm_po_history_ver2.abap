*&---------------------------------------------------------------------*
*& Report ZMM_PO_HISTORY_NEW
*&---------------------------------------------------------------------*
*&
*&---------------------------------------------------------------------*
REPORT zmm_po_history_ver2.

TABLES : ekko, mkpf, ekpo , zpo_his_rec_send.

TYPES: BEGIN OF ty_final,
         werks            TYPE ekpo-werks,
         lgort            TYPE ekpo-lgort,
         banfn            TYPE ekpo-banfn,
         erdat            TYPE eban-erdat,
         bnfpo            TYPE eban-bnfpo,
         matnr            TYPE eban-matnr,
         menge1           TYPE eban-menge,
         open_pr_qty      TYPE menge_d,
         ebeln            TYPE ekko-ebeln,
         aedat            TYPE ekko-aedat,
         lifnr            TYPE ekko-lifnr,
         name1            TYPE lfa1-name1,
         ebelp            TYPE ekpo-ebelp,
         matnr1           TYPE ekpo-matnr,
         bismt            TYPE mara-bismt,
         txz01            TYPE ekpo-txz01,
         menge            TYPE ekpo-menge,
         effwr            TYPE ekpo-effwr,
         ekgrp            TYPE ekko-ekgrp,
         bsart            TYPE ekko-bsart,
         eknam            TYPE t024-eknam,
         batxt            TYPE t161t-batxt,
         stcd3            TYPE lfa1-stcd3,
         meins            TYPE ekpo-meins,
         mwskz            TYPE ekpo-mwskz,
         netpr            TYPE ekpo-netpr,
         text1            TYPE t007s-text1,
         request_id       TYPE zgate_requests-request_id,
         in_date          TYPE zgate_requests-in_date,
         bwart            TYPE ekbe-bwart,
         mblnr101         TYPE ekbe-belnr,
         mjahr101         TYPE ekbe-gjahr,
         budat101         TYPE mkpf-budat,
         menge2           TYPE ekbe-menge,
         xblnr            TYPE ekbe-xblnr,
         dmbtr            TYPE ekbe-dmbtr,
         sgst             TYPE wrbtr,
         cgst             TYPE wrbtr,
         igst             TYPE wrbtr,
         tot_tax          TYPE wrbtr,
         tot_value        TYPE wrbtr,
         canc_mark        TYPE flag,           " CANCELLATION MARK
         canc_grno        TYPE mblnr,          " CANCELLATION MBLNR 102 MVT TYPE
         rework_mblnr     TYPE mblnr,
         rework_grn       TYPE mblnr,
         rejno            TYPE zmm_rejection_no-rejno,
         mblnr122         TYPE mblnr,  " return no
         budat122         TYPE dats,
         mblnr313         TYPE mblnr,  " transfer no
         budat313         TYPE budat,
         lgort313         TYPE lgort_d,
         pend_qty         TYPE wrbtr,
         prueflos         TYPE qamb-prueflos,
         cpudt2           TYPE qamb-cpudt,
         cputm            TYPE qamb-cputm,
         prueflos1        TYPE qals-prueflos,
         ud_date          TYPE qamb-cpudt,
         losmenge         TYPE qals-losmenge,
         lmenge01         TYPE qals-lmenge01,
         lmenge03         TYPE qals-lmenge03,
         lmenge04         TYPE qals-lmenge04,
         kurztext         TYPE qtxt_code,
         po_ext           TYPE zmmt_custom_num-docnr,
         pr_ext           TYPE zmmt_custom_num-docnr,
         grn_ext          TYPE zmmt_custom_num-docnr,
         cgrn_ext         TYPE zmmt_custom_num-docnr,
         """
         inv_grn          TYPE ekbe-belnr,
         fina_grn         TYPE bseg-augbl,
         inv_date         TYPE ekbe-budat,
         finv_date        TYPE bseg-augdt,
         inv_amt          TYPE ekbe-dmbtr,
         dn_date          TYPE ekbe-budat,
         fdn_date         TYPE bseg-augdt,
         dn_amt           TYPE ekbe-dmbtr,
         dnn              TYPE ekbe-belnr,
         fdnn             TYPE bseg-augbl,
         pd               TYPE bkpf-budat,
         pvn              TYPE bseg-augbl,
         pa               TYPE bseg-dmbtr,
         sendtofinance(1) TYPE c,
         sentdate         TYPE sy-datum,
         sendername       TYPE  char40,
         userid           TYPE char20,
         remark_for_mm    TYPE char40,
         rectofinance(1)  TYPE c,
         recdate          TYPE sy-datum,
         recername        TYPE char40,
         recuserid        TYPE char20,
         remark_for_fi    TYPE char40,
         konts            TYPE saknr,
         txt50            TYPE txt50_skat,
         fiscal_year      TYPE char4,
         gvdocnr          TYPE  zde_fidocnr , "  0
         sakto            TYPE matdoc-sakto,
         gl_desc          TYPE skat-txt50,
         belnr            TYPE bkpf-belnr,
         ""
       END OF ty_final.

DATA : it_final TYPE TABLE OF ty_final,
       wa_final TYPE ty_final,
       it_ekpo  TYPE zmmd_po_cds OCCURS 0,
       wa_ekpo  TYPE zmmd_po_cds.

* SGST/CGST/IGST percentage rates per tax code, fetched once up front from
* the condition master and applied arithmetically inside the line loop.
TYPES: BEGIN OF ty_tax_rate,
         mwskz     TYPE mwskz,
         sgst_rate TYPE konp-kbetr,
         cgst_rate TYPE konp-kbetr,
         igst_rate TYPE konp-kbetr,
       END OF ty_tax_rate.

DATA gt_tax_rate TYPE HASHED TABLE OF ty_tax_rate WITH UNIQUE KEY mwskz.

* Lookup tables for the line loop. Each carries the key its READ uses, so the
* per-row access is a hash/binary lookup instead of a linear scan. HASHED is
* used only where the key is DB-key unique (t007s by mwskz, eban by banfn/
* bnfpo); the rest are SORTED. it_external is read by three different field
* combinations, so it carries one secondary sorted key per access path.
TYPES: BEGIN OF ty_gl_101,
         mblnr TYPE matdoc-mblnr,
         mjahr TYPE matdoc-mjahr,
         sakto TYPE matdoc-sakto,
         txt50 TYPE skat-txt50,
       END OF ty_gl_101,
       BEGIN OF ty_bkpf,
         awkey TYPE bkpf-awkey,
         belnr TYPE bkpf-belnr,
         gjahr TYPE bkpf-gjahr,
       END OF ty_bkpf,
       BEGIN OF ty_external,
         ebeln  TYPE zmmt_custom_num-ebeln,
         banfn  TYPE zmmt_custom_num-banfn,
         mblnr  TYPE zmmt_custom_num-mblnr,
         zvtype TYPE zmmt_custom_num-zvtype,
         docnr  TYPE zmmt_custom_num-docnr,
       END OF ty_external,
       BEGIN OF ty_cancel,
         mblnr TYPE matdoc-mblnr,
         mjahr TYPE matdoc-mjahr,
         bwart TYPE matdoc-bwart,
         ebeln TYPE matdoc-ebeln,
         ebelp TYPE matdoc-ebelp,
         lfbnr TYPE matdoc-lfbnr,
       END OF ty_cancel,
       BEGIN OF ty_eban,
         banfn TYPE eban-banfn,
         bnfpo TYPE eban-bnfpo,
         erdat TYPE eban-erdat,
         menge TYPE eban-menge,
       END OF ty_eban,
       BEGIN OF ty_mbew,
         matnr TYPE mbew-matnr,
         bwkey TYPE mbew-bwkey,
         bklas TYPE mbew-bklas,
         konts TYPE t030-konts,
         txt50 TYPE skat-txt50,
       END OF ty_mbew.

DATA: it_gl_101  TYPE SORTED TABLE OF ty_gl_101
                       WITH NON-UNIQUE KEY mblnr mjahr,
      it_bkpf    TYPE SORTED TABLE OF ty_bkpf
                       WITH NON-UNIQUE KEY awkey,
      it_external TYPE STANDARD TABLE OF ty_external
                       WITH NON-UNIQUE SORTED KEY k_po   COMPONENTS zvtype ebeln
                       WITH NON-UNIQUE SORTED KEY k_pr   COMPONENTS zvtype banfn
                       WITH NON-UNIQUE SORTED KEY k_mblnr COMPONENTS zvtype mblnr,
      it_cancel  TYPE SORTED TABLE OF ty_cancel
                       WITH NON-UNIQUE KEY lfbnr,
      it_eban    TYPE HASHED TABLE OF ty_eban
                       WITH UNIQUE KEY banfn bnfpo,
      it_mbew    TYPE SORTED TABLE OF ty_mbew
                       WITH NON-UNIQUE KEY matnr bwkey,
      it_zgate   TYPE SORTED TABLE OF zmmd_gate_cds
                       WITH NON-UNIQUE KEY ebeln ebelp mblnr mjahr,
      it_rejno   TYPE SORTED TABLE OF zmm_rejection_no
                       WITH NON-UNIQUE KEY mblnr mjahr,
      it_t007s   TYPE HASHED TABLE OF t007s
                       WITH UNIQUE KEY mwskz,
      it_eket    TYPE SORTED TABLE OF eket
                       WITH NON-UNIQUE KEY ebeln ebelp,
      it_qamb_ud TYPE SORTED TABLE OF qamb
                       WITH NON-UNIQUE KEY prueflos,
      it_debit   TYPE SORTED TABLE OF ekbe
                       WITH NON-UNIQUE KEY ebeln ebelp lfbnr lfgja lfpos,
      it_pv      TYPE SORTED TABLE OF bseg
                       WITH NON-UNIQUE KEY belnr gjahr.

DATA: gt_fieldcat TYPE slis_t_fieldcat_alv,
      gt_filter   TYPE slis_t_filter_alv,
      gs_filter   TYPE slis_filter_alv,
      ls_fieldcat TYPE slis_fieldcat_alv,
*      ls_layout   TYPE SALV_TABLE_STANDARD,
      ls_layout   TYPE slis_layout_alv,
      lv_col      TYPE i.

DATA :i_date TYPE  sy-datum,
      i_fyv  TYPE  periv,
      e_fy   TYPE  char4.

RANGES : r_cancel FOR wa_ekpo-canc_mark.
RANGES : r_rework FOR wa_ekpo-rework_mblnr.
RANGES : r_return FOR wa_ekpo-mblnr122.
RANGES : r_kurtzz FOR wa_ekpo-kurztext.
RANGES : r_inv_gr FOR wa_ekpo-inv_grn.
RANGES : r_pvn    FOR wa_ekpo-pvn.
RANGES : r_bsart  FOR wa_ekpo-bsart.
RANGES : r_bad_ekgrp FOR wa_ekpo-ekgrp.
RANGES : r_bad_werks FOR wa_ekpo-werks.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  SELECT-OPTIONS : s_ebeln FOR ekko-ebeln,
                   s_aedat FOR ekko-aedat,
                   s_matnr FOR wa_final-matnr,
                   s_mblnr FOR mkpf-mblnr,
                   s_mjahr FOR mkpf-mjahr,
                   s_budat FOR mkpf-budat,
                   s_lifnr FOR ekko-lifnr,
                   s_pflos FOR wa_final-prueflos,
                   s_werks FOR ekpo-werks NO INTERVALS,
                   s_lgort FOR ekpo-lgort.

  PARAMETERS : p_zp03 TYPE c AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-100.

  SELECT-OPTIONS : f_date FOR mkpf-bldat,
                   r_date FOR mkpf-bldat.

SELECTION-SCREEN END OF BLOCK b2 .

SELECTION-SCREEN BEGIN OF LINE.

  PARAMETERS p_cancel TYPE c AS CHECKBOX .
  SELECTION-SCREEN COMMENT 2(24) FOR FIELD p_cancel.

  PARAMETERS p_rework TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 36(18) FOR FIELD p_rework.

  PARAMETERS p_return TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 56(17) FOR FIELD p_return.

SELECTION-SCREEN END OF LINE.

* SELECTION-SCREEN SKIP.

SELECTION-SCREEN BEGIN OF LINE.

  PARAMETERS p_accept TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 2(24) FOR FIELD p_accept.

  PARAMETERS p_reject TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 36(18) FOR FIELD p_reject.

  PARAMETERS p_pend TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 56(17) FOR FIELD p_pend.

SELECTION-SCREEN END OF LINE.

SELECTION-SCREEN BEGIN OF LINE.

  PARAMETERS p_pjdone TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 2(24) FOR FIELD p_pjdone.

  PARAMETERS p_pjnot TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 36(18) FOR FIELD p_pjnot.

SELECTION-SCREEN END OF LINE.

SELECTION-SCREEN BEGIN OF LINE.

  PARAMETERS p_pvdone TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 2(24) FOR FIELD p_pvdone.

  PARAMETERS p_pvnot TYPE c AS CHECKBOX.
  SELECTION-SCREEN COMMENT 36(25) FOR FIELD p_pvnot.

SELECTION-SCREEN END OF LINE.

INITIALIZATION.

  GET PARAMETER ID 'P_ZP03' FIELD p_zp03.

START-OF-SELECTION.

  REFRESH : r_cancel, r_rework, r_return, r_bsart.
  IF p_cancel = 'X'.
    r_cancel-sign   = 'I'.
    r_cancel-option = 'EQ'.
    r_cancel-low    = 'X'.
    APPEND r_cancel.
  ENDIF.

  IF p_rework = 'X'.
    r_rework-sign = 'I'.
    r_rework-option = 'NE'.
    r_rework-low = ' '.
    APPEND r_rework.
  ENDIF.

  IF p_return = 'X'.
    r_return-sign = 'I'.
    r_return-option = 'NE'.
    r_return-low = ' '.
    APPEND r_return.
  ENDIF.

  IF p_accept = 'X'.
    r_kurtzz-sign = 'I'.
    r_kurtzz-option = 'CP'.
    r_kurtzz-low = 'Acc*'.
    APPEND r_kurtzz.
  ENDIF.

  IF p_reject = 'X'.
    r_kurtzz-sign = 'I'.
    r_kurtzz-option = 'CP'.
    r_kurtzz-low = 'Rej*'.
    APPEND r_kurtzz.
  ENDIF.

  IF p_pend = 'X'.
    r_kurtzz-sign = 'I'.
    r_kurtzz-option = 'CP'.
    r_kurtzz-low = 'Pen*'.
    APPEND r_kurtzz.
  ENDIF.

  IF p_pjdone = 'X'.
    r_inv_gr-sign = 'I'.
    r_inv_gr-option = 'NE'.
    r_inv_gr-low = '0000000000'.
    APPEND r_inv_gr.
  ENDIF.

  IF p_pjnot = 'X'.
    r_inv_gr-sign = 'I'.
    r_inv_gr-option = 'EQ'.
    r_inv_gr-low = '0000000000'.
    APPEND r_inv_gr.
  ENDIF.

  IF p_pvdone = 'X'.
    r_pvn-sign = 'I'.
    r_pvn-option = 'NE'.
    r_pvn-low = '0000000000'.
    APPEND r_pvn.
  ENDIF.

  IF p_pvnot = 'X'.
    r_pvn-sign = 'I'.
    r_pvn-option = 'EQ'.
    r_pvn-low = '0000000000'.
    APPEND r_pvn.
  ENDIF.

  IF p_zp03 IS INITIAL.
    r_bsart-sign = 'E'.
    r_bsart-option = 'EQ'.
    r_bsart-low = 'ZP03'.
    APPEND r_bsart.
    r_bsart-low = 'ZP04'.
    APPEND r_bsart.
    r_bsart-low = 'ZP05'.
    APPEND r_bsart.
    r_bsart-low = 'ZP22'.
    APPEND r_bsart.
    r_bsart-low = 'ZP23'.
    APPEND r_bsart.
  ELSE.
    r_bsart-sign = 'I'.
    r_bsart-option = 'EQ'.
    r_bsart-low = 'ZP03'.
    APPEND r_bsart.
  ENDIF.

  SELECT * FROM zmmd_po_cds INTO TABLE @it_ekpo
    WHERE ebeln IN @s_ebeln AND aedat IN @s_aedat
     AND  werks IN @s_werks AND matnr IN @s_matnr
     AND  lifnr IN @s_lifnr AND budat101 IN @s_budat
     AND  mblnr101 IN @s_mblnr AND mjahr101 IN @s_mjahr
     AND  lgort IN @s_lgort

     AND canc_mark IN @r_cancel AND rework_mblnr IN @r_rework
     AND mblnr122  IN @r_return AND kurztext     IN @r_kurtzz
     AND inv_grn   IN @r_inv_gr AND pvn          IN @r_pvn
     AND bsart     IN @r_bsart.

  IF it_ekpo IS NOT INITIAL.

*    SELECT * FROM zmmd_pyvc_cds INTO TABLE @DATA(it_pyvc)
*      FOR ALL ENTRIES IN @it_ekpo
*     WHERE ebeln = @it_ekpo-ebeln AND ebelp = @it_ekpo-ebelp
*      AND  lfbnr = @it_ekpo-mblnr101 AND lfgja = @it_ekpo-mjahr101
*      AND  lfpos = @it_ekpo-zeile101.

    SELECT DISTINCT a~mblnr, a~mjahr, a~sakto, b~txt50
      FROM matdoc AS a INNER JOIN skat AS b
       ON b~saknr = a~sakto
      INTO TABLE @it_gl_101
      FOR ALL ENTRIES IN @it_ekpo
      WHERE a~mblnr = @it_ekpo-mblnr101 AND a~mjahr = @it_ekpo-mjahr101
       AND  a~bwart = '101' AND b~spras = 'E' AND b~ktopl = '8000'.

    SELECT awkey, belnr, gjahr FROM bkpf
      INTO TABLE @it_bkpf
      FOR ALL ENTRIES IN @it_ekpo
     WHERE awkey = @it_ekpo-awkey_101.

    SELECT ebeln, banfn, mblnr, zvtype, docnr
      FROM zmmt_custom_num INTO TABLE @it_external
       FOR ALL ENTRIES IN @it_ekpo
        WHERE ebeln = @it_ekpo-ebeln AND zvtype = 'PO'.

    SELECT ebeln, banfn, mblnr, zvtype, docnr
      FROM zmmt_custom_num APPENDING TABLE @it_external
       FOR ALL ENTRIES IN @it_ekpo
        WHERE banfn = @it_ekpo-banfn AND zvtype = 'PR'.

    SELECT ebeln, banfn, mblnr, zvtype, docnr
      FROM zmmt_custom_num APPENDING TABLE @it_external
       FOR ALL ENTRIES IN @it_ekpo
        WHERE mblnr = @it_ekpo-mblnr101 AND zvtype = 'GR'.

    SELECT mblnr, mjahr, bwart, ebeln, ebelp, lfbnr
      FROM matdoc INTO TABLE @it_cancel
       FOR ALL ENTRIES IN @it_ekpo
        WHERE lfbnr = @it_ekpo-mblnr101 AND ebelp = @it_ekpo-ebelp
         AND bwart = '102'.
    IF sy-subrc = 0.
      SELECT ebeln, banfn, mblnr, zvtype, docnr
        FROM zmmt_custom_num APPENDING TABLE @it_external
         FOR ALL ENTRIES IN @it_cancel
          WHERE mblnr = @it_cancel-mblnr AND zvtype = 'GC'.
    ENDIF.

    SELECT banfn, bnfpo, erdat, menge FROM eban
      INTO TABLE @it_eban FOR ALL ENTRIES IN @it_ekpo
       WHERE banfn = @it_ekpo-banfn AND bnfpo = @it_ekpo-bnfpo.

    SELECT a~matnr, a~bwkey, b~bklas, b~konts, c~txt50 FROM mbew AS a
      INNER JOIN t030 AS b ON b~bklas = a~bklas AND b~ktopl = '8000' AND b~ktosl = 'BSX'
      INNER JOIN skat AS c ON c~saknr = b~konts AND c~ktopl = b~ktopl AND c~spras = 'E'
       INTO TABLE @it_mbew FOR ALL ENTRIES IN @it_ekpo
      WHERE a~matnr = @it_ekpo-matnr AND a~bwkey = @it_ekpo-werks.

    SELECT * FROM zmmd_gate_cds INTO TABLE @it_zgate FOR ALL ENTRIES IN @it_ekpo
      WHERE ebeln = @it_ekpo-ebeln AND ebelp = @it_ekpo-ebelp.

    SELECT * FROM zmm_rejection_no INTO TABLE @it_rejno FOR ALL ENTRIES IN @it_ekpo
      WHERE mblnr = @it_ekpo-mblnr101 AND mjahr = @it_ekpo-mjahr101.

    SELECT * FROM t007s INTO TABLE @it_t007s FOR ALL ENTRIES IN @it_ekpo
      WHERE mwskz = @it_ekpo-mwskz AND kalsm = 'TAXINN' AND spras = 'E'.

*   Resolve the GST percentage rates for every tax code in the result set
*   in one shot; the line loop then only does the arithmetic.
    PERFORM build_tax_rates.

    SELECT * FROM eket INTO TABLE @it_eket FOR ALL ENTRIES IN @it_ekpo
      WHERE ebeln = @it_ekpo-ebeln AND ebelp = @it_ekpo-ebelp.

    SELECT * FROM qamb INTO TABLE @it_qamb_ud FOR ALL ENTRIES IN @it_ekpo
      WHERE prueflos = @it_ekpo-prueflos AND zaehler NE 1.

    SELECT * FROM ekbe INTO TABLE @it_debit FOR ALL ENTRIES IN @it_ekpo
      WHERE ebeln = @it_ekpo-ebeln    AND ebelp = @it_ekpo-ebelp
      AND   lfbnr = @it_ekpo-mblnr101 AND lfgja = @it_ekpo-mjahr101
      AND   lfpos = @it_ekpo-zeile101 AND vgabe = '2'
      AND   bewtp = 'Q'               AND shkzg = 'H' .

    SELECT * FROM bseg INTO TABLE @it_pv
      FOR ALL ENTRIES IN @it_ekpo
      WHERE belnr = @it_ekpo-pvn  AND gjahr = @it_ekpo-mjahr101
      AND   hkont LE '0010909999' AND hkont GE '0010901000'.
  ENDIF.

END-OF-SELECTION.

  IF it_ekpo IS NOT INITIAL.

    DATA(lv_line) = lines( it_ekpo ).

* Begin of Insert by HBTABAP1 on 13.01.2026
* Performance: evaluate authorization for each DISTINCT Purchasing Group /
* Plant only once, then drop unauthorized rows in a single bulk DELETE,
* instead of running AUTHORITY-CHECK (and DELETE) for every line.
    DATA: lt_ekgrp LIKE TABLE OF wa_ekpo-ekgrp,
          lt_werks LIKE TABLE OF wa_ekpo-werks,
          lv_ekgrp LIKE wa_ekpo-ekgrp,
          lv_werks LIKE wa_ekpo-werks.

    CLEAR: lt_ekgrp, lt_werks, r_bad_ekgrp[], r_bad_werks[].

    LOOP AT it_ekpo INTO wa_ekpo.
      APPEND wa_ekpo-ekgrp TO lt_ekgrp.
      APPEND wa_ekpo-werks TO lt_werks.
    ENDLOOP.
    SORT lt_ekgrp.
    DELETE ADJACENT DUPLICATES FROM lt_ekgrp.
    SORT lt_werks.
    DELETE ADJACENT DUPLICATES FROM lt_werks.

    LOOP AT lt_ekgrp INTO lv_ekgrp.
      AUTHORITY-CHECK OBJECT 'M_BEST_EKG'
        ID 'ACTVT' FIELD '03'             " 03 = Display
        ID 'EKGRP' FIELD lv_ekgrp.        " Purchasing Group
      IF sy-subrc <> 0.
        r_bad_ekgrp-sign   = 'I'.
        r_bad_ekgrp-option = 'EQ'.
        r_bad_ekgrp-low    = lv_ekgrp.
        APPEND r_bad_ekgrp.
      ENDIF.
    ENDLOOP.

    LOOP AT lt_werks INTO lv_werks.
      AUTHORITY-CHECK OBJECT 'M_BEST_WRK'
        ID 'ACTVT' FIELD '03'             " 03 = Display
        ID 'WERKS' FIELD lv_werks.        " Plant
      IF sy-subrc <> 0.
        r_bad_werks-sign   = 'I'.
        r_bad_werks-option = 'EQ'.
        r_bad_werks-low    = lv_werks.
        APPEND r_bad_werks.
      ENDIF.
    ENDLOOP.

    IF r_bad_ekgrp[] IS NOT INITIAL.
      DELETE it_ekpo WHERE ekgrp IN r_bad_ekgrp.
    ENDIF.
    IF r_bad_werks[] IS NOT INITIAL.
      DELETE it_ekpo WHERE werks IN r_bad_werks.
    ENDIF.
* End of Insert by HBTABAP1 on 13.01.2026

    LOOP AT it_ekpo ASSIGNING FIELD-SYMBOL(<ekpo>).

      MOVE-CORRESPONDING <ekpo> TO wa_final.

      IF wa_final-kurztext CS 'Acc' AND <ekpo>-kostl <> ' '
        AND wa_final-lmenge01 IS INITIAL AND wa_final-lmenge03 IS INITIAL
        AND wa_final-lmenge04 IS INITIAL.
        wa_final-lmenge01 = wa_final-losmenge.
      ELSEIF wa_final-kurztext CS 'Rej' AND <ekpo>-kostl <> ' '
        AND wa_final-lmenge01 = ' ' AND wa_final-lmenge03 IS INITIAL
        AND wa_final-lmenge04 IS INITIAL.
        wa_final-lmenge04 = wa_final-losmenge.
      ENDIF.

      READ TABLE it_gl_101 ASSIGNING FIELD-SYMBOL(<gl_101>)
       WITH KEY mblnr = <ekpo>-mblnr101 mjahr = <ekpo>-mjahr101.
      IF sy-subrc = 0.
        wa_final-sakto   = <gl_101>-sakto.
        wa_final-gl_desc = <gl_101>-txt50.
      ENDIF.

      READ TABLE it_bkpf ASSIGNING FIELD-SYMBOL(<bkpf>)
       WITH KEY awkey = <ekpo>-awkey_101.
      IF sy-subrc = 0.
        wa_final-belnr = <bkpf>-belnr.
      ENDIF.

      READ TABLE it_external ASSIGNING FIELD-SYMBOL(<external>)
           WITH TABLE KEY k_po COMPONENTS zvtype = 'PO' ebeln = <ekpo>-ebeln.
      IF sy-subrc = 0.
        wa_final-po_ext = <external>-docnr.
      ENDIF.

      READ TABLE it_external ASSIGNING <external>
           WITH TABLE KEY k_pr COMPONENTS zvtype = 'PR' banfn = <ekpo>-banfn.
      IF sy-subrc = 0.
        wa_final-pr_ext = <external>-docnr.
      ENDIF.

      READ TABLE it_external ASSIGNING <external>
           WITH TABLE KEY k_mblnr COMPONENTS zvtype = 'GR' mblnr = <ekpo>-mblnr101.
      IF sy-subrc = 0.
        wa_final-grn_ext = <external>-docnr.
      ENDIF.

      READ TABLE it_cancel ASSIGNING FIELD-SYMBOL(<cancel>) WITH KEY lfbnr = <ekpo>-mblnr101.
      IF sy-subrc = 0.
*        wa_final-canc_mark = 'X'.
        wa_final-canc_grno = <cancel>-mblnr.

        READ TABLE it_external ASSIGNING <external>
             WITH TABLE KEY k_mblnr COMPONENTS zvtype = 'GC' mblnr = <cancel>-mblnr.
        IF sy-subrc = 0.
          wa_final-cgrn_ext = <external>-docnr.
        ENDIF.
      ENDIF.

      READ TABLE it_eban ASSIGNING FIELD-SYMBOL(<eban>) WITH KEY banfn = <ekpo>-banfn
                                                     bnfpo = <ekpo>-bnfpo.
      IF sy-subrc = 0.
        wa_final-erdat  = <eban>-erdat.
        wa_final-bnfpo  = <eban>-bnfpo.
        wa_final-menge1 = <eban>-menge.

        IF <eban>-menge IS NOT INITIAL.
          wa_final-open_pr_qty = <eban>-menge - <ekpo>-menge.
        ENDIF.
      ENDIF.

      READ TABLE it_mbew ASSIGNING FIELD-SYMBOL(<mbew>) WITH KEY matnr = <ekpo>-matnr
                                                     bwkey = <ekpo>-werks.
      IF sy-subrc = 0.
        wa_final-konts = <mbew>-konts.
        wa_final-txt50 = <mbew>-txt50.
      ENDIF.

      READ TABLE it_zgate ASSIGNING FIELD-SYMBOL(<zgate>) WITH KEY ebeln = <ekpo>-ebeln
                                                       ebelp = <ekpo>-ebelp
                                                       mblnr = <ekpo>-mblnr101
                                                       mjahr = <ekpo>-mjahr101.
      IF sy-subrc = 0.
        wa_final-request_id = <zgate>-request_id.
        wa_final-in_date    = <zgate>-in_date.
      ENDIF.

      READ TABLE it_rejno ASSIGNING FIELD-SYMBOL(<rejno>) WITH KEY mblnr = <ekpo>-mblnr101
                                                       mjahr = <ekpo>-mjahr101.
      IF sy-subrc = 0.
        wa_final-rejno = <rejno>-rejno.
      ENDIF.

*     Inspection remarks (QAVE long text) are no longer pre-read per row;
*     they are fetched on demand when the user clicks the Quality Lot No.

      IF wa_final-mwskz IS NOT INITIAL AND wa_final-dmbtr IS NOT INITIAL.
*       Rates were pre-fetched into gt_tax_rate before the loop; here the
*       line tax is just an arithmetic share of dmbtr (no DB / FM access).
        PERFORM get_tax_amounts
                         USING    wa_final-mwskz
                                  wa_final-dmbtr
                         CHANGING wa_final-sgst
                                  wa_final-cgst
                                  wa_final-igst
                                  wa_final-tot_tax.
      ENDIF.

      wa_final-tot_value = wa_final-dmbtr. " - wa_final-tot_tax.

      wa_final-dmbtr = wa_final-tot_value + wa_final-tot_tax. " total grn value including tax.

      READ TABLE it_t007s ASSIGNING FIELD-SYMBOL(<t007s>) WITH KEY mwskz = <ekpo>-mwskz.
      IF sy-subrc = 0.
        wa_final-text1 = <t007s>-text1.
      ENDIF.

      READ TABLE it_eket ASSIGNING FIELD-SYMBOL(<eket>) WITH KEY ebeln = wa_final-ebeln
                                                     ebelp = wa_final-ebelp.
      IF sy-subrc = 0.
        wa_final-pend_qty = <eket>-menge - <eket>-wemng.
      ENDIF.

      READ TABLE it_qamb_ud ASSIGNING FIELD-SYMBOL(<ud>) WITH KEY prueflos = <ekpo>-prueflos.
      IF sy-subrc = 0 AND ( wa_final-lmenge01 NE 0
         OR wa_final-lmenge04 NE 0 ).
        wa_final-ud_date = <ud>-cpudt.
      ENDIF.

      READ TABLE it_debit ASSIGNING FIELD-SYMBOL(<debit>) WITH KEY ebeln = <ekpo>-ebeln
                                                       ebelp = <ekpo>-ebelp
                                                       lfbnr = <ekpo>-mblnr101
                                                       lfgja = <ekpo>-mjahr101
                                                       lfpos = <ekpo>-zeile101.
      IF sy-subrc = 0.
        wa_final-dnn     = <debit>-belnr.
        wa_final-dn_date = <debit>-budat.
        wa_final-dn_amt  = <debit>-dmbtr.
      ENDIF.

      READ TABLE it_pv ASSIGNING FIELD-SYMBOL(<pv>) WITH KEY belnr = wa_final-pvn gjahr = wa_final-mjahr101.
      IF sy-subrc = 0.
        wa_final-pa = <pv>-dmbtr.
      ENDIF.

*      IF wa_ekpo-inv_grn IS INITIAL OR wa_ekpo-inv_grn = 0.
*        READ TABLE it_pyvc INTO DATA(wa_pyvc) WITH KEY ebeln = wa_ekpo-ebeln
*                                                       ebelp = wa_ekpo-ebelp
*                                                       lfbnr = wa_ekpo-mblnr101
*                                                       lfgja = wa_ekpo-mjahr101
*                                                       lfpos = wa_ekpo-zeile101.
*        IF sy-subrc = 0.
*          wa_final = CORRESPONDING #(  BASE ( wa_final )  " Retain existing values in wa_final
*                                      wa_pyvc
*                     MAPPING          inv_grn  = belnr
*                                      inv_date = budat
*                                      inv_amt  = dmbtr
*                                      pvn      = pvn
*                                      fina_grn = fina_grn
*                                      pd       = pd ).
*
*          clear wa_pyvc.
*        ENDIF.
*      ENDIF.

      APPEND wa_final TO it_final.
*     Only wa_final is a real work area now; the per-table reads use field
*     symbols (never CLEAR a field symbol - it would wipe the table row).
      CLEAR wa_final.

    ENDLOOP.

  ENDIF.

  IF it_final IS NOT INITIAL.
    PERFORM get_fcat.
    PERFORM alv.
  ENDIF.

FORM fill_filter USING p_fname p_tab p_sign p_option p_low p_high.
  gs_filter-fieldname = p_fname.  " 'CANC_MARK'.
  gs_filter-tabname   = p_tab.    " 'IT_FINAL'.
  gs_filter-sign0     = p_sign.   " 'I'.
  gs_filter-optio     = p_option. " 'EQ'.
  gs_filter-valuf_int = gs_filter-valuf = p_low.    " 'X'.
  APPEND gs_filter TO gt_filter.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form build_tax_rates
*&---------------------------------------------------------------------*
*& Reads the SGST/CGST/IGST percentage rates for every tax code present
*& in it_ekpo in a single A003 -> KONP access and buffers them in
*& gt_tax_rate (keyed by tax code). Runs once, before the line loop, so
*& no condition-master read happens per row.
*&---------------------------------------------------------------------*
FORM build_tax_rates.

  CLEAR gt_tax_rate.
  IF it_ekpo IS INITIAL.
    RETURN.
  ENDIF.

* Tax code -> condition record (A003) -> percentage rate (KONP-KBETR) for
* the input GST condition types, valid as of today, for all tax codes used.
  SELECT a~mwskz, a~kschl, b~kbetr
    FROM a003 AS a INNER JOIN konp AS b
      ON b~knumh = a~knumh AND b~kschl = a~kschl
    INTO TABLE @DATA(lt_konp)
    FOR ALL ENTRIES IN @it_ekpo
    WHERE a~kappl =  'TX'  AND a~aland =  'IN'
      AND a~mwskz =  @it_ekpo-mwskz
      AND a~kschl IN ( 'JISG', 'JICG', 'JIIG' )
      AND b~loevm_ko = @space.

  LOOP AT lt_konp INTO DATA(ls_konp).
    READ TABLE gt_tax_rate ASSIGNING FIELD-SYMBOL(<rate>)
         WITH TABLE KEY mwskz = ls_konp-mwskz.
    IF sy-subrc <> 0.
      INSERT VALUE #( mwskz = ls_konp-mwskz ) INTO TABLE gt_tax_rate
             ASSIGNING <rate>.
    ENDIF.
    CASE ls_konp-kschl.
      WHEN 'JISG'.
        <rate>-sgst_rate = ls_konp-kbetr.
      WHEN 'JICG'.
        <rate>-cgst_rate = ls_konp-kbetr.
      WHEN 'JIIG'.
        <rate>-igst_rate = ls_konp-kbetr.
    ENDCASE.
  ENDLOOP.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form get_tax_amounts
*&---------------------------------------------------------------------*
*& Splits the GRN base value into SGST/CGST/IGST using the rates already
*& buffered in gt_tax_rate. Pure arithmetic - no DB or function module
*& access - so it is cheap to call for every line.
*&---------------------------------------------------------------------*
FORM get_tax_amounts USING    p_mwskz TYPE mwskz
                              p_dmbtr TYPE dmbtr_cs
                     CHANGING p_sgst
                              p_cgst
                              p_igst
                              p_tot_tax.

  CLEAR : p_sgst, p_cgst, p_igst, p_tot_tax.

  READ TABLE gt_tax_rate INTO DATA(ls_rate) WITH TABLE KEY mwskz = p_mwskz.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

* KONP-KBETR stores percentage * 10 (e.g. 18% = 180), so the line tax is
* base * KBETR / 1000. Each tax component is rounded to a whole rupee
* (commercial half-up, zero paise, e.g. 499.68 -> 500.00); the total is the
* sum of the rounded parts so it stays consistent with what is displayed.
  p_sgst    = round( val = p_dmbtr * ls_rate-sgst_rate / 1000 dec = 0 ).
  p_cgst    = round( val = p_dmbtr * ls_rate-cgst_rate / 1000 dec = 0 ).
  p_igst    = round( val = p_dmbtr * ls_rate-igst_rate / 1000 dec = 0 ).
  p_tot_tax = p_sgst + p_cgst + p_igst.

ENDFORM.


FORM alv.

  IF sy-uname = 'AUDITOR' OR sy-uname = 'CAG_AUDITOR'.
    LOOP AT it_final ASSIGNING FIELD-SYMBOL(<fs_final>).
      CALL FUNCTION 'GM_GET_FISCAL_YEAR'
        EXPORTING
          i_date                     = <fs_final>-budat101
          i_fyv                      = 'V3'
        IMPORTING
          e_fy                       = e_fy
        EXCEPTIONS
          fiscal_year_does_not_exist = 1
          not_defined_for_date       = 2
          OTHERS                     = 3.
      IF sy-subrc <> 0.
* Implement suitable error handling here
      ENDIF.
      <fs_final>-fiscal_year = e_fy.



    ENDLOOP.
*    BREAK hbtabap7.
    DELETE it_final WHERE fiscal_year NE '2025'.
  ENDIF.


  ls_layout-colwidth_optimize = 'X'.
  ls_layout-zebra = 'X'.
*  ls_layout- = 'X'.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program      = sy-repid
      i_callback_user_command = 'USRCMD'
*     i_callback_user_command = 'USER_COMMAND'
*     i_interface_check       = 'X'
      is_layout               = ls_layout
      i_save                  = 'X'
      it_fieldcat             = gt_fieldcat[]
      it_filter               = gt_filter[]
    TABLES
      t_outtab                = it_final[]
    EXCEPTIONS
      program_error           = 1
      OTHERS                  = 2.

ENDFORM.

FORM get_fcat.

  PERFORM fill_cat USING  'Plant'                                    'WERKS'.
  PERFORM fill_cat USING  'Storage Location'                         'LGORT'.
  PERFORM fill_cat USING  'PO No.'                                   'EBELN'.
  PERFORM fill_cat USING  'Item No.'                                 'EBELP'.
  PERFORM fill_cat USING  'PO EXT No.'                               'PO_EXT'.
  PERFORM fill_cat USING  'Purchase Group'                           'EKGRP'.
  PERFORM fill_cat USING  'Purchase group Desc.'                     'EKNAM'.
  PERFORM fill_cat USING  'Document Type'                            'BSART'.
  PERFORM fill_cat USING  'Document Type Desc.'                      'BATXT'.
  PERFORM fill_cat USING  'PO Creation Date'                         'AEDAT'.
  PERFORM fill_cat USING  'Vendor No.'                               'LIFNR'.
  PERFORM fill_cat USING  'Vendor Name'                              'NAME1'.
  PERFORM fill_cat USING  'Vendor GST No.'                           'STCD3'.
  PERFORM fill_cat USING  'PR No.'                                   'BANFN'.
  PERFORM fill_cat USING  'PR EXT No.'                               'PR_EXT'.
  PERFORM fill_cat USING  'PR Creation Date'                         'ERDAT'.
  PERFORM fill_cat USING  'PR Item No.'                              'BNFPO'.
  PERFORM fill_cat USING  'Order PO Qty'                             'MENGE'.
  PERFORM fill_cat USING  'Order PO Price'                           'EFFWR'.
  PERFORM fill_cat USING  'Unit of Measure'                          'MEINS'.
  PERFORM fill_cat USING  'Unit Price'                               'NETPR'.
  PERFORM fill_cat USING  'Order PR Qty'                             'MENGE1'.
  PERFORM fill_cat USING  'Open PR Qty'                              'OPEN_PR_QTY'.
  PERFORM fill_cat USING  'Old Material No.'                         'BISMT'.
  PERFORM fill_cat USING  'Material No.'                             'MATNR'.
  PERFORM fill_cat USING  'Material Desc.'                           'TXZ01'.
  PERFORM fill_cat USING  'GL Account'                               'KONTS'.
  PERFORM fill_cat USING  'GL Description'                           'TXT50'.
  PERFORM fill_cat USING  'Gate Entry No.'                           'REQUEST_ID'.
  PERFORM fill_cat USING  'Gate Entry Date'                          'IN_DATE'.
  PERFORM fill_cat USING  'Movement Type'                            'BWART'.
  PERFORM fill_cat USING  'GRN No.'                                  'MBLNR101'.
  PERFORM fill_cat USING  'GRN  EXT No.'                             'GRN_EXT'.
  PERFORM fill_cat USING  'Cancelled'                                'CANC_MARK'.
  PERFORM fill_cat USING  'Cancelled GRN No.'                        'CANC_GRNO'.
  PERFORM fill_cat USING  'Cancelled EXT GRN No.'                    'CGRN_EXT'.
  PERFORM fill_cat USING  'G/L Account'                              'SAKTO'.
  PERFORM fill_cat USING  'G/L Description'                          'GL_DESC'.
  PERFORM fill_cat USING  'Accounting No.'                           'BELNR'.
  PERFORM fill_cat USING  'Rework No.'                               'REWORK_MBLNR'.
  PERFORM fill_cat USING  'Rejection No.'                            'REJNO'.
  PERFORM fill_cat USING  'Return No.'                               'MBLNR122'.
  PERFORM fill_cat USING  'Return Date'                              'BUDAT122'.
  PERFORM fill_cat USING  'Transfer No.'                             'MBLNR313'.
  PERFORM fill_cat USING  'Transfer Date'                            'BUDAT313'.
  PERFORM fill_cat USING  'Transfer Loc.'                            'LGORT313'.
  PERFORM fill_cat USING  'GRN Year'                                 'MJAHR101'.
  PERFORM fill_cat USING  'GRN Date'                                 'BUDAT101'.
  PERFORM fill_cat USING  'GRN Qty'                                  'MENGE2'.
  PERFORM fill_cat USING  'Total GRN Value'                          'TOT_VALUE'.
  PERFORM fill_cat USING  'SGST'                                     'SGST'.
  PERFORM fill_cat USING  'CGST'                                     'CGST'.
  PERFORM fill_cat USING  'IGST'                                     'IGST'.
  PERFORM fill_cat USING  'Total GST'                                'TOT_TAX'.
  PERFORM fill_cat USING  'Total GRN incl. Tax'                      'DMBTR'.
  PERFORM fill_cat USING  'Tax Code'                                 'MWSKZ'.
  PERFORM fill_cat USING  'Tax Code Desc.'                           'TEXT1'.
  PERFORM fill_cat USING  'Pending PO Qty'                           'PEND_QTY'.
  PERFORM fill_cat USING  'Vendor Invoice No.'                       'XBLNR'.
  PERFORM fill_cat USING  'Quality Lot No'                           'PRUEFLOS'.
  PERFORM fill_cat USING  'Quality Lot Creation Date'                'CPUDT2'.
  PERFORM fill_cat USING  'Time Of Creator'                          'CPUTM'.
  PERFORM fill_cat USING  'Quality Status'                           'KURZTEXT'.
  PERFORM fill_cat USING  'Inspection Lot Qty'                       'LOSMENGE'.
  PERFORM fill_cat USING  'Ok Qty'                                   'LMENGE01'.
  PERFORM fill_cat USING  'Sample Qty'                               'LMENGE03'.
  PERFORM fill_cat USING  'Reject Qty'                               'LMENGE04'.
  PERFORM fill_cat USING  'Usage Decision Date'                      'UD_DATE'.
  PERFORM fill_cat USING  'PJ No.'                                   'INV_GRN'.
  PERFORM fill_cat USING  'PJ Date'                                  'INV_DATE'.
  PERFORM fill_cat USING  'PJ Amount'                                'INV_AMT'.
  PERFORM fill_cat USING  'Debit Note Date'                          'DN_DATE'.
  PERFORM fill_cat USING  'Debit Note Amount'                        'DN_AMT'.
  PERFORM fill_cat USING  'Debit Note Number'                        'DNN'.
  PERFORM fill_cat USING  'PAYMENT DATE'                             'PD'.
  PERFORM fill_cat USING  'PAYMENT VOUCHER NUMBER'                   'PVN'.
  PERFORM fill_cat USING  'PAYMENT AMOUNT'                           'PA'.
  PERFORM fill_cat USING  'FINANCIAL INVOICE NUMBER AGAINST GRN'     'FINA_GRN'.
  PERFORM fill_cat USING  'Ex.Vocher Number'                         'GVDOCNR'.
  PERFORM fill_cat USING  'SENT TO FINANCE'                          'SENDTOFINANCE'.
  PERFORM fill_cat USING  'SENT DATE'                                'SENTDATE'.
  PERFORM fill_cat USING  'SENDER NAME'                              'SENDERNAME'.
  PERFORM fill_cat USING  'USERID'                                   'USERID'.
  PERFORM fill_cat USING  'REMARK FOR MM'                            'REMARK_FOR_MM'.
  PERFORM fill_cat USING  'RECIEVED BY FINANCE'                      'RECTOFINANCE'.
  PERFORM fill_cat USING  'RECIEVED DATE'                            'RECDATE'.
  PERFORM fill_cat USING  'RECIEVER NAME'                            'RECERNAME'.
  PERFORM fill_cat USING  'RECIEVER ID'                              'RECUSERID'.
  PERFORM fill_cat USING  'REMARKS FOR FI'                           'REMARK_FOR_FI '.

  IF p_zp03 IS NOT INITIAL.
    DELETE gt_fieldcat WHERE fieldname = 'SENDTOFINANCE'
     OR fieldname = 'SENTDATE'
     OR fieldname = 'SENDERNAME'
     OR fieldname = 'USERID'
     OR fieldname = 'REMARK_FOR_MM'
     OR fieldname = 'RECTOFINANCE'
     OR fieldname = 'RECDATE'
     OR fieldname = 'RECERNAME'
     OR fieldname = 'RECUSERID'
     OR fieldname = 'REMARK_FOR_FI '

     OR fieldname = 'REWORK_MBLNR'
     OR fieldname = 'REJNO'
     OR fieldname = 'MBLNR122'
     OR fieldname = 'BUDAT122'
     OR fieldname = 'MBLNR313'
     OR fieldname = 'BUDAT313'
     OR fieldname = 'LGORT313'.
  ENDIF.


ENDFORM.

*&---------------------------------------------------------------------*
*& Form fill_cat
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*&      --> P_
*&      --> P_
*&---------------------------------------------------------------------*
FORM fill_cat  USING    VALUE(p_0602)
                        VALUE(p_0603).

  lv_col = lv_col + 1 .
  ls_fieldcat-seltext_m = p_0602.
  ls_fieldcat-fieldname = p_0603.
  ls_fieldcat-col_pos = lv_col.
  ls_fieldcat-no_zero = 'X'.

  IF p_0603 = 'MBLNR101' OR p_0603 = 'REJNO' OR p_0603 = 'PRUEFLOS'.
    ls_fieldcat-hotspot = 'X'.
  ENDIF.

  IF p_0603 = 'REJNO'.
    ls_fieldcat-outputlen = 12.
  ELSEIF p_0603 = 'PO_EXT' OR p_0603 = 'PR_EXT' OR p_0603 = 'GRN_EXT' OR p_0603 = 'CGRN_EXT'.
    ls_fieldcat-outputlen = 28.
  ELSEIF p_0603 = 'MATNR' OR p_0603 = 'BISMT'.
    ls_fieldcat-outputlen = 40.
  ELSEIF p_0603 = 'PRUEFLOS' .
    ls_fieldcat-outputlen = 12.
  ELSEIF p_0603 = 'REQUEST_ID'.
    ls_fieldcat-outputlen = 17.
  ENDIF.

  IF p_0603 = 'EBELN' OR p_0603 = 'EBELP' OR p_0603 = 'WERKS' .
    ls_fieldcat-key = 'X'.
  ENDIF.

  """
*SELECT SENDTOFINANCE , EBELN , EBELP FROM ZPO_HIS_REC_SEND INTO  TABLE @DATA(TAB1) WHERE EBELN IN @S_EBELN.







*  """"
*  LOOP AT it_final ASSIGNING FIELD-SYMBOL(<p>)." WHERE sendtofinance NE 'X' .
*    IF <P>-sendtofinance NE 'X'.
*      ls_fieldcat-key = '1'.
*    ENDIF.
* Performance: the authorization user lists do not depend on the column,
* so read TVARVC only once per run (was 2 SELECTs for every field catalog
* entry, i.e. ~180 identical DB hits per report execution).
  STATICS: lv_auth_init TYPE flag,
           lv_mm_user   TYPE flag,
           lv_fi_user   TYPE flag.

  IF lv_auth_init IS INITIAL.
    lv_auth_init = 'X'.

    SELECT low FROM tvarvc INTO TABLE @DATA(lt_mm_user)
      WHERE name = 'ZUSER_POHIS'.
    IF line_exists( lt_mm_user[ low = sy-uname ] ).
      lv_mm_user = 'X'.
    ENDIF.

    SELECT low FROM tvarvc INTO TABLE @DATA(lt_fi_user)
      WHERE name = 'ZUSER_POHISFI'.
    IF line_exists( lt_fi_user[ low = sy-uname ] ).
      lv_fi_user = 'X'.
    ENDIF.
  ENDIF.

  IF lv_mm_user = 'X'.

    IF p_0603 = 'SENDTOFINANCE' .
      ls_fieldcat-edit = 'X'.
      ls_fieldcat-checkbox = 'X'.
    ENDIF.

    IF p_0603 = 'SENDERNAME'.
      ls_fieldcat-edit = 'X'.
    ENDIF.

    IF p_0603 = 'REMARK_FOR_MM '.
      ls_fieldcat-edit = 'X'.
    ENDIF.

  ENDIF.

  IF lv_fi_user = 'X'.

    IF p_0603 = 'RECTOFINANCE'.
      ls_fieldcat-checkbox = 'X'.
      ls_fieldcat-edit = 'X'.
    ENDIF.

    IF p_0603 = 'RECERNAME'.
      ls_fieldcat-edit = 'X'.
    ENDIF.

    IF p_0603 = 'REMARK_FOR_FI '.
      ls_fieldcat-edit = 'X'.
    ENDIF.
  ENDIF.



  APPEND ls_fieldcat TO gt_fieldcat.
  CLEAR  ls_fieldcat.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form show_insp_remarks
*&---------------------------------------------------------------------*
*& Reads the inspection long text (QAVE / QPRUEFLOS) for the clicked
*& quality lot and shows it in a popup. Called from the PRUEFLOS hotspot,
*& so the text is fetched only on demand instead of for every row.
*&---------------------------------------------------------------------*
FORM show_insp_remarks USING p_pflos.

  DATA : c_id     TYPE thead-tdid     VALUE 'QAVE',
         c_lan    TYPE thead-tdspras  VALUE 'E',
         c_obj    TYPE thead-tdobject VALUE 'QPRUEFLOS',
         c_name   TYPE thead-tdname,
         it_lines TYPE TABLE OF tline,
         wa_lines TYPE tline.

  DATA : BEGIN OF lt_disp OCCURS 0,
           line TYPE tdline,
         END OF lt_disp.

  c_name = sy-mandt && p_pflos && 'L'.

  CALL FUNCTION 'READ_TEXT'
    EXPORTING
      id                      = c_id
      language                = c_lan
      name                    = c_name
      object                  = c_obj
    TABLES
      lines                   = it_lines
    EXCEPTIONS
      id                      = 1
      language                = 2
      name                    = 3
      not_found               = 4
      object                  = 5
      reference_check         = 6
      wrong_access_to_archive = 7
      OTHERS                  = 8.

  IF sy-subrc <> 0 OR it_lines IS INITIAL.
    MESSAGE 'No inspection remarks maintained for this lot' TYPE 'I'.
    RETURN.
  ENDIF.

  LOOP AT it_lines INTO wa_lines.
    lt_disp-line = wa_lines-tdline.
    APPEND lt_disp.
  ENDLOOP.

  CALL FUNCTION 'POPUP_WITH_TABLE_DISPLAY'
    EXPORTING
      endpos_col   = 100
      endpos_row   = 25
      startpos_col = 5
      startpos_row = 3
      titletext    = 'Inspection Remarks'
    TABLES
      valuetab     = lt_disp
    EXCEPTIONS
      break_off    = 1
      OTHERS       = 2.

ENDFORM.

FORM usrcmd USING p1 LIKE sy-ucomm
                  p2 TYPE slis_selfield.
  IF p1 = '&IC1' AND p2-fieldname = 'MBLNR101'.
    READ TABLE it_final INTO wa_final INDEX p2-tabindex.
    IF wa_final-mblnr101 IS NOT INITIAL.
*      SUBMIT zmm_gr_form_report_new WITH p_mblnr = wa_final-mblnr101
*         WITH p_mjahr = wa_final-mjahr101 AND RETURN.
      SUBMIT zmm_gr WITH p_mblnr = wa_final-mblnr101
      WITH p_mjahr = wa_final-mjahr101 AND RETURN.
    ENDIF.

  ELSEIF p1 = '&IC1' AND p2-fieldname = 'REJNO'.
    READ TABLE it_final INTO wa_final INDEX p2-tabindex.

    IF wa_final-rejno IS NOT INITIAL.
      CALL FUNCTION 'ZMM_REJECTION_PRINT'
        EXPORTING
          mblnr101   = wa_final-mblnr101
          mjahr101   = wa_final-mjahr101
          request_id = wa_final-request_id
          ebeln      = wa_final-ebeln.
*        ebelp      = wa_final-ebelp.
    ENDIF.

  ELSEIF p1 = '&IC1' AND p2-fieldname = 'PRUEFLOS'.
    READ TABLE it_final INTO wa_final INDEX p2-tabindex.
    IF wa_final-prueflos IS NOT INITIAL.
      PERFORM show_insp_remarks USING wa_final-prueflos.
    ENDIF.

  ENDIF.

  IF p1 = '&DATA_SAVE'.
*    BREAK-POINT.

    DATA(it_final1) = it_final.
*  DATA : UPTAB TYPE TABLE OF ZPO_H_S_R_STRU,
*         W_UPTAB TYPE   ZPO_H_S_R_STRU.

    DATA : uptab TYPE STANDARD TABLE OF  zpo_his_rec_send WITH HEADER LINE.

    DATA ref1 TYPE REF TO cl_gui_alv_grid.
    CALL FUNCTION 'GET_GLOBALS_FROM_SLVC_FULLSCR'
      IMPORTING
        e_grid = ref1.

    CALL METHOD ref1->check_changed_data.
    LOOP AT it_final1 ASSIGNING FIELD-SYMBOL(<fs_final1>) WHERE sendtofinance NE 'X' .


      SELECT SINGLE
 sendtofinance ,
 sentdate,
 sendername,
 userid,
 remark_for_mm
    FROM zpo_his_rec_send  INTO ( @<fs_final1>-sendtofinance , @<fs_final1>-sentdate ,
 @<fs_final1>-sendername ,
 @<fs_final1>-userid,
 @<fs_final1>-remark_for_mm
 ) WHERE ebeln = @<fs_final1>-ebeln
 AND xblnr = @<fs_final1>-xblnr
 AND ebelp = @<fs_final1>-ebelp
 AND belnr = @<fs_final1>-mblnr101.


    ENDLOOP.


    LOOP AT it_final1 ASSIGNING FIELD-SYMBOL(<fs_final2>) WHERE rectofinance NE 'X' .

      SELECT SINGLE
 rectofinance ,
 recdate,
 recername,
 recuserid,
  remark_for_fi

    FROM zpo_his_rec_send  INTO (

 @<fs_final2>-rectofinance ,
 @<fs_final2>-recdate ,
 @<fs_final2>-recername ,
 @<fs_final2>-recuserid ,
 @<fs_final2>-remark_for_fi

 ) WHERE ebeln = @<fs_final2>-ebeln
 AND xblnr = @<fs_final2>-xblnr
 AND ebelp = @<fs_final2>-ebelp
 AND belnr = @<fs_final2>-mblnr101.


    ENDLOOP.


    CALL METHOD ref1->check_changed_data.

    LOOP AT it_final1 ASSIGNING FIELD-SYMBOL(<a2>) WHERE sendtofinance = 'X' .

      MOVE-CORRESPONDING <a2> TO uptab.

      uptab-belnr = <a2>-mblnr101.
      APPEND uptab TO uptab.

    ENDLOOP.

    LOOP AT it_final1 ASSIGNING FIELD-SYMBOL(<a>) WHERE sendtofinance = 'X' AND rectofinance NE 'X'.

      IF <a>-sendername IS INITIAL.
        MESSAGE 'FILL REQUIRED FIELD' TYPE 'E'.
      ENDIF.
*        if <a>-remark_for_MM is INITIAL.
*        MESSAGE 'FILL REQUIRED FIELD' TYPE 'E'.
*        ENDIF.

      MOVE-CORRESPONDING <a> TO uptab.
      uptab-belnr = <a>-mblnr101.

      APPEND uptab TO uptab.


    ENDLOOP.
    LOOP AT uptab ASSIGNING FIELD-SYMBOL(<a4>)  WHERE sendtofinance = 'X' AND  rectofinance NE 'X'  .
      IF <a4>-sentdate IS INITIAL.
        <a4>-sentdate = sy-datum.
      ENDIF.
      IF <a4>-userid IS INITIAL.
        <a4>-userid = sy-uname.
      ENDIF.

    ENDLOOP.
    CALL METHOD ref1->check_changed_data.

    LOOP AT it_final1 ASSIGNING FIELD-SYMBOL(<a1>) WHERE rectofinance = 'X' AND  sendtofinance = 'X'.

      IF <a1>-recername IS INITIAL.
        MESSAGE 'FILL REQUIRED FIELD' TYPE 'E'.
      ENDIF.
      IF <a1>-recdate IS INITIAL.
        <a1>-recdate = sy-datum.
      ENDIF.
      IF   <a1>-recuserid IS  INITIAL.
        <a1>-recuserid = sy-uname.
      ENDIF.

      IF <a1>-sentdate IS INITIAL.
        <a1>-sentdate = sy-datum.
      ENDIF.
      IF <a1>-userid IS INITIAL.
        <a1>-userid = sy-uname.
      ENDIF.
*        if <a1>-remark_for_fi is INITIAL.
*        MESSAGE 'FILL REQUIRED FIELD' TYPE 'E'.
*        ENDIF.

      MOVE-CORRESPONDING <a1> TO uptab.
      uptab-belnr = <a1>-mblnr101.

      APPEND uptab TO uptab.


    ENDLOOP.

    LOOP AT uptab ASSIGNING FIELD-SYMBOL(<a5>)  WHERE rectofinance = 'X' AND sendtofinance NE 'X'.

      IF <a5>-recdate IS INITIAL.
        <a5>-recdate = sy-datum.
      ENDIF.
      IF <a5>-recuserid IS  INITIAL.
        <a5>-recuserid = sy-uname.
      ENDIF.

    ENDLOOP.



    MODIFY zpo_his_rec_send FROM  TABLE @uptab.
    IF sy-subrc = 0.
      MESSAGE 'Successfully Sended' TYPE 'S'.
    ENDIF.

  ENDIF.



ENDFORM.



**  IF p_cancel = 'X'.
**    DATA(it_cancel_list) = it_final[].
**    DELETE it_cancel_list WHERE canc_mark = ' '.
**  ENDIF.
**
**  IF p_rework = 'X'.
**    DATA(it_rework_list) = it_final[].
**    DELETE it_rework_list WHERE rework_mblnr = ' '.
**  ENDIF.
**
**  IF p_return = 'X'.
**    DATA(it_return_list) = it_final[].
**    DELETE it_return_list WHERE return_no = ' '.
**  ENDIF.
**
**  IF p_accept = 'X'.
**    DATA(it_accept_list) = it_final[].
**    DELETE it_accept_list WHERE vcode NS 'AC'.
**  ENDIF.
**
**  IF p_reject = 'X'.
**    DATA(it_reject_list) = it_final[].
**    DELETE it_reject_list WHERE vcode NS 'REJ'.
**  ENDIF.
**
**  IF p_pend   = 'X'.
**    DATA(it_pending_list) = it_final[].
**    DELETE it_pending_list WHERE vcode NS 'PE'.
**  ENDIF.
**
**  IF p_pjdone = 'X'.
**    DATA(it_pjdone_list) = it_final[].
**    DELETE it_pjdone_list WHERE ina_grn = ' '.
**  ENDIF.
**
**  IF p_pjnot  = 'X'.
**    DATA(it_pjnot_list) = it_final[].
**    DELETE it_pjnot_list WHERE ina_grn NE ' '.
**  ENDIF.
**
**  IF p_pvdone = 'X'.
**    DATA(it_pvdone_list) = it_final[].
**    DELETE it_pvdone_list WHERE pvn = ' '.
**  ENDIF.
**
**  IF p_pvnot  = 'X'.
**    DATA(it_pvnot_list) = it_final[].
**    DELETE it_pvnot_list WHERE pvn NE ' '.
**  ENDIF.
**
**  IF p_cancel = 'X' OR p_rework = 'X' OR p_return = 'X'
**  OR p_accept = 'X' OR p_reject = 'X' OR p_pend   = 'X'
**  OR p_pjdone = 'X' OR p_pjnot  = 'X'
**  OR p_pjnot  = 'X' OR p_pjnot  = 'X'.
**
**    REFRESH it_final.
**
**    APPEND LINES OF it_cancel_list  TO it_final.
**    APPEND LINES OF it_rework_list  TO it_final.
**    APPEND LINES OF it_return_list  TO it_final.
**
**    APPEND LINES OF it_accept_list  TO it_final.
**    APPEND LINES OF it_reject_list  TO it_final.
**    APPEND LINES OF it_pending_list TO it_final.
**
**    APPEND LINES OF it_pjdone_list  TO it_final.
**    APPEND LINES OF it_pjnot_list   TO it_final.
**
**    APPEND LINES OF it_pvdone_list  TO it_final.
**    APPEND LINES OF it_pvnot_list   TO it_final.
**
**    SORT it_final.
**    DELETE ADJACENT DUPLICATES FROM it_final COMPARING ALL FIELDS.
**  ENDIF.



******SELECT a~ebeln, a~ebelp, a~matnr, a~menge, a~meins, a~netpr,
******         a~txz01, a~banfn, a~bnfpo, a~werks, a~mwskz, a~effwr,
******         b~aedat , b~lifnr, b~ekgrp, b~bsart
******    FROM ekpo AS a
******     INNER JOIN ekko AS b ON b~ebeln = a~ebeln AND b~bstyp = 'F'
******      INTO TABLE @DATA(it_ekpo)
******       WHERE a~ebeln IN @s_ebeln AND a~werks IN @s_werks
******         AND a~matnr IN @s_matnr AND a~matnr NE ' ' AND a~loekz NOT IN ( 'S', 'L' )
******         AND b~aedat IN @s_aedat AND b~lifnr IN @s_lifnr.
******  IF sy-subrc = 0.
******    SELECT c~ebeln, c~ebelp, c~mblnr, c~mjahr, c~bwart, c~zeile, c~cancelled,
******      d~bldat,
******      e~name1, e~name2, e~stcd3,
******      y~request_id, y~mblnrz22 AS rework_mblnr,
******      x~mblnr122, x~mjahr122, x~budat122
******       FROM matdoc AS c
******        INNER JOIN mkpf AS d ON d~mblnr = c~mblnr AND d~mjahr = c~mjahr
******        INNER JOIN lfa1 AS e ON e~lifnr = c~lifnr
******        LEFT  JOIN zpo_his_rec_send AS z ON z~ebeln = c~ebeln
******         AND z~ebelp = c~ebelp AND z~belnr = c~mblnr
******        LEFT  JOIN zmmd_rwk_cds AS y ON y~mblnr101 = c~mblnr AND y~mjahr101 = c~mjahr
******        LEFT  JOIN zmmd_return_cds AS x ON x~mblnr101 = c~mblnr AND x~mjahr101 = c~mjahr
******        FOR ALL ENTRIES IN @it_ekpo
******          WHERE c~ebeln = @it_ekpo-ebeln AND c~ebelp = @it_ekpo-ebelp
******           AND  c~cancelled IN @r_cancel
******           AND  d~mblnr IN @s_mblnr      AND d~mjahr IN @s_mjahr
******           AND  d~bldat IN @s_bldat
******           AND  z~sentdate IN @f_date    AND z~recdate IN @r_date
******           AND  y~mblnrz22 IN @r_rework  INTO TABLE @DATA(it_matdoc).
******  ENDIF.
*******