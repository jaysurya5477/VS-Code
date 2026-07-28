@AbapCatalog.sqlViewName: 'ZMMS_PO_CDS'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'P.O. CDS VIEW'
define view ZMMD_PO_CDS as 
select from ekpo   as a 
 inner join ekko   as b on b.ebeln = a.ebeln and b.bstyp = 'F'
 inner join matdoc as c on c.ebeln = a.ebeln and c.ebelp = a.ebelp
  and c.bwart = '101' and c.xauto = ' ' and ( c.lbbsa_sid = '01' or c.lbbsa_sid = '02' or c.lbbsa_sid = ' ' )
  
 left outer join mkpf as d on d.mblnr = c.mblnr and d.mjahr = c.mjahr
 
 left outer join ZMMD_RWK_CDS    as e on e.mblnr101 = c.mblnr and e.mjahr101 = c.mjahr 
  and e.zeile101 = c.zeile and e.ebeln = c.ebeln and e.ebelp = c.ebelp
  
 left outer join ZMMD_RETURN_CDS as f on f.mblnr101 = c.mblnr and f.mjahr101 = c.mjahr
  and f.zeile101 = c.zeile and f.ebeln = c.ebeln and f.ebelp = c.ebelp
  
 left outer join lfa1             as g on g.lifnr = c.lifnr
 
 left outer join zpo_his_rec_send as h on h.ebeln = c.ebeln
         and h.ebelp = c.ebelp and h.belnr = c.mblnr
         
 left outer join ZMMD_QU_CDS as i on i.mblnr = c.mblnr and i.mjahr = c.mjahr and i.zeile = c.zeile
 
 // left outer join ekbe as j on j.ebeln = c.ebeln and j.ebelp = c.ebelp
 //  and j.lfbnr = c.mblnr and j.lfgja = c.gjahr and j.lfpos = c.zeile
 // and j.buzei = c.zeile and j.vgabe = '2' and j.bewtp = 'Q'

 left outer join ZMMD_PYVC_CDS as k on k.ebeln = c.ebeln and k.ebelp = c.ebelp
  and k.lfbnr = c.mblnr and k.lfgja = c.mjahr 
  and k.lfpos = c.zeile 
  
   // k.awkey = concat( j.belnr, j.gjahr ) 
 
 inner join t024   as l on l.ekgrp = b.ekgrp
 inner join t161t  as m on m.bsart = b.bsart and m.spras = 'E' and m.bstyp = 'F'
 inner join mara   as n on n.matnr = a.matnr
 
 left outer join matdoc as o on o.ebeln = a.ebeln and o.ebelp = a.ebelp 
  and o.xauto = 'X' and o.bwart = '313' and o.lfbnr = c.mblnr
  
 // left outer join ekkn as p on p.ebeln = a.ebeln and p.ebelp = a.ebelp
 // and p.kostl <> ' '
 
 { key a.ebeln as ebeln,
   key a.ebelp as ebelp,
   
   key c.mblnr as mblnr101,
   key c.mjahr as mjahr101,
   key c.zeile as zeile101,
   
       a.matnr as matnr,
       a.menge as menge, 
       a.meins as meins,
       a.netpr as netpr,
       a.txz01 as txz01, 
       a.banfn as banfn,
       a.bnfpo as bnfpo,
       a.werks as werks,
       a.lgort as lgort,
       a.mwskz as mwskz,
       a.effwr as effwr,
       a.loekz as loekz,
       
       b.aedat as aedat,
       b.lifnr as lifnr,
       b.ekgrp as ekgrp,
       b.bsart as bsart,
       
       c.menge as menge2, // grn qty
       c.dmbtr as dmbtr,
       c.bwart as bwart,
       c.budat as budat101,
       c.xblnr as xblnr,
       c.cpudt as cpudt,
       c.cancelled as canc_mark, 
       c.xauto as xauto,
       c.lbbsa_sid as lbbsa_sid,
       c.kostl as kostl,
       cast( rpad( concat( c.mblnr, c.mjahr ), 20, ' ' ) as abap.char(20) ) as awkey_101,
              
       d.bldat as bldat,
       
       e.mblnrz22 as rework_mblnr,
       e.mjahrz22 as rework_mjahr,
       e.request_id as request_id,
       
       f.mblnr122 as mblnr122,
       f.mjahr122 as mjahr122,
       f.budat122 as budat122,
       
       g.name1    as name1,
       g.name2    as name2,
       g.stcd3    as stcd3,

       h.xblnr as xblnr_hs,
       h.request_id as reqid_hs,
       h.sendtofinance as sendtofinance,
       h.sentdate as sentdate,
       h.sendername as sendername,
       h.userid as userid,
       h.remark_for_mm as remark_for_mm,
       h.rectofinance as rectofinance,
       h.recdate as recdate,
       h.recername as recername,
       h.recuserid as recuserid,
       h.remark_for_fi as remark_for_fi,
       
       i.prueflos as prueflos,
       i.cpudt    as cpudt2,
       i.cputm    as cputm,
       i.insmk    as insmk,
       i.ltextkzbb as ltextkzbb,
       i.losmenge as losmenge,
       i.lmenge01 as lmenge01,
       i.lmenge03 as lmenge03,
       i.lmenge04 as lmenge04,
       i.kurztext as kurztext,
       
       case when k.belnr is null or k.belnr = ' ' then '0000000000' else k.belnr end as inv_grn,     
//       k.belnr as inv_grn, 
       k.budat as inv_date, 
       k.dmbtr as inv_amt,
       concat(k.belnr, k.gjahr) as awkey,
       
       case when k.pvn is null or k.pvn = ' ' then '0000000000' else k.pvn end as pvn,    
//       k.pvn   as pvn,
       k.pvn_year as pvn_year,
       k.fina_grn as fina_grn,
       k.pd    as pd,       
       
       l.eknam as eknam,
       m.batxt as batxt,
       n.bismt as bismt,
       
       o.mblnr as mblnr313,
       o.budat as budat313,
       o.lgort as lgort313
       
//      p.kostl as kostl
       
}where a.matnr <> ' ' // and a.loekz <> 'S' and a.loekz <> 'L'
