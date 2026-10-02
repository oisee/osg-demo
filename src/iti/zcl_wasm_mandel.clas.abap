CLASS zcl_wasm_mandel DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS constructor.
    METHODS mandel IMPORTING p0 TYPE i p1 TYPE i p2 TYPE i RETURNING VALUE(rv) TYPE i.
  PRIVATE SECTION.
    DATA mv_mem TYPE xstring.
    DATA mv_mem_pages TYPE i.
    DATA mv_g0 TYPE i.
    METHODS mem_ld_i32 IMPORTING iv_addr TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS mem_st_i32 IMPORTING iv_addr TYPE i iv_val TYPE i.
    METHODS mem_ld_i32_8u IMPORTING iv_addr TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS mem_ld_i32_8s IMPORTING iv_addr TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS mem_ld_i32_16u IMPORTING iv_addr TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS mem_st_i32_8 IMPORTING iv_addr TYPE i iv_val TYPE i.
    METHODS mem_st_i32_16 IMPORTING iv_addr TYPE i iv_val TYPE i.
    METHODS mem_grow IMPORTING iv_pages TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS mem_zero_pages IMPORTING iv_pages TYPE i RETURNING VALUE(rv_mem) TYPE xstring.
    METHODS i32_add IMPORTING iv_a TYPE i iv_b TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS i32_sub IMPORTING iv_a TYPE i iv_b TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS i32_mul IMPORTING iv_a TYPE i iv_b TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS and32 IMPORTING iv_a TYPE i iv_b TYPE i RETURNING VALUE(rv) TYPE i.
    METHODS gt_u64 IMPORTING iv_a TYPE int8 iv_b TYPE int8 RETURNING VALUE(rv) TYPE abap_bool.
    METHODS shr_u64 IMPORTING iv_val TYPE int8 iv_shift TYPE int8 RETURNING VALUE(rv) TYPE int8.
    METHODS wrap_i64 IMPORTING iv_val TYPE int8 RETURNING VALUE(rv) TYPE i.
ENDCLASS.
CLASS zcl_wasm_mandel IMPLEMENTATION.
  METHOD constructor.
    mv_mem_pages = 2.
    mv_mem = mem_zero_pages( 2 ).
    mv_g0 = 66560.
  ENDMETHOD.
  METHOD mem_zero_pages.
    DATA lv_chunk TYPE x LENGTH 256.
    DATA lv_page TYPE xstring.
    IF iv_pages = 0. RETURN. ENDIF.
    lv_page = lv_chunk.
    DO 8 TIMES.
      CONCATENATE lv_page lv_page INTO lv_page IN BYTE MODE.
    ENDDO.
    DO iv_pages TIMES.
      CONCATENATE rv_mem lv_page INTO rv_mem IN BYTE MODE.
    ENDDO.
  ENDMETHOD.
  METHOD mem_ld_i32.
    DATA lv_le TYPE x LENGTH 4.
    DATA lv_be TYPE x LENGTH 4.
    lv_le = mv_mem+iv_addr(4).
    lv_be+0(1) = lv_le+3(1).
    lv_be+1(1) = lv_le+2(1).
    lv_be+2(1) = lv_le+1(1).
    lv_be+3(1) = lv_le+0(1).
    rv = lv_be.
  ENDMETHOD.
  METHOD mem_st_i32.
    DATA lv_le TYPE x LENGTH 4.
    DATA lv_be TYPE x LENGTH 4.
    lv_be = iv_val.
    lv_le+0(1) = lv_be+3(1).
    lv_le+1(1) = lv_be+2(1).
    lv_le+2(1) = lv_be+1(1).
    lv_le+3(1) = lv_be+0(1).
    REPLACE SECTION OFFSET iv_addr LENGTH 4 OF mv_mem WITH lv_le IN BYTE MODE.
  ENDMETHOD.
  METHOD mem_ld_i32_8u.
    DATA lv_b TYPE x LENGTH 1.
    lv_b = mv_mem+iv_addr(1).
    rv = lv_b.
  ENDMETHOD.
  METHOD mem_ld_i32_8s.
    DATA lv_b TYPE x LENGTH 1.
    lv_b = mv_mem+iv_addr(1).
    rv = lv_b.
    IF rv > 127. rv = rv - 256. ENDIF.
  ENDMETHOD.
  METHOD mem_ld_i32_16u.
    DATA lv_le TYPE x LENGTH 2.
    DATA lv_be TYPE x LENGTH 2.
    lv_le = mv_mem+iv_addr(2).
    lv_be+0(1) = lv_le+1(1).
    lv_be+1(1) = lv_le+0(1).
    rv = lv_be.
  ENDMETHOD.
  METHOD mem_st_i32_8.
    DATA lv_b TYPE x LENGTH 1.
    lv_b = iv_val.
    REPLACE SECTION OFFSET iv_addr LENGTH 1 OF mv_mem WITH lv_b IN BYTE MODE.
  ENDMETHOD.
  METHOD mem_st_i32_16.
    DATA lv_le TYPE x LENGTH 2.
    DATA lv_be TYPE x LENGTH 2.
    lv_be = iv_val.
    lv_le+0(1) = lv_be+1(1).
    lv_le+1(1) = lv_be+0(1).
    REPLACE SECTION OFFSET iv_addr LENGTH 2 OF mv_mem WITH lv_le IN BYTE MODE.
  ENDMETHOD.
  METHOD mem_grow.
    IF iv_pages < 0.
      rv = -1.
      RETURN.
    ENDIF.
    IF iv_pages > 65536 - mv_mem_pages.
      rv = -1.
      RETURN.
    ENDIF.
    rv = mv_mem_pages.
    IF iv_pages = 0. RETURN. ENDIF.
    DATA lv_zeros TYPE xstring. lv_zeros = mem_zero_pages( iv_pages ).
    CONCATENATE mv_mem lv_zeros INTO mv_mem IN BYTE MODE.
    mv_mem_pages = mv_mem_pages + iv_pages.
  ENDMETHOD.
  METHOD i32_add.
    DATA lv_p TYPE p LENGTH 16 DECIMALS 0.
    lv_p = iv_a.
    lv_p = lv_p + iv_b.
    lv_p = lv_p MOD 4294967296.
    IF lv_p >= 2147483648.
      lv_p = lv_p - 4294967296.
    ENDIF.
    rv = lv_p.
  ENDMETHOD.
  METHOD i32_sub.
    DATA lv_p TYPE p LENGTH 16 DECIMALS 0.
    lv_p = iv_a.
    lv_p = lv_p - iv_b.
    lv_p = lv_p MOD 4294967296.
    IF lv_p >= 2147483648.
      lv_p = lv_p - 4294967296.
    ENDIF.
    rv = lv_p.
  ENDMETHOD.
  METHOD i32_mul.
    DATA lv_p TYPE p LENGTH 16 DECIMALS 0.
    lv_p = iv_a.
    lv_p = lv_p * iv_b.
    lv_p = lv_p MOD 4294967296.
    IF lv_p >= 2147483648.
      lv_p = lv_p - 4294967296.
    ENDIF.
    rv = lv_p.
  ENDMETHOD.
  METHOD and32.
    DATA lv_a TYPE x LENGTH 4. DATA lv_b TYPE x LENGTH 4. DATA lv_r TYPE x LENGTH 4.
    lv_a = iv_a. lv_b = iv_b.
    lv_r = lv_a BIT-AND lv_b.
    rv = lv_r.
  ENDMETHOD.
  METHOD gt_u64.
    DATA lv_a TYPE p LENGTH 16 DECIMALS 0.
    DATA lv_b TYPE p LENGTH 16 DECIMALS 0.
    lv_a = iv_a.
    lv_b = iv_b.
    IF lv_a < 0. lv_a = lv_a + 18446744073709551616. ENDIF.
    IF lv_b < 0. lv_b = lv_b + 18446744073709551616. ENDIF.
    IF lv_a > lv_b. rv = abap_true. ELSE. rv = abap_false. ENDIF.
  ENDMETHOD.
  METHOD shr_u64.
    DATA lv_bytes TYPE x LENGTH 8.
    DATA lv_byte TYPE x LENGTH 1.
    DATA lv_new TYPE x LENGTH 1.
    DATA lv_shift TYPE i.
    DATA lv_off TYPE i.
    DATA lv_num TYPE i.
    DATA lv_carry TYPE i.
    lv_bytes = iv_val.
    lv_shift = iv_shift MOD 64.
    DO lv_shift TIMES.
    lv_carry = 0.
    DO 8 TIMES.
    lv_off = sy-index - 1.
    lv_byte = lv_bytes+lv_off(1).
    lv_num = lv_byte.
    lv_new = lv_num DIV 2 + lv_carry.
    lv_carry = lv_num MOD 2 * 128.
    lv_bytes+lv_off(1) = lv_new.
    ENDDO.
    ENDDO.
    rv = lv_bytes.
  ENDMETHOD.
  METHOD wrap_i64.
    DATA lv_p TYPE p LENGTH 16 DECIMALS 0.
    lv_p = iv_val MOD 4294967296.
    IF lv_p >= 2147483648. lv_p = lv_p - 4294967296. ENDIF.
    rv = lv_p.
  ENDMETHOD.
  METHOD mandel.
    DATA:  l_p0 TYPE i, l_p1 TYPE i, l_p2 TYPE i, l3 TYPE i, l4 TYPE i, l5 TYPE i, l6 TYPE int8, l7 TYPE int8, l8 TYPE int8, l9 TYPE int8, s0 TYPE i, s0_i64 TYPE int8, s0_f TYPE f, s1 TYPE i, s1_i64 TYPE int8, s1_f TYPE f, s2 TYPE i,
       s2_i64 TYPE int8, s2_f TYPE f, s3 TYPE i, s3_i64 TYPE int8, s3_f TYPE f, s4 TYPE i, s4_i64 TYPE int8, s4_f TYPE f, s5 TYPE i, s5_i64 TYPE int8, s5_f TYPE f, s6 TYPE i, s6_i64 TYPE int8, s6_f TYPE f, s7 TYPE i, s7_i64 TYPE int8,
       s7_f TYPE f, s8 TYPE i, s8_i64 TYPE int8, s8_f TYPE f, s9 TYPE i, s9_i64 TYPE int8, s9_f TYPE f, s10 TYPE i, s10_i64 TYPE int8, s10_f TYPE f, s11 TYPE i, s11_i64 TYPE int8, s11_f TYPE f, s12 TYPE i, s12_i64 TYPE int8,
       s12_f TYPE f, lv_br TYPE i.
    l_p0 = p0.
    l_p1 = p1.
    l_p2 = p2.
    DO 1 TIMES.
      s0 = l_p2. s1 = 1. IF s0 >= s1. s0 = 1. ELSE. s0 = 0. ENDIF. IF s0 <> 0.
        lv_br = 1. EXIT.
      ENDIF. s0 = 0. rv = s0. RETURN.
    ENDDO. IF lv_br > 0 AND lv_br <> 999. lv_br = lv_br - 1. ELSEIF lv_br < 0. lv_br = lv_br + 1. ENDIF. IF lv_br <> 0. RETURN. ENDIF. s0 = 0. l3 = s0. s0 = 0. l4 = s0. s0 = 0. l5 = s0. DO 1 TIMES.
      DO.
        s0 = l3. s0_i64 = s0. l6 = s0_i64. s1_i64 = l6. s0_i64 = s0_i64 * s1_i64. s1_i64 = 16. s0_i64 = shr_u64( iv_val = s0_i64 iv_shift = s1_i64 ). l7 = s0_i64. s1 = l4. s1_i64 = s1. l8 = s1_i64. s2_i64 = l8. s1_i64 = s1_i64 * s2_i64.
        s2_i64 = 16. s1_i64 = shr_u64( iv_val = s1_i64 iv_shift = s2_i64 ). l9 = s1_i64. s0_i64 = s0_i64 + s1_i64. s1_i64 = 262144. IF gt_u64( iv_a = s0_i64 iv_b = s1_i64 ) = abap_true. s0 = 1. ELSE. s0 = 0. ENDIF. IF s0 <> 0.
          lv_br = 2. EXIT.
        ENDIF. s0_i64 = l7. s1_i64 = l9. s0_i64 = s0_i64 - s1_i64. s0 = wrap_i64( s0_i64 ). s1 = l_p0. s0 = i32_add( iv_a = s0 iv_b = s1 ). l3 = s0. s0_i64 = l6. s1_i64 = l8. s0_i64 = s0_i64 * s1_i64. s1_i64 = 15.
        s0_i64 = shr_u64( iv_val = s0_i64 iv_shift = s1_i64 ). s0 = wrap_i64( s0_i64 ). s1 = -2. s0 = and32( iv_a = s0 iv_b = s1 ). s1 = l_p1. s0 = i32_add( iv_a = s0 iv_b = s1 ). l4 = s0. s0 = l_p2. s1 = l5. s2 = 1.
        s1 = i32_add( iv_a = s1 iv_b = s2 ). l5 = s1. IF s0 <> s1. s0 = 1. ELSE. s0 = 0. ENDIF. IF s0 <> 0.
          CONTINUE.
        ENDIF. EXIT.
      ENDDO. IF lv_br > 0 AND lv_br <> 999. lv_br = lv_br - 1. ELSEIF lv_br < 0. lv_br = lv_br + 1. ENDIF. IF lv_br <> 0. EXIT. ENDIF. s0 = l_p2. l5 = s0.
    ENDDO. IF lv_br > 0 AND lv_br <> 999. lv_br = lv_br - 1. ELSEIF lv_br < 0. lv_br = lv_br + 1. ENDIF. IF lv_br <> 0. RETURN. ENDIF. s0 = l5. rv = s0.
  ENDMETHOD.
ENDCLASS.
