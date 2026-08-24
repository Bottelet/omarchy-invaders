// The rules of Invaders, and nothing else. No QML, no Quickshell, no canvas —
// Game.qml drives this in the shell and tests/engine.test.js drives the same
// file in Node.
//
// Timing model — the part that makes it feel like 1978 and must not be
// "improved": the arcade original updated exactly ONE alien per 60 Hz frame,
// so a full march step takes as many frames as there are live aliens. That is
// the entire speed curve: 55 aliens shuffle about once a second, the last
// survivor sprints at 60 moves a second, and nobody ever tuned a speed table.
// step(dt) therefore feeds a fixed 60 Hz accumulator, and each tick advances
// one live alien by 2 px. The four-note heartbeat fires once per completed
// pass over the grid — beat and march accelerate together because they are
// the same clock.
//
// createEngine({sprites, random}) returns an isolated instance, so tests can
// run many and QML can't trip over shared module state.

var W = 224
var H = 256
var TICK = 1 / 60

var COLS = 11
var ROWS = 5
var CELL_W = 16
var CELL_H = 16
var ALIEN_STEP = 2        // horizontal px per move
var ALIEN_DROP = 8        // px per drop pass
var GRID_MIN_X = 8        // leftmost pixel an alien may reach
var GRID_MAX_X = 216      // rightmost
var ROW_POINTS = [30, 20, 20, 10, 10]   // top row down
var MIN_BEAT_TICKS = 6                   // heartbeat caps at 60/6 = 10 Hz

var PLAYER_Y = 216
var PLAYER_SPEED = 1      // px per tick, the original's crawl
var PLAYER_MIN_X = 8
var PLAYER_SHOT_SPEED = 4 // px per tick, up
var ALIEN_SHOT_SPEED = 1.35
var INVASION_Y = 208      // an alien this low has landed

var UFO_Y = 40
var UFO_SPEED = 0.5
var UFO_INTERVAL = 25     // seconds between saucer runs
var UFO_MIN_ALIENS = 8    // the original stops sending saucers below this
// Scored by how many shots the player has fired, as the arcade did — the
// saucer is a rhythm puzzle, not a dice roll.
var UFO_POINTS = [100, 50, 50, 100, 150, 100, 100, 50,
                  300, 100, 100, 100, 50, 150, 100, 50]

var BUNKER_Y = 192
var BUNKER_XS = [32, 78, 124, 170]
var GROUND_Y = 239

var EXTRA_LIFE_AT = 1500

var SHOT_TYPES = ["rolling", "plunger", "squiggly"]

function createEngine(opts) {
    opts = opts || {}
    var sprites = opts.sprites
    var random = opts.random || Math.random
    var bunkerTemplate = opts.bunkerGrid

    var e = {
        phase: "idle",     // idle | playing | playerDying | waveDelay | over
        score: 0,
        lives: 3,
        wave: 1,
        shotCount: 0,      // player shots fired this game; times the saucer score
        extraLifeGiven: false,
        overReason: null,  // "lives" | "invaded"

        aliens: [],        // 55 of {alive, row, col, x, y, frame}
        marchOrder: [],    // indices, bottom row first, the original's scan
        cursor: 0,
        dir: 1,
        edgeArmed: false,
        dropPass: false,
        beatIndex: 0,
        sinceBeat: 999,    // first pass beats immediately

        player: { x: 96, alive: true },
        input: { left: false, right: false },
        playerShot: null,  // {x, y} 1x4, or null

        alienShots: [],    // {type, x, y, frame, animT}
        reload: { rolling: 0, plunger: 0, squiggly: 0 },
        fireCursor: { plunger: 0, squiggly: 0 },

        ufo: null,         // {x, dir}
        ufoTimer: UFO_INTERVAL,

        bunkers: [],       // {x, y, grid}
        explosions: [],    // {kind, x, y, t, label}

        dieTimer: 0,
        waveTimer: 0,
        acc: 0,
        events: [],
    }

    function emit(type, data) {
        var ev = { type: type }
        if (data) for (var k in data) ev[k] = data[k]
        e.events.push(ev)
    }

    function alienSprite(row) { return sprites.alien[row][0] }

    function alienX(col, row) {
        return col * CELL_W + ((CELL_W - alienSprite(row).w) >> 1)
    }

    function cloneBunker() {
        var src = bunkerTemplate()
        return src
    }

    // ------------------------------------------------------------ lifecycle

    function newGame(startingLives) {
        e.score = 0
        e.lives = startingLives || 3
        e.wave = 1
        e.shotCount = 0
        e.extraLifeGiven = false
        e.overReason = null
        startWave(1)
    }

    function startWave(wave) {
        e.wave = wave
        var startY = 64 + Math.min((wave - 1) * ALIEN_DROP, 48)
        var startX = 24
        e.aliens = []
        for (var row = 0; row < ROWS; row++)
            for (var col = 0; col < COLS; col++)
                e.aliens.push({
                    alive: true, row: row, col: col,
                    x: startX + alienX(col, row),
                    y: startY + row * CELL_H,
                    frame: 0,
                })
        // March scan order: bottom row first, left to right, as the original.
        e.marchOrder = []
        for (var r = ROWS - 1; r >= 0; r--)
            for (var c = 0; c < COLS; c++)
                e.marchOrder.push(r * COLS + c)
        e.cursor = 0
        e.dir = 1
        e.edgeArmed = false
        e.dropPass = false
        e.beatIndex = 0
        e.sinceBeat = 999

        e.player.x = PLAYER_MIN_X
        e.player.alive = true
        e.playerShot = null
        e.alienShots = []
        e.reload = { rolling: 1.0, plunger: 1.6, squiggly: 1.3 }
        e.fireCursor = { plunger: 0, squiggly: 5 }
        e.ufo = null
        e.ufoTimer = UFO_INTERVAL
        e.explosions = []

        e.bunkers = []
        for (var b = 0; b < 4; b++)
            e.bunkers.push({ x: BUNKER_XS[b], y: BUNKER_Y, grid: cloneBunker() })

        e.dieTimer = 0
        e.waveTimer = 0
        e.acc = 0
        e.phase = "playing"
        emit("waveStart", { wave: wave })
    }

    function aliveCount() {
        var n = 0
        for (var i = 0; i < e.aliens.length; i++)
            if (e.aliens[i].alive) n++
        return n
    }

    function addScore(points) {
        e.score += points
        if (!e.extraLifeGiven && e.score >= EXTRA_LIFE_AT) {
            e.extraLifeGiven = true
            e.lives += 1
            emit("extraLife")
        }
    }

    // -------------------------------------------------------------- bunkers

    function eraseRect(bunker, x0, y0, x1, y1) {
        var changed = false
        for (var y = Math.max(0, y0); y < Math.min(bunker.grid.length, y1); y++)
            for (var x = Math.max(0, x0); x < Math.min(bunker.grid[0].length, x1); x++)
                if (bunker.grid[y][x]) { bunker.grid[y][x] = 0; changed = true }
        return changed
    }

    // Blast the erosion mask out of a bunker, centered on the impact pixel
    // (local coords), plus a few random fringe pixels so craters vary.
    function applyBlast(bunker, cx, cy) {
        var m = sprites.blast
        var ox = cx - (m.w >> 1)
        var oy = cy - (m.h >> 1)
        for (var y = 0; y < m.h; y++)
            for (var x = 0; x < m.w; x++)
                if (m.rows[y] & (1 << (m.w - 1 - x))) {
                    var gy = oy + y, gx = ox + x
                    if (gy >= 0 && gy < bunker.grid.length
                            && gx >= 0 && gx < bunker.grid[0].length)
                        bunker.grid[gy][gx] = 0
                }
        for (var i = 0; i < 6; i++) {
            var fx = cx + Math.floor(random() * 9) - 4
            var fy = cy + Math.floor(random() * 7) - 3
            if (fy >= 0 && fy < bunker.grid.length
                    && fx >= 0 && fx < bunker.grid[0].length)
                bunker.grid[fy][fx] = 0
        }
    }

    // First solid bunker pixel in the vertical span [yTop, yBottom) at column
    // x (field coords). Returns {bunker, lx, ly} or null.
    function bunkerHit(x, yTop, yBottom) {
        for (var b = 0; b < e.bunkers.length; b++) {
            var bk = e.bunkers[b]
            var lx = Math.floor(x) - bk.x
            if (lx < 0 || lx >= bk.grid[0].length) continue
            var y0 = Math.max(Math.floor(yTop) - bk.y, 0)
            var y1 = Math.min(Math.ceil(yBottom) - bk.y, bk.grid.length)
            for (var ly = y0; ly < y1; ly++)
                if (bk.grid[ly][lx]) return { bunker: bk, lx: lx, ly: ly }
        }
        return null
    }

    // ---------------------------------------------------------------- march

    function moveOneAlien() {
        if (e.marchOrder.length === 0) return
        var scanned = 0
        while (scanned < e.marchOrder.length) {
            var idx = e.marchOrder[e.cursor]
            e.cursor++
            if (e.cursor >= e.marchOrder.length) {
                e.cursor = 0
                completePass()
            }
            var a = e.aliens[idx]
            scanned++
            if (!a.alive) continue

            if (e.dropPass) {
                a.y += ALIEN_DROP
            } else {
                a.x += ALIEN_STEP * e.dir
                var w = alienSprite(a.row).w
                if (a.x <= GRID_MIN_X || a.x + w >= GRID_MAX_X)
                    e.edgeArmed = true
            }
            a.frame = a.frame ? 0 : 1

            // Marching through a shield grinds it away.
            var sp = alienSprite(a.row)
            for (var b = 0; b < e.bunkers.length; b++) {
                var bk = e.bunkers[b]
                if (a.x + sp.w > bk.x && a.x < bk.x + bk.grid[0].length
                        && a.y + sp.h > bk.y && a.y < bk.y + bk.grid.length)
                    eraseRect(bk, a.x - bk.x, a.y - bk.y,
                              a.x + sp.w - bk.x, a.y + sp.h - bk.y)
            }

            if (a.y >= INVASION_Y) {
                e.phase = "over"
                e.overReason = "invaded"
                emit("invaded")
                emit("gameOver", { score: e.score })
            }
            return
        }
    }

    function completePass() {
        // The march itself keeps accelerating to the last-alien sprint, but a
        // "pass" over a near-empty grid completes many times a second, which
        // would turn the heartbeat into a 59 Hz buzz. Cap the SOUND at a
        // musical thump (~10 Hz) while leaving movement uncapped.
        if (e.sinceBeat >= MIN_BEAT_TICKS) {
            e.sinceBeat = 0
            emit("beat", { note: e.beatIndex })
            e.beatIndex = (e.beatIndex + 1) % 4
        }
        if (e.dropPass) {
            e.dropPass = false
        } else if (e.edgeArmed) {
            e.edgeArmed = false
            e.dropPass = true
            e.dir = -e.dir
        }
    }

    // --------------------------------------------------------------- firing

    function lowestAlienInCol(col) {
        for (var row = ROWS - 1; row >= 0; row--) {
            var a = e.aliens[row * COLS + col]
            if (a.alive) return a
        }
        return null
    }

    function occupiedCols() {
        var cols = []
        for (var c = 0; c < COLS; c++)
            if (lowestAlienInCol(c)) cols.push(c)
        return cols
    }

    function reloadTime(type) {
        var base = type === "rolling" ? 0.9 : (type === "plunger" ? 1.5 : 1.2)
        var factor = Math.max(0.35, 1 - 0.08 * (e.wave - 1))
        return base * factor
    }

    function hasShot(type) {
        for (var i = 0; i < e.alienShots.length; i++)
            if (e.alienShots[i].type === type) return true
        return false
    }

    function alienFire(dt) {
        var cols = occupiedCols()
        if (cols.length === 0) return
        for (var t = 0; t < SHOT_TYPES.length; t++) {
            var type = SHOT_TYPES[t]
            if (hasShot(type)) continue
            e.reload[type] -= dt
            if (e.reload[type] > 0) continue
            var col
            if (type === "rolling") {
                // The aimed shot: fires from the column nearest the cannon.
                col = cols[0]
                var best = 1e9
                for (var i = 0; i < cols.length; i++) {
                    var cx = 24 + cols[i] * CELL_W + CELL_W / 2
                    var d = Math.abs(cx - (e.player.x + 6))
                    if (d < best) { best = d; col = cols[i] }
                }
            } else {
                var cur = e.fireCursor[type] % cols.length
                col = cols[cur]
                e.fireCursor[type] = (cur + (type === "plunger" ? 1 : 3)) % Math.max(cols.length, 1)
            }
            var a = lowestAlienInCol(col)
            if (!a) continue
            var sp = alienSprite(a.row)
            e.alienShots.push({
                type: type,
                x: a.x + (sp.w >> 1) - 1,
                y: a.y + sp.h,
                frame: 0, animT: 0,
            })
            e.reload[type] = reloadTime(type)
        }
    }

    // ------------------------------------------------------------ collisions

    function boxHit(x0, y0, w0, h0, x1, y1, w1, h1) {
        return x0 < x1 + w1 && x0 + w0 > x1 && y0 < y1 + h1 && y0 + h0 > y1
    }

    function killPlayer() {
        if (!e.player.alive) return
        e.player.alive = false
        e.playerShot = null
        e.phase = "playerDying"
        e.dieTimer = 1.5
        emit("playerHit")
    }

    function stepPlayerShot() {
        if (!e.playerShot) return
        var s = e.playerShot
        var prevY = s.y
        s.y -= PLAYER_SHOT_SPEED

        // Saucer first: it flies above everything.
        if (e.ufo && boxHit(s.x, s.y, 1, 4, e.ufo.x, UFO_Y, sprites.ufo.w, sprites.ufo.h)) {
            var pts = UFO_POINTS[e.shotCount % UFO_POINTS.length]
            addScore(pts)
            e.explosions.push({ kind: "ufo", x: e.ufo.x, y: UFO_Y, t: 1.0, label: String(pts) })
            e.ufo = null
            e.playerShot = null
            emit("ufoKilled", { points: pts })
            return
        }

        // Aliens. Bullets resolve before anything else can kill the player —
        // same frame counts as a kill, the arcade's own ordering.
        for (var i = 0; i < e.aliens.length; i++) {
            var a = e.aliens[i]
            if (!a.alive) continue
            var sp = alienSprite(a.row)
            if (boxHit(s.x, s.y, 1, 4, a.x, a.y, sp.w, sp.h)) {
                a.alive = false
                addScore(ROW_POINTS[a.row])
                e.explosions.push({ kind: "alien", x: a.x + (sp.w >> 1), y: a.y + (sp.h >> 1), t: 0.26 })
                e.playerShot = null
                emit("invaderKilled", { row: a.row })
                if (aliveCount() === 0) {
                    e.phase = "waveDelay"
                    e.waveTimer = 2.0
                    e.alienShots = []
                    emit("waveCleared", { wave: e.wave })
                }
                return
            }
        }

        // Alien shots: a good snipe clears one.
        for (var j = e.alienShots.length - 1; j >= 0; j--) {
            var as = e.alienShots[j]
            if (boxHit(s.x, s.y, 1, 4, as.x, as.y, 3, 7)) {
                e.explosions.push({ kind: "shot", x: as.x, y: as.y, t: 0.2 })
                e.alienShots.splice(j, 1)
                e.playerShot = null
                return
            }
        }

        // Bunkers: shot travels bottom-up, so scan the swept span.
        var hit = bunkerHit(s.x, s.y, prevY)
        if (hit) {
            applyBlast(hit.bunker, hit.lx, hit.ly - 1)
            e.playerShot = null
            return
        }

        if (s.y <= 34) {
            e.explosions.push({ kind: "shot", x: s.x - 4, y: 34, t: 0.2 })
            e.playerShot = null
        }
    }

    function stepAlienShots() {
        for (var i = e.alienShots.length - 1; i >= 0; i--) {
            var s = e.alienShots[i]
            s.y += ALIEN_SHOT_SPEED
            s.animT += TICK
            if (s.animT > 0.07) { s.animT = 0; s.frame = s.frame ? 0 : 1 }

            if (e.player.alive && e.phase === "playing"
                    && boxHit(s.x, s.y, 3, 7, e.player.x, PLAYER_Y,
                              sprites.player.w, sprites.player.h)) {
                e.alienShots.splice(i, 1)
                killPlayer()
                continue
            }

            var hit = bunkerHit(s.x + 1, s.y + 5, s.y + 7)
            if (hit) {
                applyBlast(hit.bunker, hit.lx, hit.ly + 1)
                e.alienShots.splice(i, 1)
                continue
            }

            if (s.y + 7 >= GROUND_Y) {
                e.explosions.push({ kind: "shot", x: s.x - 2, y: GROUND_Y - 7, t: 0.2 })
                e.alienShots.splice(i, 1)
            }
        }
    }

    function stepUfo(dt) {
        if (e.ufo) {
            e.ufo.x += UFO_SPEED * e.ufo.dir
            if (e.ufo.x < -sprites.ufo.w - 2 || e.ufo.x > W + 2) {
                e.ufo = null
                emit("ufoGone")
            }
            return
        }
        e.ufoTimer -= dt
        if (e.ufoTimer <= 0) {
            e.ufoTimer = UFO_INTERVAL
            if (aliveCount() >= UFO_MIN_ALIENS) {
                // Direction follows the player's shot parity, a quiet nod to
                // the original's deterministic saucer.
                var fromLeft = (e.shotCount & 1) === 0
                e.ufo = { x: fromLeft ? -sprites.ufo.w : W, dir: fromLeft ? 1 : -1 }
                emit("ufoSpawn")
            }
        }
    }

    function stepExplosions(dt) {
        for (var i = e.explosions.length - 1; i >= 0; i--) {
            e.explosions[i].t -= dt
            if (e.explosions[i].t <= 0) e.explosions.splice(i, 1)
        }
    }

    // ----------------------------------------------------------------- tick

    function tick() {
        if (e.phase === "playing") {
            e.sinceBeat++
            if (e.input.left && !e.input.right)
                e.player.x = Math.max(PLAYER_MIN_X, e.player.x - PLAYER_SPEED)
            else if (e.input.right && !e.input.left)
                e.player.x = Math.min(W - PLAYER_MIN_X - sprites.player.w,
                                      e.player.x + PLAYER_SPEED)

            moveOneAlien()
            if (e.phase !== "playing") return   // invaded mid-move

            alienFire(TICK)
            stepPlayerShot()
            stepAlienShots()
            stepUfo(TICK)
            stepExplosions(TICK)

        } else if (e.phase === "playerDying") {
            // Grid freezes, the wreck burns, the saucer keeps flying.
            e.dieTimer -= TICK
            stepUfo(TICK)
            stepExplosions(TICK)
            if (e.dieTimer <= 0) {
                e.lives -= 1
                if (e.lives > 0) {
                    e.player.x = PLAYER_MIN_X
                    e.player.alive = true
                    e.phase = "playing"
                    emit("respawn")
                } else {
                    e.phase = "over"
                    e.overReason = "lives"
                    emit("gameOver", { score: e.score })
                }
            }

        } else if (e.phase === "waveDelay") {
            e.waveTimer -= TICK
            stepExplosions(TICK)
            if (e.waveTimer <= 0)
                startWave(e.wave + 1)
        }
    }

    // ------------------------------------------------------------------ api

    return {
        constants: {
            W: W, H: H, TICK: TICK, COLS: COLS, ROWS: ROWS,
            PLAYER_Y: PLAYER_Y, UFO_Y: UFO_Y, GROUND_Y: GROUND_Y,
            BUNKER_Y: BUNKER_Y, BUNKER_XS: BUNKER_XS,
            ROW_POINTS: ROW_POINTS, UFO_POINTS: UFO_POINTS,
            EXTRA_LIFE_AT: EXTRA_LIFE_AT, INVASION_Y: INVASION_Y,
        },
        state: e,
        newGame: newGame,
        startWave: startWave,
        aliveCount: aliveCount,

        setInput: function (left, right) {
            e.input.left = !!left
            e.input.right = !!right
        },

        // One bullet on screen at a time. This constraint is the skill model;
        // do not add a cooldown, a burst, or a second slot.
        fire: function () {
            if (e.phase !== "playing" || !e.player.alive || e.playerShot) return false
            e.playerShot = { x: e.player.x + (sprites.player.w >> 1), y: PLAYER_Y - 4 }
            e.shotCount++
            emit("playerShoot")
            return true
        },

        // Fixed 60 Hz sub-steps; returns the events the slice produced.
        step: function (dt) {
            e.acc += dt
            var n = 0
            while (e.acc >= TICK && n < 4) {
                e.acc -= TICK
                tick()
                n++
            }
            if (e.acc > TICK * 4) e.acc = 0   // stalled frame: drop, don't spiral
            var out = e.events
            e.events = []
            return out
        },
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { createEngine: createEngine }
}
