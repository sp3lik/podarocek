/* Boot: title, desktop gate, hallway. */
(function (A) {
  'use strict';

  var C = window.CONTENT;
  var gate = document.getElementById('gate');

  function tooSmallOrTouch() {
    var touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    return touch || window.innerWidth < 800 || window.innerHeight < 450;
  }

  function applyGate() {
    var blocked = tooSmallOrTouch();
    gate.hidden = !blocked;
    A.ui.stage.hidden = blocked;
    document.body.classList.toggle('gated', blocked);
  }

  document.title = C.siteTitle;
  gate.textContent = C.ui.desktopOnly;
  window.addEventListener('resize', applyGate);
  applyGate();

  A.hub.render();
})(window.Astra = window.Astra || {});
