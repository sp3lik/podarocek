/* Door 6: hang the key tags in the right order, then give the last password. */
(function (A) {
  'use strict';

  var ID = 6;
  var DRAG_START_PX = 6; // stage px a press must travel before it counts as a drag
  var DROP_REACH_PX = 150; // how far above or below its row a tag can still be dropped
  var SKY_DELAY_MS = 700; // a beat to see the right answer before the sky opens

  function cleanWord(text) {
    return String(text).normalize('NFC').trim().toLowerCase();
  }

  function sortedLetters(letters) {
    return letters.slice().sort().join('');
  }

  // Compares strings, so either A can stand in either place. The try limit only matters for a
  // target whose letters are all the same, which has no other arrangement to find.
  function shuffled(letters, target) {
    var out;
    var tries = 0;
    do {
      out = letters.slice();
      for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var held = out[i];
        out[i] = out[j];
        out[j] = held;
      }
    } while (out.join('') === target && ++tries < 50);
    return out;
  }

  function buildRack(count) {
    var slots = [];
    var node = A.ui.el('div', { class: 'd6-rack', style: { '--d6-n': String(count) } });
    for (var i = 0; i < count; i++) {
      slots.push(A.ui.el('div', { class: 'd6-slot', style: { '--d6-slot': String(i) } }));
      node.appendChild(slots[i]);
    }
    return { node: node, slots: slots };
  }

  function showMissing(room, cfg, root, missing) {
    var ui = A.ui;
    var keyDoors = window.CONTENT.doors.filter(function (d) { return d.letter; });
    var rack = buildRack(keyDoors.length);
    keyDoors.forEach(function (d, i) {
      if (A.store.isSolved(d.id)) {
        rack.node.appendChild(ui.el('div', { class: 'd6-key d6-key-static', style: { '--d6-slot': String(i) } },
          ui.letterTile(d.letter)));
      } else {
        rack.slots[i].appendChild(ui.el('span', { class: 'd6-door-no', 'aria-hidden': 'true' }, String(d.id)));
      }
    });

    // The door numbers get the clearer label font: in the body font a 5 reads like the letter S.
    var doorList = missing.map(function (d) { return ui.t(cfg.missingDoorLabel, { n: d.id }); }).join(', ');
    var sentence = cfg.missingLetters.split('{doors}');
    root.classList.add('is-missing');
    root.appendChild(ui.el('div', { class: 'd6-rack-wrap' }, rack.node));
    root.appendChild(ui.el('div', { class: 'd6-missing' },
      ui.el('p', { class: 'note note-pop d6-missing-note' },
        sentence[0], ui.el('span', { class: 'd6-door-list' }, doorList), sentence[1]),
      ui.button(window.CONTENT.ui.rewardDone, function () { room.close(); }, { primary: true, className: 'd6-back' })));
  }

  function playGame(room, cfg, root, openSky, setSkyTimer) {
    var ui = A.ui;
    var target = cfg.target;
    var arranged = A.store.door(ID).tilesDone === true;

    var letters = A.store.letters().map(function (l) { return l.letter; });
    // An edit in the content file that breaks the anagram must not leave her stuck.
    if (sortedLetters(letters) !== sortedLetters(target.split(''))) letters = target.split('');

    var rack = buildRack(letters.length);
    var keys = [];
    var selected = null;
    var drag = null;
    var skipNextClick = false;

    function keyInSlot(slot) {
      return keys.filter(function (k) { return k.slot === slot; })[0];
    }

    function setSelected(key) {
      if (selected) {
        selected.node.classList.remove('is-selected');
        selected.node.setAttribute('aria-pressed', 'false');
      }
      selected = key;
      if (key) {
        key.node.classList.add('is-selected');
        key.node.setAttribute('aria-pressed', 'true');
      }
    }

    function isRight() {
      return keys.slice().sort(function (a, b) { return a.slot - b.slot; })
        .map(function (k) { return k.letter; }).join('') === target;
    }

    function swap(a, b) {
      var slot = a.slot;
      a.slot = b.slot;
      b.slot = slot;
      a.node.style.setProperty('--d6-slot', String(a.slot));
      b.node.style.setProperty('--d6-slot', String(b.slot));
      if (isRight()) finishTiles();
    }

    function finishTiles() {
      arranged = true;
      A.store.door(ID).tilesDone = true;
      A.store.save();
      setSelected(null);
      keys.forEach(function (k) { k.node.disabled = true; });
      root.classList.add('is-arranged', 'is-just-solved');
      showPassword();
    }

    function onClick(key) {
      if (skipNextClick) {
        skipNextClick = false;
        return;
      }
      if (arranged) return;
      if (selected === key) {
        setSelected(null);
      } else if (selected) {
        var first = selected;
        setSelected(null);
        swap(first, key);
      } else {
        setSelected(key);
      }
    }

    function dropSlot(left, top) {
      var best = 0;
      rack.slots.forEach(function (s, i) {
        if (Math.abs(s.offsetLeft - left) < Math.abs(rack.slots[best].offsetLeft - left)) best = i;
      });
      var pitch = rack.slots[1].offsetLeft - rack.slots[0].offsetLeft;
      var nearX = Math.abs(rack.slots[best].offsetLeft - left) <= pitch * 0.6;
      var nearY = Math.abs(rack.slots[best].offsetTop - top) <= DROP_REACH_PX;
      return nearX && nearY ? best : -1;
    }

    function markDropTarget(slot) {
      keys.forEach(function (k) {
        k.node.classList.toggle('is-target', k.slot === slot && !k.node.classList.contains('is-dragging'));
      });
    }

    function onPress(key, e) {
      skipNextClick = false;
      if (arranged || e.button !== 0) return;
      var p = ui.toStage(e.clientX, e.clientY);
      drag = {
        key: key,
        pointerId: e.pointerId,
        x: p.x,
        y: p.y,
        left: key.node.offsetLeft,
        top: key.node.offsetTop,
        moving: false,
        slot: -1
      };
      key.node.setPointerCapture(e.pointerId);
    }

    function onMove(key, e) {
      if (!drag || drag.key !== key || drag.pointerId !== e.pointerId) return;
      var p = ui.toStage(e.clientX, e.clientY);
      var dx = p.x - drag.x;
      var dy = p.y - drag.y;
      if (!drag.moving) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_START_PX) return;
        drag.moving = true;
        setSelected(null);
        key.node.classList.add('is-dragging');
      }
      key.node.style.left = drag.left + dx + 'px';
      key.node.style.top = drag.top + dy + 'px';
      drag.slot = dropSlot(drag.left + dx, drag.top + dy);
      markDropTarget(drag.slot);
    }

    function onRelease(key, e, dropped) {
      if (!drag || drag.key !== key || drag.pointerId !== e.pointerId) return;
      var finished = drag;
      drag = null;
      if (!finished.moving) return;
      skipNextClick = true; // the browser still sends a click after the mouse comes up
      key.node.classList.remove('is-dragging');
      key.node.style.left = '';
      key.node.style.top = '';
      markDropTarget(-1);
      if (dropped && finished.slot >= 0 && finished.slot !== key.slot) swap(key, keyInSlot(finished.slot));
    }

    function addKey(letter, slot) {
      var node = ui.el('button', {
        type: 'button',
        class: 'd6-key',
        'aria-label': ui.t(cfg.tileAria, { letter: letter }),
        'aria-pressed': 'false',
        disabled: arranged,
        style: { '--d6-slot': String(slot) }
      }, ui.letterTile(letter));
      var key = { letter: letter, slot: slot, node: node };
      node.addEventListener('pointerdown', function (e) { onPress(key, e); });
      node.addEventListener('pointermove', function (e) { onMove(key, e); });
      node.addEventListener('pointerup', function (e) { onRelease(key, e, true); });
      node.addEventListener('pointercancel', function (e) { onRelease(key, e, false); });
      node.addEventListener('click', function () { onClick(key); });
      keys.push(key);
      rack.node.appendChild(node);
    }

    function showPassword() {
      var accepted = cfg.accept.map(cleanWord);
      var inputId = 'd6-password';
      var passed = false;
      var input = ui.el('input', {
        id: inputId,
        class: 'd6-input',
        type: 'text',
        placeholder: cfg.passwordPlaceholder,
        autocomplete: 'off',
        spellcheck: 'false',
        maxlength: '40'
      });
      var submit = ui.button(cfg.passwordSubmit, null, { primary: true, className: 'd6-submit' });
      submit.type = 'submit';
      var form = ui.el('form', { class: 'note note-pop d6-form' },
        ui.el('label', { class: 'd6-label', for: inputId }, cfg.passwordLabel),
        ui.el('div', { class: 'd6-hint' }, cfg.passwordHint),
        ui.el('div', { class: 'd6-row' }, input, submit));
      var wrongLine = ui.el('p', { class: 'd6-wrong', role: 'status' });

      input.addEventListener('input', function () { wrongLine.textContent = ''; });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (passed) return;
        if (accepted.indexOf(cleanWord(input.value)) === -1) {
          form.classList.remove('note-pop'); // its animation would otherwise win over the shake
          ui.shake(form);
          wrongLine.textContent = cfg.passwordWrong;
          input.select();
          return;
        }
        wrongLine.textContent = '';
        passed = true;
        input.readOnly = true;
        submit.disabled = true;
        root.classList.add('is-passed');
        A.store.solve(ID);
        setSkyTimer(setTimeout(openSky, SKY_DELAY_MS));
      });

      root.appendChild(ui.el('div', { class: 'd6-after' },
        ui.el('div', { class: 'd6-correct tile-pop', role: 'status' }, cfg.correctText),
        form,
        wrongLine));
      input.focus({ preventScroll: true });
    }

    (arranged ? target.split('') : shuffled(letters, target)).forEach(addKey);
    if (arranged) root.classList.add('is-arranged');
    else root.appendChild(ui.el('p', { class: 'd6-intro' }, cfg.intro));
    root.appendChild(ui.el('div', { class: 'd6-rack-wrap' }, rack.node));
    if (arranged) showPassword();
  }

  A.doors[ID] = {
    open: function (room, cfg) {
      var skyTimer = 0;
      var root = A.ui.el('div', { class: 'd6-root' }, A.ui.el('div', { class: 'd6-wainscot' }));
      room.body.appendChild(root);

      function openSky() {
        room.close();
        A.sky.open({ onClose: A.hub.refresh });
      }

      var missing = window.CONTENT.doors.filter(function (d) { return d.letter && !A.store.isSolved(d.id); });
      if (A.store.isSolved(ID)) openSky();
      else if (missing.length) showMissing(room, cfg, root, missing);
      else playGame(room, cfg, root, openSky, function (id) { skyTimer = id; });

      return function () { clearTimeout(skyTimer); };
    }
  };
})(window.Astra = window.Astra || {});
