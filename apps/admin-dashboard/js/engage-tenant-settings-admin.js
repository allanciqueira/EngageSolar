/**
 * Engage Config → Configurações de envio (política operacional).
 */
(function () {
  const api = () => window.EngageTenantSettingsApi;

  const FIELDS = [
    {
      key: 'maxMessagesPerHour',
      label: 'Máx. mensagens / hora',
      hint: 'Teto horário de envios enfileirados por empresa. Ao atingir, o batch espera o rate limit (Redis engage:rl:tenant).',
      defaultKey: 'maxMessagesPerHour',
      sourceKey: 'hourly',
    },
    {
      key: 'maxMessagesPerMinute',
      label: 'Máx. mensagens / minuto',
      hint: 'Teto por minuto (proteção de burst). Quota separada do limite horário.',
      defaultKey: 'maxMessagesPerMinute',
      sourceKey: 'minute',
    },
    {
      key: 'orchestrationBatchSize',
      label: 'Tamanho do batch',
      hint: 'Quantos destinatários PENDING o worker processa por job de orquestração.',
      defaultKey: 'maxOrchestrationBatch',
      sourceKey: 'batchSize',
    },
    {
      key: 'cooldownMinMs',
      label: 'Cooldown mínimo (ms)',
      hint: 'Pausa mínima aleatória entre envios no mesmo número remetente (sender-scoped).',
      defaultKey: 'defaultCooldownMinMs',
      sourceKey: 'cooldownMinMs',
    },
    {
      key: 'cooldownMaxMs',
      label: 'Cooldown máximo (ms)',
      hint: 'Pausa máxima aleatória entre envios no mesmo número. O worker sorteia entre mín. e máx.',
      defaultKey: 'defaultCooldownMaxMs',
      sourceKey: 'cooldownMaxMs',
    },
    {
      key: 'orchestrationContinueDelayMs',
      label: 'Atraso entre batches (ms)',
      hint: 'Espera antes de enfileirar o próximo batch quando auto continue está ligado. Se o batch bateu rate limit, usa no mínimo 60s.',
      defaultKey: 'orchestrationContinueDelayMs',
      sourceKey: 'continueDelayMs',
    },
  ];

  let session = null;
  let active = false;
  let loading = false;
  let saving = false;
  let settings = null;
  let form = {};
  let autoContinue = '';
  let error = '';

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function canManage() {
    return api()?.canManageSettings?.(session) || false;
  }

  function operational() {
    return settings?.operational || {};
  }

  function policy() {
    return operational().policy || {};
  }

  function effective() {
    return operational().effective || {};
  }

  function globalDefaults() {
    return operational().globalDefaults || {};
  }

  function formatDisplay(value, isBool) {
    if (value == null || value === '') return '—';
    if (isBool) return value ? 'Ligado' : 'Desligado';
    return String(value);
  }

  function sourceLabel(source) {
    return source === 'tenant' ? 'tenant' : 'env';
  }

  function defaultPlaceholder(field) {
    const value = globalDefaults()[field.defaultKey];
    return value == null ? '' : String(value);
  }

  function syncFormFromSettings() {
    const p = policy();
    form = {};
    FIELDS.forEach((field) => {
      const value = p[field.key];
      form[field.key] = value == null ? '' : String(value);
    });
    const ac = p.autoContinueEnabled;
    autoContinue = ac === true ? 'true' : ac === false ? 'false' : '';
  }

  function buildPatchPayload() {
    const payload = {};
    FIELDS.forEach((field) => {
      const raw = String(form[field.key] ?? '').trim();
      payload[field.key] = raw === '' ? null : Number(raw);
    });
    if (autoContinue === '') {
      payload.autoContinueEnabled = null;
    } else {
      payload.autoContinueEnabled = autoContinue === 'true';
    }
    return payload;
  }

  function setFeedback(message, tone = 'neutral') {
    const el = $('engageTenantSettingsFeedback');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.dataset.tone = tone;
    el.textContent = message;
  }

  function renderForm() {
    const el = $('engageTenantSettingsForm');
    if (!el) return;
    const readOnly = !canManage();
    const disabled = readOnly || saving || loading ? ' disabled' : '';
    const envAuto = globalDefaults().autoContinueEnabled;
    const envAutoLabel = envAuto === true ? 'ON' : envAuto === false ? 'OFF' : 'ON/OFF';

    const rows = FIELDS.map((field) => `
      <label class="ests-field">
        <span class="ests-field-label">${escapeHtml(field.label)}</span>
        <input
          type="number"
          min="1"
          step="1"
          data-ests-key="${escapeAttr(field.key)}"
          value="${escapeAttr(form[field.key] ?? '')}"
          placeholder="${escapeAttr(defaultPlaceholder(field))}"
          ${disabled}
        />
        <span class="ests-field-hint">${escapeHtml(field.hint)}</span>
      </label>`).join('');

    el.innerHTML = `
      <div class="ests-form-grid">${rows}</div>
      <label class="ests-field ests-field--select">
        <span class="ests-field-label">Auto continue</span>
        <select id="engageTenantSettingsAutoContinue" ${disabled}>
          <option value=""${autoContinue === '' ? ' selected' : ''}>Padrão ENV (${escapeHtml(envAutoLabel)})</option>
          <option value="true"${autoContinue === 'true' ? ' selected' : ''}>Ligado</option>
          <option value="false"${autoContinue === 'false' ? ' selected' : ''}>Desligado</option>
        </select>
        <span class="ests-field-hint">Ligado: campanhas RUNNING enfileiram o próximo lote sozinhas. Desligado: só via «Continuar batch» manual no dashboard de campanha.</span>
      </label>
      ${canManage() ? `<div class="ests-form-actions"><button type="button" class="ec-mc-btn ec-mc-btn--primary" id="engageTenantSettingsSaveBtn"${saving || loading ? ' disabled' : ''}>Guardar</button></div>` : ''}`;

    el.querySelectorAll('input[data-ests-key]').forEach((input) => {
      input.addEventListener('input', () => {
        form[input.dataset.estsKey] = input.value;
      });
    });
    el.querySelector('#engageTenantSettingsAutoContinue')?.addEventListener('change', (event) => {
      autoContinue = event.target.value;
    });
    el.querySelector('#engageTenantSettingsSaveBtn')?.addEventListener('click', onSave);
  }

  function renderSummaryTable() {
    const el = $('engageTenantSettingsSummary');
    if (!el || !settings) {
      if (el) el.innerHTML = '';
      return;
    }
    const p = policy();
    const e = effective();
    const sources = e.source || {};
    const defaults = globalDefaults();

    const allFields = [
      ...FIELDS,
      {
        key: 'autoContinueEnabled',
        label: 'Auto continue',
        defaultKey: 'autoContinueEnabled',
        sourceKey: 'autoContinue',
        isBool: true,
      },
    ];

    const rows = allFields.map((field) => {
      const policyVal = p[field.key];
      const effectiveVal = e[field.key];
      const source = sources[field.sourceKey] || 'env';
      const envDefault = defaults[field.defaultKey];
      return `
        <tr>
          <td>${escapeHtml(field.label)}</td>
          <td>${escapeHtml(formatDisplay(policyVal, field.isBool))}</td>
          <td><strong>${escapeHtml(formatDisplay(effectiveVal, field.isBool))}</strong></td>
          <td><span class="ec-mc-chip" data-tone="${source === 'tenant' ? 'success' : 'muted'}">${escapeHtml(sourceLabel(source))}</span></td>
          <td>${escapeHtml(formatDisplay(envDefault, field.isBool))}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <h3>Resumo da política</h3>
      <div class="ec-mc-table-wrap">
        <table class="ec-mc-table ests-summary-table">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Política tenant</th>
              <th>Efectivo</th>
              <th>Origem</th>
              <th>Padrão ENV</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function render() {
    const errorEl = $('engageTenantSettingsError');
    const loadingEl = $('engageTenantSettingsLoading');
    if (loadingEl) loadingEl.hidden = !loading;
    if (errorEl) {
      if (error) {
        errorEl.hidden = false;
        errorEl.textContent = error;
      } else {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
    }
    renderForm();
    renderSummaryTable();
  }

  async function loadSettings() {
    loading = true;
    error = '';
    setFeedback('');
    render();
    try {
      settings = await api().getEngageSettings(session);
      syncFormFromSettings();
    } catch (err) {
      const mapped = api().mapApiError(err);
      error = mapped.message;
      settings = null;
      if (mapped.redirectLogin) {
        window.EngageSolarAuth?.redirectToLogin?.('session_expired');
      }
    } finally {
      loading = false;
      render();
    }
  }

  async function onSave() {
    if (!canManage() || saving || loading) return;
    saving = true;
    setFeedback('A guardar…', 'neutral');
    render();
    try {
      settings = await api().patchEngageSettings(session, buildPatchPayload());
      syncFormFromSettings();
      setFeedback('Configurações guardadas.', 'success');
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
      if (mapped.redirectLogin) {
        window.EngageSolarAuth?.redirectToLogin?.('session_expired');
      }
    } finally {
      saving = false;
      render();
    }
  }

  function activate(nextSession) {
    active = true;
    session = nextSession || null;
    loadSettings();
  }

  function deactivate() {
    active = false;
    session = null;
    settings = null;
    form = {};
    autoContinue = '';
    error = '';
    loading = false;
    saving = false;
    setFeedback('');
  }

  window.EngageTenantSettings = {
    activate,
    deactivate,
    isActive: () => active,
  };
})();
