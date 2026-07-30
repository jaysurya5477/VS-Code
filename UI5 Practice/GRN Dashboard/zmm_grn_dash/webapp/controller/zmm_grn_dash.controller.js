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

	/** The four code filters, keyed by the name the service expects. */
	var FILTER_INPUTS = {
		vendor: "vendorFilter",
		material: "materialFilter",
		plant: "plantFilter",
		docType: "docTypeFilter"
	};

	/**
	 * Where each filter's selectable values are harvested from. The service exposes no
	 * value-help entity sets, so the dropdowns are built from the codes the result sets
	 * actually contain - see _mergeCatalog for why they accumulate rather than replace.
	 */
	var CATALOG_SOURCES = {
		vendor: [{
			entity: "vendorScorecard",
			key: "Vendor",
			name: "VendorName"
		}, {
			entity: "vendorTop10",
			key: "Vendor",
			name: "VendorName"
		}],
		material: [{
			entity: "materialTop20",
			key: "Material",
			name: "MaterialName"
		}, {
			entity: "materialRejWorst10",
			key: "Material",
			name: "MaterialName"
		}],
		plant: [{
			entity: "plantTop10",
			key: "Plant"
		}],
		docType: [{
			entity: "doctypeRanked",
			key: "DocType",
			name: "DocTypeName"
		}]
	};

	/**
	 * Presentation metadata for the four KPI cards.
	 *
	 * Keyed by the ID the backend emits (ZCL_GRN_DASH_QUERY line 763ff) so the cards keep
	 * their identity regardless of row order, and so an unexpected extra KPI shows up with
	 * sensible defaults rather than breaking the row.
	 */
	var KPI_META = {
		GRN_QTY: {
			mvt: "101 / 102",
			money: false,
			uomField: "GrossQty",
			spark: function (r) {
				return r.Qty101 + r.Qty102;
			}
		},
		GRN_VALUE: {
			mvt: "ALL MVT",
			unit: "",
			money: true,
			uomField: "GrossValue",
			spark: function (r) {
				return r.Val101 + r.Val102;
			}
		},
		NET_QTY: {
			mvt: "NET",
			money: false,
			uomField: "NetQty",
			spark: function (r) {
				return r.NetQty;
			}
		},
		NET_VALUE: {
			mvt: "NET",
			unit: "",
			money: true,
			uomField: "NetValue",
			spark: function (r) {
				return r.NetVal;
			}
		}
	};

	/** Movement type and tone per quality bucket - tones map to the .grnTone--* classes. */
	var QUALITY_META = {
		"Accepted": {
			mvt: "101",
			tone: "accent"
		},
		"Rejected": {
			mvt: "101",
			tone: "neg",
			negative: true
		},
		"Sample": {
			mvt: "101",
			tone: "alt"
		},
		"Under Inspection": {
			mvt: "101 - no UD",
			tone: "warn"
		},
		"Rework GRN Qty": {
			mvt: "Z22",
			tone: "alt"
		}
	};

	return Controller.extend("com.sap.zmmgrndash.controller.zmm_grn_dash", {

		formatter: formatter,

		/* ==================================================================== */
		/* Lifecycle                                                            */
		/* ==================================================================== */

		onInit: function () {
			this._oRaw = null; // last successful service response, for theme rebuilds
			this._oFilters = null;
			this._bLoading = false;
			this._bReloadQueued = false;
			this._oPalette = null;
			this._oECharts = null;
			this._mCatalog = {
				vendor: {},
				material: {},
				plant: {},
				docType: {}
			};

			this.getView().setModel(new JSONModel({
				kpis: [],
				quality: [],
				ratios: [],
				scorecard: [],
				scorecardColumns: this._scorecardColumns(),
				scorecardCountText: "",
				charts: {},
				options: {
					vendor: [],
					material: [],
					plant: [],
					docType: []
				},
				themeMode: appTheme.getMode(),
				themeOptions: this._toggleItems(["auto", "light", "dark"], "theme"),
				trendMode: "qty",
				modeOptions: this._toggleItems(["qty", "value"], "mode"),
				uomFilter: "",
				uomOptions: [],
				vendorRankDir: "DESC",
				rankOptions: [
					{key: "DESC", text: this._text("rankBest")},
					{key: "ASC", text: this._text("rankWorst")}
				],
				scopeText: "",
				trendSubtitle: this._text("chartTrendSubQty"),
				lastRefreshedText: "",
				errorText: ""
			}), "dash");

			this._applyPeriodPreset("CURR_FY");

			// Panels and filter bar are themed by two different systems; appTheme keeps them
			// aligned and tells us when the palette underneath the charts has moved.
			appTheme.apply();
			this._fnAppThemeChanged = this._onAppThemeChanged.bind(this);
			appTheme.attachChanged(this._fnAppThemeChanged);

			// Fires when the shell (or our own applyTheme call) swaps the UI5 theme.
			this._fnThemeChanged = function () {
				appTheme.apply();
			};
			Core.attachThemeChanged(this._fnThemeChanged);

			// ECharts and the palette are both prerequisites for drawing, so resolve them
			// once up front and only then fire the first read.
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
			this.byId("periodSelect").setSelectedKey("CURR_FY");
			this._applyPeriodPreset("CURR_FY");
			this._dash().setProperty("/trendMode", "qty");
			this._dash().setProperty("/uomFilter", "");
			this._dash().setProperty("/vendorRankDir", "DESC");
			this._loadData();
		},

		onPeriodPresetChange: function (oEvent) {
			var sKey = oEvent.getParameter("selectedItem").getKey();
			if (sKey !== "CUSTOM") {
				this._applyPeriodPreset(sKey);
				this._loadData();
			}
		},

		/** Editing the dates by hand flips the preset dropdown to Custom. */
		onDateRangeChange: function (oEvent) {
			this.byId("periodSelect").setSelectedKey("CUSTOM");
			if (oEvent.getParameter("valid")) {
				this._loadData();
			}
		},

		/** Auto / light / dark. Repainting is driven by appTheme's changed listener. */
		onThemeSelect: function (oEvent) {
			appTheme.setMode(oEvent.getParameter("key"));
		},

		/**
		 * Quantity/value toggle. Only the trend chart depends on it, and the underlying
		 * rows already carry both, so this is a local redraw with no round trip.
		 */
		onTrendModeChange: function () {
			if (this._oRaw) {
				this._buildTrend();
			}
		},

		/**
		 * Quantity UoM picker. Unlike the qty/value toggle above, this is a genuine data
		 * filter - every panel except the hero KPI/qualification breakdown tables is
		 * refetched scoped to the selected base UoM (menge/value are never summed across
		 * UoMs, so there is no local recomputation to fall back on).
		 */
		onUomSelect: function (oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			this._dash().setProperty("/uomFilter", oItem ? oItem.getKey() : "");
			this._loadData();
		},

		/**
		 * Vendor scorecard best/worst toggle - a genuine refetch (see P_RankDir), but only
		 * VendorScorecard declares that parameter, so this refetches just that one entity
		 * instead of routing through _loadData() and re-requesting (and re-rendering) all
		 * twelve panels for a toggle that only changes one of them.
		 */
		onVendorRankSelect: function (oEvent) {
			this._dash().setProperty("/vendorRankDir", oEvent.getParameter("key"));
			this._reloadVendorScorecard();
		},

		/** Rebuilds the doc-type chart so its zoom window is re-fitted to the current width. */
		onResetDocTypeZoom: function () {
			if (this._oRaw) {
				this._buildDocType();
			}
		},

		/** Clicking a vendor bar filters the whole dashboard to that vendor. */
		onVendorChartSelect: function (oEvent) {
			var oParams = oEvent.getParameter("data") || {};
			var sVendor = oParams.data && oParams.data.vendor;
			if (sVendor) {
				this._toggleSingleValue("vendor", sVendor);
			}
		},

		/** Same for a scorecard row - the prototype's documented interaction. */
		onScorecardRowPress: function (oEvent) {
			var oRow = oEvent.getParameter("row");
			if (oRow && oRow.code) {
				this._toggleSingleValue("vendor", oRow.code);
			}
		},

		/* ==================================================================== */
		/* Filters                                                              */
		/* ==================================================================== */

		/**
		 * Sets the date range from a named preset. The fiscal year is April-March (Indian
		 * FY), and the "current" presets stop at today rather than running into empty
		 * future months.
		 * @param {string} sKey preset key
		 * @private
		 */
		_applyPeriodPreset: function (sKey) {
			var oToday = new Date();
			oToday.setHours(0, 0, 0, 0);
			var iYear = oToday.getFullYear();
			var bAfterApril = oToday.getMonth() >= 3; // 3 = April
			var iFyStart = bAfterApril ? iYear : iYear - 1;
			var oFrom;
			var oTo = oToday;

			switch (sKey) {
			case "PREV_FY":
				oFrom = new Date(iFyStart - 1, 3, 1);
				oTo = new Date(iFyStart, 2, 31);
				break;
			case "LAST12":
				oFrom = new Date(iYear, oToday.getMonth() - 11, 1);
				break;
			case "YTD":
				oFrom = new Date(iYear, 0, 1);
				break;
			case "CURR_MONTH":
				oFrom = new Date(iYear, oToday.getMonth(), 1);
				break;
			case "CURR_FY":
			default:
				oFrom = new Date(iFyStart, 3, 1);
				break;
			}

			var oRange = this.byId("dateRange");
			oRange.setDateValue(oFrom);
			oRange.setSecondDateValue(oTo);
		},

		/**
		 * Collects the six filter values from the controls.
		 * @returns {object|null} filter object, or null if the date range is incomplete
		 * @private
		 */
		_readFilters: function () {
			var oRange = this.byId("dateRange");
			var oFrom = oRange.getDateValue();
			var oTo = oRange.getSecondDateValue();

			if (!oFrom || !oTo) {
				return null;
			}

			var oFilters = {
				dateFrom: formatter.isoDate(oFrom),
				dateTo: formatter.isoDate(oTo)
			};
			Object.keys(FILTER_INPUTS).forEach(function (sKey) {
				oFilters[sKey] = this.byId(FILTER_INPUTS[sKey]).getSelectedKeys().slice();
			}, this);
			oFilters.uom = this._dash().getProperty("/uomFilter") || "";
			oFilters.rankDir = this._dash().getProperty("/vendorRankDir") || "DESC";

			return oFilters;
		},

		/**
		 * Sets a filter to exactly one value, or clears it if that value is already the
		 * only one selected - so clicking the same vendor twice toggles the drilldown off.
		 * @param {string} sFilter filter key
		 * @param {string} sValue the code to isolate
		 * @private
		 */
		_toggleSingleValue: function (sFilter, sValue) {
			var oBox = this.byId(FILTER_INPUTS[sFilter]);
			var aSelected = oBox.getSelectedKeys();
			var bAlreadyOnly = aSelected.length === 1 && aSelected[0] === sValue;

			oBox.setSelectedKeys(bAlreadyOnly ? [] : [sValue]);
			this._loadData();
		},

		/**
		 * Folds the codes in a response into the dropdown catalogs.
		 *
		 * The lists accumulate across loads instead of being replaced, for two reasons:
		 * every result set is a top-N, so a code drops out of the response as soon as it is
		 * filtered on; and a MultiComboBox silently discards a selected key that has no
		 * matching item, which would clear the very filter the user just applied.
		 *
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

			// Rebinding the items can drop the current selection, so it is restored by key.
			var mSelected = {};
			Object.keys(FILTER_INPUTS).forEach(function (sFilter) {
				mSelected[sFilter] = that.byId(FILTER_INPUTS[sFilter]).getSelectedKeys().slice();
			});

			Object.keys(CATALOG_SOURCES).forEach(function (sFilter) {
				var mSeen = that._mCatalog[sFilter];
				var aItems = Object.keys(mSeen).sort().map(function (sKey) {
					return mSeen[sKey];
				});
				that._dash().setProperty("/options/" + sFilter, aItems);
			});

			Object.keys(FILTER_INPUTS).forEach(function (sFilter) {
				that.byId(FILTER_INPUTS[sFilter]).setSelectedKeys(mSelected[sFilter]);
			});
		},

		/**
		 * Builds the UoM picker's button list from KpiByUom - the one entity always fetched
		 * unfiltered by the picker itself, so its distinct Uom codes are exactly "every base
		 * UoM actually present in the current filter scope" (never a hardcoded guess).
		 *
		 * On the very first load (or right after Reset) nothing is selected yet, so the
		 * picker defaults to the largest UoM group by gross qty - KpiByUom already arrives
		 * sorted that way (ZCL_GRN_DASH_QUERY: SORT lt_kpi BY gross_qty DESCENDING).
		 *
		 * @param {object} oData the service response
		 * @returns {boolean} true if a default was just chosen (caller should reload)
		 * @private
		 */
		_buildUomOptions: function (oData) {
			var oModel = this._dash();
			var aOptions = (oData.kpiByUom || []).map(function (r) {
				return {
					key: r.Uom,
					text: r.Uom
				};
			});
			oModel.setProperty("/uomOptions", aOptions);

			if (!oModel.getProperty("/uomFilter") && aOptions.length) {
				oModel.setProperty("/uomFilter", aOptions[0].key);
				return true;
			}
			return false;
		},

		/* ==================================================================== */
		/* Load                                                                 */
		/* ==================================================================== */

		/**
		 * Reads all ten entity sets and rebuilds the whole dashboard.
		 *
		 * Only one load is ever in flight: the filter controls fire on change, and parallel
		 * round trips could land out of order. A request made while one is running is
		 * remembered and re-issued afterwards, so the dashboard always ends up showing the
		 * filters the user last touched rather than silently dropping the change.
		 * @private
		 */
		_loadData: function () {
			var oFilters = this._readFilters();
			if (!oFilters) {
				this._setError(this._text("errorDateRangeRequired"));
				return;
			}
			if (this._bLoading) {
				this._bReloadQueued = true;
				return;
			}

			var that = this;
			var oPage = this.byId("page");
			// The default model is set on the Component synchronously in its own init()
			// (from manifest.json), independent of whether the view has been inserted into
			// its parent yet. this.getView().getModel() instead relies on propagation down
			// the control tree, which only happens once the router parents the view - on a
			// cold Fiori Launchpad tile open that can still be pending when onInit's
			// promise chain resolves, so it intermittently reads back undefined even though
			// the model exists. Same class of bug as _text()'s i18n lookup below.
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
				var bUomDefaulted = that._buildUomOptions(oData);
				that._render();
				if (bUomDefaulted) {
					// The picker just got its first default (largest UoM group) - every
					// other panel was fetched with uom="" (all), so refetch once with the
					// real selection. _bLoading is still true here, so this only queues via
					// the existing single-flight guard; .finally() below fires it.
					that._loadData();
				}
			}).catch(function (oError) {
				Log.error("GRN dashboard load failed", oError && oError.stack, "com.sap.zmmgrndash");
				var sWhere = oError && oError.grnEntity ? oError.grnEntity : "?";
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

		/**
		 * Refetches just the VendorScorecard entity (the only one that declares P_RankDir)
		 * and patches the scorecard's two derived properties in place. Busies only the
		 * Scorecard control itself, so the rest of the dashboard - including every other
		 * EChart instance - never sees an invalidate.
		 * @private
		 */
		_reloadVendorScorecard: function () {
			if (!this._oFilters || !this._oRaw) {
				// Nothing loaded yet (still resolving onInit's ECharts/palette promise) -
				// there's no cached data to patch, so fall back to a normal full load.
				this._loadData();
				return;
			}

			var that = this;
			var oModel = this.getOwnerComponent().getModel() || this.getView().getModel();
			var oScorecard = this.byId("scorecard");
			var oFilters = Object.assign({}, this._oFilters, {
				rankDir: this._dash().getProperty("/vendorRankDir")
			});

			oScorecard.setBusyIndicatorDelay(0);
			oScorecard.setBusy(true);

			dashboardService.readEntity(oModel, "vendorScorecard", oFilters).then(function (aRows) {
				that._oFilters = oFilters;
				that._oRaw.vendorScorecard = aRows;

				var oDash = that._dash();
				oDash.setProperty("/scorecard", that._buildScorecard(that._oRaw));
				oDash.setProperty("/scorecardCountText", that._text(
					oFilters.rankDir === "ASC" ? "scorecardCountWorst" : "scorecardCountBest",
					[aRows.length]));
			}).catch(function (oError) {
				Log.error("GRN vendor scorecard reload failed", oError && oError.stack, "com.sap.zmmgrndash");
				var sWhere = oError && oError.grnEntity ? oError.grnEntity : "VendorScorecard";
				that._setError(that._text("errorLoadFailed", [sWhere, (oError && oError.message) || String(oError)]));
			}).finally(function () {
				oScorecard.setBusy(false);
			});
		},

		/* ==================================================================== */
		/* Render                                                               */
		/* ==================================================================== */

		/** Transforms the last response into the view model and redraws every chart. @private */
		_render: function () {
			var oData = this._oRaw;
			var oModel = this._dash();

			oModel.setProperty("/kpis", this._buildKpiCards(oData));
			oModel.setProperty("/quality", this._buildQualityCards(oData));
			oModel.setProperty("/ratios", this._buildRatioStrip(oData));
			oModel.setProperty("/scorecard", this._buildScorecard(oData));
			oModel.setProperty("/scorecardColumns", this._scorecardColumns());
			oModel.setProperty("/scorecardCountText", this._text(
				oModel.getProperty("/vendorRankDir") === "ASC" ? "scorecardCountWorst" : "scorecardCountBest",
				[oData.vendorScorecard.length]));
			oModel.setProperty("/scopeText", this._buildScopeText());
			oModel.setProperty("/lastRefreshedText",
				this._text("lastRefreshed", [new Date().toLocaleTimeString()]));

			this._buildTrend();
			this._buildDocType();
			this._buildStaticCharts();
		},

		/**
		 * @param {object} oData the service response
		 * @returns {object[]} one entry per KPI card
		 * @private
		 */
		_buildKpiCards: function (oData) {
			var that = this;
			var aTrend = oData.trend;
			var aKpiByUom = oData.kpiByUom || [];
			var sUom = this._dash().getProperty("/uomFilter") || "";

			return oData.kpi.map(function (oKpi) {
				var oMeta = KPI_META[oKpi.ID] || {
					mvt: "",
					unit: "",
					money: false
				};
				var fnFormat = oMeta.money ? formatter.money : formatter.fmtQ;
				var fDelta = parseFloat(oKpi.DeltaPct);

				// Sparkline shares the KPI's own measure, taken across the trend periods.
				var aSpark = [];
				if (oMeta.spark) {
					aSpark = aTrend.map(function (r) {
						return Math.round(oMeta.spark({
							Qty101: parseFloat(r.Qty101) || 0,
							Qty102: parseFloat(r.Qty102) || 0,
							Val101: parseFloat(r.Val101) || 0,
							Val102: parseFloat(r.Val102) || 0,
							NetQty: parseFloat(r.NetQty) || 0,
							NetVal: parseFloat(r.NetVal) || 0
						}));
					});
				}

				return {
					id: oKpi.ID,
					label: oKpi.KpiLabel,
					mvt: oMeta.mvt,
					// Quantity cards show the currently selected UoM (there is no longer
					// a single "base UoM" - quantities are never summed across UoMs);
					// value cards have no unit suffix, unchanged.
					unit: oMeta.money ? (oMeta.unit || "") : sUom,
					valueText: fnFormat(oKpi.CurrValue),
					deltaText: formatter.signedPercent(oKpi.DeltaPct),
					deltaTone: isFinite(fDelta) ? (fDelta >= 0 ? "pos" : "neg") : "none",
					spark: aSpark.length ? chartOptions.sparkline(
						aSpark,
						oMeta.money ? that._oPalette.warn : that._oPalette.accent,
						that._ctx()) : null,
					breakdown: oMeta.uomField ?
						that._uomBreakdown(aKpiByUom, oMeta.uomField, fnFormat) : null
				};
			});
		},

		/**
		 * Turns a flat array of per-UoM rows into breakdown entries with a mini-bar
		 * width scaled to the largest magnitude in the array - shared by the hero KPI
		 * and qualification cards' always-on per-UoM tables.
		 * @param {object[]} aRows rows carrying a Uom property and the given field
		 * @param {string} sField numeric property to read off each row
		 * @param {function} fnFormat number -> display text
		 * @returns {object[]} [{uom, qtyText, pct}]
		 * @private
		 */
		_uomBreakdown: function (aRows, sField, fnFormat) {
			var fMax = (aRows || []).reduce(function (m, r) {
				return Math.max(m, Math.abs(parseFloat(r[sField]) || 0));
			}, 0) || 1;
			return (aRows || []).map(function (r) {
				var fVal = parseFloat(r[sField]) || 0;
				return {
					uom: r.Uom,
					qtyText: fnFormat(fVal),
					pct: Math.min(100, Math.abs(fVal) / fMax * 100).toFixed(1) + "%"
				};
			});
		},

		/**
		 * @param {object} oData the service response
		 * @returns {object[]} one entry per quality bucket card
		 * @private
		 */
		_buildQualityCards: function (oData) {
			var that = this;
			var aQualByUom = oData.qualByUom || [];

			return oData.quality.map(function (oRow) {
				var oMeta = QUALITY_META[oRow.Bucket] || {
					mvt: "",
					tone: "accent"
				};
				var fShare = parseFloat(oRow.SharePct) || 0;
				var aBucketUom = aQualByUom.filter(function (r) {
					return r.Bucket === oRow.Bucket;
				});
				return {
					label: oRow.Bucket,
					mvt: oMeta.mvt,
					tone: oMeta.tone,
					negative: !!oMeta.negative,
					valueText: formatter.fmtQ(oRow.Qty),
					shareText: that._text("shareOfGross", [formatter.percent(fShare, 1)]),
					sharePct: Math.max(0, Math.min(100, Math.abs(fShare))),
					breakdown: that._uomBreakdown(aBucketUom, "Qty", formatter.fmtQ)
				};
			});
		},

		/**
		 * The ratio strip: rejection rate, rework rate, reversal rate, net GRN rate.
		 * Each cell gets a short colored flag (verdict) and a longer always-visible
		 * note (the formula), formatted per ID since the target/tone logic differs.
		 * @param {object} oData the service response
		 * @returns {object[]} one entry per ratio cell
		 * @private
		 */
		_buildRatioStrip: function (oData) {
			var that = this;
			return oData.ratio.map(function (oRow) {
				var fValue = parseFloat(oRow.RatioValue) || 0;
				var oCell = {
					id: oRow.ID,
					label: oRow.RatioLabel,
					valueText: formatter.percent(fValue),
					note: "",
					flag: "",
					flagTone: "none",
					tone: "none"
				};

				switch (oRow.ID) {
				case "REJ_RATE":
					oCell.flag = fValue > chartOptions.TARGET_REJECTION_PCT ?
						that._text("aboveTarget") : that._text("withinTarget");
					oCell.flagTone = fValue > chartOptions.TARGET_REJECTION_PCT ? "neg" : "pos";
					oCell.tone = oCell.flagTone;
					oCell.note = that._text("rejRateNote", [chartOptions.TARGET_REJECTION_PCT.toFixed(1)]);
					break;
				case "RWK_RATE":
					oCell.flag = fValue > chartOptions.TARGET_REWORK_PCT ?
						that._text("aboveTarget") : that._text("withinTarget");
					oCell.flagTone = fValue > chartOptions.TARGET_REWORK_PCT ? "warn" : "pos";
					oCell.tone = fValue > chartOptions.TARGET_REWORK_PCT ? "warn" : "none";
					oCell.note = that._text("reworkRateNote", [chartOptions.TARGET_REWORK_PCT.toFixed(1)]);
					break;
				case "REV_RATE":
					oCell.note = that._text("reversalRateNote");
					break;
				case "NET_RATE":
					oCell.valueText = formatter.percent(fValue, 1);
					oCell.flag = that._text("cleanReceipts");
					oCell.flagTone = "pos";
					oCell.tone = "pos";
					oCell.note = that._text("netRateNote");
					break;
				default:
					break;
				}
				return oCell;
			});
		},

		/**
		 * Formats the vendor scorecard. The control renders text only, so every number is
		 * turned into its display form here - one place for the crore/lakh notation and the
		 * score/rejection thresholds.
		 * @param {object} oData the service response
		 * @returns {object[]} rows for the Scorecard control
		 * @private
		 */
		_buildScorecard: function (oData) {
			var aSelected = this.byId("vendorFilter").getSelectedKeys();
			var bSingle = aSelected.length === 1;

			return oData.vendorScorecard.map(function (oRow) {
				var fScore = parseFloat(oRow.Score) || 0;
				var fRej = parseFloat(oRow.RejPct) || 0;
				return {
					code: oRow.Vendor,
					name: oRow.VendorName || oRow.Vendor,
					qtyText: formatter.fmtQ(oRow.Qty),
					netText: formatter.fmtQ(oRow.NetQty),
					valueText: formatter.money(oRow.Value),
					rejQtyText: formatter.fmtQ(oRow.RejQty),
					rejText: formatter.percent(fRej),
					rejTone: fRej > chartOptions.TARGET_REJECTION_PCT ? "neg" : "pos",
					reworkText: formatter.percent(oRow.ReworkPct, 1),
					scoreText: formatter.count(fScore),
					scorePct: Math.max(0, Math.min(100, fScore)),
					tone: fScore > 82 ? "pos" : fScore > 68 ? "warn" : "neg",
					selected: bSingle && aSelected[0] === oRow.Vendor
				};
			});
		},

		/**
		 * Human-readable summary of what is currently selected, mirroring the prototype's
		 * SCOPE line so a screenshot of the dashboard is self-describing.
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
				f.dateFrom + " " + formatter.RANGE_ARROW + " " + f.dateTo,
				part(f.plant, "allPlants"),
				part(f.vendor, "allVendors"),
				part(f.docType, "allDocTypes"),
				part(f.material, "allMaterials")
			].join("  " + formatter.MIDDOT + "  ");
		},

		/* ==================================================================== */
		/* Charts                                                               */
		/* ==================================================================== */

		/**
		 * The shared context every option builder needs.
		 * @param {object} [oExtra] extra context, e.g. the measured width
		 * @returns {object} {echarts, pal, mode, animate}
		 * @private
		 */
		_ctx: function (oExtra) {
			return Object.assign({
				echarts: this._oECharts,
				pal: this._oPalette,
				mode: this._dash().getProperty("/trendMode"),
				uom: this._dash().getProperty("/uomFilter") || "",
				animate: true
			}, oExtra || {});
		},

		/** Measures a chart control's rendered width, for width-sensitive layouts. @private */
		_widthOf: function (sId) {
			var oDom = this.byId(sId).getDomRef();
			return (oDom && oDom.clientWidth) || 0;
		},

		/** @private */
		_setChart: function (sPath, oOption, sEmptyKey, bHasRows) {
			this._dash().setProperty("/charts/" + sPath,
				bHasRows ? oOption : chartOptions.empty(this._text(sEmptyKey || "noData"), this._oPalette));
		},

		/** Trend chart plus its subtitle - the only pair that depends on the qty/value mode. @private */
		_buildTrend: function () {
			var aRows = this._oRaw.trend;
			var bQty = this._dash().getProperty("/trendMode") === "qty";

			this._dash().setProperty("/trendSubtitle",
				this._text(bQty ? "chartTrendSubQty" : "chartTrendSubValue"));
			this._setChart("trend", chartOptions.trend(aRows, this._ctx()), "noDataTrend", aRows.length);
		},

		/** Doc-type chart - rebuilt separately because its zoom window depends on width. @private */
		_buildDocType: function () {
			var aRows = this._oRaw.doctypeRanked;
			this._setChart("doctypeRanked",
				chartOptions.doctypeRanked(aRows, this._ctx({
					width: this._widthOf("chartDocType")
				})),
				"noDataDocType", aRows.length);
		},

		/** Everything that depends only on the data and the palette. @private */
		_buildStaticCharts: function () {
			var oData = this._oRaw;
			var oCtx = this._ctx();
			var oRatios = dashboardService.byId(oData.ratio);
			var fRejRate = oRatios.REJ_RATE ? parseFloat(oRatios.REJ_RATE.RatioValue) : 0;

			this._setChart("quality", chartOptions.quality(oData.quality, fRejRate, oCtx),
				"noDataQuality", oData.quality.length);
			this._setChart("vendorTop10", chartOptions.vendorTop10(oData.vendorTop10, oCtx),
				"noDataVendor", oData.vendorTop10.length);
			this._setChart("plantTop10", chartOptions.plantTop10(oData.plantTop10, oCtx),
				"noDataPlant", oData.plantTop10.length);
			this._setChart("materialTop20", chartOptions.materialTop20(oData.materialTop20, oCtx),
				"noDataMaterial", oData.materialTop20.length);
			this._setChart("materialRejWorst10", chartOptions.materialRejWorst10(oData.materialRejWorst10, oCtx),
				"noDataMatRej", oData.materialRejWorst10.length);
		},

		/** Empties every panel after a failed load. @private */
		_clearPanels: function () {
			var that = this;
			var oCharts = {};
			["trend", "quality", "vendorTop10", "plantTop10", "materialTop20", "doctypeRanked",
				"materialRejWorst10"
			].forEach(function (sKey) {
				oCharts[sKey] = chartOptions.empty(that._text("noData"), that._oPalette);
			});

			var oModel = this._dash();
			oModel.setProperty("/charts", oCharts);
			oModel.setProperty("/kpis", []);
			oModel.setProperty("/quality", []);
			oModel.setProperty("/ratios", []);
			oModel.setProperty("/scorecard", []);
			oModel.setProperty("/scorecardCountText", "");
		},

		/**
		 * Re-resolves the palette from the (new) tokens and redraws from the cached
		 * response - no round trip, because a theme change does not affect the data.
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

		/** @returns {string[]} the eight scorecard column headers @private */
		_scorecardColumns: function () {
			var that = this;
			var oModel = this._dash();
			var sUom = (oModel && oModel.getProperty("/uomFilter")) || "";
			return ["colVendor", "colGrnQty", "colNetQty", "colGrnValue", "colRejQty", "colRejRate", "colRework", "colScore"]
				.map(function (sKey) {
					var sText = that._text(sKey);
					// Qty columns show the currently selected UoM - quantities are never
					// summed across UoMs, so there is no longer one fixed unit to print
					// in the static i18n label.
					if (sUom && (sKey === "colGrnQty" || sKey === "colNetQty" || sKey === "colRejQty")) {
						sText += " (" + sUom + ")";
					}
					return sText;
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
