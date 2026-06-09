/**
 * Módulo do painel "Plano e Uso" — visualização do plano/assinatura,
 * consumo do período, alertas e histórico de faturamento.
 *
 * Endpoints (NeuraFlow via /api/operator):
 *   - GET /billing/status?tenantId&historyWindow
 *   - GET /billing/history?tenantId&limit
 *   - GET /billing/usage-metering/ai-tokens?tenantId&from&to | windowDays
 *   - Estrutura do tenant (paralelo, mesmo tenantId — handoff billing):
 *     GET /branches, GET /professionals?active=true, GET /connectors/whatsapp-api/channels, GET /agents
 *
 * Checkout assinatura (tenant admin):
 *   - POST /billing/subscription/checkout?tenantId
 *   - POST /billing/subscription/request-payment?tenantId
 *
 * Spec: HANDOFF-RESERVAAI-FRONT-BILLING-VISUALIZACAO.md
 */
(function () {
  const authService = window.ReservaAiAuth;
  const adminApi = window.ReservaAiApi;

  const HISTORY_WINDOWS = new Set(['30d', '90d', '1y', 'all']);
  const HISTORY_STORAGE_KEY = 'reservaai.planoUso.historyWindow';

  const state = {
    mounted: false,
    active: false,
    session: null,
    loading: false,
    historyWindow: '30d',
    status: null,
    history: null,
    /** Contagens agregadas fora do payload de billing (filiais, profissionais, WhatsApp, bots). */
    tenantSnapshot: {
      unitsCount: 0,
      professionalsCount: 0,
      whatsappCount: 0,
      agentsCount: 0,
    },
    tenantSnapshotTenantId: '',
    tenantSnapshotReady: false,
    /** Resposta normalizada de metering de tokens IA (ou null). */
    aiTokens: null,
    checkoutLoading: false,
    checkoutPrefs: {
      recurringCollectionMode: 'manual_link',
      paymentMethodPreference: 'card',
      payerEmail: '',
    },
    lastPaymentUrl: '',
    statusPollTimer: null,
    statusPollStartedAt: 0,
    invoicesRequestToken: 0,
    statusRequestToken: 0,
    dom: {},
  };

  const GAUGE_RADIUS = 52;
  const GAUGE_CIRC = 2 * Math.PI * GAUGE_RADIUS;
  const MP_RECURRING_PLAN_CODES = new Set(['growth', 'pro', 'scale', 'teste', 'test']);
  const STATUS_POLL_MS = 4500;
  const STATUS_POLL_MAX_MS = 5 * 60 * 1000;
  const MP_RECURRING_DISABLED_TITLE = 'O plano Start não inclui débito automático no cartão. Use link manual ou fale com o suporte.';

  const PLAN_CATALOG_UI = [
    {
      code: 'start',
      name: 'Plano Start',
      price: 99,
      badge: null,
      features: ['5.000 mensagens/mês', '200 agendamentos/mês', '1 unidade', 'Suporte por e-mail'],
    },
    {
      code: 'pro',
      name: 'Plano Pro',
      price: 199,
      badge: 'Mais escolhido',
      features: ['10.000 mensagens/mês', '500 agendamentos/mês', '3 unidades', 'WhatsApp + IA', 'Suporte prioritário'],
    },
    {
      code: 'growth',
      name: 'Plano Growth',
      price: 399,
      badge: null,
      features: ['Mensagens ilimitadas', 'Agendamentos ilimitados', 'Unidades ilimitadas', 'Automações avançadas', 'Gerente dedicado'],
    },
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function getDefaultTenantId(session) {
    if (window.ReservaPermissions?.resolveEffectiveTenantId) {
      return window.ReservaPermissions.resolveEffectiveTenantId(session);
    }
    const direct = String(
      session?.tenantId
      || session?.activeTenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || ''
    ).trim();
    if (direct) return direct;
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const first = tenants.find((t) => t && (t.id || t.tenantId));
    return String(first?.id || first?.tenantId || '').trim();
  }

  function isPlatformAdminSession(session) {
    const permissionGroup = String(session?.permissionGroup || '').trim().toLowerCase();
    const platformRole = String(session?.platformRole || '').trim().toUpperCase();
    return permissionGroup === 'platform_admin' || platformRole === 'PLATFORM_ADMIN';
  }

  function unwrapPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if ('data' in payload && payload.data !== undefined) return payload.data;
    return payload;
  }

  function extractArrayPayload(payload) {
    const p = unwrapPayload(payload);
    if (Array.isArray(p)) return p;
    if (payload && typeof payload === 'object' && Array.isArray(payload.items)) return payload.items;
    return [];
  }

  function countActiveBranches(rows) {
    if (!Array.isArray(rows)) return 0;
    return rows.filter((b) => {
      if (!b || typeof b !== 'object') return false;
      const id = b.id || b.branchId;
      if (!id) return false;
      if (typeof b.active === 'boolean' && b.active === false) return false;
      if (typeof b.isActive === 'boolean' && b.isActive === false) return false;
      const st = String(b.status || b.state || '').toLowerCase();
      if (st === 'inactive' || st === 'disabled' || st === 'archived') return false;
      return true;
    }).length;
  }

  function countProfessionalsRows(rows) {
    if (!Array.isArray(rows)) return 0;
    return rows.filter((p) => p && (p.id || p.professionalId)).length;
  }

  async function fetchTenantSnapshot(session, tenantId) {
    const empty = {
      unitsCount: 0,
      professionalsCount: 0,
      whatsappCount: 0,
      agentsCount: 0,
    };
    if (!tenantId) return empty;

    const safeGet = async (path) => {
      try {
        return await apiGet(path);
      } catch (_) {
        return null;
      }
    };

    let branchesPath = '/api/operator/branches';
    if (isPlatformAdminSession(session) && tenantId) {
      branchesPath = `/api/operator/branches?tenantId=${encodeURIComponent(tenantId)}`;
    }

    const profQs = new URLSearchParams({
      tenantId,
      active: 'true',
      includeBranches: 'false',
    });
    const tenantOnly = `tenantId=${encodeURIComponent(tenantId)}`;

    const [branchesRaw, profRaw, chRaw, agRaw] = await Promise.all([
      safeGet(branchesPath),
      safeGet(`/api/operator/professionals?${profQs.toString()}`),
      safeGet(`/api/operator/connectors/whatsapp-api/channels?${tenantOnly}`),
      safeGet(`/api/operator/agents?${tenantOnly}`),
    ]);

    return {
      unitsCount: countActiveBranches(extractArrayPayload(branchesRaw)),
      professionalsCount: countProfessionalsRows(extractArrayPayload(profRaw)),
      whatsappCount: extractArrayPayload(chRaw).length,
      agentsCount: extractArrayPayload(agRaw).length,
    };
  }

  function formatBRL(value, currency = 'BRL') {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 'R$ 0,00';
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(amount);
    } catch (_) {
      return `R$ ${amount.toFixed(2).replace('.', ',')}`;
    }
  }

  function fromMinor(amountMinor, currency = 'BRL') {
    const minor = Number(amountMinor);
    if (!Number.isFinite(minor)) return formatBRL(0, currency);
    return formatBRL(minor / 100, currency);
  }

  function formatDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
  }

  function formatDateLong(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(parsed);
  }

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
  }

  /**
   * Percentual utilizado [0..100]. Retorna null quando o limite não é positivo
   * (plano sem limite). 100% atinge o teto e ainda dispara alerta de upgrade.
   */
  function usagePercent(used, limit) {
    const u = Number(used || 0);
    const l = Number(limit || 0);
    if (!Number.isFinite(l) || l <= 0) return null;
    return clamp01((u / l) * 100);
  }

  function diffDays(toIso, fromIso = null) {
    if (!toIso) return null;
    const to = new Date(toIso).getTime();
    if (Number.isNaN(to)) return null;
    const from = fromIso ? new Date(fromIso).getTime() : Date.now();
    if (Number.isNaN(from)) return null;
    return Math.max(0, Math.ceil((to - from) / 86400000));
  }

  const SUB_STATUS_LABELS = {
    active: { label: 'Ativo', tone: 'success' },
    trialing: { label: 'Em trial', tone: 'info' },
    incomplete: { label: 'Pagamento pendente', tone: 'warn' },
    past_due: { label: 'Vencido', tone: 'danger' },
    canceled: { label: 'Cancelado', tone: 'neutral' },
    paused: { label: 'Pausado', tone: 'warn' },
    unpaid: { label: 'Vencido', tone: 'danger' },
    trial: { label: 'Em trial', tone: 'info' },
    overdue: { label: 'Vencido', tone: 'danger' },
    blocked: { label: 'Bloqueado', tone: 'danger' },
  };

  function mapStatus(status) {
    const key = String(status || '').toLowerCase().trim();
    return SUB_STATUS_LABELS[key] || { label: status ? String(status) : '—', tone: 'neutral' };
  }

  const INVOICE_STATUS_LABELS = {
    paid: { label: 'Pago', tone: 'success' },
    pending: { label: 'Pendente', tone: 'warn' },
    overdue: { label: 'Vencido', tone: 'danger' },
    failed: { label: 'Falhou', tone: 'danger' },
    refunded: { label: 'Estornado', tone: 'neutral' },
    open: { label: 'Em aberto', tone: 'warn' },
    void: { label: 'Cancelado', tone: 'neutral' },
  };

  function mapInvoiceStatus(item) {
    const key = String(item?.statusCode || item?.status || '').toLowerCase().trim();
    return (
      INVOICE_STATUS_LABELS[key]
      || { label: item?.status || item?.statusCode || '—', tone: 'neutral' }
    );
  }

  const FEATURE_LABELS = {
    'ai.generate': 'Geração IA',
    'ai.tokens': 'Tokens IA',
    'whatsapp.messaging': 'WhatsApp',
    'scheduling.appointments': 'Agendamentos',
    'scheduling.professionals': 'Profissionais',
    'scheduling.basic': 'Agenda básica',
    'tenant.units': 'Unidades',
    'customers.basic': 'Clientes',
    'finance.basic': 'Financeiro',
    'inbox.assistant': 'Inbox',
    'reports.analytics': 'Relatórios',
    'team.management': 'Equipe',
    'integrations.api': 'Integrações',
  };

  function featureLabel(key) {
    if (!key) return '';
    const known = FEATURE_LABELS[key];
    if (known) return known;
    const tail = String(key).split('.').pop() || String(key);
    return tail.charAt(0).toUpperCase() + tail.slice(1);
  }

  function bucketTone(percent) {
    if (percent === null) return 'muted';
    if (percent >= 90) return 'danger';
    if (percent >= 70) return 'warn';
    return 'success';
  }

  function setHistoryWindowFromStorage() {
    try {
      const stored = window.localStorage?.getItem(HISTORY_STORAGE_KEY);
      if (stored && HISTORY_WINDOWS.has(stored)) {
        state.historyWindow = stored;
      }
    } catch (_) {
      // localStorage indisponível em alguns navegadores/sandbox; ignorar.
    }
  }

  function persistHistoryWindow() {
    try {
      window.localStorage?.setItem(HISTORY_STORAGE_KEY, state.historyWindow);
    } catch (_) {
      // ignorar
    }
  }

  function setFeedback(kind, message) {
    const el = state.dom.feedback;
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.removeAttribute('data-tone');
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.dataset.tone = kind;
    el.textContent = message;
  }

  function setLoading(loading) {
    state.loading = loading;
    if (state.dom.skeleton) {
      state.dom.skeleton.hidden = !loading;
    }
    if (state.dom.content) {
      // Mantém o conteúdo visível em re-fetch para evitar flicker total.
      if (loading && !state.status) {
        state.dom.content.hidden = true;
      } else if (!loading) {
        state.dom.content.hidden = false;
      }
    }
  }

  async function apiGet(path) {
    if (!adminApi || typeof adminApi.request !== 'function') {
      throw new Error('Cliente de API indisponível no admin.');
    }
    return adminApi.request(path, { method: 'GET' });
  }

  async function fetchStatus(tenantId, windowKey) {
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    if (windowKey) params.set('historyWindow', windowKey);
    return apiGet(`/api/operator/billing/status?${params.toString()}`);
  }

  async function fetchHistory(tenantId, limit = 12) {
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    if (limit) params.set('limit', String(limit));
    return apiGet(`/api/operator/billing/history?${params.toString()}`);
  }

  async function apiPost(path, body) {
    if (!adminApi || typeof adminApi.request !== 'function') {
      throw new Error('Cliente de API indisponível no admin.');
    }
    return adminApi.request(path, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  }

  function getTenantDisplayName(session) {
    const tenantId = getDefaultTenantId(session);
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const match = tenants.find((t) => String(t?.id || t?.tenantId || '') === tenantId);
    const name = match?.name || match?.tenantName || match?.displayName
      || session?.tenant?.name || session?.tenantName || '';
    return String(name || 'Sua empresa').trim();
  }

  function getSessionEmail(session) {
    return String(
      session?.email || session?.user?.email || session?.profile?.email || '',
    ).trim();
  }

  function getPendingPayment(status) {
    const commercial = status?.commercialSubscription;
    return status?.pendingPayment || commercial?.pendingPayment || null;
  }

  function getPlanCode(status) {
    const commercial = status?.commercialSubscription;
    const plan = commercial?.plan || status?.plan || null;
    return String(plan?.code || '').trim().toLowerCase();
  }

  function planAllowsMpRecurring(status) {
    const commercial = status?.commercialSubscription;
    const plan = commercial?.plan || status?.plan || {};
    const code = String(plan?.code || '').toLowerCase();
    const policy = plan?.checkoutMetadata?.billingPolicy
      || plan?.billingPolicy
      || commercial?.billingPolicy;
    const allowed = policy?.recurringCollectionModesAllowed;
    if (Array.isArray(allowed)) {
      return allowed.includes('mp_card_recurring');
    }
    if (MP_RECURRING_PLAN_CODES.has(code)) return true;
    if (code.startsWith('test-') || code.startsWith('test_')) return true;
    return false;
  }

  function billingCycleLabel(cycle) {
    const c = String(cycle || 'monthly').toLowerCase();
    if (c === 'yearly' || c === 'annual') return 'Anual';
    return 'Mensal';
  }

  function healthPillFromScore(score) {
    if (!Number.isFinite(score)) return { label: '—', tone: 'neutral' };
    if (score >= 72) return { label: 'Uso saudável', tone: 'success' };
    if (score >= 45) return { label: 'Atenção', tone: 'warn' };
    return { label: 'Upgrade recomendado', tone: 'danger' };
  }

  function combinedUsagePercent(status) {
    const usage = status?.usage || {};
    const commercial = status?.commercialSubscription;
    const limits = commercial?.catalogUsageLimits || {};
    const msgPct = usagePercent(usage.messagesUsed, usage.messageLimit ?? limits.messageLimit);
    const aptPct = usagePercent(usage.appointmentsUsed, usage.appointmentLimit ?? limits.appointmentLimit);
    const vals = [msgPct, aptPct].filter((p) => p !== null);
    if (!vals.length) return null;
    return Math.round(Math.max(...vals));
  }

  function resolvePaymentAction(status) {
    const commercial = status?.commercialSubscription;
    const subStatus = String(commercial?.status || status?.status || '').toLowerCase();
    const pending = getPendingPayment(status);
    const storedUrl = String(state.lastPaymentUrl || '').trim();
    const pendingUrl = pending?.paymentUrl ? String(pending.paymentUrl) : '';
    const paymentUrl = pendingUrl || storedUrl;

    if (subStatus === 'active') {
      return { type: 'hidden', label: '' };
    }
    if (paymentUrl) {
      return { type: 'open_url', label: 'Abrir pagamento', url: paymentUrl };
    }
    if (subStatus === 'incomplete') {
      return { type: 'checkout', label: 'Continuar pagamento' };
    }
    if (subStatus === 'trialing') {
      return { type: 'checkout', label: 'Pagar assinatura' };
    }
    if (['past_due', 'unpaid', 'paused'].includes(subStatus)) {
      return { type: 'checkout', label: 'Regularizar pagamento' };
    }
    return { type: 'checkout', label: 'Assinar e pagar agora' };
  }

  function shouldShowPaymentBlock(status) {
    const action = resolvePaymentAction(status);
    if (action.type !== 'hidden') return true;
    const sub = String(status?.commercialSubscription?.status || status?.status || '').toLowerCase();
    return sub.includes('trial') || sub === 'incomplete';
  }

  function syncCheckoutPrefsFromStatus(status) {
    const email = getSessionEmail(state.session);
    if (email && !state.checkoutPrefs.payerEmail) {
      state.checkoutPrefs.payerEmail = email;
    }
    const commercial = status?.commercialSubscription;
    const pm = commercial?.paymentMethod || status?.paymentMethod;
    if (pm?.last4) {
      state.checkoutPrefs._cardLast4 = pm.last4;
      state.checkoutPrefs._cardBrand = pm.brand || pm.label;
    }
    const env = commercial?.environment || status?.environment;
    state.checkoutPrefs._environment = env || 'production';
  }

  function recurrenceLabels(mode) {
    if (mode === 'mp_card_recurring') {
      return {
        title: 'Cartão automático',
        hint: 'Cobrança mensal no Mercado Pago (assinatura)',
      };
    }
    return {
      title: 'Link manual',
      hint: 'Checkout por link a cada ciclo (PIX, boleto ou cartão)',
    };
  }

  function methodLabels(pref) {
    if (pref === 'pix') return { title: 'PIX', hint: 'Pagamento via PIX no checkout' };
    if (pref === 'boleto') return { title: 'Boleto', hint: 'Boleto bancário no checkout' };
    return { title: 'Cartão de crédito', hint: 'Preferência no checkout Mercado Pago' };
  }

  function setGaugePercent(pct) {
    const fill = state.dom.gaugeFill;
    const ring = state.dom.gaugeRing;
    const label = state.dom.gaugePct;
    if (!fill || !label) return;
    const p = pct === null ? 0 : clamp01(pct);
    const offset = GAUGE_CIRC * (1 - p / 100);
    fill.style.strokeDasharray = `${GAUGE_CIRC}`;
    fill.style.strokeDashoffset = String(offset);
    label.textContent = pct === null ? '—' : `${Math.round(p)}%`;
    const tone = bucketTone(pct);
    if (ring) ring.dataset.tone = tone;
  }

  function ensureModalPortaled() {
    const modal = state.dom.paymentModal;
    if (!modal || modal.dataset.portaled === '1') return;
    document.body.appendChild(modal);
    modal.dataset.portaled = '1';
  }

  function stopStatusPoll() {
    if (state.statusPollTimer) {
      window.clearInterval(state.statusPollTimer);
      state.statusPollTimer = null;
    }
    state.statusPollStartedAt = 0;
  }

  function startStatusPoll() {
    stopStatusPoll();
    state.statusPollStartedAt = Date.now();
    state.statusPollTimer = window.setInterval(() => {
      if (!state.active || state.dom.paymentModal?.hidden) {
        stopStatusPoll();
        return;
      }
      if (Date.now() - state.statusPollStartedAt > STATUS_POLL_MAX_MS) {
        stopStatusPoll();
        return;
      }
      void loadStatus({ silent: true }).then(() => {
        const sub = String(
          state.status?.commercialSubscription?.status || state.status?.status || '',
        ).toLowerCase();
        if (sub === 'active') {
          stopStatusPoll();
          state.lastPaymentUrl = '';
          renderPaymentModal(state.status);
          setFeedback('success', 'Pagamento confirmado. Sua assinatura está ativa.');
        } else {
          renderPaymentCta(state.status);
        }
      });
    }, STATUS_POLL_MS);
  }

  function normalizePlanCatalogCode(code) {
    const c = String(code || '').toLowerCase().trim();
    if (c === 'basic') return 'start';
    if (c === 'scale') return 'growth';
    return c;
  }

  function buildCheckoutBody() {
    const prefs = state.checkoutPrefs;
    const body = {
      planCode: getPlanCode(state.status),
      paymentMethodPreference: prefs.paymentMethodPreference,
      recurringCollectionMode: prefs.recurringCollectionMode,
      environment: prefs._environment === 'sandbox' ? 'sandbox' : 'production',
    };
    const email = String(prefs.payerEmail || '').trim();
    if (email) body.payerEmail = email;
    if (prefs.recurringCollectionMode === 'mp_card_recurring') {
      if (!email) throw new Error('Informe o e-mail da conta Mercado Pago.');
      body.paymentMethodPreference = 'card';
    }
    return body;
  }

  function openPaymentModal() {
    const modal = state.dom.paymentModal;
    if (!modal) return;
    ensureModalPortaled();
    modal.hidden = false;
    document.body.classList.add('plano-uso-modal-open');
    renderPaymentModal(state.status);
    void loadStatus({ silent: true }).then(() => {
      if (!modal.hidden) renderPaymentModal(state.status);
    });
  }

  function closePaymentModal() {
    const modal = state.dom.paymentModal;
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('plano-uso-modal-open');
    stopStatusPoll();
    if (state.dom.checkoutError) {
      state.dom.checkoutError.hidden = true;
      state.dom.checkoutError.textContent = '';
    }
  }

  function onPaymentModalKeydown(event) {
    if (event.key !== 'Escape') return;
    const modal = state.dom.paymentModal;
    if (!modal || modal.hidden) return;
    event.preventDefault();
    closePaymentModal();
  }

  function openExternalPayment(url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function parseCheckoutError(error) {
    const raw = String(error?.message || error?.body || error || '');
    const code = raw.match(/recurring_collection_mode_not_allowed[^\s]*/)?.[0]
      || raw.match(/mp_card_recurring_requires_payer_email/)?.[0]
      || raw.match(/subscription_already_active/)?.[0]
      || raw.match(/mp_preapproval_failed:[^\s]*/)?.[0];
    const map = {
      'recurring_collection_mode_not_allowed:mp_card_recurring': 'Este plano não suporta débito automático no Mercado Pago.',
      mp_card_recurring_requires_payer_email: 'Informe o e-mail da conta Mercado Pago que autorizará o cartão.',
      mp_card_recurring_requires_card: 'Débito automático aceita apenas cartão.',
      subscription_already_active: 'Assinatura já está ativa. Atualizando status…',
    };
    if (code && map[code]) return map[code];
    if (code?.startsWith('mp_preapproval_failed')) {
      return `Mercado Pago recusou a assinatura: ${code.split(':').slice(1).join(':') || 'verifique conta e valor mínimo.'}`;
    }
    return handleApiError(error);
  }

  async function runSubscriptionCheckout() {
    const tenantId = getDefaultTenantId(state.session);
    if (!tenantId) throw new Error('Tenant não selecionado.');
    if (!getPlanCode(state.status)) throw new Error('Plano comercial não identificado.');
    const qs = new URLSearchParams({ tenantId });
    return apiPost(`/api/operator/billing/subscription/checkout?${qs.toString()}`, buildCheckoutBody());
  }

  async function runSubscriptionRequestPayment() {
    const tenantId = getDefaultTenantId(state.session);
    if (!tenantId) throw new Error('Tenant não selecionado.');
    const qs = new URLSearchParams({ tenantId });
    return apiPost(`/api/operator/billing/subscription/request-payment?${qs.toString()}`, buildCheckoutBody());
  }

  async function executePaymentFlow() {
    const status = state.status;
    const action = resolvePaymentAction(status);
    if (action.type === 'open_url') {
      openExternalPayment(action.url);
      startStatusPoll();
      return;
    }
    if (action.type === 'hidden') return;

    state.checkoutLoading = true;
    renderPaymentCta(status);
    try {
      const subStatus = String(
        status?.commercialSubscription?.status || status?.status || '',
      ).toLowerCase();
      const runner = subStatus === 'trialing'
        ? runSubscriptionRequestPayment
        : runSubscriptionCheckout;
      const res = unwrapPayload(await runner());
      const url = res?.paymentUrl || res?.subscription?.paymentUrl || res?.pendingPayment?.paymentUrl;
      if (url) {
        state.lastPaymentUrl = String(url);
        openExternalPayment(url);
        setFeedback('info', 'Checkout aberto no Mercado Pago. Confirmaremos o status automaticamente após o pagamento.');
        renderPaymentCta(state.status);
        startStatusPoll();
        return;
      }
      if (String(res?.subscription?.status || '').toLowerCase() === 'trialing') {
        setFeedback('success', 'Trial ativado. Você pode pagar a assinatura quando o período de teste terminar.');
        await loadStatus({ silent: true });
        renderPaymentModal(state.status);
        return;
      }
      setFeedback('info', 'Solicitação enviada. Atualizando status…');
      await loadStatus({ silent: true });
      renderPaymentModal(state.status);
    } catch (error) {
      const msg = parseCheckoutError(error);
      if (state.dom.checkoutError) {
        state.dom.checkoutError.hidden = false;
        state.dom.checkoutError.textContent = msg;
      }
      setFeedback('danger', msg);
    } finally {
      state.checkoutLoading = false;
      renderPaymentCta(state.status);
    }
  }

  function formatCompactTokens(n) {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return '0';
    if (x < 1000) return String(Math.round(x));
    if (x < 1e6) return `${Math.round(x / 1000)} k`;
    return `${(x / 1e6).toFixed(1).replace('.', ',')} M`;
  }

  function collectFeatureKeys(status) {
    const commercial = status?.commercialSubscription;
    const keys = Array.isArray(commercial?.featureKeys) && commercial.featureKeys.length
      ? commercial.featureKeys
      : (Array.isArray(status?.activeFeatures) ? status.activeFeatures : []);
    return keys.map((k) => String(k || '').trim()).filter(Boolean);
  }

  function limitHintForFeatureKey(key, limits, usage) {
    const l = limits || {};
    const u = usage || {};
    if (key === 'scheduling.appointments') {
      const lim = u.appointmentLimit ?? l.appointmentLimit;
      if (Number.isFinite(Number(lim)) && Number(lim) > 0) return `limite ${Number(lim)}`;
    }
    if (key === 'whatsapp.messaging') {
      const lim = u.messageLimit ?? l.messageLimit;
      if (Number.isFinite(Number(lim)) && Number(lim) > 0) return `limite ${Number(lim)}`;
    }
    if (key === 'tenant.units') {
      const lim = u.unitsLimit ?? l.unitsLimit;
      if (Number.isFinite(Number(lim)) && Number(lim) > 0) return `limite ${Number(lim)}`;
    }
    if (key === 'scheduling.professionals') {
      const lim = u.professionalsLimit ?? l.professionalsSeatLimit;
      if (Number.isFinite(Number(lim)) && Number(lim) > 0) return `limite ${Number(lim)}`;
    }
    return '';
  }

  function parseAiTokensPayload(raw) {
    const p = unwrapPayload(raw);
    if (!p || typeof p !== 'object') return null;

    let total = Number(
      p.totalTokens ?? p.total ?? p.sum ?? p.tokenCount ?? p.tokens ?? p.amount ?? 0,
    );

    const rows = [];
    const pushRow = (key, tok) => {
      const k = String(key || '').trim();
      const n = Number(tok);
      if (!k || !Number.isFinite(n) || n < 0) return;
      rows.push({ key: k, tokens: n });
    };

    const mergeObject = (obj) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      for (const [k, v] of Object.entries(obj)) {
        if (v != null && typeof v === 'object' && !Array.isArray(v)) {
          const inner = v.tokens ?? v.total ?? v.value ?? v.count;
          if (inner !== undefined) pushRow(k, inner);
        } else {
          pushRow(k, v);
        }
      }
    };

    const scanArray = (list) => {
      if (!Array.isArray(list)) return;
      for (const row of list) {
        if (!row || typeof row !== 'object') continue;
        const key = row.featureKey || row.key || row.metricKey || row.label || row.name || row.id
          || row.field || '';
        const tok = row.tokens ?? row.value ?? row.count ?? row.total ?? row.amount ?? row.usage;
        if (key) pushRow(key, tok);
        else if (row.byFeature) mergeObject(row.byFeature);
        else mergeObject(row);
      }
    };

    const listSources = [
      p.byFeature,
      p.breakdown,
      p.features,
      p.items,
      p.rows,
      p.series,
      p.details,
      p.perFeature,
    ];
    for (const src of listSources) scanArray(src);

    if (p.byFeature && typeof p.byFeature === 'object' && !Array.isArray(p.byFeature)) mergeObject(p.byFeature);
    if (p.perFeature && typeof p.perFeature === 'object' && !Array.isArray(p.perFeature)) mergeObject(p.perFeature);

    if (Array.isArray(p.dayAggregations)) {
      for (const day of p.dayAggregations) {
        if (day?.byFeature) mergeObject(day.byFeature);
        scanArray(day?.items);
      }
    }

    if (p.details && typeof p.details === 'object' && !Array.isArray(p.details)) {
      mergeObject(p.details);
    }

    const merged = new Map();
    for (const r of rows) {
      merged.set(r.key, (merged.get(r.key) || 0) + r.tokens);
    }
    const combined = [...merged.entries()]
      .map(([key, tokens]) => ({ key, tokens }))
      .sort((a, b) => b.tokens - a.tokens);

    if (!Number.isFinite(total) || total <= 0) {
      total = combined.reduce((s, r) => s + r.tokens, 0);
    }

    return {
      total: Number.isFinite(total) ? total : 0,
      rows: combined.slice(0, 16),
      from: p.from || p.fromUtc || p.periodStart,
      to: p.to || p.toUtc || p.periodEnd,
    };
  }

  async function fetchAiTokens(tenantId, status) {
    if (!tenantId) return null;
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    const u = status?.usage || {};
    if (u.usagePeriodStartUtc && u.usagePeriodEndUtc) {
      params.set('from', String(u.usagePeriodStartUtc));
      params.set('to', String(u.usagePeriodEndUtc));
    } else {
      params.set('windowDays', '30');
    }
    try {
      const raw = await apiGet(`/api/operator/billing/usage-metering/ai-tokens?${params.toString()}`);
      return parseAiTokensPayload(raw);
    } catch (_) {
      return null;
    }
  }

  function computeHealthScore(status, snap) {
    const usage = status?.usage || {};
    const commercial = status?.commercialSubscription;
    const limits = commercial?.catalogUsageLimits || {};
    const sub = String(commercial?.status || status?.status || '').toLowerCase();

    const pcts = [];
    const pushDim = (used, limit) => {
      const p = usagePercent(used, limit);
      if (p !== null) pcts.push(p);
    };

    pushDim(usage.messagesUsed, usage.messageLimit ?? limits.messageLimit);
    pushDim(usage.appointmentsUsed, usage.appointmentLimit ?? limits.appointmentLimit);
    pushDim(
      (snap && snap.professionalsCount) || usage.professionalsUsed,
      limits.professionalsSeatLimit ?? usage.professionalsLimit,
    );
    pushDim(
      (snap && snap.unitsCount) || usage.unitsUsed,
      limits.unitsLimit ?? usage.unitsLimit,
    );

    let score = 100;
    if (pcts.length) {
      const maxPct = Math.max(...pcts);
      const avgPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      score -= maxPct * 0.35;
      score -= avgPct * 0.25;
    }

    if (sub.includes('canceled') || sub.includes('cancelled')) score -= 28;
    else if (sub.includes('past_due') || sub.includes('overdue') || sub.includes('unpaid')) score -= 18;
    else if (sub.includes('paused') || sub.includes('inactive')) score -= 12;
    else if (!(sub.includes('active') || sub.includes('trialing') || sub.includes('trial'))) score -= 8;

    if (sub.includes('trial') || sub.includes('trialing')) {
      const rem = diffDays(commercial?.trialEnd || status?.trialEndsAt);
      if (rem !== null && rem <= 3) score -= 6;
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  function healthScoreTone(score) {
    if (!Number.isFinite(score)) return 'neutral';
    if (score >= 72) return 'success';
    if (score >= 45) return 'warn';
    return 'danger';
  }

  const FEATURE_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 12 3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderTokensCard() {
    const tok = state.aiTokens;
    const elTotal = state.dom.tokensTotal;
    const elBreak = state.dom.tokensBreakdown;
    const elMeta = state.dom.tokensMeta;
    if (!elTotal) return;
    const u = state.status?.usage || {};
    const periodLine = () => {
      const a = u.usagePeriodStartUtc ? formatDate(u.usagePeriodStartUtc) : '';
      const b = u.usagePeriodEndUtc ? formatDate(u.usagePeriodEndUtc) : '';
      return a && b ? `${a} a ${b}` : '';
    };

    if (!tok || (!tok.total && !(tok.rows && tok.rows.length))) {
      elTotal.textContent = '—';
      if (elBreak) {
        elBreak.innerHTML = '<span class="plano-uso-muted">Sem dados de tokens neste período ou metering indisponível.</span>';
      }
      if (elMeta) {
        const pl = periodLine();
        elMeta.textContent = pl
          ? `Referência (UTC): ${pl}. Agregações diárias (métrica tokens, features ia.*).`
          : 'Quando o billing enviar o período de uso, alinhamos a janela ao mesmo intervalo; senão usamos windowDays=30.';
      }
      return;
    }

    elTotal.textContent = `${formatCompactTokens(tok.total)} tokens`;
    if (elBreak) {
      elBreak.innerHTML = (tok.rows && tok.rows.length)
        ? tok.rows.slice(0, 8).map((r) => `
          <div class="plano-uso-tokens-row">
            <code class="plano-uso-tokens-key">${escapeHtml(r.key)}</code>
            <span class="plano-uso-tokens-val">${escapeHtml(formatCompactTokens(r.tokens))}</span>
          </div>
        `).join('')
        : '<span class="plano-uso-muted">Sem quebra por feature nesta resposta.</span>';
    }
    if (elMeta) {
      const a = tok.from || u.usagePeriodStartUtc;
      const b = tok.to || u.usagePeriodEndUtc;
      const da = a ? formatDate(a) : '';
      const db = b ? formatDate(b) : '';
      const win = da && db ? `${da} a ${db}` : periodLine();
      elMeta.textContent = win
        ? `Soma das agregações diárias (métrica tokens / featureKey ia.*) — ${win} (UTC). Plataforma — IA (metering).`
        : 'Soma das agregações diárias de tokens por feature de IA. Plataforma — IA (metering).';
    }
  }

  function renderHealthCard() {
    const scoreEl = state.dom.healthScore;
    const hintEl = state.dom.healthHint;
    if (!scoreEl) return;
    const snap = state.tenantSnapshot || {};
    const score = state.status ? computeHealthScore(state.status, snap) : NaN;
    if (!Number.isFinite(score)) {
      scoreEl.textContent = '—';
      scoreEl.dataset.tone = 'neutral';
      if (hintEl) hintEl.textContent = '';
      return;
    }
    scoreEl.textContent = String(score);
    const tone = healthScoreTone(score);
    scoreEl.dataset.tone = tone;
    if (hintEl) {
      hintEl.textContent = 'Estimativa no painel: combina uso vs. limites do catálogo e situação da assinatura. Tendência dos últimos 30 dias ainda não entra no cálculo.';
    }
  }

  function renderFeatureDetailList(status) {
    const ul = state.dom.featureDetailList;
    if (!ul) return;
    const keys = collectFeatureKeys(status);
    const commercial = status?.commercialSubscription;
    const limits = commercial?.catalogUsageLimits || {};
    const usage = status?.usage || {};
    if (!keys.length) {
      ul.innerHTML = '<li class="plano-uso-feature-detail-empty plano-uso-muted">Nenhuma feature listada no contrato comercial.</li>';
      return;
    }
    ul.innerHTML = keys.map((key) => {
      const hint = limitHintForFeatureKey(key, limits, usage);
      const hintHtml = hint
        ? `<span class="plano-uso-feature-hint">${escapeHtml(hint)}</span>`
        : '';
      return `
        <li class="plano-uso-feature-detail-item" title="${escapeHtml(featureLabel(key))}">
          <span class="plano-uso-feature-check" aria-hidden="true">${FEATURE_CHECK_SVG}</span>
          <span class="plano-uso-feature-line">
            <code>${escapeHtml(key)}</code>
            ${hintHtml}
          </span>
        </li>
      `;
    }).join('');
  }

  function renderTopbar(status) {
    const nameEl = state.dom.tenantName;
    const pill = state.dom.planPill;
    const topBadge = state.dom.topStatusBadge;
    const sub = state.dom.topSub;
    if (nameEl) nameEl.textContent = getTenantDisplayName(state.session);

    const commercial = status?.commercialSubscription;
    const plan = commercial?.plan || status?.plan;
    const displayName = plan?.displayName || plan?.name || plan?.code || '';
    const subStatus = mapStatus(commercial?.status || status?.status);

    if (pill) {
      if (displayName) {
        pill.hidden = false;
        pill.textContent = displayName;
      } else {
        pill.hidden = true;
      }
    }
    if (topBadge) {
      topBadge.textContent = subStatus.label;
      topBadge.dataset.tone = subStatus.tone;
    }
    if (sub) {
      const end = commercial?.currentPeriodEnd || status?.currentPeriodEnd;
      sub.textContent = end
        ? `Ciclo atual até ${formatDate(end)} · consumo e faturamento em um só lugar.`
        : 'Acompanhe plano, consumo e pagamentos.';
    }
  }

  function renderHeroDashboard(status) {
    renderPlanCard(status);
    renderSubscriptionCard(status);
    renderTrialCard(status);

    const commercial = status?.commercialSubscription;
    const plan = commercial?.plan || status?.plan;
    const cycleEl = state.dom.cyclePill;
    if (cycleEl) {
      const cycle = billingCycleLabel(commercial?.billingCycle || plan?.billingCycle);
      cycleEl.hidden = false;
      cycleEl.textContent = cycle;
    }

    const meta = state.dom.heroMeta;
    if (meta) {
      const start = commercial?.currentPeriodStart;
      const end = commercial?.currentPeriodEnd || status?.currentPeriodEnd;
      const trialEnd = commercial?.trialEnd || status?.trialEndsAt;
      const subStatus = String(commercial?.status || status?.status || '').toLowerCase();
      const parts = [];
      if (start && end) parts.push(`Ciclo: ${formatDate(start)} – ${formatDate(end)}`);
      if (subStatus.includes('trial') && trialEnd) parts.push(`Trial até ${formatDate(trialEnd)}`);
      const renewalDays = diffDays(end);
      if (renewalDays !== null && subStatus === 'active') {
        parts.push(renewalDays === 0 ? 'Renovação hoje' : `Próxima cobrança em ${renewalDays} dia${renewalDays === 1 ? '' : 's'}`);
      }
      meta.textContent = parts.length ? parts.join(' · ') : 'Assinatura comercial ativa no motor SaaS.';
    }

    const heroFeatures = state.dom.heroFeatures;
    if (heroFeatures) {
      const keys = collectFeatureKeys(status).slice(0, 10);
      heroFeatures.innerHTML = keys.length
        ? keys.map((key) => `
          <li>
            <span class="plano-uso-hero-check" aria-hidden="true">${FEATURE_CHECK_SVG}</span>
            <span>${escapeHtml(featureLabel(key))}</span>
          </li>
        `).join('')
        : '<li class="plano-uso-muted">Nenhuma feature listada no contrato.</li>';
    }

    const heroTrial = state.dom.heroTrial;
    if (heroTrial) {
      const trialEnd = commercial?.trialEnd || status?.trialEndsAt;
      const isTrialing = String(commercial?.status || status?.status || '').toLowerCase().includes('trial');
      if (trialEnd && isTrialing) {
        heroTrial.hidden = false;
        const rem = diffDays(trialEnd);
        heroTrial.querySelector('.plano-uso-hero-trial-text').textContent = rem === null
          ? `Trial até ${formatDate(trialEnd)}`
          : `${rem} dia${rem === 1 ? '' : 's'} restante${rem === 1 ? '' : 's'} · termina em ${formatDate(trialEnd)}`;
      } else {
        heroTrial.hidden = true;
      }
    }

    const pct = combinedUsagePercent(status);
    setGaugePercent(pct);

    const snap = state.tenantSnapshot || {};
    const score = computeHealthScore(status, snap);
    const pill = healthPillFromScore(score);
    if (state.dom.healthPill) {
      state.dom.healthPill.textContent = pill.label;
      state.dom.healthPill.dataset.tone = pill.tone;
    }
    if (state.dom.healthScore) {
      state.dom.healthScore.textContent = Number.isFinite(score) ? String(score) : '—';
      state.dom.healthScore.dataset.tone = healthScoreTone(score);
    }

    const mini = state.dom.heroMiniBars;
    if (mini) {
      const usage = status?.usage || {};
      const limits = commercial?.catalogUsageLimits || {};
      const rows = [
        { label: 'Mensagens', used: usage.messagesUsed, limit: usage.messageLimit ?? limits.messageLimit },
        { label: 'Agendamentos', used: usage.appointmentsUsed, limit: usage.appointmentLimit ?? limits.appointmentLimit },
      ];
      mini.innerHTML = rows.map((r) => {
        const p = usagePercent(r.used, r.limit);
        const tone = bucketTone(p);
        const w = p === null ? 8 : p;
        return `
          <div class="plano-uso-mini-bar" data-tone="${tone}">
            <span>${escapeHtml(r.label)}</span>
            <span class="plano-uso-mini-bar-track"><span style="width:${w}%"></span></span>
            <span>${p === null ? '—' : `${Math.round(p)}%`}</span>
          </div>
        `;
      }).join('');
    }
  }

  function renderUsagePrimary(status) {
    const container = state.dom.usagePrimary;
    if (!container) return;
    const usage = status?.usage || {};
    const commercial = status?.commercialSubscription;
    const limits = commercial?.catalogUsageLimits || {};

    const cards = [
      buildUsageCard({
        label: 'Mensagens',
        used: usage.messagesUsed,
        limit: usage.messageLimit ?? limits.messageLimit,
        remainingLabel: 'restantes',
        iconKey: 'messages',
      }),
      buildUsageCard({
        label: 'Agendamentos',
        used: usage.appointmentsUsed,
        limit: usage.appointmentLimit ?? limits.appointmentLimit,
        remainingLabel: 'restantes',
        iconKey: 'appointments',
      }),
    ];
    container.innerHTML = cards.join('');

    const period = state.dom.usagePeriod;
    if (period) {
      const start = usage.usagePeriodStartUtc ? formatDate(usage.usagePeriodStartUtc) : '';
      const end = usage.usagePeriodEndUtc ? formatDate(usage.usagePeriodEndUtc) : '';
      if (start && end) period.textContent = `Período: ${start} – ${end}`;
      else if (usage.usagePeriodLabel) period.textContent = usage.usagePeriodLabel;
      else period.textContent = '';
    }

    if (state.dom.usageGrid) renderUsageGrid(status);
  }

  function renderStructureGrid() {
    const grid = state.dom.structureGrid;
    if (!grid) return;
    const snap = state.tenantSnapshot || {};
    const items = [
      { key: 'units', label: 'Unidades', value: snap.unitsCount, sub: 'Ativas' },
      { key: 'professionals', label: 'Profissionais', value: snap.professionalsCount, sub: 'Ativos' },
      { key: 'whatsapp', label: 'WhatsApp', value: snap.whatsappCount, sub: 'Conectados' },
      { key: 'bots', label: 'Bots de IA', value: snap.agentsCount, sub: 'Ativos' },
    ];
    grid.innerHTML = items.map((item) => `
      <article class="plano-uso-structure-card" data-key="${item.key}">
        <strong>${Number(item.value || 0).toLocaleString('pt-BR')}</strong>
        <span class="plano-uso-structure-label">${escapeHtml(item.label)}</span>
        <small>${escapeHtml(item.sub)}</small>
      </article>
    `).join('');
  }

  function renderPaySummaryHtml() {
    const prefs = state.checkoutPrefs;
    const rec = recurrenceLabels(prefs.recurringCollectionMode);
    const meth = methodLabels(prefs.paymentMethodPreference);
    const pm = state.status?.commercialSubscription?.paymentMethod || state.status?.paymentMethod;
    const cardHint = pm?.last4
      ? `${pm.brand || 'Cartão'} **** ${pm.last4}`
      : meth.hint;
    const env = prefs._environment === 'sandbox' ? 'Sandbox' : 'Produção';
    const email = String(prefs.payerEmail || getSessionEmail(state.session) || '—');

    return `
      <article class="plano-uso-pay-card plano-uso-pay-card--static">
        <span class="plano-uso-pay-card-kicker">PSP</span>
        <strong>Mercado Pago</strong>
        <small>Ambiente: ${escapeHtml(env)}</small>
      </article>
      <article class="plano-uso-pay-card plano-uso-pay-card--static">
        <span class="plano-uso-pay-card-kicker">Recorrência</span>
        <strong>${escapeHtml(rec.title)}</strong>
        <small>${escapeHtml(rec.hint)}</small>
      </article>
      <article class="plano-uso-pay-card plano-uso-pay-card--static">
        <span class="plano-uso-pay-card-kicker">Método</span>
        <strong>${escapeHtml(meth.title)}</strong>
        <small>${escapeHtml(cardHint)}</small>
      </article>
      <article class="plano-uso-pay-card plano-uso-pay-card--static">
        <span class="plano-uso-pay-card-kicker">E-mail MP</span>
        <strong class="plano-uso-pay-email-val">${escapeHtml(email)}</strong>
        <small>Conta que autoriza a cobrança</small>
      </article>
    `;
  }

  function renderPaymentCta(status) {
    const action = resolvePaymentAction(status);
    const main = state.dom.mainCta;
    const modal = state.dom.modalCta;
    const modalLabel = state.dom.modalCtaLabel;
    const loading = state.checkoutLoading;
    const hidden = action.type === 'hidden';

    [main, modal].forEach((btn) => {
      if (!btn) return;
      btn.disabled = loading;
    });

    if (main) {
      if (hidden) main.hidden = true;
      else {
        main.hidden = false;
        main.textContent = loading ? 'Aguarde…' : action.label;
      }
    }
    if (modal) modal.hidden = hidden;
    if (modalLabel) {
      modalLabel.textContent = loading
        ? 'Aguarde…'
        : (action.label || 'Ir para checkout');
    }
  }

  function renderPaymentBlock(status) {
    const block = state.dom.paymentBlock;
    if (!block) return;
    syncCheckoutPrefsFromStatus(status);
    block.hidden = true;
  }

  function buildManageUsageBar(label, used, limit) {
    const pct = usagePercent(used, limit);
    const tone = bucketTone(pct);
    const usedStr = Number(used || 0).toLocaleString('pt-BR');
    const limitStr = Number.isFinite(Number(limit)) && Number(limit) > 0
      ? Number(limit).toLocaleString('pt-BR')
      : '∞';
    const w = pct === null ? 12 : Math.min(100, pct);
    return `
      <div class="plano-uso-manage-usage-row" data-tone="${tone}">
        <div class="plano-uso-manage-usage-head">
          <span>${escapeHtml(label)}</span>
          <strong>${usedStr} / ${limitStr}</strong>
        </div>
        <div class="plano-uso-manage-usage-track"><span style="width:${w}%"></span></div>
      </div>
    `;
  }

  function renderManageCurrent(status) {
    const el = state.dom.manageCurrent;
    if (!el) return;
    const commercial = status?.commercialSubscription;
    const plan = commercial?.plan || status?.plan || {};
    const usage = status?.usage || {};
    const limits = commercial?.catalogUsageLimits || {};
    const currency = plan?.currency || 'BRL';
    const displayName = plan?.displayName || plan?.name || plan?.code || 'Sem plano';
    const cycle = billingCycleLabel(commercial?.billingCycle || plan?.billingCycle);

    let priceLabel = '—';
    if (plan && Number.isFinite(Number(plan.amountMinor))) {
      priceLabel = `${fromMinor(plan.amountMinor, currency)} / mês`;
    } else if (plan && Number.isFinite(Number(plan.priceMonthly))) {
      priceLabel = `${formatBRL(plan.priceMonthly, currency)} / mês`;
    }

    const subStatus = mapStatus(commercial?.status || status?.status);
    const periodEnd = commercial?.currentPeriodEnd || status?.currentPeriodEnd;
    const nextCharge = periodEnd
      ? `Próxima cobrança: ${formatDate(periodEnd)}`
      : (String(subStatus.label).toLowerCase().includes('trial')
        ? 'Período de teste ativo'
        : '');

    const keys = collectFeatureKeys(status).slice(0, 4);
    const featuresHtml = keys.length
      ? `<ul class="plano-uso-manage-features">${keys.map((k) => `
          <li><span class="plano-uso-manage-check" aria-hidden="true">✓</span>${escapeHtml(featureLabel(k))}</li>
        `).join('')}</ul>`
      : '';

    const usageHtml = [
      buildManageUsageBar('Mensagens', usage.messagesUsed, usage.messageLimit ?? limits.messageLimit),
      buildManageUsageBar('Agendamentos', usage.appointmentsUsed, usage.appointmentLimit ?? limits.appointmentLimit),
    ].join('');

    el.innerHTML = `
      <article class="plano-uso-manage-current-card">
        <div class="plano-uso-manage-current-main">
          <span class="plano-uso-manage-plan-icon" aria-hidden="true">👑</span>
          <div>
            <div class="plano-uso-manage-current-title-row">
              <h5>${escapeHtml(displayName)}</h5>
              <span class="plano-uso-cycle-pill">${escapeHtml(cycle)}</span>
              <span class="plano-uso-status-badge" data-tone="${subStatus.tone}">${escapeHtml(subStatus.label)}</span>
            </div>
            <p class="plano-uso-manage-price">${escapeHtml(priceLabel)}</p>
            ${nextCharge ? `<p class="plano-uso-manage-next">${escapeHtml(nextCharge)}</p>` : ''}
            ${featuresHtml}
            <button type="button" class="plano-uso-btn plano-uso-btn--outline plano-uso-btn--sm" id="adminPlanoUsoManageScrollPlans">Mudar plano</button>
          </div>
        </div>
        <div class="plano-uso-manage-current-usage">${usageHtml}</div>
      </article>
    `;

    el.querySelector('#adminPlanoUsoManageScrollPlans')?.addEventListener('click', () => {
      state.dom.managePlansSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderManagePlans(status) {
    const el = state.dom.managePlans;
    if (!el) return;
    const currentCode = normalizePlanCatalogCode(getPlanCode(status));
    el.innerHTML = PLAN_CATALOG_UI.map((item) => {
      const isCurrent = item.code === currentCode;
      const badge = item.badge
        ? `<span class="plano-uso-manage-plan-badge">${escapeHtml(item.badge)}</span>`
        : '';
      const features = item.features.map((f) => `
        <li><span class="plano-uso-manage-check" aria-hidden="true">✓</span>${escapeHtml(f)}</li>
      `).join('');
      const btn = isCurrent
        ? '<button type="button" class="plano-uso-btn plano-uso-btn--primary" disabled>Plano atual</button>'
        : '<button type="button" class="plano-uso-btn plano-uso-btn--outline" data-plano-uso-plan-support>Escolher plano</button>';
      return `
        <article class="plano-uso-manage-plan-card${isCurrent ? ' is-current' : ''}${item.badge ? ' is-featured' : ''}" data-plan="${escapeHtml(item.code)}">
          ${badge}
          <h5>${escapeHtml(item.name)}</h5>
          <p class="plano-uso-manage-plan-price">${formatBRL(item.price)}<small>/mês</small></p>
          <ul class="plano-uso-manage-plan-features">${features}</ul>
          ${btn}
        </article>
      `;
    }).join('');

    el.querySelectorAll('[data-plano-uso-plan-support]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.open('https://reservaai.tawk.help', '_blank', 'noopener');
      });
    });
  }

  function renderManageMpDefault(status) {
    const el = state.dom.manageMpDefault;
    if (!el) return;
    syncCheckoutPrefsFromStatus(status);
    const email = String(state.checkoutPrefs.payerEmail || getSessionEmail(state.session) || '—').trim() || '—';
    const commercial = status?.commercialSubscription;
    const subStatus = mapStatus(commercial?.status || status?.status);
    const pm = commercial?.paymentMethod || status?.paymentMethod;
    const cardHint = pm?.last4
      ? `${pm.brand || pm.label || 'Cartão'} ···· ${pm.last4}`
      : 'Mercado Pago · checkout seguro';
    const active = ['active', 'trialing'].includes(String(commercial?.status || status?.status || '').toLowerCase());

    el.innerHTML = `
      <article class="plano-uso-manage-mp-card">
        <div class="plano-uso-manage-mp-brand">
          <span class="plano-uso-manage-mp-logo" aria-hidden="true">MP</span>
          <div>
            <div class="plano-uso-manage-mp-title-row">
              <strong>Mercado Pago</strong>
              <span class="plano-uso-manage-mp-pill">Padrão</span>
              ${active ? '<span class="plano-uso-status-badge" data-tone="success">Ativo</span>' : `<span class="plano-uso-status-badge" data-tone="${subStatus.tone}">${escapeHtml(subStatus.label)}</span>`}
            </div>
            <small>${escapeHtml(email)}</small>
            <small class="plano-uso-manage-mp-sub">${escapeHtml(cardHint)}</small>
          </div>
        </div>
        <button type="button" class="plano-uso-btn plano-uso-btn--ghost plano-uso-btn--sm" data-plano-uso-scroll-pay>Alterar método</button>
      </article>
    `;

    el.querySelector('[data-plano-uso-scroll-pay]')?.addEventListener('click', () => {
      state.dom.recurrenceCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderManageEnv(status) {
    syncCheckoutPrefsFromStatus(status);
    const env = state.checkoutPrefs._environment === 'sandbox' ? 'sandbox' : 'production';
    const isSandbox = env === 'sandbox';
    const commercial = status?.commercialSubscription;
    const subStatus = String(commercial?.status || status?.status || '').toLowerCase();
    const active = subStatus === 'active';

    if (state.dom.pspEnv) {
      state.dom.pspEnv.textContent = `Ambiente: ${isSandbox ? 'Sandbox' : 'Produção'}`;
    }
    if (state.dom.manageEnvDot) {
      state.dom.manageEnvDot.dataset.tone = isSandbox ? 'warn' : (active ? 'success' : 'neutral');
    }
    if (state.dom.manageEnvTitle) {
      state.dom.manageEnvTitle.textContent = isSandbox ? 'Sandbox' : 'Produção';
    }
    if (state.dom.manageEnvText) {
      if (isSandbox) {
        state.dom.manageEnvText.textContent = 'Ambiente de testes — cobranças não são reais.';
      } else if (active) {
        state.dom.manageEnvText.textContent = 'Sua assinatura está ativa e em produção.';
      } else if (subStatus.includes('trial')) {
        state.dom.manageEnvText.textContent = 'Trial ativo em produção. Configure o pagamento abaixo.';
      } else {
        state.dom.manageEnvText.textContent = 'Finalize o pagamento para ativar a assinatura em produção.';
      }
    }

    const pending = getPendingPayment(status);
    const extUrl = pending?.paymentUrl || state.lastPaymentUrl || commercial?.managementUrl || '';
    const extBtn = state.dom.manageMpExternal;
    if (extBtn) {
      if (extUrl) {
        extBtn.hidden = false;
        extBtn.onclick = () => openExternalPayment(String(extUrl));
      } else {
        extBtn.hidden = true;
        extBtn.onclick = null;
      }
    }
  }

  function renderManageModal(status) {
    if (!status) return;
    renderManageCurrent(status);
    renderManagePlans(status);
    renderManageMpDefault(status);
    renderManageEnv(status);
  }

  function renderPaymentModal(status) {
    if (!status) return;
    syncCheckoutPrefsFromStatus(status);
    const prefs = state.checkoutPrefs;
    const rec = recurrenceLabels(prefs.recurringCollectionMode);
    const meth = methodLabels(prefs.paymentMethodPreference);

    if (state.dom.recurrenceLabel) state.dom.recurrenceLabel.textContent = rec.title;
    if (state.dom.recurrenceHint) state.dom.recurrenceHint.textContent = rec.hint;
    if (state.dom.methodLabel) state.dom.methodLabel.textContent = meth.title;
    if (state.dom.methodHint) state.dom.methodHint.textContent = meth.hint;

    if (state.dom.payerEmail && !state.dom.payerEmail.value) {
      state.dom.payerEmail.value = prefs.payerEmail || getSessionEmail(state.session);
    }

    const modalRec = state.dom.modalRecurring;
    const modalRecText = state.dom.modalRecurringText;
    if (modalRec && modalRecText) {
      if (prefs.recurringCollectionMode === 'mp_card_recurring') {
        modalRec.hidden = false;
        modalRecText.textContent = 'Confirme com o e-mail da conta Mercado Pago que autorizará o cartão. Não há OTP enviado pela ReservaAI.';
      } else {
        modalRec.hidden = true;
      }
    }

    renderManageModal(status);
    syncPayOptionUi();
    renderPaymentCta(status);
  }

  function syncPayOptionUi() {
    const prefs = state.checkoutPrefs;
    const isMp = prefs.recurringCollectionMode === 'mp_card_recurring';
    if (state.dom.recurrenceManual) {
      state.dom.recurrenceManual.dataset.selected = !isMp ? '1' : '0';
    }
    if (state.dom.recurrenceMp) {
      state.dom.recurrenceMp.dataset.selected = isMp ? '1' : '0';
      const allow = state.status ? planAllowsMpRecurring(state.status) : false;
      state.dom.recurrenceMp.disabled = !allow;
      state.dom.recurrenceMp.hidden = false;
      state.dom.recurrenceMp.title = allow ? '' : MP_RECURRING_DISABLED_TITLE;
    }
    const methodWrap = state.dom.methodCard;
    if (methodWrap) {
      methodWrap.dataset.disabled = isMp ? '1' : '0';
    }
    const setMethodSelected = (el, key) => {
      if (el) el.dataset.selected = prefs.paymentMethodPreference === key ? '1' : '0';
    };
    setMethodSelected(state.dom.methodCardBtn, 'card');
    setMethodSelected(state.dom.methodPixBtn, 'pix');
    setMethodSelected(state.dom.methodBoletoBtn, 'boleto');
  }

  function cycleRecurrenceMode() {
    if (!state.status) return;
    const allowMp = planAllowsMpRecurring(state.status);
    const modes = allowMp ? ['manual_link', 'mp_card_recurring'] : ['manual_link'];
    const idx = modes.indexOf(state.checkoutPrefs.recurringCollectionMode);
    state.checkoutPrefs.recurringCollectionMode = modes[(idx + 1) % modes.length];
    if (state.checkoutPrefs.recurringCollectionMode === 'mp_card_recurring') {
      state.checkoutPrefs.paymentMethodPreference = 'card';
    }
    syncPayOptionUi();
    renderPaymentBlock(state.status);
    renderPaymentModal(state.status);
  }

  function cyclePaymentMethod() {
    if (state.checkoutPrefs.recurringCollectionMode === 'mp_card_recurring') return;
    const methods = ['card', 'pix', 'boleto'];
    const idx = methods.indexOf(state.checkoutPrefs.paymentMethodPreference);
    state.checkoutPrefs.paymentMethodPreference = methods[(idx + 1) % methods.length];
    renderPaymentBlock(state.status);
    renderPaymentModal(state.status);
  }

  function selectRecurrenceMode(mode) {
    if (!state.status) return;
    if (mode === 'mp_card_recurring' && !planAllowsMpRecurring(state.status)) return;
    state.checkoutPrefs.recurringCollectionMode = mode;
    if (mode === 'mp_card_recurring') state.checkoutPrefs.paymentMethodPreference = 'card';
    syncPayOptionUi();
    renderPaymentBlock(state.status);
    renderPaymentModal(state.status);
  }

  function selectPaymentMethod(pref) {
    if (state.checkoutPrefs.recurringCollectionMode === 'mp_card_recurring') return;
    state.checkoutPrefs.paymentMethodPreference = pref;
    renderPaymentBlock(state.status);
    renderPaymentModal(state.status);
  }

  function renderFeatures(status) {
    const container = state.dom.features;
    if (!container) return;
    const commercial = status?.commercialSubscription;
    const keys = Array.isArray(commercial?.featureKeys) && commercial.featureKeys.length
      ? commercial.featureKeys
      : (Array.isArray(status?.activeFeatures) ? status.activeFeatures : []);
    if (!keys.length) {
      container.innerHTML = '<span class="plano-uso-feature-empty">Plano sem recursos adicionais configurados.</span>';
      return;
    }
    const html = keys.slice(0, 8).map((key) => {
      const label = featureLabel(key);
      return `<span class="plano-uso-feature-chip" title="${escapeHtml(key)}">${escapeHtml(label)}</span>`;
    }).join('');
    container.innerHTML = html;
  }

  function renderPlanCard(status) {
    const commercial = status?.commercialSubscription;
    const plan = commercial?.plan || status?.plan || null;
    const displayName = plan?.displayName || plan?.name || plan?.code || 'Sem plano';
    const currency = plan?.currency || 'BRL';

    let priceLabel = '—';
    if (plan && Number.isFinite(Number(plan.amountMinor))) {
      priceLabel = `${fromMinor(plan.amountMinor, currency)} / mês`;
    } else if (plan && Number.isFinite(Number(plan.priceMonthly))) {
      priceLabel = `${formatBRL(plan.priceMonthly, currency)} / mês`;
    }

    if (state.dom.planName) state.dom.planName.textContent = displayName;
    if (state.dom.planPrice) state.dom.planPrice.textContent = priceLabel;

    const subStatus = mapStatus(commercial?.status || status?.status);
    const badge = state.dom.statusBadge;
    if (badge) {
      badge.textContent = subStatus.label;
      badge.dataset.tone = subStatus.tone;
    }
    if (state.dom.subscriptionStatus) {
      state.dom.subscriptionStatus.textContent = subStatus.label;
      state.dom.subscriptionStatus.dataset.tone = subStatus.tone;
    }

    renderFeatures(status);
  }

  function renderSubscriptionCard(status) {
    const commercial = status?.commercialSubscription;
    const start = commercial?.currentPeriodStart || null;
    const end = commercial?.currentPeriodEnd || status?.currentPeriodEnd || null;
    const cycleText = start && end ? `${formatDate(start)} – ${formatDate(end)}` : (end ? `até ${formatDate(end)}` : '—');
    if (state.dom.cycle) state.dom.cycle.textContent = cycleText;

    const renewalDays = diffDays(end);
    if (state.dom.renewal) {
      state.dom.renewal.textContent = renewalDays === null
        ? '—'
        : (renewalDays === 0
          ? 'Renovação hoje'
          : `Renovação em ${renewalDays} dia${renewalDays === 1 ? '' : 's'}`);
    }

    const pm = commercial?.paymentMethod || status?.paymentMethod || null;
    if (state.dom.paymentMethod) {
      if (pm && (pm.brand || pm.last4 || pm.label)) {
        const brand = pm.brand ? String(pm.brand) : (pm.label || 'Cartão');
        const last4 = pm.last4 ? `**** ${pm.last4}` : '';
        state.dom.paymentMethod.textContent = [brand, last4].filter(Boolean).join(' ');
      } else {
        state.dom.paymentMethod.textContent = 'Não informado';
      }
    }
  }

  function renderTrialCard(status) {
    const card = state.dom.trialCard;
    if (!card) return;
    const commercial = status?.commercialSubscription;
    const trialEnd = commercial?.trialEnd || status?.trialEndsAt || null;
    const trialStart = commercial?.trialStart || null;
    const isTrialing = String(commercial?.status || status?.status || '').toLowerCase().includes('trial');

    if (!trialEnd || !isTrialing) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    const totalDays = trialStart ? diffDays(trialEnd, trialStart) : 14;
    const remaining = diffDays(trialEnd);

    if (state.dom.trialDays) {
      state.dom.trialDays.textContent = remaining === null
        ? '—'
        : `${remaining} dia${remaining === 1 ? '' : 's'} restante${remaining === 1 ? '' : 's'}`;
    }
    if (state.dom.trialText) {
      state.dom.trialText.textContent = `Seu teste gratuito termina em ${formatDate(trialEnd)}.`;
    }
    if (state.dom.trialBarFill) {
      const usedDays = totalDays && Number.isFinite(totalDays) && totalDays > 0 && remaining !== null
        ? Math.max(0, totalDays - remaining)
        : 0;
      const pct = totalDays && totalDays > 0 ? clamp01((usedDays / totalDays) * 100) : 0;
      state.dom.trialBarFill.style.width = `${pct}%`;
    }

    const plan = commercial?.plan || status?.plan || null;
    const currency = plan?.currency || 'BRL';
    if (state.dom.nextChargeAmount) {
      if (plan && Number.isFinite(Number(plan.amountMinor))) {
        state.dom.nextChargeAmount.textContent = fromMinor(plan.amountMinor, currency);
      } else if (plan && Number.isFinite(Number(plan.priceMonthly))) {
        state.dom.nextChargeAmount.textContent = formatBRL(plan.priceMonthly, currency);
      } else {
        state.dom.nextChargeAmount.textContent = '—';
      }
    }
    if (state.dom.nextChargeDate) {
      state.dom.nextChargeDate.textContent = trialEnd ? `Em ${formatDate(trialEnd)}` : '—';
    }
  }

  function buildUsageCard({ label, used, limit, remainingLabel, iconKey, footnote }) {
    const percent = usagePercent(used, limit);
    const tone = bucketTone(percent);
    const usedStr = Number(used || 0).toLocaleString('pt-BR');
    const limitStr = Number.isFinite(Number(limit)) && limit > 0
      ? Number(limit).toLocaleString('pt-BR')
      : '∞';
    const percentLabel = percent === null ? 'Sem limite' : `${Math.round(percent)}%`;
    const remaining = Number.isFinite(Number(limit)) && limit > 0
      ? Math.max(0, Number(limit) - Number(used || 0))
      : null;
    let remainingText = '';
    if (footnote != null && String(footnote).trim()) {
      remainingText = String(footnote);
    } else if (percent === null) {
      remainingText = 'Monitoramento ativo sem limite de plano';
    } else if (remaining !== null) {
      remainingText = `${remaining.toLocaleString('pt-BR')} ${remainingLabel}`;
    }

    return `
      <article class="plano-uso-usage-card" data-tone="${tone}">
        <header class="plano-uso-usage-card-head">
          <span class="plano-uso-usage-icon plano-uso-usage-icon--${iconKey}" aria-hidden="true">${USAGE_ICONS[iconKey] || ''}</span>
          <span class="plano-uso-usage-label">${escapeHtml(label)}</span>
        </header>
        <div class="plano-uso-usage-numbers">
          <strong>${usedStr}</strong>
          <span class="plano-uso-usage-divider">/ ${limitStr}</span>
          <span class="plano-uso-usage-percent">${percentLabel}</span>
        </div>
        <div class="plano-uso-usage-bar">
          <span class="plano-uso-usage-bar-fill" style="width: ${percent === null ? 100 : percent}%"></span>
        </div>
        <small class="plano-uso-usage-remaining">${escapeHtml(remainingText)}</small>
      </article>
    `;
  }

  const USAGE_ICONS = {
    messages: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3H6.5A2.5 2.5 0 0 1 4 14.5v-8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    appointments: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M4 9h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    professionals: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="9" r="3.5" stroke="currentColor" stroke-width="1.6"/><path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    units: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h16M6 20V8l6-4 6 4v12M10 12h4M10 16h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none"><path d="M20 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L4 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.4-8.4h.5a8.48 8.48 0 0 1 8 8.4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    bots: '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="6" width="14" height="12" rx="3" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="11" r="1" fill="currentColor"/><circle cx="15" cy="11" r="1" fill="currentColor"/><path d="M9 15h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };

  function renderUsageGrid(status) {
    const grid = state.dom.usageGrid;
    if (!grid) return;
    const usage = status?.usage || {};
    const commercial = status?.commercialSubscription;
    const limits = commercial?.catalogUsageLimits || {};
    const snap = state.tenantSnapshot || {
      unitsCount: 0,
      professionalsCount: 0,
      whatsappCount: 0,
      agentsCount: 0,
    };

    const cards = [];
    cards.push(buildUsageCard({
      label: 'Mensagens',
      used: usage.messagesUsed,
      limit: usage.messageLimit ?? limits.messageLimit,
      remainingLabel: 'restantes',
      iconKey: 'messages',
    }));
    cards.push(buildUsageCard({
      label: 'Agendamentos',
      used: usage.appointmentsUsed,
      limit: usage.appointmentLimit ?? limits.appointmentLimit,
      remainingLabel: 'restantes',
      iconKey: 'appointments',
    }));
    cards.push(buildUsageCard({
      label: 'Profissionais',
      used: snap.professionalsCount || usage.professionalsUsed || 0,
      limit: limits.professionalsSeatLimit ?? usage.professionalsLimit,
      remainingLabel: 'disponíveis',
      iconKey: 'professionals',
    }));
    cards.push(buildUsageCard({
      label: 'Unidades',
      used: snap.unitsCount || usage.unitsUsed || 0,
      limit: limits.unitsLimit ?? usage.unitsLimit,
      remainingLabel: 'disponíveis',
      iconKey: 'units',
    }));
    cards.push(buildUsageCard({
      label: 'WhatsApp',
      used: snap.whatsappCount,
      limit: null,
      remainingLabel: '',
      iconKey: 'whatsapp',
      footnote: 'Números/canais ativos no tenant',
    }));
    cards.push(buildUsageCard({
      label: 'Bots',
      used: snap.agentsCount,
      limit: null,
      remainingLabel: '',
      iconKey: 'bots',
      footnote: 'Agentes ativos no tenant',
    }));

    grid.innerHTML = cards.join('');

    const period = state.dom.usagePeriod;
    if (period) {
      const start = usage.usagePeriodStartUtc ? formatDate(usage.usagePeriodStartUtc) : '';
      const end = usage.usagePeriodEndUtc ? formatDate(usage.usagePeriodEndUtc) : '';
      if (start && end) {
        period.textContent = `Período: ${start} – ${end}`;
      } else if (usage.usagePeriodLabel) {
        period.textContent = usage.usagePeriodLabel;
      } else {
        period.textContent = '';
      }
    }
  }

  function renderHistory(status) {
    const totalsEl = state.dom.historyTotals;
    if (totalsEl) {
      const history = status?.usageHistory;
      if (!history) {
        totalsEl.innerHTML = '<span class="plano-uso-muted">Sem histórico para o período selecionado.</span>';
      } else {
        const messages = Number(history.messagesUsed || 0).toLocaleString('pt-BR');
        const appointments = Number(history.appointmentsUsed || 0).toLocaleString('pt-BR');
        totalsEl.innerHTML = `
          <div class="plano-uso-history-item" data-tone="messages">
            <span class="plano-uso-history-dot"></span>
            <div>
              <span class="plano-uso-history-label">Mensagens</span>
              <strong>${messages}</strong>
            </div>
          </div>
          <div class="plano-uso-history-item" data-tone="appointments">
            <span class="plano-uso-history-dot"></span>
            <div>
              <span class="plano-uso-history-label">Agendamentos</span>
              <strong>${appointments}</strong>
            </div>
          </div>
        `;
      }
    }
  }

  function renderAlerts(status) {
    const section = state.dom.alertsSection;
    const card = state.dom.alertsCard;
    const list = state.dom.alerts;
    if (!list) return;

    const alerts = [];
    const usage = status?.usage || {};
    const commercial = status?.commercialSubscription;
    const plan = commercial?.plan || status?.plan || null;

    const messagesPct = usagePercent(usage.messagesUsed, usage.messageLimit);
    const appointmentsPct = usagePercent(usage.appointmentsUsed, usage.appointmentLimit);

    const subStatus = String(commercial?.status || status?.status || '').toLowerCase();
    const pending = getPendingPayment(status);
    const trialEnd = commercial?.trialEnd || status?.trialEndsAt;

    if (['incomplete', 'past_due', 'unpaid'].includes(subStatus)) {
      alerts.push({
        tone: 'warn',
        icon: 'warn',
        title: 'Pagamento pendente',
        body: pending?.paymentUrl
          ? 'Existe um checkout em aberto. Abra o pagamento para concluir a assinatura.'
          : 'Regularize o pagamento para manter o acesso aos recursos do plano.',
      });
    }
    if (subStatus.includes('trial') && trialEnd) {
      const rem = diffDays(trialEnd);
      if (rem !== null && rem <= 7) {
        alerts.push({
          tone: 'info',
          icon: 'info',
          title: 'Trial encerrando em breve',
          body: `Seu período de teste termina em ${formatDate(trialEnd)} (${rem} dia${rem === 1 ? '' : 's'}).`,
        });
      }
    }
    if (!plan && !commercial?.plan) {
      alerts.push({
        tone: 'info',
        icon: 'info',
        title: 'Você ainda não possui um plano comercial',
        body: 'Escolha um plano para liberar todos os recursos.',
      });
    }
    if (messagesPct !== null && messagesPct > 80) {
      alerts.push({
        tone: 'warn',
        icon: 'warn',
        title: 'Você está próximo do limite de mensagens',
        body: `${Math.round(messagesPct)}% do limite utilizado. Considere um upgrade para evitar interrupções.`,
      });
    }
    if (appointmentsPct !== null && appointmentsPct > 80) {
      alerts.push({
        tone: 'warn',
        icon: 'warn',
        title: 'Você está próximo do limite de agendamentos',
        body: `${Math.round(appointmentsPct)}% do limite utilizado. Considere um upgrade para evitar interrupções.`,
      });
    }
    if (
      alerts.length === 0
      && messagesPct !== null
      && appointmentsPct !== null
      && messagesPct < 80
      && appointmentsPct < 80
    ) {
      alerts.push({
        tone: 'success',
        icon: 'check',
        title: 'Tudo certo!',
        body: 'Seu plano está ativo e seus pagamentos em dia.',
      });
    }

    if (!alerts.length) {
      if (section) section.hidden = true;
      if (card) card.hidden = true;
      return;
    }

    if (section) section.hidden = false;
    if (card) card.hidden = false;
    list.innerHTML = alerts.map((alert) => `
      <article class="plano-uso-alert" data-tone="${alert.tone}">
        <span class="plano-uso-alert-icon" aria-hidden="true">${ALERT_ICONS[alert.icon] || ALERT_ICONS.info}</span>
        <div class="plano-uso-alert-body">
          <strong>${escapeHtml(alert.title)}</strong>
          <p>${escapeHtml(alert.body)}</p>
        </div>
      </article>
    `).join('');
  }

  const ALERT_ICONS = {
    warn: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4 2.5 20h19L12 4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.5" r="0.9" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="8" r="0.9" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="m8 12 3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function renderInvoices(historyPayload) {
    const tbody = state.dom.invoicesBody;
    const emptyEl = state.dom.invoicesEmpty;
    if (!tbody) return;
    const items = Array.isArray(historyPayload?.items) ? historyPayload.items : [];

    if (!items.length) {
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    tbody.innerHTML = items.map((item) => {
      const statusInfo = mapInvoiceStatus(item);
      const period = item.monthLabel || '—';
      const due = item.dueDate ? formatDate(item.dueDate) : '—';
      const paid = item.paidAt ? formatDate(item.paidAt) : '—';
      const amount = Number.isFinite(Number(item.amount))
        ? formatBRL(item.amount, item.currency || 'BRL')
        : '—';
      const invoiceUrl = item.invoiceUrl || item.receiptUrl || '';
      const downloadBtn = invoiceUrl
        ? `<a class="plano-uso-invoice-download" href="${escapeHtml(invoiceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Baixar recibo"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`
        : '<span class="plano-uso-invoice-download is-disabled" aria-hidden="true">—</span>';

      return `
        <tr>
          <td>${escapeHtml(period)}</td>
          <td class="plano-uso-invoice-amount">${escapeHtml(amount)}</td>
          <td><span class="plano-uso-invoice-status" data-tone="${statusInfo.tone}">${escapeHtml(statusInfo.label)}</span></td>
          <td>${escapeHtml(due)}</td>
          <td>${escapeHtml(paid)}</td>
          <td class="plano-uso-invoice-action">${downloadBtn}</td>
        </tr>
      `;
    }).join('');
  }

  function renderDashboard() {
    if (!state.status) return;
    renderTopbar(state.status);
    renderHeroDashboard(state.status);
    renderUsagePrimary(state.status);
    renderHistory(state.status);
    renderAlerts(state.status);
    renderPaymentBlock(state.status);
    renderStructureGrid();
    renderTokensCard();
    renderHealthCard();
    renderFeatureDetailList(state.status);
    renderInvoices(state.history);
  }

  function renderAll() {
    renderDashboard();
  }

  function handleApiError(error) {
    const code = Number(error?.statusCode || 0);
    if (code === 401) {
      authService?.redirectToLogin?.('session=expired');
      return 'Sessão expirada. Faça login novamente para visualizar o plano.';
    }
    if (code === 403) {
      return 'Sem permissão para visualizar o plano deste tenant.';
    }
    if (code === 404) {
      return 'Tenant ou contratação comercial não encontrado.';
    }
    if (code >= 500) {
      return 'Falha temporária ao consultar o billing. Tente novamente em instantes.';
    }
    return error?.message || 'Não foi possível carregar o plano.';
  }

  async function loadStatus({ silent = false } = {}) {
    const tenantId = getDefaultTenantId(state.session);
    if (!tenantId) {
      setFeedback('warn', 'Selecione um tenant antes de visualizar o plano.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setFeedback(null);
    const token = ++state.statusRequestToken;
    try {
      const reuseTenantSnap = silent
        && state.tenantSnapshotReady
        && state.tenantSnapshotTenantId === tenantId;
      const tenantSnapPromise = reuseTenantSnap
        ? Promise.resolve(state.tenantSnapshot)
        : fetchTenantSnapshot(state.session, tenantId).catch(() => ({
          unitsCount: 0,
          professionalsCount: 0,
          whatsappCount: 0,
          agentsCount: 0,
        }));

      const [data, tenantSnap] = await Promise.all([
        fetchStatus(tenantId, state.historyWindow),
        tenantSnapPromise,
      ]);
      if (token !== state.statusRequestToken || !state.active) return;
      state.status = data || null;
      const pendingUrl = getPendingPayment(state.status)?.paymentUrl;
      if (pendingUrl) state.lastPaymentUrl = String(pendingUrl);
      else if (String(state.status?.commercialSubscription?.status || state.status?.status || '').toLowerCase() === 'active') {
        state.lastPaymentUrl = '';
      }
      state.tenantSnapshot = tenantSnap || {
        unitsCount: 0,
        professionalsCount: 0,
        whatsappCount: 0,
        agentsCount: 0,
      };
      state.tenantSnapshotTenantId = tenantId;
      state.tenantSnapshotReady = true;
      state.aiTokens = await fetchAiTokens(tenantId, state.status);
      renderDashboard();
      setLoading(false);
    } catch (error) {
      if (token !== state.statusRequestToken) return;
      setLoading(false);
      setFeedback('danger', handleApiError(error));
    }
  }

  async function loadHistory() {
    const tenantId = getDefaultTenantId(state.session);
    if (!tenantId) return;
    const token = ++state.invoicesRequestToken;
    try {
      const data = await fetchHistory(tenantId, 12);
      if (token !== state.invoicesRequestToken || !state.active) return;
      state.history = data || null;
      renderInvoices(state.history);
    } catch (_) {
      // Histórico ausente é cenário esperado em trial; manter vazio sem ruído.
      if (token === state.invoicesRequestToken) {
        state.history = { items: [] };
        renderInvoices(state.history);
      }
    }
  }

  function bindEvents() {
    if (state.dom.historyWindow) {
      state.dom.historyWindow.addEventListener('change', (event) => {
        const value = String(event.target?.value || '30d');
        if (!HISTORY_WINDOWS.has(value)) return;
        state.historyWindow = value;
        persistHistoryWindow();
        void loadStatus({ silent: true });
      });
    }
    if (state.dom.helpBtn) {
      state.dom.helpBtn.addEventListener('click', () => {
        window.open('https://reservaai.tawk.help', '_blank', 'noopener');
      });
    }
    if (state.dom.supportBtn) {
      state.dom.supportBtn.addEventListener('click', () => {
        window.open('https://reservaai.tawk.help', '_blank', 'noopener');
      });
    }
    if (state.dom.manageBtn) {
      state.dom.manageBtn.addEventListener('click', () => openPaymentModal());
    }
    if (state.dom.openPaymentPanel) {
      state.dom.openPaymentPanel.addEventListener('click', () => openPaymentModal());
    }
    if (state.dom.manageHelp) {
      state.dom.manageHelp.addEventListener('click', () => {
        window.open('https://reservaai.tawk.help', '_blank', 'noopener');
      });
    }
    if (state.dom.mainCta) {
      state.dom.mainCta.addEventListener('click', () => {
        const action = resolvePaymentAction(state.status);
        if (action.type === 'open_url') openExternalPayment(action.url);
        else openPaymentModal();
      });
    }
    if (state.dom.modalCta) {
      state.dom.modalCta.addEventListener('click', () => {
        if (state.dom.payerEmail) {
          state.checkoutPrefs.payerEmail = String(state.dom.payerEmail.value || '').trim();
        }
        void executePaymentFlow();
      });
    }
    state.dom.recurrenceManual?.addEventListener('click', () => selectRecurrenceMode('manual_link'));
    state.dom.recurrenceMp?.addEventListener('click', () => selectRecurrenceMode('mp_card_recurring'));
    state.dom.methodCardBtn?.addEventListener('click', () => selectPaymentMethod('card'));
    state.dom.methodPixBtn?.addEventListener('click', () => selectPaymentMethod('pix'));
    state.dom.methodBoletoBtn?.addEventListener('click', () => selectPaymentMethod('boleto'));
    if (state.dom.payerEmail) {
      state.dom.payerEmail.addEventListener('input', (e) => {
        state.checkoutPrefs.payerEmail = String(e.target?.value || '').trim();
      });
      state.dom.payerEmail.addEventListener('change', (e) => {
        state.checkoutPrefs.payerEmail = String(e.target?.value || '').trim();
        if (state.status) renderPaymentBlock(state.status);
      });
    }
    if (state.dom.paymentModal) {
      state.dom.paymentModal.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('[data-plano-uso-close-modal]')) {
          event.preventDefault();
          closePaymentModal();
        }
      });
      document.addEventListener('keydown', onPaymentModalKeydown);
    }
    state.dom.modalCancel?.addEventListener('click', () => closePaymentModal());
    if (state.dom.seeBilling) {
      state.dom.seeBilling.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById('adminPlanoUsoInvoicesBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    if (state.dom.seeAllInvoices) {
      state.dom.seeAllInvoices.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById('adminPlanoUsoRoot')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
  }

  function mount() {
    if (state.mounted) return true;
    const root = qs('#adminPlanoUsoRoot');
    if (!root) return false;
    state.dom = {
      root,
      feedback: qs('#adminPlanoUsoFeedback'),
      skeleton: qs('#adminPlanoUsoSkeleton'),
      content: qs('#adminPlanoUsoContent'),
      tenantName: qs('#adminPlanoUsoTenantName'),
      planPill: qs('#adminPlanoUsoPlanPill'),
      topStatusBadge: qs('#adminPlanoUsoTopStatusBadge'),
      topSub: qs('#adminPlanoUsoTopSub'),
      manageBtn: qs('#adminPlanoUsoManageBtn'),
      planName: qs('#adminPlanoUsoPlanName'),
      planPrice: qs('#adminPlanoUsoPlanPrice'),
      cyclePill: qs('#adminPlanoUsoCyclePill'),
      heroMeta: qs('#adminPlanoUsoHeroMeta'),
      heroFeatures: qs('#adminPlanoUsoHeroFeatures'),
      heroTrial: qs('#adminPlanoUsoHeroTrial'),
      gaugeRing: qs('#adminPlanoUsoGaugeRing'),
      gaugeFill: qs('#adminPlanoUsoGaugeFill'),
      gaugePct: qs('#adminPlanoUsoGaugePct'),
      healthPill: qs('#adminPlanoUsoHealthPill'),
      heroMiniBars: qs('#adminPlanoUsoHeroMiniBars'),
      statusBadge: qs('#adminPlanoUsoStatusBadge'),
      features: qs('#adminPlanoUsoFeatures'),
      subscriptionStatus: qs('#adminPlanoUsoSubscriptionStatus'),
      cycle: qs('#adminPlanoUsoCycle'),
      renewal: qs('#adminPlanoUsoRenewal'),
      paymentMethod: qs('#adminPlanoUsoPaymentMethod'),
      trialCard: qs('#adminPlanoUsoTrialCard'),
      trialDays: qs('#adminPlanoUsoTrialDays'),
      trialText: qs('#adminPlanoUsoTrialText'),
      trialBarFill: qs('#adminPlanoUsoTrialBarFill'),
      nextChargeAmount: qs('#adminPlanoUsoNextChargeAmount'),
      nextChargeDate: qs('#adminPlanoUsoNextChargeDate'),
      usagePeriod: qs('#adminPlanoUsoUsagePeriod'),
      usagePrimary: qs('#adminPlanoUsoUsagePrimary'),
      usageGrid: qs('#adminPlanoUsoUsageGrid'),
      historyWindow: qs('#adminPlanoUsoHistoryWindow'),
      historyTotals: qs('#adminPlanoUsoHistoryTotals'),
      historyChart: qs('#adminPlanoUsoHistoryChart'),
      alertsSection: qs('#adminPlanoUsoAlertsSection'),
      alertsCard: qs('#adminPlanoUsoAlertsCard'),
      alerts: qs('#adminPlanoUsoAlerts'),
      paymentBlock: qs('#adminPlanoUsoPaymentBlock'),
      paySummary: qs('#adminPlanoUsoPaySummary'),
      recurringBanner: qs('#adminPlanoUsoRecurringBanner'),
      recurringText: qs('#adminPlanoUsoRecurringText'),
      mainCta: qs('#adminPlanoUsoMainCta'),
      openPaymentPanel: qs('#adminPlanoUsoOpenPaymentPanel'),
      structureGrid: qs('#adminPlanoUsoStructureGrid'),
      invoicesBody: qs('#adminPlanoUsoInvoicesBody'),
      invoicesEmpty: qs('#adminPlanoUsoInvoicesEmpty'),
      helpBtn: qs('#adminPlanoUsoHelpBtn'),
      supportBtn: qs('#adminPlanoUsoSupportBtn'),
      seeBilling: qs('#adminPlanoUsoSeeBilling'),
      seeAllInvoices: qs('#adminPlanoUsoSeeAllInvoices'),
      paymentModal: qs('#adminPlanoUsoPaymentModal'),
      manageCurrent: qs('#adminPlanoUsoManageCurrent'),
      managePlans: qs('#adminPlanoUsoManagePlans'),
      managePlansSection: qs('#adminPlanoUsoManagePlansSection'),
      manageMpDefault: qs('#adminPlanoUsoManageMpDefault'),
      manageEnvDot: qs('#adminPlanoUsoManageEnvDot'),
      manageEnvTitle: qs('#adminPlanoUsoManageEnvTitle'),
      manageEnvText: qs('#adminPlanoUsoManageEnvText'),
      manageMpExternal: qs('#adminPlanoUsoManageMpExternal'),
      manageHelp: qs('#adminPlanoUsoManageHelp'),
      modalCancel: qs('#adminPlanoUsoModalCancel'),
      recurrenceManual: qs('#adminPlanoUsoRecurrenceManual'),
      recurrenceMp: qs('#adminPlanoUsoRecurrenceMp'),
      methodCardBtn: qs('#adminPlanoUsoMethodCardBtn'),
      methodPixBtn: qs('#adminPlanoUsoMethodPixBtn'),
      methodBoletoBtn: qs('#adminPlanoUsoMethodBoletoBtn'),
      recurrenceCard: qs('#adminPlanoUsoRecurrenceCard'),
      recurrenceLabel: qs('#adminPlanoUsoRecurrenceLabel'),
      recurrenceHint: qs('#adminPlanoUsoRecurrenceHint'),
      methodCard: qs('#adminPlanoUsoMethodCard'),
      methodLabel: qs('#adminPlanoUsoMethodLabel'),
      methodHint: qs('#adminPlanoUsoMethodHint'),
      payerEmail: qs('#adminPlanoUsoPayerEmail'),
      pspEnv: qs('#adminPlanoUsoPspEnv'),
      modalRecurring: qs('#adminPlanoUsoModalRecurring'),
      modalRecurringText: qs('#adminPlanoUsoModalRecurringText'),
      checkoutError: qs('#adminPlanoUsoCheckoutError'),
      modalCta: qs('#adminPlanoUsoModalCta'),
      modalCtaLabel: qs('#adminPlanoUsoModalCtaLabel'),
      tokensTotal: qs('#adminPlanoUsoTokensTotal'),
      tokensBreakdown: qs('#adminPlanoUsoTokensBreakdown'),
      tokensMeta: qs('#adminPlanoUsoTokensMeta'),
      healthScore: qs('#adminPlanoUsoHealthScore'),
      healthHint: qs('#adminPlanoUsoHealthHint'),
      featureDetailList: qs('#adminPlanoUsoFeatureDetailList'),
    };

    setHistoryWindowFromStorage();
    if (state.dom.historyWindow) {
      state.dom.historyWindow.value = state.historyWindow;
    }

    ensureModalPortaled();
    bindEvents();
    state.mounted = true;
    return true;
  }

  async function activate(session) {
    let resolved = session || state.session;
    if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
      resolved = await window.ReservaPermissions.enrichSessionWithOperatorMe(resolved);
    }
    state.session = resolved;
    state.active = true;
    if (!mount()) return;
    await Promise.all([loadStatus({ silent: !!state.status }), loadHistory()]);
  }

  function deactivate() {
    state.active = false;
    stopStatusPoll();
    closePaymentModal();
    state.aiTokens = null;
    state.tenantSnapshotTenantId = '';
    state.tenantSnapshotReady = false;
  }

  function init({ session } = {}) {
    state.session = session || state.session;
    mount();
  }

  window.ReservaAiPlanoUsoAdmin = { init, activate, deactivate };
}());
