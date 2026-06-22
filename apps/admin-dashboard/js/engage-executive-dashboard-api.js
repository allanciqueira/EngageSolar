/**
 * Engage — Dashboard Executivo (Fase 4).
 * @see docs/HANDOFF-ENGAGE-SOLAR-FRONT-EXECUTIVE-DASHBOARD.md
 */
(function () {
  const adminApi = () => window.EngageSolarApi || window.ReservaAiApi;

  const WINDOW_OPTIONS = [
    { key: '7d', label: 'Últimos 7 dias' },
    { key: '30d', label: 'Últimos 30 dias' },
    { key: '90d', label: 'Últimos 90 dias' },
  ];

  const FUNNEL_COLORS = {
    contacts: '#7c3aed',
    messages: '#2563eb',
    replies: '#0ea5e9',
    leads: '#16a34a',
    in_service: '#eab308',
    recovered: '#ef4444',
  };

  const PIPELINE_COLORS = {
    NEW: '#2563eb',
    IN_PROGRESS: '#16a34a',
    WAITING_CUSTOMER: '#f59e0b',
    FOLLOW_UP: '#8b5cf6',
    CLOSED: '#64748b',
  };

  const LEADS_SOURCE_LABELS = {
    CAMPAIGN: 'Campanha',
    INBOUND: 'Orgânico (inbound)',
    SIMULATION: 'Simulação',
    MANUAL: 'Manual',
    RECOVERY: 'Recuperação',
  };

  const LEADS_SOURCE_SHORT = {
    CAMPAIGN: 'campanha',
    INBOUND: 'orgânico',
    SIMULATION: 'simulação',
    MANUAL: 'manual',
    RECOVERY: 'recuperação',
  };

  const LEADS_SOURCE_COLORS = {
    CAMPAIGN: '#2563eb',
    INBOUND: '#16a34a',
    SIMULATION: '#8b5cf6',
    MANUAL: '#f59e0b',
    RECOVERY: '#ef4444',
  };

  const LEADS_SOURCE_ORDER = ['CAMPAIGN', 'INBOUND', 'SIMULATION', 'MANUAL', 'RECOVERY'];

  function normalizeLeadsBySource(raw) {
    const src = (raw && typeof raw === 'object' && raw.leadsBySource)
      ? raw.leadsBySource
      : (raw || {});
    return {
      CAMPAIGN: Number(src.CAMPAIGN || 0) + Number(src.AI || 0),
      INBOUND: Number(src.INBOUND || 0),
      SIMULATION: Number(src.SIMULATION || 0),
      MANUAL: Number(src.MANUAL || 0),
      RECOVERY: Number(src.RECOVERY || 0),
    };
  }

  function leadsBySourceSlices(summaryOrSource) {
    const normalized = normalizeLeadsBySource(summaryOrSource);
    const total = LEADS_SOURCE_ORDER.reduce((sum, key) => sum + normalized[key], 0);
    if (!total) {
      return { total: 0, slices: [] };
    }
    return {
      total,
      slices: LEADS_SOURCE_ORDER
        .map((key) => ({
          key,
          label: LEADS_SOURCE_LABELS[key],
          count: normalized[key],
          pct: normalized[key] / total,
          color: LEADS_SOURCE_COLORS[key],
        }))
        .filter((slice) => slice.count > 0),
    };
  }

  function formatLeadsBySourceSubtitle(summaryOrSource, options = {}) {
    const maxParts = Number(options.maxParts || 5);
    const normalized = normalizeLeadsBySource(summaryOrSource);
    const parts = LEADS_SOURCE_ORDER
      .map((key) => ({ key, count: normalized[key] }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, maxParts)
      .map((item) => `${formatNumber(item.count)} ${LEADS_SOURCE_SHORT[item.key]}`);
    return parts.join(' · ');
  }

  function readExternalTokenClaims(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      return JSON.parse(atob(padded));
    } catch (_) {
      return null;
    }
  }

  function getDefaultTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    const direct = String(
      session?.activeTenantId || session?.tenantId || session?.tenant?.id || '',
    ).trim();
    if (direct) return direct;
    const claims = readExternalTokenClaims(session?.externalAccessToken);
    return String(claims?.tenantId || claims?.tenant_id || '').trim();
  }

  function buildQuery(session, filters) {
    const tenantId = getDefaultTenantId(session);
    const params = new URLSearchParams({ tenantId });
    const f = filters || {};
    if (f.window) params.set('window', f.window);
    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', f.to);
    if (f.campaignId) params.set('campaignId', f.campaignId);
    if (f.audienceId) params.set('audienceId', f.audienceId);
    if (f.assignedSalesConsultantId) params.set('assignedSalesConsultantId', f.assignedSalesConsultantId);
    return params.toString();
  }

  function buildPaths(session, resource, filters) {
    const qs = buildQuery(session, filters);
    const encTenant = encodeURIComponent(getDefaultTenantId(session));
    return [
      `/api/operator/engage/dashboard/${resource}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/dashboard/${resource}?${qs.replace(/^tenantId=[^&]+&?/, '')}`,
    ];
  }

  async function apiGet(session, resource, filters) {
    const api = adminApi();
    if (!api?.request) throw new Error('Cliente API indisponível.');
    const paths = buildPaths(session, resource, filters);
    let lastErr = null;
    for (const path of paths) {
      try {
        return await api.request(path, { method: 'GET', cache: 'no-store', session });
      } catch (err) {
        lastErr = err;
        const status = Number(err?.statusCode || err?.status || 0);
        if (status !== 404) throw err;
      }
    }
    throw lastErr || new Error(`Rota dashboard/${resource} não encontrada.`);
  }

  async function loadAll(session, filters) {
    const [summary, funnel, whatsapp, insights, campaigns, audiences, pipeline] = await Promise.all([
      apiGet(session, 'summary', filters),
      apiGet(session, 'funnel', filters),
      apiGet(session, 'whatsapp', filters),
      apiGet(session, 'insights', filters),
      apiGet(session, 'campaigns', filters),
      apiGet(session, 'audiences', filters),
      apiGet(session, 'pipeline', filters),
    ]);
    return { summary, funnel, whatsapp, insights, campaigns, audiences, pipeline };
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function formatPctFraction(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${(n * 100).toFixed(digits).replace('.', ',')}%`;
  }

  function formatDeltaPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return { text: '—', tone: 'neutral' };
    const pct = Math.abs(n * 100).toFixed(0);
    const sign = n > 0 ? '↑' : '↓';
    return {
      text: `${sign} ${pct}% vs período anterior`,
      tone: n > 0 ? 'up' : 'down',
    };
  }

  function formatDeltaPp(current, previous) {
    const a = Number(current);
    const b = Number(previous);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const diff = (a - b) * 100;
    if (Math.abs(diff) < 0.05) return null;
    const sign = diff > 0 ? '↑' : '↓';
    return `${sign} ${Math.abs(diff).toFixed(1).replace('.', ',')} pp`;
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function windowLabel(windowObj, windowKey) {
    if (windowObj?.label) return windowObj.label;
    const opt = WINDOW_OPTIONS.find((o) => o.key === windowKey);
    return opt?.label || 'Últimos 30 dias';
  }

  function mapApiError(err) {
    const status = Number(err?.statusCode || err?.status || 0);
    if (status === 401) return 'Sessão expirada. Faça login novamente.';
    if (status === 403) return 'Sem permissão para ver o dashboard.';
    if (status === 404) {
      return 'Dashboard Executivo indisponível. Confirme deploy do operator-service (proxy) e do api-engage.';
    }
    return err?.message || 'Não foi possível carregar o dashboard.';
  }

  window.EngageExecutiveDashboardApi = {
    WINDOW_OPTIONS,
    FUNNEL_COLORS,
    PIPELINE_COLORS,
    LEADS_SOURCE_LABELS,
    LEADS_SOURCE_COLORS,
    LEADS_SOURCE_ORDER,
    getDefaultTenantId,
    loadAll,
    normalizeLeadsBySource,
    leadsBySourceSlices,
    formatLeadsBySourceSubtitle,
    formatNumber,
    formatPctFraction,
    formatDeltaPct,
    formatDeltaPp,
    formatDateTime,
    windowLabel,
    mapApiError,
  };
})();
