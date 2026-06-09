/**
 * Pacote de Serviços — CRUD de planos no painel Serviços.
 * Venda do pacote: agenda ou módulo Vendas (não neste painel).
 * Só chama /service-packages/* quando enableServicePackages está ativo.
 */
(function () {
  const getAdminApi = () => {
    const api = window.ReservaAiApi;
    return api && typeof api.request === 'function' ? api : null;
  };

  const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  let session = null;
  let bound = false;
  let activeModuleTab = 'catalog';
  let plans = [];
  let catalogServices = [];
  let loadingPlans = false;
  let loadPlansInflight = null;
  let planEditorOpen = false;

  const isServicosPanelActive = () => document.body?.dataset?.adminPanelActive === 'servicos';

  const servicesProModuleTabIsPackages = () => {
    const btn = el('#servicesProPackagesTabBtn');
    return btn?.classList.contains('is-active') === true;
  };

  const shouldLoadPlansNow = () => isServicosPanelActive()
    && (activeModuleTab === 'packages' || servicesProModuleTabIsPackages());

  const el = (sel, root) => (root || document).querySelector(sel);

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const escapeAttr = (value) => escapeHtml(value);

  const parseApiError = (err) => String(err?.message || err?.body?.message || err?.body?.error || 'Falha na operação.');

  const isFeatureEnabled = () => window.ReservaAiAdminShell?.isServicePackagesEnabled?.() === true;

  const getDefaultTenantId = (s) => {
    const direct = String(
      s?.activeTenantId || s?.tenantId || s?.tenant?.id || s?.tenant?.tenantId || '',
    ).trim();
    if (direct) {
      return direct;
    }
    const tenants = Array.isArray(s?.tenants) ? s.tenants : [];
    const t = tenants.find((x) => x && (x.id || x.tenantId));
    return String(t?.id || t?.tenantId || '').trim();
  };

  const resolveTenantId = () => {
    const shell = window.ReservaAiAdminSession?.getOperatorTenantId?.();
    if (shell) {
      return String(shell).trim();
    }
    return getDefaultTenantId(session);
  };

  const tenantQuery = () => {
    const tenantId = resolveTenantId();
    return tenantId ? `tenantId=${encodeURIComponent(tenantId)}` : '';
  };

  const extractArrayPayload = (payload) => {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.plans)) {
      return payload.plans;
    }
    if (Array.isArray(payload?.items)) {
      return payload.items;
    }
    if (Array.isArray(payload?.results)) {
      return payload.results;
    }
    if (Array.isArray(payload?.data)) {
      return payload.data;
    }
    const d = payload?.data;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      if (Array.isArray(d.plans)) {
        return d.plans;
      }
      if (Array.isArray(d.items)) {
        return d.items;
      }
      if (Array.isArray(d.data)) {
        return d.data;
      }
    }
    return [];
  };

  const unwrapObjectPayload = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    const inner = payload.data;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner;
    }
    return payload;
  };

  const formatMoney = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return '—';
    }
    return moneyFmt.format(n);
  };

  const normalizePlan = (row) => {
    const items = Array.isArray(row?.items)
      ? row.items
      : (Array.isArray(row?.credits)
        ? row.credits
        : (Array.isArray(row?.creditLines) ? row.creditLines : []));
    const kindRaw = String(row?.kind || row?.type || 'ONE_TIME').toUpperCase();
    return {
      id: String(row?.id || row?.planId || '').trim(),
      name: String(row?.name || row?.title || '').trim(),
      description: String(row?.description || '').trim(),
      kind: kindRaw === 'RECURRING' ? 'RECURRING' : 'ONE_TIME',
      price: Number(row?.price ?? row?.amount ?? 0),
      validityDays: Number(
        row?.durationDays ?? row?.duration_days ?? row?.validityDays ?? row?.validity_days ?? 0,
      ),
      active: row?.active !== false && row?.enabled !== false,
      autoRenewDefault: row?.autoRenewDefault === true || row?.auto_renew_default === true,
      credits: items.map((c) => ({
        serviceId: String(c?.serviceId || c?.service_id || '').trim(),
        serviceName: String(
          c?.serviceName || c?.service_name || c?.name || c?.service_key || '',
        ).trim(),
        quantity: Number(c?.quantity ?? c?.qty ?? 0),
        branchId: String(c?.branchId || c?.branch_id || '').trim() || null,
      })).filter((c) => c.serviceId || c.serviceName),
    };
  };

  const requestPackages = (path, options = {}) => {
    const adminApi = getAdminApi();
    if (!adminApi) {
      return Promise.reject(new Error('API do admin indisponível.'));
    }
    const qs = tenantQuery();
    const suffix = qs ? (path.includes('?') ? `&${qs}` : `?${qs}`) : '';
    return adminApi.request(`/api/operator/service-packages${path}${suffix}`, options);
  };

  const collectServicesFromTenantPayload = (root) => {
    const list = [];
    const seen = new Set();
    const pushFrom = (source) => {
      if (!Array.isArray(source)) {
        return;
      }
      source.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        const name = String(entry?.name || entry?.serviceName || entry?.title || '').trim();
        if (!name) {
          return;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        list.push({
          id: String(entry?.id || entry?.serviceId || `service-${list.length}-${index}`).trim() || `service-${list.length}`,
          name,
        });
      });
    };
    const agentConfig = root?.agentConfig || {};
    pushFrom(agentConfig?.services);
    pushFrom(root?.services);
    pushFrom(root?.serviceCatalog);
    if (!list.length) {
      const overrides = agentConfig?.branchScheduleOverrides;
      if (overrides && typeof overrides === 'object') {
        Object.values(overrides).forEach((override) => pushFrom(override?.services));
      }
    }
    return list;
  };

  const loadCatalogServices = async () => {
    const tenantId = resolveTenantId();
    if (!tenantId) {
      catalogServices = [];
      return;
    }
    try {
      const payload = await getAdminApi().request(`/api/operator/tenant-settings?tenantId=${encodeURIComponent(tenantId)}`);
      const root = unwrapObjectPayload(payload);
      catalogServices = collectServicesFromTenantPayload(root);
    } catch (err) {
      catalogServices = [];
      console.warn('[service-packages] falha ao carregar catalogo de servicos do tenant:', err);
    }
  };

  const loadPlans = async () => {
    if (!shouldLoadPlansNow() || !isFeatureEnabled()) {
      return;
    }
    if (loadPlansInflight) {
      return loadPlansInflight;
    }
    loadingPlans = true;
    renderPlansPanel();
    loadPlansInflight = (async () => {
      try {
        const payload = await requestPackages('/plans');
        if (!shouldLoadPlansNow()) {
          return;
        }
        plans = extractArrayPayload(payload).map(normalizePlan).filter((p) => p.id || p.name);
      } catch (err) {
        if (!shouldLoadPlansNow()) {
          return;
        }
        plans = [];
        setPlansStatus(parseApiError(err), 'error');
      } finally {
        loadingPlans = false;
        loadPlansInflight = null;
        if (shouldLoadPlansNow()) {
          renderPlansPanel();
        }
      }
    })();
    return loadPlansInflight;
  };

  const setPlansStatus = (text, tone) => {
    const status = el('#servicePackagesStatus');
    if (!status) {
      return;
    }
    status.textContent = text || '';
    status.dataset.tone = tone || 'neutral';
    status.hidden = !text;
  };

  const renderPlansPanel = () => {
    const root = el('#servicePackagesAdminRoot');
    if (!root) {
      return;
    }
    if (!isFeatureEnabled()) {
      root.innerHTML = `
        <div class="service-packages-admin-shell">
          <div class="clients-pro-content-empty">
            Ative <strong>Pacote de Serviços</strong> em Configurações → Empresa → Gerais e clique em <strong>Guardar</strong>.
          </div>
        </div>`;
      return;
    }
    const rows = plans.length
      ? plans.map((plan) => `
          <article class="services-pro-card service-packages-plan-card" data-plan-id="${escapeAttr(plan.id)}">
            <header class="services-pro-card-head">
              <div>
                <strong>${escapeHtml(plan.name || 'Plano sem nome')}</strong>
                <span>${escapeHtml(plan.description || 'Sem descrição')}</span>
              </div>
              <span class="clients-pro-section-tag">${plan.active ? 'Ativo' : 'Inativo'}</span>
            </header>
            <div class="service-packages-plan-meta">
              <span><strong>Preço:</strong> ${escapeHtml(formatMoney(plan.price))}</span>
              ${plan.validityDays > 0 ? `<span><strong>Validade:</strong> ${escapeHtml(String(plan.validityDays))} dias</span>` : ''}
            </div>
            <ul class="service-packages-credits-list">
              ${(plan.credits || []).map((c) => `
                <li>${escapeHtml(c.serviceName || c.serviceId)} × ${escapeHtml(String(c.quantity || 0))}</li>
              `).join('') || '<li class="clients-pro-muted">Sem créditos configurados</li>'}
            </ul>
            <div class="service-packages-plan-actions">
              <button type="button" class="btn btn-ghost service-packages-edit-btn" data-sp-edit-plan="${escapeAttr(plan.id)}">Editar</button>
              <button type="button" class="btn btn-ghost service-packages-delete-btn" data-sp-delete-plan="${escapeAttr(plan.id)}" data-sp-plan-name="${escapeAttr(plan.name || '')}">Excluir</button>
            </div>
          </article>
        `).join('')
      : '<p class="clients-pro-muted">Nenhum Pacote de Serviços cadastrado. Clique em Novo Pacote de Serviços.</p>';

    const statusText = loadingPlans
      ? 'Carregando pacotes…'
      : (plans.length ? `${plans.length} pacote(s) cadastrado(s)` : '');
    root.innerHTML = `
      <div class="service-packages-admin-shell">
        <p class="service-packages-list-status" id="servicePackagesStatus" data-tone="neutral">${escapeHtml(statusText)}</p>
        <div class="service-packages-plans-grid">${rows}</div>
      </div>
    `;
  };

  const ensurePlanModal = () => el('#servicePackagesPlanModalBackdrop');

  const renderCatalogEmptyHint = () => {
    const hint = el('#servicePackagesCatalogEmptyHint');
    if (!hint) {
      return;
    }
    if (catalogServices.length) {
      hint.hidden = true;
      hint.textContent = '';
      hint.removeAttribute('data-tone');
      return;
    }
    hint.hidden = false;
    hint.dataset.tone = 'warn';
    hint.innerHTML = 'Nenhum serviço encontrado no catálogo desta empresa. Cadastre os serviços em <strong>Serviços → Serviços</strong> antes de criar o pacote.';
  };

  const matchesServiceName = (catalogName, lineName) => {
    const a = String(catalogName || '').trim().toLowerCase();
    const b = String(lineName || '').trim().toLowerCase();
    return Boolean(a) && a === b;
  };

  const renderCreditLines = (lines) => {
    const wrap = el('#servicePackagesPlanCredits');
    if (!wrap) {
      return;
    }
    const hasCatalog = catalogServices.length > 0;
    const rows = (lines && lines.length ? lines : [{ serviceId: '', serviceName: '', quantity: 1 }]);
    wrap.innerHTML = rows.map((line, index) => {
      const options = catalogServices.map((s) => `
        <option value="${escapeAttr(s.name)}" data-id="${escapeAttr(s.id)}" ${matchesServiceName(s.name, line.serviceName) ? 'selected' : ''}>${escapeHtml(s.name)}</option>
      `).join('');
      const placeholder = hasCatalog
        ? 'Selecione…'
        : 'Cadastre serviços no Catálogo primeiro';
      return `
        <div class="service-packages-credit-line" data-credit-index="${index}">
          <label class="inventory-editor-field">
            <span>Serviço</span>
            <select class="service-packages-credit-service" aria-label="Serviço" ${hasCatalog ? '' : 'disabled'}>
              <option value="">${escapeHtml(placeholder)}</option>
              ${options}
            </select>
          </label>
          <label class="inventory-editor-field service-packages-credit-qty-field">
            <span>Qtd.</span>
            <input type="number" class="service-packages-credit-qty" min="1" step="1" value="${escapeAttr(String(line.quantity || 1))}" aria-label="Quantidade" />
          </label>
          <button type="button" class="btn btn-ghost service-packages-credit-remove" data-sp-remove-credit aria-label="Remover linha">Remover</button>
        </div>
      `;
    }).join('');
    renderCatalogEmptyHint();
  };

  const readCreditLinesFromForm = () => {
    const wrap = el('#servicePackagesPlanCredits');
    if (!wrap) {
      return [];
    }
    return Array.from(wrap.querySelectorAll('.service-packages-credit-line')).map((row) => {
      const select = row.querySelector('.service-packages-credit-service');
      const qtyInput = row.querySelector('.service-packages-credit-qty');
      const opt = select?.selectedOptions?.[0];
      const serviceName = String(select?.value || '').trim();
      const serviceId = String(opt?.getAttribute('data-id') || '').trim();
      const quantity = Math.max(1, Number(qtyInput?.value || 1));
      return { serviceId, serviceName, quantity };
    }).filter((c) => c.serviceName);
  };

  const openPlanEditor = async (planId) => {
    if (!isFeatureEnabled()) {
      return;
    }
    await loadCatalogServices();
    const backdrop = ensurePlanModal();
    if (!backdrop) {
      return;
    }
    const existing = planId ? plans.find((p) => p.id === planId) : null;
    el('#servicePackagesPlanId').value = existing?.id || '';
    el('#servicePackagesPlanName').value = existing?.name || '';
    el('#servicePackagesPlanDescription').value = existing?.description || '';
    el('#servicePackagesPlanPrice').value = existing ? String(existing.price || 0) : '';
    el('#servicePackagesPlanValidity').value = String(existing?.validityDays || 365);
    el('#servicePackagesPlanActive').checked = existing ? existing.active !== false : true;
    const title = el('#servicePackagesPlanModalTitle');
    if (title) {
      title.textContent = existing ? 'Editar Pacote de Serviços' : 'Novo Pacote de Serviços';
    }
    renderCreditLines(existing?.credits || []);
    const feedback = el('#servicePackagesPlanFeedback');
    if (feedback) {
      feedback.hidden = true;
      feedback.textContent = '';
      feedback.removeAttribute('data-tone');
    }
    backdrop.hidden = false;
    document.body.classList.add('service-packages-modal-open');
    planEditorOpen = true;
    window.setTimeout(() => el('#servicePackagesPlanName')?.focus(), 40);
  };

  const closePlanEditor = () => {
    const backdrop = ensurePlanModal();
    if (backdrop) {
      backdrop.hidden = true;
    }
    document.body.classList.remove('service-packages-modal-open');
    planEditorOpen = false;
  };

  const savePlan = async (event) => {
    event.preventDefault();
    if (!isFeatureEnabled()) {
      return;
    }
    const feedback = el('#servicePackagesPlanFeedback');
    const id = String(el('#servicePackagesPlanId')?.value || '').trim();
    const name = String(el('#servicePackagesPlanName')?.value || '').trim();
    const description = String(el('#servicePackagesPlanDescription')?.value || '').trim();
    const price = Number(el('#servicePackagesPlanPrice')?.value || 0);
    const durationDays = Math.max(0, Number(el('#servicePackagesPlanValidity')?.value || 0));
    const active = el('#servicePackagesPlanActive')?.checked !== false;
    const credits = readCreditLinesFromForm();
    if (!name) {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = 'Informe o nome do pacote.';
        feedback.dataset.tone = 'warn';
      }
      return;
    }
    if (!credits.length) {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = 'Adicione ao menos um crédito de serviço com nome do catálogo.';
        feedback.dataset.tone = 'warn';
      }
      return;
    }
    // Contrato handoff doc 03/5: { name, description, kind, durationDays, price, active,
    // autoRenewDefault, items: [{ serviceName, quantity, branchId? }] }
    const items = credits.map((c) => {
      const item = { serviceName: c.serviceName, quantity: c.quantity };
      if (c.branchId) {
        item.branchId = c.branchId;
      }
      return item;
    });
    const body = {
      name,
      description,
      kind: 'ONE_TIME',
      durationDays,
      price,
      active,
      autoRenewDefault: false,
      items,
    };
    const saveBtn = el('#servicePackagesPlanSaveBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
    }
    try {
      if (id) {
        await requestPackages(`/plans/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await requestPackages('/plans', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      closePlanEditor();
      await loadPlans();
      setPlansStatus('Pacote de Serviços salvo.', 'ok');
      if (feedback) {
        feedback.hidden = true;
      }
    } catch (err) {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = parseApiError(err);
        feedback.dataset.tone = 'warn';
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
      }
    }
  };

  const deletePlan = async (planId, fallbackName) => {
    if (!isFeatureEnabled() || !planId) {
      return;
    }
    const plan = plans.find((p) => p.id === planId);
    const planName = (plan?.name || fallbackName || '').trim() || 'este pacote';
    const confirmed = window.confirm(
      `Excluir o pacote "${planName}"?\n\nO pacote será desativado e deixará de aparecer na lista. `
      + 'Pacotes já vendidos continuam ativos para os clientes — créditos e renovações não são afetados.',
    );
    if (!confirmed) {
      return;
    }
    setPlansStatus('Excluindo pacote…', 'neutral');
    try {
      await requestPackages(`/plans/${encodeURIComponent(planId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      });
      await loadPlans();
      setPlansStatus(`Pacote "${planName}" excluído (desativado).`, 'ok');
    } catch (err) {
      setPlansStatus(parseApiError(err), 'error');
    }
  };

  const setServicesModuleTab = (tab) => {
    activeModuleTab = tab === 'packages' ? 'packages' : 'catalog';
    if (activeModuleTab === 'packages') {
      openPackagesTab();
    }
  };

  const openPackagesTab = () => {
    if (!isServicosPanelActive()) {
      return;
    }
    activeModuleTab = 'packages';
    renderPlansPanel();
    if (isFeatureEnabled()) {
      void loadPlans();
    }
  };

  const bindRoot = () => {
    if (bound) {
      return;
    }
    bound = true;
    const backdrop = ensurePlanModal();
    backdrop?.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        closePlanEditor();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && planEditorOpen) {
        closePlanEditor();
      }
    });
    document.addEventListener('click', (event) => {
      const refreshTrigger = event.target.closest('#operatorConfigServicesRefresh');
      const addPlanTrigger = event.target.closest('#servicePackagesHeadAddPlan');
      if (refreshTrigger && (activeModuleTab === 'packages' || servicesProModuleTabIsPackages())) {
        if (!isFeatureEnabled()) {
          return;
        }
        void loadPlans();
        return;
      }
      if (addPlanTrigger) {
        if (!isFeatureEnabled()) {
          return;
        }
        void openPlanEditor('');
        return;
      }
      if (!isFeatureEnabled()) {
        return;
      }
      const editBtn = event.target.closest('[data-sp-edit-plan]');
      if (editBtn) {
        void openPlanEditor(editBtn.getAttribute('data-sp-edit-plan') || '');
        return;
      }
      const deleteBtn = event.target.closest('[data-sp-delete-plan]');
      if (deleteBtn) {
        const planId = deleteBtn.getAttribute('data-sp-delete-plan') || '';
        const planName = deleteBtn.getAttribute('data-sp-plan-name') || '';
        void deletePlan(planId, planName);
      }
    });
    document.addEventListener('submit', (event) => {
      if (event.target?.id === 'servicePackagesPlanForm') {
        void savePlan(event);
      }
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-sp-close-plan]')) {
        closePlanEditor();
      }
      if (event.target.closest('#servicePackagesAddCreditLine')) {
        const lines = readCreditLinesFromForm();
        lines.push({ serviceId: '', serviceName: '', quantity: 1 });
        renderCreditLines(lines);
      }
      if (event.target.closest('[data-sp-remove-credit]')) {
        const row = event.target.closest('.service-packages-credit-line');
        const wrap = el('#servicePackagesPlanCredits');
        if (row && wrap && wrap.querySelectorAll('.service-packages-credit-line').length > 1) {
          row.remove();
        }
      }
    });
  };

  const applyFeatureGates = () => {
    if (!isServicosPanelActive()) {
      return;
    }
    const enabled = isFeatureEnabled();
    const tabsRoot = el('#servicesProModuleTabs');
    if (tabsRoot) {
      tabsRoot.hidden = false;
    }
    if (!enabled) {
      const root = el('#servicePackagesAdminRoot');
      if (root && shouldLoadPlansNow()) {
        root.innerHTML = '<div class="clients-pro-content-empty">Ative <strong>Pacote de Serviços</strong> em Configurações → Empresa → Gerais e clique em <strong>Guardar</strong>.</div>';
      }
    }
  };

  window.ReservaAiServicePackagesAdmin = {
    async activate(nextSession) {
      session = nextSession || window.ReservaAiAdminSession?.getSession?.() || session;
      bindRoot();
      applyFeatureGates();
      if (shouldLoadPlansNow()) {
        openPackagesTab();
      }
    },
    deactivate() {
      closePlanEditor();
      activeModuleTab = 'catalog';
      loadPlansInflight = null;
      loadingPlans = false;
    },
    applyFeatureGates,
    setServicesModuleTab,
    openPackagesTab,
    renderPlansPanel,
    loadPlans,
  };
})();
