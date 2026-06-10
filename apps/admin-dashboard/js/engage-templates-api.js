/**
 * Cliente API — Templates WhatsApp via BFF ReservaAI.
 * @see HANDOFF-ENGAGE-BFF-TEMPLATES.md
 */
(function () {
  const MANAGE_ROLES = new Set(['OWNER', 'ADMIN', 'TENANT_ADMIN']);

  function readExternalTokenClaims(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      return JSON.parse(atob(padded));
    } catch (_e) {
      return null;
    }
  }

  function resolveTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    const direct = String(
      session?.activeTenantId
      || session?.tenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || '',
    ).trim();
    if (direct) return direct;
    const claims = readExternalTokenClaims(session?.externalAccessToken);
    const fromJwt = String(claims?.tenantId || claims?.tenant_id || claims?.activeTenantId || '').trim();
    if (fromJwt) return fromJwt;
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const first = tenants.find((t) => t && (t.id || t.tenantId));
    return String(first?.id || first?.tenantId || '').trim();
  }

  function resolveTenantRole(session) {
    if (window.ReservaPermissions?.resolveTenantRole) {
      return String(window.ReservaPermissions.resolveTenantRole(session) || '').trim();
    }
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const tenantId = resolveTenantId(session);
    const match = tenants.find((t) => String(t?.id || t?.tenantId || '') === tenantId);
    return String(match?.role || session?.tenantRole || '').trim();
  }

  function canMutateTemplates(session) {
    if (window.ReservaPermissions?.isPlatformAdminSession?.(session)) return true;
    if (session?.platformRole === 'PLATFORM_ADMIN') return true;
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const tenantId = resolveTenantId(session);
    const match = tenants.find((t) => String(t?.id || t?.tenantId || '') === tenantId);
    if (match?.canManageTenant === true) return true;
    const role = resolveTenantRole(session).toUpperCase();
    return MANAGE_ROLES.has(role);
  }

  function getApi() {
    const api = window.EngageSolarApi || window.ReservaAiApi;
    if (!api?.request) throw new Error('Cliente API indisponível.');
    return api;
  }

  function buildPaths(tenantId, resource, extraQuery) {
    const enc = encodeURIComponent(tenantId);
    const params = new URLSearchParams({ tenantId, ...(extraQuery || {}) });
    const qs = params.toString();
    const suffix = extraQuery && Object.keys(extraQuery).length
      ? `?${new URLSearchParams(extraQuery).toString()}`
      : '';
    return [
      `/api/operator/engage/${resource}?${qs}`,
      `/api/operator/engage/tenants/${enc}/${resource}${suffix}`,
      `/engage/${resource}?${qs}`,
      `/engage/tenants/${enc}/${resource}${suffix}`,
    ];
  }

  function formatApiError(err, tenantId) {
    const status = Number(err?.statusCode || err?.status || 0);
    const detail = String(err?.message || err?.error || '').trim();
    if (status === 403) {
      return detail
        || `Sem permissão para o tenant ${tenantId || '—'}. Verifique login e membership, ou configure PLATFORM_ENGAGE_BASE_URL no operator-service.`;
    }
    return detail || 'Falha ao consultar templates Engage.';
  }

  async function apiGet(paths, tenantId) {
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
    const wrapped = new Error(formatApiError(lastErr, tenantId));
    wrapped.statusCode = lastErr?.statusCode || 403;
    throw wrapped;
  }

  async function apiWrite(method, paths, body) {
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await getApi().request(path, {
          method,
          body: body === undefined ? undefined : JSON.stringify(body ?? {}),
        });
      } catch (err) {
        lastErr = err;
        if (Number(err?.statusCode || 0) !== 404) throw err;
      }
    }
    throw lastErr || new Error('Rota Engage não encontrada.');
  }

  function normalizeList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.templates)) return payload.templates;
    return [];
  }

  async function listTemplates(session, limit = 100) {
    const tenantId = resolveTenantId(session);
    if (!tenantId) throw new Error('Tenant não definido na sessão.');
    return apiGet(buildPaths(tenantId, 'templates', { limit: String(limit) }), tenantId).then(normalizeList);
  }

  async function getTemplate(session, templateId) {
    const tenantId = resolveTenantId(session);
    const enc = encodeURIComponent(templateId);
    const encTenant = encodeURIComponent(tenantId);
    return apiGet([
      `/api/operator/engage/templates/${enc}?tenantId=${encTenant}`,
      `/api/operator/engage/tenants/${encTenant}/templates/${enc}`,
      `/engage/templates/${enc}?tenantId=${encTenant}`,
      `/engage/tenants/${encTenant}/templates/${enc}`,
    ], tenantId);
  }

  async function getPreview(session, templateId) {
    const tenantId = resolveTenantId(session);
    const enc = encodeURIComponent(templateId);
    const encTenant = encodeURIComponent(tenantId);
    return apiGet([
      `/api/operator/engage/templates/${enc}/preview?tenantId=${encTenant}`,
      `/api/operator/engage/tenants/${encTenant}/templates/${enc}/preview`,
      `/engage/templates/${enc}/preview?tenantId=${encTenant}`,
      `/engage/tenants/${encTenant}/templates/${enc}/preview`,
    ], tenantId);
  }

  async function getVariablesCatalog(session) {
    const tenantId = resolveTenantId(session);
    return apiGet(buildPaths(tenantId, 'variables/catalog'), tenantId);
  }

  async function createTemplate(session, payload) {
    const tenantId = resolveTenantId(session);
    return apiWrite('POST', buildPaths(tenantId, 'templates'), payload);
  }

  async function updateTemplate(session, templateId, payload) {
    const tenantId = resolveTenantId(session);
    const enc = encodeURIComponent(templateId);
    return apiWrite('PATCH', [
      `/api/operator/engage/templates/${enc}?tenantId=${encodeURIComponent(tenantId)}`,
      `/api/operator/engage/tenants/${encodeURIComponent(tenantId)}/templates/${enc}`,
    ], payload);
  }

  async function submitTemplate(session, templateId) {
    const tenantId = resolveTenantId(session);
    const enc = encodeURIComponent(templateId);
    return apiWrite('POST', [
      `/api/operator/engage/templates/${enc}/submit?tenantId=${encodeURIComponent(tenantId)}`,
      `/api/operator/engage/tenants/${encodeURIComponent(tenantId)}/templates/${enc}/submit`,
    ], {});
  }

  async function syncTemplate(session, templateId) {
    const tenantId = resolveTenantId(session);
    const enc = encodeURIComponent(templateId);
    return apiWrite('POST', [
      `/api/operator/engage/templates/${enc}/sync?tenantId=${encodeURIComponent(tenantId)}`,
      `/api/operator/engage/tenants/${encodeURIComponent(tenantId)}/templates/${enc}/sync`,
    ], {});
  }

  async function duplicateTemplate(session, templateId) {
    const tenantId = resolveTenantId(session);
    const enc = encodeURIComponent(templateId);
    return apiWrite('POST', [
      `/api/operator/engage/templates/${enc}/duplicate?tenantId=${encodeURIComponent(tenantId)}`,
      `/api/operator/engage/tenants/${encodeURIComponent(tenantId)}/templates/${enc}/duplicate`,
    ], {});
  }

  async function archiveTemplate(session, templateId) {
    const tenantId = resolveTenantId(session);
    const enc = encodeURIComponent(templateId);
    return apiWrite('POST', [
      `/api/operator/engage/templates/${enc}/archive?tenantId=${encodeURIComponent(tenantId)}`,
      `/api/operator/engage/tenants/${encodeURIComponent(tenantId)}/templates/${enc}/archive`,
    ], {});
  }

  async function loadMetaConnections(session) {
    const tenantId = resolveTenantId(session);
    const path = `/api/operator/engage/meta-connections?tenantId=${encodeURIComponent(tenantId)}`;
    try {
      return await getApi().request(path, { method: 'GET', cache: 'no-store' });
    } catch (_err) {
      const fallback = `/engage/meta-connections?tenantId=${encodeURIComponent(tenantId)}`;
      return getApi().request(fallback, { method: 'GET', cache: 'no-store' });
    }
  }

  async function listCampaigns(session, limit = 100) {
    const tenantId = resolveTenantId(session);
    const payload = await apiGet(buildPaths(tenantId, 'campaigns', { limit: String(limit) }));
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.campaigns)) return payload.campaigns;
    return [];
  }

  function collectWabas(metaPayload) {
    const seen = new Set();
    const rows = [];

    const pushWaba = (entry) => {
      if (!entry || typeof entry !== 'object') return;
      const id = String(entry.id || entry.metaWabaId || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      rows.push(entry);
    };

    const wabas = Array.isArray(metaPayload?.wabas) ? metaPayload.wabas : [];
    wabas.forEach(pushWaba);

    const phones = Array.isArray(metaPayload?.phoneNumbers) ? metaPayload.phoneNumbers : [];
    phones.forEach((phone) => {
      pushWaba(phone?.metaWaba);
      if (phone?.metaWabaId) {
        pushWaba({ id: phone.metaWabaId, name: phone?.metaWaba?.name, verifiedName: phone?.verifiedName });
      }
    });

    return rows;
  }

  function resolveDefaultWabaId(metaPayload) {
    const wabas = collectWabas(metaPayload);
    const active = wabas.find((w) => w?.isActive !== false) || wabas[0];
    const fromWaba = String(active?.id || active?.metaWabaId || '').trim();
    if (fromWaba) return fromWaba;

    const phones = Array.isArray(metaPayload?.phoneNumbers) ? metaPayload.phoneNumbers : [];
    const phone = phones.find((row) => String(row?.status || '').toUpperCase() === 'CONNECTED') || phones[0];
    return String(
      phone?.metaWaba?.id
      || phone?.metaWabaId
      || phone?.engageWabaId
      || phone?.wabaId
      || '',
    ).trim();
  }

  function resolveBusinessName(metaPayload) {
    const wabas = collectWabas(metaPayload);
    const active = wabas.find((w) => w?.isActive !== false) || wabas[0];
    const fromWaba = String(active?.verifiedName || active?.name || '').trim();
    if (fromWaba) return fromWaba;

    const phones = Array.isArray(metaPayload?.phoneNumbers) ? metaPayload.phoneNumbers : [];
    const phone = phones.find((row) => String(row?.status || '').toUpperCase() === 'CONNECTED') || phones[0];
    return String(phone?.verifiedName || phone?.displayNumber || '').trim() || 'WhatsApp';
  }

  window.EngageTemplatesApi = {
    resolveTenantId,
    canMutateTemplates,
    listTemplates,
    getTemplate,
    getPreview,
    getVariablesCatalog,
    createTemplate,
    updateTemplate,
    submitTemplate,
    syncTemplate,
    duplicateTemplate,
    archiveTemplate,
    loadMetaConnections,
    listCampaigns,
    resolveDefaultWabaId,
    resolveBusinessName,
    collectWabas,
  };
})();
