/*global QUnit*/

sap.ui.define([
	"com/sap/zficvageing/controller/zfi_cv_ageing.controller"
], function (Controller) {
	"use strict";

	QUnit.module("zfi_cv_ageing Controller");

	QUnit.test("I should test the zfi_cv_ageing controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
