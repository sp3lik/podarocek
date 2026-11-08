/* The hallway: doors, stars, sprites, letter inventory. */
(function (A) {
  'use strict';

  var C = window.CONTENT;
  var ART_PX = 3;
  var RECHECK_MS = 5000;

  var ui = A.ui;
  var root = null;
  var doorNodes = {};
  var slotNodes = {};
  var slotLetters = {};
  var recheckTimer = 0;
  var clockSettled = false; // until then the device clock must not open a door, even briefly
  var animateFlips = false;

  function px(artValue) {
    return artValue * ART_PX + 'px';
  }

  function stateOf(cfg) {
    if (A.store.isSolved(cfg.id)) return 'solved';
    return clockSettled && A.clock.isUnlocked(cfg) ? 'ready' : 'locked';
  }

  var doorImage = { locked: C.hub.doorLocked, ready: C.hub.doorReady, solved: C.hub.doorSolved };

  // Held so that swapping a door's image never interrupts a download or flashes empty.
  var preloaded = [C.hub.doorLocked, C.hub.doorReady, C.hub.doorSolved, C.hub.starOff, C.hub.starOn].map(function (src) {
    var image = new Image();
    image.src = src;
    return image;
  });

  function doorAria(cfg, state) {
    return ui.t(C.ui.doorAria[state], { n: cfg.id, date: A.clock.formatUnlock(cfg) });
  }

  function openDoor(cfg) {
    if (cfg.id === 6 && A.store.isSolved(6)) {
      A.sky.open({ onClose: refresh });
      return;
    }
    var cleanup = null;
    var room = ui.openRoom({
      doorId: cfg.id,
      title: cfg.title,
      className: 'room-d' + cfg.id,
      onClose: function () {
        if (typeof cleanup === 'function') {
          try { cleanup(); } catch (e) { console.error(e); }
        }
        refresh();
      }
    });
    try {
      cleanup = A.doors[cfg.id].open(room, cfg);
    } catch (e) {
      console.error(e);
      room.body.appendChild(ui.el('p', { class: 'room-error' }, C.ui.doorError));
    }
  }

  function clickDoor(cfg) {
    var node = doorNodes[cfg.id];
    if (node.deciding) return;
    node.deciding = true;
    // Until the first time sync settles, the clock may still be the device clock.
    A.clock.ready.then(function () {
      node.deciding = false;
      if (A.store.isSolved(cfg.id) || A.clock.isUnlocked(cfg)) {
        openDoor(cfg);
      } else {
        ui.shake(node.button);
        ui.nudge(node.star, ui.t(C.ui.opensAt, { date: A.clock.formatUnlock(cfg) }));
      }
    });
  }

  function buildDoor(cfg, index) {
    var pos = C.hub.doors[index];
    var image = ui.el('img', { class: 'door-img art', alt: '', draggable: 'false' });
    var number = ui.el('span', { class: 'door-num', 'aria-hidden': 'true' }, String(cfg.id));
    var btn = ui.el('button', {
      type: 'button',
      class: 'door',
      dataset: { door: String(cfg.id) },
      style: { left: px(pos.x), top: px(pos.y), width: px(C.hub.doorWidth), height: px(C.hub.doorHeight) }
    }, image, number);
    // detail > 1 is the second click of a double-click: it was meant for whatever was on top.
    btn.addEventListener('click', function (e) { if (e.detail <= 1) clickDoor(cfg); });

    var star = ui.el('img', {
      class: 'door-star art',
      draggable: 'false',
      dataset: { door: String(cfg.id) },
      style: {
        left: px(pos.x + (C.hub.doorWidth - C.hub.starSize) / 2),
        top: px(C.hub.starY),
        width: px(C.hub.starSize),
        height: px(C.hub.starSize)
      }
    });
    doorNodes[cfg.id] = { button: btn, image: image, star: star, state: null, deciding: false };
    root.appendChild(star);
    root.appendChild(btn);
  }

  function buildSprite(spec, pos, who, label) {
    var w = spec.frameWidth * spec.scale;
    var h = spec.frameHeight * spec.scale;
    var node = ui.el('button', {
      type: 'button',
      class: 'sprite sprite-' + who,
      'aria-label': label,
      onClick: function () { ui.nudge(node, C.hub.speech[who]); },
      style: {
        left: px(pos.x),
        top: px(pos.y),
        width: w + 'px',
        height: h + 'px',
        backgroundImage: 'url("' + spec.src + '")',
        backgroundSize: spec.frames * w + 'px ' + h + 'px'
      }
    });
    if (spec.frames > 1) {
      node.style.setProperty('--sheet-width', -(spec.frames * w) + 'px');
      node.style.animation = 'sprite-cycle ' + spec.frames / spec.fps + 's steps(' + spec.frames + ') infinite';
    } else {
      node.classList.add('sprite-float');
    }
    return node;
  }

  function buildInventory() {
    var slots = ui.el('div', { class: 'inventory-slots' });
    C.doors.forEach(function (d) {
      if (!d.letter) return;
      slotNodes[d.id] = ui.el('div', { class: 'slot', dataset: { door: String(d.id) }, 'aria-label': C.ui.emptySlotAria });
      slots.appendChild(slotNodes[d.id]);
    });
    return ui.el('div', { class: 'inventory', role: 'group', 'aria-label': C.ui.inventoryAria },
      ui.el('div', { class: 'inventory-title' }, C.hub.inventoryTitle), slots);
  }

  function refreshInventory() {
    var granted = {};
    A.store.letters().forEach(function (l) { granted[l.doorId] = l.letter; });
    Object.keys(slotNodes).forEach(function (id) {
      var letter = granted[id] || null;
      if (slotLetters[id] === letter) return;
      slotLetters[id] = letter;
      var slot = slotNodes[id];
      slot.textContent = '';
      if (letter) {
        slot.removeAttribute('aria-label');
        slot.appendChild(ui.letterTile(letter, { small: true }));
      } else {
        slot.setAttribute('aria-label', C.ui.emptySlotAria);
      }
    });
  }

  function refresh() {
    if (!root) return;
    C.doors.forEach(function (cfg) {
      var node = doorNodes[cfg.id];
      var state = stateOf(cfg);
      if (node.state === state) return;
      var flipped = animateFlips && node.state === 'locked' && state === 'ready';
      node.state = state;
      node.image.src = doorImage[state];
      node.button.className = 'door is-' + state + (flipped ? ' just-opened' : '');
      node.button.dataset.state = state;
      node.button.setAttribute('aria-label', doorAria(cfg, state));
      var lit = state === 'solved';
      node.star.src = lit ? C.hub.starOn : C.hub.starOff;
      node.star.alt = lit ? C.ui.alt.starOn : C.ui.alt.starOff;
      node.star.classList.toggle('is-lit', lit);
    });
    refreshInventory();
  }

  function render() {
    if (root) root.remove();
    clearInterval(recheckTimer);
    doorNodes = {};
    slotNodes = {};
    slotLetters = {};
    root = ui.el('div', { class: 'hub', id: 'hub' },
      ui.el('img', { class: 'hub-bg art', src: C.hub.background, alt: C.ui.alt.hallway, draggable: 'false' }));
    C.doors.forEach(buildDoor);
    root.appendChild(buildSprite(C.sprites.me, C.hub.me, 'me', C.ui.alt.me));
    root.appendChild(buildSprite(C.sprites.her, C.hub.her, 'her', C.ui.alt.her));
    root.appendChild(buildInventory());
    ui.stage.appendChild(root);
    refresh();
    // Doors flip open on their own while the page stays open.
    recheckTimer = setInterval(refresh, RECHECK_MS);
  }

  A.clock.ready.then(function () {
    clockSettled = true;
    refresh();
    animateFlips = true;
  });

  A.hub = { render: render, refresh: refresh, preloaded: preloaded };
})(window.Astra = window.Astra || {});
