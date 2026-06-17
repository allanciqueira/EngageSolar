/**
 * Engage Config — Templates WhatsApp (lista + wizard + detalhe).
 */
(function () {
  const api = () => window.EngageTemplatesApi;
  const utils = () => window.EngageTemplatesUtils;
  const mediaApi = () => window.EngageMediaLibraryApi;

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
    submittingMeta: false,
    successMessage: '',
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
      headerType: 'NONE',
      headerText: '',
      footer: '',
      buttons: [],
    },
    sampleMediaAssetId: '',
    sampleMediaAssets: [],
    sampleMediaAssetsLoading: false,
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

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
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

  const COMPONENTS_CACHE_KEY = 'engage.templateComponents.v1';

  function writeComponentsCache(templateId, components) {
    if (!templateId || !components) return;
    try {
      const raw = sessionStorage.getItem(COMPONENTS_CACHE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[templateId] = {
        headerType: utils().normalizeHeaderType(components.headerType),
        headerText: String(components.headerText || ''),
        footer: String(components.footer || ''),
        buttons: Array.isArray(components.buttons) ? components.buttons : [],
        updatedAt: Date.now(),
      };
      sessionStorage.setItem(COMPONENTS_CACHE_KEY, JSON.stringify(map));
    } catch (_err) {
      /* ignore */
    }
  }

  function readComponentsCache(templateId) {
    if (!templateId) return null;
    try {
      const raw = sessionStorage.getItem(COMPONENTS_CACHE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      const entry = map[templateId];
      if (!entry) return null;
      return {
        headerType: utils().normalizeHeaderType(entry.headerType),
        headerText: String(entry.headerText || ''),
        footer: String(entry.footer || ''),
        buttons: Array.isArray(entry.buttons) ? entry.buttons : [],
      };
    } catch (_err) {
      return null;
    }
  }

  function mergeComponentsWithFallback(primary, fallback) {
    const base = primary || utils().emptyComponents();
    const alt = fallback || utils().emptyComponents();
    return {
      headerType: base.headerType !== 'NONE' ? base.headerType : (alt.headerType || 'NONE'),
      headerText: base.headerText || alt.headerText || '',
      footer: base.footer || alt.footer || '',
      buttons: base.buttons?.length ? base.buttons : (alt.buttons || []),
    };
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
      headerType: 'NONE',
      headerText: '',
      footer: '',
      buttons: [],
    };
    state.wizardStep = 1;
    state.sampleMediaAssetId = '';
    state.sampleMediaAssets = [];
  }

  async function enterWizardStep(step) {
    if (step === 2) {
      syncWizardFieldsFromDom();
      await loadSampleMediaAssets(state.wizard.headerType);
    }
    state.wizardStep = step;
    state.wizardDomStep = null;
    refreshWizardView({ preserveInputs: false });
  }

  function wizardComponents() {
    return {
      headerType: state.wizard.headerType,
      headerText: state.wizard.headerText,
      footer: state.wizard.footer,
      buttons: state.wizard.buttons,
    };
  }

  function detailComponentsState(item) {
    const parsed = utils().resolveTemplateComponents(item || state.detail || {});
    return {
      headerType: item?._headerType ?? parsed.headerType,
      headerText: item?._headerText ?? parsed.headerText,
      footer: item?._footer ?? parsed.footer,
      buttons: item?._buttons ?? parsed.buttons,
    };
  }

  function wizardLintState() {
    const components = wizardComponents();
    const lint = utils().lintTemplateContent(state.wizard.body, state.wizard.category);
    const compLint = utils().lintTemplateComponents(
      components.footer,
      components.buttons,
      components.headerType,
      components.headerText,
    );
    return {
      lint,
      compLint,
      hasErrors: lint.hasErrors || compLint.hasErrors,
    };
  }

  function detailComponents(item) {
    return utils().resolveTemplateComponents(item || state.detail || {});
  }

  function readDetailComponentsFromState() {
    syncComponentsFromDom('etDetail');
    return utils().readComponentsFromState(
      state.detail?._footer,
      state.detail?._buttons,
      state.detail?._headerType,
      state.detail?._headerText,
    );
  }

  function readWizardComponentsFromState() {
    syncComponentsFromDom('etWizard');
    return utils().readComponentsFromState(
      state.wizard.footer,
      state.wizard.buttons,
      state.wizard.headerType,
      state.wizard.headerText,
    );
  }

  function mergeTemplateComponents(fromItem, fromPreview) {
    const item = fromItem || utils().emptyComponents();
    const preview = fromPreview || utils().emptyComponents();
    return {
      headerType: item.headerType !== 'NONE' ? item.headerType : preview.headerType,
      headerText: item.headerText || preview.headerText,
      footer: item.footer || preview.footer,
      buttons: item.buttons?.length ? item.buttons : preview.buttons,
    };
  }

  function readButtonsFromDom(prefix) {
    const root = state.dom.root;
    if (!root) return [];
    return [...root.querySelectorAll(`[data-et-btn-card="${prefix}"]`)].map((card) => {
      const type = card.dataset.btnType || 'QUICK_REPLY';
      const text = card.querySelector('[data-btn-text]')?.value?.trim() || '';
      const url = card.querySelector('[data-btn-url]')?.value?.trim() || '';
      const phoneNumber = card.querySelector('[data-btn-phone]')?.value?.trim() || '';
      return { type, text, url, phoneNumber };
    });
  }

  function syncComponentsFromDom(prefix) {
    const root = state.dom.root;
    if (!root) return;
    const headerTypeEl = root.querySelector(`input[name="${prefix}HeaderType"]:checked`);
    const headerTextEl = root.querySelector(`#${prefix}HeaderText`);
    const footerEl = root.querySelector(`#${prefix}Footer`);
    if (headerTypeEl) {
      const headerType = utils().normalizeHeaderType(headerTypeEl.value);
      if (prefix === 'etWizard') state.wizard.headerType = headerType;
      else if (state.detail) state.detail._headerType = headerType;
    }
    if (headerTextEl) {
      const headerText = headerTextEl.value ?? '';
      if (prefix === 'etWizard') state.wizard.headerText = headerText;
      else if (state.detail) state.detail._headerText = headerText;
    }
    if (footerEl) {
      const footer = footerEl.value ?? '';
      if (prefix === 'etWizard') state.wizard.footer = footer;
      else if (state.detail) state.detail._footer = footer;
    }
    const buttonList = root.querySelector(`#${prefix}ButtonList`);
    if (buttonList) {
      const buttons = readButtonsFromDom(prefix);
      if (prefix === 'etWizard') state.wizard.buttons = buttons;
      else if (state.detail) state.detail._buttons = buttons;
    }
  }

  function resolveSampleAssetForPreview() {
    if (!state.sampleMediaAssetId) return null;
    return state.sampleMediaAssets.find((row) => String(row?.id || '') === state.sampleMediaAssetId) || null;
  }

  async function loadSampleMediaAssets(headerType) {
    if (!utils().headerTypeRequiresMediaAsset(headerType)) {
      state.sampleMediaAssets = [];
      state.sampleMediaAssetId = '';
      return;
    }
    const client = mediaApi();
    if (!client?.listMediaAssets) {
      state.sampleMediaAssets = [];
      return;
    }
    state.sampleMediaAssetsLoading = true;
    try {
      const type = utils().mediaAssetTypeForHeader(headerType);
      const result = await client.listMediaAssets(state.session, { type });
      state.sampleMediaAssets = result?.items || [];
      if (state.sampleMediaAssetId) {
        const stillValid = state.sampleMediaAssets.some((row) => String(row?.id) === state.sampleMediaAssetId);
        if (!stillValid) state.sampleMediaAssetId = '';
      }
    } catch (_err) {
      state.sampleMediaAssets = [];
    } finally {
      state.sampleMediaAssetsLoading = false;
    }
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
    if (state.wizardStep === 2) syncComponentsFromDom('etWizard');
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
    if (state.wizardStep === 2) {
      return Boolean(root.querySelector('#etWizardBody') && root.querySelector(`input[name="etWizardHeaderType"]`));
    }
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

  async function ensureComponentsPersisted(templateId, components, meta = {}) {
    const normalized = utils().readComponentsFromState(
      components?.footer,
      components?.buttons,
      components?.headerType,
      components?.headerText,
    );
    if (!templateId) return null;
    writeComponentsCache(templateId, normalized);

    const hasComponents = Boolean(
      normalized.footer
      || normalized.buttons.length
      || normalized.headerType !== 'NONE',
    );
    if (!hasComponents) return null;

    let item = null;
    try {
      item = await api().getTemplate(state.session, templateId);
    } catch (_err) {
      item = null;
    }
    const fromApi = utils().resolveTemplateComponents(item);
    const needsPatch = (!fromApi.footer && normalized.footer)
      || (!fromApi.buttons?.length && normalized.buttons.length)
      || (fromApi.headerType === 'NONE' && normalized.headerType !== 'NONE');
    if (!needsPatch) return item;

    const patch = {
      category: meta.category || item?.category || state.detail?.category || state.wizard.category,
      body: meta.body || item?.body || state.detail?.body || state.wizard.body,
      variables: meta.variables || item?.variables || state.detail?.variables || state.wizard.variables,
    };
    utils().attachTemplateComponentsToPayload(
      patch,
      normalized.footer,
      normalized.buttons,
      patch.body,
      normalized.headerType,
      normalized.headerText,
    );
    return api().updateTemplate(state.session, templateId, patch);
  }

  async function openDetail(templateId, options = {}) {
    state.view = 'detail';
    state.selectedId = templateId;
    state.detail = null;
    state.sampleMediaAssetId = '';
    state.sampleMediaAssets = [];
    state.loading = true;
    render();
    try {
      const [item, previewPayload] = await Promise.all([
        api().getTemplate(state.session, templateId),
        api().getPreview(state.session, templateId).catch(() => null),
      ]);
      let parsed = mergeTemplateComponents(
        utils().resolveTemplateComponents(item),
        utils().resolveTemplateComponents(previewPayload),
      );
      if (options.patchResponse) {
        parsed = mergeTemplateComponents(parsed, utils().resolveTemplateComponents(options.patchResponse));
      }
      parsed = mergeComponentsWithFallback(parsed, readComponentsCache(templateId));
      if (options.preserveComponents) {
        parsed = mergeComponentsWithFallback(parsed, options.preserveComponents);
      }
      state.detail = {
        ...item,
        _headerType: parsed.headerType,
        _headerText: parsed.headerText,
        _footer: parsed.footer,
        _buttons: parsed.buttons,
      };
      await loadSampleMediaAssets(parsed.headerType);
    } catch (err) {
      state.error = err?.message || 'Falha ao carregar template.';
      state.view = 'list';
    } finally {
      state.loading = false;
      render();
    }
  }

  function rerenderButtonList(prefix, buttons, editable) {
    const list = state.dom.root?.querySelector(`#${prefix}ButtonList`);
    if (!list) return;
    list.innerHTML = buttons.length
      ? buttons.map((btn, index) => renderButtonCard(btn, index, prefix, editable)).join('')
      : '<p class="et-muted">Nenhum botão — escolha Quick Reply, URL ou Telefone acima.</p>';
    refreshButtonTypePicker(prefix, buttons, editable);
  }

  function refreshButtonTypePicker(prefix, buttons, editable) {
    const list = state.dom.root?.querySelector(`#${prefix}ButtonList`);
    if (!list) return;
    const block = list.closest('.et-components-block');
    if (!block) return;
    const existing = block.querySelector('.et-btn-type-row');
    const freshHtml = renderButtonTypePicker(prefix, buttons, editable);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = freshHtml;
    const newRow = wrapper.firstElementChild;
    if (!newRow) {
      existing?.remove();
      return;
    }
    if (existing) existing.replaceWith(newRow);
    else list.parentElement?.insertBefore(newRow, list);
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

  function renderPreviewHeaderHtml(preview) {
    const type = utils().normalizeHeaderType(preview.headerType);
    if (type === 'TEXT' && preview.headerText) {
      return `<div class="et-wa-preview-header-text">${escapeHtml(preview.headerText)}</div>`;
    }
    if (type === 'IMAGE') {
      if (preview.headerMediaUrl) {
        return `<div class="et-wa-preview-header-media"><img src="${escapeAttr(preview.headerMediaUrl)}" alt="Amostra" /></div>`;
      }
      return '<div class="et-wa-preview-header-media is-placeholder"><span>Imagem (campanha)</span></div>';
    }
    if (type === 'VIDEO') {
      if (preview.headerMediaUrl) {
        return `<div class="et-wa-preview-header-media is-video"><video src="${escapeAttr(preview.headerMediaUrl)}" muted playsinline></video></div>`;
      }
      return '<div class="et-wa-preview-header-media is-placeholder"><span>Vídeo (campanha)</span></div>';
    }
    if (type === 'DOCUMENT') {
      const name = preview.headerMediaName || 'documento.pdf';
      return `<div class="et-wa-preview-header-doc"><span aria-hidden="true">📄</span><span>${escapeHtml(name)}</span></div>`;
    }
    return '';
  }

  function previewTabClass(headerType, tabKey) {
    const type = utils().normalizeHeaderType(headerType);
    const activeKey = type === 'NONE' || type === 'TEXT' ? 'TEXT'
      : type === 'IMAGE' ? 'IMAGE'
        : type === 'VIDEO' ? 'VIDEO'
          : type === 'DOCUMENT' ? 'DOCUMENT' : 'TEXT';
    return tabKey === activeKey ? ' is-active' : '';
  }

  function renderPreviewPanel(body, variables, components) {
    const sampleAsset = resolveSampleAssetForPreview();
    const preview = utils().renderWhatsAppPreview(body, variables, components, { sampleAsset });
    const timeLabel = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const headerHtml = renderPreviewHeaderHtml(preview);
    const footerHtml = preview.footer
      ? `<div class="et-wa-preview-footer">${escapeHtml(preview.footer)}</div>`
      : '';
    const buttonsHtml = preview.buttons.length
      ? `<div class="et-wa-preview-buttons">${preview.buttons.map((btn) => {
        const type = String(btn.type || '').toUpperCase();
        const icon = type === 'URL' ? '↗' : (type === 'PHONE_NUMBER' ? '☎' : '↩');
        return `<span class="et-wa-preview-btn" data-type="${escapeHtml(type)}">${icon} ${escapeHtml(btn.text)}</span>`;
      }).join('')}</div>`
      : '';
    const headerType = preview.headerType || 'NONE';
    return `
      <aside class="et-preview-panel">
        <h4>Preview WhatsApp</h4>
        <div class="et-wa-preview-tabs" role="tablist" aria-label="Tipo de conteúdo">
          <span class="et-wa-preview-tab${previewTabClass(headerType, 'TEXT')}">Texto</span>
          <span class="et-wa-preview-tab${previewTabClass(headerType, 'IMAGE')}">Imagem</span>
          <span class="et-wa-preview-tab${previewTabClass(headerType, 'DOCUMENT')}">Documento</span>
          <span class="et-wa-preview-tab${previewTabClass(headerType, 'VIDEO')}">Vídeo</span>
        </div>
        <div class="et-wa-preview">
          <div class="et-wa-preview-head">${escapeHtml(state.businessName)}</div>
          <div class="et-wa-preview-card">
            <div class="et-wa-preview-bubble">
              ${headerHtml}
              <p>${escapeHtml(preview.message).replace(/\n/g, '<br />')}</p>
              ${footerHtml}
              <small class="et-wa-preview-time">${timeLabel}</small>
            </div>
            ${buttonsHtml}
          </div>
        </div>
      </aside>`;
  }

  function renderLintItems(items) {
    if (!items?.length) return '<p class="et-lint-ok">✅ Pronto para revisão Meta</p>';
    return `<ul class="et-lint-list">${items.map((item) => `
      <li class="et-lint-item" data-severity="${item.severity}">
        ${item.severity === 'error' ? '❌' : '⚠️'} ${escapeHtml(item.message)}
      </li>`).join('')}</ul>`;
  }

  function renderLintPanel(body, category, components) {
    const lint = utils().lintTemplateContent(body, category);
    const compLint = utils().lintTemplateComponents(
      components?.footer,
      components?.buttons,
      components?.headerType,
      components?.headerText,
    );
    const allItems = [...lint.items, ...compLint.items];
    const severity = allItems.some((i) => i.severity === 'error')
      ? 'error'
      : (allItems.some((i) => i.severity === 'warning') ? 'warning' : 'ok');
    return `
      <div class="et-lint-panel" data-severity="${severity}">
        <h4>Qualidade do texto</h4>
        <p class="et-lint-stats">${lint.stats.chars} / 1024 caracteres · ${lint.stats.placeholders} variáveis</p>
        ${renderLintItems(allItems)}
      </div>`;
  }

  function renderButtonCard(btn, index, prefix, editable) {
    const type = String(btn?.type || 'QUICK_REPLY').toUpperCase();
    const label = utils().BUTTON_TYPE_LABELS[type] || type;
    const tone = type === 'URL' ? 'url' : (type === 'PHONE_NUMBER' ? 'phone' : 'quick');
    const disabled = editable ? '' : ' disabled';
    const extraFields = type === 'URL'
      ? `<label class="et-field-block"><span>URL (HTTPS)</span><input type="url" data-btn-url value="${escapeHtml(btn.url || '')}" placeholder="https://exemplo.com" maxlength="2000"${disabled} /></label>`
      : (type === 'PHONE_NUMBER'
        ? `<label class="et-field-block"><span>Telefone</span><input type="tel" data-btn-phone value="${escapeHtml(btn.phoneNumber || '')}" placeholder="+55 11 99999-0000" maxlength="20"${disabled} /></label>`
        : '');
    return `
      <article class="et-button-card" data-et-btn-card="${prefix}" data-btn-type="${escapeHtml(type)}" data-btn-index="${index}">
        <header class="et-button-card-head">
          <span class="et-button-type-badge" data-tone="${tone}">${escapeHtml(label)}</span>
          ${editable ? `<button type="button" class="et-btn et-btn--ghost et-btn-remove" data-remove-btn="${index}" aria-label="Remover botão">×</button>` : ''}
        </header>
        <label class="et-field-block"><span>Texto do botão</span>
          <input type="text" data-btn-text value="${escapeHtml(btn.text || '')}" maxlength="${utils().BUTTON_TEXT_MAX}" placeholder="Ex.: Instagram"${disabled} />
        </label>
        ${extraFields}
      </article>`;
  }

  function addableButtonTypes(buttons) {
    const list = Array.isArray(buttons) ? buttons : [];
    if (!list.length) return ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'];
    const types = new Set(list.map((btn) => String(btn?.type || '').toUpperCase()));
    if (types.has('QUICK_REPLY')) return ['QUICK_REPLY'];
    return ['URL', 'PHONE_NUMBER'];
  }

  function addTemplateButton(prefix, type) {
    const buttonType = String(type || 'URL').toUpperCase();
    const targetButtons = prefix === 'etWizard'
      ? state.wizard.buttons
      : (state.detail._buttons ||= []);
    if (targetButtons.length >= utils().MAX_BUTTONS) return;
    if (!addableButtonTypes(targetButtons).includes(buttonType)) return;
    syncComponentsFromDom(prefix);
    targetButtons.push(utils().defaultButton(buttonType));
    const editable = prefix === 'etDetail'
      ? (state.canMutate && utils().isEditableStatus(state.detail?.status))
      : true;
    rerenderButtonList(prefix, targetButtons, editable);
    if (state.view === 'wizard' && state.wizardStep === 2) patchWizardStep2();
    else if (state.view === 'wizard' && state.wizardStep === 3) patchWizardStep3();
    else if (state.view === 'detail') {
      patchComponentsSection(prefix, readDetailComponentsFromState());
    }
  }

  function renderButtonTypePicker(prefix, buttons, editable) {
    if (!editable || buttons.length >= utils().MAX_BUTTONS) return '';
    const allowed = new Set(addableButtonTypes(buttons));
    const types = [
      { key: 'QUICK_REPLY', label: 'Quick Reply' },
      { key: 'URL', label: 'URL' },
      { key: 'PHONE_NUMBER', label: 'Telefone' },
    ];
    return `
      <div class="et-btn-type-row" role="group" aria-label="Adicionar botão">
        ${types.map((item) => {
          const disabled = !allowed.has(item.key);
          return `<button type="button" class="et-btn et-btn-type" data-et-add-button="${item.key}" data-et-prefix="${prefix}"${disabled ? ' disabled title="Não combina com os botões já adicionados"' : ''}>${escapeHtml(item.label)}</button>`;
        }).join('')}
      </div>`;
  }

  function renderHeaderEditor(prefix, components, editable) {
    const headerType = utils().normalizeHeaderType(components?.headerType);
    const headerText = String(components?.headerText || '');
    const disabled = editable ? '' : ' disabled';
    const options = utils().HEADER_TYPE_OPTIONS.map((opt) => {
      const checked = opt.key === headerType ? ' checked' : '';
      return `
        <label class="et-header-type-option">
          <input type="radio" name="${prefix}HeaderType" value="${escapeHtml(opt.key)}"${checked}${disabled} />
          <span>${escapeHtml(opt.label)}</span>
        </label>`;
    }).join('');
    const textField = headerType === 'TEXT'
      ? `
        <label class="et-field-block et-header-text-field">
          <span>Texto do cabeçalho</span>
          <input type="text" id="${prefix}HeaderText" value="${escapeHtml(headerText)}" maxlength="${utils().HEADER_TEXT_MAX}" placeholder="Promoção de inverno"${editable ? '' : ' readonly'} />
          <small class="et-char-count">${headerText.length} / ${utils().HEADER_TEXT_MAX}</small>
        </label>`
      : '';
    const mediaNote = utils().headerTypeRequiresMediaAsset(headerType)
      ? '<p class="et-media-note">A mídia é selecionada na campanha (Media Library). O template define apenas o formato <strong>' + escapeHtml(headerType) + '</strong>.</p>'
      : '';
    return `
      <section class="et-components-block">
        <h4 class="et-section-title">Cabeçalho (Header)</h4>
        <div class="et-header-type-list" role="radiogroup" aria-label="Tipo de cabeçalho">${options}</div>
        ${textField}
        ${mediaNote}
      </section>`;
  }

  function renderSampleMediaSection(components, editable, prefix = 'etDetail') {
    const headerType = utils().normalizeHeaderType(components?.headerType);
    if (!utils().headerTypeRequiresMediaAsset(headerType)) return '';
    const loading = state.sampleMediaAssetsLoading;
    const assets = state.sampleMediaAssets;
    const selectId = `${prefix}SampleMediaAsset`;
    const options = ['<option value="">— selecionar asset —</option>']
      .concat(assets.map((asset) => {
        const id = String(asset?.id || '');
        const label = String(asset?.name || asset?.fileName || asset?.originalName || id).trim();
        const selected = id === state.sampleMediaAssetId ? ' selected' : '';
        return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(label)}</option>`;
      }));
    const emptyHint = !loading && !assets.length
      ? '<p class="et-help">Nenhum asset deste tipo na Media Library. <button type="button" class="et-link" id="etOpenMediaLibrary">Abrir Media Library</button></p>'
      : '';
    return `
      <section class="et-components-block et-sample-media-block" id="${prefix}SampleMediaBlock">
        <h4 class="et-section-title">Mídia de exemplo (submit Meta)</h4>
        <p class="et-help">A Meta exige um ficheiro de exemplo no submit. A mídia real da campanha é escolhida depois na Media Library.</p>
        ${loading ? '<p class="et-muted">Carregando assets…</p>' : `
          <label class="et-field-block">
            <select id="${selectId}"${editable ? '' : ' disabled'}>${options.join('')}</select>
          </label>
          ${emptyHint}`}
      </section>`;
  }

  function renderComponentsEditor(prefix, components, editable) {
    const footer = String(components?.footer || '');
    const buttons = Array.isArray(components?.buttons) ? components.buttons : [];
    const footerCount = footer.length;
    const needsSampleMedia = utils().headerTypeRequiresMediaAsset(components?.headerType);
    return `
      ${renderHeaderEditor(prefix, components, editable)}
      ${needsSampleMedia ? renderSampleMediaSection(components, editable, prefix) : ''}
      <section class="et-components-block">
        <h4 class="et-section-title">Rodapé (opcional)</h4>
        <label class="et-field-block">
          <input type="text" id="${prefix}Footer" value="${escapeHtml(footer)}" maxlength="${utils().FOOTER_MAX}" placeholder="Ex.: NeuraFlow"${editable ? '' : ' readonly'} />
          <small class="et-char-count">${footerCount} / ${utils().FOOTER_MAX}</small>
        </label>
      </section>
      <section class="et-components-block">
        <h4 class="et-section-title">Botões (opcional)</h4>
        ${renderButtonTypePicker(prefix, buttons, editable)}
        <div class="et-button-list" id="${prefix}ButtonList">
          ${buttons.length
            ? buttons.map((btn, index) => renderButtonCard(btn, index, prefix, editable)).join('')
            : '<p class="et-muted">Nenhum botão — escolha Quick Reply, URL ou Telefone acima.</p>'}
        </div>
        <p class="et-help">Máximo ${utils().MAX_BUTTONS} botões. Quick Reply não combina com URL/Telefone no mesmo template.</p>
      </section>`;
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
      ${state.successMessage ? `<p class="et-success" role="status">${escapeHtml(state.successMessage)}</p>` : ''}
      ${state.error ? `<p class="et-error">${escapeHtml(state.error)}</p>` : ''}
      ${state.loading || state.submittingMeta ? '<p class="et-muted">Carregando…</p>' : ''}
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
    const { hasErrors } = wizardLintState();
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
          ${renderComponentsEditor('etWizard', wizardComponents(), true)}
          ${renderLintPanel(state.wizard.body, state.wizard.category, wizardComponents())}
          <div class="et-wizard-actions">
            <button type="button" class="et-btn" id="etWizardBack2">Voltar</button>
            <button type="button" class="et-btn et-btn--primary" id="etWizardNext2" ${hasErrors ? 'disabled' : ''}>Seguinte</button>
          </div>
        </section>
        ${renderPreviewPanel(state.wizard.body, state.wizard.variables, wizardComponents())}
      </div>`;
  }

  function buildWizardChecklist() {
    const variables = utils().syncVariablesFromBody(state.wizard.body, state.wizard.variables);
    const components = wizardComponents();
    const lint = utils().lintTemplateContent(state.wizard.body, state.wizard.category);
    const compLint = utils().lintTemplateComponents(
      components.footer,
      components.buttons,
      components.headerType,
      components.headerText,
    );
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
    const lintOk = !lint.hasErrors && !compLint.hasErrors;

    return {
      variables,
      items: [
        { label: 'Nome com sufixo _vN', ok: hasName },
        { label: 'Categoria definida', ok: hasCategory },
        { label: hasPlaceholders ? 'Placeholders mapeados' : 'Corpo da mensagem', ok: placeholdersOk },
        { label: 'Exemplos preenchidos', ok: samplesOk },
        { label: 'Rodapé, cabeçalho e botões válidos', ok: !compLint.hasErrors },
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
        ${renderPreviewPanel(state.wizard.body, variables, wizardComponents())}
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
    const components = detailComponentsState(item);
    const needsSample = utils().headerTypeRequiresMediaAsset(components.headerType);
    const canSubmit = !needsSample || Boolean(state.sampleMediaAssetId);
    const submitTitle = needsSample && !state.sampleMediaAssetId
      ? ' title="Selecione uma mídia de exemplo para enviar à Meta"'
      : '';

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
            ${editable ? `<button type="button" class="et-btn et-btn--primary" id="etSubmitDetail"${state.submittingMeta || !canSubmit ? ' disabled' : ''}${submitTitle}>${state.submittingMeta ? 'Enviando à Meta…' : 'Submit Meta'}</button>` : ''}
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
          ${renderComponentsEditor('etDetail', components, editable)}
          ${renderLintPanel(item.body || '', item.category, components)}
        </section>
        ${renderPreviewPanel(item.body, item.variables, components)}
      </div>`;
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

    const { hasErrors } = wizardLintState();
    const components = wizardComponents();

    const lintHost = root.querySelector('.et-wizard-grid .et-lint-panel, .et-wizard-step .et-lint-panel');
    if (lintHost) {
      const fresh = renderLintPanel(state.wizard.body, state.wizard.category, components);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fresh;
      lintHost.replaceWith(wrapper.firstElementChild);
    }

    const footerInput = root.querySelector('#etWizardFooter');
    if (footerInput) {
      const countEl = footerInput.parentElement?.querySelector('.et-char-count');
      if (countEl) countEl.textContent = `${footerInput.value.length} / ${utils().FOOTER_MAX}`;
    }

    const headerTextInput = root.querySelector('#etWizardHeaderText');
    if (headerTextInput) {
      const countEl = headerTextInput.parentElement?.querySelector('.et-char-count');
      if (countEl) countEl.textContent = `${headerTextInput.value.length} / ${utils().HEADER_TEXT_MAX}`;
    }

    const previewHost = root.querySelector('.et-preview-panel');
    if (previewHost) {
      const fresh = renderPreviewPanel(state.wizard.body, state.wizard.variables, components);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fresh;
      previewHost.replaceWith(wrapper.firstElementChild);
    }

    const nextBtn = root.querySelector('#etWizardNext2');
    if (nextBtn) nextBtn.disabled = hasErrors;
  }

  function patchComponentsSection(prefix, components) {
    const root = state.dom.root;
    if (!root) return;

    const footerInput = root.querySelector(`#${prefix}Footer`);
    if (footerInput) {
      const countEl = footerInput.parentElement?.querySelector('.et-char-count');
      if (countEl) countEl.textContent = `${footerInput.value.length} / ${utils().FOOTER_MAX}`;
    }

    const headerTextInput = root.querySelector(`#${prefix}HeaderText`);
    if (headerTextInput) {
      const countEl = headerTextInput.parentElement?.querySelector('.et-char-count');
      if (countEl) countEl.textContent = `${headerTextInput.value.length} / ${utils().HEADER_TEXT_MAX}`;
    }

    const previewHost = root.querySelector('.et-preview-panel');
    if (previewHost) {
      const body = prefix === 'etWizard' ? state.wizard.body : (state.detail?.body || '');
      const variables = prefix === 'etWizard'
        ? state.wizard.variables
        : (state.detail?.variables || []);
      const fresh = renderPreviewPanel(body, variables, components);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fresh;
      previewHost.replaceWith(wrapper.firstElementChild);
    }

    const lintHost = root.querySelector('.et-lint-panel');
    if (lintHost && prefix === 'etDetail') {
      const body = state.detail?.body || '';
      const category = state.detail?.category || 'MARKETING';
      const fresh = renderLintPanel(body, category, components);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fresh;
      lintHost.replaceWith(wrapper.firstElementChild);
    }
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
      const fresh = renderPreviewPanel(state.wizard.body, checklistState.variables, wizardComponents());
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fresh;
      previewHost.replaceWith(wrapper.firstElementChild);
    }

    const saveBtn = root.querySelector('#etWizardSave');
    if (saveBtn) saveBtn.disabled = !checklistState.canSave;
  }

  function patchSubmitButtonState() {
    if (state.view !== 'detail' || !state.detail) return;
    const components = detailComponentsState(state.detail);
    const needsSample = utils().headerTypeRequiresMediaAsset(components.headerType);
    const canSubmit = !needsSample || Boolean(state.sampleMediaAssetId);
    const btn = state.dom.root?.querySelector('#etSubmitDetail');
    if (!btn) return;
    btn.disabled = state.submittingMeta || !canSubmit;
    if (needsSample && !state.sampleMediaAssetId) {
      btn.title = 'Selecione uma mídia de exemplo para enviar à Meta';
    } else {
      btn.removeAttribute('title');
    }
  }

  async function handleHeaderTypeChange(prefix) {
    syncComponentsFromDom(prefix);
    const components = prefix === 'etWizard'
      ? wizardComponents()
      : readDetailComponentsFromState();
    await loadSampleMediaAssets(components.headerType);
    if (prefix === 'etDetail') {
      render();
      return;
    }
    if (state.view === 'wizard' && state.wizardStep === 2) {
      refreshWizardView({ preserveInputs: false });
    }
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
    syncComponentsFromDom('etWizard');
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
      const { footer, buttons, headerType, headerText } = readWizardComponentsFromState();
      const savedComponents = { footer, buttons, headerType, headerText };
      utils().attachTemplateComponentsToPayload(
        payload,
        footer,
        buttons,
        state.wizard.body,
        headerType,
        headerText,
      );
      const created = await api().createTemplate(state.session, payload);
      state.view = 'detail';
      state.selectedId = created?.id || '';
      await loadAll();
      if (state.selectedId) {
        const patched = await ensureComponentsPersisted(state.selectedId, savedComponents, {
          category: state.wizard.category,
          body: state.wizard.body,
          variables: state.wizard.variables,
        });
        await openDetail(state.selectedId, {
          preserveComponents: savedComponents,
          patchResponse: patched || created,
        });
      }
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
    const { footer, buttons, headerType, headerText } = readDetailComponentsFromState();
    const lint = utils().lintTemplateContent(body, category || state.detail.category);
    const compLint = utils().lintTemplateComponents(footer, buttons, headerType, headerText);
    if (lint.hasErrors || compLint.hasErrors) {
      setError('Corrija os erros do linter antes de salvar.');
      return;
    }
    state.saving = true;
    setError('');
    try {
      const patch = {
        category: category || state.detail.category,
        body,
        variables,
      };
      const savedComponents = { footer, buttons, headerType, headerText };
      utils().attachTemplateComponentsToPayload(
        patch,
        footer,
        buttons,
        body,
        headerType,
        headerText,
      );
      const updated = await api().updateTemplate(state.session, state.selectedId, patch);
      const patched = await ensureComponentsPersisted(state.selectedId, savedComponents, {
        category: category || state.detail.category,
        body,
        variables,
      });
      writeComponentsCache(state.selectedId, savedComponents);
      await loadAll();
      await openDetail(state.selectedId, {
        preserveComponents: savedComponents,
        patchResponse: patched || updated,
      });
    } catch (err) {
      setError(err?.message || 'Falha ao salvar template.');
    } finally {
      state.saving = false;
    }
  }

  function lintBeforeSubmit(body, category, components) {
    const lint = utils().lintTemplateContent(body, category);
    const compLint = utils().lintTemplateComponents(
      components.footer,
      components.buttons,
      components.headerType,
      components.headerText,
    );
    const errors = [...lint.items, ...compLint.items].filter((i) => i.severity === 'error');
    const warnings = [...lint.items, ...compLint.items].filter((i) => i.severity === 'warning');
    return { errors, warnings };
  }

  function readDetailPatch() {
    if (!state.detail) return null;
    const category = state.dom.root?.querySelector('#etDetailCategory')?.value?.trim()
      || state.detail.category;
    const body = state.dom.root?.querySelector('#etDetailBody')?.value ?? state.detail.body ?? '';
    const variables = utils().syncVariablesFromBody(body, state.detail.variables || []);
    const { footer, buttons, headerType, headerText } = readDetailComponentsFromState();
    const patch = {
      category: category || state.detail.category,
      body,
      variables,
    };
    utils().attachTemplateComponentsToPayload(
      patch,
      footer,
      buttons,
      body,
      headerType,
      headerText,
    );
    return { patch, body, category, components: { footer, buttons, headerType, headerText } };
  }

  function goToTemplateList() {
    state.view = 'list';
    state.selectedId = '';
    state.detail = null;
    render();
  }

  async function submitDetail() {
    if (!state.selectedId || !state.detail || state.submittingMeta) return;

    const form = readDetailPatch();
    if (!form) return;

    const { errors, warnings } = lintBeforeSubmit(form.body, form.category, form.components);
    if (errors.length) {
      setError(errors[0].message || 'Corrija os erros do linter antes de enviar à Meta.');
      return;
    }
    if (utils().headerTypeRequiresMediaAsset(form.components.headerType) && !state.sampleMediaAssetId) {
      setError('Selecione uma mídia de exemplo para enviar à Meta.');
      return;
    }
    if (warnings.length) {
      const proceed = window.confirm(
        `Ainda há ${warnings.length} aviso(s) no texto. Enviar à Meta mesmo assim?`,
      );
      if (!proceed) return;
    }

    const templateId = state.selectedId;
    const templateName = state.detail.name || 'template';

    state.submittingMeta = true;
    state.error = '';
    state.successMessage = `Enviando «${templateName}» à Meta… A validação pode levar alguns segundos.`;
    goToTemplateList();

    try {
      await api().updateTemplate(state.session, templateId, form.patch);
      const submitOptions = utils().headerTypeRequiresMediaAsset(form.components.headerType)
        ? { sampleMediaAssetId: state.sampleMediaAssetId }
        : {};
      await api().submitTemplate(state.session, templateId, submitOptions);
      await loadAll();
      state.successMessage = `«${templateName}» enviado à Meta. Use Sync no template para acompanhar a aprovação.`;
      state.error = '';
    } catch (err) {
      state.successMessage = '';
      state.error = err?.message || 'Falha ao enviar template à Meta.';
      await loadAll();
    } finally {
      state.submittingMeta = false;
      render();
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
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name && target.name.endsWith('HeaderType')) {
        const prefix = target.name.replace('HeaderType', '');
        void handleHeaderTypeChange(prefix);
        return;
      }
      if (target instanceof HTMLSelectElement && target.id.endsWith('SampleMediaAsset')) {
        state.sampleMediaAssetId = target.value || '';
        if (state.view === 'wizard' && state.wizardStep === 2) patchWizardStep2();
        else if (state.view === 'detail') {
          patchComponentsSection('etDetail', readDetailComponentsFromState());
          patchSubmitButtonState();
        }
        return;
      }
      if (state.view !== 'wizard') return;
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

    root.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      if (target.id === 'etWizardHeaderText') {
        state.wizard.headerText = target.value;
        if (state.wizardStep === 2) patchWizardStep2();
        return;
      }
      if (target.id === 'etDetailHeaderText' && state.detail) {
        state.detail._headerText = target.value;
        patchComponentsSection('etDetail', readDetailComponentsFromState());
        return;
      }
      if (target.id === 'etWizardFooter') {
        state.wizard.footer = target.value;
        if (state.wizardStep === 2) patchWizardStep2();
        return;
      }
      if (target.id === 'etDetailFooter' && state.detail) {
        state.detail._footer = target.value;
        patchComponentsSection('etDetail', readDetailComponentsFromState());
        return;
      }
      if (target.matches('[data-btn-text], [data-btn-url], [data-btn-phone]')) {
        const card = target.closest('[data-et-btn-card]');
        const prefix = card?.getAttribute('data-et-btn-card');
        if (!prefix) return;
        syncComponentsFromDom(prefix);
        if (state.view === 'wizard' && state.wizardStep === 2) patchWizardStep2();
        else if (state.view === 'wizard' && state.wizardStep === 3) patchWizardStep3();
        else if (state.view === 'detail') {
          patchComponentsSection('etDetail', readDetailComponentsFromState());
        }
      }
    });

    root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const openMedia = target.closest('#etOpenMediaLibrary');
      if (openMedia) {
        window.EngageConfig?.setActiveTab?.('media-library');
        return;
      }

      const addBtn = target.closest('[data-et-add-button]');
      if (addBtn instanceof HTMLElement) {
        const prefix = addBtn.getAttribute('data-et-prefix') || '';
        const type = addBtn.getAttribute('data-et-add-button') || 'URL';
        if (prefix) addTemplateButton(prefix, type);
        return;
      }

      const removeBtn = target.closest('[data-remove-btn]');
      if (removeBtn) {
        const card = removeBtn.closest('[data-et-btn-card]');
        const prefix = card?.getAttribute('data-et-btn-card');
        if (!prefix) return;
        syncComponentsFromDom(prefix);
        const index = Number(removeBtn.getAttribute('data-remove-btn'));
        const targetButtons = prefix === 'etWizard'
          ? state.wizard.buttons
          : (state.detail._buttons ||= []);
        targetButtons.splice(index, 1);
        const editable = prefix === 'etDetail'
          ? (state.canMutate && utils().isEditableStatus(state.detail?.status))
          : true;
        rerenderButtonList(prefix, targetButtons, editable);
        if (state.view === 'wizard' && state.wizardStep === 2) patchWizardStep2();
        else if (state.view === 'wizard' && state.wizardStep === 3) patchWizardStep3();
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
      void enterWizardStep(2);
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
      syncComponentsFromDom('etWizard');
      state.wizardStep = 3;
      state.wizard.variables = utils().syncVariablesFromBody(state.wizard.body, state.wizard.variables);
      state.wizardDomStep = null;
      refreshWizardView({ preserveInputs: false });
    });

    root.querySelector('#etWizardBack3')?.addEventListener('click', () => {
      void enterWizardStep(2);
    });

    root.querySelectorAll('.et-var-select, [data-var-sample]').forEach((el) => {
      el.addEventListener('change', () => patchWizardStep3());
      el.addEventListener('input', () => patchWizardStep3());
    });

    root.querySelector('#etWizardSave')?.addEventListener('click', () => void saveWizard());

    if (state.view === 'detail' && state.canMutate && utils().isEditableStatus(state.detail?.status)) {
      state.dom.root?.querySelector('#etDetailBody')?.addEventListener('input', (event) => {
        if (!state.detail) return;
        state.detail.body = event.target.value;
        patchComponentsSection('etDetail', readDetailComponentsFromState());
      });
    }

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
      if (!state.selectedId || state.submittingMeta) return;
      void submitDetail();
    });

    root.querySelector('#etSyncDetail')?.addEventListener('click', () => {
      if (!state.selectedId) return;
      void runMutation(() => api().syncTemplate(state.session, state.selectedId));
    });

    root.querySelector('#etDuplicateDetail')?.addEventListener('click', () => {
      if (!state.selectedId) return;
      void runMutation(async () => {
        const sourceComponents = utils().resolveTemplateComponents(state.detail);
        const copy = await api().duplicateTemplate(state.session, state.selectedId);
        const newId = copy?.id || state.selectedId;
        state.selectedId = newId;
        const copyComponents = utils().resolveTemplateComponents(copy);
        const needsComponents = (!copyComponents.buttons.length && sourceComponents.buttons.length)
          || (!copyComponents.footer && sourceComponents.footer);
        if (needsComponents && newId) {
          const patch = {
            category: copy.category || state.detail?.category,
            body: copy.body || state.detail?.body,
            variables: copy.variables || state.detail?.variables || [],
          };
          utils().attachTemplateComponentsToPayload(
            patch,
            sourceComponents.footer,
            sourceComponents.buttons,
            copy.body || state.detail?.body,
          );
          await api().updateTemplate(state.session, newId, patch);
        }
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
