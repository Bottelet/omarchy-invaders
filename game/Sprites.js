// Original pixel art for Invaders — every sprite in this file was drawn for
// this plugin. The *style* is 1978 (chunky monochrome bitmaps, two-frame
// marching animation) but none of these are copies of the arcade originals:
// the antennae, eyes and leg patterns are our own. That distinction is what
// keeps the plugin marketplace-legal, so if you redraw a sprite, draw — don't
// trace.
//
// Format: arrays of strings, 'X' = lit pixel. Parsed once at load into row
// bitmasks by compile(). Plain JS, no QML imports — the engine and the Node
// tests both consume this file.

var SMALL_A = [
    "..X..X..",
    "...XX...",
    "..XXXX..",
    ".XX..XX.",
    "XXXXXXXX",
    "X.XXXX.X",
    "X......X",
    "..X..X..",
]

var SMALL_B = [
    "..X..X..",
    "...XX...",
    "..XXXX..",
    ".XX..XX.",
    "XXXXXXXX",
    ".XXXXXX.",
    ".X....X.",
    "X..XX..X",
]

var MEDIUM_A = [
    "..X.....X..",
    "X..X...X..X",
    "X.XXXXXXX.X",
    "XXX.XXX.XXX",
    "XXXXXXXXXXX",
    ".XXXXXXXXX.",
    "..X.....X..",
    ".X.......X.",
]

var MEDIUM_B = [
    "..X.....X..",
    "...X...X...",
    "X.XXXXXXX.X",
    "XXX.XXX.XXX",
    "XXXXXXXXXXX",
    "X.XXXXXXX.X",
    "X.X.....X.X",
    "...XX.XX...",
]

var LARGE_A = [
    "...XXXXXX...",
    ".XXXXXXXXXX.",
    "XXXXXXXXXXXX",
    "XX..XXXX..XX",
    "XXXXXXXXXXXX",
    "..XX.XX.XX..",
    ".XX..XX..XX.",
    "X..X....X..X",
]

var LARGE_B = [
    "...XXXXXX...",
    ".XXXXXXXXXX.",
    "XXXXXXXXXXXX",
    "XX..XXXX..XX",
    "XXXXXXXXXXXX",
    "..XX.XX.XX..",
    "..X..XX..X..",
    "...XX..XX...",
]

var PLAYER = [
    "......X......",
    ".....XXX.....",
    ".....XXX.....",
    ".XXXXXXXXXXX.",
    "XXXXXXXXXXXXX",
    "XXXXXXXXXXXXX",
    "XXXXXXXXXXXXX",
    "XXXXXXXXXXXXX",
]

var UFO = [
    ".....XXXXXX.....",
    "...XXXXXXXXXX...",
    "..XXXXXXXXXXXX..",
    ".XX.XX.XX.XX.XX.",
    "XXXXXXXXXXXXXXXX",
    "..XXX..XX..XXX..",
    "...X........X...",
]

// Modern-mode boss: a mothership that sweeps the top with a health bar.
// Original art, not a scaled invader.
var BOSS = [
    "......XXXXXXXXXXXXXXXXXXXXXX......",
    "....XXXXXXXXXXXXXXXXXXXXXXXXXX....",
    "..XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..",
    ".XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXX..XXXX..XXX..XX..XXX..XXXX..XXX",
    "XXX..XXXX..XXX..XX..XXX..XXXX..XXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    ".XX.XXXX.XXXX.XXXX.XXXX.XXXX.XXX.X",
    "..XXX..XXX..XXXXXXXX..XXX..XXXX...",
    "...X....XX..XX....XX..XX....X.....",
    ".........X...X....X...X...........",
]

// The four shields. Rebuilt from this template at the start of every wave,
// then eroded pixel-cluster by pixel-cluster in the engine's live copies.
var BUNKER = [
    "....XXXXXXXXXXXXXX....",
    "...XXXXXXXXXXXXXXXX...",
    "..XXXXXXXXXXXXXXXXXX..",
    ".XXXXXXXXXXXXXXXXXXXX.",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXX......XXXXXXXX",
    "XXXXXXX........XXXXXXX",
    "XXXXXX..........XXXXXX",
    "XXXXXX..........XXXXXX",
]

// Three visually distinct alien shot types, two animation frames each.
// "squiggly" zigzags, "plunger" pumps, "rolling" corkscrews.
var SHOT_SQUIGGLY_A = ["X..", ".X.", "..X", ".X.", "X..", ".X.", "..X"]
var SHOT_SQUIGGLY_B = ["..X", ".X.", "X..", ".X.", "..X", ".X.", "X.."]
var SHOT_PLUNGER_A  = [".X.", ".X.", ".X.", ".X.", ".X.", ".X.", "XXX"]
var SHOT_PLUNGER_B  = [".X.", ".X.", ".X.", ".X.", ".X.", "XXX", ".X."]
var SHOT_ROLLING_A  = [".X.", "XX.", ".X.", ".XX", ".X.", "XX.", ".X."]
var SHOT_ROLLING_B  = [".X.", ".XX", ".X.", "XX.", ".X.", ".XX", ".X."]

var EXPLODE_ALIEN = [
    "..X...X...X..",
    ".X.X.....X.X.",
    "X...X.X.X...X",
    "..X.......X..",
    "X...X.X.X...X",
    ".X.X.....X.X.",
    "..X...X...X..",
]

var EXPLODE_PLAYER_A = [
    "....X......X....",
    ".X....X.X.....X.",
    "...X..........X.",
    "X....XX.XXX.....",
    "..XXXXXXXXXX..X.",
    ".XXXXXXXXXXXX...",
    "XXXXXXXXXXXXXX.X",
    "XXXXXXXXXXXXXXXX",
]

var EXPLODE_PLAYER_B = [
    "X...X....X....X.",
    "..X....X....X...",
    "X..X.X....X....X",
    "....X.XXXX...X..",
    ".X.XXXXXXXXX....",
    "..XXXXXXXXXX..X.",
    "XXXXXXXXXXXXXX.X",
    "XXXXXXXXXXXXXXXX",
]

// A shot dying against the top of the screen, or in mid-air.
var EXPLODE_SHOT = [
    "X..X..X.",
    ".X.XX.X.",
    "..XXXX..",
    "XXX..XXX",
    "..XXXX..",
    ".X.XX.X.",
    "X..X..X.",
]

var EXPLODE_UFO = [
    ".X..X....X..X...",
    "X..X..XX....X..X",
    "..X.XXXXXX.X....",
    "X..XXX..XXX...X.",
    "..X.XXXXXX.X..X.",
    "X....X..X....X..",
    ".X.X......X.X...",
]

// Erosion mask blasted out of a bunker where a shot lands. Centered on the
// impact point; '.'s leave the bunker alone, 'X's clear it. The engine adds a
// random fringe on top so no two craters look alike.
var BLAST = [
    ".XX.XX.",
    "XXXXXXX",
    "XXXXXXX",
    "XXXXXXX",
    ".XXXXX.",
    "..X.X..",
]

// 5x7 pixel font, rows as 5-bit masks (bit 4 = leftmost pixel). Covers what
// the game prints: score bar, tables, prompts, initials.
var FONT = {
    "A": [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    "B": [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
    "C": [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
    "D": [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
    "E": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
    "F": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    "G": [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
    "H": [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    "I": [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "J": [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
    "K": [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    "L": [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
    "M": [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
    "N": [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    "O": [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    "P": [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    "Q": [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
    "R": [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
    "S": [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
    "T": [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    "U": [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    "V": [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
    "W": [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
    "X": [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
    "Y": [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
    "Z": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
    "0": [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
    "1": [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "2": [0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F],
    "3": [0x1F, 0x01, 0x02, 0x06, 0x01, 0x11, 0x0E],
    "4": [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
    "5": [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
    "6": [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
    "7": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    "8": [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
    "9": [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    "-": [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
    ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C],
    "=": [0x00, 0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00],
    "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
    ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
    "*": [0x00, 0x0A, 0x04, 0x1F, 0x04, 0x0A, 0x00],
    "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
    "?": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
    "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
    " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
}

// String art -> {w, h, rows: [bitmask]}, bit (w-1-x) set = pixel at x.
function compile(art) {
    var w = art[0].length
    var rows = []
    for (var y = 0; y < art.length; y++) {
        var bits = 0
        for (var x = 0; x < w; x++)
            if (art[y].charAt(x) === "X")
                bits |= 1 << (w - 1 - x)
        rows.push(bits)
    }
    return { w: w, h: art.length, rows: rows }
}

// Bunker template -> mutable 2D array of 0/1 for the engine to erode.
function bunkerGrid() {
    var grid = []
    for (var y = 0; y < BUNKER.length; y++) {
        var row = []
        for (var x = 0; x < BUNKER[y].length; x++)
            row.push(BUNKER[y].charAt(x) === "X" ? 1 : 0)
        grid.push(row)
    }
    return grid
}

var SPRITES = {
    // Row bands, top to bottom: small, medium, medium, large, large.
    alien: [
        [compile(SMALL_A), compile(SMALL_B)],
        [compile(MEDIUM_A), compile(MEDIUM_B)],
        [compile(MEDIUM_A), compile(MEDIUM_B)],
        [compile(LARGE_A), compile(LARGE_B)],
        [compile(LARGE_A), compile(LARGE_B)],
    ],
    player: compile(PLAYER),
    ufo: compile(UFO),
    boss: compile(BOSS),
    shots: {
        squiggly: [compile(SHOT_SQUIGGLY_A), compile(SHOT_SQUIGGLY_B)],
        plunger: [compile(SHOT_PLUNGER_A), compile(SHOT_PLUNGER_B)],
        rolling: [compile(SHOT_ROLLING_A), compile(SHOT_ROLLING_B)],
    },
    explodeAlien: compile(EXPLODE_ALIEN),
    explodePlayer: [compile(EXPLODE_PLAYER_A), compile(EXPLODE_PLAYER_B)],
    explodeShot: compile(EXPLODE_SHOT),
    explodeUfo: compile(EXPLODE_UFO),
    blast: compile(BLAST),
}

// QML: import "Sprites.js" as Sprites; Node: require("./Sprites.js").
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SPRITES: SPRITES,
        FONT: FONT,
        compile: compile,
        bunkerGrid: bunkerGrid,
    }
}
