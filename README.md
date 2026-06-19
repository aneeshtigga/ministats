# ministats

A tiny [Claude Code](https://code.claude.com) status line that shows model,
reasoning effort, a context-usage bar, and session cost — at a glance:

```
Opus 4.8 | high | [███░░░░░░░] 345.0k/1.0M 35% | $1.23  [CAVEMAN]
```

- **Model** — current model display name
- **Effort** — reasoning effort level (low/medium/high/xhigh/max), color hotter
  as it climbs. Hidden when the model has no effort parameter.
- **Context** — a fill bar plus tokens used / window size and percent full
  (green → yellow → red as it fills). A `⚠` appears once the context is close
  to triggering auto-compaction, so you can wrap up or `/compact` on your terms.
- **Cost** — cumulative session cost in USD (hidden when the provider reports
  `$0`, e.g. AWS Bedrock / Google Vertex, which don't send pricing)
- **Caveman badge** — shown only if the
  [caveman](https://github.com/JuliusBrussee/caveman) plugin is active; a
  harmless no-op otherwise

## Install

```sh
npx ministats
```

That copies the script into your Claude Code config dir (`~/.claude` or
`$CLAUDE_CONFIG_DIR`) and adds a `statusLine` entry to `settings.json`. Your
existing `settings.json` is backed up first, and the installer refuses to
overwrite a status line you already configured (pass `--force` to replace it).

Open a new session — or wait for the next status-line refresh — to see it.

### Options

```sh
npx ministats --dry-run        # show what would happen, write nothing
npx ministats --force          # replace an existing statusLine
npx ministats --config-dir DIR # target a non-default config dir
npx ministats --uninstall      # remove it
```

## Manual install (no npm)

1. Copy `statusline.js` to `~/.claude/ministats.js`.
2. Add to `~/.claude/settings.json`:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node \"/absolute/path/to/.claude/ministats.js\""
     }
   }
   ```

   (Use an absolute path; `~` is not expanded by the shell here on all platforms.)

## Environment variables

- `NO_COLOR=1` — disable ANSI colors
- `MINISTATS_NO_CAVEMAN=1` — never render the caveman badge
- `MINISTATS_COMPACT_WARN=N` — percent at which the `⚠` appears (default `85`)

## Notes

- **Context tokens are the current context-window usage**, not cumulative
  session tokens. This is the "how full is my context" gauge, read straight
  from the data Claude Code passes in — no transcript parsing, no per-keystroke
  lag.
- Requires Node ≥ 18 (already a Claude Code dependency).

## License

MIT © Aneesh Tigga
