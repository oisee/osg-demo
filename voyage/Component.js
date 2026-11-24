sap.ui.define(["sap/fe/core/AppComponent"], function (AppComponent) {
  "use strict";
  // The fleet's RAP business object (src/rap) as a Fiori Elements V4 list
  // report and object page with draft, over the V4 facade of the service
  // ZUI_OSD_FLEET_VOY. Nothing draft-specific in it: sap.fe runs its own
  // draft flow because the Voyage set is a Common.DraftRoot.
  return AppComponent.extend("osd.voyage.Component", {
    metadata: {manifest: "json"}
  });
});
