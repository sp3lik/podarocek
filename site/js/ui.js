/* Shared DOM helpers: stage scaling, room shell, reward card, nudges, lightbox. */
(function (A) {
  'use strict';

  var C = window.CONTENT;
  var STAGE_W = 1280;
  var STAGE_H = 720;

  var stage = document.getElementById('stage');
  var k = 1;
  var currentRoom = null;
  var lightboxes = [];
  var currentNudge = null;
  var nudgeTimer = 0;

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return; }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  function el(tag, props) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (name) {
      var value = props[name];
      if (value === null || value === undefined || value === false) return;
      if (name === 'class' || name === 'className') node.className = value;
      else if (name === 'text') node.textContent = value;
      else if (name === 'style' && typeof value === 'object') {
        Object.keys(value).forEach(function (s) {
          if (s.indexOf('--') === 0) node.style.setProperty(s, value[s]);
          else node.style[s] = value[s];
        });
      } else if (name === 'dataset') {
        Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
      } else if (name.slice(0, 2) === 'on' && typeof value === 'function') {
        node.addEventListener(name.slice(2).toLowerCase(), value);
      } else if (value === true) node.setAttribute(name, '');
      else node.setAttribute(name, value);
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function t(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (m, key) {
      return vars && vars[key] !== undefined ? vars[key] : m;
    });
  }

  function fit() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    k = Math.min(w / STAGE_W, h / STAGE_H);
    var x = Math.round((w - STAGE_W * k) / 2);
    var y = Math.round((h - STAGE_H * k) / 2);
    stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + k + ')';
  }

  function scale() {
    return k;
  }

  function toStage(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    return { x: (clientX - r.left) / k, y: (clientY - r.top) / k };
  }

  function button(label, onClick, opts) {
    opts = opts || {};
    var cls = 'btn' + (opts.primary ? ' btn-primary' : '') + (opts.small ? ' btn-small' : '') +
      (opts.className ? ' ' + opts.className : '');
    var b = el('button', { type: 'button', class: cls, 'aria-label': opts.ariaLabel, disabled: opts.disabled }, label);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function closeNudge() {
    clearTimeout(nudgeTimer);
    if (currentNudge) currentNudge.remove();
    currentNudge = null;
  }

  function nudge(anchor, text) {
    closeNudge();
    var n = el('div', { class: 'nudge', role: 'status' }, text);
    stage.appendChild(n);
    currentNudge = n;

    var s = stage.getBoundingClientRect();
    var a = anchor.getBoundingClientRect();
    var centre = (a.left + a.width / 2 - s.left) / k;
    var w = n.offsetWidth;
    var h = n.offsetHeight;
    var x = Math.min(Math.max(centre - w / 2, 8), STAGE_W - w - 8);
    var y = (a.top - s.top) / k - h - 16;
    if (y < 8) {
      y = (a.bottom - s.top) / k + 16;
      n.classList.add('nudge-below');
    }
    n.style.left = Math.round(x) + 'px';
    n.style.top = Math.round(y) + 'px';
    n.style.setProperty('--arrow-x', Math.round(centre - x - 6) + 'px');
    nudgeTimer = setTimeout(closeNudge, 3000);
    return n;
  }

  function shake(element) {
    element.classList.remove('shake');
    void element.offsetWidth; // restart the animation on repeated clicks
    element.classList.add('shake');
    element.addEventListener('animationend', function done(e) {
      if (e.target !== element) return;
      element.classList.remove('shake');
      element.removeEventListener('animationend', done);
    });
  }

  function letterTile(letter, opts) {
    opts = opts || {};
    var cls = 'tile' + (opts.small ? ' tile-small' : '') + (opts.className ? ' ' + opts.className : '');
    return el('div', { class: cls, role: 'img', 'aria-label': t(C.ui.letterAria, { letter: letter }) },
      el('span', { class: 'tile-hole', 'aria-hidden': 'true' }),
      el('span', { class: 'tile-letter', 'aria-hidden': 'true' }, letter));
  }

  var REWARD_QUIET_MS = 600;
  var DOUBLE_CLICK_MS = 700;

  function reward(container, o) {
    o = o || {};
    var root = el('div', { class: 'reward' });
    var main = el('div', { class: 'reward-main' });
    if (o.note || o.noteTitle || o.image) {
      main.appendChild(el('div', { class: 'note note-pop' },
        o.noteTitle ? el('h3', { class: 'note-title' }, o.noteTitle) : null,
        o.image ? el('img', { class: 'note-image', src: o.image, alt: o.imageAlt || '' }) : null,
        o.note ? el('p', { class: 'note-text' }, o.note) : null));
    }
    if (o.letter) {
      main.appendChild(el('div', { class: 'reward-letter' },
        letterTile(o.letter, { className: 'tile-pop' }),
        el('div', { class: 'reward-letter-label' }, C.ui.letterFound)));
    }
    root.appendChild(main);
    var foot = el('div', { class: 'reward-foot' });
    append(foot, o.extra);
    if (o.onDone) {
      // The button can appear right under a cursor that is still clicking, so a mouse
      // press only counts after a short quiet moment. The note is never dismissed unread.
      var lastPress = performance.now();
      var quiet = false;
      var doneButton = button(C.ui.rewardDone, function (e) {
        if (e && e.detail > 0 && !quiet) return;
        o.onDone(e);
      }, { primary: true });
      doneButton.addEventListener('pointerdown', function () {
        var now = performance.now();
        quiet = now - lastPress >= REWARD_QUIET_MS;
        lastPress = now;
      });
      foot.appendChild(doneButton);
    }
    if (foot.childNodes.length) root.appendChild(foot);
    container.appendChild(root);
    return root;
  }

  function lightbox(node, opts) {
    opts = opts || {};
    var closed = false;
    var root;
    function close() {
      if (closed) return;
      closed = true;
      lightboxes.splice(lightboxes.indexOf(close), 1);
      root.remove();
      if (opts.onClose) opts.onClose();
    }
    root = el('div', { class: 'lightbox', role: 'dialog' },
      el('div', { class: 'lightbox-panel' }, node),
      button(C.ui.close, close, { className: 'lightbox-close' }));
    root.addEventListener('click', function (e) {
      if (e.target === root) close();
    });
    stage.appendChild(root);
    lightboxes.push(close);
    return close;
  }

  function blurActive() {
    var active = document.activeElement;
    if (active && active !== document.body && active.blur) active.blur();
  }

  function openRoom(o) {
    if (currentRoom) currentRoom.close();
    closeNudge();
    blurActive(); // so Enter/Space inside a room cannot re-trigger the hub door

    var body = el('div', { class: 'room-body' });
    var handle;
    var backBtn = button(C.ui.back, function () { handle.close(); }, { className: 'room-back' });
    var root = el('section', {
      class: 'room' + (o.className ? ' ' + o.className : ''),
      role: 'dialog',
      'aria-label': o.title || null,
      dataset: { door: String(o.doorId) }
    }, el('header', { class: 'room-bar' }, backBtn, el('h2', { class: 'room-title' }, o.title || '')), body);

    // The second click of a double-click on a hallway door must not press what is behind it.
    var openedAt = performance.now();
    root.addEventListener('click', function (e) {
      if (e.detail > 1 && performance.now() - openedAt < DOUBLE_CLICK_MS) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    var closed = false;
    handle = {
      root: root,
      body: body,
      close: function () {
        if (closed) return;
        closed = true;
        lightboxes.slice().forEach(function (c) { c(); });
        closeNudge();
        root.remove();
        if (currentRoom === handle) currentRoom = null;
        if (o.onClose) o.onClose();
      }
    };
    stage.appendChild(root);
    currentRoom = handle;
    return handle;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (lightboxes.length) {
      lightboxes[lightboxes.length - 1]();
      e.preventDefault();
      e.stopImmediatePropagation(); // Esc closes one layer at a time
    } else if (currentRoom) {
      currentRoom.close();
      e.preventDefault();
    }
  });

  window.addEventListener('resize', fit);
  fit();

  A.doors = A.doors || {};
  A.ui = {
    el: el,
    t: t,
    stage: stage,
    scale: scale,
    toStage: toStage,
    openRoom: openRoom,
    reward: reward,
    letterTile: letterTile,
    nudge: nudge,
    shake: shake,
    lightbox: lightbox,
    button: button
  };
})(window.Astra = window.Astra || {});
