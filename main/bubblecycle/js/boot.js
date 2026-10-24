// Offline support + install prompt. Works on localhost and on https.
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__installPrompt = e; window.dispatchEvent(new Event('bc-installable')); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    var controlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // A new version waits until the person chooses to switch (see UpdateBanner), so open forms are never lost.
      function waiting(sw) { window.__swWaiting = sw; window.dispatchEvent(new Event('bc-update')); }
      if (reg.waiting && navigator.serviceWorker.controller) waiting(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (nw) nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) waiting(nw); });
      });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(function () {}); });
    }).catch(function () {});
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // The first time a worker takes control of this page (the very first install) must not reload it; a later
      // change means a new version was activated after the person chose "Update now".
      if (!controlled) { controlled = true; return; }
      if (reloading) return;
      reloading = true; location.reload();
    });
  });
}
// If the app module fails to load (e.g. offline, opened via file://), show a helpful message.
setTimeout(function () {
  var boot = document.querySelector('.boot');
  if (boot) boot.innerHTML = '<p><strong>RECYCL IT! couldn’t start.</strong><br>Open it through the launcher (start.bat, start.sh) or <code>python serve.py</code> rather than double-clicking index.html: browsers block ES modules from file:// pages.</p>';
}, 8000);
