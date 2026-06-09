/**
 * Cliente API Engage (NeuraFlow api-engage) — Meta connections.
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-META-CONNECTIONS.md
 */
(function () {
  const cfg = () => window.ENGAGESOLAR_CONFIG || {};

  function resolveTenantId(session) {
    return String(
      session?.activeTenantId || session?.tenantId || cfg().tenantId || '',
    ).trim();
  }

  function resolveRole(session) {
    return String(
      session?.tenantRole || session?.permissionGroup || session?.role || '',
    ).trim();
  }

  /** OWNER / ADMIN / managedTenant / platform admin podem Sync Now. */
  function canSyncMetaConnections(session) {
    if (window.ReservaPermissions?.canSyncMetaConnections) {
      return window.ReservaPermissions.canSyncMetaConnections(session);
    }
    const role = resolveRole(session).toUpperCase();
    if (role === 'OWNER' || role === 'ADMIN' || role === 'PLATFORM_ADMIN') {
      return true;
    }
    const lower = role.toLowerCase();
    return lower === 'admin' || lower === 'owner' || lower === 'platform_admin';
  }

  function formatEngageMessagingTier(tier) {
    if (!tier?.trim()) return '—';
    const t = tier.trim().toUpperCase();
    if (t === 'TIER_UNLIMITED' || t === 'UNLIMITED') return 'Ilimitado';
    const match = t.match(/^TIER[_\s-]?(\d+(?:\.\d+)?)(K|M)?$/i);
    if (match) {
      const num = match[1];
      const suffix = (match[2] || '').toUpperCase();
      const label = suffix ? `${num}${suffix}` : num;
      return `${label} / 24h`;
    }
    return tier.trim();
  }

  function statusTone(value) {
    const v = String(value || '').trim().toUpperCase();
    if (['CONNECTED', 'GREEN', 'APPROVED'].includes(v)) return 'success';
    if (['PENDING', 'YELLOW', 'MIGRATING', 'PAUSED'].includes(v)) return 'warn';
    if (['DISCONNECTED', 'BLOCKED', 'RED', 'REJECTED'].includes(v)) return 'danger';
    return 'muted';
  }

  async function loadMetaConnections(session) {
    const tenantId = resolveTenantId(session);
    if (!tenantId) {
      throw new Error('Tenant não definido na sessão.');
    }

    const api = window.EngageSolarApi || window.ReservaAiApi;
    if (!api?.request) {
      throw new Error('Cliente API indisponível.');
    }

    const path = `/engage/meta-connections?tenantId=${encodeURIComponent(tenantId)}`;
    return api.request(path, { method: 'GET', cache: 'no-store' });
  }

  async function syncMetaConnections(session) {
    if (!canSyncMetaConnections(session)) {
      const err = new Error('Você não tem permissão para sincronizar.');
      err.statusCode = 403;
      throw err;
    }

    const tenantId = resolveTenantId(session);
    const api = window.EngageSolarApi || window.ReservaAiApi;
    const path = `/engage/meta-connections/sync?tenantId=${encodeURIComponent(tenantId)}`;
    return api.request(path, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  function mapApiError(err) {
    const status = err?.statusCode || err?.status;
    const message = window.EngageUserMessages?.formatApiError
      ? window.EngageUserMessages.formatApiError(err, { context: 'engageMeta' })
      : (err?.message || 'Não foi possível conectar ao Engage neste momento.');
    return {
      message,
      redirectLogin: status === 401,
    };
  }

  window.EngageMetaApi = {
    resolveTenantId,
    resolveRole,
    canSyncMetaConnections,
    formatEngageMessagingTier,
    statusTone,
    loadMetaConnections,
    syncMetaConnections,
    mapApiError,
  };
})();
