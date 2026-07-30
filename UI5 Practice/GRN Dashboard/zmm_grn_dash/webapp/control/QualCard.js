sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * One quality-bucket tile: coloured dot, bucket name, movement type, quantity, share of
	 * gross and a share bar. Ported from the prototype's second card row.
	 */
	return Control.extend("com.sap.zmmgrndash.control.QualCard", {

		metadata: {
			library: "com.sap.zmmgrndash",
			properties: {
				label: {
					type: "string",
					defaultValue: ""
				},
				mvt: {
					type: "string",
					defaultValue: ""
				},
				valueText: {
					type: "string",
					defaultValue: ""
				},
				shareText: {
					type: "string",
					defaultValue: ""
				},
				/** 0..100. Clamped on render - a share above 100 would overflow the bar. */
				sharePct: {
					type: "float",
					defaultValue: 0
				},
				/** accent | pos | neg | warn | alt | none. */
				tone: {
					type: "string",
					defaultValue: "accent"
				},
				/** Renders the figure in the negative colour (reversals, rejections). */
				negative: {
					type: "boolean",
					defaultValue: false
				},
				/**
				 * Always-on per-UoM split, regardless of the dashboard's UoM picker -
				 * array of {uom, qtyText}. Quantities are never summed across UoMs.
				 */
				breakdown: {
					type: "object",
					defaultValue: null
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var fShare = Math.max(0, Math.min(100, oControl.getSharePct() || 0));

				oRm.openStart("div", oControl);
				oRm.class("grnCard");
				oRm.class("grnQualCard");
				oRm.class("grnTone--" + (oControl.getTone() || "accent"));
				oRm.openEnd();

				oRm.openStart("div").class("grnQualTop").openEnd();
				oRm.openStart("div").class("grnQualName").openEnd();
				oRm.openStart("span").class("grnQualDot").openEnd().close("span");
				oRm.openStart("span").class("grnQualLabel").openEnd().text(oControl.getLabel()).close("span");
				oRm.close("div");
				if (oControl.getMvt()) {
					oRm.openStart("span").class("grnTag").openEnd().text(oControl.getMvt()).close("span");
				}
				oRm.close("div");

				oRm.openStart("div").class("grnQualBody").openEnd();
				oRm.openStart("div").class("grnQualValue");
				if (oControl.getNegative()) {
					oRm.class("grnQualValue--neg");
				}
				oRm.openEnd().text(oControl.getValueText()).close("div");
				oRm.openStart("div").class("grnQualShare").openEnd().text(oControl.getShareText()).close("div");
				oRm.close("div");

				oRm.openStart("div").class("grnBar").openEnd();
				oRm.openStart("div").class("grnBarFill").style("width", fShare + "%").openEnd().close("div");
				oRm.close("div");

				var aBreakdown = oControl.getBreakdown();
				if (aBreakdown && aBreakdown.length) {
					oRm.openStart("div").class("grnUomBreakdown").openEnd();
					aBreakdown.forEach(function (oRow) {
						oRm.openStart("div").class("grnUomRow").class("grnUomRow--flat").openEnd();
						oRm.openStart("span").class("grnUomCode").openEnd().text(oRow.uom || "").close("span");
						oRm.openStart("span").class("grnUomQty").openEnd().text(oRow.qtyText || "").close("span");
						oRm.close("div");
					});
					oRm.close("div");
				}

				oRm.close("div");
			}
		}
	});
});
