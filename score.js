(function () {
'use strict';
// Note d'une séance sur 100, à partir des tours (laps) reconstruits par la synchro Garmin.
// Cinq critères, chacun expliqué en une ligne :
//   Volume (15)      distance ou durée faites / prévues
//   Allure (25)      tour par tour : part du temps de travail dans la fourchette cible
//   Cardio (25)      FC de chaque tour comparée à la zone attendue pour ce type d'effort
//   Régularité (15)  écart entre répétitions et fléchissement en fin de séance, ou dérive cardiaque
//   Efficacité (20)  allure obtenue à cette FC, comparée à ton habitude
// Les critères sans données (pas de tours, pas de FC) sont retirés et la note est ramenée sur 100.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pad = (n) => String(n).padStart(2, '0');
const fmtPace = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const fmtMin = (s) => `${Math.round(s / 60)} min`;
const pct = (x) => `${Math.round(x * 100)} %`;
const flat = (steps) => steps.flatMap((s) => (s.repeat ? Array.from({ length: s.repeat }, () => s.steps).flat() : [s]));
const stepSec = (s) => (s.dur.type === 'time' ? s.dur.s : (s.dur.m / 1000) * s.est);
const tw = (ls, f) => { const t = ls.reduce((s, l) => s + l.t, 0); return t ? ls.reduce((s, l) => s + f(l) * l.t, 0) / t : NaN; };
const sumT = (ls) => ls.reduce((s, l) => s + l.t, 0);
const paceOf = (ls) => sumT(ls) / (ls.reduce((s, l) => s + l.d, 0) / 1000);
const NOT_KEY = new Set(['Footing', 'Endurance active', 'Acceleration']);
const INTERVAL = /^(\d+ m|\d+ min)$/;

// Zone de FC attendue pour un type d'effort (zones course Garmin : z3 = début Z3, z4 = début Z4).
function hrBand(name, Z) {
if (!Z) return null;
const z3 = Z.zone3Floor, z4 = Z.zone4Floor;
if (!z3 || !z4) return null;
if (name === 'Footing' || name === 'Echauffement' || name === 'Retour au calme') return { hi: z3 - 1, txt: `≤ ${z3 - 1} bpm, Z1-Z2` };
if (name === 'Endurance active' || name === 'Recup footing' || name === 'Allure soutenue' || name === 'Allure marathon' || name === 'Départ prudent')
return { hi: z4 - 1, txt: `sous ${z4} bpm, sous le seuil` };
if (name === '2 km') return { hi: z4 + 4, txt: `≤ ${z4 + 4} bpm` };
if (name === 'Seuil' || name === 'Rapide') return { lo: z4 - 6, hi: z4 + 8, txt: `${z4 - 6}-${z4 + 8} bpm, seuil` };
if (INTERVAL.test(name)) return { lo: z4 - 2, txt: `≥ ${z4 - 2} bpm` };
return null;
}
const bandFit = (hr, b) => (b.hi && hr > b.hi ? clamp(1 - (hr - b.hi) / 8, 0, 1) : b.lo && hr < b.lo ? clamp(1 - (b.lo - hr) / 10, 0, 1) : 1);
const stepLabel = { Seuil: 'blocs au seuil', Rapide: 'relances', 'Allure soutenue': 'blocs soutenus', 'Allure marathon': 'blocs allure marathon',
'Endurance active': 'partie endurance', Footing: 'footing', '2 km': 'blocs allure semi' };

function score(session, run, rawLaps, ctx) {
ctx = ctx || {};
const Z = ctx.zones;
const laps = (rawLaps || []).map(([t, d, hr, mx, asc]) => ({ t, d, hr, mx, asc: asc || 0, pace: d > 0 ? t / (d / 1000) : Infinity }))
.filter((l) => l.t > 0 && l.d > 0);
const runKm = run.distance / 1000, runPace = run.duration / runKm;
const all = flat(session.steps);
const keys = all.filter((s) => s.intensity === 'active' && !NOT_KEY.has(s.name));
const paced = keys.filter((s) => s.target && s.target.type === 'pace');
const maxEffort = session.type === 'test' || session.type === 'race';
const zones = [1, 2, 3, 4, 5].map((z) => run['hrTimeInZone_' + z] || 0);
const zoneTot = zones.reduce((a, b) => a + b, 0);
const hilly = run.elevationGain > 15 * runKm;
const parts = [];
let approx = !laps.length;
const facts = { easy: zoneTot ? (zones[0] + zones[1]) / zoneTot : null, hard: zoneTot ? zones[3] + zones[4] : null };
const W = paced.reduce((s, x) => s + stepSec(x), 0);
facts.W = W;

// 1. Volume
const timeBased = session.type === 'easy';
const volRatio = timeBased ? run.duration / session.sec : runKm / session.km;
let volPts = 15 * clamp((volRatio - 0.7) / 0.25, 0, 1);
if (volRatio > 1.2) volPts *= clamp(1 - (volRatio - 1.2) / 0.4, 0.5, 1);
parts.push({ key: 'vol', name: 'Volume', pts: volPts, max: 15,
txt: (timeBased ? `${fmtMin(run.duration)} sur ${fmtMin(session.sec)} prévues` : `${runKm.toFixed(1).replace('.', ',')} km sur ${String(session.km).replace('.', ',')} prévus`)
+ (volRatio > 1.2 ? ' : nettement plus que prévu' : volRatio < 0.85 ? ' : séance écourtée' : '') });

// Tours de travail : ceux qui tournent à l'allure des blocs (ou plus vite).
let work = [], workSteps = paced;
if (paced.length && laps.length) {
const fast = Math.min(...paced.map((s) => s.target.fast)), slow = Math.max(...paced.map((s) => s.target.slow));
const minLap = Math.min(30, 0.4 * Math.min(...paced.map(stepSec)));
work = laps.filter((l) => l.pace <= slow + 20 && l.t >= minLap);
// En sortie longue, les blocs sont à la fin : on ne garde pas un départ trop rapide comme « bloc ».
if (session.type === 'long' && work.length) {
const need = W * 1.6; let acc = 0; const keep = new Set();
for (let i = laps.length - 1; i >= 0 && acc < need; i--) { acc += laps[i].t; keep.add(laps[i]); }
work = work.filter((l) => keep.has(l));
}
}
const isWork = new Set(work);
if (work.length) {
const t = sumT(work);
facts.work = { t, pace: paceOf(work), hr: tw(work, (l) => l.hr), sustained: t / work.length >= 170 };
}

// 2. Allure
if (maxEffort) {
if (laps.length >= 4) {
let c = 0; const tot = sumT(laps), h1 = [], h2 = [];
laps.forEach((l) => { (c < tot / 2 ? h1 : h2).push(l); c += l.t; });
const split = paceOf(h2) - paceOf(h1);
parts.push({ key: 'pace', name: 'Allure', pts: 25 * clamp(1 - Math.max(0, split - 3) / 15, 0, 1), max: 25,
txt: `2e moitié ${split <= 0 ? `${Math.round(-split)} s/km plus rapide` : `${Math.round(split)} s/km plus lente`} que la 1re (bon : écart de moins de 3 s)` });
}
} else if (paced.length && laps.length) {
const fast = Math.min(...paced.map((s) => s.target.fast)), slow = Math.max(...paced.map((s) => s.target.slow));
if (work.length) {
const t = sumT(work), p = paceOf(work);
const lapFit = (l) => clamp(1 - Math.max(fast - 3 - l.pace, l.pace - slow - 3, 0) / 15, 0, 1);
const inRange = tw(work, (l) => (l.pace >= fast - 3 && l.pace <= slow + 3 ? 1 : 0));
let pts = 0.35 * clamp(t / W, 0, 1) + 0.65 * tw(work, lapFit);
let extra = '';
if (session.type === 'long') {
// Partie endurance : tours hors échauffement et hors blocs.
const r = ctx.ranges && ctx.ranges.long;
let acc = 0;
const endu = laps.filter((l) => { acc += l.t; return acc > 600 && !isWork.has(l) && l.pace < 600; });
if (r && sumT(endu) > 600) {
const ep = paceOf(endu);
const ef = tw(endu, (l) => clamp(1 - Math.max(r.fast - 5 - l.pace, 0) / 20, 0, 1));
pts = 0.6 * pts + 0.4 * ef;
extra = ` · endurance à ${fmtPace(ep)}/km (cible ${fmtPace(r.fast)}-${fmtPace(r.slow)})`;
}
}
const off = p < fast - 3 ? ` : ${Math.round(fast - p)} s trop rapide` : p > slow + 3 ? ` : ${Math.round(p - slow)} s trop lent` : '';
parts.push({ key: 'pace', name: 'Allure', pts: 25 * pts, max: 25,
txt: `${fmtMin(t)} de travail sur ${fmtMin(W)} prévues, à ${fmtPace(p)}/km pour ${fmtPace(fast)}-${fmtPace(slow)}${off} · ${pct(inRange)} du temps dans la cible${extra}` });
} else parts.push({ key: 'pace', name: 'Allure', pts: 0, max: 25, txt: `aucun bloc à l'allure cible (${fmtPace(fast)}-${fmtPace(slow)}/km)` });
} else if (paced.length) {
const planned = session.sec / session.km;
parts.push({ key: 'pace', name: 'Allure', pts: 25 * clamp(1 - Math.abs(runPace - planned) / 45, 0, 1), max: 25,
txt: `allure moyenne ${fmtPace(runPace)}/km pour ${fmtPace(planned)} prévue (détail des tours indisponible)` });
}

// 3. Cardio : FC de chaque tour (≥ 90 s, le cœur met du temps à monter) contre la zone de son effort.
if (!maxEffort) {
const groups = new Map();
const add = (name, l) => { const b = hrBand(name, Z); if (!b || !l.hr || l.t < 90) return; if (!groups.has(name)) groups.set(name, { b, ls: [] }); groups.get(name).ls.push(l); groups.get(name).w = name === 'Endurance active' || name === 'Footing' ? 1 : 2; };
if (laps.length) {
const workName = (workSteps[0] || {}).name;
let acc = 0;
laps.forEach((l) => {
const start = acc; acc += l.t;
if (isWork.has(l)) add(workName, l);
else if (session.type === 'easy') add('Footing', l);
else if (session.type === 'long' && start >= 600 && l.pace < 600) add('Endurance active', l);
});
}
const gs = [...groups].map(([name, g]) => ({ name, b: g.b, w: g.w, t: sumT(g.ls), hr: tw(g.ls, (l) => l.hr), fit: tw(g.ls, (l) => bandFit(l.hr, g.b)) }));
if (gs.length) {
// Les blocs de travail comptent double : ce sont eux qui font la séance.
const T = gs.reduce((s, g) => s + g.t * g.w, 0);
const fit = gs.reduce((s, g) => s + g.fit * g.t * g.w, 0) / T;
const worst = gs.slice().sort((a, b) => a.fit - b.fit)[0];
const txt = gs.map((g) => `${stepLabel[g.name] || g.name.toLowerCase()} à ${Math.round(g.hr)} bpm (cible ${g.b.txt})`).join(' · ')
+ (worst.fit < 0.8 ? (worst.b.hi && worst.hr > worst.b.hi ? ' : trop haut, l\'effort était plus dur que prévu' : ' : trop bas, effort trop retenu') : '');
parts.push({ key: 'heart', name: 'Cardio', pts: 25 * fit, max: 25, txt });
} else if (zoneTot) {
if (!laps.length) approx = true;
if (paced.length && session.type !== 'long') {
const hard = zones[3] + zones[4], ratio = hard / W;
const p = ratio < 0.6 ? ratio / 0.6 : ratio <= 1.3 ? 1 : Math.max(0, 1 - (ratio - 1.3));
parts.push({ key: 'heart', name: 'Cardio', pts: 25 * p, max: 25, txt: `${fmtMin(hard)} en Z4-Z5 pour ${fmtMin(W)} de travail prévues${ratio > 1.3 ? ' : cœur trop haut trop longtemps' : ratio < 0.6 ? ' : effort trop retenu' : ''}` });
} else {
const easy = (zones[0] + zones[1]) / zoneTot;
const target = session.type === 'easy' ? 0.85 : 0.5;
parts.push({ key: 'heart', name: 'Cardio', pts: 25 * clamp(easy / target, 0, 1), max: 25, txt: `${pct(easy)} du temps en Z1-Z2 (cible ${pct(target)})` });
}
}
}

// 4. Régularité
if (!maxEffort) {
const reps = work.filter((l) => l.t >= 50);
if (paced.length && session.type !== 'long' && reps.length >= 3) {
const m = tw(reps, (l) => l.pace);
const sd = Math.sqrt(tw(reps, (l) => (l.pace - m) ** 2));
const n = Math.max(1, Math.floor(reps.length / 3));
const fade = paceOf(reps.slice(-n)) - paceOf(reps.slice(0, n));
const pts = clamp(1 - Math.max(0, sd - 4) / 14, 0, 1) * clamp(1 - Math.max(0, fade - 4) / 12, 0, 1);
parts.push({ key: 'reg', name: 'Régularité', pts: 15 * pts, max: 15,
txt: `écart de ± ${Math.round(sd)} s/km entre les répétitions${fade > 4 ? `, les dernières ${Math.round(fade)} s plus lentes que les premières` : fade < -6 ? ', finies plus vite : bien géré' : ', allure tenue jusqu\'au bout'}` });
} else if (session.type === 'long' || session.type === 'easy') {
let acc = 0;
const mov = laps.filter((l) => { acc += l.t; return acc > 600 && l.hr > 0 && l.pace < 600 && !isWork.has(l); });
const tot = sumT(mov);
if (tot >= 1500) {
const eff = (ls) => (ls.reduce((s, l) => s + l.d, 0) / sumT(ls)) / tw(ls, (l) => l.hr);
let c = 0; const h1 = [], h2 = [];
mov.forEach((l) => { (c < tot / 2 ? h1 : h2).push(l); c += l.t; });
const drift = 1 - eff(h2) / eff(h1);
facts.drift = drift;
parts.push({ key: 'reg', name: 'Régularité', pts: 15 * clamp(1 - (drift - 0.04) / 0.08, 0, 1), max: 15,
txt: `dérive cardiaque ${drift <= 0 ? 'nulle' : pct(drift)} entre la 1re et la 2e moitié${session.type === 'long' ? ' (hors blocs)' : ''} (bon : moins de 4 %)` });
}
}
}

// 5. Efficacité : allure obtenue à cette FC, comparée à ton habitude.
if (!maxEffort && !hilly && ctx.paceAtHr) {
const ref = paced.length && session.type !== 'long' ? (facts.work && facts.work.sustained ? { p: facts.work.pace, hr: facts.work.hr } : null)
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
