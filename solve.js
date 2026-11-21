// Fast drop-in for csv-reader 1.0.0 (make.fun's own reference program): run(input) returns
// exactly csv-reader's reading of {text, header} as {columns, rows, errors}.
//
// Written from scratch against the kit's reference (baselines/csv-reader/vendor/csv-reader/index.js).
// Same policy, different engine: instead of building every field one character at a time, this
// parser slices whole fields out of the text in one pass, and only walks character by character
// where the policy forces it (a stray CR inside an unquoted field, or a line break / CR inside a
// quoted field). Quoted fields jump from quote to quote with indexOf.
//
// Policy recap (must match csv-reader 1.0.0 exactly):
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field opening with a quote runs to the next quote that is not doubled ("" is one quote,
//     each CRLF or lone CR inside it reads as LF); what follows its closing quote, up to the next
//     comma or line break, is appended as it stands (error quote_junk, when the field ends); a
//     quote that never closes is a literal character and the text after it is read again as
//     unquoted (error unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings;
//   - columns is the first record when header is true, else null; rows holds the records after
//     it, each padded with "" (short_row, with fields: its count) or cut (long_row, with extra:
//     the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met; line is the 1-based line its record
//     starts on (every LF, CRLF and lone CR inside quotes counted), row its record's index in
//     rows (null for the header).

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // How a field ended: 0 comma (the record goes on), 1 line break, 2 end of text (the record ends).
  const COMMA = 0;
  const BREAK = 1;
  const END = 2;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    // The record being read: the line it starts on and the index in rows it takes (null: the header).
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = COMMA;
    let quotedLast = false;

    do {
      let v; // this field's value
      let prefix = ''; // characters the unquoted scan below starts with ('' for a plain field)
      let junk = false; // the field closed its quote and junk follows it
      if (text.charCodeAt(pos) === 34) {
        quotedLast = true;
        // A field that opens with a quote.
        const open = pos;
        const openLine = line;
        let parts = null; // accumulated segments, only when "" escapes or CRs force it
        let p = open + 1; // start of the not-yet-consumed segment
        let value = '';
        let closed = false;
        for (;;) {
          const q = text.indexOf('"', p);
          if (q === -1) {
            // The quote never closes: it is a literal character, and the text after it is
            // read again as unquoted.
            pos = open + 1;
            line = openLine;
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            prefix = '"';
            break;
          }
          // Does the segment [p, q) hold a line break or a CR?
          const nl = text.indexOf('\n', p);
          const hasNl = nl !== -1 && nl < q;
          let hasCr = false;
          if (!hasNl) {
            const cr = text.indexOf('\r', p);
            hasCr = cr !== -1 && cr < q;
          }
          if (hasNl || hasCr) {
            // Slow walk over [p, q): CRLF and a lone CR each become one LF, lines counted.
            if (parts === null) parts = [];
            let i = p;
            let s = p;
            while (i < q) {
              const c = text.charCodeAt(i);
              if (c === 13) {
                parts.push(text.slice(s, i));
                parts.push('\n');
                line += 1;
                i += i + 1 < n && text.charCodeAt(i + 1) === 10 ? 2 : 1;
                s = i;
              } else if (c === 10) {
                parts.push(text.slice(s, i));
                parts.push('\n');
                line += 1;
                i += 1;
                s = i;
              } else {
                i += 1;
              }
            }
            parts.push(text.slice(s, q));
            p = q;
          }
          if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
            // A doubled quote: one literal quote, keep scanning.
            if (parts === null) parts = [];
            if (!hasNl && !hasCr) parts.push(text.slice(p, q));
            parts.push('"');
            p = q + 2;
            continue;
          }
          // The closing quote.
          if (parts === null) {
            value = text.slice(p, q);
          } else {
            if (!hasNl && !hasCr) parts.push(text.slice(p, q));
            value = parts.join('');
          }
          pos = q + 1;
          closed = true;
          break;
        }
        if (closed) {
          if (pos >= n) {
            v = value;
            ended = END;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              v = value;
              pos += 1;
              ended = COMMA;
            } else if (c === 10) {
              v = value;
              pos += 1;
              line += 1;
              ended = BREAK;
            } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
              v = value;
              pos += 2;
              line += 1;
              ended = BREAK;
            } else {
              // What follows the closing quote is appended as it stands, up to the next
              // comma or line break.
              prefix = value;
              junk = true;
            }
          }
          if (!junk) {
            fields.push(v);
            continue;
          }
        }
        // Unterminated quote, or junk after the closing quote: fall through to the
        // unquoted scan below, which reads from pos with `prefix` already in hand.
      } else {
        quotedLast = false;
        prefix = '';
      }

      // Reads unquoted characters onto `prefix` up to the next comma or line break: a CR
      // not followed by LF is dropped (stray_cr). Sets v and ended.
      let start = pos;
      let scan = pos;
      let hit = 3; // 0 comma, 1 LF, 2 CR, 3 end of text
      while (scan < n) {
        const c = text.charCodeAt(scan);
        if (c === 44) {
          hit = 0;
          break;
        }
        if (c === 10) {
          hit = 1;
          break;
        }
        if (c === 13) {
          hit = 2;
          break;
        }
        scan += 1;
      }
      if (hit === 3) {
        v = prefix + text.slice(start, n);
        pos = n;
        ended = END;
      } else if (hit === 0) {
        v = prefix + text.slice(start, scan);
        pos = scan + 1;
        ended = COMMA;
      } else if (hit === 1) {
        v = prefix + text.slice(start, scan);
        pos = scan + 1;
        line += 1;
        ended = BREAK;
      } else if (scan + 1 < n && text.charCodeAt(scan + 1) === 10) {
        v = prefix + text.slice(start, scan);
        pos = scan + 2;
        line += 1;
        ended = BREAK;
      } else {
        // A stray CR: drop it (and any later ones) and keep scanning, accumulating
        // the kept segments. Rare, so the extra work here costs nothing in bulk.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        let acc = prefix + text.slice(start, scan);
        pos = scan + 1;
        let s2 = pos;
        let scan2 = pos;
        for (;;) {
          while (scan2 < n) {
            const c = text.charCodeAt(scan2);
            if (c === 44 || c === 10 || c === 13) break;
            scan2 += 1;
          }
          if (scan2 >= n) {
            acc += text.slice(s2, n);
            pos = n;
            ended = END;
            break;
          }
          const c = text.charCodeAt(scan2);
          if (c === 44) {
            acc += text.slice(s2, scan2);
            pos = scan2 + 1;
            ended = COMMA;
            break;
          }
          if (c === 10) {
            acc += text.slice(s2, scan2);
            pos = scan2 + 1;
            line += 1;
            ended = BREAK;
            break;
          }
          if (scan2 + 1 < n && text.charCodeAt(scan2 + 1) === 10) {
            acc += text.slice(s2, scan2);
            pos = scan2 + 2;
            line += 1;
            ended = BREAK;
            break;
          }
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          acc += text.slice(s2, scan2);
          scan2 += 1;
          s2 = scan2;
        }
        v = acc;
      }
      if (junk && v.length > prefix.length) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      fields.push(v);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quotedLast) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
