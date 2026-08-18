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
	 * Every dot gets a labelled leader line, laid out in a gutter either side of the map
	 * rather than in whatever gaps the coastline happens to leave. The SVG viewBox is widened
	 * by CALLOUT_GUTTER on both sides (see the renderer), which turns space the panel was
	 * already wasting into a dedicated label column: India is far taller than it is wide, so
	 * fitting the 760x840 map into a landscape panel letterboxes it, leaving broad empty
	 * bands left and right. Because that column always exists, a label never has to hunt for
	 * an open latitude band, and the stack spreads over the panel's whole height instead of
	 * bunching wherever the landmass happens to be narrow.
	 *
	 * Line shape: label -> horizontal run across the gutter -> one diagonal into the dot.
	 * Lines may cross land; that is what keeps the label column readable and the geometry
	 * predictable, and it is what the reviewed reference does.
	 */

	var CALLOUT_GUTTER = 360; // viewBox px added either side of the map for the label columns
	var CALLOUT_PAD = 10; // px from the gutter's outer edge the label text starts at
	var CALLOUT_ROW_HEIGHT = 40; // minimum vertical spacing between stacked callout labels
	var CALLOUT_EDGE_PAD = 24; // px kept clear at the top and bottom of a label stack
	// Set as an attribute rather than left to CSS: the layout below has to know the type size
	// to place line starts, and a stylesheet-only value would silently desync from it.
	var CALLOUT_FONT_SIZE = 22; // viewBox px
	var CALLOUT_CHAR_W = 0.56; // mean glyph advance as a fraction of font size
	var CALLOUT_LINE_GAP = 10; // px between the end of the label text and its line
	// The gutters make the viewBox this much wider than the map, so everything in it renders
	// proportionally smaller. Dot radii are scaled by it to hold their on-screen size.
	var GUTTER_SCALE = (INDIA.w + 2 * CALLOUT_GUTTER) / INDIA.w;

	/** @returns {number} approximate rendered width of a label, in viewBox px */
	function labelWidth(sLabel) {
		return sLabel.length * CALLOUT_FONT_SIZE * CALLOUT_CHAR_W;
	}

	/**
	 * Builds one callout label - "<code> <name> · <value>" - trimming the unit name to
	 * whatever the gutter can still fit. The name is the only elastic part: the code and the
	 * value are what the label exists for, so they are never shortened, and a unit whose name
	 * is long (or absent, on a backend that does not yet return one) simply shows less of it
	 * rather than overflowing the column or pushing into the map.
	 * @param {string} sCode unit code
	 * @param {string} sName unit name, may be empty
	 * @param {string} sValue the pre-formatted money string
	 * @returns {string} the label
	 */
	function calloutLabel(sCode, sName, sValue) {
		var sTail = " " + formatter.MIDDOT + " " + sValue;
		if (!sName) {
			return sCode + sTail;
		}

		var iMaxChars = Math.floor(
			(CALLOUT_GUTTER - 2 * CALLOUT_PAD - CALLOUT_LINE_GAP) / (CALLOUT_FONT_SIZE * CALLOUT_CHAR_W));
		var iRoom = iMaxChars - sCode.length - sTail.length - 1;

		if (iRoom < 3) {
			return sCode + sTail;
		}
		return sCode + " " +
			(sName.length > iRoom ? sName.slice(0, iRoom - 1).replace(/\s+$/, "") + "…" : sName) +
			sTail;
	}

	/**
	 * One-dimensional label declutter. Every row wants to sit at its own dot's latitude, but
	 * no two may end up closer than CALLOUT_ROW_HEIGHT and none may leave the panel: a
	 * forward pass pushes overlapping rows down, a backward pass pulls the stack back up if
	 * that ran it off the bottom, and a final forward pass handles a stack taller than the
	 * panel (nothing left to give - it just starts at the top and overflows the bottom).
	 * @param {object[]} aRows sorted by preferred y, each carrying {prefY}
	 * @returns {number[]} resolved y per row, in the same order
	 */
	function declutter(aRows) {
		var fMin = CALLOUT_EDGE_PAD;
		var fMax = INDIA.h - CALLOUT_EDGE_PAD;
		var aY = aRows.map(function (o) {
			return o.prefY;
		});
		var i;

		for (i = 1; i < aY.length; i++) {
			aY[i] = Math.max(aY[i], aY[i - 1] + CALLOUT_ROW_HEIGHT);
		}

		if (aY.length && aY[aY.length - 1] > fMax) {
			aY[aY.length - 1] = fMax;
			for (i = aY.length - 2; i >= 0; i--) {
				aY[i] = Math.min(aY[i], aY[i + 1] - CALLOUT_ROW_HEIGHT);
			}
		}

		if (aY.length && aY[0] < fMin) {
			aY[0] = fMin;
			for (i = 1; i < aY.length; i++) {
				aY[i] = Math.max(aY[i], aY[i - 1] + CALLOUT_ROW_HEIGHT);
			}
		}

		return aY;
	}

	/**
	 * Splits the dots between the two gutters and lays each column out.
	 *
	 * Assignment is geographic - a dot labels in the gutter on its own side of the map, so a
	 * Gujarat plant goes left and an Odisha plant goes right and neither line has to cross
	 * the country. Geography alone can overfill a column though (this customer's plants skew
	 * heavily west), so once a side holds more rows than the panel height can take at
	 * CALLOUT_ROW_HEIGHT, the dots nearest the map's centre line - the ones with the least
	 * detour to lose - move across to the emptier side.
	 * @param {object[]} aProjected dots from _buildModel's own map step: {code, x, y, r, net}
	 * @returns {object[]} {code, x1, y1, xm, ym, x2, y2, textX, textY, anchor, label}
	 */
	function buildCallouts(aProjected) {
		var fMid = INDIA.w / 2;
		var iMaxRows = Math.floor((INDIA.h - 2 * CALLOUT_EDGE_PAD) / CALLOUT_ROW_HEIGHT) + 1;

		var aAll = aProjected.map(function (d) {
			return {
				d: d,
				x: parseFloat(d.x),
				prefY: parseFloat(d.y)
			};
		});

		var aLeft = aAll.filter(function (o) {
			return o.x < fMid;
		});
		var aRight = aAll.filter(function (o) {
			return o.x >= fMid;
		});

		// Innermost dot first, so a forced move costs the shortest possible extra span.
		function rebalance(aFrom, aTo, iDir) {
			aFrom.sort(function (a, b) {
				return iDir * (b.x - a.x);
			});
			while (aFrom.length > iMaxRows && aTo.length < iMaxRows) {
				aTo.push(aFrom.shift());
			}
		}
		rebalance(aLeft, aRight, 1);
		rebalance(aRight, aLeft, -1);

		function layout(aGroup, bLeft) {
			aGroup.sort(function (a, b) {
				return a.prefY - b.prefY;
			});

			var aY = declutter(aGroup);
			var fTextX = bLeft ?
				CALLOUT_PAD - CALLOUT_GUTTER :
				INDIA.w + CALLOUT_GUTTER - CALLOUT_PAD;
			var fBendX = bLeft ? 0 : INDIA.w;

			return aGroup.map(function (o, i) {
				var d = o.d;
				var fY = aY[i];
				var sLabel = calloutLabel(d.code, d.name, formatter.money(d.gross, 1));
				var fWidth = labelWidth(sLabel) + CALLOUT_LINE_GAP;

				return {
					code: d.code,
					label: sLabel,
					// Label -> horizontal run out of the gutter -> one diagonal into the dot.
					x1: (bLeft ? fTextX + fWidth : fTextX - fWidth).toFixed(1),
					y1: fY.toFixed(1),
					xm: fBendX.toFixed(1),
					ym: fY.toFixed(1),
					x2: d.x,
					y2: d.y,
					textX: fTextX.toFixed(1),
					textY: fY.toFixed(1),
					anchor: bLeft ? "start" : "end"
				};
			});
		}

		return layout(aLeft, true).concat(layout(aRight, false));
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

		// Carried through to the legend: the per-swatch labels are each band's LOWER bound,
		// so without the real extremes on show the ramp looks like it stops at the last
		// break rather than running on to the largest value actually painted.
		var oRange = {
			min: aNums.length ? aNums[0] : NaN,
			max: aNums.length ? aNums[aNums.length - 1] : NaN
		};

		if (aUniq.length <= 1) {
			return Object.assign({
				bins: [],
				index: function () {
					return STEPS - 1;
				}
			}, oRange);
		}

		if (aUniq.length < STEPS) {
			var mIndex = {};
			aUniq.forEach(function (x, i) {
				mIndex[x] = Math.round(i * (STEPS - 1) / (aUniq.length - 1));
			});
			return Object.assign({
				bins: aUniq.slice(1),
				index: function (x) {
					return mIndex.hasOwnProperty(x) ? mIndex[x] : STEPS - 1;
				}
			}, oRange);
		}

		var aBins = [];
		for (var i = 1; i < STEPS; i++) {
			aBins.push(aNums[Math.floor(i * aNums.length / STEPS)]);
		}
		return Object.assign({
			bins: aBins,
			index: function (x) {
				return aBins.filter(function (b) {
					return x >= b;
				}).length;
			}
		}, oRange);
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
				/** Geo entity rows {Regio, StateText, AlmZone, NetValue, TaxValue, GrossValue,
				 *  PriorValue, PriorGross, DeltaPct, PlantCount, InvoiceCount}. GrossValue is
				 *  the measure this control shades, sizes and ranks by. */
				geoRows: {
					type: "object",
					defaultValue: null
				},
				/** UnitDots entity rows {UnitCode, UnitName, NetValue, TaxValue, GrossValue,
				 *  PriorValue, PriorGross, DeltaPct, Latitude, Longitude, PlantCount}. */
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
				 * low, high, noBilling, dotKey, grossBilled, netValue, taxValue, growth, share, plantsBilling,
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
				// Widened by a gutter either side when dots are shown, so the callout columns
				// have somewhere to live - see buildCallouts()'s own header. Without dots there
				// is nothing to label, so the map gets the full panel to itself.
				oRm.attr("viewBox", oControl.getShowDots() ?
					(-CALLOUT_GUTTER) + " 0 " + (INDIA.w + 2 * CALLOUT_GUTTER) + " " + INDIA.h :
					"0 0 " + INDIA.w + " " + INDIA.h);
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
						oRm.openStart("polyline");
						oRm.class("pmsMapCalloutLine");
						oRm.attr("points", o.x1 + "," + o.y1 + " " + o.xm + "," + o.ym + " " + o.x2 + "," + o.y2);
						oRm.openEnd();
						oRm.close("polyline");

						oRm.openStart("text");
						oRm.class("pmsMapCalloutText");
						oRm.attr("x", o.textX);
						oRm.attr("y", o.textY);
						oRm.attr("font-size", CALLOUT_FONT_SIZE);
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
				// Each label is its own band's lower bound, so band 0 is the smallest value
				// painted, not a vague "lowest" - one decimal, since rounding 2.4 Cr down to
				// "2 Cr" was itself part of why the scale looked wrong.
				var sLabel = bLabelled ?
					(i === 0 ?
						(isFinite(oModel.scale.min) ? formatter.money(oModel.scale.min, 1) : (t.lowest || "")) :
						formatter.money(aBins[i - 1], 1)) :
					(i === 0 ? (t.low || "") : i === STEPS - 1 ? (t.high || "") : "");

				oRm.openStart("span").class("pmsScaleSwatch").openEnd();
				oRm.openStart("span").class("pmsScaleChip")
					.style("background", "var(--pms-scale-" + i + ")").openEnd().close("span");
				oRm.openStart("span").class("pmsScaleLabel").openEnd().text(sLabel).close("span");
				oRm.close("span");
			}

			// Closes the ramp with the largest value on the map, so the top band reads as
			// "last break -> max" instead of appearing to end at the last break.
			if (isFinite(oModel.scale.max)) {
				oRm.openStart("span").class("pmsScaleSwatch").class("pmsScaleSwatch--max").openEnd();
				oRm.openStart("span").class("pmsScaleChip").class("pmsScaleChip--tick").openEnd().close("span");
				oRm.openStart("span").class("pmsScaleLabel").openEnd()
					.text(formatter.money(oModel.scale.max, 1)).close("span");
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
			// Matches the renderer's own viewBox choice - no dots, no gutters, no rescale.
			var bShowDots = this.getShowDots();
			var aSelRegios = this.getSelectedRegios() || [];
			var aSelZones = this.getSelectedZones() || [];

			var aStateNames = Object.keys(INDIA.paths);
			var mByState = {};
			var mZone = {};
			var fTotal = 0;

			aGeo.forEach(function (r) {
				// Gross is the map's headline measure - it drives the shading, the share-of-India
				// figure and the dot radii. Net and tax are carried through to the hover card
				// only, and the prior figure compared against is gross too, so the growth row
				// describes the same measure as the value above it.
				var v = num(r.GrossValue);
				var p = num(r.PriorGross);
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
					key: sZone, gross: 0, net: 0, tax: 0, prior: 0, plants: 0, invoices: 0, states: 0
				});
				z.gross += v;
				z.net += num(r.NetValue);
				z.tax += num(r.TaxValue);
				z.prior += p;
				z.plants += num(r.PlantCount);
				z.invoices += num(r.InvoiceCount);
				z.states += 1;
			});

			var oScale = quantile((bZone ?
				Object.keys(mZone).map(function (k) {
					return mZone[k].gross;
				}) :
				aStateNames.map(function (s) {
					return mByState[s] ? num(mByState[s].GrossValue) : 0;
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
					fill: fill(oRow ? num(oRow.GrossValue) : 0),
					selected: !!(oRow && aSelRegios.indexOf(oRow.Regio) >= 0)
				};
			});

			var aZones = Object.keys(INDIA.zones).map(function (sZone) {
				var o = mZone[sZone];
				return {
					key: sZone,
					fill: fill(o ? o.gross : 0),
					selected: aSelZones.indexOf(sZone) >= 0
				};
			});

			// Dot size and the callout's own figure are both gross, matching the choropleth
			// beneath them - a dot sized on net beside a state shaded on gross would invite
			// exactly the wrong comparison.
			var fDotMax = aDots.reduce(function (m, d) {
				return Math.max(m, num(d.GrossValue));
			}, 0) || 1;

			// Biggest first, so the small dots end up on top and stay clickable/hoverable.
			var aProjected = aDots.filter(function (d) {
				return num(d.Latitude) && num(d.Longitude) && num(d.GrossValue) > 0;
			}).sort(function (a, b) {
				return num(b.GrossValue) - num(a.GrossValue);
			}).map(function (d) {
				var xy = projLL(num(d.Latitude), num(d.Longitude));
				return {
					code: d.UnitCode,
					// Falls back to the code alone when a Unit has no name maintained
					// (ZSD_ZONE_PLANT-REMARKS blank).
					name: d.UnitName || "",
					x: xy[0].toFixed(1),
					y: xy[1].toFixed(1),
					r: ((2.2 + Math.sqrt(num(d.GrossValue) / fDotMax) * 6.5) *
						(bShowDots ? GUTTER_SCALE : 1)).toFixed(1),
					gross: num(d.GrossValue)
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
				// Full name here, untruncated - the hover card has the room the gutter does not.
				// Gross leads (it is what the dot is sized on), with net and tax broken out
				// beneath it and last year's gross for the comparison.
				return tipHead(t.unitPlants ? formatter.count(d.PlantCount) + " " + t.unitPlants : "",
						d.UnitCode + (d.UnitName ? " " + formatter.MIDDOT + " " + d.UnitName : "")) +
					tipRow(t.grossBilled || "", formatter.money(d.GrossValue)) +
					tipRow(t.netValue || "", formatter.money(d.NetValue)) +
					tipRow(t.taxValue || "", formatter.money(d.TaxValue)) +
					tipRow(sPrior, formatter.money(d.PriorGross)) +
					tipRow(t.growth || "", growth(d.DeltaPct));
			}

			var oZone = oTarget.closest("[data-pms-zone]");
			if (oZone) {
				var z = oModel.byZone[oZone.getAttribute("data-pms-zone")];
				if (!z) {
					return null;
				}
				return tipHead(z.states + " " + (t.zoneStates || ""), z.key) +
					tipRow(t.grossBilled || "", formatter.money(z.gross)) +
					tipRow(t.netValue || "", formatter.money(z.net)) +
					tipRow(t.taxValue || "", formatter.money(z.tax)) +
					tipRow(sPrior, formatter.money(z.prior)) +
					tipRow(t.growth || "",
						z.prior ? formatter.signedPercent((z.gross - z.prior) / z.prior * 100) : sNew) +
					tipRow(t.share || "", formatter.percent(z.gross / oModel.total * 100, 1)) +
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
				return tipHead(sEyebrow, sState) + tipRow(t.grossBilled || "", t.noBilling || "");
			}

			return tipHead(sEyebrow, sState) +
				tipRow(t.grossBilled || "", formatter.money(r.GrossValue)) +
				tipRow(t.netValue || "", formatter.money(r.NetValue)) +
				tipRow(t.taxValue || "", formatter.money(r.TaxValue)) +
				tipRow(sPrior, formatter.money(r.PriorGross)) +
				tipRow(t.growth || "", growth(r.DeltaPct)) +
				tipRow(t.share || "", formatter.percent(num(r.GrossValue) / oModel.total * 100, 1)) +
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
