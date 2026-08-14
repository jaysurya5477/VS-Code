sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The prototype's flat uppercase button, for actions that live inside a panel head.
	 * Ported from the GRN Dashboard's Btn.js (../../GRN Dashboard/zmm_grn_dash).
	 *
	 * Filter-bar actions deliberately use sap.m.Button instead - only the panels are ported.
	 */
	return Control.extend("com.sap.zsdpmsdash.control.Btn", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				text: {
					type: "string",
					defaultValue: ""
				}
			},
			events: {
				press: {}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var sTooltip = oControl.getTooltip_AsString();

				oRm.openStart("button", oControl);
				oRm.class("pmsBtn");
				oRm.attr("type", "button");
				if (sTooltip) {
					oRm.attr("title", sTooltip);
				}
				oRm.openEnd();
				oRm.text(oControl.getText());
				oRm.close("button");
			}
		},

		onclick: function () {
			this.firePress();
		}
	});
});
