/*global QUnit*/

sap.ui.define([
	"com/sap/project1/controller/zsd_test_role.controller"
], function (Controller) {
	"use strict";

	QUnit.module("zsd_test_role Controller");

	QUnit.test("I should test the zsd_test_role controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
