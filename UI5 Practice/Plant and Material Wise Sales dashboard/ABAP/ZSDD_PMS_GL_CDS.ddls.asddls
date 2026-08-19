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
// (Numbered OD-10, not OD-9: OD-9 was already taken by the Trap-2 truncation
// cutoff decision of 2026-08-13 - see CONTEXT_LOG.md sec.6.)
//
// OD-10, decided by user 2026-08-18, revised the same day: State is the
// UNIT's own (T001W on B.WERKS -> T005U for the text), falling back to the
// BILLING plant's (T001W on A.WERKS) when the unit has no state of its own.
//
// Why it is not simply the billing plant. Zone, Unit, city and the map dot
// all come from A.VKBUR; only the state came from A.WERKS. Those two keys
// are independent, so a document billed by one plant and sold by another
// unit lands a state in a zone it has nothing to do with. Measured in
// production 2026-08-18: the East zone reported 38 billing plants across 14
// states for its 5 units, which painted Uttar Pradesh and Karnataka as East
// on the choropleth and made a Zone = East filter shade half the country.
//
// Why the fallback. Taking the unit's state alone was tried first and
// reverted, correctly: VKBUR only began this fiscal year, so FY 2025 rows
// mostly carry a blank one. Those rows would have lost their state entirely
// and dropped off the map, taking every prior-year state comparison with
// them. COALESCE keeps them exactly where they are today - shaded at their
// billing plant - while FY 2026 rows, which do have VKBUR, become
// consistent with the zone and the dot beside them.
//
// It also de-risks the join itself. If ZSD_ZONE_PLANT-WERKS turns out not
// to resolve in T001W at all (its column name is misleading - it holds one
// row per Unit), C.REGIO is simply always null and every row falls back to
// the billing plant, i.e. exactly the behaviour before this change. The
// failure mode is "no improvement", not "empty choropleth".
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
  // The UNIT's own plant master (preferred), then the BILLING plant's (fallback).
  // Both are plain field-to-field joins so the coalesce below sits only in the
  // SELECT list - no expression in an ON condition.
  left outer join t001w          as c on c.werks = b.werks
  left outer join t001w          as e on e.werks = a.werks
  left outer join t005u          as d on d.land1 = 'IN' and d.bland = c.regio and d.spras = 'E'
  left outer join t005u          as f on f.land1 = 'IN' and f.bland = e.regio and f.spras = 'E'

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

      // OD-10 (revised): the UNIT's state, falling back to the billing plant's when the
      // unit has none. See the header - the fallback is what makes this safe to activate.
      coalesce(c.regio, e.regio) as regio,
      coalesce(d.bezei, f.bezei) as state_text

}
