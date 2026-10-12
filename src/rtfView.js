'use strict';
// Programs that SMI saved as RTF open as a read-only view of the program text,
// with every language feature, and can be saved as a plain-text copy.
const vscode = require('vscode');
const path = require('path');
const { isRtf, rtfToText } = require('./rtf');

const SCHEME = 'smartmotor-rtf';
const latin1 = new TextDecoder('latin1');

// smartmotor-rtf:/dir/prog.sms?file  <->  file:///dir/prog.sms
const viewUri = (source) => source.with({ scheme: SCHEME, query: source.scheme });
const sourceUri = (view) => view.with({ scheme: view.query || 'file', query: '' });

class Provider {
  constructor() {
    this.emitter = new vscode.EventEmitter();
    this.onDidChange = this.emitter.event;
    this.watchers = new Map();
  }

  async provideTextDocumentContent(uri) {
    const source = sourceUri(uri);
    this.watch(source, uri);
    const text = latin1.decode(await vscode.workspace.fs.readFile(source));
    return isRtf(text) ? rtfToText(text) : text;
  }

  // Refresh the view when SMI (or anything else) saves the file again.
  watch(source, view) {
    const key = source.toString();
    if (this.watchers.has(key)) return;
    const dir = source.with({ path: path.posix.dirname(source.path) });
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, path.posix.basename(source.path)));
    watcher.onDidChange(() => this.emitter.fire(view));
    this.watchers.set(key, watcher);
  }

  dispose() {
    this.emitter.dispose();
    this.watchers.forEach((w) => w.dispose());
  }
}

function isRtfDocument(document) {
  return document.uri.scheme !== SCHEME && /\.sms$/i.test(document.uri.path) && isRtf(document.getText(new vscode.Range(0, 0, 0, 20)));
}

// Show the program text in place of the RTF source, closing the RTF tab if it has no unsaved changes.
async function openAsCode(source) {
  const raw = vscode.window.activeTextEditor;
  source = source || (raw && raw.document.uri);
  if (!source) return;
  if (source.scheme === SCHEME) source = sourceUri(source);
  const column = raw && raw.document.uri.toString() === source.toString() ? raw.viewColumn : undefined;
  const document = await vscode.workspace.openTextDocument(viewUri(source));
  await vscode.window.showTextDocument(document, { viewColumn: column, preview: false });
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === source.toString() && !tab.isDirty) {
        await vscode.window.tabGroups.close(tab);
      }
    }
  }
}

async function openSource(view) {
  view = view || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri);
  if (!view || view.scheme !== SCHEME) return;
  keepSource.add(sourceUri(view).toString());   // asked for the RTF: do not swap it for the program
  await vscode.window.showTextDocument(sourceUri(view), { preview: false });
}

async function saveAsPlainText(view) {
  view = view || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri);
  if (!view) return;
  if (view.scheme !== SCHEME) view = viewUri(view);
  const source = sourceUri(view);
  const text = (await vscode.workspace.openTextDocument(view)).getText();
  const name = path.posix.basename(source.path).replace(/\.sms$/i, '');
  const target = await vscode.window.showSaveDialog({
    defaultUri: source.with({ path: path.posix.join(path.posix.dirname(source.path), `${name}_text.sms`) }),
    filters: { 'SmartMotor program': ['sms'] },
    saveLabel: 'Save as plain text',
  });
  if (!target) return;
  if (target.toString() === source.toString()) {
    const answer = await vscode.window.showWarningMessage(
      `Replace the RTF file ${name}.sms with plain text? SMI will lose its colors and formatting for this file.`,
      { modal: true }, 'Replace');
    if (answer !== 'Replace') return;
  }
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(text));
  await vscode.window.showTextDocument(target, { preview: false });
}

// RTF files opened on purpose with Open RTF Source, while their tab is open.
const keepSource = new Set();
// Files being swapped for their program view right now.
const opening = new Set();

function register(context) {
  const provider = new Provider();

  const maybeOpen = (editor) => {
    if (!editor || !isRtfDocument(editor.document)) return;
    const key = editor.document.uri.toString();
    if (keepSource.has(key) || opening.has(key)) return;
    if (vscode.workspace.getConfiguration('smartmotor', editor.document.uri).get('rtf.openAsProgram', true)) {
      opening.add(key);
      openAsCode(editor.document.uri).finally(() => opening.delete(key));
    } else {
      keepSource.add(key);
      vscode.window.showInformationMessage(`${path.posix.basename(editor.document.uri.path)} was saved by SMI as RTF.`, 'Open as program')
        .then((choice) => choice && openAsCode(editor.document.uri));
    }
  };

  context.subscriptions.push(
    provider,
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
    vscode.commands.registerCommand('smartmotor.openRtfAsProgram', (uri) => openAsCode(uri)),
    vscode.commands.registerCommand('smartmotor.openRtfSource', (uri) => openSource(uri)),
    vscode.commands.registerCommand('smartmotor.saveAsPlainText', (uri) => saveAsPlainText(uri)),
    vscode.window.onDidChangeActiveTextEditor(maybeOpen),
    // Once its tab is closed, an RTF file opens as a program again next time.
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      for (const tab of e.closed) {
        if (tab.input instanceof vscode.TabInputText) keepSource.delete(tab.input.uri.toString());
      }
    }),
  );
  maybeOpen(vscode.window.activeTextEditor);
}

module.exports = { register, SCHEME };
