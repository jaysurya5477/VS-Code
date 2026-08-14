sap.ui.define([], function () {
	"use strict";

	var RUPEE = String.fromCharCode(0x20B9); // Indian rupee sign
	var NO_VALUE = String.fromCharCode(0x2013); // en dash, for a missing/non-numeric value
	var MIDDOT = String.fromCharCode(0xB7); // separator between joined scope facts
	var RANGE_ARROW = String.fromCharCode(0x2192); // "from -> to"

	var FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

	/**
	 * Number/label formatting for the PMS dashboard.
	 *
	 * Ports the HTML prototype's fmt()/pct() helpers so the Fiori app renders the same
	 * Indian crore/lakh notation the business already reviewed, rather than the western
	 * M/B a stock UI5 formatter would give. Kept as pure functions with no UI5 dependency
	 * so chart option builders and XML views can both use them.
	 */
	var formatter = {

		RUPEE: RUPEE,
		NO_VALUE: NO_VALUE,
		MIDDOT: MIDDOT,
		RANGE_ARROW: RANGE_ARROW,

		/**
		 * Indian short-scale abbreviation. 1e7 -> Cr, 1e5 -> L, 1e3 -> k.
		 * @param {number|string} v raw number
		 * @returns {string} e.g. "2.34 Cr", "15.60 L", "8.2k", "-940"
		 */
		compact: function (v) {
			var n = parseFloat(v);
			if (!isFinite(n)) {
				return NO_VALUE;
			}
			var a = Math.abs(n);
			var s = n < 0 ? "-" : "";
			if (a >= 1e7) {
				return s + (a / 1e7).toFixed(2) + " Cr";
			}
			if (a >= 1e5) {
				return s + (a / 1e5).toFixed(2) + " L";
			}
			if (a >= 1e3) {
				return s + (a / 1e3).toFixed(1) + "k";
			}
			return s + Math.round(a).toLocaleString("en-IN");
		},

		/** Same as compact() but prefixed with the rupee sign. */
		money: function (v) {
			var n = parseFloat(v);
			if (!isFinite(n)) {
				return NO_VALUE;
			}
			return (n < 0 ? "-" + RUPEE : RUPEE) + formatter.compact(Math.abs(n));
		},

		/** Full (non-abbreviated) rupee amount, for tooltips. */
		moneyFull: function (v) {
			var n = parseFloat(v);
			if (!isFinite(n)) {
				return NO_VALUE;
			}
			return RUPEE + Math.round(n).toLocaleString("en-IN");
		},

		/**
		 * Percentage with fixed decimals, no sign forced.
		 * @param {number|string} v the percentage (already x100, i.e. 2.4 means 2.4%)
		 * @param {number} [iDecimals=2] decimal places
		 * @returns {string} e.g. "2.40%"
		 */
		percent: function (v, iDecimals) {
			var n = parseFloat(v);
			if (!isFinite(n)) {
				return NO_VALUE;
			}
			return n.toFixed(iDecimals === undefined ? 2 : iDecimals) + "%";
		},

		/** Percentage with an explicit +/- sign, for period-over-period deltas. */
		signedPercent: function (v, iDecimals) {
			var n = parseFloat(v);
			if (!isFinite(n)) {
				return NO_VALUE;
			}
			var d = iDecimals === undefined ? 1 : iDecimals;
			return (n >= 0 ? "+" : "") + n.toFixed(d) + "%";
		},

		/** Plain integer with thousands separators. */
		count: function (v) {
			var n = parseFloat(v);
			return isFinite(n) ? Math.round(n).toLocaleString("en-IN") : NO_VALUE;
		},

		/**
		 * FY period (1..12, Apr=1..Mar=12 - OD-6/OD-7 real convention) -> short month label.
		 * @param {number|string} v FY period
		 * @returns {string} e.g. "Apr", or the raw value if out of range
		 */
		periodLabel: function (v) {
			var n = parseInt(v, 10);
			return (n >= 1 && n <= 12) ? FY_MONTHS[n - 1] : String(v || "");
		},

		/**
		 * yyyy-MM-dd (an Edm.Date string) as-is; JS Date -> yyyy-MM-dd.
		 * The OData key predicate needs the unquoted ISO form, so this is the single
		 * place that conversion happens.
		 * @param {Date|string} v date
		 * @returns {string} yyyy-MM-dd
		 */
		isoDate: function (v) {
			if (!v) {
				return "";
			}
			if (typeof v === "string") {
				return v.slice(0, 10);
			}
			var p = function (n) {
				return (n < 10 ? "0" : "") + n;
			};
			return v.getFullYear() + "-" + p(v.getMonth() + 1) + "-" + p(v.getDate());
		},

		/**
		 * dd Mon yy, for the scope line and tooltips.
		 * @param {string} sIsoDate yyyy-MM-dd
		 * @returns {string} e.g. "11 Aug 26"
		 */
		dateShort: function (sIsoDate) {
			if (!sIsoDate) {
				return NO_VALUE;
			}
			var d = new Date(sIsoDate + "T00:00:00");
			if (isNaN(d.getTime())) {
				return NO_VALUE;
			}
			var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
			return String(d.getDate()).padStart(2, "0") + " " + MONTHS[d.getMonth()] + " " + String(d.getFullYear()).slice(2);
		}
	};

	return formatter;
});
