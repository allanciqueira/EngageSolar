(function () {
  const createClient = window.createReservaAiApiClient;
  const auditApi = createClient ? createClient('/api/audit') : null;

  const state = {
    mounted: false,
    initialized: false,
    active: false,
    session: null,
    events: [],
    dom: {},
  };

  function qs(selector) {
    return document.querySelector(selector);
  }

  function formatDateTime(value) {
    if (!value) {
      return 'Sem data';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  }

  function setStatus(message, tone) {
    if (!state.dom.status) {
      return;
    }
    state.dom.status.textContent = message;
    state.dom.status.dataset.tone = tone || 'neutral';
  }

  function resolveTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    return String(
      session?.activeTenantId
      || session?.tenantId
      || session?.tenant?.id
      || window.ReservaAiAuth?.getPreferredLoginTenantId?.()
      || '',
    ).trim();
  }

  function eventMatchesTenant(event, tenantId) {
    if (!tenantId) return true;
    const details = event?.details && typeof event.details === 'object' ? event.details : {};
    const fromDetails = String(details.tenantId || '').trim();
    if (fromDetails && fromDetails === tenantId) return true;
    if (String(event?.entityType || '').toLowerCase() === 'tenant'
      && String(event?.entityId || '').trim() === tenantId) {
      return true;
    }
    return false;
  }

  function mount() {
    if (state.mounted) {
      return;
    }

    state.dom.status = qs('#auditPanelStatus');
    state.dom.kpis = qs('#auditPanelKpis');
    state.dom.form = qs('#auditPanelFilters');
    state.dom.sourceModule = qs('#auditPanelSourceModule');
    state.dom.actionType = qs('#auditPanelActionType');
    state.dom.query = qs('#auditPanelQuery');
    state.dom.reset = qs('#auditPanelReset');
    state.dom.tableBody = qs('#auditPanelTableBody');

    state.dom.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      void loadEvents();
    });

    state.dom.reset?.addEventListener('click', () => {
      state.dom.form?.reset();
      void loadEvents();
    });

    state.mounted = true;
  }

  function renderKpis() {
    if (!state.dom.kpis) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const loginEvents = state.events.filter((item) => item.actionType?.includes('LOGIN')).length;
    const changeEvents = state.events.filter((item) => !item.actionType?.includes('LOGIN') && item.actionType !== 'LOGOUT').length;
    const todayEvents = state.events.filter((item) => item.createdAt?.slice(0, 10) === today).length;

    state.dom.kpis.innerHTML = [
      { label: 'Eventos carregados', value: state.events.length, meta: 'Janela atual da auditoria' },
      { label: 'Eventos hoje', value: todayEvents, meta: 'Criados na data atual' },
      { label: 'Logins e acessos', value: loginEvents, meta: 'Login e falhas de autenticação' },
      { label: 'Mudanças operacionais', value: changeEvents, meta: 'Criações, edições e exclusões' },
    ].map((item) => `
      <article class="audit-panel-kpi">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
        <p>${item.meta}</p>
      </article>
    `).join('');
  }

  function renderTable() {
    if (!state.dom.tableBody) {
      return;
    }

    if (!state.events.length) {
      state.dom.tableBody.innerHTML = '<tr><td colspan="6" class="audit-panel-empty">Nenhum evento encontrado para os filtros informados.</td></tr>';
      return;
    }

    state.dom.tableBody.innerHTML = state.events.map((event) => `
      <tr>
        <td>${formatDateTime(event.createdAt)}</td>
        <td>${event.sourceModule || '-'}</td>
        <td><span class="audit-action-chip">${event.actionType || '-'}</span></td>
        <td>
          <strong>${event.actorDisplayName || event.actorUsername || 'Sistema'}</strong>
          <span>${event.actorUsername || 'sem usuario'}</span>
        </td>
        <td>
          <strong>${event.entityType || '-'}</strong>
          <p>${event.description || '-'}</p>
        </td>
        <td>
          <details class="audit-details">
            <summary>Ver</summary>
            <pre>${JSON.stringify(event.details || {}, null, 2)}</pre>
          </details>
        </td>
      </tr>
    `).join('');
  }

  async function loadEvents() {
    if (!auditApi) {
      return;
    }

    const tenantId = resolveTenantId(state.session);
    const params = new URLSearchParams({ limit: '250' });
    if (tenantId) {
      params.set('tenantId', tenantId);
    }
    if (state.dom.sourceModule?.value) {
      params.set('sourceModule', state.dom.sourceModule.value);
    }
    if (state.dom.actionType?.value.trim()) {
      params.set('actionType', state.dom.actionType.value.trim());
    }
    if (state.dom.query?.value.trim()) {
      params.set('query', state.dom.query.value.trim());
    }

    setStatus('Carregando eventos de auditoria...', 'neutral');

    try {
      const payload = await auditApi.request(`/events?${params.toString()}`);
      const rows = Array.isArray(payload) ? payload : [];
      state.events = tenantId ? rows.filter((event) => eventMatchesTenant(event, tenantId)) : rows;
      renderKpis();
      renderTable();
      setStatus('Auditoria carregada com sucesso.', 'success');
    } catch (error) {
      setStatus(error.message || 'Não foi possível carregar a auditoria.', 'warn');
    }
  }

  window.ReservaAiAuditPanel = {
    init({ session }) {
      state.session = session || null;
      mount();
      state.initialized = true;
    },
    async activate(session) {
      state.active = true;
      let resolved = session || state.session;
      if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
        resolved = await window.ReservaPermissions.enrichSessionWithOperatorMe(resolved);
      }
      state.session = resolved;
      mount();
      await loadEvents();
    },
    deactivate() {
      state.active = false;
    },
  };
})();