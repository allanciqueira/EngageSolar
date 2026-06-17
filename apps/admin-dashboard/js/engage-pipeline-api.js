/**
 * Engage — Pipeline de Leads (Kanban comercial).
 * @see docs/HANDOFF-ENGAGE-SOLAR-FRONT-PIPELINE-LEADS.md
 */
(function () {
  const adminApi = () => window.EngageSolarApi || window.ReservaAiApi;

  const LEAD_STATUS_COLUMNS = {
    NEW: { emoji: '🔥', label: 'Novos Leads', status: 'NEW' },
    IN_PROGRESS: { emoji: '👨‍💼', label: 'Em Atendimento', status: 'IN_PROGRESS' },
    WAITING_CUSTOMER: { emoji: '⏳', label: 'Aguardando Cliente', status: 'WAITING_CUSTOMER' },
    FOLLOW_UP: { emoji: '📅', label: 'Retorno Futuro', status: 'FOLLOW_UP' },
    CLOSED: { emoji: '✅', label: 'Recuperados / Fechados', status: 'CLOSED' },
  };

  const LEAD_TEMPERATURE = {
    HOT: { label: 'Muito quente', tone: 'hot', icon: '🔥' },
    WARM: { label: 'Interessado', tone: 'warm', icon: '🌤️' },
    COLD: { label: 'Frio', tone: 'cold', icon: '❄️' },
  };

  const COMMERCIAL_PRIORITY = {
    ALTA: { label: 'Prioridade alta', tone: 'high' },
    MEDIA: { label: 'Prioridade média', tone: 'medium' },
    BAIXA: { label: 'Prioridade baixa', tone: 'low' },
  };

  const LEAD_GRADE = {
    'A+': { tone: 'aplus' },
    A: { tone: 'a' },
    B: { tone: 'b' },
    C: { tone: 'c' },
    D: { tone: 'd' },
    E: { tone: 'e' },
  };

  const PRIORITY_SORT_ORDER = { ALTA: 0, MEDIA: 1, BAIXA: 2 };

  const REPLY_INTENT_LABELS = {
    SIMULATION: 'Simulação',
    BUDGET: 'Orçamento',
    VISIT: 'Visita',
    FINANCING: 'Financiamento',
    GENERAL_INTEREST: 'Interesse',
    DOUBT: 'Dúvida',
    DEFER: 'Adiar',
    NO_INTEREST: 'Sem interesse',
  };

  const KPI_DEFS = [
    { key: 'activeLeads', label: 'Leads Ativos', tone: 'primary', pctBase: true },
    { key: 'unassigned', label: 'Sem Responsável', tone: 'amber' },
    { key: 'inProgress', label: 'Em Atendimento', tone: 'blue' },
    { key: 'waitingCustomer', label: 'Aguardando Cliente', tone: 'purple' },
    { key: 'followUp', label: 'Retorno Futuro', tone: 'orange' },
    { key: 'closed', label: 'Fechados', tone: 'green', hidePct: true },
  ];

  let mockCache = null;

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

  function tenantQuery(session, extra) {
    const tenantId = getDefaultTenantId(session);
    if (!tenantId) return '';
    const params = new URLSearchParams({ tenantId, ...(extra || {}) });
    return params.toString();
  }

  function buildLeadPaths(session, suffix, extraQuery) {
    const qs = tenantQuery(session, extraQuery);
    const encTenant = encodeURIComponent(getDefaultTenantId(session));
    const pathSuffix = suffix || '';
    return [
      `/api/operator/engage/leads${pathSuffix}?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/leads${pathSuffix}?${qs}`,
    ];
  }

  function buildAgentPaths(session) {
    const qs = tenantQuery(session);
    const encTenant = encodeURIComponent(getDefaultTenantId(session));
    return [
      `/api/operator/engage/response-center/agents?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/response-center/agents?${qs}`,
    ];
  }

  async function apiRequest(paths, options = {}) {
    const api = adminApi();
    if (!api?.request) throw new Error('Cliente API indisponível.');
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await api.request(path, { cache: 'no-store', ...options });
      } catch (err) {
        lastErr = err;
        const status = Number(err?.statusCode || err?.status || 0);
        if (status !== 404) throw err;
      }
    }
    throw lastErr || new Error('Rota Pipeline não encontrada.');
  }

  function isMockPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.mock === true || payload.isMock === true) return true;
    return String(payload.source || '').toLowerCase() === 'mock';
  }

  async function loadMockBundle() {
    if (mockCache) return mockCache;
    const response = await fetch('./data/mock-pipeline-leads.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Mock Pipeline indisponível.');
    mockCache = await response.json();
    return mockCache;
  }

  async function callApi(session, suffix, extraQuery, options = {}) {
    return apiRequest(buildLeadPaths(session, suffix, extraQuery), {
      session,
      ...options,
    });
  }

  function normalizeCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: String(raw.id || '').trim(),
      conversationId: String(raw.conversationId || '').trim(),
      contactId: String(raw.contactId || '').trim(),
      name: String(raw.name || 'Contato').trim(),
      phone: String(raw.phone || '').trim(),
      title: String(raw.title || '').trim(),
      description: raw.description != null ? String(raw.description) : null,
      lastMessage: String(raw.lastMessage || '').trim(),
      lastMessageDirection: raw.lastMessageDirection || null,
      sourceCampaignId: raw.sourceCampaignId || null,
      sourceCampaignName: raw.sourceCampaignName || null,
      sourceAudienceId: raw.sourceAudienceId || null,
      sourceAudienceName: raw.sourceAudienceName || null,
      replyIntent: raw.replyIntent || null,
      leadScore: raw.leadScore != null ? Number(raw.leadScore) : null,
      leadGrade: raw.leadGrade || null,
      leadTemperature: raw.leadTemperature || null,
      temperatureSource: raw.temperatureSource || null,
      commercialPriority: raw.commercialPriority || null,
      assignedSalesConsultantId: raw.assignedSalesConsultantId || null,
      assignedAgentName: raw.assignedAgentName || null,
      lastInteractionAt: raw.lastInteractionAt || null,
      nextContactAt: raw.nextContactAt || null,
      status: raw.status || raw.kanbanColumn || 'NEW',
      kanbanColumn: raw.kanbanColumn || raw.status || 'NEW',
      source: raw.source || null,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  }

  function sortCardsByPriority(cards) {
    if (!Array.isArray(cards)) return [];
    return [...cards].sort((a, b) => {
      const pa = PRIORITY_SORT_ORDER[String(a.commercialPriority || '').toUpperCase()];
      const pb = PRIORITY_SORT_ORDER[String(b.commercialPriority || '').toUpperCase()];
      const rankA = pa != null ? pa : 99;
      const rankB = pb != null ? pb : 99;
      if (rankA !== rankB) return rankA - rankB;
      const sa = Number(a.leadScore);
      const sb = Number(b.leadScore);
      if (Number.isFinite(sa) && Number.isFinite(sb)) return sb - sa;
      if (Number.isFinite(sb)) return 1;
      if (Number.isFinite(sa)) return -1;
      return 0;
    });
  }

  function normalizeKanban(raw) {
    const columns = Array.isArray(raw?.columns) ? raw.columns : [];
    return {
      tenantId: raw?.tenantId || null,
      cardsPerColumn: Number(raw?.cardsPerColumn || 50),
      fetchedAt: raw?.fetchedAt || null,
      mock: isMockPayload(raw),
      columns: columns.map((col) => ({
        key: String(col.key || '').trim(),
        label: String(col.label || LEAD_STATUS_COLUMNS[col.key]?.label || col.key || '').trim(),
        total: Number(col.total || 0),
        cards: sortCardsByPriority(
          (Array.isArray(col.cards) ? col.cards : []).map(normalizeCard).filter(Boolean),
        ),
      })),
    };
  }

  function normalizeSummary(raw) {
    return {
      tenantId: raw?.tenantId || null,
      activeLeads: Number(raw?.activeLeads || 0),
      unassigned: Number(raw?.unassigned || 0),
      inProgress: Number(raw?.inProgress || 0),
      waitingCustomer: Number(raw?.waitingCustomer || 0),
      followUp: Number(raw?.followUp || 0),
      closed: Number(raw?.closed || 0),
      fetchedAt: raw?.fetchedAt || null,
      mock: isMockPayload(raw),
    };
  }

  function normalizeAgents(raw) {
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
    return list.map((row) => ({
      salesConsultantId: String(row.salesConsultantId || row.id || '').trim(),
      displayName: String(row.displayName || row.name || '').trim(),
    })).filter((a) => a.salesConsultantId);
  }

  async function getSummary(session) {
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      const mock = await loadMockBundle();
      const out = normalizeSummary(mock.summary);
      out.mock = true;
      return out;
    }
    const raw = await callApi(session, '/summary', null, { method: 'GET' });
    return normalizeSummary(raw);
  }

  async function getKanban(session, filters = {}) {
    const extra = {};
    if (filters.assignedTo) extra.assignedTo = filters.assignedTo;
    if (filters.campaignId) extra.campaignId = filters.campaignId;
    if (filters.temperature) extra.temperature = filters.temperature;
    if (filters.q) extra.q = filters.q;
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      const mock = await loadMockBundle();
      const out = normalizeKanban(mock.kanban);
      out.mock = true;
      return out;
    }
    const raw = await callApi(session, '/kanban', extra, { method: 'GET' });
    return normalizeKanban(raw);
  }

  async function getAgents(session) {
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      const mock = await loadMockBundle();
      return normalizeAgents(mock.agents || []);
    }
    const raw = await apiRequest(buildAgentPaths(session), { method: 'GET', session });
    return normalizeAgents(raw);
  }

  async function patchLeadStatus(session, leadId, body) {
    const enc = encodeURIComponent(leadId);
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      return { ...normalizeCard(body), id: leadId, kanbanColumn: body.status, status: body.status };
    }
    const raw = await callApi(session, `/${enc}/status`, null, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    });
    return normalizeCard(raw?.lead || raw);
  }

  async function createLead(session, body) {
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      return {
        created: true,
        lead: normalizeCard({
          ...body,
          id: `mock-lead-${Date.now()}`,
          name: 'Novo Lead',
          status: 'NEW',
          kanbanColumn: 'NEW',
        }),
      };
    }
    const raw = await callApi(session, '', null, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
    return {
      created: raw?.created !== false,
      lead: normalizeCard(raw?.lead || raw),
    };
  }

  function mapApiError(err) {
    const status = Number(err?.statusCode || err?.status || 0);
    const code = String(
      err?.code
      || err?.details?.error
      || err?.details?.code
      || '',
    ).trim();
    if (status === 401) return { message: 'Sessão expirada. Faça login novamente.', redirectLogin: true };
    if (status === 403) return { message: 'Sem permissão para operar o Pipeline.' };
    if (status === 404) {
      return {
        message: 'API Pipeline indisponível. Confirme deploy do operator-service (proxy /engage/leads) e do api-engage.',
        code: 'route_not_found',
      };
    }
    if (status === 409 && code === 'lead_opted_out') {
      return { message: 'Este contato pediu remoção do cadastro (opt-out) e não pode ser reaberto.', code };
    }
    return { message: err?.message || 'Não foi possível concluir a operação.', code };
  }

  function formatPhoneDisplay(phone) {
    const raw = String(phone || '').replace(/\D/g, '');
    if (raw.length >= 12 && raw.startsWith('55')) {
      const ddd = raw.slice(2, 4);
      const rest = raw.slice(4);
      if (rest.length >= 9) {
        return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
      }
    }
    return phone || '—';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function scoreTone(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return 'neutral';
    if (n >= 80) return 'high';
    if (n >= 50) return 'mid';
    return 'low';
  }

  async function getLeadIntelligence(session, leadId) {
    const enc = encodeURIComponent(leadId);
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      const mock = await loadMockBundle();
      const allCards = (mock.kanban?.columns || []).flatMap((col) => col.cards || []);
      const card = allCards.find((c) => String(c.id) === String(leadId));
      if (!card) throw new Error('Lead não encontrado no mock.');
      return {
        tenantId: mock.kanban?.tenantId || 'mock-tenant',
        leadId,
        conversationId: card.conversationId,
        intelligence: {
          score: card.leadScore,
          grade: card.leadGrade,
          temperature: card.leadTemperature,
          temperatureSource: card.temperatureSource || 'AUTO',
          priority: card.commercialPriority,
          breakdown: [
            { key: 'intent', label: 'Intenção da resposta', weight: 25 },
            { key: 'recency', label: 'Interação recente', weight: 15 },
            { key: 'engagement', label: 'Engajamento', weight: 6 },
          ],
          computedAt: new Date().toISOString(),
        },
        signals: {},
      };
    }
    return callApi(session, `/${enc}/intelligence`, null, { method: 'GET' });
  }

  function gradeTone(grade) {
    const key = String(grade || '').trim();
    return LEAD_GRADE[key]?.tone || 'neutral';
  }

  function priorityTone(priority) {
    const key = String(priority || '').toUpperCase().trim();
    return COMMERCIAL_PRIORITY[key]?.tone || null;
  }

  function priorityLabel(priority) {
    const key = String(priority || '').toUpperCase().trim();
    if (key === 'ALTA') return 'Alta';
    if (key === 'MEDIA') return 'Média';
    if (key === 'BAIXA') return 'Baixa';
    return null;
  }

  window.EngagePipelineApi = {
    LEAD_STATUS_COLUMNS,
    LEAD_TEMPERATURE,
    COMMERCIAL_PRIORITY,
    LEAD_GRADE,
    REPLY_INTENT_LABELS,
    KPI_DEFS,
    getDefaultTenantId,
    getSummary,
    getKanban,
    getAgents,
    getLeadIntelligence,
    patchLeadStatus,
    createLead,
    mapApiError,
    formatPhoneDisplay,
    initials,
    scoreTone,
    gradeTone,
    priorityTone,
    priorityLabel,
    sortCardsByPriority,
    normalizeCard,
    isMockPayload,
  };
})();
