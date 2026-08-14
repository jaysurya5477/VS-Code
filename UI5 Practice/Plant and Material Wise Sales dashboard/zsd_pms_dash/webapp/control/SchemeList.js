sap.ui.define([
	"sap/ui/core/Control",
	"../model/formatter"
], function (Control, formatter) {
	"use strict";

	/**
	 * The "Scheme performance" panel, rebuilt as the reviewed prototype has it
	 * (../../../Final Template/sales-dashboard-india_claude V8.html, renderZones()) rather
	 * than as a bar chart:
	 *
	 *   * ADIP Sale                     Rs 4.21 Cr
	 *     [========================------------]
	 *     31.2% of India · 1,204 invoices   +8.4%
	 *     ... one row per scheme, ranked by net value ...
	 *     -------------------------------------
	 *     TOP STATES
	 *     01 * Maharashtra   Rs 2.10 Cr   +6.1%
	 *
	 * Every row is a real button: pressing a scheme row toggles that scheme in the Scheme
	 * filter, pressing a state row toggles it in the State filter - the prototype's own
	 * click-to-filter behaviour.
	 *
	 * Colours are emitted as `var(--pms-cN)` references rather than resolved hex, so the
	 * whole panel re-themes with the stylesheet and never needs a redraw on a theme switch.
	 */

	// Categorical ramp, in the order chartTheme.ramp() uses.
	var RAMP = ["--pms-c1", "--pms-c2", "--pms-c3", "--pms-c4",
		"--pms-c5", "--pms-c6", "--pms-c7", "--pms-c8"];

	// The prototype's ZONE_COLOR, expressed against the same tokens:
	// North #2E72C8 = c2, West #0E7C86 = c1, South #8B4DB8 = c4,
	// East #D2762C = c6, Central #B8489B = c5.
	var ZONE_VAR = {
		North: "--pms-c2",
		West: "--pms-c1",
		South: "--pms-c4",
		East: "--pms-c6",
		Central: "--pms-c5"
	};

	function num(v) {
		var n = parseFloat(v);
		return isFinite(n) ? n : 0;
	}

	/** @returns {string} a css var() reference, usable straight in a style value */
	function cssVar(sName) {
		return "var(" + sName + ", currentColor)";
	}

	/**
	 * Growth cell: signed percent in the pos/neg tone, or the "new" word when there is no
	 * prior-period base to compare against.
	 * @param {object} oRm the render manager
	 * @param {string} sClass class for the wrapper span
	 * @param {number|string} vDelta the delta percentage
	 * @param {string} sNewLabel text shown when the delta is not comparable
	 */
	function renderDelta(oRm, sClass, vDelta, sNewLabel) {
		var f = parseFloat(vDelta);
		var bKnown = isFinite(f);

		oRm.openStart("span");
		oRm.class(sClass);
		oRm.class("pmsTone--" + (!bKnown ? "none" : f >= 0 ? "pos" : "neg"));
		oRm.openEnd();
		oRm.text(bKnown ? formatter.signedPercent(f) : sNewLabel);
		oRm.close("span");
	}

	return Control.extend("com.sap.zsdpmsdash.control.SchemeList", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				/** Scheme entity rows {Category, CatDesc, NetValue, SharePct, InvoiceCount, DeltaPct}. */
				schemeRows: {
					type: "object",
					defaultValue: null
				},
				/** Geo entity rows, used for the Top-states roll-up under the divider. */
				stateRows: {
					type: "object",
					defaultValue: null
				},
				/** Category codes currently selected in the Scheme filter. */
				selectedSchemes: {
					type: "object",
					defaultValue: null
				},
				/** Regio codes currently selected in the State filter. */
				selectedStates: {
					type: "object",
					defaultValue: null
				},
				/** How many states the Top-states list shows. */
				topCount: {
					type: "int",
					defaultValue: 8
				},
				/** Eyebrow above the Top-states list. */
				topStatesLabel: {
					type: "string",
					defaultValue: ""
				},
				/** Trailing half of the share sentence, e.g. "of India". */
				shareLabel: {
					type: "string",
					defaultValue: ""
				},
				/** Noun after the invoice count, e.g. "invoices". */
				invoicesLabel: {
					type: "string",
					defaultValue: ""
				},
				/** Shown instead of a percentage when there is no prior-year base. */
				newLabel: {
					type: "string",
					defaultValue: "new"
				},
				/** Shown when the selection returned no schemes. */
				emptyText: {
					type: "string",
					defaultValue: ""
				},
				/** Shown when the selection returned no billed states. */
				emptyStatesText: {
					type: "string",
					defaultValue: ""
				}
			},
			events: {
				/** A scheme row was pressed. */
				schemePress: {
					parameters: {
						category: {
							type: "string"
						},
						description: {
							type: "string"
						}
					}
				},
				/** A Top-states row was pressed. */
				statePress: {
					parameters: {
						regio: {
							type: "string"
						},
						stateText: {
							type: "string"
						}
					}
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var aSchemes = (oControl.getSchemeRows() || []).slice().sort(function (a, b) {
					return num(b.NetValue) - num(a.NetValue);
				});
				var aSelSchemes = oControl.getSelectedSchemes() || [];
				var aSelStates = oControl.getSelectedStates() || [];
				var sNew = oControl.getNewLabel();

				var fMax = aSchemes.reduce(function (m, r) {
					return Math.max(m, num(r.NetValue));
				}, 0) || 1;

				oRm.openStart("div", oControl);
				oRm.class("pmsSchemeList");
				oRm.openEnd();

				/* --- scheme rows --------------------------------------------------- */
				if (!aSchemes.length) {
					oRm.openStart("div").class("pmsEmpty").openEnd()
						.text(oControl.getEmptyText()).close("div");
				}

				aSchemes.forEach(function (r, i) {
					var sColor = cssVar(RAMP[i % RAMP.length]);
					var fNet = num(r.NetValue);
					var bSel = aSelSchemes.indexOf(r.Category) >= 0;

					oRm.openStart("button");
					oRm.class("pmsZRow");
					if (bSel) {
						oRm.class("pmsZRow--sel");
					}
					oRm.attr("type", "button");
					oRm.attr("data-pms-scheme", r.Category || "");
					oRm.attr("aria-pressed", String(bSel));
					oRm.openEnd();

					oRm.openStart("span").class("pmsZTop").openEnd();
					oRm.openStart("span").class("pmsZChip").style("background", sColor).openEnd().close("span");
					oRm.openStart("span").class("pmsZName").openEnd()
						.text(r.CatDesc || r.Category).close("span");
					oRm.openStart("span").class("pmsZVal").openEnd()
						.text(formatter.money(fNet)).close("span");
					oRm.close("span");

					oRm.openStart("span").class("pmsZBar").openEnd();
					oRm.openStart("span").class("pmsZBarFill");
					oRm.style("width", (fNet / fMax * 100).toFixed(1) + "%");
					oRm.style("background", sColor);
					oRm.openEnd();
					oRm.close("span");
					oRm.close("span");

					oRm.openStart("span").class("pmsZMeta").openEnd();
					oRm.openStart("span").openEnd()
						.text(formatter.percent(r.SharePct, 1) + " " + oControl.getShareLabel() +
							" " + formatter.MIDDOT + " " + formatter.count(r.InvoiceCount) +
							" " + oControl.getInvoicesLabel())
						.close("span");
					renderDelta(oRm, "pmsZDelta", r.DeltaPct, sNew);
					oRm.close("span");

					oRm.close("button");
				});

				/* --- top states ---------------------------------------------------- */
				var aStates = (oControl.getStateRows() || []).filter(function (r) {
					return num(r.NetValue) > 0;
				}).sort(function (a, b) {
					return num(b.NetValue) - num(a.NetValue);
				}).slice(0, oControl.getTopCount());

				oRm.openStart("div").class("pmsDivider").openEnd().close("div");
				oRm.openStart("div").class("pmsEyebrow").class("pmsSchemeSectionLabel").openEnd()
					.text(oControl.getTopStatesLabel()).close("div");

				if (!aStates.length) {
					oRm.openStart("div").class("pmsEmpty").openEnd()
						.text(oControl.getEmptyStatesText()).close("div");
				}

				aStates.forEach(function (r, i) {
					var bSel = aSelStates.indexOf(r.Regio) >= 0;

					oRm.openStart("button");
					oRm.class("pmsStRow");
					if (bSel) {
						oRm.class("pmsStRow--sel");
					}
					oRm.attr("type", "button");
					oRm.attr("data-pms-regio", r.Regio || "");
					oRm.attr("data-pms-statetext", r.StateText || "");
					oRm.openEnd();

					oRm.openStart("span").class("pmsStRank").openEnd()
						.text(String(i + 1).length < 2 ? "0" + (i + 1) : String(i + 1)).close("span");
					oRm.openStart("span").class("pmsZChip")
						.style("background", cssVar(ZONE_VAR[r.AlmZone] || "--pms-c8"))
						.openEnd().close("span");
					oRm.openStart("span").class("pmsStName").openEnd()
						.text(r.StateText || r.Regio).close("span");
					oRm.openStart("span").class("pmsStVal").openEnd()
						.text(formatter.money(r.NetValue)).close("span");
					renderDelta(oRm, "pmsStDelta", r.DeltaPct, sNew);

					oRm.close("button");
				});

				oRm.close("div");
			}
		},

		onclick: function (oEvent) {
			var oScheme = oEvent.target.closest("[data-pms-scheme]");
			if (oScheme) {
				this.fireSchemePress({
					category: oScheme.getAttribute("data-pms-scheme") || "",
					description: oScheme.textContent || ""
				});
				return;
			}

			var oState = oEvent.target.closest("[data-pms-regio]");
			if (oState) {
				this.fireStatePress({
					regio: oState.getAttribute("data-pms-regio") || "",
					stateText: oState.getAttribute("data-pms-statetext") || ""
				});
			}
		}
	});
});
