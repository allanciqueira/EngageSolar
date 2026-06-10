(function () {
  if (!/^((localhost)|127\.0\.0\.1):5173$/i.test(window.location.host)) return;

  fetch('/__engage/dev-health', { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      if (!data?.ok) warnServe();
    })
    .catch(warnServe);

  function warnServe() {
    fetch('/api/identity/api/auth/providers', { credentials: 'include', cache: 'no-store' })
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('json')) return;
        console.error(
          '[Engage Solar] API sem proxy. Pare o "npx serve" e rode: cd apps\\admin-dashboard && npm run dev',
        );
      })
      .catch(() => {
        console.error(
          '[Engage Solar] Não foi possível falar com a API. Use npm run dev (proxy → gateway ReservaAI).',
        );
      });
  }
})();
