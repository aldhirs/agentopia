# Synthesises a light, cheerful backing track and the sound effects for the Agentopia promo.
# Everything is generated here (no samples), so it is free to use.
import sys, wave
import numpy as np

SR = 44100
DUR = 30.5
SCENES = [0, 3.0, 8.2, 12.4, 17.5, 22.2, 26.9, 30.5]
BPM = 116
BEAT = 60 / BPM
rng = np.random.default_rng(7)

def note_hz(n):  # MIDI note -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def env(n, attack, decay):
    t = np.arange(n) / SR
    e = np.exp(-t * decay)
    a = max(1, int(attack * SR))
    e[:a] *= np.linspace(0, 1, a)
    return e

def place(buf, start, sig, pan=0.0):
    i = int(start * SR)
    if i >= buf.shape[0]:
        return
    sig = sig[: buf.shape[0] - i]
    buf[i:i + len(sig), 0] += sig * (1 - max(0, pan))
    buf[i:i + len(sig), 1] += sig * (1 + min(0, pan))

def marimba(n, dur=0.45, vel=1.0):
    k = int(dur * SR); t = np.arange(k) / SR; f = note_hz(n)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 30) + 0.12 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t * 60)
    return 0.25 * vel * s * env(k, 0.002, 7)

def bell(n, dur=1.2, vel=1.0):
    k = int(dur * SR); t = np.arange(k) / SR; f = note_hz(n)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 12)
    return 0.16 * vel * s * env(k, 0.001, 3.5)

def bass(n, dur):
    k = int(dur * SR); t = np.arange(k) / SR; f = note_hz(n)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    return 0.32 * s * env(k, 0.005, 3.0)

def kick():
    k = int(0.25 * SR); t = np.arange(k) / SR
    f = 50 + 90 * np.exp(-t * 30)
    return 0.55 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)

def noise_hit(dur, decay, hp=True):
    k = int(dur * SR); n = rng.standard_normal(k)
    if hp: n = np.diff(np.concatenate([[0], n]))  # crude high-pass
    return n * env(k, 0.001, decay)

def pad(notes, dur):
    k = int(dur * SR); t = np.arange(k) / SR
    s = sum(np.sin(2 * np.pi * note_hz(n) * t) + 0.3 * np.sin(2 * np.pi * note_hz(n) * 2.003 * t) for n in notes)
    e = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4)
    return 0.035 * s * e

music = np.zeros((int(DUR * SR) + SR, 2))
# I - V - vi - IV in C major, one chord per bar.
CHORDS = [(60, [60, 64, 67], 36), (67, [62, 67, 71], 43), (69, [60, 64, 69], 45), (65, [60, 65, 69], 41)]
ARP = [0, 2, 1, 2, 0, 2, 1, 2]  # index into the chord, eighth notes
MELODY = {0: 76, 3: 79, 4: 77, 6: 76, 8: 74, 11: 72, 12: 74, 14: 76}  # sixteenth-step -> note, 2 bars
bar = 4 * BEAT
nbars = int(DUR / bar) + 1
for b in range(nbars):
    t0 = b * bar
    root, tri, bnote = CHORDS[b % 4]
    full = t0 >= SCENES[1] - 0.05 and t0 < SCENES[6] + bar  # beat drops in after the intro
    outro = t0 >= SCENES[6]
    place(music, t0, pad(tri, bar), 0)
    for e in range(8):
        n = tri[ARP[e]] + 12
        place(music, t0 + e * BEAT / 2, marimba(n, vel=0.9 if e % 2 == 0 else 0.6), pan=-0.3 if e % 2 else 0.3)
    if full and not outro:
        for q in range(4):
            if q in (0, 2): place(music, t0 + q * BEAT, kick())
            if q in (1, 3): place(music, t0 + q * BEAT, 0.16 * noise_hit(0.18, 22))  # soft clap
            place(music, t0 + q * BEAT, bass(bnote, BEAT * 0.9))
            place(music, t0 + q * BEAT + BEAT * 0.75, bass(bnote + 12 if q % 2 else bnote, BEAT * 0.25))
        for s16 in range(16):
            place(music, t0 + s16 * BEAT / 4, (0.05 if s16 % 2 else 0.03) * noise_hit(0.05, 70), pan=0.4)
        if b % 2 == 0:
            for step, n in MELODY.items():
                place(music, t0 + step * BEAT / 4, bell(n, vel=0.8), pan=-0.15)
# Final chord ringing out at the end.
place(music, SCENES[6] + 0.1, 3 * pad([60, 64, 67, 72], 3.4))
for i, n in enumerate([72, 76, 79, 84]):
    place(music, SCENES[6] + 0.15 + i * 0.09, bell(n, 2.5, 0.9))

# ---------- sound effects ----------
sfx = np.zeros_like(music)
def whoosh(dur=0.65):
    k = int(dur * SR); t = np.arange(k) / SR
    n = rng.standard_normal(k)
    # band-pass sweep: moving one-pole low-pass on a high-passed noise
    cutoff = 300 + 5000 * np.sin(np.pi * t / dur) ** 2
    out = np.zeros(k); y = 0.0
    a = np.exp(-2 * np.pi * cutoff / SR)
    hp = np.diff(np.concatenate([[0], n]))
    for i in range(k):
        y = a[i] * y + (1 - a[i]) * hp[i]
        out[i] = y
    return 0.9 * out * np.sin(np.pi * t / dur) ** 1.5
def pop():
    k = int(0.18 * SR); t = np.arange(k) / SR
    f = 500 + 700 * np.exp(-t * 25)
    return 0.45 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
def ding(n=84):
    return 1.6 * bell(n, 1.0, 1.0)
for i, at in enumerate(SCENES[1:-1]):
    w = whoosh()
    k = len(w); pan = np.linspace(-0.8, 0.8, k) if i % 2 == 0 else np.linspace(0.8, -0.8, k)
    st = int((at - 0.32) * SR)
    sfx[st:st + k, 0] += w * (1 - np.clip(pan, 0, 1)); sfx[st:st + k, 1] += w * (1 + np.clip(pan, -1, 0))
place(sfx, 0.08, pop())
place(sfx, SCENES[6] + 0.12, pop())
for at in (12.4, 13.35, 14.1, 14.9):  # quick cuts: a tiny tick
    place(sfx, at, 0.6 * noise_hit(0.06, 60))
place(sfx, 14.95, ding(88))       # raise a hand
for i in range(10):               # confetti sparkle
    place(sfx, 20.35 + i * 0.06, bell([84, 88, 91, 96][i % 4], 0.8, 0.7), pan=(-1) ** i * 0.6)
place(sfx, 25.6, ding(84)); place(sfx, 25.7, ding(91))  # "Done" chip

def write(name, buf, gain):
    buf = buf[: int(DUR * SR)] * gain
    peak = np.max(np.abs(buf))
    if peak > 0.98: buf = buf * 0.98 / peak
    with wave.open(name, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((buf * 32767).astype('<i2').tobytes())
write('music.wav', music, 0.6)
write('sfx.wav', sfx, 0.7)
print('ok')
