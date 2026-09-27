CLASS zosd_demo_hello DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    CLASS-METHODS greeting RETURNING VALUE(rv_text) TYPE string.
ENDCLASS.

CLASS zosd_demo_hello IMPLEMENTATION.
  METHOD greeting.
    rv_text = 'Hello from ZOSD_DEMO_HELLO.'.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    out->write( greeting( ) ).
* For the short dump exercise, uncomment the next line and run F9.
* ASSERT 1 = 2.
  ENDMETHOD.
ENDCLASS.
