# 1. Hello

1. Open [ZOSD_DEMO_HELLO](../src/zosd_demo_hello.clas.abap), place the cursor in the class and press **F9**. Expected: the **osd console** shows `Hello from ZOSD_DEMO_HELLO.` With the extension 0.3.1370 F9 may toggle a breakpoint instead; from open-steamgate 0.4 on, F9 and F8 run as long as the debugger is not stopped at a line. On 0.3.1370, if F9 toggles a breakpoint, the ABAP debugger is attached: the extension attaches the debug session **`OSD: ABAP (<port>)`** when the running system has an enabled breakpoint in any `.abap` file (or was started with `osd.debug`), and while that session runs F9 toggles a breakpoint and F8 continues. Remove the ABAP breakpoints (**Run > Remove All Breakpoints**), then stop the session (**Run > Stop Debugging**, Shift+F5), and press F9 again; if it still toggles, check that the setting `osd.keymap` is `abap`.
2. Open Testing, expand **Workspace layers > osg-demo > ZOSD_DEMO_HELLO**, and run `known_line`; alternatively open the test include [zosd_demo_hello.clas.testclasses.abap](../src/zosd_demo_hello.clas.testclasses.abap) and press **Ctrl+Shift+F10** there (from 0.4 the class file works too; on 0.3.1370 it has no test items: `No test found in this file`). Expected: one green ABAP Unit test.
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
