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

				// The renderer below declares an empty <div> - the canvas is injected
				// imperatively by echarts.init() afterwards, outside the declared render
				// output. apiVersion 2 controls can be rerendered by patching the existing
				// DOM node in place (e.g. a sibling property change invalidating an
				// ancestor), which reuses this exact node but strips any children/attributes
				// not part of that declared output - silently orphaning the canvas without
				// ever replacing the node itself. getDom() still matches oDom in that case,
				// so node-identity alone cannot detect it: always dispose and reinit here,
				// since onAfterRendering only fires on an actual render/patch cycle anyway
				// (data-only updates go through _apply(), not rendering).
				if (that._oChart) {
					that._oChart.dispose();
					that._oChart = null;
				}
				that._oChart = echarts.init(oDom, null, {
					renderer: "canvas"
				});
				that._oChart.on("click", function (oParams) {
					that.fireDataPointSelected({
						data: oParams
					});
				});
				that._apply();
			}).catch(function (oError) {
				Log.error("EChart: " + oError.message, null, "com.sap.zmmgrndash.control.EChart");
			});
		},

		/**
		 * Pushes the current option onto the instance. No-op until both the instance and
		 * an option exist, so the order of setOption()/rendering does not matter.
		 *
		 * Deferred to the next animation frame rather than applied synchronously. ECharts
		 * only re-measures its container on an explicit resize() - not on every setOption()
		 * - and calling that resize() in the same tick as whatever DOM write triggered this
		 * update (e.g. a sibling control patching its own attributes, or the surrounding
		 * grid recalculating column widths) can read a size the browser has not finished
		 * laying out yet. The chart then renders against that stale/zero geometry and stays
		 * blank until something else - a real window resize - forces a fresh measurement.
		 * rAF runs after the browser has committed layout for the current tick, so the
		 * measurement is always fresh. A rebuild while an earlier one is still pending
		 * simply reschedules on the latest option - see setOption().
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
