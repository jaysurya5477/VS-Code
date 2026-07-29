sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * A plain <div> with children - the layout primitive the ported panels are built on.
	 *
	 * The prototype lays everything out with CSS grid and flexbox. Rebuilding that with
	 * sap.ui.layout.Grid would change the breakpoints and the markup, so instead this
	 * control renders the bare container and css/style.css does the layout, exactly as in
	 * the prototype. `layout` picks one of the .grnGrid--* definitions; any further styling
	 * comes from class="…" in the view.
	 */
	return Control.extend("com.sap.zmmgrndash.control.Box", {

		metadata: {
			library: "com.sap.zmmgrndash",
			properties: {
				/** Grid preset: hero | quality | full | charts. Empty renders a plain div. */
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
				oRm.class("grnBox");
				if (sLayout) {
					oRm.class("grnGrid");
					oRm.class("grnGrid--" + sLayout);
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
