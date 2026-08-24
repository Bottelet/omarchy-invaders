#!/usr/bin/env python3
"""Render the Invaders sound bank to WAV.

Every sound the game makes is synthesized right here — square waves and noise
bursts in the 1978 idiom, but generated, never sampled. No arcade audio was
harmed, copied, or resampled in the making of this plugin; that is a legal
requirement, not a style choice. QtMultimedia plays files and cannot
synthesize, so this runs once and the WAVs ship in the repo (a plugin install
is a git clone with no build step).

    ./make_sounds.py            # writes *.wav next to this script

Re-run after changing a generator. Python stdlib only.
"""

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44100
random.seed(19780605)   # reproducible noise


def render(path, duration, generator):
    """Sample generator(t, p) into a 16-bit mono WAV.

    t is seconds elapsed, p is progress 0..1 — enough to shape both the
    waveform and its envelope.
    """
    count = int(SAMPLE_RATE * duration)
    frames = bytearray()
    for i in range(count):
        value = generator(i / SAMPLE_RATE, i / count)
        value = max(-1.0, min(1.0, value))
        frames += struct.pack("<h", int(value * 32767))
    with wave.open(path, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(bytes(frames))


def looped(generator, duration, fade=0.015):
    """Cross-fade the head over the tail so a looping WAV doesn't tick."""
    def wrapped(t, p):
        v = generator(t, p)
        edge = duration * (1 - p)
        if edge < fade:
            k = edge / fade
            v = v * k + generator(t - duration, 0.0) * (1 - k)
        return v
    return wrapped


def square(freq, t):
    return 1.0 if math.sin(2 * math.pi * freq * t) >= 0 else -1.0


def noise():
    return random.random() * 2 - 1


# ---------------------------------------------------------------- generators

def heartbeat(freq):
    """One thump of the four-note bass line. Square wave, hard decay —
    the note is felt more than heard, and at last-alien tempo it must stay
    punchy rather than smear."""
    def gen(t, p):
        return square(freq, t) * (1 - p) ** 3 * 0.42
    return gen


def shoot(t, p):
    f = 1400 - 1100 * p
    return square(f, t) * (1 - p) ** 2 * 0.30


def invader_killed(t, p):
    f = 320 - 220 * p
    body = square(f, t) * 0.35
    return (body + noise() * 0.45) * (1 - p) ** 2 * 0.8


def player_explode(t, p):
    rumble = square(48 + 20 * (1 - p), t) * 0.35
    return (rumble + noise() * 0.65) * (1 - p) ** 1.3 * 0.7


def ufo_warble_raw(t, p):
    # Two detuned squares under a fast vibrato: the classic siren wobble,
    # constant amplitude because it loops while the saucer crosses.
    vib = 1 + 0.06 * math.sin(2 * math.pi * 9 * t)
    a = square(310 * vib, t)
    b = square(392 * vib, t)
    return (a * 0.5 + b * 0.5) * 0.28


def ufo_hit(t, p):
    vib = 1 + 0.10 * math.sin(2 * math.pi * (9 + 30 * p) * t)
    tone = square(340 * vib * (1 - 0.6 * p), t) * 0.4
    return (tone + noise() * 0.5 * p) * (1 - p) ** 1.2 * 0.8


def extra_life(t, p):
    steps = [660, 880, 990, 1320]
    f = steps[min(int(p * 4), 3)]
    return square(f, t) * (1 - (p * 4) % 1.0) ** 1.5 * 0.30


UFO_LOOP_LEN = 0.55

BANK = {
    "beat1": (0.14, heartbeat(68.0)),
    "beat2": (0.14, heartbeat(62.0)),
    "beat3": (0.14, heartbeat(56.0)),
    "beat4": (0.14, heartbeat(51.0)),
    "shoot": (0.16, shoot),
    "invader_killed": (0.22, invader_killed),
    "player_explode": (0.65, player_explode),
    "ufo": (UFO_LOOP_LEN, looped(ufo_warble_raw, UFO_LOOP_LEN)),
    "ufo_hit": (0.55, ufo_hit),
    "extra_life": (0.45, extra_life),
}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for name, (duration, generator) in BANK.items():
        path = os.path.join(here, name + ".wav")
        render(path, duration, generator)
        print(f"  {name}.wav  {duration:.2f}s")


if __name__ == "__main__":
    main()
