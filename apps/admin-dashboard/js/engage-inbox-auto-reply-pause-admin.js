/**
 * Configurações gerais — política de auto-pausa da IA por conversa (Inbox).
 */
(function () {
  const pauseApi = () => window.EngageInboxAutoReplyPauseApi;

  let ctx = null;
  let form = null;
  let loading = false;
  let saving = false;
  let bound = false;

  function $(id) {
    return document.getElementById(id);
  }

  function dom() {
    return {
      root: $('operatorInboxAutoReplyPauseRoot'),
      enabled: $('operatorConfigInboxPauseEnabled'),
      campaignReply: $('operatorConfigInboxPauseCampaignReply'),
      manualMessage: $('operatorConfigInboxPauseManualMessage'),
      assignedAgent: $('operatorConfigInboxPauseAssignedAgent'),
      dispositions: $('operatorConfigInboxPauseDispositions'),
      triggers: $('operatorConfigInboxPauseTriggers'),
      save: $('operatorConfigInboxPauseSave'),
    };
  }

  function canManage() {
    return ctx?.canManageSelectedTenant?.() === true;
  }

  function tenantQuery() {
    return ctx?.tenantQuery?.() || '';
  }

  function parseDispositionsInput(raw) {
    return String(raw || '')
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function dispositionsToInput(list) {
    return Array.isArray(list) ? list.join(', ') : '';
  }

  function collectFormFromDom() {
    const d = dom();
    return {
      enabled: d.enabled?.checked === true,
      pauseOnCampaignReply: d.campaignReply?.checked === true,
      pauseOnManualOperatorMessage: d.manualMessage?.checked === true,
      pauseOnAssignedAgent: d.assignedAgent?.checked === true,
      pauseOnDispositionKinds: parseDispositionsInput(d.dispositions?.value),
    };
  }

  function applyTriggersDisabledState() {
    const d = dom();
    if (!d.triggers) return;
    const masterOff = d.enabled?.checked !== true;
    const readonly = !canManage();
    d.triggers.classList.toggle('engage-inbox-pause-triggers--dimmed', masterOff);
    [d.campaignReply, d.manualMessage, d.assignedAgent, d.dispositions].forEach((el) => {
      if (el) el.disabled = masterOff || readonly;
    });
  }

  function renderForm() {
    const d = dom();
    if (!d.root || !form) return;
    const readonly = !canManage();
    const f = form;

    if (d.enabled) d.enabled.checked = f.enabled === true;
    if (d.campaignReply) d.campaignReply.checked = f.pauseOnCampaignReply === true;
    if (d.manualMessage) d.manualMessage.checked = f.pauseOnManualOperatorMessage === true;
    if (d.assignedAgent) d.assignedAgent.checked = f.pauseOnAssignedAgent === true;
    if (d.dispositions) d.dispositions.value = dispositionsToInput(f.pauseOnDispositionKinds);

    if (d.enabled) d.enabled.disabled = readonly;
    if (d.save) {
      d.save.disabled = readonly || saving || loading;
      d.save.textContent = saving ? 'A guardar…' : 'Guardar';
    }
    applyTriggersDisabledState();
  }

  async function loadFromSettings(settings) {
    const api = pauseApi();
    if (!api) return;
    form = api.settingsToPauseForm(settings || {});
    renderForm();
  }

  async function fetchTenantSettings() {
    if (!ctx?.requestExternal) {
      throw new Error('Cliente de configuração indisponível.');
    }
    return ctx.requestExternal(`/tenant-settings${tenantQuery()}`);
  }

  async function onWorkspaceLoaded() {
    const d = dom();
    if (!d.root || !ctx?.state?.selectedTenantId) {
      form = pauseApi()?.DEFAULT_PAUSE_FORM ? { ...pauseApi().DEFAULT_PAUSE_FORM } : null;
      renderForm();
      return;
    }
    loading = true;
    renderForm();
    try {
      const settings = await fetchTenantSettings();
      await loadFromSettings(settings);
    } catch (err) {
      ctx?.setStatus?.(pauseApi()?.mapApiError?.(err) || err?.message || 'Não foi possível carregar a política de pausa.', 'warn');
      form = { ...pauseApi().DEFAULT_PAUSE_FORM };
      renderForm();
    } finally {
      loading = false;
      renderForm();
    }
  }

  async function savePolicy() {
    if (!canManage()) {
      ctx?.setStatus?.('Apenas administradores podem alterar esta política.', 'warn');
      return;
    }
    if (!ctx?.state?.selectedTenantId) {
      ctx?.setStatus?.('Selecione uma empresa para guardar.', 'warn');
      return;
    }

    const api = pauseApi();
    if (!api || !ctx?.requestExternal) return;

    const nextForm = collectFormFromDom();
    saving = true;
    renderForm();
    ctx?.setStatus?.('A guardar política de pausa da IA…', 'neutral');

    try {
      const base = await fetchTenantSettings();
      const payload = api.buildPutPayload(base, nextForm);
      const updated = await ctx.requestExternal(`/tenant-settings${tenantQuery()}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      form = api.settingsToPauseForm(updated || payload);
      ctx?.setStatus?.('Política de pausa da IA guardada com sucesso.', 'success');
      try {
        window.dispatchEvent(new CustomEvent('reserva:tenant-settings-updated'));
      } catch {
        /* ignore */
      }
    } catch (err) {
      ctx?.setStatus?.(api.mapApiError(err), 'warn');
    } finally {
      saving = false;
      renderForm();
    }
  }

  function bindEvents() {
    if (bound) return;
    const d = dom();
    if (!d.root) return;
    bound = true;

    d.enabled?.addEventListener('change', () => {
      applyTriggersDisabledState();
    });
    d.save?.addEventListener('click', () => {
      void savePolicy();
    });
  }

  function attach(context) {
    ctx = context || null;
    form = pauseApi()?.DEFAULT_PAUSE_FORM ? { ...pauseApi().DEFAULT_PAUSE_FORM } : null;
    bindEvents();
    renderForm();
  }

  window.EngageInboxAutoReplyPauseConfig = {
    attach,
    onWorkspaceLoaded,
    renderForm,
  };
})();
