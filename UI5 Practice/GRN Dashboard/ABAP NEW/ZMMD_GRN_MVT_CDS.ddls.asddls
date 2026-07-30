@AbapCatalog.sqlViewName: 'ZMMS_GRN_MVT_CDS'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'GRN Dashboard Oth. mov. (102, Z22)'

// Replaces the earlier ZMMD_GRN_REV_CDS (102) and ZMMD_GRN_RWK_CDS (Z22)
// views. Both of those traced each correction movement back to its
// specific originating 101 line - 102 via a MATDOC self-join on LFBNR,
// Z22 via the custom table ZMM_GR_REWORK. Neither trace is actually
// needed: the dashboard only ever aggregates these movements by
// vendor/material/plant/doc-type/date - it never needs to know which
// specific 101 a given correction belongs to (that granularity only
// matters for a line-item report like ZMM_PO_HISTORY_VER2, not for a
// dashboard that just sums things).
//
// Confirmed: Z22 rework movements are posted against the SAME
// EBELN/EBELP as the original procurement PO (not a separate rework/
// subcontract PO), so joining straight to EKPO/EKKO on the movement's
// own PO reference resolves the correct vendor/material/plant for both
// movement types, with no dependency on the custom ZMM_GR_REWORK table
// at all.
//
// NOTE: rework has no cancellation counterpart - confirmed with the
// business owner that a Z22 rework issue is never reversed, so there is
// no Z23 movement type and this view is a single SELECT (no UNION ALL,
// no storno-linkage validation needed - an earlier draft modelled a Z23
// branch validated via MATDOC's SMBLN/SJAHR/SMBLP storno fields; that
// requirement no longer exists and the branch has been removed).
//
// LBBSA_SID filtering mirrors ZMMD_GRN_DASH_CDS's 101 dedup rule, applied
// per movement type: 102 keeps the same '01'/'02'/' ' set as 101 (GR
// stock-postings, no split valuation duplicate rows); Z22 keeps '07'
// (the equivalent single relevant line for that movement type). Without
// this, MATDOC's per-valuation-area/stock-split rows would double-count
// the same physical movement on aggregation.
//
// One row = one correction movement, with BWART exposed so
// ZCL_GRN_DASH_QUERY can select/group by movement type as needed.

define view ZMMD_GRN_MVT_CDS
  as select from matdoc as c
    inner join   ekpo   as p on  p.ebeln = c.ebeln
                             and p.ebelp = c.ebelp
    inner join   ekko   as k on  k.ebeln = p.ebeln
                             and k.bstyp = 'F'
{
  key c.mblnr as mblnr,
  key c.mjahr as mjahr,
  key c.zeile as zeile,

      c.bwart as bwart,
      c.ebeln as ebeln,
      c.ebelp as ebelp,

      p.matnr as matnr,
      p.werks as werks,
      p.meins as meins,     // material base UoM - EKPO already in scope, no new join
      k.lifnr as lifnr,
      k.bsart as bsart,

      c.budat as budat,
      c.menge as menge,
      c.dmbtr as dmbtr

}
where
          c.xauto     = ' '

  and(
          c.bwart     = '102'
    and(
          c.lbbsa_sid = '01'
      or  c.lbbsa_sid = '02'
      or  c.lbbsa_sid = ' '
    )

    or(
          c.bwart     = 'Z22'
      and c.lbbsa_sid = '07'
    )
  )
