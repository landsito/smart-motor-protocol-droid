'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse, stripLine } = require('../../src/parse');
const { lookup } = require('../../src/docs');
const grammar = require('../../scripts/build-grammar');

const fixtures = path.join(__dirname, '..', 'fixtures');
const fixture = (name) => fs.readFileSync(path.join(fixtures, name), 'utf8');

test('stripLine blanks comments and strings, keeping columns', () => {
  const line = `PRINT("IF 'x'",a) 'ENDIF`;
  const out = stripLine(line);
  assert.strictEqual(out.length, line.length);
  assert.ok(!/IF|ENDIF/.test(out));
  assert.ok(out.startsWith('PRINT("'));
});

test('labels, calls and subroutine ranges', () => {
  const r = parse(['x=1', 'GOSUB4', 'GOSUB(5)', 'END', '', "C4 'move", 'G', 'RETURN', '', 'C5', "' stop", 'X', 'RETURN', ''].join('\n'));
  assert.deepStrictEqual(r.labels.map((l) => [l.name, l.line, l.endLine, l.detail]),
    [['C4', 5, 7, 'move'], ['C5', 9, 12, 'stop']]);
  assert.deepStrictEqual(r.calls.map((c) => [c.name, c.line, c.callStart, c.start, c.end]),
    [['C4', 1, 0, 5, 6], ['C5', 2, 0, 6, 7]]);
  assert.deepStrictEqual(r.problems, []);
});

test('several statements on one line', () => {
  const r = parse('WHILE ABS(EA)<ee LOOP\nIF k<0  PRINT("x",#13)  END\nENDIF\nIF q==123 RETURN ENDIF');
  assert.deepStrictEqual(r.blocks.map((b) => [b.kind, b.line, b.endLine]), [['WHILE', 0, 0], ['IF', 1, 2], ['IF', 3, 3]]);
  assert.deepStrictEqual(r.problems, []);
});

test('nested blocks are matched', () => {
  const r = parse(['IF a', 'WHILE b', 'SWITCH c', 'CASE 1', 'BREAK', 'ENDS', 'LOOP', 'ELSE', 'ENDIF'].join('\n'));
  assert.deepStrictEqual(r.blocks.map((b) => b.kind), ['SWITCH', 'WHILE', 'IF']);
  assert.deepStrictEqual(r.problems, []);
});

test('unbalanced blocks are reported', () => {
  const messages = (text) => parse(text).problems.map((p) => p.message);
  assert.match(messages('IF a\nG')[0], /IF is never closed/);
  assert.match(messages('LOOP')[0], /LOOP without a matching WHILE/);
  assert.match(messages('ELSE')[0], /ELSE without a matching IF/);
  assert.match(messages('IF a\nLOOP\nENDIF')[0], /LOOP closes WHILE, but the open block is IF/);
  assert.match(messages('#ifdef X\nG')[0], /#if is never closed/);
});

test('undefined GOSUB target and duplicate labels', () => {
  const r = parse('GOSUB9\nGOTO(8)\nGOSUB(x)\nC1\nRETURN\nC1\nRETURN');
  assert.deepStrictEqual(r.problems.map((p) => [p.severity, p.line]), [['warning', 0], ['warning', 1], ['error', 5]]);
});

test('keywords inside strings and comments are ignored', () => {
  assert.deepStrictEqual(parse(`PRINT("IF WHILE",#13) ' SWITCH GOSUB9`).problems, []);
});

test('#define and #ifdef', () => {
  const r = parse('#define FindHome   GOSUB(100) \'home\n#ifdef CLASS_VER_5_0\nFindHome\n#endif\nC100\nRETURN');
  assert.deepStrictEqual(r.defines.map((d) => [d.name, d.value, d.line, d.start]), [['FindHome', 'GOSUB(100)', 0, 8]]);
  assert.deepStrictEqual(r.blocks.map((b) => [b.kind, b.line, b.endLine]), [['#if', 1, 3]]);
  assert.deepStrictEqual(r.problems, []);
});

test('the Developer\'s Guide examples parse without problems', () => {
  const files = fs.readdirSync(fixtures).filter((f) => f.endsWith('.sms'));
  assert.ok(files.length >= 20);
  for (const f of files) {
    const problems = parse(fixture(f)).problems;
    if (f === '15_cam_xy_circle.sms') {
      // The example as printed in the guide has one ENDIF too many.
      assert.deepStrictEqual(problems.map((p) => [p.line, p.message]), [[58, 'ENDIF without a matching IF.']], f);
    } else {
      assert.deepStrictEqual(problems, [], f);
    }
  }
});

test('hover lookup', () => {
  assert.match(lookup('PA'), /Position, Actual/);
  assert.match(lookup('PA'), /Report with `RPA`/);
  assert.match(lookup('SADDR2'), /Set Address/);
  assert.match(lookup('BAUD9600'), /BAUD Rate/);
  assert.match(lookup('GOSUB5'), /Subroutine Call/);
  assert.match(lookup('C10'), /Command Label[\s\S]*GOSUB\(10\)/);
  assert.match(lookup('RKP'), /^Reports `KP`[\s\S]*Proportional/);
  assert.match(lookup('Raa'), /^Reports `aa`/);
  assert.match(lookup('Zrs'), /Right Software Limit/);
  assert.match(lookup('vvv'), /32-Bit Variables/);
  assert.match(lookup('RETURN'), /Return From Subroutine/);
  assert.match(lookup('RES'), /Resolution/);
  assert.strictEqual(lookup('abc'), undefined);
  assert.strictEqual(lookup('RG'), undefined);
});

test('grammar file is up to date with src/commands.json', () => {
  const file = fs.readFileSync(path.join(__dirname, '..', '..', 'syntaxes', 'smartmotor.tmLanguage.json'), 'utf8');
  assert.strictEqual(file, grammar.text);
});
