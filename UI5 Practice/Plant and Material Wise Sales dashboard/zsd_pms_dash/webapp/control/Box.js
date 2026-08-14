sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * A plain <div> with children - the layout primitive the ported panels are built on.
	 * Ported from the GRN Dashboard's Box.js (../../GRN Dashboard/zmm_grn_dash).
	 *
	 * `layout` picks one of the .pmsGrid--* definitions; any further styling comes from
	 * class="..." in the view.
	 */
	return Control.extend("com.sap.zsdpmsdash.control.Box", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				/** Grid preset: hero | full | charts. Empty renders a plain div. */
				layout: {
					type: "string",
					defaultValue: ""
				}
			},
			defaultAggregation: "items",
			aggregations: {
				items: {
					type: "sap.ui.core.Control",
					multiple: true,
					singularName: "item"
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var sLayout = oControl.getLayout();

				oRm.openStart("div", oControl);
				oRm.class("pmsBox");
				if (sLayout) {
					oRm.class("pmsGrid");
					oRm.class("pmsGrid--" + sLayout);
				}
				oRm.openEnd();

				oControl.getItems().forEach(function (oItem) {
					oRm.renderControl(oItem);
				});

				oRm.close("div");
			}
		}
	});
});
