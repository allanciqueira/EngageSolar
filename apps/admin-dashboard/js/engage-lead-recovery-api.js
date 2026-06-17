/**
 * Engage — Lead Recovery Intelligence (BFF /api/operator/engage/lead-recovery/*).
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-LEAD-RECOVERY-INTELLIGENCE.md
 */
(function () {
  const metaApi = () => window.EngageMetaApi;
  const QUEUE_STATUS_ACTIVE = 'active';

  function resolveTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    return metaApi()?.resolveTenantId?.(session) || '';
  }

  function canManage(session) {
    if (metaApi()?.canSyncMetaConnections) {
      return metaApi().canSyncMetaConnections(session);
    }
    const role = String(session?.tenantRole || session?.role || '').toUpperCase();
    return role === 'OWNER' || role === 'ADMIN' || role === 'PLATFORM_ADMIN';
  }

  function buildPaths(session, suffix) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const base = `/lead-recovery${suffix}`;
    const qs = `tenantId=${encTenant}`;
    return [
      `/api/operator/engage${base}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}${base}`,
    ];
  }

  async function apiRequest(paths, options = {}) {
    const api = window.EngageSolarApi || window.ReservaAiApi;
    if (!api?.request) throw new Error('Cliente API indisponível.');
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await api.request(path, { cache: 'no-store', session: options.session, ...options });
      } catch (err) {
        lastErr = err;
        if (Number(err?.statusCode || 0) !== 404) throw err;
      }
    }
    throw lastErr || new Error('Rota Lead Recovery não encontrada.');
  }

  function appendQuery(paths, params) {
    const entries = Object.entries(params || {}).filter(([, v]) => v != null && String(v).trim() !== '');
    if (!entries.length) return paths;
    const extra = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    return paths.map((p) => (p.includes('?') ? `${p}&${extra}` : `${p}?${extra}`));
  }

  function buildReclassifyBody(session, { force = false, confirmed = false } = {}) {
    const body = {
      tenantId: resolveTenantId(session),
      scope: 'unclassified',
      force: !!force,
    };
    if (confirmed) body.confirmed = true;
    return body;
  }

  async function getStats(session) {
    return apiRequest(buildPaths(session, '/stats'), { method: 'GET', session });
  }

  async function getInsights(session, params = {}) {
    const paths = appendQuery(buildPaths(session, '/insights'), params);
    return apiRequest(paths, { method: 'GET', session });
  }

  async function getSignals(session) {
    return apiRequest(buildPaths(session, '/signals'), { method: 'GET', session });
  }

  async function getOpportunities(session, params = {}) {
    const paths = appendQuery(buildPaths(session, '/opportunities'), params);
    return apiRequest(paths, { method: 'GET', session });
  }

  async function getContacts(session, params = {}) {
    const paths = appendQuery(buildPaths(session, '/contacts'), params);
    return apiRequest(paths, { method: 'GET', session });
  }

  async function getContactAudit(session, contactId) {
    const enc = encodeURIComponent(contactId);
    return apiRequest(buildPaths(session, `/contacts/${enc}/audit`), { method: 'GET', session });
  }

  async function exportAudits(session) {
    return apiRequest(buildPaths(session, '/audits/export'), { method: 'GET', session });
  }

  async function reclassifyPreview(session, { force = false } = {}) {
    return apiRequest(buildPaths(session, '/reclassify/preview'), {
      method: 'POST',
      session,
      body: JSON.stringify(buildReclassifyBody(session, { force })),
    });
  }

  async function reclassify(session, { force = false } = {}) {
    return apiRequest(buildPaths(session, '/reclassify'), {
      method: 'POST',
      session,
      body: JSON.stringify(buildReclassifyBody(session, { force, confirmed: true })),
    });
  }

  const LOSS_CATEGORY_LABELS = {
    SEM_CONTATO: 'Sem Contato',
    CONSTRUINDO: 'Construindo',
    ADIADO: 'Adiado',
    ORCAMENTO_ALTO: 'Orçamento Alto',
    FECHOU_CONCORRENTE: 'Concorrente',
    SEM_INTERESSE: 'Sem Interesse',
    NAO_CLASSIFICADO: 'Não Classificados',
    OUTRO: 'Outro',
    NUMERO_INVALIDO: 'Número Inválido',
  };

  const PRIORITY_LABELS = {
    ALTA: 'Alta',
    MEDIA: 'Média',
    BAIXA: 'Baixa',
    DESCARTAR: 'Descartar',
  };

  function labelCategory(code) {
    const key = String(code || '').trim().toUpperCase();
    return LOSS_CATEGORY_LABELS[key] || code || '—';
  }

  function labelPriority(code) {
    const key = String(code || '').trim().toUpperCase();
    return PRIORITY_LABELS[key] || code || '—';
  }

  function labelOpportunityBadge(badge) {
    const key = String(badge || '').trim().toUpperCase();
    if (key === 'ATENCAO') return 'ATENÇÃO';
    if (key === 'ABORDAGEM_ESPECIFICA') return 'ABORDAGEM ESPECÍFICA';
    return badge || '';
  }

  function mapApiError(err) {
    if (metaApi()?.mapApiError) {
      return metaApi().mapApiError(err);
    }
    const status = Number(err?.statusCode || 0);
    if (status === 403) {
      return { message: 'Apenas administradores podem executar esta ação.' };
    }
    return {
      message: err?.message || 'Falha ao consultar Lead Recovery.',
      redirectLogin: status === 401,
    };
  }

  function activeQueueParams(extra = {}) {
    return { status: QUEUE_STATUS_ACTIVE, ...extra };
  }

  window.EngageLeadRecoveryApi = {
    QUEUE_STATUS_ACTIVE,
    activeQueueParams,
    resolveTenantId,
    canManage,
    getStats,
    getInsights,
    getSignals,
    getOpportunities,
    getContacts,
    getContactAudit,
    exportAudits,
    reclassifyPreview,
    reclassify,
    labelCategory,
    labelPriority,
    labelOpportunityBadge,
    mapApiError,
  };
})();
