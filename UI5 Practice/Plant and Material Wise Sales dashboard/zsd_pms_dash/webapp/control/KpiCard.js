sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * One KPI tile, laid out exactly like the reviewed prototype's `.kpi` card
	 * (../../../Final Template/sales-dashboard-india_claude V8.html, renderKpis()):
	 *
	 *   +-------------------------------------------+  <- 3px accent bar (::before)
	 *   | TOTAL NET VALUE                  /\__     |
	 *   | Rs 2.34 Cr                      /    \_   |  <- value + sparkline, same row
	 *   |                                           |
	 *   | [ +12.4% ]            Rs 23,412,345       |  <- delta pill + sub, same row
	 *   +-------------------------------------------+
	 *
	 * The sparkline is inline SVG drawn by this renderer, using the prototype's own
	 * sparkline() geometry (74x26, 2px padding, min/max normalised). It replaces the
	 * EChart instance the first cut used: four chart instances for four 26px-tall
	 * decorations is a lot of lifecycle for no benefit, and inline SVG lets the line take
	 * its colour from the card's accent via `currentColor`, so it re-themes with no redraw.
	 *
	 * `accent` names a variant (net|tax|gross|daily) rather than carrying a colour: the
	 * gradient and the sparkline colour then live in css/style.css as --pms-* tokens and
	 * follow light/dark automatically. See .pmsKpi--* there.
	 */

	// Sparkline box, matching the prototype's own constants.
	var W = 74;
	var H = 26;
	var PAD = 2;

	/**
	 * Prototype sparkline() geometry: normalise against [min(0, ...), max(1, ...)] and
	 * spread the points evenly across the box.
	 * @param {number[]} aValues the series
	 * @returns {object|null} {d, x, y} - path data and the last point, or null if undrawable
	 */
	function sparkGeometry(aValues) {
		if (!aValues || aValues.length < 2) {
			return null;
		}
		var fMax = Math.max.apply(null, aValues.concat([1]));
		var fMin = Math.min.apply(null, aValues.concat([0]));
		var fRange = (fMax - fMin) || 1;
		var iSpan = Math.max(aValues.length - 1, 1);

		var aPoints = aValues.map(function (v, i) {
			var n = parseFloat(v);
			return [
				PAD + i * (W - 2 * PAD) / iSpan,
				H - PAD - ((isFinite(n) ? n : 0) - fMin) / fRange * (H - 2 * PAD)
			];
		});

		return {
			d: aPoints.map(function (p, i) {
				return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
			}).join(" "),
			x: aPoints[aPoints.length - 1][0].toFixed(1),
			y: aPoints[aPoints.length - 1][1].toFixed(1)
		};
	}

	return Control.extend("com.sap.zsdpmsdash.control.KpiCard", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				/** Uppercase mono eyebrow, e.g. "Total net value". */
				label: {
					type: "string",
					defaultValue: ""
				},
				valueText: {
					type: "string",
					defaultValue: ""
				},
				/** Small suffix inside the value, e.g. a unit of measure. */
				unit: {
					type: "string",
					defaultValue: ""
				},
				deltaText: {
					type: "string",
					defaultValue: ""
				},
				/** up | down | flat - the prototype's own .delta modifiers. */
				deltaTone: {
					type: "string",
					defaultValue: "flat"
				},
				/** Mono context line on the right of the footer, e.g. the un-abbreviated amount. */
				sub: {
					type: "string",
					defaultValue: ""
				},
				/**
				 * Optional second, smaller line under the footer. Used by the daily card, whose
				 * headline value is GROSS, to break that down into net and tax - the three
				 * totals cards each already ARE one of those measures and leave this empty.
				 */
				sub2: {
					type: "string",
					defaultValue: ""
				},
				/** net | tax | gross | daily - picks the accent bar and sparkline colour. */
				accent: {
					type: "string",
					defaultValue: "net"
				},
				/** Sparkline series. Fewer than two points renders no sparkline. */
				spark: {
					type: "object",
					defaultValue: null
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var sTone = oControl.getDeltaTone() || "flat";
				var oSpark = sparkGeometry(oControl.getSpark());

				oRm.openStart("div", oControl);
				oRm.class("pmsCard");
				oRm.class("pmsKpi");
				oRm.class("pmsKpi--" + (oControl.getAccent() || "net"));
				oRm.openEnd();

				/* --- value + sparkline ------------------------------------------- */
				oRm.openStart("div").class("pmsKpiTop").openEnd();

				oRm.openStart("div").class("pmsKpiHeadText").openEnd();
				oRm.openStart("div").class("pmsEyebrow").openEnd()
					.text(oControl.getLabel()).close("div");

				oRm.openStart("div").class("pmsKpiValue").openEnd();
				oRm.text(oControl.getValueText());
				if (oControl.getUnit()) {
					oRm.openStart("span").class("pmsKpiUnit").openEnd()
						.text(oControl.getUnit()).close("span");
				}
				oRm.close("div");
				oRm.close("div");

				if (oSpark) {
					oRm.openStart("svg").class("pmsSpark");
					oRm.attr("viewBox", "0 0 " + W + " " + H);
					oRm.attr("aria-hidden", "true");
					oRm.attr("focusable", "false");
					oRm.openEnd();

					// Area under the line: a flat currentColor tint. The prototype fades it
					// with a <linearGradient>; at 26px tall the two are indistinguishable and
					// this needs no per-instance gradient id.
					oRm.openStart("path").class("pmsSparkArea");
					oRm.attr("d", oSpark.d + " L" + (W - PAD).toFixed(1) + " " + (H - PAD) +
						" L" + PAD + " " + (H - PAD) + " Z");
					oRm.openEnd();
					oRm.close("path");

					oRm.openStart("path").class("pmsSparkLine");
					oRm.attr("d", oSpark.d);
					oRm.openEnd();
					oRm.close("path");

					oRm.openStart("circle").class("pmsSparkHead");
					oRm.attr("cx", oSpark.x);
					oRm.attr("cy", oSpark.y);
					oRm.attr("r", "2");
					oRm.openEnd();
					oRm.close("circle");

					oRm.close("svg");
				}

				oRm.close("div");

				/* --- delta pill + sub -------------------------------------------- */
				oRm.openStart("div").class("pmsKpiFoot").openEnd();

				oRm.openStart("span").class("pmsDelta").class("pmsDelta--" + sTone).openEnd();
				if (sTone === "up" || sTone === "down") {
					oRm.openStart("span").class("pmsDeltaArrow").openEnd()
						.text(sTone === "up" ? "▲" : "▼").close("span");
					oRm.text(oControl.getDeltaText());
				} else {
					oRm.text("–");
				}
				oRm.close("span");

				if (oControl.getSub()) {
					oRm.openStart("span").class("pmsKpiSub").openEnd()
						.text(oControl.getSub()).close("span");
				}

				oRm.close("div");

				if (oControl.getSub2()) {
					oRm.openStart("div").class("pmsKpiSub2").openEnd()
						.text(oControl.getSub2()).close("div");
				}

				oRm.close("div");
			}
		}
	});
});
