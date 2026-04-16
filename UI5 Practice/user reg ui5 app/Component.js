sap.ui.define([
    "sap/ui/core/UIComponent"
], function (UIComponent) {
    "use strict";

    return UIComponent.extend("com.nexora.registration.Component", {

        metadata: {
            manifest: "json"
        },

        init: function () {
            // Call parent init first
            UIComponent.prototype.init.apply(this, arguments);
        }

    });
});
