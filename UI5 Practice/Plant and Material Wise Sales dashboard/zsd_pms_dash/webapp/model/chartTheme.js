sap.ui.define([], function () {
	"use strict";

	/**
	 * Resolves the ECharts palette from the dashboard's own CSS custom properties.
	 *
	 * The charts sit inside the ported panels, so they take their colours from the same
	 * --pms-* tokens css/style.css defines rather than from SAP theme parameters - that is
	 * what keeps a chart and the card around it in the same palette in both light and dark.
	 * Switching light/dark is a matter of re-reading these values; see model/appTheme.js.
	 * Ported from the GRN Dashboard's chartTheme.js (../../GRN Dashboard/zmm_grn_dash),
	 * re-keyed to the reviewed prototype's own 8-colour categorical ramp (--c1..--c8) plus
	 * pos/neg for KPI deltas.
	 */

	// palette key -> CSS custom property
	var VARS = {
		c1: "--pms-c1", c2: "--pms-c2", c3: "--pms-c3", c4: "--pms-c4",
		c5: "--pms-c5", c6: "--pms-c6", c7: "--pms-c7", c8: "--pms-c8",
		accent: "--pms-accent",
		pos: "--pms-pos",
		neg: "--pms-neg",
		ink: "--pms-ink",
		ink2: "--pms-ink2",
		ink3: "--pms-ink3",
		line: "--pms-line",
		line2: "--pms-line2",
		panel: "--pms-panel",
		font: "--pms-font"
	};

	var FALLBACK = {
		light: {
			c1: "#0E7C86", c2: "#2E72C8", c3: "#5B54C6", c4: "#8B4DB8",
			c5: "#B8489B", c6: "#D2762C", c7: "#4B9AA0", c8: "#8FA0B4",
			accent: "#2E72C8",
			pos: "#137F5B",
			neg: "#B4413B",
			ink: "#0D2430",
			ink2: "#3D5866",
			ink3: "#7A909D",
			line: "#DCE3E7",
			line2: "#EAEFF2",
			panel: "#FFFFFF"
		},
		dark: {
			c1: "#39A6AF", c2: "#5C9AE8", c3: "#8B84E8", c4: "#B27CD9",
			c5: "#D976BE", c6: "#E6975A", c7: "#75C2C8", c8: "#AAB9C8",
			accent: "#5C9AE8",
			pos: "#3FBF9C",
			neg: "#EF6F66",
			ink: "#E8ECF1",
			ink2: "#9AA5B2",
			ink3: "#6D7885",
			line: "#242C36",
			line2: "#1C232C",
			panel: "#151B22"
		}
	};

	var FALLBACK_FONT = "\"IBM Plex Sans\", \"72\", Arial, Helvetica, sans-serif";
	var MAX_FRAMES = 60; // ~1s at 60fps, waiting for css/style.css to be applied

	var oCache = null;
	var oPending = null;

	function readVar(sName) {
		var sValue = window.getComputedStyle(document.documentElement).getPropertyValue(sName);
		return (sValue || "").trim();
	}

	function build() {
		var bDark = document.documentElement.getAttribute("data-pms-theme") === "dark";
		var oDefaults = FALLBACK[bDark ? "dark" : "light"];
		var oPalette = {};

		Object.keys(VARS).forEach(function (sKey) {
			oPalette[sKey] = readVar(VARS[sKey]) || oDefaults[sKey] || FALLBACK_FONT;
		});
		return oPalette;
	}

	/** True once the stylesheet is live - the probe token resolves to a value. */
	function ready() {
		return !!readVar("--pms-accent");
	}

	var chartTheme = {

		/**
		 * @returns {Promise<object>} the palette, once the stylesheet has been applied
		 */
		get: function () {
			if (oCache) {
				return Promise.resolve(oCache);
			}
			if (oPending) {
				return oPending;
			}

			oPending = new Promise(function (resolve) {
				var iFrames = 0;
				var fnTry = function () {
					if (ready() || iFrames >= MAX_FRAMES) {
						oCache = build();
						oPending = null;
						resolve(oCache);
						return;
					}
					iFrames++;
					window.requestAnimationFrame(fnTry);
				};
				fnTry();
			});

			return oPending;
		},

		/** Drops the cached palette so the next get() re-reads the (new) theme. */
		reset: function () {
			oCache = null;
			oPending = null;
		},

		/**
		 * The 8-colour categorical ramp, in order - used for schemes, zones and any
		 * other small categorical series, mirroring the prototype's RAMP constant.
		 * @param {object} oPalette from get()
		 * @returns {string[]} 8 hex colours
		 */
		ramp: function (oPalette) {
			return [oPalette.c1, oPalette.c2, oPalette.c3, oPalette.c4,
				oPalette.c5, oPalette.c6, oPalette.c7, oPalette.c8];
		},

		/**
		 * Appends an alpha channel to a #rrggbb colour.
		 * @param {string} sColor a colour value
		 * @param {number} fAlpha 0..1
		 * @returns {string} #rrggbbaa, or sColor unchanged
		 */
		alpha: function (sColor, fAlpha) {
			if (!/^#[0-9a-f]{6}$/i.test(sColor || "")) {
				return sColor;
			}
			var sHex = Math.round(Math.max(0, Math.min(1, fAlpha)) * 255).toString(16);
			return sColor + (sHex.length === 1 ? "0" + sHex : sHex);
		}
	};

	return chartTheme;
});
