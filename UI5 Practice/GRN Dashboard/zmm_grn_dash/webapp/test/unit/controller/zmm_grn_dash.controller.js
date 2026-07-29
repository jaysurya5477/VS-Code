/*global QUnit*/

sap.ui.define([
	"com/sap/zmmgrndash/controller/zmm_grn_dash.controller"
], function (Controller) {
	"use strict";

	QUnit.module("zmm_grn_dash Controller");

	QUnit.test("I should test the zmm_grn_dash controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
