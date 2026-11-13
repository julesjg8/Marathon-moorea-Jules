(function () {
'use strict';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pad = (n) => String(n).padStart(2, '0');
const fmtPace = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const fmtMin = (s) => `${Math.round(s / 60)} min`;
const pct = (x) => `${Math.round(x * 100)} %`;
const flat = (steps) => steps.flatMap((s) => (s.repeat ? Array.from({ length: s.repeat }, () => s.steps).flat() : [s]));
const stepSec = (s) => (s.dur.type === 'time' ? s.dur.s : (s.dur.m / 1000) * s.est);
const NOT_KEY = new Set(['Footing', 'Endurance active', 'Acceleration']);
function score(session, run, rawLaps, ctx) {
const laps = (rawLaps || []).map(([t, d, hr, mx]) => ({ t, d, hr, mx, pace: d > 0 ? t / (d / 1000) : Infinity }));
const runKm = run.distance / 1000, runPace = run.duration / runKm;
const keys = flat(session.steps).filter((s) => s.intensity === 'active' && !NOT_KEY.has(s.name));
const paced = keys.filter((s) => s.target && s.target.type === 'pace');
const maxEffort = session.type === 'test' || session.type === 'race';
const zones = [1, 2, 3, 4, 5].map((z) => run['hrTimeInZone_' + z] || 0);
const zoneTot = zones.reduce((a, b) => a + b, 0);
const hilly = run.elevationGain > 15 * runKm;
const parts = [];
let approx = false;
const facts = { easy: zoneTot ? (zones[0] + zones[1]) / zoneTot : null, hard: zoneTot ? zones[3] + zones[4] : null };
const timeBased = session.type === 'easy';
const volRatio = timeBased ? run.duration / session.sec : runKm / session.km;
const volPts = 25 * clamp((volRatio - 0.7) / 0.25, 0, 1);
const volTxt = timeBased ? `${fmtMin(run.duration)} sur ${fmtMin(session.sec)} prévues`
: `${runKm.toFixed(1).replace('.', ',')} km sur ${String(session.km).replace('.', ',')} prévus`;
let pacePts, paceTxt, work = null;
const W = paced.reduce((s, x) => s + stepSec(x), 0);
if (maxEffort) {
pacePts = volPts; paceTxt = 'effort maximal : seule la distance compte';
} else if (paced.length && laps.length) {
const fast = Math.min(...paced.map((s) => s.target.fast)), slow = Math.max(...paced.map((s) => s.target.slow));
const minLap = Math.min(30, 0.4 * Math.min(...paced.map(stepSec)));
const fl = laps.filter((l) => l.pace <= slow + 20 && l.t >= minLap);
const t = fl.reduce((s, l) => s + l.t, 0), d = fl.reduce((s, l) => s + l.d, 0);
if (t > 0) {
const p = t / (d / 1000);
const dev = p < fast - 5 ? fast - 5 - p : p > slow + 5 ? p - slow - 5 : 0;
work = { t, pace: p, hr: fl.reduce((s, l) => s + l.hr * l.t, 0) / t, sustained: t / fl.length >= 170 };
pacePts = 25 * (0.6 * clamp(t / W, 0, 1) + 0.4 * clamp(1 - dev / 30, 0, 1));
paceTxt = `${fmtMin(t)} de travail sur ${fmtMin(W)} prévues, à ${fmtPace(p)}/km (cible ${fmtPace(fast)}-${fmtPace(slow)})`;
} else { pacePts = 0; paceTxt = `aucun bloc à l'allure cible (${fmtPace(fast)}-${fmtPace(slow)}/km)`; }
} else if (paced.length) {
const planned = session.sec / session.km;
pacePts = 25 * clamp(1 - Math.abs(runPace - planned) / 45, 0, 1);
paceTxt = `allure moyenne ${fmtPace(runPace)}/km pour ${fmtPace(planned)} prévue (détail des tours indisponible)`;
approx = true;
} else {
const t = (flat(session.steps).find((s) => s.target) || {}).target;
if (t && t.type === 'hr' && run.averageHR) {
pacePts = 25 * clamp(1 - (run.averageHR - t.hi) / 15, 0, 1);
paceTxt = `FC moyenne ${Math.round(run.averageHR)} bpm (cible ≤ ${t.hi})`;
} else if (t && (t.type === 'pace' || t.ref)) {
const r = t.type === 'pace' ? t : t.ref;
pacePts = 25 * clamp(1 - Math.max(0, r.fast - runPace) / 45, 0, 1);
paceTxt = `allure ${fmtPace(runPace)}/km (cible ${fmtPace(r.fast)}-${fmtPace(r.slow)})`;
} else { pacePts = volPts; paceTxt = 'pas de cible d\'allure'; }
}
parts.push({ key: 'exec', name: 'Exécution', pts: volPts + pacePts, max: 50, txt: `${volTxt} · ${paceTxt}` });
if (!maxEffort) {
if (session.type === 'long') {
let acc = 0;
const mov = laps.filter((l) => { acc += l.t; return acc > 600 && l.hr > 0 && l.pace < 540; });
const tot = mov.reduce((s, l) => s + l.t, 0);
if (tot >= 2400) {
const eff = (ls) => { const t = ls.reduce((s, l) => s + l.t, 0); return (ls.reduce((s, l) => s + l.d, 0) / t) / (ls.reduce((s, l) => s + l.hr * l.t, 0) / t); };
let c = 0; const h1 = [], h2 = [];
mov.forEach((l) => { (c < tot / 2 ? h1 : h2).push(l); c += l.t; });
const drift = 1 - eff(h2) / eff(h1);
facts.drift = drift;
parts.push({ key: 'heart', name: 'Réponse cardiaque', pts: 30 * clamp(1 - (drift - 0.05) / 0.10, 0, 1), max: 30,
txt: `dérive cardiaque ${drift <= 0 ? 'nulle' : pct(drift)} entre la 1re et la 2e moitié (bon : moins de 5 %)` });
} else if (zoneTot) {
const z5 = zones[4] / zoneTot;
parts.push({ key: 'heart', name: 'Réponse cardiaque', pts: 30 * (1 - clamp(z5 / 0.3, 0, 1)), max: 30, txt: `${pct(z5)} du temps en Z5 (détail des tours indisponible)` });
approx = true;
}
} else if (zoneTot && paced.length) {
const hard = zones[3] + zones[4], ratio = hard / W;
const pts = ratio < 0.6 ? ratio / 0.6 : ratio <= 1.3 ? 1 : Math.max(0, 1 - (ratio - 1.3));
parts.push({ key: 'heart', name: 'Réponse cardiaque', pts: 30 * pts, max: 30,
txt: `${fmtMin(hard)} en Z4-Z5 pour ${fmtMin(W)} de travail prévues${ratio > 1.3 ? ' : cœur trop haut trop longtemps' : ratio < 0.6 ? ' : effort trop retenu' : ''}` });
} else if (zoneTot) {
const easy = (zones[0] + zones[1]) / zoneTot;
parts.push({ key: 'heart', name: 'Réponse cardiaque', pts: 30 * clamp(easy / 0.85, 0, 1), max: 30, txt: `${pct(easy)} du temps en Z1-Z2 (cible 85 %)` });
}
}
if (!maxEffort && !hilly && ctx && ctx.paceAtHr) {
const ref = paced.length && session.type !== 'long' ? (work && work.sustained ? { p: work.pace, hr: work.hr } : null)
: run.averageHR ? { p: runPace, hr: run.averageHR } : null;
if (ref && ref.hr > 0) {
const expected = ctx.paceAtHr(ref.hr), delta = (expected - ref.p) / expected;
parts.push({ key: 'eff', name: 'Efficacité', pts: clamp(14 + delta * (delta > 0 ? 120 : 140), 0, 20), max: 20,
txt: `${fmtPace(ref.p)}/km à ${Math.round(ref.hr)} bpm, contre ${fmtPace(expected)}/km d'habitude à cette FC` });
}
}
const max = parts.reduce((s, p) => s + p.max, 0);
const total = Math.round((parts.reduce((s, p) => s + p.pts, 0) / max) * 100);
parts.forEach((p) => { p.pts = Math.round(p.pts); });
facts.W = W; facts.work = work;
return { total, label: label(total), parts, approx, facts };
}
const label = (n) => (n >= 85 ? 'Excellente' : n >= 70 ? 'Bonne' : n >= 50 ? 'Moyenne' : 'À revoir');
function weekScore(sessions) {
const rated = sessions.filter((s) => s.score || s.missed);
if (!rated.length) return null;
const wOf = (s) => (s.type === 'long' || s.type === 'test' || s.type === 'race' ? 2 : 1);
const sum = rated.reduce((a, s) => a + wOf(s) * (s.score ? s.score.total : 0), 0);
return { score: Math.round(sum / rated.reduce((a, s) => a + wOf(s), 0)), missed: rated.filter((s) => s.missed).length, n: rated.length };
}
function decide(hist) {
if (!hist.length) return { level: 0, force: false, avg: null, n: 0 };
const avg = Math.round(hist.reduce((s, w) => s + w.score, 0) / hist.length);
const last2 = hist.slice(-2);
const force = last2.length === 2 && last2.every((w) => w.score < 50);
const level = avg >= 85 && hist.every((w) => !w.missed) ? 1 : avg < 70 || hist[hist.length - 1].missed ? -1 : 0;
return { level, force, avg, n: hist.length };
}
window.SessionScore = { score, weekScore, decide, label };
})();
