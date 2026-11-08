/* Door 1: a question at the hotel desk, the answers are keys hanging on the rack. */
(function (A) {
  'use strict';

  var ID = 1;
  var WRONG_FLASH_MS = 650;
  var RIGHT_PAUSE_MS = 750;
  var LONG_LABEL_CHARS = 60;

  var ui = A.ui;

  A.doors[ID] = {
    open: function (room, cfg) {
      var answered = false;
      var rightTimer = 0;
      var flashTimer = 0;
      var flashing = null;

      var scene = ui.el('div', {
        class: 'd1-scene',
        style: { backgroundImage: 'url("' + window.CONTENT.hub.background + '")' }
      });

      function stopFlash() {
        clearTimeout(flashTimer);
        if (flashing) flashing.classList.remove('d1-tag-wrong');
        flashing = null;
      }

      // The position is saved, so coming back to the door continues with the next joke.
      function nextNudge() {
        var list = cfg.nudges || [];
        if (!list.length) return null;
        var saved = A.store.door(ID);
        var index = (saved.nudge >>> 0) % list.length;
        saved.nudge = (index + 1) % list.length;
        A.store.save();
        return list[index];
      }

      function wrong(tag, slot) {
        stopFlash();
        flashing = tag;
        tag.classList.add('d1-tag-wrong');
        flashTimer = setTimeout(stopFlash, WRONG_FLASH_MS);
        ui.shake(tag);
        var line = nextNudge();
        if (line) ui.nudge(slot, line);
      }

      function showReward() {
        scene.textContent = '';
        scene.classList.add('d1-scene-reward');
        ui.reward(scene, { note: cfg.note, noteTitle: cfg.noteTitle, letter: cfg.letter, onDone: room.close });
      }

      function right(tag, rack) {
        answered = true;
        stopFlash();
        // Solved at once: leaving during the short pause must not lose the letter.
        A.store.solve(ID);
        var bubble = ui.stage.querySelector('.nudge');
        if (bubble) bubble.remove();
        rack.classList.add('d1-answered');
        tag.classList.add('d1-tag-right');
        rightTimer = setTimeout(showReward, RIGHT_PAUSE_MS);
      }

      function buildOption(text, index, rack) {
        var slot = ui.el('div', { class: 'd1-slot' }, ui.el('span', { class: 'd1-hook', 'aria-hidden': 'true' }));
        var tag = ui.el('button', {
          type: 'button',
          class: 'd1-tag' + (text.length > LONG_LABEL_CHARS ? ' d1-tag-long' : ''),
          dataset: { option: String(index) },
          onClick: function () {
            if (answered) return;
            if (index === cfg.answerIndex) right(tag, rack);
            else wrong(tag, slot);
          }
        },
          ui.el('span', { class: 'tile-hole', 'aria-hidden': 'true' }),
          ui.el('span', { class: 'd1-tag-head', 'aria-hidden': 'true' },
            ui.el('span', { class: 'd1-key' }),
            ui.el('span', { class: 'd1-tag-num' }, String(index + 1))),
          ui.el('span', { class: 'd1-tag-label' }, text));
        slot.appendChild(tag);
        return slot;
      }

      function showQuestion() {
        var rack = ui.el('div', { class: 'd1-keys', role: 'group', 'aria-label': cfg.question });
        cfg.options.forEach(function (text, index) {
          rack.appendChild(buildOption(text, index, rack));
        });
        scene.appendChild(ui.el('div', { class: 'd1-card' },
          ui.el('h3', { class: 'd1-question' }, cfg.question),
          cfg.hint ? ui.el('p', { class: 'd1-hint' }, cfg.hint) : null));
        scene.appendChild(ui.el('div', { class: 'd1-desk' }, ui.el('div', { class: 'd1-rail' }), rack));
      }

      room.body.appendChild(scene);
      if (A.store.isSolved(ID)) showReward();
      else showQuestion();

      return function () {
        answered = true;
        clearTimeout(rightTimer);
        stopFlash();
      };
    }
  };
})(window.Astra = window.Astra || {});
