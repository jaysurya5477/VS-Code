sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/ValueState"
], function (Controller, MessageBox, MessageToast, ValueState) {
    "use strict";

    return Controller.extend("com.nexora.registration.controller.Register", {

        /* =========================================================== */
        /*  Lifecycle                                                    */
        /* =========================================================== */

        onInit: function () {
            // Internal state
            this._state = {
                userId:      { valid: false },
                password:    { valid: false, value: "" },
                repeatPwd:   { valid: false },
                mobile:      { valid: false },
                email:       { valid: false },
                terms:       { checked: false }
            };

            // Regex patterns
            this._patterns = {
                email:  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                mobile: /^\+?[\d\s\-]{7,15}$/
            };
        },

        /* =========================================================== */
        /*  Field Change Handlers                                        */
        /* =========================================================== */

        /**
         * Generic handler for User ID and Mobile fields.
         * Validates non-empty and updates ValueState.
         */
        onFieldChange: function (oEvent) {
            var oInput  = oEvent.getSource();
            var sId     = oInput.getId().replace(this.getView().getId() + "--", "");
            var sValue  = oInput.getValue().trim();
            var bValid  = sValue.length > 0;

            // Extra validation for mobile
            if (sId === "mobileInput") {
                bValid = sValue.length > 0 && this._patterns.mobile.test(sValue);
                this._setInputState(oInput, bValid, bValid ? "" : "Enter a valid mobile number (7–15 digits)", "mobileMsg");
                this._state.mobile.valid = bValid;
            } else if (sId === "userIdInput") {
                bValid = sValue.length >= 3;
                this._setInputState(oInput, bValid, bValid ? "" : "User ID must be at least 3 characters", "userIdMsg");
                this._state.userId.valid = bValid;
            }

            this._updateRegisterButton();
        },

        /**
         * Password live change — runs strength check and triggers repeat match re-validation.
         */
        onPasswordChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oInput.getValue();
            this._state.password.value = sValue;

            var bValid = sValue.length >= 8;
            this._state.password.valid = bValid;

            // Strength indicator
            this._updateStrengthBar(sValue);

            // Update ValueState
            if (sValue.length === 0) {
                oInput.setValueState(ValueState.None);
            } else {
                oInput.setValueState(bValid ? ValueState.Success : ValueState.Error);
                oInput.setValueStateText(bValid ? "" : "Password must be at least 8 characters");
            }

            // Re-check repeat password match
            this._validateRepeatPassword();
            this._updateRegisterButton();
        },

        /**
         * Repeat password live change.
         */
        onRepeatPasswordChange: function () {
            this._validateRepeatPassword();
            this._updateRegisterButton();
        },

        /**
         * Email live change with pattern validation.
         */
        onEmailChange: function (oEvent) {
            var oInput  = oEvent.getSource();
            var sValue  = oInput.getValue().trim();
            var bValid  = this._patterns.email.test(sValue);

            this._state.email.valid = bValid;
            this._setInputState(oInput, sValue.length === 0 ? null : bValid,
                bValid ? "" : "Enter a valid email address (e.g. you@company.com)", "emailMsg");

            this._updateRegisterButton();
        },

        /**
         * Terms & Conditions checkbox.
         */
        onTermsChange: function (oEvent) {
            this._state.terms.checked = oEvent.getParameter("selected");
            this._updateRegisterButton();
        },

        /* =========================================================== */
        /*  Register Button                                              */
        /* =========================================================== */

        onRegister: function () {
            var oView = this.getView();
            var oBtn  = oView.byId("registerBtn");

            // Final guard — should already be validated
            if (!this._isFormValid()) {
                MessageToast.show("Please fill in all required fields correctly.");
                return;
            }

            // Simulate async registration call
            oBtn.setText("Creating account…");
            oBtn.setEnabled(false);

            setTimeout(function () {
                oBtn.setText("✓ Account created!");
                oBtn.addStyleClass("registerBtnSuccess");
                oBtn.removeStyleClass("registerBtnDefault");

                MessageBox.success(
                    "Your account has been created successfully!\nYou can now sign in with your credentials.",
                    {
                        title: "Registration Successful",
                        onClose: function () {
                            // In a real app: navigate to login page
                            // sap.ui.core.UIComponent.getRouterFor(this).navTo("Login");
                        }.bind(this)
                    }
                );
            }.bind(this), 1500);
        },

        /**
         * Sign In link pressed — navigate to login view.
         */
        onSignIn: function () {
            MessageToast.show("Navigating to Sign In…");
            // In a real app:
            // this.getOwnerComponent().getRouter().navTo("Login");
        },

        /* =========================================================== */
        /*  Private Helpers                                              */
        /* =========================================================== */

        /**
         * Validates repeat password against primary password.
         */
        _validateRepeatPassword: function () {
            var oView     = this.getView();
            var oInput    = oView.byId("repeatPwdInput");
            var oMsgText  = oView.byId("pwdMatchMsg");
            var sRepeat   = oInput.getValue();
            var sPrimary  = this._state.password.value;

            if (sRepeat.length === 0) {
                oInput.setValueState(ValueState.None);
                oMsgText.setVisible(false);
                this._state.repeatPwd.valid = false;
                return;
            }

            var bMatch = sRepeat === sPrimary;
            this._state.repeatPwd.valid = bMatch;

            oInput.setValueState(bMatch ? ValueState.Success : ValueState.Error);
            oInput.setValueStateText(bMatch ? "" : "Passwords do not match");

            oMsgText.setText(bMatch ? "Passwords match" : "Passwords do not match");
            oMsgText.removeStyleClass(bMatch ? "fieldMsgError" : "fieldMsgSuccess");
            oMsgText.addStyleClass(bMatch ? "fieldMsgSuccess" : "fieldMsgError");
            oMsgText.setVisible(true);
        },

        /**
         * Computes password strength score and updates the 4-segment bar.
         * Score 1 = Weak | 2 = Fair | 3 = Good | 4 = Strong
         */
        _updateStrengthBar: function (sValue) {
            var oView = this.getView();
            var score = 0;

            if (sValue.length >= 8)          score++;
            if (/[A-Z]/.test(sValue))        score++;
            if (/[0-9]/.test(sValue))        score++;
            if (/[^A-Za-z0-9]/.test(sValue)) score++;

            var aColors = ["#e24b4a", "#ef9f27", "#4da8ff", "#1d9e75"];
            var aLabels = ["Weak", "Fair", "Good", "Strong"];

            for (var i = 1; i <= 4; i++) {
                var oSeg = oView.byId("seg" + i);
                if (oSeg) {
                    if (i <= score) {
                        oSeg.removeStyleClass("strengthSegEmpty");
                        oSeg.$().css("background-color", aColors[score - 1]);
                    } else {
                        oSeg.addStyleClass("strengthSegEmpty");
                        oSeg.$().css("background-color", "");
                    }
                }
            }

            var oLabel = oView.byId("strengthLabel");
            if (oLabel) {
                if (score > 0) {
                    oLabel.setText(aLabels[score - 1]);
                    oLabel.$().css("color", aColors[score - 1]);
                } else {
                    oLabel.setText("Password strength");
                    oLabel.$().css("color", "");
                }
            }
        },

        /**
         * Sets ValueState + message text helper for inputs.
         * @param {sap.m.Input}  oInput   - the input control
         * @param {boolean|null} bValid   - true/false/null (null = reset)
         * @param {string}       sMsg     - error message text
         * @param {string}       sMsgId   - id of the accompanying Text control
         */
        _setInputState: function (oInput, bValid, sMsg, sMsgId) {
            var oView    = this.getView();
            var oMsgCtrl = oView.byId(sMsgId);

            if (bValid === null || bValid === undefined) {
                oInput.setValueState(ValueState.None);
                if (oMsgCtrl) { oMsgCtrl.setVisible(false); }
                return;
            }

            oInput.setValueState(bValid ? ValueState.Success : ValueState.Error);
            oInput.setValueStateText(bValid ? "" : sMsg);

            if (oMsgCtrl) {
                if (!bValid && sMsg) {
                    oMsgCtrl.setText(sMsg);
                    oMsgCtrl.removeStyleClass("fieldMsgSuccess");
                    oMsgCtrl.addStyleClass("fieldMsgError");
                    oMsgCtrl.setVisible(true);
                } else {
                    oMsgCtrl.setVisible(false);
                }
            }
        },

        /**
         * Returns true only when all fields pass validation.
         */
        _isFormValid: function () {
            var s = this._state;
            return s.userId.valid &&
                   s.password.valid &&
                   s.repeatPwd.valid &&
                   s.mobile.valid &&
                   s.email.valid &&
                   s.terms.checked;
        },

        /**
         * Enables / disables the Register button based on form validity.
         */
        _updateRegisterButton: function () {
            var oBtn = this.getView().byId("registerBtn");
            if (oBtn) {
                oBtn.setEnabled(this._isFormValid());
            }
        }

    });
});
