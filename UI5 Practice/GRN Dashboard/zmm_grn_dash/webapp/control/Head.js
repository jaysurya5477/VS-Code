sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The dashboard header: title, module tag, movement-type legend, actions, and the
	 * SCOPE line that echoes the current selection back to the user.
	 *
	 * Ported from the prototype's header block. The scope line lives here rather than in a
	 * separate control because it is part of the same visual band and shares its padding.
	 */
	return Control.extend("com.sap.zmmgrndash.control.Head", {

		metadata: {
			library: "com.sap.zmmgrndash",
			properties: {
				title: {
					type: "string",
					defaultValue: ""
				},
				/** Small uppercase chip next to the title. */
				badge: {
					type: "string",
					defaultValue: ""
				},
				subtitle: {
					type: "string",
					defaultValue: ""
				},
				/** Label of the scope line, e.g. "SCOPE". */
				scopeLabel: {
					type: "string",
					defaultValue: ""
				},
				/** The scope line itself. Hidden while empty. */
				scope: {
					type: "string",
					defaultValue: ""
				}
			},
			aggregations: {
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
				oRm.openStart("div", oControl);
				oRm.class("grnHeadBlock");
				oRm.openEnd();

				oRm.openStart("div").class("grnHead").openEnd();

				oRm.openStart("div").class("grnHeadMain").openEnd();
				oRm.openStart("div").class("grnHeadTitleRow").openEnd();
				oRm.openStart("h1").class("grnHeadTitle").openEnd().text(oControl.getTitle()).close("h1");
				if (oControl.getBadge()) {
					oRm.openStart("span").class("grnTag").openEnd().text(oControl.getBadge()).close("span");
				}
				oRm.close("div");
				if (oControl.getSubtitle()) {
					oRm.openStart("p").class("grnHeadSub").openEnd().text(oControl.getSubtitle()).close("p");
				}
				oRm.close("div");

				oRm.openStart("div").class("grnHeadActions").openEnd();
				oControl.getActions().forEach(function (oAction) {
					oRm.renderControl(oAction);
				});
				oRm.close("div");

				oRm.close("div");

				if (oControl.getScope()) {
					oRm.openStart("div").class("grnScopeLine").openEnd();
					if (oControl.getScopeLabel()) {
						oRm.openStart("span").class("grnScopeLabel").openEnd()
							.text(oControl.getScopeLabel()).close("span");
					}
					oRm.openStart("span").openEnd().text(oControl.getScope()).close("span");
					oRm.close("div");
				}

				oRm.close("div");
			}
		}
	});
});
