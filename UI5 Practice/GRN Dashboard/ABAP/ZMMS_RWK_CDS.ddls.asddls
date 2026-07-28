@AbapCatalog.sqlViewName: 'ZMMS_RWK_CDS'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'REWORK LINK WITH GRN AND GATEPASS'
define view ZMMD_RWK_CDS as select from 
matdoc as A 
inner join matdoc as B on B.lfbnr = A.mblnr and B.bwart = 'Z22' and B.xauto = ' '
and B.ebeln = A.ebeln and B.ebelp = A.ebelp
inner join zmm_gr_rework as C on C.rework_mblnr = B.mblnr and C.mjahr = B.mjahr and C.ebelp = B.ebelp
{ key A.mblnr as mblnr101,
  key A.mjahr as mjahr101, 
  key A.zeile as zeile101,
  key A.ebeln as ebeln,
  key A.ebelp as ebelp,
      B.mblnr as mblnrz22,
      B.mjahr as mjahrz22,
      
      C.request_id as request_id
    
} where A.xauto = ' ' and A.bwart = '101'
