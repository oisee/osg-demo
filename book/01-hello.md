# 1. Hello

1. Open [ZOSD_DEMO_HELLO](../src/zosd_demo_hello.clas.abap), place the cursor in the class and press **F9**. Expected: the **osd console** shows `Hello from ZOSD_DEMO_HELLO.` If F9 toggles a breakpoint instead, the debugger is stopped at a line: remove the ABAP breakpoints (**Run > Remove All Breakpoints**), stop the session (**Run > Stop Debugging**, Shift+F5) and press F9 again; if it still toggles, check that the setting `osd.keymap` is `abap`.

   ![F9 on ZOSD_DEMO_HELLO: the greeting in osd console and OSD jobs idle](img/vscode-classrun.png)

2. Open Testing, expand **Workspace layers > osg-demo > ZOSD_DEMO_HELLO**, and run `known_line`; alternatively open the test include [zosd_demo_hello.clas.testclasses.abap](../src/zosd_demo_hello.clas.testclasses.abap) and press **Ctrl+Shift+F10** there, or in the class itself. Expected: one green ABAP Unit test.

   ![Ctrl+Shift+F10: one green ABAP Unit test and the supervised jobs worker idle](img/vscode-testing.png)

3. Change the text returned by `greeting( )`, press **Ctrl+F2** to check, **Ctrl+F3** to save and activate, then **F9** again. Expected: the console shows your new text. Restore the original text, activate, and rerun the test to leave it green.

## Under the hood

The class returns its line from one method; its classrun prints it:

<!-- code: src/zosd_demo_hello.clas.abap method greeting -->
```abap
METHOD greeting.
  rv_text = 'Hello from ZOSD_DEMO_HELLO.'.
ENDMETHOD.
```

Its test pins the line:

<!-- code: src/zosd_demo_hello.clas.testclasses.abap method known_line -->
```abap
METHOD known_line.
  cl_abap_unit_assert=>assert_equals(
    act = zosd_demo_hello=>greeting( )
    exp = 'Hello from ZOSD_DEMO_HELLO.' ).
ENDMETHOD.
```
