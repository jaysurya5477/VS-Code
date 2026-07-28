@AbapCatalog.sqlViewName: 'ZMMS_QU_CDS'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'QUALITY TEST DETAILS FOR GRN'
define view ZMMD_QU_CDS as select from matdoc as m
 inner join qamb as a on a.mblnr = m.mblnr and a.mjahr = m.mjahr and a.zeile = m.zeile
 inner join qals as b on b.prueflos = a.prueflos
 left outer join qave as c on c.prueflos = a.prueflos
 left outer join qpct as d on d.code = c.vcode and d.codegruppe = c.vcodegrp and d.sprache = 'E'     
{  key a.prueflos, 
   key a.mblnr, 
   key a.mjahr, 
   key a.zeile, 
       a.cpudt, 
       a.cputm,
       b.insmk, 
       b.ltextkzbb, 
       b.losmenge, 
       b.lmenge01, 
       b.lmenge03, 
       b.lmenge04,
       case when d.kurztext is null or d.kurztext = '' then 'Pending' else d.kurztext end as kurztext    
   
}where m.bwart = '101' and m.xauto = ' '
