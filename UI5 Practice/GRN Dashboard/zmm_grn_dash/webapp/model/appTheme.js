sap.ui.define([
	"sap/ui/core/Core"
], function (Core) {
	"use strict";

	/**
	 * Light/dark handling for the dashboard.
	 *
	 * Two theming systems have to agree here: the ported panels are styled by the
	 * --grn-* tokens in css/style.css (selected by data-grn-theme on <html>), while the
	 * filter bar is stock Fiori and follows the UI5 theme. This module keeps them in step.
	 *
	 *   auto  - follow the OS colour scheme (standalone) or the shell's theme (in the FLP)
	 *   light - sap_horizon      + the light token block
	 *   dark  - sap_horizon_dark + the dark token block
	 *
	 * In "auto" inside the Launchpad the shell owns the UI5 theme, so applyTheme is not
	 * called - the panels adopt whatever the shell is running instead. Picking light or dark
	 * explicitly does switch the UI5 theme even in the shell, because a dark dashboard with
	 * a light filter bar is worse than a theme change the user asked for.
	 */

	var LIGHT_UI5 = "sap_horizon";
	var DARK_UI5 = "sap_horizon_dark";

	var sMode = "auto";
	var aListeners = [];
	var oMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
	var bMediaBound = false;

	function inShell() {
		return !!(window.sap && window.sap.ushell && window.sap.ushell.Container);
	}

	function ui5Theme() {
		return (Core.getConfiguration && Core.getConfiguration().getTheme()) || "";
	}

	/** sap_horizon_dark, sap_fiori_3_dark, sap_horizon_hcb, … all count as dark. */
	function ui5IsDark() {
		return /_dark|hcb/i.test(ui5Theme());
	}

	function resolveDark() {
		if (sMode === "dark") {
			return true;
		}
		if (sMode === "light") {
			return false;
		}
		return inShell() ? ui5IsDark() : !!(oMedia && oMedia.matches);
	}

	function notify(bDark) {
		aListeners.slice().forEach(function (fn) {
			try {
				fn(bDark);
			} catch (e) {
				// A listener that throws must not stop the others from being told.
			}
		});
	}

	function onMediaChange() {
		if (sMode === "auto") {
			appTheme.apply();
		}
	}

	function bindMedia() {
		if (bMediaBound || !oMedia) {
			return;
		}
		bMediaBound = true;
		if (oMedia.addEventListener) {
			oMedia.addEventListener("change", onMediaChange);
		} else if (oMedia.addListener) {
			// Safari < 14 and older WebViews.
			oMedia.addListener(onMediaChange);
		}
	}

	var appTheme = {

		/** @returns {string} auto | light | dark */
		getMode: function () {
			return sMode;
		},

		/**
		 * Switches mode and applies it immediately.
		 * @param {string} sNewMode auto | light | dark
		 * @returns {boolean} true if the result is a dark appearance
		 */
		setMode: function (sNewMode) {
			sMode = sNewMode === "light" || sNewMode === "dark" ? sNewMode : "auto";
			return this.apply();
		},

		/**
		 * Writes data-grn-theme and, outside the Launchpad, switches the UI5 theme to match.
		 * @returns {boolean} true if the result is a dark appearance
		 */
		apply: function () {
			bindMedia();

			var bDark = resolveDark();
			document.documentElement.setAttribute("data-grn-theme", bDark ? "dark" : "light");

			if (sMode !== "auto" || !inShell()) {
				var sTarget = bDark ? DARK_UI5 : LIGHT_UI5;
				if (ui5Theme() !== sTarget && Core.applyTheme) {
					Core.applyTheme(sTarget);
				}
			}

			notify(bDark);
			return bDark;
		},

		/** @returns {boolean} whether the panels are currently rendered dark */
		isDark: function () {
			return document.documentElement.getAttribute("data-grn-theme") === "dark";
		},

		/**
		 * Registers a callback fired after every apply(), including OS colour-scheme changes.
		 * @param {function(boolean)} fn listener
		 */
		attachChanged: function (fn) {
			aListeners.push(fn);
		},

		/** @param {function(boolean)} fn the listener passed to attachChanged */
		detachChanged: function (fn) {
			aListeners = aListeners.filter(function (f) {
				return f !== fn;
			});
		}
	};

	return appTheme;
});
