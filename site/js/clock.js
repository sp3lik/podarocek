/* Time source: HTTP Date header of the site's own host, device clock only as a last resort. */
(function (A) {
  'use strict';

  var C = window.CONTENT;
  var ABORT_MS = 2500;
  var READY_MAX_MS = 3000;
  var RESYNC_MS = 5 * 60 * 1000;

  var reference = null; // { serverMs, perfMs } once a Date header has been read
  var inFlight = null;

  function probe(method) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ABORT_MS);
    var url = location.origin + location.pathname + '?_clock=' + Date.now() + '-' + Math.floor(performance.now());
    var t0 = performance.now();
    return fetch(url, { method: method, cache: 'no-store', signal: ctrl.signal, credentials: 'same-origin' })
      .then(function (res) {
        var t1 = performance.now();
        var header = res.headers.get('date');
        var ms = header ? Date.parse(header) : NaN;
        if (!isFinite(ms)) throw new Error('no usable Date header');
        // The body of a GET fallback is not needed.
        if (method === 'GET' && res.body && res.body.cancel) res.body.cancel().catch(function () {});
        return { serverMs: ms + (t1 - t0) / 2, perfMs: t1 };
      })
      .finally(function () { clearTimeout(timer); });
  }

  function sync() {
    if (location.protocol === 'file:') return Promise.resolve(false);
    if (inFlight) return inFlight;
    inFlight = probe('HEAD')
      .catch(function () { return probe('GET'); })
      .then(function (ref) {
        reference = ref;
        clock.source = 'server';
        return true;
      })
      .catch(function () {
        // A failed re-sync keeps whatever good reference already exists.
        return false;
      })
      .then(function (ok) {
        inFlight = null;
        return ok;
      });
    return inFlight;
  }

  function trueNow() {
    if (reference) return reference.serverMs + (performance.now() - reference.perfMs);
    return Date.now();
  }

  function override() {
    var p = A.preview;
    return p && p.active && typeof p.nowOverride === 'number' ? p.nowOverride : null;
  }

  function now() {
    var o = override();
    return o === null ? trueNow() : o;
  }

  function unlockMs(door) {
    return Date.parse(door.unlockAt);
  }

  function isUnlocked(door) {
    var p = A.preview;
    if (p && p.active && p.allOpen) return true;
    return now() >= unlockMs(door);
  }

  var partsFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: C.timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric'
  });

  // Wall-clock fields of an instant in CONTENT.timeZone, whatever the device zone is.
  function zoneParts(ms) {
    var out = {};
    partsFormat.formatToParts(new Date(ms)).forEach(function (p) {
      if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
    });
    return out;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatUnlock(door) {
    var p = zoneParts(unlockMs(door));
    var vars = { day: p.day, month: C.ui.months[p.month - 1], time: pad2(p.hour) + ':' + pad2(p.minute) };
    var template = p.hour === 0 && p.minute === 0 ? C.ui.dateOnly : C.ui.dateTime;
    return template.replace(/\{(\w+)\}/g, function (m, k) { return vars[k]; });
  }

  var clock = {
    ready: null,
    source: 'device',
    sync: sync,
    now: now,
    isUnlocked: isUnlocked,
    formatUnlock: formatUnlock,
    zoneParts: zoneParts,
    pad2: pad2
  };

  clock.ready = Promise.race([
    sync(),
    new Promise(function (resolve) { setTimeout(resolve, READY_MAX_MS); })
  ]).then(function () {});

  setInterval(sync, RESYNC_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') sync();
  });

  A.clock = clock;
})(window.Astra = window.Astra || {});
