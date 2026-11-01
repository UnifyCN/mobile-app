# Allowance caption correction

R373-1 is resolved. The allowance uses the shared caption style at 13-point size and 18-point line height. The account and session controls are unchanged.

The independent review approved SPEC and STANDARDS with this typography nit. Its control failed on the original 12-point declaration. The same control passes after this correction: one selected case passed, 26 unrelated cases skipped. The result printed the rendered 13/18 style. The case also saved a task at the AI limit without a model request.

The test was temporary. Its exact source and output are retained here. This check uses React Native Testing Library. It does not prove device size, focus or screen-reader behavior. The broader reviewed checks remain supplied evidence.

COMPANION_ALLOWANCE_373_CAPTION_CORRECTED

Normal Mobile type checking passed. Changed-file ESLint passed with zero errors and no output. Both commands exited naturally with zero.
