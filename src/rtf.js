'use strict';
// SMI (the Animatics editor) can save programs as RTF, starting with
// {\rtf1\animaticsfile ...}. This turns them back into the program text.

const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer',
  'generator', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'listtable', 'listoverridetable']);

const cp1252 = new TextDecoder('windows-1252');

function isRtf(text) {
  return /^\s*\{\\rtf/.test(text);
}

function rtfToText(rtf) {
  let out = '';
  let skip = false;
  let uc = 1;            // characters to drop after a \uN
  let drop = 0;
  const stack = [];
  const re = /\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|(\r\n|\n|\r)|([^\\{}\r\n]+)/g;
  const emit = (s) => {
    if (skip) return;
    if (drop > 0) {
      const n = Math.min(drop, s.length);
      drop -= n;
      s = s.slice(n);
    }
    out += s;
  };

  for (const m of rtf.matchAll(re)) {
    const [, word, param, hex, symbol, brace, , chars] = m;
    if (word) {
      if (SKIP.has(word)) skip = true;
      else if (word === 'par' || word === 'line') emit('\n');
      else if (word === 'tab') emit('\t');
      else if (word === 'uc') uc = Number(param);
      else if (word === 'u') {
        let code = Number(param);
        if (code < 0) code += 65536;
        emit(String.fromCharCode(code));
        drop = uc;
      }
    } else if (hex) {
      emit(cp1252.decode(Uint8Array.of(parseInt(hex, 16))));
    } else if (symbol) {
      if (symbol === '*') skip = true;
      else if (symbol === '\\' || symbol === '{' || symbol === '}') emit(symbol);
      else if (symbol === '~') emit(' ');
      else if (symbol === '_') emit('-');
      else if (symbol === '\n' || symbol === '\r') emit('\n');
    } else if (brace === '{') {
      stack.push({ skip, uc });
    } else if (brace === '}') {
      ({ skip, uc } = stack.pop() || { skip: false, uc: 1 });
      if (!stack.length) break;   // end of the document; SMI may leave a NUL after it
    } else if (chars) {
      emit(chars);
    }
    // Line breaks in the RTF source itself mean nothing.
  }
  return out.replace(/\n+$/, '\n');
}

module.exports = { isRtf, rtfToText };
