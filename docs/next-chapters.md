# Next chapters — DRAFT

These exercises are drafts for later chapters. They are not part of the verified chapter 1 walkthrough.

## 2. Debug, tests, and a dump

1. Open [ZOSD_DEMO_REPORT](../src/zosd_demo_report.prog.abap) and press **F8**. The extension opens the converted report as `ZGUI_OSD_DEMO_REPORT`; the pack also declares the `ZOSD_DEMO` transaction for Easy Access. Expected: the report shows `ZOSD_DEMO_REPORT total: 5`. The report converter does not map breakpoints back to this source file.
2. Set `osd.debug` to `true` before **osd: Start**. In [ZOSD_DEMO_HELLO](../src/zosd_demo_hello.clas.abap), set a breakpoint on `out->write( greeting( ) ).` with **Ctrl+Shift+B** and run **osd: Run as ABAP Application with debugger**. Expected: VS Code stops on that ABAP line. Continue with **F8**; the console prints the known greeting.
3. In [the hello test](../src/zosd_demo_hello.clas.testclasses.abap), change only `exp = 'Hello from ZOSD_DEMO_HELLO.'` to `exp = 'wrong'.` Run that test in Test Explorer. Expected: it turns red and shows expected/actual values. Restore the original expected string and rerun; expected: green again. Leave the committed test passing.
4. In the hello class, remove the leading `*` from `* ASSERT 1 = 2.`, press **Ctrl+F3**, and run it with **F9**. Expected: the console shows `ASSERTION_FAILED` and the ABAP source line; the dump is recorded in `ZOSD_DUMP`. Run **osd: Refresh hotspots** or wait for its refresh timer; the assertion line gains red heat and its file gets a count badge. Restore the `*` and activate when finished. Use a running child runtime for this exercise, since the inline front does not persist dump hotspots.

## 3. The OData ladder

These services belong to the open-steamgate core demo; this pack does not copy or deploy them. Start the bundled runtime with **osd: Start** first. The service card on main lists the implementing sources and operation links. This chapter needs a complete guided run before publication.

1. In the OSD Activity Bar, expand **Services > OData** and select `ZSTG_DEMO_SRV` once. Expected: the reused details panel shows the service URL, DPC/MPC source links, entity sets, and `$metadata`.
2. Expand `ZSTG_DEMO_SRV` in the tree and select `TravelSet`, a sibling of its DPC class. The DPC class is a leaf. Expected: the details explain the entity set. Open `ZCL_ZSTG_DEMO_DPC_EXT` from the service tree or its details link and find `METHOD travelset_get_entityset.`
3. Use the service card operation links to locate `TravelSet` CRUD, `TravelCount`, `CancelTravel`, deep insert and `$expand`, `PhotoSet` media, and `StatusVHSet` value help implementations. Read operations have a CodeLens; other operations need a guided run before publication. Click the **Call TravelSet** CodeLens above that method (or put the cursor in the method and press **F8**). Expected: a result panel shows the request URL, HTTP status, and a table of up to 20 travel rows. Seeded rows depend on the local database. The same service tree also lists `ZSTG_SADL_SRV` and `ZSTG_ODC_SRV` when those core services are loaded; selecting one shows its own details.


### Implementing methods to visit

The main service card links each listed operation to its source when an override exists. For `ZSTG_DEMO_SRV`, follow these methods in `src/demo/zcl_zstg_demo_dpc_ext.clas.abap`:

| Operation | Method |
| --- | --- |
| TravelSet read and CRUD | `travelset_get_entityset`, `travelset_get_entity`, `travelset_create_entity`, `travelset_update_entity`, `travelset_delete_entity` |
| Deep insert and `$expand` | `/iwbep/if_mgw_appl_srv_runtime~create_deep_entity`, `/iwbep/if_mgw_appl_srv_runtime~get_expanded_entityset` |
| `TravelCount`, `CancelTravel` | `/iwbep/if_mgw_appl_srv_runtime~execute_action` |
| `PhotoSet` media | `photoset_get_entityset`, `photoset_get_entity`, `/iwbep/if_mgw_appl_srv_runtime~get_stream`, `/iwbep/if_mgw_appl_srv_runtime~update_stream` |
| `StatusVHSet` value help | `statusvhset_get_entityset` |

`ZSTG_SADL_SRV` reads and expansion pass through `src/demo_sadl/zcl_zstg_sadl_dpc.clas.abap`; the service card links its CDS and generated sources. For `ZSTG_ODC_SRV`, use its card to reach its composition DPC and model sources.

## 4. Fiori apps and APC (coming)

The core contains the named APC example `ZSTG_APC_DEMO` with handler `ZCL_STG_APC_DEMO`. A guided start/run exercise and a Fiori app exercise are coming; this pack does not ship either object.

## 5. AMDP (coming)

The core example `ZCL_OSD_AMDP_DEMO` contains `SQUARES` and other SQLScript methods. A verified guided exercise for this pack is coming. For the current HANA extractor and runner, see [Running on HANA](hana.md) and the core [AMDP in HANA guide](https://github.com/oisee/open-steamgate/blob/main/docs/amdp-in-hana.md). Portable AMDP covers a limited subset.

## 6. Take it to a system

1. Follow [Take it to a system](take-to-system.md) to review the manifest and build an offline abapGit zip. Expected: the zip contains exactly this unit's listed objects, or the packaging command refuses it.
2. Import into an authorized sandbox package. Expected: an explicit human import, followed by activation and a check of the class and report. The `ZOSD_DEMO` transaction stays local because its generated report wrapper is not in the zip.
