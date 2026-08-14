sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The prototype's segmented pill - used for the theme switch. Ported from the GRN
	 * Dashboard's Toggle.js (../../GRN Dashboard/zmm_grn_dash).
	 *
	 * Native <button> elements, so focus, Enter and Space work without any keyboard code of
	 * our own. `items` is an array of {key, text}.
	 */
	return Control.extend("com.sap.zsdpmsdash.control.Toggle", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				items: {
					type: "object",
					defaultValue: null
				},
				selectedKey: {
					type: "string",
					defaultValue: ""
				}
			},
			events: {
				select: {
					parameters: {
						/** key of the newly selected item */
						key: {
							type: "string"
						}
					}
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var sSelected = oControl.getSelectedKey();

				oRm.openStart("div", oControl);
				oRm.class("pmsToggle");
				oRm.attr("role", "group");
				oRm.openEnd();

				(oControl.getItems() || []).forEach(function (oItem) {
					var bOn = oItem.key === sSelected;
					oRm.openStart("button")
						.class("pmsToggleBtn")
						.attr("type", "button")
						.attr("data-pms-key", oItem.key)
						.attr("aria-pressed", bOn ? "true" : "false");
					if (bOn) {
						oRm.class("pmsToggleBtn--on");
					}
					oRm.openEnd().text(oItem.text || oItem.key).close("button");
				});

				oRm.close("div");
			}
		},

		onclick: function (oEvent) {
			var oButton = oEvent.target.closest("[data-pms-key]");
			if (!oButton) {
				return;
			}
			var sKey = oButton.getAttribute("data-pms-key");
			if (sKey === this.getSelectedKey()) {
				return;
			}

			// setProperty(..., true) suppresses invalidate() so a click never tears down
			// and recreates every sibling EChart's DOM node - see the GRN original's own
			// comment for the full rationale.
			this.setProperty("selectedKey", sKey, true);

			var oRoot = this.getDomRef();
			if (oRoot) {
				Array.prototype.forEach.call(oRoot.querySelectorAll("[data-pms-key]"), function (oBtn) {
					var bOn = oBtn.getAttribute("data-pms-key") === sKey;
					oBtn.classList.toggle("pmsToggleBtn--on", bOn);
					oBtn.setAttribute("aria-pressed", bOn ? "true" : "false");
				});
			}

			this.fireSelect({
				key: sKey
			});
		}
	});
});
