import QtQuick
import Quickshell
import Quickshell.Io

// Standalone development harness:  qs -p /path/to/invaders
//
// Runs Game.qml — which is pure QtQuick on purpose — in a plain floating
// window, so the march rhythm can be tuned without restarting the shell.
//
// The real cabinet (Panel.qml) gets its base colours from the shell's Color
// singleton, which only exists inside omarchy-shell. This harness has no
// Color singleton, so it reads the live theme's colors.toml directly and
// themes the game the same way — that's why `qs -p` still recolours to your
// desktop theme. Omarchy themes use NAMED keys (accent, red, green, blue,
// magenta, cyan, yellow, foreground, background), not color0..15.
ShellRoot {
    id: harness

    property var tc: ({})

    function parseColors(text) {
        var found = {}
        var lines = String(text).split("\n")
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*["']?(#[0-9a-fA-F]{6})["']?/)
            if (m)
                found[m[1]] = m[2]
        }
        harness.tc = found
    }

    function opaque(hex, fallback) {
        var h = hex || fallback
        var c = Qt.color(h)
        return Qt.rgba(c.r, c.g, c.b, 1.0)
    }

    readonly property string themePath:
        Quickshell.env("HOME") + "/.local/state/omarchy/current/theme"

    readonly property var rowColors: {
        var c = harness.tc
        var pick = [c.magenta, c.blue, c.cyan, c.green, c.yellow]
        for (var i = 0; i < 5; i++)
            if (!pick[i]) return []
        return pick.map(function (h) { return harness.opaque(h) })
    }

    FileView {
        path: harness.themePath + "/colors.toml"
        watchChanges: true
        printErrors: false
        onLoaded: harness.parseColors(text())
        onFileChanged: reload()
    }

    FloatingWindow {
        id: win
        title: "Invaders (dev)"
        implicitWidth: 224 * 3
        implicitHeight: 256 * 3
        color: harness.opaque(harness.tc.background, "#101315")
        visible: true

        Game {
            id: game
            anchors.fill: parent
            autoRun: win.visible

            // Live theme, read straight from colors.toml.
            colBackground: harness.opaque(harness.tc.background, "#101315")
            colForeground: harness.opaque(harness.tc.foreground, "#cacccc")
            colAccent:     harness.opaque(harness.tc.accent, "#7aa2f7")
            colUrgent:     harness.opaque(harness.tc.red, "#a55555")
            colMuted:      harness.opaque(harness.tc.muted, "#707880")
            rowColors:     harness.rowColors

            onQuitRequested: Qt.quit()
            Component.onCompleted: {
                forceActiveFocus()
                if (Quickshell.env("INVADERS_AUTOSTART") === "1")
                    game.startGame()
                if (Quickshell.env("INVADERS_PREVIEW") === "1") {
                    game.startGame()
                    var eng = game.engine
                    var dir = 1
                    for (var i = 0; i < 60 * 34; i++) {
                        var px = eng.state.player.x
                        if (px >= 190) dir = -1
                        else if (px <= 12) dir = 1
                        eng.setInput(dir < 0, dir > 0)
                        var under = false
                        var xs = eng.constants.BUNKER_XS
                        for (var b = 0; b < xs.length; b++)
                            if (px + 13 > xs[b] - 2 && px < xs[b] + 24)
                                under = true
                        if (!under)
                            eng.fire()
                        eng.step(1 / 60)
                        if (eng.state.phase === "over")
                            break
                        if (eng.state.ufo && i > 60 * 26
                                && eng.state.ufo.x > 90 && eng.state.ufo.x < 150)
                            break
                    }
                }
            }
        }
    }
}
