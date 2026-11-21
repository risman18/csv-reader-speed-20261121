# csv-reader-speed-20261121

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` reads broken CSV files
exactly the way csv-reader does — same `{columns, rows, errors}` for every input — but
roughly 5x faster on the practice set (~93 ms vs ~492 ms for the 10.2 MB set).

How it stays identical: single left-to-right pass over the text, same broken-row policy as
csv-reader 1.0.0 (BOM drop, LF/CRLF record ends, `stray_cr`, quoted fields with `""` escapes
and CR/LF normalised to LF inside quotes, `quote_junk`, `unterminated_quote`, `short_row` /
`long_row` padding and cutting to the first record's width).

How it gets faster: instead of building every field one character at a time, it slices whole
fields out of the text and only walks character by character where the policy forces it (a
stray CR inside an unquoted field, or a line break / CR inside a quoted field). Quoted fields
jump from quote to quote with `indexOf`.

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/risman18/csv-reader-speed-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/risman18/csv-reader-speed-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Entered on [make.fun](https://make.fun/?ref=7trfcnag&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards
