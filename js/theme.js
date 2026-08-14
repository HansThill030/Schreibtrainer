(function(){
  var KEY = 'sprachio_theme';
  var saved = localStorage.getItem(KEY) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', saved);

  function criarBotao(){
    if (document.getElementById('themeToggle')) return;
    var btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.title = 'Design wechseln';
    btn.setAttribute('aria-label', 'Design wechseln');
    btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
    btn.addEventListener('click', function(){
      var atual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', atual);
      localStorage.setItem(KEY, atual);
      btn.textContent = atual === 'dark' ? '☀️' : '🌙';
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', criarBotao);
  } else {
    criarBotao();
  }
})();
