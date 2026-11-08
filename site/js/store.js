/* Progress: JSON in localStorage, with an in-memory fallback when storage is blocked. */
(function (A) {
  'use strict';

  var KEY = 'astra-progress-v1';
  var PREVIEW_KEY = 'astra-progress-preview-v1';

  var memory = null;
  var memoryKey = null;

  // Resolved lazily: preview.js loads after this file.
  function currentKey() {
    return A.preview && A.preview.active ? PREVIEW_KEY : KEY;
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function blank() {
    return { version: 1, solved: {}, doors: {} };
  }

  function normalise(raw) {
    var s = blank();
    if (isPlainObject(raw)) {
      if (isPlainObject(raw.solved)) s.solved = raw.solved;
      if (isPlainObject(raw.doors)) s.doors = raw.doors;
    }
    return s;
  }

  function load() {
    var key = currentKey();
    if (memory && memoryKey === key) return memory;
    var parsed = null;
    try {
      var text = window.localStorage.getItem(key);
      if (text) parsed = JSON.parse(text);
    } catch (e) {
      parsed = null;
    }
    memory = normalise(parsed);
    memoryKey = key;
    return memory;
  }

  function save() {
    var s = load();
    // Another tab may have solved a door since this one loaded: never write that away.
    try {
      var disk = JSON.parse(window.localStorage.getItem(memoryKey) || 'null');
      if (disk && isPlainObject(disk.solved)) {
        Object.keys(disk.solved).forEach(function (id) {
          if (disk.solved[id] === true) s.solved[id] = true;
        });
      }
    } catch (e) { /* unreadable storage: this tab's state wins */ }
    try {
      window.localStorage.setItem(memoryKey, JSON.stringify(s));
      return true;
    } catch (e) {
      return false;
    }
  }

  function door(id) {
    var s = load();
    if (!isPlainObject(s.doors[id])) s.doors[id] = {};
    return s.doors[id];
  }

  function isSolved(id) {
    return load().solved[id] === true;
  }

  function solve(id) {
    if (isSolved(id)) return;
    load().solved[id] = true;
    save();
    if (A.hub && A.hub.refresh) A.hub.refresh();
  }

  // Granted letters follow the content file, so a door's letter is never out of step with it.
  function letters() {
    var out = [];
    window.CONTENT.doors.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (d) {
      if (d.letter && isSolved(d.id)) out.push({ doorId: d.id, letter: d.letter });
    });
    return out;
  }

  function reset() {
    load();
    memory = blank();
    try {
      window.localStorage.removeItem(memoryKey);
    } catch (e) { /* storage blocked: memory is already cleared */ }
    if (A.hub && A.hub.refresh) A.hub.refresh();
  }

  A.store = {
    state: load,
    door: door,
    save: save,
    isSolved: isSolved,
    solve: solve,
    letters: letters,
    reset: reset
  };
})(window.Astra = window.Astra || {});
