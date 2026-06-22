/**
 * Engage — Pipeline de Leads (Kanban comercial).
 * @see docs/HANDOFF-ENGAGE-SOLAR-FRONT-PIPELINE-LEADS.md
 */
(function () {
  const adminApi = () => window.EngageSolarApi || window.ReservaAiApi;

  const LEAD_STATUS_COLUMNS = {
    NEW: { emoji: '🔥', label: 'Novos Leads', status: 'NEW' },
    QUALIFICATION: { emoji: '📝', label: 'Qualificação', status: 'ASSIGNED' },
    IN_PROGRESS: { emoji: '👨‍💼', label: 'Em Atendimento', status: 'IN_PROGRESS' },
    WAITING_CUSTOMER: { emoji: '⏳', label: 'Aguardando Cliente', status: 'WAITING_CUSTOMER' },
    FOLLOW_UP: { emoji: '📅', label: 'Retorno Futuro', status: 'FOLLOW_UP' },
    CLOSED: { emoji: '✅', label: 'Recuperados / Fechados', status: 'CLOSED' },
  };

  const COLUMN_ORDER = Object.keys(LEAD_STATUS_COLUMNS);

  /** Status da API → chave da coluna Kanban (UI). */
  const API_STATUS_TO_COLUMN = {
    NEW: 'NEW',
    ASSIGNED: 'QUALIFICATION',
    QUALIFICATION: 'QUALIFICATION',
    IN_PROGRESS: 'IN_PROGRESS',
    WAITING_CUSTOMER: 'WAITING_CUSTOMER',
    FOLLOW_UP: 'FOLLOW_UP',
    CLOSED: 'CLOSED',
  };

  function normalizeApiStatus(raw) {
    const key = String(raw || 'NEW').trim().toUpperCase();
    if (key === 'QUALIFICATION') return 'ASSIGNED';
    return key || 'NEW';
  }

  function statusToKanbanColumn(statusOrColumn) {
    const key = String(statusOrColumn || '').trim().toUpperCase();
    if (LEAD_STATUS_COLUMNS[key]) return key;
    return API_STATUS_TO_COLUMN[normalizeApiStatus(key)] || key || 'NEW';
  }

  /** Coluna Kanban da UI (6 colunas). ASSIGNED ≠ IN_PROGRESS mesmo quando a API devolve kanbanColumn IN_PROGRESS. */
  function resolveKanbanColumn(raw) {
    const status = normalizeApiStatus(raw?.status || 'NEW');
    if (status === 'ASSIGNED') return 'QUALIFICATION';
    if (status === 'IN_PROGRESS') return 'IN_PROGRESS';

    const col = String(raw?.kanbanColumn || '').trim().toUpperCase();
    if (col === 'ASSIGNED') return 'QUALIFICATION';
    if (col && LEAD_STATUS_COLUMNS[col]) return col;
    return API_STATUS_TO_COLUMN[status] || 'NEW';
  }

  function normalizeKanbanColumnKey(key) {
    const raw = String(key || '').trim().toUpperCase();
    if (raw === 'ASSIGNED') return 'QUALIFICATION';
    return raw;
  }

  function columnKeyToApiStatus(columnKey) {
    const col = LEAD_STATUS_COLUMNS[columnKey];
    return col?.status || normalizeApiStatus(columnKey);
  }

  const LEAD_TEMPERATURE = {
    HOT: { label: 'Muito quente', tone: 'hot', icon: '🔥', cardIcon: '🔥' },
    WARM: { label: 'Interessado', tone: 'warm', icon: '🟡', cardIcon: '🟡' },
    COLD: { label: 'Frio', tone: 'cold', icon: '🔵', cardIcon: '🔵' },
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
    { key: 'inQualification', label: 'Em Qualificação', tone: 'teal' },
    { key: 'inProgress', label: 'Em Atendimento', tone: 'blue' },
    { key: 'waitingCustomer', label: 'Aguardando Cliente', tone: 'purple' },
    { key: 'followUp', label: 'Retorno Futuro', tone: 'orange' },
    { key: 'closed', label: 'Fechados', tone: 'green', hidePct: true },
  ];

  /* Valores canônicos PT-BR (api-engage autofill) — HANDOFF-ENGAGE-SOLAR-FRONT-QUALIFICATION-FORM §3 */
  const ROOF_TYPE_CANONICAL = ['Cerâmico', 'Metálico', 'Fibrocimento', 'Laje', 'Solo'];

  const ROOF_TYPE_LEGACY = {
    CERAMIC: 'Cerâmico',
    CERAMICO: 'Cerâmico',
    METAL: 'Metálico',
    METALIC: 'Metálico',
    METALLIC: 'Metálico',
    METALICO: 'Metálico',
    FIBER_CEMENT: 'Fibrocimento',
    FIBROCIMENT: 'Fibrocimento',
    FIBROCIMENTO: 'Fibrocimento',
    SLAB: 'Laje',
    CONCRETE: 'Laje',
    LAJE: 'Laje',
    GROUND: 'Solo',
    SOLO: 'Solo',
    OTHER: 'Outro',
    OUTRO: 'Outro',
  };

  const PAYMENT_METHOD_CANONICAL = [
    'Financiamento',
    'À vista',
    'Cartão de crédito',
    'Consórcio',
    'Pix',
    'Boleto',
  ];

  const PAYMENT_METHOD_LEGACY = {
    CASH: 'À vista',
    A_VISTA: 'À vista',
    FINANCING: 'Financiamento',
    FINANCIAMENTO: 'Financiamento',
    CREDIT_CARD: 'Cartão de crédito',
    CARTAO: 'Cartão de crédito',
    LEASING: 'Consórcio',
    CONSORCIO: 'Consórcio',
    PIX: 'Pix',
    BOLETO: 'Boleto',
    MIXED: 'Misto',
    UNDECIDED: 'Indefinido',
  };

  const INSTALLATION_DEADLINE_LEGACY = {
    IMMEDIATE: 'imediato',
    IMEDIATO: 'imediato',
    DAYS_30: '30 dias',
    DAYS_60: '60 dias',
    DAYS_90: '90 dias',
    MONTHS_6: '6 meses',
    FLEXIBLE: 'Flexível',
  };

  /** @deprecated use ROOF_TYPE_CANONICAL — mantido para cards legados */
  const ROOF_TYPE_LABELS = {
    CERAMIC: 'Cerâmico',
    FIBER_CEMENT: 'Fibrocimento',
    METAL: 'Metálico',
    CONCRETE: 'Concreto',
    SLAB: 'Laje',
    OTHER: 'Outro',
  };

  /** @deprecated use PAYMENT_METHOD_CANONICAL */
  const PAYMENT_METHOD_LABELS = {
    CASH: 'À vista',
    FINANCING: 'Financiamento',
    LEASING: 'Leasing',
    CREDIT_CARD: 'Cartão',
    MIXED: 'Misto',
    UNDECIDED: 'Indefinido',
  };

  /** @deprecated prazo é texto livre na API */
  const INSTALLATION_DEADLINE_LABELS = {
    IMMEDIATE: 'Imediato',
    DAYS_30: '30 dias',
    DAYS_60: '60 dias',
    DAYS_90: '90 dias',
    MONTHS_6: '6 meses',
    FLEXIBLE: 'Flexível',
  };

  const DECISION_MAKER_LABELS = {
    OWNER: 'Proprietário',
    SPOUSE: 'Cônjuge',
    FAMILY: 'Familiar',
    TENANT: 'Inquilino',
    BUSINESS_PARTNER: 'Sócio',
    OTHER: 'Outro',
  };

  const QUALIFICATION_FIELD_DEFS = [
    { key: 'avgConsumptionKwh', label: 'Consumo médio (kWh)', type: 'number', suffix: 'kWh', step: '0.01' },
    { key: 'roofType', label: 'Tipo de telhado', type: 'select', optionList: ROOF_TYPE_CANONICAL },
    { key: 'plansToIncreaseConsumption', label: 'Pretende aumentar consumo', type: 'boolean' },
    { key: 'hasHighConsumptionEquipment', label: 'Já possui equipamento', type: 'boolean' },
    { key: 'equipmentDescription', label: 'Descrição do equipamento', type: 'textarea' },
    { key: 'isFirstQuote', label: 'Primeira cotação', type: 'boolean' },
    { key: 'installationDeadline', label: 'Prazo de instalação', type: 'text', placeholder: 'Ex.: 30 dias, imediato' },
    { key: 'decisionMaker', label: 'Tomador de decisão', type: 'select', options: DECISION_MAKER_LABELS },
    { key: 'paymentMethod', label: 'Forma de pagamento', type: 'select', optionList: PAYMENT_METHOD_CANONICAL },
    { key: 'technicalVisitAt', label: 'Data da visita técnica', type: 'date' },
    { key: 'specialist', label: 'Especialista responsável', type: 'text' },
    { key: 'notes', label: 'Observações', type: 'textarea' },
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

  function normalizeQualificationPct(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n > 1) return Math.min(100, Math.round(n));
    return Math.min(100, Math.round(n * 100));
  }

  function labelFromMap(map, value, fallback) {
    const key = String(value || '').trim().toUpperCase();
    if (!key) return fallback || '—';
    return map[key] || map[value] || fallback || value;
  }

  function normalizeBooleanField(value) {
    if (value === true || value === false) return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return null;
  }

  function normalizeCanonicalOption(value, canonicalList, legacyMap) {
    if (value == null || value === '') return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (canonicalList && canonicalList.includes(raw)) return raw;
    const upper = raw.toUpperCase();
    if (legacyMap && legacyMap[upper]) return legacyMap[upper];
    if (legacyMap && legacyMap[raw]) return legacyMap[raw];
    if (canonicalList) {
      const ci = canonicalList.find((item) => item.toLowerCase() === raw.toLowerCase());
      if (ci) return ci;
    }
    return raw;
  }

  function normalizeRoofType(value) {
    return normalizeCanonicalOption(value, ROOF_TYPE_CANONICAL, ROOF_TYPE_LEGACY);
  }

  function normalizePaymentMethod(value) {
    return normalizeCanonicalOption(value, PAYMENT_METHOD_CANONICAL, PAYMENT_METHOD_LEGACY);
  }

  function normalizeInstallationTimeframe(value) {
    if (value == null || value === '') return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if (INSTALLATION_DEADLINE_LEGACY[upper]) return INSTALLATION_DEADLINE_LEGACY[upper];
    if (INSTALLATION_DEADLINE_LEGACY[raw]) return INSTALLATION_DEADLINE_LEGACY[raw];
    return raw;
  }

  function qualificationFieldDisplayLabel(key, value) {
    if (value == null || value === '') return '—';
    if (key === 'roofType') return normalizeRoofType(value) || String(value);
    if (key === 'paymentMethod') return normalizePaymentMethod(value) || String(value);
    if (key === 'installationDeadline') return normalizeInstallationTimeframe(value) || String(value);
    if (key === 'decisionMaker') {
      return labelFromMap(DECISION_MAKER_LABELS, value, String(value));
    }
    return String(value);
  }

  function normalizeCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const qual = raw.qualification || raw.solarQualification || {};
    const city = raw.city || raw.cityName || raw.contactCity || qual.city || null;
    const consumption = raw.averageConsumptionKwh
      ?? raw.avgConsumptionKwh
      ?? raw.consumptionKwh
      ?? raw.monthlyConsumptionKwh
      ?? qual.averageConsumptionKwh
      ?? qual.avgConsumptionKwh
      ?? null;
    const paymentMethod = normalizePaymentMethod(raw.paymentMethod || qual.paymentMethod || null);
    const paymentLabel = paymentMethod || null;
    const deadline = normalizeInstallationTimeframe(
      raw.installationTimeframe ?? raw.installationDeadline ?? qual.installationTimeframe ?? qual.installationDeadline,
    );
    const qualificationPct = normalizeQualificationPct(
      raw.qualificationCompletion
      ?? raw.qualificationCompleteness
      ?? raw.qualificationPct
      ?? raw.completeness
      ?? raw.solarQualificationCompleteness
      ?? qual.completeness
      ?? qual.completion?.completion
      ?? qual.qualificationPct,
    );
    return {
      id: String(raw.id || '').trim(),
      conversationId: String(raw.conversationId || '').trim(),
      contactId: String(raw.contactId || '').trim(),
      name: String(raw.name || 'Contato').trim(),
      phone: String(raw.phone || '').trim(),
      city: city != null ? String(city).trim() : null,
      avgConsumptionKwh: consumption != null ? Number(consumption) : null,
      paymentMethod,
      paymentMethodLabel: paymentLabel,
      installationDeadline: deadline,
      installationDeadlineLabel: deadline || null,
      qualificationPct,
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
      status: normalizeApiStatus(raw.status || raw.kanbanColumn || 'NEW'),
      kanbanColumn: resolveKanbanColumn(raw),
      source: raw.source || null,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  }

  function ensureColumnOrder(columns) {
    const byKey = {};
    (Array.isArray(columns) ? columns : []).forEach((col) => {
      const key = normalizeKanbanColumnKey(col.key);
      if (!key) return;
      const cards = (Array.isArray(col.cards) ? col.cards : []).map(normalizeCard).filter(Boolean);
      if (byKey[key]) {
        byKey[key].cards = sortCardsByPriority([...(byKey[key].cards || []), ...cards]);
        byKey[key].total = Number(byKey[key].total || 0) + Number(col.total || cards.length);
      } else {
        byKey[key] = {
          key,
          label: String(col.label || LEAD_STATUS_COLUMNS[key]?.label || key).trim(),
          total: Number(col.total || cards.length),
          cards: sortCardsByPriority(cards),
        };
      }
    });
    return COLUMN_ORDER.map((key) => {
      const col = byKey[key];
      if (col) {
        return {
          key,
          label: String(col.label || LEAD_STATUS_COLUMNS[key]?.label || key).trim(),
          total: Number(col.total || 0),
          cards: sortCardsByPriority(
            (Array.isArray(col.cards) ? col.cards : []).map(normalizeCard).filter(Boolean),
          ),
        };
      }
      return {
        key,
        label: LEAD_STATUS_COLUMNS[key]?.label || key,
        total: 0,
        cards: [],
      };
    });
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
      columns: ensureColumnOrder(columns),
    };
  }

  function normalizeSummary(raw) {
    return {
      tenantId: raw?.tenantId || null,
      activeLeads: Number(raw?.activeLeads || 0),
      unassigned: Number(raw?.unassigned || 0),
      inQualification: Number(raw?.inQualification ?? raw?.qualification ?? 0),
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

  function moveCardInMockKanban(leadId, body) {
    if (!mockCache?.kanban?.columns) return null;
    const status = normalizeApiStatus(body?.status);
    const targetColumn = resolveKanbanColumn({ status, kanbanColumn: body?.kanbanColumn });
    let movedCard = null;
    mockCache.kanban.columns.forEach((col) => {
      const before = Array.isArray(col.cards) ? col.cards.length : 0;
      col.cards = (col.cards || []).filter((c) => {
        if (String(c.id) === String(leadId)) {
          movedCard = {
            ...c,
            status,
            kanbanColumn: targetColumn,
            nextContactAt: body?.nextContactAt ?? c.nextContactAt,
          };
          return false;
        }
        return true;
      });
      if (before !== (col.cards || []).length && col.total > 0) col.total -= 1;
    });
    if (!movedCard) return null;
    const dest = mockCache.kanban.columns.find((c) => c.key === targetColumn);
    if (dest) {
      dest.cards = dest.cards || [];
      dest.cards.unshift(movedCard);
      dest.total = Number(dest.total || 0) + 1;
    }
    return movedCard;
  }

  function mergeStatusPatchIntoKanban(kanban, updatedCard) {
    if (!kanban?.columns || !updatedCard?.id) return kanban;
    const targetKey = updatedCard.kanbanColumn || resolveKanbanColumn(updatedCard);
    const columns = kanban.columns.map((col) => {
      const had = (col.cards || []).some((c) => c.id === updatedCard.id);
      const cards = (col.cards || []).filter((c) => c.id !== updatedCard.id);
      let total = Number(col.total || 0);
      if (had && col.key !== targetKey && total > 0) total -= 1;
      return { ...col, cards, total };
    });
    const dest = columns.find((c) => c.key === targetKey);
    if (dest) {
      dest.cards = sortCardsByPriority([updatedCard, ...(dest.cards || []).filter((c) => c.id !== updatedCard.id)]);
      if (!(kanban.columns.find((c) => c.key === targetKey)?.cards || []).some((c) => c.id === updatedCard.id)) {
        dest.total = Number(dest.total || 0) + 1;
      }
    }
    return { ...kanban, columns };
  }

  async function patchLeadStatus(session, leadId, body) {
    const enc = encodeURIComponent(leadId);
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      const moved = moveCardInMockKanban(leadId, body || {});
      return normalizeCard(moved || {
        id: leadId,
        status: body?.status,
        kanbanColumn: resolveKanbanColumn({ status: body?.status }),
        nextContactAt: body?.nextContactAt,
      });
    }
    const raw = await callApi(session, `/${enc}/status`, null, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    });
    return normalizeCard(raw?.lead || raw);
  }

  function applyAssignInMockKanban(leadId, salesConsultantId, agentName) {
    if (!mockCache?.kanban?.columns) return null;
    let updated = null;
    mockCache.kanban.columns.forEach((col) => {
      (col.cards || []).forEach((c) => {
        if (String(c.id) === String(leadId)) {
          c.assignedSalesConsultantId = salesConsultantId || null;
          c.assignedAgentName = agentName || null;
          if (salesConsultantId && String(c.status || '').toUpperCase() === 'NEW') {
            c.status = 'ASSIGNED';
            c.kanbanColumn = 'QUALIFICATION';
          }
          updated = { ...c };
        }
      });
    });
    return updated;
  }

  async function patchLeadAssign(session, leadId, body) {
    const enc = encodeURIComponent(leadId);
    const consultantId = body?.salesConsultantId ?? body?.assignedSalesConsultantId ?? null;
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      let agentName = null;
      if (consultantId) {
        const agents = await getAgents(session);
        agentName = agents.find((a) => a.salesConsultantId === consultantId)?.displayName || 'Consultor';
      }
      const raw = applyAssignInMockKanban(leadId, consultantId, agentName);
      return normalizeCard(raw || {
        id: leadId,
        assignedSalesConsultantId: consultantId,
        assignedAgentName: agentName,
        status: consultantId ? 'ASSIGNED' : 'NEW',
        kanbanColumn: consultantId ? 'QUALIFICATION' : 'NEW',
      });
    }
    const raw = await callApi(session, `/${enc}/assign`, null, {
      method: 'PATCH',
      body: JSON.stringify({ salesConsultantId: consultantId }),
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
    ).trim().toLowerCase();
    if (status === 401) return { message: 'Sessão expirada. Faça login novamente.', redirectLogin: true };
    if (status === 403) return { message: 'Sem permissão para operar o Pipeline.' };
    if (status === 400 && code === 'contact_not_resolved') {
      return {
        message: 'Esta conversa não tem contato no Contact Hub. Importe/sincronize o contato para criar o lead.',
        code,
      };
    }
    if (status === 404 && code === 'conversation_not_found') {
      return { message: 'Conversa não encontrada para este tenant.', code };
    }
    if (status === 409 && code === 'lead_opted_out') {
      return { message: 'Contato em opt-out — não é possível abrir nova oportunidade.', code };
    }
    if (code === 'invalid_lead_status') {
      return { message: 'Status inválido para esta coluna. Atualize a página e tente novamente.', code };
    }
    if (code === 'lead_sales_consultant_required') {
      return { message: 'Atribua um vendedor responsável antes de mover para Em Atendimento.', code };
    }
    if (status === 404) {
      return {
        message: 'API Pipeline indisponível. Confirme deploy do operator-service (proxy /engage/leads) e do api-engage.',
        code: 'route_not_found',
      };
    }
    if (code === 'qualification_not_persisted') {
      const missing = Array.isArray(err?.missingFields) ? err.missingFields : [];
      const labels = qualificationMissingLabels(missing).join(', ');
      return {
        message: labels
          ? `O api-engage não gravou: ${labels}. Abra o Network — se todos os PATCH retornaram 200 e o GET continua vazio, é bug no PATCH /engage/leads/:id/qualification (NeuraFlow).`
          : 'O servidor respondeu OK, mas a qualificação não foi gravada. Confirme deploy do api-engage.',
        code,
        missingFields: missing,
      };
    }
    return { message: err?.message || 'Não foi possível concluir a operação.', code };
  }

  function leadColumnLabel(lead) {
    if (!lead) return '';
    const col = statusToKanbanColumn(lead.kanbanColumn || lead.status);
    const def = LEAD_STATUS_COLUMNS[col];
    return def?.label || String(col).replace(/_/g, ' ');
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

  function formatConsumptionKwh(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${n.toLocaleString('pt-BR')} kWh`;
  }

  function formatQualificationLabel(pct) {
    const n = normalizeQualificationPct(pct);
    if (n == null) return null;
    return `${n}%`;
  }

  function normalizeQualificationPayload(raw) {
    raw = unwrapApiPayload(raw);
    if (!raw || typeof raw !== 'object') {
      return { completeness: null, fields: {}, suggestions: [] };
    }

    let apiData = null;
    let completeness = null;
    let suggestions = [];

    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      apiData = raw.data;
      completeness = raw.completion?.completion ?? raw.completion?.completeness ?? null;
      suggestions = Array.isArray(raw.suggestions) ? raw.suggestions : [];
    } else {
      const root = (raw.qualification && typeof raw.qualification === 'object')
        ? raw.qualification
        : ((raw.solarQualification && typeof raw.solarQualification === 'object')
          ? raw.solarQualification
          : raw);
      if (root.fields && typeof root.fields === 'object' && !Array.isArray(root.fields)) {
        apiData = mapFieldsToApiData(root.fields);
        Object.assign(apiData, root.fields);
      } else if (root.data && typeof root.data === 'object') {
        apiData = root.data;
        completeness = root.completion?.completion ?? root.completion?.completeness ?? null;
      } else {
        apiData = root;
      }
      suggestions = Array.isArray(root.suggestions)
        ? root.suggestions
        : (Array.isArray(raw.suggestions) ? raw.suggestions : []);
      completeness = completeness
        ?? root.completeness
        ?? root.qualificationCompleteness
        ?? root.qualificationPct;
    }

    return {
      leadId: raw.leadId || null,
      conversationId: raw.conversationId || null,
      contactId: raw.contactId || null,
      completeness: normalizeQualificationPct(completeness),
      fields: mapApiDataToFields(apiData),
      completionMeta: raw.completion || null,
      suggestions: suggestions.map((s) => {
        const apiField = s.field || s.key || '';
        return {
          field: mapApiFieldKeyToFront(apiField),
          label: s.label || s.fieldLabel || apiField || '',
          value: s.value,
          displayValue: s.displayValue || s.valueLabel || null,
          confidence: s.confidence != null ? Number(s.confidence) : null,
          status: s.status || 'PENDING',
        };
      }).filter((s) => s.field),
    };
  }

  const QUALIFICATION_API_FIELD_MAP = {
    avgConsumptionKwh: 'averageConsumptionKwh',
    plansToIncreaseConsumption: 'wantsIncreaseConsumption',
    hasHighConsumptionEquipment: 'hasEquipment',
    equipmentDescription: 'equipmentDescription',
    isFirstQuote: 'firstQuote',
    installationDeadline: 'installationTimeframe',
    technicalVisitAt: 'technicalVisitDate',
    roofType: 'roofType',
    decisionMaker: 'decisionMaker',
    paymentMethod: 'paymentMethod',
    specialist: 'specialist',
    notes: 'notes',
  };

  function isQualificationEnvelope(raw) {
    return !!(raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object'
      && (raw.leadId || raw.completion));
  }

  function mapApiFieldKeyToFront(apiKey) {
    const key = String(apiKey || '').trim();
    const hit = Object.entries(QUALIFICATION_API_FIELD_MAP).find(([, api]) => api === key);
    return hit ? hit[0] : key;
  }

  function mapApiDataToFields(apiData) {
    const d = apiData && typeof apiData === 'object' ? apiData : {};
    return {
      avgConsumptionKwh: d.averageConsumptionKwh ?? d.avgConsumptionKwh ?? d.consumptionKwh ?? null,
      roofType: normalizeRoofType(d.roofType),
      plansToIncreaseConsumption: normalizeBooleanField(
        d.wantsIncreaseConsumption ?? d.plansToIncreaseConsumption,
      ),
      hasHighConsumptionEquipment: normalizeBooleanField(
        d.hasEquipment ?? d.hasHighConsumptionEquipment,
      ),
      equipmentDescription: d.equipmentDescription || null,
      isFirstQuote: normalizeBooleanField(d.firstQuote ?? d.isFirstQuote),
      installationDeadline: normalizeInstallationTimeframe(
        d.installationTimeframe ?? d.installationDeadline,
      ),
      decisionMaker: d.decisionMaker ? String(d.decisionMaker).trim().toUpperCase() : null,
      paymentMethod: normalizePaymentMethod(d.paymentMethod),
      technicalVisitAt: d.technicalVisitDate ?? d.technicalVisitAt ?? null,
      specialist: d.specialist || null,
      notes: d.notes || null,
      city: d.city ?? null,
    };
  }

  function mapFieldsToApiData(fields) {
    const f = fields && typeof fields === 'object' ? fields : {};
    const out = {};
    if (f.avgConsumptionKwh != null && f.avgConsumptionKwh !== '') {
      const n = Number(f.avgConsumptionKwh);
      if (Number.isFinite(n)) out.averageConsumptionKwh = n;
    }
    if (f.roofType) out.roofType = normalizeRoofType(f.roofType) || String(f.roofType);
    if (typeof f.plansToIncreaseConsumption === 'boolean') {
      out.wantsIncreaseConsumption = f.plansToIncreaseConsumption;
    }
    if (typeof f.hasHighConsumptionEquipment === 'boolean') {
      out.hasEquipment = f.hasHighConsumptionEquipment;
    }
    if (f.equipmentDescription != null && String(f.equipmentDescription).trim()) {
      out.equipmentDescription = String(f.equipmentDescription).trim();
    }
    if (typeof f.isFirstQuote === 'boolean') {
      out.firstQuote = f.isFirstQuote;
    }
    if (f.installationDeadline) {
      out.installationTimeframe = normalizeInstallationTimeframe(f.installationDeadline)
        || String(f.installationDeadline).trim();
    }
    if (f.decisionMaker) out.decisionMaker = String(f.decisionMaker).trim().toUpperCase();
    if (f.paymentMethod) {
      out.paymentMethod = normalizePaymentMethod(f.paymentMethod) || String(f.paymentMethod);
    }
    if (f.technicalVisitAt) out.technicalVisitDate = f.technicalVisitAt;
    if (f.specialist != null && String(f.specialist).trim()) {
      out.specialist = String(f.specialist).trim();
    }
    if (f.notes) out.notes = String(f.notes);
    return out;
  }

  function buildQualificationRequestBody(fields) {
    return { data: mapFieldsToApiData(fields) };
  }

  function unwrapApiPayload(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    if (isQualificationEnvelope(raw)) return raw;
    if (raw.result && typeof raw.result === 'object') return raw.result;
    return raw;
  }

  function buildQualificationPatchBody(body) {
    const fields = (body && typeof body === 'object' && body.fields && typeof body.fields === 'object')
      ? body.fields
      : (body || {});
    return { fields };
  }

  function sanitizeQualificationFields(fields) {
    const out = {};
    Object.entries(fields || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;
      if (key === 'avgConsumptionKwh') {
        const n = Number(value);
        if (Number.isFinite(n)) out[key] = n;
        return;
      }
      if (typeof value === 'boolean') {
        out[key] = value;
        return;
      }
      out[key] = value;
    });
    return out;
  }

  function qualificationFieldsHaveData(fields) {
    if (!fields || typeof fields !== 'object') return false;
    return Object.values(fields).some((value) => value !== null && value !== undefined && value !== '');
  }

  function qualificationFieldsOverlap(saved, submitted) {
    return qualificationMissingFields(saved, submitted).length === 0;
  }

  function qualificationMissingFields(saved, submitted) {
    if (!qualificationFieldsHaveData(submitted)) return [];
    if (!saved || typeof saved !== 'object') {
      return Object.keys(submitted);
    }
    return Object.keys(submitted).filter((key) => {
      const a = submitted[key];
      const b = saved[key];
      if (typeof a === 'boolean') return a !== b;
      if (typeof a === 'number') {
        const bn = Number(b);
        return !Number.isFinite(bn) || Math.abs(a - bn) >= 0.001;
      }
      return String(a ?? '') !== String(b ?? '');
    });
  }

  function qualificationMissingLabels(missingKeys) {
    return (missingKeys || []).map((key) => {
      const def = QUALIFICATION_FIELD_DEFS.find((item) => item.key === key);
      return def?.label || key;
    });
  }

  async function readExistingQualificationApiData(session, leadId) {
    const enc = encodeURIComponent(leadId);
    try {
      const raw = await callApi(session, `/${enc}/qualification`, null, { method: 'GET' });
      if (raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
        return { ...raw.data };
      }
    } catch (_) {
      /* ignore */
    }
    return {};
  }

  function mergeQualificationFromCard(card, qualification) {
    const base = qualification && typeof qualification === 'object'
      ? qualification
      : { completeness: null, fields: {}, suggestions: [] };
    if (!card) return base;
    const mergedFields = {
      ...base.fields,
      avgConsumptionKwh: base.fields?.avgConsumptionKwh ?? card.avgConsumptionKwh ?? null,
      paymentMethod: base.fields?.paymentMethod ?? card.paymentMethod ?? null,
      installationDeadline: base.fields?.installationDeadline ?? card.installationDeadline ?? null,
      city: base.fields?.city ?? card.city ?? null,
    };
    return {
      ...base,
      completeness: base.completeness ?? card.qualificationPct ?? null,
      fields: mergedFields,
    };
  }

  const MOCK_QUAL_STORAGE_KEY = 'engageSolarMockQualifications';

  function readMockQualStore() {
    try {
      return JSON.parse(window.sessionStorage.getItem(MOCK_QUAL_STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function writeMockQualEntry(leadId, payload) {
    try {
      const store = readMockQualStore();
      store[String(leadId)] = payload;
      window.sessionStorage.setItem(MOCK_QUAL_STORAGE_KEY, JSON.stringify(store));
    } catch (_) {
      /* ignore quota errors */
    }
  }

  function readMockQualEntry(leadId) {
    const hit = readMockQualStore()[String(leadId)];
    return hit ? normalizeQualificationPayload(hit) : null;
  }

  async function patchLead(session, leadId, body) {
    const enc = encodeURIComponent(leadId);
    const raw = await callApi(session, `/${enc}`, null, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    });
    return { lead: normalizeCard(raw?.lead || raw) };
  }

  async function requestQualificationPatch(session, leadId, payload) {
    const enc = encodeURIComponent(leadId);
    const raw = await callApi(session, `/${enc}/qualification`, null, {
      method: 'PATCH',
      body: JSON.stringify(payload || {}),
    });
    return normalizeQualificationPayload(raw);
  }

  async function resolveLeadQualification(session, leadId) {
    try {
      return await getLeadQualification(session, leadId);
    } catch (err) {
      const status = Number(err?.statusCode || err?.status || 0);
      if (status !== 404) throw err;
      return { completeness: null, fields: {}, suggestions: [] };
    }
  }

  async function getLead(session, leadId) {
    const enc = encodeURIComponent(leadId);
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      const mock = await loadMockBundle();
      const allCards = (mock.kanban?.columns || []).flatMap((col) => col.cards || []);
      const card = allCards.find((c) => String(c.id) === String(leadId));
      if (!card) throw new Error('Lead não encontrado no mock.');
      return { lead: normalizeCard(card) };
    }
    const raw = await callApi(session, `/${enc}`, null, { method: 'GET' });
    return { lead: normalizeCard(raw?.lead || raw) };
  }

  async function getLeadQualification(session, leadId) {
    const enc = encodeURIComponent(leadId);
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      const cached = readMockQualEntry(leadId);
      if (cached) return cached;
      const mock = await loadMockBundle();
      const qual = mock.qualifications?.[leadId];
      if (!qual) {
        const allCards = (mock.kanban?.columns || []).flatMap((col) => col.cards || []);
        const card = allCards.find((c) => String(c.id) === String(leadId));
        return normalizeQualificationPayload({
          leadId,
          completeness: card?.qualificationPct ?? card?.qualificationCompleteness ?? 0.35,
          fields: {
            avgConsumptionKwh: card?.avgConsumptionKwh,
            paymentMethod: card?.paymentMethod,
            installationDeadline: card?.installationDeadline,
          },
          suggestions: mock.defaultSuggestions || [],
        });
      }
      return normalizeQualificationPayload(qual);
    }
    const raw = await callApi(session, `/${enc}/qualification`, null, { method: 'GET' });
    const parsed = normalizeQualificationPayload(raw);
    if (qualificationFieldsHaveData(parsed.fields)) {
      return parsed;
    }
    const detail = await getLead(session, leadId);
    return mergeQualificationFromCard(detail?.lead, parsed);
  }

  async function verifyQualificationPersisted(session, leadId, sanitized, lastResponse) {
    let verified = normalizeQualificationPayload(lastResponse);
    if (!qualificationFieldsOverlap(verified?.fields, sanitized)) {
      verified = await resolveLeadQualification(session, leadId);
    }
    const missing = qualificationMissingFields(verified?.fields, sanitized);
    return { verified, missing };
  }

  async function patchLeadQualification(session, leadId, body) {
    const sanitized = sanitizeQualificationFields(buildQualificationPatchBody(body).fields);
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      const existing = await getLeadQualification(session, leadId);
      const mergedFields = {
        ...(existing?.fields || {}),
        ...sanitized,
      };
      const payload = normalizeQualificationPayload({
        leadId,
        completion: { completion: Math.min(100, Object.values(mergedFields).filter((v) => v != null && v !== '').length * 10) },
        data: mapFieldsToApiData(mergedFields),
        suggestions: existing?.suggestions || [],
      });
      writeMockQualEntry(leadId, payload);
      return payload;
    }

    const existingApiData = await readExistingQualificationApiData(session, leadId);
    const deltaApiData = mapFieldsToApiData(sanitized);
    const mergedApiData = { ...existingApiData, ...deltaApiData };

    /* api-engage pode ignorar `data` no PATCH e só ler campos na raiz — tentar vários formatos. */
    const payloadVariants = [
      deltaApiData,
      { data: deltaApiData },
      mergedApiData,
      { data: mergedApiData },
    ].filter((payload) => payload && typeof payload === 'object' && Object.keys(payload).length > 0);

    let lastResponse = null;
    let lastMissing = Object.keys(sanitized);

    for (const payload of payloadVariants) {
      try {
        lastResponse = await requestQualificationPatch(session, leadId, payload);
      } catch (err) {
        const status = Number(err?.statusCode || err?.status || 0);
        if (status !== 400) throw err;
        continue;
      }
      const { verified, missing } = await verifyQualificationPersisted(
        session,
        leadId,
        sanitized,
        lastResponse,
      );
      if (missing.length === 0) return verified;
      lastMissing = missing;
    }

    const failErr = new Error('Qualificação não persistida pelo servidor.');
    failErr.code = 'qualification_not_persisted';
    failErr.statusCode = 502;
    failErr.missingFields = lastMissing;
    throw failErr;
  }

  async function acceptQualificationSuggestion(session, leadId, fieldKey, body = {}) {
    const enc = encodeURIComponent(leadId);
    const apiField = QUALIFICATION_API_FIELD_MAP[fieldKey] || fieldKey;
    const fk = encodeURIComponent(apiField);
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      return getLeadQualification(session, leadId);
    }
    const raw = await callApi(session, `/${enc}/qualification/suggestions/${fk}/accept`, null, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
    return normalizeQualificationPayload(raw);
  }

  async function dismissQualificationSuggestion(session, leadId, fieldKey) {
    const enc = encodeURIComponent(leadId);
    const apiField = QUALIFICATION_API_FIELD_MAP[fieldKey] || fieldKey;
    const fk = encodeURIComponent(apiField);
    if (window.ENGAGE_PIPELINE_USE_MOCK === true) {
      return getLeadQualification(session, leadId);
    }
    const raw = await callApi(session, `/${enc}/qualification/suggestions/${fk}/dismiss`, null, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return normalizeQualificationPayload(raw);
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

  function getMessagingApiBase() {
    return `${window.RESERVAAI_MESSAGING_API_BASE_URL || '/api/messaging'}`.replace(/\/$/, '');
  }

  function getSessionBearer(session) {
    const auth = window.ReservaAiAuthService || window.AuthService;
    return auth?.getAccessToken?.() || session?.externalAccessToken || '';
  }

  function phoneDigitsOnly(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function isGroupConversation(raw) {
    const phone = String(raw?.phone || '').toLowerCase();
    return phone.startsWith('lid:') || phone.includes('@g.us') || raw?.isGroup === true;
  }

  function conversationTitle(raw) {
    return String(
      raw?.contactProfileName
      || raw?.contactName
      || raw?.name
      || raw?.title
      || '',
    ).trim() || formatPhoneDisplay(raw?.phone) || 'Contato';
  }

  function conversationLastPreview(raw) {
    const messages = Array.isArray(raw?.messages) ? raw.messages : [];
    const last = messages.length ? messages[messages.length - 1] : null;
    const content = last?.content ?? raw?.lastMessage ?? raw?.preview ?? '';
    const text = String(content || '').trim();
    return text || 'Sem mensagens recentes';
  }

  function normalizeConversationPickerRow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || raw.conversationId || '').trim();
    if (!id) return null;
    const phone = String(raw.phone || raw.contactPhone || '').trim();
    return {
      id,
      title: conversationTitle(raw),
      phone,
      phoneDigits: phoneDigitsOnly(phone),
      phoneDisplay: formatPhoneDisplay(phone),
      lastMessagePreview: conversationLastPreview(raw),
      isGroup: isGroupConversation(raw),
    };
  }

  async function fetchMessagingConversations(session) {
    const tenantId = getDefaultTenantId(session);
    if (!tenantId) throw new Error('Empresa (tenant) não identificada na sessão.');
    const token = getSessionBearer(session);
    if (!token) throw new Error('Sessão expirada. Faça login novamente.');

    const url = `${getMessagingApiBase()}/conversations?tenantId=${encodeURIComponent(tenantId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'same-origin',
      cache: 'no-store',
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (response.status === 401) {
      const err = new Error('Sessão expirada. Faça login novamente.');
      err.statusCode = 401;
      throw err;
    }
    if (!response.ok) {
      const err = new Error('Não foi possível carregar conversas do WhatsApp.');
      err.statusCode = response.status;
      throw err;
    }

    const list = Array.isArray(payload) ? payload : (payload?.items || payload?.conversations || []);
    return list
      .map(normalizeConversationPickerRow)
      .filter((row) => row && !row.isGroup);
  }

  function filterConversationsForLeadPicker(conversations, query, limit = 25) {
    const q = String(query || '').trim().toLowerCase();
    const digits = phoneDigitsOnly(q);
    const filtered = (conversations || []).filter((row) => {
      if (!q) return true;
      if (row.title.toLowerCase().includes(q)) return true;
      if (row.phoneDisplay.toLowerCase().includes(q)) return true;
      if (row.lastMessagePreview.toLowerCase().includes(q)) return true;
      if (digits.length >= 3 && row.phoneDigits.includes(digits)) return true;
      return false;
    });
    return filtered.slice(0, limit);
  }

  window.EngagePipelineApi = {
    LEAD_STATUS_COLUMNS,
    COLUMN_ORDER,
    LEAD_TEMPERATURE,
    COMMERCIAL_PRIORITY,
    LEAD_GRADE,
    REPLY_INTENT_LABELS,
    KPI_DEFS,
    QUALIFICATION_FIELD_DEFS,
    ROOF_TYPE_LABELS,
    ROOF_TYPE_CANONICAL,
    PAYMENT_METHOD_LABELS,
    PAYMENT_METHOD_CANONICAL,
    INSTALLATION_DEADLINE_LABELS,
    DECISION_MAKER_LABELS,
    normalizeRoofType,
    normalizePaymentMethod,
    normalizeInstallationTimeframe,
    qualificationFieldDisplayLabel,
    getDefaultTenantId,
    getSummary,
    getKanban,
    getAgents,
    getLead,
    getLeadQualification,
    patchLead,
    patchLeadQualification,
    mergeQualificationFromCard,
    sanitizeQualificationFields,
    acceptQualificationSuggestion,
    dismissQualificationSuggestion,
    getLeadIntelligence,
    patchLeadStatus,
    patchLeadAssign,
    mergeStatusPatchIntoKanban,
    resolveKanbanColumn,
    columnKeyToApiStatus,
    createLead,
    fetchMessagingConversations,
    filterConversationsForLeadPicker,
    mapApiError,
    leadColumnLabel,
    formatPhoneDisplay,
    formatConsumptionKwh,
    formatQualificationLabel,
    normalizeQualificationPct,
    labelFromMap,
    normalizeQualificationPayload,
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
