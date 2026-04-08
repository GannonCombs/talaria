// Pure hit-test helper for the housing map's delegated click handler.
// Lives outside the React component so it can be unit-tested without
// pulling in Leaflet (which needs `window` and breaks node-env tests).

export interface HitTestPin {
  id: number;
  x: number;
  y: number;
}

// Given a click position and a set of pin positions in the same pixel
// space, find the id of the nearest pin within `gracePx`. Returns null
// if no pin is within range.
export function findNearestPinId(
  clickX: number,
  clickY: number,
  pins: HitTestPin[],
  gracePx: number
): number | null {
  let nearest: { id: number; dist: number } | null = null;
  for (const pin of pins) {
    const dx = pin.x - clickX;
    const dy = pin.y - clickY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= gracePx && (!nearest || dist < nearest.dist)) {
      nearest = { id: pin.id, dist };
    }
  }
  return nearest ? nearest.id : null;
}
