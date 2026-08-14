sap.ui.define([
	"./formatter"
], function (formatter) {
	"use strict";

	/**
	 * Read layer over the ZSD_PMS_DASH_O4 OData V4 service.
	 *
	 * The 7 entities are CDS custom entities with parameters, so the metadata exposes each
	 * one as a "...Parameters" entity set whose Set navigation property carries the rows.
	 * The parameters are therefore part of the resource path, not $filter:
	 *
	 *   /KPI(P_Fy='2026',P_DateFrom=2026-04-01,P_DateTo=2026-08-13,P_Zone='',P_State='',
	 *        P_Plant='',P_Material='',P_Scheme='',P_Period='')/Set
	 *
	 * The parameter entity sets themselves are annotated Readable=false - only the /Set
	 * navigation works. See ../../../gw_client_data_5254004239AE1FD1A5E0C92C3027E000.xml
	 * (the live metadata export) and ../../ABAP/ZSD_PMS_DASH_O4.srvd.abap.
	 *
	 * All seven reads are issued through one ODataModel using the default $auto group, so
	 * UI5 folds them into a single $batch round trip per dashboard refresh - same pattern
	 * as the GRN Dashboard's dashboardService.js.
	 */

	// Entity set name -> the properties to request.
	var ENTITIES = {
		kpi: {
			set: "KPI",
			select: "Id,KpiLabel,CurrValue,PriorValue,DeltaPct,SnapshotDate,DocCount"
		},
		trend: {
			set: "Trend",
			select: "Period,NetValue",
			orderby: "Period"
		},
		geo: {
			set: "Geo",
			select: "Regio,StateText,AlmZone,NetValue,PriorValue,DeltaPct,PlantCount,InvoiceCount"
		},
		unitDots: {
			set: "UnitDots",
			select: "UnitCode,NetValue,PriorValue,DeltaPct,Latitude,Longitude,PlantCount"
		},
		scheme: {
			set: "Scheme",
			select: "Category,CatDesc,NetValue,SharePct,InvoiceCount,DeltaPct",
			orderby: "NetValue desc"
		},
		plant: {
			set: "Plant",
			select: "Werks,City,NetValue,TaxValue,GrossValue",
			orderby: "NetValue desc"
		},
		material: {
			set: "Material",
			select: "Matnr,Arktx,Uom,MatValue,Qty,Igst,Sgst,Cgst,Tcs,GrandTotalValue",
			orderby: "MatValue desc"
		}
	};

	// Plant/Material are already capped at Top-20 in the backend (ZCL_PMS_DASH_QUERY); Geo
	// tops out at 36 states, UnitDots at <=18 units. This is a safety net, not a paging plan.
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
	 * Joins a token array into the comma-separated form ZCL_PMS_*_QRY's csv_to_range()
	 * expects. Blank tokens are dropped; an empty list means "all".
	 * @param {string[]|string} v tokens or an already-joined string
	 * @returns {string} e.g. "North,South"
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
		 * P_Fy is Edm.String (GJAHR mapped to a 4-char string, confirmed in the live
		 * metadata) and goes in *quoted*; P_DateFrom/P_DateTo are Edm.Date and go in
		 * *unquoted* (2026-04-01); the six CSV filter parameters are Edm.String and are
		 * single-quoted. Getting any of these wrong yields a 400 from the Gateway rather
		 * than a UI5-side error, so this is the only place the path is assembled.
		 *
		 * @param {string} sEntitySet e.g. "KPI"
		 * @param {object} oFilters {fy, dateFrom, dateTo, zone, state, plant, material, scheme, period}
		 * @returns {string} absolute binding path ending in /Set
		 */
		buildPath: function (sEntitySet, oFilters) {
			var f = oFilters || {};
			var aParams = [
				"P_Fy='" + quote(f.fy) + "'",
				"P_DateFrom=" + formatter.isoDate(f.dateFrom),
				"P_DateTo=" + formatter.isoDate(f.dateTo),
				"P_Zone='" + quote(csv(f.zone)) + "'",
				"P_State='" + quote(csv(f.state)) + "'",
				"P_Plant='" + quote(csv(f.plant)) + "'",
				"P_Material='" + quote(csv(f.material)) + "'",
				"P_Scheme='" + quote(csv(f.scheme)) + "'",
				"P_Period='" + quote(csv(f.period)) + "'"
			];
			return "/" + sEntitySet + "(" + aParams.join(",") + ")/Set";
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
		 * @param {object} oFilters the nine filter values
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
				// Name the entity in the message - a bad parameter or an inactive query
				// class fails per-entity, and "which one" is the whole diagnosis.
				oError.pmsEntity = oDef.set;
				throw oError;
			});
		},

		/**
		 * Reads all seven entity sets for one filter selection.
		 *
		 * Uses Promise.all on the default $auto group so the seven GETs leave the browser
		 * as one $batch. Rejects on the first failure - a dashboard missing a panel is
		 * more misleading than one that says it could not load.
		 *
		 * @param {sap.ui.model.odata.v4.ODataModel} oModel the OData model
		 * @param {object} oFilters the filter values
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
		 * Indexes an array of {Id: ...} rows by Id, so the KPI cards can look up a
		 * specific measure instead of depending on backend row order.
		 * @param {object[]} aRows rows carrying an Id property
		 * @returns {object} map of Id -> row
		 */
		byId: function (aRows) {
			var o = {};
			(aRows || []).forEach(function (r) {
				o[r.Id] = r;
			});
			return o;
		}
	};
});
