/* Door 3: guess the hidden words on the key rack behind the front desk. */
(function (A) {
  'use strict';

  var ID = 3;
  var ui = A.ui;

  var MAX_CELL = 54;
  var STAGGER_MS = 100;
  var FLIP_MS = 340;
  var LAST_WORD_PAUSE_MS = 1100;

  // Room around the board that the cell size must leave free: side margins + rack padding,
  // top/bottom margins + rack padding.
  var FREE_W = 96;
  var FREE_H = 44;

  var LETTER = /^[А-ЯЁ]$/; // one upper-case Russian letter
  var YO = 'Ё';
  var YE = 'Е';
  var RANK = { miss: 1, near: 2, hit: 3 };

  // Physical key positions, row by row, matching the letter rows in the content file.
  var CODE_ROWS = [
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period']
  ];

  function plain(upper) {
    return upper === YO ? YE : upper;
  }

  // Splits an answer into typed letters and fixed separators; `spelled` keeps the original letters.
  function parseWord(raw) {
    var shown = String(raw.answer || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    var word = { shown: shown, hint: raw.hint || '', slots: [], letters: [], spelled: [] };
    Array.from(shown).forEach(function (ch) {
      var upper = ch.toUpperCase();
      if (LETTER.test(upper)) {
        word.letters.push(plain(upper));
        word.spelled.push(upper);
        word.slots.push({ letter: true });
      } else {
        word.slots.push({ sep: ch });
      }
    });
    word.key = word.letters.join('');
    return word;
  }

  // Two passes, so a repeated letter is only marked as often as the answer really has it.
  function score(guess, key) {
    var result = [];
    var left = {};
    var i;
    for (i = 0; i < key.length; i++) {
      if (guess[i] === key[i]) result[i] = 'hit';
      else left[key[i]] = (left[key[i]] || 0) + 1;
    }
    for (i = 0; i < key.length; i++) {
      if (result[i]) continue;
      if (left[guess[i]] > 0) {
        result[i] = 'near';
        left[guess[i]]--;
      } else {
        result[i] = 'miss';
      }
    }
    return result;
  }

  A.doors[ID] = {
    open: function (room, cfg) {
      var T = cfg.texts;
      var words = cfg.words.map(parseWord).filter(function (w) { return w.letters.length > 0; });
      var tries = Math.max(1, parseInt(cfg.tries, 10) || 6);
      var keyRows = T.keyboard.map(function (row) { return Array.from(row); });
      var d = A.store.door(ID);

      var codeMap = { Backquote: YE };
      CODE_ROWS.forEach(function (codes, r) {
        codes.forEach(function (code, i) { codeMap[code] = keyRows[r][i]; });
      });

      var closed = false;
      var busy = false;
      var timer = 0;
      var phase = 'play';
      var word = null;
      var n = 0;
      var cells = [];
      var keys = {};
      var keysNode = null;
      var rack = null;
      var rackBox = null;
      var line = null;
      var desk = null;

      var wall = ui.el('div', { class: 'd3-wall' });
      var progressNode = ui.el('span', { class: 'd3-status-word' });
      var triesNode = ui.el('span', { class: 'd3-status-tries' });
      var status = ui.el('div', { class: 'd3-status' }, progressNode, triesNode);

      room.root.classList.add('d3-room');
      room.body.appendChild(ui.el('div', { class: 'd3-deco', 'aria-hidden': 'true' },
        ['d3-sconce d3-sconce-l', 'd3-sconce d3-sconce-r'].map(function (cls) {
          return ui.el('div', { class: cls },
            ui.el('span', { class: 'd3-glow' }), ui.el('span', { class: 'd3-shade' }));
        })));
      room.body.appendChild(wall);

      function setBusy(value) {
        busy = value;
        wall.classList.toggle('is-busy', value);
      }

      function later(fn, ms) {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
      }

      // Each failure after the first opens one more leading letter, up to the whole word.
      function given() {
        return Math.min(n, Math.max(0, d.fails - 1));
      }

      function startWord(index) {
        d.index = index;
        d.sig = words[index].key;
        d.guesses = [];
        d.typed = '';
        d.fails = 0;
        A.store.save();
      }

      function isLetters(text) {
        return typeof text === 'string' && text.split('').every(function (c) { return LETTER.test(c); });
      }

      function restore() {
        if (!(Number.isInteger(d.index) && d.index >= 0 && d.index < words.length)) startWord(0);
        else if (d.sig !== words[d.index].key) startWord(d.index);
        word = words[d.index];
        n = word.letters.length;
        if (!(Number.isInteger(d.fails) && d.fails > 0)) d.fails = 0;
        d.guesses = (Array.isArray(d.guesses) ? d.guesses : []).filter(function (g) {
          return isLetters(g) && g.length === n;
        }).slice(0, tries);
        d.typed = isLetters(d.typed) ? d.typed.slice(0, n - given()) : '';
      }

      function derivePhase() {
        if (d.guesses.indexOf(word.key) !== -1) return 'won';
        return d.guesses.length >= tries ? 'failed' : 'play';
      }

      function lineText() {
        return d.fails > 0 && phase !== 'failed' ? ui.t(T.hintLabel, { hint: word.hint }) : T.intro;
      }

      function paintTries() {
        triesNode.textContent = ui.t(T.triesLeft, { n: Math.max(0, tries - d.guesses.length) });
      }

      function paintStatus() {
        progressNode.textContent = ui.t(T.progress, { n: d.index + 1, total: words.length });
        paintTries();
        line.textContent = lineText();
      }

      function paintBoard() {
        var prefix = given();
        var current = d.guesses.length;
        var winRow = d.guesses.indexOf(word.key);
        cells.forEach(function (rowCells, r) {
          var states = r < current ? score(d.guesses[r], word.key) : null;
          rowCells.forEach(function (cell, i) {
            var ch = '';
            var cls = 'd3-cell';
            if (states) {
              ch = r === winRow ? word.spelled[i] : d.guesses[r][i];
              cls += ' is-' + states[i];
            } else if (r === current && phase === 'play') {
              if (i < prefix) {
                ch = word.letters[i];
                cls += ' is-given';
              } else if (i - prefix < d.typed.length) {
                ch = d.typed[i - prefix];
                cls += ' is-filled';
              } else {
                cls += i - prefix === d.typed.length ? ' is-cursor' : ' is-open';
              }
            }
            cell.className = cls;
            cell.textContent = ch;
          });
        });
      }

      // Colours come from every guess on the board, best result per letter, so they cannot go down.
      function paintKeys() {
        var best = {};
        d.guesses.forEach(function (guess) {
          score(guess, word.key).forEach(function (state, i) {
            var ch = guess[i];
            if (!best[ch] || RANK[state] > RANK[best[ch]]) best[ch] = state;
          });
        });
        Object.keys(keys).forEach(function (ch) {
          keys[ch].className = 'd3-key' + (best[ch] ? ' is-' + best[ch] : '');
        });
      }

      function fitBoard() {
        var w = rackBox.clientWidth - FREE_W;
        var h = rackBox.clientHeight - FREE_H;
        var seps = word.slots.length - n;
        var gap = 6;
        var cols = n + seps - 1;
        var byWidth = (w - gap * cols) / (n + seps * 0.5);
        if (byWidth < 34) {
          gap = 3;
          byWidth = (w - gap * cols) / (n + seps * 0.5);
        }
        var byHeight = (h - gap * (tries - 1)) / tries;
        var cell = Math.max(12, Math.floor(Math.min(MAX_CELL, byWidth, byHeight)));
        rack.style.setProperty('--d3-cell', cell + 'px');
        rack.style.setProperty('--d3-gap', gap + 'px');
        rack.style.setProperty('--d3-font', Math.min(24, Math.round(cell * 0.6)) + 'px');
        rack.classList.toggle('is-small', cell < 36);
      }

      function buildRack() {
        cells = [];
        rack = ui.el('div', { class: 'd3-rack' });
        for (var r = 0; r < tries; r++) {
          var row = ui.el('div', { class: 'd3-row' });
          var rowCells = [];
          word.slots.forEach(function (slot) {
            if (slot.letter) {
              var cell = ui.el('span', { class: 'd3-cell' });
              rowCells.push(cell);
              row.appendChild(cell);
            } else {
              row.appendChild(ui.el('span', { class: 'd3-sep' }, slot.sep === ' ' ? null : slot.sep));
            }
          });
          cells.push(rowCells);
          rack.appendChild(row);
        }
        return rack;
      }

      // Keys never take focus, so a later Enter cannot also press the last clicked key.
      function makeKey(label, aria, action, cls) {
        var b = ui.el('button', { type: 'button', class: cls, tabindex: '-1', 'aria-label': aria }, label);
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', action);
        return b;
      }

      function buildKeys() {
        keys = {};
        keysNode = ui.el('div', { class: 'd3-keys' });
        keyRows.forEach(function (letters, r) {
          var row = ui.el('div', { class: 'd3-keyrow' });
          var last = r === keyRows.length - 1;
          if (last) row.appendChild(makeKey(T.enter, T.enterAria, submit, 'd3-key-wide d3-key-enter'));
          letters.forEach(function (ch) {
            var key = makeKey(ch, ui.t(T.keyAria, { letter: ch }), function () { typeLetter(ch); }, 'd3-key');
            key.dataset.key = ch;
            keys[ch] = key;
            row.appendChild(key);
          });
          if (last) row.appendChild(makeKey(T.backspace, T.backspaceAria, erase, 'd3-key-wide d3-key-erase'));
          keysNode.appendChild(row);
        });
      }

      function slip(lines, action) {
        return ui.el('div', { class: 'd3-slip' },
          ui.el('div', { class: 'd3-slip-text' }, lines), action || null);
      }

      function showDesk() {
        desk.textContent = '';
        if (phase === 'play') {
          desk.appendChild(keysNode);
          return;
        }
        if (phase === 'won') {
          var isLast = d.index >= words.length - 1;
          // The slip replaces the typewriter; the last word goes on to the reward by itself.
          desk.appendChild(slip([
            ui.el('div', { class: 'd3-slip-title' }, T.wonWord),
            ui.el('div', { class: 'd3-slip-word' }, word.shown)
          ], isLast ? null : ui.button(T.nextWord, advance, { primary: true, className: 'd3-next' })));
          return;
        }
        var count = given();
        desk.appendChild(slip([
          ui.el('div', { class: 'd3-slip-title' }, T.failedTitle),
          ui.el('div', { class: 'd3-slip-line d3-hint' }, ui.t(T.hintLabel, { hint: word.hint })),
          count > 0 ? ui.el('div', { class: 'd3-slip-line d3-revealed' }, ui.t(T.revealed, { n: count })) : null
        ], ui.button(T.retry, retry, { primary: true, className: 'd3-retry' })));
      }

      function renderGame() {
        phase = derivePhase();
        wall.textContent = '';
        line = ui.el('div', { class: 'd3-line' });
        rackBox = ui.el('div', { class: 'd3-rackbox' }, buildRack());
        desk = ui.el('div', { class: 'd3-desk-slot' });
        buildKeys();
        wall.appendChild(line);
        wall.appendChild(rackBox);
        wall.appendChild(ui.el('div', { class: 'd3-desk' },
          ui.el('span', { class: 'd3-bell', 'aria-hidden': 'true' }),
          ui.el('span', { class: 'd3-book', 'aria-hidden': 'true' }),
          desk));
        fitBoard();
        paintBoard();
        paintKeys();
        paintStatus();
        showDesk();
      }

      function renderFinal() {
        phase = 'final';
        setBusy(false);
        status.remove();
        wall.textContent = '';
        var box = ui.el('div', { class: 'd3-final' },
          ui.el('h3', { class: 'd3-final-title' }, T.finalTitle),
          ui.el('div', { class: 'd3-found' }, words.map(function (w) {
            return ui.el('span', { class: 'd3-plate' }, w.shown);
          })));
        wall.appendChild(box);
        ui.reward(box, { letter: cfg.letter, note: cfg.note || null, onDone: function () { room.close(); } });
      }

      function typeLetter(ch) {
        if (phase !== 'play' || busy) return;
        if (given() + d.typed.length >= n) return;
        d.typed += ch;
        A.store.save();
        paintBoard();
      }

      function erase() {
        if (phase !== 'play' || busy || !d.typed) return;
        d.typed = d.typed.slice(0, -1);
        A.store.save();
        paintBoard();
      }

      function flipRow(r) {
        var step = Math.min(STAGGER_MS, Math.round(900 / n));
        cells[r].forEach(function (cell, i) {
          cell.style.animationDelay = i * step + 'ms';
          cell.classList.add('is-flip');
        });
        return (n - 1) * step + FLIP_MS;
      }

      function submit() {
        if (phase !== 'play' || busy) return;
        var guess = word.key.slice(0, given()) + d.typed;
        if (guess.length < n) {
          var row = rack.children[d.guesses.length];
          ui.shake(row);
          ui.nudge(row, T.tooShort);
          return;
        }
        d.guesses.push(guess);
        d.typed = '';
        var won = guess === word.key;
        var isLast = d.index >= words.length - 1;
        if (!won && d.guesses.length >= tries) d.fails++;
        A.store.save();
        if (won && isLast) A.store.solve(ID);
        phase = derivePhase();
        setBusy(true);
        paintBoard();
        var wait = flipRow(d.guesses.length - 1);
        paintTries();
        later(function () {
          paintKeys();
          paintStatus();
          showDesk();
          if (won && isLast) {
            later(renderFinal, LAST_WORD_PAUSE_MS);
          } else {
            setBusy(false);
          }
        }, wait);
      }

      function advance() {
        if (phase !== 'won' || busy || d.index >= words.length - 1) return;
        startWord(d.index + 1);
        restore();
        renderGame();
      }

      function retry() {
        if (phase !== 'failed' || busy) return;
        d.guesses = [];
        d.typed = '';
        A.store.save();
        renderGame();
      }

      function letterFromEvent(e) {
        var pressed = typeof e.key === 'string' ? e.key.normalize('NFC').toUpperCase() : '';
        if (LETTER.test(pressed)) return plain(pressed);
        return codeMap[e.code] || null;
      }

      function onKey(e) {
        if (phase === 'final' || e.ctrlKey || e.metaKey || e.altKey) return;
        var target = e.target;
        if (target && target.matches && target.matches('input, textarea, select, [contenteditable]')) return;

        if (e.key === 'Enter') {
          var active = document.activeElement;
          if (active && active.classList && active.classList.contains('room-back')) return;
          e.preventDefault();
          if (e.repeat) return;
          if (phase === 'play') submit();
          else if (phase === 'won') advance();
          else retry();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          erase();
          return;
        }
        var ch = letterFromEvent(e);
        if (!ch) return;
        e.preventDefault();
        if (!e.repeat) typeLetter(ch);
      }

      if (A.store.isSolved(ID) || !words.length) {
        if (!A.store.isSolved(ID)) A.store.solve(ID);
        renderFinal();
      } else {
        restore();
        room.root.querySelector('.room-bar').appendChild(status);
        renderGame();
        document.addEventListener('keydown', onKey);
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function () {
            if (!closed && phase !== 'final') fitBoard();
          });
        }
      }

      return function () {
        closed = true;
        clearTimeout(timer);
        document.removeEventListener('keydown', onKey);
      };
    }
  };
})(window.Astra = window.Astra || {});
