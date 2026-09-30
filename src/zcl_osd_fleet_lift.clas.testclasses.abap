* BEFORE and AFTER run on copies of the same rows and must leave them equal.
* The tests read the seeded fleet tables and write nothing.
CLASS ltcl_fleet_lift DEFINITION FINAL FOR TESTING
  DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS same
      IMPORTING it_voyages TYPE zcl_osd_fleet_lift=>tt_voyages
      RETURNING VALUE(rt_after) TYPE zcl_osd_fleet_lift=>tt_voyages.
    METHODS seeded_voyages FOR TESTING.
    METHODS a_miss_keeps_its_value FOR TESTING.
    METHODS the_same_ship_twice FOR TESTING.
    METHODS no_voyages FOR TESTING.
ENDCLASS.

CLASS ltcl_fleet_lift IMPLEMENTATION.
  METHOD same.
    DATA(lt_before) = it_voyages.
    rt_after = it_voyages.
    zcl_osd_fleet_lift=>before( CHANGING ct_voyages = lt_before ).
    zcl_osd_fleet_lift=>after( CHANGING ct_voyages = rt_after ).
    cl_abap_unit_assert=>assert_equals( exp = lt_before act = rt_after ).
  ENDMETHOD.

  METHOD seeded_voyages.
    DATA(lt_after) = same( zcl_osd_fleet_lift=>voyages( ) ).
    cl_abap_unit_assert=>assert_equals( exp = 20 act = lines( lt_after ) ).
    cl_abap_unit_assert=>assert_equals( exp = 'Albatross' act = lt_after[ 1 ]-ship_name ).
    LOOP AT lt_after INTO DATA(ls_voyage).
      cl_abap_unit_assert=>assert_not_initial( ls_voyage-ship_name ).
    ENDLOOP.
  ENDMETHOD.

  METHOD a_miss_keeps_its_value.
    DATA(lt_after) = same( VALUE #( ( voyage_id = 'X1' ship_id = 'S999' ship_name = 'kept' ) ) ).
    cl_abap_unit_assert=>assert_equals( exp = 'kept' act = lt_after[ 1 ]-ship_name ).
  ENDMETHOD.

  METHOD the_same_ship_twice.
    DATA(lt_after) = same( VALUE #(
      ( voyage_id = 'X1' ship_id = 'S001' )
      ( voyage_id = 'X2' ship_id = 'S001' ship_name = 'stale' ) ) ).
    cl_abap_unit_assert=>assert_equals( exp = 'Albatross' act = lt_after[ 1 ]-ship_name ).
    cl_abap_unit_assert=>assert_equals( exp = 'Albatross' act = lt_after[ 2 ]-ship_name ).
  ENDMETHOD.

  METHOD no_voyages.
    DATA(lt_after) = same( VALUE #( ) ).
    cl_abap_unit_assert=>assert_initial( lt_after ).
  ENDMETHOD.
ENDCLASS.
