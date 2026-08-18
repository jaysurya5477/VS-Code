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
	 *
	 * That holds for the FIRST page of each entity. Seven of the nine fit in one page and
	 * finish there; PlantCatalog/MaterialCatalog are uncapped by design and page until the
	 * server runs out, costing one extra round trip per additional page. See PAGE_SIZE for
	 * why paging is not optional here.
	 */

	// Entity set name -> the properties to request.
	var ENTITIES = {
		kpi: {
			set: "KPI",
			select: "Id,KpiLabel,CurrValue,PriorValue,DeltaPct,NetValue,TaxValue,SnapshotDate,DocCount"
		},
		trend: {
			set: "Trend",
			select: "Period,NetValue",
			orderby: "Period"
		},
		geo: {
			set: "Geo",
			select: "Regio,StateText,AlmZone,NetValue,TaxValue,GrossValue,PriorValue,PriorGross," +
				"DeltaPct,PlantCount,InvoiceCount"
		},
		unitDots: {
			set: "UnitDots",
			select: "UnitCode,UnitName,NetValue,TaxValue,GrossValue,PriorValue,PriorGross," +
				"DeltaPct,Latitude,Longitude,PlantCount"
		},
		scheme: {
			set: "Scheme",
			select: "Category,CatDesc,NetValue,TaxValue,GrossValue,SharePct,InvoiceCount,DeltaPct",
			orderby: "GrossValue desc"
		},
		plant: {
			set: "Plant",
			select: "Werks,City,NetValue,TaxValue,GrossValue",
			orderby: "NetValue desc"
		},
		material: {
			set: "Material",
			select: "Matnr,Arktx,Bismt,Uom,MatValue,Qty,Igst,Sgst,Cgst,Tcs,TaxValue,GrossValue," +
				"GrandTotalValue,GrandTotalGross",
			orderby: "GrossValue desc"
		},
		// Every distinct plant/material billing in scope, uncapped - feeds the Plant/Material
		// filter dropdowns. `plant`/`material` above stay Top-20 for their chart panels; a
		// filter must never be limited to what a chart happens to show (production has ~109
		// billing plants and far more materials than 20) - see
		// ZCL_PMS_DASH_QUERY=>get_plant_catalog/get_material_catalog.
		// paged: these two are the only entities whose row count is not bounded by design, so
		// they are the only ones that must follow the server's paging to the end rather than
		// trusting one read. Without it the Gateway's page cap silently became the filter's
		// limit - 100 plants and 100 materials, with the rest unselectable.
		plantCatalog: {
			set: "PlantCatalog",
			select: "Werks,City",
			orderby: "City",
			paged: true
		},
		materialCatalog: {
			set: "MaterialCatalog",
			select: "Matnr,Arktx,Bismt",
			orderby: "Arktx",
			paged: true
		}
	};

	// Plant/Material are already capped at Top-20 in the backend (ZCL_PMS_DASH_QUERY); Geo
	// tops out at 36 states, UnitDots at <=18 units. Those are all comfortably inside this.
	var MAX_ROWS = 500;

	// PlantCatalog/MaterialCatalog are genuinely uncapped by design - they exist precisely so
	// a filter is not limited to what a chart happens to show. Production has ~109 billing
	// plants and far more materials, so they need a much higher ceiling than the panels do.
	// Hit only as a runaway backstop, and logged when it is - never silently.
	var MAX_CATALOG_ROWS = 5000;

	// Rows per request for the paged (catalog) entities.
	//
	// The Gateway applies its own server-side page size and the RAP query providers honour it
	// (each truncates to io_request->get_paging( )->get_page_size( )). Asking for N rows
	// therefore does NOT guarantee N back: on this system the service caps a page at 100, so
	// one requestContexts(0, 500) returned exactly 100 plants and 100 materials and the filter
	// looked capped at 100 - every code past that was simply not selectable.
	//
	// Because the real cap is the server's and not ours, "fewer rows than I asked for" cannot
	// be used to detect the end of the collection - that is precisely the state a capped page
	// is in. paging therefore continues until a page comes back EMPTY, which is the only
	// reliable signal. Same class of bug as the sibling Sales Dashboard's targets read, where
	// summing just the first page silently under-reported the year's total.
	var PAGE_SIZE = 500;

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
		 * Reads one entity set, following the server's paging to the end.
		 *
		 * A throwaway list binding is created per read and destroyed afterwards: an
		 * ODataListBinding owns its own cache, so a fresh binding guarantees a fresh
		 * request even when the user presses Go twice with identical filters.
		 *
		 * Entities marked `paged` collect rows page by page until a page comes back EMPTY (or
		 * MAX_CATALOG_ROWS is hit, which is logged). One read is not enough for them: the
		 * Gateway caps a page server-side and the RAP providers honour that cap, so asking for
		 * 500 rows can legitimately return 100 with more still waiting - which also means a
		 * short page cannot be used as the end marker. See PAGE_SIZE.
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

			var sPath = this.buildPath(oDef.set, oFilters);

			/**
			 * Reads ONE page, on its own throwaway binding.
			 *
			 * The fresh binding per page is the whole trick, and it is not incidental. An
			 * ODataListBinding that has once been served fewer rows than it asked for treats
			 * its length as FINAL: every later requestContexts() past that point is answered
			 * from the model with an empty array and never reaches the server. Since a
			 * server-capped page IS a short read, reusing one binding to walk the pages stops
			 * dead at the first cap - it looks exactly like a complete list of 100. A new
			 * binding has no such history, so each page is an independent $skip/$top request.
			 *
			 * @param {int} iStart row offset to read from
			 * @param {int} iLength how many rows to ask for
			 * @returns {Promise<object[]>} that page's rows
			 */
			var readPage = function (iStart, iLength) {
				var oPage = oModel.bindList(sPath, null, [], [], mParameters);
				var done = function (aRows) {
					oPage.destroy();
					return aRows;
				};
				return oPage.requestContexts(iStart, iLength).then(function (aContexts) {
					return done(aContexts.map(function (oContext) {
						return oContext.getObject();
					}));
				}, function (oError) {
					oPage.destroy();
					throw oError;
				});
			};

			/**
			 * Walks the pages until one comes back empty - see PAGE_SIZE for why an empty
			 * page, not a short one, is the end marker.
			 * @param {object[]} aRows rows gathered so far
			 * @returns {Promise<object[]>} aRows plus every remaining page
			 */
			var readFrom = function (aRows) {
				return readPage(aRows.length, PAGE_SIZE).then(function (aPage) {
					if (!aPage.length) {
						return aRows;
					}
					var aNext = aRows.concat(aPage);
					if (aNext.length >= MAX_CATALOG_ROWS) {
						// Never truncate silently: a filter list that quietly stops is
						// indistinguishable from one that is genuinely complete, which is the
						// whole failure mode this paging exists to fix.
						Log.warning("PMS catalog hit its row ceiling and may be incomplete: " +
							oDef.set + " stopped at " + MAX_CATALOG_ROWS + " rows",
							null, "com.sap.zsdpmsdash");
						return aNext;
					}
					return readFrom(aNext);
				});
			};

			// Only the two catalogs page. The other seven have provable upper bounds well
			// inside a single page (4 KPIs, 12 trend periods, <=36 states, <=18 unit dots, one
			// row per scheme, Top-20 plants/materials), so paging them would just add a
			// trailing empty-page round trip each and break the single-$batch refresh.
			return (oDef.paged ? readFrom([]) : readPage(0, MAX_ROWS)).catch(function (oError) {
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
