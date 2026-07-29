sap.ui.define([
	"./formatter"
], function (formatter) {
	"use strict";

	/**
	 * Read layer over the ZMM_GRN_DASH_O4 OData V4 service.
	 *
	 * The 10 entities are CDS *custom entities with parameters*, so the metadata exposes
	 * each one as a "…Parameters" entity set whose `Set` navigation property carries the
	 * rows. The parameters are therefore part of the resource path, not $filter:
	 *
	 *   /KPI(P_DateFrom=2026-01-01,P_DateTo=2026-07-29,P_Vendor='',P_Material='',
	 *        P_Plant='',P_DocType='')/Set
	 *
	 * The parameter entity sets themselves are annotated Readable=false — reading
	 * `/KPI` directly is rejected by the backend; only the `/Set` navigation works.
	 * See ../../../README.md, "Phase 2: OData V4 design".
	 *
	 * All ten reads are issued through one ODataModel using the default $auto group, so
	 * UI5 folds them into a single $batch round trip per dashboard refresh.
	 */

	// Entity set name -> the properties to request. Listing $select explicitly (rather
	// than relying on autoExpandSelect, which has nothing to infer from because these
	// bindings have no dependent property bindings) keeps the payload tight and makes the
	// field contract of each chart readable in one place.
	var ENTITIES = {
		kpi: {
			set: "KPI",
			select: "ID,KpiLabel,CurrValue,PriorValue,DeltaPct"
		},
		quality: {
			set: "Quality",
			select: "Bucket,Qty,SharePct"
		},
		ratio: {
			set: "Ratio",
			select: "ID,RatioLabel,RatioValue"
		},
		trend: {
			set: "Trend",
			select: "Period,Qty101,Qty102,QtyZ22,Val101,Val102,ValZ22,NetQty,NetVal",
			orderby: "Period"
		},
		vendorTop10: {
			set: "VendorTop10",
			select: "Vendor,VendorName,Qty,NetQty,Value,RejPct,ReworkPct,Score",
			orderby: "Value desc"
		},
		vendorScorecard: {
			set: "VendorScorecard",
			select: "Vendor,VendorName,Qty,NetQty,Value,RejPct,ReworkPct,Score",
			orderby: "Score desc"
		},
		plantTop10: {
			set: "PlantTop10",
			select: "Plant,TotalQty,AcceptedPct,RejectedPct,SamplePct,InspectPct",
			orderby: "TotalQty desc"
		},
		materialTop20: {
			set: "MaterialTop20",
			select: "Material,MaterialName,Value",
			orderby: "Value desc"
		},
		materialRejWorst10: {
			set: "MaterialRejWorst10",
			select: "Material,MaterialName,RejQty,RejPct",
			orderby: "RejPct desc"
		},
		doctypeRanked: {
			set: "DoctypeRanked",
			select: "DocType,DocTypeName,Value",
			orderby: "Value desc"
		}
	};

	// Every result set is pre-aggregated and capped at source (largest is MaterialTop20 at
	// 20 rows, DoctypeRanked is the only open-ended one) — see FS section 12's NFR. This
	// ceiling is a safety net, not a paging strategy.
	var MAX_ROWS = 500;

	/**
	 * Escapes a string for an OData V4 single-quoted literal.
	 * @param {string} s raw value
	 * @returns {string} escaped value (inner quotes doubled)
	 */
	function quote(s) {
		return String(s === undefined || s === null ? "" : s).replace(/'/g, "''");
	}

	/**
	 * Joins a token array into the comma-separated form ZCL_GRN_DASH_*_QRY's
	 * csv_to_range() expects. Blank tokens are dropped; an empty list means "all".
	 * @param {string[]|string} v tokens or an already-joined string
	 * @returns {string} e.g. "1010,1020"
	 */
	function csv(v) {
		if (!v) {
			return "";
		}
		var a = Array.isArray(v) ? v : String(v).split(",");
		return a.map(function (x) {
			return String(x).trim();
		}).filter(Boolean).join(",");
	}

	return {

		ENTITIES: ENTITIES,

		/**
		 * Builds the parameterised resource path for one entity set.
		 *
		 * P_DateFrom/P_DateTo are Edm.Date and go in *unquoted* (2026-01-01); the four
		 * filter parameters are Edm.String and are single-quoted. Getting either wrong
		 * yields a 400 from the Gateway rather than a UI5-side error, so this is the only
		 * place the path is assembled.
		 *
		 * @param {string} sEntitySet e.g. "KPI"
		 * @param {object} oFilters {dateFrom, dateTo, vendor, material, plant, docType}
		 * @returns {string} absolute binding path ending in /Set
		 */
		buildPath: function (sEntitySet, oFilters) {
			var f = oFilters || {};
			return "/" + sEntitySet + "(" + [
				"P_DateFrom=" + formatter.isoDate(f.dateFrom),
				"P_DateTo=" + formatter.isoDate(f.dateTo),
				"P_Vendor='" + quote(csv(f.vendor)) + "'",
				"P_Material='" + quote(csv(f.material)) + "'",
				"P_Plant='" + quote(csv(f.plant)) + "'",
				"P_DocType='" + quote(csv(f.docType)) + "'"
			].join(",") + ")/Set";
		},

		/**
		 * Reads one entity set.
		 *
		 * A throwaway list binding is created per read and destroyed afterwards: an
		 * ODataListBinding owns its own cache, so a fresh binding guarantees a fresh
		 * request even when the user presses Go twice with identical filters.
		 *
		 * @param {sap.ui.model.odata.v4.ODataModel} oModel the OData model
		 * @param {string} sKey key into ENTITIES
		 * @param {object} oFilters the six filter values
		 * @returns {Promise<object[]>} plain row objects
		 */
		readEntity: function (oModel, sKey, oFilters) {
			var oDef = ENTITIES[sKey];
			if (!oDef) {
				return Promise.reject(new Error("Unknown dashboard entity '" + sKey + "'"));
			}

			var mParameters = {
				$select: oDef.select,
				$$groupId: "$auto"
			};
			if (oDef.orderby) {
				mParameters.$orderby = oDef.orderby;
			}

			var oBinding = oModel.bindList(this.buildPath(oDef.set, oFilters), null, [], [], mParameters);

			return oBinding.requestContexts(0, MAX_ROWS).then(function (aContexts) {
				return aContexts.map(function (oContext) {
					return oContext.getObject();
				});
			}).then(function (aRows) {
				oBinding.destroy();
				return aRows;
			}, function (oError) {
				oBinding.destroy();
				// Name the entity in the message — a bad parameter or an inactive query
				// class fails per-entity, and "which one" is the whole diagnosis.
				oError.grnEntity = oDef.set;
				throw oError;
			});
		},

		/**
		 * Reads all ten entity sets for one filter selection.
		 *
		 * Uses Promise.all on the default $auto group so the ten GETs leave the browser
		 * as one $batch. Rejects on the first failure — a dashboard missing a chart is
		 * more misleading than one that says it could not load.
		 *
		 * @param {sap.ui.model.odata.v4.ODataModel} oModel the OData model
		 * @param {object} oFilters the six filter values
		 * @returns {Promise<object>} one property per ENTITIES key, each an array of rows
		 */
		readAll: function (oModel, oFilters) {
			var that = this;
			var aKeys = Object.keys(ENTITIES);

			return Promise.all(aKeys.map(function (sKey) {
				return that.readEntity(oModel, sKey, oFilters);
			})).then(function (aResults) {
				var oData = {};
				aKeys.forEach(function (sKey, i) {
					oData[sKey] = aResults[i];
				});
				return oData;
			});
		},

		/**
		 * Indexes an array of {ID: …} rows by ID, so the KPI cards and ratio strip can
		 * look up a specific measure instead of depending on backend row order.
		 * @param {object[]} aRows rows carrying an ID property
		 * @returns {object} map of ID -> row
		 */
		byId: function (aRows) {
			var o = {};
			(aRows || []).forEach(function (r) {
				o[r.ID] = r;
			});
			return o;
		},

		/**
		 * Indexes quality buckets by their Bucket text. The backend emits exactly four:
		 * Accepted, Rejected, Sample, Rework GRN Qty (ZCL_GRN_DASH_QUERY line 781ff).
		 * @param {object[]} aRows quality rows
		 * @returns {object} map of Bucket -> row
		 */
		byBucket: function (aRows) {
			var o = {};
			(aRows || []).forEach(function (r) {
				o[r.Bucket] = r;
			});
			return o;
		}
	};
});
