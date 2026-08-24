// Modern-mode tests. Classic behaviour is covered in engine.test.js and must
// stay identical; here we exercise power-ups, combos, multi-shot, and the boss.
const test = require("node:test")
const assert = require("node:assert/strict")

const Sprites = require("../game/Sprites.js")
const Engine = require("../game/Engine.js")

const TICK = 1 / 60

// `rng` lets a test force or suppress random power-up drops deterministically.
function make(mode, rng) {
    const eng = Engine.createEngine({
        sprites: Sprites.SPRITES,
        bunkerGrid: Sprites.bunkerGrid,
        random: rng || (() => 0.99),   // default: never drop
    })
    eng.newGame(3, mode)
    return eng
}
function ticks(eng, n) {
    const ev = []
    for (let i = 0; i < n; i++) ev.push(...eng.step(TICK))
    return ev
}
const types = ev => ev.map(e => e.type)

// Aim the first bullet at a specific alien and let it connect.
function shootAlien(eng, a) {
    eng.state.player.x = a.x
    eng.fire()
    const b = eng.state.bullets[eng.state.bullets.length - 1]
    b.x = a.x + 2; b.y = a.y + 9; b.vx = 0
    return ticks(eng, 3)
}

test("classic is the default and keeps the one-bullet rule", () => {
    const eng = make(undefined)
    assert.equal(eng.state.mode, "classic")
    assert.equal(eng.fire(), true)
    assert.equal(eng.fire(), false)          // second refused
    assert.equal(eng.state.bullets.length, 1)
})

test("modern allows more than one bullet on screen", () => {
    const eng = make("modern")
    assert.equal(eng.state.mode, "modern")
    assert.equal(eng.fire(), true)
    assert.equal(eng.fire(), true)           // second allowed
    assert.equal(eng.fire(), false)          // base cap is 2
    assert.equal(eng.state.bullets.length, 2)
})

test("a killed alien can drop a power-up, and catching it applies an effect", () => {
    const eng = make("modern", () => 0.0)    // 0.0 => always drop, first type (rapid)
    const a = eng.state.aliens[4 * 11 + 5]
    shootAlien(eng, a)
    assert.ok(eng.state.powerups.length >= 1, "no power-up dropped")
    const pu = eng.state.powerups[0]
    // Walk the capsule down onto the cannon.
    eng.state.player.x = pu.x
    pu.y = 210
    const ev = ticks(eng, 6)
    assert.ok(types(ev).includes("powerupGet"), "power-up not caught")
    assert.ok(eng.state.effects.rapid > 0, "rapid effect not applied")
})

test("rapid raises the bullet cap to four", () => {
    const eng = make("modern")
    eng.state.effects.rapid = 10
    assert.equal(eng.fire(), true)
    assert.equal(eng.fire(), true)
    assert.equal(eng.fire(), true)
    assert.equal(eng.fire(), true)
    assert.equal(eng.fire(), false)          // capped at 4
    assert.equal(eng.state.bullets.length, 4)
})

test("spread fires a three-way fan", () => {
    const eng = make("modern")
    eng.state.effects.spread = 10
    eng.fire()
    assert.equal(eng.state.bullets.length, 3)
    const vxs = eng.state.bullets.map(b => b.vx).sort()
    assert.deepEqual(vxs, [-1.3, 0, 1.3])
})

test("pierce lets one bullet punch through a column of aliens", () => {
    const eng = make("modern")
    eng.state.effects.pierce = 10
    // Stack three aliens in a vertical line and remove the rest.
    for (const a of eng.state.aliens) a.alive = false
    const col = []
    for (let r = 0; r < 3; r++) {
        const a = eng.state.aliens[r * 11 + 5]
        a.alive = true; a.x = 100; a.y = 80 + r * 16
        col.push(a)
    }
    eng.state.marchOrder = []      // freeze the march so the column stays put
    eng.state.player.x = 100
    eng.fire()
    const b = eng.state.bullets[0]
    b.x = 104
    // Drive it up through all three.
    for (let i = 0; i < 40 && col.some(a => a.alive); i++) eng.step(TICK)
    assert.ok(col.every(a => !a.alive), "pierce did not kill the whole column")
})

test("consecutive kills build a multiplier; a wasted shot resets it", () => {
    const eng = make("modern")
    // Leave a clean column to shoot repeatedly.
    for (const a of eng.state.aliens) a.alive = false
    const targets = []
    for (let i = 0; i < 8; i++) {
        const a = eng.state.aliens[i]
        a.alive = true; a.x = 20 + i * 18; a.y = 70
        targets.push(a)
    }
    for (const a of targets.slice(0, 6)) shootAlien(eng, a)
    assert.ok(eng.state.multiplier >= 2, `combo did not build (${eng.state.multiplier})`)
    // Fire a bullet that flies off the top without hitting anything.
    eng.state.player.x = 5
    eng.fire()
    eng.state.bullets[eng.state.bullets.length - 1].x = 2
    ticks(eng, 80)
    assert.equal(eng.state.multiplier, 1, "combo did not reset on a miss")
})

test("the score multiplier actually multiplies points", () => {
    const eng = make("modern")
    eng.state.combo = 13   // this kill bumps to 14 -> x3
    const before = eng.state.score
    const a = eng.state.aliens[4 * 11 + 2]   // bottom row = 10 pts
    shootAlien(eng, a)
    assert.equal(eng.state.score - before, 30)   // 10 * 3
})

test("a shield absorbs one hit instead of costing a life", () => {
    const eng = make("modern")
    eng.state.shield = true
    const lives = eng.state.lives
    eng.state.alienShots.push({ type: "rolling", x: eng.state.player.x + 5, y: 210, frame: 0, animT: 0 })
    const ev = ticks(eng, 6)
    assert.ok(types(ev).includes("shieldBreak"))
    assert.equal(eng.state.shield, false)
    assert.equal(eng.state.lives, lives, "shield hit still cost a life")
    assert.equal(eng.state.phase, "playing", "shield hit still killed the player")
})

test("every fifth wave is a boss; killing it clears the wave and drops a life", () => {
    const eng = make("modern")
    eng.startWave(5)
    assert.ok(eng.state.boss, "wave 5 is not a boss wave")
    assert.equal(eng.state.aliens.length, 0)
    const hp = eng.state.boss.maxHp
    // Pound the boss with placed bullets until it dies.
    let ev = []
    for (let i = 0; i < hp + 5 && eng.state.boss; i++) {
        eng.state.player.x = Math.round(eng.state.boss.x + 16)
        eng.fire()
        const b = eng.state.bullets[eng.state.bullets.length - 1]
        if (b) { b.x = eng.state.boss.x + 16; b.y = eng.state.boss.y + 6 }
        ev.push(...ticks(eng, 3))
    }
    assert.ok(types(ev).includes("bossKilled"), "boss never died")
    assert.ok(types(ev).includes("waveCleared"), "boss death did not clear the wave")
    assert.ok(eng.state.powerups.some(p => p.type === "life"), "no life dropped")
})

test("classic never drops power-ups even with a drop-happy RNG", () => {
    const eng = make(undefined, () => 0.0)
    const a = eng.state.aliens[4 * 11 + 5]
    shootAlien(eng, a)
    assert.equal(eng.state.powerups.length, 0)
})
