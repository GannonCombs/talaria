import { describe, it, expect } from 'vitest';
import { findNearestPinId } from '@/lib/modules/housing/pin-hittest';

describe('findNearestPinId', () => {
  // A small grid of pins for the geometry tests below.
  const pins = [
    { id: 1, x: 100, y: 100 },
    { id: 2, x: 200, y: 200 },
    { id: 3, x: 300, y: 300 },
  ];

  it('returns null when there are no pins at all', () => {
    expect(findNearestPinId(100, 100, [], 12)).toBeNull();
  });

  it('returns the id of a pin clicked exactly on center', () => {
    expect(findNearestPinId(100, 100, pins, 12)).toBe(1);
  });

  it('returns the id of a pin within the grace radius', () => {
    // 5px away from pin 1, well within 12px grace
    expect(findNearestPinId(105, 100, pins, 12)).toBe(1);
  });

  it('returns null when the click is just outside the grace radius', () => {
    // 13px away from pin 1, just past 12px
    expect(findNearestPinId(113, 100, pins, 12)).toBeNull();
  });

  it('returns the closer pin when two are within grace', () => {
    const overlapping = [
      { id: 10, x: 100, y: 100 },
      { id: 20, x: 105, y: 100 },
    ];
    // Click at x=101: pin 10 is 1px away, pin 20 is 4px away
    expect(findNearestPinId(101, 100, overlapping, 12)).toBe(10);
    // Click at x=104: pin 20 is 1px away, pin 10 is 4px away
    expect(findNearestPinId(104, 100, overlapping, 12)).toBe(20);
  });

  it('respects the grace radius parameter', () => {
    // 15px away — outside default 12 but inside custom 20
    expect(findNearestPinId(115, 100, pins, 12)).toBeNull();
    expect(findNearestPinId(115, 100, pins, 20)).toBe(1);
  });

  it('returns null when the click is far from every pin', () => {
    expect(findNearestPinId(0, 0, pins, 12)).toBeNull();
    expect(findNearestPinId(500, 500, pins, 12)).toBeNull();
  });

  it('handles diagonal distances using euclidean math', () => {
    // 3-4-5 right triangle: pin at (100,100), click at (103,104) → 5px away
    expect(findNearestPinId(103, 104, pins, 12)).toBe(1);
    // 8-6-10: same pin, click 10px diagonally → still inside 12
    expect(findNearestPinId(108, 106, pins, 12)).toBe(1);
    // 9-9-12.7: just outside 12
    expect(findNearestPinId(109, 109, pins, 12)).toBeNull();
  });

  it('scales gracefully across many pins (smoke test, 5000 pins)', () => {
    // Same shape as a real Austin refresh — make sure the loop terminates
    // in reasonable time on a realistic dataset.
    const many = Array.from({ length: 5000 }, (_, i) => ({
      id: i,
      x: (i * 13) % 1000,
      y: (i * 17) % 800,
    }));
    const result = findNearestPinId(500, 400, many, 12);
    // We don't care WHICH id matches, just that the call completes
    // and returns a number or null without throwing.
    expect(result === null || typeof result === 'number').toBe(true);
  });
});
