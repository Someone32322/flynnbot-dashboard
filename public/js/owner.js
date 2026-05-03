/* public/js/owner.js — owner panel live uptime ticker */
(function () {
  'use strict';

  const el = document.getElementById('ownerUptime');
  if (!el) return;

  let seconds = parseInt(el.dataset.seconds, 10) || 0;

  function fmt(s) {
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h + 'h ' + m + 'm ' + sec + 's';
  }

  setInterval(function () {
    seconds += 1;
    el.textContent = fmt(seconds);
  }, 1000);
}());
