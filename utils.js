(function () {
'use strict';
// Petits outils partagés : dates, formats d'affichage (allures, durées, nombres) et couleurs du thème.
const DAY = 86400000;
const V = (name) => `var(--${name})`;
const readColors = () => { const cs = getComputedStyle(document.documentElement), g = (v) => cs.getPropertyValue('--' + v).trim();
return { text: g('text'), text2: g('text-2'), muted: g('muted'), grid: g('grid'), axis: g('axis'), accent: g('accent'), s1: g('series-1'),
s3: g('series-3'), s7: g('series-7'), serious: g('serious'), surface: g('surface'), tip: g('tip-bg'), band: g('band'), neutral: g('neutral') }; };
const parseLocal = (s) => new Date(String(s).replace(' ', 'T'));
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d) => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; };
const fmtDM = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const fmtDate = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const pad = (n) => String(n).padStart(2, '0');
const fmtPace = (secPerKm) => { if (!isFinite(secPerKm) || secPerKm <= 0) return '–'; const s = Math.round(secPerKm); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const fmtDur = (sec) => { if (!isFinite(sec)) return '–'; const s = Math.round(sec); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const fmtHM = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`; };
const parseTime = (t) => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
const km = (m) => (m || 0) / 1000;
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt0 = (n) => Math.round(n).toLocaleString('fr-FR');
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;
const clamp0 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const noAccent = (s) => s.normalize('NFD').replace(/[^\x00-\x7F]/g, '');
window.U = { DAY, V, readColors, parseLocal, dayKey, startOfDay, addDays, monday, fmtDM, fmtDate, pad, fmtPace, fmtDur, fmtHM, parseTime, km, fmt1, fmt0, avg, clamp0, esc, noAccent };
})();
