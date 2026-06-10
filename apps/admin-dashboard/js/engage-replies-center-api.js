/**
 * Engage — Central de Respostas (campaign-replies).
 * BFF: GET /api/operator/engage/campaign-replies
 */
(function () {
  const adminApi = () => window.ReservaAiApi || window.EngageSolarApi;

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

  function httpStatus(err) {
    return Number(err?.statusCode || err?.status || err?.details?.status || 0);
  }

  function isNotFoundError(err) {
    if (httpStatus(err) === 404) return true;
    const msg = String(err?.message || err?.details?.message || '').toLowerCase();
    return msg.includes('campaign-replies') && msg.includes('cannot get');
  }

  async function apiGet(paths, session) {
    const api = adminApi();
    if (!api?.request) throw new Error('API indisponível.');
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await api.request(path, {
          method: 'GET',
          cache: 'no-store',
          session,
        });
      } catch (err) {
        lastErr = err;
        if (!isNotFoundError(err)) throw err;
      }
    }
    throw lastErr || new Error('Rota Engage não encontrada.');
  }

  function buildPaths(resource, session, extraQuery) {
    const qs = tenantQuery(session, extraQuery);
    return [`/api/operator/engage/${resource}?${qs}`];
  }

  function normalizeSummary(raw) {
    const summary = raw?.summary || raw?.totals || {};
    const deltas = raw?.deltas || summary?.deltas || {};
    return {
      activeCampaigns: Number(summary.activeCampaigns ?? summary.campaigns ?? 0),
      messagesSent: Number(summary.messagesSent ?? summary.outbound?.messagesSent ?? 0),
      messagesSentDeltaPct: Number(deltas.messagesSentPct ?? summary.messagesSentDeltaPct ?? 0),
      repliesReceived: Number(summary.repliesReceived ?? summary.replies ?? 0),
      repliesDeltaPct: Number(deltas.repliesPct ?? summary.repliesDeltaPct ?? 0),
      needAction: Number(summary.needAction ?? summary.needActionCount ?? 0),
      needActionDeltaPct: Number(deltas.needActionPct ?? summary.needActionDeltaPct ?? 0),
      scheduledReturn: Number(summary.scheduledReturn ?? summary.scheduledReturnCount ?? 0),
      scheduledReturnDeltaPct: Number(deltas.scheduledReturnPct ?? summary.scheduledReturnDeltaPct ?? 0),
      unclassified: Number(summary.unclassified ?? summary.unclassifiedCount ?? 0),
    };
  }

  function normalizeItem(row) {
    if (!row || typeof row !== 'object') return null;
    return {
      id: String(row.id || row.conversationId || row.recipientId || '').trim(),
      conversationId: String(row.conversationId || row.id || '').trim(),
      contactName: String(row.contactName || row.name || row.preferredName || 'Contato').trim(),
      phone: String(row.phone || row.phoneMasked || '').trim(),
      avatarUrl: String(row.avatarUrl || '').trim(),
      messagePreview: String(row.messagePreview || row.message || row.lastMessage || '').trim(),
      campaignId: String(row.campaignId || '').trim(),
      campaignName: String(row.campaignName || row.campaign?.name || '—').trim(),
      receivedAt: row.receivedAt || row.repliedAt || row.updatedAt || null,
      classification: String(row.classification || row.aiClassification || row.lossCategory || '').trim(),
      classificationLabel: String(row.classificationLabel || row.classification || '').trim(),
      nextContactAt: row.nextContactAt || null,
      interestLabel: String(row.interestLabel || row.interestBucket || '').trim(),
      needsSeller: row.needsSeller === true,
    };
  }

  function normalizePayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const needAction = Array.isArray(raw.needActionItems)
      ? raw.needActionItems.map(normalizeItem).filter(Boolean)
      : Array.isArray(raw.needAction)
        ? raw.needAction.map(normalizeItem).filter(Boolean)
        : [];
    const scheduledReturn = Array.isArray(raw.scheduledReturnItems)
      ? raw.scheduledReturnItems.map(normalizeItem).filter(Boolean)
      : Array.isArray(raw.scheduledReturn)
        ? raw.scheduledReturn.map(normalizeItem).filter(Boolean)
        : [];
    const interestBuckets = Array.isArray(raw.interestBuckets)
      ? raw.interestBuckets.map((b) => ({
        key: String(b.key || b.id || '').trim(),
        label: String(b.label || b.name || '').trim(),
        count: Number(b.count || 0),
      }))
      : [];
    const aiClassification = Array.isArray(raw.aiClassification)
      ? raw.aiClassification.map((b) => ({
        key: String(b.key || b.id || '').trim(),
        label: String(b.label || b.name || '').trim(),
        count: Number(b.count || 0),
        pct: Number(b.pct ?? b.percent ?? 0),
      }))
      : [];
    const rows = Array.isArray(raw.conversations?.items)
      ? raw.conversations.items.map(normalizeItem).filter(Boolean)
      : Array.isArray(raw.items)
        ? raw.items.map(normalizeItem).filter(Boolean)
        : [];
    const tabCounts = raw.conversations?.tabs || raw.tabCounts || {};
    return {
      fetchedAt: raw.fetchedAt || null,
      window: raw.window || null,
      summary: normalizeSummary(raw),
      needActionItems: needAction,
      scheduledReturnItems: scheduledReturn,
      interestBuckets,
      avgResponseTimeMinutes: Number(raw.avgResponseTimeMinutes ?? raw.responseTime?.avgMinutes ?? 0),
      responseTimeSeries: Array.isArray(raw.responseTimeSeries)
        ? raw.responseTimeSeries
        : Array.isArray(raw.responseTime?.series)
          ? raw.responseTime.series
          : [],
      aiClassification,
      aiTip: raw.aiTip || null,
      conversations: {
        items: rows,
        total: Number(raw.conversations?.total ?? raw.total ?? rows.length),
        tabs: {
          all: Number(tabCounts.all ?? tabCounts.todas ?? rows.length),
          needAction: Number(tabCounts.needAction ?? tabCounts.need_action ?? 0),
          interested: Number(tabCounts.interested ?? tabCounts.interessados ?? 0),
          scheduledReturn: Number(tabCounts.scheduledReturn ?? tabCounts.scheduled_return ?? 0),
          noInterest: Number(tabCounts.noInterest ?? tabCounts.no_interest ?? 0),
          unclassified: Number(tabCounts.unclassified ?? tabCounts.unclassified ?? 0),
        },
        nextCursor: String(raw.conversations?.nextCursor || raw.nextCursor || '').trim(),
      },
    };
  }

  async function fetchCampaignReplies(session, options) {
    const extra = {
      window: options?.window || '7d',
      tab: options?.tab || '',
      q: options?.q || '',
      limit: String(options?.limit || 50),
      cursor: options?.cursor || '',
    };
    Object.keys(extra).forEach((key) => {
      if (!extra[key]) delete extra[key];
    });
    const raw = await apiGet(buildPaths('campaign-replies', session, extra), session);
    return normalizePayload(raw);
  }

  async function fetchFallback(session, windowKey) {
    const pathsDash = buildPaths('campaign-dashboard', session, { window: windowKey });
    const pathsConv = buildPaths('conversion-analytics', session, {});
    const [dashboard, conversions] = await Promise.all([
      apiGet(pathsDash, session).catch(() => null),
      apiGet(pathsConv, session).catch(() => null),
    ]);
    const campaigns = Array.isArray(dashboard?.campaigns) ? dashboard.campaigns : [];
    const activeCampaigns = campaigns.filter((c) => {
      const status = String(c?.status || '').toUpperCase();
      return status === 'RUNNING' || status === 'PAUSED' || status === 'SCHEDULED';
    }).length;
    const outbound = dashboard?.totals?.outbound || {};
    const recentReplies = Array.isArray(conversions?.recentReplies)
      ? conversions.recentReplies
      : [];
    const items = recentReplies.map((row) => normalizeItem({
      id: row.recipientId || row.contactId,
      conversationId: row.conversationId,
      contactName: row.contactName || row.phoneMasked,
      phone: row.phoneMasked,
      messagePreview: row.messagePreview || 'Resposta recebida',
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      receivedAt: row.repliedAt,
      classification: 'UNCLASSIFIED',
      classificationLabel: 'Não classificado',
    })).filter(Boolean);
    return normalizePayload({
      fetchedAt: dashboard?.fetchedAt || conversions?.fetchedAt || new Date().toISOString(),
      window: dashboard?.window || { key: windowKey, label: windowKey },
      summary: {
        activeCampaigns: activeCampaigns || Number(dashboard?.totals?.campaigns || 0),
        messagesSent: Number(outbound.messagesSent || 0),
        repliesReceived: Number(conversions?.summary?.replies || 0),
        needAction: items.length,
        scheduledReturn: 0,
        unclassified: items.length,
      },
      needActionItems: items.slice(0, 8),
      scheduledReturnItems: [],
      interestBuckets: [],
      avgResponseTimeMinutes: 0,
      responseTimeSeries: [],
      aiClassification: [],
      aiTip: conversions?.summary?.replies
        ? { message: 'Respostas recentes carregadas via analytics — aguarde API campaign-replies no NeuraFlow.', count: Number(conversions.summary.replies || 0) }
        : null,
      conversations: {
        items,
        total: items.length,
        tabs: {
          all: items.length,
          needAction: items.length,
          interested: 0,
          scheduledReturn: 0,
          noInterest: 0,
          unclassified: items.length,
        },
      },
      _fallback: true,
    });
  }

  async function load(session, options) {
    try {
      return await fetchCampaignReplies(session, options);
    } catch (err) {
      // URL do browser: /api/operator/engage/campaign-replies (BFF OK).
      // 404 com message "/engage/campaign-replies" = NeuraFlow ainda sem a rota upstream.
      if (isNotFoundError(err)) {
        const fallback = await fetchFallback(session, options?.window || '7d');
        fallback._fallback = true;
        return fallback;
      }
      throw err;
    }
  }

  window.EngageRepliesCenterApi = {
    getDefaultTenantId,
    load,
    fetchCampaignReplies,
    normalizePayload,
  };
})();
