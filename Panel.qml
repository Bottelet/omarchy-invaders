import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import QtQuick.Window
import qs.Commons
import qs.Ui

// Invaders for omarchy-shell. Summoned through the shell host:
//   omarchy-shell shell toggle bottelet.invaders
//
// This file is the cabinet, not the game. Everything that has to know about
// the shell lives here — window, keyboard focus, theme colours, settings and
// the high-score table on disk — and Game.qml stays pure QtQuick so it can
// run in a plain QML window (see shell.qml).
//
// `keepLoaded: true` in manifest.json matters: without it the host's Loader
// destroys this instance on hide, so closing the panel mid-wave would drop
// the game rather than pause it. Hidden, the game loop (Game.qml's
// FrameAnimation) stops with the window — no polling timer runs while the
// overlay is closed. The panel does keep two event-driven pieces alive at
// panel scope: two one-shot reads at startup (scores + theme palette) and a
// Connections handler that re-reads the palette on a theme change. Neither
// polls; both are idle between events.
Item {
    id: root

    property bool opened: false

    readonly property string selfId: "bottelet.invaders"

    // Injected by the shell host after the Loader resolves.
    property var shell: null
    onShellChanged: {
        if (!root.opened && root.shell && root.shell.openPanelIds
                && root.shell.openPanelIds[root.selfId] === true)
            root.open("{}")
    }

    // ---------------------------------------------------------------- theme

    // Omarchy themes routinely give shell surfaces an alpha; a play field you
    // can read the desktop through is unplayable, so everything is forced
    // opaque.
    function opaque(c) { return Qt.rgba(c.r, c.g, c.b, 1.0) }

    property color background: root.opaque(Color.menu.background)
    // The accent, not Color.menu.border: the menu border is a low-contrast
    // hairline that vanishes against a dark play field. Border.flat states
    // the edge outright instead of treating our colour as a fallback.
    property color border: root.opaque(Color.accent)
    property var borderSpec: Border.flat(root.border, root.frameWidth)
    readonly property int cornerRadius: Style.cornerRadius
    readonly property int frameWidth: 2

    // Row-band colours from the theme's named palette, which the Color
    // singleton does not expose enough of (it gives one accent, not five
    // distinct hues). Omarchy themes write colors.toml with NAMED keys
    // (accent, red, green, blue, magenta, cyan, yellow, ...), NOT color0..15 —
    // an ANSI-index parser matches nothing and leaves the grid monochrome, so
    // parse the names. The literal ~/.local/state path (not XDG_STATE_HOME)
    // deliberately matches the shell's own Color.qml, so we can never disagree
    // with the desktop about which theme is active.
    readonly property string themePath:
        Quickshell.env("HOME") + "/.local/state/omarchy/current/theme"

    // name -> #rrggbb, as read from colors.toml.
    property var themeColors: ({})

    function parseColors(text) {
        var found = {}
        var lines = String(text).split("\n")
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*["']?(#[0-9a-fA-F]{6})["']?/)
            if (m)
                found[m[1]] = m[2]
        }
        root.themeColors = found
    }

    // Row bands top to bottom: magenta, blue, cyan, green, yellow — five
    // distinct theme hues. Empty when the palette didn't parse; the game
    // then shades its accent colour instead.
    readonly property var rowColors: {
        var c = root.themeColors
        var pick = [c.magenta, c.blue, c.cyan, c.green, c.yellow]
        for (var i = 0; i < 5; i++)
            if (!pick[i]) return []   // incomplete palette → game shades accent
        return pick.map(function (h) { return root.opaque(Qt.color(h)) })
    }

    function reloadColors() {
        // Process re-runs only on a false->true edge.
        colorsLoader.running = false
        colorsLoader.running = true
    }

    // A theme switch is pushed to the shell's Color singleton over IPC, so
    // when its palette moves, re-read colors.toml for the ANSI bands the
    // singleton doesn't expose. (colorsLoader is defined with the readers,
    // below.)
    Connections {
        target: Color
        function onAccentChanged() { root.reloadColors() }
        function onBackgroundChanged() { root.reloadColors() }
    }

    // ------------------------------------------------------------- settings

    // Declared in manifest.barWidget.schema; the shell injects them into bar
    // widgets but not into panels, so the panel reads its own entry out of
    // the live shell config (searching bar.layout then plugins[], the same
    // order updateEntryInline searches) and writes in-game toggles back with
    // updateEntryInline — copying every other key forward, because it
    // replaces the whole entry.
    property bool soundEnabled: true
    property bool scanlines: true
    property int startingLives: 3

    function entrySettings() {
        var config = root.shell ? root.shell.shellConfig : null
        if (!config) return null
        var layout = config.bar && config.bar.layout ? config.bar.layout : null
        var sections = ["left", "center", "right"]
        for (var s = 0; layout && s < sections.length; s++) {
            var arr = layout[sections[s]] || []
            for (var i = 0; i < arr.length; i++)
                if (arr[i] && String(arr[i].id) === root.selfId) return arr[i]
        }
        var plugins = Array.isArray(config.plugins) ? config.plugins : []
        for (var j = 0; j < plugins.length; j++)
            if (plugins[j] && String(plugins[j].id) === root.selfId) return plugins[j]
        return null
    }

    function applySettingsObject(o) {
        if (!o) return
        if (typeof o.soundEnabled === "boolean") root.soundEnabled = o.soundEnabled
        if (typeof o.scanlines === "boolean") root.scanlines = o.scanlines
        var lives = parseInt(o.startingLives, 10)
        if (isFinite(lives)) root.startingLives = Math.max(1, Math.min(5, lives))
    }

    function persistSetting(key, value) {
        var entry = root.entrySettings()
        if (!entry || !root.shell
                || typeof root.shell.updateEntryInline !== "function")
            return
        var next = { id: root.selfId }
        for (var k in entry)
            if (k !== "id") next[k] = entry[k]
        next[key] = value
        root.shell.updateEntryInline(root.selfId, next)
    }

    // ------------------------------------------------------- self-registration

    // `omarchy plugin enable` only writes the bar.layout entry for a
    // panel+bar-widget plugin, so the keybinding dies with the bar icon
    // unless the plugin claims its own plugins[] entry. Upstream fix is
    // omarchy PR #6510; until it lands, self-register on first open.
    // Idempotent, jq-guarded, refuses symlinks.
    property bool selfRefEnsured: false
    readonly property string ensureSelfRefScript: [
        'umask 077',
        'id="$1"',
        'f="$HOME/.config/omarchy/shell.json"',
        '[ -f "$f" ] || exit 0',
        '[ -L "$f" ] && exit 0',
        'command -v jq >/dev/null 2>&1 || exit 0',
        // Serialize the whole read-modify-write against the shell's own
        // full-file rewrites of shell.json (and a concurrent `omarchy plugin
        // enable`) with an flock, so a racing writer can't lose this update.
        // Best-effort: skip the lock cleanly if flock is unavailable.',
        'if command -v flock >/dev/null 2>&1; then',
        '  exec 9>"$f.lock" || exit 0',
        '  flock -w 5 9 || exit 0',
        'fi',
        'jq -e --arg id "$id" \'any(.plugins[]?; (.id // empty) == $id)\' "$f" >/dev/null && exit 0',
        // mktemp, not a guessable "$f.suffix" name an attacker could
        // pre-create as a symlink before the write lands.
        'tmp="$(mktemp "$f.XXXXXX")" || exit 1',
        'jq --arg id "$id" \'.plugins = ((.plugins // []) + [{id: $id}])\' "$f" > "$tmp" || {',
        '  rm -f "$tmp"; exit 1;',
        '}',
        '[ -s "$tmp" ] || { rm -f "$tmp"; exit 1; }',
        'chmod --reference="$f" "$tmp" 2>/dev/null || true',
        'mv "$tmp" "$f"'
    ].join("\n")

    function ensureSelfReference() {
        if (root.selfRefEnsured) return
        root.selfRefEnsured = true
        Quickshell.execDetached(["sh", "-c", root.ensureSelfRefScript,
                                 "plugin-selfref", root.selfId])
    }

    // ---------------------------------------------------------- persistence

    // High scores are a record, not a preference: they live in the plugin's
    // own state file, not in settings.
    readonly property string stateDir:
        (Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state"))
        + "/omarchy-invaders"
    readonly property string statePath: root.stateDir + "/state.json"

    property var scores: []
    property bool stateLoaded: false

    // Ten rows of three letters and a number is a few hundred bytes;
    // anything near this cap was not written by the game.
    readonly property int stateCap: 65536

    function applyState(text) {
        // "!" means the path exists but the reader refused it (symlink, wrong
        // owner, non-regular, or oversized). Leave stateLoaded false so we
        // don't overwrite it: the symlink-safe writer would replace the trap
        // harmlessly, but declining is the conservative choice, and a genuine
        // first run (absent file → empty read) still enables saving below.
        if (text === "!")
            return
        try {
            if (text.length > root.stateCap) text = ""
            var o = JSON.parse(text)
            if (o && Array.isArray(o.scores)) {
                // Filter rather than trust: the file is hand-editable.
                var clean = []
                for (var i = 0; i < o.scores.length; i++) {
                    var e = o.scores[i]
                    if (e && typeof e.score === "number" && isFinite(e.score)
                            && typeof e.initials === "string")
                        clean.push({ initials: e.initials.toUpperCase()
                                                .replace(/[^A-Z]/g, "").substring(0, 3),
                                     score: Math.max(0, Math.floor(e.score)) })
                    if (clean.length >= 10) break
                }
                clean.sort(function (a, b) { return b.score - a.score })
                root.scores = clean.slice(0, 10)
            }
        } catch (e) {
            // A missing or corrupt file just means no scores yet.
        }
        root.stateLoaded = true
    }

    // The save goes through the same single-descriptor discipline as the read
    // rather than FileView's atomicWrites. QSaveFile (which backs it) resolves
    // the target and FOLLOWS a symlink planted at that path — the write lands
    // on the symlink's target and a dangling symlink creates a file at an
    // attacker-chosen location — and on this Qt version a freshly-created
    // atomic file is left mode 0000, which the reader then can't read. So we
    // open the state DIRECTORY with O_NOFOLLOW|O_DIRECTORY, verify it's ours,
    // create the temp inside it with mkstemp, fsync, fchmod 0600, and rename
    // WITHIN that directory fd — renameat never re-resolves the path and never
    // follows a symlink at the final component, so a symlink pre-planted at
    // state.json is replaced rather than followed.
    readonly property string stateWriteScript: [
        'import os, sys, stat, tempfile',
        'd, name, payload = sys.argv[1], sys.argv[2], sys.argv[3]',
        'os.makedirs(d, mode=0o700, exist_ok=True)',
        'try:',
        '    dfd = os.open(d, os.O_RDONLY | os.O_NOFOLLOW | os.O_DIRECTORY)',
        'except OSError:',
        '    sys.exit(0)',
        'try:',
        '    if os.fstat(dfd).st_uid != os.getuid(): sys.exit(0)',
        '    fd, tmp = tempfile.mkstemp(dir=d, prefix=".invaders-", suffix=".tmp")',
        '    tmpname = os.path.basename(tmp)',
        '    renamed = False',
        '    try:',
        '        try:',
        '            os.write(fd, payload.encode("utf-8"))',
        '            os.fsync(fd)',
        '            os.fchmod(fd, 0o600)',
        '        finally:',
        '            os.close(fd)',
        '        os.rename(tmpname, name, src_dir_fd=dfd, dst_dir_fd=dfd)',
        '        renamed = True',
        '        os.fsync(dfd)',   // durable rename: parent dir fsync'd after
        '    finally:',
        '        if not renamed:',   // never leak the temp on a failed write
        '            try:',
        '                os.unlink(tmpname, dir_fd=dfd)',
        '            except OSError:',
        '                pass',
        'finally:',
        '    os.close(dfd)'
    ].join("\n")

    function saveState() {
        if (!root.stateLoaded) return
        // Payload is small (ten rows of filtered A-Z initials + integers) and
        // fully sanitized; passed as an argv element, never a shell string.
        Quickshell.execDetached(["python3", "-c", root.stateWriteScript,
                                 root.stateDir, "state.json",
                                 JSON.stringify({ scores: root.scores }, null, 2)])
    }

    // Bounded single-descriptor reader, shared by the score file and the
    // theme palette. One open with O_NOFOLLOW|O_NONBLOCK (a symlinked file is
    // refused, a swapped-in FIFO or device can't block the open and isn't a
    // regular file), fstat on THAT fd for regular-file / size (and owner when
    // arg 3 is "1"), and at most cap+1 bytes read from the same fd — no
    // pathname is trusted twice, and a file that grew past the cap after the
    // stat yields nothing rather than a truncated parse. bash can't pass
    // open(2) flags, hence the python3 one-shot (python3 ships with Omarchy).
    // O_NOFOLLOW guards only the final component, so a legitimately symlinked
    // parent (the theme's `current` symlink) still resolves. Any refusal is an
    // empty read.
    // arg 3 ("own"): require the file be owned by us. arg 4 ("mark"): when
    // "1", emit a single "!" if the path EXISTS but is refused (symlink,
    // wrong owner, not a regular file, oversized) — as opposed to genuinely
    // absent, which stays empty. The score reader uses the mark so a refused
    // read is distinguishable from a first run; the theme reader does not.
    readonly property string readBoundedScript: [
        'import os, stat, sys',
        'p, cap, own = sys.argv[1], int(sys.argv[2]), sys.argv[3] == "1"',
        'mark = len(sys.argv) > 4 and sys.argv[4] == "1"',
        'try:',
        '    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)',
        'except OSError:',
        '    if mark and os.path.lexists(p): sys.stdout.write("!")',
        '    sys.exit(0)',
        'try:',
        '    st = os.fstat(fd)',
        '    bad = (not stat.S_ISREG(st.st_mode)) or (own and st.st_uid != os.getuid()) or (st.st_size > cap)',
        '    if bad:',
        '        if mark: sys.stdout.write("!")',
        '        sys.exit(0)',
        '    data = b""',
        '    while True:',
        '        remaining = cap + 1 - len(data)',
        '        if remaining <= 0: break',
        '        chunk = os.read(fd, min(65536, remaining))',
        '        if not chunk: break',
        '        data += chunk',
        '    if len(data) <= cap:',
        '        sys.stdout.buffer.write(data)',
        'finally:',
        '    os.close(fd)'
    ].join("\n")

    // The score file is OUR file, so own="1" (owner-checked) — and mark="1"
    // so a refused path is told apart from a first run. Contrast colorsLoader
    // below, which is own="0" ON PURPOSE: colors.toml belongs to the theme,
    // which may be a root-owned system theme, so owner-checking it would break
    // stock themes. The asymmetry is intentional; do not "fix" it by matching
    // them. O_NOFOLLOW + S_ISREG + the size cap are what guard the theme read.
    Process {
        id: stateLoader
        command: ["python3", "-c", root.readBoundedScript,
                  root.statePath, String(root.stateCap), "1", "1"]
        stdout: StdioCollector {
            onStreamFinished: root.applyState(this.text)
        }
    }

    // The theme palette. Bounded, single-descriptor, symlink-final-component
    // safe — the same reader, because colors.toml is third-party content
    // (themes are `git clone`d, so arbitrary size and symlinks are possible)
    // and the host reads it too. No owner check: system themes can be
    // root-owned. Re-run on a theme change (below) rather than held open on an
    // inotify watch — the file watch wouldn't see an IPC-pushed theme switch
    // anyway, which is what the Connections block is for.
    Process {
        id: colorsLoader
        command: ["python3", "-c", root.readBoundedScript,
                  root.themePath + "/colors.toml", "65536", "0"]
        stdout: StdioCollector {
            onStreamFinished: root.parseColors(this.text)
        }
    }

    Component.onCompleted: {
        stateLoader.running = true
        colorsLoader.running = true
    }

    // ----------------------------------------------------------- open/close

    readonly property int payloadCap: 65536

    function open(payloadJson) {
        // The persisted bar entry is the base; an explicit summon payload
        // overrides it key-by-key (applySettingsObject only touches keys it
        // finds), so a keybind summon with '{}' uses the saved settings while
        // a summon carrying values wins. Payload applied second = payload wins.
        root.applySettingsObject(root.entrySettings())
        try {
            var raw = String(payloadJson || "{}")
            if (raw.length <= root.payloadCap)
                root.applySettingsObject(JSON.parse(raw))
        } catch (e) {
            // A malformed payload opens the game with the persisted settings.
        }
        root.opened = true
        root.ensureSelfReference()
        Qt.callLater(function () { cabinet.focusGame() })
    }

    function close() {
        if (!root.opened) return
        root.opened = false
        if (root.shell && typeof root.shell.hide === "function")
            root.shell.hide(root.selfId)
    }

    function toggle() {
        if (root.opened) root.close(); else root.open("{}")
    }

    // -------------------------------------------------------------- window

    PanelWindow {
        id: panel
        visible: root.opened
        anchors { top: true; bottom: true; left: true; right: true }
        color: "transparent"
        WlrLayershell.namespace: "omarchy-invaders"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: root.opened ? WlrKeyboardFocus.Exclusive
                                                 : WlrKeyboardFocus.None
        exclusionMode: ExclusionMode.Ignore

        MouseArea {
            anchors.fill: parent
            onClicked: root.close()
        }

        BorderSurface {
            id: surface
            anchors.centerIn: parent
            width: cabinet.width + 2 * root.frameWidth + root.cornerRadius
            height: cabinet.height + 2 * root.frameWidth + root.cornerRadius
            radius: root.cornerRadius
            color: root.background
            borderSpec: root.borderSpec
            clip: true

            // Swallow clicks so they don't reach the close-on-click backdrop.
            MouseArea { anchors.fill: parent; onClicked: {} }

            Item {
                id: cabinet
                anchors.centerIn: parent

                // The cabinet is exactly the integer-scaled 224x256 stage:
                // pick the largest whole multiple that keeps the game at
                // ~80% of the free height, so the pixels stay square and the
                // cabinet never swallows the screen.
                readonly property real availW: panel.width - Style.gapsOut * 4
                readonly property real availH: panel.height - Style.bar.sizeHorizontal
                                               - Style.gapsOut * 4
                readonly property int gameZoom: Math.max(1, Math.min(
                    Math.floor(availH * 0.8 / 256),
                    Math.floor(availW * 0.9 / 224)))

                width: 224 * gameZoom
                height: 256 * gameZoom

                function focusGame() { game.forceActiveFocus() }

                Game {
                    id: game
                    anchors.fill: parent

                    // Explicitly stopped while hidden rather than relying on
                    // a hidden window not producing frames: "closing pauses
                    // the game" is a promise the README makes.
                    autoRun: root.opened

                    colBackground: root.opaque(Color.background)
                    colForeground: Color.foreground
                    colAccent: Color.accent
                    colUrgent: Color.urgent
                    colMuted: Color.muted
                    rowColors: root.rowColors

                    scores: root.scores
                    soundEnabled: root.soundEnabled
                    scanlines: root.scanlines
                    startingLives: root.startingLives

                    onScoresUpdated: function (list) {
                        root.scores = list
                        root.saveState()
                        // Mirror the top score into the bar entry so the
                        // widget's tooltip can show it without reading files.
                        if (list.length > 0)
                            root.persistSetting("highScore", list[0].score)
                    }
                    onSoundToggleRequested: {
                        root.soundEnabled = !root.soundEnabled
                        root.persistSetting("soundEnabled", root.soundEnabled)
                    }
                    onScanlinesToggleRequested: {
                        root.scanlines = !root.scanlines
                        root.persistSetting("scanlines", root.scanlines)
                    }
                    onQuitRequested: root.close()
                }
            }
        }
    }
}
