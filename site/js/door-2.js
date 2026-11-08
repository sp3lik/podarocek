/* Door 2: a jigsaw of a photo. One canvas in logical (stage) coordinates. */
(function (A) {
  'use strict';

  var ID = 2;

  // The canvas is laid out at this size on the 1280x720 stage; the backing store follows the real scale.
  var W = 1280;
  var H = 592;
  var BOARD_MAX_W = 560;
  var BOARD_MAX_H = 512;
  var FRAME = 16;       // full thickness of the brass frame around the board
  var NOTCH = 4;        // stepped frame corners
  var EDGE_GAP = 6;     // a piece's whole outline stays this far inside the canvas
  var SPRITE_PAD = 3;   // room around a piece's outline for its stroke
  var GUIDE_ALPHA = 0.22;
  var FLASH_MS = 420;
  var REVEAL_MS = 520;  // seams melt into the whole photo
  var FINISH_MS = 1250; // then the note arrives

  var SHADOW = 'rgba(6, 4, 16, 0.55)';
  var RIM = 'rgba(255, 224, 170, 0.34)';

  // The running game's read-only view, for the automated tests.
  var snapshotOfCurrent = null;

  function token(name) {
    return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function seededRandom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  // One cut, as a start point and nine control points (three cubic curves), in board coordinates.
  // The knob's size depends on the piece's short side only, so tall pieces keep a sane shape.
  // sign > 0 bulges towards +y (a horizontal cut) or +x (a vertical cut); both neighbours share these points.
  function cut(x0, y0, horizontal, length, sign, t) {
    var m = length / 2;
    return [
      [0, 0],
      [0.2 * length, 0], [m, -t], [m - t, t],
      [m - 2 * t, 3 * t], [m + 2 * t, 3 * t], [m + t, t],
      [m, -t], [0.8 * length, 0], [length, 0]
    ].map(function (q) {
      return horizontal ? [x0 + q[0], y0 + q[1] * sign] : [x0 + q[1] * sign, y0 + q[0]];
    });
  }

  function traceCut(path, points, sign, originX, originY) {
    if (!sign) {
      path.lineTo(points[9][0] - originX, points[9][1] - originY);
      return;
    }
    for (var i = 1; i < points.length; i += 3) {
      path.bezierCurveTo(
        points[i][0] - originX, points[i][1] - originY,
        points[i + 1][0] - originX, points[i + 1][1] - originY,
        points[i + 2][0] - originX, points[i + 2][1] - originY
      );
    }
  }

  function randomCuts(rows, cols) {
    var rand = seededRandom(rows * 1009 + cols * 31); // the same shapes on every visit
    var across = [];
    var down = [];
    var r, c;
    function pick() { return rand() < 0.5 ? 1 : -1; }
    for (r = 0; r <= rows; r++) {
      across[r] = [];
      for (c = 0; c < cols; c++) across[r][c] = r === 0 || r === rows ? 0 : pick();
    }
    for (r = 0; r < rows; r++) {
      down[r] = [];
      for (c = 0; c <= cols; c++) down[r][c] = c === 0 || c === cols ? 0 : pick();
    }
    return { across: across, down: down };
  }

  function buildPieces(board, rows, cols) {
    var cuts = randomCuts(rows, cols);
    var pw = board.pw;
    var ph = board.ph;
    var t = 0.1 * Math.min(pw, ph);
    var pieces = [];

    // How far a side's control points may reach past the piece's straight edge.
    function reach(tab) {
      return tab === 0 ? 0 : tab > 0 ? 3 * t : t;
    }

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x0 = c * pw;
        var y0 = r * ph;
        var x1 = x0 + pw;
        var y1 = y0 + ph;
        var sTop = cuts.across[r][c];
        var sBottom = cuts.across[r + 1][c];
        var sLeft = cuts.down[r][c];
        var sRight = cuts.down[r][c + 1];

        var path = new Path2D();
        path.moveTo(0, 0);
        traceCut(path, cut(x0, y0, true, pw, sTop, t), sTop, x0, y0);
        traceCut(path, cut(x1, y0, false, ph, sRight, t), sRight, x0, y0);
        traceCut(path, cut(x0, y1, true, pw, sBottom, t).reverse(), sBottom, x0, y0);
        traceCut(path, cut(x0, y0, false, ph, sLeft, t).reverse(), sLeft, x0, y0);
        path.closePath();

        // tabs: +1 knob sticking out of this piece, -1 socket cut into it, 0 straight border
        var tabs = { top: -sTop, right: sRight, bottom: sBottom, left: -sLeft };
        pieces.push({
          id: r * cols + c,
          row: r,
          col: c,
          path: path,
          tabs: tabs,
          left: -reach(tabs.left),
          top: -reach(tabs.top),
          right: pw + reach(tabs.right),
          bottom: ph + reach(tabs.bottom),
          homeX: board.x + x0,
          homeY: board.y + y0,
          x: 0,
          y: 0,
          placed: false,
          flashAt: -1,
          sprite: null
        });
      }
    }
    return pieces;
  }

  function showReward(room, cfg) {
    room.body.textContent = '';
    var holder = A.ui.el('div', { class: 'd2-reward' });
    room.body.appendChild(holder);
    var card = A.ui.reward(holder, {
      noteTitle: cfg.solvedText,
      image: cfg.image,
      imageAlt: cfg.imageAlt,
      note: cfg.note,
      letter: cfg.letter,
      onDone: function () { room.close(); }
    });
    var photo = card.querySelector('.note-image');
    if (photo) {
      // The note and the letter still count when the photo cannot be fetched.
      photo.addEventListener('error', function () { photo.remove(); });
    }
  }

  function startGame(room, cfg) {
    var ui = A.ui;
    var rows = Math.max(1, cfg.rows | 0);
    var cols = Math.max(1, cfg.cols | 0);
    var gridKey = cols + 'x' + rows;

    var canvas = ui.el('canvas', {
      class: 'd2-canvas',
      role: 'img',
      'aria-label': cfg.imageAlt,
      hidden: true,
      style: { width: W + 'px', height: H + 'px' }
    });
    var status = ui.el('div', { class: 'd2-status' });
    var shell = ui.el('div', { class: 'd2-root' }, ui.el('p', { class: 'd2-intro' }, cfg.intro), canvas, status);
    room.body.appendChild(shell);

    var ctx = canvas.getContext('2d');
    var colors = {
      ink: token('--ink'),
      night: token('--night'),
      brass: token('--brass'),
      lamp: token('--lamp'),
      brassDark: '#a87722'
    };

    var stopped = false;
    var image = null;
    var attempts = 0;
    var board = null;
    var pieces = [];
    var loose = [];        // bottom to top
    var tolerance = 0;
    var photo = null;      // the photo at board size and backing scale
    var backing = 0;
    var layersStale = true;
    var drag = null;
    var raf = 0;
    var finishing = false;
    var finishStart = 0;
    var finishTimer = 0;

    /* ---------- loading ---------- */

    function showStatus(text, withRetry) {
      status.textContent = '';
      status.appendChild(ui.el('p', { class: 'd2-status-text' }, text));
      if (withRetry) status.appendChild(ui.button(cfg.retry, load, { primary: true, className: 'd2-retry' }));
      status.hidden = false;
    }

    function load() {
      attempts++;
      showStatus(cfg.loading, false);
      canvas.hidden = true;
      var candidate = new Image();
      image = candidate;
      function failed() {
        if (stopped || candidate !== image) return;
        showStatus(cfg.loadError, true);
      }
      candidate.onerror = failed;
      candidate.onload = function () {
        if (stopped || candidate !== image) return;
        if (!candidate.naturalWidth || !candidate.naturalHeight) { failed(); return; }
        begin();
      };
      // A retry asks past any cached failure.
      candidate.src = attempts === 1 ? cfg.image : cfg.image + (cfg.image.indexOf('?') < 0 ? '?' : '&') + 'retry=' + attempts;
    }

    function begin() {
      layOut();
      status.hidden = true;
      canvas.hidden = false;
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('lostpointercapture', onUp);
      window.addEventListener('resize', onResize);
      schedule();
      if (!loose.length) complete();
    }

    /* ---------- geometry ---------- */

    function layOut() {
      var aspect = image.naturalWidth / image.naturalHeight;
      var bw = BOARD_MAX_W;
      var bh = bw / aspect;
      if (bh > BOARD_MAX_H) {
        bh = BOARD_MAX_H;
        bw = bh * aspect;
      }
      var pw = Math.max(1, Math.round(bw / cols));
      var ph = Math.max(1, Math.round(bh / rows));
      bw = pw * cols;
      bh = ph * rows;
      board = { x: Math.round((W - bw) / 2), y: Math.round((H - bh) / 2), w: bw, h: bh, pw: pw, ph: ph };
      tolerance = Math.max(22, Math.min(48, 0.26 * Math.min(pw, ph)));

      pieces = buildPieces(board, rows, cols);
      var saved = savedPlaced();
      pieces.forEach(function (p) {
        if (saved[p.id]) {
          p.placed = true;
          p.x = p.homeX;
          p.y = p.homeY;
        } else {
          loose.push(p);
        }
      });
      scatter();
    }

    function bestColumns(count, zoneW, zoneH) {
      var best = 1;
      var bestFit = 0;
      var cellW = board.pw * 1.4;
      var cellH = board.ph * 1.4;
      for (var c = 1; c <= count; c++) {
        var fit = Math.min(zoneW / c / cellW, zoneH / Math.ceil(count / c) / cellH);
        if (fit > bestFit + 1e-6) {
          best = c;
          bestFit = fit;
        }
      }
      return best;
    }

    function dealInto(list, zoneX, zoneW) {
      if (!list.length) return;
      var zoneH = H - 2 * EDGE_GAP;
      var columns = bestColumns(list.length, zoneW, zoneH);
      var lines = Math.ceil(list.length / columns);
      var cellW = zoneW / columns;
      var cellH = zoneH / lines;
      list.forEach(function (p, i) {
        var spareX = Math.max(0, (cellW - (p.right - p.left)) / 2);
        var spareY = Math.max(0, (cellH - (p.bottom - p.top)) / 2);
        var cx = zoneX + cellW * (i % columns + 0.5);
        var cy = EDGE_GAP + cellH * (Math.floor(i / columns) + 0.5);
        p.x = cx - (p.left + p.right) / 2 + (Math.random() - 0.5) * Math.min(spareX, 16) * 2;
        p.y = cy - (p.top + p.bottom) / 2 + (Math.random() - 0.5) * Math.min(spareY, 16) * 2;
        p.x = Math.max(zoneX - p.left, Math.min(zoneX + zoneW - p.right, p.x)); // clear of the frame
        keepOnCanvas(p);
      });
    }

    function scatter() {
      var deal = shuffle(loose.slice());
      var half = Math.ceil(deal.length / 2);
      var zoneW = board.x - FRAME - 2 * EDGE_GAP;
      dealInto(deal.slice(0, half), EDGE_GAP, zoneW);
      dealInto(deal.slice(half), board.x + board.w + FRAME + EDGE_GAP, zoneW);
    }

    function keepOnCanvas(p) {
      p.x = Math.max(EDGE_GAP - p.left, Math.min(W - EDGE_GAP - p.right, p.x));
      p.y = Math.max(EDGE_GAP - p.top, Math.min(H - EDGE_GAP - p.bottom, p.y));
    }

    /* ---------- persistence ---------- */

    function savedPlaced() {
      var saved = A.store.door(ID);
      var result = {};
      if (saved.grid !== gridKey || !Array.isArray(saved.placed)) return result;
      saved.placed.forEach(function (id) {
        if (id === (id | 0) && id >= 0 && id < rows * cols) result[id] = true;
      });
      return result;
    }

    function persistPlaced() {
      var saved = A.store.door(ID);
      saved.grid = gridKey;
      saved.placed = pieces.filter(function (p) { return p.placed; }).map(function (p) { return p.id; });
      A.store.save();
    }

    /* ---------- pointer input ---------- */

    // Canvas-rect ratios: stays right through any stage scale, and through a resize mid-drag.
    function toLogical(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
    }

    function pieceAt(x, y) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // paths and the point are both in logical units
      var hit = null;
      for (var i = loose.length - 1; i >= 0 && !hit; i--) {
        if (ctx.isPointInPath(loose[i].path, x - loose[i].x, y - loose[i].y)) hit = loose[i];
      }
      ctx.restore();
      return hit;
    }

    function onDown(e) {
      if (e.button !== 0 || drag || finishing) return;
      var at = toLogical(e);
      var piece = pieceAt(at.x, at.y);
      if (!piece) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the drag still works inside the canvas */ }
      loose.splice(loose.indexOf(piece), 1);
      loose.push(piece);
      drag = { piece: piece, pointerId: e.pointerId, dx: at.x - piece.x, dy: at.y - piece.y };
      canvas.style.cursor = 'grabbing';
      schedule();
    }

    function onMove(e) {
      var at = toLogical(e);
      if (!drag) {
        if (!finishing) canvas.style.cursor = pieceAt(at.x, at.y) ? 'grab' : 'default';
        return;
      }
      if (e.pointerId !== drag.pointerId) return;
      if (!(e.buttons & 1)) { // the release happened somewhere we could not hear it
        endDrag();
        return;
      }
      drag.piece.x = at.x - drag.dx;
      drag.piece.y = at.y - drag.dy;
      keepOnCanvas(drag.piece);
      schedule();
    }

    function onUp(e) {
      if (drag && e.pointerId === drag.pointerId) endDrag();
    }

    function endDrag() {
      var piece = drag.piece;
      var pointerId = drag.pointerId;
      drag = null;
      try { canvas.releasePointerCapture(pointerId); } catch (err) { /* already released */ }
      canvas.style.cursor = 'default';
      if (Math.hypot(piece.x - piece.homeX, piece.y - piece.homeY) <= tolerance) lockIn(piece);
      schedule();
    }

    function lockIn(piece) {
      piece.x = piece.homeX;
      piece.y = piece.homeY;
      piece.placed = true;
      piece.flashAt = performance.now();
      loose.splice(loose.indexOf(piece), 1);
      persistPlaced();
      if (!loose.length) complete();
    }

    function complete() {
      if (finishing) return;
      finishing = true;
      finishStart = performance.now();
      canvas.style.cursor = 'default';
      A.store.solve(ID); // at once, so closing the room during the reveal loses nothing
      finishTimer = setTimeout(function () {
        stop();
        showReward(room, cfg);
      }, FINISH_MS);
      schedule();
    }

    function onResize() {
      if (backingScale() !== backing) {
        layersStale = true;
        schedule();
      }
    }

    /* ---------- drawing ---------- */

    function backingScale() {
      return Math.max(1, Math.min(3, ui.scale() * (window.devicePixelRatio || 1)));
    }

    function rebuildLayers() {
      backing = backingScale();
      canvas.width = Math.round(W * backing);
      canvas.height = Math.round(H * backing);

      photo = document.createElement('canvas');
      photo.width = Math.round(board.w * backing);
      photo.height = Math.round(board.h * backing);
      var g = photo.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, 0, 0, photo.width, photo.height);

      pieces.forEach(buildSprite);
      layersStale = false;
    }

    function buildSprite(p) {
      var sprite = document.createElement('canvas');
      sprite.width = Math.ceil((p.right - p.left + 2 * SPRITE_PAD) * backing);
      sprite.height = Math.ceil((p.bottom - p.top + 2 * SPRITE_PAD) * backing);
      var g = sprite.getContext('2d');
      g.setTransform(backing, 0, 0, backing, (SPRITE_PAD - p.left) * backing, (SPRITE_PAD - p.top) * backing);
      g.lineJoin = 'round';

      g.save();
      g.clip(p.path);
      g.drawImage(photo, -p.col * board.pw, -p.row * board.ph, board.w, board.h);
      g.lineWidth = 5;
      g.strokeStyle = RIM; // only the inner half survives the clip
      g.stroke(p.path);
      g.restore();

      g.lineWidth = 2;
      g.strokeStyle = colors.ink;
      g.stroke(p.path);
      p.sprite = sprite;
    }

    function notched(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x + NOTCH, y, w - 2 * NOTCH, h);
      ctx.fillRect(x, y + NOTCH, w, h - 2 * NOTCH);
    }

    function around(inset, color) {
      notched(board.x - inset, board.y - inset, board.w + 2 * inset, board.h + 2 * inset, color);
    }

    function drawBoard() {
      around(FRAME, colors.ink);
      around(FRAME - 4, colors.brass);

      var outer = FRAME - 8; // bevel strips on the brass
      ctx.fillStyle = colors.lamp;
      ctx.fillRect(board.x - outer, board.y - FRAME + 4, board.w + 2 * outer, 4);
      ctx.fillRect(board.x - FRAME + 4, board.y - outer, 4, board.h + 2 * outer);
      ctx.fillStyle = colors.brassDark;
      ctx.fillRect(board.x - outer, board.y + board.h + outer, board.w + 2 * outer, 4);
      ctx.fillRect(board.x + board.w + outer, board.y - outer, 4, board.h + 2 * outer);

      around(4, colors.ink);
      ctx.fillStyle = colors.night;
      ctx.fillRect(board.x, board.y, board.w, board.h);

      ctx.globalAlpha = GUIDE_ALPHA;
      ctx.drawImage(photo, board.x, board.y, board.w, board.h);
      ctx.globalAlpha = 1;
    }

    function drawSprite(p) {
      ctx.drawImage(p.sprite,
        p.x + p.left - SPRITE_PAD, p.y + p.top - SPRITE_PAD,
        p.sprite.width / backing, p.sprite.height / backing);
    }

    function drawLoose(p) {
      var carried = !!drag && drag.piece === p;
      var lift = carried ? 12 : 5;
      ctx.save();
      ctx.translate(p.x + lift, p.y + lift + 1);
      ctx.fillStyle = SHADOW;
      ctx.fill(p.path);
      ctx.restore();

      drawSprite(p);

      if (carried) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = colors.lamp;
        ctx.stroke(p.path);
        ctx.restore();
      }
    }

    function drawFlash(p, now) {
      var age = (now - p.flashAt) / FLASH_MS;
      if (p.flashAt < 0 || age >= 1) return false;
      var strength = 1 - Math.max(0, age);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = strength * 0.3;
      ctx.fillStyle = colors.lamp;
      ctx.fill(p.path);
      ctx.globalAlpha = strength;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colors.lamp;
      ctx.stroke(p.path);
      ctx.restore();
      return true;
    }

    function drawFrame(now) {
      if (layersStale) rebuildLayers();

      ctx.setTransform(backing, 0, 0, backing, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingQuality = 'high';
      drawBoard();

      var animating = false;
      pieces.forEach(function (p) { if (p.placed) drawSprite(p); });
      pieces.forEach(function (p) { if (p.placed && drawFlash(p, now)) animating = true; });

      if (finishing) {
        var reveal = Math.max(0, Math.min(1, (now - finishStart) / REVEAL_MS));
        ctx.globalAlpha = reveal;
        ctx.drawImage(photo, board.x, board.y, board.w, board.h);
        ctx.globalAlpha = 1;
        if (reveal < 1) animating = true;
      }

      loose.forEach(drawLoose);
      return animating;
    }

    function tick(now) {
      raf = 0;
      if (stopped) return;
      if (drawFrame(now)) schedule();
    }

    function schedule() {
      if (!raf && !stopped) raf = window.requestAnimationFrame(tick);
    }

    /* ---------- life cycle ---------- */

    function snapshot() {
      if (!board) return { ready: false };
      return {
        ready: !canvas.hidden,
        logical: { width: W, height: H },
        board: { x: board.x, y: board.y, width: board.w, height: board.h },
        pieceWidth: board.pw,
        pieceHeight: board.ph,
        tolerance: tolerance,
        backingWidth: canvas.width,
        order: loose.map(function (p) { return p.id; }),
        pieces: pieces.map(function (p) {
          return {
            id: p.id, row: p.row, col: p.col, x: p.x, y: p.y, homeX: p.homeX, homeY: p.homeY, placed: p.placed, tabs: p.tabs,
            left: p.left, top: p.top, right: p.right, bottom: p.bottom
          };
        })
      };
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(finishTimer);
      if (image) image.onload = image.onerror = null;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      window.removeEventListener('resize', onResize);
      drag = null;
      if (snapshotOfCurrent === snapshot) snapshotOfCurrent = null;
    }

    snapshotOfCurrent = snapshot;
    load();
    return stop;
  }

  A.doors[ID] = {
    open: function (room, cfg) {
      if (A.store.isSolved(ID)) {
        showReward(room, cfg);
        return function () {};
      }
      return startGame(room, cfg);
    },
    snapshot: function () {
      return snapshotOfCurrent ? snapshotOfCurrent() : null;
    }
  };
})(window.Astra = window.Astra || {});
