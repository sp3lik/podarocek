/* Door 5: the jukebox lounge. She names the next line from ever longer clips of the hook, then
   the hook loops and a star flickers for a few seconds; catching it opens the secret note.
   All sound goes through AudioBufferSourceNode, and no AudioContext exists before the first
   click on a play control. */
(function (A) {
  'use strict';

  var ID = 5;

  var FADE_SEC = 0.005;
  var CLIP_END_FADE_SEC = 0.25;
  var START_LEAD_SEC = 0.03;
  var STOP_FADE_SEC = 0.015;
  var SILENCE_RATIO = 0.005; // about -46 dB under the loudest sample
  var SILENCE_FLOOR = 0.0002;
  var MIN_HOOK_SEC = 0.05;

  var CORRECT_HOLD_MS = 800;
  var DRAW_INTERVAL_MS = 33;
  var DEFAULT_STAR_SEC = 4;

  // Jukebox art, in art pixels (3 stage px each).
  var JUKE_W = 132;
  var JUKE_H = 204;
  var JUKE_CX = 66;
  var ARCH_Y = 66;
  var RECORD_Y = 58;
  var EQ_BARS = 16;
  var EQ_ROWS = 9;
  var MINI_BARS = 10;
  var MINI_ROWS = 5;

  var INK = '#2a1a2e';
  var NIGHT = '#100e22';
  var PLUM = '#2c2346';
  var DIM = '#4a4166';
  var CARPET = '#5b1f3a';
  var CARPET_LIT = '#7d2b50';
  var CARPET_DARK = '#431630';
  var BRASS = '#d9a441';
  var BRASS_DARK = '#a87722';
  var LAMP = '#ffcf7a';
  var MINT = '#6fd6a0';
  var CORAL = '#e8734a';
  var UNLIT = '#3a2f55';
  var GLOW_IDLE = [122, 74, 42];
  var GLOW_FULL = [255, 207, 122];

  function wrap(value, length) {
    return ((value % length) + length) % length;
  }

  // MP3 files carry encoder delay and padding; a 0.1 s clip or a loop seam must skip both.
  function findAudibleBounds(buffer) {
    var channels = [];
    var length = buffer.length;
    var c, i, v;
    for (c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));

    var peak = 0;
    for (c = 0; c < channels.length; c++) {
      var data = channels[c];
      for (i = 0; i < length; i++) {
        v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    var threshold = Math.max(peak * SILENCE_RATIO, SILENCE_FLOOR);

    function audible(index) {
      for (var n = 0; n < channels.length; n++) {
        if (Math.abs(channels[n][index]) > threshold) return true;
      }
      return false;
    }

    var first = 0;
    while (first < length && !audible(first)) first++;
    var last = length - 1;
    while (last > first && !audible(last)) last--;

    var start = first / buffer.sampleRate;
    var end = (last + 1) / buffer.sampleRate;
    if (first >= length || end - start < MIN_HOOK_SEC) return { start: 0, end: buffer.duration };
    return { start: start, end: end };
  }

  function createPlayer(url) {
    var ctx = null;
    var analyser = null;
    var freq = null;
    var edges = null;
    var buffer = null;
    var bounds = null;
    var fetching = null;
    var decoding = null;
    var voice = null;
    var token = 0;
    var disposed = false;

    function preload() {
      if (!fetching) {
        fetching = fetch(url).then(function (res) {
          if (!res.ok) throw new Error('audio HTTP ' + res.status);
          return res.arrayBuffer();
        });
        fetching.catch(function () { fetching = null; });
      }
      return fetching;
    }

    function wake() {
      if (ctx && ctx.state === 'suspended') {
        var resumed = ctx.resume();
        if (resumed && resumed.catch) resumed.catch(function () {});
      }
    }

    // Must run synchronously inside the click that asked for sound.
    function prepare() {
      if (!ctx) {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return Promise.reject(new Error('Web Audio is unavailable'));
        try {
          ctx = new Ctor();
        } catch (e) {
          return Promise.reject(e);
        }
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.connect(ctx.destination);
      }
      wake();
      if (!decoding) {
        decoding = preload().then(function (bytes) {
          return ctx.decodeAudioData(bytes);
        }).then(function (decoded) {
          buffer = decoded;
          bounds = findAudibleBounds(decoded);
        });
        // Decoding detaches the bytes, so a retry has to fetch them again.
        decoding.catch(function () { decoding = null; fetching = null; });
      }
      return decoding;
    }

    function hookLength() {
      return bounds ? bounds.end - bounds.start : 0;
    }

    function startVoice(seconds, loop) {
      var src = ctx.createBufferSource();
      var gain = ctx.createGain();
      var t0 = ctx.currentTime + START_LEAD_SEC;
      var v = { src: src, gain: gain, t0: t0, loop: loop };

      src.buffer = buffer;
      src.connect(gain);
      gain.connect(analyser);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + FADE_SEC);

      if (loop) {
        src.loop = true;
        src.loopStart = bounds.start;
        src.loopEnd = bounds.end;
        src.start(t0, bounds.start);
      } else {
        var length = seconds > 0 ? Math.min(seconds, hookLength()) : hookLength();
        // The song eases out where it stops for the question, instead of cutting off.
        var endFade = Math.min(CLIP_END_FADE_SEC, length / 2);
        gain.gain.setValueAtTime(1, t0 + length - endFade);
        gain.gain.linearRampToValueAtTime(0, t0 + length);
        src.start(t0, bounds.start, length);
      }
      src.onended = function () {
        gain.disconnect();
        if (voice === v) voice = null;
      };
      voice = v;
    }

    function silence() {
      if (!voice) return;
      var v = voice;
      var now = ctx.currentTime;
      voice = null;
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, STOP_FADE_SEC / 3);
        v.src.stop(now + STOP_FADE_SEC);
      } catch (e) { /* the source has already ended */ }
    }

    function play(seconds, loop) {
      silence();
      var mine = ++token;
      return prepare().then(function () {
        if (disposed || mine !== token) return false; // a newer click or a stop has won
        wake();
        startVoice(seconds, loop);
        return true;
      });
    }

    function buildEdges(count, bins) {
      var top = Math.floor(bins * 0.7);
      var out = [1];
      for (var i = 1; i <= count; i++) {
        out.push(Math.max(out[i - 1] + 1, Math.round(1 + (top - 1) * Math.pow(i / count, 1.8))));
      }
      return out;
    }

    return {
      preload: preload,
      wake: wake,
      playClip: function (seconds) { return play(seconds, false); },
      playLoop: function () { return play(null, true); },
      stop: function () { token++; silence(); },
      hasContext: function () { return !!ctx; },
      isReady: function () { return !!buffer; },
      isSounding: function () { return !!voice; },
      isLooping: function () { return !!voice && voice.loop; },
      hookLength: hookLength,

      // Seconds into the hook, read from the audio clock so a throttled tab cannot drift.
      loopPosition: function () {
        if (!voice || !voice.loop) return null;
        return wrap(Math.max(0, ctx.currentTime - voice.t0), hookLength());
      },

      readBars: function (out) {
        var i;
        if (!analyser) {
          for (i = 0; i < out.length; i++) out[i] = 0;
          return;
        }
        if (!edges || edges.length !== out.length + 1) edges = buildEdges(out.length, freq.length);
        analyser.getByteFrequencyData(freq);
        for (i = 0; i < out.length; i++) {
          var peak = 0;
          for (var b = edges[i]; b < edges[i + 1]; b++) {
            if (freq[b] > peak) peak = freq[b];
          }
          out[i] = Math.max(0, (peak / 255 - 0.35) / 0.65);
        }
      },

      dispose: function () {
        disposed = true;
        token++;
        silence();
        if (ctx) {
          var closed = ctx.close();
          if (closed && closed.catch) closed.catch(function () {});
        }
      }
    };
  }

  /* ---------------- pixel drawing ---------------- */

  function mix(a, b, f) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * f) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }

  function halfWidth(r, row) {
    return Math.round(Math.sqrt(r * r - row * row));
  }

  function arch(g, r, color) {
    g.fillStyle = color;
    for (var dy = 1; dy <= r; dy++) {
      var h = halfWidth(r, dy - 0.5);
      g.fillRect(JUKE_CX - h, ARCH_Y - dy, h * 2, 1);
    }
  }

  function disc(g, cx, cy, r, color) {
    g.fillStyle = color;
    for (var dy = -r; dy < r; dy++) {
      var h = halfWidth(r, dy + 0.5);
      g.fillRect(cx - h, cy + dy, h * 2, 1);
    }
  }

  function box(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  }

  function paintCabinet(g) {
    box(g, 12, 196, 26, 8, INK);
    box(g, 94, 196, 26, 8, INK);
    box(g, 15, 198, 20, 3, CARPET_DARK);
    box(g, 97, 198, 20, 3, CARPET_DARK);

    arch(g, 66, INK);
    box(g, 0, ARCH_Y, JUKE_W, 132, INK);
    arch(g, 63, CARPET);
    box(g, 3, ARCH_Y, 126, 129, CARPET);
    box(g, 3, ARCH_Y, 2, 129, CARPET_LIT);
    box(g, 127, ARCH_Y, 2, 129, CARPET_DARK);
    box(g, 3, 192, 126, 3, CARPET_DARK);

    arch(g, 54, BRASS);
    box(g, 12, ARCH_Y, 108, 33, BRASS);
    box(g, 12, 96, 108, 3, BRASS_DARK);

    box(g, 15, 102, 102, 36, BRASS);
    box(g, 15, 135, 102, 3, BRASS_DARK);
    box(g, 18, 105, 96, 30, INK);

    box(g, 15, 142, 102, 26, PLUM);
    box(g, 15, 142, 102, 1, BRASS);
    box(g, 15, 167, 102, 1, INK);

    box(g, 15, 172, 102, 20, INK);
    for (var i = 0; i < 6; i++) box(g, 18, 174 + i * 3, 96, 1, DIM);
  }

  function drawBars(g, levels, x, bottom, barW, step, rows) {
    for (var b = 0; b < levels.length; b++) {
      var lit = Math.round(levels[b] * rows);
      for (var r = 0; r < rows; r++) {
        var color = UNLIT;
        if (r < lit) color = r < rows * 0.55 ? MINT : r < rows * 0.85 ? LAMP : CORAL;
        g.fillStyle = color;
        g.fillRect(x + b * step, bottom - r * 3 - 2, barW, 2);
      }
    }
  }

  function createJukebox() {
    var canvas = A.ui.el('canvas', { class: 'd5-juke art', width: JUKE_W, height: JUKE_H, 'aria-hidden': 'true' });
    var g = canvas.getContext('2d');
    var cabinet = document.createElement('canvas');
    cabinet.width = JUKE_W;
    cabinet.height = JUKE_H;
    paintCabinet(cabinet.getContext('2d'));

    var levels = new Float32Array(EQ_BARS);
    var angle = 0;
    var last = 0;

    function draw(player, now) {
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      player.readBars(levels);
      var sum = 0;
      for (var i = 0; i < EQ_BARS; i++) sum += levels[i];
      var level = sum / EQ_BARS;
      if (player.isSounding()) angle += dt * 3.2;

      g.clearRect(0, 0, JUKE_W, JUKE_H);
      g.drawImage(cabinet, 0, 0);

      var glow = mix(GLOW_IDLE, GLOW_FULL, Math.min(1, 0.25 + level * 1.5));
      arch(g, 51, glow);
      box(g, 15, ARCH_Y, 102, 30, glow);
      for (var y = 72; y < 190; y += 6) {
        box(g, 6, y, 3, 4, glow);
        box(g, 123, y, 3, 4, glow);
      }

      arch(g, 45, NIGHT);
      box(g, 21, ARCH_Y, 90, 24, NIGHT);
      disc(g, JUKE_CX, RECORD_Y, 30, INK);
      disc(g, JUKE_CX, RECORD_Y, 25, PLUM);
      disc(g, JUKE_CX, RECORD_Y, 23, INK);
      disc(g, JUKE_CX, RECORD_Y, 18, PLUM);
      disc(g, JUKE_CX, RECORD_Y, 16, INK);
      disc(g, JUKE_CX, RECORD_Y, 10, BRASS);
      disc(g, JUKE_CX, RECORD_Y, 2, INK);
      g.fillStyle = LAMP;
      for (var radius = 12; radius <= 28; radius++) {
        g.fillRect(Math.round(JUKE_CX + Math.cos(angle) * radius), Math.round(RECORD_Y + Math.sin(angle) * radius), 1, 1);
      }
      var inner = 4;
      g.fillStyle = INK;
      g.fillRect(Math.round(JUKE_CX + Math.cos(angle) * inner * 1.5), Math.round(RECORD_Y + Math.sin(angle) * inner * 1.5), 2, 2);

      drawBars(g, levels, 19, 133, 4, 6, EQ_ROWS);
    }

    return { canvas: canvas, draw: draw };
  }

  function createMiniEq() {
    var width = MINI_BARS * 5 - 1;
    var height = MINI_ROWS * 3;
    var canvas = A.ui.el('canvas', {
      class: 'd5-mini-eq art',
      width: width,
      height: height,
      'aria-hidden': 'true',
      style: { width: width * 3 + 'px', height: height * 3 + 'px' }
    });
    var g = canvas.getContext('2d');
    var levels = new Float32Array(MINI_BARS);
    function draw(player) {
      player.readBars(levels);
      g.clearRect(0, 0, width, height);
      drawBars(g, levels, 0, height, 4, 5, MINI_ROWS);
    }
    return { canvas: canvas, draw: draw };
  }

  /* ---------------- the room ---------------- */

  function open(room, cfg) {
    var C = window.CONTENT;
    var ui = A.ui;
    var el = ui.el;
    var T = cfg.texts;
    var stages = cfg.stages;
    var star = cfg.star || {};
    var saved = A.store.door(ID);
    var player = createPlayer(cfg.audio);

    var stageIndex = Math.floor(Number(saved.stage));
    if (!(stageIndex >= 0)) stageIndex = 0;
    stageIndex = Math.min(stageIndex, stages.length);

    var alive = true;
    var rafId = 0;
    var holdTimer = 0;
    var lastDraw = 0;
    var loading = false;
    var audioFailed = false;
    var nudgeIndex = 0;
    var painter = null;
    var starNode = null;
    var toggleButton = null;
    var paintStatus = function () {};
    var starStaysUp = false;

    function hasClip(stage) {
      return typeof stage.clipSec === 'number' && stage.clipSec > 0;
    }

    function starLit() {
      if (starStaysUp) return true;
      var position = player.loopPosition();
      if (position === null) return false;
      var hook = player.hookLength();
      var at = wrap(Number(star.atSec) || 0, hook);
      var length = Math.min(Number(star.durationSec) || DEFAULT_STAR_SEC, hook);
      var lit = wrap(position - at, hook) < length;
      if (lit && star.stay) starStaysUp = true;
      return lit;
    }

    function refreshStar() {
      if (!starNode) return;
      var lit = starLit();
      if (starNode.hidden === lit) starNode.hidden = !lit;
    }

    function frame(now) {
      if (!alive) return;
      rafId = requestAnimationFrame(frame);
      refreshStar();
      if (painter && now - lastDraw >= DRAW_INTERVAL_MS) {
        lastDraw = now;
        painter.draw(player, now);
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') player.wake();
    }

    function audioFailure(error) {
      if (!alive) return;
      console.warn(error);
      loading = false;
      audioFailed = true;
      paintStatus();
    }

    function setLoading(value) {
      loading = value;
      paintStatus();
    }

    function retry() {
      audioFailed = false;
      setLoading(true);
      player.preload().then(function () {
        if (alive) setLoading(false);
      }, audioFailure);
    }

    function retryButton() {
      return ui.button(T.retry, retry, { className: 'd5-retry' });
    }

    function syncToggle() {
      if (!toggleButton) return;
      toggleButton.textContent = player.isLooping() ? T.stopHook : T.playHook;
      toggleButton.disabled = loading;
    }

    function startHook() {
      audioFailed = false;
      setLoading(!player.isReady());
      player.playLoop().then(function () {
        if (!alive) return;
        setLoading(false);
      }, audioFailure);
    }

    function toggleHook() {
      if (player.isLooping()) {
        player.stop();
        paintStatus();
        return;
      }
      startHook();
    }

    function backdrop() {
      return el('img', { class: 'd5-backdrop art', src: C.hub.background, alt: '', draggable: 'false' });
    }

    function lamps(current) {
      var row = el('div', { class: 'd5-lamps', 'aria-hidden': 'true' });
      stages.forEach(function (stage, i) {
        var cls = 'd5-lamp' + (i < current ? ' is-done' : i === current ? ' is-current' : '');
        row.appendChild(el('div', { class: cls },
          hasClip(stage) ? String(i + 1) : el('span', { class: 'd5-lamp-whole' })));
      });
      var last = current >= stages.length;
      row.appendChild(el('div', { class: 'd5-lamp d5-lamp-star' + (last ? ' is-current' : '') },
        el('img', { class: 'art', src: last ? C.hub.starOn : C.hub.starOff, alt: '', draggable: 'false' })));
      return row;
    }

    function buildScene(current, labels) {
      room.body.textContent = '';
      starNode = null;
      toggleButton = null;
      var jukebox = createJukebox();
      var deck = el('div', { class: 'd5-deck' });
      var panel = el('div', { class: 'd5-panel' },
        el('div', { class: 'd5-head' }, lamps(current), el('div', { class: 'd5-labels' }, labels)));
      room.body.appendChild(el('div', { class: 'd5-room' },
        backdrop(),
        el('div', { class: 'd5-juke-wrap' }, jukebox.canvas, deck),
        panel));
      painter = jukebox;
      return { deck: deck, panel: panel };
    }

    function showStage() {
      var stage = stages[stageIndex];
      var answered = false;
      var scene = buildScene(stageIndex, [
        el('div', { class: 'd5-label-main' }, ui.t(T.stageLabel, { n: stageIndex + 1, total: stages.length })),
        el('div', { class: 'd5-label-sub' }, hasClip(stage) ? T.clipLabel : T.wholeHook)
      ]);

      var playButton = ui.button(T.play, listen, { primary: true, className: 'd5-play' });
      scene.deck.appendChild(playButton);

      var options = el('div', { class: 'd5-options' });
      stage.options.forEach(function (text, i) {
        var option = el('button', { type: 'button', class: 'btn d5-opt' },
          el('span', { class: 'd5-opt-key', 'aria-hidden': 'true' }, String(i + 1)),
          el('span', { class: 'd5-opt-text' }, text));
        option.addEventListener('click', function () { pick(i, option); });
        options.appendChild(option);
      });

      var status = el('div', { class: 'd5-status', role: 'status' });
      scene.panel.appendChild(el('p', { class: 'd5-question' }, stage.question));
      scene.panel.appendChild(options);
      scene.panel.appendChild(status);

      paintStatus = function () {
        status.textContent = '';
        if (audioFailed) {
          status.appendChild(el('p', { class: 'd5-status-text' }, T.loadError));
          status.appendChild(retryButton());
        } else if (loading) {
          status.appendChild(el('p', { class: 'd5-status-text' }, T.loading));
        }
        playButton.disabled = loading || audioFailed;
      };
      paintStatus();

      function listen() {
        setLoading(!player.isReady());
        player.playClip(hasClip(stage) ? stage.clipSec : null).then(function (started) {
          if (!alive) return;
          setLoading(false);
          if (started) playButton.textContent = T.playAgain;
        }, audioFailure);
      }

      function pick(index, option) {
        if (answered) return;
        if (index !== stage.answerIndex) {
          ui.shake(option);
          option.disabled = true;
          option.classList.add('d5-opt-wrong');
          if (cfg.nudges && cfg.nudges.length) {
            ui.nudge(option, cfg.nudges[nudgeIndex % cfg.nudges.length]);
            nudgeIndex++;
          }
          return;
        }
        answered = true;
        option.classList.add('d5-opt-right');
        options.classList.add('is-answered');
        player.stop();
        stageIndex++;
        saved.stage = stageIndex;
        A.store.save();
        holdTimer = setTimeout(function () {
          if (stageIndex >= stages.length) showHook(true);
          else showStage();
        }, CORRECT_HOLD_MS);
      }

      // The click that opened the door already allows sound, so the song just starts.
      if (cfg.autoplay && !audioFailed) listen();
    }

    function showHook(autoStart) {
      var caught = false;
      var scene = buildScene(stages.length, [
        el('div', { class: 'd5-label-main d5-label-hook' }, T.fullHook)
      ]);

      toggleButton = ui.button(T.playHook, toggleHook, { primary: true, className: 'd5-toggle' });
      scene.deck.appendChild(toggleButton);

      function claim(event) {
        if (caught) return;
        caught = true;
        if (event) event.preventDefault();
        A.store.solve(ID);
        showReward();
      }

      function catchStar(event) {
        if (starLit()) claim(event);
      }

      var starButton = el('button', { type: 'button', class: 'd5-star', 'aria-label': T.starAria, hidden: true },
        el('img', { class: 'art', src: C.hub.starOn, alt: '', draggable: 'false' }));
      // Pressing is enough: the target blinks, and a full click could straddle its last moment.
      starButton.addEventListener('pointerdown', catchStar);
      starButton.addEventListener('click', catchStar);

      var hint = el('p', { class: 'd5-hint' }, cfg.listenHint);
      var status = el('div', { class: 'd5-status', role: 'status' });
      scene.panel.appendChild(el('div', { class: 'd5-window' },
        el('div', { class: 'd5-sky', 'aria-hidden': 'true' }),
        el('div', { class: 'd5-city', 'aria-hidden': 'true' }),
        el('div', { class: 'd5-curtain d5-curtain-left', 'aria-hidden': 'true' }),
        el('div', { class: 'd5-curtain d5-curtain-right', 'aria-hidden': 'true' }),
        starButton));
      if (cfg.quote) {
        scene.panel.appendChild(el('blockquote', { class: 'd5-quote' }, cfg.quote.text,
          el('cite', { class: 'd5-quote-author' }, cfg.quote.author)));
      }
      scene.panel.appendChild(hint);
      scene.panel.appendChild(status);
      starNode = starButton;

      paintStatus = function () {
        status.textContent = '';
        hint.hidden = audioFailed;
        if (audioFailed) {
          status.appendChild(el('p', { class: 'd5-status-text' }, T.loadError));
          status.appendChild(retryButton());
          status.appendChild(ui.button(T.getNoteAnyway, claim, { primary: true, className: 'd5-note-anyway' }));
        } else if (loading) {
          status.appendChild(el('p', { class: 'd5-status-text' }, T.loading));
        }
        syncToggle();
      };
      paintStatus();

      if (autoStart && (cfg.autoplay || player.hasContext()) && !audioFailed) startHook();
    }

    function showReward() {
      room.body.textContent = '';
      starNode = null;

      var mini = createMiniEq();
      painter = mini;
      toggleButton = ui.button(T.playHook, toggleHook, { className: 'd5-toggle' });

      var host = el('div', { class: 'd5-room d5-room-reward' }, backdrop(), el('div', { class: 'd5-dim' }));
      room.body.appendChild(host);
      ui.reward(host, {
        letter: cfg.letter,
        note: cfg.secretNote,
        extra: el('div', { class: 'd5-reward-player' }, mini.canvas, toggleButton),
        onDone: function () { room.close(); }
      });

      paintStatus = function () {
        if (audioFailed) {
          audioFailed = false; // the next press simply tries again
          ui.nudge(toggleButton, T.loadError);
        }
        syncToggle();
      };
      paintStatus();
    }

    if (A.store.isSolved(ID)) {
      showReward();
    } else {
      if (stageIndex >= stages.length) showHook(!!cfg.autoplay);
      else showStage();
      player.preload().catch(audioFailure);
    }

    rafId = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', onVisibility);

    return function cleanup() {
      alive = false;
      cancelAnimationFrame(rafId);
      clearTimeout(holdTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      player.dispose();
    };
  }

  A.doors[ID] = { open: open };
})(window.Astra = window.Astra || {});
