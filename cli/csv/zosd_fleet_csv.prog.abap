REPORT zosd_fleet_csv LINE-SIZE 72.

* Load a CSV from the frontend and show it as a simple list:
* the first line gives the column headings.

PARAMETERS p_file TYPE string LOWER CASE.

TYPES ty_cells TYPE STANDARD TABLE OF string WITH DEFAULT KEY.

DATA gt_lines  TYPE STANDARD TABLE OF string WITH DEFAULT KEY.
DATA gt_head   TYPE ty_cells.
DATA gt_cells  TYPE ty_cells.
DATA gt_width  TYPE STANDARD TABLE OF i WITH DEFAULT KEY.
DATA gv_line   TYPE string.
DATA gv_cell   TYPE string.
DATA gv_out    TYPE string.
DATA gv_len    TYPE i.
DATA gv_col    TYPE i.
DATA gv_rows   TYPE i.
DATA gv_cols   TYPE i.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.
  DATA lt_files  TYPE filetable.
  DATA lv_rc     TYPE i.
  DATA lv_action TYPE i.
  cl_gui_frontend_services=>file_open_dialog(
    EXPORTING window_title = 'Choose a CSV file'
              file_filter  = 'CSV (*.csv)|*.csv|All (*.*)|*.*'
    CHANGING  file_table   = lt_files
              rc           = lv_rc
              user_action  = lv_action ).
  IF lv_action = cl_gui_frontend_services=>action_ok AND lv_rc > 0.
    READ TABLE lt_files INDEX 1 INTO DATA(ls_file).
    p_file = ls_file-filename.
  ENDIF.

START-OF-SELECTION.
  cl_gui_frontend_services=>gui_upload(
    EXPORTING filename = p_file
              filetype = 'ASC'
    CHANGING  data_tab = gt_lines ).

  IF lines( gt_lines ) = 0.
    WRITE: / 'No data in', p_file.
    RETURN.
  ENDIF.

* Headings from the first line, and the width of every column
  READ TABLE gt_lines INDEX 1 INTO gv_line.
  SPLIT gv_line AT ',' INTO TABLE gt_head.
  gv_cols = lines( gt_head ).
  LOOP AT gt_head INTO gv_cell.
    gv_len = strlen( gv_cell ).
    APPEND gv_len TO gt_width.
  ENDLOOP.

  LOOP AT gt_lines INTO gv_line FROM 2.
    SPLIT gv_line AT ',' INTO TABLE gt_cells.
    LOOP AT gt_cells INTO gv_cell.
      gv_col = sy-tabix.
      gv_len = strlen( gv_cell ).
      READ TABLE gt_width INDEX gv_col INTO DATA(lv_width).
      IF sy-subrc = 0 AND gv_len > lv_width.
        MODIFY gt_width INDEX gv_col FROM gv_len.
      ENDIF.
    ENDLOOP.
  ENDLOOP.

  WRITE: / p_file.
  ULINE.

* Heading row
  FORMAT COLOR COL_HEADING INTENSIFIED ON.
  PERFORM write_row USING gt_head.
  FORMAT RESET.
  ULINE.

* Data rows
  LOOP AT gt_lines INTO gv_line FROM 2.
    SPLIT gv_line AT ',' INTO TABLE gt_cells.
    PERFORM write_row USING gt_cells.
    gv_rows = gv_rows + 1.
  ENDLOOP.
  ULINE.

  WRITE: / |{ gv_rows } rows, { gv_cols } columns|.

FORM write_row USING it_cells TYPE ty_cells.
  DATA lv_cell TYPE string.
  DATA lv_pad  TYPE i.
  CLEAR gv_out.
  LOOP AT gt_width INTO DATA(lv_w).
    CLEAR lv_cell.
    READ TABLE it_cells INDEX sy-tabix INTO lv_cell.
    lv_pad = lv_w - strlen( lv_cell ).
    gv_out = |{ gv_out }\| { lv_cell }{ repeat( val = ` ` occ = lv_pad ) } |.
  ENDLOOP.
  gv_out = |{ gv_out }\||.
  WRITE: / gv_out.
ENDFORM.
