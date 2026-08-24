import QtQuick
import "game"
import "game/Sprites.js" as Sprites
import "game/Engine.js" as EngineJs
import "game/Renderer.js" as RendererJs

// Invaders — the cabinet's contents.
//
// Deliberately free of Quickshell imports: this file plus game/* runs in any
// QML window (see shell.qml for the dev harness), which is what makes the
// march rhythm tunable without restarting a shell. Panel.qml adds the parts
// that genuinely need the shell: the window, keyboard focus, theme colours
// and persistence.
//
// The playfield is the original's 224x256 logical pixels, drawn once per
// frame into a Canvas of exactly that size and scaled up by an INTEGER
// factor with smoothing off — every logical pixel a crisp square, no
// letterbox blur, and the repaint costs the same on a 4K panel as a laptop.
Item {
    id: game

    focus: true

    // ------------------------------------------------------------ interface

    // Seeded from disk by the host: [{initials, score}], highest first.
    property var scores: []
    signal scoresUpdated(var list)
    signal quitRequested()

    // Owned by the host: the game asks, the host flips and persists.
    // Assigning these from in here would break the binding silently.
    property bool soundEnabled: true
    signal soundToggleRequested()
    property bool scanlines: true
    signal scanlinesToggleRequested()

    property int startingLives: 3

    // Theme. Defaults let the game stand alone in a plain window; Panel.qml
    // overwrites all of them from the live Omarchy palette, so a theme switch
    // recolours the game mid-wave with no restart.
    property color colBackground: "#101315"
    property color colForeground: "#cacccc"
    property color colAccent:     "#7aa2f7"
    property color colUrgent:     "#a55555"
    property color colMuted:      "#707880"
    // One colour per alien row band, top to bottom. The host feeds these from
    // the theme's ANSI palette; the fallback shades the accent.
    property var rowColors: []

    readonly property var palette: ({
        bg:        game.colBackground,
        hud:       game.colForeground,
        player:    game.colAccent,
        rows:      game.effectiveRowColors(),
        bunker:    game.colMuted,
        ufo:       game.colUrgent,
        shot:      game.colForeground,
        explosion: game.colAccent,
        ground:    game.colAccent,
        dimmer:    Qt.rgba(0, 0, 0, 0.55),
    })

    function effectiveRowColors() {
        if (game.rowColors && game.rowColors.length >= 5)
            return game.rowColors
        var a = game.colAccent
        return [
            Qt.lighter(a, 1.35), Qt.lighter(a, 1.15), a,
            Qt.darker(a, 1.15), Qt.darker(a, 1.35),
        ]
    }

    // ------------------------------------------------------------ run state

    property string phase: "title"     // title | playing | gameOver | entry
    property bool paused: false
    property bool pauseMenu: false
    property real clock: 0
    property int finalScore: 0
    property string overReason: ""

    readonly property int highScore: game.scores.length > 0 ? game.scores[0].score : 0
    readonly property bool blinkOn: Math.floor(game.clock * 2) % 2 === 0

    // The engine instance. Created once; plain JS object, so nothing else
    // may reach into it except through its API.
    property var engine: null
    property var renderer: null

    // ---------------------------------------------------------------- input

    property bool holdLeft: false
    property bool holdRight: false

    function clearHeld() {
        game.holdLeft = false
        game.holdRight = false
    }

    // Losing window focus pauses a live game — alt-tab must never cost a life.
    onActiveFocusChanged: {
        clearHeld()
        if (!activeFocus && game.phase === "playing" && !game.paused) {
            game.paused = true
            game.pauseMenu = false
        }
    }

    Keys.onPressed: function (e) {
        switch (e.key) {
        case Qt.Key_Left:  case Qt.Key_A: game.holdLeft = true;  e.accepted = true; return
        case Qt.Key_Right: case Qt.Key_D: game.holdRight = true; e.accepted = true; return
        }

        // Everything below is an edge: auto-repeat must not reach it, or a
        // held Space would fire at the keyboard's repeat rate instead of the
        // one-bullet rule's.
        if (e.isAutoRepeat) { e.accepted = true; return }
        e.accepted = true

        if (e.key === Qt.Key_M && game.phase !== "entry") {
            game.soundToggleRequested()
            return
        }
        if (e.key === Qt.Key_F1 && game.phase !== "entry") {
            game.scanlinesToggleRequested()
            return
        }

        switch (game.phase) {
        case "title":
            if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter)
                game.startGame()
            else if (e.key === Qt.Key_Escape)
                game.quitRequested()
            else
                e.accepted = false
            return

        case "playing":
            if (game.paused) {
                if (e.key === Qt.Key_Escape) {
                    if (game.pauseMenu) game.quitRequested()
                    else game.pauseMenu = true
                } else if (e.key === Qt.Key_P) {
                    game.paused = false; game.pauseMenu = false
                } else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter) {
                    game.paused = false; game.pauseMenu = false
                } else if (e.key === Qt.Key_R && game.pauseMenu) {
                    game.paused = false; game.pauseMenu = false
                    game.startGame()
                }
                return
            }
            if (e.key === Qt.Key_Space)
                game.engine.fire()
            else if (e.key === Qt.Key_P) {
                game.paused = true; game.pauseMenu = false
            } else if (e.key === Qt.Key_Escape) {
                game.paused = true; game.pauseMenu = true
            } else
                e.accepted = false
            return

        case "gameOver":
            if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter)
                game.finishRun()
            else if (e.key === Qt.Key_Escape)
                game.quitRequested()
            else
                e.accepted = false
            return

        case "entry":
            game.entryKey(e)
            return
        }
    }

    Keys.onReleased: function (e) {
        if (e.isAutoRepeat) return
        switch (e.key) {
        case Qt.Key_Left:  case Qt.Key_A: game.holdLeft = false;  e.accepted = true; break
        case Qt.Key_Right: case Qt.Key_D: game.holdRight = false; e.accepted = true; break
        }
    }

    // ------------------------------------------------------------- lifecycle

    function startGame() {
        game.engine.newGame(Math.max(1, Math.min(5, game.startingLives)))
        game.phase = "playing"
        game.paused = false
        game.pauseMenu = false
        sound.stopAll()
    }

    function finishRun() {
        if (game.qualifies(game.finalScore)) {
            game.entryLetters = ["A", "A", "A"]
            game.entryPosition = 0
            game.phase = "entry"
        } else {
            game.phase = "title"
        }
    }

    // ------------------------------------------------------- the score table

    readonly property int maxScores: 10

    function qualifies(value) {
        if (value <= 0) return false
        if (game.scores.length < game.maxScores) return true
        return value > game.scores[game.scores.length - 1].score
    }

    function recordScore(initials, value) {
        var list = game.scores.slice()
        list.push({ initials: initials.toUpperCase(), score: value })
        list.sort(function (a, b) { return b.score - a.score })
        while (list.length > game.maxScores)
            list.pop()
        game.scores = list
        game.scoresUpdated(list)
    }

    property var entryLetters: ["A", "A", "A"]
    property int entryPosition: 0

    function entryKey(e) {
        var letters = game.entryLetters.slice()
        if (e.key === Qt.Key_Left) {
            game.entryPosition = Math.max(0, game.entryPosition - 1)
        } else if (e.key === Qt.Key_Right) {
            game.entryPosition = Math.min(2, game.entryPosition + 1)
        } else if (e.key === Qt.Key_Up || e.key === Qt.Key_Down) {
            var step = e.key === Qt.Key_Up ? 1 : -1
            var code = letters[game.entryPosition].charCodeAt(0) + step
            if (code > 90) code = 65
            if (code < 65) code = 90
            letters[game.entryPosition] = String.fromCharCode(code)
            game.entryLetters = letters
        } else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter
                   || e.key === Qt.Key_Escape) {
            game.recordScore(letters.join(""), game.finalScore)
            game.phase = "title"
        } else if (e.key >= Qt.Key_A && e.key <= Qt.Key_Z) {
            letters[game.entryPosition] = String.fromCharCode(e.key)
            game.entryLetters = letters
            if (game.entryPosition < 2)
                game.entryPosition += 1
        }
        e.accepted = true
    }

    // ----------------------------------------------------------- the loop

    // Bound to root.opened by the host: hiding the panel stops this cold —
    // zero timers, zero repaints, zero work while the overlay is closed.
    property bool autoRun: true

    onAutoRunChanged: {
        if (!game.autoRun) {
            // A looping SoundEffect keeps droning after the window hides;
            // silence the saucer explicitly.
            sound.stopAll()
            clearHeld()
            if (game.phase === "playing")
                game.paused = true
        }
    }

    FrameAnimation {
        running: game.visible && game.autoRun
        onTriggered: game.step(Math.min(frameTime, 0.05))
    }

    function step(dt) {
        game.clock += dt

        if (game.phase === "playing" && !game.paused) {
            game.engine.setInput(game.holdLeft, game.holdRight)
            var events = game.engine.step(dt)
            for (var i = 0; i < events.length; i++)
                game.handleEvent(events[i])
        }

        field.requestPaint()
    }

    function handleEvent(ev) {
        switch (ev.type) {
        case "beat":
            sound.play("beat" + (ev.note + 1))
            break
        case "playerShoot":
            sound.play("shoot")
            break
        case "invaderKilled":
            sound.play("invader_killed")
            break
        case "playerHit":
            sound.play("player_explode")
            sound.stopLoop("ufo")
            break
        case "ufoSpawn":
            sound.startLoop("ufo")
            break
        case "ufoKilled":
            sound.stopLoop("ufo")
            sound.play("ufo_hit")
            break
        case "ufoGone":
            sound.stopLoop("ufo")
            break
        case "extraLife":
            sound.play("extra_life")
            break
        case "invaded":
            sound.play("player_explode")
            break
        case "gameOver":
            game.finalScore = ev.score
            game.overReason = game.engine.state.overReason || ""
            game.phase = "gameOver"
            sound.stopAll()
            break
        }
    }

    // ---------------------------------------------------------------- sound

    Sound {
        id: sound
        muted: !game.soundEnabled
    }

    readonly property bool soundAvailable: sound.available

    // --------------------------------------------------------------- layout

    // Largest integer scale of 224x256 that fits; never below 1.
    readonly property int zoom: Math.max(1, Math.min(
        Math.floor(game.width / 224), Math.floor(game.height / 256)))
    readonly property int stageW: 224 * game.zoom
    readonly property int stageH: 256 * game.zoom

    Rectangle {
        id: stage
        width: game.stageW
        height: game.stageH
        anchors.centerIn: parent
        color: game.colBackground
        clip: true

        Canvas {
            id: field
            width: 224
            height: 256
            // Integer upscale, no smoothing: crisp chunky pixels.
            scale: game.zoom
            transformOrigin: Item.TopLeft
            smooth: false

            onPaint: {
                var ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = game.palette.bg
                ctx.fillRect(0, 0, 224, 256)
                if (!game.renderer)
                    return

                var pal = game.palette
                var st = game.engine.state

                if (game.phase === "title") {
                    game.renderer.drawTitle(ctx, pal, {
                        scores: game.scores,
                        blink: game.blinkOn,
                    })
                    return
                }

                game.renderer.drawField(ctx, st, pal, game.engine.constants,
                                        game.highScore)

                if (game.phase === "gameOver")
                    game.renderer.drawGameOver(ctx, pal, {
                        score: game.finalScore,
                        reason: game.overReason,
                        blink: game.blinkOn,
                    })
                else if (game.phase === "entry")
                    game.renderer.drawEntry(ctx, pal, {
                        score: game.finalScore,
                        letters: game.entryLetters,
                        position: game.entryPosition,
                        blink: game.blinkOn,
                    })
                else if (game.paused)
                    game.renderer.drawPause(ctx, pal, { menu: game.pauseMenu })
            }
        }

        // Scanlines: one translucent line per logical pixel row, painted only
        // when the size or the toggle changes — not a per-frame cost, and not
        // a shader. Cheap CRT, exactly as cheap as the spec demands.
        Canvas {
            id: scanlineOverlay
            anchors.fill: parent
            visible: game.scanlines && game.zoom >= 2
            onVisibleChanged: requestPaint()
            onWidthChanged: requestPaint()
            onHeightChanged: requestPaint()
            onPaint: {
                var ctx = getContext("2d")
                ctx.reset()
                ctx.clearRect(0, 0, width, height)
                if (!visible)
                    return
                ctx.fillStyle = Qt.rgba(0, 0, 0, 0.16)
                for (var y = game.zoom - 1; y < height; y += game.zoom)
                    ctx.fillRect(0, y, width, 1)
            }
        }
    }

    Component.onCompleted: {
        game.engine = EngineJs.createEngine({
            sprites: Sprites.SPRITES,
            bunkerGrid: Sprites.bunkerGrid,
        })
        game.renderer = RendererJs.createRenderer(Sprites.SPRITES, Sprites.FONT)
        // Idle grid behind the title so the screen isn't empty.
        game.engine.startWave(1)
        game.engine.state.phase = "idle"
        game.phase = "title"
    }
}
