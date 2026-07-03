sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/dom/includeScript",
    "sap/base/Log"
], function (Controller, JSONModel, Filter, FilterOperator, includeScript, Log) {
    "use strict";

    // ----------------------------------------------------------------------
    // CONFIG — adjust here to match the actual services / CDS field names.
    // ----------------------------------------------------------------------
    var CFG = {
        // Actuals (invoice) service — default model ""
        actualEntity: "zsdd_center_dash_cds",
        dim: {
            zone: "AlmZone",
            unit: "Unit",
            scheme: "Category",
            schemeDesc: "CatDesc",
            monthNum: "MonthNum",
            monthName: "Zmonth",
            budat: "Budat",
            year: "Gjahr",
            curr: "waerk"   // currency — must be in every groupby (currency-dependent measures)
        },
        msr: { gross: "Gross", net: "Netwr", tax: "Mwsbk" },
        // aggregate aliases must differ from the source property names,
        // else the backend rejects with "Property name '...' is already used".
        msrAlias: { gross: "GrossSum", net: "NetSum", tax: "TaxSum" },

        // Targets service — model "target". CDS: zsdd_dash_targ (ZSDD_DASH_TARG).
        targetModel: "target",
        targetEntity: "zsdd_dash_targ",
        targetDim: { zone: "AlmZone", unit: "Werks", scheme: "Category", year: "Gjahr" },
        targetMsr: "Target",
        // ZSDD_DASH_TARG stores Target in CRORE; gross is in rupees. Scale target
        // up to rupees so KPIs/achievement/chart compare on the same base.
        targetScale: 10000000
    };

    var ZONE_ORDER = ["CENTER", "EAST", "WEST", "NORTH", "SOUTH"];
    var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    // ECharts default-style palette used by the rose pie, matching the final-version design.
    var ROSE = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4"];
    var ECHARTS_URL = sap.ui.require.toUrl("com/sap/zsdzonedash/libs/echarts.min.js");

    /**
     * Case-insensitive row wrapper. SAP normalizes $apply property/alias names
     * (e.g. returns GROSSSUM / ALMZONE), so reads by the CDS casing would miss.
     * The Proxy resolves r["AlmZone"] -> the actual key regardless of case.
     */
    function ci(row) {
        if (!row || typeof row !== "object") { return row; }
        return new Proxy(row, {
            get: function (t, p) {
                if (typeof p !== "string" || p in t) { return t[p]; }
                var lk = p.toLowerCase();
                var k = Object.keys(t).find(function (x) { return x.toLowerCase() === lk; });
                return k ? t[k] : undefined;
            }
        });
    }

    return Controller.extend("com.sap.zsdzonedash.controller.zsd_zone_dash", {

        onInit: function () {
            this._charts = {};
            // Default the daily chart to the current month; on the 1st a single extra
            // "yesterday" bar (previous month's last day) is prepended by _renderDaily.
            var sDefMonth = String(new Date().getMonth() + 1).padStart(2, "0");
            var aMonths = MONTH_NAMES.map(function (name, i) {
                return { key: String(i + 1).padStart(2, "0"), text: name };
            });
            var oUi = new JSONModel({
                years: [],
                zones: [{ key: "ALL", text: "All Zones" }],
                schemes: [{ key: "ALL", text: "All Schemes" }],
                months: aMonths,
                filters: { year: "", zone: "ALL", scheme: "ALL" },
                dailyMonth: sDefMonth,
                kpi: {
                    grossText: "…", grossDelta: "",
                    targetText: "…", gapText: "",
                    achText: "…", achPct: 0
                },
                daily: { title: "Daily Gross", yLabel: "Yesterday", yText: "…",
                    mtdLabel: "MTD Gross", mtdText: "…" }
            });
            var oView = this.getView();
            if (oView) {
                oView.setModel(oUi, "ui");
                oView.setBusyIndicatorDelay(0);
            }
        },

        onAfterRendering: function () {
            if (this._bootstrapped) { return; }
            this._bootstrapped = true;
            var that = this;
            this.getView().setBusy(true);
            this._loadECharts()
                .then(function () { return that._loadFilters(); })
                .then(function () { return that._loadDashboard(); })
                .catch(function (e) {
                    Log.error("Dashboard init failed", e);
                    that.getView().setBusy(false);
                });
        },

        onExit: function () {
            this._destroyCharts();
        },

        // ---- filter handlers -------------------------------------------------
        onFilterChange: function () {
            this._loadDashboard();
        },

        onRefresh: function () {
            this._loadDashboard();
        },

        // month picker on the daily chart — reload just that chart
        onDailyMonthChange: function () {
            this._loadDaily();
        },

        // the daily chart's HTML container was (re)rendered by UI5 — (re)draw into it,
        // so a panel re-render (from the bound title/KPIs) can't leave it blank.
        onDailyHtmlRendered: function () {
            this._drawDaily();
        },

        // ---- bootstrap helpers ----------------------------------------------
        _loadECharts: function () {
            if (window.echarts) { return Promise.resolve(); }
            return includeScript({ url: ECHARTS_URL, id: "echarts-lib" });
        },

        /** distinct year / zone / scheme values to fill the filter dropdowns.
         *  Each query carries an aggregate + currency in groupby — the analytical
         *  service returns nothing for a bare groupby(()). Values are de-duped in JS. */
        _loadFilters: function () {
            var that = this, oUi = this.getView().getModel("ui");
            var d = CFG.dim, m = CFG.msr, a = CFG.msrAlias;
            var agg = ",aggregate(" + m.gross + " with sum as " + a.gross + "))";
            var pYears = this._aggregate("", CFG.actualEntity, "groupby((" + d.year + "," + d.curr + ")" + agg);
            var pZones = this._aggregate("", CFG.actualEntity, "groupby((" + d.zone + "," + d.curr + ")" + agg);
            var pSchemes = this._aggregate("", CFG.actualEntity,
                "groupby((" + d.scheme + "," + d.schemeDesc + "," + d.curr + ")" + agg);

            return Promise.all([pYears, pZones, pSchemes]).then(function (res) {
                var aYears = that._distinct(res[0], d.year).sort().reverse()
                    .map(function (y) { return { key: y, text: y }; });
                var aZones = [{ key: "ALL", text: "All Zones" }].concat(
                    that._orderZones(res[1].map(function (r) { return r[d.zone]; }))
                        .map(function (z) { return { key: z, text: z }; }));
                var seen = {}, aSchemes = [{ key: "ALL", text: "All Schemes" }];
                res[2].forEach(function (r) {
                    var k = r[d.scheme];
                    if (k != null && !seen[k]) { seen[k] = true; aSchemes.push({ key: k, text: r[d.schemeDesc] || k }); }
                });

                Log.info("Filters — years=" + aYears.length + " zones=" + (aZones.length - 1) + " schemes=" + (aSchemes.length - 1));
                oUi.setProperty("/years", aYears);
                oUi.setProperty("/zones", aZones);
                oUi.setProperty("/schemes", aSchemes);
                if (aYears.length && !oUi.getProperty("/filters/year")) {
                    oUi.setProperty("/filters/year", aYears[0].key);
                }
            });
        },

        _distinct: function (aRows, sKey) {
            var seen = {}, out = [];
            aRows.forEach(function (r) {
                var v = r[sKey];
                if (v != null && !seen[v]) { seen[v] = true; out.push(v); }
            });
            return out;
        },

        // ---- main load -------------------------------------------------------
        _loadDashboard: function () {
            var that = this;
            var f = this.getView().getModel("ui").getProperty("/filters");
            var sFilter = this._buildFilter(f);
            var pre = sFilter ? "filter(" + sFilter + ")/" : "";
            var d = CFG.dim, m = CFG.msr, a = CFG.msrAlias;

            var qZone = pre + "groupby((" + d.zone + "," + d.curr + "),aggregate(" +
                m.gross + " with sum as " + a.gross + "," +
                m.net + " with sum as " + a.net + "," +
                m.tax + " with sum as " + a.tax + "))";
            var qRank = pre + "groupby((" + d.unit + "," + d.curr + "),aggregate(" + m.gross + " with sum as " + a.gross + "))";
            var qScheme = pre + "groupby((" + d.scheme + "," + d.schemeDesc + "," + d.curr +
                "),aggregate(" + m.gross + " with sum as " + a.gross + "))";

            // the daily chart has its own month picker, so it loads independently
            this._loadDaily();

            var oView = this.getView();
            oView.setBusy(true);
            Promise.all([
                this._aggregate("", CFG.actualEntity, qZone),
                this._aggregate("", CFG.actualEntity, qRank),
                this._aggregate("", CFG.actualEntity, qScheme),
                this._loadTargets(f)
            ]).then(function (res) {
                that._render({
                    zone: res[0], rank: res[1], scheme: res[2], target: res[3]
                });
            }).catch(function (e) {
                Log.error("Dashboard data load failed", e);
            }).then(function () {
                oView.setBusy(false);
            });
        },

        /**
         * Daily gross for the month chosen in the daily chart's picker (defaults to
         * yesterday's month, so on the 1st it shows the previous month). Filtered by
         * the active year/zone/scheme too, grouped by Budat.
         */
        _loadDaily: function () {
            var that = this;
            var oUi = this.getView().getModel("ui");
            var f = oUi.getProperty("/filters");
            var sMonth = oUi.getProperty("/dailyMonth");
            var d = CFG.dim, m = CFG.msr, a = CFG.msrAlias;
            var sFilter = this._buildFilter(f);

            var aParts = [d.monthNum + " eq '" + sMonth + "'"];
            if (sFilter) { aParts.push(sFilter); }
            var qDaily = "filter(" + aParts.join(" and ") + ")/groupby((" + d.budat + "," + d.curr +
                "),aggregate(" + m.gross + " with sum as " + a.gross + "))";

            // On the 1st of the month, while viewing the current month, fetch the whole
            // previous month (same proven query shape) so yesterday's last day can be
            // prepended as a single bar.
            var now = new Date();
            var sCurMonth = String(now.getMonth() + 1).padStart(2, "0");
            var bViewingCurrent = (sMonth === sCurMonth && String(f.year) === String(now.getFullYear()));
            var yDate = null, pPrev = Promise.resolve(null);
            if (now.getDate() === 1 && bViewingCurrent) {
                yDate = new Date(now);
                yDate.setDate(0); // last day of previous month
                var sPrevMonth = String(yDate.getMonth() + 1).padStart(2, "0");
                var sPrevYear = String(yDate.getFullYear());
                var aPrev = [d.monthNum + " eq '" + sPrevMonth + "'", d.year + " eq '" + sPrevYear + "'"];
                if (f.zone !== "ALL") { aPrev.push(d.zone + " eq '" + f.zone + "'"); }
                if (f.scheme !== "ALL") { aPrev.push(d.scheme + " eq '" + f.scheme + "'"); }
                var qPrev = "filter(" + aPrev.join(" and ") + ")/groupby((" + d.budat + "," + d.curr +
                    "),aggregate(" + m.gross + " with sum as " + a.gross + "))";
                pPrev = this._aggregate("", CFG.actualEntity, qPrev).catch(function () { return null; });
            }

            return Promise.all([this._aggregate("", CFG.actualEntity, qDaily), pPrev]).then(function (res) {
                var prevVal = null;
                if (res[1] && yDate) {
                    var yDay = yDate.getDate();
                    prevVal = res[1].reduce(function (s, r) {
                        var b = r[d.budat];
                        var day = b ? parseInt(String(b).slice(8, 10), 10) : 0;
                        return day === yDay ? s + (parseFloat(r[a.gross]) || 0) : s;
                    }, 0);
                }
                Log.info("Daily rows — month=" + sMonth + " count=" + res[0].length +
                    (yDate ? " prependYesterday=" + prevVal : ""));
                that._renderDaily(res[0], sMonth, f.year, yDate, prevVal);
            }).catch(function (e) {
                Log.error("Daily gross load failed", e);
            });
        },

        /**
         * Targets summed by zone. Uses a plain GET (like the actuals) rather than the
         * V4 model's bindList: the model batches reads into a $batch POST, which the
         * gateway rejects with 403 when no CSRF token is present. A direct GET needs no
         * token. Resolves to null if the service isn't reachable, so the dashboard
         * degrades to actuals-only instead of breaking.
         */
        _loadTargets: function (f) {
            var td = CFG.targetDim;
            var sBase = this._serviceUrl(CFG.targetModel);
            if (!sBase) { return Promise.resolve(null); }

            var aF = [];
            if (f.year) { aF.push(td.year + " eq '" + f.year + "'"); }
            if (f.zone !== "ALL") { aF.push(td.zone + " eq '" + f.zone + "'"); }
            if (f.scheme !== "ALL") { aF.push(td.scheme + " eq '" + f.scheme + "'"); }
            // Request both zone and scheme columns so we can build targets by zone and by scheme
            var sUrl = sBase + CFG.targetEntity + "?$select=" + td.zone + "," + td.scheme + "," + CFG.targetMsr +
                "&$top=5000" + (aF.length ? "&$filter=" + encodeURIComponent(aF.join(" and ")) : "");

            // Follow @odata.nextLink so we sum EVERY page, not just the first (server-driven
            // paging otherwise truncates the total — e.g. FY total came out 935 vs 1195).
            var aRows = [];
            function fetchPage(url) {
                return fetch(url, {
                    headers: { "Accept": "application/json" },
                    credentials: "same-origin"
                }).then(function (oResp) {
                    if (!oResp.ok) { throw new Error("HTTP " + oResp.status + " for targets"); }
                    return oResp.json();
                }).then(function (oJson) {
                    (oJson.value || []).forEach(function (r) { aRows.push(r); });
                    var sNext = oJson["@odata.nextLink"];
                    if (sNext) {
                        var sNextUrl = /^https?:\/\//i.test(sNext) ? sNext           // absolute
                            : (sNext.charAt(0) === "/" ? sNext : sBase + sNext);      // server- or service-relative
                        return fetchPage(sNextUrl);
                    }
                });
            }

            return fetchPage(sUrl).then(function () {
                var mapZone = {}, mapScheme = {};
                aRows.map(ci).forEach(function (r) {
                    var z = r[td.zone];
                    var s = r[td.scheme];
                    var v = (parseFloat(r[CFG.targetMsr]) || 0) * CFG.targetScale;
                    if (z) { mapZone[z] = (mapZone[z] || 0) + v; }
                    if (s) { mapScheme[s] = (mapScheme[s] || 0) + v; }
                });
                Log.info("Targets — rows=" + aRows.length + " zones=" + Object.keys(mapZone).length + " schemes=" + Object.keys(mapScheme).length);
                return { zone: mapZone, scheme: mapScheme };
            }).catch(function (e) {
                Log.warning("Target service unavailable — rendering actuals only", e);
                return null; // signals "no targets"
            });
        },

        // ---- rendering -------------------------------------------------------
        _render: function (data) {
            Log.info("Dashboard rows — zone=" + data.zone.length + " rank=" + data.rank.length +
                " scheme=" + data.scheme.length +
                " target=" + (data.target ? Object.keys(data.target).length : "none"));
            var grossByZone = {}, totalGross = 0;
            data.zone.forEach(function (r) {
                var z = r[CFG.dim.zone];
                var g = parseFloat(r[CFG.msrAlias.gross]) || 0;
                grossByZone[z] = (grossByZone[z] || 0) + g;
                totalGross += g;
            });

            var hasTarget = !!data.target;
            // support new { zone: {...}, scheme: {...} } shape from _loadTargets
            var targetByZone = (data.target && data.target.zone) ? data.target.zone : (data.target || {});
            var targetByScheme = (data.target && data.target.scheme) ? data.target.scheme : null;

            // Zone axis = zones with sales UNION zones that only have a target (e.g.
            // CENTRAL for ADIP SSA has a 41 Cr target but no actuals). Including them lets
            // the chart's target bars add up to the header total. _orderZones de-dupes.
            var zones = this._orderZones(
                data.zone.map(function (r) { return r[CFG.dim.zone]; })
                    .concat(Object.keys(targetByZone))
            );
            var gross = zones.map(function (z) { return grossByZone[z] || 0; });
            var target = zones.map(function (z) { return targetByZone[z] || 0; });
            // Header total sums target by scheme, so it covers EVERY zone that has a
            // target — including zones with no actual sales (e.g. CENTRAL for ADIP SSA,
            // whose 41 Cr was dropped when we summed only zones present in the actuals).
            // Summing by scheme also ignores any subtotal/grand-total rows, which carry
            // a blank scheme. Falls back to the per-zone sum for the legacy target shape.
            var totalTarget = targetByScheme
                ? Object.keys(targetByScheme).reduce(function (a, k) { return a + targetByScheme[k]; }, 0)
                : target.reduce(function (a, b) { return a + b; }, 0);
            // per-zone achievement % for the dual-axis line
            var achPct = zones.map(function (z, i) {
                return target[i] ? Math.round((gross[i] / target[i]) * 1000) / 10 : 0;
            });

            // "From N Zones" reflects the ZONE FILTER's scope, not whether sales happened:
            // a specific zone → 1 (even with zero sales); All Zones → every zone in the
            // dropdown (loaded once from all actuals, so the full org set).
            var oUiModel = this.getView().getModel("ui");
            var sZoneFilter = oUiModel.getProperty("/filters/zone");
            var aZoneList = oUiModel.getProperty("/zones") || [];
            var zoneCount = (sZoneFilter && sZoneFilter !== "ALL")
                ? 1
                : Math.max(0, aZoneList.length - 1); // drop the "All Zones" entry

            this._renderKpis({
                totalGross: totalGross, totalTarget: totalTarget, hasTarget: hasTarget,
                zoneCount: zoneCount
            });
            this._renderActualVsTarget(zones, gross, target, achPct, hasTarget);
            this._renderScheme(data.scheme, targetByScheme);
            this._renderRanking(data.rank);
        },

        _renderKpis: function (k) {
            Log.info("KPI totals — gross=" + k.totalGross + " target=" + k.totalTarget + " hasTarget=" + k.hasTarget);
            var oUi = this.getView().getModel("ui");
            var kpi = {
                grossText: this._inr(k.totalGross),
                grossDelta: "From " + k.zoneCount + (k.zoneCount === 1 ? " Zone" : " Zones")
            };
            if (k.hasTarget) {
                var ach = k.totalTarget ? (k.totalGross / k.totalTarget) * 100 : 0;
                kpi.targetText = this._inr(k.totalTarget);
                kpi.gapText = "Gap: " + this._inr(k.totalTarget - k.totalGross);
                kpi.achText = ach.toFixed(1) + "%";
                kpi.achPct = Math.max(0, Math.min(100, ach));
            } else {
                kpi.targetText = "—";
                kpi.gapText = "targets CDS not connected";
                kpi.achText = "—";
                kpi.achPct = 0;
            }
            oUi.setProperty("/kpi", kpi);
        },

        // Actual vs Target by Zone — grey Target bars, blue Achieved bars, and a
        // dashed-red Achievement-% line on a secondary axis (values in ₹ Crore).
        _renderActualVsTarget: function (zones, gross, target, achPct, hasTarget) {
            var that = this;
            var grossCr = gross.map(function (v) { return that._cr(v); });
            var targetCr = target.map(function (v) { return that._cr(v); });
            var series = [];
            var legend = [];
            if (hasTarget) {
                series.push({ name: "Target", type: "bar", barWidth: 20, data: targetCr,
                    itemStyle: { color: "#e0e0e0", borderRadius: [4, 4, 0, 0] } });
                legend.push("Target");
            }
            series.push({ name: "Achieved", type: "bar", barWidth: 20, data: grossCr,
                itemStyle: { color: "#5470c6", borderRadius: [4, 4, 0, 0] } });
            legend.push("Achieved");
            if (hasTarget) {
                series.push({ name: "Achievement %", type: "line", yAxisIndex: 1, data: achPct,
                    lineStyle: { type: "dashed", color: "#ee6666" }, itemStyle: { color: "#ee6666" } });
                legend.push("Achievement %");
            }
            var maxAch = Math.max.apply(null, [100].concat(achPct));
            this._chart("chart-avt", {
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
                    formatter: function (items) { return that._avtTooltip(items); } },
                legend: { data: legend, top: 0 },
                grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
                xAxis: { type: "category", data: zones },
                yAxis: [
                    { type: "value", name: "Cr" },
                    { type: "value", name: "%", max: Math.ceil(maxAch / 10) * 10,
                        axisLabel: { formatter: "{value}%" }, splitLine: { show: false } }
                ],
                series: series
            });
        },

        // Scheme Mix Distribution — Nightingale rose pie of scheme totals (₹ Crore).
        _renderScheme: function (rows, targetMap) {
            var that = this;
            var bySch = {};
            var nameToCode = {};
            rows.forEach(function (r) {
                var code = r[CFG.dim.scheme];
                var name = r[CFG.dim.schemeDesc] || code || "—";
                nameToCode[name] = code;
                bySch[name] = (bySch[name] || 0) + (parseFloat(r[CFG.msrAlias.gross]) || 0);
            });
            var data = Object.keys(bySch).map(function (name, i) {
                var code = nameToCode[name];
                var targetRupees = (targetMap && code) ? (targetMap[code] || 0) : 0;
                return {
                    name: name,
                    value: that._cr(bySch[name]),
                    rawRupees: bySch[name],
                    targetRupees: targetRupees,
                    itemStyle: { color: ROSE[i % ROSE.length] }
                };
            }).sort(function (a, b) { return b.value - a.value; });

            this._chart("chart-scheme", {
                tooltip: {
                    trigger: "item",
                    formatter: function (params) {
                        // params: { name, value (Cr), percent, data: { targetRupees, rawRupees } }
                        var name = params.name || (params.data && params.data.name) || "";
                        var valCr = (typeof params.value === 'number') ? params.value : (params.data && params.data.value) || 0;
                        var pct = params.percent || 0;
                        var targetR = params.data && params.data.targetRupees ? params.data.targetRupees : 0;
                        var targetCr = targetR ? that._cr(targetR) : 0;
                        var rawR = params.data && params.data.rawRupees ? params.data.rawRupees : 0;
                        // Compute achievement from raw rupees (not the rounded Cr values)
                        // so it matches the KPI gauge exactly.
                        var ach = (targetR ? Math.round((rawR / targetR) * 1000) / 10 : null);
                        // Two distinct percentages, each on its own labelled row so they
                        // don't get confused: "Achievement" = Actual ÷ Target for this
                        // scheme; "Share of mix" = this scheme's slice of total actual.
                        var row = function (label, value, hint) {
                            return "<div style='display:flex;justify-content:space-between;gap:16px'>" +
                                "<span style='color:#6a6d70'>" + label + "</span>" +
                                "<span style='font-weight:600'>" + value +
                                (hint ? " <span style='color:#9a9d9f;font-weight:400'>" + hint + "</span>" : "") +
                                "</span></div>";
                        };
                        var s = "<div style='font-weight:600;margin-bottom:4px'>" + name + "</div>";
                        s += row("Actual", "₹" + valCr.toFixed(2) + " Cr", null);
                        if (targetR) {
                            s += row("Target", "₹" + targetCr.toFixed(2) + " Cr", null);
                            s += row("Achievement", ach + "%", "of target");
                        }
                        s += row("Share of mix", pct + "%", "of total actual");
                        return s;
                    }
                },
                legend: { orient: "vertical", left: "left", top: "middle", type: "scroll" },
                series: [{
                    name: "Scheme Mix", type: "pie", radius: ["20%", "75%"], center: ["62%", "50%"],
                    roseType: "area", itemStyle: { borderRadius: 5 }, data: data
                }]
            });
        },

        // Unit-wise Gross Ranking — horizontal bars, top 5 blue, the rest grey (₹ Crore).
        _renderRanking: function (rows) {
            var that = this;
            var byUnit = {};
            rows.forEach(function (r) {
                var u = r[CFG.dim.unit] || "—";
                byUnit[u] = (byUnit[u] || 0) + (parseFloat(r[CFG.msrAlias.gross]) || 0);
            });
            var sorted = Object.keys(byUnit).map(function (u) {
                return { x: u, y: byUnit[u] };
            }).sort(function (a, b) { return b.y - a.y; }).slice(0, 10);
            // reverse so the largest ends up at the top of the horizontal axis
            var data = sorted.map(function (d, i) {
                return { value: that._cr(d.y), itemStyle: { color: i < 5 ? "#5470c6" : "#ccc" } };
            }).reverse();
            var cats = sorted.map(function (d) { return d.x; }).reverse();
            this._chart("chart-rank", {
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
                    formatter: function (items) { return that._crTooltip(items); } },
                grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
                xAxis: { type: "value", name: "Cr" },
                yAxis: { type: "category", data: cats },
                series: [{ name: "Gross", type: "bar", data: data,
                    itemStyle: { borderRadius: [0, 4, 4, 0] } }]
            });
        },

        /**
         * Daily gross for a chosen month (sMonth = "01".."12", sYear = fiscal year).
         * Always renders the full month (day 1..last). For the current month, yesterday
         * is highlighted and today-onward is greyed; on the 1st a single prepended bar
         * (yDate / prevVal = previous month's last day) carries yesterday's value.
         * Past months highlight their last day with data.
         */
        _renderDaily: function (rows, sMonth, sYear, yDate, prevVal) {
            var that = this;
            var byDay = {};
            rows.forEach(function (r) {
                var b = r[CFG.dim.budat];
                if (!b) { return; }
                var day = parseInt(String(b).slice(8, 10), 10);
                if (day) { byDay[day] = (byDay[day] || 0) + (parseFloat(r[CFG.msrAlias.gross]) || 0); }
            });

            var now = new Date();
            var monthIdx = parseInt(sMonth, 10) - 1;
            var yearNum = parseInt(sYear, 10) || now.getFullYear();
            var daysInMonth = new Date(yearNum, monthIdx + 1, 0).getDate();
            var isCurrentMonth = (monthIdx === now.getMonth() && yearNum === now.getFullYear());
            var bPrepend = !!yDate;   // set only on the 1st of the current month

            // reference (highlighted) day inside the month; null when the prepended bar is it
            var refDay = null, showsYesterday = false;
            if (isCurrentMonth) {
                if (now.getDate() > 1) { refDay = now.getDate() - 1; showsYesterday = true; }
            } else {
                var maxDay = 0;
                Object.keys(byDay).forEach(function (k) { maxDay = Math.max(maxDay, parseInt(k, 10)); });
                refDay = maxDay || daysInMonth;
            }

            var cats = [], data = [], mtd = 0, refVal = 0;

            // prepended "yesterday" bar (previous month's last day) — 1st only
            if (bPrepend) {
                refVal = prevVal || 0;
                cats.push(yDate.getDate() + " " + MONTH_NAMES[yDate.getMonth()].slice(0, 3));
                data.push({ value: that._cr(refVal), itemStyle: { color: "#ee6666", borderRadius: [4, 4, 0, 0] } });
            }

            for (var dd = 1; dd <= daysInMonth; dd++) {
                cats.push(String(dd));
                var raw = byDay[dd] || 0;
                var color = "#9ecae1";                                       // past (blue)
                if (!bPrepend && dd === refDay) { color = "#ee6666"; refVal = raw; }   // reference day
                else if (isCurrentMonth && dd >= now.getDate()) { color = "#f0f0f0"; } // today onward
                if (isCurrentMonth ? (dd < now.getDate()) : (dd <= refDay)) { mtd += raw; }
                data.push({ value: that._cr(raw), itemStyle: { color: color, borderRadius: [4, 4, 0, 0] } });
            }

            // labels / title
            var refWord = isCurrentMonth ? "Yesterday" : "Last Day";
            var refDayLabel = bPrepend ? (yDate.getDate() + " " + MONTH_NAMES[yDate.getMonth()].slice(0, 3))
                : ("Day " + refDay);
            var completed = isCurrentMonth ? (now.getDate() - 1) : refDay;
            var oUi = this.getView().getModel("ui");
            oUi.setProperty("/daily/title", isCurrentMonth ? "Current Month Daily Gross"
                : MONTH_NAMES[monthIdx] + " " + yearNum + " Daily Gross");
            oUi.setProperty("/daily/yLabel", refWord + " (" + refDayLabel + ")");
            oUi.setProperty("/daily/yText", this._inr(refVal));
            oUi.setProperty("/daily/mtdLabel", (isCurrentMonth ? "MTD Gross" : "Total") +
                (completed >= 1 ? " (Day 1-" + completed + ")" : ""));
            oUi.setProperty("/daily/mtdText", this._inr(mtd));

            // Store the render config (not draw directly): _drawDaily paints it, and is
            // also called from the HTML control's afterRendering, so a panel re-render
            // can never leave the chart blank.
            var bAllZero = data.every(function (p) { return !p.value; });
            this._dailyChart = bAllZero ? {
                empty: true,
                emptyMsg: "No data for " + (isCurrentMonth ? "the current month yet"
                    : MONTH_NAMES[monthIdx] + " " + yearNum)
            } : {
                option: {
                    tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
                        formatter: function (params) {
                            var p = params[0];
                            var isRef = bPrepend ? (p.dataIndex === 0) : (String(p.axisValue) === String(refDay));
                            var label = isRef ? "<b>" + refWord + " (" + p.axisValue + ")</b>" : "Day " + p.axisValue;
                            return label + "<br/>Gross: <b>₹" + p.data.value + " Cr</b>";
                        } },
                    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
                    xAxis: { type: "category", data: cats, name: "Day" },
                    yAxis: { type: "value", name: "Cr" },
                    series: [{ name: "Daily Gross", type: "bar", data: data, barWidth: "60%" }]
                }
            };
            this._drawDaily();
        },

        /** paint the daily chart from the stored config into its current container */
        _drawDaily: function () {
            var cfg = this._dailyChart;
            var el = document.getElementById("chart-trend");
            if (!cfg || !el) { return; }
            if (cfg.empty) {
                if (this._charts["chart-trend"]) { this._charts["chart-trend"].dispose(); delete this._charts["chart-trend"]; }
                el.innerHTML = "<div style='padding:24px;color:#5b6b7b;font-size:13px'>" + cfg.emptyMsg + "</div>";
                return;
            }
            this._chart("chart-trend", cfg.option);
        },

        // ---- low-level helpers ----------------------------------------------
        /**
         * Runs an OData V4 $apply aggregation via a direct GET through the model's
         * (proxied, authenticated) service URL, resolving to a plain array of rows.
         * Done outside the V4 ODataModel on purpose: with autoExpandSelect the model
         * appends a $select to a hand-written $apply and the backend then defines the
         * aggregate column twice ("Property 'GROSSSUM' already exists").
         */
        _aggregate: function (sModel, sEntity, sApply) {
            var sUrl = this._serviceUrl(sModel) + sEntity + "?$apply=" + encodeURIComponent(sApply);
            return fetch(sUrl, {
                headers: { "Accept": "application/json" },
                credentials: "same-origin"
            }).then(function (oResp) {
                if (!oResp.ok) { throw new Error("HTTP " + oResp.status + " for " + sEntity); }
                return oResp.json();
            }).then(function (oJson) {
                return (oJson.value || []).map(ci);
            });
        },

        /** service root URL from the manifest dataSource (version-safe; V4 model
         *  has no public getServiceUrl() on older UI5 runtimes). */
        _serviceUrl: function (sModel) {
            var sDs = sModel === CFG.targetModel ? "targetService" : "mainService";
            return this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/" + sDs + "/uri");
        },

        _buildFilter: function (f) {
            var d = CFG.dim, a = [];
            if (f.year) { a.push(d.year + " eq '" + f.year + "'"); }
            if (f.zone !== "ALL") { a.push(d.zone + " eq '" + f.zone + "'"); }
            if (f.scheme !== "ALL") { a.push(d.scheme + " eq '" + f.scheme + "'"); }
            return a.join(" and ");
        },

        _orderZones: function (aZones) {
            var uniq = aZones.filter(function (z, i) { return z && aZones.indexOf(z) === i; });
            return uniq.sort(function (x, y) {
                var ix = ZONE_ORDER.indexOf(x), iy = ZONE_ORDER.indexOf(y);
                if (ix === -1 && iy === -1) { return x.localeCompare(y); }
                if (ix === -1) { return 1; }
                if (iy === -1) { return -1; }
                return ix - iy;
            });
        },

        /** create-or-update an ECharts instance on a DOM id. ECharts sizes to the
         *  container, so the chart <div> must carry a CSS height (see style.css). */
        _chart: function (sId, oOption, mEvents) {
            var el = document.getElementById(sId);
            if (!el || !window.echarts) { return; }
            var bEmpty = !oOption.series || !oOption.series.length ||
                oOption.series.every(function (s) {
                    return Array.isArray(s.data) && !s.data.length;
                });
            if (bEmpty) {
                Log.warning("No data for chart: " + sId);
                if (this._charts[sId]) { this._charts[sId].dispose(); delete this._charts[sId]; }
                el.innerHTML = "<div style='padding:24px;color:#5b6b7b;font-size:13px'>No data</div>";
                return;
            }
            try {
                var oChart = this._charts[sId];
                // UI5 may re-create the HTML control's DOM — drop a stale instance.
                if (oChart && oChart.getDom() !== el) { oChart.dispose(); oChart = null; }
                if (!oChart) {
                    el.innerHTML = "";
                    oChart = window.echarts.init(el, null, { renderer: "canvas" });
                    this._charts[sId] = oChart;
                }
                oChart.setOption(oOption, true);
                if (mEvents) {
                    Object.keys(mEvents).forEach(function (sEv) {
                        oChart.off(sEv);
                        oChart.on(sEv, mEvents[sEv]);
                    });
                }
                this._ensureResize();
                // The chart may be initialised before its grid cell is finally sized, or
                // its container re-attached by a parent (Panel) re-render — resize once
                // the layout settles so the canvas isn't left at zero size (blank).
                var oCh = oChart;
                var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 60); };
                raf(function () { raf(function () { try { oCh.resize(); } catch (e) { /* disposed */ } }); });
            } catch (e) {
                Log.error("Chart create failed: " + sId, e);
            }
        },

        /** register a single window-resize listener that resizes all live charts */
        _ensureResize: function () {
            if (this._resizeBound) { return; }
            var that = this;
            this._resizeBound = function () {
                Object.keys(that._charts || {}).forEach(function (id) {
                    if (that._charts[id]) { that._charts[id].resize(); }
                });
            };
            window.addEventListener("resize", this._resizeBound);
        },

        /** axis tooltip for charts whose values are already in ₹ Crore */
        _crTooltip: function (items) {
            if (!items || !items.length) { return ""; }
            var s = "<strong>" + (items[0].axisValueLabel || items[0].name) + "</strong>";
            items.forEach(function (it) {
                s += "<br/>" + it.marker + it.seriesName + ": ₹" + it.value + " Cr";
            });
            return s;
        },

        /** actual-vs-target tooltip — Cr for the bars, % for the achievement line */
        _avtTooltip: function (items) {
            if (!items || !items.length) { return ""; }
            var s = "<strong>" + (items[0].axisValueLabel || items[0].name) + "</strong>";
            items.forEach(function (it) {
                var v = it.seriesName === "Achievement %" ? it.value + "%" : "₹" + it.value + " Cr";
                s += "<br/>" + it.marker + it.seriesName + ": " + v;
            });
            return s;
        },

        _destroyCharts: function () {
            var that = this;
            Object.keys(this._charts || {}).forEach(function (id) {
                if (that._charts[id]) { that._charts[id].dispose(); }
            });
            this._charts = {};
            if (this._resizeBound) {
                window.removeEventListener("resize", this._resizeBound);
                this._resizeBound = null;
            }
        },

        /** rupees -> Crore, rounded to 2 decimals (chart series + axis values) */
        _cr: function (v) { return Math.round((v || 0) / 1e5) / 100; },

        _inr: function (v) {
            v = v || 0;
            if (Math.abs(v) >= 1e7) { return "₹ " + (v / 1e7).toFixed(2) + " Cr"; }
            if (Math.abs(v) >= 1e5) { return "₹ " + (v / 1e5).toFixed(2) + " L"; }
            return "₹ " + Math.round(v).toLocaleString("en-IN");
        }
    });
});
