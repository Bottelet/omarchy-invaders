import QtQuick
import Quickshell
import Quickshell.Io

// Sound, or silence, without the game caring which — with two backends.
//
// Preferred: QtMultimedia via SoundBank.qml, reached through a Loader so a
// machine without qt6-multimedia doesn't crash (a failed import takes down the
// whole document that contains it, which is why the import is quarantined in
// SoundBank.qml, not here). Pre-loaded SoundEffect voices give the lowest
// latency for rapid fire.
//
// Fallback: when qt6-multimedia is absent, shell out to pw-play (PipeWire) or
// paplay (PulseAudio), both of which ship on a stock Omarchy box — so sound
// works out of the box with nothing to install. Higher latency and the UFO
// "loop" becomes a single warble, but far better than silence.
Item {
    id: root

    property bool muted: false
    property real masterVolume: 0.55

    readonly property bool bankReady: bank.status === Loader.Ready
                                      && bank.item && bank.item.ready
    // "available" stays true even on the fallback path, so the game never
    // thinks it's mute when it can still make noise.
    readonly property bool available: root.bankReady || root.fallbackReady
    readonly property bool unavailable: !root.available

    Loader {
        id: bank
        source: "SoundBank.qml"
        asynchronous: false
        onStatusChanged: {
            if (status === Loader.Error)
                console.warn("Invaders: qt6-multimedia not available; using"
                             + " pw-play/paplay fallback for sound.")
        }
    }

    Binding {
        target: bank.item; property: "muted"; value: root.muted
        when: bank.status === Loader.Ready
    }
    Binding {
        target: bank.item; property: "masterVolume"; value: root.masterVolume
        when: bank.status === Loader.Ready
    }

    // ---------------------------------------------------------- fallback path

    readonly property string audioDir:
        String(Qt.resolvedUrl("../audio/")).replace(/^file:\/\//, "")

    // Plays $1 through pw-play, else paplay; exits quietly if neither exists.
    readonly property string playScript:
        'f="$1"; [ -f "$f" ] || exit 0; '
        + 'if command -v pw-play >/dev/null 2>&1; then exec pw-play --volume "$2" "$f"; '
        + 'elif command -v paplay >/dev/null 2>&1; then exec paplay "$f"; fi'

    property bool fallbackReady: false
    property var lastAt: ({})

    Component.onCompleted: {
        // The fallback is viable only if a player is actually on PATH; probe
        // once so `available` is honest.
        fallbackProbe.running = true
    }

    Process {
        id: fallbackProbe
        command: ["sh", "-c",
                  "command -v pw-play >/dev/null 2>&1 || command -v paplay >/dev/null 2>&1"]
        onExited: function (code) { root.fallbackReady = (code === 0) }
    }

    function fallbackPlay(name) {
        if (root.muted || !root.fallbackReady)
            return
        // Throttle a repeated sound so a fast beat can't storm processes.
        var now = Date.now()
        if (root.lastAt[name] && now - root.lastAt[name] < 45)
            return
        root.lastAt[name] = now
        Quickshell.execDetached(["sh", "-c", root.playScript, "invaders-sfx",
                                 root.audioDir + name + ".wav",
                                 String(root.masterVolume)])
    }

    // ------------------------------------------------------------------- api

    function play(name) {
        if (root.bankReady) bank.item.play(name)
        else root.fallbackPlay(name)
    }

    function startLoop(name) {
        if (root.bankReady) bank.item.startLoop(name)
        else root.fallbackPlay(name)   // fallback: a single warble, not a loop
    }

    function stopLoop(name) {
        if (root.bankReady) bank.item.stopLoop(name)
        // fallback loops are fire-and-forget one-shots; nothing to stop.
    }

    function stopAll() {
        if (root.bankReady) bank.item.stopAll()
    }
}
