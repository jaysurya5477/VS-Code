sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/format/NumberFormat",
    "sap/ui/core/Locale",
    "sap/ui/core/BusyIndicator"
], function (Controller, JSONModel, NumberFormat, Locale, BusyIndicator) {
    "use strict";

    var ENTITY_SET = "/zfi_pl_cds";
    var CR_DIVISOR = 10000000;
    var RUPEE = "₹";

    var PALETTE = [
        "#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2",
        "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
        "#1f77b4", "#aec7e8", "#2ca02c", "#98df8a", "#d62728",
        "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22"
    ];

    var LABEL_H = 16;
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
                    x0: p.x + fCos * p.outerRadius * 0.55,
                    y0: p.y + fSin * p.outerRadius * 0.55,
                    xe: p.x + fCos * (p.outerRadius + 6),
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
            chart.$labelBoxes = aBoxes;
        },

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

                if (iDir >= 0) {
                    var bxR = fAnchorX + 2;
                    ctx.fillStyle = e.color;
                    ctx.fillRect(bxR, e.ly - BOX / 2, BOX, BOX);
                    ctx.fillStyle = "#32363a";
                    ctx.fillText(sText, bxR + BOX + GAP, e.ly);
                    aBoxes.push({ x: bxR, y: e.ly - LABEL_H / 2, w: BOX + GAP + fTextW, h: LABEL_H, label: e.name });
                } else {
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

    return Controller.extend("com.sap.zprofitloss.controller.zprofit_loss", {

        onInit: function () {
            this._charts = {};
            this._ensureChartJs();
            this._crFormat = NumberFormat.getFloatInstance({
                groupingEnabled: true,
                minFractionDigits: 2,
                maxFractionDigits: 2
            }, new Locale("en_IN"));

            var oUiModel = new JSONModel({
                busy: false,
                selectedFY: "",
                selectedPCs: [],
                selectedMonths: [],
                fyList: [],
                pcList: [],
                monthList: [],
                kpi: { income: "0.00", expense: "0.00", netprofit: "0.00" },
                report: { title: "", rows: [] }
            });
            this.getView().setModel(oUiModel, "ui");

            BusyIndicator.show(0);
            this._filtersLoaded = this._loadFilterLists();
        },

        onAfterRendering: function () {
            if (!this._bInitialLoad) {
                this._bInitialLoad = true;
                this._filtersLoaded.then(function () {
                    this._loadDashboard();
                }.bind(this)).catch(function () {
                    BusyIndicator.hide();
                });
            }
        },

        _loadFilterLists: function () {
            var oUiModel = this.getView().getModel("ui");

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

        _defaultFiscalYear: function (aYearsDesc) {
            if (!aYearsDesc.length) { return ""; }
            var oNow = new Date();
            var iFY = (oNow.getMonth() + 1) >= 4 ? oNow.getFullYear() : oNow.getFullYear() - 1;
            var sFY = String(iFY);
            return aYearsDesc.indexOf(sFY) > -1 ? sFY : aYearsDesc[0];
        },

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
            var aYears = (oUiModel.getProperty("/fyList") || []).map(function (o) { return o.key; });
            oUiModel.setProperty("/selectedFY", this._defaultFiscalYear(aYears));
            oUiModel.setProperty("/selectedPCs", []);
            oUiModel.setProperty("/selectedMonths", []);
            this._loadDashboard();
        },

        _loadDashboard: function () {
            var oUiModel = this.getView().getModel("ui");
            BusyIndicator.show(0);
            oUiModel.setProperty("/report/rows", []);
            oUiModel.setProperty("/report/title", "");

            var sFilter = this._buildFilter();
            var sApply = (sFilter ? "filter(" + sFilter + ")/" : "") +
                "groupby((sub_type,particulars,rhcur),aggregate(amount with sum as total))";

            this._aggregate(sApply).then(function (aRows) {
                this._renderDashboard(aRows);
                BusyIndicator.hide();
            }.bind(this)).catch(function () {
                BusyIndicator.hide();
            });
        },

        _renderDashboard: function (aRows) {
            var incomeSum = 0, expenseSum = 0;
            var mIncome = {}, mExpense = {};

            aRows.forEach(function (oRow) {
                var fSigned = parseFloat(oRow.total) || 0;
                var sLabel = oRow.particulars || "(Unassigned)";
                if (this._isExpense(oRow.sub_type)) {
                    expenseSum += fSigned;
                    mExpense[sLabel] = (mExpense[sLabel] || 0) + fSigned;
                } else {
                    incomeSum += fSigned;
                    mIncome[sLabel] = (mIncome[sLabel] || 0) + fSigned;
                }
            }.bind(this));

            var oUiModel = this.getView().getModel("ui");
            oUiModel.setProperty("/kpi/income", this._toCr(Math.abs(incomeSum)));
            oUiModel.setProperty("/kpi/expense", this._toCr(Math.abs(expenseSum)));
            oUiModel.setProperty("/kpi/netprofit", this._toCr(Math.abs(incomeSum) - Math.abs(expenseSum)));

            this._ensureChartJs().then(function () {
                this._renderPie("incomePie", this._toSlices(mIncome));
                this._renderPie("expensePie", this._toSlices(mExpense));
            }.bind(this));
        },

        _toSlices: function (mGroup) {
            return Object.keys(mGroup).map(function (sLabel) {
                return { label: sLabel, value: Math.abs(mGroup[sLabel]), signed: mGroup[sLabel] };
            }).sort(function (a, b) { return b.value - a.value; });
        },

        _ensureChartJs: function () {
            if (this._chartJsPromise) {
                return this._chartJsPromise;
            }
            this._chartJsPromise = new Promise(function (resolve, reject) {
                if (typeof window.Chart !== "undefined") {
                    resolve();
                    return;
                }
                var sUrl = sap.ui.require.toUrl("com/sap/zprofitloss/libs/chart.umd.min.js");
                var oScript = document.createElement("script");
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

        _renderPie: function (sCanvasId, aData) {
            var oCanvas = document.getElementById(sCanvasId);
            if (!oCanvas || typeof window.Chart === "undefined") {
                return;
            }

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
                    layout: { padding: { top: 10, bottom: 10, left: 150, right: 150 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    var oSlice = aData[ctx.dataIndex];
                                    return ctx.label + ": " + that._toCr(oSlice.signed);
                                }
                            }
                        }
                    },
                    onClick: function (evt, elements, chart) {
                        var els = (elements && elements.length) ? elements
                            : chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
                        if (els && els.length) {
                            that._onSliceSelected(sCanvasId, aData[els[0].index].label);
                            return;
                        }
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

        _getText: function (sKey) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey);
        },

        _isExpense: function (sType) {
            return (sType || "").toUpperCase().indexOf("EXPENSE") > -1;
        },

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

        _esc: function (sValue) {
            return String(sValue).replace(/'/g, "''");
        },

        _aggregate: function (sApply) {
            var oModel = this.getOwnerComponent().getModel();
            var oBinding = oModel.bindList(ENTITY_SET, null, null, null, {
                $apply: sApply
            });
            return oBinding.requestContexts(0, 5000).then(function (aContexts) {
                return aContexts.map(function (oContext) { return oContext.getObject(); });
            });
        },

        _toCr: function (fValue) {
            var f = (fValue || 0) / CR_DIVISOR;
            var bNeg = Math.round(f * 100) < 0;
            return (bNeg ? "-" : "") + RUPEE + this._crFormat.format(Math.abs(f)) + " Cr";
        }
    });
});
