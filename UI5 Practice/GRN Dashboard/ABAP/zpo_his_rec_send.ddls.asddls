@EndUserText.label : 'PO RECIEVED AND SENDER'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #DISPLAY
define table zpo_his_rec_send {
  key mandt     : mandt not null;
  key ebeln     : ebeln not null;
  key xblnr     : xblnr not null;
  key ebelp     : ebelp not null;
  key belnr     : belnr_d not null;
  request_id    : request_id;
  @EndUserText.label : 'SEND TO FINANCE'
  sendtofinance : abap.char(1);
  sentdate      : datum;
  @EndUserText.label : 'SENDER NAME'
  sendername    : abap.char(30);
  userid        : uname;
  @EndUserText.label : 'REMARK MM'
  remark_for_mm : abap.char(150);
  @EndUserText.label : 'REC TO FINANCE'
  rectofinance  : abap.char(1);
  recdate       : edate;
  @EndUserText.label : 'REC NAME'
  recername     : abap.char(30);
  recuserid     : uname;
  @EndUserText.label : 'REMARK FI'
  remark_for_fi : abap.char(150);

}