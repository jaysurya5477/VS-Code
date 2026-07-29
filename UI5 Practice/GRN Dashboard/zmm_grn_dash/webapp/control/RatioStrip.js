sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The four-cell ratio strip - one card divided by hairlines, as in the prototype.
	 *
	 * Data-driven rather than aggregation-driven: the cells carry no controls, the row
	 * count is fixed by the backend's Ratio entity, and a `cells` array keeps the view free
	 * of a template for four static rows.
	 *
	 * Each entry: {label, valueText, note, tone}.
	 */
	return Control.extend("com.sap.zmmgrndash.control.RatioStrip", {

		metadata: {
			library: "com.sap.zmmgrndash",
			properties: {
				cells: {
					type: "object",
					defaultValue: null
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var aCells = oControl.getCells() || [];

				oRm.openStart("div", oControl);
				oRm.class("grnCard");
				oRm.class("grnRatioStrip");
				oRm.openEnd();

				aCells.forEach(function (oCell) {
					oRm.openStart("div")
						.class("grnRatioCell")
						.class("grnTone--" + (oCell.tone || "none"))
						.openEnd();

					oRm.openStart("div").class("grnRatioLabel").openEnd().text(oCell.label || "").close("div");

					oRm.openStart("div").class("grnRatioBody").openEnd();
					oRm.openStart("span").class("grnRatioValue").openEnd().text(oCell.valueText || "").close("span");
					if (oCell.note) {
						oRm.openStart("span").class("grnRatioNote").openEnd().text(oCell.note).close("span");
					}
					oRm.close("div");

					oRm.close("div");
				});

				oRm.close("div");
			}
		}
	});
});
