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
	"../model/echartsLoader",
	"../model/indiaGeo"
], function (Controller, Core, JSONModel, Log, formatter, dashboardService, chartOptions, chartTheme,
	appTheme, echartsLoader, INDIA) {
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
	 * Where the State/Plant/Scheme/Material dropdowns' selectable values come from.
	 *
	 * State and Scheme have no dedicated catalog entity - they're built from the codes the
	 * Geo/Scheme result sets actually contain, so the lists accumulate rather than replace
	 * (see _mergeCatalog for why). Plant and Material each list TWO sources: `plant`/
	 * `material` (Top-20-by-value, capped for their chart panels - production has ~109
	 * billing plants and far more materials than 20) plus the uncapped `plantCatalog`/
	 * `materialCatalog` entities - a filter must never be limited to what a chart happens to
	 * show. Both stay listed, not just the catalog one, because dashboardService.js treats
	 * the two catalog entities as optional (they degrade to an empty list rather than fail
	 * the whole load if the backend hasn't been updated with them yet - see its own
	 * OPTIONAL_ENTITIES comment): keeping the Top-20 source here means the filter still gets
	 * *some* codes during that rollout window instead of going empty, and gets the full
	 * uncapped set as soon as the catalog entities are actually available. _mergeCatalog
	 * already dedupes by key, so once both sources return the same code it's listed once.
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
		}, {
			entity: "plantCatalog",
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
			name: "Arktx",
			extra: "Bismt"
		}, {
			entity: "materialCatalog",
			key: "Matnr",
			name: "Arktx",
			// Folded into the catalog item's `info` (secondary value) alongside the material
			// code, so a user who only knows a material's old number can still find it - both
			// by reading the dropdown and by typing it, see _wireMaterialSearch().
			extra: "Bismt"
		}]
	};

	/** Real zone list (ZONE_ORDER, confirmed against ZCL_PMS_DASH_QUERY/ZSD_ZONE_PLANT). */
	var ZONES = ["North", "West", "South", "East", "Central"];

	/** FY-period month labels, Apr=1..Mar=12 (OD-6/OD-7 real convention). */
	var FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

	/**
	 * KPI Id -> KpiCard accent variant. The variants carry the prototype's own four card
	 * gradients (see .pmsKpi--* in css/style.css) and the matching sparkline colour; the
	 * ids are the ones ZCL_PMS_DASH_QUERY emits.
	 */
	var KPI_ACCENT = {
		NET: "net",
		TAX: "tax",
		GROSS: "gross",
		DAILY_SALE: "daily"
	};

	/** Total states the base map can draw - the denominator of the map's "N of M billed" hint. */
	var STATE_COUNT = Object.keys(INDIA.paths).length;

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
				schemeRows: [],
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
				mapTexts: this._mapTexts(),
				schemeSubtitle: "",
				priorFyLabel: "",
				selectedRegios: [],
				selectedZones: [],
				selectedSchemes: [],
				scopeText: "",
				lastRefreshedText: "",
				errorText: ""
			}), "dash");

			this._wireMaterialSearch();

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

		/**
		 * Changing a filter only stages it - the dashboard reloads when Go is pressed, never
		 * on the selection itself. That is the whole point of having a Go button: a scoping
		 * session usually means touching several filters, and reloading on each one costs a
		 * full nine-entity round trip per click and repeatedly repaints every panel underneath
		 * the user. _markDirty() flags the pending change so the button can advertise it.
		 */
		onFilterSelectionFinish: function () {
			this._markDirty();
		},

		/**
		 * Removing a token directly from the closed input (clicking a chip's own "x") fires
		 * selectionChange with no selectionFinish, so both events have to stage the change.
		 */
		onFilterSelectionChange: function () {
			this._markDirty();
		},

		/** Fiscal year is staged like every other filter - see onFilterSelectionFinish. */
		onFyChange: function () {
			this._markDirty();
		},

		/**
		 * Flags that the staged filters no longer match what is on screen, which the Go
		 * button binds to. Reset by _loadData once the response has been rendered.
		 * @private
		 */
		_markDirty: function () {
			this._dash().setProperty("/filtersDirty", true);
		},

		onReset: function () {
			Object.keys(FILTER_INPUTS).forEach(function (sKey) {
				this.byId(FILTER_INPUTS[sKey]).setSelectedKeys([]);
			}, this);
			this._dash().setProperty("/fy", String(this._currentFy()));
			this._dash().setProperty("/mapGranularity", "state");
			this._dash().setProperty("/mapShowDots", true);
			// Reset is an explicit action, not a staged edit, so it applies immediately.
			this._loadData();
		},

		/** Auto/light/dark. Repainting is driven by appTheme's changed listener. */
		onThemeSelect: function (oEvent) {
			appTheme.setMode(oEvent.getParameter("key"));
		},

		/** State/zone choropleth toggle - purely a local re-render, no round trip. */
		onMapGranularityChange: function (oEvent) {
			this._dash().setProperty("/mapGranularity", oEvent.getParameter("key"));
			if (this._oRaw) {
				// Re-derive from the already-masked /geoRows, not the raw response - the hint's
				// "N of M states billed" count must agree with what the map itself is showing.
				this._dash().setProperty("/mapSubtitle",
					this._buildMapHint(this._dash().getProperty("/geoRows") || []));
			}
		},

		/** Unit-dot overlay toggle - purely a local re-render, no round trip. */
		onMapDotsToggle: function () {
			var oModel = this._dash();
			oModel.setProperty("/mapShowDots", !oModel.getProperty("/mapShowDots"));
		},

		/**
		 * Clicking a state on the map toggles it in the State filter, exactly as the
		 * prototype's own choropleth click does - so a second click on a selected state
		 * removes it rather than replacing the whole selection.
		 * @param {sap.ui.base.Event} oEvent statePress
		 */
		onMapStatePress: function (oEvent) {
			this._toggleFilter("state", oEvent.getParameter("regio"));
		},

		/** Clicking a zone (zone granularity) toggles it in the Zone filter. */
		onMapZonePress: function (oEvent) {
			this._toggleFilter("zone", oEvent.getParameter("zone"));
		},

		/** Clicking a scheme row toggles that scheme in the Scheme filter. */
		onSchemePress: function (oEvent) {
			this._toggleFilter("scheme", oEvent.getParameter("category"));
		},

		/** Clicking a Top-states row toggles that state in the State filter. */
		onTopStatePress: function (oEvent) {
			this._toggleFilter("state", oEvent.getParameter("regio"));
		},

		/**
		 * Adds or removes one value in a MultiComboBox filter and reloads.
		 * @param {string} sFilter key into FILTER_INPUTS
		 * @param {string} sValue the code to toggle
		 * @private
		 */
		_toggleFilter: function (sFilter, sValue) {
			if (!sValue) {
				return;
			}
			var oBox = this.byId(FILTER_INPUTS[sFilter]);
			var aKeys = oBox.getSelectedKeys().slice();
			var iAt = aKeys.indexOf(sValue);

			if (iAt >= 0) {
				aKeys.splice(iAt, 1);
			} else {
				aKeys.push(sValue);
			}

			oBox.setSelectedKeys(aKeys);
			// Staged, not applied - a map/scheme/top-state click is a filter edit like any
			// other, and mixing "some clicks reload, some don't" is worse than one rule.
			this._markDirty();
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
		 * The secondary/additionalText line for one catalog item: the raw code, plus an
		 * optional "extra" field (only the Material filter's own Bismt uses this - see
		 * CATALOG_SOURCES) so a value like an old material number is visible in the dropdown
		 * and, via materialFilter's own custom filterFunction (see onInit), typeable in the
		 * search box too.
		 * @param {string} sKey the item's key/code
		 * @param {string} sName the item's display name (blank if the source has none)
		 * @param {string} sExtra the extra field's value, if the source configures one
		 * @returns {string} the additionalText value
		 * @private
		 */
		_buildCatalogInfo: function (sKey, sName, sExtra) {
			var sInfo = sName ? sKey : "";
			if (sExtra) {
				sInfo += (sInfo ? " " + formatter.MIDDOT + " " : "") + this._text("filterOldNumber", [sExtra]);
			}
			return sInfo;
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
							info: that._buildCatalogInfo(sKey, sName, oSource.extra ? oRow[oSource.extra] : "")
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
		 * Reads all nine entity sets and rebuilds the whole dashboard. Only one load is
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
				// What is on screen now matches the filter controls again.
				that._dash().setProperty("/filtersDirty", false);
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

		/** Transforms the last response into the view model and redraws every panel. @private */
		_render: function () {
			var oData = this._oRaw;
			var oModel = this._dash();
			var oCtx = this._ctx();
			var iPriorFy = parseInt(this._oFilters.fy, 10) - 1;
			var aGeo = this._maskGeoByZoneFilter(oData.geo || []);

			oModel.setProperty("/kpis", this._buildKpiCards(oData));
			oModel.setProperty("/geoRows", aGeo);
			oModel.setProperty("/dotRows", oData.unitDots || []);
			oModel.setProperty("/schemeRows", (oData.scheme || []).filter(function (r) {
				return parseFloat(r.NetValue) > 0;
			}));
			oModel.setProperty("/scopeText", this._buildScopeText());
			oModel.setProperty("/mapSubtitle", this._buildMapHint(aGeo));
			oModel.setProperty("/schemeSubtitle", this._text("schemeVsFy", [String(iPriorFy)]));
			oModel.setProperty("/priorFyLabel", this._text("fyShort", [String(iPriorFy)]));
			oModel.setProperty("/lastRefreshedText",
				this._text("lastRefreshed", [new Date().toLocaleTimeString()]));

			this._syncSelections();

			this._setChart("plant", chartOptions.plant(oData.plant, oCtx), "noDataPlant", oData.plant.length);
			this._setChart("material", chartOptions.material(oData.material, oCtx), "noDataMaterial", oData.material.length);
		},

		/**
		 * Mirrors the three filters the map and the scheme list highlight into the view
		 * model. The controls read plain arrays rather than reaching into the comboboxes,
		 * so their selection state stays a pure function of the model.
		 * @private
		 */
		_syncSelections: function () {
			var oModel = this._dash();
			[
				["/selectedRegios", "state"],
				["/selectedZones", "zone"],
				["/selectedSchemes", "scheme"]
			].forEach(function (a) {
				oModel.setProperty(a[0], this.byId(FILTER_INPUTS[a[1]]).getSelectedKeys().slice());
			}, this);
		},

		/**
		 * Defends the map and Top-States list against an unreliable server-side zone filter.
		 *
		 * The Zone filter is sent to the backend as P_Zone, which ZCL_PMS_DASH_QUERY matches
		 * against ZSD_ZONE_PLANT-ALM_ZONE - a field its own comment calls "unconfirmed... CHAR10
		 * placeholder". If that match is looser than it should be (padding, casing, a stale
		 * code), states outside the selected zone can leak into the Geo response, which is
		 * exactly what showed up as a picked "South" filter still colouring a North state on
		 * the choropleth. This re-filters the response down to the selected zone using
		 * INDIA.zoneOfState(), which derives the zone from StateText instead - the same
		 * defensive move already applied to the map's own choropleth and legend.
		 * @param {object[]} aGeo the raw Geo entity response
		 * @returns {object[]} aGeo unchanged if no Zone filter is active, otherwise only the
		 *   rows whose real zone is one of the selected ones
		 * @private
		 */
		_maskGeoByZoneFilter: function (aGeo) {
			var aZones = (this._oFilters && this._oFilters.zone) || [];
			if (!aZones.length) {
				return aGeo;
			}
			return aGeo.filter(function (r) {
				return aZones.indexOf(INDIA.zoneOfState(r.StateText)) >= 0;
			});
		},

		/**
		 * The prototype's map hint: how much of India actually billed, plus what a click
		 * does at the current granularity.
		 * @param {object[]} aGeo Geo entity rows
		 * @returns {string} the hint line
		 * @private
		 */
		_buildMapHint: function (aGeo) {
			var iLive = aGeo.filter(function (r) {
				return (parseFloat(r.NetValue) || 0) > 0;
			}).length;
			var bZone = this._dash().getProperty("/mapGranularity") === "zone";

			return this._text(bZone ? "mapHintZone" : "mapHintState",
				[String(iLive), String(STATE_COUNT)]);
		},

		/**
		 * The four KPI tiles, in the prototype's own shape: an eyebrow label, the abbreviated
		 * value, a sparkline, a delta pill and a mono sub-line.
		 *
		 * The sub-line differs per card exactly as the prototype's renderKpis() has it - the
		 * un-abbreviated amount for net/gross, the average GST rate for tax, and the snapshot
		 * date plus invoice count for the daily card (OD-1c).
		 *
		 * Every card gets the same sparkline series (net value by FY period), because Trend
		 * is the only series the service exposes; the prototype gives its daily card a
		 * trailing-12-day series, which has no backend equivalent yet.
		 *
		 * @param {object} oData the service response
		 * @returns {object[]} one entry per KPI card
		 * @private
		 */
		_buildKpiCards: function (oData) {
			var that = this;
			var aSpark = (oData.trend || []).map(function (r) {
				return Math.round(parseFloat(r.NetValue) || 0);
			});
			var mById = dashboardService.byId(oData.kpi);

			return (oData.kpi || []).map(function (oKpi) {
				var fDelta = parseFloat(oKpi.DeltaPct);

				return {
					id: oKpi.Id,
					label: oKpi.KpiLabel,
					unit: "",
					valueText: formatter.money(oKpi.CurrValue),
					deltaText: formatter.signedPercent(oKpi.DeltaPct),
					// The prototype treats anything under 0.05% as no movement at all.
					deltaTone: !isFinite(fDelta) || Math.abs(fDelta) < 0.05 ? "flat" :
						fDelta > 0 ? "up" : "down",
					sub: that._kpiSub(oKpi, mById),
					accent: KPI_ACCENT[oKpi.Id] || "net",
					spark: aSpark
				};
			});
		},

		/**
		 * @param {object} oKpi the KPI row
		 * @param {object} mById every KPI row, keyed by Id
		 * @returns {string} the card's mono sub-line
		 * @private
		 */
		_kpiSub: function (oKpi, mById) {
			if (oKpi.Id === "DAILY_SALE") {
				return oKpi.SnapshotDate ?
					this._text("kpiDailyNote",
						[formatter.dateShort(oKpi.SnapshotDate), formatter.count(oKpi.DocCount)]) :
					this._text("kpiDailyNoteEmpty");
			}

			if (oKpi.Id === "TAX") {
				// Effective GST rate on the same selection - tax over net, both already filtered.
				var fNet = parseFloat(mById.NET && mById.NET.CurrValue);
				var fTax = parseFloat(oKpi.CurrValue);
				return isFinite(fNet) && fNet && isFinite(fTax) ?
					this._text("kpiAvgGst", [formatter.percent(fTax / fNet * 100, 1)]) : "";
			}

			return formatter.moneyFull(oKpi.CurrValue);
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
			["plant", "material"].forEach(function (sKey) {
				oCharts[sKey] = chartOptions.empty(that._text("noData"), that._oPalette);
			});

			var oModel = this._dash();
			oModel.setProperty("/charts", oCharts);
			oModel.setProperty("/kpis", []);
			oModel.setProperty("/geoRows", []);
			oModel.setProperty("/dotRows", []);
			oModel.setProperty("/schemeRows", []);
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
		 * Lets the Material filter be searched by old material number (Bismt) as well as by
		 * code/description - the "Old {0}" text _buildCatalogInfo() puts in the dropdown's
		 * secondary column is otherwise just decoration a MultiComboBox's own default filter
		 * has no defined obligation to search. A custom filterFunction is the only reliable
		 * way to guarantee that, since it can check whatever fields it wants; MultiComboBox
		 * only exposes it as a method (setFilterFunction), not an XML-bindable property, so
		 * this must run once from JS rather than being declared in the view.
		 * @private
		 */
		_wireMaterialSearch: function () {
			this.byId("materialFilter").setFilterFunction(function (sTerm, oItem) {
				var sNeedle = (sTerm || "").toLowerCase();
				if (!sNeedle) {
					return true;
				}
				return [oItem.getText(), oItem.getKey(), oItem.getAdditionalText()].some(function (sField) {
					return String(sField || "").toLowerCase().indexOf(sNeedle) >= 0;
				});
			});
		},

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

		/**
		 * Every string the IndiaMap control paints into its legend and hover card. Resolved
		 * once, since none of them depend on the data.
		 * @returns {object} the control's `texts` payload
		 * @private
		 */
		_mapTexts: function () {
			var that = this;
			var o = {};
			["scaleCap", "lowest", "low", "high", "noBilling", "dotKey", "netBilled", "growth",
				"share", "plantsBilling", "invoices", "zoneStates", "unitPlants"
			].forEach(function (sKey) {
				o[sKey] = that._text("map" + sKey.charAt(0).toUpperCase() + sKey.slice(1));
			});
			o.newLabel = this._text("deltaNew");
			return o;
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
