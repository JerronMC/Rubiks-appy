import { DEFAULT_COLORS } from './cube.js';

export const DEFAULT_SETTINGS = {
  colors: { ...DEFAULT_COLORS }, palette: 'classic', corner: 18, gap: 8,
  accent: '#b9ed78', sound: true, volume: 28, smooth: true, speed: 180,
  vibration: false, hints: true, wakeLock: false, reduceMotion: false
};

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function loadSettings() {
  const stored = readJSON('rubiks-appy-settings-v3', {});
  return { ...DEFAULT_SETTINGS, ...stored, colors: { ...DEFAULT_COLORS, ...(stored.colors || {}) } };
}
export function saveSettings(settings) { return writeJSON('rubiks-appy-settings-v3', settings); }
export function loadTimerRecords() { return readJSON('rubiks-appy-timer-records-v3', []); }
export function saveTimerRecords(records) { return writeJSON('rubiks-appy-timer-records-v3', records); }
export function loadTournamentHistory() { return readJSON('rubiks-appy-tournament-history-v3', []); }
export function saveTournamentHistory(records) { return writeJSON('rubiks-appy-tournament-history-v3', records); }
export function saveLastScramble(scramble) { return writeJSON('rubiks-appy-last-scramble', scramble); }
export function loadLastScramble() { return readJSON('rubiks-appy-last-scramble', ''); }
