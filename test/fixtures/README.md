# Test fixtures

These programs are the example programs in "Part 3: Example SmartMotor
Programs" of the *Moog Animatics SmartMotor Developer's Guide* (Rev. T,
pages 887-917), copied as printed, one file per example:
https://www.animatics.com/wp-content/uploads/Moog-Animatics-SmartMotor-DevelopersGuide-Manual-en.pdf

`15_cam_xy_circle.sms` has one `ENDIF` more than `IF`s, as in the guide; the
tests expect the extension to report it.

The `.snap` files are grammar snapshots (`npm run test:snap-update` refreshes
them after an intended grammar change).
