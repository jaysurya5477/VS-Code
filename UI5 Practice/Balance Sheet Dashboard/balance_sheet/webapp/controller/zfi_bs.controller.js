sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/format/NumberFormat",
    "sap/ui/core/Locale",
    "sap/ui/core/BusyIndicator"
], function (Controller, JSONModel, NumberFormat, Locale, BusyIndicator) {
    "use strict";

    // Entity set + business constants
    var ENTITY_SET = "/zfi_bs_cds";
    var CR_DIVISOR = 10000000;           // Rupees -> Crores
    var RUPEE = "₹";                // Indian Rupee sign

    // Distinct slice colours (cycled) for the pie charts
    var PALETTE = [
        "#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2",
        "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
        "#1f77b4", "#aec7e8", "#2ca02c", "#98df8a", "#d62728",
        "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22"
    ];

    // Chart.js plugin: draw labels on BOTH sides of the pie (left-half slices to the left,
    // right-half to the right), with leader lines from each slice centre, anti-overlap
    // spacing, colour box + full name + %. Records hit boxes on the chart for click-to-filter.
    var LABEL_H = 16;                  // vertical space reserved per label
    var sideLabelsPlugin = {
        id: "sideLabels",
        afterDraw: function (chart) {
            var ctx = chart.ctx;
            var oMeta = chart.getDatasetMeta(0);
            if (!oMeta || !oMeta.data || !oMeta.data.length) { return; }
            var oDs = chart.data.datasets[0];
            var aLabels = chart.data.labels || [];
            var aValues = oDs.data;
            var fTotal = aValues.reduce(function (s, v) { return s + (v || 0); }, 0);
            if (!fTotal) { return; }

            var aLeft = [], aRight = [];
            oMeta.data.forEach(function (oArc, i) {
                if (!aValues[i]) { return; }
                var p = oArc.getProps(["x", "y", "startAngle", "endAngle", "outerRadius"], true);
                var fAngle = (p.startAngle + p.endAngle) / 2;
                var fCos = Math.cos(fAngle), fSin = Math.sin(fAngle);
                var oEntry = {
                    i: i, cx: p.x, cy: p.y, r: p.outerRadius,
                    x0: p.x + fCos * p.outerRadius * 0.55,   // line start inside the slice
                    y0: p.y + fSin * p.outerRadius * 0.55,
                    xe: p.x + fCos * (p.outerRadius + 6),    // edge stub
                    ye: p.y + fSin * (p.outerRadius + 6),
                    idealY: p.y + fSin * (p.outerRadius + 10),
                    color: (oDs.backgroundColor && oDs.backgroundColor[i]) || "#9aa0a6",
                    pct: aValues[i] / fTotal * 100,
                    name: String(aLabels[i] || "")
                };
                (fCos >= 0 ? aRight : aLeft).push(oEntry);
            });

            var aBoxes = [];
            this._drawSide(ctx, aRight, 1, 8, chart.height - 8, aBoxes);
            this._drawSide(ctx, aLeft, -1, 8, chart.height - 8, aBoxes);
            chart.$labelBoxes = aBoxes;   // consumed by the canvas click handler
        },

        // Lay out one side without overlap, then draw leader line + colour box + text
        _drawSide: function (ctx, aSide, iDir, fTop, fBottom, aBoxes) {
            if (!aSide.length) { return; }
            aSide.sort(function (a, b) { return a.idealY - b.idealY; });

            var fPrev = fTop - LABEL_H;
            aSide.forEach(function (e) { e.ly = Math.max(e.idealY, fPrev + LABEL_H); fPrev = e.ly; });
            var fNext = fBottom + LABEL_H;
            for (var k = aSide.length - 1; k >= 0; k--) {
                aSide[k].ly = Math.min(aSide[k].ly, fNext - LABEL_H);
                fNext = aSide[k].ly;
            }

            ctx.save();
            ctx.font = "11px Arial";
            ctx.textBaseline = "middle";
            ctx.textAlign = iDir >= 0 ? "left" : "right";
            var BOX = 9, GAP = 5;
            aSide.forEach(function (e) {
                var fAnchorX = e.cx + iDir * (e.r + 14);
                ctx.strokeStyle = e.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(e.x0, e.y0);
                ctx.lineTo(e.xe, e.ye);
                ctx.lineTo(fAnchorX, e.ly);
                ctx.stroke();

                var sName = e.name.length > 22 ? e.name.slice(0, 21) + "…" : e.name;
                var sText = sName + "  " + e.pct.toFixed(1) + "%";
                var fTextW = ctx.measureText(sText).width;

                if (iDir >= 0) {                       // right side: [box][text]
                    var bxR = fAnchorX + 2;
                    ctx.fillStyle = e.color;
                    ctx.fillRect(bxR, e.ly - BOX / 2, BOX, BOX);
                    ctx.fillStyle = "#32363a";
                    ctx.fillText(sText, bxR + BOX + GAP, e.ly);
                    aBoxes.push({ x: bxR, y: e.ly - LABEL_H / 2, w: BOX + GAP + fTextW, h: LABEL_H, label: e.name });
                } else {                               // left side: [text][box]
                    var bxL = fAnchorX - 2 - BOX;
                    ctx.fillStyle = e.color;
                    ctx.fillRect(bxL, e.ly - BOX / 2, BOX, BOX);
                    ctx.fillStyle = "#32363a";
                    ctx.fillText(sText, bxL - GAP, e.ly);
                    aBoxes.push({ x: bxL - GAP - fTextW, y: e.ly - LABEL_H / 2, w: fTextW + GAP + BOX, h: LABEL_H, label: e.name });
                }
            });
            ctx.restore();
        }
    };

    return Controller.extend("com.sap.balancesheet.controller.zfi_bs", {

        onInit: function () {
            this._charts = {};               // Chart.js instances keyed by canvas id
            this._ensureChartJs();           // kick off the Chart.js load early
            this._crFormat = NumberFormat.getFloatInstance({
                groupingEnabled: true,
                minFractionDigits: 2,
                maxFractionDigits: 2
            }, new Locale("en_IN"));         // Indian digit grouping (1,23,45,678)

            var oUiModel = new JSONModel({
                busy: false,
                selectedFY: "",
                selectedPCs: [],
                selectedMonths: [],
                fyList: [],
                pcList: [],
                monthList: [],
                kpi: { asset: "0.00", liability: "0.00", networth: "0.00" },
                report: { title: "", rows: [] }
            });
            this.getView().setModel(oUiModel, "ui");

            // Distinct values for the dropdowns; resolves once defaults are set
            BusyIndicator.show(0);
            this._filtersLoaded = this._loadFilterLists();
        },

        onAfterRendering: function () {
            // Canvas DOM nodes now exist; wait for the filter defaults, then draw.
            if (!this._bInitialLoad) {
                this._bInitialLoad = true;
                this._filtersLoaded.then(function () {
                    this._loadDashboard();
                }.bind(this)).catch(function () {
                    BusyIndicator.hide();
                });
            }
        },

        /* ============================================================
           Filter dropdowns
        ============================================================ */
        _loadFilterLists: function () {
            var oUiModel = this.getView().getModel("ui");

            // Fiscal Year (newest first) + default selection. Mandatory: no "(All)" entry.
            var pFY = this._aggregate("groupby((gjahr))").then(function (aRows) {
                var aYears = aRows.map(function (r) { return r.gjahr; }).filter(Boolean)
                    .sort(function (a, b) { return b.localeCompare(a); });
                var aList = aYears.map(function (y) { return { key: y, text: y }; });
                oUiModel.setProperty("/fyList", aList);
                oUiModel.setProperty("/selectedFY", this._defaultFiscalYear(aYears));
            }.bind(this));

            // Profit Center (code + description). Multi-select: an empty selection
            // means all, so no "(All)" entry. Falls back to codes only while the
            // backend CDS doesn't expose prctr_desc yet.
            var pPC = this._aggregate("groupby((prctr,prctr_desc))").catch(function () {
                return this._aggregate("groupby((prctr))");
            }.bind(this)).then(function (aRows) {
                var mSeen = {};
                var aList = aRows.filter(function (r) {
                    if (!r.prctr || mSeen[r.prctr]) { return false; }
                    mSeen[r.prctr] = true;
                    return true;
                }).sort(function (a, b) { return a.prctr.localeCompare(b.prctr); })
                    .map(function (r) {
                        return { key: r.prctr, text: r.prctr_desc ? r.prctr + " - " + r.prctr_desc : r.prctr };
                    });
                oUiModel.setProperty("/pcList", aList);
            });

            // Month (ordered by fiscal month number). Multi-select: an empty
            // selection means all, so no "(All)" entry.
            var pMonth = this._aggregate("groupby((zmonth,month_num))").then(function (aRows) {
                var aList = aRows.filter(function (r) { return r.zmonth; })
                    .sort(function (a, b) { return (parseInt(a.month_num, 10) || 0) - (parseInt(b.month_num, 10) || 0); })
                    .map(function (r) { return { key: r.zmonth, text: r.zmonth }; });
                oUiModel.setProperty("/monthList", aList);
            });

            return Promise.all([pFY, pPC, pMonth]);
        },

        // Current Indian fiscal year (Apr-Mar); falls back to the latest year with data
        _defaultFiscalYear: function (aYearsDesc) {
            if (!aYearsDesc.length) { return ""; }
            var oNow = new Date();
            var iFY = (oNow.getMonth() + 1) >= 4 ? oNow.getFullYear() : oNow.getFullYear() - 1;
            var sFY = String(iFY);
            return aYearsDesc.indexOf(sFY) > -1 ? sFY : aYearsDesc[0];
        },

        /* ============================================================
           Event handlers
        ============================================================ */
        onFilterChange: function () {
            this._loadDashboard();
        },

        // MultiComboBox: reload once when the picker closes, not on every tick.
        onPCSelectionFinish: function () {
            this._loadDashboard();
        },

        // Removing a token while the picker is closed fires no selectionFinish,
        // so catch that case here.
        onPCSelectionChange: function (oEvent) {
            if (!oEvent.getSource().isOpen()) {
                this._loadDashboard();
            }
        },

        // MultiComboBox: reload once when the picker closes, not on every tick.
        onMonthSelectionFinish: function () {
            this._loadDashboard();
        },

        // Removing a token while the picker is closed fires no selectionFinish,
        // so catch that case here.
        onMonthSelectionChange: function (oEvent) {
            if (!oEvent.getSource().isOpen()) {
                this._loadDashboard();
            }
        },

        onResetFilters: function () {
            var oUiModel = this.getView().getModel("ui");
            // Fiscal Year is mandatory -> reset it to the current/latest year, not blank
            var aYears = (oUiModel.getProperty("/fyList") || []).map(function (o) { return o.key; });
            oUiModel.setProperty("/selectedFY", this._defaultFiscalYear(aYears));
            oUiModel.setProperty("/selectedPCs", []);
            oUiModel.setProperty("/selectedMonths", []);
            this._loadDashboard();
        },

        /* ============================================================
           Dashboard load: one aggregated call feeds KPIs + both pies
        ============================================================ */
        _loadDashboard: function () {
            var oUiModel = this.getView().getModel("ui");
            BusyIndicator.show(0);
            // a filter change invalidates any open drill-down
            oUiModel.setProperty("/report/rows", []);
            oUiModel.setProperty("/report/title", "");

            // 'rhcur' must be in the groupby: the backend won't aggregate the
            // currency measure 'amount' without its currency key (SADL_GW/011).
            var sFilter = this._buildFilter();
            var sApply = (sFilter ? "filter(" + sFilter + ")/" : "") +
                "groupby((type,particulars,rhcur),aggregate(amount with sum as total))";

            this._aggregate(sApply).then(function (aRows) {
                this._renderDashboard(aRows);
                BusyIndicator.hide();
            }.bind(this)).catch(function () {
                BusyIndicator.hide();
            });
        },

        _renderDashboard: function (aRows) {
            var assetSum = 0, liabSum = 0;
            var mAsset = {}, mLiab = {};   // particulars -> signed sum (collapses rhcur splits)

            aRows.forEach(function (oRow) {
                var fSigned = parseFloat(oRow.total) || 0;
                var sLabel = oRow.particulars || "(Unassigned)";
                if (this._isLiability(oRow.type)) {
                    liabSum += fSigned;
                    mLiab[sLabel] = (mLiab[sLabel] || 0) + fSigned;
                } else {
                    assetSum += fSigned;
                    mAsset[sLabel] = (mAsset[sLabel] || 0) + fSigned;
                }
            }.bind(this));

            // KPIs (in Cr). Net Worth = signed sum across all rows.
            var oUiModel = this.getView().getModel("ui");
            oUiModel.setProperty("/kpi/asset", this._toCr(Math.abs(assetSum)));
            oUiModel.setProperty("/kpi/liability", this._toCr(Math.abs(liabSum)));
            oUiModel.setProperty("/kpi/networth", this._toCr(assetSum + liabSum));

            // Pies. Chart.js may still be loading (FLP preview bypasses index.html), so wait.
            this._ensureChartJs().then(function () {
                this._renderPie("assetPie", this._toSlices(mAsset));
                this._renderPie("liabilityPie", this._toSlices(mLiab));
            }.bind(this));
        },

        // Map of particulars->signed sum into pie slices (abs size, signed kept), largest first
        _toSlices: function (mGroup) {
            return Object.keys(mGroup).map(function (sLabel) {
                return { label: sLabel, value: Math.abs(mGroup[sLabel]), signed: mGroup[sLabel] };
            }).sort(function (a, b) { return b.value - a.value; });
        },

        /* ============================================================
           Chart.js loading (works from index.html AND the FLP preview)
        ============================================================ */
        _ensureChartJs: function () {
            if (this._chartJsPromise) {
                return this._chartJsPromise;
            }
            this._chartJsPromise = new Promise(function (resolve, reject) {
                if (typeof window.Chart !== "undefined") {
                    resolve();
                    return;
                }
                var sUrl = sap.ui.require.toUrl("com/sap/balancesheet/libs/chart.umd.min.js");
                var oScript = document.createElement("script");
                // The UMD bundle prefers an AMD loader if one is present; UI5's loader
                // would capture it as an anonymous module and never set window.Chart.
                // Neutralise define() for the duration of the load to force the
                // browser-global path, then restore it.
                var fnDefine = window.define;
                window.define = undefined;
                var fnRestore = function () { window.define = fnDefine; };
                oScript.src = sUrl;
                oScript.onload = function () { fnRestore(); resolve(); };
                oScript.onerror = function (e) { fnRestore(); reject(e); };
                document.head.appendChild(oScript);
            });
            return this._chartJsPromise;
        },

        /* ============================================================
           Chart.js pie rendering
        ============================================================ */
        _renderPie: function (sCanvasId, aData) {
            var oCanvas = document.getElementById(sCanvasId);
            if (!oCanvas || typeof window.Chart === "undefined") {
                return;
            }

            // Re-render: drop the previous instance bound to this canvas
            if (this._charts[sCanvasId]) {
                this._charts[sCanvasId].destroy();
                delete this._charts[sCanvasId];
            }

            var that = this;
            this._charts[sCanvasId] = new window.Chart(oCanvas.getContext("2d"), {
                type: "pie",
                data: {
                    labels: aData.map(function (d) { return d.label; }),
                    datasets: [{
                        data: aData.map(function (d) { return d.value; }),
                        backgroundColor: aData.map(function (d, i) { return PALETTE[i % PALETTE.length]; }),
                        borderColor: "#ffffff",
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    // wide left/right padding leaves room for the two-sided labels
                    layout: { padding: { top: 10, bottom: 10, left: 150, right: 150 } },
                    plugins: {
                        legend: { display: false },   // custom two-sided labels are drawn by sideLabelsPlugin
                        tooltip: {
                            callbacks: {
                                // Tooltip shows the REAL signed value (in Cr), not the abs slice size
                                label: function (ctx) {
                                    var oSlice = aData[ctx.dataIndex];
                                    return ctx.label + ": " + that._toCr(oSlice.signed);
                                }
                            }
                        }
                    },
                    onClick: function (evt, elements, chart) {
                        // 1) a slice was clicked
                        var els = (elements && elements.length) ? elements
                            : chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
                        if (els && els.length) {
                            that._onSliceSelected(sCanvasId, aData[els[0].index].label);
                            return;
                        }
                        // 2) a side label was clicked (hit-test the recorded label boxes)
                        var aBoxes = chart.$labelBoxes || [];
                        for (var b = 0; b < aBoxes.length; b++) {
                            var oB = aBoxes[b];
                            if (evt.x >= oB.x && evt.x <= oB.x + oB.w && evt.y >= oB.y && evt.y <= oB.y + oB.h) {
                                that._onSliceSelected(sCanvasId, oB.label);
                                return;
                            }
                        }
                    }
                },
                plugins: [sideLabelsPlugin]
            });
        },

        /* ============================================================
           Drill-down report (click a pie slice)
        ============================================================ */
        _onSliceSelected: function (sCanvasId, sParticulars) {
            this._loadReport(sParticulars);
        },

        _loadReport: function (sParticulars) {
            var oUiModel = this.getView().getModel("ui");
            var aCond = [];
            var sFilter = this._buildFilter();
            if (sFilter) { aCond.push(sFilter); }
            aCond.push("particulars eq '" + this._esc(sParticulars) + "'");
            var sApply = "filter(" + aCond.join(" and ") +
                ")/groupby((txt50,rhcur),aggregate(amount with sum as total))";

            BusyIndicator.show(0);
            this._aggregate(sApply).then(function (aRows) {
                var mAcc = {};
                aRows.forEach(function (r) {
                    var sAcc = r.txt50 || "(n/a)";
                    mAcc[sAcc] = (mAcc[sAcc] || 0) + (parseFloat(r.total) || 0);
                });
                var aReport = Object.keys(mAcc).map(function (sAcc) {
                    return { account: sAcc, amount: this._toCr(mAcc[sAcc]), _v: mAcc[sAcc] };
                }.bind(this)).sort(function (a, b) { return Math.abs(b._v) - Math.abs(a._v); });

                oUiModel.setProperty("/report/rows", aReport);
                oUiModel.setProperty("/report/title", this._getText("reportTitle") + " " + sParticulars);
                BusyIndicator.hide();
            }.bind(this)).catch(function () {
                BusyIndicator.hide();
            });
        },

        /* ============================================================
           Helpers
        ============================================================ */

        // i18n text via the owner component (the i18n model lives there, not yet on the view at onInit)
        _getText: function (sKey) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey);
        },

        // Liability rows are flagged by the 'type' (zgroup) column.
        _isLiability: function (sType) {
            return (sType || "").toUpperCase().indexOf("LIABILIT") > -1;
        },

        // Builds the OData V4 $filter expression from the three selectors.
        _buildFilter: function () {
            var oUiModel = this.getView().getModel("ui");
            var aCond = [];
            var sFY = oUiModel.getProperty("/selectedFY");
            var aPCs = oUiModel.getProperty("/selectedPCs") || [];
            var aMonths = oUiModel.getProperty("/selectedMonths") || [];

            if (sFY) { aCond.push("gjahr eq '" + this._esc(sFY) + "'"); }
            if (aPCs.length) {
                var sPCCond = aPCs.map(function (sPC) {
                    return "prctr eq '" + this._esc(sPC) + "'";
                }.bind(this)).join(" or ");
                aCond.push(aPCs.length > 1 ? "(" + sPCCond + ")" : sPCCond);
            }
            if (aMonths.length) {
                var sMonthCond = aMonths.map(function (sMonth) {
                    return "zmonth eq '" + this._esc(sMonth) + "'";
                }.bind(this)).join(" or ");
                aCond.push(aMonths.length > 1 ? "(" + sMonthCond + ")" : sMonthCond);
            }

            return aCond.join(" and ");
        },

        // Escape single quotes for OData string literals
        _esc: function (sValue) {
            return String(sValue).replace(/'/g, "''");
        },

        // Runs a $apply query against the V4 model and resolves to plain objects.
        // Use the owner component's model: at onInit it isn't propagated to the view yet.
        _aggregate: function (sApply) {
            var oModel = this.getOwnerComponent().getModel();
            var oBinding = oModel.bindList(ENTITY_SET, null, null, null, {
                $apply: sApply
            });
            return oBinding.requestContexts(0, 5000).then(function (aContexts) {
                return aContexts.map(function (oContext) { return oContext.getObject(); });
            });
        },

        // Rupees -> Crores, Indian grouping, ₹ prefix, "Cr" suffix.
        // Sign is decided on the rounded value so -0.00 never shows a minus.
        _toCr: function (fValue) {
            var f = (fValue || 0) / CR_DIVISOR;
            var bNeg = Math.round(f * 100) < 0;
            return (bNeg ? "-" : "") + RUPEE + this._crFormat.format(Math.abs(f)) + " Cr";
        }
    });
});
