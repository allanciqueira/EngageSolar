/**
 * Cliente API — Media Library via BFF ReservaAI.
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-MEDIA-LIBRARY.md
 */
(function () {
  const MANAGE_ROLES = new Set(['OWNER', 'ADMIN', 'TENANT_ADMIN']);

  function resolveTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    const metaApi = window.EngageMetaApi;
    if (metaApi?.resolveTenantId) {
      return String(metaApi.resolveTenantId(session) || '').trim();
    }
    return '';
  }

  function canMutateMedia(session) {
    if (window.ReservaPermissions?.isPlatformAdminSession?.(session)) return true;
    if (session?.platformRole === 'PLATFORM_ADMIN') return true;
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const tenantId = resolveTenantId(session);
    const match = tenants.find((t) => String(t?.id || t?.tenantId || '') === tenantId);
    if (match?.canManageTenant === true) return true;
    const role = String(match?.role || session?.tenantRole || '').trim().toUpperCase();
    return MANAGE_ROLES.has(role);
  }

  function getApi() {
    const api = window.EngageSolarApi || window.ReservaAiApi;
    if (!api?.request) throw new Error('Cliente API indisponível.');
    return api;
  }

  function buildPaths(session, suffix, assetId) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const qs = `tenantId=${encTenant}`;
    const encId = assetId ? encodeURIComponent(assetId) : '';
    if (!assetId) {
      return [
        `/api/operator/engage/media-assets${suffix}?${qs}`,
        `/api/operator/engage/tenants/${encTenant}/media-assets${suffix}`,
      ];
    }
    return [
      `/api/operator/engage/media-assets/${encId}${suffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/media-assets/${encId}${suffix}`,
    ];
  }

  function appendQuery(paths, params) {
    const entries = Object.entries(params || {}).filter(([, value]) => value != null && String(value).trim() !== '');
    if (!entries.length) return paths;
    const extra = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
    return paths.map((path) => (path.includes('?') ? `${path}&${extra}` : `${path}?${extra}`));
  }

  async function apiRequest(paths, options = {}) {
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await getApi().request(path, { cache: 'no-store', ...options });
      } catch (err) {
        lastErr = err;
        if (Number(err?.statusCode || 0) !== 404) throw err;
      }
    }
    throw lastErr || new Error('Rota media-assets não encontrada.');
  }

  function normalizeList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  async function listMediaAssets(session, params = {}) {
    const paths = appendQuery(buildPaths(session, '', null), params);
    const payload = await apiRequest(paths, { method: 'GET', session });
    return {
      items: normalizeList(payload),
      page: Number(payload?.page ?? 1) || 1,
      pageSize: Number(payload?.pageSize ?? payload?.limit ?? 50) || 50,
      total: Number(payload?.total ?? 0) || 0,
      totalPages: Number(payload?.totalPages ?? 1) || 1,
      raw: payload,
    };
  }

  async function getMediaAsset(session, assetId) {
    return apiRequest(buildPaths(session, '', assetId), { method: 'GET', session });
  }

  async function uploadMediaAsset(session, file, name) {
    const form = new FormData();
    form.append('file', file);
    const params = {};
    if (name && String(name).trim()) params.name = String(name).trim();
    const paths = appendQuery(buildPaths(session, '/upload', null), params);
    return apiRequest(paths, { method: 'POST', session, body: form });
  }

  async function deleteMediaAsset(session, assetId) {
    return apiRequest(buildPaths(session, '', assetId), { method: 'DELETE', session });
  }

  function resolveTenantOptions(session) {
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    if (!tenants.length) {
      const tenantId = resolveTenantId(session);
      if (!tenantId) return [];
      return [{
        id: tenantId,
        name: String(session?.tenantName || session?.tenant?.name || 'Tenant').trim() || 'Tenant',
      }];
    }
    return tenants.map((row) => ({
      id: String(row?.id || row?.tenantId || '').trim(),
      name: String(row?.name || row?.tenantName || row?.tradeName || row?.legalName || row?.id || 'Tenant').trim(),
    })).filter((row) => row.id);
  }

  window.EngageMediaLibraryApi = {
    resolveTenantId,
    canMutateMedia,
    listMediaAssets,
    getMediaAsset,
    uploadMediaAsset,
    deleteMediaAsset,
    resolveTenantOptions,
  };
})();
