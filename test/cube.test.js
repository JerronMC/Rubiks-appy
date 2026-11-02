import test from 'node:test';
import assert from 'node:assert/strict';
import { CubeModel, parseSequence, reverseSequence, movesToText, generateScramble } from '../js/cube.js';

function serialize(cube) {
  return cube.stickers
    .map(sticker => [sticker.x, sticker.y, sticker.z, sticker.nx, sticker.ny, sticker.nz, sticker.face].join(','))
    .sort()
    .join('|');
}

test('known scramble and its inverse restore each supported cube size', () => {
  for (const size of [2, 3, 4, 5, 10, 100]) {
    const cube = new CubeModel(size);
    const solved = serialize(cube);
    const scramble = parseSequence('main > right > Up > LEFT > DOWN', size);
    scramble.forEach(move => cube.apply(move));
    reverseSequence(scramble).forEach(move => cube.apply(move, false));
    assert.equal(serialize(cube), solved, `${size}x${size} did not return to solved state`);
  }
});

test('notation supports common moves, reverse turns and wide turns', () => {
  const moves = parseSequence("R U R' U' F2 3Rw M S' E2", 5);
  assert.equal(movesToText(moves), "R U R' U' F2 3Rw M S' E2");
});

test('natural direction words map to face notation', () => {
  assert.equal(movesToText(parseSequence('main > right > Up > LEFT > DOWN', 3)), 'M R U L D');
});

test('generated scrambles contain valid turns and avoid adjacent same-axis turns', () => {
  const text = generateScramble(3);
  const moves = parseSequence(text, 3);
  assert.equal(moves.length, 20);
  for (let i = 1; i < moves.length; i++) assert.notEqual(moves[i - 1].axis, moves[i].axis);
});
