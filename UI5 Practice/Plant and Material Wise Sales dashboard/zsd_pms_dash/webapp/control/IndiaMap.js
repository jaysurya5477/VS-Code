sap.ui.define([
	"sap/ui/core/Control",
	"sap/base/security/encodeXML",
	"../model/indiaGeo",
	"../model/formatter"
], function (Control, encodeXML, INDIA, formatter) {
	"use strict";

	/**
	 * India choropleth (state or zone granularity) with Unit map dots overlaid, matching the
	 * reviewed prototype's map panel (../../../Final Template/sales-dashboard-india_claude
	 * V8.html, renderMap()) feature for feature:
	 *
	 *   * quantile colour scale, not linear - a handful of large states would otherwise wash
	 *     the whole map out to the palest step
	 *   * zone granularity paints the zone union outlines, it does not just recolour states
	 *   * dot radius 2.2 + sqrt(v / max) * 6.5, biggest drawn first so small dots stay on top
	 *   * hover card with net billed, prior FY, growth, share of India and plants billing
	 *   * legend labelled with the actual quantile breaks, plus "no billing" and the dot key
	 *
	 * The base geometry (state paths, zone unions, projection constants, state abbreviations)
	 * is model/indiaGeo.js, ported verbatim from the prototype. Everything data-driven is
	 * real: choropleth values come from the Geo entity, dot positions from the UnitDots
	 * entity's own Latitude/Longitude (OD-3/OD-5). Nothing here is hand-geocoded.
	 *
	 * Fills are emitted as `var(--pms-scale-N)` references rather than resolved hex, so the
	 * light and dark ramps both live in css/style.css and a theme switch needs no redraw.
	 */

	var STEPS = 5; // colour steps in the sequential ramp (--pms-scale-0 .. --pms-scale-4)
	var PJ = INDIA.proj;

	/** Shared hover card. One map on the page, so one element, created on first hover. */
	var oTip = null;

	function tipElement() {
		if (!oTip) {
			oTip = document.createElement("div");
			oTip.className = "pmsTip";
			document.body.appendChild(oTip);
		}
		return oTip;
	}

	function hideTip() {
		if (oTip) {
			oTip.style.opacity = "0";
		}
	}

	/** Prototype moveTip(): offset from the cursor, flipped when it would leave the viewport. */
	function moveTip(oEvent) {
		var oEl = tipElement();
		var oRect = oEl.getBoundingClientRect();
		var x = oEvent.clientX + 14;
		var y = oEvent.clientY + 14;

		if (x + oRect.width > window.innerWidth - 8) {
			x = oEvent.clientX - oRect.width - 14;
		}
		if (y + oRect.height > window.innerHeight - 8) {
			y = oEvent.clientY - oRect.height - 14;
		}
		oEl.style.left = x + "px";
		oEl.style.top = y + "px";
	}

	function showTip(oEvent, sHtml) {
		var oEl = tipElement();
		oEl.innerHTML = sHtml;
		oEl.style.opacity = "1";
		moveTip(oEvent);
	}

	function num(v) {
		var n = parseFloat(v);
		return isFinite(n) ? n : 0;
	}

	function projLL(fLat, fLon) {
		var my = Math.log(Math.tan(Math.PI / 4 + fLat * Math.PI / 360)) * 180 / Math.PI;
		return [PJ.ox + (fLon - PJ.minx) * PJ.S, PJ.oy + (PJ.maxy - my) * PJ.S];
	}

	/*
	 * Leader-line callouts for the map dots.
	 *
	 * The 760x840 viewBox is a wedge, not a rectangle: the landmass spans nearly the full
	 * width in the middle latitudes (the north-east panhandle reaches x~790), but is much
	 * narrower at the very north (Kashmir) and very south (the Tamil Nadu/Kerala tip) - which
	 * is exactly the open space either side of the card the dots otherwise waste. A dot that
	 * falls in one of those narrow bands gets a thin leader line out to a label in the margin;
	 * a dot in the wide middle band has nowhere to put one and stays a plain hoverable dot,
	 * same as before.
	 */

	// Islands far from the mainland (Andaman & Nicobar, Lakshadweep) would otherwise make
	// every latitude band look "full width" and defeat the whole margin calculation.
	var MARGIN_SKIP_STATES = {"Andaman and Nicobar Islands": true, "Lakshadweep": true};
	var MARGIN_BAND_HEIGHT = 20; // px of viewBox y per band sampled for land extent
	var MARGIN_MIN_GAP = 95; // minimum clear margin (px) a side needs to carry a label
	var MARGIN_INSET = 6; // px from the viewBox edge the label text sits at
	var CALLOUT_ROW_HEIGHT = 24; // minimum vertical spacing between stacked callout labels

	/** Computed once and reused by every IndiaMap instance - the geometry never changes. */
	var aMarginBands = null;

	/** @returns {object[]} one {minX, maxX} entry per MARGIN_BAND_HEIGHT-tall horizontal band */
	function marginBands() {
		if (aMarginBands) {
			return aMarginBands;
		}

		var iBandCount = Math.ceil(INDIA.h / MARGIN_BAND_HEIGHT);
		var aBands = [];
		for (var i = 0; i < iBandCount; i++) {
			aBands.push({minX: Infinity, maxX: -Infinity});
		}

		Object.keys(INDIA.paths).forEach(function (sState) {
			if (MARGIN_SKIP_STATES[sState]) {
				return;
			}
			var reCoord = /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
			var oMatch;
			while ((oMatch = reCoord.exec(INDIA.paths[sState])) !== null) {
				var fX = parseFloat(oMatch[1]);
				var fY = parseFloat(oMatch[2]);
				var iBand = Math.min(iBandCount - 1, Math.max(0, Math.floor(fY / MARGIN_BAND_HEIGHT)));
				if (fX < aBands[iBand].minX) {
					aBands[iBand].minX = fX;
				}
				if (fX > aBands[iBand].maxX) {
					aBands[iBand].maxX = fX;
				}
			}
		});

		// A band with no sampled land at all (shouldn't happen within India.h, but a static
		// geometry file predates this code) is fully open on both sides, not zero-width.
		aBands.forEach(function (o) {
			if (o.minX === Infinity) {
				o.minX = INDIA.w;
				o.maxX = 0;
			}
		});

		aMarginBands = aBands;
		return aBands;
	}

	/** @returns {object} {left, right} clear margin in viewBox px at a given y */
	function marginAt(fY) {
		var aBands = marginBands();
		var iBand = Math.min(aBands.length - 1, Math.max(0, Math.floor(fY / MARGIN_BAND_HEIGHT)));
		return {
			left: aBands[iBand].minX,
			right: INDIA.w - aBands[iBand].maxX
		};
	}

	/**
	 * Assigns each dot that has enough clear margin on one side to a left/right group, then
	 * stacks that group's labels top-to-bottom with a minimum row height - a dot's own y is
	 * the label's preferred position, pushed down only far enough to clear the label above it.
	 * @param {object[]} aProjected dots from _buildModel's own map step: {code, x, y, r, net}
	 * @returns {object[]} {code, x1, y1, x2, y2, textX, textY, anchor, label}
	 */
	function buildCallouts(aProjected) {
		var aLeft = [];
		var aRight = [];

		aProjected.forEach(function (d) {
			var oMargin = marginAt(parseFloat(d.y));
			var bLeft = oMargin.left >= oMargin.right;
			var fGap = bLeft ? oMargin.left : oMargin.right;
			if (fGap < MARGIN_MIN_GAP) {
				return;
			}
			(bLeft ? aLeft : aRight).push(d);
		});

		function layout(aGroup, sSide) {
			aGroup.sort(function (a, b) {
				return parseFloat(a.y) - parseFloat(b.y);
			});

			var fPrevY = -Infinity;
			var fLineX = sSide === "left" ? MARGIN_INSET + 4 : INDIA.w - MARGIN_INSET - 4;
			var fTextX = sSide === "left" ? MARGIN_INSET : INDIA.w - MARGIN_INSET;

			return aGroup.map(function (d) {
				var fY = Math.max(parseFloat(d.y), fPrevY + CALLOUT_ROW_HEIGHT);
				fPrevY = fY;

				return {
					code: d.code,
					label: d.code + " " + formatter.MIDDOT + " " + formatter.money(d.net, 1),
					x1: d.x,
					y1: d.y,
					x2: fLineX.toFixed(1),
					y2: fY.toFixed(1),
					textX: fTextX.toFixed(1),
					textY: fY.toFixed(1),
					anchor: sSide === "left" ? "start" : "end"
				};
			});
		}

		return layout(aLeft, "left").concat(layout(aRight, "right"));
	}

	/**
	 * Prototype quantile(): equal-count bins rather than equal-width ones. Degenerate inputs
	 * (one distinct value, or fewer distinct values than steps) spread what there is across
	 * the ramp instead of collapsing to a single colour.
	 * @param {number[]} aValues the positive values being classified
	 * @returns {object} {bins, index(value)} - bins are the lower break of steps 1..n-1
	 */
	function quantile(aValues) {
		var aNums = aValues.filter(function (x) {
			return isFinite(x);
		}).sort(function (a, b) {
			return a - b;
		});

		var aUniq = aNums.filter(function (x, i) {
			return i === 0 || x !== aNums[i - 1];
		});

		if (aUniq.length <= 1) {
			return {
				bins: [],
				index: function () {
					return STEPS - 1;
				}
			};
		}

		if (aUniq.length < STEPS) {
			var mIndex = {};
			aUniq.forEach(function (x, i) {
				mIndex[x] = Math.round(i * (STEPS - 1) / (aUniq.length - 1));
			});
			return {
				bins: aUniq.slice(1),
				index: function (x) {
					return mIndex.hasOwnProperty(x) ? mIndex[x] : STEPS - 1;
				}
			};
		}

		var aBins = [];
		for (var i = 1; i < STEPS; i++) {
			aBins.push(aNums[Math.floor(i * aNums.length / STEPS)]);
		}
		return {
			bins: aBins,
			index: function (x) {
				return aBins.filter(function (b) {
					return x >= b;
				}).length;
			}
		};
	}

	/** @returns {string} one row of the hover card */
	function tipRow(sLabel, sValue) {
		return "<span class=\"pmsTipRow\"><span>" + encodeXML(sLabel) +
			"</span><span>" + encodeXML(sValue) + "</span></span>";
	}

	function tipHead(sEyebrow, sName) {
		return "<span class=\"pmsTipHead\">" + encodeXML(sEyebrow) + "</span>" +
			"<span class=\"pmsTipName\">" + encodeXML(sName) + "</span>";
	}

	return Control.extend("com.sap.zsdpmsdash.control.IndiaMap", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				/** Geo entity rows {Regio, StateText, AlmZone, NetValue, PriorValue, DeltaPct, PlantCount, InvoiceCount}. */
				geoRows: {
					type: "object",
					defaultValue: null
				},
				/** UnitDots entity rows {UnitCode, NetValue, PriorValue, DeltaPct, Latitude, Longitude, PlantCount}. */
				dotRows: {
					type: "object",
					defaultValue: null
				},
				/** state | zone - which grain the choropleth is painted at. */
				granularity: {
					type: "string",
					defaultValue: "state"
				},
				showDots: {
					type: "boolean",
					defaultValue: true
				},
				/** Regio codes selected in the State filter, outlined on the map. */
				selectedRegios: {
					type: "object",
					defaultValue: null
				},
				/** Zone names selected in the Zone filter, outlined in zone granularity. */
				selectedZones: {
					type: "object",
					defaultValue: null
				},
				/** Prior fiscal year, e.g. "FY 2025" - the hover card's comparison row label. */
				priorFyLabel: {
					type: "string",
					defaultValue: ""
				},
				/**
				 * Visible strings, so this control stays i18n-free. Keys: scaleCap, lowest,
				 * low, high, noBilling, dotKey, netBilled, growth, share, plantsBilling,
				 * invoices, zoneStates, unitPlants, newLabel.
				 */
				texts: {
					type: "object",
					defaultValue: null
				},
				height: {
					type: "sap.ui.core.CSSSize",
					defaultValue: "35rem"
				}
			},
			events: {
				/** A state path was clicked. */
				statePress: {
					parameters: {
						regio: {
							type: "string"
						},
						stateText: {
							type: "string"
						}
					}
				},
				/** A zone path was clicked (zone granularity only). */
				zonePress: {
					parameters: {
						zone: {
							type: "string"
						}
					}
				}
			}
		},

		/* ================================================================== */
		/* Rendering                                                          */
		/* ================================================================== */

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				var oModel = oControl._model();
				var bZone = oModel.isZone;

				oRm.openStart("div", oControl);
				oRm.class("pmsMapPanel");
				oRm.openEnd();

				oRm.openStart("div").class("pmsMapWrap").style("height", oControl.getHeight()).openEnd();
				oRm.openStart("svg");
				oRm.attr("viewBox", "0 0 " + INDIA.w + " " + INDIA.h);
				oRm.attr("preserveAspectRatio", "xMidYMid meet");
				oRm.attr("role", "img");
				oRm.class("pmsMapSvg");
				oRm.openEnd();

				if (bZone) {
					oModel.zones.forEach(function (o) {
						oRm.openStart("path");
						oRm.class("pmsMapArea");
						if (o.selected) {
							oRm.class("pmsMapArea--sel");
						}
						oRm.attr("data-pms-zone", o.key);
						oRm.attr("fill-rule", "evenodd");
						oRm.attr("d", INDIA.zones[o.key]);
						oRm.style("fill", o.fill);
						oRm.openEnd();
						oRm.close("path");
					});
				} else {
					oModel.states.forEach(function (o) {
						oRm.openStart("path");
						oRm.class("pmsMapArea");
						if (o.selected) {
							oRm.class("pmsMapArea--sel");
						}
						oRm.attr("data-pms-state", o.key);
						oRm.attr("data-pms-regio", o.regio);
						oRm.attr("fill-rule", "evenodd");
						oRm.attr("d", INDIA.paths[o.key]);
						oRm.style("fill", o.fill);
						oRm.openEnd();
						oRm.close("path");
					});

					// Zone boundaries drawn over the states, as the prototype does.
					Object.keys(INDIA.zones).forEach(function (sZone) {
						oRm.openStart("path");
						oRm.class("pmsMapZoneDiv");
						oRm.attr("d", INDIA.zones[sZone]);
						oRm.openEnd();
						oRm.close("path");
					});
				}

				if (oControl.getShowDots()) {
					oModel.dots.forEach(function (o) {
						oRm.openStart("circle");
						oRm.class("pmsMapDot");
						oRm.attr("data-pms-unit", o.code);
						oRm.attr("cx", o.x);
						oRm.attr("cy", o.y);
						oRm.attr("r", o.r);
						oRm.openEnd();
						oRm.close("circle");
					});

					// Leader-line labels for whichever dots have room in the map's own open
					// margins (north/south, where the landmass narrows) - see buildCallouts()'s
					// own header for why this only ever covers some dots, not all of them.
					oModel.callouts.forEach(function (o) {
						oRm.openStart("line");
						oRm.class("pmsMapCalloutLine");
						oRm.attr("x1", o.x1);
						oRm.attr("y1", o.y1);
						oRm.attr("x2", o.x2);
						oRm.attr("y2", o.y2);
						oRm.openEnd();
						oRm.close("line");

						oRm.openStart("text");
						oRm.class("pmsMapCalloutText");
						oRm.attr("x", o.textX);
						oRm.attr("y", o.textY);
						oRm.attr("text-anchor", o.anchor);
						oRm.attr("dominant-baseline", "middle");
						oRm.openEnd();
						oRm.text(o.label);
						oRm.close("text");
					});
				}

				oRm.close("svg");
				oRm.close("div");

				oControl._renderLegend(oRm, oModel);

				oRm.close("div");
			}
		},

		/**
		 * The quantile-labelled colour scale, the no-billing swatch and the dot key.
		 * @param {sap.ui.core.RenderManager} oRm the render manager
		 * @param {object} oModel the view model built by _model()
		 * @private
		 */
		_renderLegend: function (oRm, oModel) {
			var t = this.getTexts() || {};
			var aBins = oModel.scale.bins;
			var bLabelled = aBins.length === STEPS - 1;

			oRm.openStart("div").class("pmsMapScale").openEnd();
			oRm.openStart("span").class("pmsScaleCap").openEnd().text(t.scaleCap || "").close("span");

			for (var i = 0; i < STEPS; i++) {
				var sLabel = bLabelled ?
					(i === 0 ? (t.lowest || "") : formatter.money(aBins[i - 1], 0)) :
					(i === 0 ? (t.low || "") : i === STEPS - 1 ? (t.high || "") : "");

				oRm.openStart("span").class("pmsScaleSwatch").openEnd();
				oRm.openStart("span").class("pmsScaleChip")
					.style("background", "var(--pms-scale-" + i + ")").openEnd().close("span");
				oRm.openStart("span").class("pmsScaleLabel").openEnd().text(sLabel).close("span");
				oRm.close("span");
			}

			oRm.openStart("span").class("pmsScaleSwatch").openEnd();
			oRm.openStart("span").class("pmsScaleChip").class("pmsScaleChip--none").openEnd().close("span");
			oRm.openStart("span").class("pmsScaleLabel").openEnd().text(t.noBilling || "").close("span");
			oRm.close("span");

			if (this.getShowDots()) {
				oRm.openStart("span").class("pmsMapDotKey").openEnd();
				oRm.openStart("span").class("pmsMapDotKeyChip").openEnd().close("span");
				oRm.text(t.dotKey || "");
				oRm.close("span");
			}

			oRm.close("div");
		},

		/* ================================================================== */
		/* View model                                                         */
		/* ================================================================== */

		/** Dropped on every re-render, so the hover card never reads stale aggregates. @private */
		onBeforeRendering: function () {
			this._oModelCache = null;
		},

		/**
		 * Folds the two entity row sets into everything the renderer and the hover card
		 * need. Memoised: the renderer builds it once per render and every hover afterwards
		 * reuses it rather than re-aggregating 36 states per mouse move.
		 * @returns {object} the render model
		 * @private
		 */
		_model: function () {
			if (!this._oModelCache) {
				this._oModelCache = this._buildModel();
			}
			return this._oModelCache;
		},

		/** @returns {object} the render model @private */
		_buildModel: function () {
			var aGeo = this.getGeoRows() || [];
			var aDots = this.getDotRows() || [];
			var bZone = this.getGranularity() === "zone";
			var aSelRegios = this.getSelectedRegios() || [];
			var aSelZones = this.getSelectedZones() || [];

			var aStateNames = Object.keys(INDIA.paths);
			var mByState = {};
			var mZone = {};
			var fTotal = 0;

			aGeo.forEach(function (r) {
				var v = num(r.NetValue);
				var p = num(r.PriorValue);
				fTotal += v;

				var sCanonical = INDIA.resolveState(r.StateText);
				if (sCanonical) {
					mByState[sCanonical] = r;
				}

				// Zone comes from INDIA.zoneOfState(), not from AlmZone - see this file's own
				// header comment for why AlmZone cannot be trusted for this.
				var sZone = INDIA.zoneOfState(r.StateText);
				if (!sZone) {
					return;
				}
				var z = mZone[sZone] || (mZone[sZone] = {
					key: sZone, net: 0, prior: 0, plants: 0, invoices: 0, states: 0
				});
				z.net += v;
				z.prior += p;
				z.plants += num(r.PlantCount);
				z.invoices += num(r.InvoiceCount);
				z.states += 1;
			});

			var oScale = quantile((bZone ?
				Object.keys(mZone).map(function (k) {
					return mZone[k].net;
				}) :
				aStateNames.map(function (s) {
					return mByState[s] ? num(mByState[s].NetValue) : 0;
				})
			).filter(function (v) {
				return v > 0;
			}));

			var fill = function (fValue) {
				return fValue > 0 ? "var(--pms-scale-" + oScale.index(fValue) + ")" : "var(--pms-nodata)";
			};

			var aStates = aStateNames.map(function (sState) {
				var oRow = mByState[sState];
				return {
					key: sState,
					regio: oRow ? oRow.Regio : "",
					fill: fill(oRow ? num(oRow.NetValue) : 0),
					selected: !!(oRow && aSelRegios.indexOf(oRow.Regio) >= 0)
				};
			});

			var aZones = Object.keys(INDIA.zones).map(function (sZone) {
				var o = mZone[sZone];
				return {
					key: sZone,
					fill: fill(o ? o.net : 0),
					selected: aSelZones.indexOf(sZone) >= 0
				};
			});

			var fDotMax = aDots.reduce(function (m, d) {
				return Math.max(m, num(d.NetValue));
			}, 0) || 1;

			// Biggest first, so the small dots end up on top and stay clickable/hoverable.
			var aProjected = aDots.filter(function (d) {
				return num(d.Latitude) && num(d.Longitude) && num(d.NetValue) > 0;
			}).sort(function (a, b) {
				return num(b.NetValue) - num(a.NetValue);
			}).map(function (d) {
				var xy = projLL(num(d.Latitude), num(d.Longitude));
				return {
					code: d.UnitCode,
					x: xy[0].toFixed(1),
					y: xy[1].toFixed(1),
					r: (2.2 + Math.sqrt(num(d.NetValue) / fDotMax) * 6.5).toFixed(1),
					net: num(d.NetValue)
				};
			});

			return {
				isZone: bZone,
				states: aStates,
				zones: aZones,
				dots: aProjected,
				callouts: buildCallouts(aProjected),
				scale: oScale,
				byState: mByState,
				byZone: mZone,
				byUnit: aDots.reduce(function (m, d) {
					m[d.UnitCode] = d;
					return m;
				}, {}),
				total: fTotal || 1
			};
		},

		/* ================================================================== */
		/* Hover card                                                         */
		/* ================================================================== */

		/** @returns {string|null} the hover card markup for whatever is under the cursor @private */
		_tipFor: function (oTarget) {
			var t = this.getTexts() || {};
			var oModel = this._model();
			var sPrior = this.getPriorFyLabel();
			var sNew = t.newLabel || "new";

			var growth = function (v) {
				var f = parseFloat(v);
				return isFinite(f) ? formatter.signedPercent(f) : sNew;
			};

			var oUnit = oTarget.closest("[data-pms-unit]");
			if (oUnit) {
				var d = oModel.byUnit[oUnit.getAttribute("data-pms-unit")];
				if (!d) {
					return null;
				}
				return tipHead(t.unitPlants ? formatter.count(d.PlantCount) + " " + t.unitPlants : "", d.UnitCode) +
					tipRow(t.netBilled || "", formatter.money(d.NetValue)) +
					tipRow(sPrior, formatter.money(d.PriorValue)) +
					tipRow(t.growth || "", growth(d.DeltaPct));
			}

			var oZone = oTarget.closest("[data-pms-zone]");
			if (oZone) {
				var z = oModel.byZone[oZone.getAttribute("data-pms-zone")];
				if (!z) {
					return null;
				}
				return tipHead(z.states + " " + (t.zoneStates || ""), z.key) +
					tipRow(t.netBilled || "", formatter.money(z.net)) +
					tipRow(sPrior, formatter.money(z.prior)) +
					tipRow(t.growth || "", z.prior ? formatter.signedPercent((z.net - z.prior) / z.prior * 100) : sNew) +
					tipRow(t.share || "", formatter.percent(z.net / oModel.total * 100, 1)) +
					tipRow(t.plantsBilling || "", formatter.count(z.plants)) +
					tipRow(t.invoices || "", formatter.count(z.invoices));
			}

			var oState = oTarget.closest("[data-pms-state]");
			if (!oState) {
				return null;
			}

			var sState = oState.getAttribute("data-pms-state");
			var r = oModel.byState[sState];
			var sEyebrow = (INDIA.abbr[sState] || "") +
				(INDIA.zoneOf[sState] ? " " + formatter.MIDDOT + " " + INDIA.zoneOf[sState] : "");

			if (!r) {
				return tipHead(sEyebrow, sState) + tipRow(t.netBilled || "", t.noBilling || "");
			}

			return tipHead(sEyebrow, sState) +
				tipRow(t.netBilled || "", formatter.money(r.NetValue)) +
				tipRow(sPrior, formatter.money(r.PriorValue)) +
				tipRow(t.growth || "", growth(r.DeltaPct)) +
				tipRow(t.share || "", formatter.percent(num(r.NetValue) / oModel.total * 100, 1)) +
				tipRow(t.plantsBilling || "", formatter.count(r.PlantCount)) +
				tipRow(t.invoices || "", formatter.count(r.InvoiceCount));
		},

		/* ================================================================== */
		/* Events                                                             */
		/* ================================================================== */

		onmouseover: function (oEvent) {
			var sHtml = this._tipFor(oEvent.target);
			if (sHtml) {
				showTip(oEvent, sHtml);
			} else {
				hideTip();
			}
		},

		onmousemove: function (oEvent) {
			if (oTip && oTip.style.opacity === "1") {
				moveTip(oEvent);
			}
		},

		onmouseout: function (oEvent) {
			// Leaving one path for another fires mouseout before the next mouseover; only
			// hide when the cursor has actually left the map.
			if (!oEvent.relatedTarget || !this.getDomRef() ||
				!this.getDomRef().contains(oEvent.relatedTarget)) {
				hideTip();
			}
		},

		onclick: function (oEvent) {
			hideTip();

			var oZone = oEvent.target.closest("[data-pms-zone]");
			if (oZone) {
				this.fireZonePress({
					zone: oZone.getAttribute("data-pms-zone") || ""
				});
				return;
			}

			var oState = oEvent.target.closest("[data-pms-state]");
			if (oState) {
				this.fireStatePress({
					regio: oState.getAttribute("data-pms-regio") || "",
					stateText: oState.getAttribute("data-pms-state") || ""
				});
			}
		},

		exit: function () {
			hideTip();
		}
	});
});
