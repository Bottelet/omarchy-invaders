// Headless engine tests — node --test tests/. No framework, no package.json:
// the engine is dependency-free JS with a module.exports guard, so Node can
// require the exact file QML runs.
const test = require("node:test")
const assert = require("node:assert/strict")

const Sprites = require("../game/Sprites.js")
const Engine = require("../game/Engine.js")

function seeded() {
    let s = 42
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

function make(lives) {
    const eng = Engine.createEngine({
        sprites: Sprites.SPRITES,
        bunkerGrid: Sprites.bunkerGrid,
        random: seeded(),
    })
    eng.newGame(lives || 3)
    return eng
}

const TICK = 1 / 60

// Run n engine ticks, returning every event produced.
function ticks(eng, n) {
    const events = []
    for (let i = 0; i < n; i++) events.push(...eng.step(TICK))
    return events
}

function eventTypes(events) { return events.map(e => e.type) }

test("a fresh wave fields 5x11 aliens inside the walls", () => {
    const eng = make()
    assert.equal(eng.state.aliens.length, 55)
    assert.equal(eng.aliveCount(), 55)
    for (const a of eng.state.aliens) {
        assert.ok(a.x >= 8 && a.x < 216)
        assert.ok(a.y >= 64)
    }
})

test("the march moves exactly one alien per tick — the 1978 speed law", () => {
    const eng = make()
    const before = eng.state.aliens.map(a => a.x + "," + a.y)
    eng.step(TICK)
    const after = eng.state.aliens.map(a => a.x + "," + a.y)
    let moved = 0
    for (let i = 0; i < 55; i++) if (before[i] !== after[i]) moved++
    assert.equal(moved, 1)
})

test("one heartbeat note per full pass, cycling four notes", () => {
    const eng = make()
    const events = ticks(eng, 55 * 4)
    const beats = events.filter(e => e.type === "beat")
    assert.equal(beats.length, 4)
    assert.deepEqual(beats.map(b => b.note), [0, 1, 2, 3])
})

test("the march accelerates dramatically as the grid empties", () => {
    // The march is one live-alien move per tick, so a lone survivor sprints.
    // Measure how far the survivor travels in a fixed window vs the full grid.
    function marchDistance(alive) {
        const e = make()
        for (let i = 0; i < 55 - alive; i++) e.state.aliens[i].alive = false
        const live = e.state.aliens.find(a => a.alive)
        const x0 = live.x, y0 = live.y
        ticks(e, 60)
        return Math.abs(live.x - x0) + Math.abs(live.y - y0)
    }
    assert.ok(marchDistance(1) > marchDistance(55) * 10,
              "lone alien does not sprint")
})

test("the heartbeat accelerates but caps at a musical rate, never a buzz", () => {
    const full = make()
    const fullBeats = ticks(full, 60).filter(e => e.type === "beat").length
    const lone = make()
    for (let i = 1; i < 55; i++) lone.state.aliens[i].alive = false
    const loneBeats = ticks(lone, 60).filter(e => e.type === "beat").length
    // Faster than a full grid...
    assert.ok(loneBeats > fullBeats * 4, `beat not faster (${loneBeats} vs ${fullBeats})`)
    // ...but capped ~10 Hz, not the raw ~59 Hz pass rate.
    assert.ok(loneBeats <= 11, `beat is a buzz at ${loneBeats}/sec — cap failed`)
})

test("wall contact reverses direction and drops the grid 8px", () => {
    const eng = make()
    const startY = eng.state.aliens[0].y
    const startDir = eng.state.dir
    // March until a drop has happened.
    let dropped = false
    for (let i = 0; i < 60 * 30 && !dropped; i++) {
        eng.step(TICK)
        if (eng.state.aliens[0].y === startY + 8) dropped = true
        if (eng.state.phase !== "playing") break
    }
    assert.ok(dropped, "grid never dropped")
    assert.equal(eng.state.dir, -startDir)
})

test("one player bullet at a time — firing again is refused", () => {
    const eng = make()
    assert.equal(eng.fire(), true)
    assert.equal(eng.fire(), false)
    assert.ok(eng.state.playerShot)
})

test("shooting an alien scores its row and frees the bullet", () => {
    const eng = make()
    // Place a bullet directly under a known bottom-row alien.
    const target = eng.state.aliens[4 * 11 + 5]
    eng.state.player.x = target.x
    assert.equal(eng.fire(), true)
    eng.state.playerShot.x = target.x + 4
    eng.state.playerShot.y = target.y + 10
    const events = ticks(eng, 4)
    assert.ok(eventTypes(events).includes("invaderKilled"))
    assert.equal(target.alive, false)
    assert.equal(eng.state.score, 10)   // bottom row = 10 points
    assert.equal(eng.state.playerShot, null)
})

test("row points are 30/20/20/10/10 top to bottom", () => {
    assert.deepEqual(make().constants.ROW_POINTS, [30, 20, 20, 10, 10])
})

test("clearing the wave starts the next one, one row lower", () => {
    const eng = make()
    const firstY = eng.state.aliens[0].y
    // Kill 54 by hand, shoot the last.
    for (let i = 1; i < 55; i++) eng.state.aliens[i].alive = false
    const last = eng.state.aliens[0]
    eng.state.player.x = 100
    eng.fire()
    eng.state.playerShot.x = last.x + 2
    eng.state.playerShot.y = last.y + 9
    let events = ticks(eng, 4)
    assert.ok(eventTypes(events).includes("waveCleared"))
    assert.equal(eng.state.phase, "waveDelay")
    events = ticks(eng, 130)
    assert.ok(eventTypes(events).includes("waveStart"))
    assert.equal(eng.state.wave, 2)
    assert.equal(eng.aliveCount(), 55)
    assert.equal(eng.state.aliens[0].y, firstY + 8)
})

test("a player shot erodes the bunker it hits", () => {
    const eng = make()
    const bunker = eng.state.bunkers[0]
    const solidBefore = bunker.grid.flat().filter(Boolean).length
    eng.state.player.x = bunker.x + 4
    eng.fire()
    eng.state.playerShot.x = bunker.x + 10
    eng.state.playerShot.y = bunker.y + bunker.grid.length + 2
    ticks(eng, 3)
    const solidAfter = bunker.grid.flat().filter(Boolean).length
    assert.equal(eng.state.playerShot, null, "shot survived the bunker")
    assert.ok(solidAfter < solidBefore, "no pixels eroded")
    assert.ok(solidBefore - solidAfter >= 20, "erosion too shallow to matter")
})

test("an alien shot erodes the bunker from above", () => {
    const eng = make()
    const bunker = eng.state.bunkers[1]
    const solidBefore = bunker.grid.flat().filter(Boolean).length
    eng.state.alienShots.push({ type: "plunger", x: bunker.x + 10, y: bunker.y - 8, frame: 0, animT: 0 })
    ticks(eng, 10)
    const solidAfter = bunker.grid.flat().filter(Boolean).length
    assert.ok(solidAfter < solidBefore, "no pixels eroded from above")
    assert.equal(eng.state.alienShots.length <= 3, true)
})

test("an alien shot kills the player, freezes the grid, then respawns", () => {
    const eng = make()
    eng.state.alienShots.push({ type: "rolling", x: eng.state.player.x + 5, y: 210, frame: 0, animT: 0 })
    let events = ticks(eng, 8)
    assert.ok(eventTypes(events).includes("playerHit"))
    assert.equal(eng.state.phase, "playerDying")
    const positions = eng.state.aliens.map(a => a.x + "," + a.y)
    ticks(eng, 10)
    assert.deepEqual(eng.state.aliens.map(a => a.x + "," + a.y), positions,
                     "grid moved during the death pause")
    events = ticks(eng, 60 * 2)
    assert.ok(eventTypes(events).includes("respawn"))
    assert.equal(eng.state.lives, 2)
    assert.equal(eng.state.phase, "playing")
})

test("losing the last life ends the game", () => {
    const eng = make(1)
    eng.state.alienShots.push({ type: "rolling", x: eng.state.player.x + 5, y: 210, frame: 0, animT: 0 })
    const events = ticks(eng, 60 * 3)
    assert.ok(eventTypes(events).includes("gameOver"))
    assert.equal(eng.state.phase, "over")
    assert.equal(eng.state.overReason, "lives")
})

test("aliens keep firing and respect the three-shot ceiling", () => {
    const eng = make()
    let maxShots = 0
    for (let i = 0; i < 60 * 6; i++) {
        eng.step(TICK)
        maxShots = Math.max(maxShots, eng.state.alienShots.length)
        if (eng.state.phase !== "playing") break
    }
    assert.ok(maxShots >= 1, "aliens never fired")
    assert.ok(maxShots <= 3, "more than three alien shots on screen")
})

test("the saucer appears on its timer and scores from the shot-count table", () => {
    const eng = make()
    const events = ticks(eng, 60 * 26)
    assert.ok(eventTypes(events).includes("ufoSpawn"), "saucer never spawned")
    assert.ok(eng.state.ufo || eventTypes(events).includes("ufoGone"))
    // Score table: shotCount indexes UFO_POINTS.
    const eng2 = make()
    ticks(eng2, 60 * 26)
    if (eng2.state.ufo) {
        eng2.state.shotCount = 8    // table slot worth 300
        eng2.state.player.x = eng2.state.ufo.x + 4
        eng2.fire()                 // shotCount becomes 9... so set after fire
        eng2.state.shotCount = 8
        eng2.state.playerShot.x = eng2.state.ufo.x + 6
        eng2.state.playerShot.y = eng2.constants.UFO_Y + 10
        const ev = ticks(eng2, 4)
        const kill = ev.find(x => x.type === "ufoKilled")
        assert.ok(kill, "saucer survived a direct hit")
        assert.equal(kill.points, 300)
    }
})

test("extra life arrives at 1500 points, once", () => {
    const eng = make()
    const lives = eng.state.lives
    eng.state.score = 1490
    // Shoot a bottom-row (10pt) alien to cross the line.
    const target = eng.state.aliens[4 * 11 + 3]
    eng.state.player.x = 100
    eng.fire()
    eng.state.playerShot.x = target.x + 3
    eng.state.playerShot.y = target.y + 9
    const events = ticks(eng, 4)
    assert.ok(eventTypes(events).includes("extraLife"))
    assert.equal(eng.state.lives, lives + 1)
    assert.equal(eng.state.extraLifeGiven, true)
})

test("aliens reaching the cannon line is game over by invasion", () => {
    const eng = make()
    // Teleport the grid deep: next drop lands them past the line.
    for (const a of eng.state.aliens) a.y += 140
    const events = ticks(eng, 60 * 20)
    assert.ok(eventTypes(events).includes("invaded"))
    assert.equal(eng.state.overReason, "invaded")
})

test("a stalled frame clamps instead of teleporting the world", () => {
    const eng = make()
    eng.step(0.5)   // half a second in one gulp
    // At most 4 sub-steps ran: at most 4 aliens moved 2px from start.
    let displaced = 0
    for (const a of eng.state.aliens)
        if (a.x !== 24 + (a.col * 16 + ((16 - Sprites.SPRITES.alien[a.row][0].w >> 0) >> 1))) displaced++
    assert.ok(displaced <= 4)
})

test("marching aliens grind bunkers away on contact", () => {
    const eng = make()
    const bunker = eng.state.bunkers[0]
    const solidBefore = bunker.grid.flat().filter(Boolean).length
    // Park a live alien inside the bunker and let it take one march step.
    const a = eng.state.aliens[4 * 11]
    a.x = bunker.x + 2
    a.y = bunker.y + 2
    ticks(eng, 56)
    const solidAfter = bunker.grid.flat().filter(Boolean).length
    assert.ok(solidAfter < solidBefore, "bunker untouched by marching alien")
})
