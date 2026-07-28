@EndUserText.label : 'GR Rework Material Table'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #ALLOWED
define table zmm_gr_rework {
  key mandt        : mandt not null;
  key request_id   : zrequest_id not null;
  key rework_mblnr : zreworkmb not null;
  key rework_mjahr : zreworkmj not null;
  key ebeln        : ebeln not null;
  key ebelp        : ebelp not null;
  rej_mblnr        : zrjmblnr;
  mblnr            : mblnr;
  mjahr            : mjahr;
  reversed_mblnr   : zrevno;
  reversed_mjahr   : zrevyear;
  new_trnno        : znewtr_no;
  new_retno        : znewrt_no;

}