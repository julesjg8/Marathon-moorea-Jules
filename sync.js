// "Synchroniser maintenant": asks GitHub to run the Garmin sync workflow right away, then waits
// for the new data.json to be online and reloads the page.
// The GitHub key (fine-grained, this repository only, Actions read/write) is pasted once by the
// user and stays in this phone's localStorage. It is never sent anywhere but api.github.com.
(function () {
  'use strict';
  var REPO = 'julesjg8/Marathon-moorea-Jules';
  var WF = 'https://api.github.com/repos/' + REPO + '/actions/workflows/sync-garmin.yml';
  var KEY = 'ghSyncKey';
  var MAX_WAIT = 8 * 60000, EVERY = 15000;

  var getKey = function () { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  var setKey = function (v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); return true; } catch (e) { return false; } };
  var gh = function (url, key, opts) {
    opts = opts || {};
    return fetch(url, { method: opts.method || 'GET', body: opts.body, cache: 'no-store', headers: { Authorization: 'Bearer ' + key, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  };
  var btn = function () { return document.getElementById('syncBtn'); };
  var label = function () { return document.querySelector('.sync > span'); };
  var setState = function (busy, txt) {
    var b = btn(); if (b) { b.classList.toggle('busy', busy); b.disabled = busy; }
    var l = label(); if (l && txt) l.textContent = txt;
    var s = document.querySelector('.sync'); if (s) s.classList.toggle('running', busy);
  };

  // ----- First-time setup: paste the key -----
  var STEPS = [
    'Ouvre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">cette page GitHub</a> (connecte-toi si besoin).',
    '<b>Token name</b> : « Bouton synchro ». <b>Expiration</b> : choisis une date après le marathon.',
    '<b>Repository access</b> : « Only select repositories », puis choisis <b>Marathon-moorea-Jules</b>.',
    '<b>Permissions</b> › <b>Repository permissions</b> › <b>Actions</b> : « Read and write ». Ne touche à rien d\'autre.',
    'Appuie sur <b>Generate token</b>, copie la clé (elle commence par <code>github_pat_</code>) et colle-la ci-dessous.'
  ];
  var openSetup = function (err) {
    var old = document.querySelector('.gh-bg'); if (old) old.remove();
    var bg = document.createElement('div');
    bg.className = 'gh-bg';
    bg.innerHTML = '<div class="gh-box card" role="dialog" aria-modal="true" aria-labelledby="ghT">' +
      '<button type="button" class="icon-btn gh-x" aria-label="Fermer">×</button>' +
      '<h2 id="ghT">Activer « Synchroniser maintenant »</h2>' +
      '<p class="sub">À faire une seule fois, environ 2 minutes. La clé permet seulement de lancer la synchro, rien d\'autre, et reste sur ce téléphone.</p>' +
      '<ol>' + STEPS.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '<form class="gh-form"><label for="ghKey" class="sub">Ta clé GitHub</label>' +
      '<input id="ghKey" name="k" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…">' +
      '<p class="gh-msg" role="status"></p>' +
      '<button type="submit" class="btn primary">Enregistrer et synchroniser</button></form></div>';
    document.body.appendChild(bg);
    var msg = bg.querySelector('.gh-msg');
    if (err) { msg.textContent = err; msg.classList.add('err'); }
    var close = function () { bg.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('.gh-x')) close(); });
    bg.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var k = e.target.k.value.trim();
      msg.classList.remove('err');
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(k)) { msg.textContent = 'Ça ne ressemble pas à une clé GitHub : elle commence par github_pat_.'; msg.classList.add('err'); return; }
      msg.textContent = 'Vérification…';
      gh(WF, k).then(function (r) {
        if (!r.ok) { msg.textContent = r.status === 404 ? 'Clé refusée : vérifie que le dépôt Marathon-moorea-Jules est bien choisi.' : 'Clé refusée par GitHub (erreur ' + r.status + ').'; msg.classList.add('err'); return; }
        if (!setKey(k)) { msg.textContent = 'Impossible d\'enregistrer la clé (navigation privée ?).'; msg.classList.add('err'); return; }
        close(); run();
      }, function () { msg.textContent = 'Pas de connexion internet.'; msg.classList.add('err'); });
    });
    setTimeout(function () { var i = bg.querySelector('#ghKey'); if (i) i.focus(); }, 50);
  };

  // ----- Launch the sync and wait for the new data -----
  var since = function () { return (window.GARMIN_DATA && window.GARMIN_DATA.fetchedAt) || ''; };
  var waitForData = function (t0) {
    var start = Date.now();
    var tick = function () {
      fetch('data.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d && d.fetchedAt && d.fetchedAt !== t0) { setState(true, 'Nouvelles données !'); location.reload(); return; }
        next();
      }, next);
    };
    var next = function () {
      var m = Math.round((Date.now() - start) / 60000);
      if (Date.now() - start > MAX_WAIT) { setState(false, 'Synchro trop longue, réessaie plus tard'); return; }
      setState(true, m ? 'Synchro en cours… ' + m + ' min' : 'Synchro en cours…');
      setTimeout(tick, EVERY);
    };
    next();
  };
  var run = function () {
    var k = getKey();
    if (!k) { openSetup(); return; }
    setState(true, 'Synchro lancée…');
    gh(WF + '/dispatches', k, { method: 'POST', body: JSON.stringify({ ref: 'main' }) }).then(function (r) {
      if (r.status === 204) { waitForData(since()); return; }
      setState(false, 'Synchro non lancée');
      if (r.status === 401 || r.status === 403 || r.status === 404) { setKey(''); openSetup('Ta clé ne fonctionne plus (expirée ou supprimée). Crée-en une nouvelle.'); }
    }, function () { setState(false, 'Pas de connexion'); });
  };

  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#syncBtn')) run(); });
})();
