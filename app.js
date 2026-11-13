(function () {
'use strict';
const app = document.getElementById('app');
const D = window.GARMIN_DATA;
const R = window.RACE;
if (!D || window.GARMIN_DATA_MISSING) {
app.innerHTML = '<div class="wrap"><div class="empty"><h2>Données indisponibles</h2><p>Le fichier de données n\'a pas pu être chargé. Vérifie ta connexion, puis réessaie.</p><button type="button" class="btn primary" onclick="location.reload()">Réessayer</button></div></div>';
return;
}
const DAY = 86400000;
const V = (name) => `var(--${name})`;
const readColors = () => { const cs = getComputedStyle(document.documentElement), g = (v) => cs.getPropertyValue('--' + v).trim();
return { text: g('text'), text2: g('text-2'), muted: g('muted'), grid: g('grid'), axis: g('axis'), accent: g('accent'), s1: g('series-1'),
s3: g('series-3'), s7: g('series-7'), serious: g('serious'), surface: g('surface'), tip: g('tip-bg'), band: g('band') }; };
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
{ key: 'build', name: 'Développement', from: buildStart, to: peakStart, color: V('ph-2'), advice: '<b>Développement.</b> Travail au seuil et fractionné, premiers blocs à allure marathon dans la sortie longue, qui monte vers 28 km.' },
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
const riegel = (r) => r.duration * Math.pow((R.distanceKm * 1000) / r.distance, 1.06);
let predPool = inLast(runs, 84).filter((r) => r.distance >= 10000);
let predBasis = '≥ 10 km';
if (!predPool.length) { predPool = inLast(runs, 84).filter((r) => r.distance >= 5000); predBasis = '≥ 5 km'; }
const best = predPool.reduce((b, r) => (!b || riegel(r) < riegel(b) ? r : b), null);
const predSec = best ? riegel(best) : NaN;
const garminPred = R.garminPredictedTime ? parseTime(R.garminPredictedTime) : 0;
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
: acr <= 1.3 ? { c: V('good'), i: '✓', t: 'Zone optimale' }
: acr <= 1.5 ? { c: V('serious'), i: '!', t: 'Charge en hausse' }
: { c: V('critical'), i: '!!', t: 'Risque de surcharge' };
const zoneSec = [1, 2, 3, 4, 5].map((z) => inLast(prepRuns, 28).reduce((s, r) => s + (r['hrTimeInZone_' + z] || 0), 0));
const zoneTotal = zoneSec.reduce((a, b) => a + b, 0);
const zoneColors = [1, 2, 3, 4, 5].map((z) => V('z' + z));
const zoneNames = ['Z1 Récup', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Seuil', 'Z5 VO2max'];
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
const SC = window.SessionScore;
const levels = [];
const adjustOf = (w) => {
if (w < levels.length) return levels[w];
const last = levels.length - 1, lv = last >= 0 ? levels[last].level : 0;
return { level: lv > 0 && (w - last) % 2 === 1 ? 0 : lv, force: false };
};
const scoreMemo = new Map();
const scoreOf = (s, r) => { if (!SC) return null; const k = `${r.activityId}|${s.title}|${s.km}|${Math.round(s.sec)}`;
if (!scoreMemo.has(k)) scoreMemo.set(k, SC.score(s, r, LAPS[r.activityId], { paceAtHr })); return scoreMemo.get(k); };
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
if (SC) for (let w = 0; w <= curWeekIdx; w++) {
const p = buildPlan();
levels[w] = SC.decide(p.weeks.slice(Math.max(0, w - 3), w).map((x) => x.score).filter(Boolean));
if (levels[w].level > 0 && w > 0 && levels[w - 1].level > 0) { levels[w].level = 0; levels[w].capped = true; }
}
const plan = buildPlan();
const regul = levels.length ? levels[levels.length - 1] : { level: 0, force: false, avg: null, n: 0 };
const allSessions = plan.weeks.flatMap((w) => w.sessions);
const nextSession = allSessions.find((s) => s.date >= today && !s.run && s.type !== 'race');
const curWeek = plan.weeks[Math.min(curWeekIdx, plan.weeks.length - 1)];
const typeColor = { easy: V('series-1'), quality: V('accent'), long: V('series-7'), test: V('series-3'), race: V('text') };
const typeLabel = { easy: 'Footing', quality: 'Qualité', long: 'Sortie longue', test: 'Test', race: 'Course' };
const fitName = (s) => `${dayKey(s.date)}_${noAccent(s.title).replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')}.fit`;
const wktName = (s) => `${fmtDM(s.date).replace('/', '-')} ${noAccent(s.title)}`;
const canDownload = !!window.FitWorkout;
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
const open = forceOpen === true || isNext;
return `<div class="session ${isNext ? 'next' : ''}" data-s="${i}">
<button type="button" class="s-head" ${hasSteps ? `aria-expanded="${open}"` : 'disabled'}>
<span class="s-day">${esc(s.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }))}</span>
<span class="s-type"><span class="sw" style="background:${typeColor[s.type]}"></span>${typeLabel[s.type]} · <span class="tnum">≈ ${fmt1(s.km)} km · ${fmtHM(s.sec)}</span></span>
<span class="s-title">${esc(s.title)}</span>
${profileHtml(s)}
<span class="s-desc">${esc(s.desc)}</span>
${status}
${scoreBadge}
${hasSteps ? `<span class="s-more">${sc ? 'Analyse et étapes de la séance' : 'Étapes de la séance'}</span>` : ''}
</button>
${hasSteps ? `<div class="s-steps" ${open ? '' : 'hidden'}>${scoreDetail}<ol>${stepsHtml(s.steps)}</ol>${r ? '' : fuelHtml(s)}
${canDownload ? `<button type="button" class="btn fit-btn ${isNext ? 'primary' : ''}" data-sid="${i}">⌚ Fichier pour la montre (.fit)</button>` : ''}
</div>` : ''}
</div>`;
};
const levelTxt = (w) => (w.forced ? 'récup forcée' : w.level > 0 ? 'durcie' : w.level < 0 ? 'adoucie' : '');
const weekFlags = (w) => `${phaseName(w.phase)}${w.recovery && !w.forced ? ' · allégée' : ''}${w.hold ? ' · répétée' : ''}${levelTxt(w) ? ' · ' + levelTxt(w) : ''}`;
const regulTxt = !regul.n ? 'pas encore de semaine terminée dans le plan : le programme suit sa progression normale. Tes notes commenceront à l\'ajuster dès la semaine prochaine.'
: `note moyenne ${regul.avg}/100 sur ${regul.n === 1 ? 'la dernière semaine' : `les ${regul.n} dernières semaines`} → ${
curWeek.weeksToRace < 3 ? 'c\'est l\'affûtage : le programme ne change plus, place à la fraîcheur.'
: curWeek.forced ? 'deux semaines sous 50 : semaine de récupération imposée.'
: curWeek.hold ? `moins de 2 sorties la semaine dernière : cette semaine <b>répète</b> la précédente${curWeek.level < 0 ? ', en version adoucie' : ''}.`
: curWeek.recovery ? 'semaine <b>allégée</b>, déjà prévue au plan.'
: regul.level > 0 ? 'programme <b>durci</b> d\'un cran (sortie longue +3 km, séance de qualité plus longue).'
: regul.level < 0 ? 'programme <b>adouci</b> d\'un cran (sortie longue +1 km, séance de qualité plus courte).'
: regul.capped ? 'la semaine dernière était déjà durcie : celle-ci reste <b>normale</b> (une semaine durcie sur deux au maximum).'
: 'programme <b>maintenu</b> tel quel.'}`;
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
const strengthN = activities.filter((a) => a._date >= thisMon && STRENGTH.test(a.activityType?.typeKey || '')).length;
const regulHtml = [
SC ? { c: curWeek.forced ? 'low' : curWeek.level > 0 ? 'top' : curWeek.level < 0 || curWeek.hold ? 'mid' : '', t: `<b>Auto-régulation</b> · ${regulTxt}` } : null,
catchUp ? { c: 'mid', t: `<b>Rattrapage</b> · ${catchUp}` } : null,
{ c: strengthN ? 'top' : '', t: `<b>Renforcement</b> · ${strengthN ? `${strengthN} séance${strengthN > 1 ? 's' : ''} cette semaine. C'est ce qui protège tes genoux et tes tendons quand le volume monte.`
: 'aucune séance cette semaine. Vise 15 à 20 min (gainage, fentes, mollets, pont fessier) un jour sans course, jamais la veille de la sortie longue.'}` }
].filter(Boolean).map((n) => `<div class="regul ${n.c}">${n.t}</div>`).join('');
const weekRow = (w) => {
const isCur = w === curWeek, past = w.index < curWeek.index;
const short = (s) => s.title.replace(/^Sortie longue (\d+) km · /, 'SL $1 km · ').replace(/^Sortie longue/, 'SL').replace(' Z2', '');
return `<details class="wkr ${isCur ? 'cur' : ''} ${past ? 'past' : ''}">
<summary><span class="wk-n tnum">S${w.index + 1}</span><span class="wk-date">${w.monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
<span class="wk-chips">${w.sessions.map((s) => `<span class="chip"><span class="sw" style="background:${typeColor[s.type]}"></span>${esc(short(s))}</span>`).join('')}${isCur ? '<span class="tag now">en cours</span>' : ''}${w.recovery && !w.forced ? '<span class="tag">allégée</span>' : ''}${w.hold ? '<span class="tag">répétée</span>' : ''}${levelTxt(w) ? `<span class="tag">${levelTxt(w)}</span>` : ''}${w.score && (past || isCur) ? `<span class="tag"><b class="tnum">${w.score.score}</b>/100</span>` : ''}</span>
<span class="wk-vol tnum"><span class="wk-bar"><i style="width:${Math.round((w.targetKm / maxWeekKm) * 100)}%;background:${phaseAt(addDays(w.monday, 3)).color}"></i></span>${past || isCur ? fmt0(w.doneKm) + ' / ' : ''}${w.targetKm} km</span></summary>
<div class="sessions">${w.sessions.map((s) => sessionCard(s)).join('')}</div>
</details>`;
};
const R2 = plan.ranges;
const firstOf = (pred) => allSessions.find(pred);
const longest = Math.max(...plan.weeks.map((w) => (w.weeksToRace > 0 && !w.test ? w.longKm : 0)));
const miles = [
[firstOf((s) => s.title === 'Test 10 km'), 'Test 10 km'], [firstOf((s) => s.title === 'Test semi-marathon'), 'Test semi-marathon'],
[firstOf((s) => s.type === 'long' && s.title.startsWith(`Sortie longue ${longest} km`)), `Première sortie de ${longest} km`],
[firstOf((s) => s.type === 'race'), 'Marathon']
].filter(([s]) => s && s.date >= today).map(([s, label]) => ({ date: s.date, label })).sort((a, b) => a.date - b.date);
const maxWeekKm = Math.max(...plan.weeks.filter((w) => w.weeksToRace > 0).map((w) => w.targetKm));
const planListHtml = () => phases.map((p) => { const ws = plan.weeks.filter((w) => w.phase === p.key); if (!ws.length) return '';
return `<div class="ph-head"><span class="sw" style="background:${p.color}"></span><b>${p.name}</b><span>${ws.length} semaine${ws.length > 1 ? 's' : ''} · du ${ws[0].monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${addDays(ws[ws.length - 1].monday, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></div>${ws.map(weekRow).join('')}`; }).join('');
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
const recoveryTip = (() => {
if (pHrvLow >= 3) return { t: `Ta VFC est restée sous ta plage normale ${pHrvLow} nuits sur ${pHrv.length}.`, d: 'C\'est le signe d\'une fatigue qui s\'installe. Si elle n\'est pas remontée le matin de ta séance de qualité, remplace-la par le footing de 45 min et décale la qualité de deux jours.' };
if (isFinite(pRhr) && isFinite(baseRhr) && pRhr - baseRhr >= 4) return { t: `Ta FC au repos est montée à ${fmt0(pRhr)} bpm, contre ${fmt0(baseRhr)} d'habitude.`, d: 'Fatigue, manque de sommeil ou début de virus. Garde tes footings vraiment faciles cette semaine et ne force pas la séance de qualité si les jambes sont lourdes.' };
if (pSleep.length >= 4 && avg(pSleep) < 7) return { t: `Tu as dormi ${hm(avg(pSleep))} par nuit en moyenne.`, d: 'C\'est trop peu pour assimiler l\'entraînement. Vise 30 à 45 min de plus, en priorité la veille de la séance de qualité et de la sortie longue.' };
if (backToBack) return { t: 'Tu as enchaîné deux journées intenses de suite.', d: 'Laisse au moins un jour facile ou de repos entre deux efforts durs, tous sports confondus. C\'est le jour facile qui fait progresser.' };
if (pOther.filter(isHard).length >= 2) return { t: `${pOther.length} séances hors course la semaine dernière (${otherTxt}).`, d: 'Compte les plus intenses comme des séances dures : garde 48 h entre elles et la sortie longue, sinon tu la courras déjà fatigué.' };
return { t: `Signaux au vert${pSleep.length ? ` : ${hm(avg(pSleep))} de sommeil par nuit` : ''}${pHrv.length ? `, VFC à ${fmt0(avg(pHrv.map((h) => h.lastNightAvg)))} ms dans ta plage` : ''}.`, d: 'Protège cet état : une journée complète sans sport le lendemain de la sortie longue, et mange dans l\'heure qui suit tes séances de plus d\'une heure.' };
})();
const trainingTip = (() => {
if (!pRuns.length) return { t: `Aucune course la semaine dernière${lastRun && lastRun._date < prevMon ? ` : ta dernière sortie datait du ${fmtDate(lastRun._date).replace(/\.$/, '')}` : ''}.`, d: `Reprends avec les 3 séances prévues, sans chercher à rattraper. Sur la séance de qualité, reste à ${fmtPace(paces.threshold.fast)}-${fmtPace(paces.threshold.slow)}/km même si ça paraît facile : tes jambes ont perdu un peu de rythme.` };
if (prevPlanWeek && prevPlanWeek.doneCount < 2) return { t: `${prevPlanWeek.doneCount} séance sur ${prevPlanWeek.sessions.length} la semaine dernière.`, d: 'La régularité compte plus que n\'importe quelle séance. Si tu dois en sauter une cette semaine, saute le footing, jamais la sortie longue.' };
if (isFinite(pEasy) && pEasy < 0.6) return { t: `Seulement ${Math.round(pEasy * 100)} % de ton temps de course en zones 1-2.`, d: `Tes footings sont trop rapides : ils te fatiguent sans te faire progresser. Tiens ${z2Txt} sur le footing et le début de la sortie longue, quitte à marcher dans les côtes.` };
if (prev3 > 5 && pKm > prev3 * 1.3) return { t: `${fmt0(pKm)} km la semaine dernière, contre ${fmt0(prev3)} km en moyenne avant.`, d: 'C\'est une hausse rapide. Tiens-toi au volume prévu cette semaine, sans rien ajouter, pour laisser tes tendons s\'adapter.' };
const longDone = Math.max(0, ...pRuns.map((r) => km(r.distance)));
if (prevPlanWeek && longDone < prevPlanWeek.longKm * 0.8 && prevPlanWeek.longKm) return { t: `Ta plus longue sortie a fait ${fmt1(longDone)} km pour ${prevPlanWeek.longKm} prévus.`, d: 'La sortie longue est la séance clé du marathon. Cette semaine, protège-la : bloque le créneau et pars lentement.' };
return { t: `Semaine solide : ${pRuns.length} sorties, ${fmt0(pKm)} km${isFinite(pEasy) ? `, ${Math.round(pEasy * 100)} % en zones 1-2` : ''}.`, d: current.key === 'base' ? 'Continue pareil. Sur la sortie longue, les blocs soutenus doivent rester confortables : si tu finis sans marge, tu es parti trop vite.' : 'Continue pareil. Sur les blocs à allure marathon, vise la régularité au kilomètre plutôt que la vitesse.' };
})();
const factsTxt = `Semaine du ${prevMon.getDate()} au ${prevEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} : ${pRuns.length} course${pRuns.length > 1 ? 's' : ''}${pRuns.length ? ` (${fmt0(pKm)} km)` : ''}${pOther.length ? ` · ${pOther.length} autre${pOther.length > 1 ? 's' : ''} séance${pOther.length > 1 ? 's' : ''} (${otherTxt})` : ''}${pSleep.length ? ` · sommeil ${hm(avg(pSleep))}` : ''}${pHrv.length ? ` · VFC ${fmt0(avg(pHrv.map((h) => h.lastNightAvg)))} ms` : ''}${isFinite(pRhr) ? ` · FC repos ${fmt0(pRhr)} bpm` : ''}`;
const tKey = dayKey(today);
const hrvT = hrvMap.get(tKey), sleepSec = sleepMap.get(tKey)?.sleepTimeSeconds, rhrT = rhrOf(today);
const rhrBase28 = avg(Array.from({ length: 28 }, (_, i) => rhrOf(addDays(today, -1 - i))).filter(Boolean));
const hrvLowNights = (() => { let n = 0;
for (let i = 0; i < 7; i++) { const h = hrvMap.get(dayKey(addDays(today, -i))); if (h && h.lastNightAvg && h.baseline?.balancedLow && h.lastNightAvg < h.baseline.balancedLow) n++; else break; }
return n; })();
const yHard = activities.filter((a) => dayKey(a._date) === dayKey(addDays(today, -1)) && isHard(a));
const signals = [];
if (hrvT && hrvT.lastNightAvg) { const v = hrvT.lastNightAvg, lo = hrvT.baseline?.balancedLow, hi = hrvT.baseline?.balancedUpper;
signals.push({ k: 'VFC', v: `${v} ms`, n: !(lo && hi) ? '' : hrvLowNights >= 3 ? `sous ta plage depuis ${hrvLowNights} nuits` : `plage ${lo}–${hi}`,
lv: !lo ? 0 : Math.min(2, (v < lo - 5 ? 2 : v < lo ? 1 : 0) + (hrvLowNights >= 3 ? 1 : 0)) }); }
if (rhrT) { const d = isFinite(rhrBase28) ? Math.round(rhrT - rhrBase28) : 0;
signals.push({ k: 'FC repos', v: `${rhrT} bpm`, n: !isFinite(rhrBase28) ? '' : d ? `${Math.abs(d)} de ${d > 0 ? 'plus' : 'moins'} que d'habitude` : 'comme d\'habitude', lv: d >= 5 ? 2 : d >= 3 ? 1 : 0 }); }
if (sleepSec) { const h = sleepSec / 3600; signals.push({ k: 'Sommeil', v: hm(h), n: '', lv: h < 6 ? 2 : h < 7 ? 1 : 0 }); }
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
sub: `${fmt1(km(runToday.distance))} km en ${fmtDur(runToday.duration)} (${fmtPace(runToday.duration / km(runToday.distance))}/km)${s && s.score ? ` · note <b>${s.score.total}/100</b>, ${s.score.label.toLowerCase()}` : ''}`,
btn: s ? `<button type="button" class="btn" data-goto="${allSessions.indexOf(s)}">Voir l'analyse</button>` : '' }; }
if (todayS) { const kt = keyTarget(todayS);
return { title: esc(todayS.title), sub: `${typeLabel[todayS.type]} · ≈ ${fmt1(todayS.km)} km · ${fmtHM(todayS.sec)}${kt ? ' · ' + kt : ''}`,
btn: `<button type="button" class="btn primary" data-goto="${allSessions.indexOf(todayS)}">Voir la séance</button>` }; }
if (catchUp) return { title: 'Une séance à rattraper', sub: catchUp[0].toUpperCase() + catchUp.slice(1), btn: '' };
return { title: 'Repos', sub: 'Pas de course prévue. Marche, mobilité ou 20 min de renforcement si tu as de l\'énergie.', btn: '' };
})();
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
const ageMs = Date.now() - fetched, stale = ageMs > 9 * 3600000;
const ago = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'à l\'instant' : m < 60 ? `il y a ${m} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const curEnd = addDays(curWeek.monday, 6);
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
const compareHtml = `<section class="card" id="compare">
<h2>Comparer mes séances</h2><div class="sub">De la plus récente à la plus ancienne · en couleur, l'écart avec la séance précédente du même type</div>
<div class="cmp-tabs" role="tablist">${cmpKeys.map((k, i) => `<button type="button" role="tab" class="cmp-tab ${i ? '' : 'active'}" aria-selected="${!i}" data-cmp="${k}">${CMP[k].label}<span class="tnum">${CMP[k].done.length}</span></button>`).join('')}</div>
${cmpKeys.map((k, i) => cmpPanel(k, !i)).join('')}
</section>`;
const svg = (d, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${d}</svg>`;
const NAV = [
['today', 'Aujourd\'hui', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'],
['week', 'Semaine', '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
['compare', 'Comparer', '<path d="M4 8h14l-3-3M20 16H6l3 3"/>'],
['plan', 'Plan', '<path d="M5 21V4h12l-2 4 2 4H5"/>'],
['stats', 'Stats', '<path d="M6 20v-8M12 20V4M18 20v-5"/>']
];
app.innerHTML = `
<header class="top"><div class="top-in">
<a class="brand" href="#today" data-nav="today"><span class="logo">42</span><span class="brand-t">Prépa Marathon</span><span class="dday tnum">J-${daysLeft}</span></a>
<nav class="nav" aria-label="Sections de la page">${NAV.map(([id, l, d]) => `<a href="#${id}" data-nav="${id}" class="${id === 'today' ? 'on' : ''}">${svg(d)}<span>${l}</span></a>`).join('')}</nav>
<div class="top-act">
<span class="sync ${stale ? 'stale' : ''}" title="Dernière synchro Garmin : ${fetchedTxt}"><i></i><span>Synchro ${ago(ageMs)}</span></span>
<button type="button" class="icon-btn" id="themeBtn" aria-label="Passer du mode nuit au mode jour, ou l'inverse" title="Mode jour / nuit">${
svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 'i-sun')}${
svg('<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7 7 0 0 0 10 10z"/>', 'i-moon')}</button>
</div>
</div></header>
<main class="wrap">
${stale ? `<div class="banner"><b>Synchro en retard.</b> Les dernières données Garmin datent d'${ago(ageMs)}, alors que la mise à jour passe toutes les 3 heures. Si ça dure, regarde l'onglet Actions de ton dépôt GitHub.</div>` : ''}
<section class="card today" id="today">
<div>
<div class="eyebrow">Aujourd'hui · ${today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
<h1 class="today-title">${todayCard.title}</h1>
<p class="today-sub">${todayCard.sub}</p>
${upcoming ? `<p class="today-next">Ensuite : <b>${esc(upcoming.title)}</b> · ${upcoming.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })} (${inDays(upcoming.date)})</p>` : ''}
${todayCard.btn}
</div>
<div class="ready lv${readyLv}">
<div class="ready-head"><span class="light" aria-hidden="true">${['?', '✓', '!', '!!'][readyLv + 1]}</span><div><b>Forme du jour · ${readyTitle}</b><span>${readyAdvice}</span></div></div>
${signals.length ? `<div class="sigs">${signals.map((x) => `<span class="sig lv${x.lv}"><i>${x.lv ? '!' : '✓'}</i><span>${x.k} <b class="tnum">${esc(x.v)}</b>${x.n ? ` · ${x.n}` : ''}</span></span>`).join('')}</div>` : ''}
</div>
</section>
<section class="hero">
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
<div class="goal-row"><span class="k">Prédiction Garmin<br><span class="note">${garminPred ? (R.garminPredictedDate ? 'relevée le ' + fmtDate(new Date(R.garminPredictedDate + 'T00:00:00')) : 'saisie dans config.js') : 'non fournie par l\'API'}</span></span>
<span class="r"><span class="v tnum">${garminPred ? fmtDur(garminPred) : '–'}</span><br>
${garminPred ? deltaHtml(garminPred - targetSec) : '<span class="note">À renseigner dans config.js</span>'}</span></div>
${thr ? `<div class="goal-row"><span class="k">Potentiel d'après ton seuil<br><span class="note">seuil ${fmtPace(thr.fast)}-${fmtPace(thr.slow)}/km à ${fmt0(thrRef.hr)} bpm</span></span>
<span class="r"><span class="v tnum">${fmtDur(thrPotential)}</span><br>${deltaHtml(thrPotential - targetSec)}</span></div>`
: `<div class="goal-row"><span class="k">Estimation Riegel<br><span class="note">${best ? `${fmt1(km(best.distance))} km en ${fmtDur(best.duration)}, ${fmtDate(best._date)}` : 'pas de sortie ≥ 10 km'}</span></span>
<span class="r"><span class="v tnum">${isFinite(predSec) ? fmtDur(predSec) : '–'}</span><br>${isFinite(predSec) ? deltaHtml(predDelta) : ''}</span></div>`}
<div class="note">${!thr ? `Pour ${goalTxt}, il faut valoir environ ${fmtDur(goal10)} sur 10 km.`
: thrPotential <= targetSec ? `Ta vitesse est déjà celle d'un marathon en ${goalTxt}. Ce qu'il reste à construire, c'est l'endurance pour la tenir 42 km.`
: `Ta vitesse au seuil vaut aujourd'hui un marathon en ${fmtDur(thrPotential)}. Il reste de la vitesse à gagner, puis l'endurance pour la tenir 42 km.`}</div>
</div>
</section>
<section class="card">
<div class="coach-head"><h2>Les conseils du coach</h2><span>${factsTxt}</span></div>
<div class="coach-tips">
<div class="tip"><div class="tip-k"><span class="sw" style="background:${V('series-3')}"></span>Récupération</div><div class="tip-t">${esc(recoveryTip.t)}</div><div class="tip-d">${esc(recoveryTip.d)}</div></div>
<div class="tip"><div class="tip-k"><span class="sw" style="background:${V('accent')}"></span>Entraînement</div><div class="tip-t">${esc(trainingTip.t)}</div><div class="tip-d">${esc(trainingTip.d)}</div></div>
</div>
</section>
<section class="card" id="week">
<div class="plan-top">
<div><h2>Cette semaine · du ${curWeek.monday.getDate()} au ${curEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</h2>
<div class="sub">Semaine ${curWeek.index + 1} sur ${plan.weeks.length} · ${weekFlags(curWeek)} · touche une séance pour voir ses étapes</div></div>
<div class="tnum week-km">${fmt1(curWeek.doneKm)} / ${curWeek.targetKm} km${curWeek.score ? `<span class="week-score">note ${curWeek.score.score}/100</span>` : ''}</div>
</div>
<div class="progress"><span style="width:${Math.min(100, (curWeek.doneKm / Math.max(1, curWeek.targetKm)) * 100)}%"></span></div>
${regulHtml}
<div class="sessions">${curWeek.sessions.map((s) => sessionCard(s, true)).join('')}</div>
<div class="pace-strip tnum"><span class="ps-k">Tes allures</span>${[
['Footing', hrEasy ? `${hrEasy.lo}-${hrEasy.hi} bpm` : `${fmtPace(R2.easy.fast)}-${fmtPace(R2.easy.slow)}`],
['Endurance active', `${fmtPace(R2.long.fast)}-${fmtPace(R2.long.slow)}`], ['Soutenue', `${fmtPace(R2.sout.fast)}-${fmtPace(R2.sout.slow)}`],
['Marathon', `${fmtPace(R2.mp.fast)}-${fmtPace(R2.mp.slow)}`], ['Semi', `${fmtPace(R2.half.fast)}-${fmtPace(R2.half.slow)}`],
['Seuil', `${fmtPace(paces.threshold.fast)}-${fmtPace(paces.threshold.slow)}`], ['Fractionné', `${fmtPace(paces.interval.fast)}-${fmtPace(paces.interval.slow)}`],
['VMA', `${fmtPace(paces.vma.fast)}-${fmtPace(paces.vma.slow)}`]].map(([k, v]) => `<span class="ps"><span>${k}</span><b>${v}</b></span>`).join('')}</div>
<details class="howto" ${canDownload ? '' : 'hidden'}><summary>Comment mettre une séance sur ma montre ?</summary>
<ol>
<li>Sur un ordinateur, ouvre la séance et clique sur <b>Fichier pour la montre (.fit)</b> : le fichier se télécharge.</li>
<li>Branche ta montre à l'ordinateur en USB et ouvre-la dans l'Explorateur de fichiers.</li>
<li>Copie le fichier dans le dossier <code>GARMIN\\NewFiles</code> de la montre, puis débranche-la.</li>
<li>Sur la montre : <b>Course à pied › Entraînements</b>. La séance y est, avec ses étapes et ses cibles.</li>
</ol>
</details>
</section>
<section class="kpis6">
<div class="tile"><div class="k">Assiduité depuis le début</div><div class="v tnum">${due.length ? dueDone : '–'}<small>${due.length ? `/ ${due.length} séance${due.length > 1 ? 's' : ''}` : ''}</small></div><div class="progress"><span style="width:${due.length ? Math.round((dueDone / due.length) * 100) : 0}%"></span></div></div>
<div class="tile"><div class="k">Volume moyen (4 sem.)</div><div class="v tnum">${fmt1(km28avg)}<small>km/sem</small></div><div class="s">Prévu cette semaine : ${curWeek.targetKm} km</div></div>
<div class="tile"><div class="k">Plus longue sortie (28 j)</div><div class="v tnum">${fmt1(long28)}<small>/ ${plan.maxLongKm} km</small></div><div class="progress"><span style="width:${Math.min(100, (long28 / plan.maxLongKm) * 100)}%"></span></div></div>
<div class="tile"><div class="k">Temps en zones 1-2 (28 j)</div><div class="v tnum">${isFinite(easyShare) ? Math.round(easyShare * 100) : '–'}<small>%</small></div><div class="s">Cible : environ 80 %</div></div>
<div class="tile"><div class="k">Charge aiguë / chronique</div><div class="v tnum">${isFinite(acr) ? acr.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '–'}</div>${statusHtml(acrStatus)}</div>
<div class="tile"><div class="k">Prochain jalon</div>${miles[0] ? `<div class="v tnum">J-${Math.round((miles[0].date - today) / DAY)}</div><div class="s">${esc(miles[0].label)} · ${fmtDate(miles[0].date)}</div>` : '<div class="v">–</div>'}</div>
</section>
${compareHtml}
<section class="card" id="plan">
<h2>Plan complet jusqu'au marathon</h2>
<div class="sub">${plan.weeks.length} semaines · 3 séances par semaine · ouvre une semaine pour voir ses séances</div>
<div class="miles">${miles.map((m) => `<span class="mile"><b>${esc(m.label)}</b><span class="tnum">${dayMon(m.date)} · J-${Math.round((m.date - today) / DAY)}</span></span>`).join('')}</div>
<div class="tl-bar">${tlSegs}<div class="tl-today ${pct(today) < 12 ? 'at-start' : pct(today) > 88 ? 'at-end' : ''}" style="left:calc(${pct(today)}% - 1px)"></div></div>
<div class="tl-dates"><span>${fmtDM(tlStart)}</span><span>Course : ${fmtDM(raceDate)}</span></div>
<div class="phase-advice">${current.advice}</div>
<div class="chart sm"><canvas id="cPlan"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('series-1')}"></span>Prévu</span><span><span class="sw" style="background:${V('accent')}"></span>Réalisé</span></div>
${R.distanceKm > 21.0975 ? `<details class="raceplan"><summary>Mon plan de course pour le jour J</summary>
<p>Départ prudent : les 5 premiers kilomètres à ${fmtPace(racePlan.slow)}/km, puis ${fmtPace(racePlan.rest)}/km jusqu'à l'arrivée. Tes temps de passage pour finir en ${goalTxt} :</p>
<div class="splits tnum">${racePlan.rows.map((r) => `<div class="split"><span>${r.l}</span><b>${fmtDur(r.t)}</b></div>`).join('')}</div>
<p class="note">Un gel toutes les 40 min dès la 40e minute, et de l'eau à chaque ravitaillement. Ces temps seront à confirmer après ton test semi-marathon.</p>
</details>` : ''}
<div class="wk-list">${planListHtml()}</div>
<p class="note">Le plan s'ajuste à ce que tu cours vraiment. Les allures suivent ton seuil, mesuré sur tes séances des 12 dernières semaines. Une séance compte même si tu la changes de jour dans la semaine. Une semaine terminée avec moins de 2 sorties fait répéter la semaine suivante au lieu de l'allonger. La sortie longue est plafonnée à 3 h 15 d'effort, soit ${plan.maxLongKm} km à ton allure actuelle.</p>
</section>
<section class="grid" id="stats">
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
</section>
<details class="card recovery" id="recovery">
<summary><b>Récupération</b><span class="tnum">VFC ${latestHrv?.lastNightAvg ?? '–'} ms · FC repos ${isFinite(rhr7) ? fmt0(rhr7) : '–'} bpm · Sommeil ${isFinite(sleep7) ? fmt1(sleep7) : '–'} h</span></summary>
<div class="grid">
<div class="card span-4"><h2>VFC nocturne</h2><div class="sub">60 jours · ms</div><div class="chart sm"><canvas id="cHrv"></canvas></div>
<div class="legend"><span><span class="sw" style="background:${V('series-7')}"></span>VFC</span><span><span class="sw" style="background:${V('band')}"></span>Plage normale</span></div></div>
<div class="card span-4"><h2>FC au repos</h2><div class="sub">60 jours · bpm</div><div class="chart sm"><canvas id="cRhr"></canvas></div></div>
<div class="card span-4"><h2>Sommeil</h2><div class="sub">30 jours · heures par nuit</div><div class="chart sm"><canvas id="cSleep"></canvas></div></div>
</div>
</details>
<footer><span>Données Garmin du ${fetchedTxt}${(D.errors || []).length ? ' · ' + D.errors.length + ' source(s) en erreur' : ''}</span><span>Mise à jour automatique toutes les 3 heures</span></footer>
</main>`;
setTimeout(() => app.classList.add('settled'), 1500); // ends the entrance animations for good (see styles.css)
const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
let charts = [], C = null, anim = false, activeCmp = cmpKeys[0];
const drawn = new Set(); // lazily drawn groups: one per compare tab, plus 'recovery'
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
plugins: { tooltip: { callbacks: { title, label: (i) => ` ${c[x]} : ${i.raw == null ? '–' : f(i.raw)}` } } } }
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
options: { interaction: hover, scales: { x: scaleX(), y: scaleY() }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.raw} bpm` } } } } });
mk('cSleep', { type: 'bar',
data: { labels: days30.map(fmtDM), datasets: [{ label: 'Sommeil', data: sleepH.map((v) => (v == null ? null : Math.round(v * 10) / 10)), ...bar(C.s1), maxBarThickness: 10 }] },
options: { interaction: hover, scales: { x: scaleX(), y: scaleY({ beginAtZero: true, suggestedMax: 9 }) },
plugins: { tooltip: { callbacks: { label: (c) => ` ${hm(c.raw)}` } } } } });
};
const recoveryEl = document.getElementById('recovery');
const show = (key) => { if (!C || drawn.has(key)) return; drawn.add(key); if (key === 'recovery') drawRecovery(); else drawCmp(key); };
const paceRuns = inLast(prepRuns, 84).filter((r) => !(r.elevationGain > 25 * km(r.distance)));
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
{ label: 'Prévu', data: plan.weeks.map((w) => w.targetKm), ...bar(C.s1), maxBarThickness: 14 },
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
mk('cLoad', { type: 'bar',
data: { labels: weekLabels.map((l) => 'Sem. ' + l), datasets: [{ label: 'Charge', data: wLoad.map(Math.round), ...bar(C.s3) }] },
options: { interaction: hover, scales: { x: weekX(), y: scaleY({ beginAtZero: true }) },
plugins: { tooltip: { callbacks: { label: (c) => ` Charge ${fmt0(c.raw)}` } } } } });
show(activeCmp);
if (recoveryEl.open) show('recovery');
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
app.addEventListener('click', (e) => {
const t = e.target;
const nav = t.closest('[data-nav]');
if (nav) { e.preventDefault(); const el = document.getElementById(nav.dataset.nav); if (el) glide(el); return; }
if (t.closest('#themeBtn')) { setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); return; }
const go = t.closest('[data-goto]');
if (go) {
const sel = `[data-s="${go.dataset.goto}"]`, el = document.querySelector('#week ' + sel) || document.querySelector('#plan ' + sel);
if (!el) return;
const d = el.closest('details'), head = el.querySelector('.s-head');
if (d) d.open = true;
if (head && !head.disabled) openSteps(head, true);
glide(el, 'center');
el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300);
return;
}
const fb = t.closest('.fit-btn');
if (fb) {
const s = allSessions[Number(fb.dataset.sid)];
if (s && window.FitWorkout) window.FitWorkout.download(fitName(s), window.FitWorkout.encodeWorkout(wktName(s), s.steps));
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
if ('IntersectionObserver' in window) {
const links = [...app.querySelectorAll('.nav a')];
const io = new IntersectionObserver((entries) => entries.forEach((en) => {
if (en.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.dataset.nav === en.target.dataset.sec));
}), { rootMargin: '-40% 0px -55% 0px' });
let sec = NAV[0][0];
[...app.querySelector('main').children].forEach((el) => { if (NAV.some(([id]) => id === el.id)) sec = el.id; el.dataset.sec = sec; io.observe(el); });
}
drawCharts(true);
})();
