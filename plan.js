(function () {
'use strict';
const DAY = 86400000;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monday = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const DOW = { MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6 };
const LONG_RUN_MAX_SEC = 3.25 * 3600;
function buildPlan(o) {
const F = o.paces;
const range = (r) => ({ type: 'pace', fast: Math.round(r.fast), slow: Math.round(r.slow) });
const mid = (r) => (r.fast + r.slow) / 2;
const around = (p, d) => ({ fast: p - d, slow: p + d });
const mpR = around(F.mp, 5);
const soutR = { fast: F.mp + 15, slow: F.mp + 25 };
const halfR = { fast: F.threshold.slow + 2, slow: F.threshold.slow + 12 };
const longR = around(o.longPace, 12);
const easyR = around(o.easyPace, 15);
const zEasy = o.hrEasy ? { type: 'hr', lo: o.hrEasy.lo, hi: o.hrEasy.hi, ref: easyR } : range(easyR);
const holds = o.holdWeeks || new Set();
const step = (name, intensity, dur, target, est, note) => ({ name, intensity, dur, target, est, note });
function T(min) { return { type: 'time', s: Math.round(min * 60) }; }
function M(m) { return { type: 'distance', m }; }
const rec = (s, note) => step('Recup', 'rest', { type: 'time', s }, null, o.easyPace + 75, note || 'trot très lent ou marche');
const wu = (min = 15) => [
step('Echauffement', 'warmup', T(min), zEasy, o.easyPace),
{ repeat: 3, steps: [step('Acceleration', 'active', { type: 'time', s: 20 }, null, mid(F.interval), 'progressive, jusqu\'à l\'allure de la séance'), rec(40, 'en marchant')] }
];
const cd = (min = 10) => step('Retour au calme', 'cooldown', T(min), zEasy, o.easyPace);
const run = (name, dur, r) => step(name, 'active', dur, range(r), mid(r));
const thr = (dur) => run('Seuil', dur, F.threshold);
const mpS = (dur) => run('Allure marathon', dur, mpR);
const rep = (n, work, restSec) => ({ repeat: n, steps: [work, rec(restSec)] });
const Q = (title, desc, main) => ({ title, desc, steps: [...wu(), ...main, cd()] });
const easy = (min) => ({ type: 'easy', title: `Footing ${min} min Z2`, steps: [step('Footing', 'active', T(min), zEasy, o.easyPace)],
desc: 'Endurance fondamentale, sans accélérations : tu dois pouvoir parler en courant.' });
const lib = {
base: [
Q('Fartlek 8 × 1 min', 'Reprise du rythme : relances courtes à allure seuil, sans s\'épuiser.', [rep(8, run('Rapide', T(1), F.threshold), 60)]),
Q('Seuil 3 × 8 min', 'Soutenu mais régulier, jamais à fond.', [rep(3, thr(T(8)), 120)]),
Q('VMA 10 × 400 m', 'Vite et relâché : toutes les répétitions au même chrono.', [rep(10, run('400 m', M(400), F.vma), 75)]),
Q('Seuil 3 × 10 min', 'Ta séance repère : même allure que le 8 octobre, sans dépasser.', [rep(3, thr(T(10)), 150)]),
Q('VMA 5 × 3 min', 'Allure 5 km, récupération égale à deux tiers de l\'effort.', [rep(5, run('3 min', T(3), F.interval), 120)]),
Q('Seuil 2 × 12 min', 'Blocs plus longs : pars sur le bas de la fourchette.', [rep(2, thr(T(12)), 180)])
],
build: [
Q('Seuil 4 × 8 min', 'Plus de volume au seuil qu\'en phase de base.', [rep(4, thr(T(8)), 120)]),
Q('Fractionné 6 × 1000 m', 'Allure 5 km : dur, mais toutes les répétitions à la même vitesse.', [rep(6, run('1000 m', M(1000), F.interval), 120)]),
Q('Seuil 2 × 15 min', 'Seuil long pour tenir la vitesse dans la durée.', [rep(2, thr(T(15)), 180)]),
Q('Fractionné 5 × 1200 m', 'Un cran plus long que les 1000 m, même allure.', [rep(5, run('1200 m', M(1200), F.interval), 150)]),
Q('Seuil 3 × 12 min', 'La plus grosse séance au seuil du plan.', [rep(3, thr(T(12)), 150)]),
Q('Allure semi 4 × 2 km', 'Entre seuil et marathon : l\'allure de ton test semi.', [rep(4, run('2 km', M(2000), halfR), 120)]),
Q('Seuil 2 × 20 min', 'Deux longs blocs, régulier du début à la fin.', [rep(2, thr(T(20)), 180)])
],
peak: [
Q('Allure marathon 3 × 3 km', 'Mémorise ton allure course.', [rep(3, mpS(M(3000)), 180)]),
Q('Seuil 2 × 15 min', 'Rappel de vitesse entre deux grosses sorties longues.', [rep(2, thr(T(15)), 180)]),
Q('Allure marathon 2 × 5 km', 'Deux longs blocs à l\'allure du jour J.', [rep(2, mpS(M(5000)), 180)]),
Q('Allure semi 3 × 2 km', 'Un peu plus vite que l\'allure course, pour qu\'elle paraisse facile.', [rep(3, run('2 km', M(2000), halfR), 120)])
]
};
const tune = (q, lv) => {
if (!lv) return q;
const c = JSON.parse(JSON.stringify(q));
const main = c.steps.find((s) => s.repeat && !s.steps.some((x) => x.name === 'Acceleration'));
if (!main) return q;
if (main.repeat >= 4) {
const n = main.repeat + lv;
c.title = c.title.replace(/\d+ ×/, `${n} ×`);
main.repeat = n;
} else {
const work = main.steps[0], d = work.dur;
if (d.type === 'time') {
const min = d.s / 60;
let m2 = Math.round(min * (1 + 0.15 * lv)); if (m2 === min) m2 = min + lv;
d.s = m2 * 60;
c.title = c.title.replace(/× [\d,]+ min/, `× ${m2} min`);
} else {
d.m = Math.round((d.m * (1 + 0.15 * lv)) / 100) * 100;
c.title = c.title.replace(/× [\d,]+ km/, `× ${String(d.m / 1000).replace('.', ',')} km`);
}
}
c.adjusted = lv;
c.desc += lv > 0 ? ' Séance durcie d\'un cran : tes dernières notes sont excellentes.' : ' Séance allégée d\'un cran, le temps que tes notes remontent.';
return c;
};
const light = () => Q('Fartlek 6 × 2 min', 'Semaine allégée : du rythme, peu de volume.', [rep(6, run('Rapide', T(2), F.threshold), 60)]);
const taperQ = (weeksToRace) => (weeksToRace === 0
? { title: 'Activation pré-course', desc: 'Juste pour réveiller les jambes avant la course.', steps: [step('Echauffement', 'warmup', T(20), zEasy, o.easyPace), rep(4, mpS(T(1)), 60), cd(5)] }
: weeksToRace === 1 ? Q('Rappel allure marathon 2 × 3 km', 'Volume réduit, on garde les sensations de l\'allure course.', [rep(2, mpS(M(3000)), 180)])
: Q('Seuil court 3 × 8 min', 'Un peu d\'intensité pendant l\'affûtage.', [rep(3, thr(T(8)), 120)]));
const test10k = () => ({ type: 'test', title: 'Test 10 km', steps: [...wu(15), step('Test 10 km', 'active', M(10000), null, F.p10, 'à fond, effort régulier'), cd(10)],
desc: 'À fond mais régulier, sur terrain plat. Ce chrono recale toutes tes allures d\'entraînement.' });
const testHalf = () => ({ type: 'test', title: 'Test semi-marathon', steps: [step('Echauffement', 'warmup', T(10), zEasy, o.easyPace), step('Semi-marathon', 'active', M(21100), null, F.half, 'à fond, effort régulier'), cd(5)],
desc: 'En course officielle si possible. C\'est le meilleur indicateur de ton temps sur marathon.' });
const longRun = (km, phase, n, recovery, weeksToRace) => {
const odd = n % 2 === 1;
let reps, blockKm, kind;
if (weeksToRace === 1) { reps = 2; blockKm = 2; kind = 'mp'; }
else if (weeksToRace === 2) { reps = 2; blockKm = 4; kind = 'mp'; }
else if (recovery || km < 14) { reps = 1; blockKm = 3; kind = 'sout'; }
// Base et développement : une sortie longue sur deux 100 % facile, l'autre avec des blocs soutenus.
// Les blocs à allure marathon sont réservés au pic.
else if (phase === 'base' || phase === 'build') { if (odd) kind = 'easy'; else { kind = 'sout'; if (phase === 'base') { reps = 1; blockKm = km >= 18 ? 5 : 4; } else { reps = 3; blockKm = 4; } } }
else { kind = 'mp'; if (odd) { reps = 3; blockKm = 5; } else { reps = 2; blockKm = 6; } }
if (kind === 'easy') return { type: 'long', title: `Sortie longue ${km} km · 100 % facile`,
steps: [step('Echauffement', 'warmup', M(2000), zEasy, o.easyPace), run('Endurance active', M((km - 3) * 1000), longR), step('Retour au calme', 'cooldown', M(1000), zEasy, o.easyPace)],
desc: 'Tout en endurance, sans bloc rapide : c\'est le volume qui construit ton marathon. Si la FC monte, ralentis.' };
const fits = (r) => (r > 1 ? 2 + 2 + r * (blockKm + 1) + 1 : 2 + 2 + blockKm + 1) <= km;
while (reps > 1 && !fits(reps)) reps--;
const block = kind === 'mp' ? mpS(M(blockKm * 1000)) : run('Allure soutenue', M(blockKm * 1000), soutR);
const steadyKm = reps > 1 ? km - 3 - reps * (blockKm + 1) : km - 3 - blockKm;
const steps = [
step('Echauffement', 'warmup', M(2000), zEasy, o.easyPace),
run('Endurance active', M(steadyKm * 1000), longR),
reps > 1 ? { repeat: reps, steps: [block, step('Recup footing', 'rest', M(1000), range(longR), o.longPace)] } : block,
step('Retour au calme', 'cooldown', M(1000), zEasy, o.easyPace)
];
const label = kind === 'mp' ? 'allure marathon' : 'allure soutenue';
return { type: 'long', steps,
title: reps > 1 ? `Sortie longue ${km} km · ${reps} × ${blockKm} km ${label}` : `Sortie longue ${km} km · ${blockKm} km ${kind === 'mp' ? 'allure marathon' : 'soutenus'} pour finir`,
desc: kind === 'mp' ? 'Blocs à l\'allure de course avec 1 km de footing entre chaque. Teste ton ravitaillement comme le jour J.'
: recovery ? 'Semaine allégée : sortie plus courte, avec un final un cran plus vite.'
: 'Blocs un cran au-dessus de l\'endurance, sans forcer : tu dois finir avec de la marge.' };
};
const firstMon = monday(o.planStart);
const nWeeks = Math.round((monday(o.raceDate) - firstMon) / DAY / 7) + 1;
const longDow = DOW[o.longRunDay] ?? 6;
const qDow = (longDow + 2) % 7, eDow = (longDow + 4) % 7;
const maxLongKm = Math.max(18, Math.min(o.peakLongRunKm, Math.floor(LONG_RUN_MAX_SEC / o.longPace)));
let lastLong = Math.max(8, o.startLongKm || 12) - 2;
let prog = 0;
let tests = 0;
let prevWasCap = false;
const used = { base: 0, build: 0, peak: 0 };
const weeks = [];
for (let w = 0; w < nWeeks; w++) {
const mon = addDays(firstMon, w * 7);
const weeksToRace = nWeeks - 1 - w;
const phase = o.phaseOf(addDays(mon, 3)).key;
const hold = holds.has(w);
const adj = (weeksToRace >= 3 && o.adjust && o.adjust(w)) || { level: 0, force: false };
const lv = adj.level || 0;
const scheduledRecovery = weeksToRace >= 3 && !hold && prog % 4 === 3;
const forced = weeksToRace >= 3 && !hold && !scheduledRecovery && !!adj.force;
const recovery = scheduledRecovery || forced;
const lvEff = recovery || weeksToRace < 3 ? 0 : lv;
let longKm;
if (weeksToRace >= 3) {
const cap = Math.min(maxLongKm, phase === 'base' ? 22 : phase === 'build' ? 28 : o.peakLongRunKm);
const inc = 2 + lvEff;
if (recovery) { longKm = Math.round(lastLong * 0.75); prevWasCap = false; }
else if (hold) longKm = Math.min(cap, lastLong);
else if (lastLong + inc > cap) {
longKm = prevWasCap ? cap - 5 : cap;
prevWasCap = !prevWasCap;
} else { longKm = lastLong + inc; lastLong = longKm; prevWasCap = longKm === cap; }
if (forced) prog += 3 - (prog % 4);
if (!hold) prog++;
} else longKm = [0, 14, Math.min(20, maxLongKm)][weeksToRace];
let test = null;
if (scheduledRecovery && phase !== 'base' && weeksToRace >= 5 && tests < 2) { test = tests === 0 ? '10k' : 'half'; tests++; }
let q;
if (weeksToRace <= 2) q = taperQ(weeksToRace);
else if (test === '10k') q = test10k();
else if (recovery || test === 'half') q = light();
else { const list = lib[phase] || lib.peak; const i = hold ? Math.max(0, used[phase] - 1) : used[phase]++; q = tune(list[i % list.length], lvEff); }
const sessions = [];
const push = (dow, s) => sessions.push({ ...s, date: addDays(mon, dow) });
push(qDow, { type: 'quality', ...q });
if (weeksToRace > 0) {
push(eDow, easy(45));
push(longDow, test === 'half' ? testHalf() : longRun(longKm, phase, prog, recovery, weeksToRace));
} else {
sessions.push({ ...easy(30), date: addDays(o.raceDate, -2) });
sessions.push({ type: 'race', title: 'JOUR J · Marathon', date: o.raceDate, fixedKm: o.raceKm, fixedSec: o.goalPace * o.raceKm,
steps: [run('Départ prudent', M(5000), around(o.goalPace + 5, 3)), run('Allure marathon', M(Math.round((o.raceKm - 5) * 1000)), around(o.goalPace, 3))],
desc: `Objectif ${fmtDur(o.goalPace * o.raceKm)}. Allure à confirmer avec ton test semi-marathon.` });
sessions.forEach((s) => { if (s.type === 'quality' && s.date >= o.raceDate) s.date = addDays(o.raceDate, -4); });
}
sessions.forEach((s) => { const e = estimate(s.steps); s.km = s.fixedKm || Math.round(e.km * 10) / 10; s.sec = s.fixedSec || e.sec; });
sessions.sort((a, b) => a.date - b.date);
weeks.push({ index: w, monday: mon, weeksToRace, phase, recovery, hold, longKm, test, level: lvEff, forced,
targetKm: Math.round(sessions.reduce((a, x) => a + x.km, 0)), sessions });
}
return { weeks, maxLongKm, ranges: { easy: easyR, long: longR, sout: soutR, mp: mpR, half: halfR } };
}
function estimate(steps) {
let km = 0, sec = 0;
steps.forEach((s) => {
if (s.repeat) { const e = estimate(s.steps); km += e.km * s.repeat; sec += e.sec * s.repeat; return; }
if (s.dur.type === 'distance') { km += s.dur.m / 1000; sec += (s.dur.m / 1000) * s.est; }
else if (s.dur.type === 'time') { km += s.dur.s / s.est; sec += s.dur.s; }
});
return { km, sec };
}
const pad = (n) => String(n).padStart(2, '0');
function fmtDur(s) { s = Math.round(s); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; }
window.MarathonPlan = { buildPlan, estimate };
})();
