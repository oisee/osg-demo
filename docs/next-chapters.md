# Next chapters — DRAFT

These exercises are drafts for later chapters. Chapters 1 to 4 are in the [README](../README.md); what follows is not verified yet.

## 5. AMDP (coming)

The core example `ZCL_OSD_AMDP_DEMO` contains `SQUARES` and other SQLScript methods. A verified guided exercise for this pack is coming. For the current HANA extractor and runner, see [Running on HANA](hana.md) and the core [AMDP in HANA guide](https://github.com/oisee/open-steamgate/blob/main/docs/amdp-in-hana.md). Portable AMDP covers a limited subset.

## 6. Take it to a system

1. Follow [Take it to a system](take-to-system.md) to review the manifest and build an offline abapGit zip. Expected: the zip contains exactly the staged objects, all listed by the unit, or the packaging command refuses it. The fleet objects are not staged yet.
2. Import into an authorized sandbox package. Expected: an explicit human import, followed by activation and a check of the class. The `ZOSD_FLEET` transaction stays local because its class uses the engine's `ZIF_OSD_TRANSACTION`.
