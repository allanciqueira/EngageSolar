/**
 * Engage Config — Media Library (upload, grid, remover).
 */
(function () {
  const api = () => window.EngageMediaLibraryApi;

  const MIME_RULES = {
    'image/jpeg': { type: 'IMAGE', maxBytes: 5 * 1024 * 1024, label: 'JPEG' },
    'image/png': { type: 'IMAGE', maxBytes: 5 * 1024 * 1024, label: 'PNG' },
    'video/mp4': { type: 'VIDEO', maxBytes: 16 * 1024 * 1024, label: 'MP4' },
    'application/pdf': { type: 'DOCUMENT', maxBytes: 100 * 1024 * 1024, label: 'PDF' },
  };

  const ERROR_MESSAGES = {
    file_required: 'Nenhum arquivo enviado.',
    unsupported_mime_type: 'Tipo de arquivo não suportado. Use JPEG, PNG, MP4 ou PDF.',
    file_too_large: 'Arquivo excede o limite do tipo.',
    media_asset_in_use_by_campaign: 'Em uso por uma campanha — remova da campanha antes de apagar.',
  };

  const state = {
    active: false,
    session: null,
    canMutate: false,
    tenantId: '',
    items: [],
    loading: false,
    busy: false,
    error: '',
    success: '',
    typeFilter: '',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function mapApiError(err) {
    const code = String(err?.message || err?.error || '').trim();
    if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    return code || 'Falha na operação.';
  }

  function validateFile(file) {
    if (!file) return 'Selecione um arquivo.';
    const rule = MIME_RULES[file.type];
    if (!rule) {
      return 'Tipo não suportado. Use JPEG, PNG, MP4 ou PDF.';
    }
    if (file.size > rule.maxBytes) {
      return `${rule.label} — máximo ${formatBytes(rule.maxBytes)}.`;
    }
    return '';
  }

  function resolveTenantLabel() {
    const options = api().resolveTenantOptions(state.session);
    const match = options.find((row) => row.id === state.tenantId);
    if (!match) return state.tenantId || '—';
    const shortId = state.tenantId ? `${state.tenantId.slice(0, 8)}…` : '';
    return `${match.name}${shortId ? ` (${shortId})` : ''}`;
  }

  function renderTenantField() {
    const options = api().resolveTenantOptions(state.session);
    if (options.length <= 1) {
      return `
        <label class="eml-field">
          <span>Tenant</span>
          <input type="text" value="${escapeAttr(resolveTenantLabel())}" readonly />
        </label>`;
    }
    return `
      <label class="eml-field">
        <span>Tenant</span>
        <select id="emlTenantSelect">
          ${options.map((row) => `
            <option value="${escapeAttr(row.id)}"${row.id === state.tenantId ? ' selected' : ''}>${escapeHtml(row.name)} (${escapeHtml(row.id.slice(0, 8))}…)</option>`).join('')}
        </select>
      </label>`;
  }

  function renderPreview(item) {
    const type = String(item?.type || '').toUpperCase();
    const url = String(item?.publicUrl || '').trim();
    if (type === 'IMAGE' && url) {
      return `<img class="eml-card-thumb" src="${escapeAttr(url)}" alt="" loading="lazy" />`;
    }
    if (type === 'VIDEO' && url) {
      return `<video class="eml-card-thumb" src="${escapeAttr(url)}" muted playsinline preload="metadata"></video>`;
    }
    return `<div class="eml-card-thumb eml-card-thumb--doc" aria-hidden="true">📄</div>`;
  }

  function renderCard(item) {
    const name = String(item?.name || '—');
    const type = String(item?.type || '—').toUpperCase();
    const size = formatBytes(item?.sizeBytes);
    return `
      <article class="eml-card" data-asset-id="${escapeAttr(item.id)}">
        <div class="eml-card-preview">${renderPreview(item)}</div>
        <div class="eml-card-body">
          <h4 class="eml-card-title" title="${escapeAttr(name)}">${escapeHtml(name)}</h4>
          <p class="eml-card-meta">${escapeHtml(type)} · ${escapeHtml(size)}</p>
          ${state.canMutate ? `<button type="button" class="eml-btn eml-btn--danger" data-eml-remove="${escapeAttr(item.id)}">Remover</button>` : ''}
        </div>
      </article>`;
  }

  function render() {
    const root = $('engageMediaLibraryRoot');
    if (!root || !state.active) return;

    const filtered = state.typeFilter
      ? state.items.filter((item) => String(item?.type || '').toUpperCase() === state.typeFilter)
      : state.items;

    root.innerHTML = `
      <div class="eml-shell">
        <header class="ec-mc-head eml-head">
          <div class="ec-mc-head-copy">
            <h2>Media Library</h2>
            <p class="ec-mc-lead">Biblioteca reutilizável de mídia para templates IMAGE / VIDEO / DOCUMENT.</p>
          </div>
        </header>

        <div class="eml-toolbar">
          ${renderTenantField()}
          <label class="eml-field eml-field--filter">
            <span>Filtrar tipo</span>
            <select id="emlTypeFilter">
              <option value=""${state.typeFilter === '' ? ' selected' : ''}>Todos</option>
              <option value="IMAGE"${state.typeFilter === 'IMAGE' ? ' selected' : ''}>IMAGE</option>
              <option value="VIDEO"${state.typeFilter === 'VIDEO' ? ' selected' : ''}>VIDEO</option>
              <option value="DOCUMENT"${state.typeFilter === 'DOCUMENT' ? ' selected' : ''}>DOCUMENT</option>
            </select>
          </label>
        </div>

        <p class="eml-help">JPEG, PNG, MP4 e PDF reutilizáveis em campanhas com templates IMAGE / VIDEO / DOCUMENT.</p>

        <div class="eml-actions">
          ${state.canMutate ? `
            <button type="button" class="ec-mc-btn ec-mc-btn--primary" id="emlUploadBtn"${state.busy ? ' disabled' : ''}>Upload</button>
            <input type="file" id="emlFileInput" hidden accept="image/jpeg,image/png,video/mp4,application/pdf" />
          ` : ''}
          <button type="button" class="ec-mc-btn" id="emlRefreshBtn"${state.busy ? ' disabled' : ''}>Atualizar</button>
        </div>

        ${state.success ? `<p class="ec-mc-feedback" data-tone="ok" role="status">${escapeHtml(state.success)}</p>` : ''}
        ${state.error ? `<p class="ec-mc-feedback" data-tone="danger" role="alert">${escapeHtml(state.error)}</p>` : ''}
        ${state.loading ? '<p class="ec-mc-loading">Carregando…</p>' : ''}

        ${!state.loading && !filtered.length
          ? '<p class="eml-empty">Nenhum asset ainda.</p>'
          : `<div class="eml-grid">${filtered.map(renderCard).join('')}</div>`}
      </div>`;

    bindEvents();
  }

  async function loadItems() {
    if (!state.session || !state.tenantId) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const params = { limit: '100' };
      if (state.typeFilter) params.type = state.typeFilter;
      const payload = await api().listMediaAssets(state.session, params);
      state.items = payload.items || [];
    } catch (err) {
      state.error = mapApiError(err);
      state.items = [];
    } finally {
      state.loading = false;
      render();
    }
  }

  async function handleUpload(file) {
    const validation = validateFile(file);
    if (validation) {
      state.error = validation;
      state.success = '';
      render();
      return;
    }
    state.busy = true;
    state.error = '';
    state.success = '';
    render();
    try {
      await api().uploadMediaAsset(state.session, file, file.name);
      state.success = 'Upload concluído.';
      await loadItems();
    } catch (err) {
      state.error = mapApiError(err);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function handleRemove(assetId) {
    if (!assetId) return;
    const item = state.items.find((row) => row.id === assetId);
    const label = item?.name || assetId;
    if (!window.confirm(`Remover "${label}" da biblioteca?`)) return;

    state.busy = true;
    state.error = '';
    state.success = '';
    render();
    try {
      await api().deleteMediaAsset(state.session, assetId);
      state.success = 'Asset removido.';
      await loadItems();
    } catch (err) {
      state.error = mapApiError(err);
    } finally {
      state.busy = false;
      render();
    }
  }

  function bindEvents() {
    const root = $('engageMediaLibraryRoot');
    if (!root) return;

    root.querySelector('#emlRefreshBtn')?.addEventListener('click', () => {
      void loadItems();
    });

    root.querySelector('#emlUploadBtn')?.addEventListener('click', () => {
      root.querySelector('#emlFileInput')?.click();
    });

    root.querySelector('#emlFileInput')?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void handleUpload(file);
    });

    root.querySelector('#emlTypeFilter')?.addEventListener('change', (event) => {
      state.typeFilter = event.target.value || '';
      void loadItems();
    });

    root.querySelector('#emlTenantSelect')?.addEventListener('change', (event) => {
      state.tenantId = event.target.value || '';
      void loadItems();
    });

    root.querySelectorAll('[data-eml-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        void handleRemove(button.getAttribute('data-eml-remove'));
      });
    });
  }

  function activate(session) {
    state.active = true;
    state.session = session || null;
    state.canMutate = api().canMutateMedia(state.session);
    state.tenantId = api().resolveTenantId(state.session);
    state.error = '';
    state.success = '';
    if (!state.tenantId) {
      state.error = 'Tenant não definido na sessão.';
      render();
      return;
    }
    void loadItems();
  }

  function deactivate() {
    state.active = false;
    state.session = null;
    state.items = [];
    state.loading = false;
    state.busy = false;
    const root = $('engageMediaLibraryRoot');
    if (root) root.innerHTML = '';
  }

  window.EngageMediaLibraryAdmin = { activate, deactivate };
})();
