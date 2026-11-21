// Parcours de la course : import d'un .gpx, carte et profil en SVG, téléchargement et partage.
// Tout reste sur ce téléphone (localStorage). Même code dans Prépa Moorea et Prépa Builder.
(function () {
  'use strict';
  var RAD = Math.PI / 180;
  var hav = function (a, b) {
    var dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
    var s = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(s));
  };
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var r5 = function (x) { return Math.round(x * 1e5) / 1e5; };

  var parse = function (text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    var nodes = doc.querySelectorAll('trkpt');
    if (!nodes.length) nodes = doc.querySelectorAll('rtept');
    var pts = [];
    Array.prototype.forEach.call(nodes, function (n) {
      var la = parseFloat(n.getAttribute('lat')), lo = parseFloat(n.getAttribute('lon'));
      if (!isFinite(la) || !isFinite(lo)) return;
      var e = n.getElementsByTagName('ele')[0], ele = e ? parseFloat(e.textContent) : NaN;
      pts.push([r5(la), r5(lo), isFinite(ele) ? Math.round(ele) : null]);
    });
    if (pts.length < 2) return null;
    if (pts.length > 1500) { var step = pts.length / 1500, out = []; for (var i = 0; i < 1500; i++) out.push(pts[Math.floor(i * step)]); out.push(pts[pts.length - 1]); pts = out; }
    var nm = doc.querySelector('trk > name') || doc.querySelector('rte > name') || doc.querySelector('metadata > name');
    return { name: nm ? nm.textContent.trim() : '', pts: pts };
  };

  var stats = function (pts) {
    var dist = [0], up = 0, down = 0, ref = null, hasEle = pts.some(function (p) { return p[2] != null; });
    for (var i = 1; i < pts.length; i++) dist.push(dist[i - 1] + hav(pts[i - 1], pts[i]));
    // Dénivelé avec un seuil de 3 m pour ignorer le bruit du GPS.
    pts.forEach(function (p) { if (p[2] == null) return; if (ref == null) { ref = p[2]; return; } var d = p[2] - ref; if (d >= 3) { up += d; ref = p[2]; } else if (d <= -3) { down -= d; ref = p[2]; } });
    return { dist: dist, km: dist[dist.length - 1] / 1000, up: Math.round(up), down: Math.round(down), hasEle: hasEle };
  };

  var mapSvg = function (pts) {
    var lat0 = pts.reduce(function (s, p) { return s + p[0]; }, 0) / pts.length, k = Math.cos(lat0 * RAD);
    var xy = pts.map(function (p) { return [p[1] * k, -p[0]]; });
    var xs = xy.map(function (p) { return p[0]; }), ys = xy.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var W = 320, H = 220, pad = 12, sc = Math.min((W - 2 * pad) / ((x1 - x0) || 1e-9), (H - 2 * pad) / ((y1 - y0) || 1e-9));
    var ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    var P = xy.map(function (p) { return [(p[0] - x0) * sc + ox, (p[1] - y0) * sc + oy]; });
    var d = P.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
    var a = P[0], b = P[P.length - 1];
    return '<svg class="crs-map" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tracé du parcours">' +
      '<path d="' + d + '" fill="none" stroke="var(--crs-c)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="5" fill="var(--crs-ok)"/>' +
      '<circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="5" fill="none" stroke="var(--crs-ink)" stroke-width="2.5"/></svg>';
  };

  var profileSvg = function (pts, st) {
    var e = pts.map(function (p) { return p[2]; });
    var known = e.filter(function (v) { return v != null; }); if (!known.length) return '';
    var lo = Math.min.apply(null, known), hi = Math.max.apply(null, known), span = Math.max(20, hi - lo);
    var W = 320, H = 90, top = 8, bot = 18, tot = st.dist[st.dist.length - 1] || 1;
    var x = function (i) { return (st.dist[i] / tot) * W; }, y = function (v) { return top + (1 - (v - lo) / span) * (H - top - bot); };
    var last = known[0], d = '';
    e.forEach(function (v, i) { if (v != null) last = v; d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(last).toFixed(1); });
    var ticks = '', stepKm = st.km > 30 ? 10 : st.km > 12 ? 5 : st.km > 4 ? 2 : 1;
    for (var t = stepKm; t < st.km; t += stepKm) { var tx = (t * 1000 / tot) * W; ticks += '<line x1="' + tx.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y1="' + top + '" y2="' + (H - bot) + '" stroke="var(--crs-grid)"/><text x="' + tx.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + t + '</text>'; }
    return '<svg class="crs-prof" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Profil : de ' + lo + ' à ' + hi + ' m d\'altitude">' + ticks +
      '<path d="' + d + 'L' + W + ' ' + (H - bot) + 'L0 ' + (H - bot) + 'Z" fill="var(--crs-c)" fill-opacity=".18"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--crs-c)" stroke-width="2"/>' +
      '<text x="2" y="' + (top + 2) + '" dominant-baseline="hanging">' + hi + ' m</text><text x="2" y="' + (H - bot - 3) + '">' + lo + ' m</text></svg>';
  };

  var toGpx = function (c) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Prepa" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>' + esc(c.name || 'Parcours') + '</name><trkseg>\n' +
      c.pts.map(function (p) { return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '">' + (p[2] != null ? '<ele>' + p[2] + '</ele>' : '') + '</trkpt>'; }).join('\n') + '\n</trkseg></trk>\n</gpx>\n';
  };
  var fileName = function (c) { return (c.name || 'parcours').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() + '.gpx'; };
  var download = function (name, txt) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/gpx+xml' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  var CSS = '.crs{--crs-c:var(--accent,#d95926);--crs-ok:var(--good,#0ca30c);--crs-ink:var(--text,#222);--crs-grid:var(--grid,rgba(127,127,127,.25))}' +
    '.crs-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.crs-kpis{display:flex;flex-wrap:wrap;gap:6px 18px;margin:8px 0;font-size:14px}.crs-kpis b{font-size:17px}' +
    '.crs-map{width:100%;max-width:520px;max-height:260px;display:block;margin-top:6px}.crs-prof{width:100%;max-width:520px;display:block;margin-top:6px;font:10px system-ui,sans-serif;fill:var(--muted,#888)}' +
    '.crs-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.crs-msg{min-height:1em}.crs-msg.err{color:var(--crit-ink,#c33)}';

  // opts: { key, raceKm, raceName }
  var mount = function (el, opts) {
    if (!el) return;
    if (!document.getElementById('crs-css')) { var st = document.createElement('style'); st.id = 'crs-css'; st.textContent = CSS; document.head.appendChild(st); }
    var get = function () { try { return JSON.parse(localStorage.getItem(opts.key) || 'null'); } catch (e) { return null; } };
    var render = function (msg, err) {
      var c = get(), s = c && stats(c.pts);
      var off = s && opts.raceKm && Math.abs(s.km - opts.raceKm) / opts.raceKm > 0.03;
      el.classList.add('crs');
      el.innerHTML = '<h2>Parcours de la course</h2>' + (c
        ? '<div class="sub">' + esc(c.name || opts.raceName || 'Parcours importé') + '</div>' +
          '<div class="crs-kpis tnum"><span><b>' + s.km.toFixed(1).replace('.', ',') + '</b> km</span>' + (s.hasEle ? '<span>D+ <b>' + s.up + '</b> m</span><span>D− <b>' + s.down + '</b> m</span>' : '<span>pas d\'altitude dans le fichier</span>') + '</div>' +
          mapSvg(c.pts) + profileSvg(c.pts, s) +
          (off ? '<p class="note">Le tracé fait ' + s.km.toFixed(1).replace('.', ',') + ' km pour ' + String(opts.raceKm).replace('.', ',') + ' annoncés. Courant sur les courses de campagne : fie-toi plutôt au profil qu\'aux km exacts.</p>' : '') +
          '<p class="note">Point plein = départ, cercle = arrivée. Le profil est en km.</p>' +
          '<div class="crs-row"><button type="button" class="btn" data-crs="dl">Télécharger (.gpx)</button><button type="button" class="btn" data-crs="share">Partager</button><label class="btn">Remplacer<input class="crs-file" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml"></label><button type="button" class="btn" data-crs="del">Supprimer</button></div>'
        : '<div class="sub">Importe le tracé officiel pour voir la carte, le profil et le dénivelé.</div>' +
          '<p class="note">Où le trouver : le site de la course, ou la trace Strava / Garmin d\'un coureur de l\'an dernier (Exporter en GPX).</p>' +
          '<div class="crs-row"><label class="btn primary">Mettre mon parcours (.gpx)<input class="crs-file" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml"></label></div>') +
        '<p class="note crs-msg' + (err ? ' err' : '') + '" role="status">' + (msg ? esc(msg) : '') + '</p>';
    };
    el.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      f.text().then(function (txt) {
        var c = parse(txt);
        if (!c) { render('Fichier illisible : il faut un .gpx avec un tracé.', true); return; }
        try { localStorage.setItem(opts.key, JSON.stringify(c)); } catch (err) { render('Impossible d\'enregistrer (navigation privée ?).', true); return; }
        render('Parcours enregistré sur ce téléphone.');
      });
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-crs]'); if (!b) return;
      var c = get(); if (!c) return;
      if (b.dataset.crs === 'del') { if (!confirm('Supprimer le parcours de ce téléphone ?')) return; try { localStorage.removeItem(opts.key); } catch (err) { /* ignore */ } render(); return; }
      var txt = toGpx(c), name = fileName(c);
      if (b.dataset.crs === 'share') {
        var file = typeof File === 'function' ? new File([txt], name, { type: 'application/gpx+xml' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: c.name || 'Parcours' }).catch(function () {}); return; }
      }
      download(name, txt);
    });
    render();
  };
  window.Course = { mount: mount, parse: parse, stats: stats };
})();
