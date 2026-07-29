sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The prototype's flat uppercase button, for actions that live inside a panel head
	 * (currently "Reset view" on the doc-type chart).
	 *
	 * Filter-bar actions deliberately use sap.m.Button instead - only the panels are ported.
	 */
	return Control.extend("com.sap.zmmgrndash.control.Btn", {

		metadata: {
			library: "com.sap.zmmgrndash",
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
				oRm.class("grnBtn");
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
