/**
 * Engage — tenant settings (política operacional de envio).
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-TENANT-SETTINGS.md
 */
(function () {
  const metaApi = () => window.EngageMetaApi;

  function resolveTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    return metaApi()?.resolveTenantId?.(session) || '';
  }

  function canManageSettings(session) {
    if (metaApi()?.canSyncMetaConnections) {
      return metaApi().canSyncMetaConnections(session);
    }
    const role = String(session?.tenantRole || session?.role || '').toUpperCase();
    return role === 'OWNER' || role === 'ADMIN' || role === 'PLATFORM_ADMIN';
  }

  function buildPaths(session, suffix) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const qs = `tenantId=${encTenant}`;
    return [
      `/api/operator/engage/settings${suffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/settings${suffix}`,
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

  async function getEngageSettings(session) {
    return apiRequest(buildPaths(session, ''), { method: 'GET', session });
  }

  async function patchEngageSettings(session, payload) {
    return apiRequest(buildPaths(session, ''), {
      method: 'PATCH',
      session,
      body: JSON.stringify(payload || {}),
    });
  }

  function mapApiError(err) {
    if (metaApi()?.mapApiError) {
      return metaApi().mapApiError(err);
    }
    const status = Number(err?.statusCode || 0);
    if (status === 403) {
      return { message: 'Apenas administradores podem alterar estes limites.' };
    }
    return {
      message: err?.message || 'Não foi possível carregar as configurações.',
      redirectLogin: status === 401,
    };
  }

  window.EngageTenantSettingsApi = {
    resolveTenantId,
    canManageSettings,
    getEngageSettings,
    patchEngageSettings,
    mapApiError,
  };
})();
