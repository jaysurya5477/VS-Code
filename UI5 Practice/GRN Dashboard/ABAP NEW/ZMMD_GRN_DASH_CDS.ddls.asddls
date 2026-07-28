@AbapCatalog.sqlViewName: 'ZMMS_GDASH_CDS'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'GRN Dashboard - core 101 fact (lean, no auth check)'

// Rebuilds the join logic already proven in ZMMD_PO_CDS / ZMM_PO_HISTORY_VER2,
// trimmed to only what the GRN Dashboard needs (see GRN Dashboard FS.md §6.1):
//   KEPT : EKPO + EKKO(F) + MATDOC(101) + LFA1 + T161T + ZMMD_QU_CDS
//   DROPPED vs. ZMMD_PO_CDS : MKPF (bldat unused), T024 (ekgrp/eknam unused -
//     no purchasing-group filter/chart in this dashboard), MARA (bismt unused),
//     ZMMD_RETURN_CDS / ZMMD_PYVC_CDS / ZPO_HIS_REC_SEND (out of scope, §2),
//     MATDOC bwart-313 transfer join (unused), ZMMD_RWK_CDS rework linkage
//     (deliberately NOT embedded here - see ZMMD_GRN_RWK_CDS header comment
//     for why: embedding a 1:N rework relationship into this flat 101-line
//     view would fan out and double-count GRN qty/value on aggregation).
//
// 102 (GR reversal) and Z22/Z23 (rework) are intentionally NOT part of this
// view either - see ZMMD_GRN_REV_CDS and ZMMD_GRN_RWK_CDS, queried
// independently by ZCL_GRN_DASH_QUERY and combined in ABAP, each keyed to
// its own posting date so the trend chart can bucket a reversal/rework
// event in the month it actually posted (which can differ from the
// original 101's month).

define view ZMMD_GRN_DASH_CDS as

select from ekpo   as a
  inner join ekko   as b on b.ebeln = a.ebeln and b.bstyp = 'F'
  inner join matdoc as c on c.ebeln = a.ebeln and c.ebelp = a.ebelp
   and c.bwart = '101' and c.xauto = ' '
   and ( c.lbbsa_sid = '01' or c.lbbsa_sid = '02' or c.lbbsa_sid = ' ' )

  left outer join lfa1        as g on g.lifnr = c.lifnr
  left outer join ZMMD_QU_CDS as i on i.mblnr = c.mblnr and i.mjahr = c.mjahr and i.zeile = c.zeile
  inner join t161t as m on m.bsart = b.bsart and m.spras = 'E' and m.bstyp = 'F'

{
  key a.ebeln       as ebeln,
  key a.ebelp       as ebelp,

  key c.mblnr       as mblnr101,
  key c.mjahr       as mjahr101,
  key c.zeile       as zeile101,

      a.matnr       as matnr,
      a.txz01       as txz01,
      a.werks       as werks,

      b.lifnr       as lifnr,
      b.bsart       as bsart,

      c.menge       as menge2,     // GRN qty (101)
      c.dmbtr       as dmbtr,      // GRN value (101)
      c.budat       as budat101,   // GRN posting date - drives Year/Month/Date filters
      c.kostl       as kostl,      // needed for the Accepted/Rejected cost-center fallback rule (FS §7.3)

      g.name1       as name1,

      i.kurztext    as kurztext,   // 'Pending' default when no UD/QAVE code exists yet
      i.losmenge    as losmenge,
      i.lmenge01    as lmenge01,
      i.lmenge03    as lmenge03,
      i.lmenge04    as lmenge04,

      m.batxt       as batxt

}
where a.matnr <> ' '
