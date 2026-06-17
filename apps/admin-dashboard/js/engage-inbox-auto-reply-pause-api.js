/**
 * Tenant settings — política de auto-pausa da IA por conversa (Inbox).
 * @see docs/HANDOFF-ENGAGE-SOLAR-FRONT-TENANT-AUTO-REPLY-PAUSE-CONFIG.md
 */
(function () {
  const DEFAULT_PAUSE_FORM = {
    enabled: false,
    pauseOnCampaignReply: false,
    pauseOnManualOperatorMessage: false,
    pauseOnAssignedAgent: false,
    pauseOnDispositionKinds: [],
  };

  function settingsToPauseForm(data) {
    const p = data?.agentConfig?.inboxAutoReplyPausePolicy;
    if (!p || typeof p !== 'object') return { ...DEFAULT_PAUSE_FORM };
    return {
      enabled: p.enabled === true,
      pauseOnCampaignReply: p.pauseOnCampaignReply === true,
      pauseOnManualOperatorMessage: p.pauseOnManualOperatorMessage === true,
      pauseOnAssignedAgent: p.pauseOnAssignedAgent === true,
      pauseOnDispositionKinds: Array.isArray(p.pauseOnDispositionKinds)
        ? p.pauseOnDispositionKinds.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
        : [],
    };
  }

  function buildInboxAutoReplyPausePolicy(form) {
    return {
      enabled: form.enabled === true,
      pauseOnCampaignReply: form.pauseOnCampaignReply === true,
      pauseOnManualOperatorMessage: form.pauseOnManualOperatorMessage === true,
      pauseOnAssignedAgent: form.pauseOnAssignedAgent === true,
      pauseOnDispositionKinds: (form.pauseOnDispositionKinds || [])
        .map((x) => String(x).trim())
        .filter((x) => x.length > 0),
      defaultResumeMode: 'manual',
    };
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

  function buildPutPayload(base, form) {
    const safeBase = sanitizeTenantSettingsForPut(base);
    return {
      ...safeBase,
      botEnabled: safeBase.botEnabled,
      agentProfile: safeBase.agentProfile,
      escalationPolicy: safeBase.escalationPolicy,
      features: safeBase.features,
      ...(safeBase.solarEnergyConfig ? { solarEnergyConfig: safeBase.solarEnergyConfig } : {}),
      ...(safeBase.tenantFeatures ? { tenantFeatures: safeBase.tenantFeatures } : {}),
      agentConfig: {
        ...(safeBase.agentConfig ?? {}),
        inboxAutoReplyPausePolicy: buildInboxAutoReplyPausePolicy(form),
      },
    };
  }

  function mapApiError(err) {
    const status = Number(err?.statusCode || err?.status || 0);
    if (status === 403) {
      return 'Apenas administradores (OWNER/ADMIN) podem alterar esta política.';
    }
    if (status === 401) {
      return 'Sessão expirada. Faça login novamente.';
    }
    return err?.message || 'Não foi possível guardar a política de pausa.';
  }

  window.EngageInboxAutoReplyPauseApi = {
    DEFAULT_PAUSE_FORM,
    settingsToPauseForm,
    buildInboxAutoReplyPausePolicy,
    buildPutPayload,
    sanitizeTenantSettingsForPut,
    mapApiError,
  };
})();
