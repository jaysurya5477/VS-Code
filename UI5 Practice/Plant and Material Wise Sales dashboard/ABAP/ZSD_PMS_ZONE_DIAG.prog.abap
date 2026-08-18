*&---------------------------------------------------------------------*
*& Report ZSD_PMS_ZONE_DIAG
*&---------------------------------------------------------------------*
*& Plant & Material Wise Sales Dashboard - growth-indicator diagnostic.
*&
*& WHY THIS EXISTS
*& Selecting a Zone on the dashboard turns every growth pill into a
*& nonsense figure (+18285.8%, +7604.1%), while the same pills are
*& sensible with no Zone filter (-56.9%, -19.5%). The percentage itself
*& is computed in ZCL_PMS_DASH_QUERY=>pct( ) as
*& (curr - prior) / abs( prior ) * 100, so a five-digit result means one
*& thing only: PRIOR is tiny relative to CURR. This report shows whether
*& that is real, and if so why.
*&
*& THE HYPOTHESIS IT TESTS
*& ALM_ZONE reaches the fact via ZSDD_PMS_GL_CDS's LEFT OUTER join to
*& ZSD_ZONE_PLANT on A.VKBUR. A document whose sales office has no row in
*& that table gets a NULL zone, and "alm_zone IN @is_filters-zone" then
*& excludes it. If last year used sales offices that are no longer
*& maintained, the prior-year side of every zone-filtered comparison
*& collapses while the current-year side survives - so the dashboard
*& compares this year's zone against almost nothing.
*&
*& HOW TO READ IT
*& Section 1 is the arithmetic behind the pill. If PRIOR GROSS is small
*& and section 2 shows unmapped prior-year sales offices carrying real
*& value, the diagnosis is confirmed and the fix is master data:
*& maintain those VKBURs in ZSD_ZONE_PLANT.
*& If section 1 shows a HEALTHY prior that the dashboard is not using,
*& the fault is in the code path instead - say so, because that is a
*& different bug from the one this report was written for.
*&
*& Read-only. No updates, no locks, safe to run in production.
*&---------------------------------------------------------------------*
REPORT zsd_pms_zone_diag.

TABLES: zsd_sale_all.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_fy TYPE gjahr OBLIGATORY.
  " Type this exactly as the dashboard sends it - the value shown in the
  " Zone dropdown, e.g. Central. Leave blank to report every zone.
  PARAMETERS: p_zone TYPE char10.
SELECTION-SCREEN END OF BLOCK b1.

START-OF-SELECTION.

  DATA(lv_prior_fy) = CONV gjahr( p_fy - 1 ).

  DATA: lt_zone TYPE RANGE OF char10.
  IF p_zone IS NOT INITIAL.
    APPEND VALUE #( sign = 'I' option = 'EQ' low = p_zone ) TO lt_zone.
  ENDIF.

*&---------------------------------------------------------------------*
*& 1. The arithmetic behind the growth pill
*&---------------------------------------------------------------------*
  WRITE: / '=== 1. CURRENT vs PRIOR, as the growth pill sees them ==='.
  SKIP.
  WRITE: /  2 'FY', 12 'ZONE FILTER', 30 'ROWS', 45 'NET', 70 'TAX', 95 'GROSS'.
  ULINE.

  DATA: lv_rows  TYPE i,
        lv_net   TYPE p LENGTH 15 DECIMALS 2,
        lv_tax   TYPE p LENGTH 15 DECIMALS 2,
        lv_gross TYPE p LENGTH 15 DECIMALS 2,
        lv_curr  TYPE p LENGTH 15 DECIMALS 2,
        lv_prior TYPE p LENGTH 15 DECIMALS 2.

  " Both years, with and without the zone restriction, so the collapse is
  " visible as a single before/after pair rather than inferred.
  DO 4 TIMES.
    DATA(lv_i)        = sy-index.
    DATA(lv_this_fy)  = COND gjahr( WHEN lv_i <= 2 THEN p_fy ELSE lv_prior_fy ).
    DATA(lv_use_zone) = xsdbool( lv_i = 2 OR lv_i = 4 ).

    DATA: lt_use_zone TYPE RANGE OF char10.
    CLEAR lt_use_zone.
    IF lv_use_zone = abap_true.
      lt_use_zone = lt_zone.
    ENDIF.

    SELECT COUNT( * ) AS rows, SUM( netwr ) AS netwr, SUM( mwsbk ) AS mwsbk
      FROM zsdd_pms_gl_cds
      WHERE gjahr    = @lv_this_fy
        AND alm_zone IN @lt_use_zone
      INTO ( @lv_rows, @lv_net, @lv_tax ).

    lv_gross = lv_net + lv_tax.

    WRITE: /  2 lv_this_fy,
             12 COND string( WHEN lv_use_zone = abap_true AND p_zone IS NOT INITIAL
                             THEN p_zone ELSE '(none)' ),
             30 lv_rows,
             45 lv_net,
             70 lv_tax,
             95 lv_gross.

    " Keep the two zone-filtered figures - they are the pill's own inputs.
    IF lv_use_zone = abap_true.
      IF lv_i = 2.
        lv_curr = lv_gross.
      ELSE.
        lv_prior = lv_gross.
      ENDIF.
    ENDIF.
  ENDDO.

  ULINE.
  IF lv_prior = 0.
    WRITE: / 'PRIOR GROSS is ZERO -> pct( ) returns 100, which the pill prints as "+100.0%".'.
  ELSE.
    WRITE: / 'Growth the dashboard will show:',
             COND string( WHEN lv_prior <> 0
                          THEN |{ ( lv_curr - lv_prior ) / abs( lv_prior ) * 100 DECIMALS = 1 }%| ).
    WRITE: / 'Ratio curr : prior =',
             COND string( WHEN lv_prior <> 0 THEN |{ lv_curr / lv_prior DECIMALS = 1 }x| ).
  ENDIF.

*&---------------------------------------------------------------------*
*& 2. Sales offices with no ZSD_ZONE_PLANT row
*&---------------------------------------------------------------------*
  SKIP 2.
  WRITE: / '=== 2. Sales offices (VKBUR) missing from ZSD_ZONE_PLANT ==='.
  WRITE: / 'These rows have a NULL zone, so ANY zone filter excludes them.'.
  SKIP.
  WRITE: /  2 'FY', 12 'VKBUR', 25 'ROWS', 40 'GROSS EXCLUDED'.
  ULINE.

  " Straight off the base table, not the CDS: VKBUR is deliberately not
  " exposed as an output field of ZSDD_PMS_GL_CDS (it would duplicate
  " b.werks), so the gap can only be seen here.
  SELECT a~gjahr, a~vkbur,
         COUNT( * )                        AS rows,
         SUM( a~netwr + a~mwsbk )          AS gross
    FROM zsd_sale_all AS a
    LEFT OUTER JOIN zsd_zone_plant AS b ON b~werks = a~vkbur
    WHERE a~gjahr IN ( @p_fy, @lv_prior_fy )
      AND b~werks IS NULL
    GROUP BY a~gjahr, a~vkbur
    ORDER BY a~gjahr, a~vkbur
    INTO TABLE @DATA(lt_gap).

  IF lt_gap IS INITIAL.
    WRITE: / 'None - every sales office in both years is mapped.'.
    WRITE: / 'The zone gap is NOT the cause. Report this, it points elsewhere.'.
  ELSE.
    LOOP AT lt_gap INTO DATA(ls_gap).
      WRITE: /  2 ls_gap-gjahr, 12 ls_gap-vkbur, 25 ls_gap-rows, 40 ls_gap-gross.
    ENDLOOP.
    ULINE.
    WRITE: / 'Any row listed under FY', lv_prior_fy,
             'is prior-year value that every zone-filtered comparison silently drops.'.
  ENDIF.

*&---------------------------------------------------------------------*
*& 3. Which zones each year actually resolves to
*&---------------------------------------------------------------------*
  SKIP 2.
  WRITE: / '=== 3. Zones present per year ==='.
  WRITE: / 'A zone with rows this year but none last year cannot be compared.'.
  SKIP.
  WRITE: /  2 'FY', 12 'ZONE', 30 'ROWS', 45 'GROSS'.
  ULINE.

  SELECT gjahr, alm_zone,
         COUNT( * )               AS rows,
         SUM( netwr + mwsbk )     AS gross
    FROM zsdd_pms_gl_cds
    WHERE gjahr IN ( @p_fy, @lv_prior_fy )
    GROUP BY gjahr, alm_zone
    ORDER BY gjahr, alm_zone
    INTO TABLE @DATA(lt_zones).

  LOOP AT lt_zones INTO DATA(ls_z).
    WRITE: /  2 ls_z-gjahr,
             12 COND string( WHEN ls_z-alm_zone IS INITIAL THEN '(blank)' ELSE ls_z-alm_zone ),
             30 ls_z-rows,
             45 ls_z-gross.
  ENDLOOP.
