(function () {
'use strict';
const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
function crc16(bytes, crc = 0) {
for (const b of bytes) {
let tmp = CRC_TABLE[crc & 0xF];
crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ CRC_TABLE[b & 0xF];
tmp = CRC_TABLE[crc & 0xF];
crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xF];
}
return crc;
}
const T = { enum: [0x00, 1], uint16: [0x84, 2], uint32: [0x86, 4], uint32z: [0x8C, 4] };
const STR = 0x07;
class Writer {
constructor() { this.bytes = []; }
u8(v) { this.bytes.push(v & 0xFF); }
u16(v) { this.u8(v); this.u8(v >> 8); }
u32(v) { this.u8(v); this.u8(v >> 8); this.u8(v >> 16); this.u8(v >>> 24); }
str(s, size) {
const enc = new TextEncoder().encode(s);
const n = Math.min(enc.length, size - 1);
for (let i = 0; i < size; i++) this.u8(i < n ? enc[i] : 0);
}
define(local, global, fields) {
this.u8(0x40 | local); this.u8(0); this.u8(0); this.u16(global); this.u8(fields.length);
fields.forEach((f) => {
if (f.str) { this.u8(f.num); this.u8(f.str); this.u8(STR); }
else { this.u8(f.num); this.u8(T[f.type][1]); this.u8(T[f.type][0]); }
});
}
data(local, fields, values) {
this.u8(local);
fields.forEach((f, i) => {
const v = values[i];
if (f.str) this.str(v || '', f.str);
else if (f.type === 'enum') this.u8(v == null ? 0xFF : v);
else if (f.type === 'uint16') this.u16(v == null ? 0xFFFF : v);
else if (f.type === 'uint32') this.u32(v == null ? 0xFFFFFFFF : v);
else if (f.type === 'uint32z') this.u32(v == null ? 0 : v);
});
}
}
function flatten(steps) {
const out = [];
const INT = { active: 0, rest: 1, warmup: 2, cooldown: 3 };
const add = (s) => {
const rec = { name: s.name || '', intensity: INT[s.intensity] ?? 0, durType: 5, durValue: null, tType: 2, tValue: 0, lo: null, hi: null };
if (s.dur?.type === 'time') { rec.durType = 0; rec.durValue = Math.round(s.dur.s * 1000); }
else if (s.dur?.type === 'distance') { rec.durType = 1; rec.durValue = Math.round(s.dur.m * 100); }
if (s.target?.type === 'pace') { rec.tType = 0; rec.lo = Math.round((1000 / s.target.slow) * 1000); rec.hi = Math.round((1000 / s.target.fast) * 1000); }
else if (s.target?.type === 'hr') { rec.tType = 1; rec.lo = s.target.lo + 100; rec.hi = s.target.hi + 100; }
out.push(rec);
};
steps.forEach((s) => {
if (s.repeat) {
const startIdx = out.length;
s.steps.forEach(add);
out.push({ name: '', intensity: 0, durType: 6, durValue: startIdx, tType: 2, tValue: s.repeat, lo: null, hi: null });
} else add(s);
});
return out;
}
function encodeWorkout(name, steps) {
const recs = flatten(steps);
const w = new Writer();
const fileIdF = [{ num: 0, type: 'enum' }, { num: 1, type: 'uint16' }, { num: 2, type: 'uint16' }, { num: 3, type: 'uint32z' }, { num: 4, type: 'uint32' }];
const created = Math.floor(Date.now() / 1000) - 631065600;
w.define(0, 0, fileIdF);
w.data(0, fileIdF, [5, 255, 0, (created & 0x7FFFFFFF) || 1, created]);
const wktF = [{ num: 4, type: 'enum' }, { num: 5, type: 'uint32z' }, { num: 6, type: 'uint16' }, { num: 8, str: 24 }];
w.define(1, 26, wktF);
w.data(1, wktF, [1, 32, recs.length, name]);
const stepF = [{ num: 254, type: 'uint16' }, { num: 0, str: 16 }, { num: 1, type: 'enum' }, { num: 2, type: 'uint32' }, { num: 3, type: 'enum' },
{ num: 4, type: 'uint32' }, { num: 5, type: 'uint32' }, { num: 6, type: 'uint32' }, { num: 7, type: 'enum' }];
w.define(2, 27, stepF);
recs.forEach((r, i) => w.data(2, stepF, [i, r.name, r.durType, r.durValue, r.tType, r.tValue, r.lo, r.hi, r.intensity]));
const data = w.bytes;
const header = new Writer();
header.u8(14); header.u8(0x10); header.u16(2132); header.u32(data.length);
[0x2E, 0x46, 0x49, 0x54].forEach((b) => header.u8(b));
header.u16(crc16(header.bytes));
const all = header.bytes.concat(data);
const crc = crc16(all);
all.push(crc & 0xFF, (crc >> 8) & 0xFF);
return new Uint8Array(all);
}
function download(filename, bytes) {
const blob = new Blob([bytes], { type: 'application/octet-stream' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = filename;
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
window.FitWorkout = { encodeWorkout, download, crc16 };
})();
