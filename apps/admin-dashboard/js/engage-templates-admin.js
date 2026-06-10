/**
 * Engage Config — Templates WhatsApp (lista + wizard + detalhe).
 */
(function () {
  const api = () => window.EngageTemplatesApi;
  const utils = () => window.EngageTemplatesUtils;

  const QUICK_INSERT = [
    { label: 'Nome do contato', key: 'name' },
    { label: 'Cidade', key: 'city' },
    { label: 'Vendedor', key: 'salesperson' },
    { label: 'Empresa', key: 'tenant_name' },
  ];

  const state = {
    active: false,
    session: null,
    canMutate: false,
    view: 'list',
    wizardStep: 1,
    loading: false,
    saving: false,
    error: '',
    templates: [],
    campaigns: [],
    catalog: [],
    metaWabaId: '',
    businessName: 'WhatsApp',
    selectedId: '',
    detail: null,
    wizard: {
      prefix: '',
      purpose: '',
      version: 'v1',
      category: 'MARKETING',
      language: 'pt_BR',
      body: '',
      variables: [],
    },
    dom: {},
    wizardDomStep: null,
    eventsBound: false,
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateTime(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch (_e) {
      return '—';
    }
  }

  function campaignCountFor(templateId) {
    return state.campaigns.filter((c) => String(c?.defaultTemplateId || '') === String(templateId)).length;
  }

  function summaryCounts() {
    const counts = { total: 0, DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    state.templates.forEach((item) => {
      counts.total += 1;
      const status = String(item?.status || '').toUpperCase();
      if (status === 'SUBMITTED') counts.PENDING += 1;
      else if (counts[status] != null) counts[status] += 1;
    });
    return counts;
  }

  function composedName() {
    return utils().buildTemplateName(state.wizard.prefix, state.wizard.purpose, state.wizard.version);
  }

  function resetWizard() {
    state.wizard = {
      prefix: utils().deriveTenantPrefix(state.session),
      purpose: '',
      version: 'v1',
      category: 'MARKETING',
      language: 'pt_BR',
      body: '',
      variables: [],
    };
    state.wizardStep = 1;
  }

  function setError(message) {
    state.error = message || '';
    if (state.view === 'wizard') {
      updateWizardErrorBanner();
      return;
    }
    render();
  }

  function syncWizardFieldsFromDom() {
    const root = state.dom.root;
    if (!root || state.view !== 'wizard') return;
    const purposeEl = root.querySelector('#etWizardPurpose');
    const bodyEl = root.querySelector('#etWizardBody');
    const versionEl = root.querySelector('#etWizardVersion');
    const categoryEl = root.querySelector('#etWizardCategory');
    if (purposeEl) state.wizard.purpose = purposeEl.value;
    if (bodyEl) state.wizard.body = bodyEl.value;
    if (versionEl) state.wizard.version = versionEl.value;
    if (categoryEl) state.wizard.category = categoryEl.value;
  }

  function captureFieldFocus() {
    const root = state.dom.root;
    const active = document.activeElement;
    if (!root || !active || !root.contains(active)) return null;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return null;
    return {
      id: active.id,
      start: active.selectionStart,
      end: active.selectionEnd,
    };
  }

  function restoreFieldFocus(snapshot) {
    if (!snapshot?.id) return;
    const el = state.dom.root?.querySelector(`#${snapshot.id}`);
    if (!el) return;
    el.focus();
    if (typeof snapshot.start === 'number' && typeof el.setSelectionRange === 'function') {
      el.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
    }
  }

  function updateWizardErrorBanner() {
    const root = state.dom.root;
    if (!root || state.view !== 'wizard') return;
    const banner = root.querySelector('#etWizardError');
    if (!banner) return;
    if (!state.error) {
      banner.hidden = true;
      banner.textContent = '';
      return;
    }
    banner.hidden = false;
    banner.textContent = state.error;
  }

  function wizardDomIsCurrent() {
    const root = state.dom.root;
    if (!root || state.view !== 'wizard') return false;
    if (state.wizardDomStep !== state.wizardStep) return false;
    if (state.wizardStep === 1) return Boolean(root.querySelector('#etWizardPurpose'));
    if (state.wizardStep === 2) return Boolean(root.querySelector('#etWizardBody'));
    return Boolean(root.querySelector('#etWizardSave'));
  }

  function refreshWizardView(options = {}) {
    const preserveInputs = options.preserveInputs !== false;
    if (preserveInputs && wizardDomIsCurrent()) {
      syncWizardFieldsFromDom();
      updateWizardErrorBanner();
      if (state.wizardStep === 1) patchWizardStep1();
      else if (state.wizardStep === 2) patchWizardStep2();
      else if (state.wizardStep === 3) patchWizardStep3();
      return;
    }

    const focus = captureFieldFocus();
    state.dom.root.innerHTML = renderWizard();
    state.wizardDomStep = state.wizardStep;
    updateWizardErrorBanner();
    bindEvents();
    restoreFieldFocus(focus);
  }

  async function loadAll() {
    const client = api();
    const inWizard = state.view === 'wizard';
    state.loading = true;
    state.error = '';
    if (inWizard) {
      refreshWizardView({ preserveInputs: true });
    } else {
      render();
    }
    try {
      const [templates, campaigns, catalogPayload, meta] = await Promise.all([
        client.listTemplates(state.session),
        client.listCampaigns(state.session),
        client.getVariablesCatalog(state.session),
        client.loadMetaConnections(state.session),
      ]);
      state.templates = templates;
      state.campaigns = campaigns;
      state.catalog = Array.isArray(catalogPayload?.variables) ? catalogPayload.variables : [];
      state.metaWabaId = client.resolveDefaultWabaId(meta);
      state.businessName = client.resolveBusinessName(meta);
    } catch (err) {
      state.error = err?.message || 'Falha ao carregar templates.';
    } finally {
      state.loading = false;
      if (state.view === 'wizard') {
        refreshWizardView({ preserveInputs: true });
      } else {
        render();
      }
    }
  }

  async function openDetail(templateId) {
    state.view = 'detail';
    state.selectedId = templateId;
    state.detail = null;
    state.loading = true;
    render();
    try {
      state.detail = await api().getTemplate(state.session, templateId);
    } catch (err) {
      state.error = err?.message || 'Falha ao carregar template.';
      state.view = 'list';
    } finally {
      state.loading = false;
      render();
    }
  }

  function renderSummaryCards() {
    const counts = summaryCounts();
    return `
      <div class="et-summary-grid">
        <article class="et-summary-card"><span>Total</span><strong>${counts.total}</strong></article>
        <article class="et-summary-card"><span>Draft</span><strong>${counts.DRAFT}</strong></article>
        <article class="et-summary-card"><span>Pendentes</span><strong>${counts.PENDING}</strong></article>
        <article class="et-summary-card" data-tone="ok"><span>Aprovados</span><strong>${counts.APPROVED}</strong></article>
        <article class="et-summary-card" data-tone="danger"><span>Rejeitados</span><strong>${counts.REJECTED}</strong></article>
      </div>`;
  }

  function renderPreviewPanel(body, variables) {
    const message = utils().renderTemplatePreview(body, variables);
    return `
      <aside class="et-preview-panel">
        <h4>Preview WhatsApp</h4>
        <div class="et-wa-preview">
          <div class="et-wa-preview-head">${escapeHtml(state.businessName)}</div>
          <div class="et-wa-preview-bubble">${escapeHtml(message).replace(/\n/g, '<br />')}</div>
        </div>
      </aside>`;
  }

  function renderLintPanel(body, category) {
    const lint = utils().lintTemplateContent(body, category);
    const rows = lint.items.map((item) => `
      <li class="et-lint-item" data-severity="${item.severity}">
        ${item.severity === 'error' ? '❌' : '⚠️'} ${escapeHtml(item.message)}
      </li>`).join('');
    return `
      <div class="et-lint-panel" data-severity="${lint.severity}">
        <h4>Qualidade do texto</h4>
        <p class="et-lint-stats">${lint.stats.chars} / 1024 caracteres · ${lint.stats.placeholders} variáveis</p>
        ${rows ? `<ul class="et-lint-list">${rows}</ul>` : '<p class="et-lint-ok">✅ Pronto para revisão Meta</p>'}
      </div>`;
  }

  function renderList() {
    const rows = state.templates.length
      ? state.templates.map((item) => `
        <tr data-open-template="${escapeHtml(item.id)}">
          <td><button type="button" class="et-link" data-open-template="${escapeHtml(item.id)}">${escapeHtml(item.name || '—')}</button></td>
          <td>${escapeHtml(item.category || '—')}</td>
          <td>${escapeHtml(item.language || '—')}</td>
          <td><span class="et-status-chip" data-tone="${utils().statusTone(item.status)}">${escapeHtml(item.status || '—')}</span></td>
          <td>${escapeHtml(item.metaStatus || '—')}</td>
          <td>${campaignCountFor(item.id)}</td>
          <td>${formatDateTime(item.lastSyncedAt || item.updatedAt)}</td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="et-muted">Nenhum template encontrado.</td></tr>';

    return `
      <header class="et-head">
        <div>
          <h2>Templates WhatsApp</h2>
          <p class="et-lead">Modelos aprovados pela Meta para campanhas de mensagens.</p>
        </div>
        ${state.canMutate ? '<button type="button" class="et-btn et-btn--primary" id="etNewTemplate">+ Novo template</button>' : ''}
      </header>
      ${state.error ? `<p class="et-error">${escapeHtml(state.error)}</p>` : ''}
      ${state.loading ? '<p class="et-muted">Carregando…</p>' : ''}
      ${renderSummaryCards()}
      <div class="et-table-wrap">
        <table class="et-table">
          <thead>
            <tr>
              <th>Nome</th><th>Categoria</th><th>Idioma</th><th>Status</th>
              <th>Meta</th><th>Campanhas</th><th>Último sync</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${!state.canMutate ? '<p class="et-muted">Somente leitura — contacte um administrador para criar templates.</p>' : ''}`;
  }

  function renderWizardStep1() {
    const name = composedName();
    const slug = utils().slugifyTemplateName(name);
    const duplicate = state.templates.some((t) => String(t.name || '').toLowerCase() === name.toLowerCase());
    const valid = name && /_v\d+$/i.test(name) && !duplicate;
    return `
      <section class="et-wizard-step">
        <h3>1 — Identidade do template</h3>
        <p class="et-help">O prefixo é o nome do tenant (${escapeHtml(state.wizard.prefix)}). O nome na Meta usa minúsculas e underscores. Termine sempre com _v1, _v2, etc.</p>
        <div class="et-form-grid">
          <label><span>Prefixo</span><input id="etWizardPrefix" value="${escapeHtml(state.wizard.prefix)}" readonly /></label>
          <label><span>Finalidade</span><input id="etWizardPurpose" value="${escapeHtml(state.wizard.purpose)}" placeholder="reativacao_lead" /></label>
          <label><span>Versão</span>
            <select id="etWizardVersion">
              ${['v1', 'v2', 'v3', 'v4'].map((v) => `<option value="${v}"${state.wizard.version === v ? ' selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="et-name-preview">
          <div><span>Nome na Meta</span><strong data-et-meta-name>${escapeHtml(name || '—')}</strong></div>
          <div><span>Slug interno</span><code data-et-meta-slug>${escapeHtml(slug || '—')}</code></div>
        </div>
        <p class="et-error" id="etWizardDuplicateError" ${duplicate ? '' : 'hidden'}>Já existe um template com este nome.</p>
        <div class="et-wizard-actions">
          <button type="button" class="et-btn" id="etWizardCancel">Cancelar</button>
          <button type="button" class="et-btn et-btn--primary" id="etWizardNext1" ${valid ? '' : 'disabled'}>Seguinte</button>
        </div>
      </section>`;
  }

  function renderWizardStep2() {
    const lint = utils().lintTemplateContent(state.wizard.body, state.wizard.category);
    const chips = QUICK_INSERT.map((item) => `
      <button type="button" class="et-chip-btn" data-insert-var="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>`).join('');
    return `
      <div class="et-wizard-grid">
        <section class="et-wizard-step">
          <h3>2 — Mensagem</h3>
          <div class="et-form-grid">
            <label><span>Categoria</span>
              <select id="etWizardCategory">
                ${['MARKETING', 'UTILITY', 'AUTHENTICATION'].map((c) => `<option value="${c}"${state.wizard.category === c ? ' selected' : ''}>${c}</option>`).join('')}
              </select>
            </label>
            <label><span>Idioma</span>
              <select id="etWizardLanguage"><option value="pt_BR" selected>pt_BR</option></select>
            </label>
          </div>
          <label class="et-field-block"><span>Corpo</span>
            <textarea id="etWizardBody" rows="8" placeholder="Olá {{1}}, …">${escapeHtml(state.wizard.body)}</textarea>
          </label>
          <div class="et-insert-bar"><span>Inserir variável:</span>${chips}</div>
          ${renderLintPanel(state.wizard.body, state.wizard.category)}
          <div class="et-wizard-actions">
            <button type="button" class="et-btn" id="etWizardBack2">Voltar</button>
            <button type="button" class="et-btn et-btn--primary" id="etWizardNext2" ${lint.hasErrors ? 'disabled' : ''}>Seguinte</button>
          </div>
        </section>
        ${renderPreviewPanel(state.wizard.body, state.wizard.variables)}
      </div>`;
  }

  function buildWizardChecklist() {
    const variables = utils().syncVariablesFromBody(state.wizard.body, state.wizard.variables);
    const lint = utils().lintTemplateContent(state.wizard.body, state.wizard.category);
    const body = String(state.wizard.body || '').trim();
    const hasName = Boolean(composedName() && /_v\d+$/i.test(composedName()));
    const hasCategory = Boolean(String(state.wizard.category || '').trim());
    const hasPlaceholders = variables.length > 0;
    const placeholdersOk = hasPlaceholders
      ? variables.every((v) => String(v.name || '').trim())
      : body.length > 0;
    const samplesOk = hasPlaceholders
      ? variables.every((v) => String(v.sample || '').trim())
      : true;
    const lintOk = !lint.hasErrors;

    return {
      variables,
      items: [
        { label: 'Nome com sufixo _vN', ok: hasName },
        { label: 'Categoria definida', ok: hasCategory },
        { label: hasPlaceholders ? 'Placeholders mapeados' : 'Corpo da mensagem', ok: placeholdersOk },
        { label: 'Exemplos preenchidos', ok: samplesOk },
        { label: 'Linter sem erros', ok: lintOk },
      ],
      canSave: hasName && hasCategory && placeholdersOk && samplesOk && lintOk,
    };
  }

  function renderWizardStep3() {
    const checklistState = buildWizardChecklist();
    const variables = checklistState.variables;
    state.wizard.variables = variables;
    const catalogKeys = new Set(state.catalog.map((entry) => entry.key));
    const rows = variables.map((variable) => {
      const optionRows = state.catalog.map((entry) => {
        const selected = entry.key === variable.name ? ' selected' : '';
        return `<option value="${escapeHtml(entry.key)}"${selected}>${escapeHtml(entry.label || entry.key)}</option>`;
      }).join('');
      const extraOption = !catalogKeys.has(variable.name) && variable.name
        ? `<option value="${escapeHtml(variable.name)}" selected>${escapeHtml(variable.name)}</option>`
        : '';
      return `
      <div class="et-var-row">
        <span class="et-var-placeholder">{{${variable.index}}}</span>
        <select data-var-index="${variable.index}" class="et-var-select">
          ${optionRows}${extraOption}
        </select>
        <input type="text" data-var-sample="${variable.index}" value="${escapeHtml(variable.sample || '')}" placeholder="Exemplo Meta" />
      </div>`;
    }).join('');

    const checklistItems = checklistState.items.map((item) => `
            <li data-ok="${item.ok ? 'true' : 'false'}">${escapeHtml(item.label)}</li>`).join('');

    return `
      <div class="et-wizard-grid">
        <section class="et-wizard-step">
          <h3>3 — Variáveis e revisão</h3>
          <div class="et-var-list">${rows || '<p class="et-muted">Nenhum placeholder no corpo — template estático.</p>'}</div>
          <ul class="et-checklist">${checklistItems}</ul>
          <div class="et-wizard-actions">
            <button type="button" class="et-btn" id="etWizardBack3">Voltar</button>
            <button type="button" class="et-btn et-btn--primary" id="etWizardSave" ${checklistState.canSave ? '' : 'disabled'}>Salvar draft</button>
          </div>
        </section>
        ${renderPreviewPanel(state.wizard.body, variables)}
      </div>`;
  }

  function renderWizard() {
    const stepper = [1, 2, 3].map((step) => `
      <span class="et-step${state.wizardStep === step ? ' is-active' : ''}">${step}</span>`).join('');
    let body = '';
    if (state.wizardStep === 1) body = renderWizardStep1();
    else if (state.wizardStep === 2) body = renderWizardStep2();
    else body = renderWizardStep3();

    return `
      <header class="et-head">
        <div>
          <h2>Novo template</h2>
          <div class="et-stepper">${stepper}</div>
        </div>
      </header>
      <p class="et-error" id="etWizardError" ${state.error ? '' : 'hidden'}>${escapeHtml(state.error)}</p>
      ${body}`;
  }

  function renderDetail() {
    const item = state.detail;
    if (!item) return '<p class="et-muted">Carregando detalhe…</p>';
    const editable = state.canMutate && utils().isEditableStatus(item.status);
    const rejected = String(item.status || '').toUpperCase() === 'REJECTED';
    const preview = utils().renderTemplatePreview(item.body, item.variables);

    return `
      <header class="et-head">
        <div>
          <button type="button" class="et-btn" id="etBackList">← Templates</button>
          <h2>${escapeHtml(item.name || 'Template')}</h2>
          <p class="et-lead">
            <span class="et-status-chip" data-tone="${utils().statusTone(item.status)}">${escapeHtml(item.status)}</span>
            · Meta: ${escapeHtml(item.metaStatus || '—')}
          </p>
        </div>
        <div class="et-head-actions">
          ${state.canMutate ? `
            ${editable ? '<button type="button" class="et-btn" id="etSaveDetail">Salvar draft</button>' : ''}
            ${editable ? '<button type="button" class="et-btn et-btn--primary" id="etSubmitDetail">Submit Meta</button>' : ''}
            <button type="button" class="et-btn" id="etSyncDetail">Sync status</button>
            <button type="button" class="et-btn" id="etDuplicateDetail">Duplicar</button>
            <button type="button" class="et-btn" id="etArchiveDetail">Arquivar</button>
          ` : ''}
        </div>
      </header>
      ${rejected ? `
        <div class="et-reject-banner">
          <strong>Rejeitado pela Meta</strong>
          <p>${escapeHtml(item.rejectionDescription || item.rejectionReason || item.rejectionCategory || 'Sem detalhe')}</p>
        </div>` : ''}
      <div class="et-detail-grid">
        <section class="et-detail-form">
          <label class="et-field-block"><span>Categoria</span>
            <input value="${escapeHtml(item.category || '')}" ${editable ? 'id="etDetailCategory"' : 'readonly'} />
          </label>
          <label class="et-field-block"><span>Corpo</span>
            <textarea rows="10" ${editable ? 'id="etDetailBody"' : 'readonly'}>${escapeHtml(item.body || '')}</textarea>
          </label>
          ${renderLintPanel(item.body || '', item.category)}
        </section>
        ${renderPreviewPanel(item.body, item.variables)}
      </div>
      <pre class="et-preview-text">${escapeHtml(preview)}</pre>`;
  }

  function render() {
    if (!state.dom.root) return;
    if (state.view === 'wizard') {
      refreshWizardView({ preserveInputs: false });
      return;
    }
    state.wizardDomStep = null;
    if (state.view === 'detail') state.dom.root.innerHTML = renderDetail();
    else state.dom.root.innerHTML = renderList();
    bindEvents();
  }

  function patchWizardStep1() {
    const root = state.dom.root;
    if (!root || state.view !== 'wizard' || state.wizardStep !== 1) return;

    const name = composedName();
    const slug = utils().slugifyTemplateName(name);
    const duplicate = state.templates.some((t) => String(t.name || '').toLowerCase() === name.toLowerCase());
    const valid = name && /_v\d+$/i.test(name) && !duplicate;

    root.querySelector('[data-et-meta-name]')?.replaceChildren(document.createTextNode(name || '—'));
    root.querySelector('[data-et-meta-slug]')?.replaceChildren(document.createTextNode(slug || '—'));

    const dupErr = root.querySelector('#etWizardDuplicateError');
    if (dupErr) dupErr.hidden = !duplicate;

    const nextBtn = root.querySelector('#etWizardNext1');
    if (nextBtn) nextBtn.disabled = !valid;
  }

  function patchWizardStep2() {
    const root = state.dom.root;
    if (!root || state.view !== 'wizard' || state.wizardStep !== 2) return;

    const lint = utils().lintTemplateContent(state.wizard.body, state.wizard.category);
    const lintHost = root.querySelector('.et-wizard-grid .et-lint-panel, .et-wizard-step .et-lint-panel');
    if (lintHost) {
      const fresh = renderLintPanel(state.wizard.body, state.wizard.category);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fresh;
      lintHost.replaceWith(wrapper.firstElementChild);
    }

    const previewHost = root.querySelector('.et-preview-panel');
    if (previewHost) {
      const fresh = renderPreviewPanel(state.wizard.body, state.wizard.variables);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fresh;
      previewHost.replaceWith(wrapper.firstElementChild);
    }

    const nextBtn = root.querySelector('#etWizardNext2');
    if (nextBtn) nextBtn.disabled = lint.hasErrors;
  }

  function patchWizardStep3() {
    const root = state.dom.root;
    if (!root || state.view !== 'wizard' || state.wizardStep !== 3) return;

    readWizardVariablesFromDom();
    const checklistState = buildWizardChecklist();
    state.wizard.variables = checklistState.variables;

    const list = root.querySelector('.et-checklist');
    if (list) {
      list.innerHTML = checklistState.items.map((item) => `
        <li data-ok="${item.ok ? 'true' : 'false'}">${escapeHtml(item.label)}</li>`).join('');
    }

    const previewHost = root.querySelector('.et-preview-panel');
    if (previewHost) {
      const fresh = renderPreviewPanel(state.wizard.body, checklistState.variables);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fresh;
      previewHost.replaceWith(wrapper.firstElementChild);
    }

    const saveBtn = root.querySelector('#etWizardSave');
    if (saveBtn) saveBtn.disabled = !checklistState.canSave;
  }

  function readWizardVariablesFromDom() {
    const variables = utils().syncVariablesFromBody(state.wizard.body, state.wizard.variables);
    variables.forEach((variable) => {
      const select = state.dom.root?.querySelector(`[data-var-index="${variable.index}"]`);
      const sample = state.dom.root?.querySelector(`[data-var-sample="${variable.index}"]`);
      if (select?.value) variable.name = select.value;
      if (sample) variable.sample = sample.value.trim();
    });
    state.wizard.variables = variables;
  }

  async function ensureMetaWabaId() {
    if (state.metaWabaId) return state.metaWabaId;
    const meta = await api().loadMetaConnections(state.session);
    state.metaWabaId = api().resolveDefaultWabaId(meta);
    return state.metaWabaId;
  }

  async function saveWizard() {
    if (!state.canMutate) return;
    syncWizardFieldsFromDom();
    readWizardVariablesFromDom();
    const checklistState = buildWizardChecklist();
    if (!checklistState.canSave) {
      setError('Complete a checklist antes de salvar o draft.');
      patchWizardStep3();
      return;
    }

    state.saving = true;
    setError('');
    try {
      const metaWabaId = await ensureMetaWabaId();
      if (!metaWabaId) {
        setError('Configure Meta connections antes de salvar o draft.');
        return;
      }
      const payload = {
        metaWabaId,
        name: composedName(),
        category: state.wizard.category,
        language: state.wizard.language,
        body: state.wizard.body,
        variables: state.wizard.variables,
      };
      const created = await api().createTemplate(state.session, payload);
      state.view = 'detail';
      state.selectedId = created?.id || '';
      await loadAll();
      if (state.selectedId) await openDetail(state.selectedId);
      else state.view = 'list';
    } catch (err) {
      setError(err?.message || 'Falha ao criar template.');
    } finally {
      state.saving = false;
    }
  }

  async function saveDetail() {
    if (!state.canMutate || !state.selectedId || !state.detail) return;
    const category = state.dom.root?.querySelector('#etDetailCategory')?.value?.trim();
    const body = state.dom.root?.querySelector('#etDetailBody')?.value ?? '';
    const variables = utils().syncVariablesFromBody(body, state.detail.variables || []);
    state.saving = true;
    setError('');
    try {
      await api().updateTemplate(state.session, state.selectedId, {
        category: category || state.detail.category,
        body,
        variables,
      });
      await loadAll();
      await openDetail(state.selectedId);
    } catch (err) {
      setError(err?.message || 'Falha ao salvar template.');
    } finally {
      state.saving = false;
    }
  }

  async function runMutation(fn) {
    state.saving = true;
    setError('');
    try {
      await fn();
      await loadAll();
      if (state.selectedId) await openDetail(state.selectedId);
    } catch (err) {
      setError(err?.message || 'Operação falhou.');
    } finally {
      state.saving = false;
    }
  }

  function bindDelegatedEvents() {
    const root = state.dom.root;
    if (!root || state.eventsBound) return;
    state.eventsBound = true;

    root.addEventListener('input', (event) => {
      if (state.view !== 'wizard') return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      if (target.id === 'etWizardPurpose') {
        state.wizard.purpose = target.value;
        patchWizardStep1();
        return;
      }
      if (target.id === 'etWizardBody') {
        state.wizard.body = target.value;
        state.wizard.variables = utils().syncVariablesFromBody(state.wizard.body, state.wizard.variables);
        patchWizardStep2();
      }
    });

    root.addEventListener('change', (event) => {
      if (state.view !== 'wizard') return;
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === 'etWizardVersion') {
        state.wizard.version = target.value;
        patchWizardStep1();
        return;
      }
      if (target.id === 'etWizardCategory') {
        state.wizard.category = target.value;
        patchWizardStep2();
      }
    });
  }

  function bindEvents() {
    const root = state.dom.root;
    if (!root) return;
    bindDelegatedEvents();

    root.querySelector('#etNewTemplate')?.addEventListener('click', () => {
      resetWizard();
      state.wizard.prefix = utils().deriveTenantPrefix(state.session);
      state.view = 'wizard';
      state.wizardDomStep = null;
      state.error = '';
      refreshWizardView({ preserveInputs: false });
    });

    root.querySelectorAll('[data-open-template]').forEach((el) => {
      el.addEventListener('click', () => openDetail(el.getAttribute('data-open-template')));
    });

    root.querySelector('#etWizardCancel')?.addEventListener('click', () => {
      state.view = 'list';
      render();
    });

    root.querySelector('#etWizardNext1')?.addEventListener('click', () => {
      syncWizardFieldsFromDom();
      state.wizardStep = 2;
      state.wizardDomStep = null;
      refreshWizardView({ preserveInputs: false });
    });

    root.querySelector('#etWizardBack2')?.addEventListener('click', () => {
      state.wizardStep = 1;
      state.wizardDomStep = null;
      refreshWizardView({ preserveInputs: false });
    });

    root.querySelectorAll('[data-insert-var]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-insert-var');
        const textarea = root.querySelector('#etWizardBody');
        const body = textarea ? textarea.value : state.wizard.body;
        const indices = utils().extractPlaceholderIndices(body);
        const next = indices.length ? Math.max(...indices) + 1 : 1;
        const token = `{{${next}}}`;

        if (textarea) {
          const start = textarea.selectionStart ?? body.length;
          const end = textarea.selectionEnd ?? start;
          state.wizard.body = `${body.slice(0, start)}${token}${body.slice(end)}`;
          textarea.value = state.wizard.body;
          const cursor = start + token.length;
          textarea.setSelectionRange(cursor, cursor);
          textarea.focus();
        } else {
          state.wizard.body = `${body}${token}`;
        }

        state.wizard.variables = utils().syncVariablesFromBody(state.wizard.body, state.wizard.variables);
        const synced = state.wizard.variables.find((v) => v.index === next);
        if (synced) synced.name = key;
        patchWizardStep2();
      });
    });

    root.querySelector('#etWizardNext2')?.addEventListener('click', () => {
      syncWizardFieldsFromDom();
      state.wizardStep = 3;
      state.wizard.variables = utils().syncVariablesFromBody(state.wizard.body, state.wizard.variables);
      state.wizardDomStep = null;
      refreshWizardView({ preserveInputs: false });
    });

    root.querySelector('#etWizardBack3')?.addEventListener('click', () => {
      state.wizardStep = 2;
      state.wizardDomStep = null;
      refreshWizardView({ preserveInputs: false });
    });

    root.querySelectorAll('.et-var-select, [data-var-sample]').forEach((el) => {
      el.addEventListener('change', () => patchWizardStep3());
      el.addEventListener('input', () => patchWizardStep3());
    });

    root.querySelector('#etWizardSave')?.addEventListener('click', () => void saveWizard());

    root.querySelector('#etBackList')?.addEventListener('click', () => {
      state.view = 'list';
      state.selectedId = '';
      state.detail = null;
      render();
    });

    root.querySelector('#etSaveDetail')?.addEventListener('click', () => {
      if (!state.selectedId || !state.detail) return;
      void saveDetail();
    });

    root.querySelector('#etSubmitDetail')?.addEventListener('click', () => {
      if (!state.selectedId) return;
      void runMutation(() => api().submitTemplate(state.session, state.selectedId));
    });

    root.querySelector('#etSyncDetail')?.addEventListener('click', () => {
      if (!state.selectedId) return;
      void runMutation(() => api().syncTemplate(state.session, state.selectedId));
    });

    root.querySelector('#etDuplicateDetail')?.addEventListener('click', () => {
      if (!state.selectedId) return;
      void runMutation(async () => {
        const copy = await api().duplicateTemplate(state.session, state.selectedId);
        state.selectedId = copy?.id || state.selectedId;
      });
    });

    root.querySelector('#etArchiveDetail')?.addEventListener('click', () => {
      if (!state.selectedId) return;
      void runMutation(async () => {
        await api().archiveTemplate(state.session, state.selectedId);
        state.view = 'list';
        state.selectedId = '';
      });
    });
  }

  function mount() {
    state.dom.root = document.getElementById('engageTemplatesRoot');
    if (!state.dom.root) return false;
    bindDelegatedEvents();
    return true;
  }

  async function activate(session) {
    if (!mount()) return;
    state.active = true;
    state.session = session || state.session;
    if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
      try {
        state.session = await window.ReservaPermissions.enrichSessionWithOperatorMe(state.session);
      } catch (_err) {
        /* segue com sessão actual */
      }
    }
    state.canMutate = api().canMutateTemplates(state.session);
    state.view = 'list';
    resetWizard();
    void loadAll();
  }

  function deactivate() {
    state.active = false;
  }

  window.EngageTemplatesAdmin = { activate, deactivate };
})();
