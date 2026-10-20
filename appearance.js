// Reuse the same appearance preferences as the original map application.
(() => {
  function applyAppearance() {
    try {
      document.body.dataset.theme = localStorage.getItem('tryggpuls_theme') === 'dark' ? 'dark' : 'light';
      document.body.dataset.surface = localStorage.getItem('tryggpuls_surface') === 'glass' ? 'glass' : 'standard';
    } catch {
      document.body.dataset.theme = 'light';
      document.body.dataset.surface = 'standard';
    }
  }
  applyAppearance();
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'tryggpuls_theme' || event.key === 'tryggpuls_surface') applyAppearance();
  });
  for (const link of document.querySelectorAll('.community-nav a')) {
    if (new URL(link.href).pathname === location.pathname) link.setAttribute('aria-current', 'page');
  }
})();
