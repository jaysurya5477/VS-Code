sap.ui.define([
	"sap/ui/core/Control",
	"sap/ui/core/ResizeHandler",
	"sap/base/Log",
	"../model/echartsLoader"
], function (Control, ResizeHandler, Log, echartsLoader) {
	"use strict";

	/**
	 * Thin UI5 control around one Apache ECharts instance. Ported from the GRN Dashboard's
	 * EChart.js (../../GRN Dashboard/zmm_grn_dash) - unchanged apart from the namespace.
	 *
	 * Renders a sized <div>, lazily loads the vendored ECharts bundle, and keeps the
	 * instance in step with the control lifecycle (resize, rerender, destroy). The chart
	 * configuration itself is not modelled as UI5 aggregations - the whole `option` object
	 * is handed over as-is, built by model/chartOptions.js.
	 *
	 * `option` is applied imperatively and never triggers a rerender, so a filter refresh
	 * animates the existing chart instead of tearing down the DOM.
	 */
	return Control.extend("com.sap.zsdpmsdash.control.EChart", {

		metadata: {
			library: "com.sap.zsdpmsdash",
			properties: {
				/** The full ECharts option object. Replaced wholesale on every update. */
				option: {
					type: "object",
					defaultValue: null
				},
				/** Height of the chart container. ECharts has no intrinsic height. */
				height: {
					type: "sap.ui.core.CSSSize",
					defaultValue: "20rem"
				}
			},
			events: {
				/** Fired when a data point is clicked. Carries the raw ECharts params. */
				dataPointSelected: {
					parameters: {
						/** the ECharts click event params */
						data: {
							type: "object"
						}
					}
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				oRm.openStart("div", oControl);
				oRm.class("pmsEChart");
				oRm.style("width", "100%");
				oRm.style("height", oControl.getHeight());
				oRm.openEnd();
				oRm.close("div");
			}
		},

		init: function () {
			this._oChart = null;
			this._sResizeId = null;
			this._iApplyFrame = null;
		},

		/**
		 * Applies a new option object without invalidating the control.
		 * @param {object} oOption ECharts option
		 * @returns {this} this, for chaining
		 */
		setOption: function (oOption) {
			this.setProperty("option", oOption, true);
			this._apply();
			return this;
		},

		onAfterRendering: function () {
			var that = this;

			if (!this._sResizeId) {
				this._sResizeId = ResizeHandler.register(this, function () {
					if (that._oChart) {
						that._oChart.resize();
					}
				});
			}

			echartsLoader.load().then(function (echarts) {
				var oDom = that.getDomRef();
				if (!oDom || that.bIsDestroyed) {
					return;
				}

				// See the GRN original's own comment: always dispose and reinit here rather
				// than trust node identity, since an apiVersion-2 patch-in-place rerender can
				// silently orphan the imperatively-injected chart root without replacing oDom.
				if (that._oChart) {
					that._oChart.dispose();
					that._oChart = null;
				}
				that._oChart = echarts.init(oDom, null, {
					renderer: "svg"
				});
				that._oChart.on("click", function (oParams) {
					that.fireDataPointSelected({
						data: oParams
					});
				});
				that._apply();
			}).catch(function (oError) {
				Log.error("EChart: " + oError.message, null, "com.sap.zsdpmsdash.control.EChart");
			});
		},

		/**
		 * Pushes the current option onto the instance. No-op until both the instance and
		 * an option exist, so the order of setOption()/rendering does not matter.
		 *
		 * Deferred to the next animation frame - see the GRN original's own comment on why
		 * a same-tick resize() can measure a not-yet-laid-out container.
		 * @private
		 */
		_apply: function () {
			var oOption = this.getOption();
			var that = this;
			if (!this._oChart || !oOption) {
				return;
			}
			if (this._iApplyFrame) {
				window.cancelAnimationFrame(this._iApplyFrame);
			}
			this._iApplyFrame = window.requestAnimationFrame(function () {
				that._iApplyFrame = null;
				if (!that._oChart || that._oChart.isDisposed()) {
					return;
				}
				// notMerge=true: option objects are always complete, and merging would
				// leave stale series behind when a chart's series count changes.
				that._oChart.setOption(oOption, true);
				that._oChart.resize();
			});
		},

		exit: function () {
			if (this._sResizeId) {
				ResizeHandler.deregister(this._sResizeId);
				this._sResizeId = null;
			}
			if (this._iApplyFrame) {
				window.cancelAnimationFrame(this._iApplyFrame);
				this._iApplyFrame = null;
			}
			if (this._oChart) {
				this._oChart.dispose();
				this._oChart = null;
			}
		}
	});
});
