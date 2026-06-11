/**
 * Contact Hub — wizard Import CSV + audiência (Fase 3).
 * Spec: HANDOFF-ENGAGE-SOLAR-FRONT-CONTACT-IMPORT-AUDIENCES.md
 */
(function () {
  const STEPS = ['upload', 'map', 'preview', 'run', 'done'];
  const STEP_LABELS = {
    upload: 'Arquivo',
    map: 'Mapeamento',
    preview: 'Pré-visualização',
    run: 'Importar',
    done: 'Concluído',
  };

  const DEFAULT_TARGET_FIELDS = [
    { key: 'phone', label: 'Telefone', required: true },
    { key: 'name', label: 'Nome', required: false },
    { key: 'email', label: 'E-mail', required: false },
    { key: 'cidade', label: 'Cidade (atributo)', required: false, attribute: true },
    { key: 'vendedor', label: 'Vendedor (atributo)', required: false, attribute: true },
    { key: 'empresa', label: 'Empresa (atributo)', required: false, attribute: true },
  ];

  let session = null;
  let open = false;
  let step = 'upload';
  let busy = false;
  let error = '';
  let importSession = null;
  let columns = [];
  let targetFields = [...DEFAULT_TARGET_FIELDS];
  let mapping = {};
  let preview = null;
  let runResult = null;
  let onComplete = null;

  function api() {
    return window.EngageContactHubApi;
  }

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

  function defaultAudienceName(fileName) {
    const base = String(fileName || 'Import CSV').replace(/\.[^.]+$/, '').trim() || 'Import CSV';
    const date = new Date().toLocaleDateString('pt-BR');
    return `${base} · ${date}`;
  }

  function resolveImportSessionId(payload) {
    return payload?.importSessionId || payload?.sessionId || payload?.id || null;
  }

  function normalizeColumns(payload) {
    if (Array.isArray(payload?.columns)) return payload.columns.map(String);
    if (Array.isArray(payload?.headers)) return payload.headers.map(String);
    return [];
  }

  function normalizeTargetFields(payload) {
    if (Array.isArray(payload?.targetFields) && payload.targetFields.length) {
      return payload.targetFields.map((field) => ({
        key: String(field.key || field.name || ''),
        label: String(field.label || field.key || field.name || ''),
        required: Boolean(field.required),
        attribute: Boolean(field.attribute || field.isAttribute),
      })).filter((field) => field.key);
    }
    return [...DEFAULT_TARGET_FIELDS];
  }

  function applySuggestedMapping(suggested) {
    if (!suggested || typeof suggested !== 'object') return;
    mapping = {};
    Object.entries(suggested).forEach(([key, col]) => {
      if (col) mapping[key] = String(col);
    });
  }

  function buildColumnMappingPayload() {
    const columnMapping = {};
    const attributes = {};
    targetFields.forEach((field) => {
      const col = mapping[field.key];
      if (!col) return;
      if (field.attribute) {
        attributes[field.key] = col;
      } else {
        columnMapping[field.key] = col;
      }
    });
    if (Object.keys(attributes).length) {
      columnMapping.attributes = attributes;
    }
    return columnMapping;
  }

  function buildRunPayload(audienceName) {
    return {
      importSessionId: resolveImportSessionId(importSession),
      columnMapping: buildColumnMappingPayload(),
      autoCreateAudience: true,
      audienceName: String(audienceName || '').trim() || defaultAudienceName(importSession?.fileName),
      updateExisting: true,
    };
  }

  function columnOptions(selected) {
    const opts = ['<option value="">— Ignorar —</option>']
      .concat(columns.map((col) => {
        const sel = col === selected ? ' selected' : '';
        return `<option value="${escapeAttr(col)}"${sel}>${escapeHtml(col)}</option>`;
      }));
    return opts.join('');
  }

  function renderStepNav() {
    const idx = STEPS.indexOf(step);
    return STEPS.filter((key) => key !== 'done' || step === 'done').map((key, i) => {
      const active = key === step ? ' is-active' : '';
      const done = i < idx ? ' is-done' : '';
      return `<span class="ech-import-step${active}${done}">${escapeHtml(STEP_LABELS[key])}</span>`;
    }).join('');
  }

  function renderUploadStep() {
    return `
      <div class="ech-import-panel">
        <p class="ech-import-lead">Selecione um arquivo CSV com telefones e atributos dos contactos.</p>
        <label class="ech-import-drop" id="echImportDrop">
          <input type="file" id="echImportFile" accept=".csv,text/csv" hidden />
          <strong>Clique ou arraste o CSV</strong>
          <span>Colunas típicas: Telefone, Nome, Cidade, Vendedor</span>
        </label>
        ${importSession?.fileName ? `<p class="ec-mc-muted">Arquivo: <strong>${escapeHtml(importSession.fileName)}</strong></p>` : ''}
      </div>`;
  }

  function renderMapStep() {
    const rows = targetFields.map((field) => `
      <label class="ech-import-map-row">
        <span>${escapeHtml(field.label)}${field.required ? ' <em>*</em>' : ''}</span>
        <select data-ech-map="${escapeAttr(field.key)}">${columnOptions(mapping[field.key] || '')}</select>
      </label>`).join('');
    return `
      <div class="ech-import-panel">
        <p class="ech-import-lead">Associe cada campo Engage a uma coluna do CSV.</p>
        <div class="ech-import-map-grid">${rows}</div>
      </div>`;
  }

  function renderPreviewStep() {
    const stats = preview || {};
    const sample = Array.isArray(stats.preview) ? stats.preview : (Array.isArray(stats.samples) ? stats.samples : []);
    const warnings = Array.isArray(stats.warnings) ? stats.warnings : [];
    const rows = sample.slice(0, 8).map((row) => `
      <tr>
        <td>${escapeHtml(row.phone || row.phoneE164 || '—')}</td>
        <td>${escapeHtml(row.name || '—')}</td>
        <td>${escapeHtml(row.email || '—')}</td>
        <td class="ec-mc-muted">${escapeHtml(formatAttributes(row.attributes))}</td>
      </tr>`).join('');
    return `
      <div class="ech-import-panel">
        <div class="ech-import-stats">
          <article><span>Linhas</span><strong>${escapeHtml(String(stats.totalRows ?? stats.total ?? '—'))}</strong></article>
          <article><span>Válidas</span><strong>${escapeHtml(String(stats.validRows ?? stats.valid ?? '—'))}</strong></article>
          <article><span>Inválidas</span><strong>${escapeHtml(String(stats.invalidRows ?? stats.invalid ?? '—'))}</strong></article>
          <article><span>Duplicados</span><strong>${escapeHtml(String(stats.duplicatePhones ?? stats.duplicates ?? '—'))}</strong></article>
        </div>
        ${warnings.length ? `<ul class="ech-import-warnings">${warnings.map((w) => `<li>${escapeHtml(typeof w === 'string' ? w : w.message || w.code || '')}</li>`).join('')}</ul>` : ''}
        ${rows ? `
          <div class="ech-table-wrap" style="max-height:220px;">
            <table class="ech-table" aria-label="Pré-visualização import">
              <thead><tr><th>Telefone</th><th>Nome</th><th>E-mail</th><th>Atributos</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : '<p class="ec-mc-muted">Sem linhas de pré-visualização.</p>'}
      </div>`;
  }

  function formatAttributes(attrs) {
    if (!attrs) return '—';
    if (typeof attrs === 'object' && !Array.isArray(attrs)) {
      return Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';
    }
    return '—';
  }

  function renderRunStep() {
    const name = defaultAudienceName(importSession?.fileName);
    return `
      <div class="ech-import-panel">
        <p class="ech-import-lead">Será criada uma <strong>audiência estática</strong> com os contactos importados para usar em campanhas.</p>
        <label class="ech-import-field">
          <span>Nome da audiência</span>
          <input type="text" id="echImportAudienceName" value="${escapeAttr(name)}" />
        </label>
        <label class="ech-import-check">
          <input type="checkbox" id="echImportAutoAudience" checked disabled />
          <span>Criar audiência automaticamente (<code>autoCreateAudience: true</code>)</span>
        </label>
        <p class="ech-import-help">Contactos existentes serão actualizados quando o telefone coincidir.</p>
      </div>`;
  }

  function renderDoneStep() {
    const r = runResult || {};
    const audienceId = r.audienceId || r.audience?.id;
    const audienceName = r.audienceName || r.audience?.name || '—';
    const memberCount = r.audienceMemberCount ?? r.audience?.memberCount ?? r.memberCount;
    return `
      <div class="ech-import-panel ech-import-done">
        <p class="ech-import-success">Importação concluída.</p>
        <dl class="ech-dl">
          <div><dt>Importados</dt><dd>${escapeHtml(String(r.imported ?? r.created ?? 0))}</dd></div>
          <div><dt>Actualizados</dt><dd>${escapeHtml(String(r.updated ?? 0))}</dd></div>
          <div><dt>Ignorados</dt><dd>${escapeHtml(String(r.skipped ?? r.failed ?? 0))}</dd></div>
          <div><dt>Audiência</dt><dd>${escapeHtml(audienceName)}${memberCount != null ? ` · ${escapeHtml(String(memberCount))} membros` : ''}</dd></div>
        </dl>
        ${audienceId ? `
          <div class="ech-import-done-actions">
            <button type="button" class="ec-mc-btn ec-mc-btn--primary" id="echImportOpenCampaigns">Usar em campanha</button>
            <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="echImportViewAudience">Ver audiência</button>
          </div>` : ''}
      </div>`;
  }

  function renderBody() {
    if (step === 'upload') return renderUploadStep();
    if (step === 'map') return renderMapStep();
    if (step === 'preview') return renderPreviewStep();
    if (step === 'run') return renderRunStep();
    return renderDoneStep();
  }

  function renderFooter() {
    if (step === 'done') {
      return `<button type="button" class="ec-mc-btn ec-mc-btn--primary" id="echImportCloseDone">Fechar</button>`;
    }
    const backDisabled = step === 'upload' || busy ? ' disabled' : '';
    const nextLabel = step === 'run' ? 'Importar agora' : 'Continuar';
    const nextDisabled = busy ? ' disabled' : '';
    return `
      <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="echImportBack"${backDisabled}>Voltar</button>
      <button type="button" class="ec-mc-btn ec-mc-btn--primary" id="echImportNext"${nextDisabled}>${escapeHtml(nextLabel)}</button>`;
  }

  function render() {
    const modal = $('engageContactImportModal');
    if (!modal) return;
    modal.hidden = !open;
    if (!open) return;

    const body = $('engageContactImportBody');
    const foot = $('engageContactImportFooter');
    const err = $('engageContactImportError');
    const nav = $('engageContactImportSteps');

    if (nav) nav.innerHTML = renderStepNav();
    if (body) body.innerHTML = renderBody();
    if (foot) foot.innerHTML = renderFooter();
    if (err) {
      err.hidden = !error;
      err.textContent = error || '';
      err.dataset.tone = error ? 'danger' : 'neutral';
    }

    bindStepEvents();
  }

  function bindStepEvents() {
    $('echImportFile')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) void handleUpload(file);
    });

    const drop = $('echImportDrop');
    if (drop && !drop.dataset.bound) {
      drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('is-dragover');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('is-dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file) void handleUpload(file);
      });
      drop.dataset.bound = '1';
    }

    document.querySelectorAll('[data-ech-map]').forEach((select) => {
      select.addEventListener('change', () => {
        mapping[select.dataset.echMap] = select.value || '';
      });
    });

    $('echImportBack')?.addEventListener('click', goBack);
    $('echImportNext')?.addEventListener('click', goNext);
    $('echImportCloseDone')?.addEventListener('click', close);
    $('echImportOpenCampaigns')?.addEventListener('click', () => {
      close();
      document.querySelector('[data-es-nav="campanhas"]')?.click();
    });
    $('echImportViewAudience')?.addEventListener('click', () => {
      const audienceId = runResult?.audienceId || runResult?.audience?.id;
      if (audienceId) {
        window.EngageContactAudiences?.open?.(session, audienceId);
      }
    });
  }

  async function handleUpload(file) {
    if (!file || busy) return;
    busy = true;
    error = '';
    render();
    try {
      const payload = await api().uploadContactImport(session, file);
      importSession = payload;
      columns = normalizeColumns(payload);
      targetFields = normalizeTargetFields(payload);
      applySuggestedMapping(payload.suggestedMapping || payload.suggestedColumnMapping);
      if (!mapping.phone && columns.length) {
        const phoneCol = columns.find((c) => /telefone|phone|celular|whatsapp/i.test(c));
        if (phoneCol) mapping.phone = phoneCol;
      }
      step = 'map';
    } catch (err) {
      error = api().mapApiError(err).message;
    } finally {
      busy = false;
      render();
    }
  }

  async function loadPreview() {
    busy = true;
    error = '';
    render();
    try {
      preview = await api().previewContactImport(session, {
        importSessionId: resolveImportSessionId(importSession),
        columnMapping: buildColumnMappingPayload(),
      });
      step = 'preview';
    } catch (err) {
      error = api().mapApiError(err).message;
    } finally {
      busy = false;
      render();
    }
  }

  async function executeRun() {
    busy = true;
    error = '';
    render();
    try {
      const audienceName = $('echImportAudienceName')?.value || defaultAudienceName(importSession?.fileName);
      runResult = await api().runContactImport(session, buildRunPayload(audienceName));
      step = 'done';
      onComplete?.(runResult);
    } catch (err) {
      const mapped = api().mapApiError(err);
      error = mapped.message;
      if (String(err?.code || '').includes('csv_no_valid_contacts') || /csv_no_valid_contacts/i.test(error)) {
        error = 'Nenhum contacto válido no CSV. Verifique o mapeamento da coluna Telefone.';
      }
    } finally {
      busy = false;
      render();
    }
  }

  function validateMapping() {
    const phoneMapped = Boolean(mapping.phone);
    if (!phoneMapped) {
      error = 'Mapeie a coluna Telefone — é obrigatória.';
      render();
      return false;
    }
    error = '';
    return true;
  }

  function goBack() {
    if (busy) return;
    const idx = STEPS.indexOf(step);
    if (idx <= 0) return;
    step = STEPS[idx - 1];
    error = '';
    render();
  }

  async function goNext() {
    if (busy) return;
    if (step === 'upload') {
      error = 'Selecione um arquivo CSV para continuar.';
      render();
      return;
    }
    if (step === 'map') {
      if (!validateMapping()) return;
      await loadPreview();
      return;
    }
    if (step === 'preview') {
      step = 'run';
      error = '';
      render();
      return;
    }
    if (step === 'run') {
      await executeRun();
    }
  }

  function reset() {
    step = 'upload';
    busy = false;
    error = '';
    importSession = null;
    columns = [];
    targetFields = [...DEFAULT_TARGET_FIELDS];
    mapping = {};
    preview = null;
    runResult = null;
  }

  function openWizard(nextSession, options = {}) {
    session = nextSession;
    onComplete = options.onComplete || null;
    reset();
    open = true;
    render();
  }

  function close() {
    open = false;
    render();
  }

  function bindModal() {
    const modal = $('engageContactImportModal');
    if (!modal || modal.dataset.bound === '1') return;
    modal.querySelector('[data-ech-import-close]')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    modal.dataset.bound = '1';
  }

  window.EngageContactImport = {
    open: openWizard,
    close,
    bindModal,
  };
})();
