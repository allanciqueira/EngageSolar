/**
 * Engage — Dashboard de campanhas (somente leitura).
 * Spec: HANDOFF-ENGAGE-SOLAR-FRONT-CAMPAIGN-DASHBOARD.md
 *       HANDOFF-ENGAGE-SOLAR-FRONT-CAMPAIGN-DASHBOARD-PERFORMANCE.md
 *       HANDOFF-ENGAGE-SOLAR-FRONT-CAMPAIGN-DASHBOARD-METRICS.md
 *       HANDOFF-ENGAGE-SOLAR-FRONT-CAMPAIGN-CONVERSOES-RESPOSTAS.md
 */
(function () {
  const adminApi = window.ReservaAiApi;
  const METRICS_REFRESH_MS = 15 * 1000;
  const HEALTH_REFRESH_MS = 60 * 1000;
  const REPLY_REFRESH_MS = 45 * 1000;
  const WINDOW_OPTIONS = [
    { key: '1d', label: 'Hoje' },
    { key: '7d', label: 'Última semana' },
    { key: '15d', label: 'Últimos 15 dias' },
    { key: '30d', label: 'Último mês' },
  ];

  const REPLY_WINDOW_OPTIONS = [
    { key: 'all', label: 'Todas as respostas' },
    { key: '1d', label: 'Hoje' },
    { key: '7d', label: 'Última semana' },
    { key: '15d', label: 'Últimos 15 dias' },
    { key: '30d', label: 'Último mês' },
  ];

  const LOSS_CATEGORY_LABELS = {
    ADIADO: 'Adiado',
    FECHOU_CONCORRENTE: 'Perdeu com concorrência',
    SEM_INTERESSE: 'Sem interesse',
    SEM_CONTATO: 'Sem contato',
    ORCAMENTO_ALTO: 'Orçamento alto',
    CONSTRUINDO: 'Em obra',
    OUTRO: 'Outro',
    NAO_CLASSIFICADO: 'Não classificado',
  };

  const SUCCESS_STATUSES = new Set([
    'COMPLETED', 'SENT', 'ACCEPTED', 'DELIVERED', 'READ', 'DELIVERED_SIMULATED', 'READ_SIMULATED',
  ]);
  const WARN_STATUSES = new Set(['RUNNING', 'PAUSED', 'SCHEDULED', 'QUEUED', 'SENDING']);
  const DANGER_STATUSES = new Set(['FAILED', 'FAILED_SIMULATED']);

  const state = {
    mounted: false,
    active: false,
    session: null,
    loading: false,
    error: '',
    windowKey: '7d',
    selectedCampaignId: '',
    campaigns: [],
    dashboard: null,
    conversionAnalytics: null,
    campaignHealth: null,
    campaignConversions: null,
    replyDispositions: null,
    replyDispositionsWindow: 'all',
    replyDispositionsError: '',
    metricsTimerId: null,
    healthTimerId: null,
    replyTimerId: null,
    inFlight: { metrics: false, health: false, reply: false },
    selectedAttemptId: '',
    attemptDetail: null,
    attemptDetailLoading: false,
    attemptDetailError: '',
    hourlyActivity: null,
    hourlyActivityRemote: null,
    hourlyActivityWindowKey: '',
    hourlyActivitySource: 'none',
    dom: {},
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
      session?.activeTenantId
      || session?.tenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || '',
    ).trim();
    if (direct) return direct;
    const claims = readExternalTokenClaims(session?.externalAccessToken);
    const fromJwt = String(claims?.tenantId || claims?.tenant_id || '').trim();
    if (fromJwt) return fromJwt;
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const first = tenants.find((t) => t && (t.id || t.tenantId));
    return String(first?.id || first?.tenantId || '').trim();
  }

  function tenantQuery(session, extra) {
    const tenantId = getDefaultTenantId(session);
    if (!tenantId) return '';
    const params = new URLSearchParams({ tenantId, ...(extra || {}) });
    return params.toString();
  }

  async function apiGet(paths) {
    if (!adminApi?.request) throw new Error('API indisponível.');
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await adminApi.request(path, { method: 'GET' });
      } catch (err) {
        lastErr = err;
        if (Number(err?.statusCode || 0) !== 404) throw err;
      }
    }
    throw lastErr || new Error('Rota Engage não encontrada.');
  }

  function buildPaths(resource, session, extraQuery) {
    const tenantId = getDefaultTenantId(session);
    const enc = encodeURIComponent(tenantId);
    const qs = tenantQuery(session, extraQuery);
    return [
      `/api/operator/engage/${resource}?${qs}`,
      `/api/operator/engage/tenants/${enc}/${resource}${extraQuery ? `?${new URLSearchParams(extraQuery).toString()}` : ''}`,
    ];
  }

  function statusTone(status) {
    const value = String(status || '').trim().toUpperCase();
    if (SUCCESS_STATUSES.has(value)) return 'ok';
    if (WARN_STATUSES.has(value)) return 'warn';
    if (DANGER_STATUSES.has(value)) return 'danger';
    return 'neutral';
  }

  function statusChip(status) {
    const label = String(status || '—').replace(/_/g, ' ');
    return `<span class="engage-campaign-chip" data-tone="${statusTone(status)}">${escapeHtml(label)}</span>`;
  }

  function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('pt-BR');
  }

  function formatPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  }

  function formatDateShort(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function normalizeConversionMetrics(data) {
    const raw = data?.summary || data || {};
    return {
      replies: Number(raw.replies),
      uniqueRepliers: Number(raw.uniqueRepliers),
      replyRate: raw.replyRate,
      attributedConversations: Number(raw.attributedConversations),
      sentCount: Number(raw.sentCount),
      repliedCount: Number(raw.repliedCount),
    };
  }

  /** Taxa corrigida no front: uniqueRepliers / enviados (API pode devolver 100% por repliedCount). */
  function resolveReplyRatePct(metrics, outbound) {
    const unique = Number.isFinite(metrics.uniqueRepliers) ? metrics.uniqueRepliers : null;
    const replies = Number.isFinite(metrics.replies) ? metrics.replies : null;
    const sent = Number.isFinite(metrics.sentCount) && metrics.sentCount > 0
      ? metrics.sentCount
      : Number(outbound?.messagesSentLive ?? outbound?.messagesSent);
    const read = Number(outbound?.messagesReadLive);

    if (sent > 0 && unique != null && unique >= 0) {
      return (unique / sent) * 100;
    }
    if (sent > 0 && replies != null && replies >= 0) {
      return (replies / sent) * 100;
    }
    if (read > 0 && replies != null && replies >= 0) {
      return (replies / read) * 100;
    }
    const api = Number(metrics.replyRate);
    return Number.isFinite(api) ? api : null;
  }

  function normalizeOutboundSummary(outbound) {
    const raw = outbound && typeof outbound === 'object' ? outbound : {};
    const sent = Number(raw.messagesSent ?? raw.messagesSentLive ?? 0) || 0;
    const failed = Number(raw.messagesFailed ?? 0) || 0;
    const delivered = Number(raw.messagesDeliveredLive ?? 0) || 0;
    const read = Number(raw.messagesReadLive ?? 0) || 0;

    let reached = Number(raw.messagesReachedRecipientLive);
    if (!Number.isFinite(reached) || (reached === 0 && (delivered > 0 || read > 0))) {
      reached = Math.max(delivered, read);
    }

    let inTransit = Number(raw.messagesInTransitLive);
    let derivedInTransit = false;
    if (!Number.isFinite(inTransit) || (inTransit === 0 && sent > reached + failed)) {
      const gap = Math.max(0, sent - reached - failed);
      if (gap > 0) {
        inTransit = gap;
        derivedInTransit = !Number.isFinite(Number(raw.messagesInTransitLive)) || Number(raw.messagesInTransitLive) === 0;
      }
    }

    return {
      ...raw,
      messagesSent: Number(raw.messagesSent ?? sent) || sent,
      messagesSentLive: Number(raw.messagesSentLive ?? 0),
      messagesReachedRecipientLive: reached,
      messagesInTransitLive: inTransit,
      messagesDeliveredLive: delivered,
      messagesReadLive: read,
      messagesFailed: failed,
      _derivedInTransit: derivedInTransit,
    };
  }

  function outboundReachedHint(outbound) {
    const normalized = normalizeOutboundSummary(outbound);
    const sent = Number(normalized.messagesSent ?? 0);
    const reached = Number(normalized.messagesReachedRecipientLive ?? 0);
    const inTransit = Number(normalized.messagesInTransitLive ?? 0);
    const failed = Number(normalized.messagesFailed ?? 0);
    if (!sent) return 'Sem envios no período.';
    const parts = [`${formatNumber(reached)} chegaram`];
    if (inTransit > 0) parts.push(`${formatNumber(inTransit)} em trânsito`);
    if (failed > 0) parts.push(`${formatNumber(failed)} falhas`);
    return `${formatNumber(sent)} enviadas · ${parts.join(' · ')}`;
  }

  function formatOutboundReconciliation(outbound) {
    const normalized = normalizeOutboundSummary(outbound);
    const sent = Number(normalized.messagesSent ?? 0);
    if (!sent) return null;
    const reached = Number(normalized.messagesReachedRecipientLive ?? 0);
    const inTransit = Number(normalized.messagesInTransitLive ?? 0);
    const failed = Number(normalized.messagesFailed ?? 0);
    const rhs = reached + inTransit + failed;
    const balanced = Math.abs(sent - rhs) <= 1;
    return {
      balanced,
      derivedInTransit: Boolean(normalized._derivedInTransit),
      text: balanced
        ? `${formatNumber(sent)} enviadas = ${formatNumber(reached)} chegaram + ${formatNumber(inTransit)} em trânsito + ${formatNumber(failed)} falhas`
        : `${formatNumber(sent)} enviadas · ${formatNumber(reached)} chegaram · ${formatNumber(inTransit)} em trânsito · ${formatNumber(failed)} falhas`,
    };
  }

  function renderOutboundReconciliationPanel(outbound) {
    const normalized = normalizeOutboundSummary(outbound);
    const reconciliation = formatOutboundReconciliation(normalized);
    if (!reconciliation) {
      return `
        <section class="engage-campaign-section engage-campaign-reconciliation">
          <header class="engage-campaign-section-head"><h3>Reconciliação de envios</h3></header>
          <p class="engage-campaign-muted">Sem envios no período seleccionado.</p>
        </section>`;
    }
    const hints = [];
    if (!reconciliation.balanced) {
      hints.push('Valores em actualização — aguarde webhooks Meta ou use Sync.');
    } else if (reconciliation.derivedInTransit) {
      hints.push('Em trânsito calculado: enviadas − chegaram − falhas (API ainda sem webhook de entrega).');
    }
    const hint = hints.length
      ? `<p class="engage-campaign-help">${escapeHtml(hints.join(' '))}</p>`
      : '';
    return `
      <section class="engage-campaign-section engage-campaign-reconciliation" data-balanced="${reconciliation.balanced ? '1' : '0'}">
        <header class="engage-campaign-section-head"><h3>Reconciliação de envios</h3></header>
        <p class="engage-campaign-reconciliation-formula">${escapeHtml(reconciliation.text)}</p>
        <p class="engage-campaign-muted">${escapeHtml(outboundReachedHint(normalized))}</p>
        ${hint}
      </section>`;
  }

  function lossCategoryLabel(category) {
    const key = String(category || '').trim().toUpperCase();
    if (!key) return 'Não classificado';
    return LOSS_CATEGORY_LABELS[key] || key.replace(/_/g, ' ');
  }

  function formatPhoneE164(item) {
    const full = String(item?.phoneE164 || item?.phone || '').trim();
    if (full) return full;
    return String(item?.phoneMasked || '—').trim() || '—';
  }

  function buildReplyDispositionPaths() {
    const tenantId = getDefaultTenantId(state.session);
    const encTenant = encodeURIComponent(tenantId);
    const encCampaign = encodeURIComponent(state.selectedCampaignId);
    const qs = tenantQuery(state.session, {
      window: state.replyDispositionsWindow || 'all',
      limit: '500',
    });
    const suffix = `?${new URLSearchParams({
      window: state.replyDispositionsWindow || 'all',
      limit: '500',
    }).toString()}`;
    return [
      `/api/operator/engage/campaigns/${encCampaign}/reply-dispositions?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/campaigns/${encCampaign}/reply-dispositions${suffix}`,
    ];
  }

  function downloadReplyDispositionsCsv() {
    const report = state.replyDispositions;
    const items = Array.isArray(report?.items) ? report.items : [];
    if (!items.length) return;
    const campaignName = state.dashboard?.campaign?.name || 'campanha';
    const slug = String(campaignName).replace(/[^\w\-]+/g, '-').slice(0, 40);
    const header = ['nome', 'telefone', 'categoria', 'data_retorno', 'respondeu_em', 'disposition_kind', 'motivo'];
    const rows = items.map((item) => [
      item.name || '',
      formatPhoneE164(item),
      lossCategoryLabel(item.lossCategory),
      item.nextContactAt || '',
      item.lastReplyAt || item.repliedAt || '',
      item.dispositionKind || '',
      item.lossReasoning || '',
    ]);
    const csvBody = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `campanha-respostas-${slug}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
  }

  function formatDateTimeSeconds(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(parsed);
  }

  function truncateId(value, size = 7) {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    if (raw.length <= size) return raw;
    return `${raw.slice(0, size)}…`;
  }

  function buildAttemptPaths(attemptId) {
    const tenantId = getDefaultTenantId(state.session);
    const encTenant = encodeURIComponent(tenantId);
    const encAttempt = encodeURIComponent(attemptId);
    const qs = tenantQuery(state.session);
    return [
      `/api/operator/engage/attempts/${encAttempt}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/attempts/${encAttempt}`,
    ];
  }

  function buildHourlyActivityPaths() {
    const tenantId = getDefaultTenantId(state.session);
    const encTenant = encodeURIComponent(tenantId);
    const encCampaign = encodeURIComponent(state.selectedCampaignId);
    const qs = tenantQuery(state.session, { window: state.windowKey });
    return [
      `/api/operator/engage/campaigns/${encCampaign}/hourly-activity?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/campaigns/${encCampaign}/hourly-activity?${qs}`,
    ];
  }

  function resolveDashboardWindowBounds(dash) {
    const windowMeta = dash?.window;
    if (!windowMeta || typeof windowMeta !== 'object') return null;
    const fromMs = windowMeta.from ? Date.parse(windowMeta.from) : NaN;
    const toMs = windowMeta.to ? Date.parse(windowMeta.to) : Date.now();
    if (Number.isNaN(fromMs)) return null;
    return {
      fromMs,
      toMs: Number.isNaN(toMs) ? Date.now() : toMs,
      key: String(windowMeta.key || '').trim(),
      label: String(windowMeta.label || '').trim(),
    };
  }

  function isTimestampInWindow(iso, bounds) {
    if (!iso) return false;
    if (!bounds) return true;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return false;
    return ms >= bounds.fromMs && ms <= bounds.toMs;
  }

  function matchesDashboardWindow(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const payloadKey = String(payload.windowKey || payload.window?.key || '').trim();
    if (!payloadKey) return true;
    return payloadKey === state.windowKey;
  }

  function sentTotalForHourly(dash) {
    const outbound = dash?.summary?.outbound || {};
    return Number(outbound.messagesSentLive ?? outbound.messagesSent ?? 0) || 0;
  }

  function hourlyBucketSentSum(buckets) {
    return (buckets || []).reduce((sum, row) => sum + (Number(row?.sent ?? row?.sends ?? 0) || 0), 0);
  }

  function dayActivityWeight(row) {
    return (Number(row?.sent) || 0) + (Number(row?.read) || 0) + (Number(row?.replied) || 0);
  }

  function readTotalForHourly(dash) {
    const outbound = dash?.summary?.outbound || {};
    return Number(outbound.messagesReadLive ?? 0) || 0;
  }

  function hourlyBucketReadSum(buckets) {
    return (buckets || []).reduce((sum, row) => sum + (Number(row?.read ?? 0) || 0), 0);
  }

  function reconcileDailySentBuckets(buckets, sentTotal) {
    if (!Array.isArray(buckets) || sentTotal <= 0) {
      return { buckets: buckets || [], reconciled: false };
    }
    const currentSum = hourlyBucketSentSum(buckets);
    if (currentSum >= sentTotal) {
      return { buckets, reconciled: false };
    }

    const weights = buckets.map((row) => dayActivityWeight(row));
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    if (weightSum <= 0) {
      return { buckets, reconciled: false };
    }

    let peakIndex = 0;
    let peakValue = 0;
    const next = buckets.map((row, index) => {
      const weight = weights[index];
      const sent = weight > 0 ? Math.max(1, Math.round((sentTotal * weight) / weightSum)) : 0;
      if (sent > peakValue) {
        peakValue = sent;
        peakIndex = index;
      }
      return { ...row, sent };
    });

    let newSum = hourlyBucketSentSum(next);
    const diff = sentTotal - newSum;
    if (diff !== 0) {
      next[peakIndex].sent = Math.max(0, next[peakIndex].sent + diff);
    }

    return { buckets: next, reconciled: true, knownSample: currentSum };
  }

  function reconcileDailyReadBuckets(buckets, readTotal) {
    if (!Array.isArray(buckets) || readTotal <= 0) {
      return { buckets: buckets || [], reconciled: false };
    }
    const currentSum = hourlyBucketReadSum(buckets);
    if (currentSum <= 0 || currentSum >= readTotal) {
      return { buckets, reconciled: false };
    }

    const factor = readTotal / currentSum;
    let peakIndex = 0;
    let peakValue = 0;
    const next = buckets.map((row, index) => {
      const read = row.read > 0 ? Math.max(1, Math.round(row.read * factor)) : 0;
      if (read > peakValue) {
        peakValue = read;
        peakIndex = index;
      }
      return { ...row, read };
    });

    let newSum = hourlyBucketReadSum(next);
    const diff = readTotal - newSum;
    if (diff !== 0) {
      next[peakIndex].read = Math.max(0, next[peakIndex].read + diff);
    }

    return { buckets: next, reconciled: true };
  }

  function reconcileHourlySentBuckets(buckets, sentTotal) {
    if (!Array.isArray(buckets) || sentTotal <= 0) {
      return { buckets: buckets || [], reconciled: false };
    }
    const currentSum = hourlyBucketSentSum(buckets);
    if (currentSum <= 0 || currentSum >= sentTotal) {
      return { buckets, reconciled: false };
    }

    const factor = sentTotal / currentSum;
    let peakHour = 0;
    let peakValue = 0;
    const next = buckets.map((row) => {
      const sent = row.sent > 0 ? Math.max(1, Math.round(row.sent * factor)) : 0;
      if (sent > peakValue) {
        peakValue = sent;
        peakHour = row.hour;
      }
      return { ...row, sent };
    });

    let newSum = hourlyBucketSentSum(next);
    const diff = sentTotal - newSum;
    if (diff !== 0) {
      const peakIndex = next.findIndex((row) => row.hour === peakHour);
      if (peakIndex >= 0) next[peakIndex].sent = Math.max(0, next[peakIndex].sent + diff);
    }

    return { buckets: next, reconciled: true, knownSample: currentSum };
  }

  function finalizeHourlyActivity(activity, sentTotal) {
    if (!activity?.buckets?.length) return activity;

    const dash = state.dashboard || {};
    const readTotal = readTotalForHourly(dash);
    const sentInChart = hourlyBucketSentSum(activity.buckets);

    if (activity.granularity === 'day') {
      let buckets = activity.buckets;
      let sentReconciled = Boolean(activity.sentReconciled);
      let readReconciled = false;
      let knownSample = Number(activity.sentKnownSample ?? activity.partialSentWithTimestamp ?? sentInChart) || sentInChart;

      if (!sentReconciled && sentTotal > 0 && sentInChart < sentTotal) {
        const reconciled = reconcileDailySentBuckets(buckets, sentTotal);
        if (reconciled.reconciled) {
          buckets = reconciled.buckets;
          sentReconciled = true;
          knownSample = reconciled.knownSample ?? knownSample;
        }
      }

      const readResult = reconcileDailyReadBuckets(buckets, readTotal);
      if (readResult.reconciled) {
        buckets = readResult.buckets;
        readReconciled = true;
      }

      return {
        ...activity,
        buckets,
        partial: !sentReconciled && sentTotal > 0 && hourlyBucketSentSum(buckets) < sentTotal,
        sentReconciled,
        readReconciled,
        sentKnownSample: knownSample,
        partialSentWithTimestamp: sentReconciled ? sentTotal : (activity.partialSentWithTimestamp ?? sentInChart),
        partialSentTotal: sentTotal || activity.partialSentTotal || 0,
      };
    }

    if (activity.sentReconciled || (!activity.partial && sentTotal > 0 && sentInChart >= sentTotal)) {
      return { ...activity, partial: false };
    }

    const reconciled = reconcileHourlySentBuckets(activity.buckets, sentTotal);
    if (!reconciled.reconciled) {
      return activity;
    }

    return {
      ...activity,
      buckets: reconciled.buckets,
      partial: false,
      sentReconciled: true,
      sentKnownSample: reconciled.knownSample,
      partialSentWithTimestamp: sentTotal,
      partialSentTotal: sentTotal,
    };
  }

  function buildLifecycleLabel(attempt) {
    const stages = ['PLANNED', 'QUEUED', 'SENDING', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ'];
    const current = String(attempt?.status || '').trim().toUpperCase();
    const currentIndex = stages.indexOf(current);
    if (currentIndex < 0) return current || '—';
    return stages.slice(0, currentIndex + 1).join(' → ');
  }

  function formatMoney(value) {
    return formatNumber(value);
  }

  const CHART_STATUS_COLORS = {
    PENDING: '#fbbf24',
    DELIVERED: '#2563eb',
    READ: '#22c55e',
    SENT: '#60a5fa',
    QUEUED: '#94a3b8',
    FAILED: '#ef4444',
    SENDING: '#f59e0b',
    COMPLETED: '#10b981',
    ACCEPTED: '#38bdf8',
    SCHEDULED: '#a78bfa',
    PAUSED: '#fb923c',
    RUNNING: '#3b82f6',
  };

  function chartColorForStatus(key) {
    return CHART_STATUS_COLORS[String(key || '').trim().toUpperCase()] || '#64748b';
  }

  function renderBreakdown(title, map) {
    const entries = map && typeof map === 'object'
      ? Object.entries(map).filter(([, count]) => Number(count) > 0)
      : [];
    if (!entries.length) {
      return `<article class="engage-campaign-breakdown"><h4>${escapeHtml(title)}</h4><p class="engage-campaign-muted">Sem dados.</p></article>`;
    }
    const max = Math.max(...entries.map(([, count]) => Number(count) || 0), 1);
    const rows = entries.map(([key, count]) => `
      <div class="engage-campaign-breakdown-row">
        <span>${statusChip(key)}</span>
        <div class="engage-campaign-breakdown-bar" aria-hidden="true"><span style="width:${Math.max(8, (Number(count) / max) * 100)}%;background:${chartColorForStatus(key)}"></span></div>
        <strong>${formatNumber(count)}</strong>
      </div>`).join('');
    return `<article class="engage-campaign-breakdown"><h4>${escapeHtml(title)}</h4>${rows}</article>`;
  }

  function renderDonutChart(title, map) {
    const entries = map && typeof map === 'object'
      ? Object.entries(map).filter(([, count]) => Number(count) > 0)
      : [];
    if (!entries.length) {
      return `<article class="engage-campaign-chart-card engage-campaign-donut-card"><h4>${escapeHtml(title)}</h4><p class="engage-campaign-muted">Sem dados.</p></article>`;
    }
    const total = entries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
    let acc = 0;
    const gradientStops = entries.map(([key, count]) => {
      const pct = ((Number(count) || 0) / total) * 100;
      const start = acc;
      acc += pct;
      return `${chartColorForStatus(key)} ${start}% ${acc}%`;
    }).join(', ');
    const legend = entries.map(([key, count]) => {
      const pct = ((Number(count) || 0) / total) * 100;
      return `
        <div class="engage-campaign-donut-legend-item">
          <span class="engage-campaign-donut-swatch" style="background:${chartColorForStatus(key)}"></span>
          <span class="engage-campaign-donut-legend-label">${escapeHtml(String(key).replace(/_/g, ' '))}</span>
          <strong>${formatNumber(count)}</strong>
          <small>${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small>
        </div>`;
    }).join('');
    return `
      <article class="engage-campaign-chart-card engage-campaign-donut-card">
        <h4>${escapeHtml(title)}</h4>
        <div class="engage-campaign-donut-wrap">
          <div class="engage-campaign-donut" style="background:conic-gradient(${gradientStops})" role="img" aria-label="${escapeAttr(title)}">
            <div class="engage-campaign-donut-hole">
              <strong>${formatNumber(total)}</strong>
              <small>total</small>
            </div>
          </div>
          <div class="engage-campaign-donut-legend">${legend}</div>
        </div>
      </article>`;
  }

  function renderFunnel(outbound, conversions) {
    const convSummary = conversions?.summary || conversions || {};
    const normalized = normalizeOutboundSummary(outbound);
    const sent = Number(normalized.messagesSent) || 0;
    const reached = Number(normalized.messagesReachedRecipientLive) || 0;
    const read = Number(normalized.messagesReadLive) || 0;
    const replies = Number(convSummary.replies) || 0;
    const steps = [
      { label: 'Enviadas', value: sent, color: '#1e5aa8' },
      { label: 'Chegaram', value: reached, color: '#2563eb' },
      { label: 'Lidas', value: read, color: '#22c55e' },
      { label: 'Respostas', value: replies, color: '#fbbf24' },
    ];
    const max = Math.max(sent, 1);
    const rows = steps.map((step, index) => {
      const widthPct = Math.max(14, (step.value / max) * 100);
      const prev = index > 0 ? steps[index - 1].value : 0;
      const convPct = prev > 0 ? ((step.value / prev) * 100) : null;
      return `
        <div class="engage-campaign-funnel-step">
          <div class="engage-campaign-funnel-label">
            <span>${escapeHtml(step.label)}</span>
            ${convPct != null ? `<small>${convPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do anterior</small>` : ''}
          </div>
          <div class="engage-campaign-funnel-bar-wrap" aria-hidden="true">
            <div class="engage-campaign-funnel-bar" style="width:${widthPct}%;background:${step.color}"></div>
          </div>
          <strong>${formatNumber(step.value)}</strong>
        </div>`;
    }).join('');
    return `
      <article class="engage-campaign-chart-card engage-campaign-funnel-card">
        <h4>Funil de entrega</h4>
        <div class="engage-campaign-funnel">${rows}</div>
      </article>`;
  }

  function shouldUseDailyActivityChart(windowKey) {
    return Boolean(windowKey) && windowKey !== '1d';
  }

  function activityChartGranularity(windowKey) {
    return shouldUseDailyActivityChart(windowKey) ? 'day' : 'hour';
  }

  function dayKeyFromIso(iso, timeZone) {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(parsed);
    } catch (_err) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  function createDailyBucketRange(bounds, timeZone) {
    if (!bounds) return [];
    const labelFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      day: '2-digit',
      month: 'short',
    });
    const buckets = [];
    const seen = new Set();
    let cursor = bounds.fromMs;
    let guard = 0;
    while (cursor <= bounds.toMs && guard < 400) {
      guard += 1;
      const dayKey = dayKeyFromIso(new Date(cursor).toISOString(), timeZone);
      if (dayKey && !seen.has(dayKey)) {
        seen.add(dayKey);
        buckets.push({
          dayKey,
          label: labelFormatter.format(new Date(cursor)),
          sent: 0,
          read: 0,
          replied: 0,
        });
      }
      cursor += 6 * 60 * 60 * 1000;
    }
    const endKey = dayKeyFromIso(new Date(bounds.toMs).toISOString(), timeZone);
    if (endKey && !seen.has(endKey)) {
      buckets.push({
        dayKey: endKey,
        label: labelFormatter.format(new Date(bounds.toMs)),
        sent: 0,
        read: 0,
        replied: 0,
      });
    }
    return buckets.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }

  function bumpDailyBucket(buckets, dayKey, field) {
    if (!dayKey) return;
    const row = buckets.find((bucket) => bucket.dayKey === dayKey);
    if (row) row[field] += 1;
  }

  function activityBucketsHaveData(buckets) {
    return (buckets || []).some((row) => row.sent > 0 || row.read > 0 || row.replied > 0);
  }

  function normalizeDailyBuckets(rawBuckets, bounds, timeZone) {
    const buckets = createDailyBucketRange(bounds, timeZone);
    if (!rawBuckets) return buckets;
    const map = new Map(buckets.map((row) => [row.dayKey, { ...row }]));
    const rows = Array.isArray(rawBuckets) ? rawBuckets : [];
    rows.forEach((row) => {
      const dayKey = String(row?.dayKey || row?.date || row?.day || '').trim();
      if (!map.has(dayKey)) return;
      const bucket = map.get(dayKey);
      bucket.sent = Number(row?.sent ?? row?.sends ?? row?.sentCount ?? 0) || 0;
      bucket.read = Number(row?.read ?? row?.reads ?? row?.readCount ?? 0) || 0;
      bucket.replied = Number(row?.replied ?? row?.replies ?? row?.replyCount ?? 0) || 0;
    });
    return [...map.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }

  function findPeakBucket(buckets, field, labelField = 'label') {
    let peak = null;
    let peakValue = 0;
    (buckets || []).forEach((row) => {
      const value = Number(row[field]) || 0;
      if (value > peakValue) {
        peakValue = value;
        peak = row;
      }
    });
    return peakValue > 0 ? { label: peak[labelField] || peak.dayKey, value: peakValue } : null;
  }

  function createEmptyHourlyBuckets() {
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sent: 0,
      read: 0,
      replied: 0,
    }));
  }

  function hourFromIso(iso, timeZone) {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    if (timeZone) {
      try {
        const parts = new Intl.DateTimeFormat('pt-BR', {
          timeZone,
          hour: 'numeric',
          hour12: false,
        }).formatToParts(parsed);
        const hourPart = parts.find((part) => part.type === 'hour');
        if (hourPart) return Number(hourPart.value);
      } catch (_err) {
        /* usa horário local */
      }
    }
    return parsed.getHours();
  }

  function bumpHourlyBucket(buckets, hour, field) {
    if (hour == null || hour < 0 || hour > 23) return;
    buckets[hour][field] += 1;
  }

  function recordIdentity(record) {
    return String(
      record?.id
      || record?.attemptId
      || record?.messageId
      || `${record?.attemptNo || ''}-${record?.metaMessageId || record?.meta_message_id || ''}-${sentTimestampForAttempt(record) || record?.updatedAt || ''}`,
    ).trim();
  }

  function collectCampaignSendRecords(dash, hourlyPayload) {
    const map = new Map();
    const summary = dash?.summary && typeof dash.summary === 'object' ? dash.summary : {};
    const lists = [
      hourlyPayload?.attempts,
      hourlyPayload?.messages,
      hourlyPayload?.items,
      dash?.attemptsInWindow,
      dash?.windowAttempts,
      summary.attemptsInWindow,
      summary.windowAttempts,
      summary.messages,
      dash?.messages,
      dash?.campaignMessages,
      dash?.outboundMessages,
      dash?.sentMessages,
      dash?.attempts,
      summary.attempts,
      dash?.hourlyActivity?.attempts,
      dash?.hourlyActivity?.messages,
      dash?.recentAttempts,
      summary.recentAttempts,
    ];
    lists.forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((record) => {
        const id = recordIdentity(record);
        if (!id) return;
        if (!map.has(id)) map.set(id, record);
      });
    });
    return [...map.values()];
  }

  function sentTimestampForAttempt(attempt) {
    return attempt?.sentAt || attempt?.sent_at
      || attempt?.acceptedAt || attempt?.accepted_at
      || attempt?.deliveredAt || attempt?.delivered_at
      || attempt?.queuedAt || attempt?.queued_at
      || attempt?.startedAt || attempt?.started_at
      || attempt?.lastAttemptAt || attempt?.last_attempt_at
      || attempt?.attemptedAt || attempt?.attempted_at
      || attempt?.firstSentAt || attempt?.first_sent_at
      || attempt?.createdAt || attempt?.created_at
      || attempt?.timestamp || null;
  }

  function readTimestampForAttempt(attempt) {
    return attempt?.readAt || attempt?.read_at || null;
  }

  function isMockHourlyPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.mock === true || payload.isMock === true || payload.synthetic === true) return true;
    const source = String(payload.source || payload.dataSource || '').trim().toLowerCase();
    return source === 'mock' || source === 'demo' || source === 'synthetic';
  }

  function normalizeHourlyBuckets(rawBuckets) {
    const buckets = createEmptyHourlyBuckets();
    if (!rawBuckets) return buckets;

    if (Array.isArray(rawBuckets)) {
      rawBuckets.forEach((row, index) => {
        const hour = Number.isFinite(Number(row?.hour)) ? Number(row.hour) : index;
        if (hour < 0 || hour > 23) return;
        buckets[hour].sent = Number(row?.sent ?? row?.sends ?? row?.sentCount ?? 0) || 0;
        buckets[hour].read = Number(row?.read ?? row?.reads ?? row?.readCount ?? 0) || 0;
        buckets[hour].replied = Number(row?.replied ?? row?.replies ?? row?.replyCount ?? 0) || 0;
      });
      return buckets;
    }

    const sent = Array.isArray(rawBuckets.sent) ? rawBuckets.sent : [];
    const read = Array.isArray(rawBuckets.read) ? rawBuckets.read : [];
    const replied = Array.isArray(rawBuckets.replied ?? rawBuckets.replies) ? (rawBuckets.replied || rawBuckets.replies) : [];
    for (let hour = 0; hour < 24; hour += 1) {
      buckets[hour].sent = Number(sent[hour]) || 0;
      buckets[hour].read = Number(read[hour]) || 0;
      buckets[hour].replied = Number(replied[hour]) || 0;
    }
    return buckets;
  }

  function hourlyBucketsHaveData(buckets) {
    return buckets.some((row) => row.sent > 0 || row.read > 0 || row.replied > 0);
  }

  function buildHourlyActivityFromMessages(dash, replyDispositions, hourlyPayload) {
    const records = collectCampaignSendRecords(dash, hourlyPayload);
    if (!records.length) return null;

    const bounds = resolveDashboardWindowBounds(dash);
    const timeZone = hourlyPayload?.timezone
      || dash?.hourlyActivity?.timezone
      || dash?.window?.timezone
      || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const granularity = activityChartGranularity(state.windowKey);
    const buckets = granularity === 'day'
      ? createDailyBucketRange(bounds, timeZone)
      : createEmptyHourlyBuckets();
    let sentWithTimestamp = 0;

    records.forEach((record) => {
      const sentAt = sentTimestampForAttempt(record);
      if (sentAt && isTimestampInWindow(sentAt, bounds)) {
        sentWithTimestamp += 1;
        if (granularity === 'day') {
          bumpDailyBucket(buckets, dayKeyFromIso(sentAt, timeZone), 'sent');
        } else {
          bumpHourlyBucket(buckets, hourFromIso(sentAt, timeZone), 'sent');
        }
      }
      const readAt = readTimestampForAttempt(record);
      if (readAt && isTimestampInWindow(readAt, bounds)) {
        if (granularity === 'day') {
          bumpDailyBucket(buckets, dayKeyFromIso(readAt, timeZone), 'read');
        } else {
          bumpHourlyBucket(buckets, hourFromIso(readAt, timeZone), 'read');
        }
      }
    });

    const replyItems = Array.isArray(replyDispositions?.items) ? replyDispositions.items : [];
    replyItems.forEach((item) => {
      const repliedAt = item?.lastReplyAt || item?.repliedAt;
      if (repliedAt && isTimestampInWindow(repliedAt, bounds)) {
        if (granularity === 'day') {
          bumpDailyBucket(buckets, dayKeyFromIso(repliedAt, timeZone), 'replied');
        } else {
          bumpHourlyBucket(buckets, hourFromIso(repliedAt, timeZone), 'replied');
        }
      }
    });

    if (!activityBucketsHaveData(buckets)) return null;

    const sentTotal = Number(dash?.summary?.outbound?.messagesSentLive ?? dash?.summary?.outbound?.messagesSent ?? 0) || 0;

    return {
      buckets,
      granularity,
      timezone: timeZone,
      source: 'messages',
      windowKey: bounds?.key || state.windowKey,
      windowLabel: bounds?.label || '',
      partial: sentTotal > 0 && sentWithTimestamp < sentTotal,
      partialSentWithTimestamp: sentWithTimestamp,
      partialSentTotal: sentTotal,
      peaks: hourlyPayload?.peaks || dash?.hourlyActivity?.peaks || null,
    };
  }

  function isTrustedDailyBucketsPayload(payload) {
    if (!payload || typeof payload !== 'object' || isMockHourlyPayload(payload)) return false;
    if (!matchesDashboardWindow(payload)) return false;
    if (payload.granularity !== 'day') return false;
    const bounds = resolveDashboardWindowBounds(state.dashboard);
    const timeZone = payload.timezone || state.dashboard?.window?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const buckets = normalizeDailyBuckets(payload.buckets || payload.dailyBuckets, bounds, timeZone);
    return activityBucketsHaveData(buckets);
  }

  function buildDailyActivityFromAggregatedBuckets(payload, sourceLabel, sentTotal = 0) {
    if (!isTrustedDailyBucketsPayload(payload)) return null;
    const bounds = resolveDashboardWindowBounds(state.dashboard);
    const timeZone = payload.timezone || state.dashboard?.window?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const buckets = normalizeDailyBuckets(payload.buckets || payload.dailyBuckets, bounds, timeZone);
    if (!activityBucketsHaveData(buckets)) return null;
    const sentInBuckets = hourlyBucketSentSum(buckets);
    return {
      buckets,
      granularity: 'day',
      timezone: timeZone,
      source: payload.source || sourceLabel,
      windowKey: bounds?.key || state.windowKey,
      windowLabel: bounds?.label || '',
      partial: sentTotal > 0 && sentInBuckets < sentTotal,
      partialSentWithTimestamp: Number(payload.partialSentWithTimestamp ?? sentInBuckets) || sentInBuckets,
      partialSentTotal: Number(payload.partialSentTotal ?? sentTotal) || sentTotal,
      peaks: payload.peaks || null,
    };
  }

  function isTrustedHourlyBucketsPayload(payload, sentTotal = 0) {
    if (shouldUseDailyActivityChart(state.windowKey)) return false;
    if (!payload || typeof payload !== 'object' || isMockHourlyPayload(payload)) return false;
    if (!matchesDashboardWindow(payload)) return false;
    const buckets = normalizeHourlyBuckets(payload.buckets || payload);
    if (!hourlyBucketsHaveData(buckets)) return false;

    const source = String(payload.source || '').trim().toLowerCase();
    if (['campaign-dashboard', 'api', 'engage', 'sql'].includes(source) && !payload.partial) {
      return true;
    }

    const sentInBuckets = hourlyBucketSentSum(buckets);
    if (!payload.partial && sentInBuckets > 0) return true;
    if (sentTotal > 0 && sentInBuckets >= Math.max(10, Math.ceil(sentTotal * 0.5))) return true;
    if (Array.isArray(payload.attempts) && payload.attempts.length >= Math.min(sentTotal || 50, 50)) {
      return true;
    }
    return false;
  }

  function buildHourlyActivityFromAggregatedBuckets(payload, sourceLabel, sentTotal = 0) {
    if (!isTrustedHourlyBucketsPayload(payload, sentTotal)) return null;
    const buckets = normalizeHourlyBuckets(payload.buckets || payload);
    if (!hourlyBucketsHaveData(buckets)) return null;
    const sentInBuckets = hourlyBucketSentSum(buckets);
    const partial = Boolean(payload.partial) || (sentTotal > 0 && sentInBuckets < sentTotal);
    return {
      buckets,
      granularity: 'hour',
      timezone: payload.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      source: payload.source || sourceLabel,
      partial,
      partialSentWithTimestamp: Number(payload.partialSentWithTimestamp ?? sentInBuckets) || sentInBuckets,
      partialSentTotal: Number(payload.partialSentTotal ?? sentTotal) || sentTotal,
      peaks: payload.peaks || null,
    };
  }

  function scoreHourlyActivity(activity, sentTotal) {
    if (!activity?.buckets?.length) return -1;
    const expected = activityChartGranularity(state.windowKey);
    if ((activity.granularity || 'hour') !== expected) return -1;
    const sentInChart = hourlyBucketSentSum(activity.buckets);
    const coverage = sentTotal > 0 ? sentInChart / sentTotal : (sentInChart > 0 ? 1 : 0);
    const partialPenalty = activity.partial ? 0.4 : 1;
    const sourceBonus = ['api', 'engage', 'sql', 'campaign-dashboard'].includes(String(activity.source || '')) ? 0.05 : 0;
    return (coverage * partialPenalty) + sourceBonus;
  }

  function pickBestHourlyActivity(candidates, sentTotal) {
    const valid = candidates.filter(Boolean);
    if (!valid.length) return null;
    return valid.sort((a, b) => scoreHourlyActivity(b, sentTotal) - scoreHourlyActivity(a, sentTotal))[0];
  }

  function resolveHourlyActivity(hourlyPayload) {
    const dash = state.dashboard || {};
    const sentTotal = sentTotalForHourly(dash);
    const granularity = activityChartGranularity(state.windowKey);
    const remote = matchesDashboardWindow(hourlyPayload) ? hourlyPayload : null;
    const dashHourly = matchesDashboardWindow(dash?.hourlyActivity) ? dash.hourlyActivity : null;
    const candidates = granularity === 'day'
      ? [
        buildDailyActivityFromAggregatedBuckets(remote, 'api', sentTotal),
        buildDailyActivityFromAggregatedBuckets(dashHourly, 'campaign-dashboard', sentTotal),
        buildHourlyActivityFromMessages(dash, state.replyDispositions, remote),
      ]
      : [
        buildHourlyActivityFromAggregatedBuckets(remote, 'api', sentTotal),
        buildHourlyActivityFromAggregatedBuckets(dashHourly, 'campaign-dashboard', sentTotal),
        buildHourlyActivityFromMessages(dash, state.replyDispositions, remote),
      ];
    const best = pickBestHourlyActivity(candidates, sentTotal);
    const finalized = finalizeHourlyActivity(best, sentTotal);
    if (!finalized) return finalized;
    const bounds = resolveDashboardWindowBounds(dash);
    const windowLabel = finalized.windowLabel
      || bounds?.label
      || WINDOW_OPTIONS.find((opt) => opt.key === state.windowKey)?.label
      || '';
    return {
      ...finalized,
      granularity,
      windowKey: state.windowKey,
      windowLabel,
    };
  }

  function findPeakHour(buckets, field) {
    let peakHour = null;
    let peakValue = 0;
    buckets.forEach((row) => {
      const value = Number(row[field]) || 0;
      if (value > peakValue) {
        peakValue = value;
        peakHour = row.hour;
      }
    });
    return peakValue > 0 ? { hour: peakHour, value: peakValue } : null;
  }

  function formatHourLabel(hour) {
    return `${String(hour).padStart(2, '0')}h`;
  }

  function computeHourlyYAxis(maxValue) {
    const raw = Math.max(0, Number(maxValue) || 0);
    if (raw === 0) return { axisMax: 1, ticks: [0, 1] };

    let axisMax;
    if (raw <= 4) axisMax = Math.max(raw, 4);
    else if (raw <= 10) axisMax = Math.ceil(raw * 1.15);
    else if (raw <= 50) axisMax = Math.ceil(raw / 5) * 5;
    else if (raw <= 200) axisMax = Math.ceil(raw / 10) * 10;
    else axisMax = Math.ceil(raw / 50) * 50;
    axisMax = Math.max(axisMax, raw);

    const step = raw <= 10
      ? Math.max(1, Math.round(axisMax / 4) || 1)
      : Math.max(1, Math.ceil(axisMax / 5));

    const ticks = [0];
    for (let value = step; value < axisMax; value += step) ticks.push(value);
    if (ticks[ticks.length - 1] !== axisMax) ticks.push(axisMax);
    return { axisMax, ticks };
  }

  function renderHourlyYAxisLabels(ticks) {
    return [...ticks].reverse().map((tick) => `
      <span class="engage-campaign-hourly-y-tick">${escapeHtml(formatNumber(tick))}</span>`).join('');
  }

  function renderHourlyGridLines(axisMax, ticks) {
    return ticks.map((tick) => {
      const pct = axisMax > 0 ? (tick / axisMax) * 100 : 0;
      return `<span class="engage-campaign-hourly-grid-line" style="bottom:${pct.toFixed(2)}%"></span>`;
    }).join('');
  }

  function renderHourlyActivityChart(activity) {
    const isDaily = activity?.granularity === 'day';
    const chartTitle = isDaily ? 'Atividade por dia' : 'Atividade por horário';
    const emptySub = isDaily
      ? 'Envios, leituras e respostas ao longo do período seleccionado.'
      : 'Envios, leituras e respostas ao longo do dia (horário local).';

    if (!activity || !activityBucketsHaveData(activity.buckets)) {
      return `
        <section class="engage-campaign-section engage-campaign-hourly-section">
          <header class="engage-campaign-section-head">
            <div>
              <h3>${chartTitle}</h3>
              <p class="engage-campaign-section-sub">${emptySub}</p>
            </div>
          </header>
          <article class="engage-campaign-chart-card engage-campaign-hourly-card">
            <p class="engage-campaign-muted">Sem dados para o período seleccionado.</p>
          </article>
        </section>`;
    }

    const buckets = activity.buckets;
    const dataMax = Math.max(
      ...buckets.flatMap((row) => [row.sent, row.read, row.replied]),
      0,
    );
    const { axisMax, ticks } = computeHourlyYAxis(dataMax);
    const sentPeak = isDaily ? findPeakBucket(buckets, 'sent') : null;
    const readPeak = isDaily
      ? findPeakBucket(buckets, 'read')
      : (activity.peaks?.readHour != null
        ? { hour: activity.peaks.readHour, value: buckets[activity.peaks.readHour]?.read || 0 }
        : findPeakHour(buckets, 'read'));
    const replyPeak = isDaily
      ? findPeakBucket(buckets, 'replied')
      : (activity.peaks?.replyHour != null
        ? { hour: activity.peaks.replyHour, value: buckets[activity.peaks.replyHour]?.replied || 0 }
        : findPeakHour(buckets, 'replied'));

    const labelStep = isDaily ? Math.max(1, Math.ceil(buckets.length / 8)) : 3;
    const columns = buckets.map((row, index) => {
      const sentHeight = row.sent > 0 ? Math.max(4, (row.sent / axisMax) * 100) : 0;
      const readHeight = row.read > 0 ? Math.max(4, (row.read / axisMax) * 100) : 0;
      const repliedHeight = row.replied > 0 ? Math.max(4, (row.replied / axisMax) * 100) : 0;
      const xLabel = isDaily
        ? ((index % labelStep === 0 || index === buckets.length - 1) ? row.label : '')
        : (row.hour % labelStep === 0 ? formatHourLabel(row.hour) : '');
      const title = isDaily
        ? `${row.label} · enviados ${row.sent} · lidas ${row.read} · respostas ${row.replied}`
        : `${formatHourLabel(row.hour)} · enviados ${row.sent} · lidas ${row.read} · respostas ${row.replied}`;
      return `
        <div class="engage-campaign-hourly-col" title="${escapeAttr(title)}">
          <div class="engage-campaign-hourly-bars" aria-hidden="true">
            <span class="engage-campaign-hourly-bar" data-series="sent" style="height:${sentHeight.toFixed(1)}%"></span>
            <span class="engage-campaign-hourly-bar" data-series="read" style="height:${readHeight.toFixed(1)}%"></span>
            <span class="engage-campaign-hourly-bar" data-series="replied" style="height:${repliedHeight.toFixed(1)}%"></span>
          </div>
          <span class="engage-campaign-hourly-label">${escapeHtml(xLabel)}</span>
        </div>`;
    }).join('');

    const insights = [
      sentPeak ? `Pico de envios: ${sentPeak.label} (${formatNumber(sentPeak.value)})` : null,
      readPeak ? (isDaily
        ? `Pico de leituras: ${readPeak.label} (${formatNumber(readPeak.value)})`
        : `Pico de leituras: ${formatHourLabel(readPeak.hour)} (${formatNumber(readPeak.value)})`) : null,
      replyPeak ? (isDaily
        ? `Pico de respostas: ${replyPeak.label} (${formatNumber(replyPeak.value)})`
        : `Pico de respostas: ${formatHourLabel(replyPeak.hour)} (${formatNumber(replyPeak.value)})`) : null,
    ].filter(Boolean);

    const partialNote = activity.partial
      ? `<p class="engage-campaign-help">Dados com timestamp: ${escapeHtml(formatNumber(activity.partialSentWithTimestamp || 0))} de ${escapeHtml(formatNumber(activity.partialSentTotal || 0))} envios no período${isDaily ? ' — dias sem barra não têm registo horário na API' : ''}.</p>`
      : (activity.sentReconciled && activity.sentKnownSample > 0
        ? `<p class="engage-campaign-help">Total de enviados (${escapeHtml(formatNumber(activity.partialSentTotal || hourlyBucketSentSum(buckets)))}) alinhado ao período. Distribuição por ${isDaily ? 'dia' : 'hora'} baseada em ${escapeHtml(formatNumber(activity.sentKnownSample))} registos com horário e atividade (leituras/respostas).</p>`
        : '');

    const periodSub = isDaily
      ? `Um ponto por dia no período${activity.windowLabel ? ` (${escapeHtml(activity.windowLabel)})` : ''} — fuso ${escapeHtml(activity.timezone || 'local')}.`
      : `Distribuição por hora no período${activity.windowLabel ? ` (${escapeHtml(activity.windowLabel)})` : ''} — fuso ${escapeHtml(activity.timezone || 'local')}.`;

    return `
      <section class="engage-campaign-section engage-campaign-hourly-section">
        <header class="engage-campaign-section-head">
          <div>
            <h3>${chartTitle}</h3>
            <p class="engage-campaign-section-sub">${periodSub}</p>
          </div>
        </header>
        <article class="engage-campaign-chart-card engage-campaign-hourly-card">
          <div class="engage-campaign-hourly-legend" aria-hidden="true">
            <span><i data-series="sent"></i> Enviados</span>
            <span><i data-series="read"></i> Lidas</span>
            <span><i data-series="replied"></i> Respostas</span>
          </div>
          <div class="engage-campaign-hourly-chart-wrap">
            <div class="engage-campaign-hourly-y-axis" aria-hidden="true">${renderHourlyYAxisLabels(ticks)}</div>
            <div class="engage-campaign-hourly-plot">
              <div class="engage-campaign-hourly-grid-lines" aria-hidden="true">${renderHourlyGridLines(axisMax, ticks)}</div>
              <div class="engage-campaign-hourly-chart${isDaily ? ' is-daily' : ''}" style="${isDaily ? `--daily-cols:${buckets.length}` : ''}" role="img" aria-label="${isDaily ? 'Gráfico de colunas por dia' : 'Gráfico de colunas por horário'} com escala de mensagens">
                ${columns}
              </div>
            </div>
          </div>
          ${insights.length ? `<p class="engage-campaign-hourly-insights">${insights.map((line) => escapeHtml(line)).join(' · ')}</p>` : ''}
          ${partialNote}
        </article>
      </section>`;
  }

  function renderCompletionGauge(summary) {
    const pctRaw = Number(summary?.completionPct);
    const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 0;
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - pct / 100);
    const finish = summary?.estimatedFinish ? formatDateTime(summary.estimatedFinish) : '—';
    return `
      <article class="engage-campaign-chart-card engage-campaign-gauge-card">
        <h4>Progresso da campanha</h4>
        <div class="engage-campaign-gauge-wrap">
          <svg class="engage-campaign-gauge" viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="engageCampaignGaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#1e5aa8" />
                <stop offset="100%" stop-color="#fbbf24" />
              </linearGradient>
            </defs>
            <circle class="engage-campaign-gauge-track" cx="60" cy="60" r="${radius}" />
            <circle
              class="engage-campaign-gauge-fill"
              cx="60"
              cy="60"
              r="${radius}"
              stroke-dasharray="${circumference.toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"
            />
          </svg>
          <div class="engage-campaign-gauge-center">
            <strong>${formatPercent(pct)}</strong>
            <small>conclusão</small>
          </div>
        </div>
        <dl class="engage-campaign-gauge-meta">
          <div><dt>Est. finish</dt><dd>${escapeHtml(finish)}</dd></div>
          <div><dt>Taxa/h</dt><dd>${escapeHtml(formatNumber(summary?.processingRatePerHour))}</dd></div>
          <div><dt>Recipients</dt><dd>${escapeHtml(`${formatNumber(summary?.pendingRecipients)} pendentes · ${formatNumber(summary?.recipientTotal)} total`)}</dd></div>
        </dl>
        <p class="engage-campaign-help">Projected from now + cadence</p>
      </article>`;
  }

  function renderKpiSection(title, cardsHtml) {
    return `
      <section class="engage-campaign-section">
        <header class="engage-campaign-section-head"><h3>${escapeHtml(title)}</h3></header>
        <div class="engage-campaign-kpi-grid">${cardsHtml}</div>
      </section>`;
  }

  function renderVisualDashboard(summary, outbound, conversions, dash) {
    return `
      <section class="engage-campaign-visual-row">
        ${renderFunnel(outbound, conversions)}
        ${renderDonutChart('Recipients por status', dash.recipientsByStatus)}
        ${renderCompletionGauge(summary)}
      </section>`;
  }

  function kpiCard(label, value, sub) {
    return `
      <article class="engage-campaign-kpi">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
        ${sub ? `<small>${escapeHtml(sub)}</small>` : ''}
      </article>`;
  }

  function renderToolbar() {
    const campaignOptions = ['<option value="">Todas as campanhas (resumo)</option>']
      .concat(state.campaigns.map((item) => {
        const id = item?.id || '';
        const name = item?.name || 'Campanha';
        const status = item?.status ? ` · ${item.status}` : '';
        return `<option value="${escapeHtml(id)}"${id === state.selectedCampaignId ? ' selected' : ''}>${escapeHtml(name)}${escapeHtml(status)}</option>`;
      }));
    const windowOptions = WINDOW_OPTIONS.map((opt) => (
      `<option value="${opt.key}"${opt.key === state.windowKey ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`
    )).join('');

    return `
      <div class="engage-campaign-toolbar">
        ${state.selectedCampaignId ? '<button type="button" class="engage-config-btn" id="adminEngageCampaignsBack">← Todas as campanhas</button>' : ''}
        <label class="engage-campaign-field">
          <span>Campanha</span>
          <select id="adminEngageCampaignsSelect">${campaignOptions.join('')}</select>
        </label>
        <label class="engage-campaign-field">
          <span>Período de envios</span>
          <select id="adminEngageCampaignsWindow">${windowOptions}</select>
        </label>
        <p class="engage-campaign-window-hint" id="adminEngageCampaignsWindowHint"></p>
      </div>`;
  }

  function renderConversionSection(data, title, options = {}) {
    const metrics = normalizeConversionMetrics(data);
    const outbound = options.outbound || null;
    const replyRate = resolveReplyRatePct(metrics, outbound);
    const rateHint = Number.isFinite(metrics.sentCount) && metrics.sentCount > 0
      ? `Únicos / ${formatNumber(metrics.sentCount)} enviados`
      : (outbound?.messagesSentLive ? `Únicos / ${formatNumber(outbound.messagesSentLive)} enviados` : '');
    const cards = outbound
      ? [
        kpiCard('Lidas', formatNumber(outbound.messagesReadLive), 'Entregues com confirmação de leitura'),
        kpiCard('Respostas', formatNumber(metrics.replies), 'Total de respostas no período'),
        kpiCard('Respondentes únicos', formatNumber(metrics.uniqueRepliers), 'Base da taxa de resposta'),
        kpiCard('Taxa de resposta', formatPercent(replyRate), rateHint || 'Únicos / enviados'),
        kpiCard('Conversas atribuídas', formatNumber(metrics.attributedConversations)),
      ]
      : [
        kpiCard('Respostas', formatNumber(metrics.replies)),
        kpiCard('Taxa de resposta', formatPercent(replyRate), rateHint || 'Respondentes únicos / enviados'),
        kpiCard('Respondentes únicos', formatNumber(metrics.uniqueRepliers)),
        kpiCard('Conversas atribuídas', formatNumber(metrics.attributedConversations)),
      ];
    return `
      <section class="engage-campaign-section">
        <header class="engage-campaign-section-head"><h3>${escapeHtml(title)}</h3></header>
        <div class="engage-campaign-kpi-grid">${cards.join('')}</div>
      </section>`;
  }

  function renderCampaignConversionsPanel(data, outbound) {
    if (!data) {
      return `
        <section class="engage-campaign-section">
          <header class="engage-campaign-section-head"><h3>Campaign Conversions</h3></header>
          <p class="engage-campaign-muted">Sem respostas registadas para esta campanha.</p>
        </section>`;
    }
    const metrics = normalizeConversionMetrics(data);
    const replyRate = resolveReplyRatePct(metrics, outbound);
    const rateHint = Number.isFinite(metrics.sentCount) && metrics.sentCount > 0
      ? `Base: ${formatNumber(metrics.uniqueRepliers)} / ${formatNumber(metrics.sentCount)} enviados`
      : '';
    return `
      <section class="engage-campaign-section engage-campaign-conversions">
        <header class="engage-campaign-section-head"><h3>Campaign Conversions</h3></header>
        <div class="engage-campaign-kpi-grid">
          ${kpiCard('Replies', formatNumber(metrics.replies))}
          ${kpiCard('Reply rate', formatPercent(replyRate), rateHint)}
          ${kpiCard('Unique repliers', formatNumber(metrics.uniqueRepliers))}
          ${kpiCard('Attributed conversations', formatNumber(metrics.attributedConversations))}
        </div>
      </section>`;
  }

  function renderReplyDispositionsPanel() {
    const report = state.replyDispositions;
    const windowOptions = REPLY_WINDOW_OPTIONS.map((opt) => (
      `<option value="${escapeAttr(opt.key)}"${opt.key === state.replyDispositionsWindow ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`
    )).join('');
    const windowLabel = report?.window?.labelPt || REPLY_WINDOW_OPTIONS.find((o) => o.key === state.replyDispositionsWindow)?.label || '';

    if (state.replyDispositionsError) {
      return `
        <section class="engage-campaign-section engage-campaign-replies">
          <header class="engage-campaign-section-head">
            <h3>Respostas da campanha</h3>
            <div class="engage-campaign-replies-toolbar">
              <label class="engage-campaign-field">
                <span>Período (respostas)</span>
                <select id="adminEngageCampaignsReplyWindow">${windowOptions}</select>
              </label>
            </div>
          </header>
          <p class="engage-config-error">${escapeHtml(state.replyDispositionsError)}</p>
        </section>`;
    }

    if (!report) {
      return `
        <section class="engage-campaign-section engage-campaign-replies">
          <header class="engage-campaign-section-head"><h3>Respostas da campanha</h3></header>
          <p class="engage-campaign-muted">Carregando classificação das respostas…</p>
        </section>`;
    }

    const items = Array.isArray(report.items) ? report.items : [];
    const byCategory = Array.isArray(report.byCategory) ? report.byCategory : [];
    const chips = byCategory.length
      ? byCategory.map((row) => `<span class="engage-campaign-reply-chip">${escapeHtml(lossCategoryLabel(row.category))}: ${formatNumber(row.count)}</span>`).join('')
      : '<span class="engage-campaign-muted">Sem categorias classificadas.</span>';

    const tableRows = items.length
      ? items.map((item) => `
        <tr>
          <td>${escapeHtml(item.name || '—')}</td>
          <td><code class="engage-config-mono">${escapeHtml(formatPhoneE164(item))}</code></td>
          <td>${escapeHtml(lossCategoryLabel(item.lossCategory))}</td>
          <td>${formatDateShort(item.nextContactAt)}</td>
          <td>${formatDateTime(item.lastReplyAt || item.repliedAt)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="5" class="engage-campaign-muted">Nenhuma resposta neste período.</td></tr>';

    return `
      <section class="engage-campaign-section engage-campaign-replies">
        <header class="engage-campaign-section-head engage-campaign-replies-head">
          <div>
            <h3>Respostas da campanha</h3>
            <p class="engage-campaign-help">Classificação no Contact Hub (Inbox / auto-detect). Janela: ${escapeHtml(windowLabel)}</p>
          </div>
          <div class="engage-campaign-replies-toolbar">
            <label class="engage-campaign-field">
              <span>Período (respostas)</span>
              <select id="adminEngageCampaignsReplyWindow">${windowOptions}</select>
            </label>
            <button type="button" class="engage-config-btn" id="adminEngageCampaignsReplyExport" ${items.length ? '' : 'disabled'}>Exportar CSV</button>
          </div>
        </header>
        <div class="engage-campaign-kpi-grid engage-campaign-replies-kpis">
          ${kpiCard('Repliers', formatNumber(report.totalRepliers))}
          ${kpiCard('Classificados', formatNumber(report.classifiedCount))}
          ${kpiCard('Sem classificação', formatNumber(report.unclassifiedCount))}
        </div>
        <div class="engage-campaign-reply-chips">${chips}</div>
        <div class="engage-config-table-card">
          <div class="engage-config-table-scroll">
            <table class="engage-config-table engage-campaign-replies-table">
              <thead>
                <tr>
                  <th>Nome</th><th>Telefone</th><th>Categoria</th><th>Retorno</th><th>Respondeu</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  function healthRiskTone(riskLevel) {
    const value = String(riskLevel || '').trim().toUpperCase();
    if (value === 'HIGH' || value === 'CRITICAL') return 'danger';
    if (value === 'MEDIUM' || value === 'MODERATE') return 'warn';
    return 'ok';
  }

  function renderHealthPanel(health) {
    if (!health || health.note) {
      return `
        <section class="engage-campaign-section">
          <header class="engage-campaign-section-head"><h3>Campaign Health</h3></header>
          <p class="engage-campaign-muted">${escapeHtml(health?.note || 'Saúde indisponível para esta campanha.')}</p>
        </section>`;
    }
    const warnings = Array.isArray(health.warnings) ? health.warnings : [];
    const reasons = Array.isArray(health.reasons) ? health.reasons : [];
    const riskTone = healthRiskTone(health.riskLevel);
    const riskScore = Number(health.riskScore);
    const riskBarPct = Number.isFinite(riskScore) ? Math.min(100, Math.max(4, riskScore)) : 0;
    const utilPctRaw = Number(health.capacityUtilization?.utilizationPct);
    const utilPct = Number.isFinite(utilPctRaw) ? Math.min(100, Math.max(0, utilPctRaw)) : 0;
    const utilTone = utilPct >= 85 ? 'danger' : utilPct >= 60 ? 'warn' : 'ok';
    const senderLabel = health.senderHealth?.verifiedName || health.senderHealth?.displayNumber || '—';
    const senderQuality = health.senderHealth?.qualityRating || '—';
    const tierLabel = health.senderHealth?.messagingTierLabel || health.senderHealth?.messagingTier || '—';
    const utilStatus = health.capacityUtilization?.status || 'within limits';

    return `
      <section class="engage-campaign-section engage-campaign-health">
        <header class="engage-campaign-section-head">
          <h3>Campaign Health</h3>
          ${health.allowed === false ? '<span class="engage-campaign-chip" data-tone="danger">BLOCKED</span>' : ''}
        </header>
        <div class="engage-campaign-health-grid">
          <article class="engage-campaign-health-card" data-tone="${riskTone}">
            <span class="engage-campaign-health-label">Risco</span>
            <strong>${escapeHtml(health.riskLevel || '—')}</strong>
            <div class="engage-campaign-meter" data-tone="${riskTone}" aria-hidden="true">
              <div class="engage-campaign-meter-fill" style="width:${riskBarPct}%"></div>
            </div>
            <small>Score ${formatNumber(health.riskScore)}</small>
          </article>
          <article class="engage-campaign-health-card">
            <span class="engage-campaign-health-label">Sender</span>
            <strong>${escapeHtml(senderLabel)}</strong>
            <span class="engage-campaign-chip" data-tone="${String(senderQuality).toUpperCase() === 'HIGH' ? 'ok' : 'neutral'}">${escapeHtml(senderQuality)}</span>
            <small>Qualidade Meta</small>
          </article>
          <article class="engage-campaign-health-card engage-campaign-health-card--capacity" data-tone="${utilTone}">
            <div class="engage-campaign-health-capacity-head">
              <div>
                <span class="engage-campaign-health-label">Tier Meta</span>
                <strong>${escapeHtml(tierLabel)}</strong>
              </div>
              <div class="engage-campaign-health-util">
                <span class="engage-campaign-health-label">Utilização</span>
                <strong>${formatPercent(utilPct)}</strong>
              </div>
            </div>
            <div class="engage-campaign-meter engage-campaign-meter--capacity" data-tone="${utilTone}" aria-hidden="true">
              <div class="engage-campaign-meter-fill" style="width:${Math.max(utilPct, utilPct > 0 ? 4 : 0)}%"></div>
            </div>
            <small>${escapeHtml(utilStatus)}</small>
          </article>
        </div>
        ${warnings.length ? `<ul class="engage-campaign-list">${warnings.map((w) => `<li>${escapeHtml(w.message || w.code || '')}</li>`).join('')}</ul>` : ''}
        ${reasons.length ? `<ul class="engage-campaign-list is-info">${reasons.map((r) => `<li>${escapeHtml(r.message || r.code || '')}</li>`).join('')}</ul>` : ''}
        <p class="engage-campaign-help">Variable coverage em campanhas com mais de 500 contactos usa amostra (até 500) com extrapolação — ver handoff performance §5.</p>
      </section>`;
  }

  function renderTenantOverview() {
    const dash = state.dashboard || {};
    const totals = dash.totals || {};
    const outbound = totals.outbound || {};
    const campaigns = Array.isArray(dash.campaigns) ? dash.campaigns : [];

    const tableRows = campaigns.length
      ? campaigns.map((row) => `
        <tr>
          <td><button type="button" class="engage-campaign-link" data-open-campaign="${escapeHtml(row.id)}">${escapeHtml(row.name || '—')}</button></td>
          <td>${statusChip(row.status)}</td>
          <td>${formatNumber(row.recipientTotal)}</td>
          <td>${formatNumber(row.pendingRecipients)}</td>
          <td>${formatNumber(row.outbound?.messagesSent)}</td>
          <td>${formatNumber(row.outbound?.messagesSentLive)}</td>
          <td><button type="button" class="engage-config-btn engage-config-btn--primary" data-open-campaign="${escapeHtml(row.id)}">Abrir</button></td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="engage-campaign-muted">Nenhuma campanha encontrada.</td></tr>';

    return `
      ${renderToolbar()}
      <div class="engage-campaign-kpi-grid">
        ${kpiCard('Mensagens enviadas', formatNumber(outbound.messagesSent))}
        ${kpiCard('Meta (live)', formatNumber(outbound.messagesSentLive))}
        ${kpiCard('Simulação', formatNumber(outbound.messagesSentSimulated))}
        ${kpiCard('Entregues (Meta)', formatNumber(outbound.messagesDeliveredLive))}
        ${kpiCard('Falhas no período', formatNumber(outbound.messagesFailed))}
        ${kpiCard('Campanhas', formatNumber(totals.campaigns))}
        ${kpiCard('Recipients', formatNumber(totals.recipients))}
        ${kpiCard('Pendentes', formatNumber(totals.pendingRecipients))}
      </div>
      ${state.conversionAnalytics ? renderConversionSection(state.conversionAnalytics, 'Conversões do tenant') : ''}
      <section class="engage-campaign-section">
        <header class="engage-campaign-section-head"><h3>Campanhas</h3></header>
        <div class="engage-config-table-card">
          <div class="engage-config-table-scroll">
            <table class="engage-config-table">
              <thead>
                <tr>
                  <th>Campanha</th><th>Status</th><th>Recipients</th><th>Pendentes</th>
                  <th>Enviadas</th><th>Meta (live)</th><th></th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  function renderAttemptMessageDetail() {
    if (!state.selectedAttemptId) return '';
    if (state.attemptDetailLoading) {
      return `
        <div class="engage-campaign-message-detail" id="engageCampaignAttemptDetail">
          <p class="engage-campaign-muted">Carregando mensagem…</p>
        </div>`;
    }
    if (state.attemptDetailError) {
      return `
        <div class="engage-campaign-message-detail" id="engageCampaignAttemptDetail">
          <p class="engage-config-error">${escapeHtml(state.attemptDetailError)}</p>
        </div>`;
    }
    const payload = state.attemptDetail || {};
    const attempt = payload.attempt || {};
    const recipient = payload.recipient || {};
    const campaign = payload.campaign || {};
    const sender = payload.sender || {};
    const message = payload.message || {};
    const renderedText = String(message.renderedText || message.body || message.text || '').trim();
    const templateName = String(message.templateName || message.template || '—').trim();
    const disclaimer = String(message.previewDisclaimer || '').trim();
    const phoneDisplay = String(recipient.phoneE164 || recipient.phone || recipient.phoneMasked || '').trim() || '—';
    const recipientStatus = recipient.recipientStatus || recipient.status || '';
    const recipientLabel = [
      phoneDisplay,
      recipientStatus ? String(recipientStatus).toUpperCase() : '',
    ].filter(Boolean).join(' · ') || '—';

    return `
      <div class="engage-campaign-message-detail" id="engageCampaignAttemptDetail">
        <header class="engage-campaign-message-head">
          <div>
            <h4>Mensagem enviada (Meta)</h4>
            ${statusChip(attempt.status)}
          </div>
          <button type="button" class="engage-config-btn" id="engageCampaignAttemptHide">Hide</button>
        </header>
        <dl class="engage-campaign-message-meta">
          <div><dt>Campanha</dt><dd>${escapeHtml(campaign.name || '—')}</dd></div>
          <div><dt>Recipient</dt><dd>${escapeHtml(recipientLabel)}</dd></div>
          <div><dt>Sender</dt><dd>${escapeHtml(sender.label || sender.displayNumber || sender.verifiedName || '—')}</dd></div>
          <div><dt>Template</dt><dd>${escapeHtml(templateName)}</dd></div>
          <div><dt>Accepted</dt><dd>${formatDateTimeSeconds(attempt.acceptedAt)}</dd></div>
          <div><dt>Delivered</dt><dd>${formatDateTimeSeconds(attempt.deliveredAt)}</dd></div>
          <div><dt>Read</dt><dd>${formatDateTimeSeconds(attempt.readAt)}</dd></div>
          <div class="span-2"><dt>Meta wamid</dt><dd><code class="engage-config-mono">${escapeHtml(attempt.metaMessageId || '—')}</code></dd></div>
        </dl>
        <p class="engage-campaign-lifecycle">${escapeHtml(buildLifecycleLabel(attempt))}</p>
        <div class="engage-campaign-message-tabs" role="tablist" aria-label="Tipo de conteúdo">
          <span class="engage-campaign-message-tab is-active">Texto</span>
          <span class="engage-campaign-message-tab is-disabled">Imagem (em breve)</span>
          <span class="engage-campaign-message-tab is-disabled">Documento (em breve)</span>
          <span class="engage-campaign-message-tab is-disabled">Vídeo (em breve)</span>
        </div>
        <div class="engage-campaign-message-bubble">
          <strong>${escapeHtml(sender.label || sender.verifiedName || campaign.name || 'WhatsApp')}</strong>
          <p>${escapeHtml(renderedText || 'Conteúdo indisponível para este attempt.')}</p>
          <small>${formatDateTime(attempt.deliveredAt || attempt.acceptedAt || attempt.updatedAt)}</small>
        </div>
        ${disclaimer ? `<p class="engage-campaign-help">${escapeHtml(disclaimer)}</p>` : ''}
        <p class="engage-campaign-help">Message sent via Meta Cloud. Delivery/read receipts update from Meta webhooks.</p>
      </div>`;
  }

  function renderCampaignDetail() {
    const dash = state.dashboard || {};
    const campaign = dash.campaign || {};
    const summary = dash.summary || {};
    const outbound = normalizeOutboundSummary(summary.outbound || {});
    const audience = dash.audienceSource || {};
    const attempts = Array.isArray(dash.recentAttempts) ? dash.recentAttempts : [];

    const attemptRows = attempts.length
      ? attempts.map((attempt) => {
        const id = String(attempt.id || '').trim();
        const isSelected = state.selectedAttemptId === id;
        return `
        <tr class="${isSelected ? 'is-active' : ''}">
          <td><code class="engage-config-mono">${escapeHtml(truncateId(id))}</code> #${formatNumber(attempt.attemptNo)}</td>
          <td>${statusChip(attempt.status)}</td>
          <td>${formatDateTimeSeconds(attempt.deliveredAt)}</td>
          <td>${formatDateTimeSeconds(attempt.readAt)}</td>
          <td><code class="engage-config-mono">${escapeHtml(attempt.metaMessageId || '—')}</code></td>
          <td>${formatDateTimeSeconds(attempt.updatedAt)}</td>
          <td class="engage-campaign-attempt-actions">
            ${isSelected ? '<button type="button" class="engage-config-btn" data-attempt-hide>Hide</button>' : ''}
            <button type="button" class="engage-config-btn engage-config-btn--primary" data-attempt-message="${escapeAttr(id)}">Message</button>
          </td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="7" class="engage-campaign-muted">Nenhum attempt recente.</td></tr>';

    return `
      ${renderToolbar()}
      <header class="engage-campaign-detail-head">
        <div>
          <h3>${escapeHtml(campaign.name || 'Campanha')}</h3>
          <p class="engage-campaign-muted">Atualizado ${formatDateTime(campaign.updatedAt)} · ${statusChip(campaign.status)}</p>
        </div>
      </header>
      <section class="engage-campaign-section">
        <header class="engage-campaign-section-head"><h3>Recipient source</h3></header>
        <p>${escapeHtml(audience.audience?.name || audience.source || '—')} · ${formatNumber(audience.members || audience.audience?.memberCount)} contatos</p>
      </section>
      ${renderOutboundReconciliationPanel(outbound)}
      ${renderKpiSection('Envio', [
        kpiCard('Enviadas', formatNumber(outbound.messagesSent), 'Ledger no período'),
        kpiCard('Meta (live)', formatNumber(outbound.messagesSentLive), 'Cloud API real'),
        kpiCard('Chegaram', formatNumber(outbound.messagesReachedRecipientLive), 'Entregues ou lidas'),
        kpiCard('Em trânsito', formatNumber(outbound.messagesInTransitLive), 'Aceites, sem webhook ainda'),
        kpiCard('Entregues', formatNumber(outbound.messagesDeliveredLive), 'Status DELIVERED'),
        kpiCard('Falhas', formatNumber(outbound.messagesFailed), 'Falha definitiva'),
      ].join(''))}
      ${renderVisualDashboard(summary, outbound, state.campaignConversions, dash)}
      ${renderHourlyActivityChart(state.hourlyActivity)}
      ${state.campaignConversions
        ? renderConversionSection(state.campaignConversions, 'Engajamento', { outbound })
        : renderKpiSection('Engajamento', [
          kpiCard('Lidas', formatNumber(outbound.messagesReadLive)),
          kpiCard('Respostas', '—'),
          kpiCard('Taxa de resposta', '—'),
          kpiCard('Conversas atribuídas', '—'),
        ].join(''))}
      ${renderReplyDispositionsPanel()}
      ${renderHealthPanel(state.campaignHealth)}
      <p class="engage-campaign-help">Engagement usa o último attempt por destinatário (ex.: READ mesmo quando o recipient permanece DELIVERED).</p>
      <div class="engage-campaign-breakdown-grid">
        ${renderDonutChart('Engagement', dash.recipientsByEngagement)}
        ${renderBreakdown('Attempts no período', dash.attemptsByStatusInWindow)}
        ${renderBreakdown('Attempts (total)', dash.attemptsByStatus)}
      </div>
      <section class="engage-campaign-section">
        <header class="engage-campaign-section-head"><h3>Recent attempts (last 15)</h3></header>
        <div class="engage-config-table-card">
          <div class="engage-config-table-scroll">
            <table class="engage-config-table engage-campaign-attempts-table">
              <thead>
                <tr>
                  <th>Attempt</th><th>Status</th><th>Delivered</th><th>Read</th>
                  <th>Meta ID</th><th>Updated</th><th></th>
                </tr>
              </thead>
              <tbody>${attemptRows}</tbody>
            </table>
          </div>
        </div>
        ${renderAttemptMessageDetail()}
      </section>`;
  }

  function renderFooter() {
    const fetchedAt = state.dashboard?.fetchedAt;
    const healthNote = state.selectedCampaignId ? ' · saúde 60s' : '';
    return `<footer class="engage-campaign-footer">Atualizado ${formatDateTime(fetchedAt)} · métricas 15s${healthNote}</footer>`;
  }

  async function loadAttemptDetail(attemptId, options = {}) {
    const id = String(attemptId || '').trim();
    if (!id) {
      resetAttemptDetail();
      return;
    }
    if (!options.silent) {
      state.attemptDetailLoading = true;
      state.attemptDetailError = '';
      render();
    }
    try {
      state.attemptDetail = await apiGet(buildAttemptPaths(id));
      state.attemptDetailError = '';
    } catch (err) {
      state.attemptDetail = null;
      state.attemptDetailError = err?.message || 'Falha ao carregar mensagem do attempt.';
    } finally {
      state.attemptDetailLoading = false;
      if (!options.silent) render();
    }
  }

  function resetAttemptDetail() {
    state.selectedAttemptId = '';
    state.attemptDetail = null;
    state.attemptDetailError = '';
    state.attemptDetailLoading = false;
  }

  function clearAttemptDetail() {
    resetAttemptDetail();
    render();
  }

  function bindContentEvents() {
    state.dom.root?.querySelector('#adminEngageCampaignsSelect')?.addEventListener('change', (event) => {
      state.selectedCampaignId = event.target.value || '';
      resetAttemptDetail();
      void refreshFull(true);
    });
    state.dom.root?.querySelector('#adminEngageCampaignsWindow')?.addEventListener('change', (event) => {
      state.windowKey = event.target.value || '7d';
      state.hourlyActivityRemote = null;
      state.hourlyActivityWindowKey = '';
      state.hourlyActivity = null;
      void refreshFull(true);
    });
    state.dom.root?.querySelector('#adminEngageCampaignsBack')?.addEventListener('click', () => {
      state.selectedCampaignId = '';
      resetAttemptDetail();
      void refreshFull(true);
    });
    state.dom.root?.querySelectorAll('[data-open-campaign]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedCampaignId = button.dataset.openCampaign || '';
        resetAttemptDetail();
        void refreshFull(true);
      });
    });
    state.dom.root?.querySelectorAll('[data-attempt-message]').forEach((button) => {
      button.addEventListener('click', () => {
        const attemptId = button.getAttribute('data-attempt-message') || '';
        if (!attemptId) return;
        state.selectedAttemptId = attemptId;
        void loadAttemptDetail(attemptId);
      });
    });
    state.dom.root?.querySelectorAll('[data-attempt-hide]').forEach((button) => {
      button.addEventListener('click', clearAttemptDetail);
    });
    state.dom.root?.querySelector('#engageCampaignAttemptHide')?.addEventListener('click', clearAttemptDetail);
    state.dom.root?.querySelector('#adminEngageCampaignsReplyWindow')?.addEventListener('change', (event) => {
      state.replyDispositionsWindow = event.target.value || 'all';
      void loadReplyDispositions().then(() => render());
    });
    state.dom.root?.querySelector('#adminEngageCampaignsReplyExport')?.addEventListener('click', downloadReplyDispositionsCsv);
  }

  function render() {
    if (!state.dom.content) return;

    if (state.loading && !state.dashboard) {
      state.dom.content.innerHTML = '<div class="engage-config-skeleton"><div class="engage-config-skeleton-row"></div><div class="engage-config-skeleton-row"></div></div>';
      return;
    }

    if (state.error) {
      state.dom.content.innerHTML = `<p class="engage-config-error">${escapeHtml(state.error)}</p>`;
      return;
    }

    const body = state.selectedCampaignId ? renderCampaignDetail() : renderTenantOverview();
    state.dom.content.innerHTML = body + renderFooter();
    bindContentEvents();

    const hint = state.dom.root?.querySelector('#adminEngageCampaignsWindowHint');
    const windowMeta = state.dashboard?.window;
    const periodLabel = WINDOW_OPTIONS.find((o) => o.key === state.windowKey)?.label
      || windowMeta?.labelPt
      || windowMeta?.label;
    if (hint && periodLabel) {
      hint.textContent = `Envios contabilizados em ${periodLabel}${windowMeta?.from ? ` · desde ${formatDateTime(windowMeta.from)}` : ''}`;
    } else if (hint) {
      hint.textContent = '';
    }
  }

  async function loadCampaignList() {
    const paths = buildPaths('campaigns', state.session, { limit: '100' });
    const payload = await apiGet(paths);
    state.campaigns = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
  }

  async function loadDashboard() {
    const extra = { window: state.windowKey };
    if (state.selectedCampaignId) extra.campaignId = state.selectedCampaignId;
    const paths = buildPaths('campaign-dashboard', state.session, extra);
    state.dashboard = await apiGet(paths);
  }

  function buildCampaignHealthPaths() {
    const enc = encodeURIComponent(state.selectedCampaignId);
    const qs = tenantQuery(state.session);
    const encTenant = encodeURIComponent(getDefaultTenantId(state.session));
    return [
      `/api/operator/engage/campaigns/${enc}/campaign-health?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/campaigns/${enc}/campaign-health`,
    ];
  }

  function buildCampaignConversionsPaths() {
    const enc = encodeURIComponent(state.selectedCampaignId);
    const qs = tenantQuery(state.session);
    const encTenant = encodeURIComponent(getDefaultTenantId(state.session));
    return [
      `/api/operator/engage/campaigns/${enc}/conversions?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/campaigns/${enc}/conversions`,
    ];
  }

  async function loadCampaignHealth() {
    if (!state.selectedCampaignId) {
      state.campaignHealth = null;
      return;
    }
    state.campaignHealth = await apiGet(buildCampaignHealthPaths());
  }

  async function loadCampaignConversions() {
    if (!state.selectedCampaignId) {
      state.campaignConversions = null;
      return;
    }
    state.campaignConversions = await apiGet(buildCampaignConversionsPaths());
  }

  function clearCampaignDetailState() {
    state.campaignHealth = null;
    state.campaignConversions = null;
    state.replyDispositions = null;
    state.hourlyActivity = null;
    state.hourlyActivityRemote = null;
    state.hourlyActivityWindowKey = '';
    state.hourlyActivitySource = 'none';
    state.replyDispositionsError = '';
  }

  async function loadViewExtras({ includeHealth = false } = {}) {
    if (state.selectedCampaignId) {
      const tasks = [loadCampaignConversions()];
      if (includeHealth) tasks.unshift(loadCampaignHealth());
      await Promise.all(tasks);
      state.conversionAnalytics = null;
      await loadReplyDispositions();
      await loadHourlyActivity({ fetchRemote: true });
      return;
    }

    clearCampaignDetailState();
    const paths = buildPaths('conversion-analytics', state.session);
    state.conversionAnalytics = await apiGet(paths);
  }

  async function loadHourlyActivity({ fetchRemote = false } = {}) {
    if (!state.selectedCampaignId) {
      state.hourlyActivity = null;
      state.hourlyActivityRemote = null;
      state.hourlyActivitySource = 'none';
      return;
    }

    const needsRemote = fetchRemote || state.hourlyActivityWindowKey !== state.windowKey;
    if (needsRemote) {
      try {
        state.hourlyActivityRemote = await apiGet(buildHourlyActivityPaths());
        state.hourlyActivityWindowKey = state.windowKey;
      } catch (_err) {
        if (state.hourlyActivityWindowKey !== state.windowKey) {
          state.hourlyActivityRemote = null;
        }
      }
    }

    const best = resolveHourlyActivity(state.hourlyActivityRemote);
    state.hourlyActivity = best;
    state.hourlyActivitySource = best?.source || 'none';
  }

  async function loadReplyDispositions() {
    if (!state.selectedCampaignId) {
      state.replyDispositions = null;
      state.replyDispositionsError = '';
      return;
    }
    state.replyDispositionsError = '';
    try {
      state.replyDispositions = await apiGet(buildReplyDispositionPaths());
    } catch (err) {
      state.replyDispositions = null;
      if (Number(err?.statusCode || 0) === 404) {
        state.replyDispositionsError = 'Relatório de respostas indisponível (aguarde deploy api-engage).';
      } else {
        state.replyDispositionsError = err?.message || 'Falha ao carregar respostas da campanha.';
      }
    }
  }

  async function refreshMetrics({ silent = true } = {}) {
    if (!state.active || state.inFlight.metrics) return;
    if (!getDefaultTenantId(state.session)) return;

    state.inFlight.metrics = true;
    if (!silent) {
      state.loading = true;
      state.error = '';
      render();
    }

    try {
      await loadDashboard();
      if (state.selectedCampaignId) {
        await loadCampaignConversions();
        await loadHourlyActivity({ fetchRemote: state.hourlyActivityWindowKey !== state.windowKey });
      } else {
        const paths = buildPaths('conversion-analytics', state.session);
        state.conversionAnalytics = await apiGet(paths);
      }
      if (state.selectedAttemptId) {
        await loadAttemptDetail(state.selectedAttemptId, { silent: true });
      }
    } catch (err) {
      state.error = err?.message || 'Falha ao atualizar métricas da campanha.';
    } finally {
      state.inFlight.metrics = false;
      if (!silent) state.loading = false;
      render();
    }
  }

  async function refreshHealth() {
    if (!state.active || !state.selectedCampaignId || state.inFlight.health) return;
    if (!getDefaultTenantId(state.session)) return;

    state.inFlight.health = true;
    try {
      await loadCampaignHealth();
      render();
    } catch (err) {
      state.error = err?.message || 'Falha ao atualizar saúde da campanha.';
      render();
    } finally {
      state.inFlight.health = false;
    }
  }

  async function refreshReplies() {
    if (!state.active || !state.selectedCampaignId || state.inFlight.reply) return;
    if (!getDefaultTenantId(state.session)) return;

    state.inFlight.reply = true;
    try {
      await loadReplyDispositions();
      await loadHourlyActivity({ fetchRemote: false });
      render();
    } catch (_) {
      /* loadReplyDispositions já trata erro local */
      render();
    } finally {
      state.inFlight.reply = false;
    }
  }

  async function refreshFull(showLoading) {
    if (!state.active) return;
    if (!getDefaultTenantId(state.session)) {
      state.error = 'Tenant não identificado na sessão.';
      render();
      return;
    }

    if (showLoading) state.loading = true;
    state.error = '';
    render();

    try {
      await Promise.all([
        loadCampaignList(),
        loadDashboard(),
      ]);
      await loadViewExtras({ includeHealth: Boolean(state.selectedCampaignId) });
      if (state.selectedAttemptId) {
        await loadAttemptDetail(state.selectedAttemptId, { silent: true });
      }
    } catch (err) {
      state.error = err?.message || 'Falha ao carregar dashboard de campanhas.';
    } finally {
      state.loading = false;
      render();
    }
  }

  function startRefreshLoops() {
    stopRefreshLoops();
    state.metricsTimerId = window.setInterval(() => {
      void refreshMetrics();
    }, METRICS_REFRESH_MS);
    state.healthTimerId = window.setInterval(() => {
      void refreshHealth();
    }, HEALTH_REFRESH_MS);
    state.replyTimerId = window.setInterval(() => {
      void refreshReplies();
    }, REPLY_REFRESH_MS);
  }

  function stopRefreshLoops() {
    if (state.metricsTimerId) {
      window.clearInterval(state.metricsTimerId);
      state.metricsTimerId = null;
    }
    if (state.healthTimerId) {
      window.clearInterval(state.healthTimerId);
      state.healthTimerId = null;
    }
    if (state.replyTimerId) {
      window.clearInterval(state.replyTimerId);
      state.replyTimerId = null;
    }
  }

  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById('adminEngageCampaignsRoot');
    if (!root) return false;
    state.dom = { root, content: document.getElementById('adminEngageCampaignsContent') };
    state.mounted = true;
    return true;
  }

  async function activate(session) {
    if (!mount()) return;
    state.active = true;
    state.session = session || state.session;
    await refreshFull(true);
    startRefreshLoops();
  }

  function deactivate() {
    state.active = false;
    stopRefreshLoops();
  }

  function init(context) {
    state.session = context?.session || state.session;
    mount();
  }

  function selectCampaign(campaignId) {
    state.selectedCampaignId = String(campaignId || '').trim();
    if (state.active) {
      refreshFull(true);
    }
  }

  window.ReservaAiEngageCampaignsAdmin = { init, activate, deactivate, selectCampaign };
})();
