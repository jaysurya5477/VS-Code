sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/sap/zeuser/model/models",
    "sap/ui/model/json/JSONModel"
], (UIComponent, models, JSONModel) => {
    "use strict";

    return UIComponent.extend("com.sap.zeuser.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // set the image model
            const sImageUrl = sap.ui.require.toUrl("com/sap/zeuser/img/alimco_logo.png");
            const oImgModel = new JSONModel({
                logoPath: sImageUrl
            });
            this.setModel(oImgModel, "imgModel");

            // enable routing
            this.getRouter().initialize();
        }
    });
});