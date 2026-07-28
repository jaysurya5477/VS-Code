@AbapCatalog.sqlViewName: 'ZMMS_PYVC_CDS'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'PAYMENT VOUCHER USING AWKEY'
define view ZMMD_PYVC_CDS as select from ekbe as z
inner join bseg as a on a.awkey = concat( z.belnr, z.gjahr ) 
 and a.buzei = '001'  // and a.augbl <> ' '
inner join bkpf as b on b.belnr = a.belnr and b.gjahr = a.gjahr
 and b.xreversal = ' ' and b.awref_rev = ' '
{  
   key z.ebeln as ebeln,
   key z.ebelp as ebelp,
   key z.belnr as belnr_fin,
   key z.gjahr as gjahr_fin,
   key z.buzei as buzei,
       z.lfbnr as lfbnr,  // mblnr101
       z.lfgja as lfgja,  // mjahr101
       z.lfpos as lfpos,  // zeile101
       z.budat as budat,
       z.dmbtr as dmbtr,
   
       a.awkey as awkey,
             
       left(a.awkey, 10) as belnr,       
       concat( z.lfbnr, z.lfgja ) as awkey_gr,
       
       a.belnr as fina_grn,
       a.gjahr as gjahr,
       a.augbl as pvn, 
       a.auggj as pvn_year,
       a.augdt as pd         
      
}where z.vgabe = '2' and z.bewtp = 'Q' and z.shkzg = 'S'



// left outer join ekbe as j on j.ebeln = c.ebeln and j.ebelp = c.ebelp
 //  and j.lfbnr = c.mblnr and j.lfgja = c.gjahr and j.lfpos = c.zeile
 // and j.buzei = c.zeile and j.vgabe = '2' and j.bewtp = 'Q'
