'use strict';
// Hover text for SmartMotor BASIC, from the command list of the
// Moog Animatics SmartMotor Developer's Guide (src/commands.json).

const { commands } = require('./commands.json');

const byName = new Map();
for (const c of commands) {
  if (!byName.has(c.name)) byName.set(c.name, []);
  byName.get(c.name).push(c);
}

function describe(entries) {
  return entries.map((c) => {
    let text = `\`${c.syntax}\`: ${c.description}.`;
    if (c.report) text += ` Report with \`R${c.name}\`.`;
    return text + ` (Developer's Guide, p. ${c.page})`;
  }).join('\n\n');
}

function lookup(word) {
  if (byName.has(word)) return describe(byName.get(word));

  let m = word.match(/^([A-Z][A-Z_]*?)(\d+)$/);
  if (m && byName.has(m[1]) && byName.get(m[1]).some((c) => c.numbered)) return describe(byName.get(m[1]));
  if (m && (m[1] === 'GOSUB' || m[1] === 'GOTO')) return describe(byName.get(m[1]));

  m = word.match(/^C(\d+)$/);
  if (m) return describe(byName.get('C')) + `\n\nCalled with \`GOSUB${m[1]}\` or \`GOSUB(${m[1]})\`.`;

  m = word.match(/^R(.+)$/);
  if (m) {
    const target = byName.get(m[1]) || (/^([a-z])\1{0,2}$/.test(m[1]) ? variable(m[1]) : []);
    if (target.some((c) => c.report)) {
      return `Reports \`${m[1]}\` to the host.\n\n` + describe(target.filter((c) => c.report));
    }
  }

  if (/^([a-z])\1{0,2}$/.test(word)) return describe(variable(word));
  return undefined;
}

function variable(word) {
  const key = ['a...z', 'aa...zz', 'aaa...zzz'][word.length - 1];
  return byName.get(key) || [];
}

module.exports = { lookup };
