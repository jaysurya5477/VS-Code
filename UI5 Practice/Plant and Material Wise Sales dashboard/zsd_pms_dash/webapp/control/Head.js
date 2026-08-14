sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The dashboard header: title, module tag, and the SCOPE line that echoes the current
	 * selection back to the user. Ported from the GRN Dashboard's Head.js
	 * (../../GRN Dashboard/zmm_grn_dash).
	 */
	return Control.extend("com.sap.zsdpmsdash.control.Head", {

		metadata: {
			library: "com.sap.zsdpmsdash",
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
				oRm.class("pmsHeadBlock");
				oRm.openEnd();

				oRm.openStart("div").class("pmsHead").openEnd();

				oRm.openStart("div").class("pmsHeadMain").openEnd();
				oRm.openStart("div").class("pmsHeadTitleRow").openEnd();
				oRm.openStart("h1").class("pmsHeadTitle").openEnd().text(oControl.getTitle()).close("h1");
				if (oControl.getBadge()) {
					oRm.openStart("span").class("pmsTag").openEnd().text(oControl.getBadge()).close("span");
				}
				oRm.close("div");
				if (oControl.getSubtitle()) {
					oRm.openStart("p").class("pmsHeadSub").openEnd().text(oControl.getSubtitle()).close("p");
				}
				oRm.close("div");

				oRm.openStart("div").class("pmsHeadActions").openEnd();
				oControl.getActions().forEach(function (oAction) {
					oRm.renderControl(oAction);
				});
				oRm.close("div");

				oRm.close("div");

				if (oControl.getScope()) {
					oRm.openStart("div").class("pmsScopeLine").openEnd();
					if (oControl.getScopeLabel()) {
						oRm.openStart("span").class("pmsScopeLabel").openEnd()
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
