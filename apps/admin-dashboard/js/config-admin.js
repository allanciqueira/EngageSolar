(function () {
  const externalApiBaseUrl = `${window.RESERVAAI_EXTERNAL_API_BASE_URL || 'https://api.neuraflow.ia.br'}`.replace(/\/$/, '');
  const TENANT_STORAGE_KEY = 'reservaai.operator-config.tenant';
  const LOGIN_TENANT_STORAGE_KEY = 'reservaai.login.tenantId';

  const state = {
    mounted: false,
    active: false,
    initialized: false,
    session: null,
    me: null,
    tenantOptions: [],
    selectedTenantId: '',
    rawTenantSettings: {},
    config: null,
    paymentConfig: null,
    crmEnrichment: null,
    branches: [],
    professionals: [],
    posTerminals: [],
    tenantMembers: [],
    professionalTypeOptions: [],
    professionalsSearch: '',
    selectedProfessionalLocalKey: '',
    professionalDetailTab: 'services',
    professionalServicesSearch: '',
    professionalServicesEditOpen: false,
    avatarUsersInFlight: new Set(),
    activeTab: 'geral',
    specialDates: [],
    specialDatesEditingId: '',
    specialDatesYearFilter: '',
    specialDatesSearch: '',
    specialDatesLoading: false,
    /** Na aba Serviços: '' = catálogo global (quando há picker multi-filial); senão id da filial. */
    servicesCatalogBranchId: '',
    solarEnabled: false,
    solarEnergyConfig: null,
    dom: {},
  };

  const SOLAR_FEATURE_KEY = 'solar_energy_calculator';
  const DEFAULT_SOLAR_ENERGY_PARAMS = {
    custo_por_kwp: 5000,
    eficiencia: 0.9,
    fator_geracao: 130,
    billUploadInviteText: '',
    simulationFollowUpText: '',
    hideEconomiaInReply: false,
    hideInvestimentoInReply: false,
    hidePaybackInReply: false,
  };

  function qs(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const WEEKDAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
  const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const PROFESSIONAL_BREAK_TYPE_OPTIONS = ['Almoço', 'Janta', 'Outros'];

  function normalizeWeekdayValues(rawDays, fallbackDays = [1, 2, 3, 4, 5, 6]) {
    if (!Array.isArray(rawDays)) {
      return [...fallbackDays];
    }
    const normalizedDays = rawDays
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (!normalizedDays.length) {
      return [...fallbackDays];
    }
    return Array.from(new Set(normalizedDays)).sort((left, right) => left - right);
  }

  function normalizeWeeklyBreaks(weeklyBreaks) {
    if (!Array.isArray(weeklyBreaks)) {
      return [];
    }
    return weeklyBreaks
      .map((item) => {
        const weekdays = normalizeWeekdayValues(item?.weekdays, []);
        const startTime = String(item?.startTime || '').trim();
        const endTime = String(item?.endTime || '').trim();
        const labelRaw = String(item?.label || '').trim();
        if (!weekdays.length || !startTime || !endTime) {
          return null;
        }
        const normalizedLabel = PROFESSIONAL_BREAK_TYPE_OPTIONS.find((option) => option.toLowerCase() === labelRaw.toLowerCase()) || 'Outros';
        return {
          weekdays,
          startTime,
          endTime,
          label: normalizedLabel,
        };
      })
      .filter(Boolean);
  }

  /** Partilha de receita da agenda (0–100 % para o profissional); `null` = não aplicar (legado). */
  function normalizeServiceProfessionalSharePctFromApi(raw) {
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
    if (Number.isNaN(n)) {
      return null;
    }
    if (n < 0 || n > 100) {
      return null;
    }
    return n;
  }

  function parseServiceProfessionalSharePctInput(raw) {
    const s = String(raw ?? '').trim().replace(',', '.');
    if (s === '') {
      return null;
    }
    const n = Number(s);
    if (Number.isNaN(n)) {
      return null;
    }
    return n;
  }

  function normalizePreferredPosTerminalId(raw) {
    const id = String(raw ?? '').trim();
    return id || null;
  }

  function asPosTerminalList(raw) {
    if (Array.isArray(raw)) {
      return raw;
    }
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.items)) {
        return raw.items;
      }
      if (Array.isArray(raw.data)) {
        return raw.data;
      }
    }
    return [];
  }

  function normalizePosTerminal(item) {
    return {
      id: String(item?.id || '').trim(),
      name: String(item?.name || 'Terminal').trim(),
      unitId: item?.unitId == null || item?.unitId === '' ? null : String(item.unitId).trim(),
      unitName: String(item?.unitName || '').trim(),
    };
  }

  function filterPosTerminalsForProfessional(professional) {
    const terminals = Array.isArray(state.posTerminals) ? state.posTerminals : [];
    const branchIds = Array.isArray(professional?.branchIds)
      ? professional.branchIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (!branchIds.length) {
      return terminals;
    }
    return terminals.filter((terminal) => !terminal.unitId || branchIds.includes(terminal.unitId));
  }

  function formatPosTerminalOptionLabel(terminal) {
    const name = terminal?.name || 'Terminal';
    return terminal?.unitName ? `${name} — ${terminal.unitName}` : name;
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }

  function writeStorage(key, value) {
    try {
      if (!value) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function resolveSessionTenantId(session) {
    if (!session || typeof session !== 'object') {
      return '';
    }
    return String(
      session.activeTenantId
      || session.tenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || '',
    ).trim();
  }

  function readPreferredLoginTenantId() {
    const fromAuth = window.ReservaAiAuth?.getPreferredLoginTenantId?.();
    if (fromAuth) {
      return String(fromAuth).trim();
    }
    return String(readStorage(LOGIN_TENANT_STORAGE_KEY) || '').trim();
  }

  function resolveInitialOperatorTenantId(session, tenantOptions) {
    const options = Array.isArray(tenantOptions) ? tenantOptions : [];
    const ids = new Set(options.map((tenant) => String(tenant?.id || '').trim()).filter(Boolean));
    const pick = (candidate) => {
      const id = String(candidate || '').trim();
      return id && ids.has(id) ? id : '';
    };
    return pick(resolveSessionTenantId(session))
      || pick(readPreferredLoginTenantId())
      || pick(readStorage(TENANT_STORAGE_KEY))
      || pick(options[0]?.id);
  }

  function syncSelectedTenantFromSession(session, options = {}) {
    const { persist = true, render = false } = options;
    const tenantOptions = state.tenantOptions.length ? state.tenantOptions : [];
    const nextId = resolveInitialOperatorTenantId(session || state.session, tenantOptions);
    if (!nextId) {
      return false;
    }
    const changed = state.selectedTenantId !== nextId;
    state.selectedTenantId = nextId;
    if (persist) {
      writeStorage(TENANT_STORAGE_KEY, nextId);
    }
    if (render || changed) {
      renderTenantOptions();
    }
    return changed;
  }

  function requestExternal(path, options = {}) {
    const token = window.ReservaAiAuth?.getAccessToken?.() || state.session?.externalAccessToken || '';
    if (!token) {
      window.ReservaAiAuth?.redirectToLogin?.('token_required');
      return Promise.reject(new Error('Sessão autenticada indisponível.'));
    }

    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);

    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(`${externalApiBaseUrl}${path}`, {
      ...options,
      headers,
      credentials: 'omit',
      mode: 'cors',
    }).then(async (response) => {
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => '');

      if (response.status === 401) {
        window.ReservaAiAuth?.clearSession?.();
        window.ReservaAiAuth?.redirectToLogin?.('token_required');
        throw new Error('Sessão de integração expirada.');
      }

      if (!response.ok) {
        throw window.EngageUserMessages?.buildHttpError
          ? window.EngageUserMessages.buildHttpError(response.status, payload, { context: 'settings' })
          : new Error('Não foi possível atualizar as configurações.');
      }

      return payload;
    });
  }

  function setStatus(message, tone) {
    [state.dom.status, state.dom.servicesStatus, state.dom.professionalsStatus].filter(Boolean).forEach((status) => {
      status.textContent = message;
      status.dataset.tone = tone || 'neutral';
    });
  }

  async function recordAudit(actionType, entityType, entityId, description, details) {
    await window.ReservaAiAdminAudit?.record?.({
      sourceModule: 'operacao',
      actionType,
      entityType,
      entityId,
      description,
      details,
    });
  }

  function buildDefaultConfig() {
    return {
      botEnabled: true,
      agentType: 'solar',
      calendarProvider: 'internal',
      multiBranch: false,
      professionalSchedule: true,
      whatsappWelcomeReplyButtons: true,
      autoSchedule: true,
      staffAgendaWhatsapp: false,
      appointmentConfirmation: true,
      allowAppointmentConfirmationWithoutPayment: false,
      cancelWithoutConfirmation: false,
      allowOverlappingAppointments: false,
      reactivation: false,
      sameDayPriority: true,
      enableServiceConfirmation: false,
      enableBookingReminder: false,
      enableAutoCustomerIngest: false,
      enableServicePackages: false,
      enableHaircutPhotoHistory: false,
      haircutPhotosPromptMode: 'manual_only',
      reminderMinutesBefore: 60,
      staffAgendaFallbackPhone: '',
      workingDays: [1, 2, 3, 4, 5, 6],
      startTime: '08:00',
      endTime: '20:00',
      serviceDurationDefaultMinutes: 40,
      slotIntervalMinutes: 20,
      minimumBookingLeadMinutes: 0,
      services: [],
      branchServiceOverrides: {},
    };
  }

  function isSolarSettingsUi() {
    return Boolean(state.dom.solarEnabled);
  }

  function isSolarFeatureEnabled(features) {
    if (!features || typeof features !== 'object') return false;
    const nested = features.features;
    if (nested && typeof nested === 'object' && typeof nested[SOLAR_FEATURE_KEY] === 'boolean') {
      return nested[SOLAR_FEATURE_KEY];
    }
    if (typeof features[SOLAR_FEATURE_KEY] === 'boolean') return features[SOLAR_FEATURE_KEY];
    return false;
  }

  function parseSolarEnergyConfig(raw) {
    const defaults = { ...DEFAULT_SOLAR_ENERGY_PARAMS };
    if (!raw || typeof raw !== 'object') return defaults;
    const source = raw;
    const custo = Number(source.custo_por_kwp);
    const eficiencia = Number(source.eficiencia);
    const fator = Number(source.fator_geracao);
    return {
      custo_por_kwp: Number.isFinite(custo) && custo > 0 ? custo : defaults.custo_por_kwp,
      eficiencia: Number.isFinite(eficiencia) && eficiencia > 0 && eficiencia <= 1 ? eficiencia : defaults.eficiencia,
      fator_geracao: Number.isFinite(fator) && fator > 0 ? fator : defaults.fator_geracao,
      billUploadInviteText: typeof source.billUploadInviteText === 'string' ? source.billUploadInviteText : '',
      simulationFollowUpText: typeof source.simulationFollowUpText === 'string' ? source.simulationFollowUpText : '',
      hideEconomiaInReply: source.hideEconomiaInReply === true,
      hideInvestimentoInReply: source.hideInvestimentoInReply === true,
      hidePaybackInReply: source.hidePaybackInReply === true,
    };
  }

  function hydrateSolarFromSettings(settings) {
    state.solarEnabled = isSolarFeatureEnabled(settings?.features);
    state.solarEnergyConfig = parseSolarEnergyConfig(settings?.solarEnergyConfig);
  }

  function applySolarPanelVisibility() {
    if (!state.dom.solarPanel || !state.dom.solarEnabled) return;
    const enabled = state.dom.solarEnabled.checked === true;
    state.solarEnabled = enabled;
    state.dom.solarPanel.hidden = !enabled;
  }

  function renderSolarForm() {
    if (!state.dom.solarEnabled || !state.solarEnergyConfig) return;
    const solar = state.solarEnergyConfig;
    const readonly = !canManageSelectedTenant();
    state.dom.solarEnabled.checked = state.solarEnabled === true;
    state.dom.solarCustoKwp.value = String(solar.custo_por_kwp);
    state.dom.solarEficiencia.value = String(solar.eficiencia);
    state.dom.solarFatorGeracao.value = String(solar.fator_geracao);
    state.dom.solarBillInvite.value = solar.billUploadInviteText || '';
    state.dom.solarFollowUp.value = solar.simulationFollowUpText || '';
    if (state.dom.solarHideEconomia) state.dom.solarHideEconomia.checked = solar.hideEconomiaInReply === true;
    if (state.dom.solarHideInvestimento) state.dom.solarHideInvestimento.checked = solar.hideInvestimentoInReply === true;
    if (state.dom.solarHidePayback) state.dom.solarHidePayback.checked = solar.hidePaybackInReply === true;
    [
      state.dom.solarEnabled,
      state.dom.solarCustoKwp,
      state.dom.solarEficiencia,
      state.dom.solarFatorGeracao,
      state.dom.solarBillInvite,
      state.dom.solarFollowUp,
      state.dom.solarHideEconomia,
      state.dom.solarHideInvestimento,
      state.dom.solarHidePayback,
    ].forEach((el) => {
      if (el) el.disabled = readonly;
    });
    applySolarPanelVisibility();
  }

  function collectSolarPayload() {
    const defaults = DEFAULT_SOLAR_ENERGY_PARAMS;
    const custo = Number(state.dom.solarCustoKwp?.value);
    const eficiencia = Number(state.dom.solarEficiencia?.value);
    const fator = Number(state.dom.solarFatorGeracao?.value);
    const payload = {
      custo_por_kwp: Number.isFinite(custo) && custo > 0 ? custo : defaults.custo_por_kwp,
      eficiencia: Number.isFinite(eficiencia) && eficiencia > 0 && eficiencia <= 1 ? eficiencia : defaults.eficiencia,
      fator_geracao: Number.isFinite(fator) && fator > 0 ? fator : defaults.fator_geracao,
    };
    const billInvite = String(state.dom.solarBillInvite?.value || '').trim();
    const followUp = String(state.dom.solarFollowUp?.value || '').trim();
    if (billInvite) payload.billUploadInviteText = billInvite;
    if (followUp) payload.simulationFollowUpText = followUp;
    if (state.dom.solarHideEconomia?.checked) payload.hideEconomiaInReply = true;
    if (state.dom.solarHideInvestimento?.checked) payload.hideInvestimentoInReply = true;
    if (state.dom.solarHidePayback?.checked) payload.hidePaybackInReply = true;
    return payload;
  }

  function buildDefaultPaymentConfig() {
    return {
      enabled: false,
      requirePayment: false,
      schedulePaymentsEnabled: false,
      neverChargeReschedule: false,
      depositAmount: 1,
      expirationMinutes: 30,
      discountEnabled: false,
      discountType: 'percentage',
      discountValue: 0,
      pixPayerDocumentTenant: '',
      manualPixFlowEnabled: false,
      manualPixKey: '',
      enableSplitPayments: false,
      unitId: '',
      unitOverride: false,
      provider: 'mercado_pago',
      accessToken: '',
      accountId: '',
      pixPayerDocumentUnit: '',
    };
  }


  const CRM_PROGRESSIVE_FIELD_ORDER = [
    'full_name', 'preferred_name', 'email', 'birth_date', 'cpf', 'gender',
    'zip_code', 'street', 'number', 'complement', 'neighborhood', 'city', 'state',
    'notes', 'source_note', 'whatsapp_opt_in', 'lgpd_consent',
  ];

  const CRM_FIELD_LABELS = {
    full_name: 'Nome completo',
    preferred_name: 'Nome preferido',
    email: 'Email',
    birth_date: 'Data de nascimento',
    cpf: 'CPF / Documento',
    gender: 'Gênero',
    zip_code: 'CEP',
    street: 'Rua',
    number: 'Número',
    complement: 'Complemento',
    neighborhood: 'Bairro',
    city: 'Cidade',
    state: 'Estado',
    notes: 'Observações',
    source_note: 'Observação de origem',
    whatsapp_opt_in: 'Consentimento WhatsApp',
    lgpd_consent: 'Consentimento LGPD',
  };

  const CRM_TRIGGER_OPTIONS = [
    { value: 'before_booking_confirmation', label: 'Antes de concluir agendamento', botLive: true },
    { value: 'after_booking', label: 'Após agendamento', botLive: true },
    { value: 'post_service', label: 'Pós atendimento', botLive: false },
    { value: 'payment_or_invoice', label: 'Cobrança / faturamento', botLive: false },
    { value: 'before_campaign', label: 'Antes de campanhas', botLive: false },
    { value: 'manual_contextual', label: 'Manual (contexto)', botLive: false },
  ];

  const CRM_VALID_TRIGGERS = new Set(CRM_TRIGGER_OPTIONS.map((item) => item.value));

  const CRM_FIELD_DEFAULTS = {
    full_name: { enabled: false, trigger: 'before_booking_confirmation', cooldownDays: 90 },
    preferred_name: { enabled: false, trigger: 'after_booking', cooldownDays: 90 },
    email: { enabled: false, trigger: 'after_booking', cooldownDays: 30 },
    birth_date: { enabled: false, trigger: 'post_service', cooldownDays: 180 },
    cpf: { enabled: false, trigger: 'payment_or_invoice', cooldownDays: 365 },
    gender: { enabled: false, trigger: 'post_service', cooldownDays: 365 },
    zip_code: { enabled: false, trigger: 'after_booking', cooldownDays: 180 },
    street: { enabled: false, trigger: 'after_booking', cooldownDays: 180 },
    number: { enabled: false, trigger: 'after_booking', cooldownDays: 180 },
    complement: { enabled: false, trigger: 'after_booking', cooldownDays: 180 },
    neighborhood: { enabled: false, trigger: 'after_booking', cooldownDays: 180 },
    city: { enabled: false, trigger: 'after_booking', cooldownDays: 180 },
    state: { enabled: false, trigger: 'after_booking', cooldownDays: 180 },
    notes: { enabled: false, trigger: 'manual_contextual', cooldownDays: 30 },
    source_note: { enabled: false, trigger: 'manual_contextual', cooldownDays: 365 },
    whatsapp_opt_in: { enabled: false, trigger: 'before_campaign', cooldownDays: 365 },
    lgpd_consent: { enabled: false, trigger: 'before_campaign', cooldownDays: 365 },
  };

  const CRM_FIELD_HINTS = {
    full_name: 'Nome completo para registo/atendimento. No ingest WhatsApp fica vazio até o cliente responder.',
    preferred_name: 'Preenchido automaticamente com o nome do perfil WhatsApp — não é o nome oficial do cadastro.',
  };

  function clampCrmInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function mergeCrmEnrichmentConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const fields = {};
    CRM_PROGRESSIVE_FIELD_ORDER.forEach((key) => {
      const def = CRM_FIELD_DEFAULTS[key];
      const row = src.fields && typeof src.fields === 'object' ? src.fields[key] : null;
      const triggerRaw = row && row.trigger != null ? String(row.trigger) : def.trigger;
      fields[key] = {
        enabled: row?.enabled === true,
        trigger: CRM_VALID_TRIGGERS.has(triggerRaw) ? triggerRaw : def.trigger,
        cooldownDays: clampCrmInt(row?.cooldownDays, 0, 3650, def.cooldownDays),
      };
    });
    return {
      enabled: src.enabled === true,
      maxQuestionsPerConversation: clampCrmInt(src.maxQuestionsPerConversation, 0, 50, 1),
      minimumDaysBetweenQuestions: clampCrmInt(src.minimumDaysBetweenQuestions, 0, 3650, 15),
      fields,
    };
  }

  function buildDefaultCrmEnrichmentConfig() {
    return mergeCrmEnrichmentConfig(null);
  }

  function buildCrmEnrichmentPayload(crm) {
    const normalized = mergeCrmEnrichmentConfig(crm);
    return {
      enabled: normalized.enabled,
      maxQuestionsPerConversation: normalized.maxQuestionsPerConversation,
      minimumDaysBetweenQuestions: normalized.minimumDaysBetweenQuestions,
      fields: normalized.fields,
    };
  }

  function canManageSelectedTenant() {
    const perms = window.ReservaPermissions;
    if (perms?.canManageOperatorTenant) {
      return perms.canManageOperatorTenant(
        state.session,
        state.selectedTenantId,
        state.tenantOptions,
        state.me,
      );
    }
    if (!state.selectedTenantId) return false;
    if (state.me?.platformRole === 'PLATFORM_ADMIN') return true;
    const tenant = (state.tenantOptions || []).find((item) => item.id === state.selectedTenantId);
    return tenant?.canManageTenant !== false;
  }

  function applyCrmReadonlyState() {
    const readonly = !canManageSelectedTenant();
    const controls = [
      state.dom.crmEnabled,
      state.dom.crmMaxQuestions,
      state.dom.crmMinDays,
      state.dom.crmSave,
      ...(state.dom.crmFields?.querySelectorAll('input, select, button') || []),
    ].filter(Boolean);
    controls.forEach((el) => {
      if (el === state.dom.crmSave) {
        el.disabled = readonly;
      } else {
        el.disabled = readonly;
      }
    });
  }

  function applyCrmMasterToggleUi() {
    const on = state.dom.crmEnabled?.checked === true;
    state.dom.crmGlobal?.classList.toggle('is-muted', !on);
    state.dom.crmFields?.classList.toggle('is-muted', !on);
  }

  function renderCrmTriggerOptions(selected) {
    return CRM_TRIGGER_OPTIONS.map((opt) => {
      const badge = opt.botLive
        ? ''
        : ' (em breve no bot)';
      return `<option value="${escapeHtml(opt.value)}"${opt.value === selected ? ' selected' : ''}>${escapeHtml(opt.label)}${escapeHtml(badge)}</option>`;
    }).join('');
  }

  function renderCrmFields() {
    if (!state.dom.crmFields || !state.crmEnrichment) return;
    const crm = state.crmEnrichment;
    state.dom.crmFields.innerHTML = CRM_PROGRESSIVE_FIELD_ORDER.map((key) => {
      const field = crm.fields[key] || CRM_FIELD_DEFAULTS[key];
      const label = CRM_FIELD_LABELS[key] || key;
      const hint = CRM_FIELD_HINTS[key];
      const triggerMeta = CRM_TRIGGER_OPTIONS.find((item) => item.value === field.trigger);
      const triggerBadge = triggerMeta?.botLive
        ? '<span class="operator-crm-badge operator-crm-badge--live">Ativo no bot</span>'
        : '<span class="operator-crm-badge operator-crm-badge--soon">Em breve</span>';
      return `
        <article class="operator-crm-field-card" data-crm-field="${escapeHtml(key)}">
          <header class="operator-crm-field-head">
            <strong>${escapeHtml(label)}</strong>
            <label class="operator-crm-field-active">
              <input type="checkbox" data-crm-field-enabled ${field.enabled ? 'checked' : ''} />
              <span>Ativo</span>
            </label>
          </header>
          <div class="operator-crm-field-grid">
            <label class="operator-config-field">
              <span>Gatilho ${triggerBadge}</span>
              <select data-crm-field-trigger>${renderCrmTriggerOptions(field.trigger)}</select>
            </label>
            <label class="operator-config-field">
              <span>Cooldown (dias)</span>
              <input type="number" data-crm-field-cooldown min="0" max="3650" step="1" value="${escapeHtml(String(field.cooldownDays))}" />
            </label>
          </div>
          ${hint ? `<p class="operator-crm-field-hint">${escapeHtml(hint)}</p>` : ''}
        </article>
      `;
    }).join('');

    state.dom.crmFields.querySelectorAll('[data-crm-field-trigger]').forEach((select) => {
      select.addEventListener('change', () => {
        const card = select.closest('[data-crm-field]');
        const badgeWrap = card?.querySelector('.operator-crm-field-head + .operator-crm-field-grid label span');
        if (!card) return;
        const meta = CRM_TRIGGER_OPTIONS.find((item) => item.value === select.value);
        const labelSpan = card.querySelector('.operator-config-field span');
        if (labelSpan && meta) {
          const badge = meta.botLive
            ? '<span class="operator-crm-badge operator-crm-badge--live">Ativo no bot</span>'
            : '<span class="operator-crm-badge operator-crm-badge--soon">Em breve</span>';
          labelSpan.innerHTML = `Gatilho ${badge}`;
        }
      });
    });

    applyCrmMasterToggleUi();
    applyCrmReadonlyState();
  }

  function renderCrmForm() {
    if (!state.crmEnrichment) {
      state.crmEnrichment = buildDefaultCrmEnrichmentConfig();
    }
    const crm = state.crmEnrichment;
    if (state.dom.crmEnabled) state.dom.crmEnabled.checked = crm.enabled === true;
    if (state.dom.crmMaxQuestions) state.dom.crmMaxQuestions.value = String(crm.maxQuestionsPerConversation);
    if (state.dom.crmMinDays) state.dom.crmMinDays.value = String(crm.minimumDaysBetweenQuestions);
    renderCrmFields();
  }

  function collectCrmFromForm() {
    const fields = {};
    CRM_PROGRESSIVE_FIELD_ORDER.forEach((key) => {
      const card = state.dom.crmFields?.querySelector(`[data-crm-field="${key}"]`);
      if (!card) {
        fields[key] = { ...CRM_FIELD_DEFAULTS[key] };
        return;
      }
      const enabled = card.querySelector('[data-crm-field-enabled]')?.checked === true;
      const trigger = card.querySelector('[data-crm-field-trigger]')?.value || CRM_FIELD_DEFAULTS[key].trigger;
      const cooldownDays = clampCrmInt(
        card.querySelector('[data-crm-field-cooldown]')?.value,
        0,
        3650,
        CRM_FIELD_DEFAULTS[key].cooldownDays,
      );
      fields[key] = {
        enabled,
        trigger: CRM_VALID_TRIGGERS.has(trigger) ? trigger : CRM_FIELD_DEFAULTS[key].trigger,
        cooldownDays,
      };
    });
    return mergeCrmEnrichmentConfig({
      enabled: state.dom.crmEnabled?.checked === true,
      maxQuestionsPerConversation: state.dom.crmMaxQuestions?.value,
      minimumDaysBetweenQuestions: state.dom.crmMinDays?.value,
      fields,
    });
  }

  async function saveCrmSettings() {
    if (!state.selectedTenantId) {
      setStatus('Selecione uma empresa para salvar o CRM.', 'warn');
      return;
    }
    if (!canManageSelectedTenant()) {
      setStatus('Sem permissão para alterar configurações desta empresa.', 'warn');
      return;
    }

    state.crmEnrichment = collectCrmFromForm();
    setStatus('Salvando CRM Progressivo...', 'neutral');

    const latestTenantSettings = sanitizeTenantSettingsForPut(await fetchLatestTenantSettingsForSave());
    const payload = {
      ...latestTenantSettings,
      botEnabled: typeof latestTenantSettings.botEnabled === 'boolean'
        ? latestTenantSettings.botEnabled
        : state.config.botEnabled,
      agentConfig: {
        ...(latestTenantSettings.agentConfig || {}),
        crmEnrichment: buildCrmEnrichmentPayload(state.crmEnrichment),
      },
      tenantFeatures: latestTenantSettings.tenantFeatures || undefined,
    };

    await requestExternal(`/tenant-settings${tenantQuery()}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    await recordAudit(
      'CRM_ENRICHMENT_UPDATED',
      'tenant-settings',
      state.selectedTenantId,
      'Configuração CRM Progressivo atualizada.',
      { tenantId: state.selectedTenantId, enabled: state.crmEnrichment.enabled },
    );

    setStatus('CRM Progressivo salvo com sucesso.', 'success');
    await loadWorkspace();
  }

  function buildDefaultProfessionalTypeOptions() {
    return [
      { value: 'BARBER', label: 'Barber' },
      { value: 'HAIRDRESSER', label: 'Hairdresser' },
      { value: 'MANICURIST', label: 'Manicurist' },
      { value: 'BEAUTICIAN', label: 'Beautician' },
      { value: 'OTHER', label: 'Other' },
    ];
  }

  function normalizeProfessionalTypeValue(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) {
      return '';
    }

    const allowedValues = new Set(['BARBER', 'HAIRDRESSER', 'MANICURIST', 'BEAUTICIAN', 'OTHER']);
    return allowedValues.has(normalized) ? normalized : normalized;
  }

  function haircutFlagsStorageKey(tenantId) {
    return `reserva:haircutFeatureFlags:${String(tenantId || '').trim()}`;
  }

  function readHaircutFlagsFromBrowserStorage(tenantId) {
    const tid = String(tenantId || '').trim();
    if (!tid) {
      return null;
    }
    try {
      const raw = sessionStorage.getItem(haircutFlagsStorageKey(tid));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function persistHaircutFlagsToBrowserStorage(tenantId, config) {
    const tid = String(tenantId || '').trim();
    if (!tid || !config || typeof config !== 'object') {
      return;
    }
    const next = {
      enableHaircutPhotoHistory: config.enableHaircutPhotoHistory === true,
      haircutPhotosPromptMode: config.haircutPhotosPromptMode || 'manual_only',
    };
    const existing = readHaircutFlagsFromBrowserStorage(tid);
    if (!next.enableHaircutPhotoHistory && existing?.enableHaircutPhotoHistory) {
      return;
    }
    try {
      sessionStorage.setItem(haircutFlagsStorageKey(tid), JSON.stringify(next));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function normalizeTenantSettings(payload) {
    const settings = payload || {};
    const agentConfig = settings.agentConfig || {};
    const schedule = agentConfig.schedule || {};
    const calendar = agentConfig.calendar || {};
    const features = agentConfig.features || {};
    const tenantFeatures = settings.tenantFeatures || {};
    const branchScheduleOverrides = agentConfig.branchScheduleOverrides || {};
    const defaultConfig = buildDefaultConfig();
    const minimumBookingLeadMinutesRaw = Number(schedule.minimumBookingLeadMinutes);
    const minimumBookingLeadMinutes = Number.isFinite(minimumBookingLeadMinutesRaw)
      ? Math.min(240, Math.max(0, Math.round(minimumBookingLeadMinutesRaw)))
      : defaultConfig.minimumBookingLeadMinutes;

    return {
      botEnabled: typeof settings.botEnabled === 'boolean' ? settings.botEnabled : defaultConfig.botEnabled,
      agentType: agentConfig.agent_type || defaultConfig.agentType,
      calendarProvider: calendar.provider || defaultConfig.calendarProvider,
      multiBranch: typeof features.branches_enabled === 'boolean'
        ? features.branches_enabled
        : typeof features.multi_branch === 'boolean'
          ? features.multi_branch
        : typeof features.multiBranch === 'boolean'
          ? features.multiBranch
          : defaultConfig.multiBranch,
      professionalSchedule: typeof features.professional_schedule === 'boolean' ? features.professional_schedule : defaultConfig.professionalSchedule,
      whatsappWelcomeReplyButtons: typeof features.whatsapp_welcome_reply_buttons === 'boolean'
        ? features.whatsapp_welcome_reply_buttons
        : defaultConfig.whatsappWelcomeReplyButtons,
      autoSchedule: typeof features.auto_schedule === 'boolean'
        ? features.auto_schedule
        : defaultConfig.autoSchedule,
      staffAgendaWhatsapp: typeof features.staff_agenda_whatsapp === 'boolean'
        ? features.staff_agenda_whatsapp
        : defaultConfig.staffAgendaWhatsapp,
      appointmentConfirmation: typeof features.appointment_confirmation === 'boolean'
        ? features.appointment_confirmation
        : defaultConfig.appointmentConfirmation,
      allowAppointmentConfirmationWithoutPayment: typeof features.allow_appointment_confirmation_without_payment === 'boolean'
        ? features.allow_appointment_confirmation_without_payment
        : defaultConfig.allowAppointmentConfirmationWithoutPayment,
      cancelWithoutConfirmation: typeof features.cancel_without_confirmation === 'boolean'
        ? features.cancel_without_confirmation
        : defaultConfig.cancelWithoutConfirmation,
      allowOverlappingAppointments: typeof features.allow_overlapping_appointments === 'boolean'
        ? features.allow_overlapping_appointments
        : defaultConfig.allowOverlappingAppointments,
      reactivation: typeof features.reactivation === 'boolean'
        ? features.reactivation
        : defaultConfig.reactivation,
      sameDayPriority: typeof features.same_day_priority === 'boolean'
        ? features.same_day_priority
        : defaultConfig.sameDayPriority,
      enableServiceConfirmation: typeof tenantFeatures.enableServiceConfirmation === 'boolean'
        ? tenantFeatures.enableServiceConfirmation
        : defaultConfig.enableServiceConfirmation,
      enableBookingReminder: typeof tenantFeatures.enableBookingReminder === 'boolean'
        ? tenantFeatures.enableBookingReminder
        : defaultConfig.enableBookingReminder,
      enableAutoCustomerIngest: tenantFeatures.enableAutoCustomerIngest === true,
      enableServicePackages: tenantFeatures.enableServicePackages === true,
      enableHaircutPhotoHistory: tenantFeatures.enableHaircutPhotoHistory === true,
      haircutPhotosPromptMode: ['ask_every_time', 'ask_once_per_day', 'manual_only', 'off'].includes(tenantFeatures.haircutPhotosPromptMode)
        ? tenantFeatures.haircutPhotosPromptMode
        : defaultConfig.haircutPhotosPromptMode,
      reminderMinutesBefore: Number(tenantFeatures.reminderMinutesBefore || defaultConfig.reminderMinutesBefore),
      staffAgendaFallbackPhone: agentConfig.staffAgendaFallbackPhone || defaultConfig.staffAgendaFallbackPhone,
      workingDays: Array.isArray(schedule.workingDays) && schedule.workingDays.length ? schedule.workingDays.map(Number) : defaultConfig.workingDays,
      startTime: schedule.startTime || defaultConfig.startTime,
      endTime: schedule.endTime || defaultConfig.endTime,
      serviceDurationDefaultMinutes: Number(schedule.serviceDurationDefaultMinutes || defaultConfig.serviceDurationDefaultMinutes),
      slotIntervalMinutes: Number(schedule.slotIntervalMinutes || defaultConfig.slotIntervalMinutes),
      minimumBookingLeadMinutes,
      services: Array.isArray(agentConfig.services)
        ? agentConfig.services.map((service, index) => ({
            id: service.id || `service-${index}-${Date.now()}`,
            name: service.name || '',
            durationMinutes: Number(service.durationMinutes || 0),
            price: service.price === undefined || service.price === null || service.price === '' ? '' : Number(service.price),
          }))
        : [],
      branchServiceOverrides: Object.entries(branchScheduleOverrides || {}).reduce((accumulator, [branchId, override]) => {
        const overrideServices = Array.isArray(override?.services) ? override.services : [];
        accumulator[branchId] = {
          services: overrideServices
            .map((service) => {
              if (typeof service === 'string') {
                const name = service.trim();
                return name ? { name } : null;
              }
              const name = String(service?.name || '').trim();
              return name ? { ...service, name } : null;
            })
            .filter(Boolean),
        };
        return accumulator;
      }, {}),
    };
  }

  function normalizeBranch(branch, index) {
    return {
      id: branch?.id || '',
      name: branch?.name || '',
      address: branch?.address || '',
      sortOrder: branch?.sortOrder ?? index,
      isDefault: Boolean(branch?.isDefault),
      serviceNames: Array.isArray(branch?.serviceNames) ? branch.serviceNames.filter(Boolean) : [],
    };
  }

  function normalizeProfessional(professional, index) {
    const branchIds = Array.isArray(professional?.branchIds)
      ? professional.branchIds
      : Array.isArray(professional?.branchLinks)
        ? professional.branchLinks.map((item) => item.branchId || item.branch?.id).filter(Boolean)
        : [];
    const services = Array.isArray(professional?.services)
      ? professional.services.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean)
      : [];
    const scheduleObj = professional?.schedule && typeof professional.schedule === 'object' ? professional.schedule : {};
    const scheduleFromList = Array.isArray(professional?.schedules) && professional.schedules.length ? professional.schedules[0] : null;
    const workingDaysResolved = Array.isArray(scheduleObj.workingDays) && scheduleObj.workingDays.length
      ? normalizeWeekdayValues(scheduleObj.workingDays)
      : Array.isArray(scheduleFromList?.weekDays)
        ? normalizeWeekdayValues(scheduleFromList.weekDays)
        : [1, 2, 3, 4, 5, 6];

    const avatarBase64 = String(
      professional?.avatarBase64
      || professional?.user?.avatarBase64
      || ''
    ).trim();
    const avatarViewUrl = String(
      professional?.avatarViewUrl
      || professional?.avatarUrl
      || professional?.user?.avatarViewUrl
      || professional?.user?.avatarUrl
      || ''
    ).trim();
    const avatarSrc = avatarBase64 || avatarViewUrl;

    return {
      id: professional?.id || '',
      name: professional?.name || '',
      userId: professional?.userId
        || professional?.usuarioId
        || professional?.user?.id
        || professional?.meta?.userId
        || professional?.meta?.usuarioId
        || '',
      linkedUserEmail: professional?.user?.email || '',
      linkedUserName: professional?.user?.fullName || professional?.user?.name || '',
      linkedUserRole: professional?.user?.role || '',
      avatarBase64,
      avatarViewUrl,
      avatarSrc,
      type: normalizeProfessionalTypeValue(professional?.type) || 'BARBER',
      isActive: professional?.isActive !== false,
      whatsappPhone: professional?.whatsappPhone || '',
      services,
      branchIds,
      branchId: branchIds[0] || '',
      serviceProfessionalSharePct: normalizeServiceProfessionalSharePctFromApi(
        professional?.serviceProfessionalSharePct ?? professional?.service_professional_share_pct,
      ),
      preferredPosTerminalId: normalizePreferredPosTerminalId(
        professional?.preferredPosTerminalId ?? professional?.preferred_pos_terminal_id,
      ),
      schedule: {
        workingDays: workingDaysResolved.length ? workingDaysResolved : [1, 2, 3, 4, 5, 6],
        startTime: String(scheduleObj.startTime || scheduleFromList?.startTime || '08:00').trim(),
        endTime: String(scheduleObj.endTime || scheduleFromList?.endTime || '20:00').trim(),
        weeklyBreaks: normalizeWeeklyBreaks(scheduleObj.weeklyBreaks),
      },
      meta: professional?.meta && typeof professional.meta === 'object' ? { ...professional.meta } : {},
      localKey: professional?.id || `professional-${index}-${Date.now()}`,
    };
  }

  function extractUserPayload(payload) {
    if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
      return payload.data;
    }
    return payload && typeof payload === 'object' ? payload : null;
  }

  function mergeProfessionalAvatarByUserId(userId, userPayload) {
    if (!userId || !userPayload) {
      return false;
    }
    const avatarBase64 = String(userPayload.avatarBase64 || '').trim();
    const avatarViewUrl = String(userPayload.avatarViewUrl || userPayload.avatarUrl || '').trim();
    const avatarSrc = avatarBase64 || avatarViewUrl;
    if (!avatarSrc) {
      return false;
    }
    let changed = false;
    state.professionals = state.professionals.map((professional) => {
      if (professional.userId !== userId || professional.avatarSrc === avatarSrc) {
        return professional;
      }
      changed = true;
      return {
        ...professional,
        avatarBase64,
        avatarViewUrl,
        avatarSrc,
      };
    });
    return changed;
  }

  async function hydrateProfessionalAvatarForUser(userId) {
    if (!userId || state.avatarUsersInFlight.has(userId)) {
      return false;
    }
    state.avatarUsersInFlight.add(userId);
    try {
      const payload = await requestExternal(`/users/${encodeURIComponent(userId)}`);
      return mergeProfessionalAvatarByUserId(userId, extractUserPayload(payload));
    } catch (error) {
      return false;
    } finally {
      state.avatarUsersInFlight.delete(userId);
    }
  }

  async function hydrateProfessionalAvatars() {
    const pendingUserIds = Array.from(new Set(
      state.professionals
        .filter((professional) => professional.userId && !professional.avatarSrc)
        .map((professional) => professional.userId),
    ));
    if (!pendingUserIds.length) {
      return;
    }
    const results = await Promise.all(pendingUserIds.map((userId) => hydrateProfessionalAvatarForUser(userId)));
    if (results.some(Boolean)) {
      renderProfessionals();
    }
  }

  function renderProfessionalAvatarMarkup(professional, className) {
    const initials = escapeHtml((professional?.name || 'P').slice(0, 1).toUpperCase());
    const avatarSrc = String(professional?.avatarSrc || '').trim();
    if (!avatarSrc) {
      return `<span class="${className}">${initials}</span>`;
    }
    return `
      <span class="${className}">
        <img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(professional?.name || 'Profissional')}" loading="lazy" decoding="async" />
      </span>
    `;
  }

  function normalizeTenantMember(member) {
    const safe = member || {};
    const userId = safe.userId || safe.usuarioId || safe.user?.id || safe.id || '';
    const fullName = safe.fullName || safe.name || safe.user?.fullName || safe.user?.name || '';
    const email = safe.email || safe.user?.email || '';
    const role = safe.role || safe.user?.role || '';
    const labelPrimary = fullName || email || 'Usuário sem identificação';
    const labelEmail = email ? ` — ${email}` : '';
    const labelRole = role ? ` — ${role}` : '';
    return {
      userId,
      fullName,
      email,
      role,
      isActive: safe.isActive !== false,
      label: `${labelPrimary}${labelEmail}${labelRole}`,
    };
  }

  function extractTenantMembers(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.items)) {
      return payload.items;
    }
    if (Array.isArray(payload?.data)) {
      return payload.data;
    }
    if (Array.isArray(payload?.members)) {
      return payload.members;
    }
    return [];
  }

  function getGlobalServiceNames() {
    return (state.config?.services || [])
      .map((service) => String(service?.name || '').trim())
      .filter(Boolean);
  }

  function branchOverrideDefinesCatalog(branchId) {
    const raw = state.config?.branchServiceOverrides?.[branchId]?.services;
    return Array.isArray(raw) && raw.length > 0;
  }

  function cloneServiceRow(service, index) {
    return {
      id: service?.id || `service-${index}-${Date.now()}`,
      name: String(service?.name || '').trim(),
      durationMinutes: Number(service?.durationMinutes || 0),
      price: service?.price === undefined || service?.price === null || service?.price === '' ? '' : Number(service.price),
    };
  }

  /** Catálogo efetivo na filial: sem override ou [] → global; substituição com ≥1 serviço → só o override. */
  function resolveEffectiveServiceRowsForBranch(branchId) {
    const global = state.config?.services || [];
    if (!branchId) {
      return global.map((service, index) => cloneServiceRow(service, index));
    }
    const raw = state.config.branchServiceOverrides?.[branchId]?.services;
    if (!Array.isArray(raw) || raw.length === 0) {
      return global.map((service, index) => cloneServiceRow(service, index));
    }
    return raw.map((service, index) => cloneServiceRow(service, index));
  }

  function getEffectiveServiceNamesForBranch(branchId) {
    return resolveEffectiveServiceRowsForBranch(branchId)
      .map((row) => row.name)
      .filter(Boolean);
  }

  function getServiceCatalogIndex() {
    const map = new Map();
    (state.config?.services || []).forEach((service) => {
      const name = String(service?.name || '').trim();
      if (!name) {
        return;
      }
      map.set(name.toLowerCase(), {
        id: service.id || '',
        name,
        durationMinutes: Number(service.durationMinutes) || 0,
        price: service.price === '' || service.price === null || service.price === undefined ? null : Number(service.price),
      });
    });
    return map;
  }

  function getServiceCatalogIndexForBranch(branchId) {
    const map = new Map();
    resolveEffectiveServiceRowsForBranch(branchId).forEach((service) => {
      const name = String(service?.name || '').trim();
      if (!name) {
        return;
      }
      map.set(name.toLowerCase(), {
        id: service.id || '',
        name,
        durationMinutes: Number(service.durationMinutes) || 0,
        price: service.price === '' || service.price === null || service.price === undefined ? null : Number(service.price),
      });
    });
    return map;
  }

  function normalizeServiceNameToCatalog(serviceName) {
    const key = String(serviceName || '').trim().toLowerCase();
    if (!key) {
      return null;
    }
    return getServiceCatalogIndex().get(key)?.name ?? null;
  }

  function normalizeServiceNameToCatalogForBranch(serviceName, branchId) {
    const key = String(serviceName || '').trim().toLowerCase();
    if (!key) {
      return null;
    }
    if (!branchId) {
      return normalizeServiceNameToCatalog(serviceName);
    }
    return getServiceCatalogIndexForBranch(branchId).get(key)?.name ?? null;
  }

  /** Mantém apenas nomes válidos no catálogo atual, casing canônico. */
  function canonicalizeProfessionalServices(services, branchId) {
    const out = [];
    const seen = new Set();
    const bid = String(branchId || '').trim();
    for (const raw of services || []) {
      const name = bid ? normalizeServiceNameToCatalogForBranch(raw, bid) : normalizeServiceNameToCatalog(raw);
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
    return out;
  }

  /**
   * Lê horário, dias e campos do perfil diretamente do DOM antes de salvar.
   * Evita enviar horário antigo quando o <input type="time"> só disparou `change` (sem `input`) no navegador.
   */
  function syncProfessionalDetailFromDom(index) {
    const professional = state.professionals[index];
    const root = state.dom.professionals;
    if (!professional || !root) {
      return;
    }
    const panel = root.querySelector(`section.pro-detail-panel[data-professional-index="${index}"]`);
    if (!panel) {
      return;
    }
    panel.querySelectorAll('[data-professional-schedule]').forEach((el) => {
      const scheduleKey = el.dataset.professionalSchedule;
      if (scheduleKey && professional.schedule) {
        professional.schedule[scheduleKey] = String(el.value || '').trim();
      }
    });
    professional.schedule.workingDays = [...panel.querySelectorAll('input[type="checkbox"][data-professional-day]')]
      .filter((box) => box.checked)
      .map((box) => Number(box.dataset.professionalDay))
      .filter((day) => !Number.isNaN(day))
      .sort((a, b) => a - b);
    professional.schedule.weeklyBreaks = [...panel.querySelectorAll('[data-professional-break-row]')]
      .map((row) => {
        const label = String(row.querySelector('[data-professional-break-field="label"]')?.value || 'Outros').trim() || 'Outros';
        const startTime = String(row.querySelector('[data-professional-break-field="startTime"]')?.value || '').trim();
        const endTime = String(row.querySelector('[data-professional-break-field="endTime"]')?.value || '').trim();
        const weekdays = [...row.querySelectorAll('input[type="checkbox"][data-professional-break-day]')]
          .filter((box) => box.checked)
          .map((box) => Number(box.dataset.professionalBreakDay))
          .filter((day) => !Number.isNaN(day))
          .sort((left, right) => left - right);
        if (!weekdays.length || !startTime || !endTime) {
          return null;
        }
        const normalizedLabel = PROFESSIONAL_BREAK_TYPE_OPTIONS.find((option) => option.toLowerCase() === label.toLowerCase()) || 'Outros';
        return {
          weekdays,
          startTime,
          endTime,
          label: normalizedLabel,
        };
      })
      .filter(Boolean);
    panel.querySelectorAll('[data-professional-field]').forEach((el) => {
      const fieldName = el.dataset.professionalField;
      if (!fieldName) {
        return;
      }
      if (el.type === 'checkbox') {
        professional[fieldName] = el.checked;
      } else if (fieldName === 'serviceProfessionalSharePct') {
        professional[fieldName] = parseServiceProfessionalSharePctInput(el.value);
      } else if (fieldName === 'preferredPosTerminalId') {
        professional[fieldName] = normalizePreferredPosTerminalId(el.value);
      } else {
        professional[fieldName] = el.value;
      }
    });
    if (professional.branchId) {
      professional.branchIds = [professional.branchId];
    }
    professional.services = canonicalizeProfessionalServices(professional.services, professional.branchId);
  }

  function getBranchServiceNames(branchId) {
    if (!branchId) {
      return [];
    }
    const branch = state.branches.find((item) => item.id === branchId);
    if (!branch) {
      return [];
    }
    return Array.isArray(branch.serviceNames) ? branch.serviceNames.filter(Boolean) : [];
  }

  /**
   * Remove da filial serviços que já não existem no catálogo (ex.: troca ou exclusão com override antigo em `branchScheduleOverrides`).
   * Usa sempre o nome canônico do catálogo (casing igual ao cadastro global).
   */
  function pruneBranchServiceNamesAgainstCatalog() {
    state.branches = state.branches.map((branch) => {
      const lowerToCanonical = new Map(
        getEffectiveServiceNamesForBranch(branch.id).map((name) => [name.toLowerCase(), name]),
      );
      const next = [];
      const seenLower = new Set();
      for (const raw of Array.isArray(branch.serviceNames) ? branch.serviceNames : []) {
        const key = String(raw || '').trim().toLowerCase();
        const canon = lowerToCanonical.get(key);
        if (!canon || seenLower.has(key)) {
          continue;
        }
        seenLower.add(key);
        next.push(canon);
      }
      return { ...branch, serviceNames: next };
    });
  }

  function pruneProfessionalsLinkedServicesAgainstBranches() {
    state.professionals.forEach((professional) => {
      professional.services = canonicalizeProfessionalServices(professional.services, professional.branchId);
    });
  }

  function pruneStaleServiceLinksAgainstCatalog() {
    pruneBranchServiceNamesAgainstCatalog();
    pruneProfessionalsLinkedServicesAgainstBranches();
  }

  function buildBranchScheduleOverridesForSave() {
    const previousOverrides = state.rawTenantSettings?.agentConfig?.branchScheduleOverrides || {};
    const globalServicesByName = new Map(
      (state.config?.services || [])
        .map((service) => {
          const name = String(service?.name || '').trim();
          return name ? [name, service] : null;
        })
        .filter(Boolean)
    );
    const nextOverrides = {};

    state.branches.forEach((branch) => {
      if (!branch?.id) {
        return;
      }
      const serviceNames = Array.isArray(branch.serviceNames) ? branch.serviceNames.filter(Boolean) : [];
      const overrideEntry = { ...(previousOverrides[branch.id] || {}) };
      const editorServices = state.config?.branchServiceOverrides?.[branch.id]?.services;
      if (Array.isArray(editorServices) && editorServices.length > 0) {
        overrideEntry.services = editorServices
          .map((service) => {
            const name = String(service?.name || '').trim();
            if (!name) {
              return null;
            }
            const durationMinutes = Number(service.durationMinutes || 0);
            const row = { name, durationMinutes };
            if (service.price !== '' && service.price !== undefined && service.price !== null) {
              row.price = Number(service.price);
            }
            return row;
          })
          .filter(Boolean);
      } else {
        overrideEntry.services = serviceNames.map((name) => {
          const globalService = globalServicesByName.get(name);
          if (globalService) {
            return {
              name,
              durationMinutes: Number(globalService.durationMinutes || 0),
              ...(globalService.price === '' || globalService.price === undefined ? {} : { price: Number(globalService.price) }),
            };
          }
          return { name };
        });
      }
      nextOverrides[branch.id] = overrideEntry;
    });

    return nextOverrides;
  }

  function normalizeProfessionalTypeOptions(payload) {
    const safeArray = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.types)
        ? payload.types
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

    const options = safeArray
      .map((item) => {
        if (typeof item === 'string') {
          const value = normalizeProfessionalTypeValue(item);
          return value ? { value, label: value } : null;
        }

        const value = normalizeProfessionalTypeValue(item?.value || item?.id || item?.type);
        if (!value) {
          return null;
        }

        const label = String(item?.label || item?.name || value).trim();
        return { value, label: label || value };
      })
      .filter(Boolean);

    return options.length ? options : buildDefaultProfessionalTypeOptions();
  }

  function getProfessionalTypeOptions() {
    if (Array.isArray(state.professionalTypeOptions) && state.professionalTypeOptions.length) {
      return state.professionalTypeOptions;
    }

    const derivedFromProfessionals = state.professionals
      .map((professional) => normalizeProfessionalTypeValue(professional?.type))
      .filter(Boolean)
      .map((value) => ({ value, label: value }));

    return derivedFromProfessionals.length ? derivedFromProfessionals : buildDefaultProfessionalTypeOptions();
  }

  function deriveProfessionalTypeOptionsFromProfessionals(professionals) {
    const safeProfessionals = Array.isArray(professionals) ? professionals : [];
    const values = Array.from(
      new Set(
        safeProfessionals
          .map((professional) => normalizeProfessionalTypeValue(professional?.type))
          .filter(Boolean)
      )
    );

    if (!values.length) {
      return buildDefaultProfessionalTypeOptions();
    }

    return values.map((value) => ({ value, label: value }));
  }

  function normalizePaymentConfig(payload) {
    const defaults = buildDefaultPaymentConfig();
    const tenantConfig = payload?.tenantConfig || {};
    const unitConfig = payload?.unitConfig || {};

    return {
      enabled: typeof tenantConfig.enabled === 'boolean' ? tenantConfig.enabled : defaults.enabled,
      requirePayment: typeof tenantConfig.requirePayment === 'boolean' ? tenantConfig.requirePayment : defaults.requirePayment,
      schedulePaymentsEnabled: typeof tenantConfig.schedulePaymentsEnabled === 'boolean' ? tenantConfig.schedulePaymentsEnabled : defaults.schedulePaymentsEnabled,
      neverChargeReschedule: typeof tenantConfig.neverChargeReschedule === 'boolean' ? tenantConfig.neverChargeReschedule : defaults.neverChargeReschedule,
      depositAmount: Number(tenantConfig.depositAmount ?? defaults.depositAmount),
      expirationMinutes: Number(tenantConfig.expirationMinutes ?? defaults.expirationMinutes),
      discountEnabled: typeof tenantConfig.discountEnabled === 'boolean' ? tenantConfig.discountEnabled : defaults.discountEnabled,
      discountType: tenantConfig.discountType || defaults.discountType,
      discountValue: Number(tenantConfig.discountValue ?? defaults.discountValue),
      pixPayerDocumentTenant: tenantConfig.pixPayerDocument || '',
      manualPixFlowEnabled: typeof tenantConfig.manualPixFlowEnabled === 'boolean' ? tenantConfig.manualPixFlowEnabled : defaults.manualPixFlowEnabled,
      manualPixKey: tenantConfig.manualPixKey || '',
      enableSplitPayments: typeof tenantConfig.enableSplitPayments === 'boolean'
        ? tenantConfig.enableSplitPayments
        : (typeof payload?.resolved?.enableSplitPayments === 'boolean'
          ? payload.resolved.enableSplitPayments
          : defaults.enableSplitPayments),
      unitId: '',
      unitOverride: typeof unitConfig.unitOverride === 'boolean' ? unitConfig.unitOverride : defaults.unitOverride,
      provider: unitConfig.provider || defaults.provider,
      accessToken: unitConfig.accessToken || '',
      accountId: unitConfig.accountId || '',
      pixPayerDocumentUnit: unitConfig.pixPayerDocument || '',
    };
  }

  function normalizeTenantOption(tenant) {
    const fromPerms = window.ReservaPermissions?.normalizeTenantOption?.(tenant);
    if (fromPerms) return fromPerms;
    const safe = tenant || {};
    return {
      ...safe,
      id: safe.id || '',
      name: safe.name || safe.legalName || safe.tradeName || 'Empresa sem nome',
      document: safe.document || safe.cnpj || '',
      cnpj: safe.cnpj || safe.document || '',
      businessEmail: safe.businessEmail || safe.email || '',
      email: safe.email || safe.businessEmail || '',
      addressStreet: safe.addressStreet || safe.addressLine1 || '',
      addressLine1: safe.addressLine1 || safe.addressStreet || '',
      addressZipCode: safe.addressZipCode || safe.addressPostalCode || '',
      addressPostalCode: safe.addressPostalCode || safe.addressZipCode || '',
    };
  }

  function tenantQuery() {
    return state.selectedTenantId ? `?tenantId=${encodeURIComponent(state.selectedTenantId)}` : '';
  }

  async function bootstrap() {
    if (state.initialized) {
      return;
    }

    setStatus('Carregando perfil e empresas...', 'neutral');
    const me = await requestExternal('/auth/me');
    state.me = window.ReservaPermissions?.mergeOperatorAuthMe?.(state.session, me) || me;
    if (me.platformRole === 'PLATFORM_ADMIN') {
      const tenants = await requestExternal('/tenants');
      state.tenantOptions = Array.isArray(tenants) ? tenants.map(normalizeTenantOption) : [];
    } else {
      state.tenantOptions = Array.isArray(me.tenants) ? me.tenants.map(normalizeTenantOption) : [];
    }

    syncSelectedTenantFromSession(state.session, { persist: true, render: true });
    state.initialized = true;
  }

  async function loadWorkspace() {
    await bootstrap();
    syncSelectedTenantFromSession(state.session, { persist: true, render: true });

    if (!state.selectedTenantId) {
      state.rawTenantSettings = {};
      state.config = buildDefaultConfig();
      hydrateSolarFromSettings({});
      state.crmEnrichment = buildDefaultCrmEnrichmentConfig();
      state.branches = [];
      state.professionals = [];
      state.posTerminals = [];
      state.tenantMembers = [];
      state.specialDates = [];
      state.specialDatesEditingId = '';
      renderAll();
      if (qs('#operatorSpecialDatesRoot')) {
        void window.ReservaAiOperatorSpecialDates?.onWorkspaceLoaded?.();
      }
      setStatus('Nenhuma empresa disponível para configuração.', 'warn');
      return;
    }

    setStatus('Carregando configurações da operação...', 'neutral');

    const [tenantSettings, branches, professionals, tenantMembersResponse] = await Promise.all([
      requestExternal(`/tenant-settings${tenantQuery()}`),
      requestExternal(`/branches${tenantQuery()}`),
      requestExternal(`/professionals${tenantQuery()}${tenantQuery() ? '&' : '?'}includeBranches=true`),
      requestExternal(`/tenants/${encodeURIComponent(state.selectedTenantId)}/members`),
    ]);

    state.rawTenantSettings = tenantSettings || {};
    state.config = normalizeTenantSettings(tenantSettings);
    hydrateSolarFromSettings(tenantSettings);
    if (state.config) {
      state.config.agentType = 'solar';
    }
    state.crmEnrichment = mergeCrmEnrichmentConfig(tenantSettings?.agentConfig?.crmEnrichment);
    state.branches = Array.isArray(branches) ? branches.map(normalizeBranch) : [];
    const globalServiceNames = (state.config.services || []).map((service) => String(service?.name || '').trim()).filter(Boolean);
    state.branches = state.branches.map((branch) => {
      const overrideServices = state.config.branchServiceOverrides?.[branch.id]?.services;
      let mappedServiceNames;
      if (!Array.isArray(overrideServices)) {
        mappedServiceNames = globalServiceNames.slice();
      } else if (overrideServices.length === 0) {
        mappedServiceNames = globalServiceNames.slice();
      } else {
        mappedServiceNames = overrideServices.map((service) => String(service?.name || '').trim()).filter(Boolean);
      }
      return {
        ...branch,
        serviceNames: Array.from(new Set(mappedServiceNames)),
      };
    });
    pruneBranchServiceNamesAgainstCatalog();
    const showGlobalCatalogChoice = state.config.multiBranch && hasMultipleBranches();
    if (showGlobalCatalogChoice) {
      const prev = state.servicesCatalogBranchId;
      const valid = prev === '' || state.branches.some((b) => b.id === prev);
      if (!valid) {
        state.servicesCatalogBranchId = '';
      }
    } else {
      state.servicesCatalogBranchId = getPrimaryBranch()?.id || '';
    }
    state.professionals = Array.isArray(professionals) ? professionals.map(normalizeProfessional) : [];
    state.professionals = state.professionals.map((professional) => {
      const branchId = professional.branchId || professional.branchIds[0] || '';
      return {
        ...professional,
        branchId,
        branchIds: branchId ? [branchId] : [],
        services: canonicalizeProfessionalServices(professional.services, branchId),
      };
    });
    const tenantMembers = extractTenantMembers(tenantMembersResponse);
    state.tenantMembers = tenantMembers
      .map(normalizeTenantMember)
      .filter((item) => item.userId && item.isActive);
    state.professionalTypeOptions = deriveProfessionalTypeOptionsFromProfessionals(state.professionals);
    try {
      const paymentsPayload = await requestExternal(`/payments/config${tenantQuery()}`);
      state.paymentConfig = normalizePaymentConfig(paymentsPayload);
    } catch (error) {
      state.paymentConfig = buildDefaultPaymentConfig();
      setStatus('Configuração da operação carregada. Pagamentos indisponível no momento.', 'warn');
    }
    try {
      const posTerminalsRaw = await requestExternal(`/pos/terminals${tenantQuery()}`);
      state.posTerminals = asPosTerminalList(posTerminalsRaw)
        .map(normalizePosTerminal)
        .filter((terminal) => terminal.id);
    } catch (_) {
      state.posTerminals = [];
    }
    renderAll();
    if (qs('#operatorSpecialDatesRoot')) {
      void window.ReservaAiOperatorSpecialDates?.onWorkspaceLoaded?.();
    }
    if (qs('#operatorInboxAutoReplyPauseRoot')) {
      void window.EngageInboxAutoReplyPauseConfig?.onWorkspaceLoaded?.();
    }
    if (state.activeTab === 'geral' && typeof window.ReservaAiTenantCompany?.reload === 'function') {
      void window.ReservaAiTenantCompany.reload({
        session: state.session,
        tenantId: state.selectedTenantId,
        me: state.me,
        tenantOptions: state.tenantOptions,
      });
    }
    void hydrateProfessionalAvatars();
    const tenantName = state.tenantOptions.find((tenant) => tenant.id === state.selectedTenantId)?.name || 'empresa atual';
    setStatus(`Configurações carregadas para ${tenantName}.`, 'success');
  }

  function renderTenantOptions() {
    const selects = [state.dom.tenantSelect, state.dom.servicesTenantSelect, state.dom.professionalsTenantSelect].filter(Boolean);
    if (!selects.length) {
      return;
    }

    const markup = state.tenantOptions.length
      ? state.tenantOptions.map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name)}</option>`).join('')
      : '<option value="">Sem empresa</option>';
    selects.forEach((select) => {
      select.innerHTML = markup;
      select.value = state.selectedTenantId || '';
    });
  }

  function getPrimaryBranch() {
    if (!state.branches.length) {
      return null;
    }

    return state.branches.find((branch) => branch.isDefault) || state.branches[0];
  }

  function getVisibleBranches() {
    if (state.config?.multiBranch) {
      return state.branches;
    }

    const primaryBranch = getPrimaryBranch();
    return primaryBranch ? [primaryBranch] : state.branches.slice(0, 1);
  }

  function renderSummary() {
    if (!state.config) {
      return;
    }

    const tenantName = state.tenantOptions.find((tenant) => tenant.id === state.selectedTenantId)?.name || 'Operação sem empresa';
    if (state.dom.title) {
      state.dom.title.textContent = `Configuração operacional de ${tenantName}`;
    }
    if (state.dom.subtitle) {
      state.dom.subtitle.textContent = 'Dados da empresa, motor do atendimento e CRM.';
    }
    if (state.dom.kpis) {
      const kpiItems = isSolarSettingsUi()
        ? [
          { label: 'Bot WhatsApp', value: state.config.botEnabled ? 'Ativo' : 'Inativo', meta: 'Atendimento automático no canal' },
          { label: 'Simulador solar', value: state.solarEnabled ? 'Ativo' : 'Inativo', meta: 'Simulação determinística no WhatsApp' },
          { label: 'CRM progressivo', value: state.crmEnrichment?.enabled ? 'Ativo' : 'Inativo', meta: 'Coleta de dados no WhatsApp' },
          { label: 'Cadastro automático', value: state.config.enableAutoCustomerIngest ? 'Ativo' : 'Inativo', meta: 'Leads criados a partir das conversas' },
        ]
        : [
          { label: 'Bot WhatsApp', value: state.config.botEnabled ? 'Ativo' : 'Inativo', meta: 'Atendimento automático no canal' },
          { label: 'CRM progressivo', value: state.crmEnrichment?.enabled ? 'Ativo' : 'Inativo', meta: 'Coleta de dados no WhatsApp' },
          { label: 'Confirmação automática', value: state.config.appointmentConfirmation ? 'Ativa' : 'Inativa', meta: 'Fluxo de confirmação de agendamentos' },
          { label: 'Cadastro automático', value: state.config.enableAutoCustomerIngest ? 'Ativo' : 'Inativo', meta: 'Clientes criados a partir das conversas' },
        ];
      state.dom.kpis.innerHTML = kpiItems.map((item) => `
        <article class="operator-config-kpi">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(String(item.value))}</strong>
          <p>${escapeHtml(item.meta)}</p>
        </article>
      `).join('');
    }
  }

  function renderPrimaryForm() {
    if (!state.config) {
      return;
    }

    if (isSolarSettingsUi()) {
      renderSolarForm();
      return;
    }

    if (!state.dom.calendarProvider) {
      return;
    }

    state.dom.calendarProvider.value = state.config.calendarProvider;
    state.dom.professionalSchedule.checked = state.config.professionalSchedule;
    state.dom.welcomeReplyButtons.checked = state.config.whatsappWelcomeReplyButtons;
    state.dom.autoSchedule.checked = state.config.autoSchedule;
    state.dom.staffAgendaWhatsapp.checked = state.config.staffAgendaWhatsapp;
    state.dom.appointmentConfirmation.checked = state.config.appointmentConfirmation;
    state.dom.allowConfirmWithoutPayment.checked = state.config.allowAppointmentConfirmationWithoutPayment;
    state.dom.cancelWithoutConfirmation.checked = state.config.cancelWithoutConfirmation;
    state.dom.allowOverlapping.checked = state.config.allowOverlappingAppointments;
    state.dom.reactivation.checked = state.config.reactivation;
    state.dom.sameDayPriority.checked = state.config.sameDayPriority;
    state.dom.enableServiceConfirmation.checked = state.config.enableServiceConfirmation;
    state.dom.enableBookingReminder.checked = state.config.enableBookingReminder;
    if (state.dom.enableAutoCustomerIngest) {
      state.dom.enableAutoCustomerIngest.checked = state.config.enableAutoCustomerIngest === true;
    }
    if (state.dom.enableServicePackages) {
      state.dom.enableServicePackages.checked = state.config.enableServicePackages === true;
    }
    if (state.dom.enableHaircutPhotoHistory) {
      state.dom.enableHaircutPhotoHistory.checked = state.config.enableHaircutPhotoHistory === true;
    }
    if (state.dom.haircutPhotosPromptMode) {
      state.dom.haircutPhotosPromptMode.value = state.config.haircutPhotosPromptMode || 'manual_only';
    }
    if (state.dom.haircutPromptModeWrap) {
      state.dom.haircutPromptModeWrap.hidden = !state.config.enableHaircutPhotoHistory;
    }
    state.dom.reminderMinutesBefore.value = String(state.config.reminderMinutesBefore || 60);
    state.dom.reminderMinutesBefore.disabled = !state.config.enableBookingReminder;
    if (state.dom.fallbackPhone) {
      state.dom.fallbackPhone.value = state.config.staffAgendaFallbackPhone || '';
    }
    if (state.dom.startTime) {
      state.dom.startTime.value = state.config.startTime;
    }
    if (state.dom.endTime) {
      state.dom.endTime.value = state.config.endTime;
    }
    if (state.dom.durationDefault) {
      state.dom.durationDefault.value = String(state.config.serviceDurationDefaultMinutes);
    }
    if (state.dom.slotInterval) {
      state.dom.slotInterval.value = String(state.config.slotIntervalMinutes);
    }
    if (state.dom.minimumBookingLeadMinutes) {
      state.dom.minimumBookingLeadMinutes.value = String(state.config.minimumBookingLeadMinutes ?? 0);
    }
    if (state.dom.workingDays) {
      Array.from(state.dom.workingDays.querySelectorAll('input[type="checkbox"]')).forEach((input) => {
        input.checked = state.config.workingDays.includes(Number(input.value));
      });
    }
  }

  /** Opção "Catálogo global" + filiais: só quando multi-unidade e há 2+ filiais com nome. */
  function catalogPickerHasGlobalOption() {
    return Boolean(state.config?.multiBranch && hasMultipleBranches());
  }

  /** Exibe o combobox Unidade sempre que existir ao menos uma filial na API. */
  function showBranchUnitSelector() {
    return state.branches.some((branch) => String(branch?.id || '').trim());
  }

  function getServicesCatalogEditorBranchId() {
    if (catalogPickerHasGlobalOption()) {
      return String(state.servicesCatalogBranchId || '').trim();
    }
    return String(getPrimaryBranch()?.id || '').trim();
  }

  function isEditingGlobalServicesCatalog() {
    return catalogPickerHasGlobalOption() && state.servicesCatalogBranchId === '';
  }

  function materializeBranchServicesCatalogIfNeeded() {
    const branchId = getServicesCatalogEditorBranchId();
    if (!branchId || isEditingGlobalServicesCatalog()) {
      return;
    }
    if (branchOverrideDefinesCatalog(branchId)) {
      return;
    }
    const rows = resolveEffectiveServiceRowsForBranch(branchId).map((row, index) => cloneServiceRow(row, index));
    if (!state.config.branchServiceOverrides[branchId]) {
      state.config.branchServiceOverrides[branchId] = {};
    }
    state.config.branchServiceOverrides[branchId].services = rows;
    const branchIdx = state.branches.findIndex((b) => b.id === branchId);
    if (branchIdx >= 0) {
      state.branches[branchIdx].serviceNames = rows.map((r) => r.name).filter(Boolean);
    }
  }

  function getServicesCatalogRowsForRender() {
    if (isEditingGlobalServicesCatalog()) {
      return state.config.services;
    }
    const branchId = getServicesCatalogEditorBranchId();
    if (!branchId) {
      return state.config.services;
    }
    if (branchOverrideDefinesCatalog(branchId)) {
      if (!state.config.branchServiceOverrides[branchId]) {
        state.config.branchServiceOverrides[branchId] = {};
      }
      return state.config.branchServiceOverrides[branchId].services;
    }
    return resolveEffectiveServiceRowsForBranch(branchId);
  }

  function renderServicesCatalogChrome() {
    const withGlobal = catalogPickerHasGlobalOption();
    const showUnit = showBranchUnitSelector();
    if (state.dom.servicesBranchWrap) {
      state.dom.servicesBranchWrap.hidden = !showUnit;
    }
    if (state.dom.servicesBranchSelect && showUnit) {
      const branchOpts = state.branches
        .filter((b) => String(b?.id || '').trim())
        .map((b) => ({ value: b.id, label: String(b.name || '').trim() || 'Unidade' }));
      const opts = withGlobal
        ? [{ value: '', label: 'Catálogo global (padrão)' }, ...branchOpts]
        : branchOpts;
      state.dom.servicesBranchSelect.innerHTML = opts
        .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
        .join('');
      if (withGlobal) {
        const raw = state.servicesCatalogBranchId;
        state.dom.servicesBranchSelect.value = raw === undefined || raw === null ? '' : String(raw);
      } else {
        const primaryId = String(getPrimaryBranch()?.id || branchOpts[0]?.value || '');
        state.dom.servicesBranchSelect.value = primaryId;
        if (primaryId && state.servicesCatalogBranchId !== primaryId) {
          state.servicesCatalogBranchId = primaryId;
        }
      }
    }
    if (state.dom.servicesCatalogTitle && state.dom.servicesCatalogHint) {
      const bid = getServicesCatalogEditorBranchId();
      if (withGlobal && !state.servicesCatalogBranchId) {
        state.dom.servicesCatalogTitle.textContent = 'Catálogo global';
        state.dom.servicesCatalogHint.textContent = 'Padrão da operação. Escolha uma filial acima para precificação específica.';
      } else if (bid) {
        const br = state.branches.find((b) => b.id === bid);
        if (withGlobal && state.servicesCatalogBranchId) {
          state.dom.servicesCatalogTitle.textContent = br ? `Catálogo: ${br.name || 'Filial'}` : 'Catálogo da filial';
          state.dom.servicesCatalogHint.textContent = 'Substitui o catálogo global nesta unidade (preços e durações por serviço).';
        } else {
          state.dom.servicesCatalogTitle.textContent = 'Catálogo da unidade';
          state.dom.servicesCatalogHint.textContent = br
            ? `Serviços efetivos em ${br.name || 'sua unidade'}. Você pode definir um catálogo próprio por filial.`
            : 'Defina os serviços da unidade.';
        }
      } else {
        state.dom.servicesCatalogTitle.textContent = 'Catálogo global';
        state.dom.servicesCatalogHint.textContent = 'Padrão da operação. Escolha uma filial acima para precificação específica.';
      }
    }
  }

  function renderServices() {
    if (!state.config || !state.dom.services) {
      return;
    }
    renderServicesCatalogChrome();
    const rows = getServicesCatalogRowsForRender();
    state.dom.services.innerHTML = rows.map((service, index) => `
      <article class="operator-config-row" data-service-index="${index}">
        <label class="operator-config-field">
          <span>Nome do serviço</span>
          <input data-service-field="name" type="text" value="${escapeHtml(service.name)}" placeholder="Ex.: Corte completo" />
        </label>
        <label class="operator-config-field">
          <span>Duração (min)</span>
          <input data-service-field="durationMinutes" type="number" min="5" step="5" value="${escapeHtml(String(service.durationMinutes || ''))}" />
        </label>
        <label class="operator-config-field">
          <span>Preço</span>
          <input data-service-field="price" type="number" min="0" step="0.01" value="${escapeHtml(service.price === '' ? '' : String(service.price))}" />
        </label>
        <button class="btn btn-ghost" data-service-remove="${index}" type="button">Remover</button>
      </article>
    `).join('');
  }

  function renderBranches() {
    if (!state.dom.branches || !state.config) {
      return;
    }
    const branchCard = state.dom.branches.closest('.operator-config-card');
    const visibleBranches = getVisibleBranches();
    const primaryBranch = getPrimaryBranch();
    if (branchCard) {
      const title = branchCard.querySelector('.operator-config-card-head strong');
      if (title) {
        title.textContent = state.config.multiBranch ? 'Configuração da loja e filiais' : 'Configuração da loja principal';
      }
    }

    if (state.dom.branchNote) {
      state.dom.branchNote.textContent = state.config.multiBranch
        ? 'Múltiplas unidades ativas. Você pode cadastrar e editar a matriz e as filiais abaixo.'
        : 'Modo de unidade única ativo. A operação usa somente a unidade principal exibida abaixo.';
    }

    if (state.dom.addBranch) {
      state.dom.addBranch.textContent = state.branches.length > 0 ? 'Nova subunidade' : 'Criar unidade principal';
      state.dom.addBranch.disabled = false;
      state.dom.addBranch.hidden = false;
    }

    state.dom.branches.innerHTML = visibleBranches.length ? visibleBranches.map((branch) => {
      const index = state.branches.findIndex((item) => item === branch);
      const isSingleModeLocked = !state.config.multiBranch && primaryBranch && primaryBranch !== branch;
      const branchCatalogNames = getEffectiveServiceNamesForBranch(branch.id);
      return `
      <article class="operator-config-stack operator-config-branch-card" data-branch-index="${index}">
        <div class="operator-config-branch-top">
          <div class="operator-config-stack-head">
            <span class="operator-config-stack-badge">${branch.isDefault ? 'Principal' : 'Filial'}</span>
            ${!state.config.multiBranch ? '<span class="operator-config-stack-badge operator-config-stack-badge-muted">Unidade única</span>' : ''}
          </div>
          <strong class="operator-config-branch-title">${escapeHtml(branch.name || (branch.isDefault ? 'Unidade principal' : 'Nova filial'))}</strong>
        </div>
        <div class="operator-config-branch-grid">
          <label class="operator-config-field operator-config-field-span-2">
            <span>Nome</span>
            <input data-branch-field="name" type="text" value="${escapeHtml(branch.name)}" placeholder="Nome da unidade" ${isSingleModeLocked ? 'disabled' : ''} />
          </label>
          <label class="operator-config-field operator-config-field-span-2">
            <span>Endereço</span>
            <input data-branch-field="address" type="text" value="${escapeHtml(branch.address || '')}" placeholder="Rua, número, bairro" ${isSingleModeLocked ? 'disabled' : ''} />
          </label>
          <label class="operator-config-field operator-config-field-compact">
            <span>Ordem</span>
            <input data-branch-field="sortOrder" type="number" min="0" step="1" value="${escapeHtml(String(branch.sortOrder ?? ''))}" ${isSingleModeLocked ? 'disabled' : ''} />
          </label>
          <label class="operator-config-field operator-config-field-inline operator-config-field-compact">
            <span>Unidade padrão</span>
            <input data-branch-field="isDefault" type="checkbox" ${branch.isDefault ? 'checked' : ''} ${isSingleModeLocked ? 'disabled' : ''} />
          </label>
        </div>
        <div class="operator-config-subgroup">
          <span>Serviços da unidade</span>
          <div class="operator-config-choice-grid">
            ${branchCatalogNames.length
              ? branchCatalogNames.map((serviceName) => `
                <label><input data-branch-service="${escapeHtml(serviceName)}" type="checkbox" ${branch.serviceNames.includes(serviceName) ? 'checked' : ''} />${escapeHtml(serviceName)}</label>
              `).join('')
              : '<span class="operator-config-empty-inline">Cadastre serviços no catálogo (global ou desta filial) antes de vincular à unidade.</span>'}
          </div>
        </div>
        <div class="operator-config-inline-actions">
          <button class="btn btn-primary" data-branch-save="${index}" type="button">Salvar unidade</button>
          ${state.config.multiBranch ? `<button class="btn btn-ghost" data-branch-delete="${index}" type="button">Excluir</button>` : ''}
        </div>
      </article>
    `;
    }).join('') : '<div class="operator-config-empty">Nenhuma unidade cadastrada ainda.</div>';
  }

  function getServiceColorTone(name) {
    const palette = ['orange', 'purple', 'blue', 'green', 'pink', 'teal', 'red', 'amber'];
    const text = String(name || '').toLowerCase();
    if (!text) return palette[0];
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  function getServiceIconKey(name) {
    const text = String(name || '').toLowerCase();
    if (/sobrancelha/.test(text)) return 'eyebrow';
    if (/barba|bigode/.test(text)) return 'beard';
    if (/freestyle|liso|lavagem|hidrata/.test(text)) return 'product';
    if (/máquina|maquina|retoque|risc|design/.test(text)) return 'razor';
    return 'scissors';
  }

  function renderServiceIcon(name) {
    const key = getServiceIconKey(name);
    const icons = {
      scissors: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.64 11.05 4.34 5.75 5.75 4.34l5.3 5.3 2.95-2.95a3.5 3.5 0 1 1 1.41 1.41l-2.95 2.95 2.95 2.95a3.5 3.5 0 1 1-1.41 1.41l-2.95-2.95-5.3 5.3-1.41-1.41 5.3-5.3Zm6.86-3.55a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/></svg>',
      beard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 1 8 8v3.4a3.6 3.6 0 0 1-1.4 2.86l-3.4 2.55A4 4 0 0 1 12.8 21h-1.6a4 4 0 0 1-2.4-1.19l-3.4-2.55A3.6 3.6 0 0 1 4 14.4V11a8 8 0 0 1 8-8Zm0 4a4 4 0 0 0-4 4v3.4a1.6 1.6 0 0 0 .62 1.27l3.4 2.55a2 2 0 0 0 1.96 0l3.4-2.55A1.6 1.6 0 0 0 16 14.4V11a4 4 0 0 0-4-4Z" fill="currentColor"/></svg>',
      eyebrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13c2.5-3 6-4 9-4s6.5 1 9 4l-1.4 1.4c-2-2.4-4.7-3.4-7.6-3.4S6.4 12 4.4 14.4L3 13Zm9 5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" fill="currentColor"/></svg>',
      product: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6v3h2v3H7V5h2V2Zm-2 8h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10Zm2 2v8h6v-8H9Z" fill="currentColor"/></svg>',
      razor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v3H4V5Zm2 5h12v2H6v-2Zm2 4h8a3 3 0 0 1 0 6H8a3 3 0 0 1 0-6Z" fill="currentColor"/></svg>',
    };
    return icons[key] || icons.scissors;
  }

  function formatServicePrice(price) {
    if (price === null || price === undefined || Number.isNaN(price)) {
      return 'Sob consulta';
    }
    return `R$ ${Number(price).toFixed(2).replace('.', ',')}`;
  }

  function getProfessionalRoleLabel(professional) {
    const map = new Map((getProfessionalTypeOptions() || []).map((option) => [option.value, option.label]));
    return map.get(professional?.type) || professional?.type || 'Profissional';
  }

  function captureProfessionalsFocusState() {
    const root = state.dom.professionals;
    if (!root) {
      return null;
    }
    const active = document.activeElement;
    if (!active || !root.contains(active)) {
      return null;
    }
    const focusKey = active.matches('[data-professionals-search]')
      ? 'search-pro'
      : active.matches('[data-pro-services-search]')
        ? 'search-services'
        : null;
    if (!focusKey) {
      return null;
    }
    return {
      key: focusKey,
      selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    };
  }

  function restoreProfessionalsFocusState(captured) {
    if (!captured) {
      return;
    }
    const root = state.dom.professionals;
    if (!root) {
      return;
    }
    const selector = captured.key === 'search-pro'
      ? '[data-professionals-search]'
      : '[data-pro-services-search]';
    const target = root.querySelector(selector);
    if (!target) {
      return;
    }
    target.focus({ preventScroll: true });
    if (captured.selectionStart !== null && captured.selectionEnd !== null && typeof target.setSelectionRange === 'function') {
      try {
        target.setSelectionRange(captured.selectionStart, captured.selectionEnd);
      } catch (_) {
        /* setSelectionRange pode falhar em alguns inputs (e.g., type=email) — seguro ignorar. */
      }
    }
  }

  function buildProfessionalPosTerminalSelectMarkup(professional) {
    const terminals = filterPosTerminalsForProfessional(professional);
    const currentId = professional.preferredPosTerminalId;
    const optionIds = new Set(terminals.map((terminal) => terminal.id));
    const options = [...terminals];
    if (currentId && !optionIds.has(currentId)) {
      const saved = (state.posTerminals || []).find((terminal) => terminal.id === currentId);
      if (saved) {
        options.unshift(saved);
      }
    }
    return `
      <option value="">— Nenhum —</option>
      ${options.map((terminal) => `
        <option value="${escapeHtml(terminal.id)}" ${terminal.id === currentId ? 'selected' : ''}>${escapeHtml(formatPosTerminalOptionLabel(terminal))}</option>
      `).join('')}
    `;
  }

  function renderProfessionals() {
    if (!state.dom.professionals || !state.config) {
      return;
    }
    const focusState = captureProfessionalsFocusState();
    const branchOptions = getVisibleBranches();
    const professionalTypeOptions = getProfessionalTypeOptions();
    const professionalTypeMap = new Map(professionalTypeOptions.map((option) => [option.value, option.label]));
    const memberOptions = state.tenantMembers || [];
    const memberByUserId = new Map(memberOptions.map((member) => [member.userId, member]));
    const professionalCard = state.dom.professionals.closest('.operator-config-card');
    if (professionalCard) {
      const isConfigTabCard = professionalCard.dataset.operatorTabTarget === 'barbeiros';
      professionalCard.hidden = isConfigTabCard && !state.config.professionalSchedule;
    }

    if (!state.professionals.length) {
      state.dom.professionals.innerHTML = `
        <section class="pro-page pro-page-empty">
          <div class="pro-empty">
            <strong>Nenhum profissional cadastrado ainda.</strong>
            <p>Cadastre o primeiro profissional para começar a montar a equipe.</p>
            <button class="pro-btn-primary" type="button" data-pro-add>+ Adicionar funcionário</button>
          </div>
        </section>
      `;
      restoreProfessionalsFocusState(focusState);
      return;
    }

    const searchTerm = String(state.professionalsSearch || '').trim().toLowerCase();
    const filteredProfessionals = state.professionals
      .map((professional, index) => ({ professional, index }))
      .filter(({ professional }) => {
        if (!searchTerm) {
          return true;
        }
        const name = String(professional.name || '').toLowerCase();
        const phone = String(professional.whatsappPhone || '').toLowerCase();
        return name.includes(searchTerm) || phone.includes(searchTerm);
      });

    const hasSelected = filteredProfessionals.some(({ professional }) => professional.localKey === state.selectedProfessionalLocalKey);
    if (filteredProfessionals.length && !hasSelected) {
      state.selectedProfessionalLocalKey = filteredProfessionals[0].professional.localKey;
    }
    const selectedEntry = filteredProfessionals.find(({ professional }) => professional.localKey === state.selectedProfessionalLocalKey) || filteredProfessionals[0];
    const selectedProfessional = selectedEntry?.professional || null;
    const selectedIndex = selectedEntry?.index ?? -1;
    const linked = selectedProfessional ? memberByUserId.get(selectedProfessional.userId) : null;
    const selectedBranchName = selectedProfessional ? (branchOptions.find((branch) => branch.id === selectedProfessional.branchId)?.name || 'Unidade não definida') : '';
    const proCatalogBranchId = String(selectedProfessional?.branchId || '').trim();
    const catalog = selectedProfessional ? getServiceCatalogIndexForBranch(proCatalogBranchId) : new Map();
    const catalogServiceNames = selectedProfessional ? getEffectiveServiceNamesForBranch(proCatalogBranchId) : [];

    const activeTab = ['services', 'schedule', 'commission', 'pos', 'profile'].includes(state.professionalDetailTab)
      ? state.professionalDetailTab
      : 'services';
    const posTerminalsAvailable = Array.isArray(state.posTerminals) && state.posTerminals.length > 0;

    const listMarkup = filteredProfessionals.length ? filteredProfessionals.map(({ professional }) => {
      const isActiveItem = professional.localKey === state.selectedProfessionalLocalKey;
      const roleLabel = professionalTypeMap.get(professional.type) || professional.type || 'Profissional';
      const statusLabel = professional.isActive ? 'Ativo' : 'Inativo';
      const statusClass = professional.isActive ? 'pro-status-on' : 'pro-status-off';
      return `
        <button type="button"
          class="pro-item operator-pro-item ${isActiveItem ? 'is-active' : ''}"
          data-professional-pick="${escapeHtml(professional.localKey)}">
          <span class="pro-item-avatar">${renderProfessionalAvatarMarkup(professional, 'operator-pro-avatar')}</span>
          <span class="pro-item-meta operator-pro-copy">
            <strong class="pro-item-name">${escapeHtml(professional.name || 'Novo profissional')}</strong>
            <small class="pro-item-role">${escapeHtml(roleLabel)}</small>
          </span>
          <span class="pro-status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
        </button>
      `;
    }).join('') : `
      <div class="pro-list-empty">
        Nenhum profissional encontrado para "${escapeHtml(state.professionalsSearch)}".
      </div>
    `;

    if (!selectedProfessional) {
      state.dom.professionals.innerHTML = `
        <section class="pro-page">
          <aside class="pro-list-panel">
            <div class="pro-list-search-row">
              <label class="pro-list-search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 1-3.78 10.66l-3.79 3.79-1.41-1.41 3.78-3.79A6 6 0 0 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" fill="currentColor"/></svg>
                <input data-professionals-search type="search" value="${escapeHtml(state.professionalsSearch)}" placeholder="Procurar funcionário..." />
              </label>
              <button class="pro-list-add-mini" data-pro-add type="button" aria-label="Adicionar funcionário">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" fill="currentColor"/></svg>
              </button>
            </div>
            <div class="pro-list operator-pro-items">${listMarkup}</div>
            <button class="pro-list-add" data-pro-add type="button">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" fill="currentColor"/></svg>
              Adicionar funcionário
            </button>
          </aside>
        </section>
      `;
      restoreProfessionalsFocusState(focusState);
      return;
    }

    const roleLabelDetail = getProfessionalRoleLabel(selectedProfessional);
    const contactEmail = linked?.email || '';
    const contactPhone = selectedProfessional.whatsappPhone || '';

    const professionalServices = canonicalizeProfessionalServices(
      selectedProfessional.services || [],
      selectedProfessional.branchId,
    );

    const servicesSearchTerm = String(state.professionalServicesSearch || '').trim().toLowerCase();
    const visibleServices = servicesSearchTerm
      ? professionalServices.filter((name) => String(name).toLowerCase().includes(servicesSearchTerm))
      : professionalServices;

    const editServicesOpen = Boolean(state.professionalServicesEditOpen);

    const servicesCardsMarkup = visibleServices.length
      ? visibleServices.map((serviceName) => {
          const catalogEntry = catalog.get(String(serviceName).toLowerCase());
          const duration = catalogEntry?.durationMinutes || 0;
          const price = catalogEntry?.price ?? null;
          const tone = getServiceColorTone(serviceName);
          const icon = renderServiceIcon(serviceName);
          return `
            <article class="pro-service-card" data-color-tone="${tone}">
              <span class="pro-service-icon" aria-hidden="true">${icon}</span>
              <div class="pro-service-info">
                <strong class="pro-service-name">${escapeHtml(serviceName)}</strong>
                <span class="pro-service-duration">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 2a6 6 0 1 0 0 12A6 6 0 0 0 12 6Zm.75 2v3.25l2.6 1.55-.75 1.3-3.35-2V8h1.5Z" fill="currentColor"/></svg>
                  ${duration ? `${duration}min` : 'Duração a definir'}
                </span>
              </div>
              <span class="pro-service-price">${escapeHtml(formatServicePrice(price))}</span>
              <button class="pro-service-menu" type="button" aria-label="Mais opções">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="currentColor"/></svg>
              </button>
            </article>
          `;
        }).join('')
      : `<div class="pro-services-empty">${
          professionalServices.length
            ? `Nenhum serviço encontrado para "${escapeHtml(state.professionalServicesSearch)}".`
            : 'Este profissional ainda não atende nenhum serviço. Use "Editar serviços" para vincular.'
        }</div>`;

    const editorMarkup = (() => {
      if (!selectedProfessional.branchId) {
        return '<div class="pro-services-editor-empty">Selecione uma filial para escolher os serviços.</div>';
      }
      if (!catalogServiceNames.length) {
        return '<div class="pro-services-editor-empty">Cadastre serviços na aba Serviços da operação antes de vincular.</div>';
      }
      const selectedSvcLower = new Set(
        (selectedProfessional.services || []).map((s) => String(s || '').trim().toLowerCase()).filter(Boolean),
      );
      return `
        <p class="pro-services-editor-hint">Marque os serviços deste catálogo que este profissional atende nesta filial (${escapeHtml(selectedBranchName)}).</p>
        <div class="pro-services-editor-grid">
          ${catalogServiceNames.map((service) => {
            const checked = selectedSvcLower.has(String(service).trim().toLowerCase());
            return `
              <label class="pro-services-editor-option ${checked ? 'is-checked' : ''}">
                <input data-professional-service="${escapeHtml(service)}" type="checkbox" ${checked ? 'checked' : ''} />
                <span>${escapeHtml(service)}</span>
              </label>
            `;
          }).join('')}
        </div>
      `;
    })();

    state.dom.professionals.innerHTML = `
      <section class="pro-page">
        <aside class="pro-list-panel">
          <div class="pro-list-search-row">
            <label class="pro-list-search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 1-3.78 10.66l-3.79 3.79-1.41-1.41 3.78-3.79A6 6 0 0 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" fill="currentColor"/></svg>
              <input data-professionals-search type="search" value="${escapeHtml(state.professionalsSearch)}" placeholder="Procurar funcionário..." />
            </label>
            <button class="pro-list-add-mini" data-pro-add type="button" aria-label="Adicionar funcionário">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" fill="currentColor"/></svg>
            </button>
          </div>
          <div class="pro-list operator-pro-items">${listMarkup}</div>
          <button class="pro-list-add" data-pro-add type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" fill="currentColor"/></svg>
            Adicionar funcionário
          </button>
        </aside>

        <section class="pro-detail-panel operator-pro-directory-detail operator-config-stack operator-config-professional-card" data-professional-index="${selectedIndex}">
          <article class="pro-profile-card">
            <header class="pro-hero">
              <div class="pro-hero-id">
                <span class="pro-hero-avatar-wrap">
                  ${renderProfessionalAvatarMarkup(selectedProfessional, 'pro-hero-avatar operator-pro-detail-avatar')}
                  ${selectedProfessional.isActive ? '<span class="pro-online-dot" aria-hidden="true"></span>' : ''}
                </span>
                <div class="pro-hero-headlines">
                  <div class="pro-hero-title-row">
                    <h2 class="pro-hero-title">${escapeHtml(selectedProfessional.name || 'Novo profissional')}</h2>
                    ${selectedProfessional.isActive ? '<span class="pro-verified" aria-label="Profissional ativo" title="Profissional ativo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 14.39 5.42 18.49 6 19.17 10.06 22 13l-2.83 2.94-.68 4.06-4.1.58L12 24l-2.39-3.42-4.1-.58-.68-4.06L2 13l2.83-2.94.68-4.06 4.1-.58Zm-1 13.59 6.3-6.3-1.41-1.42-4.89 4.89-2.18-2.18-1.41 1.41 3.59 3.6Z" fill="currentColor"/></svg></span>' : ''}
                  </div>
                  <div class="pro-hero-badges">
                    <span class="pro-badge pro-badge-role">${escapeHtml(roleLabelDetail)}</span>
                    ${selectedBranchName ? `<span class="pro-badge pro-badge-branch">${escapeHtml(selectedBranchName)}</span>` : ''}
                    <span class="pro-badge pro-badge-status ${selectedProfessional.isActive ? 'is-on' : 'is-off'}">${selectedProfessional.isActive ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  ${(contactPhone || contactEmail) ? `
                    <div class="pro-hero-contacts">
                      ${contactPhone ? `<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.05 15.05 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.36 11.36 0 0 0 3.56.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.56 1 1 0 0 1-.25 1L6.6 10.8Z" fill="currentColor"/></svg>${escapeHtml(contactPhone)}</span>` : ''}
                      ${contactEmail ? `<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 2v.4l8 5 8-5V8H4Zm16 2.34-7.45 4.66a1 1 0 0 1-1.1 0L4 10.34V16h16v-5.66Z" fill="currentColor"/></svg>${escapeHtml(contactEmail)}</span>` : ''}
                    </div>
                  ` : ''}
                </div>
              </div>
              <button class="pro-hero-action" data-professional-open-calendar="${selectedIndex}" type="button">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3a1 1 0 0 1 1 1v1h8V4a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a1 1 0 0 1 1-1Zm12 7H5v9h14v-9Z" fill="currentColor"/></svg>
                Ver agenda
              </button>
            </header>

            <nav class="pro-tabs operator-pro-tabs" role="tablist" aria-label="Detalhes do profissional">
              <button type="button" role="tab" class="pro-tab ${activeTab === 'services' ? 'is-active' : ''}" data-professional-tab="services" aria-selected="${activeTab === 'services'}">
                Serviços (${professionalServices.length})
              </button>
              <button type="button" role="tab" class="pro-tab ${activeTab === 'schedule' ? 'is-active' : ''}" data-professional-tab="schedule" aria-selected="${activeTab === 'schedule'}">
                Horário de trabalho
              </button>
              <button type="button" role="tab" class="pro-tab ${activeTab === 'commission' ? 'is-active' : ''}" data-professional-tab="commission" aria-selected="${activeTab === 'commission'}">
                Comissão
              </button>
              <button type="button" role="tab" class="pro-tab ${activeTab === 'pos' ? 'is-active' : ''}" data-professional-tab="pos" aria-selected="${activeTab === 'pos'}">
                POS
              </button>
              <button type="button" role="tab" class="pro-tab ${activeTab === 'profile' ? 'is-active' : ''}" data-professional-tab="profile" aria-selected="${activeTab === 'profile'}">
                Editar perfil
              </button>
            </nav>

            <section class="pro-tab-content operator-pro-tab-panel ${activeTab === 'services' ? 'is-active' : ''}" role="tabpanel" data-professional-tab-content="services">
              <div class="pro-services-toolbar">
                <label class="pro-search">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 1-3.78 10.66l-3.79 3.79-1.41-1.41 3.78-3.79A6 6 0 0 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" fill="currentColor"/></svg>
                  <input data-pro-services-search type="search" value="${escapeHtml(state.professionalServicesSearch || '')}" placeholder="Pesquisar serviços..." />
                </label>
                <button class="pro-btn-ghost" data-pro-services-edit-toggle type="button" aria-pressed="${editServicesOpen}">
                  ${editServicesOpen ? 'Concluir edição' : 'Editar serviços'}
                </button>
              </div>

              <div class="pro-services-list">${servicesCardsMarkup}</div>

              <div class="pro-services-editor" ${editServicesOpen ? '' : 'hidden'}>
                <div class="pro-services-editor-head">
                  <strong>Vincular serviços</strong>
                  <small>${selectedBranchName ? escapeHtml(selectedBranchName) : 'Sem filial'}</small>
                </div>
                ${editorMarkup}
              </div>
            </section>

            <section class="pro-tab-content operator-pro-tab-panel ${activeTab === 'schedule' ? 'is-active' : ''}" role="tabpanel" data-professional-tab-content="schedule">
              <div class="pro-schedule-grid">
                <label class="pro-field">
                  <span>Início</span>
                  <input data-professional-schedule="startTime" type="time" value="${escapeHtml(selectedProfessional.schedule.startTime)}" />
                </label>
                <label class="pro-field">
                  <span>Fim</span>
                  <input data-professional-schedule="endTime" type="time" value="${escapeHtml(selectedProfessional.schedule.endTime)}" />
                </label>
              </div>
              <div class="pro-schedule-days">
                <span class="pro-field-label">Dias de atendimento</span>
                <div class="pro-day-pills">
                  ${[0, 1, 2, 3, 4, 5, 6].map((day) => {
                    const checked = selectedProfessional.schedule.workingDays.includes(day);
                    return `
                      <label class="pro-day-pill ${checked ? 'is-checked' : ''}">
                        <input data-professional-day="${day}" type="checkbox" ${checked ? 'checked' : ''} />
                        <span>${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day]}</span>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>
              <div class="pro-schedule-breaks">
                <div class="pro-schedule-breaks-head">
                  <span class="pro-field-label">Pausas recorrentes (almoço / janta)</span>
                  <button class="pro-btn-ghost pro-break-add" data-professional-break-add="${selectedIndex}" type="button">+ Pausa</button>
                </div>
                <div class="pro-schedule-breaks-list">
                  ${(selectedProfessional.schedule.weeklyBreaks || []).length
                    ? selectedProfessional.schedule.weeklyBreaks.map((item, breakIndex) => {
                      const currentLabel = PROFESSIONAL_BREAK_TYPE_OPTIONS.find((option) => option.toLowerCase() === String(item?.label || '').toLowerCase()) || 'Outros';
                      return `
                      <section class="pro-break-card" data-professional-break-row="${breakIndex}">
                        <div class="pro-break-card-grid">
                          <label class="pro-field">
                            <span>Tipo de pausa</span>
                            <select data-professional-break-field="label" data-professional-break-index="${breakIndex}">
                              ${PROFESSIONAL_BREAK_TYPE_OPTIONS.map((type) => `<option value="${escapeHtml(type)}" ${type === currentLabel ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
                            </select>
                          </label>
                          <label class="pro-field">
                            <span>Início</span>
                            <input data-professional-break-field="startTime" data-professional-break-index="${breakIndex}" type="time" value="${escapeHtml(item?.startTime || '')}" />
                          </label>
                          <label class="pro-field">
                            <span>Fim</span>
                            <input data-professional-break-field="endTime" data-professional-break-index="${breakIndex}" type="time" value="${escapeHtml(item?.endTime || '')}" />
                          </label>
                        </div>
                        <div class="pro-schedule-days">
                          <span class="pro-field-label">Dias da pausa</span>
                          <div class="pro-day-pills">
                            ${WEEKDAY_OPTIONS.map((day) => {
                              const checked = Array.isArray(item?.weekdays) && item.weekdays.includes(day);
                              return `
                                <label class="pro-day-pill ${checked ? 'is-checked' : ''}">
                                  <input
                                    data-professional-break-day="${day}"
                                    data-professional-break-index="${breakIndex}"
                                    type="checkbox"
                                    ${checked ? 'checked' : ''}
                                  />
                                  <span>${WEEKDAY_LABELS[day]}</span>
                                </label>
                              `;
                            }).join('')}
                          </div>
                        </div>
                        <div class="pro-break-card-actions">
                          <button class="pro-btn-danger pro-break-remove" data-professional-break-remove="${breakIndex}" type="button">Remover pausa</button>
                        </div>
                      </section>
                    `;
                    }).join('')
                    : '<div class="pro-services-empty">Nenhuma pausa recorrente cadastrada.</div>'}
                </div>
              </div>
              <div class="pro-profile-actions pro-schedule-save-actions">
                <button class="pro-btn-primary" data-professional-save="${selectedIndex}" type="button">Salvar profissional</button>
              </div>
            </section>

            <section class="pro-tab-content operator-pro-tab-panel ${activeTab === 'commission' ? 'is-active' : ''}" role="tabpanel" data-professional-tab-content="commission">
              <p class="pro-services-editor-hint">
                Define que percentagem do valor pago em agendamentos (após descontos aplicados) conta como receita do profissional; o restante é da empresa.
                Não altera o valor cobrado ao cliente — é apenas para repartição analítica no extrato.
              </p>
              <div class="pro-profile-grid">
                <label class="pro-field pro-field-span-2">
                  <span>Partilha agenda (%) — profissional</span>
                  <input
                    data-professional-field="serviceProfessionalSharePct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="Vazio = não aplicar"
                    value="${selectedProfessional.serviceProfessionalSharePct === null || selectedProfessional.serviceProfessionalSharePct === undefined ? '' : escapeHtml(String(selectedProfessional.serviceProfessionalSharePct))}"
                  />
                </label>
              </div>
              <p class="pro-services-editor-hint">Aceita valores entre 0 e 100. Distinto da comissão de produtos (usuário).</p>
              <div class="pro-profile-actions pro-schedule-save-actions">
                <button class="pro-btn-primary" data-professional-save="${selectedIndex}" type="button">Salvar profissional</button>
              </div>
            </section>

            <section class="pro-tab-content operator-pro-tab-panel ${activeTab === 'pos' ? 'is-active' : ''}" role="tabpanel" data-professional-tab-content="pos">
              <p class="pro-services-editor-hint">
                Maquininha usada por defeito ao receber na agenda e quando o cliente paga pelo WhatsApp (Point Smart) neste profissional.
                Vazio = terminal padrão da unidade ou primeiro ativo.
              </p>
              ${posTerminalsAvailable
                ? `
              <div class="pro-profile-grid">
                <label class="pro-field pro-field-span-2" title="Cadastre terminais no menu POS. Terminais globais do tenant ou da filial do profissional aparecem na lista.">
                  <span>Terminal POS preferido</span>
                  <select data-professional-field="preferredPosTerminalId">
                    ${buildProfessionalPosTerminalSelectMarkup(selectedProfessional)}
                  </select>
                </label>
              </div>
              `
                : '<div class="pro-services-empty">Nenhum terminal POS cadastrado. Cadastre terminais no menu <strong>POS</strong> antes de definir a preferência do profissional.</div>'}
              <div class="pro-profile-actions pro-schedule-save-actions">
                <button class="pro-btn-primary" data-professional-save="${selectedIndex}" type="button">Salvar profissional</button>
              </div>
            </section>

            <section class="pro-tab-content operator-pro-tab-panel ${activeTab === 'profile' ? 'is-active' : ''}" role="tabpanel" data-professional-tab-content="profile">
              <div class="pro-profile-grid">
                <label class="pro-field pro-field-span-2">
                  <span>Nome (vinculado ao usuário)</span>
                  <div class="pro-field-readonly">${escapeHtml(selectedProfessional.name || 'Selecione um usuário vinculado')}</div>
                </label>
                <label class="pro-field">
                  <span>Tipo</span>
                  <select data-professional-field="type">
                    ${professionalTypeOptions
                      .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selectedProfessional.type ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
                      .join('')}
                  </select>
                </label>
                <label class="pro-field pro-field-span-2">
                  <span>Usuário vinculado</span>
                  <select data-professional-field="userId">
                    <option value="">Selecione o usuário</option>
                    ${memberOptions
                      .map((member) => `<option value="${escapeHtml(member.userId)}" ${member.userId === selectedProfessional.userId ? 'selected' : ''}>${escapeHtml(member.label)}</option>`)
                      .join('')}
                  </select>
                </label>
                <label class="pro-field pro-field-span-2">
                  <span>Filial</span>
                  <select data-professional-field="branchId">
                    <option value="">Selecione a unidade</option>
                    ${branchOptions.map((branch) => `<option value="${escapeHtml(branch.id)}" ${branch.id === selectedProfessional.branchId ? 'selected' : ''}>${escapeHtml(branch.name || 'Unidade sem nome')}</option>`).join('')}
                  </select>
                </label>
                <label class="pro-field pro-field-span-2">
                  <span>WhatsApp</span>
                  <input data-professional-field="whatsappPhone" type="tel" value="${escapeHtml(selectedProfessional.whatsappPhone || '')}" placeholder="5511999999999" />
                </label>
                <label class="pro-field pro-field-toggle">
                  <span>Profissional ativo</span>
                  <input data-professional-field="isActive" type="checkbox" ${selectedProfessional.isActive ? 'checked' : ''} />
                </label>
              </div>
              ${linked ? `<div class="pro-field-readout"><span>Usuário vinculado</span><strong>${escapeHtml(linked.label)}</strong></div>` : ''}
              <div class="pro-profile-actions">
                <button class="pro-btn-primary" data-professional-save="${selectedIndex}" type="button">Salvar profissional</button>
                <button class="pro-btn-danger" data-professional-delete="${selectedIndex}" type="button">Excluir</button>
              </div>
            </section>
          </article>
        </section>
      </section>
    `;

    restoreProfessionalsFocusState(focusState);
  }

  function renderPaymentsForm() {
    if (!state.paymentConfig || !state.dom.paymentsEnabled) {
      return;
    }

    const config = state.paymentConfig;
    state.dom.paymentsManualPixFlowEnabled.checked = config.manualPixFlowEnabled;
    state.dom.paymentsManualPixKey.value = config.manualPixKey || '';
    state.dom.paymentsEnabled.checked = config.enabled;
    state.dom.paymentsRequirePayment.checked = config.requirePayment;
    state.dom.paymentsScheduleEnabled.checked = config.schedulePaymentsEnabled;
    if (state.dom.paymentsEnableSplit) {
      state.dom.paymentsEnableSplit.checked = config.enableSplitPayments === true;
    }
    state.dom.paymentsNeverChargeReschedule.checked = config.neverChargeReschedule;
    state.dom.paymentsDepositAmount.value = String(config.depositAmount ?? 1);
    state.dom.paymentsExpirationMinutes.value = String(config.expirationMinutes ?? 30);
    state.dom.paymentsDiscountEnabled.checked = config.discountEnabled;
    state.dom.paymentsDiscountType.value = config.discountType || 'percentage';
    state.dom.paymentsDiscountValue.value = String(config.discountValue ?? 0);
    state.dom.paymentsPixPayerDocumentTenant.value = config.pixPayerDocumentTenant || '';
    state.dom.paymentsUnitOverride.checked = config.unitOverride;
    state.dom.paymentsProvider.value = config.provider || 'mercado_pago';
    state.dom.paymentsAccessToken.value = config.accessToken || '';
    state.dom.paymentsAccountId.value = config.accountId || '';
    state.dom.paymentsPixPayerDocumentUnit.value = config.pixPayerDocumentUnit || '';

    const unitOptions = [{ id: '', name: 'Sem override de unidade' }].concat(
      state.branches.map((branch) => ({ id: branch.id || '', name: branch.name || 'Unidade sem nome' })),
    );
    state.dom.paymentsUnitId.innerHTML = unitOptions
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
      .join('');

    if (config.unitId && unitOptions.some((item) => item.id === config.unitId)) {
      state.dom.paymentsUnitId.value = config.unitId;
    } else {
      state.dom.paymentsUnitId.value = '';
      config.unitId = '';
    }

    applyPaymentsRules();
  }

  function renderAll() {
    renderSummary();
    renderPrimaryForm();
    renderServices();
    renderBranches();
    renderProfessionals();
    renderPaymentsForm();
    renderCrmForm();
    if (qs('#operatorSpecialDatesRoot')) {
      window.ReservaAiOperatorSpecialDates?.renderAll?.();
    }
    applyOperatorTab(state.activeTab);
  }

  function hasActiveProfessionalWithName() {
    return state.professionals.some((professional) => professional.isActive && String(professional.name || '').trim());
  }

  function applyOperatorTab(tabId) {
    const availableTabs = state.dom.tabButtons?.map((button) => button.dataset.operatorTab).filter(Boolean) || [];
    const nextTab = availableTabs.includes(tabId) ? tabId : (availableTabs[0] || 'gerais');
    state.activeTab = nextTab;
    state.dom.tabButtons?.forEach((button) => {
      const isActive = button.dataset.operatorTab === nextTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    state.dom.tabTargets?.forEach((section) => {
      section.hidden = section.dataset.operatorTabTarget !== nextTab;
    });
    if (nextTab === 'pos') {
      if (typeof window.ReservaAiPosTerminalsAdmin?.activate === 'function') {
        window.ReservaAiPosTerminalsAdmin.activate();
      }
      if (typeof window.ReservaAiPosPaymentsConfig?.activate === 'function') {
        window.ReservaAiPosPaymentsConfig.activate();
      }
    }
    if (nextTab === 'feriados' && typeof window.ReservaAiOperatorSpecialDates?.onTabActivated === 'function') {
      void window.ReservaAiOperatorSpecialDates.onTabActivated();
    }
    if (nextTab === 'geral' && typeof window.ReservaAiTenantCompany?.activate === 'function') {
      void window.ReservaAiTenantCompany.activate({
        session: state.session,
        tenantId: state.selectedTenantId,
        me: state.me,
        tenantOptions: state.tenantOptions,
      });
    } else if (typeof window.ReservaAiTenantCompany?.deactivate === 'function') {
      window.ReservaAiTenantCompany.deactivate();
    }
    if (state.dom.save) {
      state.dom.save.hidden = nextTab === 'geral';
    }
  }

  function applyPaymentsRules() {
    if (!state.paymentConfig) {
      return;
    }

    const manualPixEnabled = state.dom.paymentsManualPixFlowEnabled.checked;
    const enabled = state.dom.paymentsEnabled.checked;
    const allowGatewayFlags = enabled && !manualPixEnabled;

    state.dom.paymentsManualPixKey.disabled = !manualPixEnabled;
    state.dom.paymentsRequirePayment.disabled = !allowGatewayFlags;
    state.dom.paymentsScheduleEnabled.disabled = !allowGatewayFlags;
    if (state.dom.paymentsEnableSplit) {
      state.dom.paymentsEnableSplit.disabled = !allowGatewayFlags;
    }
    state.dom.paymentsNeverChargeReschedule.disabled = !allowGatewayFlags;
    state.dom.paymentsDiscountEnabled.disabled = !allowGatewayFlags;
    state.dom.paymentsDiscountType.disabled = !allowGatewayFlags || !state.dom.paymentsDiscountEnabled.checked;
    state.dom.paymentsDiscountValue.disabled = !allowGatewayFlags || !state.dom.paymentsDiscountEnabled.checked;
    state.dom.paymentsDepositAmount.disabled = !allowGatewayFlags;
    state.dom.paymentsExpirationMinutes.disabled = !allowGatewayFlags;
    state.dom.paymentsPixPayerDocumentTenant.disabled = !allowGatewayFlags;

    const hasUnit = Boolean(state.dom.paymentsUnitId.value);
    state.dom.paymentsUnitOverride.disabled = !hasUnit;
    state.dom.paymentsProvider.disabled = !hasUnit;
    state.dom.paymentsAccessToken.disabled = !hasUnit;
    state.dom.paymentsAccountId.disabled = !hasUnit;
    state.dom.paymentsPixPayerDocumentUnit.disabled = !hasUnit;
  }

  function collectPaymentsConfigFromForm() {
    const depositAmount = Number(state.dom.paymentsDepositAmount.value || 0);
    const expirationMinutes = Number(state.dom.paymentsExpirationMinutes.value || 30);
    const discountValue = Number(state.dom.paymentsDiscountValue.value || 0);

    state.paymentConfig = {
      ...state.paymentConfig,
      manualPixFlowEnabled: state.dom.paymentsManualPixFlowEnabled.checked,
      manualPixKey: state.dom.paymentsManualPixKey.value.trim(),
      enabled: state.dom.paymentsEnabled.checked,
      requirePayment: state.dom.paymentsRequirePayment.checked,
      schedulePaymentsEnabled: state.dom.paymentsScheduleEnabled.checked,
      enableSplitPayments: state.dom.paymentsEnableSplit?.checked === true,
      neverChargeReschedule: state.dom.paymentsNeverChargeReschedule.checked,
      depositAmount: Number.isFinite(depositAmount) ? Math.max(0, depositAmount) : 0,
      expirationMinutes: Number.isFinite(expirationMinutes) ? Math.max(1, expirationMinutes) : 30,
      discountEnabled: state.dom.paymentsDiscountEnabled.checked,
      discountType: state.dom.paymentsDiscountType.value || 'percentage',
      discountValue: Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0,
      pixPayerDocumentTenant: state.dom.paymentsPixPayerDocumentTenant.value.trim(),
      unitId: state.dom.paymentsUnitId.value || '',
      unitOverride: state.dom.paymentsUnitOverride.checked,
      provider: state.dom.paymentsProvider.value || 'mercado_pago',
      accessToken: state.dom.paymentsAccessToken.value.trim(),
      accountId: state.dom.paymentsAccountId.value.trim(),
      pixPayerDocumentUnit: state.dom.paymentsPixPayerDocumentUnit.value.trim(),
    };

    return state.paymentConfig;
  }

  async function reloadPaymentConfig() {
    const paymentsPayload = await requestExternal(`/payments/config${tenantQuery()}`);
    state.paymentConfig = normalizePaymentConfig(paymentsPayload);
    renderPaymentsForm();
  }

  async function persistEnableSplitPayments(enabled) {
    await requestExternal(`/payments/config${tenantQuery()}`, {
      method: 'POST',
      body: JSON.stringify({ enableSplitPayments: enabled === true }),
    });
  }

  async function savePaymentsConfig() {
    if (!state.selectedTenantId) {
      setStatus('Selecione uma empresa para salvar pagamentos.', 'warn');
      return;
    }

    const config = collectPaymentsConfigFromForm();
    if (config.manualPixFlowEnabled && !config.manualPixKey) {
      setStatus('Informe a chave Pix para usar o fluxo manual.', 'warn');
      return;
    }

    const splitEnabled = !config.manualPixFlowEnabled && config.enableSplitPayments === true;

    const tenantPayload = {
      enabled: config.manualPixFlowEnabled ? false : config.enabled,
      requirePayment: config.manualPixFlowEnabled ? false : config.requirePayment,
      schedulePaymentsEnabled: config.manualPixFlowEnabled ? false : config.schedulePaymentsEnabled,
      neverChargeReschedule: config.manualPixFlowEnabled ? false : config.neverChargeReschedule,
      depositAmount: config.depositAmount,
      expirationMinutes: config.expirationMinutes,
      discountEnabled: config.manualPixFlowEnabled ? false : config.discountEnabled,
      discountType: config.discountType,
      discountValue: config.discountValue,
      pixPayerDocument: config.pixPayerDocumentTenant || null,
      manualPixFlowEnabled: config.manualPixFlowEnabled,
      manualPixKey: config.manualPixFlowEnabled ? config.manualPixKey : null,
      enableSplitPayments: splitEnabled,
    };

    setStatus('Salvando configuração de pagamentos...', 'neutral');
    await requestExternal(`/payments/config${tenantQuery()}`, {
      method: 'POST',
      body: JSON.stringify(tenantPayload),
    });

    if (config.unitId) {
      const unitPayload = {
        unitId: config.unitId,
        unitOverride: config.unitOverride,
        provider: config.provider,
        accessToken: config.accessToken || null,
        accountId: config.accountId || null,
        pixPayerDocument: config.pixPayerDocumentUnit || null,
      };
      await requestExternal(`/payments/config${tenantQuery()}`, {
        method: 'POST',
        body: JSON.stringify(unitPayload),
      });
    }

    await persistEnableSplitPayments(splitEnabled);

    await recordAudit('PAYMENTS_CONFIG_UPDATED', 'payments-config', state.selectedTenantId, 'Configuração de pagamentos atualizada.', {
      tenantId: state.selectedTenantId,
      manualPixFlowEnabled: config.manualPixFlowEnabled,
      enabled: config.enabled,
      enableSplitPayments: splitEnabled,
      unitId: config.unitId || null,
    });

    await reloadPaymentConfig();
    setStatus('Configuração de pagamentos salva com sucesso.', 'success');
  }

  function collectConfigFromForm() {
    if (isSolarSettingsUi()) {
      state.solarEnabled = state.dom.solarEnabled?.checked === true;
      state.solarEnergyConfig = collectSolarPayload();
      return {
        ...state.config,
        agentType: 'solar',
      };
    }

    const workingDays = state.dom.workingDays
      ? Array.from(state.dom.workingDays.querySelectorAll('input[type="checkbox"]:checked')).map((input) => Number(input.value))
      : (Array.isArray(state.config?.workingDays) ? state.config.workingDays : [1, 2, 3, 4, 5]);
    const reminderMinutesBefore = Number(state.dom.reminderMinutesBefore?.value || state.config?.reminderMinutesBefore || 60);
    const minimumBookingLeadMinutes = Number(state.dom.minimumBookingLeadMinutes?.value || state.config?.minimumBookingLeadMinutes || 0);
    return {
      botEnabled: state.config.botEnabled,
      agentType: state.config.agentType,
      calendarProvider: state.dom.calendarProvider?.value || state.config?.calendarProvider || 'internal',
      multiBranch: branchesEnabledForPayload(),
      professionalSchedule: state.dom.professionalSchedule?.checked ?? state.config?.professionalSchedule,
      whatsappWelcomeReplyButtons: state.dom.welcomeReplyButtons?.checked ?? state.config?.whatsappWelcomeReplyButtons,
      autoSchedule: state.dom.autoSchedule?.checked ?? state.config?.autoSchedule,
      staffAgendaWhatsapp: state.dom.staffAgendaWhatsapp?.checked ?? state.config?.staffAgendaWhatsapp,
      appointmentConfirmation: state.dom.appointmentConfirmation?.checked ?? state.config?.appointmentConfirmation,
      allowAppointmentConfirmationWithoutPayment: state.dom.allowConfirmWithoutPayment?.checked ?? state.config?.allowAppointmentConfirmationWithoutPayment,
      cancelWithoutConfirmation: state.dom.cancelWithoutConfirmation?.checked ?? state.config?.cancelWithoutConfirmation,
      allowOverlappingAppointments: state.dom.allowOverlapping?.checked ?? state.config?.allowOverlappingAppointments,
      reactivation: state.dom.reactivation?.checked ?? state.config?.reactivation,
      sameDayPriority: state.dom.sameDayPriority?.checked ?? state.config?.sameDayPriority,
      enableServiceConfirmation: state.dom.enableServiceConfirmation?.checked ?? state.config?.enableServiceConfirmation,
      enableBookingReminder: state.dom.enableBookingReminder?.checked ?? state.config?.enableBookingReminder,
      enableAutoCustomerIngest: state.dom.enableAutoCustomerIngest?.checked === true,
      enableServicePackages: state.dom.enableServicePackages?.checked === true,
      enableHaircutPhotoHistory: state.dom.enableHaircutPhotoHistory?.checked === true,
      haircutPhotosPromptMode: state.dom.haircutPhotosPromptMode?.value || 'manual_only',
      reminderMinutesBefore: Math.min(1440, Math.max(5, Number.isFinite(reminderMinutesBefore) ? reminderMinutesBefore : 60)),
      staffAgendaFallbackPhone: state.dom.fallbackPhone?.value?.trim() ?? state.config?.staffAgendaFallbackPhone ?? '',
      workingDays,
      startTime: state.dom.startTime?.value || state.config?.startTime || '09:00',
      endTime: state.dom.endTime?.value || state.config?.endTime || '18:00',
      serviceDurationDefaultMinutes: Number(state.dom.durationDefault?.value || state.config?.serviceDurationDefaultMinutes || 60),
      slotIntervalMinutes: Number(state.dom.slotInterval?.value || state.config?.slotIntervalMinutes || 15),
      minimumBookingLeadMinutes: Math.min(240, Math.max(0, Number.isFinite(minimumBookingLeadMinutes) ? Math.round(minimumBookingLeadMinutes) : 0)),
      services: state.config.services
        .map((service) => ({
          name: String(service.name || '').trim(),
          durationMinutes: Number(service.durationMinutes || 0),
          price: service.price === '' ? undefined : Number(service.price || 0),
        }))
        .filter((service) => service.name),
    };
  }

  function syncSingleBranchAssignments() {
    if (!state.config || state.config.multiBranch) {
      return;
    }

    const primaryBranch = getPrimaryBranch();
    if (!primaryBranch || !primaryBranch.id) {
      state.professionals.forEach((professional) => {
        professional.branchIds = [];
        professional.branchId = '';
      });
      return;
    }

    state.professionals.forEach((professional) => {
      professional.branchIds = [primaryBranch.id];
      professional.branchId = primaryBranch.id;
    });
  }

  function hasMultipleBranches() {
    return state.branches.filter((branch) => String(branch?.name || '').trim()).length > 1;
  }

  /** Checkbox removido da UI: o PUT deve manter filiais sempre habilitadas (omitir = backend desliga). */
  function branchesEnabledForPayload() {
    return true;
  }

  async function fetchLatestTenantSettingsForSave() {
    try {
      const latest = await requestExternal(`/tenant-settings${tenantQuery()}`);
      if (latest && typeof latest === 'object') {
        return latest;
      }
    } catch (_) {
      // Fallback para estado em memória quando o refresh falhar.
    }
    return state.rawTenantSettings || {};
  }

  function sanitizeTenantSettingsForPut(settings) {
    const safeSettings = (settings && typeof settings === 'object') ? { ...settings } : {};
    delete safeSettings.tenantId;

    if (safeSettings.company && typeof safeSettings.company === 'object') {
      safeSettings.company = { ...safeSettings.company };
      delete safeSettings.company.logoStored;
    }

    return safeSettings;
  }

  function findProfessionalsLinkedToBranch(branchId) {
    if (!branchId) {
      return [];
    }

    return state.professionals.filter((professional) => professional.branchId === branchId || professional.branchIds.includes(branchId));
  }

  async function saveTenantSettings() {
    if (!state.selectedTenantId) {
      setStatus('Selecione uma empresa para salvar as configurações.', 'warn');
      return;
    }

    if (state.dom.crmFields) {
      state.crmEnrichment = collectCrmFromForm();
    }

    const branchServiceOverrides = state.config?.branchServiceOverrides || {};
    state.config = collectConfigFromForm();
    state.config.branchServiceOverrides = branchServiceOverrides;
    pruneStaleServiceLinksAgainstCatalog();
    const latestTenantSettings = sanitizeTenantSettingsForPut(await fetchLatestTenantSettingsForSave());

    setStatus('Salvando configuração principal...', 'neutral');

    const payload = {
      ...latestTenantSettings,
      botEnabled: state.config.botEnabled,
      agentConfig: {
        ...(latestTenantSettings.agentConfig || {}),
        agent_type: state.config.agentType,
        schedule: {
          ...((latestTenantSettings.agentConfig && latestTenantSettings.agentConfig.schedule) || {}),
          workingDays: state.config.workingDays,
          startTime: state.config.startTime,
          endTime: state.config.endTime,
          serviceDurationDefaultMinutes: state.config.serviceDurationDefaultMinutes,
          slotIntervalMinutes: state.config.slotIntervalMinutes,
          minimumBookingLeadMinutes: state.config.minimumBookingLeadMinutes,
        },
        calendar: {
          ...((latestTenantSettings.agentConfig && latestTenantSettings.agentConfig.calendar) || {}),
          provider: state.config.calendarProvider,
        },
        services: state.config.services,
        branchScheduleOverrides: buildBranchScheduleOverridesForSave(),
        features: {
          ...((latestTenantSettings.agentConfig && latestTenantSettings.agentConfig.features) || {}),
          professional_schedule: state.config.professionalSchedule,
          branches_enabled: branchesEnabledForPayload(),
          multi_branch: branchesEnabledForPayload(),
          whatsapp_welcome_reply_buttons: state.config.whatsappWelcomeReplyButtons,
          auto_schedule: state.config.autoSchedule,
          staff_agenda_whatsapp: state.config.staffAgendaWhatsapp,
          appointment_confirmation: state.config.appointmentConfirmation,
          allow_appointment_confirmation_without_payment: state.config.allowAppointmentConfirmationWithoutPayment,
          cancel_without_confirmation: state.config.cancelWithoutConfirmation,
          allow_overlapping_appointments: state.config.allowOverlappingAppointments,
          reactivation: state.config.reactivation,
          same_day_priority: state.config.sameDayPriority,
        },
        staffAgendaFallbackPhone: state.config.staffAgendaFallbackPhone || undefined,
        crmEnrichment: buildCrmEnrichmentPayload(
          state.crmEnrichment || mergeCrmEnrichmentConfig(latestTenantSettings.agentConfig?.crmEnrichment),
        ),
      },
      tenantFeatures: {
        ...(latestTenantSettings.tenantFeatures || {}),
        enableServiceConfirmation: state.config.enableServiceConfirmation,
        enableBookingReminder: state.config.enableBookingReminder,
        enableAutoCustomerIngest: state.config.enableAutoCustomerIngest === true,
        enableServicePackages: state.config.enableServicePackages === true,
        enableHaircutPhotoHistory: state.config.enableHaircutPhotoHistory === true,
        haircutPhotosPromptMode: state.config.haircutPhotosPromptMode || 'manual_only',
        reminderMinutesBefore: state.config.reminderMinutesBefore,
      },
    };

    if (isSolarSettingsUi()) {
      payload.features = {
        ...(latestTenantSettings.features || {}),
        features: {
          ...((latestTenantSettings.features || {}).features || {}),
          [SOLAR_FEATURE_KEY]: state.solarEnabled === true,
        },
      };
      payload.solarEnergyConfig = state.solarEnergyConfig || collectSolarPayload();
      payload.agentConfig.agent_type = 'solar';
    }

    await requestExternal(`/tenant-settings${tenantQuery()}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    await recordAudit(
      'TENANT_SETTINGS_UPDATED',
      'tenant-settings',
      state.selectedTenantId,
      'Configuração principal da operação atualizada.',
      {
        tenantId: state.selectedTenantId,
        botEnabled: state.config.botEnabled,
        multiBranch: branchesEnabledForPayload(),
        professionalSchedule: state.config.professionalSchedule,
      },
    );
    setStatus('Configuração principal salva com sucesso.', 'success');
    persistHaircutFlagsToBrowserStorage(state.selectedTenantId, state.config);
    try {
      window.dispatchEvent(new CustomEvent('reserva:tenant-settings-updated'));
    } catch {
      /* ignore */
    }
    await loadWorkspace();
  }

  async function persistBranchServiceOverrides() {
    const latestTenantSettings = sanitizeTenantSettingsForPut(await fetchLatestTenantSettingsForSave());
    const payload = {
      ...latestTenantSettings,
      botEnabled: state.config.botEnabled,
      agentConfig: {
        ...(latestTenantSettings.agentConfig || {}),
        branchScheduleOverrides: buildBranchScheduleOverridesForSave(),
        features: {
          ...((latestTenantSettings.agentConfig || {}).features || {}),
          branches_enabled: branchesEnabledForPayload(),
          multi_branch: branchesEnabledForPayload(),
        },
      },
      tenantFeatures: latestTenantSettings.tenantFeatures || undefined,
    };
    await requestExternal(`/tenant-settings${tenantQuery()}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async function saveBranch(index) {
    const branch = state.branches[index];
    if (!branch || !branch.name.trim()) {
      setStatus('Informe ao menos o nome da unidade.', 'warn');
      return;
    }

    const payload = {
      name: branch.name.trim(),
      address: branch.address?.trim() || undefined,
      sortOrder: Number(branch.sortOrder || 0),
      isDefault: Boolean(branch.isDefault),
    };

    setStatus(branch.id ? 'Atualizando unidade...' : 'Criando unidade...', 'neutral');
    if (branch.id) {
      await requestExternal(`/branches/${encodeURIComponent(branch.id)}${tenantQuery()}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await persistBranchServiceOverrides();
      await recordAudit('BRANCH_UPDATED', 'branch', branch.id, `Unidade ${branch.name.trim()} atualizada.`, {
        tenantId: state.selectedTenantId,
        branchId: branch.id,
        name: payload.name,
      });
    } else {
      const createdBranch = await requestExternal(`/branches${tenantQuery()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (createdBranch?.id) {
        state.branches[index] = {
          ...branch,
          id: createdBranch.id,
        };
      }
      await persistBranchServiceOverrides();
      await recordAudit('BRANCH_CREATED', 'branch', createdBranch?.id || payload.name, `Nova unidade ${payload.name} criada.`, {
        tenantId: state.selectedTenantId,
        branchId: createdBranch?.id || null,
        name: payload.name,
      });
    }
    setStatus('Unidade salva com sucesso.', 'success');
    await loadWorkspace();
  }

  async function deleteBranch(index) {
    const branch = state.branches[index];
    if (!branch) {
      return;
    }

    const linkedProfessionals = findProfessionalsLinkedToBranch(branch.id);
    if (linkedProfessionals.length) {
      const linkedNames = linkedProfessionals
        .map((professional) => professional.name)
        .filter(Boolean)
        .join(', ');
      setStatus(
        linkedNames
          ? `Remova o vínculo dos profissionais ${linkedNames} com a unidade ${branch.name || 'selecionada'} antes de excluir.`
          : 'Remova o vínculo dos profissionais com esta unidade antes de excluir.',
        'warn',
      );
      return;
    }

    if (!branch.id) {
      state.branches.splice(index, 1);
      renderBranches();
      return;
    }

    setStatus('Excluindo unidade...', 'neutral');
    await requestExternal(`/branches/${encodeURIComponent(branch.id)}${tenantQuery()}`, { method: 'DELETE' });
    await recordAudit('BRANCH_DELETED', 'branch', branch.id, `Unidade ${branch.name || branch.id} excluída.`, {
      tenantId: state.selectedTenantId,
      branchId: branch.id,
      name: branch.name,
    });
    setStatus('Unidade excluída.', 'success');
    await loadWorkspace();
  }

  async function saveProfessional(index) {
    const professional = state.professionals[index];
    if (!professional) {
      return;
    }

    syncProfessionalDetailFromDom(index);

    if (!professional.userId) {
      setStatus('Selecione o usuário vinculado para o profissional.', 'warn');
      return;
    }

    const selectedMember = state.tenantMembers.find((member) => member.userId === professional.userId);
    if (!selectedMember) {
      setStatus('Usuário vinculado inválido para o tenant selecionado.', 'warn');
      return;
    }

    const derivedProfessionalName = String(
      selectedMember.fullName
      || selectedMember.email
      || professional.linkedUserName
      || professional.name
      || ''
    ).trim();
    if (!derivedProfessionalName) {
      setStatus('Não foi possível definir o nome do profissional a partir do usuário vinculado.', 'warn');
      return;
    }
    professional.name = derivedProfessionalName;
    professional.services = canonicalizeProfessionalServices(professional.services, professional.branchId);

    const shareRaw = professional.serviceProfessionalSharePct;
    const shareNum = shareRaw === null || shareRaw === undefined || shareRaw === ''
      ? null
      : Number(shareRaw);
    if (shareNum !== null && (Number.isNaN(shareNum) || shareNum < 0 || shareNum > 100)) {
      setStatus('Partilha da agenda (%) deve ficar entre 0 e 100, ou vazio para não aplicar.', 'warn');
      return;
    }

    const duplicatedActiveLink = state.professionals.some((item, itemIndex) => (
      itemIndex !== index
      && Boolean(item.isActive)
      && item.userId === professional.userId
    ));
    if (professional.isActive && duplicatedActiveLink) {
      setStatus('Este usuário já está vinculado a outro barbeiro ativo.', 'warn');
      return;
    }

    const payload = {
      name: professional.name.trim(),
      type: normalizeProfessionalTypeValue(professional.type) || 'BARBER',
      userId: professional.userId || null,
      displayName: selectedMember.fullName || professional.name.trim(),
      email: selectedMember.email || undefined,
      isActive: Boolean(professional.isActive),
      whatsappPhone: professional.whatsappPhone.trim() || undefined,
      services: professional.services,
      branchIds: professional.branchId ? [professional.branchId] : [],
      schedule: {
        workingDays: professional.schedule.workingDays,
        startTime: professional.schedule.startTime,
        endTime: professional.schedule.endTime,
        weeklyBreaks: normalizeWeeklyBreaks(professional.schedule.weeklyBreaks),
      },
      serviceProfessionalSharePct: shareNum === null ? null : shareNum,
      preferredPosTerminalId: normalizePreferredPosTerminalId(professional.preferredPosTerminalId),
      // Mantemos meta.userId por retrocompatibilidade, mas o vínculo oficial é no campo raiz userId.
      meta: {
        ...(professional.meta && typeof professional.meta === 'object' ? professional.meta : {}),
        userId: professional.userId,
      },
    };

    if (!professional.branchId) {
      setStatus('Selecione a filial do profissional antes de salvar.', 'warn');
      return;
    }

    const catalogList = getEffectiveServiceNamesForBranch(professional.branchId);
    if (!catalogList.length) {
      setStatus('Cadastre serviços no catálogo desta unidade (aba Serviços) antes de vincular ao profissional.', 'warn');
      return;
    }

    setStatus(professional.id ? 'Atualizando profissional...' : 'Criando profissional...', 'neutral');
    if (professional.id) {
      await requestExternal(`/professionals/${encodeURIComponent(professional.id)}${tenantQuery()}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await recordAudit('PROFESSIONAL_UPDATED', 'professional', professional.id, `Profissional ${professional.name.trim()} atualizado.`, {
        tenantId: state.selectedTenantId,
        professionalId: professional.id,
        name: payload.name,
        isActive: payload.isActive,
      });
    } else {
      const createdProfessional = await requestExternal(`/professionals${tenantQuery()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await recordAudit('PROFESSIONAL_CREATED', 'professional', createdProfessional?.id || payload.name, `Profissional ${payload.name} criado.`, {
        tenantId: state.selectedTenantId,
        professionalId: createdProfessional?.id || null,
        name: payload.name,
      });
    }

    const branchIdx = state.branches.findIndex((b) => b.id === professional.branchId);
    if (branchIdx >= 0 && payload.services.length) {
      const branch = state.branches[branchIdx];
      state.branches[branchIdx] = {
        ...branch,
        serviceNames: Array.from(new Set([...(branch.serviceNames || []), ...payload.services])),
      };
      await persistBranchServiceOverrides();
    }

    setStatus('Profissional salvo com sucesso.', 'success');
    await loadWorkspace();
  }

  async function deleteProfessional(index) {
    const professional = state.professionals[index];
    if (!professional) {
      return;
    }

    if (!professional.id) {
      state.professionals.splice(index, 1);
      renderProfessionals();
      return;
    }

    setStatus('Excluindo profissional...', 'neutral');
    await requestExternal(`/professionals/${encodeURIComponent(professional.id)}${tenantQuery()}`, { method: 'DELETE' });
    await recordAudit('PROFESSIONAL_DELETED', 'professional', professional.id, `Profissional ${professional.name || professional.id} excluído.`, {
      tenantId: state.selectedTenantId,
      professionalId: professional.id,
      name: professional.name,
    });
    setStatus('Profissional excluído.', 'success');
    await loadWorkspace();
  }

  function bindStaticEvents() {
    const syncExternalTenantSelects = () => {
      if (state.dom.servicesTenantSelect) {
        state.dom.servicesTenantSelect.value = state.selectedTenantId || '';
      }
      if (state.dom.professionalsTenantSelect) {
        state.dom.professionalsTenantSelect.value = state.selectedTenantId || '';
      }
    };

    state.dom.tenantSelect?.addEventListener('change', () => {
      state.selectedTenantId = state.dom.tenantSelect.value;
      writeStorage(TENANT_STORAGE_KEY, state.selectedTenantId);
      const tenant = state.tenantOptions.find((item) => item.id === state.selectedTenantId);
      window.ReservaAiAuth?.savePreferredLoginTenant?.(state.selectedTenantId, tenant?.name);
      syncExternalTenantSelects();
      void loadWorkspace().catch((error) => setStatus(error.message || 'Não foi possível recarregar a configuração.', 'warn'));
    });

    state.dom.refresh?.addEventListener('click', () => {
      void loadWorkspace().catch((error) => setStatus(error.message || 'Não foi possível atualizar os dados.', 'warn'));
    });

    state.dom.save?.addEventListener('click', () => {
      void saveTenantSettings().catch((error) => setStatus(error.message || 'Não foi possível salvar as configurações.', 'warn'));
    });

    state.dom.tabButtons?.forEach((button) => {
      button.addEventListener('click', () => applyOperatorTab(button.dataset.operatorTab));
    });

    state.dom.solarEnabled?.addEventListener('change', () => {
      applySolarPanelVisibility();
    });

    state.dom.servicesTenantSelect?.addEventListener('change', () => {
      state.selectedTenantId = state.dom.servicesTenantSelect.value;
      writeStorage(TENANT_STORAGE_KEY, state.selectedTenantId);
      if (state.dom.tenantSelect) {
        state.dom.tenantSelect.value = state.selectedTenantId || '';
      }
      void loadWorkspace().catch((error) => setStatus(error.message || 'Não foi possível recarregar a configuração.', 'warn'));
    });

    state.dom.servicesRefresh?.addEventListener('click', () => {
      void loadWorkspace().catch((error) => setStatus(error.message || 'Não foi possível atualizar os dados.', 'warn'));
    });

    state.dom.servicesSave?.addEventListener('click', () => {
      void saveTenantSettings().catch((error) => setStatus(error.message || 'Não foi possível salvar as configurações.', 'warn'));
    });

    state.dom.professionalsTenantSelect?.addEventListener('change', () => {
      state.selectedTenantId = state.dom.professionalsTenantSelect.value;
      writeStorage(TENANT_STORAGE_KEY, state.selectedTenantId);
      if (state.dom.tenantSelect) {
        state.dom.tenantSelect.value = state.selectedTenantId || '';
      }
      if (state.dom.servicesTenantSelect) {
        state.dom.servicesTenantSelect.value = state.selectedTenantId || '';
      }
      void loadWorkspace().catch((error) => setStatus(error.message || 'Não foi possível recarregar a configuração.', 'warn'));
    });

    state.dom.professionalsRefresh?.addEventListener('click', () => {
      void loadWorkspace().catch((error) => setStatus(error.message || 'Não foi possível atualizar os dados.', 'warn'));
    });

    state.dom.crmEnabled?.addEventListener('change', applyCrmMasterToggleUi);
    state.dom.crmSave?.addEventListener('click', () => {
      void saveCrmSettings().catch((error) => setStatus(error.message || 'Não foi possível salvar o CRM.', 'warn'));
    });

    state.dom.paymentsSave?.addEventListener('click', () => {
      void savePaymentsConfig().catch((error) => setStatus(error.message || 'Não foi possível salvar pagamentos.', 'warn'));
    });

    state.dom.paymentsManualPixFlowEnabled?.addEventListener('change', () => {
      if (state.dom.paymentsManualPixFlowEnabled.checked) {
        state.dom.paymentsEnabled.checked = false;
        state.dom.paymentsRequirePayment.checked = false;
        state.dom.paymentsScheduleEnabled.checked = false;
        state.dom.paymentsNeverChargeReschedule.checked = false;
        state.dom.paymentsDiscountEnabled.checked = false;
      }
      applyPaymentsRules();
    });

    state.dom.paymentsEnabled?.addEventListener('change', () => {
      if (state.dom.paymentsEnabled.checked) {
        state.dom.paymentsManualPixFlowEnabled.checked = false;
      }
      applyPaymentsRules();
    });

    state.dom.paymentsDiscountEnabled?.addEventListener('change', applyPaymentsRules);
    state.dom.paymentsUnitId?.addEventListener('change', applyPaymentsRules);

    state.dom.addService?.addEventListener('click', () => {
      materializeBranchServicesCatalogIfNeeded();
      const draft = { id: `service-${Date.now()}`, name: '', durationMinutes: 35, price: '' };
      if (isEditingGlobalServicesCatalog()) {
        state.config.services.push(draft);
      } else {
        const branchId = getServicesCatalogEditorBranchId();
        if (!state.config.branchServiceOverrides[branchId]) {
          state.config.branchServiceOverrides[branchId] = {};
        }
        if (!Array.isArray(state.config.branchServiceOverrides[branchId].services)) {
          state.config.branchServiceOverrides[branchId].services = [];
        }
        state.config.branchServiceOverrides[branchId].services.push(draft);
        const bIdx = state.branches.findIndex((b) => b.id === branchId);
        if (bIdx >= 0) {
          const names = state.config.branchServiceOverrides[branchId].services.map((s) => String(s?.name || '').trim()).filter(Boolean);
          state.branches[bIdx].serviceNames = names;
        }
      }
      renderServices();
      renderBranches();
      renderProfessionals();
    });

    state.dom.servicesBranchSelect?.addEventListener('change', () => {
      state.servicesCatalogBranchId = state.dom.servicesBranchSelect.value;
      renderServices();
    });

    state.dom.addBranch?.addEventListener('click', () => {
      state.branches.push(normalizeBranch({}, state.branches.length));
      if (state.config) {
        state.config.multiBranch = branchesEnabledForPayload();
      }
      renderSummary();
      renderBranches();
      renderProfessionals();
    });

    state.dom.addProfessional?.addEventListener('click', () => {
      const draft = normalizeProfessional({}, state.professionals.length);
      const primaryBranch = getPrimaryBranch();
      if (primaryBranch?.id) {
        draft.branchId = primaryBranch.id;
        draft.branchIds = [primaryBranch.id];
      }
      state.professionals.push(draft);
      state.selectedProfessionalLocalKey = draft.localKey;
      state.professionalDetailTab = 'profile';
      state.professionalServicesEditOpen = false;
      state.professionalServicesSearch = '';
      renderProfessionals();
    });

    state.dom.professionalSchedule?.addEventListener('change', () => {
      if (state.config) {
        if (state.dom.professionalSchedule.checked && !hasActiveProfessionalWithName()) {
          state.dom.professionalSchedule.checked = false;
          state.config.professionalSchedule = false;
          setStatus('Cadastre pelo menos um profissional ativo com nome antes de ativar Preferência Profissional.', 'warn');
          return;
        }
        state.config.professionalSchedule = state.dom.professionalSchedule.checked;
        renderProfessionals();
        renderSummary();
      }
    });

    state.dom.enableBookingReminder?.addEventListener('change', () => {
      state.dom.reminderMinutesBefore.disabled = !state.dom.enableBookingReminder.checked;
    });

    state.dom.enableServicePackages?.addEventListener('change', () => {
      state.config.enableServicePackages = state.dom.enableServicePackages.checked === true;
      window.dispatchEvent(new CustomEvent('reserva:tenant-settings-updated'));
    });
    state.dom.enableHaircutPhotoHistory?.addEventListener('change', () => {
      state.config.enableHaircutPhotoHistory = state.dom.enableHaircutPhotoHistory.checked === true;
      if (state.dom.haircutPromptModeWrap) {
        state.dom.haircutPromptModeWrap.hidden = !state.config.enableHaircutPhotoHistory;
      }
    });

  }

  function bindDynamicEvents() {
    state.dom.services?.addEventListener('input', (event) => {
      const row = event.target.closest('[data-service-index]');
      const field = event.target.dataset.serviceField;
      if (!row || !field) {
        return;
      }

      const index = Number(row.dataset.serviceIndex);
      const value = event.target.value;
      const coerced = field === 'name' ? value : (value === '' ? '' : Number(value));
      materializeBranchServicesCatalogIfNeeded();
      if (isEditingGlobalServicesCatalog()) {
        state.config.services[index][field] = coerced;
        return;
      }
      const branchId = getServicesCatalogEditorBranchId();
      if (!branchId || !state.config.branchServiceOverrides[branchId]?.services?.[index]) {
        return;
      }
      state.config.branchServiceOverrides[branchId].services[index][field] = coerced;
    });

    state.dom.services?.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-service-remove]');
      if (!removeButton) {
        return;
      }
      const index = Number(removeButton.dataset.serviceRemove);
      materializeBranchServicesCatalogIfNeeded();
      if (isEditingGlobalServicesCatalog()) {
        state.config.services.splice(index, 1);
      } else {
        const branchId = getServicesCatalogEditorBranchId();
        state.config.branchServiceOverrides[branchId]?.services?.splice(index, 1);
        const bIdx = state.branches.findIndex((b) => b.id === branchId);
        const names = state.config.branchServiceOverrides[branchId]?.services?.map((s) => String(s?.name || '').trim()).filter(Boolean) || [];
        if (bIdx >= 0) {
          state.branches[bIdx].serviceNames = names;
        }
      }
      pruneStaleServiceLinksAgainstCatalog();
      renderServices();
      renderBranches();
      renderProfessionals();
    });

    state.dom.branches?.addEventListener('input', (event) => {
      const row = event.target.closest('[data-branch-index]');
      const field = event.target.dataset.branchField;
      const branchService = event.target.dataset.branchService;
      if (!row || (!field && branchService === undefined)) {
        return;
      }

      const index = Number(row.dataset.branchIndex);
      if (field) {
        state.branches[index][field] = event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.type === 'number'
            ? Number(event.target.value || 0)
            : event.target.value;
      }
      if (branchService !== undefined) {
        const current = new Set(Array.isArray(state.branches[index].serviceNames) ? state.branches[index].serviceNames : []);
        if (event.target.checked) {
          current.add(branchService);
        } else {
          current.delete(branchService);
        }
        state.branches[index].serviceNames = Array.from(current);
      }
    });

    state.dom.branches?.addEventListener('click', (event) => {
      const saveButton = event.target.closest('[data-branch-save]');
      const deleteButton = event.target.closest('[data-branch-delete]');
      if (saveButton) {
        void saveBranch(Number(saveButton.dataset.branchSave)).catch((error) => setStatus(error.message || 'Não foi possível salvar a unidade.', 'warn'));
      }
      if (deleteButton) {
        void deleteBranch(Number(deleteButton.dataset.branchDelete)).catch((error) => setStatus(error.message || 'Não foi possível excluir a unidade.', 'warn'));
      }
    });

    state.dom.professionals?.addEventListener('input', (event) => {
      if (event.target.matches('[data-professionals-search]')) {
        state.professionalsSearch = event.target.value || '';
        renderProfessionals();
        return;
      }
      if (event.target.matches('[data-pro-services-search]')) {
        state.professionalServicesSearch = event.target.value || '';
        const detail = state.dom.professionals.querySelector('[data-professional-tab-content="services"] .pro-services-list');
        if (detail) {
          renderProfessionals();
        }
        return;
      }
      const row = event.target.closest('[data-professional-index]');
      if (!row) {
        return;
      }

      const index = Number(row.dataset.professionalIndex);
      const field = event.target.dataset.professionalField;
      const scheduleField = event.target.dataset.professionalSchedule;
      const dayValue = event.target.dataset.professionalDay;
      const breakIndexValue = event.target.dataset.professionalBreakIndex;
      const breakField = event.target.dataset.professionalBreakField;
      const breakDayValue = event.target.dataset.professionalBreakDay;
      const serviceValue = event.target.dataset.professionalService;
      const professional = state.professionals[index];

      if (field) {
        if (field === 'serviceProfessionalSharePct') {
          professional[field] = parseServiceProfessionalSharePctInput(event.target.value);
        } else if (field === 'preferredPosTerminalId') {
          professional[field] = normalizePreferredPosTerminalId(event.target.value);
        } else {
          professional[field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        }
        if (field === 'userId') {
          const linkedMember = state.tenantMembers.find((member) => member.userId === professional.userId);
          professional.name = String(linkedMember?.fullName || linkedMember?.email || '').trim();
          renderProfessionals();
          return;
        }
        if (field === 'branchId') {
          professional.branchIds = professional.branchId ? [professional.branchId] : [];
          professional.services = [];
          renderProfessionals();
          return;
        }
        if (field === 'preferredPosTerminalId') {
          return;
        }
      }

      if (scheduleField) {
        professional.schedule[scheduleField] = event.target.value;
      }

      if (dayValue !== undefined) {
        const day = Number(dayValue);
        professional.schedule.workingDays = event.target.checked
          ? Array.from(new Set([...professional.schedule.workingDays, day])).sort((left, right) => left - right)
          : professional.schedule.workingDays.filter((item) => item !== day);
        const dayPill = event.target.closest('.pro-day-pill');
        if (dayPill) {
          dayPill.classList.toggle('is-checked', Boolean(event.target.checked));
        }
      }

      if (breakField && breakIndexValue !== undefined) {
        const breakIndex = Number(breakIndexValue);
        if (!Number.isNaN(breakIndex) && professional.schedule.weeklyBreaks?.[breakIndex]) {
          professional.schedule.weeklyBreaks[breakIndex][breakField] = event.target.value;
        }
      }

      if (breakDayValue !== undefined && breakIndexValue !== undefined) {
        const breakIndex = Number(breakIndexValue);
        const breakDay = Number(breakDayValue);
        const currentBreak = professional.schedule.weeklyBreaks?.[breakIndex];
        if (!Number.isNaN(breakIndex) && currentBreak) {
          const currentDays = Array.isArray(currentBreak.weekdays) ? currentBreak.weekdays : [];
          currentBreak.weekdays = event.target.checked
            ? Array.from(new Set([...currentDays, breakDay])).sort((left, right) => left - right)
            : currentDays.filter((item) => item !== breakDay);
        }
        const breakDayPill = event.target.closest('.pro-day-pill');
        if (breakDayPill) {
          breakDayPill.classList.toggle('is-checked', Boolean(event.target.checked));
        }
      }

      if (serviceValue !== undefined) {
        professional.services = event.target.checked
          ? Array.from(new Set([...professional.services, serviceValue]))
          : professional.services.filter((item) => item !== serviceValue);
      }

      professional.services = canonicalizeProfessionalServices(professional.services, professional.branchId);
    });

    state.dom.professionals?.addEventListener('change', (event) => {
      if (!event.target.matches('[data-professional-schedule], input[data-professional-day], [data-professional-break-field], input[data-professional-break-day]')) {
        return;
      }
      const row = event.target.closest('[data-professional-index]');
      if (!row) {
        return;
      }
      const idx = Number(row.dataset.professionalIndex);
      const prof = state.professionals[idx];
      if (!prof?.schedule) {
        return;
      }
      if (event.target.matches('[data-professional-schedule]')) {
        const key = event.target.dataset.professionalSchedule;
        if (key) {
          prof.schedule[key] = event.target.value;
        }
        return;
      }
      if (event.target.matches('[data-professional-break-field]')) {
        const breakIndex = Number(event.target.dataset.professionalBreakIndex);
        const breakField = event.target.dataset.professionalBreakField;
        if (!Number.isNaN(breakIndex) && breakField && prof.schedule.weeklyBreaks?.[breakIndex]) {
          prof.schedule.weeklyBreaks[breakIndex][breakField] = event.target.value;
        }
        return;
      }
      if (event.target.matches('input[data-professional-break-day]')) {
        const breakIndex = Number(event.target.dataset.professionalBreakIndex);
        const day = Number(event.target.dataset.professionalBreakDay);
        const currentBreak = !Number.isNaN(breakIndex) ? prof.schedule.weeklyBreaks?.[breakIndex] : null;
        if (currentBreak) {
          const currentDays = Array.isArray(currentBreak.weekdays) ? currentBreak.weekdays : [];
          currentBreak.weekdays = event.target.checked
            ? Array.from(new Set([...currentDays, day])).sort((a, b) => a - b)
            : currentDays.filter((item) => item !== day);
        }
        return;
      }
      const dayRaw = event.target.dataset.professionalDay;
      if (dayRaw !== undefined) {
        const day = Number(dayRaw);
        prof.schedule.workingDays = event.target.checked
          ? Array.from(new Set([...(prof.schedule.workingDays || []), day])).sort((a, b) => a - b)
          : (prof.schedule.workingDays || []).filter((item) => item !== day);
      }
    });

    state.dom.professionals?.addEventListener('click', (event) => {
      const pickButton = event.target.closest('[data-professional-pick]');
      const tabButton = event.target.closest('[data-professional-tab]');
      const openCalendarButton = event.target.closest('[data-professional-open-calendar]');
      const addButton = event.target.closest('[data-pro-add]');
      const editServicesToggle = event.target.closest('[data-pro-services-edit-toggle]');
      const addBreakButton = event.target.closest('[data-professional-break-add]');
      const removeBreakButton = event.target.closest('[data-professional-break-remove]');

      if (addButton) {
        state.dom.addProfessional?.click();
        return;
      }

      if (editServicesToggle) {
        const wasEditingServices = state.professionalServicesEditOpen;
        state.professionalServicesEditOpen = !wasEditingServices;
        if (wasEditingServices) {
          const idx = state.professionals.findIndex((item) => item.localKey === state.selectedProfessionalLocalKey);
          if (idx >= 0) {
            void saveProfessional(idx).catch((error) =>
              setStatus(error.message || 'Não foi possível salvar os serviços do profissional.', 'warn'));
          }
        }
        renderProfessionals();
        return;
      }

      if (addBreakButton) {
        const row = addBreakButton.closest('[data-professional-index]');
        const idx = row ? Number(row.dataset.professionalIndex) : Number(addBreakButton.dataset.professionalBreakAdd);
        const prof = state.professionals[idx];
        if (prof?.schedule) {
          prof.schedule.weeklyBreaks = Array.isArray(prof.schedule.weeklyBreaks) ? prof.schedule.weeklyBreaks : [];
          prof.schedule.weeklyBreaks.push({
            weekdays: [1, 2, 3, 4, 5, 6],
            startTime: '13:00',
            endTime: '14:00',
            label: 'Almoço',
          });
          renderProfessionals();
        }
        return;
      }

      if (removeBreakButton) {
        const row = removeBreakButton.closest('[data-professional-index]');
        const idx = row ? Number(row.dataset.professionalIndex) : NaN;
        const breakIndex = Number(removeBreakButton.dataset.professionalBreakRemove);
        const prof = state.professionals[idx];
        if (prof?.schedule && !Number.isNaN(breakIndex)) {
          prof.schedule.weeklyBreaks = (prof.schedule.weeklyBreaks || []).filter((item, itemIndex) => itemIndex !== breakIndex);
          renderProfessionals();
        }
        return;
      }

      if (pickButton) {
        state.selectedProfessionalLocalKey = pickButton.dataset.professionalPick || '';
        state.professionalServicesSearch = '';
        state.professionalServicesEditOpen = false;
        renderProfessionals();
        return;
      }
      if (tabButton) {
        const requested = tabButton.dataset.professionalTab;
        state.professionalDetailTab = ['services', 'schedule', 'commission', 'pos', 'profile'].includes(requested) ? requested : 'services';
        renderProfessionals();
        return;
      }
      if (openCalendarButton) {
        window.location.hash = '#calendario';
        return;
      }
      const saveButton = event.target.closest('[data-professional-save]');
      const deleteButton = event.target.closest('[data-professional-delete]');
      if (saveButton) {
        void saveProfessional(Number(saveButton.dataset.professionalSave)).catch((error) => setStatus(error.message || 'Não foi possível salvar o profissional.', 'warn'));
      }
      if (deleteButton) {
        void deleteProfessional(Number(deleteButton.dataset.professionalDelete)).catch((error) => setStatus(error.message || 'Não foi possível excluir o profissional.', 'warn'));
      }
    });
  }

  function mount() {
    if (state.mounted) {
      return true;
    }

    const root = qs('#operatorConfigRoot');
    if (!root) {
      return false;
    }

    state.dom = {
      root,
      status: qs('#operatorConfigStatus'),
      servicesStatus: qs('#operatorConfigServicesStatus'),
      professionalsStatus: qs('#operatorConfigProfessionalsStatus'),
      title: qs('#operatorConfigTitle'),
      subtitle: qs('#operatorConfigSubtitle'),
      branchNote: qs('#operatorConfigBranchNote'),
      tenantSelect: qs('#operatorConfigTenant'),
      servicesTenantSelect: qs('#operatorConfigServicesTenant'),
      professionalsTenantSelect: qs('#operatorConfigProfessionalsTenant'),
      refresh: qs('#operatorConfigRefresh'),
      servicesRefresh: qs('#operatorConfigServicesRefresh'),
      professionalsRefresh: qs('#operatorConfigProfessionalsRefresh'),
      save: qs('#operatorConfigSave'),
      servicesSave: qs('#operatorConfigServicesSave'),
      kpis: qs('#operatorConfigKpis'),
      tabButtons: Array.from(root.querySelectorAll('[data-operator-tab]')),
      tabTargets: Array.from(root.querySelectorAll('[data-operator-tab-target]')),
      calendarProvider: qs('#operatorConfigCalendarProvider'),
      professionalSchedule: qs('#operatorConfigProfessionalSchedule'),
      welcomeReplyButtons: qs('#operatorConfigWelcomeReplyButtons'),
      autoSchedule: qs('#operatorConfigAutoSchedule'),
      staffAgendaWhatsapp: qs('#operatorConfigStaffAgendaWhatsapp'),
      appointmentConfirmation: qs('#operatorConfigAppointmentConfirmation'),
      allowConfirmWithoutPayment: qs('#operatorConfigAllowConfirmWithoutPayment'),
      cancelWithoutConfirmation: qs('#operatorConfigCancelWithoutConfirmation'),
      allowOverlapping: qs('#operatorConfigAllowOverlapping'),
      reactivation: qs('#operatorConfigReactivation'),
      sameDayPriority: qs('#operatorConfigSameDayPriority'),
      enableServiceConfirmation: qs('#operatorConfigEnableServiceConfirmation'),
      enableBookingReminder: qs('#operatorConfigEnableBookingReminder'),
      enableAutoCustomerIngest: qs('#operatorConfigEnableAutoCustomerIngest'),
      enableServicePackages: qs('#operatorConfigEnableServicePackages'),
      enableHaircutPhotoHistory: qs('#operatorConfigEnableHaircutPhotoHistory'),
      haircutPhotosPromptMode: qs('#operatorConfigHaircutPhotosPromptMode'),
      haircutPromptModeWrap: qs('#operatorConfigHaircutPromptModeWrap'),
      reminderMinutesBefore: qs('#operatorConfigReminderMinutesBefore'),
      paymentsManualPixFlowEnabled: qs('#operatorConfigManualPixFlowEnabled'),
      paymentsManualPixKey: qs('#operatorConfigManualPixKey'),
      paymentsEnabled: qs('#operatorConfigPaymentsEnabled'),
      paymentsRequirePayment: qs('#operatorConfigPaymentsRequirePayment'),
      paymentsScheduleEnabled: qs('#operatorConfigPaymentsScheduleEnabled'),
      paymentsEnableSplit: qs('#operatorConfigPaymentsEnableSplit'),
      paymentsNeverChargeReschedule: qs('#operatorConfigPaymentsNeverChargeReschedule'),
      paymentsDepositAmount: qs('#operatorConfigPaymentsDepositAmount'),
      paymentsExpirationMinutes: qs('#operatorConfigPaymentsExpirationMinutes'),
      paymentsDiscountEnabled: qs('#operatorConfigPaymentsDiscountEnabled'),
      paymentsDiscountType: qs('#operatorConfigPaymentsDiscountType'),
      paymentsDiscountValue: qs('#operatorConfigPaymentsDiscountValue'),
      paymentsPixPayerDocumentTenant: qs('#operatorConfigPaymentsPixPayerDocumentTenant'),
      paymentsUnitId: qs('#operatorConfigPaymentsUnitId'),
      paymentsUnitOverride: qs('#operatorConfigPaymentsUnitOverride'),
      paymentsProvider: qs('#operatorConfigPaymentsProvider'),
      paymentsAccessToken: qs('#operatorConfigPaymentsAccessToken'),
      paymentsAccountId: qs('#operatorConfigPaymentsAccountId'),
      paymentsPixPayerDocumentUnit: qs('#operatorConfigPaymentsPixPayerDocumentUnit'),
      paymentsSave: qs('#operatorConfigPaymentsSave'),
      crmEnabled: qs('#operatorConfigCrmEnabled'),
      crmMaxQuestions: qs('#operatorConfigCrmMaxQuestions'),
      crmMinDays: qs('#operatorConfigCrmMinDays'),
      crmGlobal: qs('#operatorConfigCrmGlobal'),
      crmFields: qs('#operatorConfigCrmFields'),
      crmSave: qs('#operatorConfigCrmSave'),
      fallbackPhone: qs('#operatorConfigFallbackPhone'),
      workingDays: qs('#operatorConfigWorkingDays'),
      startTime: qs('#operatorConfigStartTime'),
      endTime: qs('#operatorConfigEndTime'),
      durationDefault: qs('#operatorConfigDurationDefault'),
      slotInterval: qs('#operatorConfigSlotInterval'),
      minimumBookingLeadMinutes: qs('#operatorConfigMinimumBookingLeadMinutes'),
      addService: qs('#operatorConfigAddService'),
      servicesBranchWrap: qs('#operatorConfigServicesBranchWrap'),
      servicesBranchSelect: qs('#operatorConfigServicesBranch'),
      servicesCatalogTitle: qs('#operatorConfigServicesCatalogTitle'),
      servicesCatalogHint: qs('#operatorConfigServicesCatalogHint'),
      services: qs('#operatorConfigServices'),
      addBranch: qs('#operatorConfigAddBranch'),
      branches: qs('#operatorConfigBranches'),
      addProfessional: qs('#operatorConfigAddProfessional'),
      professionals: qs('#operatorConfigProfessionals'),
      solarEnabled: qs('#operatorConfigSolarEnabled'),
      solarPanel: qs('#operatorConfigSolarPanel'),
      solarCustoKwp: qs('#operatorConfigSolarCustoKwp'),
      solarEficiencia: qs('#operatorConfigSolarEficiencia'),
      solarFatorGeracao: qs('#operatorConfigSolarFatorGeracao'),
      solarBillInvite: qs('#operatorConfigSolarBillInvite'),
      solarFollowUp: qs('#operatorConfigSolarFollowUp'),
      solarHideEconomia: qs('#operatorConfigSolarHideEconomia'),
      solarHideInvestimento: qs('#operatorConfigSolarHideInvestimento'),
      solarHidePayback: qs('#operatorConfigSolarHidePayback'),
    };

    bindStaticEvents();
    bindDynamicEvents();
    if (qs('#operatorSpecialDatesRoot') && typeof window.ReservaAiOperatorSpecialDates?.attach === 'function') {
      window.ReservaAiOperatorSpecialDates.attach({
        state,
        escapeHtml,
        tenantQuery,
        requestExternal,
        setStatus,
        recordAudit,
        canManageSelectedTenant,
      });
    }
    if (qs('#operatorInboxAutoReplyPauseRoot') && typeof window.EngageInboxAutoReplyPauseConfig?.attach === 'function') {
      window.EngageInboxAutoReplyPauseConfig.attach({
        state,
        tenantQuery,
        requestExternal,
        setStatus,
        canManageSelectedTenant,
      });
    }
    applyOperatorTab(state.activeTab);
    state.mounted = true;
    return true;
  }

  async function activate(session) {
    if (!mount()) {
      return;
    }

    state.session = session || state.session;
    state.active = true;
    try {
      await loadWorkspace();
    } catch (error) {
      setStatus(error.message || 'Não foi possível carregar a configuração do operador.', 'warn');
    }
  }

  function deactivate() {
    state.active = false;
  }

  function init(context) {
    state.session = context?.session || state.session;
    mount();
  }

  function getHaircutFeatureFlagsForTenant(tenantId) {
    const tid = String(tenantId || '').trim();
    if (!tid || tid !== String(state.selectedTenantId || '').trim() || !state.config) {
      return null;
    }
    return {
      enableHaircutPhotoHistory: state.config.enableHaircutPhotoHistory === true,
      haircutPhotosPromptMode: state.config.haircutPhotosPromptMode || 'manual_only',
    };
  }

  function getServicePackagesFeatureFlagsForTenant(tenantId) {
    const tid = String(tenantId || '').trim();
    if (!tid || tid !== String(state.selectedTenantId || '').trim() || !state.config) {
      return null;
    }
    return {
      enableServicePackages: state.config.enableServicePackages === true,
    };
  }

  window.ReservaAiOperatorConfig = {
    init,
    activate,
    deactivate,
    getHaircutFeatureFlagsForTenant,
    getServicePackagesFeatureFlagsForTenant,
  };
})();
