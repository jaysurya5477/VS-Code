sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The prototype's panel chrome: rounded surface, hairline border, soft shadow, and an
	 * optional head row of title/subtitle on the left and badge + actions on the right.
	 * Ported from the GRN Dashboard's Card.js (../../GRN Dashboard/zmm_grn_dash).
	 *
	 * `span` is the width in columns of the 12-column chart grid (.pmsGrid--charts).
	 */
	return Control.extend("com.sap.zsdpmsdash.control.Card", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				title: {
					type: "string",
					defaultValue: ""
				},
				subtitle: {
					type: "string",
					defaultValue: ""
				},
				/** Uppercase mono chip on the right of the head row, e.g. "TOP 20". */
				badge: {
					type: "string",
					defaultValue: ""
				},
				/** Columns spanned in the 12-column grid: 4, 6, 8 or 12. */
				span: {
					type: "int",
					defaultValue: 12
				}
			},
			defaultAggregation: "content",
			aggregations: {
				content: {
					type: "sap.ui.core.Control",
					multiple: true
				},
				/** Buttons or toggles rendered next to the badge. */
				actions: {
					type: "sap.ui.core.Control",
					multiple: true,
					singularName: "action"
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var aActions = oControl.getActions();
				var bHead = !!(oControl.getTitle() || oControl.getSubtitle() ||
					oControl.getBadge() || aActions.length);

				oRm.openStart("div", oControl);
				oRm.class("pmsCard");
				oRm.class("pmsSpan" + oControl.getSpan());
				oRm.openEnd();

				if (bHead) {
					oRm.openStart("div").class("pmsCardHead").openEnd();

					oRm.openStart("div").class("pmsCardHeadText").openEnd();
					if (oControl.getTitle()) {
						oRm.openStart("div").class("pmsCardTitle").openEnd()
							.text(oControl.getTitle()).close("div");
					}
					if (oControl.getSubtitle()) {
						oRm.openStart("div").class("pmsCardSub").openEnd()
							.text(oControl.getSubtitle()).close("div");
					}
					oRm.close("div");

					oRm.openStart("div").class("pmsCardActions").openEnd();
					if (oControl.getBadge()) {
						oRm.openStart("span").class("pmsTag").openEnd()
							.text(oControl.getBadge()).close("span");
					}
					aActions.forEach(function (oAction) {
						oRm.renderControl(oAction);
					});
					oRm.close("div");

					oRm.close("div");
				}

				oControl.getContent().forEach(function (oItem) {
					oRm.renderControl(oItem);
				});

				oRm.close("div");
			}
		}
	});
});
