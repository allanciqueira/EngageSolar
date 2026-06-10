/**
 * API — disposição de respostas de campanha (Inbox WhatsApp).
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-INBOX-CAMPAIGN-DISPOSITION.md
 */
(function () {
  const LOSS_LABELS = {
    ADIADO: 'Adiado',
    FECHOU_CONCORRENTE: 'Fechou com concorrência',
    SEM_INTERESSE: 'Sem interesse',
    SEM_CONTATO: 'Sem contato',
    ORCAMENTO_ALTO: 'Orçamento alto',
    CONSTRUINDO: 'Em obra',
    OUTRO: 'Outro',
    NAO_CLASSIFICADO: 'Não classificado',
  };

  const DISPOSITION_BUTTONS = [
    { label: 'Adiar 15 dias', kind: 'DEFER_15', tone: 'defer' },
    { label: '7 dias', kind: 'DEFER_7', tone: 'defer' },
    { label: '30 dias', kind: 'DEFER_30', tone: 'defer' },
    { label: '6 meses', kind: 'DEFER_180', tone: 'defer' },
    { label: 'Perdido — concorrência', kind: 'LOST_COMPETITOR', tone: 'lost' },
    { label: 'Sem interesse', kind: 'NO_INTEREST', tone: 'lost' },
  ];

  function getApi() {
    const api = window.EngageSolarApi || window.ReservaAiApi;
    if (!api?.request) throw new Error('Cliente API indisponível.');
    return api;
  }

  function resolveTenantId(session, fallbackTenantId) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    return String(
      fallbackTenantId
      || session?.activeTenantId
      || session?.tenantId
      || '',
    ).trim();
  }

  function buildPaths(tenantId, conversationId) {
    const encTenant = encodeURIComponent(tenantId);
    const encConv = encodeURIComponent(conversationId);
    const qs = `tenantId=${encTenant}`;
    return [
      `/api/operator/engage/conversations/${encConv}/disposition?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/conversations/${encConv}/disposition`,
      `/engage/conversations/${encConv}/disposition?${qs}`,
    ];
  }

  async function apiGet(paths) {
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await getApi().request(path, { method: 'GET', cache: 'no-store' });
      } catch (err) {
        lastErr = err;
        const status = Number(err?.statusCode || 0);
        if (status !== 404 && status !== 403) throw err;
      }
    }
    throw lastErr || new Error('Disposição Engage não encontrada.');
  }

  async function apiPost(paths, body) {
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await getApi().request(path, {
          method: 'POST',
          body: JSON.stringify(body ?? {}),
        });
      } catch (err) {
        lastErr = err;
        const status = Number(err?.statusCode || 0);
        if (status !== 404) throw err;
      }
    }
    throw lastErr || new Error('Falha ao gravar disposição.');
  }

  function lossLabel(category) {
    const key = String(category || '').trim().toUpperCase();
    return LOSS_LABELS[key] || (key ? key.replace(/_/g, ' ') : 'Sem classificação');
  }

  function shouldShowBar(ctx) {
    if (!ctx || typeof ctx !== 'object') return 'hidden';
    if (ctx.engageContactId) return 'full';
    if (ctx.hasCampaignContext) return 'warning';
    return 'hidden';
  }

  async function getDisposition(session, tenantId, conversationId) {
    const tid = resolveTenantId(session, tenantId);
    if (!tid || !conversationId) return null;
    try {
      return await apiGet(buildPaths(tid, conversationId));
    } catch (err) {
      if (Number(err?.statusCode || 0) === 404) return null;
      throw err;
    }
  }

  async function applyDisposition(session, tenantId, conversationId, payload) {
    const tid = resolveTenantId(session, tenantId);
    if (!tid || !conversationId) throw new Error('Tenant ou conversa inválidos.');
    return apiPost(buildPaths(tid, conversationId), payload);
  }

  window.EngageDispositionApi = {
    LOSS_LABELS,
    DISPOSITION_BUTTONS,
    lossLabel,
    shouldShowBar,
    getDisposition,
    applyDisposition,
  };
})();
