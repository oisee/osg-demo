REPORT zl3_watch_doc.
* Dispatcher step: a daemon callback cannot execute SUBMIT on a system.
START-OF-SELECTION.
  DATA lt_report TYPE zcl_osd_fleet_watch=>tt_doctor.
  lt_report = zcl_osd_fleet_watch=>doctor( ).
