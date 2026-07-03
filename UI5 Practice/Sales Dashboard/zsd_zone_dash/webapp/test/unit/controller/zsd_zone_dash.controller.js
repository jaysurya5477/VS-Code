/*global QUnit*/

sap.ui.define([
	"com/sap/zsdzonedash/controller/zsd_zone_dash.controller"
], function (Controller) {
	"use strict";

	QUnit.module("zsd_zone_dash Controller");

	QUnit.test("I should test the zsd_zone_dash controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
