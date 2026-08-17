sap.ui.define([
	"./formatter",
	"sap/base/Log"
], function (formatter, Log) {
	"use strict";

	/**
	 * Read layer over the ZSD_PMS_DASH_O4 OData V4 service.
	 *
	 * The 9 entities are CDS custom entities with parameters, so the metadata exposes each
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
	 * All nine reads are issued through one ODataModel using the default $auto group, so
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
			select: "Matnr,Arktx,Bismt,Uom,MatValue,Qty,Igst,Sgst,Cgst,Tcs,GrandTotalValue",
			orderby: "MatValue desc"
		},
		// Every distinct plant/material billing in scope, uncapped - feeds the Plant/Material
		// filter dropdowns. `plant`/`material` above stay Top-20 for their chart panels; a
		// filter must never be limited to what a chart happens to show (production has ~109
		// billing plants and far more materials than 20) - see
		// ZCL_PMS_DASH_QUERY=>get_plant_catalog/get_material_catalog.
		plantCatalog: {
			set: "PlantCatalog",
			select: "Werks,City",
			orderby: "City"
		},
		materialCatalog: {
			set: "MaterialCatalog",
			select: "Matnr,Arktx,Bismt",
			orderby: "Arktx"
		}
	};

	// Plant/Material are already capped at Top-20 in the backend (ZCL_PMS_DASH_QUERY); Geo
	// tops out at 36 states, UnitDots at <=18 units. PlantCatalog/MaterialCatalog are
	// genuinely uncapped, so this is the only real page-size limit they get - a filter list
	// past 500 codes is already unusable as a dropdown regardless.
	var MAX_ROWS = 500;

	// PlantCatalog/MaterialCatalog are a filter-list enhancement, not core dashboard data -
	// unlike the other seven, a missing one must not fail the whole load. This matters during
	// rollout: the two new custom entities/query-provider classes need to be created and
	// activated on the backend before they exist at all, and until that happens they 404. See
	// readAll()'s own comment for how the fallback keeps the rest of the dashboard working
	// (and controller.js's CATALOG_SOURCES for how the filter itself degrades, not disappears).
	var OPTIONAL_ENTITIES = {plantCatalog: true, materialCatalog: true};

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
		 * Reads all nine entity sets for one filter selection.
		 *
		 * Uses Promise.all on the default $auto group so the nine GETs leave the browser
		 * as one $batch. Rejects on the first failure for the seven core entities - a
		 * dashboard missing a panel is more misleading than one that says it could not load.
		 * The two OPTIONAL_ENTITIES (PlantCatalog/MaterialCatalog) are the one exception:
		 * they're a filter-list enhancement layered on top of an already-working dashboard,
		 * not something any panel depends on, so a 404 there (e.g. the backend hasn't been
		 * updated with these two new custom entities yet) degrades to an empty list instead
		 * of failing every other panel along with it.
		 *
		 * @param {sap.ui.model.odata.v4.ODataModel} oModel the OData model
		 * @param {object} oFilters the filter values
		 * @returns {Promise<object>} one property per ENTITIES key, each an array of rows
		 */
		readAll: function (oModel, oFilters) {
			var that = this;
			var aKeys = Object.keys(ENTITIES);

			return Promise.all(aKeys.map(function (sKey) {
				var pRead = that.readEntity(oModel, sKey, oFilters);
				if (OPTIONAL_ENTITIES[sKey]) {
					pRead = pRead.catch(function (oError) {
						Log.warning("PMS optional entity unavailable, filter list will be smaller: " + sKey,
							oError && oError.message, "com.sap.zsdpmsdash");
						return [];
					});
				}
				return pRead;
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
