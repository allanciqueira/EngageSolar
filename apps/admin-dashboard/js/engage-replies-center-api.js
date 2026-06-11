/**
 * Engage — Central de Respostas (response-center).
 * BFF: GET /api/operator/engage/response-center
 */
(function () {
  const adminApi = () => window.ReservaAiApi || window.EngageSolarApi;

  const INTENT_LABELS = {
    BUDGET: 'Quero orçamento',
    VISIT: 'Quero visita',
    SIMULATION: 'Quero simulação',
    FINANCING: 'Quero financiamento',
    GENERAL_INTEREST: 'Tenho interesse',
  };

  const CATEGORY_LABELS = {
    INTERESSADO: 'Interessado',
    INTERESTED: 'Interessado',
    RETORNO_FUTURO: 'Retorno futuro',
    SCHEDULED_RETURN: 'Retorno futuro',
    SEM_INTERESSE: 'Sem interesse',
    NO_INTEREST: 'Sem interesse',
    DUVIDA: 'Dúvidas',
    DOUBT: 'Dúvidas',
    NAO_CLASSIFICADO: 'Não classificado',
    UNCLASSIFIED: 'Não classificado',
  };

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

  function mapTabToApi(tab) {
    const map = {
      '': 'all',
      all: 'all',
      need_action: 'action',
      action: 'action',
      interested: 'interested',
      scheduled_return: 'defer',
      defer: 'defer',
      no_interest: 'no_interest',
      unclassified: 'unclassified',
      doubt: 'doubt',
    };
    return map[String(tab || '').trim()] || 'all';
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
        if (Number(err?.statusCode || err?.status || 0) !== 404) throw err;
      }
    }
    throw lastErr || new Error('Rota Engage não encontrada.');
  }

  function buildPaths(session, extraQuery) {
    const qs = tenantQuery(session, extraQuery);
    return [
      `/api/operator/engage/response-center?${qs}`,
      `/api/operator/engage/campaign-replies?${qs}`,
    ];
  }

  function labelCategory(value) {
    const key = String(value || '').trim().toUpperCase();
    return CATEGORY_LABELS[key] || value || '—';
  }

  function normalizeItem(row) {
    if (!row || typeof row !== 'object') return null;
    const phone = String(row.phoneE164 || row.phone || row.normalizedPhone || '').trim();
    const name = String(row.name || row.contactName || '').trim();
    const category = String(row.category || row.classification || row.lossCategory || '').trim();
    return {
      id: String(row.recipientId || row.id || row.conversationId || '').trim(),
      conversationId: String(row.conversationId || '').trim(),
      contactName: name || phone || 'Contato',
      phone,
      avatarUrl: String(row.avatarUrl || '').trim(),
      messagePreview: String(
        row.lastInboundMessage || row.messagePreview || row.message || row.lastMessage || '',
      ).trim(),
      campaignId: String(row.campaignId || '').trim(),
      campaignName: String(row.campaignName || row.campaign?.name || '—').trim(),
      receivedAt: row.lastReplyAt || row.repliedAt || row.receivedAt || row.updatedAt || null,
      classification: category,
      classificationLabel: labelCategory(category),
      nextContactAt: row.nextContactAt || null,
      interestLabel: String(row.replyIntent || row.interestLabel || '').trim(),
      needsSeller: row.needsAction === true,
      assignedAgentName: String(row.assignedAgentName || '').trim(),
    };
  }

  function normalizeSummary(raw) {
    const kpis = raw?.kpis || raw?.summary || raw?.totals || {};
    const trends = raw?.trends || {};
    return {
      activeCampaigns: Number(kpis.activeCampaigns ?? kpis.campaigns ?? 0),
      messagesSent: Number(kpis.messagesSent ?? kpis.outbound?.messagesSent ?? 0),
      messagesSentDeltaPct: Number(trends.messagesSent?.deltaPct ?? kpis.messagesSentDeltaPct ?? 0),
      repliesReceived: Number(kpis.repliesReceived ?? kpis.replies ?? 0),
      repliesDeltaPct: Number(trends.repliesReceived?.deltaPct ?? kpis.repliesDeltaPct ?? 0),
      needAction: Number(kpis.needsAction ?? kpis.needAction ?? kpis.needActionCount ?? 0),
      needActionDeltaPct: Number(trends.needsAction?.deltaPct ?? kpis.needActionDeltaPct ?? 0),
      scheduledReturn: Number(kpis.deferred ?? kpis.scheduledReturn ?? kpis.scheduledReturnCount ?? 0),
      scheduledReturnDeltaPct: Number(trends.deferred?.deltaPct ?? kpis.scheduledReturnDeltaPct ?? 0),
      unclassified: Number(kpis.unclassified ?? kpis.unclassifiedCount ?? 0),
      unclassifiedDeltaPct: Number(trends.unclassified?.deltaPct ?? 0),
    };
  }

  function classificationCount(rows, key) {
    const list = Array.isArray(rows) ? rows : [];
    const found = list.find((r) => String(r.category || r.key || '').toUpperCase() === key);
    return Number(found?.count ?? 0);
  }

  function normalizePayload(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const isResponseCenter = raw.kpis || raw.lists || Array.isArray(raw.rows);

    const needAction = isResponseCenter
      ? (Array.isArray(raw.lists?.needsAction) ? raw.lists.needsAction : [])
      : Array.isArray(raw.needActionItems)
        ? raw.needActionItems
        : Array.isArray(raw.needAction) ? raw.needAction : [];

    const scheduledReturn = isResponseCenter
      ? (Array.isArray(raw.lists?.deferred) ? raw.lists.deferred : [])
      : Array.isArray(raw.scheduledReturnItems)
        ? raw.scheduledReturnItems
        : Array.isArray(raw.scheduledReturn) ? raw.scheduledReturn : [];

    const interestBuckets = isResponseCenter
      ? (Array.isArray(raw.lists?.interestedByIntent)
        ? raw.lists.interestedByIntent.map((b) => ({
          key: String(b.intent || b.key || '').trim(),
          label: INTENT_LABELS[b.intent] || String(b.label || b.intent || '').trim(),
          count: Number(b.count || 0),
        }))
        : [])
      : Array.isArray(raw.interestBuckets)
        ? raw.interestBuckets.map((b) => ({
          key: String(b.key || b.id || '').trim(),
          label: String(b.label || b.name || '').trim(),
          count: Number(b.count || 0),
        }))
        : [];

    const aiClassification = isResponseCenter
      ? (Array.isArray(raw.classification)
        ? raw.classification.map((b) => ({
          key: String(b.category || b.key || '').trim(),
          label: labelCategory(b.category || b.label),
          count: Number(b.count || 0),
          pct: Number(b.pct ?? b.percent ?? 0),
        }))
        : [])
      : Array.isArray(raw.aiClassification)
        ? raw.aiClassification.map((b) => ({
          key: String(b.key || b.id || '').trim(),
          label: String(b.label || b.name || '').trim(),
          count: Number(b.count || 0),
          pct: Number(b.pct ?? b.percent ?? 0),
        }))
        : [];

    const rows = isResponseCenter
      ? (Array.isArray(raw.rows) ? raw.rows : [])
      : Array.isArray(raw.conversations?.items)
        ? raw.conversations.items
        : Array.isArray(raw.items) ? raw.items : [];

    const summary = normalizeSummary(raw);
    const meta = raw.meta || {};
    const classification = raw.classification || [];

    const tabCounts = isResponseCenter
      ? {
        all: Number(meta.total ?? summary.repliesReceived ?? rows.length),
        needAction: summary.needAction,
        interested: classificationCount(classification, 'INTERESSADO'),
        scheduledReturn: summary.scheduledReturn,
        noInterest: classificationCount(classification, 'SEM_INTERESSE'),
        unclassified: summary.unclassified,
      }
      : {
        all: Number(raw.conversations?.tabs?.all ?? raw.tabCounts?.all ?? rows.length),
        needAction: Number(raw.conversations?.tabs?.needAction ?? summary.needAction ?? 0),
        interested: Number(raw.conversations?.tabs?.interested ?? 0),
        scheduledReturn: Number(raw.conversations?.tabs?.scheduledReturn ?? summary.scheduledReturn ?? 0),
        noInterest: Number(raw.conversations?.tabs?.noInterest ?? 0),
        unclassified: Number(raw.conversations?.tabs?.unclassified ?? summary.unclassified ?? 0),
      };

    const responseTime = raw.responseTime || {};
    const daily = Array.isArray(responseTime.daily) ? responseTime.daily : [];

    return {
      fetchedAt: raw.fetchedAt || null,
      window: raw.window || null,
      summary,
      needActionItems: needAction.map(normalizeItem).filter(Boolean),
      scheduledReturnItems: scheduledReturn.map(normalizeItem).filter(Boolean),
      interestBuckets,
      avgResponseTimeMinutes: Number(
        responseTime.averageMinutes ?? raw.avgResponseTimeMinutes ?? 0,
      ),
      responseTimeSeries: daily.length
        ? daily.map((d) => Number(d.averageMinutes ?? d.value ?? 0))
        : Array.isArray(raw.responseTimeSeries) ? raw.responseTimeSeries : [],
      aiClassification,
      aiTip: raw.aiTip || null,
      conversations: {
        items: rows.map(normalizeItem).filter(Boolean),
        total: Number(meta.total ?? raw.conversations?.total ?? raw.total ?? rows.length),
        tabs: tabCounts,
        nextCursor: String(raw.conversations?.nextCursor || raw.nextCursor || '').trim(),
      },
    };
  }

  async function fetchResponseCenter(session, options) {
    const extra = {
      window: options?.window || '7d',
      tab: mapTabToApi(options?.tab),
      q: options?.q || '',
      limit: String(options?.limit || 50),
      page: String(options?.page || 1),
      cursor: options?.cursor || '',
    };
    Object.keys(extra).forEach((key) => {
      if (!extra[key]) delete extra[key];
    });
    if (extra.page === '1') delete extra.page;
    const raw = await apiGet(buildPaths(session, extra), session);
    return normalizePayload(raw);
  }

  async function load(session, options) {
    return fetchResponseCenter(session, options);
  }

  window.EngageRepliesCenterApi = {
    getDefaultTenantId,
    load,
    fetchResponseCenter,
    normalizePayload,
    mapTabToApi,
  };
})();
