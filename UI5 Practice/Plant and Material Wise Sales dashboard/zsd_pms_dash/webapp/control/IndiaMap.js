sap.ui.define([
	"sap/ui/core/Control",
	"../model/indiaGeo",
	"../model/formatter"
], function (Control, INDIA, formatter) {
	"use strict";

	/**
	 * India choropleth (state or zone granularity) with Unit-grain map dots overlaid.
	 *
	 * New control, not ported from the GRN Dashboard (GRN has no geography panel). The base
	 * map geometry (state outlines, zone union outlines, projection constants) is ported
	 * verbatim from the reviewed HTML prototype into model/indiaGeo.js - see that file's own
	 * header. Everything data-driven is real: choropleth values come from the Geo entity
	 * (state grain, OD-1) and dot positions/values come from the UnitDots entity's own
	 * Latitude/Longitude (OD-3/OD-5) via projLL() below, which reproduces the prototype's
	 * projection exactly. Nothing here is hand-geocoded.
	 *
	 * Rendered declaratively (unlike EChart's imperative instance) since a full SVG rebuild
	 * on every filter change is cheap and keeps the control stateless and simple to reason
	 * about - there is no chart-library lifecycle to manage here.
	 */

	var NO_DATA = "#F2F5F6";
	var SCALE_VALUE = ["#E3EEF0", "#AFD6DA", "#72B8C0", "#2E8B9B", "#12596E"];
	var DOT_COLOR = "#E4162A"; // matches the prototype's UNIT_DOT_COLOR exactly
	var DOT_MIN_R = 3.5;
	var DOT_MAX_R = 15;

	var PJ = INDIA.proj;

	/**
	 * Reproduces the prototype's projLL() exactly - lat/lon -> SVG x/y in the INDIA viewBox.
	 * @param {number} lat latitude
	 * @param {number} lon longitude
	 * @returns {number[]} [x, y]
	 */
	function projLL(lat, lon) {
		var my = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI;
		return [PJ.ox + (lon - PJ.minx) * PJ.S, PJ.oy + (PJ.maxy - my) * PJ.S];
	}

	/** @returns {string} a colour from the 5-step sequential ramp, by 0..1 fraction */
	function scaleColor(fFrac) {
		var i = Math.min(SCALE_VALUE.length - 1, Math.max(0, Math.round(fFrac * (SCALE_VALUE.length - 1))));
		return SCALE_VALUE[i];
	}

	function num(v) {
		var n = parseFloat(v);
		return isFinite(n) ? n : 0;
	}

	return Control.extend("com.sap.zsdpmsdash.control.IndiaMap", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				/** Geo entity rows: {Regio, StateText, AlmZone, NetValue, PriorValue, DeltaPct, PlantCount, InvoiceCount}. */
				geoRows: {
					type: "object",
					defaultValue: null
				},
				/** UnitDots entity rows: {UnitCode, NetValue, PriorValue, DeltaPct, Latitude, Longitude, PlantCount}. */
				dotRows: {
					type: "object",
					defaultValue: null
				},
				/** state | zone - which grain colours the choropleth. */
				granularity: {
					type: "string",
					defaultValue: "state"
				},
				/** Whether the Unit map dots are overlaid. */
				showDots: {
					type: "boolean",
					defaultValue: true
				},
				/** Regio code of the currently filtered state, for the selection outline. */
				selectedRegio: {
					type: "string",
					defaultValue: ""
				},
				height: {
					type: "sap.ui.core.CSSSize",
					defaultValue: "34rem"
				}
			},
			events: {
				/** Fired when a state path is clicked. */
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
				var aGeo = oControl.getGeoRows() || [];
				var aDots = oControl.getDotRows() || [];
				var bZone = oControl.getGranularity() === "zone";
				var sSelected = oControl.getSelectedRegio();

				// state name -> Geo row (INDIA.paths keys are state names, matching StateText).
				var mByState = {};
				aGeo.forEach(function (r) {
					if (r.StateText) {
						mByState[r.StateText] = r;
					}
				});

				var mZoneTotal = {};
				if (bZone) {
					aGeo.forEach(function (r) {
						var z = r.AlmZone || "";
						mZoneTotal[z] = (mZoneTotal[z] || 0) + num(r.NetValue);
					});
				}

				function valueOf(sState) {
					if (bZone) {
						var sZone = INDIA.zoneOf[sState];
						return sZone && mZoneTotal.hasOwnProperty(sZone) ? mZoneTotal[sZone] : null;
					}
					var oRow = mByState[sState];
					return oRow ? num(oRow.NetValue) : null;
				}

				var aStates = Object.keys(INDIA.paths);
				var fMax = aStates.reduce(function (m, s) {
					var v = valueOf(s);
					return v === null ? m : Math.max(m, Math.abs(v));
				}, 0) || 1;

				var fDotMax = aDots.reduce(function (m, d) {
					return Math.max(m, Math.abs(num(d.NetValue)));
				}, 0) || 1;

				oRm.openStart("div", oControl);
				oRm.class("pmsMapWrap");
				oRm.style("height", oControl.getHeight());
				oRm.openEnd();

				oRm.openStart("svg");
				oRm.attr("viewBox", "0 0 " + INDIA.w + " " + INDIA.h);
				oRm.attr("preserveAspectRatio", "xMidYMid meet");
				oRm.class("pmsMapSvg");
				oRm.openEnd();

				aStates.forEach(function (sState) {
					var v = valueOf(sState);
					var oRow = mByState[sState];
					var sFill = v === null ? NO_DATA : scaleColor(Math.abs(v) / fMax);
					var bSel = oRow && oRow.Regio === sSelected;

					oRm.openStart("path");
					oRm.class("pmsMapState");
					if (bSel) {
						oRm.class("pmsMapState--sel");
					}
					oRm.attr("data-pms-state", sState);
					if (oRow) {
						oRm.attr("data-pms-regio", oRow.Regio);
					}
					oRm.attr("fill-rule", "evenodd");
					oRm.attr("d", INDIA.paths[sState]);
					oRm.style("fill", sFill);
					var sTitle = sState + ": " + (v === null ? "No data" : formatter.money(v)) +
						(oRow ? " " + formatter.MIDDOT + " " + formatter.signedPercent(oRow.DeltaPct) + " YoY" : "");
					oRm.attr("title", sTitle);
					oRm.openEnd();
					oRm.close("path");
				});

				Object.keys(INDIA.zones).forEach(function (sZone) {
					oRm.openStart("path");
					oRm.class("pmsMapZoneDiv");
					oRm.attr("d", INDIA.zones[sZone]);
					oRm.openEnd();
					oRm.close("path");
				});

				if (oControl.getShowDots()) {
					aDots.forEach(function (d) {
						var fLat = num(d.Latitude);
						var fLon = num(d.Longitude);
						if (!fLat || !fLon) {
							return;
						}
						var xy = projLL(fLat, fLon);
						var fFrac = Math.sqrt(Math.abs(num(d.NetValue)) / fDotMax);
						var fR = DOT_MIN_R + fFrac * (DOT_MAX_R - DOT_MIN_R);

						oRm.openStart("circle");
						oRm.class("pmsMapDot");
						oRm.attr("cx", xy[0].toFixed(1));
						oRm.attr("cy", xy[1].toFixed(1));
						oRm.attr("r", fR.toFixed(1));
						oRm.attr("title", d.UnitCode + ": " + formatter.money(d.NetValue) + " " +
							formatter.MIDDOT + " " + formatter.signedPercent(d.DeltaPct) + " YoY " +
							formatter.MIDDOT + " " + formatter.count(d.PlantCount) + " plants");
						oRm.openEnd();
						oRm.close("circle");
					});
				}

				oRm.close("svg");
				oRm.close("div");
			}
		},

		onclick: function (oEvent) {
			var oTarget = oEvent.target.closest("[data-pms-state]");
			if (!oTarget) {
				return;
			}
			this.fireStatePress({
				regio: oTarget.getAttribute("data-pms-regio") || "",
				stateText: oTarget.getAttribute("data-pms-state") || ""
			});
		}
	});
});
