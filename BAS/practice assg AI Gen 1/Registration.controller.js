sap.ui.define([
    "sap/ui/core/mvc/Controller",   // Base Controller class from sap.ui.core library
    "sap/m/MessageBox",             // MessageBox from sap.m library — for dialogs
    "sap/m/MessageToast"            // MessageToast from sap.m library — for brief notifications
], function (Controller, MessageBox, MessageToast) {
    "use strict";

    /**
     * Registration Controller
     *
     * Handles all user interactions for the Student Registration Form:
     *   - onSubmit  : Validates and submits the form
     *   - onReset   : Resets all form fields
     *   - onCancel  : Navigates back / cancels the form
     */
    return Controller.extend("sap.ui5.beginner.registration.controller.Registration", {

        /* ============================================================
           LIFECYCLE HOOK — called once when the view is initialized
        ============================================================ */
        onInit: function () {
            // The i18n model is automatically set from manifest.json.
            // No extra setup needed here for a simple form.
            console.log("Registration Controller initialized ✅");
        },

        /* ============================================================
           HELPER — read the i18n ResourceBundle
           Usage: this._i18n("submitButton") → "Submit Registration"
        ============================================================ */
        _i18n: function (key) {
            return this.getView()
                       .getModel("i18n")
                       .getResourceBundle()
                       .getText(key);
        },

        /* ============================================================
           HELPER — get field values from the form
        ============================================================ */
        _getFormValues: function () {
            return {
                firstName : this.byId("firstNameInput").getValue().trim(),
                lastName  : this.byId("lastNameInput").getValue().trim(),
                email     : this.byId("emailInput").getValue().trim(),
                course    : this.byId("courseSelect").getSelectedKey(),
                gender    : this.byId("genderSegment").getSelectedKey()
            };
        },

        /* ============================================================
           HELPER — basic validation
           Returns true if all required fields are filled
        ============================================================ */
        _validate: function (values) {
            var bValid = true;

            // First Name
            var oFirstName = this.byId("firstNameInput");
            if (!values.firstName) {
                oFirstName.setValueState("Error");
                oFirstName.setValueStateText("First name is required");
                bValid = false;
            } else {
                oFirstName.setValueState("None");
            }

            // Last Name
            var oLastName = this.byId("lastNameInput");
            if (!values.lastName) {
                oLastName.setValueState("Error");
                oLastName.setValueStateText("Last name is required");
                bValid = false;
            } else {
                oLastName.setValueState("None");
            }

            // Email (simple format check)
            var oEmail = this.byId("emailInput");
            var reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!values.email || !reEmail.test(values.email)) {
                oEmail.setValueState("Error");
                oEmail.setValueStateText("Enter a valid email address");
                bValid = false;
            } else {
                oEmail.setValueState("None");
            }

            // Course selection
            if (!values.course) {
                MessageToast.show("Please select a course.");
                bValid = false;
            }

            return bValid;
        },

        /* ============================================================
           EVENT HANDLER — Submit Button pressed
        ============================================================ */
        onSubmit: function () {
            var values = this._getFormValues();

            // Run validation
            if (!this._validate(values)) {
                MessageBox.error(this._i18n("errorMessage"));
                return;
            }

            // All fields valid — show success message
            var sMessage = this._i18n("successMessage") +
                "\n\nName   : " + values.firstName + " " + values.lastName +
                "\nEmail  : " + values.email +
                "\nCourse : " + values.course +
                "\nGender : " + (values.gender || "Not specified");

            MessageBox.success(sMessage, {
                title: "Registration Successful",
                onClose: function () {
                    // Optionally reset the form after acknowledgment
                    this._resetFields();
                }.bind(this)
            });
        },

        /* ============================================================
           EVENT HANDLER — Reset Button pressed
        ============================================================ */
        onReset: function () {
            var that = this;

            // Ask user to confirm before resetting
            MessageBox.confirm(this._i18n("confirmReset"), {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._resetFields();
                        MessageToast.show("Form has been reset.");
                    }
                }
            });
        },

        /* ============================================================
           EVENT HANDLER — Cancel Button pressed
        ============================================================ */
        onCancel: function () {
            MessageToast.show("Action cancelled.");
            // In a real app you'd navigate back: this.getOwnerComponent()
            //   .getRouter().navTo("home");
        },

        /* ============================================================
           PRIVATE — Clear all fields and reset value states
        ============================================================ */
        _resetFields: function () {
            // Clear text inputs
            this.byId("firstNameInput").setValue("").setValueState("None");
            this.byId("lastNameInput").setValue("").setValueState("None");
            this.byId("emailInput").setValue("").setValueState("None");

            // Reset dropdown to first (placeholder) item
            this.byId("courseSelect").setSelectedKey("");

            // Reset segmented button
            this.byId("genderSegment").setSelectedKey("");
        }

    });
});
