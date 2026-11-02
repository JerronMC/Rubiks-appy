import { CubeModel, COLOR_PRESETS, DEFAULT_COLORS, parseSequence, invertMove, movesToText, generateScramble } from './cube.js';
import { CubeRenderer } from './renderer.js';
import { TurnSound } from './sound.js';
import { loadSettings, saveSettings, loadTimerRecords, saveTimerRecords, loadTournamentHistory, saveTournamentHistory, saveLastScramble, loadLastScramble, DEFAULT_SETTINGS } from './storage.js';
import { formatTime, average, ao5 } from './tournament.js';
import { makeSolverSequence } from './solver.js';

const $ = id => document.getElementById(id);
const settings = loadSettings();
const sound = new TurnSound();
sound.configure({ enabled: settings.sound, volume: settings.volume });
let cube = new CubeModel(3);
const renderer = new CubeRenderer($('cubeCanvas'), cube, () => settings);
let currentTab = 'cube';
let playMode = 'free';
let currentScramble = loadLastScramble() || '';
let moveQueue = [];
let isMoving = false;
let solverSequence = null;
let timerRecords = loadTimerRecords();
let tournamentHistory = loadTournamentHistory();
let wakeLock = null;
let timer = { running: false, start: 0, elapsed: 0, raf: 0, saved: false };
let tournament = { active: false, round: 0, times: [], scramble: '', running: false, start: 0, elapsed: 0, raf: 0 };
let toastTimeout = 0;

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 2100);
}

function persistSettings() {
  saveSettings(settings);
  sound.configure({ enabled: settings.sound, volume: settings.volume });
  document.documentElement.style.setProperty('--accent', settings.accent);
  document.documentElement.style.setProperty('--accent-strong', lighten(settings.accent));
  $('canvasHint').hidden = !settings.hints;
  updateFaceDots();
  renderer.draw();
}

function lighten(hex) {
  const raw = hex.replace('#', '');
  const n = parseInt(raw, 16);
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(value => Math.round(value + (255 - value) * 0.22));
  return `#${parts.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function updateFaceDots() {
  const mapping = { U: 'U', D: 'D', L: 'L', R: 'R', F: 'F', B: 'B' };
  for (const [face, key] of Object.entries(mapping)) {
    document.querySelectorAll(`.face-${face}`).forEach(el => el.style.background = settings.colors[key]);
  }
}

function showTab(tab) {
  if (!document.getElementById(`page-${tab}`)) return;
  currentTab = tab;
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `page-${tab}`));
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  if (tab === 'cube') requestAnimationFrame(() => renderer.resize());
  if (tab === 'timer') renderTimerRecords();
  if (tab === 'tournament') renderTournament();
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
}

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
document.querySelectorAll('[data-tab-link]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); showTab(link.dataset.tabLink); }));

function updateCubeInfo() {
  const sizeLabel = `${cube.size} × ${cube.size}`;
  $('currentSizeLabel').textContent = sizeLabel;
  $('statSize').textContent = `${cube.size}×${cube.size}`;
  $('timerSize').textContent = `${cube.size}×${cube.size}`;
  $('canvasBadge').textContent = `${cube.size}×${cube.size} · ${playMode.toUpperCase()}`;
  $('solverStatus').textContent = solverSequence ? 'Scramble sequence loaded. You can now animate its reverse.' : 'Enter the moves that created the scramble. Auto solve plays them backwards.';
  $('moveCount').textContent = String(cube.history.length);
  const recent = cube.history.slice(-14).map(move => move.label || move.token).join(' ');
  $('moveLog').textContent = recent || 'No moves yet.';
  $('controlHint').textContent = playMode === 'easy' ? 'One tap = one easy clockwise turn' : playMode === 'zen' ? 'Slow, gentle turns. Take your time.' : 'Tap a face to turn it';
  $('cubeStatus').textContent = isMoving ? 'Turning smoothly…' : 'Ready to turn';
}

function setScramble(value) {
  currentScramble = String(value || '');
  $('scrambleText').textContent = currentScramble || 'Ready when you are.';
  saveLastScramble(currentScramble);
}

function animateMove(move) {
  const baseDuration = settings.reduceMotion ? 65 : settings.smooth ? Number(settings.speed) : 0;
  const duration = playMode === 'zen' && baseDuration > 0 ? Math.max(260, baseDuration) : baseDuration;
  if (duration <= 0) {
    renderer.setAnimation(move, 1);
    return new Promise(resolve => requestAnimationFrame(resolve));
  }
  return new Promise(resolve => {
    const start = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      renderer.setAnimation(move, eased);
      if (progress < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function pumpMoves() {
  if (isMoving || !moveQueue.length) return;
  isMoving = true;
  updateCubeInfo();
  while (moveQueue.length) {
    const move = moveQueue.shift();
    await animateMove(move);
    cube.apply(move, true);
    renderer.setAnimation(null, 0);
    await sound.play(move.token || move.label || '');
    if (settings.vibration && navigator.vibrate) navigator.vibrate(7);
    updateCubeInfo();
  }
  isMoving = false;
  updateCubeInfo();
  renderer.draw();
}

function enqueueMoves(moves) {
  if (!Array.isArray(moves) || moves.length === 0) return;
  moveQueue.push(...moves);
  pumpMoves();
}

function queueFaceTurn(face, direction = 1) {
  sound.unlock();
  if (isMoving || moveQueue.length) { toast('Let the current turn finish first.'); return; }
  try {
    const token = face + (direction < 0 ? "'" : '');
    enqueueMoves(parseSequence(token, cube.size));
  } catch (error) { toast(error.message); }
}

function selectSize(size) {
  if (isMoving || moveQueue.length) { toast('Wait for the current turn to finish.'); return; }
  cube.setSize(Number(size));
  renderer.setCube(cube);
  currentScramble = '';
  setScramble('');
  solverSequence = null;
  $('solverInput').value = '';
  document.querySelectorAll('.size-chip').forEach(button => button.classList.toggle('active', Number(button.dataset.size) === cube.size));
  updateCubeInfo();
  $('timerSaveButton').disabled = !timer.elapsed;
  toast(`Switched to ${cube.size}×${cube.size}.`);
}

document.querySelectorAll('.size-chip').forEach(button => button.addEventListener('click', () => selectSize(button.dataset.size)));

function doScramble() {
  sound.unlock();
  if (isMoving || moveQueue.length) { toast('Let the current turn finish first.'); return; }
  const scramble = generateScramble(cube.size);
  cube.reset();
  renderer.draw();
  setScramble(scramble);
  $('solverInput').value = scramble;
  solverSequence = parseSequence(scramble, cube.size);
  updateCubeInfo();
  enqueueMoves(solverSequence);
  toast('New scramble generated.');
}

$('scrambleButton').addEventListener('click', doScramble);
$('resetButton').addEventListener('click', () => {
  if (isMoving || moveQueue.length) { toast('Let the current turn finish first.'); return; }
  cube.reset(); renderer.draw(); setScramble(''); solverSequence = null; updateCubeInfo(); toast('Cube reset.');
});
$('undoButton').addEventListener('click', async () => {
  sound.unlock();
  if (isMoving || moveQueue.length) { toast('Let the current turn finish first.'); return; }
  const original = cube.history.pop();
  if (!original) { toast('There is no move to undo.'); return; }
  const reverse = invertMove(original);
  isMoving = true; updateCubeInfo();
  await animateMove(reverse);
  cube.apply(reverse, false);
  renderer.setAnimation(null, 0);
  isMoving = false; updateCubeInfo(); sound.play(reverse.token || '');
});
$('randomButton').addEventListener('click', () => {
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  queueFaceTurn(faces[Math.floor(Math.random() * faces.length)], Math.random() > 0.5 ? 1 : -1);
});
$('clearMovesButton').addEventListener('click', () => { cube.history = []; updateCubeInfo(); toast('Move list cleared.'); });
$('copyScrambleButton').addEventListener('click', async () => {
  if (!currentScramble) { toast('There is no scramble to copy.'); return; }
  try { await navigator.clipboard.writeText(currentScramble); toast('Scramble copied.'); }
  catch { toast('Copy is unavailable in this browser.'); }
});

document.querySelectorAll('[data-move][data-dir]').forEach(button => button.addEventListener('click', () => {
  sound.unlock();
  queueFaceTurn(button.dataset.move, Number(button.dataset.dir));
}));

function setMode(mode) {
  playMode = mode;
  $('playMode').value = mode;
  document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  $('controlDock').classList.toggle('easy-mode', mode === 'easy');
  $('faceControlGrid').hidden = mode === 'easy';
  $('easyTurnStrip').hidden = mode !== 'easy';
  if (mode === 'zen') {
    $('controlHint').textContent = 'A slower, calmer way to practice';
  }
  updateCubeInfo();
}
$('playMode').addEventListener('change', event => setMode(event.target.value));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));

// Drag to inspect the cube. Touch gestures are scoped to the canvas only.
let pointer = null;
$('cubeCanvas').addEventListener('pointerdown', event => {
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  $('cubeCanvas').setPointerCapture(event.pointerId);
  $('cubeCanvas').classList.add('dragging');
});
$('cubeCanvas').addEventListener('pointermove', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
  pointer.x = event.clientX; pointer.y = event.clientY;
  renderer.rotateCamera(dx, dy);
});
function endPointer(event) {
  if (pointer && pointer.id === event.pointerId) pointer = null;
  $('cubeCanvas').classList.remove('dragging');
}
$('cubeCanvas').addEventListener('pointerup', endPointer);
$('cubeCanvas').addEventListener('pointercancel', endPointer);
$('cubeCanvas').addEventListener('lostpointercapture', () => { pointer = null; $('cubeCanvas').classList.remove('dragging'); });

// Simple global keyboard shortcuts.
document.addEventListener('keydown', event => {
  const tag = event.target?.tagName?.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
  if (event.code === 'Space' && (currentTab === 'timer' || currentTab === 'tournament')) {
    event.preventDefault();
    if (currentTab === 'timer') toggleTimer(); else toggleTournamentTimer();
    return;
  }
  if (event.code === 'Escape' && currentTab === 'timer') { resetTimer(); return; }
  if (currentTab !== 'cube' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const face = event.key.toUpperCase();
  if (['R', 'L', 'U', 'D', 'F', 'B'].includes(face)) queueFaceTurn(face, event.shiftKey ? -1 : 1);
});

// Timer logic
function timerText() { return formatTime(timer.running ? performance.now() - timer.start : timer.elapsed); }
function updateTimerDisplay() {
  $('timerDisplay').textContent = timerText();
  $('timerDisplay').classList.toggle('running', timer.running);
  $('timerLiveDot').style.background = timer.running ? 'var(--accent)' : '#7b8d80';
  $('timerState').textContent = timer.running ? 'RUNNING' : timer.elapsed ? 'STOPPED' : 'READY';
  $('timerInstruction').textContent = timer.running ? 'Tap Stop or press Space to finish.' : timer.elapsed ? 'Save your solve or reset to try again.' : 'Tap Start or press Space to begin.';
  $('timerStartButton').textContent = timer.running ? 'Stop' : timer.elapsed ? 'Start again' : 'Start';
  $('timerSaveButton').disabled = timer.running || timer.elapsed <= 0 || timer.saved;
}
function timerTick() {
  if (!timer.running) return;
  updateTimerDisplay();
  timer.raf = requestAnimationFrame(timerTick);
}
function startTimer() {
  if (timer.running) return;
  if (timer.elapsed > 0) timer.elapsed = 0;
  timer.running = true; timer.start = performance.now(); timer.saved = false;
  cancelAnimationFrame(timer.raf); timerTick(); updateTimerDisplay(); sound.unlock();
}
function stopTimer() {
  if (!timer.running) return;
  timer.elapsed = Math.max(0, performance.now() - timer.start);
  timer.running = false; cancelAnimationFrame(timer.raf); updateTimerDisplay();
}
function toggleTimer() { if (timer.running) stopTimer(); else startTimer(); }
function resetTimer() {
  timer.running = false; timer.elapsed = 0; timer.saved = false; cancelAnimationFrame(timer.raf); updateTimerDisplay();
}
function saveTimerSolve() {
  if (timer.running || timer.elapsed <= 0 || timer.saved) return;
  const record = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, time: timer.elapsed, date: Date.now(), size: cube.size };
  timerRecords.unshift(record); timerRecords = timerRecords.slice(0, 100);
  saveTimerRecords(timerRecords); timer.saved = true; renderTimerRecords(); updateTimerDisplay(); toast('Solve saved to your records.');
}
$('timerStartButton').addEventListener('click', toggleTimer);
$('timerResetButton').addEventListener('click', resetTimer);
$('timerSaveButton').addEventListener('click', saveTimerSolve);
$('newTimerScramble').addEventListener('click', () => { $('timerScrambleText').textContent = generateScramble(cube.size); });
$('clearTimerRecords').addEventListener('click', () => { timerRecords = []; saveTimerRecords(timerRecords); renderTimerRecords(); toast('Timer records cleared.'); });
function renderTimerRecords() {
  const list = $('timerRecordList');
  if (!timerRecords.length) list.innerHTML = '<p class="empty-state">Your saved times will appear here.</p>';
  else list.innerHTML = timerRecords.slice(0, 12).map((record, index) => `<div class="record-row"><div><b>${formatTime(record.time)}</b><small>${record.size}×${record.size} · ${new Date(record.date).toLocaleDateString()}</small></div><button class="record-remove" data-remove-record="${record.id}" aria-label="Delete solve">×</button></div>`).join('');
  const best = timerRecords.length ? Math.min(...timerRecords.map(record => record.time)) : null;
  $('personalBest').textContent = best == null ? '—' : formatTime(best);
  $('totalSolves').textContent = String(timerRecords.length);
  $('averageTime').textContent = timerRecords.length ? formatTime(average(timerRecords.map(record => record.time))) : '—';
  list.querySelectorAll('[data-remove-record]').forEach(button => button.addEventListener('click', () => {
    timerRecords = timerRecords.filter(record => record.id !== button.dataset.removeRecord);
    saveTimerRecords(timerRecords); renderTimerRecords();
  }));
}

// Mini five-round tournament
function tournamentDisplayTime() { return formatTime(tournament.running ? performance.now() - tournament.start : tournament.elapsed); }
function updateTournamentTimer() {
  $('tournamentTimerDisplay').textContent = tournamentDisplayTime();
  $('tournamentStartButton').textContent = tournament.running ? 'Stop round' : tournament.elapsed ? 'Start again' : 'Start round';
  $('tournamentSaveButton').disabled = tournament.running || tournament.elapsed <= 0 || tournament.round >= 5;
}
function tournamentTick() {
  if (!tournament.running) return;
  updateTournamentTimer(); tournament.raf = requestAnimationFrame(tournamentTick);
}
function startNewTournament() {
  tournament = { active: true, round: 1, times: [], scramble: generateScramble(cube.size), running: false, start: 0, elapsed: 0, raf: 0 };
  renderTournament(); toast('Tournament started. Round 1 is ready.');
}
function toggleTournamentTimer() {
  if (!tournament.active) startNewTournament();
  if (tournament.running) {
    tournament.elapsed = Math.max(0, performance.now() - tournament.start);
    tournament.running = false; cancelAnimationFrame(tournament.raf);
  } else {
    if (tournament.elapsed > 0) tournament.elapsed = 0;
    tournament.running = true; tournament.start = performance.now();
    cancelAnimationFrame(tournament.raf); tournamentTick(); sound.unlock();
  }
  updateTournamentTimer();
}
function resetTournamentRound() {
  if (!tournament.active) return;
  tournament.running = false; tournament.elapsed = 0; cancelAnimationFrame(tournament.raf); updateTournamentTimer();
}
function saveTournamentRound() {
  if (!tournament.active || tournament.running || tournament.elapsed <= 0 || tournament.round > 5) return;
  tournament.times.push(tournament.elapsed);
  if (tournament.times.length === 5) {
    tournament.active = false;
    const result = { id: Date.now(), date: Date.now(), times: [...tournament.times], ao5: ao5(tournament.times), best: Math.min(...tournament.times), worst: Math.max(...tournament.times) };
    tournamentHistory.unshift(result); tournamentHistory = tournamentHistory.slice(0, 30); saveTournamentHistory(tournamentHistory);
    tournament.round = 5;
    $('tournamentHint').textContent = `Finished! Average of 5: ${formatTime(result.ao5)}.`;
    toast('Tournament complete! Great work.');
  } else {
    tournament.round += 1;
    tournament.scramble = generateScramble(cube.size);
    tournament.elapsed = 0;
    $('tournamentHint').textContent = `Round ${tournament.round} is ready. Keep going!`;
    toast(`Round ${tournament.times.length} saved.`);
  }
  renderTournament();
}
function renderTournament() {
  $('tournamentStatus').textContent = !tournament.active && tournament.times.length === 5 ? 'Tournament complete!' : tournament.active ? `Round ${tournament.round} of 5` : 'Ready when you are';
  $('roundCounter').innerHTML = `${tournament.times.length}<span>/5</span>`;
  $('roundTrack').querySelectorAll('span').forEach((span, index) => span.classList.toggle('done', index < tournament.times.length));
  $('tournamentScrambleText').textContent = tournament.scramble || 'Start a tournament to generate your first scramble.';
  $('tournamentHint').textContent = tournament.active ? 'Save each stopped time to advance to the next round.' : tournament.times.length === 5 ? 'All five rounds are complete.' : 'Complete five solves to see your result.';
  $('tournamentTimerDisplay').textContent = tournamentDisplayTime();
  $('tournamentStartButton').disabled = tournament.times.length === 5 && !tournament.active;
  $('tournamentStartButton').textContent = tournament.running ? 'Stop round' : tournament.elapsed ? 'Start again' : 'Start round';
  $('tournamentSaveButton').disabled = tournament.running || tournament.elapsed <= 0 || !tournament.active;
  const values = tournament.times;
  $('ao5Display').textContent = values.length === 5 ? formatTime(ao5(values)) : '—';
  $('tournamentBest').textContent = values.length ? formatTime(Math.min(...values)) : '—';
  $('tournamentWorst').textContent = values.length ? formatTime(Math.max(...values)) : '—';
  const rounds = values.map((time, index) => `<div class="round-row"><span>Round ${index + 1}</span><b>${formatTime(time)}</b></div>`).join('');
  const historyRows = tournamentHistory.slice(0, 4).map((result, index) => `<div class="round-row"><span>Past event ${index + 1} · ${new Date(result.date).toLocaleDateString()}</span><b>${formatTime(result.ao5)}</b></div>`).join('');
  $('roundList').innerHTML = rounds + (historyRows ? `<div class="history-divider"></div>${historyRows}` : '') || '<p class="empty-state">No rounds recorded yet.</p>';
}
$('tournamentStartButton').addEventListener('click', toggleTournamentTimer);
$('tournamentResetButton').addEventListener('click', resetTournamentRound);
$('tournamentSaveButton').addEventListener('click', saveTournamentRound);
$('tournamentNewButton').addEventListener('click', startNewTournament);
$('newTournamentScramble').addEventListener('click', () => { if (!tournament.active) startNewTournament(); else { tournament.scramble = generateScramble(cube.size); renderTournament(); } });
$('clearTournamentHistory').addEventListener('click', () => { tournamentHistory = []; saveTournamentHistory(tournamentHistory); renderTournament(); toast('Tournament history cleared.'); });

// Solver: apply a known sequence and play its exact inverse.
function renderSolverInverse() {
  if (!solverSequence?.length) { $('inverseSequence').textContent = '—'; return; }
  $('inverseSequence').textContent = movesToText([...solverSequence].reverse().map(invertMove));
}
$('applyScrambleButton').addEventListener('click', () => {
  sound.unlock();
  if (isMoving || moveQueue.length) { toast('Wait for the current cube turns to finish.'); return; }
  try {
    solverSequence = parseSequence($('solverInput').value, cube.size);
    if (!solverSequence.length) throw new Error('Enter at least one move first.');
    cube.reset(); renderer.draw();
    setScramble($('solverInput').value.trim());
    renderSolverInverse();
    $('solverStatus').textContent = `Applying ${solverSequence.length} moves to a solved ${cube.size}×${cube.size} cube…`;
    enqueueMoves(solverSequence);
    toast('Scramble sequence applied.');
  } catch (error) { $('solverStatus').textContent = error.message; toast(error.message); }
});
$('loadCurrentScrambleButton').addEventListener('click', () => {
  const scramble = currentScramble || loadLastScramble();
  if (!scramble) { toast('No current scramble is saved.'); return; }
  $('solverInput').value = scramble;
  try { solverSequence = parseSequence(scramble, cube.size); renderSolverInverse(); $('solverStatus').textContent = 'Current scramble loaded. Press Apply sequence if the cube does not already show it.'; }
  catch (error) { $('solverStatus').textContent = error.message; }
});
$('autoSolveButton').addEventListener('click', () => {
  sound.unlock();
  if (isMoving || moveQueue.length) { toast('Wait for the current cube turns to finish.'); return; }
  try {
    if (!solverSequence) solverSequence = parseSequence($('solverInput').value, cube.size);
    const inverse = [...solverSequence].reverse().map(invertMove);
    if (!inverse.length) throw new Error('Load a scramble sequence first.');
    $('solverStatus').textContent = `Animating ${inverse.length} inverse moves…`;
    enqueueMoves(inverse);
    toast('Auto solve started.');
  } catch (error) { $('solverStatus').textContent = error.message; toast(error.message); }
});
$('solverInput').addEventListener('input', () => {
  try { const parsed = parseSequence($('solverInput').value, cube.size); $('inverseSequence').textContent = movesToText([...parsed].reverse().map(invertMove)) || '—'; }
  catch { $('inverseSequence').textContent = 'Check your notation'; }
});

// Settings controls
function setInputValue(id, value) { const el = $(id); if (el) el.value = value; }
function fillSettingsUI() {
  setInputValue('paletteSelect', settings.palette);
  setInputValue('cornerRange', settings.corner); $('cornerValue').textContent = `${settings.corner}%`;
  setInputValue('gapRange', settings.gap); $('gapValue').textContent = `${settings.gap}%`;
  setInputValue('accentPicker', settings.accent);
  setInputValue('volumeRange', settings.volume); $('volumeValue').textContent = `${settings.volume}%`;
  setInputValue('speedRange', settings.speed); $('speedValue').textContent = `${settings.speed} ms`;
  $('soundSetting').checked = settings.sound; $('smoothSetting').checked = settings.smooth;
  $('vibrationSetting').checked = settings.vibration; $('hintsSetting').checked = settings.hints;
  $('wakeLockSetting').checked = settings.wakeLock; $('reduceMotionSetting').checked = settings.reduceMotion;
  renderColorPickers();
}
function renderColorPickers() {
  const names = { U: 'Up', D: 'Down', L: 'Left', R: 'Right', F: 'Front', B: 'Back' };
  $('colorPickerGrid').innerHTML = Object.keys(names).map(face => `<label class="color-field"><span>${face} · ${names[face]}</span><input type="color" data-face-color="${face}" value="${settings.colors[face]}"></label>`).join('');
  $('colorPickerGrid').querySelectorAll('[data-face-color]').forEach(input => input.addEventListener('input', () => {
    settings.colors[input.dataset.faceColor] = input.value; settings.palette = 'custom'; $('paletteSelect').value = 'custom'; persistSettings();
  }));
}
$('paletteSelect').addEventListener('change', event => {
  settings.palette = event.target.value;
  if (COLOR_PRESETS[settings.palette]) settings.colors = { ...COLOR_PRESETS[settings.palette] };
  renderColorPickers(); persistSettings();
});
$('cornerRange').addEventListener('input', event => { settings.corner = Number(event.target.value); $('cornerValue').textContent = `${settings.corner}%`; persistSettings(); });
$('gapRange').addEventListener('input', event => { settings.gap = Number(event.target.value); $('gapValue').textContent = `${settings.gap}%`; persistSettings(); });
$('accentPicker').addEventListener('input', event => { settings.accent = event.target.value; persistSettings(); });
$('volumeRange').addEventListener('input', event => { settings.volume = Number(event.target.value); $('volumeValue').textContent = `${settings.volume}%`; persistSettings(); });
$('speedRange').addEventListener('input', event => { settings.speed = Number(event.target.value); $('speedValue').textContent = `${settings.speed} ms`; persistSettings(); });
$('soundSetting').addEventListener('change', event => { settings.sound = event.target.checked; persistSettings(); updateSoundButton(); });
$('smoothSetting').addEventListener('change', event => { settings.smooth = event.target.checked; persistSettings(); });
$('vibrationSetting').addEventListener('change', event => { settings.vibration = event.target.checked; persistSettings(); });
$('hintsSetting').addEventListener('change', event => { settings.hints = event.target.checked; persistSettings(); });
$('reduceMotionSetting').addEventListener('change', event => { settings.reduceMotion = event.target.checked; persistSettings(); });
$('wakeLockSetting').addEventListener('change', async event => {
  settings.wakeLock = event.target.checked; persistSettings();
  if (!settings.wakeLock) { try { await wakeLock?.release(); } catch {} wakeLock = null; }
  else if ('wakeLock' in navigator) { try { wakeLock = await navigator.wakeLock.request('screen'); toast('Screen wake lock enabled.'); } catch { toast('Screen wake lock is not available right now.'); } }
  else toast('Screen wake lock is not supported by this browser.');
});
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && settings.wakeLock && 'wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* best effort */ }
  }
});
$('resetSettingsButton').addEventListener('click', () => {
  Object.assign(settings, DEFAULT_SETTINGS, { colors: { ...DEFAULT_COLORS } });
  fillSettingsUI(); persistSettings(); toast('Settings restored to default.');
});

function updateSoundButton() {
  $('soundToggle').classList.toggle('active', settings.sound);
  $('soundIcon').textContent = settings.sound ? '♫' : '♪̸';
  $('soundToggle').title = settings.sound ? 'Turn sound off' : 'Turn sound on';
}
$('soundToggle').addEventListener('click', () => {
  settings.sound = !settings.sound; $('soundSetting').checked = settings.sound; persistSettings(); updateSoundButton(); sound.unlock();
  toast(settings.sound ? 'Relaxing turn sound on.' : 'Turn sound muted.');
});
$('fullscreenButton').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch { toast('Fullscreen is not available in this browser.'); }
});

// Initial view and first paint.
fillSettingsUI();
persistSettings();
updateSoundButton();
setMode('free');
updateCubeInfo();
setScramble(currentScramble);
renderTimerRecords();
renderTournament();
$('timerScrambleText').textContent = generateScramble(cube.size);
if (location.hash && document.getElementById(`page-${location.hash.slice(1)}`)) showTab(location.hash.slice(1));
window.addEventListener('resize', () => renderer.resize(), { passive: true });

// Optional PWA offline cache. The app still works as a normal GitHub Pages website without it.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
