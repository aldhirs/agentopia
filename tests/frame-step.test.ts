// Walking and the lobby orbit must move at the same real speed whatever the frame rate,
// including 8 FPS while the window is in the background.
import { describe, expect, it } from 'vitest';
import { frameStep, MAX_STEP_S } from '../src/office3d/character';

function simulate(fps: number, seconds: number) {
  let prev = 0, total = 0;
  for (let now = 1000; now <= 1000 + seconds * 1000; now += 1000 / fps) {
    total += frameStep(prev, now);
    prev = now;
  }
  return total;
}

describe('frame time step', () => {
  it('covers the same time at 120, 60, 24 and 8 FPS', () => {
    for (const fps of [120, 60, 24, 8]) expect(simulate(fps, 10)).toBeCloseTo(10, 1);
  });

  it('starts at zero and caps a long pause', () => {
    expect(frameStep(0, 5000)).toBe(0);
    expect(frameStep(1000, 60_000)).toBe(MAX_STEP_S);
    expect(frameStep(2000, 1000)).toBe(0);
  });
});
