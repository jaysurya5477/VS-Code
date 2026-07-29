sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The prototype's panel chrome: rounded surface, hairline border, soft shadow, and an
	 * optional head row of title / subtitle on the left and badge + actions on the right.
	 *
	 * `span` is the width in columns of the 12-column chart grid (.grnGrid--charts). It is
	 * emitted as a class rather than an inline style so the responsive rule that collapses
	 * every card to full width below 1100px can override it.
	 */
	return Control.extend("com.sap.zmmgrndash.control.Card", {

		metadata: {
			library: "com.sap.zmmgrndash",
			properties: {
				title: {
					type: "string",
					defaultValue: ""
				},
				subtitle: {
					type: "string",
					defaultValue: ""
				},
				/** Uppercase mono chip on the right of the head row, e.g. "TOP 10". */
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
				oRm.class("grnCard");
				oRm.class("grnSpan" + oControl.getSpan());
				oRm.openEnd();

				if (bHead) {
					oRm.openStart("div").class("grnCardHead").openEnd();

					oRm.openStart("div").class("grnCardHeadText").openEnd();
					if (oControl.getTitle()) {
						oRm.openStart("div").class("grnCardTitle").openEnd()
							.text(oControl.getTitle()).close("div");
					}
					if (oControl.getSubtitle()) {
						oRm.openStart("div").class("grnCardSub").openEnd()
							.text(oControl.getSubtitle()).close("div");
					}
					oRm.close("div");

					oRm.openStart("div").class("grnCardActions").openEnd();
					if (oControl.getBadge()) {
						oRm.openStart("span").class("grnTag").openEnd()
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
