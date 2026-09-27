sap.ui.define(["sap/suite/ui/generic/template/lib/AppComponent"], function (AppComponent) {
  "use strict";
  // A Fiori Elements V2 list report + object page over ZOSD_FLEET_SRV. No
  // controller code: the pages come from manifest.json, the columns, filters
  // and facets from the annotations in src/zosd_fleet.stg.yaml.
  return AppComponent.extend("osd.fleet.Component", {
    metadata: {manifest: "json"}
  });
});
