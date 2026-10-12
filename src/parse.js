'use strict';
// Plain parser for SmartMotor BASIC (Class 5) programs. No dependency on the
// vscode API, so it can be unit-tested with node.

const LABEL = /^\s*C(\d+)\s*(?:'.*)?$/;
const CALL = /\b(GOSUB|GOTO)(?:(\d+)\b|\s*\(\s*(\d+)\s*\))/g;
const WORD = /\b[A-Z]+\b/g;
const DEFINE = /^\s*#define\s+(\S+)\s*(.*)$/;
const DIRECTIVE = /^\s*#(ifdef|ifndef|if|elif|else|endif)\b/;

const OPENERS = { IF: 'ENDIF', WHILE: 'LOOP', SWITCH: 'ENDS', '#if': '#endif' };
const CLOSERS = { ENDIF: 'IF', LOOP: 'WHILE', ENDS: 'SWITCH', '#endif': '#if' };

// Blank out comments and string contents, keeping columns.
function stripLine(line) {
  let out = '';
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      out += ch === '"' ? ch : ' ';
      if (ch === '"') inString = false;
    } else if (ch === '"') {
      out += ch;
      inString = true;
    } else if (ch === "'") {
      return out + ' '.repeat(line.length - i);
    } else {
      out += ch;
    }
  }
  return out;
}

// Comment on the label line, or the first comment right under it, used as the description.
function describe(lines, from) {
  const inline = lines[from].match(/'\s*(.*?)\s*$/);
  if (inline && inline[1]) return inline[1];
  for (let i = from + 1; i < Math.min(lines.length, from + 6); i++) {
    const m = lines[i].match(/^\s*'\s*([^*=\s].*?)\s*$/);
    if (m) return m[1];
    if (stripLine(lines[i]).trim()) break;
  }
  return '';
}

function parse(text) {
  const lines = text.split(/\r?\n/);
  const labels = [];          // { name, number, line, endLine, detail }
  const calls = [];           // { name, number, kind, line, start, end }
  const defines = [];         // { name, value, line, start, end }
  const blocks = [];          // { kind, line, endLine }
  const problems = [];        // { severity, message, line, start, end }
  const stack = [];
  const seen = new Map();

  const open = (kind, span) => stack.push({ kind, ...span });
  const close = (word, span) => {
    const top = stack[stack.length - 1];
    if (top && top.kind === CLOSERS[word]) {
      stack.pop();
      blocks.push({ kind: top.kind, line: top.line, endLine: span.line });
    } else if (top) {
      problems.push({ severity: 'error',
        message: `${word} closes ${CLOSERS[word]}, but the open block is ${top.kind} (line ${top.line + 1}), which needs ${OPENERS[top.kind]}.`,
        ...span });
    } else {
      problems.push({ severity: 'error', message: `${word} without a matching ${CLOSERS[word]}.`, ...span });
    }
  };

  lines.forEach((raw, n) => {
    const line = stripLine(raw);

    const label = raw.match(LABEL);
    if (label) {
      const name = 'C' + label[1];
      const start = raw.indexOf(name);
      if (seen.has(name)) {
        problems.push({ severity: 'error', message: `Label ${name} is already defined on line ${seen.get(name) + 1}.`,
          line: n, start, end: start + name.length });
      } else {
        seen.set(name, n);
      }
      labels.push({ name, number: Number(label[1]), line: n, endLine: n, detail: describe(lines, n) });
      return;
    }

    for (const m of line.matchAll(CALL)) {
      const number = m[2] || m[3];
      const start = m.index + m[0].lastIndexOf(number);
      calls.push({ name: 'C' + number, number: Number(number), kind: m[1], line: n,
        callStart: m.index, start, end: start + number.length });
    }

    // Preprocessor lines take part in #ifdef/#endif nesting only.
    const define = line.match(DEFINE);
    if (define) {
      const start = raw.indexOf(define[1], raw.indexOf('#define') + 7);
      defines.push({ name: define[1], value: stripLine(define[2]).trim(), line: n, start, end: start + define[1].length });
      return;
    }
    const directive = line.match(DIRECTIVE);
    if (directive) {
      const start = raw.indexOf('#');
      const span = { line: n, start, end: start + 1 + directive[1].length };
      if (directive[1].startsWith('if')) open('#if', span);
      else if (directive[1] === 'endif') close('#endif', span);
      return;
    }

    for (const m of line.matchAll(WORD)) {
      const word = m[0];
      const span = { line: n, start: m.index, end: m.index + word.length };
      if (OPENERS[word]) {
        open(word, span);
      } else if (word === 'ELSE' || word === 'ELSEIF') {
        const top = stack[stack.length - 1];
        if (!top || top.kind !== 'IF') {
          problems.push({ severity: 'error', message: `${word} without a matching IF.`, ...span });
        }
      } else if (CLOSERS[word]) {
        close(word, span);
      }
    }
  });

  for (const block of stack) {
    problems.push({ severity: 'error', message: `${block.kind} is never closed (missing ${OPENERS[block.kind]}).`,
      line: block.line, start: block.start, end: block.end });
  }

  for (const call of calls) {
    if (!seen.has(call.name)) {
      problems.push({ severity: 'warning', message: `${call.kind} ${call.number}: label ${call.name} is not defined in this file.`,
        line: call.line, start: call.callStart, end: call.end });
    }
  }

  // A subroutine runs from its label to the line before the next label,
  // without trailing blank or comment-only lines.
  labels.forEach((label, i) => {
    let end = i + 1 < labels.length ? labels[i + 1].line - 1 : lines.length - 1;
    while (end > label.line && !stripLine(lines[end]).trim()) end--;
    label.endLine = end;
  });

  problems.sort((a, b) => a.line - b.line || a.start - b.start);
  return { lines, labels, calls, defines, blocks, problems };
}

module.exports = { parse, stripLine };
