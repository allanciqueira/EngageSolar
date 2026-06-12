/**
 * Engage — Campaign timeline (lista + eventos).
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-CAMPAIGN-TIMELINE.md
 */
(function () {
  const metaApi = () => window.EngageMetaApi;

  function resolveTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    return metaApi()?.resolveTenantId?.(session) || '';
  }

  function buildCampaignPaths(session, suffix, campaignId) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const qs = `tenantId=${encTenant}`;
    const encCampaign = campaignId ? encodeURIComponent(campaignId) : '';
    if (!campaignId) {
      return [
        `/api/operator/engage/campaigns${suffix}?${qs}`,
        `/api/operator/engage/tenants/${encTenant}/campaigns${suffix}`,
      ];
    }
    return [
      `/api/operator/engage/campaigns/${encCampaign}${suffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/campaigns/${encCampaign}${suffix}`,
    ];
  }

  function buildDashboardPaths(session, campaignId) {
    const tenantId = resolveTenantId(session);
    const encTenant = encodeURIComponent(tenantId);
    const qs = `tenantId=${encTenant}&campaignId=${encodeURIComponent(campaignId)}`;
    return [
      `/api/operator/engage/campaign-dashboard?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/campaign-dashboard?campaignId=${encodeURIComponent(campaignId)}`,
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

  async function listCampaigns(session, limit = 100) {
    const paths = appendQuery(buildCampaignPaths(session, ''), { limit: String(limit) });
    const payload = await apiRequest(paths, { method: 'GET', session });
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  async function getCampaignTimeline(session, campaignId) {
    return apiRequest(buildCampaignPaths(session, '/timeline', campaignId), {
      method: 'GET',
      session,
    });
  }

  async function getCampaignDashboard(session, campaignId) {
    return apiRequest(buildDashboardPaths(session, campaignId), {
      method: 'GET',
      session,
    });
  }

  function mapApiError(err) {
    const status = Number(err?.statusCode || 0);
    if (status === 404) {
      return { message: 'Campanha não encontrada.', notFound: true };
    }
    if (status === 401) {
      return { message: 'Sessão expirada. Faça login novamente.', redirectLogin: true };
    }
    if (metaApi()?.mapApiError) {
      return metaApi().mapApiError(err);
    }
    return { message: err?.message || 'Não foi possível carregar a timeline.' };
  }

  window.EngageCampaignTimelineApi = {
    resolveTenantId,
    listCampaigns,
    getCampaignTimeline,
    getCampaignDashboard,
    mapApiError,
  };
})();
