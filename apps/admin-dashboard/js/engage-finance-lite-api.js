/**
 * Engage Solar — Financeiro Lite (multi-segmento).
 * BFF: /api/operator/finance/* → NeuraFlow /finance/*
 * @see HANDOFF-FINANCE-LITE-MULTI-SEGMENTO.md
 */
(function () {
  const adminApi = () => window.EngageSolarApi || window.ReservaAiApi;

  const PAYABLE_STATUS_LABELS = {
    PENDING: 'Pendente',
    PAID: 'Pago',
    OVERDUE: 'Vencido',
    CANCELLED: 'Cancelado',
  };

  const PAYABLE_STATUS_TONES = {
    PENDING: 'amber',
    PAID: 'green',
    OVERDUE: 'red',
    CANCELLED: 'slate',
  };

  const FREQUENCY_LABELS = {
    MONTHLY: 'Mensal',
    YEARLY: 'Anual',
    ONE_TIME: 'Avulsa',
  };

  const SUMMARY_CARDS = [
    { key: 'totalDue', label: 'Total a vencer', tone: 'blue', icon: 'calendar' },
    { key: 'totalOverdue', label: 'Total vencido', tone: 'red', icon: 'alert', highlight: true },
    { key: 'totalPaidMonth', label: 'Total pago mês', tone: 'green', icon: 'check' },
    { key: 'next30Days', label: 'Próximos 30 dias', tone: 'purple', icon: 'clock' },
    { key: 'monthlyRecurringCost', label: 'Custo mensal recorrente', tone: 'teal', icon: 'repeat' },
  ];

  const FORBIDDEN_MSG = 'Você não tem permissão para acessar o Financeiro. Peça acesso a um administrador da empresa.';

  let mockCache = null;
  let mockPayables = null;
  let mockRecurring = null;
  let mockCategories = null;

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
      session?.activeTenantId || session?.tenantId || session?.tenant?.id || session?.tenant?.tenantId || '',
    ).trim();
    if (direct) return direct;
    const claims = readExternalTokenClaims(session?.externalAccessToken);
    const fromJwt = String(claims?.tenantId || claims?.tenant_id || '').trim();
    if (fromJwt) return fromJwt;
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const first = tenants.find((t) => t && (t.id || t.tenantId));
    return String(first?.id || first?.tenantId || '').trim();
  }

  function buildQuery(session, extra) {
    const tenantId = getDefaultTenantId(session);
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    Object.entries(extra || {}).forEach(([k, v]) => {
      if (v != null && v !== '') params.set(k, String(v));
    });
    const q = params.toString();
    return q ? `?${q}` : '';
  }

  function financePath(suffix, session, extraQuery) {
    return `/api/operator/finance${suffix}${buildQuery(session, extraQuery)}`;
  }

  function useMockForced() {
    return window.ENGAGE_FINANCE_LITE_USE_MOCK === true;
  }

  async function loadMock() {
    if (mockCache) return mockCache;
    const res = await fetch('./data/mock-finance-lite.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Mock Financeiro indisponível.');
    mockCache = await res.json();
    mockPayables = JSON.parse(JSON.stringify(mockCache.payables?.items || []));
    mockRecurring = JSON.parse(JSON.stringify(mockCache.recurring?.items || []));
    mockCategories = JSON.parse(JSON.stringify(mockCache.categories || []));
    return mockCache;
  }

  function mapForbidden(err) {
    const status = Number(err?.statusCode || err?.status || 0);
    if (status === 403) {
      const e = new Error(FORBIDDEN_MSG);
      e.statusCode = 403;
      e.financeForbidden = true;
      throw e;
    }
    throw err;
  }

  async function apiRequest(path, options = {}) {
    const api = adminApi();
    if (!api?.request) throw new Error('Cliente API indisponível.');
    try {
      return await api.request(path, { cache: 'no-store', ...options });
    } catch (err) {
      mapForbidden(err);
    }
    return null;
  }

  function formatBRL(amount) {
    const raw = String(amount ?? '0').trim().replace(',', '.');
    const num = Number(raw);
    if (!Number.isFinite(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const s = String(iso).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return s;
    return `${d}/${m}/${y}`;
  }

  function toApiAmount(input) {
    const raw = String(input ?? '').trim().replace(/\./g, '').replace(',', '.');
    if (!raw || !Number.isFinite(Number(raw))) return null;
    return Number(raw).toFixed(2);
  }

  function filterMockPayables(query) {
    let items = [...(mockPayables || [])];
    if (query.status) {
      const statuses = String(query.status).split(',').map((s) => s.trim().toUpperCase());
      items = items.filter((p) => statuses.includes(p.status));
    }
    if (query.categoryId) {
      items = items.filter((p) => p.categoryId === query.categoryId);
    }
    if (query.search) {
      const q = String(query.search).toLowerCase();
      items = items.filter((p) =>
        [p.description, p.supplier, p.costCenter].some((v) => String(v || '').toLowerCase().includes(q)),
      );
    }
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 50);
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page, pageSize, total, mock: true };
  }

  async function getDashboardSummary(session, month) {
    if (useMockForced()) {
      const mock = await loadMock();
      return { ...mock.summary, mock: true };
    }
    try {
      return await apiRequest(financePath('/dashboard/summary', session, month ? { month } : {}), { session });
    } catch (err) {
      if (Number(err?.statusCode || 0) === 404) {
        const mock = await loadMock();
        return { ...mock.summary, mock: true };
      }
      throw err;
    }
  }

  async function getUpcoming(session, days, limit) {
    if (useMockForced()) {
      const mock = await loadMock();
      return { ...mock.upcoming, mock: true };
    }
    try {
      return await apiRequest(financePath('/dashboard/upcoming', session, { days: days || 30, limit: limit || 10 }), { session });
    } catch (err) {
      if (Number(err?.statusCode || 0) === 404) {
        const mock = await loadMock();
        return { ...mock.upcoming, mock: true };
      }
      throw err;
    }
  }

  async function getCategoryBreakdown(session, from, to, basis) {
    if (useMockForced()) {
      const mock = await loadMock();
      return { ...mock.categoryBreakdown, mock: true };
    }
    try {
      return await apiRequest(financePath('/dashboard/categories', session, { from, to, basis: basis || 'due' }), { session });
    } catch (err) {
      if (Number(err?.statusCode || 0) === 404) {
        const mock = await loadMock();
        return { ...mock.categoryBreakdown, mock: true };
      }
      throw err;
    }
  }

  async function listPayables(session, query) {
    if (useMockForced()) {
      await loadMock();
      return filterMockPayables(query || {});
    }
    try {
      return await apiRequest(financePath('/payables', session, query), { session });
    } catch (err) {
      if (Number(err?.statusCode || 0) === 404) {
        await loadMock();
        return filterMockPayables(query || {});
      }
      throw err;
    }
  }

  async function createPayable(session, body) {
    if (useMockForced() || mockPayables) {
      await loadMock();
      const id = `pay-mock-${Date.now()}`;
      const cat = mockCategories.find((c) => c.id === body.categoryId);
      const item = { id, ...body, category: cat || null, status: 'PENDING', paidAt: null, recurringRuleId: null, recurrenceKey: null };
      mockPayables.unshift(item);
      return item;
    }
    return apiRequest(financePath('/payables', session), { method: 'POST', session, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  }

  async function updatePayable(session, id, body) {
    if (useMockForced() || mockPayables) {
      await loadMock();
      const idx = mockPayables.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error('Conta não encontrada.');
      const cat = mockCategories.find((c) => c.id === body.categoryId);
      mockPayables[idx] = { ...mockPayables[idx], ...body, category: cat || mockPayables[idx].category };
      return mockPayables[idx];
    }
    return apiRequest(financePath(`/payables/${encodeURIComponent(id)}`, session), { method: 'PUT', session, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  }

  async function patchPayableStatus(session, id, status) {
    if (useMockForced() || mockPayables) {
      await loadMock();
      const idx = mockPayables.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error('Conta não encontrada.');
      mockPayables[idx].status = status;
      mockPayables[idx].paidAt = status === 'PAID' ? new Date().toISOString() : null;
      return mockPayables[idx];
    }
    return apiRequest(financePath(`/payables/${encodeURIComponent(id)}/status`, session), { method: 'PATCH', session, body: JSON.stringify({ status }), headers: { 'Content-Type': 'application/json' } });
  }

  async function listRecurring(session, query) {
    if (useMockForced()) {
      const mock = await loadMock();
      return { items: mockRecurring || mock.recurring?.items || [], mock: true };
    }
    try {
      return await apiRequest(financePath('/recurring', session, query), { session });
    } catch (err) {
      if (Number(err?.statusCode || 0) === 404) {
        const mock = await loadMock();
        return { items: mock.recurring?.items || [], mock: true };
      }
      throw err;
    }
  }

  async function createRecurring(session, body) {
    if (useMockForced() || mockRecurring) {
      await loadMock();
      const id = `rec-mock-${Date.now()}`;
      const cat = mockCategories.find((c) => c.id === body.categoryId);
      const item = { id, ...body, category: cat || null, active: true, nextGenerationDate: body.startDate };
      mockRecurring.unshift(item);
      return item;
    }
    return apiRequest(financePath('/recurring', session), { method: 'POST', session, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  }

  async function updateRecurring(session, id, body) {
    if (useMockForced() || mockRecurring) {
      await loadMock();
      const idx = mockRecurring.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error('Recorrência não encontrada.');
      const cat = mockCategories.find((c) => c.id === body.categoryId);
      mockRecurring[idx] = { ...mockRecurring[idx], ...body, category: cat || mockRecurring[idx].category };
      return mockRecurring[idx];
    }
    return apiRequest(financePath(`/recurring/${encodeURIComponent(id)}`, session), { method: 'PUT', session, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  }

  async function deleteRecurring(session, id) {
    if (useMockForced() || mockRecurring) {
      await loadMock();
      const idx = mockRecurring.findIndex((r) => r.id === id);
      if (idx >= 0) mockRecurring[idx].active = false;
      return { ok: true };
    }
    return apiRequest(financePath(`/recurring/${encodeURIComponent(id)}`, session), { method: 'DELETE', session });
  }

  async function listCategories(session, includeInactive) {
    if (useMockForced()) {
      const mock = await loadMock();
      const items = (mockCategories || mock.categories || []).filter((c) => includeInactive || c.active !== false);
      return { items, mock: true };
    }
    try {
      return await apiRequest(financePath('/categories', session, { includeInactive: includeInactive ? 'true' : 'false' }), { session });
    } catch (err) {
      if (Number(err?.statusCode || 0) === 404) {
        const mock = await loadMock();
        return { items: mock.categories || [], mock: true };
      }
      throw err;
    }
  }

  async function createCategory(session, body) {
    if (useMockForced() || mockCategories) {
      await loadMock();
      const id = `cat-mock-${Date.now()}`;
      const item = { id, name: body.name, color: body.color || '#64748b', active: body.active !== false };
      mockCategories.push(item);
      return item;
    }
    return apiRequest(financePath('/categories', session), { method: 'POST', session, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  }

  async function updateCategory(session, id, body) {
    if (useMockForced() || mockCategories) {
      await loadMock();
      const idx = mockCategories.findIndex((c) => c.id === id);
      if (idx < 0) throw new Error('Categoria não encontrada.');
      mockCategories[idx] = { ...mockCategories[idx], ...body };
      return mockCategories[idx];
    }
    return apiRequest(financePath(`/categories/${encodeURIComponent(id)}`, session), { method: 'PUT', session, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  }

  async function deleteCategory(session, id) {
    if (useMockForced() || mockCategories) {
      await loadMock();
      const idx = mockCategories.findIndex((c) => c.id === id);
      if (idx >= 0) mockCategories[idx].active = false;
      return { ok: true };
    }
    return apiRequest(financePath(`/categories/${encodeURIComponent(id)}`, session), { method: 'DELETE', session });
  }

  function panelToView(panelId) {
    const map = {
      'financeiro-dashboard': 'dashboard',
      'financeiro-contas-pagar': 'payables',
      'financeiro-recorrencias': 'recurring',
      'financeiro-categorias': 'categories',
    };
    return map[panelId] || 'dashboard';
  }

  function viewTitle(view) {
    const map = {
      dashboard: 'Dashboard',
      payables: 'Contas a Pagar',
      recurring: 'Recorrências',
      categories: 'Categorias',
    };
    return map[view] || 'Financeiro';
  }

  window.EngageFinanceLiteApi = {
    PAYABLE_STATUS_LABELS,
    PAYABLE_STATUS_TONES,
    FREQUENCY_LABELS,
    SUMMARY_CARDS,
    FORBIDDEN_MSG,
    formatBRL,
    formatDate,
    toApiAmount,
    panelToView,
    viewTitle,
    getDashboardSummary,
    getUpcoming,
    getCategoryBreakdown,
    listPayables,
    createPayable,
    updatePayable,
    patchPayableStatus,
    listRecurring,
    createRecurring,
    updateRecurring,
    deleteRecurring,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  };
})();
