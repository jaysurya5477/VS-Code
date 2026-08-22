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
	 *   * dot radius 2.2 + sqrt(v / max) * 6.5, biggest drawn first so small dots stay on top
	 *   * hover card kept to three rows - gross, then the net and tax it is made of
	 *   * legend labelled with the actual quantile breaks, plus "no billing" and the dot key
	 *
	 * The zone view departs from the prototype, which shaded each zone's states by value the
	 * same way the state view shades states. Here it is a BASE MAP instead: every region takes
	 * one flat land colour with its borders drawn, and the Unit dots carry the colour, one hue
	 * per zone (ZONE_COLORS), with the legend below the map naming each one - so the panel
	 * answers "which zone is this unit in" without two encodings of the same zoning competing.
	 * Hide the dots and the regions take the zoning back, tinted in the same zone colours.
	 * Which zone a region belongs to comes from deriveStatePieces() below - live off each Unit
	 * dot's own AlmZone (ZSD_ZONE_PLANT), not from the state-grain Geo entity's AlmZone or the
	 * state's geography - see that function's own comment for why, and for how a state whose
	 * own two plants sit in different zones (Madhya Pradesh: Ujjain West, Jabalpur Central) is
	 * split between them instead of painted whole in one.
	 *
	 * The base geometry (state paths, zone unions, projection constants, state abbreviations)
	 * is model/indiaGeo.js, ported verbatim from the prototype. Everything data-driven is
	 * real: choropleth values come from the Geo entity, dot positions AND each Unit's own
	 * zone from the UnitDots entity's Latitude/Longitude/AlmZone (OD-3/OD-5/2026-08-22).
	 * Nothing here is hand-geocoded.
	 *
	 * Fills are emitted as `var(--pms-scale-N)` references rather than resolved hex, so the
	 * light and dark ramps both live in css/style.css and a theme switch needs no redraw.
	 */

	var STEPS = 5; // colour steps in the sequential ramp (--pms-scale-0 .. --pms-scale-4)
	var PJ = INDIA.proj;

	/**
	 * Zone -> its own colour token, for the zone view: there the map is one flat land colour
	 * with its borders drawn and the Unit DOTS carry the colour, one hue per zone, with the
	 * legend below the map naming each one. Keyed by formatter.zoneKey()'s Title Case, and
	 * listed in the order the legend shows - North to South, the order the business names its
	 * zones in, not by value, so a zone keeps its colour and its place when the numbers move.
	 * The hues themselves and why they are these five and not the chart ramp: css/style.css's
	 * --pms-zone-* block. A zone name this table does not know (a sixth zone maintained on
	 * ZSD_ZONE_PLANT) falls back to the choropleth's own dot colour rather than borrowing
	 * another zone's identity.
	 */
	var ZONE_COLORS = [
		{zone: "North", token: "--pms-zone-north"},
		{zone: "West", token: "--pms-zone-west"},
		{zone: "Central", token: "--pms-zone-central"},
		{zone: "East", token: "--pms-zone-east"},
		{zone: "South", token: "--pms-zone-south"}
	];

	/** @returns {string} the CSS colour reference for one zone's dots and legend chip */
	function zoneColor(sZone) {
		var oHit = ZONE_COLORS.filter(function (o) {
			return o.zone === sZone;
		})[0];
		return "var(" + (oHit ? oHit.token : "--pms-dot") + ")";
	}

	/**
	 * Baseline geographic zone per state - the "standard" Indian zonal classification (see
	 * the reviewed reference map), used to colour a state's choropleth polygon before any
	 * plant-level correction below is applied. Gujarat, Maharashtra and Goa are their own
	 * West zone rather than folding into Central, and North East states keep their own
	 * geometry rather than merging into East (see indiaGeo.js's own merge, which this table
	 * deliberately does not repeat).
	 */
	var ZONE_OF_STATE_BASELINE = {
		"Jammu and Kashmir": "North", "Ladakh": "North", "Himachal Pradesh": "North",
		"Punjab": "North", "Uttarakhand": "North", "Haryana": "North", "Delhi": "North",
		"Uttar Pradesh": "North", "Rajasthan": "North", "Chandigarh": "North",

		"Gujarat": "West", "Maharashtra": "West", "Goa": "West",
		"Dadra and Nagar Haveli and Daman and Diu": "West",

		"Madhya Pradesh": "Central", "Chhattisgarh": "Central",

		"Bihar": "East", "Jharkhand": "East", "West Bengal": "East", "Odisha": "East",
		"Sikkim": "East", "Assam": "East", "Meghalaya": "East", "Arunachal Pradesh": "East",
		"Nagaland": "East", "Manipur": "East", "Mizoram": "East", "Tripura": "East",

		"Telangana": "South", "Andhra Pradesh": "South", "Karnataka": "South",
		"Tamil Nadu": "South", "Kerala": "South", "Puducherry": "South",
		"Lakshadweep": "South", "Andaman and Nicobar Islands": "South"
	};

	/**
	 * Which canonical state(s) each plant below physically/organisationally covers - from the
	 * SAP screen's own Unit description (e.g. "HQ (UP+UK)") and each plant's own Latitude/
	 * Longitude. Plant 2000 sits at 26.53,80.23 (Kanpur, Uttar Pradesh) but its Unit label
	 * covers Uttarakhand too, so both states pick up its zone below. ZSD_ZONE_PLANT itself
	 * has no state column - only Plant/Zone/Unit/Lat/Long (see ZCL_PMS_DASH_QUERY=>
	 * get_unit_dots and ZSD_PMS_UNIT_DOTS-AlmZone, 2026-08-22) - so this mapping stays a
	 * hardcoded, manually-maintained fact rather than something read live. Add a plant here
	 * (matching the SAP screen's Plant column) for deriveStatePieces() below to pick it up.
	 */
	var PLANT_STATES = {
		"2000": ["Uttar Pradesh", "Uttarakhand"],           // HQ (UP+UK), physically Kanpur
		"3100": ["Madhya Pradesh"],                         // AAPC Jabalpur
		"4901": ["Chhattisgarh"],                           // RMC Raipur
		"3300": ["Madhya Pradesh"],                         // RMC Ujjain
		"4500": ["Maharashtra"],                            // RMC Mumbai
		"4900": ["Gujarat"],                                // RMC Ahmedabad
		"3200": ["Karnataka", "Kerala", "Lakshadweep"],     // AAPC Bangalore (KA+KL+LK)
		"4300": ["Telangana"],                              // RMC Hyderabad
		"4800": ["Andhra Pradesh", "Tamil Nadu"],           // RMC Chennai (AP+TN)
		"3500": ["Punjab", "Chandigarh", "Himachal Pradesh"], // AAPC Mohali (PB+CH+HP)
		"3600": ["Haryana"],                                // AAPC Faridabad
		"4100": ["Delhi"],                                  // RMC Delhi (NCR)
		"4700": ["Rajasthan"],                               // RMC Jaipur
		"3400": ["Odisha"],                                 // AAPC Bhubaneswar
		"4200": ["West Bengal"],                             // RMC Kolkata
		"4400": ["Assam"],                                  // RMC Guwahati
		"4600": ["Jharkhand"],                               // RMC Ranchi
		"4902": ["Bihar"]                                    // RMC Patna
	};

	/* ------------------------------------------------------------------ */
	/* Sub-state geometry, for a state whose own plants sit in two zones  */
	/* ------------------------------------------------------------------ */

	/**
	 * Splits one state's path data into its rings. Every path in indiaGeo.js is polygonal -
	 * "M x y L x y ... Z" subpaths, no curves - so a ring is simply its point list, and a
	 * state with islands or exclaves is several rings.
	 * @param {string} sD state path data
	 * @returns {number[][][]} one array of [x, y] points per ring
	 * @private
	 */
	function parseRings(sD) {
		return String(sD || "").split("M").reduce(function (aRings, sPart) {
			var aNums = (sPart.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
			var aRing = [];
			for (var i = 0; i + 1 < aNums.length; i += 2) {
				aRing.push([aNums[i], aNums[i + 1]]);
			}
			if (aRing.length >= 3) {
				aRings.push(aRing);
			}
			return aRings;
		}, []);
	}

	/**
	 * @param {number[][]} aRing points of one ring
	 * @returns {string} that ring as closed path data, at the source geometry's own precision
	 * @private
	 */
	function ringPath(aRing) {
		return "M" + aRing.map(function (p, i) {
			return (i ? "L" : "") + p[0].toFixed(1) + " " + p[1].toFixed(1);
		}).join("") + "Z";
	}

	/**
	 * Sutherland-Hodgman clip of one ring to the half-plane fA*x + fB*y + fC <= 0.
	 *
	 * A concave ring whose kept part falls in more than one piece comes back as ONE ring, its
	 * pieces joined by zero-width seams running along the clip line. That is the algorithm's
	 * known behaviour and it is harmless here: the filled area is still exactly the kept
	 * part, which is all a choropleth polygon has to be.
	 * @param {number[][]} aRing points of one ring
	 * @param {number} fA half-plane x coefficient
	 * @param {number} fB half-plane y coefficient
	 * @param {number} fC half-plane constant
	 * @returns {number[][]|null} the kept ring, or null if nothing of it survived
	 * @private
	 */
	function clipRing(aRing, fA, fB, fC) {
		var aOut = [];
		aRing.forEach(function (p, i) {
			var q = aRing[(i + 1) % aRing.length];
			var fP = fA * p[0] + fB * p[1] + fC;
			var fQ = fA * q[0] + fB * q[1] + fC;
			if (fP <= 0) {
				aOut.push(p);
			}
			if ((fP < 0 && fQ > 0) || (fP > 0 && fQ < 0)) {
				var t = fP / (fP - fQ);
				aOut.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
			}
		});
		return aOut.length >= 3 ? aOut : null;
	}

	/**
	 * The part of a state that belongs to one of its plants rather than to any of the others:
	 * every point of the state nearer to that plant than to the rest - its Voronoi cell,
	 * clipped to the state's own outline. Built by clipping the state's rings against one
	 * perpendicular-bisector half-plane per other plant, so no Voronoi library is needed for
	 * what is, in the only case that occurs today, a single straight cut.
	 * @param {string} sState canonical state name
	 * @param {number[]} aXY the plant's projected [x, y]
	 * @param {number[][]} aOthers the other plants' projected [x, y]
	 * @returns {string} path data, possibly several subpaths, "" if the cell is empty
	 * @private
	 */
	function plantCellPath(sState, aXY, aOthers) {
		return parseRings(INDIA.paths[sState]).map(function (aRing) {
			var aKept = aRing;
			aOthers.forEach(function (o) {
				// |X - aXY|^2 - |X - o|^2 <= 0, i.e. at least as near to aXY as to o.
				aKept = aKept && clipRing(aKept,
					2 * (o[0] - aXY[0]),
					2 * (o[1] - aXY[1]),
					aXY[0] * aXY[0] + aXY[1] * aXY[1] - o[0] * o[0] - o[1] * o[1]);
			});
			return aKept ? ringPath(aKept) : "";
		}).join("");
	}

	/**
	 * Derives what this control's zone view paints, live off ZSD_ZONE_PLANT-ALM_ZONE
	 * (2026-08-22) instead of a hardcoded plant-zone snapshot. mZoneOfPlant is {plant code ->
	 * zone}, read off each Unit dot's own AlmZone (see ZCL_PMS_DASH_QUERY=>get_unit_dots and
	 * ZSD_PMS_UNIT_DOTS-AlmZone) - unambiguous at that grain (one join, one value per Unit),
	 * unlike ZSD_PMS_GEO's state-grain AlmZone, which disagreed with itself when a state
	 * hosted units in more than one zone.
	 *
	 * Every state comes back as one or more PIECES - {zone, d, share} - and both the zone
	 * shading and the zone hover totals are built from them:
	 *
	 *   * a state with no plant of its own keeps ZONE_OF_STATE_BASELINE's geographic zone, as
	 *     one whole-state piece;
	 *   * a state whose plants all agree takes that zone, again as one whole-state piece - so
	 *     Uttar Pradesh and Uttarakhand both follow plant 2000 wherever ZSD_ZONE_PLANT
	 *     currently puts it;
	 *   * a state whose plants DISAGREE is SPLIT between them rather than flipped to one zone
	 *     or left on its baseline. Madhya Pradesh hosts 3100 Jabalpur (Central) and 3300
	 *     Ujjain (West), so its western part - Ujjain's own, out to the halfway line between
	 *     the two plants - paints West and Jabalpur's part stays Central, instead of the
	 *     whole state reading Central while the table says 3300 is West. Maintain both plants
	 *     into one zone in ZSD_ZONE_PLANT and the state goes back to a single whole polygon
	 *     of that zone by itself: the split lasts only as long as the table disagrees with
	 *     itself, and no other state is touched while its own plants agree.
	 *
	 * `share` is what fraction of that state's own billing the piece carries, taken from what
	 * its plants each billed in THIS response (mPlantGross). The state grain is unit-based
	 * (OD-10 - ZSD_PMS_GEO's state is the UNIT's own state, and get_geo is a straight roll-up
	 * of units by regio), so a state's value IS the sum of its plants' and this apportionment
	 * is exact rather than an estimate. Shares always total 1 per state, so no value is
	 * created or lost, and an unsplit state's single piece carries all of it.
	 * @param {object} mZoneOfPlant plant code -> zone, as currently known
	 * @param {object} mPlantXY plant code -> projected [x, y], as currently known
	 * @param {object} mPlantGross plant code -> gross billed in this response
	 * @returns {object} canonical state name -> [{zone, d, share}], highest share first
	 * @private
	 */
	function deriveStatePieces(mZoneOfPlant, mPlantXY, mPlantGross) {
		var mPlantsByState = {};
		Object.keys(PLANT_STATES).forEach(function (sPlant) {
			if (!mZoneOfPlant[sPlant]) {
				return; // this plant's zone isn't known yet - nothing to override its state(s) with
			}
			PLANT_STATES[sPlant].forEach(function (sState) {
				(mPlantsByState[sState] || (mPlantsByState[sState] = [])).push(sPlant);
			});
		});

		function distinctZones(aPlants) {
			return aPlants.map(function (sPlant) {
				return mZoneOfPlant[sPlant];
			}).filter(function (sZone, i, a) {
				return a.indexOf(sZone) === i;
			});
		}

		var mPieces = {};
		Object.keys(INDIA.paths).forEach(function (sState) {
			var aPlants = mPlantsByState[sState] || [];
			var aZones = distinctZones(aPlants);

			function whole(sZone) {
				mPieces[sState] = [{
					zone: sZone,
					d: INDIA.paths[sState] || "",
					share: 1
				}];
			}

			if (aZones.length <= 1) {
				whole(aZones[0] || ZONE_OF_STATE_BASELINE[sState] || "");
				return;
			}

			// A split needs every disagreeing zone to have a plant with a known map position
			// to cut around; short of that the state falls back to its baseline zone rather
			// than handing the whole of itself to whichever plant happens to be placed.
			var aPlaced = aPlants.filter(function (sPlant) {
				return !!mPlantXY[sPlant];
			});
			if (aPlaced.length < 2 || distinctZones(aPlaced).length < aZones.length) {
				whole(ZONE_OF_STATE_BASELINE[sState] || "");
				return;
			}

			var mByZone = {};
			aPlaced.forEach(function (sPlant) {
				var sZone = mZoneOfPlant[sPlant];
				var o = mByZone[sZone] || (mByZone[sZone] = {d: "", gross: 0});
				// Cells are cut against ALL the other plants and only then merged by zone: a
				// zone's region is the UNION of its own plants' cells, which is not the same
				// shape as the state clipped against the other zones' plants.
				o.d += plantCellPath(sState, mPlantXY[sPlant], aPlaced.filter(function (p) {
					return p !== sPlant;
				}).map(function (p) {
					return mPlantXY[p];
				}));
				o.gross += num(mPlantGross[sPlant]);
			});

			// A zone whose cells all came back empty (its plant sits outside this state -
			// possible for a plant that covers more than one) takes no area, so its share is
			// redistributed over the zones that did take some, keeping the state whole.
			var aKept = Object.keys(mByZone).filter(function (sZone) {
				return !!mByZone[sZone].d;
			});
			if (!aKept.length) {
				whole(ZONE_OF_STATE_BASELINE[sState] || "");
				return;
			}

			var fTotal = aKept.reduce(function (fSum, sZone) {
				return fSum + mByZone[sZone].gross;
			}, 0);
			mPieces[sState] = aKept.map(function (sZone) {
				return {
					zone: sZone,
					d: mByZone[sZone].d,
					// Nothing billed anywhere in the state this period - no weights to go on,
					// and nothing to distribute either, so an even split is as good as any
					// and keeps the shares summing to 1.
					share: fTotal > 0 ? mByZone[sZone].gross / fTotal : 1 / aKept.length
				};
			}).sort(function (a, b) {
				return b.share - a.share;
			});
		});

		return mPieces;
	}

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
	 *
	 * In the zone view the label reads "<code> · <zone> · <value>" instead: there the dot's
	 * colour IS its zone, and a colour needs a written form beside it - naming the zone on
	 * the dot's own label is what keeps that identity readable for anyone who cannot separate
	 * two of the five hues (see css/style.css's --pms-zone-* block for the measurements). The
	 * zone takes the name's place rather than being squeezed in beside it: the gutter fits
	 * about 26 characters, and code + zone + value already spend most of them, so keeping
	 * both would leave the name as two letters and an ellipsis. The full name is still on the
	 * dot's hover card, which has the room this column does not.
	 * @param {string} sCode unit code
	 * @param {string} sName unit name, may be empty
	 * @param {string} sValue the pre-formatted money string
	 * @param {string} [sZone] the unit's zone - shown in place of the name when given
	 * @returns {string} the label
	 */
	function calloutLabel(sCode, sName, sValue, sZone) {
		var sTail = " " + formatter.MIDDOT + " " + sValue;
		if (sZone) {
			return sCode + " " + formatter.MIDDOT + " " + sZone + sTail;
		}
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
	 * @param {object[]} aProjected dots from _buildModel's own map step: {code, x, y, r, zone}
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
				var sLabel = calloutLabel(d.code, d.name, formatter.money(d.gross, 1), d.zone);
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
		// The eyebrow span is omitted rather than left empty: it is display:block, so an
		// empty one still takes a line and opens a gap above the name. Unit and zone cards
		// pass no eyebrow now that their plant and state counts are gone.
		return (sEyebrow ? "<span class=\"pmsTipHead\">" + encodeXML(sEyebrow) + "</span>" : "") +
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
				/**
				 * Visible strings, so this control stays i18n-free. Keys: scaleCap, lowest,
				 * low, high, noBilling, dotKey, grossBilled, netValue, taxValue.
				 *
				 * The hover card carries gross, net and tax only (OD-12, 2026-08-18). The
				 * growth, share-of-India, plants-billing and invoice rows it used to carry
				 * are gone, and with them the growth/share/plantsBilling/invoices/zoneStates/
				 * unitPlants/newLabel keys and the priorFyLabel property. The i18n entries
				 * themselves are deliberately still in the bundle, so restoring a row stays a
				 * one-line change.
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
					// One path per state, filled with its zone's colour - see _buildModel()'s
					// zoneAreas for why this is no longer one path per preset zone polygon.
					oModel.zoneAreas.forEach(function (o) {
						oRm.openStart("path");
						oRm.class("pmsMapArea");
						oRm.class("pmsMapArea--zone");
						if (o.selected) {
							oRm.class("pmsMapArea--sel");
						}
						if (o.zone) {
							oRm.attr("data-pms-zone", o.zone);
						}
						oRm.attr("fill-rule", "evenodd");
						oRm.attr("d", o.d);
						oRm.style("fill", o.fill);
						// No inline stroke: the zone view is a base map now, so its borders are
						// meant to show, and .pmsMapArea's own border stroke (plus its hover and
						// selected strokes) is exactly what draws them. This used to be stroked
						// in the region's own fill, to hide the member states' seams when the
						// region itself was the value channel.
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

					// The prototype drew its five preset zone outlines over the states here.
					// They are geographic unions, so they would now contradict the zones the
					// rest of the panel reports - drawing a boundary that puts UP in North
					// while the Zone filter and the hover card both call it Central. A
					// business zoning has no fixed outline to draw, so nothing is drawn.
				}

				if (oControl.getShowDots()) {
					oModel.dots.forEach(function (o) {
						oRm.openStart("circle");
						oRm.class("pmsMapDot");
						oRm.attr("data-pms-unit", o.code);
						oRm.attr("cx", o.x);
						oRm.attr("cy", o.y);
						oRm.attr("r", o.r);
						// Zone view only: one hue per zone, the map's only colour there. The
						// class holds it more opaque than the choropleth's dots - see
						// .pmsMapDot--zone.
						if (o.fill) {
							oRm.class("pmsMapDot--zone");
							oRm.style("fill", o.fill);
						}
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

			// The zone view shades nothing by value, so a value ramp under it would label a
			// scale the map does not use. It gets the zone key instead - which colour is
			// which zone - and keeps the dot-size key, since the dots still carry the values.
			if (oModel.isZone) {
				this._renderZoneKey(oRm, oModel);
				return;
			}

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

		/**
		 * The zone view's own legend: one round chip per zone, in that zone's colour, with the
		 * zone named beside it - the written half of the dots' colour coding, and the reason
		 * the colour is never the only thing carrying a zone's identity.
		 *
		 * Only the zones this response actually has are listed, in the fixed North..South
		 * order aZones is sorted into, so the key never claims a colour the map is not using
		 * and never renumbers itself when the values move. With the dots hidden the same
		 * colours are on the regions instead, so the key reads the same either way.
		 * @param {sap.ui.core.RenderManager} oRm the render manager
		 * @param {object} oModel the view model built by _model()
		 * @private
		 */
		_renderZoneKey: function (oRm, oModel) {
			var t = this.getTexts() || {};

			oRm.openStart("div").class("pmsMapScale").openEnd();
			oRm.openStart("span").class("pmsScaleCap").openEnd().text(t.zoneCap || "").close("span");

			oModel.zones.forEach(function (o) {
				oRm.openStart("span").class("pmsZoneKey").openEnd();
				oRm.openStart("span").class("pmsZoneKeyChip").style("background", o.color).openEnd().close("span");
				oRm.text(o.key);
				oRm.close("span");
			});

			if (this.getShowDots()) {
				oRm.openStart("span").class("pmsMapDotKey").openEnd();
				oRm.openStart("span").class("pmsMapDotKeyChip").class("pmsMapDotKeyChip--neutral")
					.openEnd().close("span");
				oRm.text(t.dotKeyZone || t.dotKey || "");
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
			// Normalised the same way the rows are, so a filter value picked as "North" still
			// marks a zone the Geo rows happen to carry as "NORTH ".
			var aSelZones = (this.getSelectedZones() || []).map(formatter.zoneKey);

			// Accumulates across loads rather than being rebuilt from THIS response alone -
			// exactly like the controller's own filter catalogs (_mergeCatalog): a filtered
			// view's dots are a subset of all Units, so a plant missing from one response
			// keeps whatever live zone an earlier, less-filtered response already taught us,
			// rather than the state it feeds falling back to the geographic baseline and
			// then flipping back once the filter clears.
			//
			// Each plant's own map position accumulates the same way and for the same reason -
			// it is master data, not billing, so a response that happens not to mention a
			// plant must not un-place it and undo a split state's geometry mid-filter.
			this._mZoneOfPlant = this._mZoneOfPlant || {};
			this._mPlantXY = this._mPlantXY || {};
			// Gross is deliberately NOT accumulated: it is what this response's own filters
			// returned, and it is what a split state's value is apportioned by, so it has to
			// describe exactly the same billing the Geo rows beside it do.
			var mPlantGross = {};
			aDots.forEach(function (d) {
				var sZone = formatter.zoneKey(d.AlmZone);
				if (!d.UnitCode) {
					return;
				}
				if (sZone) {
					this._mZoneOfPlant[d.UnitCode] = sZone;
				}
				if (num(d.Latitude) && num(d.Longitude)) {
					this._mPlantXY[d.UnitCode] = projLL(num(d.Latitude), num(d.Longitude));
				}
				mPlantGross[d.UnitCode] = num(d.GrossValue);
			}, this);
			var mStatePieces = deriveStatePieces(this._mZoneOfPlant, this._mPlantXY, mPlantGross);

			var aStateNames = Object.keys(INDIA.paths);
			var mByState = {};
			var mZone = {};

			aGeo.forEach(function (r) {
				// Gross is the map's headline measure - it drives the shading, the share-of-India
				// figure and the dot radii. Net and tax are carried through to the hover card
				// only, and the prior figure compared against is gross too, so the growth row
				// describes the same measure as the value above it.
				var v = num(r.GrossValue);

				var sCanonical = INDIA.resolveState(r.StateText);
				if (sCanonical) {
					mByState[sCanonical] = r;
				}

				// Zone comes from mStatePieces (deriveStatePieces(), live off ZSD_ZONE_PLANT via
				// the Unit dots), not ZSD_ZONE_PLANT-ALM_ZONE on the state-grain Geo row itself -
				// see that function's own comment for why. A row whose state text didn't resolve
				// to anything on the map (sCanonical falsy) has nowhere to paint it, so it is
				// excluded from the zone view exactly as it already is from the state view.
				//
				// Normally one piece carrying the whole state; a state split between two zones
				// (Madhya Pradesh today) contributes to each in proportion to what its own
				// plants billed, so the zone whose colour covers Ujjain is the zone Ujjain's
				// billing counts towards.
				(sCanonical ? mStatePieces[sCanonical] || [] : []).forEach(function (oPiece) {
					if (!oPiece.zone) {
						return;
					}
					// Only the three measures the hover card shows. Prior-year, plant and invoice
					// totals were accumulated here for rows the card no longer has.
					var z = mZone[oPiece.zone] ||
						(mZone[oPiece.zone] = {key: oPiece.zone, gross: 0, net: 0, tax: 0});
					z.gross += v * oPiece.share;
					z.net += num(r.NetValue) * oPiece.share;
					z.tax += num(r.TaxValue) * oPiece.share;
				});
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

			// Zones are whichever of mStatePieces' five zone names actually have billed states
			// in this response, not INDIA.zones' preset polygons - so a zone nobody billed
			// under simply gets no swatch and no shape, rather than an empty one.
			var aZones = Object.keys(mZone).sort(function (a, b) {
				// North..South, the order the business names its zones in and the order the
				// zone legend lists them - not alphabetical, which put Central before East
				// before North and read as no order at all. Anything unknown to ZONE_COLORS
				// (a sixth zone on ZSD_ZONE_PLANT) sorts last, alphabetically among its like.
				function rank(s) {
					var i = ZONE_COLORS.map(function (o) {
						return o.zone;
					}).indexOf(s);
					return i < 0 ? ZONE_COLORS.length : i;
				}
				return rank(a) - rank(b) || (a < b ? -1 : 1);
			}).map(function (sZone) {
				return {
					key: sZone,
					color: zoneColor(sZone),
					selected: aSelZones.indexOf(sZone) >= 0
				};
			});

			// Zone granularity paints each zone's own member states rather than a preset zone
			// outline: INDIA.zones' geographic unions disagree with mStatePieces (Gujarat/
			// Maharashtra/Goa are West here, not folded into a geographic Central/West split).
			// State outlines stay exact - the only cut ever made inside one is the halfway
			// line between two of its own plants in different zones (deriveStatePieces()) -
			// and a state nobody billed under any zone falls through to the no-data fill.
			var mZoneFill = aZones.reduce(function (m, o) {
				m[o.key] = o;
				return m;
			}, {});
			// ONE path per zone, not one per state: the member states' path data is
			// concatenated into a single multi-subpath "d". Drawing a path per state left
			// every internal state border stroked, so a zone read as several states that
			// happened to share a colour rather than as one region - which is the whole
			// point of the granularity. Stroking each zone in its OWN fill colour then makes
			// those internal seams disappear, while a boundary against a differently-valued
			// neighbour still shows as a clean colour change.
			var mZoneD = {};
			var aUnzonedD = [];
			aStateNames.forEach(function (sState) {
				// mStatePieces directly, not a response-built map: a state with zero billing
				// this period still belongs to its zone and must still be painted as part of
				// it, not fall through to the no-data fill just because it sent no row - only
				// a zone with NO billing anywhere (absent from mZoneFill) leaves the states,
				// or the parts of states, that belong to it unzoned.
				(mStatePieces[sState] || []).forEach(function (oPiece) {
					if (!oPiece.d) {
						return;
					}
					if (mZoneFill[oPiece.zone]) {
						mZoneD[oPiece.zone] = (mZoneD[oPiece.zone] || "") + oPiece.d;
					} else {
						aUnzonedD.push(oPiece.d);
					}
				});
			});

			/*
			 * What a zone region is filled with.
			 *
			 * With the Unit dots shown, the zone view is a BASE MAP: every region takes the
			 * same flat --pms-land with its borders drawn (see .pmsMapArea--zone), and the
			 * dots alone carry colour, one hue per zone, named in the legend below the map.
			 * Two encodings of the same zoning - a shaded region and a coloured dot on top of
			 * it - only compete with each other, and the region is the weaker of the two: it
			 * is the dots that name the units, carry the values and can be hovered.
			 *
			 * A zone picked in the Zone filter is tinted in its own colour rather than left
			 * flat, so a filtered map still shows WHERE the filter applies - it reads as the
			 * legend's colour, not as a value.
			 *
			 * With the dots hidden there is nothing left to carry the zoning, so the regions
			 * take it back: each is tinted in its own zone colour, the same colour the legend
			 * still names. Flat per zone - identity, not a value ramp.
			 *
			 * Nothing here is shaded by value any more, so the value-muting the Zone filter
			 * used to do (every unpicked zone dropped to the no-billing fill, so a filtered
			 * choropleth did not keep shading zones the filter excluded) has nothing left to
			 * mute: an unpicked zone is simply land, which is what it looks like unfiltered.
			 */
			function mapFill(oZone) {
				if (!bShowDots) {
					return "color-mix(in srgb, " + oZone.color + " 26%, var(--pms-land))";
				}
				return oZone.selected ?
					"color-mix(in srgb, " + oZone.color + " 22%, var(--pms-land))" :
					"var(--pms-land)";
			}

			var aZoneAreas = aZones.map(function (o) {
				return {
					key: o.key,
					zone: o.key,
					d: mZoneD[o.key] || "",
					fill: mapFill(o),
					selected: o.selected
				};
			}).filter(function (o) {
				return !!o.d;
			});

			// Everything nobody billed under any zone - part of the same land, since no region
			// here carries a value to be missing. It keeps no zone colour and no hover card,
			// so it reads as the map's own background rather than as a zone.
			if (aUnzonedD.length) {
				aZoneAreas.unshift({
					key: "",
					zone: "",
					d: aUnzonedD.join(""),
					fill: "var(--pms-land)",
					selected: false
				});
			}

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
				// The Unit's own zone, straight off its AlmZone. Carried only in the zone view:
				// there it is what colours and labels the dot, while the state view keeps every
				// dot in one colour so nothing competes with the choropleth beneath it.
				var sZone = bZone ? formatter.zoneKey(d.AlmZone) : "";
				return {
					code: d.UnitCode,
					// Falls back to the code alone when a Unit has no name maintained
					// (ZSD_ZONE_PLANT-REMARKS blank).
					name: d.UnitName || "",
					zone: sZone,
					fill: sZone ? zoneColor(sZone) : "",
					x: xy[0].toFixed(1),
					y: xy[1].toFixed(1),
					r: ((2.2 + Math.sqrt(num(d.GrossValue) / fDotMax) * 6.5) *
						(bShowDots ? GUTTER_SCALE : 1)).toFixed(1),
					gross: num(d.GrossValue)
				};
			});

			return {
				isZone: bZone,
				statePieces: mStatePieces,
				states: aStates,
				zones: aZones,
				zoneAreas: aZoneAreas,
				dots: aProjected,
				callouts: buildCallouts(aProjected),
				scale: oScale,
				byState: mByState,
				byZone: mZone,
				byUnit: aDots.reduce(function (m, d) {
					m[d.UnitCode] = d;
					return m;
				}, {})
			};
		},

		/* ================================================================== */
		/* Hover card                                                         */
		/* ================================================================== */

		/** @returns {string|null} the hover card markup for whatever is under the cursor @private */
		_tipFor: function (oTarget) {
			var t = this.getTexts() || {};
			var oModel = this._model();

			/*
			 * Three rows, the same three everywhere: gross, then the net and tax it is made
			 * of. Prior-year value, growth, share of India, plants billing and invoice counts
			 * were all dropped on request - each was another number to read past before
			 * reaching the one the card exists to show, and several of them (growth above
			 * all) were unreliable for reasons documented in the controller.
			 */
			var oUnit = oTarget.closest("[data-pms-unit]");
			if (oUnit) {
				var d = oModel.byUnit[oUnit.getAttribute("data-pms-unit")];
				if (!d) {
					return null;
				}
				// Full name here, untruncated - the hover card has the room the gutter does not.
				// Gross leads (it is what the dot is sized on), with net and tax broken out
				// beneath it. The eyebrow names the Unit's own zone (ZSD_ZONE_PLANT-ALM_ZONE):
				// in the zone view that is what the dot's colour means, and a colour always
				// needs a written form somewhere.
				return tipHead(formatter.zoneKey(d.AlmZone),
						d.UnitCode + (d.UnitName ? " " + formatter.MIDDOT + " " + d.UnitName : "")) +
					tipRow(t.grossBilled || "", formatter.money(d.GrossValue)) +
					tipRow(t.netValue || "", formatter.money(d.NetValue)) +
					tipRow(t.taxValue || "", formatter.money(d.TaxValue));
			}

			var oZone = oTarget.closest("[data-pms-zone]");
			if (oZone) {
				var z = oModel.byZone[oZone.getAttribute("data-pms-zone")];
				if (!z) {
					return null;
				}
				return tipHead("", z.key) +
					tipRow(t.grossBilled || "", formatter.money(z.gross)) +
					tipRow(t.netValue || "", formatter.money(z.net)) +
					tipRow(t.taxValue || "", formatter.money(z.tax));
			}

			var oState = oTarget.closest("[data-pms-state]");
			if (!oState) {
				return null;
			}

			var sState = oState.getAttribute("data-pms-state");
			var r = oModel.byState[sState];
			// The zone here is oModel.statePieces' (deriveStatePieces(), live off
			// ZSD_ZONE_PLANT), not the row's own AlmZone - see that function's comment for
			// why. It is a property of the state, not of its billing, so it shows even for a
			// state nobody billed. A state split between two zones names both, biggest share
			// first, rather than picking one and contradicting its own zone-view colouring.
			var sZone = (oModel.statePieces[sState] || []).map(function (oPiece) {
				return oPiece.zone;
			}).filter(Boolean).join(" / ");
			var sEyebrow = (INDIA.abbr[sState] || "") +
				(sZone ? " " + formatter.MIDDOT + " " + sZone : "");

			if (!r) {
				return tipHead(sEyebrow, sState) + tipRow(t.grossBilled || "", t.noBilling || "");
			}

			return tipHead(sEyebrow, sState) +
				tipRow(t.grossBilled || "", formatter.money(r.GrossValue)) +
				tipRow(t.netValue || "", formatter.money(r.NetValue)) +
				tipRow(t.taxValue || "", formatter.money(r.TaxValue));
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
