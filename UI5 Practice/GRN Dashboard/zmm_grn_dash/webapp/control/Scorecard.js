sap.ui.define([
	"sap/ui/core/Control"
], function (Control) {
	"use strict";

	/**
	 * The vendor scorecard - the prototype's CSS-grid table, not sap.m.Table.
	 *
	 * Rows arrive fully formatted from the controller (the control does no number
	 * formatting of its own), which keeps the Indian crore/lakh notation and the semantic
	 * thresholds in one place. Each row is a <button> so it is reachable by keyboard: the
	 * documented interaction is "click a row to filter the dashboard to that vendor".
	 *
	 * Row shape:
	 *   {name, code, qtyText, netText, valueText, rejText, rejTone, reworkText,
	 *    scoreText, scorePct, tone, selected}
	 */
	return Control.extend("com.sap.zmmgrndash.control.Scorecard", {

		metadata: {
			library: "com.sap.zmmgrndash",
			properties: {
				title: {
					type: "string",
					defaultValue: ""
				},
				subtitle: {
					type: "string",
					defaultValue: ""
				},
				badge: {
					type: "string",
					defaultValue: ""
				},
				/** Seven column headers, left to right. */
				columns: {
					type: "object",
					defaultValue: null
				},
				rows: {
					type: "object",
					defaultValue: null
				},
				noDataText: {
					type: "string",
					defaultValue: ""
				},
				span: {
					type: "int",
					defaultValue: 12
				}
			},
			events: {
				rowPress: {
					parameters: {
						/** the row object that was clicked */
						row: {
							type: "object"
						},
						/** its index in `rows` */
						index: {
							type: "int"
						}
					}
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var aRows = oControl.getRows() || [];
				var aColumns = oControl.getColumns() || [];

				oRm.openStart("div", oControl);
				oRm.class("grnCard");
				oRm.class("grnScoreCard");
				oRm.class("grnSpan" + oControl.getSpan());
				oRm.openEnd();

				oRm.openStart("div").class("grnCardHead").openEnd();
				oRm.openStart("div").class("grnCardHeadText").openEnd();
				oRm.openStart("div").class("grnCardTitle").openEnd().text(oControl.getTitle()).close("div");
				if (oControl.getSubtitle()) {
					oRm.openStart("div").class("grnCardSub").openEnd().text(oControl.getSubtitle()).close("div");
				}
				oRm.close("div");
				oRm.openStart("div").class("grnCardActions").openEnd();
				if (oControl.getBadge()) {
					oRm.openStart("span").class("grnTag").openEnd().text(oControl.getBadge()).close("span");
				}
				oRm.close("div");
				oRm.close("div");

				if (!aRows.length) {
					oRm.openStart("div").class("grnEmpty").openEnd()
						.text(oControl.getNoDataText()).close("div");
					oRm.close("div");
					return;
				}

				oRm.openStart("div").class("grnScoreScroll").openEnd();
				oRm.openStart("div").class("grnScoreTable").openEnd();

				oRm.openStart("div").class("grnScoreHead").openEnd();
				aColumns.forEach(function (sColumn, i) {
					oRm.openStart("div");
					// Everything except the vendor and the score bar is right-aligned.
					if (i > 0 && i < aColumns.length - 1) {
						oRm.class("grnNum");
					}
					oRm.openEnd().text(sColumn).close("div");
				});
				oRm.close("div");

				aRows.forEach(function (oRow, i) {
					oRm.openStart("button")
						.class("grnScoreRow")
						.class("grnTone--" + (oRow.tone || "accent"))
						.attr("type", "button")
						.attr("data-grn-row", String(i));
					if (oRow.selected) {
						oRm.class("grnScoreRow--selected");
					}
					oRm.openEnd();

					oRm.openStart("div").class("grnScoreVendor").openEnd();
					oRm.openStart("span").class("grnScoreDot").openEnd().close("span");
					oRm.openStart("span").class("grnScoreName").openEnd().text(oRow.name || "").close("span");
					if (oRow.code) {
						oRm.openStart("span").class("grnScoreCode").openEnd().text(oRow.code).close("span");
					}
					oRm.close("div");

					oRm.openStart("div").class("grnNum").openEnd().text(oRow.qtyText || "").close("div");
					oRm.openStart("div").class("grnNum").class("grnNum--muted").openEnd()
						.text(oRow.netText || "").close("div");
					oRm.openStart("div").class("grnNum").openEnd().text(oRow.valueText || "").close("div");

					// The rejection rate carries its own tone, so it opens a nested scope.
					oRm.openStart("div")
						.class("grnNum")
						.class("grnNum--tone")
						.class("grnTone--" + (oRow.rejTone || "none"))
						.openEnd()
						.text(oRow.rejText || "")
						.close("div");

					oRm.openStart("div").class("grnNum").class("grnNum--muted").openEnd()
						.text(oRow.reworkText || "").close("div");

					oRm.openStart("div").class("grnScoreValue").openEnd();
					oRm.openStart("div").class("grnBar").openEnd();
					oRm.openStart("div").class("grnBarFill")
						.style("width", Math.max(0, Math.min(100, oRow.scorePct || 0)) + "%")
						.openEnd().close("div");
					oRm.close("div");
					oRm.openStart("span").class("grnScoreNumber").openEnd()
						.text(oRow.scoreText || "").close("span");
					oRm.close("div");

					oRm.close("button");
				});

				oRm.close("div");
				oRm.close("div");
				oRm.close("div");
			}
		},

		onclick: function (oEvent) {
			var oRowDom = oEvent.target.closest("[data-grn-row]");
			if (!oRowDom) {
				return;
			}
			var iIndex = parseInt(oRowDom.getAttribute("data-grn-row"), 10);
			var aRows = this.getRows() || [];
			if (aRows[iIndex]) {
				this.fireRowPress({
					row: aRows[iIndex],
					index: iIndex
				});
			}
		}
	});
});
