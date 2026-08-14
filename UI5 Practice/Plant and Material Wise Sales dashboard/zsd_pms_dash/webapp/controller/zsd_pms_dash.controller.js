sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/Core",
	"sap/ui/model/json/JSONModel",
	"sap/base/Log",
	"../model/formatter",
	"../model/dashboardService",
	"../model/chartOptions",
	"../model/chartTheme",
	"../model/appTheme",
	"../model/echartsLoader"
], function (Controller, Core, JSONModel, Log, formatter, dashboardService, chartOptions, chartTheme,
	appTheme, echartsLoader) {
	"use strict";

	/** The four code filters harvested from the response and re-sent as CSV. */
	var FILTER_INPUTS = {
		zone: "zoneFilter",
		state: "stateFilter",
		plant: "plantFilter",
		scheme: "schemeFilter",
		material: "materialFilter",
		period: "periodFilter"
	};

	/**
	 * Where the State/Plant/Scheme/Material dropdowns' selectable values come from. The
	 * service exposes no value-help entity sets yet (deferred, see
	 * ../../Documentation/ABAP_Backend_Plan.md Part C Phase 2), so the lists are built from
	 * the codes the result sets actually contain - see _mergeCatalog for why they accumulate
	 * rather than replace. Same pattern as the GRN Dashboard's controller.
	 */
	var CATALOG_SOURCES = {
		state: [{
			entity: "geo",
			key: "Regio",
			name: "StateText"
		}],
		plant: [{
			entity: "plant",
			key: "Werks",
			name: "City"
		}],
		scheme: [{
			entity: "scheme",
			key: "Category",
			name: "CatDesc"
		}],
		material: [{
			entity: "material",
			key: "Matnr",
			name: "Arktx"
		}]
	};

	/** Real zone list (ZONE_ORDER, confirmed against ZCL_PMS_DASH_QUERY/ZSD_ZONE_PLANT). */
	var ZONES = ["North", "West", "South", "East", "Central"];

	/** FY-period month labels, Apr=1..Mar=12 (OD-6/OD-7 real convention). */
	var FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

	return Controller.extend("com.sap.zsdpmsdash.controller.zsd_pms_dash", {

		formatter: formatter,

		/* ==================================================================== */
		/* Lifecycle                                                            */
		/* ==================================================================== */

		onInit: function () {
			this._oRaw = null;
			this._oFilters = null;
			this._bLoading = false;
			this._bReloadQueued = false;
			this._oPalette = null;
			this._oECharts = null;
			this._mCatalog = {
				state: {},
				plant: {},
				scheme: {},
				material: {}
			};

			this.getView().setModel(new JSONModel({
				fy: String(this._currentFy()),
				kpis: [],
				geoRows: [],
				dotRows: [],
				charts: {},
				options: {
					fy: this._fyOptions(),
					zone: ZONES.map(function (z) {
						return {
							key: z,
							text: z
						};
					}),
					period: FY_MONTHS.map(function (sMonth, i) {
						return {
							key: String(i + 1),
							text: sMonth
						};
					}),
					state: [],
					plant: [],
					scheme: [],
					material: []
				},
				themeMode: appTheme.getMode(),
				themeOptions: this._toggleItems(["auto", "light", "dark"], "theme"),
				granularityOptions: [
					{key: "state", text: this._text("granularityState")},
					{key: "zone", text: this._text("granularityZone")}
				],
				mapGranularity: "state",
				mapShowDots: true,
				mapSubtitle: "",
				selectedRegio: "",
				scopeText: "",
				lastRefreshedText: "",
				errorText: ""
			}), "dash");

			appTheme.apply();
			this._fnAppThemeChanged = this._onAppThemeChanged.bind(this);
			appTheme.attachChanged(this._fnAppThemeChanged);

			this._fnThemeChanged = function () {
				appTheme.apply();
			};
			Core.attachThemeChanged(this._fnThemeChanged);

			var that = this;
			Promise.all([echartsLoader.load(), chartTheme.get()]).then(function (aResult) {
				that._oECharts = aResult[0];
				that._oPalette = aResult[1];
				that._loadData();
			}).catch(function (oError) {
				that._setError(that._text("errorEchartsFailed", [oError.message]));
			});
		},

		onExit: function () {
			if (this._fnThemeChanged) {
				Core.detachThemeChanged(this._fnThemeChanged);
				this._fnThemeChanged = null;
			}
			if (this._fnAppThemeChanged) {
				appTheme.detachChanged(this._fnAppThemeChanged);
				this._fnAppThemeChanged = null;
			}
		},

		/* ==================================================================== */
		/* Event handlers                                                       */
		/* ==================================================================== */

		onGo: function () {
			this._loadData();
		},

		onReset: function () {
			Object.keys(FILTER_INPUTS).forEach(function (sKey) {
				this.byId(FILTER_INPUTS[sKey]).setSelectedKeys([]);
			}, this);
			this._dash().setProperty("/fy", String(this._currentFy()));
			this._dash().setProperty("/mapGranularity", "state");
			this._dash().setProperty("/mapShowDots", true);
			this._dash().setProperty("/selectedRegio", "");
			this._loadData();
		},

		/** Auto/light/dark. Repainting is driven by appTheme's changed listener. */
		onThemeSelect: function (oEvent) {
			appTheme.setMode(oEvent.getParameter("key"));
		},

		/** State/zone choropleth toggle - purely a local re-render, no round trip. */
		onMapGranularityChange: function (oEvent) {
			this._dash().setProperty("/mapGranularity", oEvent.getParameter("key"));
		},

		/** Unit-dot overlay switch - purely a local re-render, no round trip. */
		onMapDotsChange: function (oEvent) {
			this._dash().setProperty("/mapShowDots", oEvent.getParameter("state"));
		},

		/** Clicking a state on the map filters the whole dashboard to that state. */
		onMapStatePress: function (oEvent) {
			var sRegio = oEvent.getParameter("regio");
			if (!sRegio) {
				return;
			}
			var oBox = this.byId("stateFilter");
			var aSelected = oBox.getSelectedKeys();
			var bAlreadyOnly = aSelected.length === 1 && aSelected[0] === sRegio;

			oBox.setSelectedKeys(bAlreadyOnly ? [] : [sRegio]);
			this._dash().setProperty("/selectedRegio", bAlreadyOnly ? "" : sRegio);
			this._loadData();
		},

		/* ==================================================================== */
		/* Filters                                                              */
		/* ==================================================================== */

		/** @returns {number} the FY containing today, real GJAHR convention (OD-6: Apr Y-Mar Y+1 = FY Y) @private */
		_currentFy: function () {
			var d = new Date();
			return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
		},

		/** @returns {object[]} the last 3 fiscal years, most recent first @private */
		_fyOptions: function () {
			var iCurr = this._currentFy();
			return [iCurr, iCurr - 1, iCurr - 2].map(function (fy) {
				return {
					key: String(fy),
					text: "FY " + fy + "-" + String(fy + 1).slice(2)
				};
			});
		},

		/**
		 * Collects the nine filter values from the controls. The date range always spans
		 * the whole selected FY (Apr 1 - Mar 31); a still-open FY simply has no postings
		 * past today, so there is no need to cap the upper bound client-side.
		 * @returns {object} filter object
		 * @private
		 */
		_readFilters: function () {
			var sFy = this._dash().getProperty("/fy");
			var iFy = parseInt(sFy, 10);

			var oFilters = {
				fy: sFy,
				dateFrom: iFy + "-04-01",
				dateTo: (iFy + 1) + "-03-31"
			};
			Object.keys(FILTER_INPUTS).forEach(function (sKey) {
				oFilters[sKey] = this.byId(FILTER_INPUTS[sKey]).getSelectedKeys().slice();
			}, this);

			return oFilters;
		},

		/**
		 * Folds the codes in a response into the dropdown catalogs. Lists accumulate across
		 * loads instead of being replaced: every result set is a top-N/top-20, so a code
		 * drops out of the response as soon as it is filtered on, and a MultiComboBox
		 * silently discards a selected key with no matching item.
		 * @param {object} oData the service response
		 * @private
		 */
		_mergeCatalog: function (oData) {
			var that = this;
			var bChanged = false;

			Object.keys(CATALOG_SOURCES).forEach(function (sFilter) {
				var mSeen = that._mCatalog[sFilter];

				CATALOG_SOURCES[sFilter].forEach(function (oSource) {
					(oData[oSource.entity] || []).forEach(function (oRow) {
						var sKey = oRow[oSource.key];
						var sName = oSource.name ? oRow[oSource.name] : "";
						if (!sKey || mSeen[sKey]) {
							return;
						}
						mSeen[sKey] = {
							key: sKey,
							text: sName || sKey,
							info: sName ? sKey : ""
						};
						bChanged = true;
					});
				});
			});

			if (!bChanged) {
				return;
			}

			var mSelected = {};
			Object.keys(CATALOG_SOURCES).forEach(function (sFilter) {
				mSelected[sFilter] = that.byId(FILTER_INPUTS[sFilter]).getSelectedKeys().slice();
			});

			Object.keys(CATALOG_SOURCES).forEach(function (sFilter) {
				var mSeen = that._mCatalog[sFilter];
				var aItems = Object.keys(mSeen).sort().map(function (sKey) {
					return mSeen[sKey];
				});
				that._dash().setProperty("/options/" + sFilter, aItems);
			});

			Object.keys(CATALOG_SOURCES).forEach(function (sFilter) {
				that.byId(FILTER_INPUTS[sFilter]).setSelectedKeys(mSelected[sFilter]);
			});
		},

		/* ==================================================================== */
		/* Load                                                                 */
		/* ==================================================================== */

		/**
		 * Reads all seven entity sets and rebuilds the whole dashboard. Only one load is
		 * ever in flight - see the GRN Dashboard's own _loadData for the full rationale.
		 * @private
		 */
		_loadData: function () {
			var oFilters = this._readFilters();
			if (this._bLoading) {
				this._bReloadQueued = true;
				return;
			}

			var that = this;
			var oPage = this.byId("page");
			var oModel = this.getOwnerComponent().getModel() || this.getView().getModel();

			if (!oModel) {
				this._setError(this._text("errorNoODataModel"));
				return;
			}

			this._bLoading = true;
			oPage.setBusyIndicatorDelay(0);
			oPage.setBusy(true);
			this._setError("");

			dashboardService.readAll(oModel, oFilters).then(function (oData) {
				that._oRaw = oData;
				that._oFilters = oFilters;
				that._mergeCatalog(oData);
				that._render();
			}).catch(function (oError) {
				Log.error("PMS dashboard load failed", oError && oError.stack, "com.sap.zsdpmsdash");
				var sWhere = oError && oError.pmsEntity ? oError.pmsEntity : "?";
				that._setError(that._text("errorLoadFailed", [sWhere, (oError && oError.message) || String(oError)]));
				that._clearPanels();
			}).finally(function () {
				that._bLoading = false;
				oPage.setBusy(false);
				if (that._bReloadQueued) {
					that._bReloadQueued = false;
					that._loadData();
				}
			});
		},

		/* ==================================================================== */
		/* Render                                                               */
		/* ==================================================================== */

		/** Transforms the last response into the view model and redraws every chart. @private */
		_render: function () {
			var oData = this._oRaw;
			var oModel = this._dash();
			var oCtx = this._ctx();

			oModel.setProperty("/kpis", this._buildKpiCards(oData));
			oModel.setProperty("/geoRows", oData.geo || []);
			oModel.setProperty("/dotRows", oData.unitDots || []);
			oModel.setProperty("/scopeText", this._buildScopeText());
			oModel.setProperty("/mapSubtitle", this._text("mapSubtitle", [this._oFilters.fy]));
			oModel.setProperty("/lastRefreshedText",
				this._text("lastRefreshed", [new Date().toLocaleTimeString()]));

			this._setChart("trend", chartOptions.trend(oData.trend, oCtx), "noDataTrend", oData.trend.length);
			this._setChart("scheme", chartOptions.scheme(oData.scheme, oCtx), "noDataScheme", oData.scheme.length);
			this._setChart("plant", chartOptions.plant(oData.plant, oCtx), "noDataPlant", oData.plant.length);
			this._setChart("material", chartOptions.material(oData.material, oCtx), "noDataMaterial", oData.material.length);
		},

		/**
		 * @param {object} oData the service response
		 * @returns {object[]} one entry per KPI card
		 * @private
		 */
		_buildKpiCards: function (oData) {
			var that = this;
			var aTrend = oData.trend || [];
			var aSpark = aTrend.map(function (r) {
				return Math.round(parseFloat(r.NetValue) || 0);
			});

			return (oData.kpi || []).map(function (oKpi) {
				var fDelta = parseFloat(oKpi.DeltaPct);
				var bMoney = oKpi.Id !== "DOC_COUNT";
				var sNote = "";

				if (oKpi.Id === "DAILY_SALE") {
					sNote = oKpi.SnapshotDate ?
						that._text("kpiDailyNote", [formatter.dateShort(oKpi.SnapshotDate), formatter.count(oKpi.DocCount)]) :
						that._text("kpiDailyNoteEmpty");
				}

				return {
					id: oKpi.Id,
					label: oKpi.KpiLabel,
					unit: "",
					valueText: bMoney ? formatter.money(oKpi.CurrValue) : formatter.count(oKpi.CurrValue),
					deltaText: formatter.signedPercent(oKpi.DeltaPct),
					deltaTone: isFinite(fDelta) ? (fDelta >= 0 ? "pos" : "neg") : "none",
					note: sNote,
					spark: (oKpi.Id === "NET" && aSpark.length) ?
						chartOptions.sparkline(aSpark, that._oPalette.accent, that._ctx()) : null
				};
			});
		},

		/**
		 * Human-readable summary of what is currently selected, mirroring the prototype's
		 * SCOPE line.
		 * @returns {string} the scope line
		 * @private
		 */
		_buildScopeText: function () {
			var f = this._oFilters;
			var that = this;
			var part = function (aKeys, sAllKey) {
				if (!aKeys || !aKeys.length) {
					return that._text(sAllKey);
				}
				return aKeys.length <= 3 ? aKeys.join(", ") : aKeys.length + " selected";
			};

			return [
				"FY " + f.fy,
				part(f.zone, "allZones"),
				part(f.state, "allStates"),
				part(f.plant, "allPlants"),
				part(f.scheme, "allSchemes"),
				part(f.material, "allMaterials")
			].join("  " + formatter.MIDDOT + "  ");
		},

		/* ==================================================================== */
		/* Charts                                                               */
		/* ==================================================================== */

		/** @returns {object} {echarts, pal, animate} shared by every chart option builder @private */
		_ctx: function () {
			return {
				echarts: this._oECharts,
				pal: this._oPalette,
				animate: true
			};
		},

		/** @private */
		_setChart: function (sPath, oOption, sEmptyKey, bHasRows) {
			this._dash().setProperty("/charts/" + sPath,
				bHasRows ? oOption : chartOptions.empty(this._text(sEmptyKey || "noData"), this._oPalette));
		},

		/** Empties every panel after a failed load. @private */
		_clearPanels: function () {
			var that = this;
			var oCharts = {};
			["trend", "scheme", "plant", "material"].forEach(function (sKey) {
				oCharts[sKey] = chartOptions.empty(that._text("noData"), that._oPalette);
			});

			var oModel = this._dash();
			oModel.setProperty("/charts", oCharts);
			oModel.setProperty("/kpis", []);
			oModel.setProperty("/geoRows", []);
			oModel.setProperty("/dotRows", []);
		},

		/**
		 * Re-resolves the palette from the (new) tokens and redraws from the cached
		 * response - no round trip, since a theme change does not affect the data.
		 * @private
		 */
		_onAppThemeChanged: function () {
			var that = this;
			chartTheme.reset();
			chartTheme.get().then(function (oPalette) {
				that._oPalette = oPalette;
				if (that._oRaw) {
					that._render();
				}
			});
		},

		/* ==================================================================== */
		/* Small helpers                                                        */
		/* ==================================================================== */

		/**
		 * Builds the items for a Toggle from i18n keys, e.g. "theme" + "auto" -> themeAuto.
		 * @param {string[]} aKeys option keys
		 * @param {string} sPrefix i18n key prefix
		 * @returns {object[]} {key, text} pairs
		 * @private
		 */
		_toggleItems: function (aKeys, sPrefix) {
			var that = this;
			return aKeys.map(function (sKey) {
				return {
					key: sKey,
					text: that._text(sPrefix + sKey.charAt(0).toUpperCase() + sKey.slice(1))
				};
			});
		},

		/** @returns {sap.ui.model.json.JSONModel} the view model @private */
		_dash: function () {
			return this.getView().getModel("dash");
		},

		/**
		 * The i18n model is owned by the Component and has not propagated to the view yet
		 * while onInit runs, so the component is asked first.
		 * @param {string} sKey bundle key
		 * @param {string[]} [aArgs] placeholder values
		 * @returns {string} the translated text
		 * @private
		 */
		_text: function (sKey, aArgs) {
			var oComponent = this.getOwnerComponent();
			var oModel = (oComponent && oComponent.getModel("i18n")) || this.getView().getModel("i18n");
			return oModel.getResourceBundle().getText(sKey, aArgs);
		},

		/** @private */
		_setError: function (sText) {
			this._dash().setProperty("/errorText", sText || "");
		}
	});
});
