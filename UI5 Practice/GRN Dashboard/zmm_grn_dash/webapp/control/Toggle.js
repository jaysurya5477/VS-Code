sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The prototype's segmented pill - used for the theme switch and the qty/value toggle.
	 *
	 * Native <button> elements, so focus, Enter and Space work without any keyboard code of
	 * our own. `items` is an array of {key, text}.
	 */
	return Control.extend("com.sap.zmmgrndash.control.Toggle", {

		metadata: {
			library: "com.sap.zmmgrndash",
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
				oRm.class("grnToggle");
				oRm.attr("role", "group");
				oRm.openEnd();

				(oControl.getItems() || []).forEach(function (oItem) {
					var bOn = oItem.key === sSelected;
					oRm.openStart("button")
						.class("grnToggleBtn")
						.attr("type", "button")
						.attr("data-grn-key", oItem.key)
						.attr("aria-pressed", bOn ? "true" : "false");
					if (bOn) {
						oRm.class("grnToggleBtn--on");
					}
					oRm.openEnd().text(oItem.text || oItem.key).close("button");
				});

				oRm.close("div");
			}
		},

		onclick: function (oEvent) {
			var oButton = oEvent.target.closest("[data-grn-key]");
			if (!oButton) {
				return;
			}
			var sKey = oButton.getAttribute("data-grn-key");
			if (sKey !== this.getSelectedKey()) {
				this.setSelectedKey(sKey);
				this.fireSelect({
					key: sKey
				});
			}
		}
	});
});
