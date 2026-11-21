// Déplacer une séance : recalcule la semaine pour garder au moins 48 h entre deux séances dures
// (qualité, sortie longue, test). Les autres séances glissent en cascade, de préférence plus tard dans la semaine.
// Même code dans Prépa Moorea et Prépa Builder.
(function () {
  'use strict';
  var DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  var GAP = 2; // jours entre deux séances dures

  // Jours candidats autour de "day" : le jour même, puis plus tard, puis plus tôt.
  var around = function (day, minDay) {
    var out = [day];
    for (var k = 1; k < 7; k++) { out.push(day + k); out.push(day - k); }
    return out.filter(function (d) { return d >= minDay && d <= 6; });
  };
  var free = function (placed, d) { return !placed.some(function (p) { return p.day === d; }); };
  var spaced = function (placed, d, hard) { return !hard || !placed.some(function (p) { return p.hard && Math.abs(p.day - d) < GAP; }); };
  var nearHard = function (placed, d, self) { return placed.filter(function (p) { return p.hard && p.id !== self && Math.abs(p.day - d) < GAP; })[0]; };

  // items : [{ id, day (0-6), hard, fixed, label }]. Retourne les nouveaux jours et les problèmes.
  var place = function (items, moverId, to, minDay) {
    var placed = items.filter(function (x) { return x.fixed && x.id !== moverId; }).map(function (x) { return { id: x.id, day: x.day, hard: x.hard, label: x.label }; });
    var mover = items.filter(function (x) { return x.id === moverId; })[0];
    var res = {}, tooClose = [], noRoom = [];
    var mp = { id: mover.id, day: to, hard: mover.hard, label: mover.label };
    var near = mover.hard && nearHard(placed, to, mover.id);
    if (near) tooClose.push({ item: mover, day: to, near: near });
    placed.push(mp); res[mover.id] = to;
    items.filter(function (x) { return !x.fixed && x.id !== moverId; }).sort(function (a, b) { return a.day - b.day; }).forEach(function (x) {
      var c = around(x.day, minDay);
      var d = c.filter(function (k) { return free(placed, k) && spaced(placed, k, x.hard); })[0];
      if (d == null) {
        var d2 = c.filter(function (k) { return free(placed, k); })[0];
        if (d2 == null) { noRoom.push({ item: x }); return; }
        tooClose.push({ item: x, day: d2, near: nearHard(placed, d2, x.id) });
        d = d2;
      }
      placed.push({ id: x.id, day: d, hard: x.hard, label: x.label }); res[x.id] = d;
    });
    var changes = items.filter(function (x) { return x.id !== moverId && res[x.id] != null && res[x.id] !== x.day; })
      .map(function (x) { return { item: x, from: x.day, to: res[x.id] }; });
    return { res: res, changes: changes, tooClose: tooClose, noRoom: noRoom };
  };

  // Où caser une séance dans une autre semaine (pour « semaine prochaine ») : même jour si possible.
  var slot = function (items, day, hard, minDay) {
    var c = around(day, minDay || 0);
    var d = c.filter(function (k) { return free(items, k) && spaced(items, k, hard); })[0];
    if (d != null) return { day: d, close: false };
    d = c.filter(function (k) { return free(items, k); })[0];
    return d != null ? { day: d, close: true } : null;
  };

  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // Texte et boutons de la proposition. Les boutons portent data-mvact.
  var html = function (r, moverLabel, to) {
    var b = function (act, label, primary) { return '<button type="button" class="btn sm' + (primary ? ' primary' : '') + '" data-mvact="' + act + '">' + label + '</button>'; };
    var pb = r.noRoom[0] || r.tooClose[0];
    if (pb) {
      var who = '<b>' + esc(pb.item.label) + '</b>';
      var txt = r.noRoom[0] ? 'Plus aucun jour libre cette semaine pour ' + who + '.'
        : who + ' (' + DAYS[pb.day] + ') serait à moins de 48 h de <b>' + esc(pb.near ? pb.near.label : 'une autre séance dure') + '</b>. Trop proche pour bien récupérer.';
      return '<p>' + txt + ' Que veux-tu faire ?</p><div class="mv-acts">' +
        b('next', esc(pb.item.label) + ' à la semaine prochaine', true) + b('remove', 'Supprimer : ' + esc(pb.item.label.toLowerCase())) +
        (r.noRoom[0] ? '' : b('keep', 'Garder quand même')) + b('cancel', 'Annuler') + '</div>';
    }
    if (!r.changes.length) return '';
    return '<p>' + esc(moverLabel) + ' → <b>' + DAYS[to] + '</b>. Pour garder 48 h entre les séances dures : ' +
      r.changes.map(function (c) { return '<b>' + esc(c.item.label) + '</b> ' + DAYS[c.from] + ' → ' + DAYS[c.to]; }).join(', ') + '.</p>' +
      '<div class="mv-acts">' + b('ok', 'Valider', true) + b('cancel', 'Annuler') + '</div>';
  };

  window.MoveKit = { place: place, slot: slot, html: html, DAYS: DAYS };
})();
