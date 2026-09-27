# Take this demo to a system

The local demo is the starting point. A system import is an explicit human action against an authorized A4H or other disposable sandbox, into a throwaway package. Review [the manifest](../deploy/manifest.json) and all source before packaging. Do not target a productive or customer system.

## Build an offline zip

Use an open-steamgate checkout whose `segw:zip` accepts `--unit` and `--manifest` (main at `3048c59`, oisee/open-steamgate#168, or later: from there the app's manifest is rebased for its BSP location). The tool refuses every object the deploy unit does not list, so stage a copy of this folder without the two objects that only work locally (below), then zip the copy. Set `DEMO` to your clone and run these commands from the open-steamgate checkout:

```sh
DEMO=/path/to/osg-demo
STAGE="$(mktemp -d)/osg-demo"
cp -r "$DEMO" "$STAGE" && rm -rf "$STAGE/.git"
rm "$STAGE"/src/zcl_osd_fleet_tran.clas.* "$STAGE"/src/zosd_fleet.tran.xml
npm run segw:zip -- "$STAGE" --unit osg-demo \
  --manifest "$DEMO/deploy/manifest.json" --out /tmp/osg-demo.zip
unzip -Z1 /tmp/osg-demo.zip
rm -rf "$(dirname "$STAGE")"
```

Given the folder itself, the tool treats it as a pack: it compiles `src/zosd_fleet.stg.yaml` into the SEGW objects, lets the hand-written `ZCL_ZOSD_FLEET_DPC_EXT` win over the generated one, and turns `webapp/` into a BSP application with its ICF node. Expected: `/tmp/osg-demo.zip: 31 files, ... deploy unit "osg-demo"`, then what it carried, by object type (the tool pads IWSV/IWMO names before their version, and the SICF line ends with the node's id; both shortened here):

```
CLAS  zcl_osd_fleet_report, zcl_zosd_fleet_dpc, zcl_zosd_fleet_dpc_ext, zcl_zosd_fleet_mpc, zcl_zosd_fleet_mpc_ann, zcl_zosd_fleet_mpc_ext, zosd_demo_hello
IWMO  zosd_fleet_mdl 0001
IWPR  zosd_fleet
IWSV  zosd_fleet_srv 0001
SHLP  zosd_fleet_status_sh
SICF  zosg_demo <node id>
TABL  zosd_fleet_ship, zosd_fleet_stat, zosd_fleet_voy
WAPA  zosg_demo
NOT carried: zosd_fleet_ship.tabu.json has no .conf.json, so abapGit has rows and no instruction to take them
```

and the same `NOT carried` line for `zosd_fleet_stat` and `zosd_fleet_voy`. If the two local objects are left in the copy, the command exits with `not-in-manifest` for `CLAS ZCL_OSD_FLEET_TRAN` and `TRAN ZOSD_FLEET` and writes no zip; an older zip at the same path is left as it was, so remove it before retrying.

## What travels and what does not

Checked with the commands above; the "on a system" column is what the objects need there, and has not been tried from this repository.

| Part | In the zip | Why, and what it needs on a system |
|---|---|---|
| `ZOSD_DEMO_HELLO` and its test | yes | Plain ABAP. |
| Tables `ZOSD_FLEET_SHIP`, `_VOY`, `_STAT` | yes, empty | The DDIC definitions travel; their rows do not (below). |
| Search help `ZOSD_FLEET_STATUS_SH` | yes | Elementary, over `ZOSD_FLEET_STAT`. |
| `ZCL_OSD_FLEET_REPORT` and `ltcl_fleet` | yes | The test reads the tables, so it passes only once the seed rows are there. |
| SEGW project `ZOSD_FLEET`, service `ZOSD_FLEET_SRV 0001`, model `ZOSD_FLEET_MDL 0001` | yes (IWPR, IWSV, IWMO) | Compiled from the YAML. The service still has to be activated in the gateway hub (`/IWFND/MAINT_SERVICE`) before `/sap/opu/odata/sap/ZOSD_FLEET_SRV/` answers. |
| `ZCL_ZOSD_FLEET_MPC`, `_MPC_EXT`, `_MPC_ANN`, `_DPC`, `_DPC_EXT` | yes | The generated classes, and the hand-written `_DPC_EXT`. `VoyageSet` is served by SADL over `ZOSD_FLEET_VOY` through the generated `_DPC`. |
| Fiori app | yes, as BSP `ZOSG_DEMO` (WAPA) | Its manifest's data source is rebased for the BSP location, `../../../../opu/odata/sap/ZOSD_FLEET_SRV/`, which is `/sap/opu/odata/sap/ZOSD_FLEET_SRV/` seen from `/sap/bc/ui5_ui5/sap/zosg_demo/`. SAPUI5 still loads from ui5.sap.com (`index.html`), so the browser needs to reach it. |
| The app's ICF node | yes, as SICF `/sap/bc/ui5_ui5/sap/zosg_demo` | A customer name under the path where a system keeps its UI5 applications. |
| The launchpad tile | no | The tile is `osd-pack.json`, which only the open-steamgate launchpad reads. On a system, the inbound `AirshipFleet-display` in the manifest is what a launchpad catalog and target mapping would point at; neither is in the zip. |
| Seed rows (`data/*.tabu.json`) | no | Two things would be needed and neither is here: a `.conf.json` beside each `.tabu.json` (abapGit's instruction: which table, which condition), and a `TABU <table>` entry in the deploy unit (without it the tool refuses the rows as `not-in-manifest`). With both, the rows would be written into the logon client, whatever their `MANDT` says. |
| Transaction `ZOSD_FLEET` and `ZCL_OSD_FLEET_TRAN` | no | The class implements `ZIF_OSD_TRANSACTION`, an interface of the open-steamgate runtime that a system does not have, so neither is in the deploy unit. |
| `test/slice.mjs`, `docs/`, the README | no | Files for this repository, not ABAP objects. |

## Offline abapGit import

1. In the sandbox, create a fresh numbered throwaway package and open abapGit. Choose **New Offline Repository**, assign that package, choose **Import zip**, then **Pull zip**. Review the object list and activation results. The zip does not choose the destination package.
2. Run `ZOSD_DEMO_HELLO` and its ABAP Unit test in the sandbox; ABAP Unit should pass. `ZCL_OSD_FLEET_REPORT` runs too, but prints only the heading until the fleet tables have rows, and `ltcl_fleet` fails for the same reason. There is no transaction to check.
3. If an import fails partway through, use fresh numbered names and a fresh package for another attempt. A failed SEGW import has been observed to leave registry rows; retrying the same names can collide. A BSP application name must be at most 15 characters.

Optional `vsp` deployment is for the same A4H/disposable sandbox boundary, with explicit confirmation of the target and reviewed object list. Its `EDITSOURCE` operation **saves and activates**; it is not a dry run. The offline zip is the path documented for this unit. This pack does not deploy CDS/SADL views, AMDP, APC, or transactions.
