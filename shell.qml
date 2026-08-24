import QtQuick
import Quickshell

// Standalone development harness:  qs -p /path/to/invaders
//
// Runs Game.qml — which is pure QtQuick on purpose — in a plain floating
// window, so the march rhythm can be tuned without restarting the shell.
// Panel.qml (the real cabinet) imports the shell's own qs.Commons/qs.Ui
// modules and can only load inside omarchy-shell itself; test it there with
// `omarchy plugin add`.
ShellRoot {
    FloatingWindow {
        id: win
        title: "Invaders (dev)"
        implicitWidth: 224 * 3
        implicitHeight: 256 * 3
        color: "#101315"
        visible: true

        Game {
            id: game
            anchors.fill: parent
            autoRun: win.visible
            onQuitRequested: Qt.quit()
            Component.onCompleted: {
                forceActiveFocus()
                // INVADERS_AUTOSTART=1 jumps straight into a wave — used by
                // the screenshot/smoke tooling, handy for tuning too.
                if (Quickshell.env("INVADERS_AUTOSTART") === "1")
                    game.startGame()
                // INVADERS_PREVIEW=1 additionally fast-forwards through ~35
                // seconds of real simulated play (sweep and fire) so the
                // first frame is an honest mid-game scene for preview.png.
                if (Quickshell.env("INVADERS_PREVIEW") === "1") {
                    game.startGame()
                    var eng = game.engine
                    var dir = 1
                    for (var i = 0; i < 60 * 34; i++) {
                        var px = eng.state.player.x
                        if (px >= 190) dir = -1
                        else if (px <= 12) dir = 1
                        eng.setInput(dir < 0, dir > 0)
                        // A player who knows not to shoot through their own
                        // shields: hold fire while under a bunker.
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
                        // Stop while the saucer is well on screen.
                        if (eng.state.ufo && i > 60 * 26
                                && eng.state.ufo.x > 90 && eng.state.ufo.x < 150)
                            break
                    }
                }
            }
        }
    }
}
