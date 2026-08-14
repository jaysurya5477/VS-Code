sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The prototype's own dotswitch (../../../Final Template/sales-dashboard-india_claude
	 * V8.html, .dotswitch / #dotToggle): an actual iOS-style track-and-thumb toggle, not a
	 * button whose label text changes between "Dots on"/"Dots off" - this control reproduces
	 * that switch's anatomy exactly: a track, a sliding thumb, and a static label after it.
	 */
	return Control.extend("com.sap.zsdpmsdash.control.DotSwitch", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				on: {
					type: "boolean",
					defaultValue: false
				},
				/** Text after the track, e.g. "Unit dots" - matches the prototype's ds-label. */
				label: {
					type: "string",
					defaultValue: ""
				}
			},
			events: {
				/** Fired on click - the caller flips its own state, same as the prototype's onclick. */
				press: {}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var bOn = oControl.getOn();
				var sTooltip = oControl.getTooltip_AsString();

				oRm.openStart("button", oControl);
				oRm.class("pmsDotSwitch");
				if (bOn) {
					oRm.class("pmsDotSwitch--on");
				}
				oRm.attr("type", "button");
				oRm.attr("aria-pressed", String(bOn));
				if (sTooltip) {
					oRm.attr("title", sTooltip);
				}
				oRm.openEnd();

				oRm.openStart("span").class("pmsDsTrack").openEnd();
				oRm.openStart("span").class("pmsDsThumb").openEnd();
				oRm.close("span");
				oRm.close("span");

				oRm.openStart("span").class("pmsDsLabel").openEnd();
				oRm.text(oControl.getLabel());
				oRm.close("span");

				oRm.close("button");
			}
		},

		onclick: function () {
			this.firePress();
		}
	});
});
