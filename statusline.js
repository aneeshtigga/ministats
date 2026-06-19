#!/usr/bin/env node
'use strict';

// ministats — Claude Code status line: model · effort · context · cost, with
// an optional caveman badge. Reads the statusLine JSON blob on stdin (see
// https://code.claude.com/docs/en/statusline.md) and writes one line to stdout.
//
// Cross-platform: pure Node stdlib, no deps. Works wherever Claude Code runs.

const fs = require('fs');
const os = require('os');
const path = require('path');

// ── ANSI helpers ─────────────────────────────────────────────────────────────
// Disabled when NO_COLOR is set (https://no-color.org) so the line degrades to
// plain text in dumb terminals / logs.
const NO_COLOR = !!process.env.NO_COLOR;
const ESC = '\x1b';
function col(code, s) { return NO_COLOR ? s : `${ESC}[38;5;${code}m${s}${ESC}[0m`; }

const SEP = col(240, ' | ');

// Claude Code auto-compacts when context fills (~92%+ of the window by
// default). Warn a little before that so the user sees it coming. Override
// with MINISTATS_COMPACT_WARN.
const COMPACT_WARN_PCT = Number(process.env.MINISTATS_COMPACT_WARN) || 85;

// ── Number formatting ────────────────────────────────────────────────────────
function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

// Green < 50% full, yellow < 80%, red beyond.
function ctxColor(pct) {
  if (pct >= 80) return 196;
  if (pct >= 50) return 214;
  return 71;
}

// Effort tier color: hotter as the level climbs.
function powerColor(level) {
  switch (level) {
    case 'max':    return 198; // hot pink
    case 'xhigh':  return 208; // orange
    case 'high':   return 220; // yellow
    case 'medium': return 75;  // blue
    default:       return 244; // low / unknown — dim
  }
}

// Fixed-width fill bar, e.g. [███░░░░░░░]. `cells` segments, colored by fill.
function bar(pct, cells = 10) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * cells);
  const body = '█'.repeat(filled) + '░'.repeat(cells - filled);
  return col(ctxColor(clamped), `[${body}]`);
}

// ── Read stdin ───────────────────────────────────────────────────────────────
function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); }
  catch (_) { return ''; }
}

// ── Caveman badge (optional) ─────────────────────────────────────────────────
// Self-contained: reads the same flag file the caveman plugin writes, but does
// NOT depend on the plugin being installed. If the flag is absent or invalid,
// nothing is rendered. Hardened against symlink / oversized-file / escape-byte
// injection, matching the upstream caveman statusline scripts.
const CAVEMAN_MODES = new Set([
  'off', 'lite', 'full', 'ultra',
  'wenyan-lite', 'wenyan', 'wenyan-full', 'wenyan-ultra',
  'commit', 'review', 'compress',
]);

function configDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function readFlagFile(file) {
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || st.size > 64) return null; // refuse reparse / oversized
    let raw = fs.readFileSync(file, 'utf8');
    raw = raw.split(/\r?\n/)[0].trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    return raw || null;
  } catch (_) { return null; }
}

function cavemanBadge() {
  if (process.env.MINISTATS_NO_CAVEMAN === '1') return '';
  const dir = configDir();
  const mode = readFlagFile(path.join(dir, '.caveman-active'));
  if (!mode || !CAVEMAN_MODES.has(mode)) return '';

  let badge = (mode === 'full')
    ? col(172, '[CAVEMAN]')
    : col(172, `[CAVEMAN:${mode.toUpperCase()}]`);

  // Optional savings suffix written by caveman-stats. Same hardening.
  if (process.env.CAVEMAN_STATUSLINE_SAVINGS !== '0') {
    const suffixFile = path.join(dir, '.caveman-statusline-suffix');
    try {
      const st = fs.lstatSync(suffixFile);
      if (!st.isSymbolicLink() && st.size <= 64) {
        const sfx = fs.readFileSync(suffixFile, 'utf8').replace(/[\x00-\x1F]/g, '').trim();
        if (sfx) badge += ' ' + col(172, sfx);
      }
    } catch (_) {}
  }
  return badge;
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  let j = {};
  const raw = readStdin();
  if (raw) { try { j = JSON.parse(raw); } catch (_) { j = {}; } }

  const parts = [];

  const model = j.model && j.model.display_name;
  if (model) parts.push(col(75, model));

  // Reasoning effort level (absent when the model has no effort param).
  const effort = j.effort && j.effort.level;
  if (effort) parts.push(col(powerColor(effort), effort));

  const cw = j.context_window || {};
  const used = (cw.total_input_tokens || 0) + (cw.total_output_tokens || 0);
  if (used > 0) {
    const size = cw.context_window_size || 0;
    // Prefer the precomputed percentage; fall back to computing it ourselves.
    const pct = typeof cw.used_percentage === 'number' ? cw.used_percentage
              : size > 0 ? (used / size) * 100 : 0;
    let label = fmtTokens(used);
    if (size > 0) label += '/' + fmtTokens(size);
    if (pct > 0) label += ` ${Math.round(pct)}%`;
    // ⚠ once context is full enough that auto-compaction is near.
    if (pct >= COMPACT_WARN_PCT) label += ' ⚠';
    parts.push(bar(pct) + ' ' + col(ctxColor(pct), label));
  }

  // Cost is cumulative session USD. Bedrock/Vertex often report 0 (no pricing
  // table) — hide it then rather than show a misleading $0.00.
  const cost = j.cost && j.cost.total_cost_usd;
  if (typeof cost === 'number' && cost > 0) {
    parts.push(col(244, '$' + cost.toFixed(2)));
  }

  const badge = cavemanBadge();

  let line = parts.join(SEP);
  if (badge) line += (line ? ' ' : '') + badge;

  process.stdout.write(line);
}

main();
