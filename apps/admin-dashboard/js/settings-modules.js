/**
 * Ativação dos painéis de Configurações (copiados do ReservaAI admin-shell).
 */
(function () {
  const SETTINGS_PANELS = new Set([
    'configuracoes-operador',
    'informacoes-adicionais',
    'profissionais',
    'usuarios',
    'plano-uso',
    'auditoria',
    'whatsapp-api',
  ]);

  const SETTINGS_TITLES = {
    'configuracoes-operador': 'Empresa',
    'informacoes-adicionais': 'Informações adicionais',
    profissionais: 'Vendedores',
    usuarios: 'Usuários',
    'plano-uso': 'Plano e Uso',
    auditoria: 'Auditoria',
    'whatsapp-api': 'WhatsApp API',
  };

  let currentSession = null;
  let servicesModuleTabsBound = false;
  let servicesProModuleTab = 'catalog';
  let servicePackagesFeatureEnabled = null;

  function resolveOperatorTenantId() {
    const sel =
      document.getElementById('operatorConfigTenant')
      || document.getElementById('operatorConfigServicesTenant')
      || document.getElementById('salesConsultantsTenant');
    const fromSelect = String(sel?.value || '').trim();
    if (fromSelect) return fromSelect;
    return String(
      currentSession?.activeTenantId || currentSession?.tenantId || window.ENGAGESOLAR_CONFIG?.tenantId || '',
    ).trim();
  }

  window.ReservaAiAdminSession = {
    getSession() {
      return currentSession;
    },
    getOperatorTenantId: resolveOperatorTenantId,
  };

  function isSettingsPanel(panelId) {
    return SETTINGS_PANELS.has(panelId);
  }

  function deriveServicePackagesEnabled(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const flags = payload.featureFlags || payload.features || payload;
    return Boolean(
      flags.enableServicePackages
      || flags.servicePackagesEnabled
      || payload.enableServicePackages,
    );
  }

  async function loadServicePackagesFeatureState(session, options = {}) {
    const tenantId = resolveOperatorTenantId();
    if (!tenantId) return;
    const api = window.ReservaAiApi;
    if (!api?.get) return;
    try {
      const path = `/api/operator/tenant-settings?tenantId=${encodeURIComponent(tenantId)}`;
      const payload = await api.get(path);
      servicePackagesFeatureEnabled = deriveServicePackagesEnabled(payload);
      applyServicePackagesUiGates();
    } catch (_err) {
      if (options?.forceRefresh !== true) return;
      servicePackagesFeatureEnabled = false;
      applyServicePackagesUiGates();
    }
  }

  function syncServicesPanelHeadActions(tab) {
    const isPackages = tab === 'packages';
    document.querySelectorAll('[data-services-catalog-only]').forEach((node) => {
      node.hidden = isPackages;
    });
    document.querySelectorAll('[data-services-packages-only]').forEach((node) => {
      node.hidden = !isPackages;
    });
  }

  function setServicesProModuleTab(tab) {
    servicesProModuleTab = tab === 'packages' ? 'packages' : 'catalog';
    const tabsRoot = document.getElementById('servicesProModuleTabs');
    const catalogPane = document.getElementById('servicesProCatalogPane');
    const packagesPane = document.getElementById('servicesProPackagesPane');
    tabsRoot?.querySelectorAll('[data-services-module-tab]').forEach((btn) => {
      const isActive = btn.getAttribute('data-services-module-tab') === servicesProModuleTab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (catalogPane) catalogPane.hidden = servicesProModuleTab !== 'catalog';
    if (packagesPane) packagesPane.hidden = servicesProModuleTab !== 'packages';
    syncServicesPanelHeadActions(servicesProModuleTab);
    if (servicesProModuleTab === 'packages') {
      const root = document.getElementById('servicePackagesAdminRoot');
      const mod = window.ReservaAiServicePackagesAdmin;
      if (mod?.openPackagesTab) mod.openPackagesTab();
      else if (root) {
        root.innerHTML = '<div class="clients-pro-content-empty">Módulo de pacotes não carregou.</div>';
      }
    } else {
      window.ReservaAiServicePackagesAdmin?.setServicesModuleTab?.('catalog');
    }
  }

  function bindServicesModuleTabsOnce() {
    const tabsRoot = document.getElementById('servicesProModuleTabs');
    if (!tabsRoot || servicesModuleTabsBound) return;
    servicesModuleTabsBound = true;
    tabsRoot.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-services-module-tab]');
      if (!btn) return;
      setServicesProModuleTab(btn.getAttribute('data-services-module-tab') || 'catalog');
    });
  }

  function applyServicePackagesUiGates() {
    const enabled = servicePackagesFeatureEnabled === true;
    const packagesTabBtn = document.getElementById('servicesProPackagesTabBtn');
    if (packagesTabBtn) {
      packagesTabBtn.disabled = !enabled;
      packagesTabBtn.classList.toggle('is-disabled', !enabled);
      packagesTabBtn.title = enabled ? '' : 'Ative Pacote de Serviços em Empresa → Gerais';
    }
    if (!enabled && servicesProModuleTab === 'packages') {
      setServicesProModuleTab('catalog');
    }
    if (document.body.dataset.esPanelActive === 'servicos') {
      window.ReservaAiServicePackagesAdmin?.applyFeatureGates?.();
    }
  }

  function deactivateAllSettingsPanels() {
    activateSettingsPanel('', null);
  }

  function activateSettingsPanel(panelId, session) {
    if (!panelId || !SETTINGS_PANELS.has(panelId)) {
      window.ReservaAiOperatorConfig?.deactivate?.();
      window.ReservaAiSalesConsultantsAdmin?.deactivate?.();
      window.ReservaAiTenantUsersAdmin?.deactivate?.();
      window.ReservaAiTenantKnowledgeAdmin?.deactivate?.();
      window.ReservaAiPlanoUsoAdmin?.deactivate?.();
      window.ReservaAiAuditPanel?.deactivate?.();
      window.ReservaAiWhatsAppBusinessProfile?.deactivate?.();
      window.ReservaAiServicePackagesAdmin?.deactivate?.();
      return;
    }

    currentSession = session || currentSession;
    const operatorConfig = window.ReservaAiOperatorConfig;
    const tenantUsers = window.ReservaAiTenantUsersAdmin;
    const tenantKnowledge = window.ReservaAiTenantKnowledgeAdmin;
    const planoUso = window.ReservaAiPlanoUsoAdmin;
    const auditPanel = window.ReservaAiAuditPanel;

    if (operatorConfig) {
      if (panelId === 'configuracoes-operador') {
        operatorConfig.activate(session);
      } else {
        operatorConfig.deactivate();
      }
    }

    if (panelId === 'profissionais') {
      window.ReservaAiSalesConsultantsAdmin?.activate?.(session);
    } else {
      window.ReservaAiSalesConsultantsAdmin?.deactivate?.();
    }

    if (panelId === 'configuracoes-operador' || panelId === 'servicos') {
      void loadServicePackagesFeatureState(session, { forceRefresh: panelId === 'servicos' });
    }

    if (panelId === 'servicos') {
      bindServicesModuleTabsOnce();
      const tabsRoot = document.getElementById('servicesProModuleTabs');
      if (tabsRoot) tabsRoot.hidden = false;
      applyServicePackagesUiGates();
      void (async () => {
        await loadServicePackagesFeatureState(session, { forceRefresh: true });
        applyServicePackagesUiGates();
        await window.ReservaAiServicePackagesAdmin?.activate?.(session);
      })();
    } else {
      window.ReservaAiServicePackagesAdmin?.deactivate?.();
      if (servicesProModuleTab === 'packages') setServicesProModuleTab('catalog');
    }

    if (tenantUsers) {
      if (panelId === 'usuarios') tenantUsers.activate(session);
      else tenantUsers.deactivate();
    }

    if (tenantKnowledge) {
      if (panelId === 'informacoes-adicionais') tenantKnowledge.activate(session);
      else tenantKnowledge.deactivate();
    }

    if (panelId === 'whatsapp-api') {
      void window.ReservaAiWhatsAppBusinessProfile?.activate?.(session);
    } else {
      window.ReservaAiWhatsAppBusinessProfile?.deactivate?.();
    }

    if (planoUso) {
      if (panelId === 'plano-uso') planoUso.activate(session);
      else planoUso.deactivate();
    }

    if (auditPanel) {
      if (panelId === 'auditoria') auditPanel.activate(session);
      else auditPanel.deactivate();
    }
  }

  function initSettingsModules(session) {
    currentSession = session;
    window.ReservaAiOperatorConfig?.init?.({ session, authService: window.EngageSolarAuth });
    window.ReservaAiSalesConsultantsAdmin?.init?.({ session });
    window.ReservaAiTenantUsersAdmin?.init?.({ session });
    window.ReservaAiTenantKnowledgeAdmin?.init?.({ session });
    window.ReservaAiPlanoUsoAdmin?.init?.({ session });
    window.ReservaAiAuditPanel?.init?.({ session });
  }

  window.EngageSolarSettings = {
    SETTINGS_PANELS,
    SETTINGS_TITLES,
    isSettingsPanel,
    activateSettingsPanel,
    deactivateAllSettingsPanels,
    initSettingsModules,
  };
})();
