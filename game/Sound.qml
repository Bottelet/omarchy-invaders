import QtQuick

// Sound, or silence, without the game caring which.
//
// QtMultimedia is NOT a Quickshell dependency — plenty of machines running
// omarchy-shell don't have qt6-multimedia. A failed import takes down the
// whole document that contains it, so the import lives in SoundBank.qml,
// reached only through this Loader: if the module is missing the Loader
// errors, `available` stays false, and every call below is a no-op. The game
// plays exactly the same, silently. Do not inline the import here.
Item {
    id: root

    property bool muted: false
    property real masterVolume: 0.55

    readonly property bool available: bank.status === Loader.Ready
                                      && bank.item && bank.item.ready
    readonly property bool unavailable: bank.status === Loader.Error

    Loader {
        id: bank
        source: "SoundBank.qml"
        asynchronous: false
        onStatusChanged: {
            if (status === Loader.Error)
                console.warn("Invaders: QtMultimedia not available, running silent."
                             + " Install qt6-multimedia for sound.")
        }
    }

    Binding {
        target: bank.item
        property: "muted"
        value: root.muted
        when: bank.status === Loader.Ready
    }

    Binding {
        target: bank.item
        property: "masterVolume"
        value: root.masterVolume
        when: bank.status === Loader.Ready
    }

    function play(name) {
        if (root.available)
            bank.item.play(name)
    }

    function startLoop(name) {
        if (root.available)
            bank.item.startLoop(name)
    }

    function stopLoop(name) {
        if (root.available)
            bank.item.stopLoop(name)
    }

    function stopAll() {
        if (root.available)
            bank.item.stopAll()
    }
}
