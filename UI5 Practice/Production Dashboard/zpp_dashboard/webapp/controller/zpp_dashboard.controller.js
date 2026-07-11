sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/BusyIndicator"
], function (Controller, JSONModel, BusyIndicator) {
    "use strict";

    // Current Indian fiscal year (Apr-Mar) plus the two prior years, newest first.
    function buildFyList() {
        var d = new Date();
        var fy = (d.getMonth() + 1) >= 4 ? d.getFullYear() : d.getFullYear() - 1;
        return [String(fy), String(fy - 1), String(fy - 2)];
    }

    function todayISO() {
        var d = new Date();
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");
        return d.getFullYear() + "-" + m + "-" + day;
    }

    // Filter UI lives in this native UI5 view; the ECharts dashboard (KPIs + charts)
    // stays in its own iframe/document and is driven purely by postMessage so the
    // existing chart-rendering code in dashboard.html never has to change.
    return Controller.extend("com.sap.zppdashboard.controller.zpp_dashboard", {

        onInit: function () {
            var aYears = buildFyList();
            var oUiModel = new JSONModel({
                selectedFY: aYears[0],
                fyList: aYears.map(function (y) { return { key: y, text: y }; }),
                selectedPlants: [],
                selectedCategories: [],
                plantList: [],
                categoryList: [],
                measure: "QTY",           // Quantity (default) | Amount toggle
                asOfDate: todayISO()      // debug: "as of" date driving YTD/MTD/YS + cutoff
            });
            this.getView().setModel(oUiModel, "ui");

            this._bApplyingRemoteState = false;
            this._bFirstStateReceived = false;

            this._fnMessageHandler = this._onWindowMessage.bind(this);
            window.addEventListener("message", this._fnMessageHandler);

            BusyIndicator.show(0);

            var sUrl = sap.ui.require.toUrl("com/sap/zppdashboard/dashboard.html");
            this.byId("dashHost").setContent(
                "<iframe id='zppDashFrame' src='" + sUrl + "' title='Production Dashboard' " +
                "style='display:block;border:0;width:100%;height:100%;'></iframe>");

            this._iDashContentHeight = 0;
            this._fnFitHeight = this._setDashHeight.bind(this);
            window.addEventListener("resize", this._fnFitHeight);
        },

        onExit: function () {
            window.removeEventListener("message", this._fnMessageHandler);
            window.removeEventListener("resize", this._fnFitHeight);
            if (this._oFilterBarResizeObserver) { this._oFilterBarResizeObserver.disconnect(); }
        },

        onAfterRendering: function () {
            window.requestAnimationFrame(this._fnFitHeight);
            if (!this._bHeightFitWired) {
                this._bHeightFitWired = true;
                var oBar = this.getView().$().find(".filterBar")[0];
                if (oBar && window.ResizeObserver) {
                    this._oFilterBarResizeObserver = new ResizeObserver(this._fnFitHeight);
                    this._oFilterBarResizeObserver.observe(oBar);
                }
            }
        },

        // Size the iframe to its FULL content height so the whole thing scrolls as
        // one document (filter bar included) and prints in full - not clipped to a
        // viewport with an inner iframe scrollbar.
        _setDashHeight: function () {
            var oFrame = document.getElementById("zppDashFrame");
            if (!oFrame) { return; }
            var iTop = oFrame.getBoundingClientRect().top;
            var iMin = Math.max(Math.floor(window.innerHeight - iTop), 300);
            oFrame.style.height = Math.max(this._iDashContentHeight || 0, iMin) + "px";
        },

        /* ============================================================
           Bridge to the dashboard iframe
        ============================================================ */
        _getFrameWindow: function () {
            var oFrame = document.getElementById("zppDashFrame");
            return oFrame && oFrame.contentWindow;
        },

        _postFilters: function () {
            var oWin = this._getFrameWindow();
            if (!oWin) { return; }
            var oUi = this.getView().getModel("ui").getData();
            oWin.postMessage({
                source: "zpp-dashboard-host",
                type: "zpp-filters",
                payload: {
                    fiscalYear: oUi.selectedFY,
                    selectedPlants: oUi.selectedPlants,
                    selectedCategories: oUi.selectedCategories,
                    measure: oUi.measure,
                    asOfDate: oUi.asOfDate
                }
            }, "*");
        },

        _onWindowMessage: function (oEvent) {
            var oData = oEvent.data;
            if (!oData || oData.source !== "zpp-dashboard") { return; }
            if (oData.type === "zpp-state") {
                this._applyRemoteState(oData.payload);
            } else if (oData.type === "zpp-height") {
                this._iDashContentHeight = oData.height || 0;
                this._setDashHeight();
            }
        },

        // The iframe is the source of truth for Plant/Category options since those
        // depend on the fetched OData for the current fiscal year.
        _applyRemoteState: function (oPayload) {
            if (!oPayload) { return; }
            var oUiModel = this.getView().getModel("ui");
            this._bApplyingRemoteState = true;
            oUiModel.setProperty("/plantList", oPayload.plantList || []);
            oUiModel.setProperty("/categoryList", oPayload.categoryList || []);
            oUiModel.setProperty("/selectedPlants", oPayload.selectedPlants || []);
            oUiModel.setProperty("/selectedCategories", oPayload.selectedCategories || []);
            this._bApplyingRemoteState = false;

            if (!this._bFirstStateReceived) {
                this._bFirstStateReceived = true;
                BusyIndicator.hide();
            }
        },

        /* ============================================================
           Event handlers
        ============================================================ */
        onFilterChange: function () {
            if (this._bApplyingRemoteState) { return; }
            this._postFilters();
        },

        // MultiComboBox: reload once when the picker closes, not on every tick.
        onPlantSelectionChange: function (oEvent) {
            if (this._bApplyingRemoteState) { return; }
            if (!oEvent.getSource().isOpen()) {
                this._postFilters();
            }
        },

        onCategorySelectionChange: function (oEvent) {
            if (this._bApplyingRemoteState) { return; }
            if (!oEvent.getSource().isOpen()) {
                this._postFilters();
            }
        },

        // Quantity / Amount toggle - a pure display switch over already-fetched data.
        onMeasureChange: function () {
            if (this._bApplyingRemoteState) { return; }
            this._postFilters();
        },

        onResetFilters: function () {
            var oUiModel = this.getView().getModel("ui");
            var aYears = (oUiModel.getProperty("/fyList") || []).map(function (o) { return o.key; });
            oUiModel.setProperty("/selectedFY", aYears[0] || "");
            oUiModel.setProperty("/selectedPlants", []);
            oUiModel.setProperty("/selectedCategories", []);
            oUiModel.setProperty("/measure", "QTY");
            oUiModel.setProperty("/asOfDate", todayISO());
            this._postFilters();
        }
    });
});
