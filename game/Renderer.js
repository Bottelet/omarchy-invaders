// Draws the 224x256 logical frame. Pure JS + Canvas2D context: no QML types,
// so Node can smoke-test it with a stub context. All coordinates are logical
// pixels — Game.qml scales the canvas item up by an integer factor with
// smoothing off, which is what keeps the pixels square and crisp.
//
// Sprites are drawn as horizontal runs (consecutive lit pixels become one
// fillRect) — the difference between ~6000 and ~1500 canvas calls a frame.

function createRenderer(sprites, font) {

    function drawSprite(ctx, sp, x, y, color) {
        ctx.fillStyle = color
        for (var row = 0; row < sp.h; row++) {
            var bits = sp.rows[row]
            if (!bits) continue
            var run = -1
            for (var px = 0; px <= sp.w; px++) {
                var on = px < sp.w && (bits & (1 << (sp.w - 1 - px)))
                if (on && run < 0) run = px
                else if (!on && run >= 0) {
                    ctx.fillRect(x + run, y + row, px - run, 1)
                    run = -1
                }
            }
        }
    }

    function drawText(ctx, str, x, y, color, scale) {
        scale = scale || 1
        ctx.fillStyle = color
        var s = String(str).toUpperCase()
        for (var i = 0; i < s.length; i++) {
            var glyph = font[s.charAt(i)] || font["?"]
            var gx = x + i * 6 * scale
            for (var row = 0; row < 7; row++) {
                var bits = glyph[row]
                if (!bits) continue
                var run = -1
                for (var px = 0; px <= 5; px++) {
                    var on = px < 5 && (bits & (1 << (4 - px)))
                    if (on && run < 0) run = px
                    else if (!on && run >= 0) {
                        ctx.fillRect(gx + run * scale, y + row * scale,
                                     (px - run) * scale, scale)
                        run = -1
                    }
                }
            }
        }
    }

    function textWidth(str, scale) { return String(str).length * 6 * (scale || 1) - (scale || 1) }

    function drawCentered(ctx, str, y, color, scale) {
        drawText(ctx, str, Math.round((224 - textWidth(str, scale)) / 2), y, color, scale)
    }

    function drawBunker(ctx, bunker, color) {
        ctx.fillStyle = color
        var grid = bunker.grid
        for (var y = 0; y < grid.length; y++) {
            var run = -1
            for (var x = 0; x <= grid[y].length; x++) {
                var on = x < grid[y].length && grid[y][x]
                if (on && run < 0) run = x
                else if (!on && run >= 0) {
                    ctx.fillRect(bunker.x + run, bunker.y + y, x - run, 1)
                    run = -1
                }
            }
        }
    }

    function drawHud(ctx, st, pal, hiScore) {
        drawText(ctx, "SCORE", 10, 6, pal.hud)
        drawText(ctx, pad(st.score), 10, 16, pal.hud)
        drawText(ctx, "HI-SCORE", 84, 6, pal.hud)
        drawText(ctx, pad(Math.max(hiScore, st.score)), 92, 16, pal.hud)
        drawText(ctx, "WAVE", 180, 6, pal.hud)
        drawText(ctx, String(st.wave), 190, 16, pal.hud)
    }

    function pad(n) {
        var s = String(n)
        while (s.length < 5) s = "0" + s
        return s
    }

    // Unique, in-font capsule letters (spread and shield both start with S).
    function powerupLabel(type) {
        switch (type) {
        case "rapid":  return "R"
        case "spread": return "3"   // 3-way
        case "pierce": return "P"
        case "shield": return "S"
        case "life":   return "L"
        }
        return "?"
    }

    function powerupColor(type, pal) {
        var r = pal.rows || [pal.player, pal.player, pal.player, pal.player, pal.player]
        switch (type) {
        case "rapid":  return r[3]
        case "spread": return r[1]
        case "pierce": return r[0]
        case "shield": return r[2]
        case "life":   return pal.ufo
        }
        return pal.player
    }

    // A small labelled bar for an active timed power-up.
    function drawEffectBar(ctx, pal, x, label, frac, col) {
        drawText(ctx, label, x, 232, col)
        ctx.fillStyle = pal.bunker
        ctx.fillRect(x, 240, 22, 2)
        ctx.fillStyle = col
        ctx.fillRect(x, 240, Math.max(0, Math.round(22 * frac)), 2)
    }

    // Modern-only overlay: combo multiplier and active power-up timers.
    function drawModernStatus(ctx, st, pal, c) {
        if (st.multiplier > 1) {
            var mtxt = "x" + st.multiplier
            drawText(ctx, mtxt, 224 - textWidth(mtxt, 2) - 8, 28, pal.ufo, 2)
        }
        var x = 118
        var eff = st.effects || {}
        var order = [["rapid", "RPD"], ["spread", "SPD"], ["pierce", "PRC"]]
        for (var i = 0; i < order.length; i++) {
            var k = order[i][0]
            if (eff[k] > 0) {
                drawEffectBar(ctx, pal, x, order[i][1], eff[k] / c.EFFECT_TIME,
                              powerupColor(k, pal))
                x += 30
            }
        }
        if (st.shield)
            drawText(ctx, "SHLD", x, 232, powerupColor("shield", pal))
    }

    // The playing field: everything the engine owns.
    function drawField(ctx, st, pal, c, hiScore) {
        drawHud(ctx, st, pal, hiScore)

        // Ground line and the lives readout under it.
        ctx.fillStyle = pal.ground
        ctx.fillRect(0, c.GROUND_Y, 224, 1)
        drawText(ctx, String(st.lives), 10, 243, pal.hud)
        for (var l = 0; l < Math.min(st.lives - 1, 5); l++)
            drawSprite(ctx, sprites.player, 24 + l * 16, 243, pal.player)

        for (var b = 0; b < st.bunkers.length; b++)
            drawBunker(ctx, st.bunkers[b], pal.bunker)

        for (var i = 0; i < st.aliens.length; i++) {
            var a = st.aliens[i]
            if (!a.alive) continue
            drawSprite(ctx, sprites.alien[a.row][a.frame], a.x, a.y, pal.rows[a.row])
        }

        // Modern boss + health bar.
        if (st.boss) {
            var bcol = st.boss.hitFlash > 0 ? pal.hud : pal.ufo
            drawSprite(ctx, sprites.boss, Math.round(st.boss.x), st.boss.y, bcol)
            var barW = 140, bx = (224 - barW) / 2, by = 30
            ctx.fillStyle = pal.bunker
            ctx.fillRect(bx, by, barW, 3)
            ctx.fillStyle = pal.ufo
            ctx.fillRect(bx, by, Math.max(0, Math.round(barW * st.boss.hp / st.boss.maxHp)), 3)
        }

        if (st.ufo)
            drawSprite(ctx, sprites.ufo, st.ufo.x, c.UFO_Y, pal.ufo)

        // Falling power-ups: a capsule with a one-letter label.
        if (st.powerups) {
            for (var p = 0; p < st.powerups.length; p++) {
                var pu = st.powerups[p]
                var col = powerupColor(pu.type, pal)
                ctx.fillStyle = col
                ctx.fillRect(pu.x + 1, pu.y, c.POWERUP_W - 2, c.POWERUP_H)
                ctx.fillRect(pu.x, pu.y + 1, c.POWERUP_W, c.POWERUP_H - 2)
                drawText(ctx, powerupLabel(pu.type), pu.x + 3, pu.y + 1, pal.bg)
            }
        }

        if (st.player.alive) {
            drawSprite(ctx, sprites.player, st.player.x, c.PLAYER_Y, pal.player)
            // Shield ring.
            if (st.shield) {
                ctx.fillStyle = pal.rows ? pal.rows[2] : pal.player
                var pw = sprites.player.w, ph = sprites.player.h
                ctx.fillRect(st.player.x - 2, c.PLAYER_Y + ph, pw + 4, 1)
                ctx.fillRect(st.player.x - 2, c.PLAYER_Y - 1, 1, ph + 1)
                ctx.fillRect(st.player.x + pw + 1, c.PLAYER_Y - 1, 1, ph + 1)
            }
        } else if (st.phase === "playerDying") {
            var f = Math.floor(st.dieTimer * 10) % 2
            drawSprite(ctx, sprites.explodePlayer[f], st.player.x - 2, c.PLAYER_Y, pal.explosion)
        }

        for (var bl = 0; bl < st.bullets.length; bl++) {
            ctx.fillStyle = pal.shot
            ctx.fillRect(Math.round(st.bullets[bl].x), Math.round(st.bullets[bl].y), 1, 4)
        }

        for (var s = 0; s < st.alienShots.length; s++) {
            var sh = st.alienShots[s]
            drawSprite(ctx, sprites.shots[sh.type][sh.frame], sh.x, sh.y, pal.shot)
        }

        for (var x = 0; x < st.explosions.length; x++) {
            var ex = st.explosions[x]
            if (ex.kind === "alien")
                drawSprite(ctx, sprites.explodeAlien, ex.x - 6, ex.y - 3, pal.explosion)
            else if (ex.kind === "shot")
                drawSprite(ctx, sprites.explodeShot, ex.x, ex.y, pal.explosion)
            else if (ex.kind === "ufo") {
                if (ex.t > 0.6)
                    drawSprite(ctx, sprites.explodeUfo, ex.x, ex.y, pal.ufo)
                else
                    drawText(ctx, ex.label, ex.x + 2, ex.y, pal.ufo)
            }
        }

        if (st.mode === "modern")
            drawModernStatus(ctx, st, pal, c)
    }

    // ------------------------------------------------------------- screens

    function drawTitle(ctx, pal, ui) {
        drawCentered(ctx, "INVADERS", 40, pal.player, 2)
        drawCentered(ctx, "IN THE SPIRIT OF 1978", 62, pal.hud)

        // Mode selector.
        var modern = ui.mode === "modern"
        var cCol = modern ? pal.bunker : pal.player
        var mCol = modern ? pal.player : pal.bunker
        var gap = 24
        var cw = textWidth("CLASSIC"), mw = textWidth("MODERN")
        var total = cw + gap + mw
        var sx = Math.round((224 - total) / 2)
        drawText(ctx, "CLASSIC", sx, 82, cCol)
        drawText(ctx, "MODERN", sx + cw + gap, 82, mCol)
        // Caret under the selected mode.
        var selX = modern ? sx + cw + gap : sx
        var selW = modern ? mw : cw
        ctx.fillStyle = pal.player
        ctx.fillRect(selX, 91, selW, 1)
        drawCentered(ctx, "< >  CHOOSE MODE", 100, pal.hud)

        if (modern)
            drawCentered(ctx, "POWER-UPS - COMBOS - BOSS EVERY 5", 114, pal.rows ? pal.rows[0] : pal.hud)
        else
            drawCentered(ctx, "THE FAITHFUL 1978 GAME", 114, pal.hud)

        var rows = [
            { sp: sprites.ufo, color: pal.ufo, label: "= ? MYSTERY" },
            { sp: sprites.alien[0][0], color: pal.rows[0], label: "= 30 POINTS" },
            { sp: sprites.alien[1][0], color: pal.rows[1], label: "= 20 POINTS" },
            { sp: sprites.alien[3][0], color: pal.rows[3], label: "= 10 POINTS" },
        ]
        for (var i = 0; i < rows.length; i++) {
            var y = 130 + i * 12
            drawSprite(ctx, rows[i].sp, 70 - rows[i].sp.w / 2 | 0, y, rows[i].color)
            drawText(ctx, rows[i].label, 88, y, pal.hud)
        }

        if (ui.scores && ui.scores.length > 0) {
            for (var s = 0; s < Math.min(ui.scores.length, 2); s++)
                drawCentered(ctx, ui.scores[s].initials + "  " + pad(ui.scores[s].score),
                             186 + s * 10, pal.bunker)
        }

        if (ui.blink)
            drawCentered(ctx, "PRESS ENTER TO PLAY", 216, pal.player)
        drawCentered(ctx, "<> MOVE  SPACE FIRE  M SOUND", 234, pal.bunker)
    }

    function drawPause(ctx, pal, ui) {
        ctx.fillStyle = pal.dimmer
        ctx.fillRect(0, 0, 224, 256)
        drawCentered(ctx, "PAUSED", 96, pal.player, 2)
        if (ui.menu) {
            drawCentered(ctx, "ENTER  RESUME", 130, pal.hud)
            drawCentered(ctx, "R      RESTART", 142, pal.hud)
            drawCentered(ctx, "ESC    QUIT", 154, pal.hud)
        } else {
            drawCentered(ctx, "P TO RESUME", 130, pal.hud)
        }
    }

    function drawGameOver(ctx, pal, ui) {
        drawCentered(ctx, "GAME OVER", 84, pal.ufo, 2)
        if (ui.reason === "invaded")
            drawCentered(ctx, "THE INVADERS HAVE LANDED", 110, pal.hud)
        drawCentered(ctx, "SCORE  " + pad(ui.score), 126, pal.hud)
        if (ui.blink)
            drawCentered(ctx, "PRESS ENTER", 160, pal.player)
    }

    function drawEntry(ctx, pal, ui) {
        drawCentered(ctx, "NEW HIGH SCORE", 72, pal.player, 2)
        drawCentered(ctx, pad(ui.score), 96, pal.hud)
        for (var i = 0; i < 3; i++) {
            var x = 88 + i * 18
            var selected = i === ui.position
            if (selected) {
                ctx.fillStyle = pal.player
                ctx.fillRect(x - 2, 116, 14, 1)
                ctx.fillRect(x - 2, 134, 14, 1)
            }
            drawText(ctx, ui.letters[i], x, 121, selected && ui.blink ? pal.player : pal.hud, 2)
        }
        drawCentered(ctx, "TYPE LETTERS - ARROWS - ENTER", 160, pal.bunker)
    }

    return {
        drawField: drawField,
        drawTitle: drawTitle,
        drawPause: drawPause,
        drawGameOver: drawGameOver,
        drawEntry: drawEntry,
        drawText: drawText,
        drawSprite: drawSprite,
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { createRenderer: createRenderer }
}
