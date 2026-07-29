sap.ui.define([], function () {
	"use strict";

	/**
	 * Resolves the ECharts palette from the dashboard's own CSS custom properties.
	 *
	 * The charts sit inside the ported panels, so they take their colours from the same
	 * --grn-* tokens css/style.css defines rather than from SAP theme parameters - that is
	 * what keeps a chart and the card around it in the same palette in both light and dark.
	 * Switching light/dark is a matter of re-reading these values; see model/appTheme.js.
	 *
	 * The JS fallbacks below duplicate the two token blocks. They are only reached if the
	 * stylesheet is somehow still not applied after the retry window - the normal path
	 * reads the live values, so the CSS stays the single source of truth.
	 */

	// palette key -> CSS custom property
	var VARS = {
		accent: "--grn-accent",
		alt: "--grn-alt",
		accent2: "--grn-alt2",
		pos: "--grn-pos",
		neg: "--grn-neg",
		warn: "--grn-warn",
		ink: "--grn-ink",
		ink2: "--grn-ink2",
		ink3: "--grn-ink3",
		line: "--grn-line",
		line2: "--grn-line2",
		panel: "--grn-panel",
		font: "--grn-font"
	};

	var FALLBACK = {
		light: {
			accent: "#1a6fb5",
			alt: "#6a55b8",
			accent2: "#0f766e",
			pos: "#12836b",
			neg: "#c0392f",
			warn: "#c07d16",
			ink: "#1c2330",
			ink2: "#5b6676",
			ink3: "#8b95a3",
			line: "#e2e6ea",
			line2: "#eef1f4",
			panel: "#ffffff"
		},
		dark: {
			accent: "#4da3e8",
			alt: "#9b86ee",
			accent2: "#2bb3a3",
			pos: "#3fbf9c",
			neg: "#ef6f66",
			warn: "#e0a437",
			ink: "#e8ecf1",
			ink2: "#9aa5b2",
			ink3: "#6d7885",
			line: "#242c36",
			line2: "#1c232c",
			panel: "#151b22"
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
		var bDark = document.documentElement.getAttribute("data-grn-theme") === "dark";
		var oDefaults = FALLBACK[bDark ? "dark" : "light"];
		var oPalette = {};

		Object.keys(VARS).forEach(function (sKey) {
			oPalette[sKey] = readVar(VARS[sKey]) || oDefaults[sKey] || FALLBACK_FONT;
		});
		return oPalette;
	}

	/** True once the stylesheet is live - the probe token resolves to a value. */
	function ready() {
		return !!readVar("--grn-accent");
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
		 * Appends an alpha channel to a #rrggbb colour, for the gradient/fill tints the
		 * prototype used (`A + '66'`). Values that are not 6-digit hex are returned
		 * untouched rather than corrupted.
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
		},

		/**
		 * Linear blend between two #rrggbb colours - used to build the doc-type chart's
		 * light-to-dark value ramp from a single accent colour.
		 * @param {string} sFrom hex colour
		 * @param {string} sTo hex colour
		 * @param {number} fT 0..1
		 * @returns {string} blended hex colour
		 */
		mix: function (sFrom, sTo, fT) {
			var rgb = function (h) {
				h = String(h).replace("#", "");
				if (h.length === 3) {
					h = h.split("").map(function (c) {
						return c + c;
					}).join("");
				}
				return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
			};
			if (!/^#[0-9a-f]{3,6}$/i.test(sFrom || "") || !/^#[0-9a-f]{3,6}$/i.test(sTo || "")) {
				return sFrom;
			}
			var a = rgb(sFrom);
			var b = rgb(sTo);
			return "#" + a.map(function (v, i) {
				var x = Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, fT)));
				return (x < 16 ? "0" : "") + x.toString(16);
			}).join("");
		}
	};

	return chartTheme;
});
