export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const centiseconds = Math.floor(ms / 10);
  const seconds = Math.floor(centiseconds / 100);
  const cs = centiseconds % 100;
  const minutes = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function ao5(values) {
  if (values.length !== 5) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return average(sorted.slice(1, 4));
}
