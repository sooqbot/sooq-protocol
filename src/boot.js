(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.setAttribute('data-calm', 'on');
  } catch (e) { /* matchMedia unavailable */ }
  setTimeout(function () {
    if (!root.classList.contains('ready')) root.classList.add('reveal-fail');
  }, 3500);
})();
