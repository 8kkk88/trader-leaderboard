/* Shared Google Analytics tag. Measurement IDs are public configuration. */
(() => {
  if (window.ResearchAnalyticsLoaded || location.hostname !== 'kkweb3345678.github.io' || !location.pathname.startsWith('/trader-leaderboard/')) return;
  window.ResearchAnalyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  let referrer = '';
  try { referrer = document.referrer ? new URL(document.referrer).origin + '/' : ''; } catch (_) {}
  window.gtag('config', 'G-QRGMXDPV7V', {
    page_location: document.querySelector('link[rel="canonical"]')?.href || location.origin + location.pathname,
    page_referrer: referrer,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-QRGMXDPV7V';
  document.head.append(script);
})();
