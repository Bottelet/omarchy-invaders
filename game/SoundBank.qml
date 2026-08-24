import QtQuick
import QtMultimedia

// The voices. Only ever loaded through Sound.qml's Loader, so `import
// QtMultimedia` failing can't take the game down with it.
Item {
    id: bank

    property real masterVolume: 0.55
    property bool muted: false

    // One-shots get three voices each, used round-robin: SoundEffect.play()
    // on an already-playing effect restarts it rather than layering, and at
    // last-alien tempo the heartbeat would otherwise clip itself.
    readonly property var oneShots: [
        "beat1", "beat2", "beat3", "beat4",
        "shoot", "invader_killed", "player_explode", "ufo_hit", "extra_life"
    ]
    readonly property int voicesPer: 3

    // The saucer warble loops while it crosses; the WAV is cross-faded at the
    // seam by make_sounds.py so the repeat doesn't tick.
    readonly property var loops: ["ufo"]

    property var pool: ({})
    property var cursor: ({})
    property bool ready: false

    Component {
        id: effectComponent
        SoundEffect {
            volume: bank.muted ? 0 : bank.masterVolume
        }
    }

    function makeVoices(name, count, looping) {
        var voices = []
        for (var i = 0; i < count; i++) {
            var fx = effectComponent.createObject(bank, {
                "source": Qt.resolvedUrl("../audio/" + name + ".wav"),
                "loops": looping ? SoundEffect.Infinite : 1
            })
            if (fx)
                voices.push(fx)
        }
        return voices
    }

    function play(name) {
        var voices = bank.pool[name]
        if (!voices || bank.muted)
            return
        var i = bank.cursor[name] % voices.length
        bank.cursor[name] = i + 1
        voices[i].play()
    }

    function startLoop(name) {
        var voices = bank.pool[name]
        if (!voices || bank.muted)
            return
        if (!voices[0].playing)
            voices[0].play()
    }

    function stopLoop(name) {
        var voices = bank.pool[name]
        if (voices)
            voices[0].stop()
    }

    function stopAll() {
        for (var name in bank.pool)
            for (var i = 0; i < bank.pool[name].length; i++)
                bank.pool[name][i].stop()
    }

    Component.onCompleted: {
        // Assembled in locals and assigned once: bindings do not fire on
        // in-place mutation of a `var` property, and `ready` bound to a pool
        // mutated in place would stay false forever (a silent game with
        // nothing in any log to say why).
        var pool = {}
        var cursor = {}
        for (var i = 0; i < bank.oneShots.length; i++) {
            var voices = makeVoices(bank.oneShots[i], bank.voicesPer, false)
            if (voices.length > 0) {
                pool[bank.oneShots[i]] = voices
                cursor[bank.oneShots[i]] = 0
            }
        }
        for (var j = 0; j < bank.loops.length; j++) {
            var held = makeVoices(bank.loops[j], 1, true)
            if (held.length > 0) {
                pool[bank.loops[j]] = held
                cursor[bank.loops[j]] = 0
            }
        }
        bank.pool = pool
        bank.cursor = cursor
        bank.ready = Object.keys(pool).length > 0
    }
}
