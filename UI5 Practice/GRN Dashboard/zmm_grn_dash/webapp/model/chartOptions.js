sap.ui.define([
	"./formatter",
	"./chartTheme"
], function (formatter, chartTheme) {
	"use strict";

	/**
	 * ECharts option builders — one per visual in the FS.
	 *
	 * These are ports of the reviewed HTML prototype (`../../../GRN Dashboard v2.dc.html`).
	 * The one deliberate change is the data source: rows come from the OData V4 entities
	 * rather than the prototype's seeded RNG. The palette is the prototype's own, read from
	 * the --grn-* CSS tokens (see chartTheme.js), so each chart matches the card it sits in
	 * in both light and dark.
	 *
	 * Every builder is a pure function of (rows, context) -> option object. `ctx` carries
	 * `{echarts, pal, mode, animate, width}`. Keeping them pure means the controller can
	 * rebuild all charts on a theme change by simply calling them again with a new palette.
	 */

	var TARGET_REJECTION_PCT = 2.0; // FS section 7: rejection-rate target ceiling.

	/**
	 * @param {object} pal palette from chartTheme
	 * @param {object} o axis overrides
	 * @returns {object} an axis config with the shared styling applied
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
	 * Axis-label formatter that abbreviates against the magnitude of the largest value,
	 * so a whole axis uses one unit instead of mixing Cr and L.
	 * @param {number} fMax largest value on the axis
	 * @param {boolean} bQty true for quantities (no currency prefix)
	 * @returns {function(number): string} label formatter
	 */
	function scaledAxis(fMax, bQty) {
		var a = Math.abs(fMax || 0);
		var aUnit = a >= 1e7 ? [1e7, " Cr"] : a >= 1e5 ? [1e5, " L"] : a >= 1e3 ? [1e3, "k"] : [1, ""];
		return function (v) {
			return (bQty ? "" : formatter.RUPEE) + (v / aUnit[0]).toFixed(v % aUnit[0] === 0 ? 0 : 1) + aUnit[1];
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

		TARGET_REJECTION_PCT: TARGET_REJECTION_PCT,

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
		 * Receipt flow over time — stacked 101/102 bars, a separate Z22 rework bar, and a
		 * net line. Quantity or value depending on ctx.mode.
		 *
		 * 102 arrives already signed negative from the backend (FS: "102 posted
		 * negative"), so stacking it with 101 renders it hanging below the axis, which is
		 * exactly the prototype's reversal treatment — do not Math.abs() it.
		 *
		 * @param {object[]} aRows Trend entity rows
		 * @param {object} ctx {echarts, pal, mode, animate}
		 * @returns {object} ECharts option
		 */
		trend: function (aRows, ctx) {
			var pal = ctx.pal;
			var bQty = (ctx.mode || "qty") === "qty";
			var echarts = ctx.echarts;

			var a101 = aRows.map(function (r) {
				return Math.round(num(bQty ? r.Qty101 : r.Val101));
			});
			var a102 = aRows.map(function (r) {
				return Math.round(num(bQty ? r.Qty102 : r.Val102));
			});
			var aZ22 = aRows.map(function (r) {
				return Math.round(num(bQty ? r.QtyZ22 : r.ValZ22));
			});
			var aNet = aRows.map(function (r) {
				return Math.round(num(bQty ? r.NetQty : r.NetVal));
			});

			var fnValue = bQty ? formatter.compact : formatter.money;
			var fMax = Math.max.apply(null, [1].concat(a101.map(Math.abs)));

			var fnGradient = function (sColor) {
				return new echarts.graphic.LinearGradient(0, 0, 0, 1, [{
					offset: 0,
					color: sColor
				}, {
					offset: 1,
					color: chartTheme.alpha(sColor, 0.4)
				}]);
			};

			return Object.assign({}, baseOption(ctx), {
				grid: {
					left: 72,
					right: 28,
					top: 46,
					bottom: 26
				},
				legend: legend(pal, {
					data: ["101 Receipt", "102 Reversal", "Z22 Rework", "Net trend"],
					top: 4,
					left: 0
				}),
				tooltip: Object.assign({
					trigger: "axis",
					axisPointer: {
						type: "cross",
						lineStyle: {
							color: pal.line
						}
					},
					valueFormatter: fnValue
				}, tooltipStyle(pal)),
				xAxis: axis(pal, {
					type: "category",
					data: aRows.map(function (r) {
						return formatter.periodLabel(r.Period);
					})
				}),
				yAxis: axis(pal, {
					type: "value",
					name: bQty ? "Qty (base UoM)" : "Value (" + formatter.RUPEE + ")",
					nameGap: 14,
					nameTextStyle: {
						color: pal.ink3,
						fontSize: 10,
						align: "right"
					},
					axisLabel: {
						formatter: scaledAxis(fMax, bQty)
					}
				}),
				series: [{
					name: "101 Receipt",
					type: "bar",
					stack: "q",
					data: a101,
					barWidth: "46%",
					itemStyle: {
						color: fnGradient(pal.accent),
						borderRadius: [3, 3, 0, 0]
					}
				}, {
					name: "102 Reversal",
					type: "bar",
					stack: "q",
					data: a102,
					itemStyle: {
						color: pal.neg,
						borderRadius: [0, 0, 3, 3]
					}
				}, {
					name: "Z22 Rework",
					type: "bar",
					stack: "r",
					data: aZ22,
					barWidth: "18%",
					itemStyle: {
						color: pal.alt,
						borderRadius: [3, 3, 0, 0]
					}
				}, {
					name: "Net trend",
					type: "line",
					smooth: true,
					symbol: "circle",
					symbolSize: 6,
					data: aNet,
					lineStyle: {
						width: 2.4,
						color: pal.warn
					},
					itemStyle: {
						color: pal.warn,
						borderColor: pal.panel,
						borderWidth: 2
					}
				}]
			});
		},

		/**
		 * Quality disposition — a donut of the four backend buckets with the rejection
		 * rate as a gauge in the hole.
		 *
		 * The bucket texts are produced by ZCL_GRN_DASH_QUERY (Accepted / Rejected /
		 * Sample / Rework GRN Qty), so colours are keyed off those exact strings with a
		 * neutral fallback if the backend ever adds a fifth bucket.
		 *
		 * @param {object[]} aRows Quality entity rows
		 * @param {number} fRejectionPct rejection rate from the Ratio entity (REJ_RATE)
		 * @param {object} ctx {pal, animate}
		 * @returns {object} ECharts option
		 */
		quality: function (aRows, fRejectionPct, ctx) {
			var pal = ctx.pal;
			var mColor = {
				"Accepted": pal.accent,
				"Rejected": pal.neg,
				"Sample": pal.alt,
				"Rework GRN Qty": pal.warn
			};
			var fRej = num(fRejectionPct);

			return Object.assign({}, baseOption(ctx), {
				tooltip: Object.assign({
					trigger: "item",
					valueFormatter: function (v) {
						return formatter.compact(v) + " (base UoM)";
					}
				}, tooltipStyle(pal)),
				legend: legend(pal, {
					bottom: 0,
					icon: "circle",
					itemWidth: 8,
					itemHeight: 8,
					itemGap: 14
				}),
				series: [{
					type: "pie",
					radius: ["58%", "80%"],
					center: ["50%", "44%"],
					padAngle: 2,
					itemStyle: {
						borderRadius: 6,
						borderColor: pal.panel,
						borderWidth: 2
					},
					label: {
						show: false
					},
					emphasis: {
						scale: true,
						scaleSize: 6
					},
					data: aRows.map(function (r) {
						return {
							name: r.Bucket,
							value: Math.round(num(r.Qty)),
							itemStyle: {
								color: mColor[r.Bucket] || pal.accent2
							}
						};
					})
				}, {
					// Gauge shares the donut's centre so the headline rate sits in the hole.
					type: "gauge",
					startAngle: 210,
					endAngle: -30,
					min: 0,
					max: Math.max(8, Math.ceil(fRej)),
					radius: "53%",
					center: ["50%", "44%"],
					progress: {
						show: true,
						width: 4,
						itemStyle: {
							color: fRej > TARGET_REJECTION_PCT ? pal.neg : pal.pos
						}
					},
					axisLine: {
						lineStyle: {
							width: 4,
							color: [
								[1, pal.line2]
							]
						}
					},
					axisTick: {
						show: false
					},
					splitLine: {
						show: false
					},
					axisLabel: {
						show: false
					},
					pointer: {
						show: false
					},
					detail: {
						valueAnimation: ctx.animate !== false,
						offset: [0, -6],
						formatter: function (v) {
							return v.toFixed(2) + "%";
						},
						color: pal.ink,
						fontSize: 23,
						fontFamily: pal.font,
						fontWeight: 600
					},
					title: {
						offset: [0, 20],
						color: pal.ink3,
						fontSize: 10,
						fontFamily: pal.font
					},
					data: [{
						value: fRej,
						name: "REJECTION RATE"
					}]
				}]
			});
		},

		/**
		 * Top vendors by GRN value — horizontal value bars with the rejection rate as a
		 * scatter series on a secondary top axis.
		 *
		 * Rows arrive value-descending from the service; ECharts fills a category axis
		 * bottom-up, so they are reversed to put the biggest vendor at the top.
		 *
		 * @param {object[]} aRows VendorTop10 entity rows
		 * @param {object} ctx {echarts, pal, animate}
		 * @returns {object} ECharts option
		 */
		vendorTop10: function (aRows, ctx) {
			var pal = ctx.pal;
			var echarts = ctx.echarts;
			var aData = aRows.slice().reverse();

			return Object.assign({}, baseOption(ctx), {
				grid: {
					left: 148,
					right: 64,
					top: 46,
					bottom: 52
				},
				legend: legend(pal, {
					data: ["GRN Value", "Rejection %"],
					bottom: 0,
					left: "center"
				}),
				tooltip: Object.assign({
					trigger: "axis",
					axisPointer: {
						type: "shadow"
					},
					formatter: function (aParams) {
						var oRow = aData[aParams[0].dataIndex] || {};
						return "<b>" + (oRow.VendorName || oRow.Vendor || "") + "</b>" +
							"<br/>Vendor <b>" + (oRow.Vendor || formatter.NO_VALUE) + "</b>" +
							"<br/>GRN value <b>" + formatter.money(oRow.Value) + "</b>" +
							"<br/>GRN qty <b>" + formatter.compact(oRow.Qty) + "</b>" +
							"<br/>Net qty <b>" + formatter.compact(oRow.NetQty) + "</b>" +
							"<br/>Rejection <b>" + formatter.percent(oRow.RejPct) + "</b>" +
							"<br/>Rework <b>" + formatter.percent(oRow.ReworkPct, 1) + "</b>" +
							"<br/>Score <b>" + formatter.count(oRow.Score) + "</b>";
					}
				}, tooltipStyle(pal)),
				xAxis: [
					axis(pal, {
						type: "value",
						splitNumber: 2,
						axisLabel: {
							hideOverlap: true,
							formatter: scaledAxis(maxOf(aData, "Value"), false)
						}
					}),
					axis(pal, {
						type: "value",
						position: "top",
						min: 0,
						splitNumber: 3,
						name: "Rejection %",
						nameLocation: "end",
						nameGap: 6,
						nameTextStyle: {
							color: pal.neg,
							fontSize: 10
						},
						splitLine: {
							show: false
						},
						axisLine: {
							show: false
						},
						axisLabel: {
							color: pal.neg,
							hideOverlap: true,
							formatter: function (v) {
								return v + "%";
							}
						}
					})
				],
				yAxis: axis(pal, {
					type: "category",
					data: aData.map(function (r) {
						return r.VendorName || r.Vendor;
					}),
					splitLine: {
						show: false
					},
					axisLabel: {
						color: pal.ink2,
						fontSize: 11.5,
						width: 138,
						overflow: "truncate"
					}
				}),
				series: [{
					name: "GRN Value",
					type: "bar",
					barWidth: "52%",
					// The vendor code rides along on each data item so the click handler
					// can read params.data.vendor instead of reversing the index back.
					data: aData.map(function (r) {
						return {
							value: Math.round(num(r.Value)),
							vendor: r.Vendor
						};
					}),
					itemStyle: {
						color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [{
							offset: 0,
							color: pal.accent
						}, {
							offset: 1,
							color: chartTheme.alpha(pal.accent, 0.33)
						}]),
						borderRadius: [0, 4, 4, 0]
					}
				}, {
					name: "Rejection %",
					type: "scatter",
					xAxisIndex: 1,
					symbolSize: 9,
					data: aData.map(function (r) {
						return num(r.RejPct);
					}),
					itemStyle: {
						color: pal.neg
					}
				}]
			});
		},

		/**
		 * Quality composition per plant — 100% stacked horizontal bars.
		 *
		 * Note this chart has four dispositions including "Under inspection", which the
		 * Quality donut does not: the PlantTop10 entity carries InspectPct, while the
		 * Quality entity's four buckets substitute Rework for it. That asymmetry is in the
		 * backend contract, not a bug here.
		 *
		 * @param {object[]} aRows PlantTop10 entity rows
		 * @param {object} ctx {pal, animate}
		 * @returns {object} ECharts option
		 */
		plantTop10: function (aRows, ctx) {
			var pal = ctx.pal;
			var aData = aRows.slice().reverse();
			var aSeries = [{
				name: "Accepted",
				prop: "AcceptedPct",
				color: pal.accent
			}, {
				name: "Rejected",
				prop: "RejectedPct",
				color: pal.neg
			}, {
				name: "Sample",
				prop: "SamplePct",
				color: pal.alt
			}, {
				name: "Under inspection",
				prop: "InspectPct",
				color: pal.warn
			}];

			return Object.assign({}, baseOption(ctx), {
				grid: {
					left: 104,
					right: 22,
					top: 34,
					bottom: 26
				},
				legend: legend(pal, {
					data: aSeries.map(function (s) {
						return s.name;
					}),
					top: 0,
					right: 0
				}),
				tooltip: Object.assign({
					trigger: "axis",
					axisPointer: {
						type: "shadow"
					},
					valueFormatter: function (v) {
						return num(v).toFixed(2) + "%";
					}
				}, tooltipStyle(pal)),
				xAxis: axis(pal, {
					type: "value",
					max: 100,
					axisLabel: {
						formatter: function (v) {
							return v + "%";
						}
					}
				}),
				yAxis: axis(pal, {
					type: "category",
					data: aData.map(function (r) {
						return r.Plant;
					}),
					splitLine: {
						show: false
					},
					axisLabel: {
						color: pal.ink2,
						fontSize: 11
					}
				}),
				series: aSeries.map(function (s, i) {
					return {
						name: s.name,
						type: "bar",
						stack: "s",
						barWidth: "58%",
						data: aData.map(function (r) {
							return +num(r[s.prop]).toFixed(2);
						}),
						itemStyle: {
							color: s.color,
							borderRadius: i === 0 ? [4, 0, 0, 4] : i === aSeries.length - 1 ? [0, 4, 4, 0] : 0
						},
						// Only the dominant (Accepted) segment is wide enough to label.
						label: i === 0 ? {
							show: true,
							position: "insideLeft",
							color: "#ffffff",
							fontSize: 9.5,
							formatter: function (o) {
								return num(o.value).toFixed(1) + "%";
							}
						} : {
							show: false
						}
					};
				})
			});
		},

		/**
		 * Top 20 materials by GRN value — pie with labels led out to both sides.
		 * @param {object[]} aRows MaterialTop20 entity rows
		 * @param {object} ctx {pal, animate}
		 * @returns {object} ECharts option
		 */
		materialTop20: function (aRows, ctx) {
			var pal = ctx.pal;
			var aWheel = [pal.accent, pal.pos, pal.alt, pal.warn, pal.accent2];

			return Object.assign({}, baseOption(ctx), {
				tooltip: Object.assign({
					trigger: "item",
					formatter: function (o) {
						var oRow = aRows[o.dataIndex] || {};
						return "<b>" + o.name + "</b><br/>" + (oRow.Material || "") +
							"<br/>" + formatter.money(o.value) + " " + formatter.MIDDOT + " " + o.percent + "%";
					}
				}, tooltipStyle(pal)),
				legend: {
					show: false
				},
				series: [{
					type: "pie",
					radius: "52%",
					center: ["50%", "48%"],
					minAngle: 2,
					avoidLabelOverlap: true,
					itemStyle: {
						borderColor: pal.panel,
						borderWidth: 1.5
					},
					label: {
						show: true,
						alignTo: "edge",
						edgeDistance: 6,
						color: pal.ink2,
						fontSize: 10,
						lineHeight: 12,
						formatter: function (o) {
							return "{n|" + o.name + "}\n{v|" + formatter.money(o.value) + " " + formatter.MIDDOT + " " + o.percent.toFixed(2) + "%}";
						},
						rich: {
							n: {
								color: pal.ink,
								fontSize: 10,
								fontWeight: "bold",
								lineHeight: 12
							},
							v: {
								color: pal.ink3,
								fontSize: 9,
								lineHeight: 12
							}
						}
					},
					labelLine: {
						length: 14,
						length2: 14,
						maxSurfaceAngle: 80,
						lineStyle: {
							color: pal.line
						}
					},
					labelLayout: function () {
						return {
							hideOverlap: true
						};
					},
					emphasis: {
						scale: true,
						scaleSize: 6
					},
					data: aRows.map(function (r, i) {
						return {
							name: r.MaterialName || r.Material,
							value: Math.round(num(r.Value)),
							itemStyle: {
								color: aWheel[i % aWheel.length],
								opacity: 1 - Math.floor(i / aWheel.length) * 0.14
							}
						};
					})
				}]
			});
		},

		/**
		 * GRN value by PO document type — all types ranked high to low, bar colour ramped
		 * light-to-dark by value, with a data-zoom slider for the tail.
		 *
		 * Unlike the other nine result sets this one is not capped at source (there can be
		 * dozens of Z* doc types), so the slider is what keeps it readable. The initial
		 * window is sized from the container width when the caller supplies ctx.width.
		 *
		 * @param {object[]} aRows DoctypeRanked entity rows
		 * @param {object} ctx {pal, animate, width}
		 * @returns {object} ECharts option
		 */
		doctypeRanked: function (aRows, ctx) {
			var pal = ctx.pal;
			var fTotal = aRows.reduce(function (a, r) {
				return a + num(r.Value);
			}, 0) || 1;
			var fMax = aRows.length ? num(aRows[0].Value) : 1;
			var fMin = aRows.length ? num(aRows[aRows.length - 1].Value) : 0;
			var fSpan = Math.max(1, fMax - fMin);

			var sLight = chartTheme.mix(pal.accent, "#ffffff", 0.78);
			var sDeep = chartTheme.mix(pal.accent, "#000000", 0.42);

			// ~26px per bar keeps the rotated code labels legible.
			var iVisible = Math.max(12, Math.min(aRows.length, Math.floor((ctx.width || 900) / 26)));
			var bZoom = iVisible < aRows.length;

			return Object.assign({}, baseOption(ctx), {
				grid: {
					left: 70,
					right: 22,
					top: 16,
					bottom: bZoom ? 70 : 52
				},
				tooltip: Object.assign({
					trigger: "axis",
					axisPointer: {
						type: "shadow"
					},
					formatter: function (aParams) {
						var i = aParams[0].dataIndex;
						var oRow = aRows[i] || {};
						return "<b>" + (oRow.DocType || "") + " " + formatter.MIDDOT + " " + (oRow.DocTypeName || "") + "</b>" +
							"<br/>" + formatter.money(oRow.Value) +
							" " + formatter.MIDDOT + " " + (num(oRow.Value) / fTotal * 100).toFixed(2) + "% of value" +
							"<br/>Rank " + (i + 1) + " of " + aRows.length;
					}
				}, tooltipStyle(pal)),
				xAxis: axis(pal, {
					type: "category",
					data: aRows.map(function (r) {
						return r.DocType;
					}),
					axisLabel: {
						interval: 0,
						rotate: 52,
						margin: 8,
						fontSize: 9.5,
						hideOverlap: true
					}
				}),
				yAxis: axis(pal, {
					type: "value",
					splitNumber: 4,
					axisLabel: {
						hideOverlap: true,
						formatter: scaledAxis(fMax, false)
					}
				}),
				dataZoom: bZoom ? [{
					type: "inside",
					startValue: 0,
					endValue: iVisible - 1,
					zoomOnMouseWheel: true,
					moveOnMouseMove: true
				}, {
					type: "slider",
					height: 14,
					bottom: 8,
					startValue: 0,
					endValue: iVisible - 1,
					borderColor: pal.line,
					backgroundColor: pal.line2,
					fillerColor: chartTheme.alpha(pal.accent, 0.15),
					handleStyle: {
						color: pal.accent,
						borderColor: pal.accent
					},
					moveHandleSize: 4,
					dataBackground: {
						lineStyle: {
							color: pal.line
						},
						areaStyle: {
							color: pal.line2
						}
					},
					selectedDataBackground: {
						lineStyle: {
							color: pal.accent
						},
						areaStyle: {
							color: chartTheme.alpha(pal.accent, 0.2)
						}
					},
					textStyle: {
						color: pal.ink3,
						fontSize: 9.5
					}
				}] : [],
				series: [{
					type: "bar",
					barMaxWidth: 34,
					barCategoryGap: "22%",
					data: aRows.map(function (r) {
						return {
							value: Math.round(num(r.Value)),
							itemStyle: {
								color: chartTheme.mix(sLight, sDeep, (num(r.Value) - fMin) / fSpan),
								borderRadius: [3, 3, 0, 0]
							}
						};
					})
				}]
			});
		},

		/**
		 * Materials with the highest rejection rate — rejected quantity as bars, rate as a
		 * scatter on a secondary axis, against the 2% target as a dashed mark line.
		 * @param {object[]} aRows MaterialRejWorst10 entity rows
		 * @param {object} ctx {echarts, pal, animate}
		 * @returns {object} ECharts option
		 */
		materialRejWorst10: function (aRows, ctx) {
			var pal = ctx.pal;
			var echarts = ctx.echarts;
			var aData = aRows.slice().reverse();

			return Object.assign({}, baseOption(ctx), {
				grid: {
					left: 152,
					right: 70,
					top: 20,
					bottom: 44
				},
				legend: legend(pal, {
					data: ["Rejected qty", "Rejection %"],
					bottom: 0,
					left: "center"
				}),
				tooltip: Object.assign({
					trigger: "axis",
					axisPointer: {
						type: "shadow"
					},
					formatter: function (aParams) {
						var oRow = aData[aParams[0].dataIndex] || {};
						return "<b>" + (oRow.MaterialName || oRow.Material || "") + "</b>" +
							"<br/>Material <b>" + (oRow.Material || formatter.NO_VALUE) + "</b>" +
							"<br/>Rejected <b>" + formatter.compact(oRow.RejQty) + "</b>" +
							"<br/>Rate <b>" + formatter.percent(oRow.RejPct) + "</b>" +
							"<br/>Target <b>" + TARGET_REJECTION_PCT.toFixed(1) + "%</b>";
					}
				}, tooltipStyle(pal)),
				xAxis: [
					axis(pal, {
						type: "value",
						splitNumber: 3,
						axisLabel: {
							hideOverlap: true,
							formatter: scaledAxis(maxOf(aData, "RejQty"), true)
						}
					}),
					axis(pal, {
						type: "value",
						position: "top",
						min: 0,
						splitNumber: 3,
						splitLine: {
							show: false
						},
						axisLine: {
							show: false
						},
						axisLabel: {
							color: pal.neg,
							hideOverlap: true,
							formatter: function (v) {
								return v + "%";
							}
						}
					})
				],
				yAxis: axis(pal, {
					type: "category",
					data: aData.map(function (r) {
						return r.MaterialName || r.Material;
					}),
					splitLine: {
						show: false
					},
					axisLabel: {
						color: pal.ink2,
						fontSize: 11,
						width: 142,
						overflow: "truncate"
					}
				}),
				series: [{
					name: "Rejected qty",
					type: "bar",
					barWidth: "56%",
					data: aData.map(function (r) {
						return Math.round(num(r.RejQty));
					}),
					itemStyle: {
						color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [{
							offset: 0,
							color: pal.warn
						}, {
							offset: 1,
							color: chartTheme.alpha(pal.warn, 0.33)
						}]),
						borderRadius: [0, 4, 4, 0]
					}
				}, {
					name: "Rejection %",
					type: "scatter",
					xAxisIndex: 1,
					symbolSize: 9,
					data: aData.map(function (r) {
						return num(r.RejPct);
					}),
					itemStyle: {
						color: pal.neg
					},
					markLine: {
						silent: true,
						symbol: "none",
						lineStyle: {
							color: pal.ink3,
							type: "dashed",
							width: 1
						},
						label: {
							show: true,
							position: "insideEndTop",
							distance: 4,
							formatter: "target " + TARGET_REJECTION_PCT.toFixed(1) + "%",
							color: pal.ink3,
							fontSize: 9
						},
						data: [{
							xAxis: TARGET_REJECTION_PCT
						}]
					}
				}]
			});
		},

		/**
		 * KPI-card sparkline — a bare area line, no axes, no tooltip.
		 * @param {number[]} aValues one value per trend period
		 * @param {string} sColor line colour
		 * @param {object} ctx {echarts, animate}
		 * @returns {object} ECharts option
		 */
		sparkline: function (aValues, sColor, ctx) {
			var echarts = ctx.echarts;
			return {
				animation: ctx.animate !== false,
				grid: {
					left: 0,
					right: 0,
					top: 3,
					bottom: 3
				},
				xAxis: {
					type: "category",
					show: false,
					boundaryGap: false,
					data: aValues.map(function (v, i) {
						return i;
					})
				},
				yAxis: {
					show: false,
					type: "value",
					// Headroom below the minimum so a flat-ish series is not a straight
					// line pinned to the bottom edge.
					min: function (o) {
						return o.min - Math.abs(o.min) * 0.35;
					}
				},
				tooltip: {
					show: false
				},
				series: [{
					type: "line",
					data: aValues,
					smooth: true,
					symbol: "none",
					lineStyle: {
						width: 1.9,
						color: sColor
					},
					areaStyle: {
						color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{
							offset: 0,
							color: chartTheme.alpha(sColor, 0.25)
						}, {
							offset: 1,
							color: chartTheme.alpha(sColor, 0)
						}])
					}
				}]
			};
		}
	};

	return chartOptions;
});
