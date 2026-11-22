(function () {
'use strict';
const app = document.getElementById('app');
const D = window.GARMIN_DATA;
const R = window.RACE;
if (!D || window.GARMIN_DATA_MISSING) {
app.innerHTML = '<div class="wrap"><div class="empty"><h2>Données indisponibles</h2><p>Le fichier de données n\'a pas pu être chargé. Vérifie ta connexion, puis réessaie.</p><button type="button" class="btn primary" onclick="location.reload()">Réessayer</button></div></div>';
return;
}
const { DAY, V, readColors, parseLocal, dayKey, startOfDay, addDays, monday, fmtDM, fmtDate, pad, fmtPace, fmtDur, fmtHM, parseTime, km, fmt1, fmt0, avg, clamp0, esc, noAccent } = window.U;
// ===== 1. Données Garmin : activités, sommeil, FC repos, zones =====
const seen = new Set();
const activities = (D.activityPages || []).flat().filter((a) => a && a.activityId && !seen.has(a.activityId) && seen.add(a.activityId))
.map((a) => ({ ...a, _date: parseLocal(a.startTimeLocal) }))
.sort((a, b) => a._date - b._date);
const isRun = (a) => /run/i.test(a.activityType?.typeKey || '');
const runs = activities.filter(isRun).filter((a) => a.distance > 500);
const flatChunks = (chunks, pick) => (chunks || []).flatMap((c) => (c == null ? [] : pick(c) || []));
const daily = flatChunks(D.dailyChunks, (c) => c.data);
const sleep = flatChunks(D.sleepChunks, (c) => (Array.isArray(c) ? c : []));
const hrv = flatChunks(D.hrvChunks, (c) => c.hrvSummaries);
const byDate = (arr, key = 'calendarDate') => { const m = new Map(); arr.forEach((x) => x && x[key] && m.set(x[key], x)); return m; };
const dailyMap = byDate(daily), sleepMap = byDate(sleep), hrvMap = byDate(hrv);
const today = startOfDay(new Date());
const raceDate = startOfDay(new Date(R.date + 'T00:00:00'));
const targetSec = parseTime(R.targetTime);
const targetPace = targetSec / R.distanceKm;
const daysLeft = Math.max(0, Math.round((raceDate - today) / DAY));
const goalTxt = R.targetTime.replace(/^(\d+):(\d+):00$/, '$1h$2');
const planStartMon = monday(new Date((R.planStart || dayKey(today)) + 'T00:00:00'));
const taperStart = addDays(raceDate, -21);
const peakStart = addDays(raceDate, -49);
const buildStart = addDays(raceDate, -105);
const phases = [
{ key: 'base', name: 'Base', from: planStartMon, to: buildStart, color: V('ph-1'), advice: '<b>Base aérobie.</b> On installe la régularité : 3 sorties par semaine, la sortie longue qui s\'allonge de 2 km, une séance de relances ou de seuil.' },
{ key: 'build', name: 'Développement', from: buildStart, to: peakStart, color: V('ph-2'), advice: '<b>Développement.</b> Travail au seuil et fractionné, une sortie longue sur deux 100 % facile, l\'autre avec des blocs soutenus ; elle monte vers 28 km.' },
{ key: 'peak', name: 'Pic', from: peakStart, to: taperStart, color: V('ph-3'), advice: '<b>Pic spécifique.</b> Les semaines les plus chargées : les plus longues sorties du plan, avec de longs blocs à allure marathon.' },
{ key: 'taper', name: 'Affûtage', from: taperStart, to: raceDate, color: V('accent'), advice: '<b>Affûtage.</b> Le volume baisse, un peu d\'intensité reste. Le travail est fait : l\'objectif est d\'arriver frais.' }
].filter((p) => p.to > p.from);
const phaseAt = (d) => phases.find((p) => d >= p.from && d < p.to) || phases[phases.length - 1];
const current = phaseAt(today);
const phaseName = (k) => (phases.find((p) => p.key === k) || {}).name || k;
const thisMon = monday(today);
const NW = clamp0(Math.round((thisMon - planStartMon) / DAY / 7) + 1, 1, 20);
const prepRuns = runs.filter((r) => r._date >= planStartMon);
const weeks = [];
for (let i = NW - 1; i >= 0; i--) weeks.push(addDays(thisMon, -7 * i));
const weekIdx = (d) => { const diff = Math.round((monday(d) - weeks[0]) / DAY / 7); return diff >= 0 && diff < NW ? diff : -1; };
const wKm = Array(NW).fill(0), wLong = Array(NW).fill(0), wLoad = Array(NW).fill(0), wRuns = Array(NW).fill(0);
runs.forEach((r) => { const i = weekIdx(r._date); if (i < 0) return; wKm[i] += km(r.distance); wRuns[i]++; wLong[i] = Math.max(wLong[i], km(r.distance)); });
activities.forEach((a) => { const i = weekIdx(a._date); if (i >= 0) wLoad[i] += a.activityTrainingLoad || 0; });
const weekLabels = weeks.map(fmtDM);
const inLast = (arr, days) => arr.filter((a) => a._date >= addDays(today, -days + 1));
const km28avg = inLast(prepRuns, 28).reduce((s, r) => s + km(r.distance), 0) / Math.min(4, NW);
const long28 = inLast(prepRuns, 28).reduce((m, r) => Math.max(m, km(r.distance)), 0);
// ===== 2. Forme actuelle : prédictions, seuil, allures d'entraînement =====
const riegel = (r) => r.duration * Math.pow((R.distanceKm * 1000) / r.distance, 1.06);
let predPool = inLast(runs, 84).filter((r) => r.distance >= 10000);
let predBasis = '≥ 10 km';
if (!predPool.length) { predPool = inLast(runs, 84).filter((r) => r.distance >= 5000); predBasis = '≥ 5 km'; }
const best = predPool.reduce((b, r) => (!b || riegel(r) < riegel(b) ? r : b), null);
const predSec = best ? riegel(best) : NaN;
const gpMap = new Map();
(Array.isArray(R.garminPredictions) ? R.garminPredictions : []).forEach((p) => { if (Array.isArray(p) && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && parseTime(p[1]) > 0) gpMap.set(p[0], parseTime(p[1])); });
if (R.garminPredictedTime && parseTime(R.garminPredictedTime) > 0) gpMap.set(/^\d{4}-\d{2}-\d{2}$/.test(R.garminPredictedDate || '') ? R.garminPredictedDate : '', parseTime(R.garminPredictedTime));
let gpUser = []; try { gpUser = JSON.parse(localStorage.getItem('gpUser') || '[]'); } catch (e) { /* nothing saved */ }
(Array.isArray(gpUser) ? gpUser : []).forEach((p) => { if (Array.isArray(p) && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && parseTime(p[1]) > 0) gpMap.set(p[0], parseTime(p[1])); });
const gpHist = [...gpMap].filter(([d]) => d).map(([d, t]) => ({ d: new Date(d + 'T00:00:00'), t })).sort((a, b) => a.d - b.d);
const gpLast = gpHist[gpHist.length - 1];
const garminPred = gpLast ? gpLast.t : gpMap.get('') || 0;
const garminPredDate = gpLast ? gpLast.d : null;
const LAPS = window.GARMIN_LAPS || {};
const lapsOf = (r) => (LAPS[r.activityId] || []).map(([t, d, hr, mx, asc]) => ({ t, d, hr, mx, asc, pace: t / (d / 1000) }))
.filter((l) => l.t >= 170 && l.d > 300 && l.hr >= 140 && !(l.asc > 15 * (l.d / 1000)));
const summarize = (laps) => { const t = laps.reduce((s, l) => s + l.t, 0), d = laps.reduce((s, l) => s + l.d, 0);
return { n: laps.length, t, d, pace: t / (d / 1000), hr: laps.reduce((s, l) => s + l.hr * l.t, 0) / t, mx: Math.max(...laps.map((l) => l.mx || 0)), fastest: Math.min(...laps.map((l) => l.pace)) }; };
const sustained = (r) => {
const raw = (LAPS[r.activityId] || []).map(([t, d, hr, mx, asc]) => ({ t, d, hr, mx, asc, pace: t / (d / 1000) })).filter((l) => l.t >= 20 && l.d > 50);
const valid = raw.filter((l) => l.t >= 170 && l.hr >= 140);
if (!valid.length) return [];
const cutoff = Math.min(...valid.map((l) => l.pace)) * 1.12;
const out = []; let group = [];
const flush = () => { if (group.reduce((s, l) => s + l.t, 0) >= 360) out.push(...group); group = []; };
raw.forEach((l) => { if (l.pace <= cutoff) group.push(l); else flush(); });
flush();
return out.filter((l) => l.t >= 60 && l.hr >= 140 && !(l.asc > 15 * (l.d / 1000)));
};
const best20 = (r) => { const sorted = sustained(r).sort((a, b) => a.pace - b.pace); const pick = []; let t = 0;
for (const l of sorted) { if (t >= 1200) break; pick.push(l); t += l.t; }
return t >= 1200 ? { run: r, ...summarize(pick) } : null; };
const efforts = runs.map(best20).filter(Boolean);
const thrRef = efforts.filter((e) => e.run._date >= addDays(today, -83)).reduce((b, e) => (!b || e.pace < b.pace ? e : b), null);
const thr = thrRef ? { fast: thrRef.pace + 2, slow: thrRef.pace + 12, mid: thrRef.pace + 7 } : null;
const thrPotential = thr ? thr.mid * 1.10 * R.distanceKm : NaN;
const fitRaw = thr ? thrPotential : isFinite(predSec) && garminPred ? (predSec + garminPred) / 2 : isFinite(predSec) ? predSec : garminPred || targetSec * 1.06;
const fitnessSec = Math.max(targetSec, fitRaw);
const equiv = (marathonSec, distKm) => marathonSec * Math.pow(distKm / R.distanceKm, 1.06);
const fitMP = fitnessSec / R.distanceKm;
const p10 = equiv(fitnessSec, 10) / 10, p5 = equiv(fitnessSec, 5) / 5, pHalf = equiv(fitnessSec, 21.0975) / 21.0975;
const goal10 = equiv(targetSec, 10);
const flat = inLast(runs, 84).filter((r) => r.averageHR && r.duration >= 1200 && !(r.elevationGain > 15 * km(r.distance)));
const paceAtHr = (() => {
if (flat.length < 5) return null;
const xs = flat.map((r) => r.averageHR), ys = flat.map((r) => r.duration / km(r.distance));
const mx = avg(xs), my = avg(ys);
const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
if (!sxx) return null;
const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
return b < 0 ? (h) => my + b * (h - mx) : null;
})();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const loadOn = new Map();
activities.forEach((a) => { const k = dayKey(a._date); loadOn.set(k, (loadOn.get(k) || 0) + (a.activityTrainingLoad || 0)); });
const sumLoad = (from, n) => { let s = 0; for (let i = 0; i < n; i++) s += loadOn.get(dayKey(addDays(from, -i))) || 0; return s; };
const acute = sumLoad(today, 7) / 7, chronic = sumLoad(today, 28) / 28;
const acr = chronic > 0 ? acute / chronic : NaN;
const acrStatus = !isFinite(acr) ? { c: V('muted'), i: '?', t: 'Pas assez de données' }
: acr < 0.8 ? { c: V('warning'), i: '↓', t: 'Sous-charge' }
: acr <= 1.3 ? { c: V('good'), i: '✓', t: 'Progression régulière' }
: acr <= 1.5 ? { c: V('serious'), i: '!', t: 'Charge en hausse' }
: { c: V('critical'), i: '!!', t: 'Hausse trop brutale' };
const zoneSec = [1, 2, 3, 4, 5].map((z) => inLast(prepRuns, 28).reduce((s, r) => s + (r['hrTimeInZone_' + z] || 0), 0));
const zoneTotal = zoneSec.reduce((a, b) => a + b, 0);
const zoneColors = [1, 2, 3, 4, 5].map((z) => V('z' + z));
const zoneNames = ['Z1 Récup', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Seuil', 'Z5 VO2max'];
// Avec 3 sorties par semaine (1 qualité, 1 longue, 1 footing), ~65 % en Z1-Z2 est réaliste ; 80 % vaut pour les gros volumes.
const EASY_TARGET = 0.65;
const easyShare = zoneTotal ? (zoneSec[0] + zoneSec[1]) / zoneTotal : NaN;
const days60 = []; for (let i = 59; i >= 0; i--) days60.push(addDays(today, -i));
const rhr = days60.map((d) => dailyMap.get(dayKey(d))?.heartRate?.restingValue ?? null);
const hrvNight = days60.map((d) => hrvMap.get(dayKey(d))?.lastNightAvg ?? null);
const hrvLow = days60.map((d) => hrvMap.get(dayKey(d))?.baseline?.balancedLow ?? null);
const hrvHigh = days60.map((d) => hrvMap.get(dayKey(d))?.baseline?.balancedUpper ?? null);
const days30 = days60.slice(-30);
const sleepH = days30.map((d) => { const s = sleepMap.get(dayKey(d)); return s && s.sleepTimeSeconds ? s.sleepTimeSeconds / 3600 : null; });
const lastVals = (arr, n) => arr.slice(-n).filter((v) => v != null);
const rhr7 = avg(lastVals(rhr, 7)), sleep7 = avg(lastVals(sleepH, 7));
const sleep30 = days30.map((d) => sleepMap.get(dayKey(d)) || null);
const sleepScore = (s) => (s && isFinite(s.score) && s.score > 0 ? s.score : null);
const score7 = avg(lastVals(sleep30.map(sleepScore), 7));
const PHASES = [['deepSeconds', 'Profond', 'sl-deep'], ['lightSeconds', 'Léger', 'sl-light'], ['remSeconds', 'Paradoxal', 'sl-rem'], ['awakeSeconds', 'Éveillé', 'sl-awake']];
const phase7 = PHASES.map(([k]) => avg(lastVals(sleep30.map((s) => (s && isFinite(s[k]) ? s[k] / 3600 : null)), 7)));
const hasPhases = phase7.slice(0, 3).some((v) => isFinite(v) && v > 0);
const sleepWeek = (mon) => Array.from({ length: 7 }, (_, i) => sleepMap.get(dayKey(addDays(mon, i)))).filter(Boolean);
// Graphique sommeil : 3 semaines passées (moyennes) + les 7 nuits de cette semaine, par phase.
const slCols = [...[3, 2, 1].map((n) => ({ lbl: `S-${n}`, nights: sleepWeek(addDays(thisMon, -7 * n)), wk: true })),
...Array.from({ length: 7 }, (_, i) => { const d = addDays(thisMon, i), n = d <= today ? sleepMap.get(dayKey(d)) : null; return { lbl: `${d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').slice(0, 3)} ${d.getDate()}`, nights: n ? [n] : [], wk: false }; })];
const slVal = (nights, k) => { const v = nights.map((n) => (isFinite(n[k]) && n[k] > 0 ? n[k] / 3600 : null)).filter((x) => x != null); return v.length ? Math.round(avg(v) * 100) / 100 : null; };
const slRest = slCols.map((c) => { const v = c.nights.filter((n) => !PHASES.slice(0, 3).some(([k]) => n[k] > 0) && n.sleepTimeSeconds).map((n) => n.sleepTimeSeconds / 3600); return v.length ? Math.round(avg(v) * 100) / 100 : null; });
const slThis = slCols.slice(3).flatMap((c) => c.nights).filter((n) => n.sleepTimeSeconds);
const sleepThisWk = slThis.length ? avg(slThis.map((n) => n.sleepTimeSeconds / 3600)) : NaN, scoreThisWk = avg(slThis.map(sleepScore).filter(Boolean));
const latestHrv = [...hrv].filter((h) => h.lastNightAvg).sort((a, b) => (a.calendarDate < b.calendarDate ? 1 : -1))[0];
const zArr = Array.isArray(D.hrZones) ? D.hrZones : [];
const runZones = zArr.find((z) => z.sport === 'RUNNING') || zArr.find((z) => z.sport === 'DEFAULT');
const hrZ2 = runZones && runZones.zone2Floor && runZones.zone3Floor ? { z2lo: runZones.zone2Floor, z2hi: runZones.zone3Floor - 1 } : null;
const hrEasy = hrZ2 ? { lo: hrZ2.z2lo, hi: hrZ2.z2hi } : null;
const hrCap = hrZ2 ? (runZones.zone4Floor ? runZones.zone4Floor - 1 : hrZ2.z2hi + 20) : null;
const easyPace = clamp(paceAtHr && hrEasy ? paceAtHr((hrEasy.lo + hrEasy.hi) / 2) : fitMP + 90, fitMP + 40, fitMP + 150);
const longPace = clamp(paceAtHr && hrCap ? paceAtHr(hrCap - 6) : fitMP + 65, fitMP + 45, fitMP + 85);
const paces = { mp: fitMP, p10, half: pHalf,
threshold: thr ? { fast: thr.fast, slow: thr.slow } : { fast: p10, slow: p10 + 10 },
interval: thr ? { fast: thr.mid - 32, slow: thr.mid - 22 } : { fast: p5 - 5, slow: p5 + 5 },
vma: thr ? { fast: thr.mid - 50, slow: thr.mid - 40 } : { fast: p5 - 25, slow: p5 - 15 } };
const weekRuns = (mon) => runs.filter((r) => r._date >= mon && r._date < addDays(mon, 7) && r.duration >= 900);
const curWeekIdx = Math.max(0, Math.round((thisMon - planStartMon) / DAY / 7));
const holdWeeks = new Set();
for (let w = 0; w < curWeekIdx; w++) if (weekRuns(addDays(planStartMon, w * 7)).length < 2) holdWeeks.add(w + 1);
// ===== 3. Plan d'entraînement, notes des séances et auto-régulation =====
const SC = window.SessionScore;
const levels = [];
let feel = {}; try { feel = JSON.parse(localStorage.getItem('feel') || '{}') || {}; } catch (e) { /* nothing saved */ }
const feelKey = (s) => `${dayKey(s.origDate || s.date)}|${s.type}`;
// Séances déplacées par l'utilisateur : { "jourPrévu|type": index du jour dans la semaine (0 = lundi) }.
let moves = {}; try { moves = JSON.parse(localStorage.getItem('moves') || '{}') || {}; } catch (e) { /* nothing saved */ }
const moveKey = (s) => `${dayKey(s.origDate || s.date)}|${s.type}`;
// Valeur = jours depuis le lundi de la semaine d'origine (7 et plus = semaine suivante), ou 'x' = séance retirée.
const applyMovesAll = (weeks) => {
weeks.forEach((w) => w.sessions.forEach((s) => { s.origDate = s.date; }));
const later = [];
weeks.forEach((w) => { w.removed = []; w.sessions = w.sessions.filter((s) => { const to = moves[moveKey(s)];
if (to == null || s.type === 'race') return true;
if (to === 'x') { w.removed.push(s); return false; }
const d = addDays(monday(s.origDate), to), tw = weeks.find((x) => +x.monday === +monday(d));
if (!tw) return true;
s.date = d; s.moved = dayKey(d) !== dayKey(s.origDate);
if (tw !== w) { s.fromPrev = true; later.push([tw, s]); return false; }
return true; }); });
later.forEach(([tw, s]) => tw.sessions.push(s));
weeks.forEach((w) => w.sessions.sort((a, b) => a.date - b.date)); };
const feelCount = (list) => { const f = { facile: 0, bien: 0, dur: 0, tresdur: 0, n: 0 };
list.forEach((s) => { const v = feel[feelKey(s)]; if (v && f[v] !== undefined) { f[v]++; f.n++; } }); return f; };
const adjustOf = (w) => {
if (w < levels.length) return levels[w];
return { level: 0, force: false };
};
const scoreMemo = new Map();
let curRanges = null;
const scoreOf = (s, r) => { if (!SC) return null; const k = `${r.activityId}|${s.title}|${s.km}|${Math.round(s.sec)}`;
if (!scoreMemo.has(k)) scoreMemo.set(k, SC.score(s, r, LAPS[r.activityId], { paceAtHr, zones: runZones, ranges: curRanges })); return scoreMemo.get(k); };
const fitOf = (s, r) => { const sc = scoreOf(s, r);
return (sc ? sc.total : 50) - Math.min(60, 35 * Math.abs(Math.log(r.duration / s.sec))) + (dayKey(r._date) === dayKey(s.date) ? 12 : 0); };
const pairUp = (sessions, pool) => { let best = { v: -1, pick: [] };
const go = (i, used, v, pick) => {
if (i === sessions.length) { if (v > best.v) best = { v, pick }; return; }
go(i + 1, used, v, [...pick, null]);
pool.forEach((r, j) => { if (!(used & (1 << j))) go(i + 1, used | (1 << j), v + 1000 + fitOf(sessions[i], r), [...pick, r]); });
};
go(0, 0, 0, []); return best.pick; };
const buildPlan = () => { const plan = window.MarathonPlan.buildPlan({
planStart: planStartMon, raceDate, goalPace: targetPace, raceKm: R.distanceKm, peakLongRunKm: R.peakLongRunKm,
startLongKm: R.startLongKm || 12, longRunDay: R.longRunDay || 'SUNDAY',
paces, easyPace, longPace, hrEasy, phaseOf: phaseAt, holdWeeks, adjust: SC ? adjustOf : null
});
curRanges = plan.ranges;
applyMovesAll(plan.weeks);
plan.weeks.forEach((w) => {
const all = weekRuns(w.monday), over = addDays(w.monday, 7) <= today;
const pick = all.length ? pairUp(w.sessions, all) : [];
w.sessions.forEach((s, i) => {
s.run = pick[i] || null;
s.missed = !s.run && over;
s.late = !s.run && !over && s.date < today;
s.score = s.run ? scoreOf(s, s.run) : null;
});
w.doneKm = all.reduce((a, r) => a + km(r.distance), 0);
w.doneCount = w.sessions.filter((s) => s.run).length;
w.score = SC ? SC.weekScore(w.sessions) : null;
});
return plan; };
// ===== Forme / fatigue / fraîcheur : un des signaux de l'auto-régulation =====
const ff = (() => { if (!activities.length) return [];
let d = startOfDay(activities.reduce((m, a) => (a._date < m ? a._date : m), today)), ctl = 0, atl = 0; const out = [];
for (; d <= today; d = addDays(d, 1)) { const l = loadOn.get(dayKey(d)) || 0; ctl += (l - ctl) / 42; atl += (l - atl) / 7; out.push({ d, ctl, atl, tsb: ctl - atl }); }
return out; })();
// ===== Auto-régulation : une note d'adaptation de -100 à +100, qui combine tous les signaux =====
// Chaque signal donne une valeur de -1 à +1, pondérée. Un signal seul ne peut pas faire basculer le plan,
// et l'ajustement reste doux : quelques minutes de qualité, ±1 km de sortie longue seulement au-delà de ±50.
const ffAt = new Map(ff.map((x) => [dayKey(x.d), x]));
const rhrAt = (d) => dailyMap.get(dayKey(d))?.heartRate?.restingValue;
const SIG = [['scores', 'Notes des séances', 35], ['feel', 'Ressentis', 25], ['fresh', 'Fraîcheur', 15], ['sleep', 'Sommeil', 15], ['rhr', 'FC repos', 10]];
const cl1 = (v) => Math.max(-1, Math.min(1, v));
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt0(Math.abs(v));
if (SC) for (let w = 0; w <= curWeekIdx; w++) {
const p = buildPlan();
const hist = p.weeks.slice(Math.max(0, w - 3), w).map((x) => x.score).filter(Boolean);
const d = SC.decide(hist);
const mon = addDays(planStartMon, w * 7), pmon = addDays(mon, -7), prev = w > 0 ? p.weeks[w - 1] : null, sig = {};
if (d.n) sig.scores = { v: cl1((d.avg - 75) / 12), txt: `${d.avg}/100 de moyenne` };
if (prev) { const f = feelCount(prev.sessions);
if (f.n) sig.feel = { v: cl1((f.facile - 0 + 0.4 * f.bien - 0.6 * f.dur - f.tresdur) / f.n), txt: `${f.n} noté${f.n > 1 ? 's' : ''}${f.dur + f.tresdur ? `, ${f.dur + f.tresdur} dur${f.dur + f.tresdur > 1 ? 's' : ''}` : ''}` }; }
const fx = ffAt.get(dayKey(addDays(mon, -1)));
if (fx && ff.length >= 28) sig.fresh = { v: cl1((fx.tsb + 10) / 20), txt: `fraîcheur ${sgn(Math.round(fx.tsb))}` };
if (w > 0) { const sc = sleepWeek(pmon).map(sleepScore).filter(Boolean);
if (sc.length >= 4) sig.sleep = { v: cl1((avg(sc) - 70) / 15), txt: `score moyen ${Math.round(avg(sc))}` }; }
const r7 = avg(Array.from({ length: 7 }, (_, i) => rhrAt(addDays(pmon, i))).filter(Boolean));
const r28 = avg(Array.from({ length: 28 }, (_, i) => rhrAt(addDays(pmon, -1 - i))).filter(Boolean));
if (w > 0 && isFinite(r7) && isFinite(r28)) { const dd = r7 - r28; sig.rhr = { v: Math.min(0.5, cl1(-(dd - 0.5) / 4)), txt: Math.abs(dd) < 1 ? 'stable' : `${dd > 0 ? '+' : '−'}${fmt0(Math.abs(dd))} bpm` }; }
const used = SIG.filter(([k]) => sig[k]), wsum = used.reduce((a, x) => a + x[2], 0);
let index = d.n && wsum >= 35 ? Math.round((100 * used.reduce((a, [k, , wt]) => a + wt * sig[k].v, 0)) / wsum) : 0;
if (hist.length && hist[hist.length - 1].missed) index = Math.min(index, -25);
let level = Math.abs(index) < 15 ? 0 : index / 100, capped = false;
if (level > 0 && w > 0 && levels[w - 1] && levels[w - 1].level > 0) { level = 0; capped = true; }
levels[w] = { level, force: d.force || index <= -70, avg: d.avg, n: d.n, index, sig, wsum, capped };
}
const plan = buildPlan();
const regul = levels.length ? levels[levels.length - 1] : { level: 0, force: false, avg: null, n: 0 };
const allSessions = plan.weeks.flatMap((w) => w.sessions);
const nextSession = allSessions.find((s) => s.date >= today && !s.run && s.type !== 'race');
const curWeek = plan.weeks[Math.min(curWeekIdx, plan.weeks.length - 1)];
const typeColor = { easy: V('t-easy'), quality: V('t-quality'), long: V('t-long'), test: V('t-test'), race: V('t-race') };
const typeLabel = { easy: 'Footing', quality: 'Qualité', long: 'Sortie longue', test: 'Test', race: 'Course' };
const fitName = (s) => `${dayKey(s.date)}_${noAccent(s.title).replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')}.fit`;
const wktName = (s) => `${fmtDM(s.date).replace('/', '-')} ${noAccent(s.title)}`;
const canDownload = !!window.FitWorkout;
// Export calendrier (.ics) : une journée par séance à venir. UID stable = même séance, même identifiant.
const icsEsc = (x) => String(x).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
const icsFold = (l) => { const out = []; while (l.length > 70) { out.push(l.slice(0, 70)); l = ' ' + l.slice(70); } out.push(l); return out.join('\r\n'); };
const icsDay = (d) => dayKey(d).replace(/-/g, '');
const plainSteps = (steps) => flatSteps(steps).length ? steps.map((x) => (x.repeat ? `${x.repeat} x [ ${x.steps.map((y) => `${garminType[y.intensity]} ${durTxt(y.dur)}, ${tgtTxt(y).replace(/<[^>]+>/g, '')}`).join(' / ')} ]` : `${garminType[x.intensity]} ${durTxt(x.dur)}, ${tgtTxt(x).replace(/<[^>]+>/g, '')}`)).join('\n') : '';
const downloadIcs = () => {
const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const ev = allSessions.filter((s) => s.date >= today && !s.run).map((s) => [
'BEGIN:VEVENT', `UID:${icsDay(s.origDate || s.date)}-${s.type}@prepa-moorea`, `DTSTAMP:${now}`, `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
`DTSTART;VALUE=DATE:${icsDay(s.date)}`, `DTEND;VALUE=DATE:${icsDay(addDays(s.date, 1))}`,
`SUMMARY:${icsEsc(`${s.type === 'race' ? '🏁' : '🏃'} ${s.title}`)}`,
`DESCRIPTION:${icsEsc(`${s.desc}${s.steps.length ? '\n\n' + plainSteps(s.steps) : ''}`)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT'].map(icsFold).join('\r\n'));
const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prepa Moorea//FR', 'METHOD:PUBLISH', 'X-WR-CALNAME:Prépa', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar;charset=utf-8' }));
a.download = 'prepa-moorea.ics'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };
const garminType = { warmup: 'Échauffement', active: 'Course', rest: 'Récupération', cooldown: 'Retour au calme' };
const stepLabel = { Echauffement: '', Recup: '', 'Recup footing': 'en footing', 'Retour au calme': '', Acceleration: 'accélération', Footing: 'footing' };
const stepLevel = (s) => { if (s.intensity === 'rest' && !s.target) return 0; const r = s.est / fitMP;
return r > 1.25 ? 1 : r > 1.12 ? 2 : r > 1.03 ? 3 : r > 0.97 ? 4 : r > 0.87 ? 5 : 6; };
const stepSec = (s) => (s.dur.type === 'time' ? s.dur.s : (s.dur.m / 1000) * s.est);
const flatSteps = (steps) => steps.flatMap((s) => (s.repeat ? Array.from({ length: s.repeat }, () => s.steps).flat() : [s]));
const profileHtml = (s) => (s.steps.length ? `<span class="profile" aria-hidden="true">${flatSteps(s.steps).map((x) => { const l = stepLevel(x);
return `<i style="flex:${Math.max(stepSec(x), 45)} 0 0;height:${[16, 30, 40, 58, 70, 86, 100][l]}%;background:${typeColor[s.type]};opacity:${l === 0 ? 0.35 : l <= 2 ? 0.6 : 1}"></i>`; }).join('')}</span>` : '');
const mmss = (sec) => `${Math.floor(sec / 60)}:${pad(Math.round(sec % 60))}`;
const durTxt = (d) => (d.type === 'time' ? `Temps ${mmss(d.s)}` : `Distance ${(d.m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`);
const approx = (s) => (s.dur.type === 'time' ? (s.dur.s >= 180 ? `≈ ${fmt1(s.dur.s / s.est)} km` : '') : (s.dur.m >= 1000 ? `≈ ${fmtHM((s.dur.m / 1000) * s.est)}` : `≈ ${mmss((s.dur.m / 1000) * s.est)}`));
const tgtTxt = (s) => { const t = s.target;
if (!t) return `Aucun objectif${s.note ? ` <span class="st-approx">· ${esc(s.note)}</span>` : ''}`;
return t.type === 'hr' ? `FC ${t.lo} – ${t.hi} bpm${t.ref ? ` <span class="st-approx">· repère ${fmtPace(t.ref.fast)}-${fmtPace(t.ref.slow)}/km</span>` : ''}` : `Allure ${fmtPace(t.fast)} – ${fmtPace(t.slow)} /km`; };
const stepLi = (s) => { const extra = stepLabel[s.name] !== undefined ? stepLabel[s.name] : s.name.toLowerCase(); const a = approx(s);
return `<li><span class="st-name">${garminType[s.intensity]}${extra ? ` <span class="st-sub">· ${esc(extra)}</span>` : ''}</span><span class="st-dur tnum">${durTxt(s.dur)}</span><span class="st-tgt tnum">${tgtTxt(s)}${a ? ` <span class="st-approx">· ${a}</span>` : ''}</span></li>`; };
const stepsHtml = (steps) => steps.map((s) => (s.repeat
? `<li class="st-rep"><span class="st-x tnum">Répéter ${s.repeat} fois</span><ul>${s.steps.map(stepLi).join('')}</ul></li>`
: stepLi(s))).join('');
const scCls = (n) => (n >= 85 ? 'top' : n >= 70 ? 'good' : n >= 50 ? 'mid' : 'low');
const ring = (n) => `<span class="ring ${scCls(n)}" style="--p:${n}" role="img" aria-label="Note ${n} sur 100"><b class="tnum">${n}</b></span>`;
const fuelHtml = (s) => { const min = s.sec / 60; if ((s.type !== 'long' && s.type !== 'race') || min < 80) return '';
const n = Math.floor((min - 1) / 40);
return `<div class="fuel"><b>Ravitaillement</b> · ${n} gel${n > 1 ? 's' : ''} ou équivalent (20 à 25 g de glucides chacun) : un toutes les 40 min à partir de la 40e minute, avec quelques gorgées d'eau tous les quarts d'heure.${s.type === 'race' ? '' : ' Prends ce que tu utiliseras le jour J : l\'estomac s\'entraîne aussi.'}</div>`; };
// ===== 4. Affichage des séances et des semaines =====
const FEELS = [['facile', 'Facile'], ['bien', 'Bien'], ['dur', 'Dur'], ['tresdur', 'Très dur']];
const feelHtml = (s, i) => { if (s.type === 'race' || s.missed) return '';
const cur = feel[feelKey(s)], future = s.date > today;
return `<div class="feel" role="group" aria-label="Ressenti de la séance"><span class="feel-k">${future ? 'À noter après la séance' : 'Ton ressenti'}</span><span class="feel-b">${FEELS.map(([v, l]) => `<button type="button" class="feel-o f-${v}${cur === v ? ' on' : ''}" data-feel="${i}" data-v="${v}" aria-pressed="${cur === v}"${future ? ' disabled' : ''}>${l}</button>`).join('')}</span></div>`; };
const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MK = window.MoveKit;
const weekOfS = (s) => plan.weeks.find((x) => x.sessions.includes(s));
const dayIn = (w, d) => Math.round((startOfDay(d) - w.monday) / DAY);
const mvItems = (w) => w.sessions.map((x) => ({ s: x, id: moveKey(x), day: dayIn(w, x.date), hard: x.type !== 'easy', fixed: !!x.run || x.type === 'race' || x.date < today, label: typeLabel[x.type] }));
const moveHtml = (s, i) => { if (s.run || s.missed || s.type === 'race' || !MK) return '';
const w = weekOfS(s); if (!w) return '';
const at = dayIn(w, s.date), wi = plan.weeks.indexOf(w), hasNext = wi < plan.weeks.length - 1 && plan.weeks[wi + 1].weeksToRace > 0;
const chips = DOW.map((l, k) => { const d = addDays(w.monday, k), fixed = w.sessions.some((x) => x !== s && dayKey(x.date) === dayKey(d) && (x.run || x.type === 'race'));
const busy = w.sessions.some((x) => x !== s && dayKey(x.date) === dayKey(d));
return `<button type="button" class="mv-d${k === at ? ' on' : ''}" data-mv="${i}" data-to="${k}"${d < today || k === at || fixed ? ' disabled' : ''}>${l}<small>${d.getDate()}</small>${busy ? '<i>•</i>' : ''}</button>`; }).join('');
return `<details class="move"><summary>${s.moved ? `Déplacée (prévue ${s.origDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}) · changer` : 'Déplacer cette séance'}</summary>
<div class="mv-days">${chips}</div>
<div class="mv-acts">${hasNext ? `<button type="button" class="btn sm" data-mvnext="${i}">À la semaine prochaine</button>` : ''}<button type="button" class="btn sm" data-mvdel="${i}">Supprimer</button>${s.moved ? `<button type="button" class="btn sm" data-mvreset="${i}">Remettre au jour prévu</button>` : ''}</div>
<div class="mv-out" hidden></div><p class="note">• = une séance est déjà prévue ce jour-là : les autres se décalent si besoin, pour garder 48 h entre deux séances dures.</p></details>`; };
const canMoveCal = (x) => !!MK && !x.run && !x.missed && x.type !== 'race' && x.date >= startOfDay(today) && !!weekOfS(x);
const saveMoves = () => { try { localStorage.setItem('moves', JSON.stringify(moves)); } catch (err) { /* private mode */ } location.hash = '#plan'; location.reload(); };
const toVal = (s, d) => Math.round((startOfDay(d) - monday(s.origDate)) / DAY);
// Met une séance dans la semaine suivante, au même jour si possible. Retourne false s'il n'y a pas de place.
const pushNext = (s) => { const w = weekOfS(s), w2 = plan.weeks[plan.weeks.indexOf(w) + 1]; if (!w2 || w2.weeksToRace === 0) return false;
const sl = MK.slot(mvItems(w2), dayIn(w, s.date), s.type !== 'easy', 0); if (!sl) return false;
moves[moveKey(s)] = toVal(s, addDays(w2.monday, sl.day)); return true; };
let pendingMove = null;
const proposeMove = (s, to, box) => { const w = weekOfS(s), items = mvItems(w), minDay = Math.max(0, dayIn(w, today));
const r = MK.place(items, moveKey(s), to, minDay);
const commit = (skip) => { items.forEach((x) => { const d = r.res[x.id]; if (d == null || x.fixed || x === skip) return; if (d !== x.day || x.id === moveKey(s)) moves[x.id] = toVal(x.s, addDays(w.monday, d)); }); };
pendingMove = { r, commit, s };
const h = MK.html(r, typeLabel[s.type], to);
if (!h) { commit(); saveMoves(); return; }
box.innerHTML = h; box.hidden = false; };
const sessionCard = (s, forceOpen) => {
const i = allSessions.indexOf(s);
const isNext = s === nextSession;
const r = s.run;
const status = r ? `<span class="s-status ok">✓ Fait ${fmtDate(r._date)} · ${fmt1(km(r.distance))} km en ${fmtDur(r.duration)} (${fmtPace(r.duration / km(r.distance))}/km)</span>`
: s.missed ? '<span class="s-status miss">– Non réalisée</span>'
: s.late ? '<span class="s-status late">! En retard · à caser cette semaine</span>'
: isNext ? '<span class="s-status next">▶ Prochaine séance</span>' : '';
const sc = s.score;
const scClass = sc ? scCls(sc.total) : '';
const scoreBadge = sc ? `<span class="s-score">${ring(sc.total)}<span><b>${sc.label}</b><small>note sur 100</small></span></span>` : '';
const scoreDetail = sc ? `<div class="score-detail"><div class="score-title">Analyse de la séance · <b>${sc.total}/100</b>${sc.approx ? ' <span class="note">(estimation, détail des tours indisponible)</span>' : ''}</div>
${sc.parts.map((p) => `<div class="score-row"><span class="score-name">${p.name}</span><span class="score-bar"><i class="${scClass}" style="width:${Math.round((p.pts / p.max) * 100)}%"></i></span><span class="score-pts tnum">${p.pts}/${p.max}</span><span class="score-txt">${esc(p.txt)}</span></div>`).join('')}</div>` : '';
const hasSteps = s.steps.length > 0;
const open = forceOpen === true;
return `<div class="session ${isNext ? 'next' : ''}" data-s="${i}" style="border-top-color:${typeColor[s.type]}">
<button type="button" class="s-head" ${hasSteps ? `aria-expanded="${open}"` : 'disabled'}>
<span class="s-day">${esc(s.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }))}</span>
<span class="s-type"><span class="sw" style="background:${typeColor[s.type]}"></span>${typeLabel[s.type]} · <span class="tnum">≈ ${fmt1(s.km)} km · ${fmtHM(s.sec)}</span></span>
<span class="s-title">${esc(s.title)}</span>
${profileHtml(s)}
<span class="s-desc">${esc(s.desc)}</span>
${status}
${scoreBadge}
${sc ? `<span class="s-sum">${esc(sc.summary)}</span>` : ''}
${hasSteps ? `<span class="s-more">${sc ? 'Analyse et étapes de la séance' : 'Étapes de la séance'}</span>` : ''}
</button>
${feelHtml(s, i)}
${moveHtml(s, i)}
${hasSteps ? `<div class="s-steps" ${open ? '' : 'hidden'}>${scoreDetail}<ol>${stepsHtml(s.steps)}</ol>${r ? '' : fuelHtml(s)}
</div>` : ''}
</div>`;
};
const levelTxt = (w) => (w.forced ? 'récup forcée' : w.level > 0 ? 'durcie' : w.level < 0 ? 'allégée' : '');
const weekFlags = (w) => `${phaseName(w.phase)}${w.recovery && !w.forced ? ' · allégée' : ''}${w.hold ? ' · répétée' : ''}${levelTxt(w) ? ' · ' + levelTxt(w) : ''}`;
const levelWord = (l) => (Math.abs(l) >= 0.5 ? '' : 'légèrement ');
const regulTxt = !regul.n ? 'pas encore de semaine terminée dans le plan : le programme suit sa progression normale. L\'ajustement commencera dès la semaine prochaine.'
: `note d'adaptation <b>${sgn(regul.index)}</b> → ${
curWeek.weeksToRace < 3 ? 'c\'est l\'affûtage : le programme ne change plus, place à la fraîcheur.'
: curWeek.forced ? 'signaux très bas : semaine de récupération imposée.'
: curWeek.hold ? `moins de 2 sorties la semaine dernière : cette semaine <b>répète</b> la précédente${curWeek.level < 0 ? ', en version allégée' : ''}.`
: curWeek.recovery ? 'semaine <b>allégée</b>, déjà prévue au plan.'
: regul.level > 0 ? `programme <b>${levelWord(regul.level)}durci</b> (séance de qualité un peu plus longue${regul.level >= 0.5 ? ', sortie longue +1 km' : ''}).`
: regul.level < 0 ? `programme <b>${levelWord(regul.level)}allégé</b> (séance de qualité un peu plus courte${regul.level <= -0.5 ? ', sortie longue −1 km' : ''}).`
: regul.capped ? 'la semaine dernière était déjà durcie : celle-ci reste <b>normale</b> (une semaine durcie sur deux au maximum).'
: 'programme <b>maintenu</b> tel quel.'}`;
const sigHtml = !regul.n || !regul.sig ? '' : `<details class="sigw"><summary>Ce qui a pesé cette semaine</summary><div class="sigw-list">${SIG.map(([k, l, wt]) => { const x = regul.sig[k];
if (!x) return `<div class="sw-row off"><span>${l}</span><span class="sw-bar"></span><span class="note">pas de donnée</span></div>`;
const pts = Math.round((100 * wt * x.v) / regul.wsum);
return `<div class="sw-row"><span>${l}</span><span class="sw-bar"><i class="${pts >= 0 ? 'up' : 'down'}" style="${pts >= 0 ? 'left:50%' : `right:50%`};width:${Math.min(50, Math.abs(pts))}%"></i></span><span class="tnum"><b>${sgn(pts)}</b> · ${esc(x.txt)}</span></div>`; }).join('')}</div>
<p class="note">Chaque signal pèse selon son importance : un seul ne peut pas faire basculer le plan. Entre −15 et +15, rien ne change.</p></details>`;
const when = (d) => (+d === +today ? 'aujourd\'hui' : +d === +addDays(today, 1) ? 'demain' : d.toLocaleDateString('fr-FR', { weekday: 'long' }));
const catchUp = (() => {
const late = curWeek.sessions.filter((s) => s.late);
if (!late.length || curWeek.weeksToRace === 0) return '';
const todo = curWeek.sessions.filter((s) => !s.run && s.date >= today);
const isLong = (s) => s.type === 'long' || s.type === 'race' || (s.type === 'test' && /semi/i.test(s.title));
if (late.some(isLong)) return 'ta sortie longue n\'est pas encore faite : c\'est la séance à sauver. Fais-la dès que possible, à la place d\'une autre s\'il le faut.';
if (late.some((s) => s.type !== 'easy')) {
const longNext = todo.find(isLong), lastOk = longNext ? addDays(longNext.date, -2) : addDays(curWeek.monday, 6), easyNext = todo.find((s) => s.type === 'easy');
if (today > lastOk) return 'trop tard pour caser la séance de qualité sans abîmer la sortie longue : laisse-la tomber et arrive frais.';
if (easyNext && +easyNext.date === +today) return 'la séance de qualité n\'est pas encore faite : fais-la aujourd\'hui à la place du footing. C\'est le footing qui saute.';
return `la séance de qualité n'est pas encore faite : fais-la aujourd'hui si tu peux${easyNext && easyNext.date <= lastOk ? `, sinon ${when(easyNext.date)} à la place du footing` : ''}. Garde au moins un jour facile avant la sortie longue.`;
}
return 'footing manqué : inutile de le rattraper, garde ton énergie pour la suite de la semaine.';
})();
const STRENGTH = /strength|hiit|pilates|yoga/;
const STRENGTH_GOAL = 2;
const strengthIn = (mon) => activities.filter((a) => a._date >= mon && a._date < addDays(mon, 7) && STRENGTH.test(a.activityType?.typeKey || '')).length;
const strengthN = strengthIn(thisMon);
const DOWS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const longDowI = Math.max(0, DOWS.indexOf(R.longRunDay || 'SUNDAY'));
const strengthDays = [1, 3].map((k) => addDays(thisMon, (longDowI + k) % 7).toLocaleDateString('fr-FR', { weekday: 'long' })).join(' et ');
const strengthHtml = `<details class="renfo"><summary><b>Renforcement</b> · <span class="tnum">${Math.min(strengthN, 9)}/${STRENGTH_GOAL}</span> cette semaine${strengthN >= STRENGTH_GOAL ? ' ✓' : ` · conseillé ${strengthDays}`}</summary>
<ol><li><b>Gainage planche</b> 3 × 30-45 s</li><li><b>Gainage latéral</b> 2 × 30 s par côté</li><li><b>Squat</b> 3 × 12</li><li><b>Fentes arrière</b> 3 × 10 par jambe</li><li><b>Pont fessier sur une jambe</b> 3 × 10 par jambe</li><li><b>Mollets sur une marche</b> 3 × 15, descente lente sur 3 s</li></ol>
<p class="note">15 à 20 min, un jour sans séance dure, jamais la veille de la sortie longue. Enregistre-la sur ta montre en « Musculation » pour qu'elle soit comptée.</p></details>`;
const regulHtml = [
SC ? { c: curWeek.forced ? 'low' : curWeek.level > 0 ? 'top' : curWeek.level < 0 || curWeek.hold ? 'mid' : '', t: `<b>Auto-régulation</b> · ${regulTxt}${sigHtml}` } : null,
catchUp ? { c: 'mid', t: `<b>Rattrapage</b> · ${catchUp}` } : null,
{ c: strengthN >= STRENGTH_GOAL ? 'top' : strengthN ? 'mid' : '', t: strengthHtml }
].filter(Boolean).map((n) => `<div class="regul ${n.c}">${n.t}</div>`).join('');
const weekRow = (w) => {
const isCur = w === curWeek, past = w.index < curWeek.index;
const short = (s) => s.title.replace(/^Sortie longue (\d+) km · /, 'SL $1 km · ').replace(/^Sortie longue/, 'SL').replace(' Z2', '');
const ph = phases.find((p) => w.monday >= p.from && w.monday < p.to) || phases[phases.length - 1];
return `<details class="wkr ${isCur ? 'cur' : ''} ${past ? 'past' : ''}" style="--ph:${ph.color}">
<summary><span class="wk-n tnum">S${w.index + 1}</span><span class="wk-date">${w.monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
<span class="wk-chips">${w.sessions.map((s) => `<span class="chip"><span class="sw" style="background:${typeColor[s.type]}"></span>${esc(short(s))}</span>`).join('')}${isCur ? '<span class="tag now">en cours</span>' : ''}${w.recovery && !w.forced ? '<span class="tag">allégée</span>' : ''}${w.hold ? '<span class="tag">répétée</span>' : ''}${levelTxt(w) ? `<span class="tag">${levelTxt(w)}</span>` : ''}${w.score && (past || isCur) ? `<span class="tag"><b class="tnum">${w.score.score}</b>/100</span>` : ''}${past || isCur ? `<span class="tag">renfo ${strengthIn(w.monday)}/${STRENGTH_GOAL}</span>` : ''}</span>
<span class="wk-vol tnum"><span class="wk-bar"><i style="width:${Math.round((w.targetKm / maxWeekKm) * 100)}%;background:${phaseAt(addDays(w.monday, 3)).color}"></i></span>${past || isCur ? fmt0(w.doneKm) + ' / ' : ''}${w.targetKm} km</span></summary>
<div class="sessions">${w.sessions.map((s) => sessionCard(s)).join('')}</div>
</details>`;
};
const R2 = plan.ranges;
// Test semi : le moment de vérité pour l'objectif (marathon ≈ semi × 2,1 quand le volume reste modéré).
const SEMI_X = 2.1;
const semiS = allSessions.find((s) => s.title === 'Test semi-marathon');
const semiGoal = targetSec / SEMI_X;
const semiHtml = (() => {
if (!semiS) return '';
const r = semiS.run;
if (!r || km(r.distance) < 19) return `<div class="goal-row"><span class="k">Test semi · ${fmtDate(semiS.date)}<br><span class="note">le moment de vérité pour l'objectif</span></span>
<span class="r"><span class="v tnum">≤ ${fmtDur(semiGoal)}</span><br><span class="note">pour garder ${goalTxt}</span></span></div>`;
const half = r.duration * Math.pow(21.0975 / km(r.distance), 1.06), eq = half * SEMI_X;
const ok = eq <= targetSec + 60;
const sugg = Math.ceil(eq / 300) * 300;
return `<div class="goal-row"><span class="k">Test semi · ${fmtDate(r._date)}<br><span class="note">${fmtDur(half)} → marathon ≈ ${fmtDur(eq)}</span></span>
<span class="r"><span class="v tnum">${ok ? goalTxt + ' ✓' : fmtDur(sugg).replace(/^(\d+):(\d+):00$/, '$1h$2')}</span><br><span class="delta ${ok ? 'ok' : 'ko'}">${ok ? 'objectif confirmé' : 'objectif conseillé, demande à Claude de l\'appliquer'}</span></span></div>`;
})();
const firstOf = (pred) => allSessions.find(pred);
const longest = Math.max(...plan.weeks.map((w) => (w.weeksToRace > 0 && !w.test ? w.longKm : 0)));
const miles = [
[firstOf((s) => s.title === 'Test 10 km'), 'Test 10 km'], [firstOf((s) => s.title === 'Test semi-marathon'), 'Test semi-marathon'],
[firstOf((s) => s.type === 'long' && s.title.startsWith(`Sortie longue ${longest} km`)), `Première sortie de ${longest} km`],
[firstOf((s) => s.type === 'race'), 'Marathon']
].filter(([s]) => s && s.date >= today).map(([s, label]) => ({ date: s.date, label })).sort((a, b) => a.date - b.date);
const maxWeekKm = Math.max(...plan.weeks.filter((w) => w.weeksToRace > 0).map((w) => w.targetKm));
const planListHtml = () => phases.map((p) => { const ws = plan.weeks.filter((w) => w.phase === p.key); if (!ws.length) return '';
return `<div class="ph-head"><span class="sw" style="background:${p.color}"></span><b>${p.name}</b><span>${ws.length} semaine${ws.length > 1 ? 's' : ''} · du ${ws[0].monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${new Date(Math.min(addDays(ws[ws.length - 1].monday, 6), raceDate)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></div>${ws.map(weekRow).join('')}`; }).join('');
// ===== 5. Conseils du coach et forme du jour =====
const prevMon = addDays(thisMon, -7), prevEnd = addDays(thisMon, -1);
const inPrev = (a) => a._date >= prevMon && a._date < thisMon;
const pRuns = runs.filter(inPrev), pOther = activities.filter((a) => inPrev(a) && !isRun(a));
const pDays = Array.from({ length: 7 }, (_, i) => addDays(prevMon, i));
const pSleep = pDays.map((d) => sleepMap.get(dayKey(d))?.sleepTimeSeconds).filter(Boolean).map((s) => s / 3600);
const pHrv = pDays.map((d) => hrvMap.get(dayKey(d))).filter((h) => h && h.lastNightAvg);
const pHrvLow = pHrv.filter((h) => h.baseline?.balancedLow && h.lastNightAvg < h.baseline.balancedLow).length;
const rhrOf = (d) => dailyMap.get(dayKey(d))?.heartRate?.restingValue;
const pRhr = avg(pDays.map(rhrOf).filter(Boolean));
const baseRhr = avg(Array.from({ length: 28 }, (_, i) => rhrOf(addDays(prevMon, -1 - i))).filter(Boolean));
const hardLabel = /TEMPO|THRESHOLD|VO2|ANAEROBIC/;
const isHard = (a) => hardLabel.test(a.trainingEffectLabel || '') || (a.activityTrainingLoad || 0) >= 150;
const hardDays = pDays.map((d) => activities.some((a) => dayKey(a._date) === dayKey(d) && isHard(a)));
const backToBack = hardDays.some((h, i) => h && hardDays[i + 1]);
const pKm = pRuns.reduce((s, r) => s + km(r.distance), 0);
const pZone = [1, 2, 3, 4, 5].map((z) => pRuns.reduce((s, r) => s + (r['hrTimeInZone_' + z] || 0), 0));
const pZoneTot = pZone.reduce((a, b) => a + b, 0);
const pEasy = pZoneTot ? (pZone[0] + pZone[1]) / pZoneTot : NaN;
const prev3 = avg([1, 2, 3].map((i) => weekRuns(addDays(prevMon, -7 * i)).reduce((s, r) => s + km(r.distance), 0)));
const lastRun = runs[runs.length - 1];
const prevPlanWeek = plan.weeks.find((w) => +w.monday === +prevMon);
const sportName = { soccer: 'foot', hiit: 'HIIT', strength_training: 'renfo', hiking: 'rando', cycling: 'vélo', walking: 'marche', indoor_cardio: 'cardio', open_water_swimming: 'natation', paddelball: 'padel', resort_snowboarding: 'snowboard', resort_skiing: 'ski' };
const otherTxt = [...new Set(pOther.map((a) => sportName[a.activityType?.typeKey] || 'autre sport'))].join(', ');
const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${pad(m % 60)}`; };
const z2Txt = hrEasy ? `${hrEasy.lo}-${hrEasy.hi} bpm` : 'zone 2';
const recoveryTips = (() => { const out = [];
if (isFinite(pRhr) && isFinite(baseRhr) && pRhr - baseRhr >= 4) out.push({ t: `Ta FC au repos est montée à ${fmt0(pRhr)} bpm, contre ${fmt0(baseRhr)} d'habitude.`, d: 'Fatigue, manque de sommeil ou début de virus. Garde tes footings vraiment faciles cette semaine et ne force pas la séance de qualité si les jambes sont lourdes.' });
const pSc = sleepWeek(prevMon).map(sleepScore).filter(Boolean), pDeep = sleepWeek(prevMon).map((s) => s.deepSeconds).filter((x) => isFinite(x) && x > 0);
if (pSc.length >= 4 && avg(pSc) < 65) out.push({ t: `Score de sommeil moyen de ${fmt0(avg(pSc))}/100 la semaine dernière.`, d: 'Ton sommeil récupère mal en ce moment. Couche-toi à heure fixe, évite écrans et repas lourds tard le soir, et garde la séance de qualité pour un jour après une bonne nuit.' });
if (pDeep.length >= 4 && avg(pDeep) < 2700) out.push({ t: `Seulement ${hm(avg(pDeep) / 3600)} de sommeil profond par nuit en moyenne.`, d: 'C\'est le sommeil qui répare les muscles. Évite l\'alcool et les séances intenses tard le soir, et vise une chambre fraîche et sombre.' });
if (pSleep.length >= 4 && avg(pSleep) < 7) out.push({ t: `Tu as dormi ${hm(avg(pSleep))} par nuit en moyenne.`, d: 'C\'est trop peu pour assimiler l\'entraînement. Vise 30 à 45 min de plus, en priorité la veille de la séance de qualité et de la sortie longue.' });
if (backToBack) out.push({ t: 'Tu as enchaîné deux journées intenses de suite.', d: 'Laisse au moins un jour facile ou de repos entre deux efforts durs, tous sports confondus. C\'est le jour facile qui fait progresser.' });
if (pOther.filter(isHard).length >= 2) out.push({ t: `${pOther.length} séances hors course la semaine dernière (${otherTxt}).`, d: 'Compte les plus intenses comme des séances dures : garde 48 h entre elles et la sortie longue, sinon tu la courras déjà fatigué.' });
if (!out.length) out.push({ t: `Signaux au vert${pSleep.length ? ` : ${hm(avg(pSleep))} de sommeil par nuit` : ''}.`, d: 'Protège cet état : une journée complète sans sport le lendemain de la sortie longue, et mange dans l\'heure qui suit tes séances de plus d\'une heure.' }); return out;
})();
const trainingTips = (() => { const out = [];
if (!pRuns.length) out.push({ t: `Aucune course la semaine dernière${lastRun && lastRun._date < prevMon ? ` : ta dernière sortie datait du ${fmtDate(lastRun._date).replace(/\.$/, '')}` : ''}.`, d: `Reprends avec les 3 séances prévues, sans chercher à rattraper. Sur la séance de qualité, reste à ${fmtPace(paces.threshold.fast)}-${fmtPace(paces.threshold.slow)}/km même si ça paraît facile : tes jambes ont perdu un peu de rythme.` });
if (prevPlanWeek && prevPlanWeek.doneCount < 2) out.push({ t: `${prevPlanWeek.doneCount} séance sur ${prevPlanWeek.sessions.length} la semaine dernière.`, d: 'La régularité compte plus que n\'importe quelle séance. Si tu dois en sauter une cette semaine, saute le footing, jamais la sortie longue.' });
if (isFinite(pEasy) && pEasy < EASY_TARGET - 0.15) out.push({ t: `${Math.round(pEasy * 100)} % de ton temps de course en zones 1-2, pour environ ${Math.round(EASY_TARGET * 100)} % visés.`, d: `Avec 3 sorties par semaine, pas besoin de 80 %, mais la sortie longue doit rester majoritairement facile. Garde sa partie endurance sous ${hrCap ? hrCap - 6 : 160} bpm, et les blocs soutenus sous ${runZones && runZones.zone4Floor ? runZones.zone4Floor : 166} bpm.` });
if (prev3 > 5 && pKm > prev3 * 1.3) out.push({ t: `${fmt0(pKm)} km la semaine dernière, contre ${fmt0(prev3)} km en moyenne avant.`, d: 'C\'est une hausse rapide. Tiens-toi au volume prévu cette semaine, sans rien ajouter, pour laisser tes tendons s\'adapter.' });
const longDone = Math.max(0, ...pRuns.map((r) => km(r.distance)));
if (prevPlanWeek && longDone < prevPlanWeek.longKm * 0.8 && prevPlanWeek.longKm) out.push({ t: `Ta plus longue sortie a fait ${fmt1(longDone)} km pour ${prevPlanWeek.longKm} prévus.`, d: 'La sortie longue est la séance clé du marathon. Cette semaine, protège-la : bloque le créneau et pars lentement.' });
if (!out.length) out.push({ t: `Semaine solide : ${pRuns.length} sorties, ${fmt0(pKm)} km${isFinite(pEasy) ? `, ${Math.round(pEasy * 100)} % en zones 1-2` : ''}.`, d: current.key === 'base' ? 'Continue pareil. Sur la sortie longue, les blocs soutenus doivent rester confortables : si tu finis sans marge, tu es parti trop vite.' : 'Continue pareil. Sur les blocs à allure marathon, vise la régularité au kilomètre plutôt que la vitesse.' }); return out;
})();
// Conseils du coach : 3 blocs, jusqu'à 3 conseils chacun, du plus important au moins important.
const strip = (h) => String(h).replace(/<[^>]+>/g, '');
const pastTips = [];
for (let k = 0; k < 3; k++) { if (recoveryTips[k]) pastTips.push({ ...recoveryTips[k], k: 'Récup' }); if (trainingTips[k]) pastTips.push({ ...trainingTips[k], k: 'Entraînement' }); }
const weekTips = (() => { const out = [], wtr = curWeek.weeksToRace;
const todo = curWeek.sessions.filter((x) => !x.run && x.date >= today && x.type !== 'race');
const key1 = todo.find((x) => x.type === 'long') || todo.find((x) => x.type !== 'easy');
if (key1) out.push({ k: 'Séance clé', t: `${key1.title}, ${when(key1.date)}.`, d: key1.desc });
out.push({ k: 'Phase', t: `${current.name} · ${wtr > 0 ? `${wtr} semaine${wtr > 1 ? 's' : ''} avant ${R.name || 'la course'}` : 'semaine de la course'}.`, d: strip(current.advice).replace(/^[^.]+\.\s*/, '') });
if (regul.n && wtr >= 3) out.push({ k: 'Ajustement', t: `Note d'adaptation ${sgn(regul.index)} cette semaine.`, d: strip(regulTxt).replace(/^note d'adaptation [^→]+→\s*/, '').replace(/^./, (c) => c.toUpperCase()) });
else out.push({ k: 'Volume', t: `${fmt1(curWeek.doneKm)} km faits sur ${curWeek.targetKm} prévus.`, d: todo.length ? `Encore ${todo.length} séance${todo.length > 1 ? 's' : ''} cette semaine. Si tu dois en sauter une, saute le footing, jamais la sortie longue.` : 'Semaine bouclée : place à la récupération.' });
return out.slice(0, 3); })();
const trendTips = (() => { const out = [];
const kmIn = (from, n) => runs.filter((r) => r._date >= addDays(from, -n + 1) && r._date <= from).reduce((a, r) => a + km(r.distance), 0);
const k28 = kmIn(addDays(today, -1), 28), kPrev = kmIn(addDays(today, -29), 28);
if (k28 || kPrev) { const ch = kPrev ? (k28 - kPrev) / kPrev : 0;
out.push({ k: 'Volume', w: Math.abs(ch), t: `${fmt0(k28)} km sur 4 semaines${kPrev ? `, ${ch >= 0 ? '+' : '−'}${Math.round(Math.abs(ch) * 100)} % par rapport aux 4 d'avant` : ''}.`,
d: ch > 0.3 ? 'Hausse rapide : tiens-toi au volume prévu, sans rien ajouter, pour laisser tendons et mollets s\'adapter.' : ch < -0.25 ? 'Volume en baisse : si ce n\'est pas voulu, reviens d\'abord à la régularité avant d\'allonger les sorties.' : 'Progression maîtrisée : c\'est exactement ce qu\'il faut.' }); }
const last4 = plan.weeks.slice(Math.max(0, curWeekIdx - 4), curWeekIdx), due4 = last4.flatMap((w) => w.sessions.filter((x) => x.type !== 'race')), done4 = due4.filter((x) => x.run).length;
if (due4.length) { const r = done4 / due4.length;
out.push({ k: 'Régularité', w: 1 - r, t: `${done4} séance${done4 > 1 ? 's' : ''} faite${done4 > 1 ? 's' : ''} sur ${due4.length} ces 4 dernières semaines.`,
d: r >= 0.9 ? 'Excellent : la régularité fait plus progresser que n\'importe quelle séance.' : r >= 0.7 ? 'Correct. Protège en priorité la sortie longue et la séance de qualité.' : 'C\'est le point à travailler : mieux vaut 3 séances faites qu\'un plan parfait sur le papier. Déplace plutôt que de sauter.' }); }
const slp = (from, n) => Array.from({ length: n }, (_, i) => sleepMap.get(dayKey(addDays(from, -i)))).filter(Boolean);
const s28 = slp(today, 28), sPrev = slp(addDays(today, -28), 28), sc28 = avg(s28.map(sleepScore).filter(Boolean)), h28 = avg(s28.map((x) => x.sleepTimeSeconds).filter(Boolean)) / 3600;
const r28 = avg(Array.from({ length: 28 }, (_, i) => rhrAt(addDays(today, -i))).filter(Boolean)), rPrev = avg(Array.from({ length: 28 }, (_, i) => rhrAt(addDays(today, -28 - i))).filter(Boolean));
if (isFinite(h28)) { const dr = isFinite(r28) && isFinite(rPrev) ? r28 - rPrev : 0, bad = (isFinite(sc28) && sc28 < 70) || dr >= 2;
out.push({ k: 'Récupération', w: bad ? 0.5 : 0.1, t: `${hm(h28)} de sommeil par nuit${isFinite(sc28) ? `, score ${fmt0(sc28)}` : ''}${isFinite(dr) && isFinite(r28) ? ` · FC repos ${Math.abs(dr) < 1 ? 'stable' : `${dr > 0 ? 'en hausse' : 'en baisse'} de ${fmt0(Math.abs(dr))} bpm`}` : ''}.`,
d: bad ? 'Ta récupération fatigue sur la durée : couche-toi plus tôt les veilles de séance clé et garde les footings vraiment lents.' : 'Ta récupération suit la charge : continue comme ça.' }); }
const fNow = ff[ff.length - 1], f28 = ff[ff.length - 29];
if (fNow && f28) { const g = fNow.ctl - f28.ctl;
out.push({ k: 'Forme', w: Math.abs(g) / 20, t: `Forme ${fmt0(fNow.ctl)}, ${g >= 0 ? '+' : '−'}${fmt0(Math.abs(g))} en 4 semaines.`, d: g > 1 ? 'Ton corps encaisse plus de travail qu\'il y a un mois : la prépa construit.' : g < -3 ? 'Ta forme baisse : normal en semaine allégée ou en affûtage, sinon signe que le volume a chuté.' : 'Forme stable.' }); }
return out.sort((a, b) => b.w - a.w).slice(0, 3); })();
const reminder = (() => { const s2 = nextSession; if (!s2 || s2.date > addDays(today, 1)) return '';
const act = flatSteps(s2.steps).find((x) => x.intensity === 'active' && x.target);
return `<div class="coach-rem"><b>${+s2.date === +today ? 'Aujourd\'hui' : 'Demain'} · ${esc(s2.title)}</b><span>${act ? `Vise ${tgtTxt(act).replace(/<[^>]+>/g, '')} sur les blocs.` : esc(s2.desc)}</span>${fuelHtml(s2)}<button type="button" class="btn sm" data-goto="${allSessions.indexOf(s2)}">Voir la séance</button></div>`; })();
const tipHtml = (x) => `<div class="tip"><div class="tip-t"><span class="tip-tag">${esc(x.k)}</span>${esc(x.t)}</div>${x.d ? `<details class="tip-why"><summary>Pourquoi</summary><div class="tip-d">${esc(x.d)}</div></details>` : ''}</div>`;
const tipBlock = (title, list, color) => list.length ? `<div class="tip-blk"><div class="tip-k"><span class="sw" style="background:${color}"></span>${title}</div>${tipHtml(list[0])}</div>` : '';
const tipRest = (title, list) => list.length > 1 ? `<div class="tip-blk"><div class="tip-k">${title}</div>${list.slice(1).map(tipHtml).join('')}</div>` : '';
const tKey = dayKey(today);
const hrvT = hrvMap.get(tKey), sleepSec = sleepMap.get(tKey)?.sleepTimeSeconds, sleepSc = sleepScore(sleepMap.get(tKey)), rhrT = rhrOf(today);
const rhrBase28 = avg(Array.from({ length: 28 }, (_, i) => rhrOf(addDays(today, -1 - i))).filter(Boolean));
const hrvLowNights = (() => { let n = 0;
for (let i = 0; i < 7; i++) { const h = hrvMap.get(dayKey(addDays(today, -i))); if (h && h.lastNightAvg && h.baseline?.balancedLow && h.lastNightAvg < h.baseline.balancedLow) n++; else break; }
return n; })();
const yHard = activities.filter((a) => dayKey(a._date) === dayKey(addDays(today, -1)) && isHard(a));
const signals = [];
if (rhrT) { const d = isFinite(rhrBase28) ? Math.round(rhrT - rhrBase28) : 0;
signals.push({ k: 'FC repos', v: `${rhrT} bpm`, n: !isFinite(rhrBase28) ? '' : d ? `${Math.abs(d)} de ${d > 0 ? 'plus' : 'moins'} que d'habitude` : 'comme d\'habitude', lv: d >= 5 ? 2 : d >= 3 ? 1 : 0 }); }
if (sleepSec) { const h = sleepSec / 3600; signals.push({ k: 'Sommeil', v: hm(h), n: sleepSc ? `score ${sleepSc}` : '', lv: Math.max(h < 6 ? 2 : h < 7 ? 1 : 0, sleepSc ? (sleepSc < 60 ? 2 : sleepSc < 75 ? 1 : 0) : 0) }); }
const measured = signals.length > 0;
if (yHard.length) signals.push({ k: 'Hier', v: [...new Set(yHard.map((a) => (isRun(a) ? 'course' : sportName[a.activityType?.typeKey] || 'sport')))].join(', '), n: 'séance intense', lv: 1 });
if (isFinite(acr) && acr > 1.3) signals.push({ k: 'Charge', v: acr.toFixed(2).replace('.', ','), n: acr > 1.5 ? 'en forte hausse' : 'en hausse', lv: acr > 1.5 ? 2 : 1 });
const alertPts = signals.reduce((s, x) => s + x.lv, 0);
const readyLv = !measured ? -1 : alertPts >= 4 ? 2 : alertPts >= 2 ? 1 : 0;
const runToday = runs.filter((r) => dayKey(r._date) === tKey).pop();
const doneTodayS = runToday ? allSessions.find((s) => s.run === runToday) : null;
const todayS = runToday ? null : allSessions.find((s) => +s.date === +today && !s.run);
const upcoming = allSessions.find((s) => s.date > today && !s.run);
const readyTitle = ['Pas de mesure ce matin', 'Feu vert', 'Prudence', 'Récupération d\'abord'][readyLv + 1];
const readyAdvice = (() => {
if (readyLv < 0) return 'Porte ta montre pour dormir et synchronise-la le matin : ta forme du jour s\'affichera ici.';
const t = todayS ? todayS.type : 'rest', hardT = t === 'quality' || t === 'test';
if (t === 'race') return 'Jour de course : les signaux du matin sont souvent perturbés par le stress. Fais confiance à ta préparation.';
if (readyLv === 0) return runToday ? 'Tu récupères bien : rien à changer pour la suite.' : todayS ? 'Fais ta séance comme prévu.' : 'Tu récupères bien : rien à changer pour ta prochaine séance.';
if (runToday) return readyLv === 1 ? 'La séance est faite : soigne la récupération ce soir (repas complet, coucher tôt).' : 'La séance est faite, mais ton corps demande du repos : rien d\'intense demain.';
if (readyLv === 1) return hardT ? 'Fais la séance en restant sur le bas des fourchettes. Si les jambes ne répondent pas après deux répétitions, termine en footing.'
: t === 'long' ? 'Pars plus lentement que d\'habitude et laisse tomber les blocs rapides si la FC s\'envole.'
: t === 'easy' ? 'Footing vraiment facile : bas de la zone 2, pas une seconde plus vite.'
: 'Journée calme : pas de sport intense, couche-toi tôt, et la prochaine séance passera bien.';
return hardT ? 'Ne force pas : remplace la séance par 30 à 40 min de footing facile et décale la qualité de 48 h.'
: t === 'long' ? 'Raccourcis la sortie d\'un tiers, sans blocs rapides, ou décale-la à demain si tu peux.'
: t === 'easy' ? 'Repos complet, ou 30 min très faciles si tu te sens bien une fois échauffé.'
: 'Repos complet aujourd\'hui. Si les signaux ne remontent pas demain, allège aussi la prochaine séance.';
})();
const keyTarget = (s) => { if (s.type === 'race') return `allure ${fmtPace(targetPace)}/km`;
const st = flatSteps(s.steps), k = st.find((x) => x.intensity === 'active' && x.target && x.target.type === 'pace' && x.name !== 'Endurance active') || st.find((x) => x.target);
if (!k) return ''; const t = k.target;
return t.type === 'hr' ? `FC ${t.lo}-${t.hi} bpm` : `${k.name === 'Footing' ? 'allure' : 'blocs à'} ${fmtPace(t.fast)}-${fmtPace(t.slow)}/km`; };
const inDays = (d) => { const n = Math.round((d - today) / DAY); return n === 1 ? 'demain' : `dans ${n} jours`; };
const todayCard = (() => {
if (runToday) { const s = doneTodayS;
return { title: s ? `Séance faite · ${esc(s.title)}` : 'Sortie faite',
sub: `${fmt1(km(runToday.distance))} km en ${fmtDur(runToday.duration)} (${fmtPace(runToday.duration / km(runToday.distance))}/km)${s && s.score ? ` · note <b>${s.score.total}/100</b>, ${s.score.label.toLowerCase()}<br>${esc(s.score.summary)}` : ''}`,
btn: s ? `<button type="button" class="btn" data-goto="${allSessions.indexOf(s)}">Voir l'analyse</button>` : '' }; }
if (todayS) { const kt = keyTarget(todayS);
return { title: esc(todayS.title), sub: `${typeLabel[todayS.type]} · ≈ ${fmt1(todayS.km)} km · ${fmtHM(todayS.sec)}${kt ? ' · ' + kt : ''}`,
btn: `<div class="today-btns"><button type="button" class="btn primary" data-goto="${allSessions.indexOf(todayS)}">Voir la séance</button></div>` }; }
if (catchUp) return { title: 'Une séance à rattraper', sub: catchUp[0].toUpperCase() + catchUp.slice(1), btn: '' };
return { title: 'Repos', sub: 'Pas de course prévue. Marche, mobilité ou 20 min de renforcement si tu as de l\'énergie.', btn: '' };
})();
const lastDone = allSessions.filter((s) => s.run && s.score && s.run._date < today).pop();
const homeWeek = `<div class="home-week"><a href="#week" data-nav="week"><span>Semaine ${curWeek.index + 1}</span><b class="tnum">${fmt1(curWeek.doneKm)} / ${curWeek.targetKm} km</b></a>
<a href="#week" data-nav="week"><span>Renfo</span><b class="tnum">${strengthN}/${STRENGTH_GOAL}</b></a>
${lastDone ? `<button type="button" class="last" data-goto="${allSessions.indexOf(lastDone)}"><span>Dernière séance · ${esc(fmtDate(lastDone.run._date))}</span><b>${esc(lastDone.title)} · <span class="tnum">${lastDone.score.total}/100</span></b><small>${esc(lastDone.score.summary)}</small></button>` : ''}</div>`;
const due = allSessions.filter((s) => s.type !== 'race' && (s.run || s.missed || s.late)), dueDone = due.filter((s) => s.run).length;
const potN = clamp0(NW + 8, 12, 30);
const potDates = Array.from({ length: potN }, (_, i) => { const d = addDays(thisMon, 6 - 7 * (potN - 1 - i)); return d > today ? today : d; });
const potVals = potDates.map((d) => { const e = efforts.filter((x) => x.run._date < addDays(d, 1) && x.run._date >= addDays(d, -83)).reduce((b, x) => (!b || x.pace < b.pace ? x : b), null);
return e ? Math.round((e.pace + 7) * 1.10 * R.distanceKm) : null; });
const hasPot = potVals.filter((v) => v != null).length >= 2;
const racePlan = (() => { const slow = targetPace + 5, rest = (targetSec - 5 * slow) / (R.distanceKm - 5);
const rows = [5, 10, 15, 20, 21.0975, 25, 30, 35, 40].filter((k) => k < R.distanceKm).concat(R.distanceKm)
.map((k) => ({ l: k === 21.0975 ? 'Semi' : k === R.distanceKm ? 'Arrivée' : `km ${k}`, t: k <= 5 ? k * slow : 5 * slow + (k - 5) * rest }));
return { slow, rest, rows }; })();
const statusHtml = (s) => `<span class="status"><i style="background:${s.c}">${s.i}</i>${s.t}</span>`;
const weeksLeft = Math.floor(daysLeft / 7);
const predDelta = predSec - targetSec;
const deltaHtml = (d) => `<span class="delta ${d <= 0 ? 'ok' : 'ko'}">${d <= 0 ? '▲ ' + fmtDur(-d) + ' d\'avance' : '▼ ' + fmtDur(d) + ' à gagner'}</span>`;
const tlStart = phases[0].from, totalSpan = raceDate - tlStart;
const pct = (d) => Math.max(0, Math.min(100, ((d - tlStart) / totalSpan) * 100));
const tlSegs = phases.map((p) => `<div class="tl-seg ${p.to <= today ? 'past' : ''} ${p.key === current.key ? 'cur' : ''}" style="flex:${(p.to - p.from) / DAY} 0 0;background:${p.color}" title="${p.name} : ${fmtDM(p.from)} → ${fmtDM(p.to)}">${p.name}</div>`).join('');
const fetched = new Date(D.fetchedAt);
const fetchedTxt = fetched.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const ageMs = Date.now() - fetched, stale = ageMs > 30 * 3600000; // synchro quotidienne à 20 h (Polynésie)
const ago = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'à l\'instant' : m < 60 ? `il y a ${m} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const curEnd = addDays(curWeek.monday, 6);
const weekFit = curWeek.sessions.filter((s) => !s.run && s.date >= today && s.steps && s.steps.length && s.type !== 'race');
const dayMon = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const weekNo = new Map(); plan.weeks.forEach((w) => w.sessions.forEach((s) => weekNo.set(s, w.index + 1)));
const F = (s) => (s.score && s.score.facts) || {};
const paceOf = (r) => r.duration / km(r.distance);
const mPerBeat = (r) => (r.averageHR ? (r.distance / (r.duration / 60)) / r.averageHR : NaN);
const dl = (cur, prev, fmt, lowerIsBetter) => { if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev)) return ''; const d = cur - prev;
if (Math.abs(d) < 1e-9) return ''; const good = lowerIsBetter == null ? null : lowerIsBetter ? d < 0 : d > 0;
return `<span class="dl ${good == null ? '' : good ? 'ok' : 'ko'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`; };
const dSec = (x) => `${Math.round(x)} s`, dBpm = (x) => `${Math.round(x)} bpm`, dPts = (x) => `${Math.round(x * 100)} pt`, dec2 = (x) => x.toFixed(2).replace('.', ',');
const CMP = {
quality: { label: 'Qualité', types: ['quality', 'test'], a: 'Allure du travail', b: 'FC du travail',
info: 'Regroupées par type de séance. L\'allure et la FC sont celles des blocs de travail seulement, sans l\'échauffement ni les récupérations.',
family: (s) => (s.type === 'test' ? 'Tests' : /^Seuil/.test(s.title) ? 'Seuil' : /^(VMA|Fractionné)/.test(s.title) ? 'VMA et fractionné' : /^Fartlek/.test(s.title) ? 'Fartlek' : /semi/.test(s.title) ? 'Allure semi' : 'Allure marathon'),
metrics: (s, p) => { const f = F(s), g = p ? F(p) : {}, w = f.work, pw = g.work; return [
['Allure du travail', w ? fmtPace(w.pace) + '/km' : '–', w && pw ? dl(w.pace, pw.pace, dSec, true) : ''],
['FC du travail', w ? fmt0(w.hr) + ' bpm' : '–', w && pw ? dl(w.hr, pw.hr, dBpm, null) : ''],
['Travail fait / prévu', w ? `${fmtHM(w.t)} / ${fmtHM(f.W)}` : '–', ''],
['Temps en Z4-Z5', f.hard != null ? fmtHM(f.hard) : '–', '']]; } },
easy: { label: 'Endurance', types: ['easy'], a: 'Allure', b: 'FC moyenne',
info: 'Tes footings en zone 2. Le chiffre à suivre : les mètres parcourus par battement de cœur. S\'il monte, tu cours plus vite pour le même effort.',
family: () => '',
metrics: (s, p) => { const r = s.run, q = p && p.run, f = F(s), g = p ? F(p) : {}; return [
['Mètres par battement', isFinite(mPerBeat(r)) ? dec2(mPerBeat(r)) : '–', q ? dl(mPerBeat(r), mPerBeat(q), dec2, false) : ''],
['Allure', fmtPace(paceOf(r)) + '/km', q ? dl(paceOf(r), paceOf(q), dSec, true) : ''],
['FC moyenne', r.averageHR ? fmt0(r.averageHR) + ' bpm' : '–', q ? dl(r.averageHR, q.averageHR, dBpm, true) : ''],
['Temps en Z1-Z2', f.easy != null ? Math.round(f.easy * 100) + ' %' : '–', dl(f.easy, g.easy, dPts, false)],
['Durée', fmtHM(r.duration), ''],
['Distance', fmt1(km(r.distance)) + ' km', '']]; } },
long: { label: 'Sorties longues', types: ['long', 'race'], a: 'Distance', b: 'Dérive cardiaque',
info: 'Le chiffre à suivre : la dérive cardiaque, c\'est-à-dire la vitesse perdue par battement de cœur entre la première et la seconde moitié. Sous 5 %, l\'endurance est solide.',
family: () => '',
metrics: (s, p) => { const r = s.run, q = p && p.run, f = F(s), g = p ? F(p) : {}; return [
['Dérive cardiaque', f.drift != null ? Math.max(0, Math.round(f.drift * 100)) + ' %' : '–', dl(f.drift, g.drift, dPts, true)],
['Distance faite / prévue', `${fmt1(km(r.distance))} / ${fmt1(s.km)} km`, q ? dl(km(r.distance), km(q.distance), (x) => fmt1(x) + ' km', false) : ''],
['Allure moyenne', fmtPace(paceOf(r)) + '/km', q ? dl(paceOf(r), paceOf(q), dSec, null) : ''],
['Allure des blocs', f.work ? fmtPace(f.work.pace) + '/km' : '–', f.work && g.work ? dl(f.work.pace, g.work.pace, dSec, true) : ''],
['FC moyenne', r.averageHR ? fmt0(r.averageHR) + ' bpm' : '–', q ? dl(r.averageHR, q.averageHR, dBpm, null) : ''],
['Durée', fmtDur(r.duration), '']]; } }
};
const cmpKeys = Object.keys(CMP);
cmpKeys.forEach((k) => { const c = CMP[k]; c.sessions = allSessions.filter((s) => c.types.includes(s.type) && (s.run || s.missed)); c.done = c.sessions.filter((s) => s.run); });
const cmpItem = (c, s, prev) => `<div class="cmp-item ${s.run ? '' : 'missed'}">
<div class="cmp-top"><span class="cmp-wk tnum">S${weekNo.get(s)}</span><span class="cmp-what"><b>${esc(s.title)}</b><span>${esc(fmtDate(s.run ? s.run._date : s.date))}</span></span>${s.score ? ring(s.score.total) : '<span class="cmp-miss">non réalisée</span>'}</div>
${s.run ? `<div class="cmp-metrics">${c.metrics(s, prev).map(([l, v, d]) => `<div class="cm"><span class="cm-l">${l}</span><span class="cm-v tnum">${v}</span>${d || ''}</div>`).join('')}</div>` : ''}</div>`;
const cmpGroup = (c, list) => { let prev = null; const out = list.map((s) => { const h = cmpItem(c, s, prev); if (s.run) prev = s; return h; }); return out.reverse().join(''); };
const cmpPanel = (k, active) => { const c = CMP[k], groups = [...new Set(c.sessions.map(c.family))];
return `<div class="cmp-panel" data-cmp-panel="${k}" ${active ? '' : 'hidden'}>
<p class="cmp-info">${c.info}</p>
${!c.sessions.length ? '<p class="cmp-empty">Aucune séance de ce type depuis le début de la prépa. Elles apparaîtront ici au fil des semaines.</p>' : `
${c.done.length > 1 ? `<div class="cmp-charts">${['a', 'b'].map((x) => `<figure><figcaption>${c[x]}</figcaption><div class="chart xs"><canvas id="cCmp-${k}-${x}"></canvas></div></figure>`).join('')}</div>` : ''}
${groups.map((g) => `${g ? `<h3 class="cmp-group">${g}</h3>` : ''}<div class="cmp-list">${cmpGroup(c, c.sessions.filter((s) => c.family(s) === g))}</div>`).join('')}`}
</div>`; };
const compareHtml = `<section class="card" id="compare" data-tab="data">
<h2>Comparer mes séances</h2><div class="sub">De la plus récente à la plus ancienne · en couleur, l'écart avec la séance précédente du même type</div>
<div class="cmp-tabs" role="tablist">${cmpKeys.map((k, i) => `<button type="button" role="tab" class="cmp-tab ${i ? '' : 'active'}" aria-selected="${!i}" data-cmp="${k}">${CMP[k].label}<span class="tnum">${CMP[k].done.length}</span></button>`).join('')}</div>
${cmpKeys.map((k, i) => cmpPanel(k, !i)).join('')}
</section>`;
const svg = (d, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${d}</svg>`;
const NAV = [
['plan', 'Plan', '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
['data', 'Données', '<path d="M6 20v-8M12 20V4M18 20v-5"/>'],
['today', 'Aujourd\'hui', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'],
['goal', 'Objectif', '<path d="M5 21V4h12l-2 4 2 4H5"/>'],
['recup', 'Récup', '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>']
];
// Month calendar: every planned session on its day (on the day it was run when done)
const calMonths = (() => {
const first = new Date(planStartMon.getFullYear(), planStartMon.getMonth(), 1), last = new Date(raceDate.getFullYear(), raceDate.getMonth(), 1);
const byDay = new Map();
allSessions.forEach((x) => { const k = dayKey(x.run ? x.run._date : x.date); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(x); });
const out = [];
for (let m = new Date(first); m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
const start = monday(m), end = new Date(m.getFullYear(), m.getMonth() + 1, 0);
let cells = '', list = '', lastWk = '';
for (let d = new Date(start); d <= end || d.getDay() !== 1; d = addDays(d, 1)) {
const k = dayKey(d), inM = d.getMonth() === m.getMonth(), list = byDay.get(k) || [];
const isToday = k === dayKey(today), isRace = k === dayKey(raceDate);
cells += `<div class="cal-d${inM ? '' : ' out'}${isToday ? ' today' : ''}${isRace ? ' race' : ''}${d < startOfDay(today) ? ' past' : ''}" data-day="${k}"><span class="cal-n">${d.getDate()}</span>${inM ? list.map((x) => `<button type="button" class="cal-s ${x.run ? 'done' : x.missed ? 'miss' : ''}" style="--c:${typeColor[x.type]}" data-goto="${allSessions.indexOf(x)}"${canMoveCal(x) ? ' draggable="true" data-calmv="1"' : ''} title="${esc(x.title)}"><b>${x.run ? '✓ ' : x.missed ? '✗ ' : ''}<em>${esc(x.type === 'long' ? 'SL' : x.type === 'easy' ? 'Footing' : x.type === 'race' ? 'Course' : x.type === 'test' ? 'Test' : 'Qualité')}</em></b><span class="tnum">${fmt0(x.run ? km(x.run.distance) : x.km)} km</span></button>`).join('') : ''}</div>`;
}
allSessions.filter((x) => { const d = x.run ? x.run._date : x.date; return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear(); })
.sort((a, b) => (a.run ? a.run._date : a.date) - (b.run ? b.run._date : b.date)).forEach((x) => {
const d = x.run ? x.run._date : x.date, wk = dayKey(monday(d));
if (wk !== lastWk) { const wi = plan.weeks.find((w) => dayKey(w.monday) === wk); list += `<div class="cal-sep"><span>${wi ? 'Semaine ' + (wi.index + 1) + ' · ' : ''}du ${fmtDM(monday(d))}</span></div>`; lastWk = wk; }
list += `<button type="button" class="cal-row" style="--c:${typeColor[x.type]}" data-goto="${allSessions.indexOf(x)}"><span class="cal-rd tnum">${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span><span class="cal-rt"><b>${esc(x.title)}</b><small>${x.run ? `✓ ${fmt1(km(x.run.distance))} km en ${fmtDur(x.run.duration)}${x.score ? ` · ${x.score.total}/100` : ''}` : x.missed ? '✗ Non réalisée' : `≈ ${fmt1(x.km)} km · ${fmtHM(x.sec)}`}</small></span></button>`;
});
out.push({ m, html: cells, list });
}
return out;
})();
const calCur = Math.max(0, calMonths.findIndex((c) => c.m.getMonth() === today.getMonth() && c.m.getFullYear() === today.getFullYear()));
const calHtml = `<section class="card" id="cal" data-tab="plan">
${calMonths.map((c, i) => `<div class="cal-month" data-mi="${i}" ${i === calCur ? '' : 'hidden'}>
<div class="cal-head"><button type="button" class="icon-btn" data-calgo="${i - 1}" ${i ? '' : 'disabled'} aria-label="Mois précédent">‹</button><h2>${c.m.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2><button type="button" class="icon-btn" data-calgo="${i + 1}" ${i < calMonths.length - 1 ? '' : 'disabled'} aria-label="Mois suivant">›</button></div>
<div class="cal-grid"><span class="cal-wd">L</span><span class="cal-wd">M</span><span class="cal-wd">M</span><span class="cal-wd">J</span><span class="cal-wd">V</span><span class="cal-wd">S</span><span class="cal-wd">D</span>${c.html}</div>
<div class="cal-list">${c.list || '<p class="note">Aucune séance ce mois-ci.</p>'}</div>
</div>`).join('')}
<div class="legend">${['easy', 'quality', 'long', 'test'].map((t) => `<span><span class="sw" style="background:${typeColor[t]}"></span>${typeLabel[t]}</span>`).join('')}<span>✓ faite · ✗ manquée</span></div>
<div class="cal-pick" hidden><span></span><button type="button" class="btn sm" data-calcancel>Annuler</button></div>
<div class="mv-out cal-out" hidden></div>
<p class="note">Touche une séance pour voir son détail. Pour la déplacer : appui long sur iPhone (ou ctrl-clic, ou glisser-déposer sur ordinateur), puis touche le nouveau jour.</p>
</section>`;
// ===== 6. Construction de la page =====
const ffShow = ff.slice(-Math.min(ff.length, Math.max(56, Math.round((today - planStartMon) / DAY) + 28)));
const ffLast = ff[ff.length - 1], ffPrev = ff[ff.length - 8];
const ffState = !ffLast ? null : ffLast.tsb > 5 ? ['Frais', 'Tu es reposé : bon moment pour une séance clé ou une course.']
: ffLast.tsb >= -10 ? ['Équilibré', 'La charge et la récupération s\'équilibrent.']
: ffLast.tsb >= -30 ? ['En charge', 'Fatigue normale en pleine prépa : c\'est elle qui fait progresser.'] : ['Très chargé', 'Grosse fatigue accumulée : soigne le sommeil et garde les footings vraiment faciles.'];
const ffHtml = ff.length < 21 ? '' : `<div class="card span-12" id="ffCard"><h2>Forme, fatigue et fraîcheur</h2><div class="sub">Calculé sur ta charge Garmin, tous sports · compte pour 15 % dans l'auto-régulation</div>
<div class="ff-kpis tnum"><span><small>Forme (42 j)</small><b>${fmt0(ffLast.ctl)}</b>${ffPrev ? `<i>${ffLast.ctl - ffPrev.ctl >= 0 ? '+' : '−'}${fmt0(Math.abs(ffLast.ctl - ffPrev.ctl))} en 7 j</i>` : ''}</span><span><small>Fatigue (7 j)</small><b>${fmt0(ffLast.atl)}</b></span><span><small>Fraîcheur</small><b>${ffLast.tsb >= 0 ? '+' : '−'}${fmt0(Math.abs(ffLast.tsb))}</b><i>${ffState[0]}</i></span></div>
<p class="note">${ffState[1]} Le jour de la course, vise une fraîcheur positive (entre +5 et +25) : c'est le rôle de l'affûtage.</p>
<div class="chart"><canvas id="cFf"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('series-1')}"></span>Forme</span><span><span class="sw" style="background:${V('serious')}"></span>Fatigue</span><span><span class="sw" style="background:${V('series-3')}"></span>Fraîcheur</span></div></div>`;
// ===== Records : automatiques (Garmin) ou notés à la main =====
const REC = [['1k', '1 km', 1000], ['5k', '5 km', 5000], ['10k', '10 km', 10000], ['half', 'Semi', 21097.5], ['mara', 'Marathon', 42195]];
let recUser = {}; try { recUser = JSON.parse(localStorage.getItem('records') || '{}') || {}; } catch (e) { /* nothing saved */ }
const splitKey = { '1k': ['fastestSplit_1000'], '5k': ['fastestSplit_5000'], '10k': ['fastestSplit_10000'], half: ['fastestSplit_21097', 'fastestSplit_21098'], mara: ['fastestSplit_42195'] };
const recAuto = (k, m) => { let best = null;
runs.forEach((r) => { let t = null;
splitKey[k].forEach((f) => { if (r[f] > 0) t = r[f]; });
if (t == null && r.distance >= m * 0.99 && r.distance <= m * 1.06) t = r.duration * (m / r.distance);
if (t != null && (!best || t < best.t)) best = { t, d: r._date }; });
return best; };
const recRows = REC.map(([k, l, m]) => { const a = recAuto(k, m), u = recUser[k] ? { t: parseTime(recUser[k].t), d: new Date(recUser[k].d + 'T00:00:00'), own: true } : null;
const b = a && u ? (u.t <= a.t ? u : a) : a || u; return b ? { k, l, m, ...b } : null; }).filter(Boolean);
const wkAll = new Map(); runs.forEach((r) => { const k = dayKey(monday(r._date)); wkAll.set(k, (wkAll.get(k) || 0) + km(r.distance)); });
const recLong = runs.reduce((b, r) => (!b || r.distance > b.distance ? r : b), null);
const bigWeek = [...wkAll.entries()].reduce((b, e) => (!b || e[1] > b[1] ? e : b), null);
const recHtml = `<details class="card records" data-tab="goal"><summary><h2>Mes records</h2><span class="sub">${recRows.length ? `${recRows.length} distance${recRows.length > 1 ? 's' : ''}` : 'aucun pour l\'instant'} · toucher pour voir</span></summary>
<div class="rec-list">${recRows.map((r) => `<div class="rec"><span class="rec-k">${r.l}</span><b class="tnum">${fmtDur(r.t)}</b><span class="tnum note">${fmtPace(r.t / (r.m / 1000))}/km · ${fmtDate(r.d)}${r.own ? ' · noté à la main' : ''}</span>${r.own ? `<button type="button" class="rec-x" data-recdel="${r.k}" aria-label="Supprimer le record ${r.l}">×</button>` : ''}</div>`).join('')}
${recLong ? `<div class="rec"><span class="rec-k">Plus longue sortie</span><b class="tnum">${fmt1(km(recLong.distance))} km</b><span class="note">${fmtDate(recLong._date)}</span></div>` : ''}
${bigWeek ? `<div class="rec"><span class="rec-k">Plus grosse semaine</span><b class="tnum">${fmt0(bigWeek[1])} km</b><span class="note">semaine du ${fmtDate(new Date(bigWeek[0] + 'T00:00:00'))}</span></div>` : ''}</div>
<p class="note">Automatique : meilleure sortie de la bonne distance (ou meilleur passage si Garmin le donne). Un record fait ailleurs, en course officielle ? Note-le :</p>
<form class="gp-add" id="recForm"><select name="k" aria-label="Distance">${REC.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input type="text" name="t" placeholder="0:45:30" autocomplete="off" aria-label="Temps (h:mm:ss)" required><input type="date" name="d" value="${dayKey(today)}" aria-label="Date"><button type="submit" class="btn">Noter</button><span class="note rec-msg"></span></form></details>`;
app.innerHTML = `
<header class="topbar"><div class="top-in">
<a class="brand" href="#today" data-nav="today"><span class="logo">42</span><span class="brand-t">Prépa Marathon</span><span class="dday tnum">J-${daysLeft}</span></a>
<nav class="nav" aria-label="Sections de la page">${NAV.map(([id, l, d]) => `<a href="#${id}" data-nav="${id}" class="${id === 'today' ? 'on' : ''}">${svg(d)}<span>${l}</span></a>`).join('')}</nav>
<div class="top-act">
<span class="sync ${stale ? 'stale' : ''}" title="Dernière synchro Garmin : ${fetchedTxt}"><i></i><span>Synchro ${ago(ageMs)}</span></span>
<button type="button" class="icon-btn" id="syncBtn" aria-label="Synchroniser maintenant mes données Garmin" title="Synchroniser maintenant">${svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>', 'i-sync')}</button>
<button type="button" class="icon-btn" id="themeBtn" aria-label="Passer du mode nuit au mode jour, ou l'inverse" title="Mode jour / nuit">${
svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 'i-sun')}${
svg('<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7 7 0 0 0 10 10z"/>', 'i-moon')}</button>
</div>
</div></header>
<main class="wrap">
${stale ? `<div class="banner" data-tab="today"><b>Synchro en retard.</b> Les dernières données Garmin datent d'${ago(ageMs)}, alors que la mise à jour passe chaque jour à 9 h et 20 h. Appuie sur le bouton de synchro en haut. Si ça dure, regarde l'onglet Actions de ton dépôt GitHub.</div>` : ''}
<section class="card today" id="today" data-tab="today">
<div>
<div class="eyebrow">Aujourd'hui · ${today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
<h1 class="today-title">${todayCard.title}</h1>
<p class="today-sub">${todayCard.sub}</p>
${upcoming ? `<p class="today-next">Ensuite : <b>${esc(upcoming.title)}</b> · ${upcoming.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })} (${inDays(upcoming.date)})</p>` : ''}
${todayCard.btn}
${homeWeek}
</div>
<div class="ready lv${readyLv}">
<div class="ready-head"><span class="light" aria-hidden="true">${['?', '✓', '!', '!!'][readyLv + 1]}</span><div><b>Forme du jour · ${readyTitle}</b><span>${readyAdvice}</span></div></div>
${signals.length ? `<div class="sigs">${signals.map((x) => `<span class="sig lv${x.lv}"><i>${x.lv ? '!' : '✓'}</i><span>${x.k} <b class="tnum">${esc(x.v)}</b>${x.n ? ` · ${x.n}` : ''}</span></span>`).join('')}</div>` : ''}
</div>
</section>
<section class="card" data-tab="today">
<div class="coach-head"><h2>Les conseils du coach</h2></div>
${reminder}
<div class="coach-tips">
${tipBlock('Semaine passée', pastTips.slice(0, 3), V('t-easy'))}
${tipBlock('Cette semaine', weekTips, V('accent'))}
${tipBlock('Tendance 4 semaines', trendTips, V('series-7'))}
</div>
${[pastTips.slice(0, 3), weekTips, trendTips].some((l) => l.length > 1) ? `<details class="tip-more"><summary>Voir les autres conseils</summary><div class="coach-tips">${tipRest('Semaine passée', pastTips.slice(0, 3))}${tipRest('Cette semaine', weekTips)}${tipRest('Tendance 4 semaines', trendTips)}</div></details>` : ''}
</section>
<h1 class="tab-title" data-tab="plan">Plan d'entraînement</h1>
<section class="card" id="week" data-tab="plan">
<div class="plan-top">
<div><h2>Cette semaine · du ${curWeek.monday.getDate()} au ${curEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</h2>
<div class="sub">Semaine ${curWeek.index + 1} sur ${plan.weeks.length} · ${weekFlags(curWeek)} · touche une séance pour voir ses étapes</div></div>
<div class="tnum week-km">${fmt1(curWeek.doneKm)} / ${curWeek.targetKm} km${curWeek.score ? `<span class="week-score">note ${curWeek.score.score}/100</span>` : ''}</div>
</div>
<div class="progress"><span style="width:${Math.min(100, (curWeek.doneKm / Math.max(1, curWeek.targetKm)) * 100)}%"></span></div>
${regulHtml}
<div class="sessions">${curWeek.sessions.map((s) => sessionCard(s)).join('')}</div>
${curWeek.removed && curWeek.removed.length ? `<div class="mv-removed">${curWeek.removed.map((s) => `<span>Supprimée : <b>${esc(s.title)}</b> (${s.origDate.toLocaleDateString('fr-FR', { weekday: 'long' })})</span><button type="button" class="btn sm" data-mvundo="${esc(moveKey(s))}">Rétablir</button>`).join('')}</div>` : ''}
<div class="pace-strip tnum"><span class="ps-k">Tes allures</span>${[
['Footing', hrEasy ? `${hrEasy.lo}-${hrEasy.hi} bpm` : `${fmtPace(R2.easy.fast)}-${fmtPace(R2.easy.slow)}`],
['Endurance active', `${fmtPace(R2.long.fast)}-${fmtPace(R2.long.slow)}`], ['Soutenue', `${fmtPace(R2.sout.fast)}-${fmtPace(R2.sout.slow)}`],
['Marathon', `${fmtPace(R2.mp.fast)}-${fmtPace(R2.mp.slow)}`], ['Semi', `${fmtPace(R2.half.fast)}-${fmtPace(R2.half.slow)}`],
['Seuil', `${fmtPace(paces.threshold.fast)}-${fmtPace(paces.threshold.slow)}`], ['Fractionné', `${fmtPace(paces.interval.fast)}-${fmtPace(paces.interval.slow)}`],
['VMA', `${fmtPace(paces.vma.fast)}-${fmtPace(paces.vma.slow)}`]].map(([k, v]) => `<span class="ps"><span>${k}</span><b>${v}</b></span>`).join('')}</div>
<details class="howto cal-exp"><summary>Mettre les séances dans le calendrier de l'iPhone</summary>
<ol>
<li>Appuie sur <b>Télécharger le calendrier</b>, puis sur <b>Tout ajouter</b>.</li>
<li>Choisis un calendrier à part, nommé <b>Prépa</b> (Calendrier › Calendriers › Ajouter un calendrier, une seule fois).</li>
<li>Tu as déplacé une séance ? Dans Calendrier › Calendriers, supprime le calendrier <b>Prépa</b> (toutes ses séances partent d'un coup), recrée-le, puis télécharge à nouveau.</li>
</ol>
<button type="button" class="btn primary" id="icsBtn">📅 Télécharger le calendrier</button>
</details>
${canDownload && weekFit.length ? `<details class="howto wk-zip"><summary>Séances de la semaine pour la montre (ordinateur)</summary>
<p class="sub">${weekFit.length} séance${weekFit.length > 1 ? 's' : ''} à venir, déjà ajustée${weekFit.length > 1 ? 's' : ''}. Sans ordinateur ni câble, utilise plutôt le tuto juste en dessous.</p>
<button type="button" class="btn primary" id="zipBtn">⌚ Séances de la semaine (.zip)</button>
<ol>
<li>Sur l'ordinateur, ouvre le .zip.</li>
<li>Branche la montre en USB (adaptateur USB-C vers USB-A si besoin). Sur Mac, il faut souvent l'app gratuite <b>OpenMTP</b> pour voir la montre.</li>
<li>Copie les fichiers dans <b>GARMIN › NewFiles</b>, puis débranche la montre.</li>
<li>Sur la montre : <b>Course à pied › Entraînements</b>.</li>
</ol>
<p class="sub">Ça ne marche pas ? Redémarre la montre, ou copie les fichiers dans <b>GARMIN › Workouts</b> à la place.</p>
</details>` : ''}
<details class="howto watch-tuto"><summary>⌚ Mettre une séance sur ma montre depuis le téléphone</summary>
<p class="sub">Tout se fait dans l'app Garmin Connect, la montre reçoit la séance par Bluetooth. Garde la séance ouverte ici pour recopier les étapes.</p>
<div class="gt-steps">
    <figure class="gt-st"><div class="gt-shot"><img src="tuto-img/g1-accueil.jpg" alt="" loading="lazy" decoding="async"><i class="gt-tap" style="left:90%;top:88%"></i></div>
      <figcaption><b>1.</b> Ouvre l'app <b>Garmin Connect</b>. Touche <b>Plus</b>, en bas à droite.</figcaption></figure>
    <figure class="gt-st"><div class="gt-shot"><img src="tuto-img/g2-plus.jpg" alt="" loading="lazy" decoding="async"><i class="gt-tap" style="left:40%;top:70%"></i></div>
      <figcaption><b>2.</b> Touche <b>Entraînement et planification</b>.</figcaption></figure>
    <figure class="gt-st"><div class="gt-shot"><img src="tuto-img/g3-planif.jpg" alt="" loading="lazy" decoding="async"><i class="gt-tap" style="left:25%;top:22%"></i></div>
      <figcaption><b>3.</b> Touche <b>Entraînements</b>.</figcaption></figure>
    <figure class="gt-st"><div class="gt-shot"><img src="tuto-img/g4-entrainements.jpg" alt="" loading="lazy" decoding="async"><i class="gt-tap" style="left:94%;top:48%"></i></div>
      <figcaption><b>4.</b> Touche <b>Créer un entraînement</b> (le +).</figcaption></figure>
    <figure class="gt-st"><div class="gt-shot"><img src="tuto-img/g5-activite.jpg" alt="" loading="lazy" decoding="async"><i class="gt-tap" style="left:25%;top:54%"></i></div>
      <figcaption><b>5.</b> Choisis <b>Course à pied</b>.</figcaption></figure>
    <figure class="gt-st"><div class="gt-shot"><img src="tuto-img/g6-editeur.jpg" alt="" loading="lazy" decoding="async"><i class="gt-tap" style="left:22%;top:50%"></i></div>
      <figcaption><b>6.</b> Garmin a déjà mis 3 étapes. Touche une étape pour régler sa <b>durée</b> (par défaut « Appui sur touche Lap » : mets plutôt 15 min) et sa <b>cible</b> : choisis <b>Allure</b> et recopie la fourchette affichée dans Prépa.</figcaption></figure>
    <figure class="gt-st"><div class="gt-shot"><img src="tuto-img/g6-editeur.jpg" alt="" loading="lazy" decoding="async"><i class="gt-tap" style="left:74%;top:93%"></i></div>
      <figcaption><b>7.</b> Pour un fractionné, touche <b>Ajouter répét.</b> Mets dedans l'effort (8 min) et la récup (2 min), puis le nombre de fois (3). <b>Ajouter étape</b> sert pour une étape simple en plus.</figcaption></figure>
    <figure class="gt-st"><div class="gt-shot"><img src="tuto-img/g6-editeur.jpg" alt="" loading="lazy" decoding="async"><i class="gt-tap" style="left:86%;top:8%"></i></div>
      <figcaption><b>8.</b> Touche <b>Enregistrer</b>, en haut à droite, et donne le nom de la séance (par exemple « Seuil 3 × 8 min »).</figcaption></figure>
    <figure class="gt-st"><div class="gt-ph"><div class="gt-ph-top">Seuil 3 × 8 min <span class="gt-ph-ic">⤴</span></div><div class="gt-ph-body"><div class="gt-ph-step">Échauffement<small>15:00</small></div><div class="gt-ph-step r">Course à pied<small>3 × 8:00</small></div><div class="gt-ph-sheet"><b>Envoyer vers l'appareil</b><span class="gt-ph-row">⌚ Ma montre</span></div></div><i class="gt-tap" style="left:88%;top:4%"></i><span class="gt-dessin">Dessin</span></div>
      <figcaption><b>9.</b> Ouvre la séance enregistrée, touche l'<b>icône d'envoi</b> en haut à droite, puis choisis ta montre. Elle la reçoit à la prochaine synchro.</figcaption></figure>
    <figure class="gt-st"><div class="gt-wt"><div class="gt-wt-face"><span class="gt-wt-k">Entraînements</span><b>Seuil 3 × 8 min</b><span class="gt-wt-o">Faire l'entraînement</span></div><span class="gt-wt-b up">MENU</span><span class="gt-wt-b st">START</span></div>
      <figcaption><b>10.</b> Sur la montre : <b>START</b>, choisis <b>Course</b>, maintiens <b>MENU</b>, puis <b>Entraînement › Entraînements</b> › ta séance › <b>Faire l'entraînement</b>. Appuie sur <b>START</b> pour partir : la montre te guide étape par étape.</figcaption></figure>
  </div>
  <details class="gt-q"><summary>Ça ne marche pas ?</summary><div class="gt-exp">
    <span><b>La séance n'arrive pas sur la montre</b> : ouvre l'app Garmin Connect, la montre près de toi, et attends la synchro (ou tire l'écran vers le bas pour la forcer).</span>
    <span><b>Les noms ne sont pas exactement les mêmes</b> : ils changent un peu selon la version de l'app et le modèle de montre. Sur certaines montres, le menu s'appelle <b>Mes entraînements</b>.</span>
    <span><b>Le bouton s'appelle autrement</b> : sur certaines montres, c'est <b>GPS</b> au lieu de START.</span>
  </div></details>
</details>
</section>
<h1 class="tab-title" data-tab="data">Données d'entraînement</h1>
<section class="kpis6" data-tab="data">
<div class="tile"><div class="k">Assiduité depuis le début</div><div class="v tnum">${due.length ? dueDone : '–'}<small>${due.length ? `/ ${due.length} séance${due.length > 1 ? 's' : ''}` : ''}</small></div><div class="progress"><span style="width:${due.length ? Math.round((dueDone / due.length) * 100) : 0}%"></span></div></div>
<div class="tile"><div class="k">Volume moyen (4 sem.)</div><div class="v tnum">${fmt1(km28avg)}<small>km/sem</small></div><div class="s">Prévu cette semaine : ${curWeek.targetKm} km</div></div>
<div class="tile"><div class="k">Plus longue sortie (28 j)</div><div class="v tnum">${fmt1(long28)}<small>/ ${plan.maxLongKm} km</small></div><div class="progress"><span style="width:${Math.min(100, (long28 / plan.maxLongKm) * 100)}%"></span></div></div>
<div class="tile"><div class="k">Temps en zones 1-2 (28 j)</div><div class="v tnum">${isFinite(easyShare) ? Math.round(easyShare * 100) : '–'}<small>%</small></div><div class="s">Cible : environ ${Math.round(EASY_TARGET * 100)} % (3 sorties/sem.)</div></div>
<div class="tile"><div class="k">Charge aiguë / chronique</div><div class="v tnum">${isFinite(acr) ? acr.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '–'}</div>${statusHtml(acrStatus)}
<details class="whatis"><summary>C'est quoi ?</summary><div><p><b>Aiguë</b> : ta charge Garmin moyenne des 7 derniers jours. <b>Chronique</b> : celle des 28 derniers jours. Le ratio compare les deux : 1,0 = tu fais autant que d'habitude.</p><p>Repères proposés par Gabbett (2016) : 0,8 à 1,3 = progression régulière, 1,5 et plus = hausse trop brutale. Ils viennent du cricket, du rugby et du football australien ; l'auteur appelle à la prudence pour les sports individuels.</p><p>Le ratio est aujourd'hui contesté : Impellizzeri et coll. (2021) montrent qu'il ne prédit pas mieux les blessures que la charge de la semaine seule. Sers-t'en comme repère de progression, pas comme prédiction de blessure.</p><p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4789704/" target="_blank" rel="noopener">Gabbett 2016, Br J Sports Med</a> · <a href="https://doi.org/10.1007/s40279-020-01378-6" target="_blank" rel="noopener">Impellizzeri et coll. 2021, Sports Medicine</a></p></div></details></div>
<div class="tile"><div class="k">Prochain jalon</div>${miles[0] ? `<div class="v tnum">J-${Math.round((miles[0].date - today) / DAY)}</div><div class="s">${esc(miles[0].label)} · ${fmtDate(miles[0].date)}</div>` : '<div class="v">–</div>'}</div>
</section>
${compareHtml}
${calHtml}
<section class="card" id="plan" data-tab="plan">
<h2>Plan complet jusqu'au marathon</h2>
<div class="sub">${plan.weeks.length} semaines · 3 séances par semaine · ouvre une semaine pour voir ses séances</div>
<div class="miles">${miles.map((m) => `<span class="mile"><b>${esc(m.label)}</b><span class="tnum">${dayMon(m.date)} · J-${Math.round((m.date - today) / DAY)}</span></span>`).join('')}</div>
<div class="tl-bar">${tlSegs}<div class="tl-today ${pct(today) < 12 ? 'at-start' : pct(today) > 88 ? 'at-end' : ''}" style="left:calc(${pct(today)}% - 1px)"></div></div>
<div class="tl-dates"><span>${fmtDM(tlStart)}</span><span>Course : ${fmtDM(raceDate)}</span></div>
<div class="phase-advice">${current.advice}</div>
<div class="chart sm"><canvas id="cPlan"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('neutral')}"></span>Prévu</span><span><span class="sw" style="background:${V('accent')}"></span>Réalisé</span></div>
${R.distanceKm > 21.0975 ? `<details class="raceplan"><summary>Mon plan de course pour le jour J</summary>
<p>Départ prudent : les 5 premiers kilomètres à ${fmtPace(racePlan.slow)}/km, puis ${fmtPace(racePlan.rest)}/km jusqu'à l'arrivée. Tes temps de passage pour finir en ${goalTxt} :</p>
<div class="splits tnum">${racePlan.rows.map((r) => `<div class="split"><span>${r.l}</span><b>${fmtDur(r.t)}</b></div>`).join('')}</div>
<p class="note">Un gel toutes les 40 min dès la 40e minute, et de l'eau à chaque ravitaillement. Ces temps seront à confirmer après ton test semi-marathon.</p>
</details>` : ''}
<div class="wk-list">${planListHtml()}</div>
<p class="note">Le plan s'ajuste à ce que tu cours vraiment. Les allures suivent ton seuil, mesuré sur tes séances des 12 dernières semaines. Une séance compte même si tu la changes de jour dans la semaine. Une semaine terminée avec moins de 2 sorties fait répéter la semaine suivante au lieu de l'allonger. La sortie longue est plafonnée à 3 h 15 d'effort, soit ${plan.maxLongKm} km à ton allure actuelle.</p>
</section>
<h1 class="tab-title" data-tab="goal">Objectif et prédictions</h1>
<section class="hero" id="stats" data-tab="goal">
<div class="card">
<div class="eyebrow">Objectif</div>
<h2 class="hero-title">${esc(R.name)} · ${raceDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
<div class="hero-sub">${R.distanceKm.toLocaleString('fr-FR')} km en ${goalTxt}</div>
<div class="countdown">
<div><div class="v tnum">${daysLeft}</div><div class="l">jours restants</div></div>
<div><div class="v tnum">${weeksLeft}</div><div class="l">semaines</div></div>
<div><div class="v tnum">${fmtPace(targetPace)}</div><div class="l">allure cible /km</div></div>
</div>
<div class="phase-pill">Phase actuelle : <b>${current.name}</b> · semaine ${curWeek.index + 1} sur ${plan.weeks.length}</div>
<div class="progress" title="Avancement de la préparation"><span style="width:${pct(today).toFixed(1)}%"></span></div>
</div>
<div class="card hero-goal">
<div class="goal-row"><span class="k">Temps visé</span><span class="v tnum">${fmtDur(targetSec)}</span></div>
<div class="goal-row"><span class="k">Prédiction Garmin<br><span class="note">${garminPred ? (garminPredDate ? 'relevée le ' + fmtDate(garminPredDate) : 'saisie dans config.js') : 'non fournie par l\'API'}</span></span>
<span class="r"><span class="v tnum">${garminPred ? fmtDur(garminPred) : '–'}</span><br>
${garminPred ? deltaHtml(garminPred - targetSec) : '<span class="note">À renseigner dans config.js</span>'}</span></div>
${gpHist.length ? `<div class="gp-hist" aria-label="Suivi de la prédiction Garmin">${gpHist.slice(-6).map((p, i, a) => { const prev = i ? a[i - 1].t : (gpHist.length > a.length ? gpHist[gpHist.length - a.length - 1].t : null); const g = prev != null ? prev - p.t : null;
return `<span class="gp"><span>${fmtDM(p.d)}</span><b class="tnum">${fmtDur(p.t)}</b>${g == null ? '<i>1er relevé</i>' : `<i class="${g >= 0 ? 'ok' : 'ko'}">${Math.abs(g) < 5 ? 'stable' : `${g > 0 ? '−' : '+'}${fmtDur(Math.abs(g))}`}</i>`}</span>`; }).join('')}</div>
` : ''}
<form class="gp-add" id="gpForm"><span class="k">Prédiction du jour</span><input type="date" name="d" value="${dayKey(today)}" aria-label="Date du relevé"><input type="text" name="t" placeholder="4:14:54" autocomplete="off" autocapitalize="off" aria-label="Temps prédit (h:mm:ss)" required><button type="submit" class="btn primary">Ajouter</button><span class="note gp-msg">Enregistré sur ce téléphone. Même date = valeur remplacée.</span></form>
${semiHtml}
${thr ? `<div class="goal-row"><span class="k">Potentiel d'après ton seuil<br><span class="note">seuil ${fmtPace(thr.fast)}-${fmtPace(thr.slow)}/km à ${fmt0(thrRef.hr)} bpm</span></span>
<span class="r"><span class="v tnum">${fmtDur(thrPotential)}</span><br>${deltaHtml(thrPotential - targetSec)}</span></div>`
: `<div class="goal-row"><span class="k">Estimation Riegel<br><span class="note">${best ? `${fmt1(km(best.distance))} km en ${fmtDur(best.duration)}, ${fmtDate(best._date)}` : 'pas de sortie ≥ 10 km'}</span></span>
<span class="r"><span class="v tnum">${isFinite(predSec) ? fmtDur(predSec) : '–'}</span><br>${isFinite(predSec) ? deltaHtml(predDelta) : ''}</span></div>`}
<div class="note">${!thr ? `Pour ${goalTxt}, il faut valoir environ ${fmtDur(goal10)} sur 10 km.`
: thrPotential <= targetSec ? `Ta vitesse est déjà celle d'un marathon en ${goalTxt}. Ce qu'il reste à construire, c'est l'endurance pour la tenir 42 km.`
: `Ta vitesse au seuil vaut aujourd'hui un marathon en ${fmtDur(thrPotential)}. Il reste de la vitesse à gagner, puis l'endurance pour la tenir 42 km.`}</div>
</div>
</section>
<section class="grid" data-tab="data">
<div class="card span-8"><h2>Volume de course par semaine</h2><div class="sub">Depuis le début de la prépa · km</div><div class="chart"><canvas id="cKm"></canvas></div></div>
<div class="card span-4"><h2>Zones cardiaques · 28 jours</h2><div class="sub">Temps passé en course</div>
<div class="zones">${zoneSec.map((s, i) => `<div style="flex:${s || 0} 0 0;background:${zoneColors[i]}" title="${zoneNames[i]} : ${zoneTotal ? Math.round((s / zoneTotal) * 100) : 0} %"></div>`).join('')}</div>
<div class="zone-list">${zoneSec.map((s, i) => `<div class="z"><span><span class="sw" style="background:${zoneColors[i]}"></span>${zoneNames[i]}</span><span class="tnum t">${fmtHM(s)}</span><b class="tnum">${zoneTotal ? Math.round((s / zoneTotal) * 100) : 0} %</b></div>`).join('')}</div>
</div>
<div class="card span-6"><h2>Sortie longue par semaine</h2><div class="sub">Plus longue course de chaque semaine · km</div><div class="chart"><canvas id="cLong"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('series-7')}"></span>Sortie longue</span><span><span class="ln"></span>Plus longue sortie du plan (${plan.maxLongKm} km)</span></div></div>
<div class="card span-6"><h2>Allure des sorties</h2><div class="sub">Depuis le début de la prépa · min/km (plus haut = plus rapide) · hors sorties à fort dénivelé</div><div class="chart"><canvas id="cPace"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('series-1')}"></span>Allure moyenne de la sortie</span><span><span class="ln"></span>Allure marathon (${fmtPace(targetPace)})</span></div></div>
${hasPot ? `<div class="card span-6"><h2>Ton potentiel marathon</h2><div class="sub">D'après ta meilleure séance au seuil des 12 semaines précédentes · plus haut = plus rapide</div><div class="chart sm"><canvas id="cPot"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('series-1')}"></span>Potentiel</span><span><span class="ln"></span>Objectif (${goalTxt})</span></div></div>` : ''}
<div class="card ${hasPot ? 'span-6' : 'span-12'}"><h2>Charge d'entraînement par semaine</h2><div class="sub">Tous sports confondus · charge Garmin</div><div class="chart sm"><canvas id="cLoad"></canvas></div></div>
${ffHtml}
</section>
<section class="card" id="gpCard" data-tab="goal"><h2>Prédiction Garmin au fil du temps</h2><div class="sub">Temps marathon prédit par ta montre · plus haut = plus rapide</div>
${gpHist.length >= 2 ? `<div class="chart sm"><canvas id="cGp"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('series-7')}"></span>Prédiction Garmin</span><span><span class="ln"></span>Objectif (${goalTxt})</span></div>
<p class="note">Depuis le ${fmtDate(gpHist[0].d)} : ${(() => { const g = gpHist[0].t - gpLast.t; return Math.abs(g) < 30 ? 'stable' : `${g > 0 ? 'gagné' : 'perdu'} ${fmtDur(Math.abs(g))}`; })()} · dernière : ${fmtDur(gpLast.t)}, ${deltaHtml(gpLast.t - targetSec)}</p>`
: `<p class="note">${gpHist.length ? `Une seule valeur pour l'instant (${fmtDur(gpHist[0].t)} le ${fmtDate(gpHist[0].d)}). La courbe apparaît dès la 2e.` : 'Aucune prédiction saisie.'} Ajoute ta prédiction dans la case « Prédiction du jour » à chaque relevé.</p>`}</section>
<section class="card" id="course" data-tab="goal"></section>
${recHtml}
<h1 class="tab-title" data-tab="recup">Récupération</h1>
<details class="card recovery" id="recovery" data-tab="recup" open>
<summary><b>Récupération</b><span class="tnum">VFC ${latestHrv?.lastNightAvg ?? '–'} ms · FC repos ${isFinite(rhr7) ? fmt0(rhr7) : '–'} bpm · Sommeil ${isFinite(sleep7) ? fmt1(sleep7) : '–'} h${isFinite(score7) ? ` (score ${fmt0(score7)})` : ''}</span></summary>
<div class="grid">
<div class="card span-4"><h2>VFC nocturne</h2><div class="rec-v tnum">${latestHrv?.lastNightAvg ?? '–'}<small>ms la nuit dernière</small></div>
<details class="whatis"><summary>C'est quoi ?</summary><div><p>L'intervalle entre deux battements n'est jamais tout à fait le même. La VFC mesure cette variation pendant la nuit : elle reflète la récupération de ton système nerveux.</p><p>Pour l'entraînement : elle bouge beaucoup d'un jour à l'autre, c'est normal. Ce qui compte, c'est la tendance sur plusieurs jours par rapport à ta propre plage. Une baisse qui dure, avec une FC repos qui monte, va souvent avec de la fatigue accumulée (sauf en affûtage).</p><p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3936188/" target="_blank" rel="noopener">Buchheit 2014, Frontiers in Physiology</a></p></div></details><div class="sub">60 jours · ms</div><div class="chart sm"><canvas id="cHrv"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('series-7')}"></span>VFC</span><span><span class="sw" style="background:${V('band')}"></span>Plage normale</span></div></div>
<div class="card span-4"><h2>FC au repos</h2><div class="rec-v tnum">${isFinite(rhr7) ? fmt0(rhr7) : '–'}<small>bpm, moyenne 7 jours</small></div>
<details class="whatis"><summary>C'est quoi ?</summary><div><p>Ton cœur au calme, mesuré la nuit par la montre.</p><p>Pour l'entraînement : seule, elle est moins sensible que la VFC et varie d'un jour à l'autre, donc on regarde sa moyenne sur 7 jours. Une hausse durable, surtout avec une VFC en baisse, va souvent avec de la fatigue. Elle compte pour 10 % dans la note d'adaptation du plan.</p><p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3936188/" target="_blank" rel="noopener">Buchheit 2014, Frontiers in Physiology</a></p></div></details><div class="sub">60 jours · bpm · axe inversé : plus haut = mieux</div><div class="chart sm"><canvas id="cRhr"></canvas></div></div>
<div class="card span-4"><h2>Sommeil</h2><div class="rec-v tnum">${isFinite(sleepThisWk) ? fmt1(sleepThisWk) : isFinite(sleep7) ? fmt1(sleep7) : '–'}<small>h par nuit${isFinite(sleepThisWk) ? ' cette semaine' : ', moyenne 7 jours'}${isFinite(scoreThisWk) ? ` · score ${fmt0(scoreThisWk)}` : isFinite(score7) ? ` · score ${fmt0(score7)}` : ''}</small></div><div class="sub">3 semaines passées (moyenne par nuit), puis chaque nuit de cette semaine</div><div class="chart sm"><canvas id="cSleep"></canvas></div>
<div class="legend">${PHASES.map(([, l, c]) => `<span><span class="sw" style="background:${V(c)}"></span>${l === 'Éveillé' ? 'Éveil' : l}</span>`).join('')}${slRest.some((v) => v != null) ? `<span><span class="sw" style="background:${V('axis')}"></span>Sans détail</span>` : ''}</div></div>
</div>
</details>
<footer data-tab="all"><span>Données Garmin du ${fetchedTxt}${(D.errors || []).length ? ' · ' + D.errors.length + ' source(s) en erreur' : ''}</span><span>Mise à jour automatique à 9 h et 20 h, ou avec le bouton de synchro</span></footer>
</main>`;
setTimeout(() => app.classList.add('settled'), 1500); // ends the entrance animations for good (see styles.css)
const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
let charts = [], C = null, anim = false, activeCmp = cmpKeys[0];
const drawn = new Set(); // lazily drawn groups: one per compare tab, plus 'recovery'
// Km écrits à la verticale dans chaque barre (sorties longues).
const cssColor = (n) => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
const barKm = { id: 'barKm', afterDatasetsDraw(ch) { const { ctx } = ch; ch.getDatasetMeta(0).data.forEach((b, i) => { const v = ch.data.datasets[0].data[i]; if (v == null) return;
const h = Math.abs(b.base - b.y), t = `${fmt1(v)} km`; ctx.save(); ctx.font = '600 11px system-ui, sans-serif'; const w = ctx.measureText(t).width;
const inside = h > w + 8; ctx.translate(b.x, inside ? b.base - 5 : b.y - 5); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = inside ? '#fff' : C.muted; ctx.fillText(t, 0, 0); ctx.restore(); }); } };
const mk = (id, cfg) => { const el = document.getElementById(id); if (!el) return;
cfg.options = { animation: anim ? { duration: 500 } : false, ...cfg.options }; charts.push(new Chart(el, cfg)); };
const scaleX = () => ({ grid: { display: false }, border: { color: C.axis }, ticks: { color: C.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 } });
const scaleY = (extra = {}) => ({ grid: { color: C.grid }, border: { display: false }, ticks: { color: C.muted, maxTicksLimit: 5 }, ...extra });
const paceY = () => scaleY({ reverse: true, ticks: { color: C.muted, maxTicksLimit: 5, callback: (v) => fmtPace(v) } });
const weekX = () => { const x = scaleX(); x.ticks.callback = (v) => weekLabels[v]; return x; };
const bar = (color) => ({ backgroundColor: color, hoverBackgroundColor: color, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false, maxBarThickness: 22, categoryPercentage: 0.8, barPercentage: 0.9 });
const line = (color) => ({ borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: C.surface, pointBorderWidth: 2, tension: 0.25, spanGaps: true });
const thin = (color) => ({ borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: true, tension: 0.3 });
const refLine = (value, n, label) => ({ type: 'line', label, data: Array(n).fill(value), borderColor: C.muted, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, fill: false });
const hover = { mode: 'index', intersect: false };
const fmtHMin = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)} h ${pad(m % 60)}`; };
const drawCmp = (k) => {
const c = CMP[k], done = c.done;
if (done.length < 2) return;
const labels = done.map((s) => `S${weekNo.get(s)}`);
const title = (it) => { const s = done[it[0].dataIndex]; return `${fmtDate(s.run._date)} · ${s.title}`; };
const cfg = {
quality: { a: done.map((s) => (F(s).work ? F(s).work.pace : null)), b: done.map((s) => (F(s).work ? Math.round(F(s).work.hr) : null)), ya: paceY(), fa: (v) => fmtPace(v) + '/km', fb: (v) => v + ' bpm' },
easy: { a: done.map((s) => paceOf(s.run)), b: done.map((s) => s.run.averageHR || null), ya: paceY(), fa: (v) => fmtPace(v) + '/km', fb: (v) => fmt0(v) + ' bpm' },
long: { a: done.map((s) => Math.round(km(s.run.distance) * 10) / 10), b: done.map((s) => (F(s).drift != null ? Math.max(0, Math.round(F(s).drift * 100)) : null)),
ya: scaleY({ beginAtZero: true }), yb: scaleY({ beginAtZero: true }), fa: (v) => fmt1(v) + ' km', fb: (v) => v + ' %', bar: true }
}[k];
[['a', cfg.a, cfg.ya, cfg.fa, cfg.bar], ['b', cfg.b, cfg.yb || scaleY(), cfg.fb, false]].forEach(([x, data, y, f, isBar]) => mk(`cCmp-${k}-${x}`, {
type: isBar ? 'bar' : 'line',
data: { labels, datasets: [{ label: c[x], data, ...(isBar ? bar(C.s1) : line(C.s1)) }] },
options: { interaction: hover, scales: { x: scaleX(), y },
plugins: { tooltip: { callbacks: { title, label: (i) => ` ${c[x]} : ${i.raw == null ? '–' : f(i.raw)}` } } } },
...(isBar ? { plugins: [barKm] } : {})
}));
};
const drawRecovery = () => {
const d60Labels = days60.map(fmtDM);
mk('cHrv', { type: 'line',
data: { labels: d60Labels, datasets: [
{ label: 'Plage basse', data: hrvLow, borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, fill: false, spanGaps: true },
{ label: 'Plage normale', data: hrvHigh, borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, backgroundColor: C.band, fill: '-1', spanGaps: true },
{ label: 'VFC', data: hrvNight, ...thin(C.s7) }
] },
options: { interaction: hover, scales: { x: scaleX(), y: scaleY() },
plugins: { tooltip: { filter: (i) => i.datasetIndex === 2, callbacks: { label: (c) => { const lo = hrvLow[c.dataIndex], hi = hrvHigh[c.dataIndex]; return ` ${c.raw} ms${lo && hi ? ` (normale ${lo}–${hi})` : ''}`; } } } } } });
mk('cRhr', { type: 'line',
data: { labels: d60Labels, datasets: [{ label: 'FC repos', data: rhr, ...thin(C.serious) }] },
options: { interaction: hover, scales: { x: scaleX(), y: scaleY({ reverse: true }) }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.raw} bpm` } } } } });
mk('cSleep', { type: 'bar',
data: { labels: slCols.map((c) => c.lbl.split(' ')), datasets: [...PHASES.map(([k, l, c]) => ({ label: l === 'Éveillé' ? 'Éveil' : l, data: slCols.map((col) => slVal(col.nights, k)), ...bar(cssColor(c)), borderRadius: 0, maxBarThickness: 18, stack: 's' })),
...(slRest.some((v) => v != null) ? [{ label: 'Sans détail', data: slRest, ...bar(cssColor('axis')), borderRadius: 0, maxBarThickness: 18, stack: 's' }] : [])] },
options: { interaction: hover, scales: { x: { ...scaleX(), stacked: true, ticks: { color: C.muted, autoSkip: false, maxRotation: 0, font: { size: 10 } } }, y: scaleY({ stacked: true, min: 0, ticks: { color: C.muted, stepSize: 2, callback: (v) => v + ' h' } }) },
plugins: { tooltip: { filter: (it) => it.raw != null, callbacks: { title: (it) => { const c = slCols[it[0].dataIndex]; return c.wk ? `${c.lbl} · moyenne de ${c.nights.length} nuit${c.nights.length > 1 ? 's' : ''}` : c.lbl; },
label: (c) => (c.raw == null ? null : ` ${c.dataset.label} ${hm(c.raw)}`),
footer: (it) => { const c = slCols[it[0].dataIndex], t = c.nights.filter((n) => n.sleepTimeSeconds), sc = avg(c.nights.map(sleepScore).filter(Boolean));
return t.length ? `Sommeil ${hm(avg(t.map((n) => n.sleepTimeSeconds / 3600)))}${isFinite(sc) ? ` · score ${fmt0(sc)}` : ''}` : ''; } } } } } });
};
const recoveryEl = document.getElementById('recovery');
if (window.Course) window.Course.mount(document.getElementById('course'), { key: 'course', raceKm: R.distanceKm, raceName: R.name });
const show = (key) => { if (!C || drawn.has(key)) return; drawn.add(key); if (key === 'recovery') drawRecovery(); else drawCmp(key); };
const paceRuns = inLast(prepRuns, 84).filter((r) => !(r.elevationGain > 25 * km(r.distance)));
// ===== 7. Graphiques et interactions (onglets, thème, boutons) =====
const drawCharts = (animate) => {
if (!window.Chart) return;
charts.forEach((c) => c.destroy()); charts = []; drawn.clear();
C = readColors(); anim = animate && !reduce;
Chart.defaults.color = C.text2;
Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.maintainAspectRatio = false;
Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: C.tip, borderColor: C.axis, borderWidth: 1, titleColor: C.text, bodyColor: C.text2, padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 });
mk('cPlan', { type: 'bar',
data: { labels: plan.weeks.map((w) => fmtDM(w.monday)), datasets: [
{ label: 'Prévu', data: plan.weeks.map((w) => w.targetKm), ...bar(C.neutral), maxBarThickness: 14 },
{ label: 'Réalisé', data: plan.weeks.map((w) => (w.index <= curWeek.index ? Math.round(w.doneKm * 10) / 10 : null)), ...bar(C.accent), maxBarThickness: 14 }
] },
options: { interaction: hover, scales: { x: scaleX(), y: scaleY({ beginAtZero: true }) },
plugins: { tooltip: { callbacks: {
title: (it) => { const w = plan.weeks[it[0].dataIndex]; return `S${w.index + 1} · semaine du ${fmtDM(w.monday)} · ${weekFlags(w)}`; },
label: (c) => { const w = plan.weeks[c.dataIndex]; return c.datasetIndex === 1 ? ` Réalisé : ${fmt1(c.raw)} km` : w.weeksToRace === 0 ? ` Prévu : ${c.raw} km dont le marathon` : ` Prévu : ${c.raw} km · sortie longue ${w.longKm} km`; } } } } } });
mk('cKm', { type: 'bar',
data: { labels: weekLabels.map((l) => 'Sem. ' + l), datasets: [{ label: 'Volume', data: wKm.map((v) => Math.round(v * 10) / 10), ...bar(C.s1) }] },
options: { interaction: hover, scales: { x: weekX(), y: scaleY({ beginAtZero: true }) },
plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt1(c.raw)} km · ${wRuns[c.dataIndex]} sortie(s)` } } } } });
mk('cLong', { type: 'bar',
data: { labels: weekLabels.map((l) => 'Sem. ' + l), datasets: [
{ label: 'Sortie longue', data: wLong.map((v) => Math.round(v * 10) / 10), ...bar(C.s7), order: 2 },
refLine(plan.maxLongKm, NW, 'Plus longue sortie du plan')
] },
options: { interaction: hover, scales: { x: weekX(), y: scaleY({ beginAtZero: true, suggestedMax: plan.maxLongKm + 4 }) },
plugins: { tooltip: { filter: (i) => i.datasetIndex === 0, callbacks: { label: (c) => ` ${fmt1(c.raw)} km` } } } } });
mk('cPace', { type: 'line',
data: { labels: paceRuns.map((r) => fmtDM(r._date)), datasets: [
{ label: 'Allure', data: paceRuns.map(paceOf), ...line(C.s1), spanGaps: false },
refLine(targetPace, paceRuns.length, 'Allure marathon')
] },
options: { interaction: { mode: 'nearest', intersect: false, axis: 'x' }, scales: { x: scaleX(), y: paceY() },
plugins: { tooltip: { filter: (i) => i.datasetIndex === 0, callbacks: {
title: (items) => { const r = paceRuns[items[0].dataIndex]; return `${fmtDate(r._date)} · ${r.activityName || ''}`; },
label: (c) => { const r = paceRuns[c.dataIndex]; return ` ${fmtPace(c.raw)}/km · ${fmt1(km(r.distance))} km${r.averageHR ? ' · ' + fmt0(r.averageHR) + ' bpm' : ''}`; } } } } } });
mk('cPot', { type: 'line',
data: { labels: potDates.map(fmtDM), datasets: [{ label: 'Potentiel', data: potVals, ...line(C.s1), pointRadius: 3 }, refLine(targetSec, potN, 'Objectif')] },
options: { interaction: hover, scales: { x: scaleX(), y: scaleY({ reverse: true, ticks: { color: C.muted, maxTicksLimit: 5, callback: (v) => fmtHMin(v) } }) },
plugins: { tooltip: { filter: (i) => i.datasetIndex === 0, callbacks: { title: (it) => `Au ${fmtDM(potDates[it[0].dataIndex])}`, label: (c) => ` Potentiel marathon : ${fmtDur(c.raw)}` } } } } });
if (gpHist.length >= 2) mk('cGp', { type: 'line',
data: { labels: gpHist.map((p) => fmtDM(p.d)), datasets: [{ label: 'Prédiction Garmin', data: gpHist.map((p) => p.t), ...line(C.s7), pointRadius: 3 }, refLine(targetSec, gpHist.length, 'Objectif')] },
options: { interaction: hover, scales: { x: scaleX(), y: scaleY({ reverse: true, ticks: { color: C.muted, maxTicksLimit: 5, callback: (v) => fmtHMin(v) } }) },
plugins: { tooltip: { filter: (i) => i.datasetIndex === 0, callbacks: { title: (it) => fmtDate(gpHist[it[0].dataIndex].d), label: (c) => ` Prédiction : ${fmtDur(c.raw)}` } } } } });
mk('cLoad', { type: 'bar',
data: { labels: weekLabels.map((l) => 'Sem. ' + l), datasets: [{ label: 'Charge', data: wLoad.map(Math.round), ...bar(C.s3) }] },
options: { interaction: hover, scales: { x: weekX(), y: scaleY({ beginAtZero: true }) },
plugins: { tooltip: { callbacks: { label: (c) => ` Charge ${fmt0(c.raw)}` } } } } });
if (ffHtml) mk('cFf', { type: 'line',
data: { labels: ffShow.map((x) => fmtDM(x.d)), datasets: [
{ label: 'Forme', data: ffShow.map((x) => Math.round(x.ctl)), ...thin(C.s1) },
{ label: 'Fatigue', data: ffShow.map((x) => Math.round(x.atl)), ...thin(C.serious) },
{ label: 'Fraîcheur', data: ffShow.map((x) => Math.round(x.tsb)), ...thin(C.s3), borderDash: [5, 3] }] },
options: { interaction: hover, scales: { x: scaleX(), y: scaleY({ grid: { color: (c) => (c.tick && c.tick.value === 0 ? C.axis : C.grid) } }) },
plugins: { tooltip: { callbacks: { title: (it) => fmtDate(ffShow[it[0].dataIndex].d), label: (c) => ` ${c.dataset.label} ${c.raw > 0 && c.datasetIndex === 2 ? '+' : ''}${c.raw}` } } } } });
show(activeCmp);
if (recoveryEl.open) show('recovery');
};
const tabOf = (id) => { const el = document.getElementById(id); return (el && el.closest('[data-tab]')?.dataset.tab) || 'today'; };
const subFor = (id) => document.getElementById(id)?.closest('[data-sub]')?.dataset.sub;
const SUBS = { plan: [['week', 'Semaine', '#week'], ['cal', 'Calendrier', '#cal'], ['prog', 'Programme', '#plan']], data: [['res', 'Résumé', '.kpis6'], ['seances', 'Séances', '#compare'], ['graph', 'Graphiques', 'main > .grid']] };
const subOf = {};
Object.entries(SUBS).forEach(([tab, list]) => {
subOf[tab] = list[0][0];
list.forEach(([k, , sel]) => { const el = app.querySelector(sel); if (el) el.dataset.sub = k; });
const bar = document.createElement('div'); bar.className = 'seg'; bar.dataset.tab = tab; bar.setAttribute('role', 'tablist');
bar.innerHTML = list.map(([k, l]) => `<button type="button" role="tab" data-subtab="${tab}:${k}">${l}</button>`).join('');
app.querySelector(`.tab-title[data-tab="${tab}"]`).after(bar);
});
const setTab = (tab, keepScroll, sub) => {
if (sub) subOf[tab] = sub;
app.querySelectorAll('main > [data-tab]').forEach((el) => { el.hidden = (el.dataset.tab !== tab && el.dataset.tab !== 'all') || (el.dataset.sub && el.dataset.sub !== subOf[tab]); });
app.querySelectorAll('[data-subtab]').forEach((b) => { const on = b.dataset.subtab === tab + ':' + subOf[tab]; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
app.querySelectorAll('.nav a').forEach((a) => { const on = a.dataset.nav === tab; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
if (location.hash.slice(1) !== tab) history.replaceState(null, '', tab === 'today' ? location.pathname : '#' + tab);
if (tab === 'recup') show('recovery');
if (!keepScroll) window.scrollTo(0, 0);
if (tab !== 'today') drawCharts(false);
};
const glide = (el, block) => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: block || 'start' });
const openSteps = (head, open) => { head.setAttribute('aria-expanded', String(open)); head.parentElement.querySelector('.s-steps').hidden = !open; };
const setTheme = (t) => {
document.documentElement.dataset.theme = t;
try { localStorage.setItem('theme', t); } catch (e) { /* private browsing: the choice lasts for this visit only */ }
const meta = document.querySelector('meta[name="theme-color"]');
if (meta) meta.content = t === 'light' ? '#f4f3ef' : '#0d0d0d';
drawCharts(false);
};
const f0 = (x) => { x = x.trim(); const dg = x.replace(/\D/g, ''); return /^\d+$/.test(x) && dg.length >= 3 && dg.length <= 6 ? dg.padEnd(dg.length <= 3 ? 3 : dg.length <= 5 ? 5 : 6, '0').replace(/^(\d)(\d\d)(\d\d)?$/, (m0, h, mm, ss) => `${h}:${mm}:${ss || '00'}`) : x; };
app.addEventListener('submit', (e) => {
if (e.target.id === 'recForm') { e.preventDefault(); const f = e.target, m = f.querySelector('.rec-msg');
const raw = f.t.value.trim().replace(/[hH'.,\s]+/g, ':').replace(/:+$/, ''), t = raw.split(':').length === 2 ? '0:' + raw : raw;
if (!/^\d{1,2}:\d{2}:\d{2}$/.test(t) || !/^\d{4}-\d{2}-\d{2}$/.test(f.d.value)) { m.textContent = 'Format attendu : 0:45:30 (h:mm:ss) ou 45:30.'; m.classList.add('err'); return; }
recUser[f.k.value] = { t, d: f.d.value };
try { localStorage.setItem('records', JSON.stringify(recUser)); } catch (err) { m.textContent = 'Impossible d\'enregistrer (navigation privée ?).'; m.classList.add('err'); return; }
location.hash = '#goal'; location.reload(); return; }
if (e.target.id !== 'gpForm') return;
e.preventDefault();
let v = f0(e.target.t.value);
const f = e.target, d = f.d.value, raw = v.replace(/[hH'.,\s]+/g, ':').replace(/:+$/, ''), parts = raw.split(':');
const msg = f.querySelector('.gp-msg');
const t = parts.length === 2 ? raw + ':00' : raw;
if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}:\d{2}$/.test(t) || parseTime(t) < 7200 || parseTime(t) > 28800) { msg.textContent = 'Format attendu : 4:14:54 (entre 2 h et 8 h).'; msg.classList.add('err'); return; }
const list = (Array.isArray(gpUser) ? gpUser : []).filter((x) => x[0] !== d); list.push([d, t]);
try { localStorage.setItem('gpUser', JSON.stringify(list)); } catch (err) { msg.textContent = 'Impossible d\'enregistrer (navigation privée ?).'; msg.classList.add('err'); return; }
location.hash = '#goal'; location.reload();
});
// Déplacer depuis le calendrier : appui long (iPhone), ctrl-clic ou glisser-déposer (ordinateur), puis le nouveau jour.
let calPick = null, calSkipClick = false, calTimer = null;
const calDays = (s) => { const w = weekOfS(s), min = Math.max(0, dayIn(w, today)); return Array.from({ length: 7 }, (_, k) => k).filter((k) => k >= min && k !== dayIn(w, s.date)).map((k) => dayKey(addDays(w.monday, k))); };
const calStart = (btn) => { const s = allSessions[Number(btn.dataset.goto)]; if (!s || !canMoveCal(s)) return;
calPick = s; const ok = new Set(calDays(s)), month = btn.closest('.cal-month');
app.querySelectorAll('.cal-d').forEach((c) => c.classList.toggle('drop', ok.has(c.dataset.day)));
app.querySelectorAll('.cal-s.picked').forEach((b) => b.classList.remove('picked')); btn.classList.add('picked'); month.closest('#cal').classList.add('picking');
const bar = app.querySelector('.cal-pick'); bar.querySelector('span').innerHTML = `Déplacer <b>${esc(s.title)}</b> : touche le nouveau jour (même semaine).`; bar.hidden = false;
const out = app.querySelector('.cal-out'); out.hidden = true; pendingMove = null; };
const calStop = () => { calPick = null; app.querySelectorAll('.cal-d.drop').forEach((c) => c.classList.remove('drop')); app.querySelectorAll('.cal-s.picked').forEach((b) => b.classList.remove('picked'));
const cal = app.querySelector('#cal'); if (cal) cal.classList.remove('picking'); const bar = app.querySelector('.cal-pick'); if (bar) bar.hidden = true; };
const calDrop = (cell) => { const s = calPick; if (!s || !cell.classList.contains('drop')) return false; const w = weekOfS(s), to = dayIn(w, new Date(cell.dataset.day + 'T12:00:00'));
calStop(); proposeMove(s, to, app.querySelector('.cal-out')); const out = app.querySelector('.cal-out'); if (!out.hidden) out.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return true; };
app.addEventListener('click', (e) => { const t = e.target;
if (calSkipClick) { calSkipClick = false; e.preventDefault(); e.stopPropagation(); return; }
if (t.closest('[data-calcancel]')) { calStop(); e.stopPropagation(); return; }
const cs = t.closest('.cal-s[data-calmv]');
if (cs && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); calStart(cs); return; }
if (calPick) { const cell = t.closest('.cal-d'); if (cell && cell.closest('#cal')) { e.preventDefault(); e.stopPropagation(); if (!calDrop(cell)) calStop(); } } }, true);
app.addEventListener('contextmenu', (e) => { const cs = e.target.closest('.cal-s[data-calmv]'); if (cs && e.ctrlKey) e.preventDefault(); });
app.addEventListener('touchstart', (e) => { calSkipClick = false; const cs = e.target.closest('.cal-s[data-calmv]'); if (!cs) return; clearTimeout(calTimer);
calTimer = setTimeout(() => { calSkipClick = true; calStart(cs); if (navigator.vibrate) navigator.vibrate(15); }, 450); }, { passive: true });
['touchend', 'touchmove', 'touchcancel'].forEach((ev) => app.addEventListener(ev, () => clearTimeout(calTimer), { passive: true }));
app.addEventListener('dragstart', (e) => { const cs = e.target.closest && e.target.closest('.cal-s[data-calmv]'); if (!cs) return; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cs.dataset.goto); calStart(cs); });
app.addEventListener('dragover', (e) => { if (calPick && e.target.closest && e.target.closest('.cal-d.drop')) e.preventDefault(); });
app.addEventListener('drop', (e) => { const cell = e.target.closest && e.target.closest('.cal-d.drop'); if (!cell) return; e.preventDefault(); calDrop(cell); });
app.addEventListener('dragend', () => { if (calPick) setTimeout(() => { if (calPick && app.querySelector('.cal-out').hidden) calStop(); }, 50); });
app.addEventListener('click', (e) => {
const t = e.target;
const nav = t.closest('[data-nav]');
if (nav) { e.preventDefault(); const id = nav.dataset.nav; if (NAV.some(([k]) => k === id)) setTab(id); else { setTab(tabOf(id), false, subFor(id)); const el = document.getElementById(id); if (el) glide(el); } return; }
const cg = t.closest('[data-calgo]');
if (cg) { app.querySelectorAll('.cal-month').forEach((m) => { m.hidden = m.dataset.mi !== cg.dataset.calgo; }); return; }
const st = t.closest('[data-subtab]');
if (st) { const [tb, sb] = st.dataset.subtab.split(':'); setTab(tb, false, sb); return; }
if (t.closest('#themeBtn')) { setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); return; }
const go = t.closest('[data-goto]');
if (go) {
const sel = `[data-s="${go.dataset.goto}"]`, el = document.querySelector('#week ' + sel) || document.querySelector('#plan ' + sel);
if (!el) return;
setTab('plan', true, el.closest('#week') ? 'week' : 'prog');
const d = el.closest('details'), head = el.querySelector('.s-head');
if (d) d.open = true;
if (head && !head.disabled) openSteps(head, true);
glide(el, 'center');
el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300);
return;
}
const mv = t.closest('[data-mv], [data-mvreset], [data-mvnext], [data-mvdel], [data-mvundo], [data-mvact]');
if (mv) { const ds = mv.dataset;
if (ds.mvundo) { delete moves[ds.mvundo]; saveMoves(); return; }
if (ds.mvact) { const p = pendingMove; if (!p) return; const box = mv.closest('.mv-out');
if (ds.mvact === 'cancel') { box.hidden = true; pendingMove = null; return; }
const pb = p.r.noRoom[0] || p.r.tooClose[0];
if (ds.mvact === 'ok' || ds.mvact === 'keep') { p.commit(); saveMoves(); return; }
if (ds.mvact === 'remove') { p.commit(pb.item); moves[pb.item.id] = 'x'; saveMoves(); return; }
if (ds.mvact === 'next') { p.commit(pb.item); if (!pushNext(pb.item.s)) { alert('Pas de place la semaine prochaine.'); return; } saveMoves(); return; }
return; }
const s = allSessions[Number(ds.mv ?? ds.mvreset ?? ds.mvnext ?? ds.mvdel)]; if (!s) return;
if (ds.mvreset != null) { delete moves[moveKey(s)]; saveMoves(); return; }
if (ds.mvdel != null) { if (!confirm(`Supprimer « ${s.title} » de ton plan ? Tu pourras la rétablir.`)) return; moves[moveKey(s)] = 'x'; saveMoves(); return; }
if (ds.mvnext != null) { if (!pushNext(s)) { alert('Pas de place la semaine prochaine.'); return; } saveMoves(); return; }
proposeMove(s, Number(ds.to), mv.closest('.move').querySelector('.mv-out')); return;
}
if (t.closest('#icsBtn')) { downloadIcs(); return; }
const rd = t.closest('[data-recdel]');
if (rd) { delete recUser[rd.dataset.recdel]; try { localStorage.setItem('records', JSON.stringify(recUser)); } catch (err) { /* private mode */ } location.hash = '#goal'; location.reload(); return; }
const fo = t.closest('.feel-o');
if (fo) {
const s = allSessions[Number(fo.dataset.feel)]; if (!s) return;
const k = feelKey(s), v = feel[k] === fo.dataset.v ? null : fo.dataset.v;
if (v) feel[k] = v; else delete feel[k];
try { localStorage.setItem('feel', JSON.stringify(feel)); } catch (err) { /* private mode */ }
app.querySelectorAll(`.feel-o[data-feel="${fo.dataset.feel}"]`).forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
// Une note de la semaine passée change l'ajustement de cette semaine : on recalcule.
if (plan.weeks.findIndex((w) => w.sessions.includes(s)) === curWeekIdx - 1) { location.hash = '#plan'; setTimeout(() => location.reload(), 250); }
return;
}
if (t.closest('#zipBtn')) {
if (window.FitWorkout && weekFit.length) window.FitWorkout.download(`seances-semaine-${curWeek.index + 1}.zip`, window.FitWorkout.zip(weekFit.map((s) => ({ name: fitName(s), bytes: window.FitWorkout.encodeWorkout(wktName(s), s.steps) }))));
return;
}
const tab = t.closest('.cmp-tab');
if (tab) {
activeCmp = tab.dataset.cmp;
app.querySelectorAll('.cmp-tab').forEach((x) => { const on = x === tab; x.classList.toggle('active', on); x.setAttribute('aria-selected', String(on)); });
app.querySelectorAll('.cmp-panel').forEach((p) => { p.hidden = p.dataset.cmpPanel !== activeCmp; });
show(activeCmp);
return;
}
const head = t.closest('.s-head');
if (head && !head.disabled) openSteps(head, head.getAttribute('aria-expanded') !== 'true');
});
recoveryEl.addEventListener('toggle', () => { if (recoveryEl.open) show('recovery'); });
// Une page par onglet : seules les sections de l'onglet choisi sont affichées.
setTab(NAV.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'today', true);
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (NAV.some(([k]) => k === h)) setTab(h); });
drawCharts(true);
})();
