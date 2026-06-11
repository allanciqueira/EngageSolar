/**
 * Engage — Sender profiles (BFF /api/operator/engage/senders).
 */
(function () {
  const metaApi = () => window.EngageMetaApi;

  function resolveTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    return metaApi()?.resolveTenantId?.(session) || '';
  }

  function canManageSenders(session) {
    if (metaApi()?.canSyncMetaConnections) {
      return metaApi().canSyncMetaConnections(session);
    }
    const role = String(session?.tenantRole || session?.role || '').toUpperCase();
    return role === 'OWNER' || role === 'ADMIN' || role === 'PLATFORM_ADMIN';
  }

  function buildPaths(metaPhoneNumberId, session, suffix) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const encSender = encodeURIComponent(metaPhoneNumberId || '');
    const qs = `tenantId=${encTenant}`;
    if (!metaPhoneNumberId) {
      return [
        `/api/operator/engage/senders?${qs}`,
        `/api/operator/engage/tenants/${encTenant}/senders`,
      ];
    }
    return [
      `/api/operator/engage/senders/${encSender}${suffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/senders/${encSender}${suffix}`,
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

  async function listSenders(session) {
    return apiRequest(buildPaths(null, session), { method: 'GET', session });
  }

  async function patchSender(session, metaPhoneNumberId, body) {
    return apiRequest(buildPaths(metaPhoneNumberId, session, ''), {
      method: 'PATCH',
      session,
      body: JSON.stringify(body || {}),
    });
  }

  async function syncSender(session, metaPhoneNumberId) {
    return apiRequest(buildPaths(metaPhoneNumberId, session, '/sync'), {
      method: 'POST',
      session,
      body: JSON.stringify({}),
    });
  }

  function mapApiError(err) {
    if (metaApi()?.mapApiError) {
      return metaApi().mapApiError(err);
    }
    return {
      message: err?.message || 'Falha ao consultar sender profiles.',
      redirectLogin: Number(err?.statusCode || 0) === 401,
    };
  }

  window.EngageSenderProfilesApi = {
    resolveTenantId,
    canManageSenders,
    formatEngageMessagingTier: (tier) => metaApi()?.formatEngageMessagingTier?.(tier) || tier || '—',
    statusTone: (value) => metaApi()?.statusTone?.(value) || 'muted',
    healthTone(status) {
      const v = String(status || '').trim().toUpperCase();
      if (v === 'HEALTHY') return 'success';
      if (v === 'WARNING') return 'warn';
      if (['DEGRADED', 'CRITICAL', 'BLOCKED'].includes(v)) return 'danger';
      return 'muted';
    },
    listSenders,
    patchSender,
    syncSender,
    mapApiError,
  };
})();
