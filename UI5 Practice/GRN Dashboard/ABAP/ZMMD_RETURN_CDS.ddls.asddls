@AbapCatalog.sqlViewName: 'ZMMS_RETURN_CDS'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'RETURN NO LINK WITH GRN'
define view ZMMD_RETURN_CDS
  as select from matdoc as A
    inner join   matdoc as B on  B.lfbnr = A.mblnr
                             and B.ebeln = A.ebeln
                             and B.ebelp = A.ebelp
                             and B.bwart = '122'
{
  key A.mblnr as mblnr101,
  key A.mjahr as mjahr101,
  key A.zeile as zeile101,
  key A.ebeln as ebeln,
  key A.ebelp as ebelp,

      B.mblnr as mblnr122,
      B.mjahr as mjahr122,
      B.budat as budat122

}
where
      A.xauto = ' '
  and A.bwart = '101'
