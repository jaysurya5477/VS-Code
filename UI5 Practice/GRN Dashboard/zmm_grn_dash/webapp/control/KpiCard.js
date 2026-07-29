sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * One hero KPI tile: label, movement-type chip, big value, delta pill and a sparkline.
	 *
	 * Everything except the sparkline is plain markup; the sparkline is an EChart control
	 * in the `spark` aggregation so it keeps its own canvas lifecycle.
	 */
	return Control.extend("com.sap.zmmgrndash.control.KpiCard", {

		metadata: {
			library: "com.sap.zmmgrndash",
			properties: {
				label: {
					type: "string",
					defaultValue: ""
				},
				/** Movement types behind the figure, e.g. "101 / 102". */
				mvt: {
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
				/** accent | pos | neg | warn | alt | none - see the .grnTone--* classes. */
				deltaTone: {
					type: "string",
					defaultValue: "none"
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
				oRm.class("grnCard");
				oRm.class("grnKpiCard");
				oRm.openEnd();

				oRm.openStart("div").class("grnKpiTop").openEnd();
				oRm.openStart("div").class("grnKpiLabel").openEnd().text(oControl.getLabel()).close("div");
				if (oControl.getMvt()) {
					oRm.openStart("span").class("grnTag").openEnd().text(oControl.getMvt()).close("span");
				}
				oRm.close("div");

				oRm.openStart("div").class("grnKpiBody").openEnd();

				oRm.openStart("div").class("grnKpiFigures").openEnd();
				oRm.openStart("div").class("grnKpiValueRow").openEnd();
				oRm.openStart("div").class("grnKpiValue").openEnd().text(oControl.getValueText()).close("div");
				if (oControl.getUnit()) {
					oRm.openStart("div").class("grnKpiUnit").openEnd().text(oControl.getUnit()).close("div");
				}
				oRm.close("div");

				if (oControl.getDeltaText()) {
					oRm.openStart("div").class("grnKpiDeltaRow").openEnd();
					oRm.openStart("span")
						.class("grnKpiDelta")
						.class("grnTone--" + (oControl.getDeltaTone() || "none"))
						.openEnd()
						.text(oControl.getDeltaText())
						.close("span");
					oRm.openStart("span").class("grnKpiDeltaNote").openEnd()
						.text(oControl.getDeltaNote()).close("span");
					oRm.close("div");
				}
				oRm.close("div");

				if (oSpark) {
					oRm.openStart("div").class("grnKpiSpark").openEnd();
					oRm.renderControl(oSpark);
					oRm.close("div");
				}

				oRm.close("div");
				oRm.close("div");
			}
		}
	});
});
