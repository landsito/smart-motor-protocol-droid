# SmartMotor BASIC for VS Code

Language support for programs written for **Moog Animatics SmartMotor** servo
motors (Class 5 and later), saved as `.sms` files and loaded with the SMI
software.

## Features

- **Syntax highlighting** for the whole command set of the SmartMotor
  Developer's Guide: flow control, labels (`C10`), `GOSUB(n)` / `GOTO(n)`,
  motion commands, registers, status bits (`Bt`, `Be`, `Bls`, `B(0,2)`), bit
  resets (`ZS`, `Zr`), report commands (`RPA`, `RKP`, `Raa`), user variables
  (`a`..`zzz`) and arrays (`ab[]`, `aw[]`, `al[]`, `af[]`), Combitronic
  addresses (`G:0`, `EA:2`), character codes (`#13`) and the SMI preprocessor
  (`#define`, `#ifdef`, `#endif`).
- **Hovers** with the syntax, description and page of each command in the
  Developer's Guide, and the value of `#define` names.
- **Outline and breadcrumbs**: each `Cn` label is a symbol, described by its
  comment. `Ctrl+Shift+O` jumps between them.
- **Go to definition / find references** between `GOSUB(n)`, `GOTO(n)` and
  `Cn`, and for `#define` names.
- **Checks** for unbalanced `IF`/`ENDIF`, `WHILE`/`LOOP`, `SWITCH`/`ENDS` and
  `#ifdef`/`#endif`, duplicate labels, and `GOSUB`/`GOTO` to a label that is
  not in the file (`smartmotor.diagnostics.enable` turns them off).
- **Folding** of subroutines, blocks and comment headers.
- **Snippets**: `sub`, `if`, `ifelse`, `while`, `switch`, `moveabs`,
  `moverel`, `movevel`, `watch`, `print`, `tune`, `itr`, `define`.
- **Programs saved by SMI as RTF** (files that start with
  `{\rtf1\animaticsfile`) open as their program text, read-only and with all
  of the above. The editor title has **Save as Plain Text...** (it asks where,
  and suggests a new `<name>_text.sms`) and **Open RTF Source**. Set
  `smartmotor.rtf.openAsProgram` to `false` to be asked instead.
- `.sms` files get an engine icon in the explorer (with icon themes that
  have no icon of their own for them, such as the default Seti).
- Toggle comments with `Ctrl+/`.

```basic
EIGN(W,0)     'Disable hardware limits
ZS            'Clear faults
ADT=100       'Set maximum accel/decel
VT=100000     'Set maximum velocity
MP            'Set Position mode
C1            'Place a label
  PT=100000   'Set position
  G           'Start motion
  GOSUB(10)   'Call wait subroutine
  PT=0        'Set position
  G           'Start motion
  GOSUB(10)   'Call wait subroutine
  GOTO(1)     'Loop back to label 1
END           'Obligatory END (never reached)

C10
  WHILE Bt    'Loop while trajectory in progress
    IF ABS(EA)>100     'Test for excessive load
      PRINT("Excessive Load",#13)   'Print warning
    ENDIF
  LOOP
RETURN
```

*(From "Move Back and Forth with Watch", SmartMotor Developer's Guide.)*

## Notes on the language

- The language is case-sensitive: commands are upper case, user variables
  lower case.
- Labels `C0`..`C999` are called with `GOSUB(n)` (or `GOSUBn`) and return with
  `RETURN`; interrupt handlers return with `RETURNI`. A host can call any
  label, so labels that are never called in the file are not reported.
- Several commands can share a line: `MP PT=0 G TWAIT`.

## Development

```sh
npm install
npm test              # parser unit tests, grammar assertions and snapshots
npm run build:grammar # regenerate the grammar after editing src/commands.json
npx vsce package      # build smartmotor-basic-<version>.vsix
```

`src/commands.json` holds the command list of the Developer's Guide and is the
source for both the grammar and the hovers. `test/fixtures/` holds the example
programs of the guide. Press `F5` in VS Code to try the extension on them.

## License

MIT. SmartMotor is a trademark of Moog Inc. This extension is not affiliated
with Moog or Animatics.

Icon: [check engine icon from Flaticon](https://www.flaticon.com/free-icon/car_10440680),
recolored.
