@AbapCatalog.sqlViewName: 'ZSDD_PMS_GL'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'PMS Dashboard - GL-grain sales fact'

// GL-grain fact view (see ABAP_Backend_Plan.md sec.A4 Trap 1): one row per
// ZSD_SALE_ALL line, keyed BELNR/GJAHR/HKONT - i.e. one row per GL account
// line, NOT one row per billing document (VBELN can repeat many times).
// Feeds every panel EXCEPT the material/quantity ones: 4 KPI cards, the
// India map (choropleth + Unit dots), Scheme performance, Sales-by-plant.
//
// Material is deliberately NOT joined onto this view - ZSD_SALE_ALL carries
// no MATNR, and joining VBRP/PRCD_ELEMENTS here would fan this view out to
// item grain and double-count every net/tax/gross figure. Material lives in
// the independent ZSDD_PMS_ITEM_CDS instead (OD-4). The two are reconciled
// in ZCL_PMS_DASH_QUERY only when a Material filter is active, via
// PRCD_ELEMENTS.sakn1 <-> this view's HKONT - see that class's
// resolve_material_gl_keys() for the mechanism and its caveats.
//
// Geography is unit-based - no KNA1/customer join. Zone, city, Unit (OD-3),
// and the two new lat/lon fields (OD-5, pending - the user is adding them to
// ZSD_ZONE_PLANT) all come from that table, LEFT OUTER because production
// plants have been seen missing a zone row (see CONTEXT_LOG.md sec.3
// "zone gap" - re-check via P0-0 before going live).
//
// OD-8, confirmed by user 2026-08-13: the join to ZSD_ZONE_PLANT is on
// A.VKBUR (sales office), NOT A.WERKS (billing plant) - VKBUR is the real
// Unit-grouping key, and ZSD_ZONE_PLANT.WERKS (despite its name) holds one
// row per Unit, not per billing plant. A.VKBUR is therefore not exposed as
// its own output field below (would just duplicate B.WERKS/"unit").
//
// OD-9, decided by user 2026-08-18: State comes from the UNIT's own master
// record (T001W on B.WERKS -> T005U for the text), not from the billing
// plant. It was C.WERKS = A.WERKS until now, which meant the choropleth was
// painted from A.WERKS while the map dots, zone and city beside it all came
// from A.VKBUR. The two keys disagree whenever a document is billed by one
// plant and sold by another unit - a material billed at 2000 HQ (Uttar
// Pradesh) but sold through the eastern units shaded UP while its dots sat
// on Ranchi and Bhubaneswar. One join key now feeds shading, dots and zone
// alike. Consequence to watch (P0-0): a row whose VKBUR has no
// ZSD_ZONE_PLANT entry now has no state either, so it drops off the
// choropleth instead of being shaded at its billing plant. Such a row
// already had no dot and no zone, but it did previously carry a state.
//
// OD-5 field spec: create both new ZSD_ZONE_PLANT fields as DEC(10,7) - one
// shared domain for both, even though latitude only needs 2 integer digits
// (-90..90) vs longitude's 3 (-180..180). Sign is stored separately by the
// DEC DDIC type and does not consume LENGTH digits, so DEC(10,7) covers the
// full -180.0000000..180.0000000 range. 7 decimals (~1.1cm precision) is far
// more than a country-scale map dot needs, but matches what a human will
// actually paste in from Google Maps (6-7 decimals by default) with no
// truncation. Do not use DECFLOAT - no chained float math is done on these,
// and DEC matches the rest of this table's existing fields.
//
// NOTE:Field types below are best-effort, chosen to match the source tables as
// closely as could be determined without live DDIC access (see
// CONTEXT_LOG.md sec.7 for why - client-100 credentials not yet set up).
// CATEGORY's type is the one exception with a confirmed real source:
// ZFI_SALES_GL-CATEGORY, taken directly from the reference program
// ZFI_SR_NEW_OPT.abap (see OD-4). Verify every other field's type against
// the actual DDIC on import and adjust before activation.
define view ZSDD_PMS_GL_CDS as

select from zsd_sale_all as a
  left outer join zsd_zone_plant as b on b.werks = a.vkbur
  left outer join t001w          as c on c.werks = a.werks
  left outer join t005u          as d on d.land1 = 'IN' and d.bland = c.regio and d.spras = 'E'

{
  key a.belnr        as belnr,
  key a.gjahr        as gjahr,
  key a.hkont        as hkont,

      a.vbeln        as vbeln,
      a.fkart        as fkart,
      a.vtext        as vtext,
      a.category     as category,     // scheme dimension (OD-4: ZFI_SALES_GL-CATEGORY)
      a.cat_desc     as cat_desc,
      a.type         as type,         // template's F2/G2 credit-memo flag - confirm real values via P0-2
      a.month_num    as month_num,    // OD-7: plain calendar month (Apr=04..Dec=12,Jan=01..Mar=03),
                                       // confirmed live 2026-08-13 - NOT already FY-shifted (Apr=1).
                                       // ZCL_PMS_DASH_QUERY=>get_gl_rows converts to FY-period on read.
      a.zmonth       as zmonth,
      a.budat        as budat,        // date-range/month filters + the Yesterday Sale KPI (OD-1c)

      a.netwr        as netwr,
      a.mwsbk        as mwsbk,
      a.gross        as gross,

      a.kunnr        as kunnr,
      a.kname        as kname,
      a.werks        as werks,
      // a.vkbur        as vkbur,      // OD-8: used only as the join key above (B.WERKS = A.VKBUR) - not exposed as its own column, see header comment

      b.alm_zone     as alm_zone,
      b.werks        as unit,          // OD-3: map-dot aggregation key, not werks. 18 units in production (P0-7)
      b.remarks      as city,
      b.latitude     as latitude,      // OD-5: new field, business-maintained - does not exist yet, pending P0-10. Recommended DDIC type: DEC(10,7) - see below
      b.longitude    as longitude,     // OD-5: new field, business-maintained - does not exist yet, pending P0-10. Recommended DDIC type: DEC(10,7) - see below

      c.regio        as regio,
      d.bezei        as state_text

}
