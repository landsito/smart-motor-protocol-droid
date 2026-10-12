'use strict';
const vscode = require('vscode');
const { parse, stripLine } = require('./parse');
const { lookup } = require('./docs');

const LANGUAGE = 'smartmotor';
const cache = new WeakMap();

function parsed(document) {
  const hit = cache.get(document);
  if (hit && hit.version === document.version) return hit.result;
  const result = parse(document.getText());
  cache.set(document, { version: document.version, result });
  return result;
}

function wordAt(document, position) {
  const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
  return range && { range, word: document.getText(range) };
}

// Label under the cursor: a Cn label, or the target of GOSUBn / GOSUB(n) / GOTO.
function labelFor(document, position) {
  const call = parsed(document).calls.find((c) => c.line === position.line
    && c.callStart <= position.character && position.character <= c.end);
  if (call) return call.name;
  const hit = wordAt(document, position);
  return hit && /^C\d+$/.test(hit.word) ? hit.word : undefined;
}

function defineFor(document, position) {
  const hit = wordAt(document, position);
  return hit && parsed(document).defines.find((d) => d.name === hit.word);
}

const symbols = {
  provideDocumentSymbols(document) {
    const { labels } = parsed(document);
    const out = [];
    if (labels.length && labels[0].line > 0) {
      const range = new vscode.Range(0, 0, labels[0].line - 1, 0);
      out.push(new vscode.DocumentSymbol('main', 'program start', vscode.SymbolKind.Module, range, new vscode.Range(0, 0, 0, 0)));
    }
    for (const label of labels) {
      const range = new vscode.Range(label.line, 0, label.endLine, document.lineAt(label.endLine).text.length);
      const start = document.lineAt(label.line).text.indexOf(label.name);
      const selection = new vscode.Range(label.line, start, label.line, start + label.name.length);
      out.push(new vscode.DocumentSymbol(label.name, label.detail, vscode.SymbolKind.Function, range, selection));
    }
    return out;
  },
};

const definitions = {
  provideDefinition(document, position) {
    const define = defineFor(document, position);
    if (define) return new vscode.Location(document.uri, new vscode.Range(define.line, define.start, define.line, define.end));
    const name = labelFor(document, position);
    const label = name && parsed(document).labels.find((l) => l.name === name);
    if (!label) return undefined;
    const start = document.lineAt(label.line).text.indexOf(name);
    return new vscode.Location(document.uri, new vscode.Range(label.line, start, label.line, start + name.length));
  },
};

const references = {
  provideReferences(document, position, context) {
    const name = labelFor(document, position);
    if (!name) return undefined;
    const { labels, calls } = parsed(document);
    const out = calls.filter((c) => c.name === name)
      .map((c) => new vscode.Location(document.uri, new vscode.Range(c.line, c.callStart, c.line, c.end)));
    if (context.includeDeclaration) {
      const label = labels.find((l) => l.name === name);
      if (label) out.unshift(definitions.provideDefinition(document, new vscode.Position(label.line, document.lineAt(label.line).text.indexOf(name))));
    }
    return out;
  },
};

const hovers = {
  provideHover(document, position) {
    const hit = wordAt(document, position);
    const define = hit && defineFor(document, position);
    if (define) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock(`#define ${define.name} ${define.value}`, 'smartmotor');
      return new vscode.Hover(md, hit.range);
    }
    // On the number of GOSUB(n) there is no word: describe the label instead.
    const name = labelFor(document, position);
    const word = hit && (/^(GOSUB|GOTO|C)\d*$/.test(hit.word) || !name) ? hit.word : name;
    const text = word && lookup(word);
    if (!text) return undefined;
    const md = new vscode.MarkdownString(text);
    const label = name && parsed(document).labels.find((l) => l.name === name);
    if (label && label.detail) md.appendMarkdown(`\n\n**${label.name}**: ${label.detail}`);
    return new vscode.Hover(md, hit ? hit.range : undefined);
  },
};

const folding = {
  provideFoldingRanges(document) {
    const { lines, labels, blocks } = parsed(document);
    const out = [];
    for (const label of labels) {
      if (label.endLine > label.line) out.push(new vscode.FoldingRange(label.line, label.endLine));
    }
    for (const block of blocks) {
      if (block.endLine - 1 > block.line) out.push(new vscode.FoldingRange(block.line, block.endLine - 1));
    }
    // Runs of comment lines (headers)
    let start = -1;
    lines.forEach((line, n) => {
      const comment = /^\s*'/.test(line);
      if (comment && start < 0) start = n;
      if (!comment && start >= 0) {
        if (n - 1 > start) out.push(new vscode.FoldingRange(start, n - 1, vscode.FoldingRangeKind.Comment));
        start = -1;
      }
    });
    if (start >= 0 && lines.length - 1 > start) out.push(new vscode.FoldingRange(start, lines.length - 1, vscode.FoldingRangeKind.Comment));
    return out;
  },
};

// Names created with #define, wherever they are used.
const legend = new vscode.SemanticTokensLegend(['macro'], []);
const semantic = {
  provideDocumentSemanticTokens(document) {
    const { lines, defines } = parsed(document);
    const builder = new vscode.SemanticTokensBuilder(legend);
    if (!defines.length) return builder.build();
    const names = new Set(defines.map((d) => d.name));
    lines.forEach((raw, n) => {
      if (/^\s*#/.test(raw)) return;
      for (const m of stripLine(raw).matchAll(/[A-Za-z0-9_]+/g)) {
        if (names.has(m[0])) builder.push(n, m.index, m[0].length, 0, 0);
      }
    });
    return builder.build();
  },
};

function activate(context) {
  const selector = { language: LANGUAGE };
  const diagnostics = vscode.languages.createDiagnosticCollection(LANGUAGE);

  const lint = (document) => {
    if (document.languageId !== LANGUAGE) return;
    if (!vscode.workspace.getConfiguration('smartmotor', document.uri).get('diagnostics.enable', true)) {
      diagnostics.delete(document.uri);
      return;
    }
    diagnostics.set(document.uri, parsed(document).problems.map((p) => {
      const d = new vscode.Diagnostic(new vscode.Range(p.line, p.start, p.line, p.end), p.message,
        p.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
      d.source = 'smartmotor';
      return d;
    }));
  };

  context.subscriptions.push(
    diagnostics,
    vscode.languages.registerDocumentSymbolProvider(selector, symbols),
    vscode.languages.registerDefinitionProvider(selector, definitions),
    vscode.languages.registerReferenceProvider(selector, references),
    vscode.languages.registerHoverProvider(selector, hovers),
    vscode.languages.registerFoldingRangeProvider(selector, folding),
    vscode.languages.registerDocumentSemanticTokensProvider(selector, semantic, legend),
    vscode.workspace.onDidOpenTextDocument(lint),
    vscode.workspace.onDidChangeTextDocument((e) => lint(e.document)),
    vscode.workspace.onDidCloseTextDocument((d) => diagnostics.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('smartmotor')) vscode.workspace.textDocuments.forEach(lint);
    }),
  );
  vscode.workspace.textDocuments.forEach(lint);
}

function deactivate() {}

module.exports = { activate, deactivate };
