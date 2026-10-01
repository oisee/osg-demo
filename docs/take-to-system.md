# Take this demo to a system

The local demo is the starting point. A system import is an explicit human action against an authorized A4H or other disposable sandbox, into a throwaway package. Review [the manifest](../deploy/manifest.json) and all source before packaging. Do not target a productive or customer system.

## Build an offline zip

Use an open-steamgate checkout at the tag `vscode-v0.5.1467` or later. Its `segw:zip` accepts `--unit` and `--manifest` and rebases the app's manifest for its BSP location. The tool refuses every object the deploy unit does not list, so stage a copy of this folder without the four objects that only work locally (below), then zip the copy. Set `DEMO` to your clone and run these commands from the open-steamgate checkout:

```sh
DEMO=/path/to/osg-demo
STAGE="$(mktemp -d)/osg-demo"
cp -r "$DEMO" "$STAGE" && rm -rf "$STAGE/.git"
rm "$STAGE"/src/zcl_osd_fleet_tran.clas.* "$STAGE"/src/zcl_osd_fleet_tpl.clas.* "$STAGE"/src/zcl_osd_fleet_doctor.clas.* "$STAGE"/src/l2/*.l2.yaml "$STAGE"/src/l2/*.trace.json "$STAGE"/src/zosd_fleet.tran.xml
npm run segw:zip -- "$STAGE" --unit osg-demo \
  --manifest "$DEMO/deploy/manifest.json" --out /tmp/osg-demo.zip
unzip -Z1 /tmp/osg-demo.zip
rm -rf "$(dirname "$STAGE")"
```

Given the folder itself, the tool treats it as a pack: it compiles `src/zosd_fleet.stg.yaml` into the SEGW objects, lets the hand-written `ZCL_ZOSD_FLEET_DPC_EXT` win over the generated one, and turns `webapp/` into a BSP application with its ICF node. Expected: `/tmp/osg-demo.zip: ... deploy unit "osg-demo"`, then what it carried, by object type (the tool pads IWSV/IWMO names before their version, and the SICF line ends with the node's id; both shortened here):

```
CLAS  zcl_osd_fleet_audit, zcl_osd_fleet_bal, zcl_osd_fleet_bal_view, zcl_osd_fleet_chain, zcl_osd_fleet_fuel, zcl_osd_fleet_job, zcl_osd_fleet_l2_maint, zcl_osd_fleet_lift, zcl_osd_fleet_report, zcl_osd_fleet_summary, zcl_zosd_fleet_dpc, zcl_zosd_fleet_dpc_ext, zcl_zosd_fleet_mpc, zcl_zosd_fleet_mpc_ann, zcl_zosd_fleet_mpc_ext, zosd_demo_hello
DDLS  zc_osd_fleetcube
IWMO  zosd_fleet_mdl 0001
IWPR  zosd_fleet
IWSV  zosd_fleet_srv 0001
PROG  zosd_fleet_alv, zosd_fleet_balv, zosd_fleet_job, zosd_fleet_ready, zosd_fleet_voyage
SHLP  zosd_fleet_status_sh
SICF  zosg_demo <node id>
TABL  zosd_fleet_ship, zosd_fleet_stat, zosd_fleet_voy
WAPA  zosg_demo
NOT carried: zosd_fleet_ship.tabu.json has no .conf.json, so abapGit has rows and no instruction to take them
```

and the same `NOT carried` line for `zosd_fleet_stat` and `zosd_fleet_voy`. If the four local objects are left in the copy, the command exits with `not-in-manifest` for `CLAS ZCL_OSD_FLEET_DOCTOR`, `CLAS ZCL_OSD_FLEET_TPL`, `CLAS ZCL_OSD_FLEET_TRAN` and `TRAN ZOSD_FLEET` and writes no zip; an older zip at the same path is left as it was, so remove it before retrying.

## What travels and what does not

Checked with the commands above; the "on a system" column is what the objects need there, and has not been tried from this repository.

| Part | In the zip | Why, and what it needs on a system |
|---|---|---|
| `ZOSD_DEMO_HELLO` and its test | yes | Plain ABAP. |
| Tables `ZOSD_FLEET_SHIP`, `_VOY`, `_STAT` | yes, empty | The DDIC definitions travel; their rows do not (below). |
| Search help `ZOSD_FLEET_STATUS_SH` | yes | Elementary, over `ZOSD_FLEET_STAT`. |
| `ZCL_OSD_FLEET_REPORT` and `ltcl_fleet` | yes | The test reads the tables, so it passes only once the seed rows are there. |
| `ZCL_OSD_FLEET_AUDIT` and `ltcl_audit` | yes | Read-only counts and a result; neither writes nor displays a BAL log. Its tests need the seed rows. |
| `ZCL_OSD_FLEET_BAL` and `ZCL_OSD_FLEET_BAL_VIEW` | yes | Call the standard `CL_BALI_*` surface. Register BAL object `ZOSD_FLEET` and subobject `AUDIT` on the target system before running. The writer commits three logs; its ABAP Unit test writes rows and is `DANGEROUS`. Seed rows are needed for the expected counts. |
| SEGW project `ZOSD_FLEET`, service `ZOSD_FLEET_SRV 0001`, model `ZOSD_FLEET_MDL 0001` | yes (IWPR, IWSV, IWMO) | Compiled from the YAML. The service still has to be activated in the gateway hub (`/IWFND/MAINT_SERVICE`) before `/sap/opu/odata/sap/ZOSD_FLEET_SRV/` answers. |
| `ZCL_ZOSD_FLEET_MPC`, `_MPC_EXT`, `_MPC_ANN`, `_DPC`, `_DPC_EXT` | yes | The generated classes, and the hand-written `_DPC_EXT`. `VoyageSet` is served by SADL over `ZOSD_FLEET_VOY` through the generated `_DPC`. |
| Fiori app | yes, as BSP `ZOSG_DEMO` (WAPA) | Its manifest's data source is rebased for the BSP location, `../../../../opu/odata/sap/ZOSD_FLEET_SRV/`, which is `/sap/opu/odata/sap/ZOSD_FLEET_SRV/` seen from `/sap/bc/ui5_ui5/sap/zosg_demo/`. SAPUI5 still loads from ui5.sap.com (`index.html`), so the browser needs to reach it. |
| Report `ZOSD_FLEET_BALV` | yes (PROG) | `CL_SALV_TABLE` over `ZCL_OSD_FLEET_BAL_VIEW=>MESSAGES`, the standard `CL_BALI_*` read. A demo view of the fleet's log; on a system SLG1 shows the same logs. Its transaction `ZGUI_OSD_FLEET_BALV` is the engine's wrapper and does not travel. |
| Report `ZOSD_FLEET_JOB` and `ZCL_OSD_FLEET_JOB` | yes (PROG, CLAS) | The job step and its scheduler use only the standard `JOB_OPEN`, `SUBMIT ... VIA JOB` and `JOB_CLOSE`. The step writes a BAL log through `ZCL_OSD_FLEET_BAL`, so the BAL object must be registered first. On a system the released job runs through the regular background processing (SM37); the local worker (`tools/osd-batch-runs.mjs`) is the engine's and does not travel. |
| Reports `ZOSD_FLEET_VOYAGE`, `ZOSD_FLEET_READY` and `ZCL_OSD_FLEET_CHAIN` | yes (PROG, CLAS), not measured there | Standard `JOB_OPEN`, `SUBMIT ... VIA JOB`, `JOB_CLOSE` with `EVENT_ID`/`EVENT_PARAM`, and `BP_EVENT_RAISE`; no private extension. The readiness job is closed before the voyage job is released, so it waits before anything can raise its event; SAP's documented event pattern, measured on open-steamgate only. On a system a raised event starts every job waiting for `ZOSD_FLEET_VOYAGE_DONE` with that parameter or with none, so the run ID keeps chains apart; register the event in SM64 first and give the job's user the authority to raise it, or the voyage job aborts after its log says OK. A readiness job whose voyage job aborted never gets its event; expect it to stay scheduled until someone deletes it (not measured). A caller `ROLLBACK` after a failed `JOB_CLOSE` does not undo a job that already started. Both steps write BAL logs under `ZOSD_FLEET/AUDIT`. |
| Report `ZOSD_FLEET_ALV` | yes (PROG) | Plain ABAP with `CL_SALV_TABLE`; on a system it runs as a report (SE38/SA38). Its transaction `ZGUI_OSD_FLEET_ALV` is the engine's own wrapper and does not travel. |
| Cube `ZC_OSD_FLEETCUBE` | yes (DDLS) | The CDS source; a system creates its SQL view `ZVOSDFLEETCUBE` on activation, and, because of `@OData.publish: true`, the service `ZC_OSD_FLEETCUBE_CDS`, which still has to be activated in the gateway hub. There its properties keep the CDS aliases (`VoyageId`, `ShipId`, ...), where the local engine serves them in upper case (`VOYAGEID`, `SHIPID`, ...). |
| AMDP classes `ZCL_OSD_FLEET_FUEL`, `ZCL_OSD_FLEET_SUMMARY` | yes | Real AMDP on a HANA-based system: the source is not rewritten for the local engine. The classruns need seed rows to show the expected totals. |
| The app's ICF node | yes, as SICF `/sap/bc/ui5_ui5/sap/zosg_demo` | A customer name under the path where a system keeps its UI5 applications. |
| The launchpad tile | no | The tile is `osd-pack.json`, which only the open-steamgate launchpad reads. On a system, the inbound `AirshipFleet-display` in the manifest is what a launchpad catalog and target mapping would point at; neither is in the zip. |
| Seed rows (`data/*.tabu.json`) | no | Two things would be needed and neither is here: a `.conf.json` beside each `.tabu.json` (abapGit's instruction: which table, which condition), and a `TABU <table>` entry in the deploy unit (without it the tool refuses the rows as `not-in-manifest`). With both, the rows would be written into the logon client, whatever their `MANDT` says. |
| `ZCL_OSD_FLEET_LIFT` and `ltcl_fleet_lift` | yes | Plain Open SQL over the fleet tables; the lifted region is ordinary ABAP once generated. Its HARMLESS tests read the seed rows, so they pass only once the rows are there. `test/lift.mjs`, which regenerates the region, needs open-steamgate and does not travel. |
| `ZCL_OSD_FLEET_L2_MAINT` and its test class | yes | Generated from `src/l2/maintenance_no_voyage.l2.yaml` by open-steamgate's L2 compiler, but plain Open SQL once written. Its test class is `DANGEROUS`: it inserts its examples' rows into the fleet tables and deletes them again. On a system the tests assume no other ship in maintenance has a voyage after 2027-03-01 and that keys `X001`-`X003`/`X00001`-`X00007` are free; an existing row with such a key makes the insert fail and the teardown delete it, so run them only in a sandbox. The rule file and the `*.trace.json` files are files of this repository and do not travel. |
| `ZCL_OSD_FLEET_DOCTOR` | no | It asks open-steamgate's job doctor `ZCL_OSD_JOB_DOCTOR`; on a system, SM37 and the job log answer the same question. |
| `ZCL_OSD_FLEET_TPL` | no | It renders through `ZCL_OSD_TPL` and `ZCL_AJSON` of the open-steamgate runtime; a system has neither unless both are imported first. |
| Transaction `ZOSD_FLEET` and `ZCL_OSD_FLEET_TRAN` | no | The class implements `ZIF_OSD_TRANSACTION`, an interface of the open-steamgate runtime that a system does not have, so neither is in the deploy unit. |
| `test/*.mjs`, `docs/`, `book/`, the README | no | Files for this repository, not ABAP objects. |

## Offline abapGit import

1. In the sandbox, create a fresh numbered throwaway package and open abapGit. Choose **New Offline Repository**, assign that package, choose **Import zip**, then **Pull zip**. Review the object list and activation results. The zip does not choose the destination package.
2. Run `ZOSD_DEMO_HELLO` and its ABAP Unit test in the sandbox; ABAP Unit should pass. `ZCL_OSD_FLEET_REPORT` runs too, but prints only the heading until the fleet tables have rows, and `ltcl_fleet` fails for the same reason. There is no transaction to check.
3. If an import fails partway through, use fresh numbered names and a fresh package for another attempt. A failed SEGW import has been observed to leave registry rows; retrying the same names can collide. A BSP application name must be at most 15 characters.

Optional `vsp` deployment is for the same A4H/disposable sandbox boundary, with explicit confirmation of the target and reviewed object list. Its `EDITSOURCE` operation **saves and activates**; it is not a dry run. The offline zip is the path documented for this unit. This pack does not deploy CDS/SADL views, AMDP, APC, or transactions.
