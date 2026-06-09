/**
 * Informações adicionais da empresa — KB complementar (/knowledge-base)
 */
(function () {
  const authService = window.ReservaAiAuth;
  const lib = window.ReservaAiTenantKnowledgeLib;
  const TENANT_STORAGE_KEY = 'reservaai.tenant-knowledge.tenant';
  const LOGIN_TENANT_STORAGE_KEY = 'reservaai.login.tenantId';

  const state = {
    mounted: false,
    active: false,
    initialized: false,
    session: null,
    me: null,
    tenantOptions: [],
    selectedTenantId: '',
    items: [],
    legacyItems: [],
    loading: false,
    formOpen: false,
    editingId: '',
    examplesOpen: false,
    dom: {},
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

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }

  function writeStorage(key, value) {
    try {
      if (!value) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (error) {
      // ignore
    }
  }

  function resolveSessionTenantId(session) {
    if (!session) return '';
    return String(
      session.activeTenantId
      || session.tenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || '',
    ).trim();
  }

  function readPreferredLoginTenantId() {
    const fromAuth = authService?.getPreferredLoginTenantId?.();
    if (fromAuth) return String(fromAuth).trim();
    return String(readStorage(LOGIN_TENANT_STORAGE_KEY) || '').trim();
  }

  function resolveInitialTenantId(session, tenantOptions) {
    const options = Array.isArray(tenantOptions) ? tenantOptions : [];
    const ids = new Set(options.map((t) => String(t?.id || '').trim()).filter(Boolean));
    const pick = (candidate) => {
      const id = String(candidate || '').trim();
      return id && ids.has(id) ? id : '';
    };
    return pick(resolveSessionTenantId(session))
      || pick(readPreferredLoginTenantId())
      || pick(readStorage(TENANT_STORAGE_KEY))
      || pick(options[0]?.id);
  }

  function tenantQuery() {
    return state.selectedTenantId ? `?tenantId=${encodeURIComponent(state.selectedTenantId)}` : '';
  }

  function setStatus(message, tone = 'neutral') {
    if (!state.dom.status) return;
    state.dom.status.textContent = message;
    state.dom.status.dataset.tone = tone;
  }

  function normalizeTenantOption(tenant) {
    const role = String(tenant?.role || '').toUpperCase();
    return {
      id: tenant?.id || tenant?.tenantId || '',
      name: tenant?.name || tenant?.legalName || tenant?.tradeName || 'Empresa sem nome',
      canManageTenant: tenant?.canManageTenant === true || role === 'OWNER' || role === 'ADMIN' || role === 'TENANT_ADMIN',
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
    const tenant = state.tenantOptions.find((item) => item.id === state.selectedTenantId);
    return tenant?.canManageTenant !== false;
  }

  async function requestExternal(path, options = {}) {
    const token = state.session?.externalAccessToken || authService?.getAccessToken?.() || '';
    if (!token) throw new Error('Sessão autenticada indisponível.');

    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`/api/operator${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');
    if (!response.ok) {
      throw window.EngageUserMessages?.buildHttpError
        ? window.EngageUserMessages.buildHttpError(response.status, payload, { context: 'settings' })
        : new Error('Não foi possível carregar os dados. Tente novamente.');
    }
    return payload;
  }

  function normalizeItem(row) {
    if (!row || typeof row !== 'object') return null;
    const categoryRaw = String(row.category || '').trim();
    const category = lib.normalizeCategory(categoryRaw);
    const displayType = lib.displayCategory(categoryRaw);
    const item = {
      id: String(row.id || '').trim(),
      title: String(row.title || '').trim(),
      content: String(row.content || '').trim(),
      category,
      categoryRaw,
      displayType,
      isActive: row.isActive !== false,
      createdAt: row.createdAt || '',
      updatedAt: row.updatedAt || '',
    };
    item.isOperationalLegacy = lib.isOperationalLegacyItem(item);
    return item;
  }

  function partitionItems(rows) {
    const all = rows.map(normalizeItem).filter(Boolean);
    const legacyItems = all.filter((item) => item.isOperationalLegacy);
    const items = all.filter((item) => !item.isOperationalLegacy);
    return { items, legacyItems, all };
  }

  function toApiBody(form) {
    return {
      title: form.title.trim(),
      category: lib.categoryForApi(form.type),
      content: form.content.trim(),
      isActive: form.enabled,
    };
  }

  function previewContent(text, max = 120) {
    const safe = String(text || '').replace(/\s+/g, ' ').trim();
    if (safe.length <= max) return safe;
    return `${safe.slice(0, max - 1)}…`;
  }

  function getFormValues() {
    return {
      title: String(state.dom.formTitle?.value || '').trim(),
      type: String(state.dom.formType?.value || 'Outros').trim(),
      content: String(state.dom.formContent?.value || '').trim(),
      enabled: state.dom.formEnabled?.checked !== false,
    };
  }

  function validateForm(form) {
    if (form.title.length < lib.TITLE_MIN_LENGTH || form.title.length > lib.TITLE_MAX_LENGTH) {
      return `Título deve ter entre ${lib.TITLE_MIN_LENGTH} e ${lib.TITLE_MAX_LENGTH} caracteres.`;
    }
    if (form.content.length < 2) {
      return 'Informação deve ter pelo menos 2 caracteres.';
    }
    if (form.content.length > lib.CONTENT_MAX_LENGTH) {
      return `Informação deve ter no máximo ${lib.CONTENT_MAX_LENGTH} caracteres.`;
    }
    const operationalError = lib.validateOperationalForm(form);
    if (operationalError) return operationalError;
    if (!lib.ALLOWED_CATEGORIES.includes(form.type)) {
      return 'Tipo inválido. Selecione uma opção da lista.';
    }
    return '';
  }

  function updateCharCounter() {
    if (!state.dom.formContent || !state.dom.formContentCounter) return;
    const len = String(state.dom.formContent.value || '').length;
    state.dom.formContentCounter.textContent = `${len} / ${lib.CONTENT_MAX_LENGTH}`;
    state.dom.formContentCounter.classList.toggle('is-limit', len >= lib.CONTENT_MAX_LENGTH);
  }

  function applyTypeGuides() {
    const type = String(state.dom.formType?.value || 'Outros');
    const guide = lib.TENANT_KB_TYPE_GUIDES[type] || lib.TENANT_KB_TYPE_GUIDES.Outros;
    if (state.dom.formTitle) state.dom.formTitle.placeholder = guide.titlePlaceholder;
    if (state.dom.formContent) state.dom.formContent.placeholder = guide.contentPlaceholder;
    if (state.dom.formTypeWhen) state.dom.formTypeWhen.textContent = guide.whenToUse;
    if (state.dom.formTitleHint) state.dom.formTitleHint.textContent = guide.titleHint;
    if (state.dom.formContentHint) state.dom.formContentHint.textContent = guide.contentHint;
    if (state.dom.examplesSummary) {
      state.dom.examplesSummary.textContent = `Ver exemplos para ${type}`;
    }
    renderExamples();
  }

  function renderExamples() {
    if (!state.dom.examplesList) return;
    const type = String(state.dom.formType?.value || 'Outros');
    const examples = lib.TENANT_KB_EXAMPLES[type] || [];
    state.dom.examplesList.innerHTML = examples.map((ex, index) => `
      <div class="tenant-kb-example-row">
        <div class="tenant-kb-example-copy">
          <strong>${escapeHtml(ex.title)}</strong>
          <p>${escapeHtml(ex.content)}</p>
        </div>
        <button type="button" class="pro-btn-ghost tenant-kb-example-use" data-example-index="${index}">Usar este exemplo</button>
      </div>
    `).join('');
  }

  function useExample(index) {
    const type = String(state.dom.formType?.value || 'Outros');
    const examples = lib.TENANT_KB_EXAMPLES[type] || [];
    const ex = examples[Number(index)];
    if (!ex) return;
    if (state.dom.formTitle) state.dom.formTitle.value = ex.title;
    if (state.dom.formContent) state.dom.formContent.value = ex.content.slice(0, lib.CONTENT_MAX_LENGTH);
    updateCharCounter();
  }

  function resetForm() {
    state.editingId = '';
    if (state.dom.formTitle) state.dom.formTitle.value = '';
    if (state.dom.formType) state.dom.formType.value = 'Outros';
    if (state.dom.formContent) state.dom.formContent.value = '';
    if (state.dom.formEnabled) state.dom.formEnabled.checked = true;
    updateCharCounter();
    applyTypeGuides();
    if (state.dom.formSubmit) state.dom.formSubmit.textContent = 'Adicionar informação';
    if (state.dom.formCardTitle) state.dom.formCardTitle.textContent = 'Nova informação';
  }

  function openCreateForm() {
    if (!canManageSelectedTenant()) {
      setStatus('Apenas administradores podem criar ou editar informações.', 'warn');
      return;
    }
    state.formOpen = true;
    state.editingId = '';
    resetForm();
    syncFormVisibility();
    state.dom.formTitle?.focus();
  }

  function openEditForm(id) {
    if (!canManageSelectedTenant()) {
      setStatus('Apenas administradores podem criar ou editar informações.', 'warn');
      return;
    }
    const row = findItemById(id);
    if (!row) return;
    if (row.isOperationalLegacy) {
      setStatus('Item operacional legado — remova ou desative. Não é possível editar aqui.', 'warn');
      return;
    }
    state.formOpen = true;
    state.editingId = id;
    if (state.dom.formTitle) state.dom.formTitle.value = row.title;
    if (state.dom.formType) {
      state.dom.formType.value = lib.ALLOWED_CATEGORIES.includes(row.category)
        ? row.category
        : (lib.normalizeCategory(row.categoryRaw) || 'Outros');
    }
    if (state.dom.formContent) state.dom.formContent.value = row.content;
    if (state.dom.formEnabled) state.dom.formEnabled.checked = row.isActive;
    updateCharCounter();
    applyTypeGuides();
    if (state.dom.formSubmit) state.dom.formSubmit.textContent = 'Salvar alterações';
    if (state.dom.formCardTitle) state.dom.formCardTitle.textContent = 'Editar informação';
    syncFormVisibility();
    state.dom.formCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeForm() {
    state.formOpen = false;
    state.editingId = '';
    syncFormVisibility();
  }

  function syncFormVisibility() {
    if (state.dom.formCard) state.dom.formCard.hidden = !state.formOpen;
    if (state.dom.addButton) state.dom.addButton.hidden = state.formOpen && canManageSelectedTenant();
  }

  function applyReadonlyState() {
    const canManage = canManageSelectedTenant();
    const controls = [
      state.dom.formTitle,
      state.dom.formType,
      state.dom.formContent,
      state.dom.formEnabled,
      state.dom.formSubmit,
      state.dom.formCancel,
      state.dom.addButton,
    ].filter(Boolean);
    controls.forEach((el) => {
      el.disabled = !canManage;
    });
    if (state.dom.readonlyNote) state.dom.readonlyNote.hidden = canManage;
    if (state.dom.formCard) state.dom.formCard.classList.toggle('is-readonly', !canManage);
    syncFormVisibility();
  }

  function renderTenantOptions() {
    if (!state.dom.tenant) return;
    const markup = state.tenantOptions.length
      ? state.tenantOptions.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('')
      : '<option value="">Sem empresa</option>';
    state.dom.tenant.innerHTML = markup;
    state.dom.tenant.value = state.selectedTenantId || '';
  }

  function renderTypeOptions() {
    if (!state.dom.formType) return;
    state.dom.formType.innerHTML = lib.TENANT_KB_SELECT_OPTIONS
      .map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
      .join('');
  }

  function renderItemCard(row, options = {}) {
    const legacy = options.legacy === true;
    const canManage = canManageSelectedTenant();
    const statusClass = row.isActive && !legacy ? 'is-active' : 'is-inactive';
    const statusLabel = legacy
      ? 'Operacional (legado)'
      : (row.isActive ? 'Ativo' : 'Inativo');
    return `
      <article class="tenant-kb-item ${statusClass}${legacy ? ' is-operational-legacy' : ''}" data-kb-id="${escapeHtml(row.id)}">
        <div class="tenant-kb-item-main">
          <div class="tenant-kb-item-head">
            <h3 class="tenant-kb-item-title">${escapeHtml(row.title)}</h3>
            <span class="tenant-kb-item-status">${statusLabel}</span>
          </div>
          ${legacy ? '<p class="tenant-kb-item-warning">Este assunto é operacional — remova ou configure em Serviços/Horários.</p>' : ''}
          <div class="tenant-kb-item-meta">
            <span class="tenant-kb-badge">${escapeHtml(row.displayType || row.category)}</span>
          </div>
          <p class="tenant-kb-item-preview">${escapeHtml(previewContent(row.content))}</p>
        </div>
        <div class="tenant-kb-item-actions">
          ${canManage ? `
            ${legacy ? '' : `<button type="button" class="pro-btn-ghost" data-kb-action="edit" data-kb-id="${escapeHtml(row.id)}">Editar</button>`}
            <button type="button" class="pro-btn-ghost" data-kb-action="toggle" data-kb-id="${escapeHtml(row.id)}">${row.isActive ? 'Desativar' : 'Ativar'}</button>
            <button type="button" class="pro-btn-danger" data-kb-action="delete" data-kb-id="${escapeHtml(row.id)}">Remover</button>
          ` : ''}
        </div>
      </article>
    `;
  }

  function renderOperationalBanner() {
    if (!state.dom.operationalBanner) return;
    const count = state.legacyItems.length;
    if (!count) {
      state.dom.operationalBanner.hidden = true;
      state.dom.operationalBanner.innerHTML = '';
      return;
    }
    state.dom.operationalBanner.hidden = false;
    state.dom.operationalBanner.innerHTML = `
      <strong>Este assunto é operacional — remova ou configure em Serviços/Horários</strong>
      <p>${escapeHtml(lib.OPERATIONAL_BANNER_MESSAGE)} (${count} item(ns) legado(s) abaixo.)</p>
    `;
  }

  function renderLegacyList() {
    if (!state.dom.legacySection || !state.dom.legacyList) return;
    if (!state.legacyItems.length) {
      state.dom.legacySection.hidden = true;
      state.dom.legacyList.innerHTML = '';
      return;
    }
    state.dom.legacySection.hidden = false;
    if (state.dom.legacyCount) {
      state.dom.legacyCount.textContent = String(state.legacyItems.length);
    }
    state.dom.legacyList.innerHTML = state.legacyItems
      .map((row) => renderItemCard(row, { legacy: true }))
      .join('');
  }

  function renderList() {
    renderOperationalBanner();
    renderLegacyList();
    if (!state.dom.list) return;
    if (state.loading) {
      state.dom.list.innerHTML = '<p class="tenant-kb-empty">Carregando informações…</p>';
      return;
    }
    if (!state.items.length) {
      const hint = state.legacyItems.length
        ? 'Nenhuma informação complementar na lista principal. Remova os itens operacionais legados abaixo.'
        : 'Nenhuma informação cadastrada ainda. Use «Adicionar informação» para começar.';
      state.dom.list.innerHTML = `<p class="tenant-kb-empty">${hint}</p>`;
      return;
    }
    state.dom.list.innerHTML = state.items.map((row) => renderItemCard(row)).join('');
  }

  async function bootstrap() {
    if (state.initialized) return;
    const me = await requestExternal('/auth/me');
    state.me = window.ReservaPermissions?.mergeOperatorAuthMe?.(state.session, me) || me || null;
    state.tenantOptions = Array.isArray(me?.tenants) ? me.tenants.map(normalizeTenantOption) : [];
    if (!state.tenantOptions.length) {
      const tenants = await requestExternal('/tenants');
      state.tenantOptions = Array.isArray(tenants) ? tenants.map(normalizeTenantOption) : [];
    }
    const nextId = resolveInitialTenantId(state.session, state.tenantOptions);
    if (nextId) {
      state.selectedTenantId = nextId;
      writeStorage(TENANT_STORAGE_KEY, nextId);
    }
    state.initialized = true;
    renderTenantOptions();
  }

  async function loadItems() {
    if (!state.selectedTenantId) {
      state.items = [];
      state.legacyItems = [];
      renderList();
      setStatus('Selecione uma empresa.', 'warn');
      return;
    }
    state.loading = true;
    renderList();
    try {
      const payload = await requestExternal(`/knowledge-base${tenantQuery()}`);
      const rows = Array.isArray(payload) ? payload : [];
      const partitioned = partitionItems(rows);
      state.items = partitioned.items;
      state.legacyItems = partitioned.legacyItems;
      const tenantName = state.tenantOptions.find((t) => t.id === state.selectedTenantId)?.name || 'empresa';
      const legacyNote = state.legacyItems.length
        ? ` ${state.legacyItems.length} item(ns) operacional(is) legado(s) oculto(s) da lista principal.`
        : '';
      setStatus(`${state.items.length} informação(ões) complementar(es) para ${tenantName}.${legacyNote}`, 'success');
    } catch (error) {
      state.items = [];
      state.legacyItems = [];
      setStatus(error.message || 'Não foi possível carregar as informações.', 'warn');
    } finally {
      state.loading = false;
      renderList();
    }
  }

  async function saveForm() {
    if (!canManageSelectedTenant()) {
      setStatus('Apenas administradores podem criar ou editar informações.', 'warn');
      return;
    }
    const form = getFormValues();
    const validation = validateForm(form);
    if (validation) {
      setStatus(validation, 'warn');
      return;
    }
    const body = toApiBody(form);
    const isEdit = Boolean(state.editingId);
    state.dom.formSubmit.disabled = true;
    setStatus(isEdit ? 'Salvando alterações…' : 'Adicionando informação…', 'neutral');
    try {
      if (isEdit) {
        await requestExternal(`/knowledge-base/${encodeURIComponent(state.editingId)}${tenantQuery()}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await requestExternal(`/knowledge-base${tenantQuery()}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      closeForm();
      resetForm();
      await loadItems();
      setStatus(isEdit ? 'Informação atualizada.' : 'Informação adicionada.', 'success');
    } catch (error) {
      setStatus(error.message || 'Não foi possível salvar.', 'warn');
    } finally {
      state.dom.formSubmit.disabled = false;
    }
  }

  function findItemById(id) {
    return state.items.find((item) => item.id === id)
      || state.legacyItems.find((item) => item.id === id);
  }

  async function toggleItem(id) {
    if (!canManageSelectedTenant()) return;
    const row = findItemById(id);
    if (!row) return;
    const nextActive = !row.isActive;
    setStatus(nextActive ? 'Ativando…' : 'Desativando…', 'neutral');
    try {
      await requestExternal(`/knowledge-base/${encodeURIComponent(id)}${tenantQuery()}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: row.title,
          category: lib.categoryForApi(row.displayType || row.category),
          content: row.content,
          isActive: nextActive,
        }),
      });
      if (state.editingId === id && state.dom.formEnabled) {
        state.dom.formEnabled.checked = nextActive;
      }
      await loadItems();
      setStatus(nextActive ? 'Informação ativada.' : 'Informação desativada.', 'success');
    } catch (error) {
      setStatus(error.message || 'Não foi possível alterar o status.', 'warn');
    }
  }

  async function deleteItem(id) {
    if (!canManageSelectedTenant()) return;
    const row = findItemById(id);
    const label = row?.title || 'esta informação';
    if (!window.confirm(`Remover «${label}»? Esta ação não pode ser desfeita.`)) return;
    setStatus('Removendo…', 'neutral');
    try {
      await requestExternal(`/knowledge-base/${encodeURIComponent(id)}${tenantQuery()}`, {
        method: 'DELETE',
      });
      if (state.editingId === id) {
        closeForm();
        resetForm();
      }
      await loadItems();
      setStatus('Informação removida.', 'success');
    } catch (error) {
      setStatus(error.message || 'Não foi possível remover.', 'warn');
    }
  }

  function bindEvents() {
    state.dom.refresh?.addEventListener('click', () => {
      void loadItems();
    });
    state.dom.tenant?.addEventListener('change', () => {
      state.selectedTenantId = state.dom.tenant.value;
      writeStorage(TENANT_STORAGE_KEY, state.selectedTenantId);
      closeForm();
      resetForm();
      void loadItems();
    });
    state.dom.addButton?.addEventListener('click', openCreateForm);
    state.dom.formCancel?.addEventListener('click', () => {
      closeForm();
      resetForm();
    });
    state.dom.formSubmit?.addEventListener('click', () => { void saveForm(); });
    state.dom.formType?.addEventListener('change', applyTypeGuides);
    state.dom.formContent?.addEventListener('input', () => {
      if (state.dom.formContent.value.length > lib.CONTENT_MAX_LENGTH) {
        state.dom.formContent.value = state.dom.formContent.value.slice(0, lib.CONTENT_MAX_LENGTH);
      }
      updateCharCounter();
    });
    state.dom.examplesDetails?.addEventListener('toggle', () => {
      state.examplesOpen = state.dom.examplesDetails.open;
    });
    state.dom.examplesList?.addEventListener('click', (event) => {
      const btn = event.target.closest('.tenant-kb-example-use');
      if (!btn) return;
      useExample(btn.getAttribute('data-example-index'));
    });
    const onListAction = (event) => {
      const btn = event.target.closest('[data-kb-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-kb-id');
      const action = btn.getAttribute('data-kb-action');
      if (action === 'edit') openEditForm(id);
      else if (action === 'toggle') void toggleItem(id);
      else if (action === 'delete') void deleteItem(id);
    };
    state.dom.list?.addEventListener('click', onListAction);
    state.dom.legacyList?.addEventListener('click', onListAction);
  }

  function mount() {
    if (state.mounted) return;
    state.dom.root = qs('#tenantKnowledgeRoot');
    if (!state.dom.root) return;

    state.dom.status = qs('#tenantKnowledgeStatus');
    state.dom.tenant = qs('#tenantKnowledgeTenant');
    state.dom.refresh = qs('#tenantKnowledgeRefresh');
    state.dom.addButton = qs('#tenantKnowledgeAdd');
    state.dom.readonlyNote = qs('#tenantKnowledgeReadonlyNote');
    state.dom.orgSummary = qs('#tenantKnowledgeOrgSummary');
    state.dom.formCard = qs('#tenantKnowledgeFormCard');
    state.dom.formCardTitle = qs('#tenantKnowledgeFormCardTitle');
    state.dom.formTitle = qs('#tenantKnowledgeFormTitle');
    state.dom.formType = qs('#tenantKnowledgeFormType');
    state.dom.formTypeWhen = qs('#tenantKnowledgeFormTypeWhen');
    state.dom.formTitleHint = qs('#tenantKnowledgeFormTitleHint');
    state.dom.formContent = qs('#tenantKnowledgeFormContent');
    state.dom.formContentHint = qs('#tenantKnowledgeFormContentHint');
    state.dom.formContentCounter = qs('#tenantKnowledgeFormContentCounter');
    state.dom.formEnabled = qs('#tenantKnowledgeFormEnabled');
    state.dom.formSubmit = qs('#tenantKnowledgeFormSubmit');
    state.dom.formCancel = qs('#tenantKnowledgeFormCancel');
    state.dom.examplesDetails = qs('#tenantKnowledgeExamplesDetails');
    state.dom.examplesSummary = qs('#tenantKnowledgeExamplesSummary');
    state.dom.examplesList = qs('#tenantKnowledgeExamplesList');
    state.dom.pageLead = qs('#tenantKnowledgePageLead');
    state.dom.list = qs('#tenantKnowledgeList');
    state.dom.operationalBanner = qs('#tenantKnowledgeOperationalBanner');
    state.dom.legacySection = qs('#tenantKnowledgeLegacySection');
    state.dom.legacyList = qs('#tenantKnowledgeLegacyList');
    state.dom.legacyCount = qs('#tenantKnowledgeLegacyCount');

    if (state.dom.orgSummary) {
      state.dom.orgSummary.textContent = lib.TENANT_KB_ORGANIZATION_SUMMARY;
    }
    if (state.dom.pageLead) {
      state.dom.pageLead.textContent = lib.TENANT_KB_PAGE_LEAD;
    }

    renderTypeOptions();
    bindEvents();
    state.mounted = true;
  }

  window.ReservaAiTenantKnowledgeAdmin = {
    init({ session }) {
      state.session = session || null;
      mount();
    },
    async activate(session) {
      state.active = true;
      state.session = session || state.session;
      mount();
      if (!state.mounted) return;

      applyReadonlyState();
      try {
        await bootstrap();
        const nextId = resolveInitialTenantId(state.session, state.tenantOptions);
        if (nextId) {
          state.selectedTenantId = nextId;
          writeStorage(TENANT_STORAGE_KEY, nextId);
        }
        renderTenantOptions();
        applyReadonlyState();
        await loadItems();
      } catch (error) {
        setStatus(error.message || 'Não foi possível carregar informações adicionais.', 'warn');
      }
    },
    deactivate() {
      state.active = false;
      closeForm();
    },
  };
})();
