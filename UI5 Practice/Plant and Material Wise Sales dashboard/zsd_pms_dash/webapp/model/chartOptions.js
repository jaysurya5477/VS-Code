sap.ui.define([
	"./formatter",
	"./chartTheme"
], function (formatter, chartTheme) {
	"use strict";

	/**
	 * ECharts option builders - one per panel.
	 *
	 * Ports of the reviewed HTML prototype (../../../Final Template/sales-dashboard-india_claude
	 * V8.html), which used Chart.js - this app uses ECharts instead (see chartTheme.js's own
	 * header and the GRN Dashboard's precedent, ../../GRN Dashboard/zmm_grn_dash). The palette
	 * is the prototype's own 8-colour categorical ramp plus pos/neg, read from --pms-* CSS
	 * tokens so every chart matches the card it sits in, in both light and dark.
	 *
	 * Every builder is a pure function of (rows, context) -> option object. `ctx` carries
	 * {echarts, pal, animate}. Keeping them pure means the controller can rebuild all charts
	 * on a theme change by simply calling them again with a new palette.
	 */

	function axis(pal, o) {
		var oBase = {
			axisLine: {
				lineStyle: {
					color: pal.line
				}
			},
			axisTick: {
				show: false
			},
			axisLabel: {
				color: pal.ink2,
				fontSize: 11
			},
			splitLine: {
				lineStyle: {
					color: pal.line2
				}
			}
		};
		var m = Object.assign({}, oBase, o || {});
		m.axisLabel = Object.assign({}, oBase.axisLabel, (o || {}).axisLabel || {});
		m.splitLine = Object.assign({}, oBase.splitLine, (o || {}).splitLine || {});
		return m;
	}

	function tooltipStyle(pal) {
		return {
			backgroundColor: pal.panel,
			borderColor: pal.line,
			textStyle: {
				color: pal.ink,
				fontFamily: pal.font,
				fontSize: 12
			},
			extraCssText: "border-radius:.5rem;box-shadow:0 .625rem 1.625rem rgba(0,0,0,.16)"
		};
	}

	function legend(pal, oExtra) {
		return Object.assign({
			textStyle: {
				color: pal.ink2,
				fontSize: 11
			},
			icon: "roundRect",
			itemWidth: 9,
			itemHeight: 9
		}, oExtra || {});
	}

	function baseOption(ctx) {
		var pal = ctx.pal;
		return {
			animation: ctx.animate !== false,
			animationDuration: 650,
			animationEasing: "cubicOut",
			textStyle: {
				fontFamily: pal.font
			},
			tooltip: tooltipStyle(pal)
		};
	}

	/**
	 * Axis-label formatter that abbreviates against the magnitude of the largest value, so
	 * a whole axis uses one unit instead of mixing Cr and L.
	 * @param {number} fMax largest value on the axis
	 * @returns {function(number): string} label formatter
	 */
	function scaledAxis(fMax) {
		var a = Math.abs(fMax || 0);
		var aUnit = a >= 1e7 ? [1e7, " Cr"] : a >= 1e5 ? [1e5, " L"] : a >= 1e3 ? [1e3, "k"] : [1, ""];
		return function (v) {
			return formatter.RUPEE + (v / aUnit[0]).toFixed(v % aUnit[0] === 0 ? 0 : 1) + aUnit[1];
		};
	}

	function num(v) {
		var n = parseFloat(v);
		return isFinite(n) ? n : 0;
	}

	/** Largest absolute value of one property across rows. */
	function maxOf(aRows, sProp) {
		return (aRows || []).reduce(function (m, r) {
			return Math.max(m, Math.abs(num(r[sProp])));
		}, 0);
	}

	var chartOptions = {

		/**
		 * Placeholder shown in a chart card when the selection returned no rows. Better
		 * than an empty canvas, which reads as a broken chart rather than "no data".
		 * @param {string} sText message
		 * @param {object} pal palette
		 * @returns {object} ECharts option
		 */
		empty: function (sText, pal) {
			return {
				title: {
					text: sText,
					left: "center",
					top: "middle",
					textStyle: {
						color: pal.ink3,
						fontFamily: pal.font,
						fontSize: 13,
						fontWeight: "normal"
					}
				}
			};
		},

		/**
		 * 12-period (FY Apr-Mar) net-value trend - bars with a smoothed net line, mirroring
		 * the KPI cards' own sparkline series at panel scale.
		 * @param {object[]} aRows Trend entity rows {Period, NetValue}
		 * @param {object} ctx {echarts, pal, animate}
		 * @returns {object} ECharts option
		 */
		trend: function (aRows, ctx) {
			var pal = ctx.pal;
			var echarts = ctx.echarts;
			var aNet = aRows.map(function (r) {
				return Math.round(num(r.NetValue));
			});
			var fMax = Math.max.apply(null, [1].concat(aNet.map(Math.abs)));

			return Object.assign({}, baseOption(ctx), {
				grid: {
					left: 66,
					right: 20,
					top: 24,
					bottom: 26
				},
				tooltip: Object.assign({
					trigger: "axis",
					axisPointer: {
						type: "cross",
						lineStyle: {
							color: pal.line
						}
					},
					// Wrapped, not passed by reference: ECharts calls valueFormatter with a
					// second argument, which money()'s optional decimals would swallow.
					valueFormatter: function (v) {
						return formatter.money(v);
					}
				}, tooltipStyle(pal)),
				xAxis: axis(pal, {
					type: "category",
					data: aRows.map(function (r) {
						return formatter.periodLabel(r.Period);
					})
				}),
				yAxis: axis(pal, {
					type: "value",
					axisLabel: {
						formatter: scaledAxis(fMax)
					}
				}),
				series: [{
					name: "Net value",
					type: "bar",
					barWidth: "52%",
					data: aNet,
					itemStyle: {
						color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{
							offset: 0,
							color: pal.accent
						}, {
							offset: 1,
							color: chartTheme.alpha(pal.accent, 0.35)
						}]),
						borderRadius: [3, 3, 0, 0]
					}
				}, {
					name: "Trend",
					type: "line",
					smooth: true,
					symbol: "circle",
					symbolSize: 6,
					data: aNet,
					lineStyle: {
						width: 2.2,
						color: pal.c6
					},
					itemStyle: {
						color: pal.c6,
						borderColor: pal.panel,
						borderWidth: 2
					}
				}]
			});
		},

		/**
		 * Sales by plant - stacked net + tax, top 20 ranked by net value. The Top-20 cap is
		 * applied server-side (ZCL_PMS_DASH_QUERY) since production has ~109 billing plants.
		 * @param {object[]} aRows Plant entity rows {Werks, City, NetValue, TaxValue, GrossValue}
		 * @param {object} ctx {pal, animate}
		 * @returns {object} ECharts option
		 */
		plant: function (aRows, ctx) {
			var pal = ctx.pal;
			var aData = aRows.slice().reverse();
			var fMax = maxOf(aData, "GrossValue");

			return Object.assign({}, baseOption(ctx), {
				grid: {
					left: 120,
					right: 30,
					top: 12,
					bottom: 22
				},
				tooltip: Object.assign({
					trigger: "axis",
					axisPointer: {
						type: "shadow"
					},
					formatter: function (aParams) {
						var r = aData[aParams[0].dataIndex] || {};
						return "<b>" + r.Werks + (r.City ? " " + formatter.MIDDOT + " " + r.City : "") + "</b><br/>" +
							"Net " + formatter.money(r.NetValue) + "<br/>" +
							"Tax " + formatter.money(r.TaxValue) + "<br/>" +
							"Gross " + formatter.money(r.GrossValue);
					}
				}, tooltipStyle(pal)),
				xAxis: axis(pal, {
					type: "value",
					axisLabel: {
						formatter: scaledAxis(fMax)
					}
				}),
				yAxis: axis(pal, {
					type: "category",
					data: aData.map(function (r) {
						return r.Werks + (r.City ? " " + r.City : "");
					}),
					splitLine: {
						show: false
					},
					axisLabel: {
						color: pal.ink2,
						fontSize: 10.5
					}
				}),
				series: [{
					name: "Net",
					type: "bar",
					stack: "s",
					barWidth: "60%",
					data: aData.map(function (r) {
						return Math.round(num(r.NetValue));
					}),
					itemStyle: {
						color: pal.accent,
						borderRadius: [0, 0, 0, 0]
					}
				}, {
					name: "Tax",
					type: "bar",
					stack: "s",
					data: aData.map(function (r) {
						return Math.round(num(r.TaxValue));
					}),
					itemStyle: {
						color: pal.c6,
						borderRadius: [0, 4, 4, 0]
					}
				}]
			});
		},

		/**
		 * Sales by material - top 20 ranked by net material value.
		 * @param {object[]} aRows Material entity rows
		 * @param {object} ctx {pal, animate}
		 * @returns {object} ECharts option
		 */
		material: function (aRows, ctx) {
			var pal = ctx.pal;
			var aData = aRows.slice().reverse();
			var fMax = maxOf(aData, "MatValue");

			return Object.assign({}, baseOption(ctx), {
				grid: {
					left: 190,
					right: 30,
					top: 12,
					bottom: 22
				},
				tooltip: Object.assign({
					trigger: "axis",
					axisPointer: {
						type: "shadow"
					},
					formatter: function (aParams) {
						var r = aData[aParams[0].dataIndex] || {};
						return "<b>" + r.Matnr + "</b><br/>" + (r.Arktx || "") + "<br/>" +
							formatter.money(r.MatValue) + " " + formatter.MIDDOT + " " +
							formatter.count(r.Qty) + " " + (r.Uom || "") + "<br/>" +
							"IGST " + formatter.money(r.Igst) + " " + formatter.MIDDOT +
							" SGST " + formatter.money(r.Sgst) + " " + formatter.MIDDOT +
							" CGST " + formatter.money(r.Cgst) + " " + formatter.MIDDOT +
							" TCS " + formatter.money(r.Tcs) + "<br/>" +
							"Grand total " + formatter.money(r.GrandTotalValue);
					}
				}, tooltipStyle(pal)),
				xAxis: axis(pal, {
					type: "value",
					axisLabel: {
						formatter: scaledAxis(fMax)
					}
				}),
				yAxis: axis(pal, {
					type: "category",
					data: aData.map(function (r) {
						return r.Matnr + (r.Arktx ? " " + r.Arktx : "");
					}),
					splitLine: {
						show: false
					},
					axisLabel: {
						color: pal.ink2,
						fontSize: 10,
						width: 170,
						overflow: "truncate"
					}
				}),
				series: [{
					type: "bar",
					barWidth: "60%",
					data: aData.map(function (r) {
						return Math.round(num(r.MatValue));
					}),
					itemStyle: {
						color: pal.c3,
						borderRadius: [0, 4, 4, 0]
					}
				}]
			});
		}
	};

	return chartOptions;
});
