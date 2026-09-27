# Take this demo to a system

The local demo is the starting point. A system import is an explicit human action against an authorized A4H or other disposable sandbox, into a throwaway package. Review [the manifest](../deploy/manifest.json) and all source before packaging. Do not target a productive or customer system.

## Build an offline zip

Use open-steamgate main at `d67f8660` or later, whose `segw:zip` accepts `--unit` and `--manifest` and refuses files outside the unit allowlist. Stage only the deployable files: the local `ZOSD_DEMO` transaction names an OSG-generated wrapper, so it must stay out of the system zip. Set `DEMO` to your clone and run these commands from the open-steamgate checkout:

```sh
DEMO=/path/to/osg-demo
STAGE="$(mktemp -d)"
cp "$DEMO"/src/zosd_demo_hello.clas.* "$DEMO"/src/zosd_demo_report.prog.* "$STAGE"/
npm run segw:zip -- "$STAGE" --unit osg-demo \
  --manifest "$DEMO/deploy/manifest.json" --out /tmp/osg-demo.zip
unzip -Z1 /tmp/osg-demo.zip
rm -rf "$STAGE"
```

The tool checks every staged source object against the unit's type/name allowlist and refuses SAP-owned names even if listed. It writes `.abapgit.xml`, `src/package.devc.xml`, and the admitted files into the zip. Expected: the tool lists `CLAS zosd_demo_hello` and `PROG zosd_demo_report`; the zip contains no `*.tran.xml`. If an extra object is staged, the command exits with `not-in-manifest` and produces no new zip; an older zip at the same path is left as it was, so remove it before retrying (or use a new output name) and inspect the output and zip before import. This unit has no seed rows, SEGW service, or app. The parent open-steamgate project's `demo` and `demo-app` units can package their SEGW service, DPC/MPC, DDIC, search help, seed rows, and BSP plus ICF node separately. This demo manifest does not authorize those objects.

## Offline abapGit import

1. In the sandbox, create a fresh numbered throwaway package and open abapGit. Choose **New Offline Repository**, assign that package, choose **Import zip**, then **Pull zip**. Review the object list and activation results. The zip does not choose the destination package.
2. Run `ZOSD_DEMO_HELLO` and its ABAP Unit test in the sandbox. ABAP Unit should pass. Check that `ZOSD_DEMO_REPORT` imports and activates. The zip has no transaction, so there is no transaction to check in the system.
3. If an import fails partway through, use fresh numbered names and a fresh package for another attempt. A failed SEGW import has been observed to leave registry rows; retrying the same names can collide. Client-dependent seed rows in other units are rewritten to the logon client by abapGit; review and filter them before import. A BSP application name must be at most 15 characters.

Optional `vsp` deployment is for the same A4H/disposable sandbox boundary, with explicit confirmation of the target and reviewed object list. Its `EDITSOURCE` operation **saves and activates**; it is not a dry run. The offline zip is the path documented for this first unit. This pack does not deploy CDS/SADL, AMDP, APC, or transactions.
