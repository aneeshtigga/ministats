#!/usr/bin/env node
'use strict';

// Installer for ministats. Copies statusline.js into the Claude Code config
// dir and merges a statusLine entry into settings.json (backing it up first).
//
//   npx ministats              install
//   npx ministats --uninstall  remove
//   npx ministats --dry-run    show what would happen
//
// Pure stdlib, zero runtime deps. Works on macOS, Linux, Windows.

const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const UNINSTALL = args.includes('--uninstall') || args.includes('-u');
const FORCE = args.includes('--force');

function configDir() {
  const i = args.indexOf('--config-dir');
  if (i !== -1 && args[i + 1]) return expandHome(args[i + 1]);
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
function expandHome(p) { return p.replace(/^~/, os.homedir()); }

const DIR = configDir();
const SCRIPT_SRC = path.join(__dirname, '..', 'statusline.js');
const SCRIPT_DEST = path.join(DIR, 'ministats.js');
const SETTINGS = path.join(DIR, 'settings.json');

// Markers that identify our statusLine command across reinstalls. Includes the
// pre-1.0 "cc-statusline.js" name so an earlier install migrates cleanly.
const MARKERS = ['ministats.js', 'cc-statusline.js'];
function isOurs(cmd) { return MARKERS.some(m => cmd.includes(m)); }

function log(s) { process.stdout.write(s + '\n'); }
function warn(s) { process.stderr.write(s + '\n'); }

function readSettings() {
  if (!fs.existsSync(SETTINGS)) return {};
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); }
  catch (e) {
    warn(`error: ${SETTINGS} is not valid JSON — refusing to touch it.`);
    warn('       Fix the file (or move it aside) and re-run.');
    process.exit(1);
  }
}

function backup() {
  if (!fs.existsSync(SETTINGS)) return;
  const bak = SETTINGS + '.ministats.bak';
  // Preserve the first backup only — don't overwrite a known-good copy with an
  // already-modified file on a second run.
  if (!fs.existsSync(bak)) {
    if (!DRY) fs.copyFileSync(SETTINGS, bak);
    log(`  backed up settings.json → ${bak}`);
  }
}

function statusLineCommand() {
  // node resolves on PATH on every platform Claude Code supports. Quote the
  // path so spaces in the home dir (e.g. "C:\Users\Foo Bar") survive.
  return `node "${SCRIPT_DEST}"`;
}

function currentCommand(settings) {
  const sl = settings.statusLine;
  if (!sl) return null;
  return typeof sl === 'string' ? sl : (sl.command || '');
}

function install() {
  log('ministats installer');
  log(`  config dir: ${DIR}`);
  if (DRY) log('  (dry run — nothing will be written)');

  if (!fs.existsSync(SCRIPT_SRC)) {
    warn(`error: cannot find ${SCRIPT_SRC}`);
    process.exit(1);
  }
  if (!fs.existsSync(DIR)) {
    if (!DRY) fs.mkdirSync(DIR, { recursive: true });
    log(`  created ${DIR}`);
  }

  // 1. Copy the status line script.
  if (!DRY) fs.copyFileSync(SCRIPT_SRC, SCRIPT_DEST);
  log(`  installed ${SCRIPT_DEST}`);

  // 2. Merge settings.json.
  const settings = readSettings();
  const existing = currentCommand(settings);
  const cmd = statusLineCommand();

  if (existing && !isOurs(existing) && !FORCE) {
    log('');
    warn('  NOTE: you already have a statusLine configured:');
    warn(`        ${existing}`);
    warn('  Refusing to overwrite it. Re-run with --force to replace it,');
    warn('  or add this command to your existing status line manually:');
    warn(`        ${cmd}`);
    return;
  }

  // Clean up a stale pre-1.0 script file if we're migrating from it.
  if (existing && existing.includes('cc-statusline.js')) {
    const old = path.join(DIR, 'cc-statusline.js');
    if (fs.existsSync(old) && old !== SCRIPT_DEST && !DRY) {
      try { fs.unlinkSync(old); } catch (_) {}
    }
  }

  backup();
  settings.statusLine = { type: 'command', command: cmd };
  if (!DRY) {
    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  }
  log(`  wired statusLine in ${SETTINGS}`);
  log('');
  log('Done. Open a new Claude Code session (or wait for the next refresh).');
  log('Shows: model | effort | context bar | $cost  [+ caveman badge if active]');
}

function uninstall() {
  log('ministats uninstall');
  log(`  config dir: ${DIR}`);
  if (DRY) log('  (dry run — nothing will be written)');

  const settings = readSettings();
  const existing = currentCommand(settings);
  if (existing && isOurs(existing)) {
    backup();
    delete settings.statusLine;
    if (!DRY) fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
    log('  removed statusLine from settings.json');
  } else if (existing) {
    log('  statusLine present but not ours — leaving it alone');
  } else {
    log('  no statusLine configured — nothing to remove');
  }

  for (const name of ['ministats.js', 'cc-statusline.js']) {
    const p = path.join(DIR, name);
    if (fs.existsSync(p)) {
      if (!DRY) { try { fs.unlinkSync(p); } catch (_) {} }
      log(`  removed ${p}`);
    }
  }
  log('Done.');
}

if (UNINSTALL) uninstall();
else install();
