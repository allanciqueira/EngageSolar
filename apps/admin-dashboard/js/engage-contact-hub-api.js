/**
 * Engage — Contact Hub (BFF /api/operator/engage/contacts + crm-sync).
 */
(function () {
  const metaApi = () => window.EngageMetaApi;

  function resolveTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    return metaApi()?.resolveTenantId?.(session) || '';
  }

  function canManageContacts(session) {
    if (metaApi()?.canSyncMetaConnections) {
      return metaApi().canSyncMetaConnections(session);
    }
    const role = String(session?.tenantRole || session?.role || '').toUpperCase();
    return role === 'OWNER' || role === 'ADMIN' || role === 'PLATFORM_ADMIN';
  }

  function buildPaths(session, suffix, contactId) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const qs = `tenantId=${encTenant}`;
    const encId = contactId ? encodeURIComponent(contactId) : '';
    if (!contactId) {
      return [
        `/api/operator/engage/contacts${suffix}?${qs}`,
        `/api/operator/engage/tenants/${encTenant}/contacts${suffix}`,
      ];
    }
    return [
      `/api/operator/engage/contacts/${encId}${suffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/contacts/${encId}${suffix}`,
    ];
  }

  function buildCrmPaths(session, suffix) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const qs = `tenantId=${encTenant}`;
    return [
      `/api/operator/engage/crm-sync${suffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/crm-sync${suffix}`,
    ];
  }

  function buildImportPaths(session, suffix) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const qs = `tenantId=${encTenant}`;
    return [
      `/api/operator/engage/contacts/import${suffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/contacts/import${suffix}`,
    ];
  }

  function buildAudiencePaths(session, suffix, audienceId) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const qs = `tenantId=${encTenant}`;
    const encId = audienceId ? encodeURIComponent(audienceId) : '';
    if (!audienceId) {
      return [
        `/api/operator/engage/audiences${suffix}?${qs}`,
        `/api/operator/engage/tenants/${encTenant}/audiences${suffix}`,
      ];
    }
    return [
      `/api/operator/engage/audiences/${encId}${suffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/audiences/${encId}${suffix}`,
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
    throw lastErr || new Error('Rota Engage não encontrada.');
  }

  function appendQuery(paths, params) {
    const entries = Object.entries(params || {}).filter(([, v]) => v != null && String(v).trim() !== '');
    if (!entries.length) return paths;
    const extra = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    return paths.map((p) => (p.includes('?') ? `${p}&${extra}` : `${p}?${extra}`));
  }

  async function listContacts(session, params = {}) {
    const paths = appendQuery(buildPaths(session, '', null), params);
    return apiRequest(paths, { method: 'GET', session });
  }

  async function getContact(session, contactId) {
    return apiRequest(buildPaths(session, '', contactId), { method: 'GET', session });
  }

  async function getCampaignHistory(session, contactId, params = {}) {
    const paths = appendQuery(buildPaths(session, '/campaign-history', contactId), params);
    return apiRequest(paths, { method: 'GET', session });
  }

  async function promoteToCustomer(session, contactId) {
    return apiRequest(buildPaths(session, '/promote-to-customer', contactId), {
      method: 'POST',
      session,
      body: JSON.stringify({}),
    });
  }

  async function getCrmSyncStats(session) {
    return apiRequest(buildCrmPaths(session, '/stats'), { method: 'GET', session });
  }

  async function importCrm(session) {
    return apiRequest(buildCrmPaths(session, '/import'), {
      method: 'POST',
      session,
      body: JSON.stringify({}),
    });
  }

  async function uploadContactImport(session, file) {
    const form = new FormData();
    form.append('file', file);
    return apiRequest(buildImportPaths(session, '/upload'), {
      method: 'POST',
      session,
      body: form,
    });
  }

  async function previewContactImport(session, payload) {
    return apiRequest(buildImportPaths(session, '/preview'), {
      method: 'POST',
      session,
      body: JSON.stringify(payload),
    });
  }

  async function runContactImport(session, payload) {
    return apiRequest(buildImportPaths(session, '/run'), {
      method: 'POST',
      session,
      body: JSON.stringify(payload),
    });
  }

  async function listImportMappingProfiles(session) {
    return apiRequest(buildImportPaths(session, '/mapping-profiles'), { method: 'GET', session });
  }

  async function listImportHistory(session, params = {}) {
    const paths = appendQuery(buildImportPaths(session, '/history'), params);
    return apiRequest(paths, { method: 'GET', session });
  }

  async function listAudiences(session, params = {}) {
    const paths = appendQuery(buildAudiencePaths(session, '', null), params);
    return apiRequest(paths, { method: 'GET', session });
  }

  async function getAudience(session, audienceId) {
    return apiRequest(buildAudiencePaths(session, '', audienceId), { method: 'GET', session });
  }

  async function createAudience(session, payload) {
    return apiRequest(buildAudiencePaths(session, '', null), {
      method: 'POST',
      session,
      body: JSON.stringify(payload),
    });
  }

  const LOSS_CATEGORY_LABELS = {
    SEM_CONTATO: 'Sem contato',
    SEM_INTERESSE: 'Sem interesse',
    ADIADO: 'Adiado',
    CONSTRUINDO: 'Em obra',
    ORCAMENTO_ALTO: 'Orçamento alto',
    FECHOU_CONCORRENTE: 'Fechou com concorrência',
    NUMERO_INVALIDO: 'Número inválido',
    OUTRO: 'Outro',
    NAO_CLASSIFICADO: 'Não classificado',
  };

  const ATTRIBUTE_LABELS = {
    vendedor: 'Vendedor',
    cidade: 'Cidade',
    empresa: 'Empresa',
    loss_category: 'Classificação',
    next_contact_at: 'Próximo contacto',
    concessionaria: 'Concessionária',
    pipeline_stage: 'Estágio funil',
    loss_category_source: 'Origem classificação',
    reply_disposition_kind: 'Disposição resposta',
  };

  const SYNC_STATUS_LABELS = {
    synced: 'Sincronizado',
    linked_by_phone: 'Vinculado por telefone',
    no_crm_customer: 'Sem cliente CRM',
    not_linked: 'Não vinculado',
  };

  const SOURCE_TYPE_LABELS = {
    CSV_IMPORT: 'Import CSV',
    NEURAFLOW_CLIENT: 'Cliente CRM',
    MANUAL: 'Manual',
    CRM_IMPORT: 'Import CRM',
  };

  const PREFERRED_ATTR_ORDER = ['vendedor', 'cidade', 'empresa', 'loss_category', 'next_contact_at'];

  function labelAttribute(key) {
    return ATTRIBUTE_LABELS[key] || String(key || '').replace(/_/g, ' ');
  }

  function labelLossCategory(value) {
    const key = String(value || '').trim().toUpperCase();
    return LOSS_CATEGORY_LABELS[key] || value || '—';
  }

  function sortAttributeKeys(keys) {
    const list = Array.isArray(keys) ? [...keys] : [];
    const preferred = PREFERRED_ATTR_ORDER.filter((k) => list.includes(k));
    const rest = list.filter((k) => !PREFERRED_ATTR_ORDER.includes(k)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [...preferred, ...rest];
  }

  function mapApiError(err) {
    if (metaApi()?.mapApiError) {
      return metaApi().mapApiError(err);
    }
    return {
      message: err?.message || 'Falha ao consultar Contact Hub.',
      redirectLogin: Number(err?.statusCode || 0) === 401,
    };
  }

  window.EngageContactHubApi = {
    resolveTenantId,
    canManageContacts,
    listContacts,
    getContact,
    getCampaignHistory,
    promoteToCustomer,
    getCrmSyncStats,
    importCrm,
    uploadContactImport,
    previewContactImport,
    runContactImport,
    listImportMappingProfiles,
    listImportHistory,
    listAudiences,
    getAudience,
    createAudience,
    labelAttribute,
    labelLossCategory,
    labelSyncStatus: (v) => SYNC_STATUS_LABELS[v] || v || '—',
    labelSourceType: (v) => SOURCE_TYPE_LABELS[v] || v || '—',
    sortAttributeKeys,
    mapApiError,
  };
})();
