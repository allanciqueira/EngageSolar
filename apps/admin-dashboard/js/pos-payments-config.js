/**
 * Configurações POS — bloco Pagamentos (tenant) na aba POS.
 * GET/POST /payments/config — paridade handoff NeuraFlow.
 */
(function () {
  const adminApi = window.ReservaAiApi;
  const INSTALLMENT_CHIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const state = {
    mounted: false,
    raw: null,
    selectedInstallments: [1, 2, 4, 6],
    unitTerminals: [],
    canManage: true,
    dom: {},
  };

  function qs(s) { return document.querySelector(s); }

  function escapeHtml(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getTenantId() {
    const el = qs('#operatorConfigTenant');
    return el?.value?.trim() || '';
  }

  function tenantQuery(extra) {
    const tid = getTenantId();
    const p = new URLSearchParams();
    if (tid) p.set('tenantId', tid);
    if (extra) Object.entries(extra).forEach(([k, v]) => { if (v != null && String(v).trim() !== '') p.set(k, String(v)); });
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function api(method, path, options = {}) {
    const url = path.startsWith('/api/operator/') ? path : `/api/operator${path.startsWith('/') ? path : `/${path}`}`;
    return adminApi.request(url, { method, ...options });
  }

  function tenantCfg() {
    return state.raw?.tenantConfig || state.raw?.resolved || {};
  }

  function unitCfg() {
    return state.raw?.unitConfig || {};
  }

  function parseInstallments(text) {
    return String(text || '')
      .split(/[,;\s]+/)
      .map((n) => Math.floor(Number(n)))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 24)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .sort((a, b) => a - b);
  }

  function setStatus(msg, tone = 'neutral') {
    const el = state.dom.status;
    if (!el) return;
    el.textContent = msg || '';
    el.dataset.tone = tone;
  }

  function resolveCanManage() {
    try {
      const session = window.ReservaAiAuth?.getSession?.() || {};
      state.canManage = window.ReservaPermissions?.isAdminSession?.(session) === true
        || window.ReservaPermissions?.canManageTenantSession?.(session) === true;
    } catch (e) {
      state.canManage = true;
    }
  }

  function paymentsModuleOff() {
    const cfg = tenantCfg();
    return cfg.enabled !== true || cfg.manualPixFlowEnabled === true;
  }

  function applyVisibility() {
    const cfg = tenantCfg();
    const posOn = state.dom.posEnabled?.checked === true;
    const integrated = state.dom.posModeIntegrated?.checked === true;
    const installmentsOn = state.dom.posCreditEnabled?.checked === true;
    const unitId = state.dom.posPaymentsUnit?.value?.trim() || '';
    const unitOn = state.dom.posUnitEnabled?.checked === true;

    const moduleOff = paymentsModuleOff();
    if (state.dom.settingsCard) {
      state.dom.settingsCard.classList.toggle('is-dimmed', moduleOff);
    }
    if (state.dom.posEnabled) state.dom.posEnabled.disabled = moduleOff || !state.canManage;

    const showPosInner = posOn && !moduleOff;
    state.dom.posInner?.classList.toggle('is-hidden', !showPosInner);
    state.dom.mpCloudCard?.classList.toggle('is-hidden', !showPosInner || !integrated);
    state.dom.posInner?.classList.toggle('pos-premium-split--single', showPosInner && !integrated);
    state.dom.installmentsBlock?.classList.toggle('is-hidden', !installmentsOn);
    state.dom.unitCard?.classList.toggle('is-hidden', !showPosInner || !unitId);
    state.dom.unitTerminalField?.classList.toggle('is-muted', !unitOn);

    const hints = Array.isArray(state.raw?.configHints) ? state.raw.configHints : [];
    if (state.dom.configHints) {
      if (hints.length && installmentsOn) {
        state.dom.configHints.hidden = false;
        state.dom.configHints.innerHTML = hints.map((h) => `<p>${escapeHtml(h)}</p>`).join('');
      } else {
        state.dom.configHints.hidden = true;
        state.dom.configHints.innerHTML = '';
      }
    }
  }

  function renderInstallmentChips() {
    if (!state.dom.installmentChips) return;
    state.dom.installmentChips.innerHTML = INSTALLMENT_CHIPS.map((n) => {
      const on = state.selectedInstallments.includes(n);
      return `<button type="button" class="pos-installment-chip${on ? ' is-active' : ''}" data-installment="${n}" ${!state.canManage ? 'disabled' : ''}>${n}x</button>`;
    }).join('');
  }

  async function ensureBranchOptions() {
    let branches = window.ReservaAiPosTerminalsAdmin?.getBranches?.() || [];
    if (!branches.length && getTenantId()) {
      try {
        const data = await api('GET', `/branches${tenantQuery()}`);
        branches = Array.isArray(data) ? data : [];
      } catch (e) {
        branches = [];
      }
    }
    return branches;
  }

  async function fillUnitSelect() {
    const sel = state.dom.posPaymentsUnit;
    if (!sel) return;
    const branches = await ensureBranchOptions();
    const v = sel.value;
    sel.innerHTML = '<option value="">Sem filial (só tenant)</option>'
      + branches.map((b) => `<option value="${escapeHtml(b.id || b.branchId)}">${escapeHtml(b.name || 'Unidade')}</option>`).join('');
    if (v && [...sel.options].some((o) => o.value === v)) sel.value = v;
  }

  async function loadUnitTerminals() {
    const unitId = state.dom.posPaymentsUnit?.value?.trim() || '';
    if (!unitId) {
      state.unitTerminals = [];
      fillDefaultTerminalSelect();
      return;
    }
    try {
      const data = await api('GET', `/pos/terminals${tenantQuery({ unitId })}`);
      state.unitTerminals = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    } catch (e) {
      state.unitTerminals = [];
    }
    fillDefaultTerminalSelect();
  }

  function fillDefaultTerminalSelect() {
    const sel = state.dom.defaultTerminal;
    if (!sel) return;
    const unitId = state.dom.posPaymentsUnit?.value?.trim() || '';
    const tid = getTenantId();
    const list = state.unitTerminals.length
      ? state.unitTerminals
      : [];
    const globalPromise = list.length || !tid
      ? Promise.resolve(list)
      : api('GET', `/pos/terminals${tenantQuery()}`).then((raw) => {
        const rows = Array.isArray(raw) ? raw : [];
        return rows.filter((t) => !t.unitId || t.unitId === unitId);
      }).catch(() => []);

    void globalPromise.then((terminals) => {
      const current = unitCfg().defaultPosTerminalId || '';
      sel.innerHTML = '<option value="">— Nenhum —</option>'
        + terminals.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name || t.id)}</option>`).join('');
      if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
    });
  }

  function populateForm() {
    const t = tenantCfg();
    const u = unitCfg();
    if (state.dom.posEnabled) state.dom.posEnabled.checked = t.posEnabled === true;
    if (state.dom.posProvider) state.dom.posProvider.value = t.posProvider || 'mercado_pago';
    const mode = t.posMode === 'integrated' ? 'integrated' : 'manual';
    if (state.dom.posModeIntegrated) state.dom.posModeIntegrated.checked = mode === 'integrated';
    if (state.dom.posModeManual) state.dom.posModeManual.checked = mode === 'manual';
    if (state.dom.posCreditEnabled) state.dom.posCreditEnabled.checked = t.posCreditInstallmentsEnabled === true;
    state.selectedInstallments = Array.isArray(t.posCreditInstallmentOptions) && t.posCreditInstallmentOptions.length
      ? t.posCreditInstallmentOptions.map((n) => Math.floor(Number(n))).filter((n) => n >= 1 && n <= 24)
      : [1, 2, 4, 6];
    renderInstallmentChips();
    const cost = String(t.posInstallmentsCost || 'seller').toLowerCase() === 'buyer' ? 'buyer' : 'seller';
    if (state.dom.posCostSeller) state.dom.posCostSeller.checked = cost === 'seller';
    if (state.dom.posCostBuyer) state.dom.posCostBuyer.checked = cost === 'buyer';
    if (state.dom.posMpSponsor) state.dom.posMpSponsor.value = t.posMpSponsorUserId || '';
    if (state.dom.posMpToken) state.dom.posMpToken.value = '';
    if (state.dom.posStoreId) state.dom.posStoreId.value = t.posStoreId || '';
    if (state.dom.posExternalPosId) state.dom.posExternalPosId.value = t.posExternalPosId || '';
    if (state.dom.posUnitEnabled) state.dom.posUnitEnabled.checked = u.posUnitEnabled === true;
    void fillUnitSelect().then(() => {
      if (state.dom.posPaymentsUnit) state.dom.posPaymentsUnit.value = u.unitId || '';
      applyVisibility();
      void loadUnitTerminals();
    });
  }

  async function loadConfig() {
    const tid = getTenantId();
    if (!tid) {
      state.raw = null;
      setStatus('Selecione uma empresa no topo.', 'warn');
      return;
    }
    setStatus('Carregando configuração POS…', 'neutral');
    try {
      const unitId = state.dom.posPaymentsUnit?.value?.trim() || '';
      const q = unitId ? tenantQuery({ unitId }) : tenantQuery();
      state.raw = await api('GET', `/payments/config${q}`);
      populateForm();
      const moduleOff = paymentsModuleOff();
      if (moduleOff) {
        setStatus('Ative o módulo de pagamentos na aba Pagamentos (sem Pix manual).', 'warn');
      } else {
        setStatus('Configuração POS carregada.', 'success');
      }
    } catch (e) {
      setStatus(e?.message || 'Não foi possível carregar configuração POS.', 'warn');
    }
  }

  function collectTenantPayload(base) {
    const t = base?.tenantConfig || {};
    const token = state.dom.posMpToken?.value?.trim();
    const payload = {
      enabled: t.enabled === true,
      manualPixFlowEnabled: t.manualPixFlowEnabled === true,
      requirePayment: t.requirePayment === true,
      schedulePaymentsEnabled: t.schedulePaymentsEnabled === true,
      neverChargeReschedule: t.neverChargeReschedule === true,
      depositAmount: Number(t.depositAmount ?? 1),
      expirationMinutes: Number(t.expirationMinutes ?? 30),
      discountEnabled: t.discountEnabled === true,
      discountType: t.discountType || 'percentage',
      discountValue: Number(t.discountValue ?? 0),
      pixPayerDocument: t.pixPayerDocument || null,
      posEnabled: state.dom.posEnabled?.checked === true,
      posProvider: state.dom.posProvider?.value || 'mercado_pago',
      posMode: state.dom.posModeIntegrated?.checked ? 'integrated' : 'manual',
      posCreditInstallmentsEnabled: state.dom.posCreditEnabled?.checked === true,
      posCreditInstallmentOptions: state.selectedInstallments.slice().sort((a, b) => a - b),
      posInstallmentsCost: state.dom.posCostBuyer?.checked ? 'buyer' : 'seller',
      posMpSponsorUserId: state.dom.posMpSponsor?.value?.trim() || null,
      posStoreId: state.dom.posStoreId?.value?.trim() || null,
      posExternalPosId: state.dom.posExternalPosId?.value?.trim() || null,
    };
    if (typeof t.enableSplitPayments === 'boolean') {
      payload.enableSplitPayments = t.enableSplitPayments;
    }
    if (token) payload.posMpAccessToken = token;
    return payload;
  }

  async function saveConfig() {
    if (!state.canManage) {
      setStatus('Sem permissão para alterar configurações.', 'warn');
      return;
    }
    const tid = getTenantId();
    if (!tid) {
      setStatus('Selecione uma empresa.', 'warn');
      return;
    }
    if (state.dom.posCreditEnabled?.checked && !state.selectedInstallments.length) {
      setStatus('Selecione ao menos uma opção de parcelas.', 'warn');
      return;
    }
    setStatus('Salvando configuração POS…', 'neutral');
    try {
      let base = state.raw;
      if (!base?.tenantConfig) {
        base = await api('GET', `/payments/config${tenantQuery()}`);
      }
      const tenantPayload = collectTenantPayload(base);
      await api('POST', `/payments/config${tenantQuery()}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tenantPayload),
      });
      const unitId = state.dom.posPaymentsUnit?.value?.trim() || '';
      if (unitId) {
        await api('POST', `/payments/config${tenantQuery()}`, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unitId,
            posUnitEnabled: state.dom.posUnitEnabled?.checked === true,
            defaultPosTerminalId: state.dom.defaultTerminal?.value?.trim() || null,
          }),
        });
      }
      if (state.dom.posMpToken) state.dom.posMpToken.value = '';
      await loadConfig();
      setStatus('Configuração POS salva.', 'success');
    } catch (e) {
      setStatus(e?.message || 'Não foi possível salvar.', 'warn');
    }
  }

  function bindEvents() {
    const rerender = () => applyVisibility();
    [
      state.dom.posEnabled,
      state.dom.posModeIntegrated,
      state.dom.posModeManual,
      state.dom.posCreditEnabled,
      state.dom.posUnitEnabled,
    ].forEach((el) => el?.addEventListener('change', rerender));

    state.dom.posModeIntegrated?.addEventListener('change', () => {
      if (state.dom.posModeIntegrated.checked && state.dom.posModeManual) {
        state.dom.posModeManual.checked = false;
      }
      rerender();
    });
    state.dom.posModeManual?.addEventListener('change', () => {
      if (state.dom.posModeManual.checked && state.dom.posModeIntegrated) {
        state.dom.posModeIntegrated.checked = false;
      }
      rerender();
    });

    state.dom.installmentChips?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-installment]');
      if (!btn || btn.disabled) return;
      const n = Number(btn.dataset.installment);
      if (!Number.isFinite(n)) return;
      const idx = state.selectedInstallments.indexOf(n);
      if (idx >= 0) {
        if (state.selectedInstallments.length <= 1) return;
        state.selectedInstallments.splice(idx, 1);
      } else {
        state.selectedInstallments.push(n);
        state.selectedInstallments.sort((a, b) => a - b);
      }
      renderInstallmentChips();
    });

    state.dom.posPaymentsUnit?.addEventListener('change', () => {
      void loadConfig();
    });

    state.dom.save?.addEventListener('click', () => { void saveConfig(); });
    state.dom.reload?.addEventListener('click', () => { void loadConfig(); });

    qs('#operatorConfigTenant')?.addEventListener('change', () => {
      const tab = qs('[data-operator-tab].is-active')?.dataset.operatorTab;
      if (tab === 'pos') void loadConfig();
    });
  }

  function mount() {
    if (state.mounted) return;
    const root = qs('#posPaymentsConfigRoot');
    if (!root) return;
    state.dom = {
      root,
      status: qs('#posPaymentsConfigStatus'),
      settingsCard: qs('#posPaymentsSettingsCard'),
      posEnabled: qs('#posConfigPosEnabled'),
      posProvider: qs('#posConfigPosProvider'),
      posModeIntegrated: qs('#posConfigPosModeIntegrated'),
      posModeManual: qs('#posConfigPosModeManual'),
      posInner: qs('#posConfigPosInner'),
      mpCloudCard: qs('#posMpCloudCard'),
      posCreditEnabled: qs('#posConfigCreditEnabled'),
      installmentsBlock: qs('#posConfigInstallmentsBlock'),
      installmentChips: qs('#posConfigInstallmentChips'),
      posCostSeller: qs('#posConfigCostSeller'),
      posCostBuyer: qs('#posConfigCostBuyer'),
      configHints: qs('#posConfigHints'),
      posMpSponsor: qs('#posConfigMpSponsor'),
      posMpToken: qs('#posConfigMpToken'),
      posStoreId: qs('#posConfigStoreId'),
      posExternalPosId: qs('#posConfigExternalPosId'),
      unitCard: qs('#posConfigUnitCard'),
      posPaymentsUnit: qs('#posConfigPaymentsUnit'),
      posUnitEnabled: qs('#posConfigUnitEnabled'),
      defaultTerminal: qs('#posConfigDefaultTerminal'),
      unitTerminalField: qs('#posConfigUnitTerminalWrap'),
      save: qs('#posConfigSave'),
      reload: qs('#posConfigReload'),
    };
    resolveCanManage();
    bindEvents();
    state.mounted = true;
  }

  window.ReservaAiPosPaymentsConfig = {
    mount,
    activate() {
      mount();
      resolveCanManage();
      fillUnitSelect();
      void loadConfig();
    },
    reload: loadConfig,
  };
})();
