'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { isRtf, rtfToText } = require('../../src/rtf');

const root = path.join(__dirname, '..');

test('detects RTF files', () => {
  assert.ok(isRtf('{\\rtf1\\animaticsfile\\ansi'));
  assert.ok(!isRtf("'Program\nEND\n"));
});

test('an SMI RTF file decodes to the program it holds', () => {
  // test/rtf/ holds a guide example saved the way SMI saves RTF: colors, bold, a NUL after the end
  const rtf = fs.readFileSync(path.join(root, 'rtf', 'move_back_and_forth_with_watch.sms'), 'latin1');
  const text = fs.readFileSync(path.join(root, 'fixtures', '02_move_back_and_forth_with_watch.sms'), 'utf8');
  assert.strictEqual(rtfToText(rtf), text);
});

test('escapes, symbols and skipped groups', () => {
  const rtf = '{\\rtf1\\ansi{\\fonttbl{\\f0 Courier New;}}{\\*\\generator SMI;}'
    + "\\uc1 a=1 '45\\'b0 \\{x\\}\\\\ \\u8364?\\tab b=2\\par\\b RETURN\\b0\\par}\x00junk";
  assert.strictEqual(rtfToText(rtf), "a=1 '45° {x}\\ €\tb=2\nRETURN\n");
});
