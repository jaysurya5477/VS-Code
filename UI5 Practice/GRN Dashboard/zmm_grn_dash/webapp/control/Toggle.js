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
			if (sKey === this.getSelectedKey()) {
				return;
			}

			// setProperty(..., true) suppresses invalidate() - still stores the value and
			// still pushes it through a two-way binding, but skips the framework re-render.
			// A normal setSelectedKey() here would invalidate this control, and Control
			// invalidation bubbles up through every ancestor that doesn't override it - none
			// of Box/Card/Head do - so a plain click would force the whole page above this
			// toggle to re-render, tearing down and recreating every sibling EChart's DOM
			// node and disposing its live chart instance for no reason. Patch the pressed
			// state on the existing buttons directly instead.
			this.setProperty("selectedKey", sKey, true);

			var oRoot = this.getDomRef();
			if (oRoot) {
				Array.prototype.forEach.call(oRoot.querySelectorAll("[data-grn-key]"), function (oBtn) {
					var bOn = oBtn.getAttribute("data-grn-key") === sKey;
					oBtn.classList.toggle("grnToggleBtn--on", bOn);
					oBtn.setAttribute("aria-pressed", bOn ? "true" : "false");
				});
			}

			this.fireSelect({
				key: sKey
			});
		}
	});
});
