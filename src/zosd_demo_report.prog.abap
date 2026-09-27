REPORT zosd_demo_report.

DATA gv_total TYPE i.

START-OF-SELECTION.
  gv_total = 2 + 3.
  WRITE: / 'ZOSD_DEMO_REPORT total:', gv_total.
