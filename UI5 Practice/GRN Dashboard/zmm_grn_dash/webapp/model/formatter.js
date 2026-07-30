sap.ui.define([], function () {
	"use strict";

	/*
	 * The two glyphs that carry meaning in the output are built from char codes rather than
	 * written literally, so this file stays pure ASCII on disk. An ABAP BSP that serves .js
	 * without an explicit UTF-8 charset renders a literal rupee sign as mojibake, which is a
	 * poor look on a finance dashboard and tedious to diagnose after the fact. Defining them
	 * once here also means there is exactly one place to change if that ever happens.
	 *
	 * (Escapes were the obvious way to write this, but the editor's formatter rewrites \u
	 * sequences back to literal characters on save. fromCharCode survives it.)
	 */
	var RUPEE = String.fromCharCode(0x20B9); // Indian rupee sign
	var NO_VALUE = String.fromCharCode(0x2013); // en dash, for a missing or non-numeric value
	var MIDDOT = String.fromCharCode(0xB7); // separator between joined tooltip facts
	var RANGE_ARROW = String.fromCharCode(0x2192); // "from -> to" in the scope line

	/**
	 * Number/label formatting for the GRN dashboard.
	 *
	 * Ports the HTML prototype's `fmt()`/`pct()` helpers so the Fiori app renders the
	 * same abbreviations the business already reviewed: Indian crore/lakh notation
	 * (2.34 Cr, 15.60 L) rather than the western M/B the standard UI5 formatters give.
	 * Kept as pure functions with no UI5 dependency so the chart option builders and the
	 * XML views can both use them.
	 */
	var formatter = {

		/** Exported so the chart option builders use the same glyphs. */
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

		/**
		 * Indian short-scale abbreviation with the unit spelled out, for quantities.
		 * Distinct from compact()'s "Cr"/"L" so a quantity in LTR is never misread as
		 * the "L" abbreviation for lakh.
		 * @param {number|string} v raw number
		 * @returns {string} e.g. "2.34 crore", "15.60 lakh", "8.2k", "-940"
		 */
		fmtQ: function (v) {
			var n = parseFloat(v);
			if (!isFinite(n)) {
				return NO_VALUE;
			}
			var a = Math.abs(n);
			var s = n < 0 ? "-" : "";
			if (a >= 1e7) {
				return s + (a / 1e7).toFixed(2) + " crore";
			}
			if (a >= 1e5) {
				return s + (a / 1e5).toFixed(2) + " lakh";
			}
			if (a >= 1e3) {
				return s + (a / 1e3).toFixed(1) + "k";
			}
			return s + Math.round(a).toLocaleString("en-IN");
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
		 * "YYYYMM" (the Trend entity's Period key) -> "Mon YY".
		 * @param {string} sPeriod six-digit period
		 * @returns {string} e.g. "Apr 26"
		 */
		periodLabel: function (sPeriod) {
			var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
			if (!sPeriod || sPeriod.length !== 6) {
				return sPeriod || "";
			}
			var iMonth = parseInt(sPeriod.slice(4, 6), 10);
			if (!(iMonth >= 1 && iMonth <= 12)) {
				return sPeriod;
			}
			return MONTHS[iMonth - 1] + " " + sPeriod.slice(2, 4);
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
		}
	};

	return formatter;
});
