sap.ui.define([
	"sap/ui/core/Control",
	"sap/ui/core/ResizeHandler",
	"sap/base/Log",
	"../model/echartsLoader"
], function (Control, ResizeHandler, Log, echartsLoader) {
	"use strict";

	/**
	 * Thin UI5 control around one Apache ECharts instance.
	 *
	 * Renders a sized <div>, lazily loads the vendored ECharts bundle, and keeps the
	 * instance in step with the control lifecycle (resize, rerender, destroy). The chart
	 * configuration itself is not modelled as UI5 aggregations — the whole `option` object
	 * is handed over as-is, built by model/chartOptions.js. That keeps the ECharts API
	 * surface in one place and means the option objects can be ported from the reviewed
	 * HTML prototype nearly verbatim.
	 *
	 * `option` is applied imperatively and never triggers a rerender, so a filter refresh
	 * animates the existing canvas instead of tearing down the DOM.
	 */
	return Control.extend("com.sap.zmmgrndash.control.EChart", {

		metadata: {
			library: "com.sap.zmmgrndash",
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
				oRm.class("grnEChart");
				oRm.style("width", "100%");
				oRm.style("height", oControl.getHeight());
				oRm.openEnd();
				oRm.close("div");
			}
		},

		init: function () {
			this._oChart = null;
			this._sResizeId = null;
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

				// A rerender replaces the DOM node, orphaning the previous canvas.
				if (that._oChart && that._oChart.getDom() !== oDom) {
					that._oChart.dispose();
					that._oChart = null;
				}
				if (!that._oChart) {
					that._oChart = echarts.init(oDom, null, {
						renderer: "canvas"
					});
					that._oChart.on("click", function (oParams) {
						that.fireDataPointSelected({
							data: oParams
						});
					});
				}
				that._apply();
			}).catch(function (oError) {
				Log.error("EChart: " + oError.message, null, "com.sap.zmmgrndash.control.EChart");
			});
		},

		/**
		 * Pushes the current option onto the instance. No-op until both the instance and
		 * an option exist, so the order of setOption()/rendering does not matter.
		 * @private
		 */
		_apply: function () {
			var oOption = this.getOption();
			if (this._oChart && oOption) {
				// notMerge=true: option objects are always complete, and merging would
				// leave stale series behind when a chart's series count changes.
				this._oChart.setOption(oOption, true);
				this._oChart.resize();
			}
		},

		exit: function () {
			if (this._sResizeId) {
				ResizeHandler.deregister(this._sResizeId);
				this._sResizeId = null;
			}
			if (this._oChart) {
				this._oChart.dispose();
				this._oChart = null;
			}
		}
	});
});
