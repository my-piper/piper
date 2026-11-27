import { Box } from "src/utils/groups";

/** The minimap's size in px (#336). */
export const MINIMAP = { w: 220, h: 140, margin: 40 };

export type MinimapFrame = {
  /** Map px per canvas px. */
  scale: number;
  /** The canvas point drawn at the map's top-left corner. */
  x: number;
  y: number;
};

/**
 * How the minimap shows the canvas: the union of `boxes` (nodes, groups,
 * the visible area) plus a margin, scaled to fit the map and centred in it.
 */
export function minimapFrame(boxes: Box[]): MinimapFrame {
  const all = boxes.length > 0 ? boxes : [{ x: 0, y: 0, w: 1, h: 1 }];
  const left = Math.min(...all.map((b) => b.x)) - MINIMAP.margin;
  const top = Math.min(...all.map((b) => b.y)) - MINIMAP.margin;
  const right = Math.max(...all.map((b) => b.x + b.w)) + MINIMAP.margin;
  const bottom = Math.max(...all.map((b) => b.y + b.h)) + MINIMAP.margin;
  const scale = Math.min(
    MINIMAP.w / (right - left),
    MINIMAP.h / (bottom - top),
  );
  return {
    scale,
    x: left - (MINIMAP.w / scale - (right - left)) / 2,
    y: top - (MINIMAP.h / scale - (bottom - top)) / 2,
  };
}

/** A canvas box in map px. */
export function toMap(box: Box, frame: MinimapFrame): Box {
  return {
    x: (box.x - frame.x) * frame.scale,
    y: (box.y - frame.y) * frame.scale,
    w: box.w * frame.scale,
    h: box.h * frame.scale,
  };
}

/** A point on the map (px from its top-left) as a canvas point. */
export function toCanvas(
  point: { x: number; y: number },
  frame: MinimapFrame,
): { x: number; y: number } {
  return {
    x: frame.x + point.x / frame.scale,
    y: frame.y + point.y / frame.scale,
  };
}
