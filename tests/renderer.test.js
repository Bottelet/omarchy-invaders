// Renderer smoke tests: drive every screen with a recording stub context so
// a renamed engine field or a missing sprite blows up here, not mid-game.
const test = require("node:test")
const assert = require("node:assert/strict")

const Sprites = require("../game/Sprites.js")
const Engine = require("../game/Engine.js")
const Renderer = require("../game/Renderer.js")

function stubCtx() {
    const calls = { fillRect: 0 }
    return {
        calls,
        fillStyle: null,
        fillRect(x, y, w, h) {
            calls.fillRect++
            assert.ok(Number.isFinite(x) && Number.isFinite(y)
                      && Number.isFinite(w) && Number.isFinite(h),
                      `non-finite rect ${x},${y},${w},${h}`)
        },
        clearRect() {},
        reset() {},
    }
}

const PAL = {
    bg: "#000", hud: "#ccc", player: "#7af", rows: ["#f00", "#0f0", "#00f", "#ff0", "#f0f"],
    bunker: "#777", ufo: "#f55", shot: "#fff", explosion: "#7af", ground: "#7af",
    dimmer: "rgba(0,0,0,0.5)",
}

function makeEngine() {
    const eng = Engine.createEngine({ sprites: Sprites.SPRITES, bunkerGrid: Sprites.bunkerGrid })
    eng.newGame(3)
    return eng
}

const renderer = Renderer.createRenderer(Sprites.SPRITES, Sprites.FONT)

test("drawField renders a fresh wave without dying", () => {
    const eng = makeEngine()
    const ctx = stubCtx()
    renderer.drawField(ctx, eng.state, PAL, eng.constants, 1230)
    assert.ok(ctx.calls.fillRect > 500, "suspiciously empty frame")
})

test("drawField survives a busy mid-game frame", () => {
    const eng = makeEngine()
    for (let i = 0; i < 60 * 8; i++) eng.step(1 / 60)
    eng.fire()
    eng.state.ufo = { x: 100, dir: 1 }
    eng.state.explosions.push({ kind: "alien", x: 100, y: 100, t: 0.2 })
    eng.state.explosions.push({ kind: "ufo", x: 90, y: 40, t: 0.9, label: "150" })
    eng.state.explosions.push({ kind: "ufo", x: 90, y: 40, t: 0.3, label: "150" })
    eng.state.explosions.push({ kind: "shot", x: 50, y: 34, t: 0.1 })
    renderer.drawField(stubCtx(), eng.state, PAL, eng.constants, 0)
})

test("drawField draws the dying player", () => {
    const eng = makeEngine()
    eng.state.player.alive = false
    eng.state.phase = "playerDying"
    eng.state.dieTimer = 0.8
    renderer.drawField(stubCtx(), eng.state, PAL, eng.constants, 0)
})

test("every overlay screen renders", () => {
    renderer.drawTitle(stubCtx(), PAL, {
        scores: [{ initials: "ABC", score: 1000 }], blink: true,
    })
    renderer.drawTitle(stubCtx(), PAL, { scores: [], blink: false })
    renderer.drawPause(stubCtx(), PAL, { menu: true })
    renderer.drawPause(stubCtx(), PAL, { menu: false })
    renderer.drawGameOver(stubCtx(), PAL, { score: 1234, reason: "invaded", blink: true })
    renderer.drawGameOver(stubCtx(), PAL, { score: 0, reason: "lives", blink: false })
    renderer.drawEntry(stubCtx(), PAL, {
        score: 4321, letters: ["C", "A", "B"], position: 1, blink: true,
    })
})

test("the pixel font covers every character the game prints", () => {
    const needed = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -.=<>*!?/"
    for (const ch of needed)
        assert.ok(Sprites.FONT[ch], `font missing '${ch}'`)
})

test("text falls back to '?' rather than crashing on unknown glyphs", () => {
    renderer.drawText(stubCtx(), "héllo~", 0, 0, "#fff")
})

test("sprites all compile to consistent row data", () => {
    const S = Sprites.SPRITES
    const all = [S.player, S.ufo, S.explodeAlien, S.explodeShot, S.explodeUfo, S.blast,
                 ...S.alien.flat(), ...S.explodePlayer,
                 ...Object.values(S.shots).flat()]
    for (const sp of all) {
        assert.equal(sp.rows.length, sp.h)
        for (const bits of sp.rows)
            assert.ok(bits < (1 << sp.w), "row wider than sprite")
    }
    // Two animation frames per alien band, same footprint.
    for (const band of S.alien) {
        assert.equal(band.length, 2)
        assert.equal(band[0].w, band[1].w)
        assert.equal(band[0].h, band[1].h)
    }
})
