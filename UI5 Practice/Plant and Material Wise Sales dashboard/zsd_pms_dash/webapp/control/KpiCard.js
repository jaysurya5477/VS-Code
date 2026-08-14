sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * One hero KPI tile: label, big value, delta pill and an optional sparkline.
	 * Adapted from the GRN Dashboard's KpiCard.js (../../GRN Dashboard/zmm_grn_dash) - the
	 * movement-type chip and always-on UoM breakdown do not apply to this dashboard, so they
	 * are replaced by a single free-text `note` line (used for the Yesterday/Month-End Sale
	 * card's "as of <date> - N invoices" context, OD-1c).
	 *
	 * Everything except the sparkline is plain markup; the sparkline is an EChart control
	 * in the `spark` aggregation so it keeps its own chart lifecycle.
	 */
	return Control.extend("com.sap.zsdpmsdash.control.KpiCard", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				label: {
					type: "string",
					defaultValue: ""
				},
				valueText: {
					type: "string",
					defaultValue: ""
				},
				unit: {
					type: "string",
					defaultValue: ""
				},
				deltaText: {
					type: "string",
					defaultValue: ""
				},
				deltaNote: {
					type: "string",
					defaultValue: ""
				},
				/** accent | pos | neg | none - see the .pmsTone--* classes. */
				deltaTone: {
					type: "string",
					defaultValue: "none"
				},
				/** Free-text context line under the delta, e.g. "as of 12 Aug 26 - 143 invoices". */
				note: {
					type: "string",
					defaultValue: ""
				}
			},
			aggregations: {
				spark: {
					type: "sap.ui.core.Control",
					multiple: false
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var oSpark = oControl.getSpark();

				oRm.openStart("div", oControl);
				oRm.class("pmsCard");
				oRm.class("pmsKpiCard");
				oRm.openEnd();

				oRm.openStart("div").class("pmsKpiTop").openEnd();
				oRm.openStart("div").class("pmsKpiLabel").openEnd().text(oControl.getLabel()).close("div");
				oRm.close("div");

				oRm.openStart("div").class("pmsKpiBody").openEnd();

				oRm.openStart("div").class("pmsKpiFigures").openEnd();
				oRm.openStart("div").class("pmsKpiValueRow").openEnd();
				oRm.openStart("div").class("pmsKpiValue").openEnd().text(oControl.getValueText()).close("div");
				if (oControl.getUnit()) {
					oRm.openStart("div").class("pmsKpiUnit").openEnd().text(oControl.getUnit()).close("div");
				}
				oRm.close("div");

				if (oControl.getDeltaText()) {
					oRm.openStart("div").class("pmsKpiDeltaRow").openEnd();
					oRm.openStart("span")
						.class("pmsKpiDelta")
						.class("pmsTone--" + (oControl.getDeltaTone() || "none"))
						.openEnd()
						.text(oControl.getDeltaText())
						.close("span");
					oRm.openStart("span").class("pmsKpiDeltaNote").openEnd()
						.text(oControl.getDeltaNote()).close("span");
					oRm.close("div");
				}
				if (oControl.getNote()) {
					oRm.openStart("div").class("pmsKpiSubNote").openEnd()
						.text(oControl.getNote()).close("div");
				}
				oRm.close("div");

				if (oSpark) {
					oRm.openStart("div").class("pmsKpiSpark").openEnd();
					oRm.renderControl(oSpark);
					oRm.close("div");
				}

				oRm.close("div");

				oRm.close("div");
			}
		}
	});
});
