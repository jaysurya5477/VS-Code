sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageToast",
	"sap/ui/core/BusyIndicator"
], function (Controller, JSONModel, MessageToast, BusyIndicator) {
	"use strict";

	// "Open Before" defaults to today (yyyy-MM-dd, Edm.Date literal)
	function todayISO() {
		var d = new Date();
		var sMonth = String(d.getMonth() + 1).padStart(2, "0");
		var sDay = String(d.getDate()).padStart(2, "0");
		return d.getFullYear() + "-" + sMonth + "-" + sDay;
	}
	var PARTY_TYPE_LIST = [
		{ key: "Debtors", text: "Customer" },
		{ key: "Creditors", text: "Vendor" }
	];
	var DEFAULT_VARIANT_LIST = [
		{ key: "Debtors", text: "Debtors" },
		{ key: "Creditors Month", text: "Creditors Month" }
	];

	// Filter UI lives in this native UI5 view; the ApexCharts dashboard (KPIs + charts)
	// stays in its own iframe/document and is driven purely by postMessage so the
	// existing chart-rendering code in dashboard.html never has to change.
	return Controller.extend("com.sap.zficvageing.controller.zfi_cv_ageing", {

		onInit: function () {
			var oUiModel = new JSONModel({
				partyType: "Debtors",
				partyTypeList: PARTY_TYPE_LIST,
				selectedPCs: [],
				pcList: [],
				bucketVariant: "Debtors",
				variantList: DEFAULT_VARIANT_LIST,
				bucket: "ALL",
				bucketList: [{ key: "ALL", text: "All buckets" }],
				date: todayISO(),
				selectedParties: [],
				partyList: [],
				partyLabel: "Customer",
				showAdvance: true,       // special-GL (advance/down-payment) items
				showNormal: true,        // regular open items
				defaultVariant: ""       // user's saved default variant (fills the star)
			});
			this.getView().setModel(oUiModel, "ui");

			this._bApplyingRemoteState = false;
			this._bFirstStateReceived = false;

			this._fnMessageHandler = this._onWindowMessage.bind(this);
			window.addEventListener("message", this._fnMessageHandler);

			BusyIndicator.show(0);

			var sUrl = sap.ui.require.toUrl("com/sap/zficvageing/dashboard.html");
			this.byId("dashHost").setContent(
				"<iframe id='cvDashFrame' src='" + sUrl + "' title='CV Ageing Dashboard' " +
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
			// Re-fit on every render (layout may shift), but wire the observers once.
			// Defer past the current layout pass so getBoundingClientRect is accurate.
			window.requestAnimationFrame(this._fnFitHeight);
			if (!this._bHeightFitWired) {
				this._bHeightFitWired = true;
				// the filter bar's own height can change (e.g. MultiComboBox tokens
				// wrapping to a second line) - keep the iframe box in sync with it
				var oBar = this.getView().$().find(".filterBar")[0];
				if (oBar && window.ResizeObserver) {
					this._oFilterBarResizeObserver = new ResizeObserver(this._fnFitHeight);
					this._oFilterBarResizeObserver.observe(oBar);
				}
			}
		},

		// Size the iframe to its FULL content height so the whole thing scrolls as
		// one document (filter bar included) and prints in full - not clipped to a
		// viewport with an inner iframe scrollbar. Fall back to at least the
		// remaining viewport height so short content still fills the page.
		// (The FLP shell doesn't give the Page a definite height, so CSS
		// height:100%/flex cascading can't be relied on here - measure instead.)
		_setDashHeight: function () {
			var oFrame = document.getElementById("cvDashFrame");
			if (!oFrame) { return; }
			var iTop = oFrame.getBoundingClientRect().top;
			var iMin = Math.max(Math.floor(window.innerHeight - iTop), 300);
			oFrame.style.height = Math.max(this._iDashContentHeight || 0, iMin) + "px";
		},

		/* ============================================================
		   Bridge to the dashboard iframe
		============================================================ */
		_getFrameWindow: function () {
			var oFrame = document.getElementById("cvDashFrame");
			return oFrame && oFrame.contentWindow;
		},

		_postFilters: function () {
			var oWin = this._getFrameWindow();
			if (!oWin) { return; }
			var oUi = this.getView().getModel("ui").getData();
			oWin.postMessage({
				source: "cv-ageing-host",
				type: "cv-filters",
				payload: {
					partyType: oUi.partyType,
					selectedPCs: oUi.selectedPCs,
					bucketVariant: oUi.bucketVariant,
					bucket: oUi.bucket,
					date: oUi.date,
					selectedParties: oUi.selectedParties,
					showAdvance: oUi.showAdvance,
					showNormal: oUi.showNormal
				}
			}, "*");
		},

		_onWindowMessage: function (oEvent) {
			var oData = oEvent.data;
			if (!oData || oData.source !== "cv-ageing-dashboard") { return; }
			if (oData.type === "cv-state") {
				this._applyRemoteState(oData.payload);
			} else if (oData.type === "cv-height") {
				// the dashboard reports its rendered content height; grow the iframe
				// to fit so the outer page (not the iframe) owns the scroll
				this._iDashContentHeight = oData.height || 0;
				this._setDashHeight();
			}
		},

		// The iframe is the source of truth for available options (profit centres,
		// parties, buckets, variants) since those depend on the fetched OData.
		_applyRemoteState: function (oPayload) {
			if (!oPayload) { return; }
			var oUiModel = this.getView().getModel("ui");
			this._bApplyingRemoteState = true;
			oUiModel.setProperty("/partyType", oPayload.partyType);
			oUiModel.setProperty("/bucketVariant", oPayload.bucketVariant);
			oUiModel.setProperty("/bucket", oPayload.bucket);
			oUiModel.setProperty("/date", oPayload.date);
			oUiModel.setProperty("/selectedPCs", oPayload.selectedPCs || []);
			oUiModel.setProperty("/selectedParties", oPayload.selectedParties || []);
			oUiModel.setProperty("/partyLabel", oPayload.partyLabel || "Customer");
			oUiModel.setProperty("/pcList", oPayload.pcList || []);
			oUiModel.setProperty("/partyList", oPayload.partyList || []);
			oUiModel.setProperty("/bucketList", oPayload.bucketList || []);
			if (oPayload.variantList && oPayload.variantList.length) {
				oUiModel.setProperty("/variantList", oPayload.variantList);
			}
			if (typeof oPayload.showAdvance === "boolean") {
				oUiModel.setProperty("/showAdvance", oPayload.showAdvance);
			}
			if (typeof oPayload.showNormal === "boolean") {
				oUiModel.setProperty("/showNormal", oPayload.showNormal);
			}
			// which variant is the user's saved default (drives the filled star)
			oUiModel.setProperty("/defaultVariant", oPayload.defaultVariant || "");
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

		onPartyTypeChange: function () {
			if (this._bApplyingRemoteState) { return; }
			// switching Customer/Vendor invalidates the current party selection
			this.getView().getModel("ui").setProperty("/selectedParties", []);
			this._postFilters();
		},

		onBucketVariantChange: function () {
			if (this._bApplyingRemoteState) { return; }
			this._postFilters();
		},

		// MultiComboBox fires selectionFinish only when the picker closes; catch a
		// chip removed via its "x" while the picker is already closed here too.
		onPCSelectionChange: function (oEvent) {
			if (this._bApplyingRemoteState) { return; }
			if (!oEvent.getSource().isOpen()) {
				this._postFilters();
			}
		},

		onPartySelectionChange: function (oEvent) {
			if (this._bApplyingRemoteState) { return; }
			if (!oEvent.getSource().isOpen()) {
				this._postFilters();
			}
		},

		// Advance / Normal checkboxes. Mirrors report ZFI_CUST_VEND_AGING_RPT:
		// at least one must stay checked, otherwise there is nothing to show.
		onScopeChange: function (oEvent) {
			if (this._bApplyingRemoteState) { return; }
			var oUiModel = this.getView().getModel("ui");
			if (!oUiModel.getProperty("/showAdvance") && !oUiModel.getProperty("/showNormal")) {
				// re-check the box the user just cleared and warn, like the report does
				oEvent.getSource().setSelected(true);
				MessageToast.show("Select at least one of Advance / Normal");
				return;
			}
			this._postFilters();
		},

		onResetFilters: function () {
			var oUiModel = this.getView().getModel("ui");
			var aVariants = oUiModel.getProperty("/variantList") || DEFAULT_VARIANT_LIST;
			oUiModel.setProperty("/partyType", "Debtors");
			oUiModel.setProperty("/selectedPCs", []);
			oUiModel.setProperty("/bucketVariant", (aVariants[0] || {}).key || "Debtors");
			oUiModel.setProperty("/bucket", "ALL");
			oUiModel.setProperty("/date", todayISO());
			oUiModel.setProperty("/selectedParties", []);
			oUiModel.setProperty("/showAdvance", true);
			oUiModel.setProperty("/showNormal", true);
			this._postFilters();
		},

		// Saves the selected bucket variant as this user's personal default
		// (zfi_cv_usr_pref via the SICF handler) - same endpoint the dashboard used.
		onSaveDefaultVariant: function () {
			var oUiModel = this.getView().getModel("ui");
			var sVariant = oUiModel.getProperty("/bucketVariant");
			if (!sVariant) { return; }
			fetch("/sap/bc/zcv_ageing_def?variant=" + encodeURIComponent(sVariant), {
				method: "POST",
				headers: { "X-CV-Request": "1" }
			}).then(function (res) {
				if (res.ok) {
					// reflect the new default immediately so the star fills for it
					oUiModel.setProperty("/defaultVariant", sVariant);
				}
				MessageToast.show(res.ok ?
					"Saved “" + sVariant + "” as your default variant" :
					"Could not save default (HTTP " + res.status + ")");
			}).catch(function (e) {
				MessageToast.show("Could not save default: " + (e.message || e));
			});
		}
	});
});
