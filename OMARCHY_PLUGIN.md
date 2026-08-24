# Invaders — plugin engineering log

## M0 — study findings (2026-08-24)

Read before writing code: Quattroids + Quattro Command (28allday), Neon Cadet
(ya-luotao), Omarchy Breakout (acrogenesis), Flappy Pipes (eduardodallecort).
Decisions below follow the majority pattern; deviations are argued inline.

### Overlay window type — PanelWindow + WlrLayershell (majority: 3 of 5)

Quattroids, Quattro Command and Flappy Pipes all use the same shape, and it is
the one we copy:

- `manifest.json`: `kinds: ["panel", "bar-widget"]`, `keepLoaded: true`.
  (Neon Cadet uses the newer `"overlay"` kind; both work, but `panel` is the
  majority and what the two closest cousins ship. Breakout's `FloatingWindow`
  + hyprctl positioning is the outlier nobody else copied.)
- Panel.qml root is a plain `Item` — NOT a window. The shell's loader injects
  writable `shell` (and possibly `manifest`) properties and calls conventional
  functions: `open(payloadJson)`, `close()`, `toggle()`. No IpcHandler needed.
- The window is a child `PanelWindow` with `visible: root.opened`, all four
  anchors, `color: "transparent"`, `WlrLayershell.layer: WlrLayer.Overlay`,
  `WlrLayershell.keyboardFocus:` Exclusive while opened / None while closed,
  `exclusionMode: ExclusionMode.Ignore`.
- Any self-initiated dismissal (Esc, click-away) must go through
  `shell.hide(selfId)` or the host's open-flag desyncs and the next toggle
  no-ops. Self-restore on host rebuild via `onShellChanged` checking
  `shell.openPanelIds[selfId]`.
- `keepLoaded: true` is load-bearing: without it the loader destroys the
  instance on hide and closing mid-wave drops the game instead of pausing it.
- Full-window MouseArea behind the cabinet closes on click; the cabinet
  swallows clicks with an empty-handler MouseArea.
- `panel` kind mounts once per session; bar widgets instantiate per screen.
  All game state lives in the panel, none in the widget (Flappy Pipes
  documents the per-screen-simulation race this avoids).

### Game loop — FrameAnimation, gated, clamped (unanimous)

Every studied game uses `FrameAnimation`, never `Timer`:

```qml
FrameAnimation {
    running: game.visible && game.autoRun   // autoRun bound to root.opened
    onTriggered: game.step(Math.min(frameTime, 0.05))
}
```

- Stops dead when the overlay closes — this is what satisfies the
  zero-timers-when-closed guardrail. Quattroids meets that bar strictly;
  Neon Cadet does not (decorative infinite animators keep spinning) — we
  follow Quattroids: no `Animation.Infinite` anywhere, no resident timers,
  static bar widget.
- dt clamp at 50 ms so a stalled compositor frame can't teleport entities.
- `autoRun` exists so a headless harness can drive `step()` at fixed dt.
- Quattro Command gotcha adopted: `onAutoRunChanged: if (!autoRun)
  sound.stopAll()` — a looping SoundEffect keeps droning after the window
  hides (the UFO warble would).

### Rendering — Canvas, integer-scaled pixel grid (our variant of the majority)

Majority pattern is Canvas 2D with one `requestPaint()` per tick (Quattroids:
single field canvas; Quattro Command and Breakout: static backdrop canvas +
per-frame field canvas). Neon Cadet mixes a painted-once Canvas with QML items
for movers; Flappy Pipes is pure QML items.

Ours: the two vector games rasterize big canvases; we are a *pixel grid*, and
that makes the cheap path cheaper — the Canvas renders at the original's
logical 224×256 (57k pixels, trivial to repaint at 60 fps) and is scaled up as
an Item by an **integer** factor with `smooth: false`, so every logical pixel
is a crisp square. No shaders. Scanlines (M3) are a cheap semi-transparent
line overlay, not Quattro Command's five-pass .qsb chain — that is an
author flourish, and the spec's battery guardrail says no.

Module rules (28allday convention, documented in their file headers, adopted):

- Game rules live in plain JS with **no QML/Quickshell imports**, testable in
  Node. We use Breakout's dual-export style (`module.exports` guard at the
  foot of each file) so CI is plain `node --test`.
- Mutable state modules are imported by Game.qml and nowhere else (a second
  importer silently gets a second empty game). Stateless helpers may be
  `.pragma library`.
- Run state the HUD needs (score, lives, wave) is mirrored onto QML
  properties each frame — bindings cannot watch plain JS objects.
- Game.qml stays free of Quickshell imports so it runs in a bare QML window;
  Panel.qml owns everything shell-specific (window, focus, theme,
  persistence).

### Theme colors — Color singletons + colors.toml for the row bands

- Base: `qs.Commons` `Color` singletons (`background/foreground/accent/
  urgent/muted`), passed into Game as color properties; live bindings mean a
  theme switch recolors mid-game with no extra work (Quattroids proves it).
- Row-band accents: the Color singleton doesn't expose enough distinct
  accents for five row bands, so we adopt Quattro Command's proven mechanism:
  `FileView` on `~/.local/state/omarchy/current/theme/colors.toml`
  (`watchChanges: true`) parsing the 16 ANSI colors all-or-nothing, PLUS
  `Connections` on `Color.accentChanged/backgroundChanged` calling
  `reload()` — theme switches arrive over IPC, the file watch alone misses
  them. Fallback to derived Color-singleton tones if parsing fails.
- Force colors opaque (`Qt.rgba(c.r,c.g,c.b,1)`) — themes give shell
  surfaces alpha and a see-through play field is unplayable (Quattroids
  shipped that bug once).
- Border: `Border.flat(Color.accent, 2)`, not `Border.surfaceSpec(...)`
  (whose args are theme-overridable fallbacks) and not `Color.menu.border`
  (invisible hairline against a dark field).
- Canvas colors must be `Qt.color`-normalized strings or real colors —
  canvas silently discards malformed values.

### Sound — synthesized WAVs + Loader-isolated SoundEffect bank (28allday pattern)

- `audio/make_sounds.py`, Python stdlib only (`math/random/struct/wave`),
  44100 Hz 16-bit mono, each sound a `generator(t, p)` closure, seeded RNG,
  loop sounds cross-faded at the seam (`looped(generator, fade)`). WAVs are
  committed so `omarchy plugin add` (a git clone, no build step) plays sound.
  **Everything synthesized — nothing sampled. This is the legal posture.**
- Playback: Sound.qml (no QtMultimedia import; public play/startLoop/
  stopLoop/stopAll no-op when unavailable) loads SoundBank.qml through a
  `Loader` — qt6-multimedia is not a Quickshell dependency, and a failed
  import takes down its whole document, so the import lives in a document
  nothing else depends on. Game runs silent, never crashes.
- SoundBank: `SoundEffect` (not MediaPlayer), 3 voices per one-shot used
  round-robin (play() on a playing effect restarts instead of layering),
  single looping voice for the UFO warble. Pool assembled in locals and
  assigned once — bindings don't fire on in-place `var` mutation (shipped a
  silent game at 28allday once).
- Neon Cadet's per-sound `execDetached pw-play` rejected: a process spawn
  per heartbeat note at last-alien tempo is exactly the stutter the spec
  forbids.

### Persistence — state.json under XDG state (Quattroids pattern, incl. hardening)

- `$XDG_STATE_HOME`-or-`~/.local/state` + `/omarchy-invaders/state.json`.
- Read AND write go through a shared python3 single-descriptor helper, not
  `FileView atomicWrites` (which is backed by QSaveFile — it follows a symlink
  planted at the target and, on current Qt, leaves a freshly-created file mode
  0000; a peer QSaveFile probe confirmed both on this machine). Read: `os.open`
  with `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`, `fstat` for regular-file / owner /
  ≤cap size, at most cap+1 bytes from the same fd; a symlink or FIFO is
  refused and the path that exists-but-is-refused returns a `!` sentinel so a
  trap is distinguishable from a first run (`stateLoaded` stays false, saves
  decline). Write: `O_NOFOLLOW|O_DIRECTORY` on the state dir (created 0700),
  `mkstemp` inside it, `fsync`, `fchmod 0600`, `renameat` within that dir fd —
  a symlink pre-planted at state.json is replaced, never followed. Every score
  row is still validated (A–Z initials, finite non-negative integers) rather
  than trusted, capped at ten.
- Host owns the data; the game emits `scoresUpdated`/`*Requested` signals
  and never assigns to its own bound properties (assignment would break the
  binding and silently stop persistence).
- High scores are a record, not a preference (Flappy Pipes' rule) — they
  live here, not in settings.

### Settings — manifest schema on barWidget, payload into the panel (Neon Cadet)

- Declared under `barWidget.schema` (`integer` with min/max/step, `boolean`
  with `defaultValue`) per Neon Cadet — the only studied game with declared
  settings. Spec §7: `soundEnabled`, `scanlines`, `startingLives`.
- The shell injects `setting(key, fallback)` into bar widgets but NOT into
  panels, so the panel reads its own `shell.json` entry via `shell.shellConfig`
  traversal (both `bar.layout.*` and `plugins[]`, in that order) as the base,
  and writes in-game toggles back via `shell.updateEntryInline`, copying every
  other key forward (it replaces the whole entry) and forcing `id` back to
  `selfId` so it can't touch another plugin's entry — subtleties documented in
  Flappy Pipes.
- The bar widget summons with a literal `'{}'` payload today (it holds no
  settings itself); the panel loads its persisted entry as the base and lets
  any explicit payload keys override, so a future value-carrying summon wins
  while `'{}'` uses the saved settings, then defaults.

### Bar widget — static glyph launcher (unanimous)

`BarWidget` subclass with `moduleName` = plugin id, a `WidgetButton`/
`BarIconButton` with a Nerd Font glyph (`String.fromCodePoint` — `\u`
escapes truncate above U+FFFF), `tooltipText` carrying the high score,
click → `bar.shell.toggle(moduleName, payload)` with a function guard,
falling back to `bar.run("omarchy-shell shell toggle <id>")` (the exact IPC
route a keybinding uses). Nothing runs while closed.

### Self-registration workaround (28allday, both games)

`omarchy plugin enable` writes only the bar.layout entry for a
panel+bar-widget plugin, so the keybinding dies if the bar icon is removed
(upstream fix pending, omarchy PR #6510). On first open, append
`{"id": "bottelet.invaders"}` to `plugins[]` in `~/.config/omarchy/shell.json`
via a jq-guarded, `umask 077`, idempotent script (extends the 28allday
pattern): it declines a symlinked `shell.json` (`[ -L ]` — belt-and-suspenders,
since the final `mv`/`rename(2)` replaces a symlink rather than following it),
writes to an unpredictable `mktemp` name, and takes an `flock` on a READ-ONLY fd of the
existing shell.json (never a separate predictable .lock path, which a planted
symlink could clobber). Drop when #6510 lands.

### Testing + CI (Breakout + Flappy Pipes)

- Engine/renderer/audio-routing in dependency-free JS with `module.exports`
  guards; tests in `tests/` run with Node's built-in `node --test` runner —
  zero dependencies, no package.json.
- CI (GitHub Actions): manifest JSON parse; `node --check` each JS file;
  the test suite; plus Flappy Pipes' "listable" job replicating the
  marketplace's daily re-validation (README+LICENSE exist, schemaVersion/id/
  license/author/description present, every entry point file exists, tag ==
  manifest version, **no symlinks anywhere**, exactly one `preview.*`).
- `qmllint` / `omarchy plugin validate` deliberately not in CI — they need
  the shell's QML modules; validate runs locally at every milestone gate.
- A 13-line `shell.qml` dev harness (`ShellRoot` + `Loader` + `open("{}")`)
  allows `qs -p <repo>` standalone runs; Loader source must stay inside the
  config root (parent-dir sources are silently blackholed).

### Naming / legal (Neon Cadet formula, adopted verbatim in shape)

Invented name ("Invaders" — id `bottelet.invaders`) + "in the spirit of the
1978 arcade classic". The original's title never appears as our identity.
All sprites are original pixel data authored in this repo; all audio is
synthesized by `audio/make_sounds.py`. Nothing sampled, nothing traced.

### Decisions log

| Decision | Choice | Why |
|---|---|---|
| Manifest kinds | `panel` + `bar-widget`, `keepLoaded: true` | majority; closing pauses mid-wave game |
| Window | PanelWindow + WlrLayershell Overlay, exclusive kb focus while open | majority |
| Loop | FrameAnimation, `visible && autoRun`, dt≤0.05; engine consumes fixed 60 Hz sub-steps | unanimous mechanism; fixed sub-steps make march timing frame-exact like 1978 |
| Rendering | one Canvas at logical 224×256, integer-scaled Item, `smooth: false` | pixel grid; trivial repaint cost; crisp chunk |
| Engine | pure JS, `module.exports` guard, Node-testable | Breakout's proven CI path |
| Theme | Color singletons + colors.toml ANSI for row bands, opaque-forced | Quattro Command's proven live-recolor mechanism |
| Audio | make_sounds.py → committed WAVs; Loader-isolated SoundEffect bank | legal + degrades to silence, no crash |
| Scores | state.json, bounded read, atomic write, validated rows | Quattroids incl. hardening |
| Settings | barWidget.schema + summon payload + shellConfig read | Neon Cadet + Flappy Pipes mechanics |
| Scanlines | translucent line overlay, toggleable | spec's battery guardrail; no shaders |

## Build log

### 2026-08-24 — M0 done; M1–M3 code complete, gates pending

- Engine (`game/Engine.js`), renderer (`game/Renderer.js`), sprites/font
  (`game/Sprites.js`) written as pure JS; 28 Node tests green
  (`node --test tests/*.test.js`): march law, beat-per-pass, one-bullet rule,
  bunker erosion from both directions and by marching aliens, death/respawn,
  saucer table, extra life, invasion, 10-minute random soak, pacifist-run
  termination.
- Sound bank synthesized (`audio/make_sounds.py`, 10 WAVs committed).
- `omarchy plugin validate` clean. Smoke-tested in the standalone harness
  (`qs -p .`): loads with zero QML errors, plays at 60 fps, drop-ripple and
  erosion verified visually from screenshots.
- `preview.png` is a genuine mid-game frame produced by the harness's
  INVADERS_PREVIEW fast-forward (real simulated play, no staging).
- Still owed before marketplace: **manual play gates** — M1 (full wave, last-
  alien sprint feel), M2 (side-by-side rhythm comparison with footage of the
  original), M3 (mid-game theme switch inside the real shell, since qs.Commons
  only exists there → install via `omarchy plugin add`, restart-shell to
  reload) — plus a GitHub repo, fresh-machine install test, and marketplace
  submission (HANCORE-linux issue template, category matching Quattroids).

## March mechanism (the authenticity core, decided up front)

The original moved **one alien per 60 Hz frame** — the grid is a ripple, not
a block, and the march speed scales with survivors *automatically*: a full
pass takes N frames where N = live aliens, so 55 aliens step ~once a second
and the last alien sprints at 60 steps/sec. We reproduce exactly that: the
engine runs a fixed 60 Hz accumulator; each tick advances one live alien by
2 logical px (and swaps its animation frame). Edge contact during a pass
arms a drop; the next pass reverses direction and drops the grid 8 px. The
four-note heartbeat advances one note per completed pass, so the beat
accelerates with the march because they are the same clock. No hand-tuned
speed table to get wrong.
