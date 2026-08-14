@EndUserText.label: 'PMS Dashboard - sales by material'
// Custom entity: STRUCTURE + parameters only, NO SelectFrom - see
// ZSD_PMS_KPI.ddls.asddls's header comment for the full parameter
// rationale and DDIC-prerequisite note, which applies identically here.
//
// Top 20 materials by value, with the OD-4 GST breakdown
// (IGST/SGST/CGST/TCS - CGST is by design equal to SGST, see
// ZCL_PMS_DASH_QUERY=>get_item_tax's own header). GrandTotalValue is the
// sum of Value across every material in the filtered scope BEFORE the
// top-20 cut, denormalised onto each row so "% of total" divides by the
// true scope total, not just the top-20 subset's own sum - mirrors the
// GRN Dashboard's ty_material_row-grand_total exactly. No YoY - not shown
// by the template for this panel. Matnr's length is a best-effort guess
// (18, classic length) - verify against the real DDIC on import, newer
// systems may need 40. Bismt (old material number) mirrors that same
// best-effort length.
@ObjectModel.query.implementedBy: 'ABAP:ZCL_PMS_MATERIAL_QRY'
@UI.headerInfo: { typeName: 'Material', typeNamePlural: 'Materials' }
define custom entity ZSD_PMS_MATERIAL
  with parameters
    P_Fy       : gjahr,
    P_DateFrom : zsd_pms_date,
    P_DateTo   : zsd_pms_date,
    P_Zone     : zsd_pms_flt,
    P_State    : zsd_pms_flt,
    P_Plant    : zsd_pms_flt,
    P_Material : zsd_pms_flt,
    P_Scheme   : zsd_pms_flt,
    P_Period   : zsd_pms_flt
{
  key Matnr           : abap.char(18);
      Arktx           : abap.char(40);
      // Old material number (MARA-BISMT) - display/search convenience in the Material
      // filter only; the filter still sends Matnr as P_Material.
      Bismt           : abap.char(18);
      Uom             : abap.char(3);
      MatValue        : abap.dec(15,2);   // "Value" alone is a reserved word, same issue as KPI's "Label"
      Qty             : abap.dec(15,3);
      Igst            : abap.dec(15,2);
      Sgst            : abap.dec(15,2);
      Cgst            : abap.dec(15,2);
      Tcs             : abap.dec(15,2);
      GrandTotalValue : abap.dec(15,2);
}
