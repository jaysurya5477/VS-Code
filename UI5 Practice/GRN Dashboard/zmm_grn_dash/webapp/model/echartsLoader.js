sap.ui.define([], function () {
	"use strict";

	/**
	 * Loads the vendored ECharts bundle (webapp/libs/echarts.min.js) exactly once and
	 * resolves with the global `echarts` namespace.
	 *
	 * Deliberately a plain <script> tag rather than sap.ui.require with an AMD shim:
	 * ECharts' UMD wrapper only assigns window.echarts when `define.amd` is falsy, which
	 * is precisely the case under the UI5 loader. A script tag therefore needs no shim
	 * configuration and behaves identically in `ui5 serve` and in the deployed BSP.
	 */

	var oLoad = null;

	return {
		/**
		 * @returns {Promise<object>} the ECharts namespace
		 */
		load: function () {
			if (oLoad) {
				return oLoad;
			}

			oLoad = new Promise(function (resolve, reject) {
				if (window.echarts) {
					resolve(window.echarts);
					return;
				}

				var sUrl = sap.ui.require.toUrl("com/sap/zmmgrndash/libs/echarts.min.js");
				var oScript = document.createElement("script");
				oScript.id = "grnDashECharts";
				oScript.src = sUrl;
				oScript.async = true;

				oScript.onload = function () {
					if (window.echarts) {
						resolve(window.echarts);
					} else {
						reject(new Error("ECharts loaded from " + sUrl + " but window.echarts is undefined."));
					}
				};
				oScript.onerror = function () {
					reject(new Error("Could not load ECharts from " + sUrl +
						". Check that webapp/libs/echarts.min.js is present and was copied into dist/ by the build."));
				};

				document.head.appendChild(oScript);
			});

			return oLoad;
		}
	};
});
