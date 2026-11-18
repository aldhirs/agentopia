// Short relative times in Indonesian for the lobby lists.
export function relativeTime(t: number, now = Date.now()): string {
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const d = new Date(t);
  const hhmm = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (t >= startOfToday) return `hari ini ${hhmm}`;
  if (t >= startOfToday - 86_400_000) return `kemarin ${hhmm}`;
  const days = Math.floor((startOfToday - t) / 86_400_000) + 1;
  if (days < 7) return `${days} hari lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function duration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'kurang dari 1 menit';
  if (min < 60) return `${min} menit`;
  return `${Math.floor(min / 60)} jam ${min % 60} menit`;
}
