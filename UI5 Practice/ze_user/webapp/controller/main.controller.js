sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel"
], function (Controller, MessageBox, JSONModel) {
    "use strict";

    return Controller.extend("com.sap.zeuser.controller.main", {
        onInit: function () {
            this._oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            
            // Initialize a JSON model for the view data
            var oData = {
                username: "",
                password: "",
                repeatpassword: "",
                email: "",
                phone: ""
            };
            var oModel = new JSONModel(oData);
            this.getView().setModel(oModel);
        },

        onUsernameChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            if (!sValue || sValue.length < 5) {
                oEvent.getSource().setValueState("Error");
                this._showMessage(this._oResourceBundle.getText("usernameError"), "Error");
            } else {
                oEvent.getSource().setValueState("None");
                this.getView().byId("messageStrip").setVisible(false);
            }
        },

        onTogglePassword: function (oEvent) {
            var oInput = oEvent.getSource();
            if (oInput.getType() === "Password") {
                oInput.setType("Text");
                oInput.setValueHelpIconSrc("sap-icon://hide");
            } else {
                oInput.setType("Password");
                oInput.setValueHelpIconSrc("sap-icon://show");
            }
        },

        onPasswordChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            if (sValue.length < 6) {
                oEvent.getSource().setValueState("Error");
                this._showMessage(this._oResourceBundle.getText("passwordError"), "Error");
            } else {
                oEvent.getSource().setValueState("None");
                this.getView().byId("messageStrip").setVisible(false);
            }
        },

        onRepeatPasswordChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var sPassword = this.getView().byId("passwordInput").getValue();
            if (sValue !== sPassword) {
                oEvent.getSource().setValueState("Error");
                this._showMessage(this._oResourceBundle.getText("repeatPasswordError"), "Error");
            } else {
                oEvent.getSource().setValueState("None");
                this.getView().byId("messageStrip").setVisible(false);
            }
        },

        onEmailChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(sValue)) {
                oEvent.getSource().setValueState("Error");
                this._showMessage(this._oResourceBundle.getText("emailError"), "Error");
            } else {
                oEvent.getSource().setValueState("None");
                this.getView().byId("messageStrip").setVisible(false);
            }
        },

        onPhoneLiveChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            // Remove non-numeric characters for live check
            var sCleanValue = sValue.replace(/\D/g, '');
            if (sValue !== sCleanValue) {
                oEvent.getSource().setValue(sCleanValue);
                sValue = sCleanValue;
            }

            var phoneRegex = /^\d{10}$/;
            var oSendOtpBtn = this.getView().byId("sendOtpButton");
            
            if (phoneRegex.test(sValue)) {
                oSendOtpBtn.setVisible(true);
            } else {
                oSendOtpBtn.setVisible(false);
            }
        },

        onPhoneChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var phoneRegex = /^\d{10}$/;
            if (sValue && !phoneRegex.test(sValue)) {
                oEvent.getSource().setValueState("Error");
                this._showMessage(this._oResourceBundle.getText("phoneError"), "Error");
            } else if (phoneRegex.test(sValue)) {
                oEvent.getSource().setValueState("None");
                this.getView().byId("messageStrip").setVisible(false);
            }
        },

        onSendOtp: function () {
            MessageBox.success(this._oResourceBundle.getText("otpSuccess"));
        },

        onRegister: function () {
            var bError = false;
            var aInputs = [
                this.getView().byId("usernameInput"),
                this.getView().byId("passwordInput"),
                this.getView().byId("repeatPasswordInput"),
                this.getView().byId("emailInput"),
                this.getView().byId("phoneInput")
            ];

            aInputs.forEach(function (oInput) {
                var sValue = oInput.getValue();
                if (oInput.getValueState() === "Error" || !sValue) {
                    oInput.setValueState("Error");
                    bError = true;
                }
            }.bind(this));

            // Also check if repeat password matches again on register
            var sPass = this.getView().byId("passwordInput").getValue();
            var sRepeat = this.getView().byId("repeatPasswordInput").getValue();
            if (sPass !== sRepeat) {
                this.getView().byId("repeatPasswordInput").setValueState("Error");
                bError = true;
            }

            if (bError) {
                this._showMessage(this._oResourceBundle.getText("registrationError"), "Error");
            } else {
                this.getView().byId("messageStrip").setVisible(false);
                MessageBox.success(this._oResourceBundle.getText("registrationSuccess"));
            }
        },

        _showMessage: function (sText, sType) {
            var oMessageStrip = this.getView().byId("messageStrip");
            oMessageStrip.setText(sText);
            oMessageStrip.setType(sType);
            oMessageStrip.setVisible(true);
        }
    });
});
