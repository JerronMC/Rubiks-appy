import { parseSequence, reverseSequence, movesToText } from './cube.js';

export function makeSolverSequence(text, size) {
  const moves = parseSequence(text, size);
  const inverse = reverseSequence(moves);
  return { moves, inverse, inverseText: movesToText(inverse) };
}
