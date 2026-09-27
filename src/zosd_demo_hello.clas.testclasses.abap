CLASS ltcl_hello DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS known_line FOR TESTING.
ENDCLASS.

CLASS ltcl_hello IMPLEMENTATION.
  METHOD known_line.
    cl_abap_unit_assert=>assert_equals(
      act = zosd_demo_hello=>greeting( )
      exp = 'Hello from ZOSD_DEMO_HELLO.' ).
  ENDMETHOD.
ENDCLASS.
