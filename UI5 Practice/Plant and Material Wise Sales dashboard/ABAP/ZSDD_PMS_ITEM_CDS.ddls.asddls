@AbapCatalog.sqlViewName: 'ZSDD_PMS_ITM'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'PMS Dashboard - item-grain material fact'

// Item-grain fact view: one row per billing item (VBELN/POSNR). Feeds the
// Sales-by-material panel only. Independent of ZSDD_PMS_GL_CDS on purpose -
// see that view's header comment and ABAP_Backend_Plan.md sec.A4 Trap 1.
//
// PRCD_ELEMENTS is deliberately NOT joined into this view, even though the
// per-item GST it carries (OD-4) is what this fact exists to serve. A
// naive join would fan this view out to one row per item PER MATCHING
// CONDITION TYPE (an item can have an IGST row, an SGST row, several TCS
// rows, ...), turning a clean one-row-per-item grain back into the same
// kind of multi-row-per-key mess Trap 1 exists to avoid - just one level
// down. Mirrors GRN Dashboard's own precedent (ZMMD_GRN_DASH_CDS keeps
// 102/Z22 correction movements OUT of its base view for the identical
// reason - see that file's header comment).
// Instead, ZCL_PMS_DASH_QUERY queries PRCD_ELEMENTS directly and pivots
// IGST/SGST/TCS per VBELN+POSNR in ABAP (get_item_tax()), reproducing
// ZFI_SR_NEW_OPT.abap's get_line_item_data FORM. That method is also where
// the reference program's known edge case is handled: a SAP posting error
// can create two finance documents for the same invoice line, so the tax
// lookup is keyed VBELN+POSNR+MATNR, never BELNR (this view has no BELNR
// at all, so that ambiguity cannot leak in here regardless).
//
// NOTE:Field types are best-effort - see ZSDD_PMS_GL_CDS's header for why, and
// verify against live DDIC before activation. KNUMV_ANA is carried through
// specifically so ZCL_PMS_DASH_QUERY can join PRCD_ELEMENTS on it without a
// second round-trip to VBRP.
define view ZSDD_PMS_ITEM_CDS as

select from vbrp as a
  inner join vbrk as b on b.vbeln = a.vbeln
  left outer join mara as c on c.matnr = a.matnr

{
  key a.vbeln        as vbeln,
  key a.posnr        as posnr,

      a.aubel        as aubel,       // sales order reference
      a.matnr        as matnr,
      a.arktx        as arktx,       // material description as billed
      a.werks        as werks,
      a.fkimg        as fkimg,       // billed quantity
      a.vrkme        as vrkme,       // sales unit
      a.netwr        as netwr,       // item net value (pre-tax) - confirm this is the right field via P0-1
      a.knumv_ana    as knumv_ana,   // pricing/condition doc number - the join key into PRCD_ELEMENTS (OD-4)

      b.fkart        as fkart,       // billing type - credit-memo exclusion, mirrors template's F2/G2 (P0-2)
      b.fkdat        as fkdat,       // billing date
      b.gjahr        as gjahr,       // fiscal year the item belongs to - confirm source (derived from fkdat vs. stored)

      c.matkl        as matkl       // material group

}
where a.matnr <> ' '
