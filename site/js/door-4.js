/* Door 4: a paper plane crosses the night map, one stop per click, towards the final note. */
(function (A) {
  'use strict';

  var ID = 4;
  var ART_PX = 3; // one art pixel is 3 stage px
  var ART_W = 427;
  var ART_H = 216; // the room body is 648 stage px tall
  var SIDE_MARGIN = 37; // art px kept free left and right of the route, for the city names
  var ROUTE_TOP = 35; // art px from the top of the map to the northernmost city
  var DOT_STEP = 5; // art px between the dots of the line
  var LABEL_SIDES = ['below', 'above', 'above', 'below', 'above', 'below', 'above'];
  var FLIGHT_BASE_MS = 500;
  var FLIGHT_MS_PER_ART_PX = 9;
  var ARRIVAL_PAUSE_MS = 650;

  /* ---------------- map data: coarse outlines as [lon, lat], good enough for 3-pixel art ---------------- */

  var SEAS = [
    // Baltic
    [[10.2, 54.4], [10.9, 54.0], [12.1, 54.2], [13.4, 54.6], [14.3, 53.9], [15.6, 54.2], [16.9, 54.6], [18.4, 54.8],
      [18.7, 54.4], [19.9, 54.5], [21.0, 55.2], [21.1, 55.7], [21.0, 56.5], [21.5, 57.4], [22.6, 57.75], [23.1, 57.1],
      [24.1, 57.0], [24.35, 57.75], [24.5, 58.4], [23.5, 58.6], [23.5, 59.0], [24.7, 59.45], [26.5, 59.55], [28.0, 59.45],
      [30.2, 59.9], [28.0, 60.5], [25.0, 60.2], [23.0, 59.8], [22.0, 60.4], [21.0, 62.0], [17.2, 62.0], [17.2, 60.7],
      [18.8, 59.6], [17.0, 58.7], [16.7, 57.8], [16.4, 56.7], [15.6, 56.1], [14.0, 55.4], [13.0, 55.5], [12.6, 55.7],
      [12.7, 56.1], [12.2, 57.1], [11.9, 57.7], [11.2, 59.0], [10.7, 59.9], [9.4, 58.9], [9.4, 57.75], [10.6, 57.7],
      [10.3, 56.9], [10.7, 56.4], [10.2, 56.1], [9.9, 55.5], [9.8, 55.0], [10.1, 54.5]],
    // Black Sea and Azov, drawn around Crimea
    [[27.6, 42.5], [27.95, 43.2], [28.6, 43.8], [28.7, 44.2], [29.7, 45.2], [30.8, 46.5], [31.6, 46.6], [32.5, 46.1],
      [33.6, 46.1], [32.6, 45.4], [33.4, 44.6], [34.2, 44.45], [35.4, 45.0], [36.5, 45.1], [36.6, 45.4], [35.3, 45.4],
      [34.9, 46.1], [35.3, 46.4], [36.8, 46.75], [37.6, 47.05], [38.9, 47.2], [39.3, 47.1], [38.3, 46.7], [38.1, 46.0],
      [37.4, 45.35], [36.8, 45.2], [37.3, 44.9], [37.8, 44.7], [39.1, 44.1], [39.7, 43.6], [41.0, 43.0], [41.6, 41.6],
      [27.6, 41.6]],
    // Caspian
    [[47.5, 42.5], [47.55, 43.0], [47.5, 43.6], [46.8, 44.4], [46.9, 45.3], [47.6, 45.7], [48.6, 46.2], [49.5, 46.6],
      [51.0, 47.0], [52.6, 46.9], [53.1, 46.5], [52.9, 45.5], [52.5, 45.3], [51.2, 45.2], [51.0, 44.6], [50.3, 44.5],
      [50.9, 44.0], [51.3, 43.1], [52.4, 42.5]],
    // Adriatic
    [[12.3, 45.4], [13.7, 45.6], [13.85, 44.85], [14.4, 45.3], [15.2, 44.1], [16.4, 43.5], [18.1, 42.65], [19.1, 42.1],
      [19.4, 41.5], [16.0, 41.5], [16.2, 41.9], [14.2, 42.5], [13.5, 43.6], [12.6, 44.1], [12.5, 44.9]],
    // Ligurian and Tyrrhenian corner
    [[8.9, 44.4], [9.9, 44.0], [10.3, 43.5], [10.5, 42.9], [11.1, 42.4], [12.2, 41.7], [8.0, 41.5]]
  ];

  var RIVERS = [
    // Volga
    [[35.9, 56.85], [38.8, 58.05], [39.9, 57.6], [41.0, 57.75], [44.0, 56.33], [47.25, 56.15], [49.1, 55.8], [48.4, 54.3],
      [50.1, 53.2], [46.05, 51.5], [44.5, 48.7], [48.0, 46.35]],
    // Kama
    [[49.5, 55.3], [52.0, 55.7], [53.5, 56.2], [56.2, 58.0]],
    // Dnieper
    [[32.0, 54.8], [30.3, 53.9], [30.5, 50.45], [32.0, 49.4], [35.0, 48.45], [35.1, 47.8], [32.6, 46.6]],
    // Don
    [[38.2, 54.0], [39.2, 51.7], [41.0, 49.7], [42.7, 47.6], [39.4, 47.1]],
    // Vistula
    [[19.9, 50.05], [21.0, 52.23], [18.6, 53.0], [18.9, 54.3]],
    // Danube
    [[16.4, 48.2], [19.0, 47.5], [18.9, 45.9], [20.5, 44.8], [22.5, 44.0], [26.1, 44.0], [28.0, 44.9], [29.7, 45.2]]
  ];

  // Clusters of town lights: [lon, lat, how many pixels].
  var GLOWS = [
    [60.6, 56.84, 46], [49.12, 55.79, 34], [44.0, 56.33, 34], [37.62, 55.76, 72], [27.56, 53.9, 34], [21.01, 52.23, 40],
    [14.44, 50.08, 40], [30.52, 50.45, 40], [36.23, 49.99, 26], [39.2, 51.67, 22], [50.1, 53.2, 26], [55.97, 54.74, 26],
    [61.4, 55.16, 30], [46.03, 51.53, 18], [44.5, 48.72, 20], [39.72, 47.23, 22], [13.4, 52.52, 40],
    [19.94, 50.06, 20], [24.1, 56.95, 18], [19.04, 47.5, 28], [26.1, 44.43, 26], [16.37, 48.21, 26],
    [34.1, 44.95, 10], [38.98, 45.04, 18], [55.1, 51.77, 14], [20.46, 44.8, 16],
    [23.32, 43.2, 12], [11.25, 43.77, 14], [47.5, 42.98, 8]
  ];

  var COLOURS = {
    land: [44, 35, 70], landDark: [39, 31, 63], landLight: [50, 40, 79],
    sea: [21, 18, 43], shallow: [29, 25, 56], wave: [38, 32, 69],
    coast: [93, 79, 128], line: [58, 49, 96], river: [71, 59, 112], ridge: [103, 89, 140],
    faint: [107, 90, 78], dim: [185, 138, 69], amber: [232, 176, 74], lamp: [255, 207, 122], hot: [255, 241, 207]
  };

  /* ---------------- projection: equirectangular with cos(mean latitude), east on the right ---------------- */

  function project(points) {
    var lats = points.map(function (p) { return p.lat; });
    var lons = points.map(function (p) { return p.lon; });
    var minLon = Math.min.apply(null, lons);
    var maxLon = Math.max.apply(null, lons);
    var minLat = Math.min.apply(null, lats);
    var maxLat = Math.max.apply(null, lats);
    var cosMean = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    var scale = (ART_W - 2 * SIDE_MARGIN) / ((maxLon - minLon) * cosMean);
    return {
      x: function (lon) { return SIDE_MARGIN + (lon - minLon) * cosMean * scale; },
      y: function (lat) { return ROUTE_TOP + (maxLat - lat) * scale; },
      lonAt: function (x) { return minLon + (x - SIDE_MARGIN) / (cosMean * scale); },
      latAt: function (y) { return maxLat - (y - ROUTE_TOP) / scale; }
    };
  }

  /* ---------------- the map picture, painted once per art pixel ---------------- */

  function seeded(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function noiseField(rnd, cell) {
    var cols = Math.ceil(ART_W / cell) + 2;
    var rows = Math.ceil(ART_H / cell) + 2;
    var grid = new Float32Array(cols * rows);
    for (var i = 0; i < grid.length; i++) grid[i] = rnd();
    return function (x, y) {
      var ix = Math.floor(x / cell);
      var iy = Math.floor(y / cell);
      var tx = x / cell - ix;
      var ty = y / cell - iy;
      var upper = grid[iy * cols + ix] * (1 - tx) + grid[iy * cols + ix + 1] * tx;
      var lower = grid[(iy + 1) * cols + ix] * (1 - tx) + grid[(iy + 1) * cols + ix + 1] * tx;
      return upper * (1 - ty) + lower * ty;
    };
  }

  function inPolygon(lon, lat, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i];
      var b = poly[j];
      if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function paintedMap(proj) {
    var W = ART_W;
    var H = ART_H;
    var rnd = seeded(20251109);
    var sea = new Uint8Array(W * H);
    var pixels = new Array(W * H);
    var x, y;

    function isSea(px, py) {
      return px >= 0 && py >= 0 && px < W && py < H && sea[py * W + px] === 1;
    }
    function put(px, py, colour) {
      if (px >= 0 && py >= 0 && px < W && py < H) pixels[py * W + px] = colour;
    }

    for (y = 0; y < H; y++) {
      var lat = proj.latAt(y + 0.5);
      for (x = 0; x < W; x++) {
        var lon = proj.lonAt(x + 0.5);
        for (var s = 0; s < SEAS.length; s++) {
          if (inPolygon(lon, lat, SEAS[s])) { sea[y * W + x] = 1; break; }
        }
      }
    }

    // Land in soft organic patches with a checker edge; sea with a lighter rim and small waves.
    var coarse = noiseField(rnd, 26);
    var fine = noiseField(rnd, 9);
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var nearLand = !isSea(x - 1, y) || !isSea(x + 1, y) || !isSea(x, y - 1) || !isSea(x, y + 1);
        var nearSea = isSea(x - 1, y) || isSea(x + 1, y) || isSea(x, y - 1) || isSea(x, y + 1);
        if (isSea(x, y)) {
          put(x, y, nearLand ? COLOURS.shallow : COLOURS.sea);
        } else if (nearSea) {
          put(x, y, COLOURS.coast);
        } else {
          var v = 0.65 * coarse(x, y) + 0.35 * fine(x, y);
          var checker = (x + y) % 2 === 0;
          if (v < 0.4) put(x, y, COLOURS.landDark);
          else if (v < 0.45) put(x, y, checker ? COLOURS.landDark : COLOURS.land);
          else if (v > 0.6) put(x, y, COLOURS.landLight);
          else if (v > 0.55) put(x, y, checker ? COLOURS.landLight : COLOURS.land);
          else put(x, y, COLOURS.land);
        }
      }
    }
    for (var w = 0; w < 260; w++) {
      var wx = Math.floor(rnd() * W);
      var wy = Math.floor(rnd() * H);
      if (isSea(wx, wy) && isSea(wx + 1, wy) && isSea(wx + 2, wy) && isSea(wx, wy - 1) && isSea(wx, wy + 1)) {
        put(wx, wy, COLOURS.wave);
        put(wx + 1, wy, COLOURS.wave);
        put(wx + 2, wy, COLOURS.wave);
      }
    }

    // Faint graticule: parallels every 5 degrees, meridians every 10.
    var g;
    for (g = 45; g <= 55; g += 5) {
      y = Math.round(proj.y(g));
      for (x = 0; x < W; x += 1) {
        if (x % 6 < 3) put(x, y, isSea(x, y) ? COLOURS.wave : COLOURS.line);
      }
    }
    for (g = 20; g <= 60; g += 10) {
      x = Math.round(proj.x(g));
      for (y = 0; y < H; y += 1) {
        if (y % 6 < 3) put(x, y, isSea(x, y) ? COLOURS.wave : COLOURS.line);
      }
    }

    RIVERS.forEach(function (river) {
      for (var i = 0; i + 1 < river.length; i++) {
        var ax = proj.x(river[i][0]);
        var ay = proj.y(river[i][1]);
        var bx = proj.x(river[i + 1][0]);
        var by = proj.y(river[i + 1][1]);
        var n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
        for (var k = 0; k <= n; k++) {
          var rx = Math.round(ax + (bx - ax) * k / n);
          var ry = Math.round(ay + (by - ay) * k / n);
          if (!isSea(rx, ry)) put(rx, ry, COLOURS.river);
        }
      }
    });

    // The Urals, as a row of small peaks just west of the eastern end.
    for (var r = 0; r < 12; r++) {
      var peakLat = 50.6 + r * 0.8;
      var px = Math.round(proj.x(59 + (rnd() - 0.5) * 2.2));
      var py = Math.round(proj.y(peakLat));
      put(px, py, COLOURS.ridge);
      put(px - 1, py + 1, COLOURS.ridge);
      put(px + 1, py + 1, COLOURS.ridge);
      put(px - 2, py + 2, COLOURS.ridge);
      put(px + 2, py + 2, COLOURS.ridge);
    }

    // Night lights: a thin sprinkle of villages, then warm clusters around towns.
    for (var c = 0; c < 950; c++) {
      var cx = Math.floor(rnd() * W);
      var cy = Math.floor(rnd() * H);
      if (!isSea(cx, cy)) put(cx, cy, rnd() < 0.2 ? COLOURS.dim : COLOURS.faint);
    }
    GLOWS.forEach(function (glow) {
      var gx = proj.x(glow[0]);
      var gy = proj.y(glow[1]);
      var sigma = 1.3 + Math.sqrt(glow[2]) / 3.4;
      for (var i = 0; i < glow[2]; i++) {
        var angle = rnd() * 2 * Math.PI;
        var dist = Math.sqrt(-2 * Math.log(1 - rnd() * 0.98)) * sigma;
        var lx = Math.round(gx + Math.cos(angle) * dist);
        var ly = Math.round(gy + Math.sin(angle) * dist);
        if (isSea(lx, ly)) continue;
        put(lx, ly, dist < sigma * 0.5 ? COLOURS.hot : dist < sigma ? COLOURS.lamp : dist < sigma * 1.7 ? COLOURS.amber : COLOURS.dim);
      }
    });

    return pixels;
  }

  var mapCache = null; // the picture never changes, so reopening the door costs nothing

  function drawMap(canvas, proj) {
    var ctx = canvas.getContext('2d');
    if (!mapCache) {
      var pixels = paintedMap(proj);
      mapCache = ctx.createImageData(ART_W, ART_H);
      pixels.forEach(function (colour, i) {
        mapCache.data[i * 4] = colour[0];
        mapCache.data[i * 4 + 1] = colour[1];
        mapCache.data[i * 4 + 2] = colour[2];
        mapCache.data[i * 4 + 3] = 255;
      });
    }
    ctx.putImageData(mapCache, 0, 0);
  }

  /* ---------------- the room ---------------- */

  function stagePx(artValue) {
    return artValue * ART_PX + 'px';
  }

  // The sprite's nose points left; it is mirrored only for a leg that flies east.
  function faceTransform(from, to) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    if (dx <= 0) return 'rotate(' + (Math.atan2(-dy, -dx) * 180 / Math.PI).toFixed(2) + 'deg)';
    return 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) + 'deg) scaleX(-1)';
  }

  function savedStop(last) {
    var value = Math.floor(Number(A.store.door(ID).stop));
    if (!isFinite(value) || value < 0) return 0;
    return Math.min(value, last);
  }

  A.doors[ID] = {
    open: function (room, cfg) {
      var ui = A.ui;
      var el = ui.el;
      var points = [cfg.route.start].concat(cfg.route.stops, [cfg.route.end]);
      var last = points.length - 1;
      var proj = project(points);
      var cities = points.map(function (p) {
        return { x: Math.round(proj.x(p.lon)), y: Math.round(proj.y(p.lat)) };
      });
      var stop = A.store.isSolved(ID) ? last : savedStop(last);
      var flying = false;
      var closed = false;
      var raf = 0;
      var rewardTimer = 0;

      var canvas = el('canvas', { class: 'd4-map art', width: ART_W, height: ART_H, 'aria-hidden': 'true' });
      drawMap(canvas, proj);

      var dots = [];
      var dotLayer = el('div', { class: 'd4-dots', 'aria-hidden': 'true' });
      for (var leg = 0; leg < last; leg++) {
        var a = cities[leg];
        var b = cities[leg + 1];
        var count = Math.max(2, Math.round(Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2)) / DOT_STEP));
        for (var j = 1; j < count; j++) {
          var node = el('span', {
            class: 'd4-dot',
            dataset: { leg: String(leg) },
            style: {
              left: stagePx(Math.round(a.x + (b.x - a.x) * j / count)),
              top: stagePx(Math.round(a.y + (b.y - a.y) * j / count))
            }
          });
          dots.push({ node: node, leg: leg, t: j / count });
          dotLayer.appendChild(node);
        }
      }

      var cityNodes = points.map(function (p, i) {
        var kind = i === 0 ? 'start' : i === last ? 'end' : 'stop';
        return el('div', {
          class: 'd4-city d4-city-' + kind,
          dataset: { index: String(i) },
          style: { left: stagePx(cities[i].x), top: stagePx(cities[i].y) }
        },
          el('span', { class: 'd4-marker', 'aria-hidden': 'true' }),
          el('span', { class: 'd4-label d4-label-' + (LABEL_SIDES[i] || 'above') }, p.name));
      });

      var planeImage = el('img', { class: 'd4-plane-img art', src: cfg.planeImage, alt: cfg.planeAlt, draggable: 'false' });
      var plane = el('button', { type: 'button', class: 'd4-plane', 'aria-label': cfg.planeAria },
        el('span', { class: 'd4-plane-bob' }, planeImage));
      plane.addEventListener('click', depart);

      var intro = el('p', { class: 'd4-intro' }, cfg.intro);
      var cardZone = el('div', { class: 'd4-cardzone', role: 'status' });
      var wrap = el('div', { class: 'd4-wrap' },
        canvas,
        intro,
        dotLayer,
        cityNodes,
        plane,
        cardZone,
        el('div', { class: 'd4-frame', 'aria-hidden': 'true' }));
      room.body.appendChild(wrap);

      function placePlane(x, y) {
        plane.style.transform = 'translate(' + stagePx(Math.round(x)) + ',' + stagePx(Math.round(y)) + ')';
      }

      function faceFrom(index) {
        planeImage.style.transform = index < last
          ? faceTransform(cities[index], cities[index + 1])
          : faceTransform(cities[index - 1], cities[index]);
      }

      function refreshTrail() {
        dots.forEach(function (d) { d.node.classList.toggle('is-visited', d.leg < stop); });
        cityNodes.forEach(function (node, i) { node.classList.toggle('is-visited', i <= stop); });
      }

      function showCard(index) {
        cardZone.textContent = '';
        cardZone.appendChild(el('div', { class: 'd4-card', dataset: { stop: String(index) } },
          el('div', { class: 'd4-card-head' },
            el('h3', { class: 'd4-card-city' }, points[index].name),
            el('span', { class: 'd4-card-stamp' }, ui.t(cfg.stopLabel, { n: index, total: last - 1 }))),
          el('p', { class: 'd4-card-reason' }, points[index].reason)));
      }

      function showReward() {
        plane.hidden = true;
        intro.hidden = true;
        cardZone.textContent = '';
        var overlay = el('div', { class: 'd4-reward' });
        wrap.insertBefore(overlay, wrap.lastChild);
        ui.reward(overlay, { noteTitle: cfg.noteTitle, note: cfg.note, letter: cfg.letter, onDone: room.close });
      }

      function land() {
        flying = false;
        stop += 1;
        plane.classList.remove('is-flying');
        A.store.door(ID).stop = stop;
        refreshTrail();
        if (stop >= last) {
          plane.classList.add('is-arrived');
          A.store.solve(ID); // saves too
          rewardTimer = setTimeout(showReward, ARRIVAL_PAUSE_MS);
          return;
        }
        A.store.save();
        faceFrom(stop);
        showCard(stop);
      }

      function depart() {
        if (flying || closed || stop >= last) return; // a click during flight simply does nothing
        flying = true;
        cardZone.textContent = '';
        plane.classList.add('is-flying');
        var from = cities[stop];
        var to = cities[stop + 1];
        var flightLeg = stop;
        var legDots = dots.filter(function (d) { return d.leg === flightLeg; });
        var duration = FLIGHT_BASE_MS + FLIGHT_MS_PER_ART_PX * Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
        var startedAt = null;

        function step(now) {
          if (startedAt === null) startedAt = now;
          var t = Math.min(1, (now - startedAt) / duration);
          var eased = t * t * (3 - 2 * t);
          placePlane(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
          legDots.forEach(function (d) { d.node.classList.toggle('is-visited', d.t <= eased); });
          if (t < 1) raf = requestAnimationFrame(step);
          else land();
        }
        raf = requestAnimationFrame(step);
      }

      placePlane(cities[stop].x, cities[stop].y);
      faceFrom(stop);
      refreshTrail();
      if (stop >= last) {
        plane.classList.add('is-arrived');
        A.store.solve(ID);
        showReward();
      } else if (stop > 0) {
        showCard(stop);
      }

      return function () {
        closed = true;
        cancelAnimationFrame(raf);
        clearTimeout(rewardTimer);
      };
    }
  };
})(window.Astra = window.Astra || {});
