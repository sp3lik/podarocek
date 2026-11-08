/* The night sky of one particular evening: real star positions, drawn in chunky pixels. */
(function (A) {
  'use strict';

  var C = window.CONTENT;
  var S = C.sky;
  var ui = A.ui;

  var DEG = Math.PI / 180;
  var ARCSEC = DEG / 3600;
  var JD_J2000 = 2451545.0;

  /* Stage geometry in logical px. The dome is a stereographic disc: zenith in the centre, horizon on the rim. */
  var HORIZON_R = 327;
  var RING = 12;
  var CENTRE_X = 919;
  var CENTRE_Y = 360;
  var NAME_INSET = 64;
  var SIZE = 2 * (HORIZON_R + RING);
  var LEFT = CENTRE_X - SIZE / 2;
  var TOP = CENTRE_Y - SIZE / 2;
  var CELL = 3; // one art pixel, as everywhere else on the stage

  var CHAT_HIT = 56;
  var TICKET_HIT = 76;
  var FRAME_MS = 100;

  var CATALOG = window.STARS;
  var LAMP = '#ffcf7a';

  /* ---------------- astronomy ---------------- */

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function applyMatrix(m, v) { return [dot(m[0], v), dot(m[1], v), dot(m[2], v)]; }

  function applyTranspose(m, v) {
    return [
      m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
      m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
      m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]
    ];
  }

  // IAU 1976 precession, J2000 mean equator to the mean equator of date.
  function precessionMatrix(T) {
    var zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC;
    var z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC;
    var theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC;
    var cA = Math.cos(zeta), sA = Math.sin(zeta);
    var cB = Math.cos(z), sB = Math.sin(z);
    var cT = Math.cos(theta), sT = Math.sin(theta);
    return [
      [cA * cT * cB - sA * sB, -sA * cT * cB - cA * sB, -sT * cB],
      [cA * cT * sB + sA * cB, -sA * cT * sB + cA * cB, -sT * sB],
      [cA * sT, -sA * sT, cT]
    ];
  }

  // Observer's frame in equator-of-date coordinates, from IAU 1982 mean sidereal time.
  function observerFrame(loc) {
    var jd = Date.parse(loc.localIso) / 86400000 + 2440587.5;
    var d = jd - JD_J2000;
    var T = d / 36525;
    var gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000;
    var lst = (gmst + loc.lon) * DEG;
    var lat = loc.lat * DEG;
    var cL = Math.cos(lat), sL = Math.sin(lat), cS = Math.cos(lst), sS = Math.sin(lst);
    return {
      years: d / 365.25,
      precession: precessionMatrix(T),
      north: [-sL * cS, -sL * sS, cL],
      east: [-sS, cS, 0],
      up: [cL * cS, cL * sS, sL]
    };
  }

  function bennettDegrees(apparent) {
    return 1 / Math.tan((apparent + 7.31 / (apparent + 4.4)) * DEG) / 60;
  }

  // Bennett's formula takes the apparent altitude, so it is solved by a short fixed-point iteration.
  function apparentAltitude(trueAlt) {
    if (trueAlt < -2) return trueAlt;
    var apparent = trueAlt;
    for (var i = 0; i < 5; i++) apparent = trueAlt + bennettDegrees(apparent);
    return apparent;
  }

  // row: [hr, ra, dec, vmag, bv, pmRaCosDec, pmDec]
  function placeStar(row, frame) {
    var ra = row[1] * DEG, dec = row[2] * DEG;
    var cR = Math.cos(ra), sR = Math.sin(ra), cD = Math.cos(dec), sD = Math.sin(dec);
    var moveE = row[5] * frame.years * ARCSEC;
    var moveN = row[6] * frame.years * ARCSEC;
    // Proper motion along the local east and north, safe right up to the pole.
    var moved = [
      cD * cR - moveE * sR - moveN * sD * cR,
      cD * sR + moveE * cR - moveN * sD * sR,
      sD + moveN * cD
    ];
    var length = Math.sqrt(dot(moved, moved));
    var v = applyMatrix(frame.precession, [moved[0] / length, moved[1] / length, moved[2] / length]);

    var north = dot(v, frame.north), east = dot(v, frame.east), up = dot(v, frame.up);
    var alt = apparentAltitude(Math.asin(Math.max(-1, Math.min(1, up))) / DEG);
    var az = (Math.atan2(east, north) / DEG + 360) % 360;

    // East is on the left because the map is read looking up.
    var r = HORIZON_R * Math.tan((90 - alt) / 2 * DEG);
    return {
      hr: row[0],
      name: CATALOG.names[row[0]] || null,
      mag: row[3],
      bv: row[4],
      alt: alt,
      az: az,
      x: CENTRE_X - r * Math.sin(az * DEG),
      y: CENTRE_Y - r * Math.cos(az * DEG),
      visible: alt > 0 && row[3] <= S.limitingMag
    };
  }

  function locationById(id) {
    return S.locations.filter(function (l) { return l.id === id; })[0] || S.locations[0];
  }

  var computed = {};

  function compute(locationId) {
    var loc = locationById(locationId);
    if (!computed[loc.id]) {
      var frame = observerFrame(loc);
      computed[loc.id] = CATALOG.rows.map(function (row) { return placeStar(row, frame); });
    }
    return computed[loc.id];
  }

  /* ---------------- which stars do something ---------------- */

  function findByName(stars, name) {
    var wanted = String(name).trim().toLowerCase();
    return stars.filter(function (s) { return s.name && s.name.toLowerCase() === wanted; })[0] || null;
  }

  function brightestAboveHorizon(stars) {
    return stars.reduce(function (best, s) {
      return s.alt > 0 && (!best || s.mag < best.mag) ? s : best;
    }, null);
  }

  function resolveSpecialStars(stars) {
    var missing = [], below = [], clash = [];
    var ticket = null;
    if (S.ticketStar && S.ticketStar !== 'auto') {
      var named = findByName(stars, S.ticketStar);
      if (!named) missing.push(S.ticketStar);
      else if (named.alt <= 0) below.push(S.ticketStar);
      else ticket = named;
    }
    if (!ticket) ticket = brightestAboveHorizon(stars);

    var chat = [];
    S.glowingStars.forEach(function (cfg) {
      var star = findByName(stars, cfg.star);
      if (!star) missing.push(cfg.star);
      else if (star.alt <= 0) below.push(cfg.star);
      else if (star === ticket) clash.push(cfg.star);
      else chat.push({ star: star, cfg: cfg });
    });
    return { ticket: ticket, chat: chat, missing: missing, below: below, clash: clash };
  }

  /* ---------------- pixel painting ---------------- */

  var COLOURS = [
    [-0.1, '#9fbaff'], [0.15, '#c6d6ff'], [0.45, '#eff0ff'], [0.75, '#fff4d9'],
    [1.1, '#ffdf9f'], [1.45, '#ffbf7a'], [Infinity, '#ff9a68']
  ];

  function colourOf(bv) {
    if (bv === null || bv === undefined) return '#eff0ff';
    for (var i = 0; i < COLOURS.length; i++) {
      if (bv < COLOURS[i][0]) return COLOURS[i][1];
    }
    return COLOURS[COLOURS.length - 1][1];
  }

  function starSize(mag) { return 1.2 + 0.24 * Math.pow(Math.max(0, 6 - mag), 1.6); }

  function starAlpha(mag) { return mag >= 3.5 ? Math.max(0.4, 1 - (mag - 3.5) * 0.24) : 1; }

  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var SKY_BANDS = [[11, 10, 30], [14, 13, 38], [18, 16, 47], [24, 20, 58], [32, 26, 70], [46, 34, 82]];
  var INK = [42, 26, 46];
  var BRASS = [217, 164, 65];
  var BRASS_DARK = [168, 119, 34];
  var BRASS_LIGHT = [255, 207, 122];

  // J2000 equatorial to galactic coordinates.
  var GALACTIC = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.4448296300, 0.7469822445],
    [-0.8676661490, -0.1980763734, 0.4559837762]
  ];

  function milkyWay(lon, lat) {
    var c = Math.cos(lon * DEG / 2);
    var toward = c * c;
    var width = 8 + 6 * toward;
    var glow = Math.exp(-lat * lat / (2 * width * width)) * (0.4 + 0.6 * toward);
    var clouds = 0.72 + 0.16 * Math.sin(lon * DEG * 5 + 1.3) * Math.cos(lat * DEG * 9) +
      0.12 * Math.sin(lon * DEG * 13 + lat * DEG * 7);
    var rift = (lon + 390) % 360 < 100 ? 1 - 0.6 * Math.exp(-(lat - 1) * (lat - 1) / 18) : 1;
    return glow * clouds * rift;
  }

  function ringColour(depth, dx, dy) {
    var band = Math.floor(depth / CELL);
    if (band <= 0 || band >= 3) return INK;
    if (band === 2) return dx + dy < 0 ? BRASS_LIGHT : BRASS;
    return dx + dy < 0 ? BRASS : BRASS_DARK;
  }

  // Sky gradient, the real Milky Way and the brass ring, one art pixel per canvas pixel.
  function paintBackdrop(frame) {
    var n = SIZE / CELL;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    var g = canvas.getContext('2d');
    var image = g.createImageData(n, n);
    var data = image.data;

    function toGalactic(axis) { return applyMatrix(GALACTIC, applyTranspose(frame.precession, axis)); }
    var gN = toGalactic(frame.north), gE = toGalactic(frame.east), gU = toGalactic(frame.up);

    for (var j = 0; j < n; j++) {
      for (var i = 0; i < n; i++) {
        var dx = (i + 0.5) * CELL - SIZE / 2;
        var dy = (j + 0.5) * CELL - SIZE / 2;
        var rho = Math.sqrt(dx * dx + dy * dy);
        if (rho >= HORIZON_R + RING) continue;
        var at = (i + j * n) * 4;
        var rgb;
        if (rho >= HORIZON_R) {
          rgb = ringColour(rho - HORIZON_R, dx, dy);
        } else {
          var dither = BAYER[(i & 3) + (j & 3) * 4] / 16;
          var q = rho / HORIZON_R;
          var band = Math.min(SKY_BANDS.length - 1, Math.floor(Math.pow(q, 2.2) * (SKY_BANDS.length - 1) + dither));
          var base = SKY_BANDS[band];

          // Inverse stereographic projection; sin and cos of the zenith distance come out directly.
          var denom = 1 + q * q;
          var sinZ = 2 * q / denom, cosZ = (1 - q * q) / denom;
          var cosAz = rho > 0 ? -dy / rho : 1, sinAz = rho > 0 ? -dx / rho : 0;
          var nC = sinZ * cosAz, eC = sinZ * sinAz, uC = cosZ;
          var gx = gN[0] * nC + gE[0] * eC + gU[0] * uC;
          var gy = gN[1] * nC + gE[1] * eC + gU[1] * uC;
          var gz = gN[2] * nC + gE[2] * eC + gU[2] * uC;
          var glow = milkyWay(Math.atan2(gy, gx) / DEG, Math.asin(Math.max(-1, Math.min(1, gz))) / DEG);
          var steps = Math.floor(glow * 6 + dither);
          rgb = [base[0] + steps * 8, base[1] + steps * 8, base[2] + steps * 11];
        }
        data[at] = rgb[0];
        data[at + 1] = rgb[1];
        data[at + 2] = rgb[2];
        data[at + 3] = 255;
      }
    }
    g.putImageData(image, 0, 0);
    return canvas;
  }

  function clipToDome(ctx, width) {
    ctx.beginPath();
    ctx.arc(width / 2, width / 2, HORIZON_R * width / SIZE, 0, Math.PI * 2);
    ctx.clip();
  }

  function drawSquare(ctx, x, y, size, withArms) {
    var n = Math.max(1, Math.round(size));
    var left = Math.round(x - n / 2);
    var top = Math.round(y - n / 2);
    ctx.fillRect(left, top, n, n);
    if (!withArms) return;
    var arm = Math.max(1, Math.round(n / 2));
    var thick = Math.max(1, n - 2 * Math.floor(n / 3));
    var offset = Math.floor((n - thick) / 2);
    ctx.fillRect(left - arm, top + offset, n + 2 * arm, thick);
    ctx.fillRect(left + offset, top - arm, thick, n + 2 * arm);
  }

  // A filled circle made of art-pixel rows, added to the current path.
  function pixelDisc(ctx, x, y, radius, unit) {
    var rows = Math.ceil(radius / unit);
    var left = Math.round(x), top = Math.round(y);
    for (var j = -rows; j < rows; j++) {
      var mid = (j + 0.5) * unit;
      var half = Math.round(Math.sqrt(Math.max(0, radius * radius - mid * mid)) / unit) * unit;
      if (half > 0) ctx.rect(left - half, top + j * unit, 2 * half, unit);
    }
  }

  var CHAT_GLOW = { radius: 15, swell: 7, core: 6, ray: 2, rayLength: 13, raySwell: 4, halo: [[1, 0.1], [0.68, 0.16], [0.4, 0.26]] };
  var TICKET_GLOW = { radius: 33, swell: 11, core: 11, ray: 3, rayLength: 27, raySwell: 9, halo: [[1, 0.1], [0.72, 0.14], [0.46, 0.22], [0.26, 0.34]] };

  function drawGlowingStar(ctx, item, seconds, ratio) {
    var spec = item.isTicket ? TICKET_GLOW : CHAT_GLOW;
    var beat = Math.round((0.5 + 0.5 * Math.sin(seconds * item.speed + item.phase)) * 4) / 4;
    var x = (item.star.x - LEFT) * ratio;
    var y = (item.star.y - TOP) * ratio;
    var unit = Math.max(1, Math.round(CELL * ratio));
    var radius = (spec.radius + spec.swell * beat) * ratio;

    ctx.fillStyle = item.colour;
    spec.halo.forEach(function (layer) {
      ctx.globalAlpha = layer[1];
      ctx.beginPath();
      pixelDisc(ctx, x, y, radius * layer[0], unit);
      ctx.fill();
    });

    var thick = Math.max(1, Math.round(spec.ray * ratio));
    var length = Math.round((spec.rayLength + spec.raySwell * beat) * ratio);
    var cx = Math.round(x), cy = Math.round(y);
    var half = Math.floor(thick / 2);
    ctx.globalAlpha = 0.9;
    ctx.fillRect(cx - length, cy - half, 2 * length, thick);
    ctx.fillRect(cx - half, cy - length, thick, 2 * length);
    if (item.isTicket) {
      var reach = Math.round(length * 0.42);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
        for (var i = 1; i <= 2; i++) {
          var step = Math.round(reach * i / 2);
          ctx.fillRect(cx + d[0] * step - half, cy + d[1] * step - half, thick, thick);
        }
      });
    }

    ctx.globalAlpha = 1;
    drawSquare(ctx, x, y, spec.core * ratio, false);
    ctx.fillStyle = '#ffffff';
    drawSquare(ctx, x, y, spec.core * ratio * 0.45, false);
  }

  /* ---------------- one location's picture ---------------- */

  var views = {};

  function buildView(loc) {
    var stars = compute(loc.id);
    var special = resolveSpecialStars(stars);
    var glowingHr = {};
    var glowing = special.chat.map(function (entry, i) {
      glowingHr[entry.star.hr] = true;
      return { star: entry.star, cfg: entry.cfg, isTicket: false, colour: colourOf(entry.star.bv), speed: 1.5 + (i % 3) * 0.35, phase: i * 1.9 };
    });
    if (special.ticket) {
      glowingHr[special.ticket.hr] = true;
      glowing.push({ star: special.ticket, isTicket: true, colour: LAMP, speed: 1.2, phase: 0 });
    }

    var quiet = [], twinkling = [];
    stars.forEach(function (s) {
      if (!s.visible || glowingHr[s.hr]) return;
      var painted = {
        star: s,
        colour: colourOf(s.bv),
        size: starSize(s.mag),
        alpha: starAlpha(s.mag),
        arms: s.mag < 2,
        speed: 1 + (s.hr % 7) * 0.3,
        phase: s.hr % 11
      };
      if (s.mag < 4 && s.hr % 5 === 0) twinkling.push(painted);
      else quiet.push(painted);
    });

    return {
      loc: loc,
      glowing: glowing,
      ticket: special.ticket,
      quiet: quiet,
      twinkling: twinkling,
      backdrop: paintBackdrop(observerFrame(loc)),
      problems: special
    };
  }

  function viewOf(loc) {
    if (!views[loc.id]) views[loc.id] = buildView(loc);
    return views[loc.id];
  }

  /* ---------------- screen ---------------- */

  function ticketNode() {
    var lines = S.ticket.lines.map(function (line, i) {
      return ui.el('p', { class: 'sky-ticket-line sky-ticket-line-' + (i + 1) }, line);
    });
    return ui.el('div', { class: 'sky-ticket', role: 'group', 'aria-label': S.ticketTitle },
      ui.el('div', { class: 'sky-ticket-stub', 'aria-hidden': 'true' },
        ui.el('img', { class: 'sky-ticket-star art', src: C.hub.starOn, alt: '', draggable: 'false' })),
      ui.el('div', { class: 'sky-ticket-body' }, lines));
  }

  function chatNode(cfg) {
    return ui.el('img', { class: 'sky-chat', src: cfg.image, alt: cfg.alt, draggable: 'false' });
  }

  function open(opts) {
    opts = opts || {};
    var stopped = false;
    var raf = 0;
    var lastFrame = 0;
    var lightboxOpen = false;
    var fitted = false;
    var view = null;
    var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var room = ui.openRoom({
      doorId: 'sky',
      title: S.title,
      className: 'sky-root',
      onClose: function () {
        stopped = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', fitCanvases);
        if (opts.onClose) opts.onClose();
      }
    });

    var base = ui.el('canvas', { class: 'sky-canvas', role: 'img' });
    var overlay = ui.el('canvas', { class: 'sky-overlay', 'aria-hidden': 'true' });
    var starLayer = ui.el('div', { class: 'sky-stars' });
    var compass = [['n', S.compass.n], ['e', S.compass.e], ['s', S.compass.s], ['w', S.compass.w]].map(function (c) {
      return ui.el('span', { class: 'sky-compass sky-compass-' + c[0] }, c[1]);
    });
    var dome = ui.el('div', {
      class: 'sky-dome',
      style: { left: LEFT + 'px', top: TOP + 'px', width: SIZE + 'px', height: SIZE + 'px' }
    }, base, overlay, compass, starLayer);

    var warning = ui.el('p', { class: 'sky-warning', hidden: true });
    var toggleButtons = {};
    var toggle = ui.el('div', { class: 'sky-toggle', role: 'group', 'aria-label': S.locationAria });
    S.locations.forEach(function (loc) {
      var b = ui.button(loc.label, function () { show(loc); }, { className: 'sky-location' });
      b.dataset.location = loc.id;
      toggleButtons[loc.id] = b;
      toggle.appendChild(b);
    });

    room.body.appendChild(ui.el('div', { class: 'sky-panel' },
      ui.el('p', { class: 'sky-caption' }, S.caption),
      ui.el('p', { class: 'sky-when' }, S.whenLabel),
      toggle,
      ui.el('p', { class: 'sky-hint' }, S.hint),
      warning));
    room.body.appendChild(dome);

    function showLightbox(node) {
      if (lightboxOpen) return; // Enter on a focused star must not stack a second copy
      lightboxOpen = true;
      ui.lightbox(node, { onClose: function () { lightboxOpen = false; } });
    }

    function starButton(item) {
      var size = item.isTicket ? TICKET_HIT : CHAT_HIT;
      var name = item.star.name || '';
      // Near the rim the name moves towards the centre, so it never crosses the ring.
      var dx = item.star.x - CENTRE_X;
      var dy = item.star.y - CENTRE_Y;
      var out = Math.sqrt(dx * dx + dy * dy);
      var nameStyle = out > HORIZON_R * 0.8 ? {
        transform: 'translate(calc(-50% + ' + Math.round(-dx / out * NAME_INSET) + 'px), ' + Math.round(-dy / out * NAME_INSET) + 'px)'
      } : {};
      return ui.el('button', {
        type: 'button',
        class: 'sky-star ' + (item.isTicket ? 'sky-star-ticket' : 'sky-star-chat') +
          (item.star.y > CENTRE_Y + HORIZON_R * 0.72 ? ' sky-name-above' : ''),
        'aria-label': ui.t(item.isTicket ? S.ticketAria : S.starAria, { name: name }),
        dataset: { hr: String(item.star.hr), star: name },
        style: {
          left: Math.round(item.star.x - LEFT - size / 2) + 'px',
          top: Math.round(item.star.y - TOP - size / 2) + 'px',
          width: size + 'px',
          height: size + 'px'
        },
        onClick: function () { showLightbox(item.isTicket ? ticketNode() : chatNode(item.cfg)); }
      }, ui.el('span', { class: 'sky-star-name', 'aria-hidden': 'true', style: nameStyle }, name));
    }

    function reportProblems() {
      var previewing = !!(A.preview && A.preview.active);
      var p = view.problems;
      var lines = [];
      if (p.below.length) lines.push(ui.t(S.previewBelowHorizon, { stars: p.below.join(', '), location: view.loc.label }));
      if (p.missing.length) lines.push(ui.t(S.previewNotFound, { stars: p.missing.join(', ') }));
      if (p.clash.length) lines.push(ui.t(S.previewIsTicket, { stars: p.clash.join(', ') }));
      warning.textContent = previewing ? lines.join(' ') : '';
      warning.hidden = !previewing || !lines.length;
      if (previewing && lines.length) console.warn(lines.join(' '));
    }

    function paintBase() {
      var width = base.width;
      var ratio = width / SIZE;
      var ctx = base.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, width);
      ctx.drawImage(view.backdrop, 0, 0, width, width);
      ctx.save();
      clipToDome(ctx, width);
      view.quiet.forEach(function (p) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.colour;
        drawSquare(ctx, (p.star.x - LEFT) * ratio, (p.star.y - TOP) * ratio, p.size * ratio, p.arms);
      });
      ctx.restore();
    }

    function paintOverlay(seconds) {
      var width = overlay.width;
      var ratio = width / SIZE;
      var ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, width, width);
      ctx.save();
      clipToDome(ctx, width);
      view.twinkling.forEach(function (p) {
        var wave = 0.5 + 0.5 * Math.sin(seconds * p.speed + p.phase);
        ctx.globalAlpha = 0.5 + 0.5 * (Math.round(wave * 4) / 4);
        ctx.fillStyle = p.colour;
        drawSquare(ctx, (p.star.x - LEFT) * ratio, (p.star.y - TOP) * ratio, p.size * ratio, p.arms);
      });
      ctx.restore();
      // Outside the dome clip, so a star right on the horizon keeps its whole glow.
      view.glowing.forEach(function (item) { drawGlowingStar(ctx, item, seconds, ratio); });
    }

    function paintAll() {
      paintBase();
      paintOverlay(performance.now() / 1000);
    }

    // The stage is CSS-scaled, so the backing store follows stage scale times device pixel ratio.
    function fitCanvases() {
      var width = Math.max(1, Math.round(SIZE * ui.scale() * (window.devicePixelRatio || 1)));
      if (fitted && base.width === width) return;
      fitted = true;
      base.width = base.height = overlay.width = overlay.height = width;
      paintAll();
    }

    function show(loc) {
      if (view && view.loc.id === loc.id) return;
      view = viewOf(loc);
      Object.keys(toggleButtons).forEach(function (id) {
        var on = id === loc.id;
        toggleButtons[id].classList.toggle('btn-primary', on);
        toggleButtons[id].setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      base.setAttribute('aria-label', ui.t(S.canvasAria, { location: loc.label }));
      starLayer.textContent = '';
      view.glowing.forEach(function (item) { starLayer.appendChild(starButton(item)); });
      reportProblems();
      if (fitted) paintAll();
    }

    function tick(now) {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      paintOverlay(now / 1000);
    }

    show(S.locations[0]);
    fitCanvases();
    window.addEventListener('resize', fitCanvases);
    if (!still) raf = requestAnimationFrame(tick);
  }

  A.sky = { open: open, compute: compute };
})(window.Astra = window.Astra || {});
