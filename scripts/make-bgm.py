# Synthesises the app's background music: an original, cozy countryside waltz (no samples, so it
# is free to use). The arrangement builds and breathes so the loop does not feel flat:
#   intro (music box + guitar) -> A (flute) -> A' (drums + accordion counter-line) -> B (accordion
#   lead, flute harmony) -> B' (fuller, glockenspiel) -> bridge in D minor (sparse, whistle) ->
#   A in G major (key change, everything) -> tag that turns back to F for the loop.
# Timing and velocity are humanised, sections have their own level, and the reverb tail of the
# last bar is folded onto the start so the file loops without a seam.
# Usage: python3 scripts/make-bgm.py out.wav && ffmpeg -i out.wav -c:a libopus -b:a 96k src/assets/bgm.ogg
import sys, wave
import numpy as np

SR = 44100
BPM = 112
BEAT = 60 / BPM
BAR = 3 * BEAT
rng = np.random.default_rng(23)

def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)

def human(t, amount=0.008):
    return t + rng.normal(0, amount)

def vel(v, spread=0.08):
    return max(0.2, v * (1 + rng.normal(0, spread)))

def place(buf, start, sig, pan=0.0, level=1.0):
    i = max(0, int(round(start * SR)))
    sig = sig[: max(0, buf.shape[0] - i)] * level
    buf[i:i + len(sig), 0] += sig * (1 - max(0.0, pan))
    buf[i:i + len(sig), 1] += sig * (1 + min(0.0, pan))

def adsr(k, a, d, s, r):
    t = np.arange(k) / SR; dur = k / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    return e * np.clip((dur - t) / max(r, 1e-4), 0, 1)

# --- instruments ---------------------------------------------------------------------------

def pluck(n, dur=1.4, v=1.0):
    """Nylon guitar: bright attack, upper harmonics die first."""
    k = int(dur * SR); t = np.arange(k) / SR; f = hz(n)
    s = sum(a * np.sin(2 * np.pi * f * h * t + h) * np.exp(-t * (2.0 + 2.8 * h))
            for h, a in ((1, 1.0), (2, 0.55), (3, 0.3), (4, 0.16), (5, 0.09), (6, 0.05), (7, 0.03)))
    a = int(0.003 * SR); s[:a] *= np.linspace(0, 1, a)
    return 0.1 * v * s

def flute(n, dur, v=1.0):
    k = int(dur * SR); t = np.arange(k) / SR; f = hz(n)
    scoop = 1 - 0.012 * np.exp(-t * 30)                      # slides up into the note
    vib = 1 + 0.005 * np.sin(2 * np.pi * 5.4 * t + rng.uniform(0, 6)) * np.clip((t - 0.15) / 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * scoop * vib) / SR
    s = np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph) + 0.04 * np.sin(4 * ph)
    noise = rng.standard_normal(k)
    chiff = np.convolve(noise, np.ones(8) / 8, mode='same') * np.exp(-t * 40) * 0.35
    breath = np.convolve(noise, np.ones(30) / 30, mode='same') * 0.04
    return 0.12 * v * (s + chiff + breath) * adsr(k, 0.05, 0.3, 0.8, 0.09)

def accordion(n, dur, v=1.0):
    """Two slightly detuned reeds (band-limited saw, darkened) with bellows swell."""
    k = int(dur * SR); t = np.arange(k) / SR; f = hz(n)
    s = np.zeros(k)
    for det in (-0.0025, 0.0025):
        for h in range(1, 13):
            s += (1 / h) * np.exp(-h / 4.5) * np.sin(2 * np.pi * f * (1 + det) * h * t)
    swell = 0.85 + 0.15 * np.sin(np.pi * np.clip(t / max(dur, 0.1), 0, 1))
    return 0.05 * v * s * swell * adsr(k, 0.04, 0.4, 0.85, 0.08)

def whistle(n, dur, v=1.0):
    k = int(dur * SR); t = np.arange(k) / SR; f = hz(n)
    vib = 1 + 0.007 * np.sin(2 * np.pi * 6 * t) * np.clip((t - 0.1) / 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    return 0.09 * v * (np.sin(ph) + 0.05 * np.sin(2 * ph)) * adsr(k, 0.07, 0.3, 0.85, 0.12)

def bell(n, v=1.0):
    """Music box / glockenspiel."""
    k = int(1.6 * SR); t = np.arange(k) / SR; f = hz(n)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 8) \
        + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 16)
    return 0.05 * v * s * np.exp(-t * 2.8)

def bass(n, dur, v=1.0):
    k = int(dur * SR); t = np.arange(k) / SR; f = hz(n)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 5) \
        + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 9)
    return 0.2 * v * s * adsr(k, 0.008, 0.5, 0.45, 0.06)

def kick(v=1.0):
    k = int(0.3 * SR); t = np.arange(k) / SR
    f = 48 + 70 * np.exp(-t * 35)
    return 0.32 * v * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12)

def brush(v=1.0, dur=0.22):
    k = int(dur * SR); t = np.arange(k) / SR
    n = np.diff(np.concatenate([[0], rng.standard_normal(k)]))
    n = np.convolve(n, np.ones(3) / 3, mode='same')
    return 0.035 * v * n * np.minimum(1, t / 0.01) * np.exp(-t * 14)

def tick(v=1.0):
    k = int(0.05 * SR); t = np.arange(k) / SR
    return 0.05 * v * np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 120)

# --- harmony ---------------------------------------------------------------------------------

CHORDS = {  # root (MIDI, bass register) and intervals
    'F': (41, (0, 4, 7)), 'C': (48, (0, 4, 7)), 'Dm': (50, (0, 3, 7)), 'Bb': (46, (0, 4, 7)),
    'Am': (45, (0, 3, 7)), 'Gm': (43, (0, 3, 7)), 'C7': (48, (0, 4, 7, 10)), 'D7': (50, (0, 4, 7, 10)),
    'G': (43, (0, 4, 7)),
}

def voicing(root, ivs, lo=58):
    out = []
    for iv in ivs:
        n = root + iv
        while n < lo: n += 12
        while n >= lo + 12: n -= 12
        out.append(n)
    return sorted(out)

F_MAJOR = [5, 7, 9, 10, 0, 2, 4]

def third_below(n):
    """Diatonic third below in F major (harmony line for the B choruses)."""
    pc = n % 12
    if pc not in F_MAJOR:
        return n - 4
    target = F_MAJOR[(F_MAJOR.index(pc) - 2) % 7]
    return n - ((pc - target) % 12)

# --- melodies: (beat offset, MIDI note, length in beats) per bar ------------------------------

A = [
    ('F',  [(0, 72, 1), (1, 69, .5), (1.5, 70, .5), (2, 72, 1)]),
    ('C',  [(0, 74, 1.5), (1.5, 72, .5), (2, 70, 1)]),
    ('Dm', [(0, 69, 2), (2, 65, 1)]),
    ('Bb', [(0, 67, 1), (1, 69, 1), (2, 70, 1)]),
    ('F',  [(0, 72, 1), (1, 77, 1), (2, 76, .5), (2.5, 74, .5)]),
    ('C',  [(0, 72, 2), (2, 67, 1)]),
    ('Bb', [(0, 70, 1), (1, 69, .5), (1.5, 67, .5), (2, 65, 1)]),
    ('C',  [(0, 67, 2), (2, 72, 1)]),
]
A2 = [  # embellished repeat, ends home
    ('F',  [(0, 72, .5), (.5, 74, .5), (1, 72, .5), (1.5, 70, .5), (2, 72, 1)]),
    ('C',  [(0, 74, 1), (1, 76, .5), (1.5, 74, .5), (2, 72, 1)]),
    ('Dm', [(0, 69, 1.5), (1.5, 70, .5), (2, 69, .5), (2.5, 65, .5)]),
    ('Bb', [(0, 67, .5), (.5, 69, .5), (1, 70, .5), (1.5, 72, .5), (2, 74, 1)]),
    ('F',  [(0, 77, 1), (1, 76, .5), (1.5, 74, .5), (2, 72, 1)]),
    ('C',  [(0, 74, .5), (.5, 72, .5), (1, 70, 1), (2, 67, 1)]),
    ('Bb', [(0, 70, 1), (1, 69, .5), (1.5, 67, .5), (2, 64, 1)]),
    ('F',  [(0, 65, 3)]),
]
B = [
    ('Bb', [(0, 74, 1), (1, 77, 1), (2, 74, 1)]),
    ('C',  [(0, 72, 1.5), (1.5, 74, .5), (2, 76, 1)]),
    ('Am', [(0, 76, 1), (1, 72, 1), (2, 69, 1)]),
    ('Dm', [(0, 74, 2), (2, 77, 1)]),
    ('Gm', [(0, 79, 1), (1, 77, 1), (2, 74, 1)]),
    ('C',  [(0, 72, 1), (1, 74, .5), (1.5, 76, .5), (2, 79, 1)]),
    ('F',  [(0, 77, 2), (2, 72, 1)]),
    ('C7', [(0, 72, 1), (1, 70, 1), (2, 67, 1)]),
]
B2 = B[:6] + [('F', [(0, 77, 1), (1, 81, 1), (2, 79, .5), (2.5, 77, .5)]), ('C7', [(0, 76, 1), (1, 74, 1), (2, 72, 1)])]
BRIDGE = [
    ('Dm', [(0, 69, 2), (2, 74, 1)]),
    ('Am', [(0, 72, 3)]),
    ('Bb', [(0, 70, 1), (1, 74, 1), (2, 77, 1)]),
    ('F',  [(0, 76, 2), (2, 72, 1)]),
    ('Gm', [(0, 70, 1), (1, 72, 1), (2, 74, 1)]),
    ('Dm', [(0, 77, 2), (2, 74, 1)]),
    ('Bb', [(0, 74, 1), (1, 72, 1), (2, 70, 1)]),
    ('D7', [(0, 69, 1), (1, 72, 1), (2, 66, 1)]),
]
TAG = [('G', [(0, 74, 3)]), ('C7', [(0, 70, 1), (1, 72, 1), (2, 67, 1)])]  # G -> C7 -> loops to F

# (name, bars, transpose, level, lead, extras)
FORM = [
    ('intro',  A[:4],   0, 0.70, None,        {'box'}),
    ('a',      A,       0, 0.85, 'flute',     set()),
    ('a2',     A2,      0, 0.95, 'flute',     {'drums', 'counter'}),
    ('b',      B,       0, 1.00, 'accordion', {'drums', 'harmony'}),
    ('b2',     B2,      0, 1.08, 'accordion', {'drums', 'harmony', 'glock'}),
    ('bridge', BRIDGE,  0, 0.78, 'whistle',   {'sparse'}),
    ('a_up',   A2,      2, 1.12, 'flute',     {'drums', 'counter', 'glock'}),
    ('tag',    TAG,     0, 0.85, 'flute',     {'box'}),
]
# The tag is written in concert pitch (G then C7), so it is not transposed.

LEADS = {'flute': (flute, 0.12), 'accordion': (accordion, -0.1), 'whistle': (whistle, 0.2)}

bars = sum(len(sec[1]) for sec in FORM)
length = bars * BAR
TAIL = 4.0
buf = np.zeros((int((length + TAIL) * SR), 2))

bar_i = 0
for name, section, tr, level, lead, extras in FORM:
    for j, (chord, melody) in enumerate(section):
        t0 = bar_i * BAR
        root, ivs = CHORDS[chord]
        root += tr if chord in CHORDS and name != 'tag' else 0
        chord_notes = voicing(root, ivs)
        last_bar = j == len(section) - 1
        L = level

        # bass: root on 1, fifth or approach note on 3 (walks into the next bar)
        place(buf, human(t0, 0.004), bass(root, BEAT * 1.9, vel(1.0)), -0.05, L)
        if 'sparse' not in extras:
            place(buf, human(t0 + 2 * BEAT, 0.004), bass(root + 7 if j % 2 == 0 else root + 4, BEAT * 0.9, vel(0.7)), -0.05, L)

        # guitar oom-pah-pah (bridge: single arpeggio, more air)
        if 'sparse' in extras:
            for b, n in zip((0, 1, 2), chord_notes):
                place(buf, human(t0 + b * BEAT), pluck(n, 2.0, vel(0.75)), -0.35, L)
        else:
            for b in (1, 2):
                for k, n in enumerate(chord_notes):
                    place(buf, human(t0 + b * BEAT) + k * 0.011, pluck(n, v=vel(0.8 if b == 1 else 0.7)), -0.3, L)

        # drums: soft kick on 1, brushes on 2 and 3, a little fill at the end of each section
        if 'drums' in extras:
            place(buf, human(t0, 0.003), kick(vel(1.0)), 0, L)
            for b in (1, 2):
                place(buf, human(t0 + b * BEAT, 0.006), brush(vel(0.8 if b == 1 else 0.6)), 0.25, L)
            if last_bar:
                for s in range(6):
                    place(buf, human(t0 + s * BEAT / 2, 0.004), tick(vel(0.5 + 0.1 * s)), 0.3, L)
            elif j % 2 == 1:
                place(buf, human(t0 + 2.5 * BEAT, 0.006), brush(vel(0.35), 0.12), 0.25, L)
        elif 'sparse' not in extras:
            place(buf, human(t0 + BEAT), brush(vel(0.35)), 0.3, L)

        # lead melody (+ harmony a third below for the accordion choruses)
        if lead:
            fn, pan = LEADS[lead]
            for off, n, d in melody:
                n2 = n + (tr if name != 'tag' else 0)
                place(buf, human(t0 + off * BEAT, 0.01), fn(n2, d * BEAT * 0.97, vel(1.0, 0.1)), pan, L)
                if 'harmony' in extras:
                    place(buf, human(t0 + off * BEAT, 0.012), flute(third_below(n2), d * BEAT * 0.95, vel(0.45)), 0.35, L)

        # counter-line: accordion holds the chord's top note (long notes under a busy melody)
        if 'counter' in extras:
            place(buf, human(t0, 0.01), accordion(chord_notes[-1], BAR * 0.96, vel(0.55)), -0.15, L)

        # music box arpeggio (intro / tag) and glockenspiel sparkles on the melody's long notes
        if 'box' in extras:
            for s, n in enumerate([chord_notes[0], chord_notes[1], chord_notes[2], chord_notes[1], chord_notes[2], chord_notes[0] + 12]):
                place(buf, human(t0 + s * BEAT / 2, 0.004), bell(n + 12, vel(0.8)), 0.4, L)
        if 'glock' in extras:
            for off, n, d in melody:
                if d >= 1:
                    place(buf, human(t0 + off * BEAT, 0.006), bell(n + 12 + tr, vel(0.6)), 0.45, L)
        bar_i += 1

# Room reverb: convolve with decaying stereo noise.
ir_len = int(1.8 * SR)
ir_t = np.arange(ir_len) / SR
wet = np.zeros_like(buf)
for ch in range(2):
    ir = rng.standard_normal(ir_len) * np.exp(-ir_t * 3.0) * 0.012
    n = len(buf) + ir_len
    size = 1 << (n - 1).bit_length()
    wet[:, ch] = np.fft.irfft(np.fft.rfft(buf[:, ch], size) * np.fft.rfft(ir, size), size)[: len(buf)]
mix = buf + 0.4 * wet

loop_n = int(length * SR)
out = mix[:loop_n].copy()
tail = mix[loop_n:]
out[: len(tail)] += tail

out = np.tanh(out / np.max(np.abs(out)) * 1.15) * 0.82
pcm = (out * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'bgm.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'{bars} bars, {length:.1f}s')
