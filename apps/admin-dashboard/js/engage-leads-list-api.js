/**
 * Engage Solar — Leads List (Sprint 4.4).
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-LEADS-LIST.md
 */
(function () {
  const pipeline = () => window.EngagePipelineApi;
  const adminApi = () => window.EngageSolarApi || window.ReservaAiApi;

  const LEAD_STATUS_LABELS = {
    NEW: 'Novos Leads',
    ASSIGNED: 'Qualificação',
    IN_PROGRESS: 'Em Atendimento',
    WAITING_CUSTOMER: 'Aguardando',
    FOLLOW_UP: 'Retorno Futuro',
    CLOSED: 'Recuperados',
  };

  const SOURCE_LABELS = {
    AI: 'Campanha',
    CAMPAIGN: 'Campanha',
    INBOUND: 'WhatsApp Orgânico',
    SIMULATION: 'Simulação',
    MANUAL: 'Manual',
    RECOVERY: 'Recuperação',
  };

  const SUMMARY_CARDS = [
    { key: 'totalLeads', label: 'Total de Leads', tone: 'primary', icon: 'users', filter: null },
    { key: 'new', label: 'Novos', tone: 'blue', icon: 'spark', filter: { status: 'NEW' } },
    { key: 'qualification', label: 'Qualificação', tone: 'purple', icon: 'doc', filter: { hasQualification: 'true', qualificationMax: '99' } },
    { key: 'inProgress', label: 'Em Atendimento', tone: 'teal', icon: 'headset', filter: { status: 'ASSIGNED,IN_PROGRESS' } },
    { key: 'waiting', label: 'Aguardando', tone: 'amber', icon: 'clock', filter: { status: 'WAITING_CUSTOMER' } },
    { key: 'followUp', label: 'Retorno Futuro', tone: 'orange', icon: 'calendar', filter: { status: 'FOLLOW_UP' } },
    { key: 'recovered', label: 'Recuperados', tone: 'green', icon: 'check', filter: { status: 'CLOSED' } },
  ];

  const QUICK_TABS = [
    { id: 'all', label: 'Todos os Leads' },
    { id: 'mine', label: 'Meus Leads', assignedTo: 'me' },
    { id: 'unassigned', label: 'Sem Responsável', assignedTo: 'unassigned' },
    { id: 'hot', label: 'Leads Quentes', temperature: 'HOT' },
    { id: 'cold', label: 'Leads Frios', temperature: 'COLD' },
  ];

  const TABLE_SORT_FIELDS = {
    name: { defaultDir: 'asc', label: 'Lead' },
    source: { defaultDir: 'asc', label: 'Origem' },
    city: { defaultDir: 'asc', label: 'Cidade' },
    leadScore: { defaultDir: 'desc', label: 'Score' },
    temperature: { defaultDir: 'asc', label: 'Temperatura' },
    qualificationCompletion: { defaultDir: 'desc', label: 'Qualificação' },
    assignedAgentName: { defaultDir: 'asc', label: 'Responsável' },
    lastInteractionAt: { defaultDir: 'desc', label: 'Última interação' },
    status: { defaultDir: 'asc', label: 'Status' },
  };

  const TEMPERATURE_SORT_ORDER = { HOT: 0, WARM: 1, COLD: 2 };

  let mockCache = null;

  function getDefaultTenantId(session) {
    return pipeline()?.getDefaultTenantId?.(session) || '';
  }

  function buildPaths(session, suffix, extraQuery) {
    const tenantId = getDefaultTenantId(session);
    const qs = new URLSearchParams({ tenantId, ...(extraQuery || {}) });
    const q = qs.toString();
    const enc = encodeURIComponent(tenantId);
    return [
      `/api/operator/engage/leads${suffix}?${q}`,
      `/api/operator/engage/tenants/${enc}/leads${suffix}?${q}`,
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
    throw lastErr || new Error('Rota Leads List não encontrada.');
  }

  async function loadMock() {
    if (mockCache) return mockCache;
    const res = await fetch('./data/mock-leads-list.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Mock Leads List indisponível.');
    mockCache = await res.json();
    return mockCache;
  }

  function normalizeRow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id) return null;
    const origin = raw.origin && typeof raw.origin === 'object' ? raw.origin : {};
    const qual = raw.qualification && typeof raw.qualification === 'object' ? raw.qualification : {};
    const assignee = raw.assignedSalesConsultant || raw.assignedAgent || null;
    const lastMsg = raw.lastMessage && typeof raw.lastMessage === 'object' ? raw.lastMessage : {};
    return {
      id,
      conversationId: String(raw.conversationId || '').trim(),
      contactId: String(raw.contactId || '').trim(),
      name: String(raw.name || 'Contato').trim(),
      phone: String(raw.phone || '').trim(),
      city: raw.city != null ? String(raw.city).trim() : null,
      source: String(raw.source || '').trim().toUpperCase(),
      originLabel: origin.label || SOURCE_LABELS[raw.source] || raw.source || '—',
      campaignName: origin.campaignName || raw.sourceCampaignName || null,
      score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : (Number.isFinite(Number(raw.leadScore)) ? Number(raw.leadScore) : null),
      grade: raw.grade || raw.leadGrade || null,
      temperature: String(raw.temperature || raw.leadTemperature || '').trim().toUpperCase() || null,
      status: String(raw.status || '').trim().toUpperCase(),
      commercialPriority: String(raw.commercialPriority || '').trim().toUpperCase() || null,
      qualificationPct: pipeline()?.normalizeQualificationPct?.(qual.completion ?? qual.completeness) ?? null,
      qualificationHighlights: qual.highlights || {},
      assignedSalesConsultantId: assignee?.id || raw.assignedSalesConsultantId || null,
      assignedAgentName: assignee?.name || raw.assignedAgentName || null,
      assignedAgentColor: assignee?.color || null,
      assignedAgentAvatarUrl: assignee?.avatarUrl || raw.assignedAgentAvatarUrl || null,
      lastInteractionAt: raw.lastInteractionAt || null,
      lastInteractionBy: raw.lastInteractionBy || raw.lastInteraction?.actor || null,
      lastMessagePreview: lastMsg.preview || raw.lastMessage || '',
      lastMessageDirection: lastMsg.direction || raw.lastMessageDirection || null,
      nextContactAt: raw.nextContactAt || null,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  }

  function rowToCard(row) {
    if (!row) return null;
    const highlights = row.qualificationHighlights || {};
    return {
      id: row.id,
      conversationId: row.conversationId,
      contactId: row.contactId,
      name: row.name,
      phone: row.phone,
      city: row.city,
      leadScore: row.score,
      leadGrade: row.grade,
      leadTemperature: row.temperature,
      commercialPriority: row.commercialPriority,
      qualificationPct: row.qualificationPct,
      avgConsumptionKwh: highlights.averageConsumptionKwh ?? null,
      paymentMethod: highlights.paymentMethod ?? null,
      installationDeadline: highlights.installationTimeframe ?? null,
      assignedAgentName: row.assignedAgentName,
      assignedAgentAvatarUrl: row.assignedAgentAvatarUrl,
      assignedSalesConsultantId: row.assignedSalesConsultantId,
      status: row.status,
      originLabel: row.originLabel,
      sourceCampaignName: row.campaignName,
      lastInteractionAt: row.lastInteractionAt,
      source: row.source,
    };
  }

  function normalizeListResponse(raw) {
    if (!raw || typeof raw !== 'object') {
      return { leads: [], summary: {}, facets: {}, pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }, mock: false };
    }
    const leads = (Array.isArray(raw.leads) ? raw.leads : []).map(normalizeRow).filter(Boolean);
    const pagination = raw.pagination || {};
    return {
      tenantId: raw.tenantId || null,
      leads,
      summary: raw.summary || {},
      facets: raw.facets || {},
      pagination: {
        page: Number(pagination.page || 1),
        limit: Number(pagination.limit || 20),
        total: Number(pagination.total || leads.length),
        totalPages: Number(pagination.totalPages || 1),
      },
      appliedFilters: raw.appliedFilters || {},
      fetchedAt: raw.fetchedAt || null,
      mock: raw.mock === true,
    };
  }

  function normalizeDrawerBundle(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const summary = raw.summary && typeof raw.summary === 'object' ? raw.summary : raw;
    const qual = raw.qualification && typeof raw.qualification === 'object' ? raw.qualification : {};
    const row = normalizeRow({
      id: raw.leadId || summary.leadId || summary.id,
      conversationId: summary.conversationId,
      contactId: summary.contactId,
      name: summary.name,
      phone: summary.phone,
      city: summary.city,
      source: summary.source,
      origin: { label: summary.originLabel || summary.origin?.label },
      score: summary.score ?? summary.leadScore,
      grade: summary.grade ?? summary.leadGrade,
      temperature: summary.temperature ?? summary.leadTemperature,
      status: summary.status,
      commercialPriority: summary.commercialPriority,
      qualification: {
        completion: summary.qualificationCompletion ?? qual.completion?.completion,
        highlights: qual.data,
      },
      assignedSalesConsultant: summary.assignedSalesConsultant,
      lastInteractionAt: summary.lastInteractionAt,
      sourceCampaignName: summary.sourceCampaignName,
      sourceAudienceName: summary.sourceAudienceName,
    });
    const qualificationPayload = pipeline()?.normalizeQualificationPayload?.({
      leadId: row?.id,
      data: qual.data || qual,
      completion: qual.completion || { completion: summary.qualificationCompletion },
      suggestions: raw.aiSuggestions || raw.suggestions || [],
    }) || { completeness: row?.qualificationPct, fields: {}, suggestions: [] };
    return {
      row,
      card: rowToCard(row),
      qualification: qualificationPayload,
      intelligence: raw.intelligence || null,
      aiSuggestions: Array.isArray(raw.aiSuggestions) ? raw.aiSuggestions : [],
      conversation: raw.conversation || null,
      history: Array.isArray(raw.history) ? raw.history : [],
      activity: Array.isArray(raw.activity) ? raw.activity : [],
    };
  }

  function buildListQuery(filters) {
    const f = filters || {};
    const params = {};
    if (f.q) params.q = f.q;
    if (f.page) params.page = String(f.page);
    if (f.limit) params.limit = String(f.limit);
    if (f.sortBy) params.sortBy = f.sortBy;
    if (f.sortDir) params.sortDir = f.sortDir;
    if (f.status) params.status = f.status;
    if (f.assignedTo) params.assignedTo = f.assignedTo;
    if (f.temperature) params.temperature = f.temperature;
    if (f.source) params.source = f.source;
    if (f.scoreMin != null && f.scoreMin !== '') params.scoreMin = String(f.scoreMin);
    if (f.scoreMax != null && f.scoreMax !== '') params.scoreMax = String(f.scoreMax);
    if (f.qualificationMin != null && f.qualificationMin !== '') params.qualificationMin = String(f.qualificationMin);
    if (f.qualificationMax != null && f.qualificationMax !== '') params.qualificationMax = String(f.qualificationMax);
    if (f.hasQualification) params.hasQualification = String(f.hasQualification);
    if (f.campaignId) params.campaignId = f.campaignId;
    return params;
  }

  function sortValueForRow(row, sortBy) {
    if (!row) return null;
    switch (sortBy) {
      case 'name': return row.name;
      case 'source': return row.originLabel || row.source;
      case 'city': return row.city;
      case 'leadScore': return row.score;
      case 'temperature': return row.temperature;
      case 'qualificationCompletion': return row.qualificationPct;
      case 'assignedAgentName': return row.assignedAgentName;
      case 'lastInteractionAt': return row.lastInteractionAt;
      case 'status': return row.status;
      case 'updatedAt': return row.updatedAt;
      default: return row.updatedAt;
    }
  }

  function compareLeadRows(a, b, sortBy) {
    const va = sortValueForRow(a, sortBy);
    const vb = sortValueForRow(b, sortBy);
    const emptyA = va == null || va === '';
    const emptyB = vb == null || vb === '';
    if (emptyA && emptyB) return 0;
    if (emptyA) return 1;
    if (emptyB) return -1;

    if (sortBy === 'leadScore' || sortBy === 'qualificationCompletion') {
      const na = Number(va);
      const nb = Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      if (Number.isFinite(na)) return -1;
      if (Number.isFinite(nb)) return 1;
      return 0;
    }
    if (sortBy === 'lastInteractionAt' || sortBy === 'updatedAt') {
      const ta = new Date(va).getTime();
      const tb = new Date(vb).getTime();
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
      if (!Number.isNaN(ta)) return -1;
      if (!Number.isNaN(tb)) return 1;
      return 0;
    }
    if (sortBy === 'temperature') {
      const ra = TEMPERATURE_SORT_ORDER[String(va).toUpperCase()] ?? 99;
      const rb = TEMPERATURE_SORT_ORDER[String(vb).toUpperCase()] ?? 99;
      return ra - rb;
    }
    return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });
  }

  function sortLeadRows(leads, filters) {
    const list = Array.isArray(leads) ? leads : [];
    const sortBy = filters?.sortBy || 'updatedAt';
    const asc = String(filters?.sortDir || 'desc').toLowerCase() === 'asc';
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => compareLeadRows(a, b, sortBy) * dir);
  }

  function defaultSortDir(sortBy) {
    return TABLE_SORT_FIELDS[sortBy]?.defaultDir || 'desc';
  }

  async function getLeadsList(session, filters) {
    const params = buildListQuery(filters);
    if (window.ENGAGE_LEADS_LIST_USE_MOCK === true) {
      const mock = await loadMock();
      const result = normalizeListResponse({ ...mock, mock: true });
      result.leads = sortLeadRows(result.leads, filters);
      return result;
    }
    try {
      const raw = await apiRequest(buildPaths(session, '/list', params), { method: 'GET', session });
      return normalizeListResponse(raw);
    } catch (err) {
      const status = Number(err?.statusCode || err?.status || 0);
      if (status === 404) {
        const mock = await loadMock();
        const result = normalizeListResponse({ ...mock, mock: true });
        result.leads = sortLeadRows(result.leads, filters);
        return result;
      }
      throw err;
    }
  }

  function mockDrawerExtras(row) {
    const extras = {
      aiSuggestions: [],
      conversation: { lastMessages: [], messageCount: null },
      activity: [],
      history: [],
    };
    if (!row) return extras;
    if (row.id === '78404607-a88b-4e1f-91f0-30e82f69556a') {
      extras.aiSuggestions = [
        { field: 'paymentMethod', label: 'Forma de pagamento', value: 'Financiamento', displayValue: 'Financiamento', confidence: 0.82, status: 'PENDING' },
        { field: 'installationTimeframe', label: 'Prazo de instalação', value: '30 dias', displayValue: '30 dias', confidence: 0.75, status: 'PENDING' },
      ];
      extras.conversation = { lastMessages: [], messageCount: 12 };
      extras.activity = [{ id: 'a1' }, { id: 'a2' }];
    }
    return extras;
  }

  function buildMockDrawer(row) {
    const extras = mockDrawerExtras(row);
    return normalizeDrawerBundle({
      summary: {
        ...row,
        leadId: row.id,
        originLabel: row.originLabel,
        qualificationCompletion: row.qualificationPct,
        assignedSalesConsultant: row.assignedAgentName
          ? {
            id: row.assignedSalesConsultantId,
            name: row.assignedAgentName,
            avatarUrl: row.assignedAgentAvatarUrl,
            color: row.assignedAgentColor,
          }
          : null,
      },
      qualification: {
        data: row.qualificationHighlights,
        completion: { completion: row.qualificationPct },
        suggestions: extras.aiSuggestions,
      },
      aiSuggestions: extras.aiSuggestions,
      conversation: extras.conversation,
      activity: extras.activity,
      history: extras.history,
    });
  }

  async function getLeadDrawer(session, leadId) {
    const enc = encodeURIComponent(leadId);
    if (window.ENGAGE_LEADS_LIST_USE_MOCK === true) {
      const mock = await loadMock();
      const row = (mock.leads || []).map(normalizeRow).find((r) => r.id === leadId);
      if (!row) {
        const err = new Error('Lead não encontrado.');
        err.statusCode = 404;
        err.code = 'lead_not_found';
        throw err;
      }
      return buildMockDrawer(row);
    }
    try {
      const raw = await apiRequest(buildPaths(session, `/${enc}/drawer`, {}), { method: 'GET', session });
      return normalizeDrawerBundle(raw);
    } catch (err) {
      const status = Number(err?.statusCode || err?.status || 0);
      if (status === 404) {
        const mock = await loadMock();
        const row = (mock.leads || []).map(normalizeRow).find((r) => r.id === leadId);
        if (!row) {
          err.code = err.code || 'lead_not_found';
          throw err;
        }
        return buildMockDrawer(row);
      }
      throw err;
    }
  }

  function statusLabel(status) {
    const key = String(status || '').trim().toUpperCase();
    return LEAD_STATUS_LABELS[key] || key.replace(/_/g, ' ') || '—';
  }

  function statusTone(status) {
    const key = String(status || '').trim().toUpperCase();
    const map = {
      NEW: 'blue',
      ASSIGNED: 'purple',
      IN_PROGRESS: 'teal',
      WAITING_CUSTOMER: 'amber',
      FOLLOW_UP: 'orange',
      CLOSED: 'green',
    };
    return map[key] || 'neutral';
  }

  function formatRelativeTime(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `há ${days} dia${days === 1 ? '' : 's'}`;
  }

  function mapApiError(err) {
    return pipeline()?.mapApiError?.(err) || { message: err?.message || 'Erro inesperado.' };
  }

  window.EngageLeadsListApi = {
    LEAD_STATUS_LABELS,
    SOURCE_LABELS,
    SUMMARY_CARDS,
    QUICK_TABS,
    TABLE_SORT_FIELDS,
    defaultSortDir,
    getLeadsList,
    getLeadDrawer,
    normalizeRow,
    rowToCard,
    normalizeDrawerBundle,
    buildListQuery,
    statusLabel,
    statusTone,
    formatRelativeTime,
    mapApiError,
  };
})();
