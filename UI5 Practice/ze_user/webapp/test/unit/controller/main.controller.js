/*global QUnit*/

sap.ui.define([
	"com/sap/zeuser/controller/main",
    "sap/ui/thirdparty/sinon",
    "sap/ui/thirdparty/sinon-qunit"
], function (Controller) {
	"use strict";

	QUnit.module("main Controller", {
        beforeEach: function () {
            this.oController = new Controller();
        },
        afterEach: function () {
            this.oController.destroy();
        }
    });

	QUnit.test("I should test the main controller exists", function (assert) {
		assert.ok(this.oController);
	});

    QUnit.test("Password validation: short password should set error state and show MessageStrip", function (assert) {
        var oMessageStrip = {
            setText: sinon.stub(),
            setType: sinon.stub(),
            setVisible: sinon.stub()
        };
        var oView = {
            byId: function (id) {
                if (id === "messageStrip") return oMessageStrip;
                return null;
            }
        };
        var oEvent = {
            getParameter: function () { return "123"; },
            getSource: function () {
                return {
                    setValueState: function (state) {
                        assert.strictEqual(state, "Error", "Value state should be Error for short password");
                    }
                };
            }
        };
        
        sinon.stub(this.oController, "getView").returns(oView);
        this.oController._oResourceBundle = { getText: function () { return "error"; } };

        this.oController.onPasswordChange(oEvent);

        assert.ok(oMessageStrip.setVisible.calledWith(true), "MessageStrip should be visible");
        assert.ok(oMessageStrip.setText.calledWith("error"), "MessageStrip text should be set");
    });

    QUnit.test("Email validation: invalid email should set error state and show MessageStrip", function (assert) {
        var oMessageStrip = {
            setText: sinon.stub(),
            setType: sinon.stub(),
            setVisible: sinon.stub()
        };
        var oView = {
            byId: function (id) {
                if (id === "messageStrip") return oMessageStrip;
                return null;
            }
        };
        var oEvent = {
            getParameter: function () { return "invalid-email"; },
            getSource: function () {
                return {
                    setValueState: function (state) {
                        assert.strictEqual(state, "Error", "Value state should be Error for invalid email");
                    }
                };
            }
        };
        
        sinon.stub(this.oController, "getView").returns(oView);
        this.oController._oResourceBundle = { getText: function () { return "error"; } };

        this.oController.onEmailChange(oEvent);

        assert.ok(oMessageStrip.setVisible.calledWith(true), "MessageStrip should be visible");
        assert.ok(oMessageStrip.setText.calledWith("error"), "MessageStrip text should be set");
    });

});
