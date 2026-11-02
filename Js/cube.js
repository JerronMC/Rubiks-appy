export const FACE_NAMES = { F: 'Front', B: 'Back', R: 'Right', L: 'Left', U: 'Up', D: 'Down' };
export const DEFAULT_COLORS = {
  F: '#55bd79', B: '#5d8fe1', R: '#e45b5b', L: '#ed914c', U: '#f4f2e9', D: '#f5d34d'
};
export const COLOR_PRESETS = {
  classic: { ...DEFAULT_COLORS },
  pastel: { F: '#83d7b4', B: '#91aaf0', R: '#ef9da7', L: '#f4bd87', U: '#fff8e8', D: '#f4df8d' },
  neon: { F: '#00df78', B: '#3285ff', R: '#ff365e', L: '#ff9f1c', U: '#f6f7f4', D: '#ffeb00' },
  ocean: { F: '#20c99a', B: '#357ed6', R: '#ed6f7b', L: '#22a5b8', U: '#e9f7ff', D: '#f5d76a' },
  sunset: { F: '#d971a0', B: '#766be0', R: '#ff7264', L: '#f6a04a', U: '#fff0d8', D: '#f1ce62' }
};

const FACE_SPECS = {
  F: { axis: 'z', side: 1, dir: -1 },
  B: { axis: 'z', side: -1, dir: 1 },
  R: { axis: 'x', side: 1, dir: -1 },
  L: { axis: 'x', side: -1, dir: 1 },
  U: { axis: 'y', side: 1, dir: -1 },
  D: { axis: 'y', side: -1, dir: 1 }
};

function centerValue(size) { return (size - 1) / 2; }
function rotateVector(vector, axis, quarterTurns) {
  const angle = quarterTurns * Math.PI / 2;
  const c = Math.round(Math.cos(angle));
  const s = Math.round(Math.sin(angle));
  const { x, y, z } = vector;
  if (axis === 'x') return { x, y: y * c - z * s, z: y * s + z * c };
  if (axis === 'y') return { x: x * c + z * s, y, z: -x * s + z * c };
  return { x: x * c - y * s, y: x * s + y * c, z };
}

function faceLayer(size, axis, side) {
  const c = centerValue(size);
  return side > 0 ? c : -c;
}

function middleLayers(size, axis) {
  const c = centerValue(size);
  if (size % 2 === 1) return [0];
  return [-0.5, 0.5].map(v => v);
}

export class CubeModel {
  constructor(size = 3) {
    this.size = Number(size);
    this.stickers = [];
    this.history = [];
    this.reset();
  }

  reset() {
    const n = this.size;
    const c = centerValue(n);
    const faces = [
      ['F', (r, col) => ({ x: col - c, y: c - r, z: c, nx: 0, ny: 0, nz: 1 })],
      ['B', (r, col) => ({ x: c - col, y: c - r, z: -c, nx: 0, ny: 0, nz: -1 })],
      ['R', (r, col) => ({ x: c, y: c - r, z: c - col, nx: 1, ny: 0, nz: 0 })],
      ['L', (r, col) => ({ x: -c, y: c - r, z: col - c, nx: -1, ny: 0, nz: 0 })],
      ['U', (r, col) => ({ x: col - c, y: c, z: r - c, nx: 0, ny: 1, nz: 0 })],
      ['D', (r, col) => ({ x: col - c, y: -c, z: c - r, nx: 0, ny: -1, nz: 0 })]
    ];
    const next = [];
    for (const [face, point] of faces) {
      for (let r = 0; r < n; r++) {
        for (let col = 0; col < n; col++) {
          next.push({ ...point(r, col), face });
        }
      }
    }
    this.stickers = next;
    this.history = [];
  }

  setSize(size) {
    const value = Math.max(2, Math.min(100, Number(size) || 3));
    this.size = value;
    this.reset();
  }

  isAffected(sticker, move) {
    return move.layers.some(layer => Math.abs(sticker[move.axis] - layer) < 1e-7);
  }

  apply(move, record = true) {
    if (!move || !['x', 'y', 'z'].includes(move.axis) || !Array.isArray(move.layers)) return false;
    const q = move.quarterTurns || 1;
    for (const sticker of this.stickers) {
      if (!this.isAffected(sticker, move)) continue;
      const position = rotateVector({ x: sticker.x, y: sticker.y, z: sticker.z }, move.axis, q);
      const normal = rotateVector({ x: sticker.nx, y: sticker.ny, z: sticker.nz }, move.axis, q);
      sticker.x = position.x; sticker.y = position.y; sticker.z = position.z;
      sticker.nx = normal.x; sticker.ny = normal.y; sticker.nz = normal.z;
    }
    if (record) this.history.push(cloneMove(move));
    return true;
  }

  undo() {
    const move = this.history.pop();
    if (!move) return null;
    const reverse = invertMove(move);
    this.apply(reverse, false);
    return reverse;
  }
}

export function cloneMove(move) {
  return { ...move, layers: [...move.layers] };
}

export function invertMove(move) {
  const next = cloneMove(move);
  next.quarterTurns *= -1;
  const original = String(move.label || move.token || '?');
  next.label = original.endsWith('2') ? original : original.endsWith("'") ? original.slice(0, -1) : `${original}'`;
  next.token = next.label;
  return next;
}

export function formatMove(move) {
  return move.label || move.token || '?';
}

function makeMove(axis, layers, quarterTurns, token) {
  return { axis, layers: [...layers], quarterTurns, token, label: token };
}

function resolveToken(token, size) {
  let t = token.trim().replace(/[’‘]/g, "'").replace(/^(main|middle)$/i, 'M');
  const aliases = { RIGHT: 'R', LEFT: 'L', UP: 'U', DOWN: 'D', FRONT: 'F', BACK: 'B', TOP: 'U', BOTTOM: 'D' };
  const upper = t.toUpperCase();
  if (aliases[upper]) t = aliases[upper];
  else t = t.replace(/^(right|left|up|down|front|back|middle|main)/i, m => aliases[m.toUpperCase()] || 'M');
  t = t.replace(/\s+/g, '');
  const match = t.match(/^(\d+)?(Rw|Lw|Uw|Dw|Fw|Bw|[FBRLUDMESxyz])(['2]?)$/i);
  if (!match) return null;
  const width = Number(match[1] || (match[2].toLowerCase().endsWith('w') ? 2 : 1));
  const base = match[2].toUpperCase();
  const suffix = match[3] || '';
  const amount = suffix.includes('2') ? 2 : 1;
  const prime = suffix.includes("'");
  const c = centerValue(size);
  let axis, layers, direction;

  if (FACE_SPECS[base]) {
    const spec = FACE_SPECS[base];
    axis = spec.axis;
    direction = spec.dir * (prime ? -1 : 1) * amount;
    const outer = faceLayer(size, axis, spec.side);
    const step = spec.side > 0 ? -1 : 1;
    layers = Array.from({ length: Math.max(1, Math.min(size, width)) }, (_, i) => outer + step * i);
  } else if (base.endsWith('W')) {
    const face = base[0];
    const spec = FACE_SPECS[face];
    axis = spec.axis;
    direction = spec.dir * (prime ? -1 : 1) * amount;
    const outer = faceLayer(size, axis, spec.side);
    const step = spec.side > 0 ? -1 : 1;
    layers = Array.from({ length: Math.max(2, Math.min(size, width)) }, (_, i) => outer + step * i);
  } else if (base === 'M' || base === 'E' || base === 'S') {
    axis = base === 'M' ? 'x' : base === 'E' ? 'y' : 'z';
    layers = middleLayers(size, axis);
    direction = (base === 'M' ? 1 : base === 'E' ? 1 : -1) * (prime ? -1 : 1) * amount;
  } else {
    axis = base.toLowerCase();
    layers = Array.from({ length: size }, (_, i) => i - c);
    direction = -1 * (prime ? -1 : 1) * amount;
  }

  if (size === 2 && ['M', 'E', 'S'].includes(base)) {
    // A 2×2 has no internal slice. Keep the notation valid but make it a harmless outer turn.
    const fallback = base === 'M' ? 'L' : base === 'E' ? 'D' : 'F';
    return resolveToken(fallback + suffix, size);
  }

  return makeMove(axis, layers, direction, token);
}

export function parseSequence(input, size = 3) {
  const normalized = String(input || '')
    .replace(/[→>;,]+/g, ' ')
    .replace(/\bclockwise\b/gi, '')
    .replace(/\bcounter\s*clockwise\b/gi, "'")
    .replace(/\b(main|middle)\b/gi, 'M')
    .replace(/\b(right|left|up|down|front|back|top|bottom)\b/gi, word => ({ right: 'R', left: 'L', up: 'U', down: 'D', front: 'F', back: 'B', top: 'U', bottom: 'D' }[word.toLowerCase()]));
  const tokens = normalized.trim().split(/\s+/).filter(Boolean);
  const moves = [];
  for (const token of tokens) {
    const move = resolveToken(token, size);
    if (!move) throw new Error(`I couldn't read “${token}”. Try moves like R, U', F2 or M.`);
    moves.push(move);
  }
  return moves;
}

export function generateScramble(size = 3, length = null) {
  const n = Number(size) || 3;
  const count = length || (n === 2 ? 11 : n === 3 ? 20 : Math.min(40, 2 * n + 10));
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  const suffixes = ['', "'", '2'];
  const result = [];
  let previousAxis = '';
  while (result.length < count) {
    const face = faces[Math.floor(Math.random() * faces.length)];
    const axis = FACE_SPECS[face].axis;
    if (axis === previousAxis) continue;
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    result.push(face + suffix);
    previousAxis = axis;
  }
  return result.join(' ');
}

export function reverseSequence(moves) {
  return [...moves].reverse().map(move => invertMove(move));
}

export function movesToText(moves) {
  return moves.map(move => move.label || move.token || '?').join(' ');
}
