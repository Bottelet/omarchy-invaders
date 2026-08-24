// Soak: ten simulated minutes of chaotic play per run, checking invariants
// every tick. This is where NaN drift, phase leaks and negative lives go to
// be found.
const test = require("node:test")
const assert = require("node:assert/strict")

const Sprites = require("../game/Sprites.js")
const Engine = require("../game/Engine.js")

function seeded(s) {
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

const PHASES = new Set(["idle", "playing", "playerDying", "waveDelay", "over"])

test("ten minutes of random play holds every invariant", () => {
    for (const seed of [1, 1337, 424242]) {
        const rng = seeded(seed)
        const eng = Engine.createEngine({
            sprites: Sprites.SPRITES,
            bunkerGrid: Sprites.bunkerGrid,
            random: seeded(seed ^ 0x5a5a),
        })
        eng.newGame(3)
        let lastScore = 0
        let games = 1

        for (let i = 0; i < 60 * 60 * 10; i++) {
            // Random-ish player: twitch inputs, mash fire.
            if (i % 7 === 0) eng.setInput(rng() < 0.4, rng() < 0.4)
            if (rng() < 0.1) eng.fire()
            if (eng.state.phase === "over" && rng() < 0.01) {
                eng.newGame(1 + Math.floor(rng() * 5))
                games++
                lastScore = 0
            }

            eng.step(1 / 60)

            const st = eng.state
            assert.ok(PHASES.has(st.phase), `bad phase ${st.phase}`)
            assert.ok(st.lives >= 0 && st.lives <= 6, `lives ${st.lives}`)
            assert.ok(st.score >= lastScore, "score went down")
            lastScore = st.score
            assert.ok(st.alienShots.length <= 3)
            for (const a of st.aliens) {
                assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y))
                assert.ok(a.x >= 0 && a.x <= 224)
            }
            for (const b of st.bullets)
                assert.ok(Number.isFinite(b.y) && Number.isFinite(b.x))
            assert.ok(Number.isFinite(st.player.x))
            assert.ok(st.player.x >= 8 && st.player.x + 13 <= 216 + 13)
        }
        assert.ok(games >= 1)
    }
})

test("a pacifist run still ends: the invasion always lands", () => {
    const eng = Engine.createEngine({
        sprites: Sprites.SPRITES, bunkerGrid: Sprites.bunkerGrid,
        random: seeded(7),
    })
    eng.newGame(3)
    // Never move, never shoot. Either the shots get us or the grid lands;
    // both must end the game inside 20 simulated minutes.
    let i = 0
    for (; i < 60 * 60 * 20 && eng.state.phase !== "over"; i++)
        eng.step(1 / 60)
    assert.equal(eng.state.phase, "over")
    assert.ok(["lives", "invaded"].includes(eng.state.overReason))
})
