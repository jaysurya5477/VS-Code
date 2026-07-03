/*global QUnit*/

sap.ui.define([
	"com/sap/zprofitloss/controller/zprofit_loss.controller"
], function (Controller) {
	"use strict";

	QUnit.module("zprofit_loss Controller");

	QUnit.test("I should test the zprofit_loss controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
