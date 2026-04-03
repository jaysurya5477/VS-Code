sap.ui.define([
    "sap/ui/core/UIComponent"   // Base class for all UI5 components
], function (UIComponent) {
    "use strict";

    /**
     * Component.js — Entry point for the SAP UI5 application.
     *
     * UIComponent reads manifest.json to:
     *   - Set up the i18n ResourceModel automatically
     *   - Load the root view (Registration.view.xml)
     *   - Configure dependencies (sap.m, sap.ui.layout)
     */
    return UIComponent.extend("sap.ui5.beginner.registration.Component", {

        // Tell UI5 to read configuration from manifest.json
        metadata: {
            manifest: "json"
        },

        /**
         * init() is called once when the Component is instantiated.
         * Always call the parent init first.
         */
        init: function () {
            // Call parent UIComponent's init
            UIComponent.prototype.init.apply(this, arguments);

            // In real apps you would initialize the Router here:
            // this.getRouter().initialize();
        }

    });
});
