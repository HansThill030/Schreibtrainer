(function(){
  var KEY = 'sprachio_consent'; // 'accepted' | 'declined'
  var GA_ID = 'G-S08J1DDYNH';

  function carregarGA(){
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  function criarBanner(){
    if (document.getElementById('cookieBanner')) return;
    var el = document.createElement('div');
    el.id = 'cookieBanner';
    el.innerHTML =
      '<div class="cookie-banner-inner">' +
        '<p>Wir nutzen Cookies für Analyse (Google Analytics), um Sprachio zu verbessern. Du kannst zustimmen oder ablehnen.</p>' +
        '<div class="cookie-banner-btns">' +
          '<button id="cookieDecline" class="ghost">Ablehnen</button>' +
          '<button id="cookieAccept" class="primary">Akzeptieren</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    document.getElementById('cookieAccept').addEventListener('click', function(){
      localStorage.setItem(KEY, 'accepted');
      carregarGA();
      el.remove();
    });
    document.getElementById('cookieDecline').addEventListener('click', function(){
      localStorage.setItem(KEY, 'declined');
      el.remove();
    });
  }

  var decisao = localStorage.getItem(KEY);
  if (decisao === 'accepted') {
    carregarGA();
  } else if (decisao !== 'declined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', criarBanner);
    } else {
      criarBanner();
    }
  }
})();
