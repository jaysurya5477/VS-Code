/*global QUnit*/

sap.ui.define([
	"com/sap/zppdashboard/controller/zpp_dashboard.controller"
], function (Controller) {
	"use strict";

	QUnit.module("zpp_dashboard Controller");

	QUnit.test("I should test the zpp_dashboard controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
