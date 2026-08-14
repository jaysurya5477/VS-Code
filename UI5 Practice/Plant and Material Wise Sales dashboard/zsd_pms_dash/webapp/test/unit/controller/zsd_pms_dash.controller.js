/*global QUnit*/

sap.ui.define([
	"com/sap/zsdpmsdash/controller/zsd_pms_dash.controller"
], function (Controller) {
	"use strict";

	QUnit.module("zsd_pms_dash Controller");

	QUnit.test("I should test the zsd_pms_dash controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
