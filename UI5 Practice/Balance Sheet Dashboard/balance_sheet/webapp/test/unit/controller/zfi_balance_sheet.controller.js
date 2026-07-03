/*global QUnit*/

sap.ui.define([
	"com/sap/balancesheet/controller/zfi_balance_sheet.controller"
], function (Controller) {
	"use strict";

	QUnit.module("zfi_balance_sheet Controller");

	QUnit.test("I should test the zfi_balance_sheet controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
