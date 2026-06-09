/**
 * POS / Maquininhas — Configuração do operador, aba Pagamentos.
 * Contrato: POS-FRONT-CONTRATO (via /api/operator BFF).
 */
(function () {
  const adminApi = window.ReservaAiApi;

  const state = {
    mounted: false,
    terminals: [],
    transactions: [],
    branches: [],
    mpAvailable: null,
    mpLoading: false,
    mpRowBusy: new Set(),
    subTab: 'terminais',
    modalMode: 'create',
    loading: false,
    canMutate: true,
    dom: {},
  };

  function qs(sel) { return document.querySelector(sel); }

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  }

  function formatRelativeTime(iso) {
    if (!iso) return 'Sem registro';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Agora';
    if (mins < 60) return `Há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Há ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Há ${days} dia${days > 1 ? 's' : ''}`;
  }

  function terminalDeviceIcon() {
    return `<span class="pos-terminal-card-icon" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="4" y="2" width="16" height="20" rx="2"/>
        <path d="M8 6h8M8 10h8"/>
      </svg>
    </span>`;
  }

  function money(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(x);
  }

  function operatorPath(path) {
    if (path.startsWith('/api/operator/')) return path;
    return `/api/operator${path.startsWith('/') ? path : `/${path}`}`;
  }

  function getSelectedTenantId() {
    const el = qs('#operatorConfigTenant');
    return (el && el.value ? String(el.value).trim() : '') || '';
  }

  function tenantQuery(extra) {
    const tid = getSelectedTenantId();
    const params = new URLSearchParams();
    if (tid) params.set('tenantId', tid);
    if (extra && typeof extra === 'object') {
      Object.entries(extra).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== '') params.set(k, String(v));
      });
    }
    const s = params.toString();
    return s ? `?${s}` : '';
  }

  function asArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  async function api(method, path, options = {}) {
    if (!adminApi || typeof adminApi.request !== 'function') {
      throw new Error('Cliente de API indisponível.');
    }
    return adminApi.request(operatorPath(path), { method, ...options });
  }

  function terminalStatusLabel(s) {
    const map = {
      offline: 'Offline',
      online: 'Online',
      busy: 'Ocupado',
      inactive: 'Inativo',
    };
    return map[String(s || '').toLowerCase()] || String(s || '—');
  }

  function terminalStatusTone(s) {
    const k = String(s || '').toLowerCase();
    if (k === 'online') return 'green';
    if (k === 'offline') return 'neutral';
    if (k === 'busy') return 'amber';
    if (k === 'inactive') return 'muted';
    return 'neutral';
  }

  function mpModeLabel(t) {
    if (t.mpOperatingMode) return String(t.mpOperatingMode);
    if (t.mpPdvReady === true) return 'PDV';
    if (t.mpPdvReady === false) return 'Não PDV';
    return 'Não consultado';
  }

  function mpModeTone(t) {
    const mode = String(t.mpOperatingMode || '').toUpperCase();
    if (mode === 'PDV' || t.mpPdvReady === true) return 'green';
    if (t.mpOperatingMode) return 'amber';
    return 'muted';
  }

  function txStatusLabel(s) {
    const map = {
      pending: 'Pendente',
      waiting_payment: 'Aguardando pagamento',
      sent_to_terminal: 'Enviado ao terminal',
      waiting_customer: 'Aguardando cliente',
      processing: 'Processando',
      approved: 'Aprovada',
      canceled: 'Cancelada',
      failed: 'Falhou',
    };
    return map[String(s || '').toLowerCase()] || String(s || '—');
  }

  function txTone(s) {
    const k = String(s || '').toLowerCase();
    if (k === 'approved') return 'green';
    if (k === 'failed' || k === 'canceled') return 'red';
    return 'amber';
  }

  function unitLabel(t) {
    if (t.unitName) return t.unitName;
    if (!t.unitId) return '— (tenant)';
    return '—';
  }

  function setStatus(el, msg, tone = 'neutral') {
    if (!el) return;
    el.textContent = msg || '';
    el.dataset.tone = tone;
    if (msg) el.hidden = false;
  }

  function setMpStatus(msg, tone = 'neutral') {
    const el = state.dom.mpStatus;
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    setStatus(el, msg, tone);
  }

  function getFormUnitId() {
    return state.dom.formUnitId?.value?.trim() || '';
  }

  async function loadBranches() {
    const tid = getSelectedTenantId();
    if (!tid) {
      state.branches = [];
      return;
    }
    try {
      const data = await api('GET', `/branches${tenantQuery()}`);
      state.branches = Array.isArray(data) ? data : asArray(data);
    } catch (e) {
      state.branches = [];
    }
    fillUnitSelects();
  }

  function fillUnitSelects() {
    const filterEl = state.dom.unitFilter;
    const formUnit = state.dom.formUnitId;
    const branches = state.branches;
    if (filterEl) {
      const v = filterEl.value;
      filterEl.innerHTML = '<option value="">Todas</option>';
      branches.forEach((b) => {
        const id = String(b.id || b.branchId || '');
        if (!id) return;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = b.name || b.title || id;
        filterEl.appendChild(opt);
      });
      filterEl.value = branches.some((b) => String(b.id) === v) ? v : '';
    }
    if (formUnit) {
      const fv = formUnit.value;
      formUnit.innerHTML = '<option value="">Todo o tenant</option>';
      branches.forEach((b) => {
        const id = String(b.id || b.branchId || '');
        if (!id) return;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = b.name || b.title || id;
        formUnit.appendChild(opt);
      });
      if (fv && branches.some((b) => String(b.id) === fv)) formUnit.value = fv;
    }
  }

  async function loadTerminals() {
    const unitId = state.dom.unitFilter?.value?.trim() || '';
    const q = tenantQuery(unitId ? { unitId } : {});
    const raw = await api('GET', `/pos/terminals${q}`);
    state.terminals = asArray(raw);
  }

  async function loadTransactions() {
    const unitId = state.dom.unitFilter?.value?.trim() || '';
    const q = tenantQuery({ limit: 100, ...(unitId ? { unitId } : {}) });
    const raw = await api('GET', `/pos/transactions${q}`);
    state.transactions = asArray(raw);
  }

  async function loadMpAvailable() {
    if (!state.canMutate || state.modalMode !== 'create') return;
    const unitId = getFormUnitId();
    state.mpLoading = true;
    renderMpAvailableTable();
    if (state.dom.mpSummary) {
      state.dom.mpSummary.textContent = 'Carregando maquininhas da conta MP…';
    }
    setMpStatus('');
    try {
      const q = tenantQuery(unitId ? { unitId } : {});
      const payload = await api('GET', `/pos/terminals/mp-available${q}`);
      state.mpAvailable = payload && typeof payload === 'object' ? payload : null;
      const ready = Number(state.mpAvailable?.totalAvailableToAdd || 0);
      const pdv = Number(state.mpAvailable?.totalPdvActive || 0);
      const fromMp = Number(state.mpAvailable?.totalFromMp || 0);
      if (state.dom.mpSummary) {
        state.dom.mpSummary.textContent = `${ready} prontos para adicionar · ${pdv} em PDV · ${fromMp} na conta MP`;
      }
    } catch (e) {
      state.mpAvailable = null;
      if (state.dom.mpSummary) {
        state.dom.mpSummary.textContent = 'Não foi possível listar terminais na Mercado Pago.';
      }
      setMpStatus(e?.message || 'Verifique o token POS em Configurações → Pagamentos.', 'warn');
    } finally {
      state.mpLoading = false;
      renderMpAvailableTable();
    }
  }

  function renderMpActionCell(item, rowKey) {
    const busy = state.mpRowBusy.has(rowKey);
    if (item.alreadyRegistered) {
      const name = item.neuraflowTerminalName || 'terminal';
      return `<span class="pos-mp-muted">Já cadastrado (${escapeHtml(name)})</span>`;
    }
    if (item.needsPdvConversion) {
      return state.canMutate
        ? `<button type="button" class="pro-btn-ghost pos-btn-compact" data-pos-mp-action="convert" data-pos-mp-id="${escapeHtml(item.mpTerminalId)}" ${busy ? 'disabled' : ''}>Converter Point em PDV</button>`
        : '<span class="pos-mp-muted">Requer conversão PDV</span>';
    }
    if (item.mpPdvReady) {
      return state.canMutate
        ? `<button type="button" class="pro-btn-primary pos-btn-compact" data-pos-mp-action="add" data-pos-mp-id="${escapeHtml(item.mpTerminalId)}" ${busy ? 'disabled' : ''}>Adicionar</button>
           <button type="button" class="pro-btn-ghost pos-btn-compact" data-pos-mp-action="use" data-pos-mp-id="${escapeHtml(item.mpTerminalId)}" ${busy ? 'disabled' : ''}>Usar no formulário</button>`
        : '';
    }
    return `<button type="button" class="pro-btn-ghost pos-btn-compact" data-pos-mp-action="use" data-pos-mp-id="${escapeHtml(item.mpTerminalId)}" ${busy ? 'disabled' : ''}>Usar no formulário</button>`;
  }

  function renderMpAvailableTable() {
    const body = state.dom.mpTableBody;
    if (!body) return;
    if (state.mpLoading) {
      body.innerHTML = '<tr><td colspan="4" class="pos-table-empty">Carregando…</td></tr>';
      return;
    }
    const rows = Array.isArray(state.mpAvailable?.terminals) ? state.mpAvailable.terminals : [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4" class="pos-table-empty">Nenhuma maquininha ativa na conta Mercado Pago para esta unidade.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((item) => {
      const rowKey = String(item.mpTerminalId || '');
      const mode = String(item.operatingMode || '—').toUpperCase();
      const modeTone = mode === 'PDV' || item.mpPdvReady ? 'green' : 'amber';
      return `
        <tr class="pos-mp-row">
          <td class="pos-table-mono" data-label="ID MP">${escapeHtml(item.mpTerminalId || '—')}</td>
          <td data-label="Modo"><span class="pos-pill pos-pill--${escapeHtml(modeTone)}">${escapeHtml(mode)}</span></td>
          <td data-label="Nome sugerido">${escapeHtml(item.suggestedName || '—')}</td>
          <td class="pos-mp-actions" data-label="Ação">${renderMpActionCell(item, rowKey)}</td>
        </tr>
      `;
    }).join('');
  }

  function findMpItem(mpTerminalId) {
    const rows = Array.isArray(state.mpAvailable?.terminals) ? state.mpAvailable.terminals : [];
    return rows.find((item) => String(item.mpTerminalId) === String(mpTerminalId));
  }

  function clearMpFormExtras() {
    if (state.dom.formExternalStoreId) state.dom.formExternalStoreId.value = '';
    if (state.dom.formExternalPosId) state.dom.formExternalPosId.value = '';
  }

  function useMpInForm(item) {
    if (!item) return;
    state.dom.formName.value = item.suggestedName || item.mpTerminalId || '';
    state.dom.formExternalId.value = item.mpTerminalId || '';
    if (state.dom.formExternalStoreId) state.dom.formExternalStoreId.value = item.storeId || '';
    if (state.dom.formExternalPosId) state.dom.formExternalPosId.value = item.posId || item.externalPosId || '';
    setMpStatus('Dados preenchidos no cadastro manual. Revise e clique em Criar.', 'success');
    state.dom.modalManualSection?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }

  async function addTerminalFromMp(item) {
    const tenant = getSelectedTenantId();
    if (!tenant || !item) return;
    const unitVal = getFormUnitId();
    const rowKey = String(item.mpTerminalId || '');
    state.mpRowBusy.add(rowKey);
    renderMpAvailableTable();
    try {
      const body = {
        provider: 'mercado_pago',
        name: String(item.suggestedName || item.mpTerminalId || '').trim(),
        externalTerminalId: item.mpTerminalId,
        ...(item.storeId ? { externalStoreId: item.storeId } : {}),
        ...(item.posId || item.externalPosId ? { externalPosId: item.posId || item.externalPosId } : {}),
        ...(unitVal ? { unitId: unitVal } : {}),
      };
      await api('POST', `/pos/terminals${tenantQuery()}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      closeModal();
      await refresh();
      setStatus(state.dom.termStatus, 'Terminal adicionado. Marque Online na tabela para liberar cobranças.', 'success');
    } catch (e) {
      setMpStatus(e?.message || 'Falha ao adicionar terminal.', 'warn');
    } finally {
      state.mpRowBusy.delete(rowKey);
      renderMpAvailableTable();
    }
  }

  async function convertMpToPdv(item) {
    if (!item?.mpTerminalId) return;
    const rowKey = String(item.mpTerminalId);
    state.mpRowBusy.add(rowKey);
    renderMpAvailableTable();
    try {
      const unitVal = getFormUnitId();
      const payload = await api('POST', `/pos/terminals/mp-convert-pdv${tenantQuery()}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpTerminalId: item.mpTerminalId,
          ...(unitVal ? { unitId: unitVal } : {}),
        }),
      });
      const hint = payload?.hint || 'Modo PDV ativado. Reinicie a maquininha se o modo não aparecer de imediato.';
      setMpStatus(hint, 'success');
      await loadMpAvailable();
    } catch (e) {
      setMpStatus(e?.message || 'Falha ao converter para PDV.', 'warn');
    } finally {
      state.mpRowBusy.delete(rowKey);
      renderMpAvailableTable();
    }
  }

  function syncStatusMeta(t) {
    if (t.mpTerminalSyncedAt) {
      return { label: 'Sincronizado', sub: formatRelativeTime(t.mpTerminalSyncedAt), tone: 'ok' };
    }
    const st = String(t.status || '').toLowerCase();
    if (st === 'online' || st === 'busy') {
      return { label: 'Sincronizando…', sub: 'Aguardando confirmação MP', tone: 'pending' };
    }
    return { label: 'Erro na sincronização', sub: 'Atualize ou verifique credenciais', tone: 'error' };
  }

  function renderTerminalsKpi() {
    const el = state.dom.kpiStrip;
    if (!el) return;
    const total = state.terminals.length;
    if (!total) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    const online = state.terminals.filter((t) => String(t.status || '').toLowerCase() === 'online').length;
    const syncing = state.terminals.filter((t) => !t.mpTerminalSyncedAt && String(t.status || '').toLowerCase() !== 'offline').length;
    const lastTimes = state.terminals
      .map((t) => t.lastSeenAt)
      .filter(Boolean)
      .map((iso) => new Date(iso).getTime())
      .filter((n) => Number.isFinite(n));
    const lastLabel = lastTimes.length
      ? formatRelativeTime(new Date(Math.max(...lastTimes)).toISOString())
      : '—';
    const items = [
      { label: 'Conectados', value: String(total), tone: 'blue' },
      { label: 'Online', value: String(online), tone: 'green' },
      { label: 'Sincronizando', value: String(syncing), tone: 'amber' },
      { label: 'Última atividade', value: lastLabel, tone: 'purple' },
    ];
    el.innerHTML = items.map((item) => `
      <div class="pos-kpi-card pos-kpi-card--${escapeHtml(item.tone)}">
        <div class="pos-kpi-card-copy">
          <span class="pos-kpi-card-value">${escapeHtml(item.value)}</span>
          <span class="pos-kpi-card-label">${escapeHtml(item.label)}</span>
        </div>
      </div>
    `).join('');
  }

  function renderTerminalRows() {
    const grid = state.dom.terminalsGrid || state.dom.tableTerminals;
    if (!grid) return;
    renderTerminalsKpi();
    if (!state.terminals.length) {
      grid.innerHTML = '<p class="pos-terminals-grid-empty">Nenhuma maquininha conectada. Use <strong>Conectar maquininha</strong> para começar.</p>';
      return;
    }
    grid.innerHTML = state.terminals.map((t) => {
      const statusTone = terminalStatusTone(t.status);
      const statusLabel = terminalStatusLabel(t.status);
      const sync = syncStatusMeta(t);
      const mpLabel = mpModeLabel(t);
      const idShort = t.externalTerminalId
        ? String(t.externalTerminalId).slice(0, 18) + (String(t.externalTerminalId).length > 18 ? '…' : '')
        : '—';
      return `
        <article class="pos-terminal-card" data-pos-terminal-id="${escapeHtml(t.id)}">
          <div class="pos-terminal-card-status-row">
            <span class="pos-terminal-status-badge pos-terminal-status-badge--lg pos-terminal-status-badge--${escapeHtml(statusTone)}">${escapeHtml(statusLabel)}</span>
            ${state.canMutate ? `
              <details class="pos-terminal-card-menu pos-terminal-card-menu--icon">
                <summary class="pos-terminal-menu-trigger" aria-label="Ações do terminal">⋯</summary>
                <div class="pos-terminal-card-menu-panel">
                  <button type="button" data-pos-action="edit" data-pos-id="${escapeHtml(t.id)}">Editar</button>
                  <button type="button" data-pos-action="sync-mp" data-pos-id="${escapeHtml(t.id)}">Atualizar MP</button>
                  <button type="button" class="is-danger" data-pos-action="delete" data-pos-id="${escapeHtml(t.id)}">Remover</button>
                </div>
              </details>
            ` : ''}
          </div>
          <div class="pos-terminal-card-main">
            ${terminalDeviceIcon()}
            <div class="pos-terminal-card-head">
              <h3 class="pos-terminal-card-title">${escapeHtml(t.name || 'Terminal')}</h3>
              <p class="pos-terminal-card-sub">${escapeHtml(unitLabel(t))}</p>
              <p class="pos-terminal-card-id">${escapeHtml((t.provider || 'mercado_pago').replace(/_/g, ' '))} · ${escapeHtml(idShort)}</p>
            </div>
          </div>
          <div class="pos-terminal-card-stats">
            <div class="pos-terminal-stat">
              <span class="pos-terminal-stat-label">Última atividade</span>
              <span class="pos-terminal-stat-value">${escapeHtml(formatRelativeTime(t.lastSeenAt))}</span>
            </div>
            <div class="pos-terminal-stat pos-terminal-stat--sync pos-terminal-stat--${escapeHtml(sync.tone)}">
              <span class="pos-terminal-stat-label">Sync Mercado Pago</span>
              <span class="pos-terminal-stat-value">${escapeHtml(sync.label)}</span>
              <span class="pos-terminal-stat-sub">${escapeHtml(sync.sub)}</span>
            </div>
            <div class="pos-terminal-stat">
              <span class="pos-terminal-stat-label">Modo MP</span>
              <span class="pos-terminal-stat-value">${escapeHtml(mpLabel)}</span>
            </div>
          </div>
          ${state.canMutate ? `
            <div class="pos-terminal-card-actions">
              <button type="button" class="pos-terminal-action pos-terminal-action--online" data-pos-action="online" data-pos-id="${escapeHtml(t.id)}">Online</button>
              <button type="button" class="pos-terminal-action pos-terminal-action--offline" data-pos-action="offline" data-pos-id="${escapeHtml(t.id)}">Offline</button>
            </div>
          ` : '<p class="pos-readonly">Somente leitura</p>'}
        </article>
      `;
    }).join('');
  }

  function renderTransactionRows() {
    const body = state.dom.tableTx;
    if (!body) return;
    if (!state.transactions.length) {
      body.innerHTML = '<tr><td colspan="6" class="pos-table-empty">Nenhuma transação POS no período.</td></tr>';
      return;
    }
    body.innerHTML = state.transactions.map((x) => {
      const cust = x.booking
        ? `${x.booking.clienteNome || '—'}\n${x.booking.telefone || ''}`
        : '—';
      const agenda = x.booking ? (x.booking.servico || '—') : '—';
      const term = x.terminal?.name || '—';
      return `
      <tr class="pos-table-data-row">
        <td class="pos-stack" data-label="Cliente">${escapeHtml(cust).replace(/\n/g, '<br/>')}</td>
        <td data-label="Agenda">${escapeHtml(agenda)}</td>
        <td data-label="Terminal">${escapeHtml(term)}</td>
        <td data-label="Valor">${escapeHtml(money(x.amount))}</td>
        <td data-label="Status"><span class="pos-pill pos-pill--${escapeHtml(txTone(x.status))}">${escapeHtml(txStatusLabel(x.status))}</span></td>
        <td data-label="Data">${escapeHtml(formatDateTime(x.createdAt))}</td>
      </tr>
    `;
    }).join('');
  }

  function setModalLayout(mode) {
    const modal = state.dom.modal;
    const isCreate = mode === 'create';
    if (modal) {
      modal.classList.toggle('pos-modal--add', isCreate);
      modal.classList.toggle('pos-modal--edit', !isCreate);
    }
    if (state.dom.mpImportSection) state.dom.mpImportSection.hidden = !isCreate;
    if (state.dom.modalManualDivider) state.dom.modalManualDivider.hidden = !isCreate;
  }

  function openModal(mode, terminal) {
    state.modalMode = mode;
    const backdrop = state.dom.modalBackdrop;
    const title = state.dom.modalTitle;
    const submit = state.dom.modalSubmit;
    const editOnly = state.dom.accessWrap;
    if (!backdrop) return;

    qs('#posTerminalEditId').value = mode === 'edit' && terminal ? terminal.id : '';
    state.dom.formName.value = terminal?.name || '';
    state.dom.formSerial.value = terminal?.serialNumber || '';
    state.dom.formExternalId.value = terminal?.externalTerminalId || '';
    state.dom.formUnitId.value = terminal?.unitId || '';
    clearMpFormExtras();
    if (state.dom.formAccessToken) state.dom.formAccessToken.value = '';

    setModalLayout(mode);

    if (mode === 'create') {
      if (title) title.textContent = 'Adicionar terminal';
      if (submit) submit.textContent = 'Criar';
      if (editOnly) editOnly.hidden = true;
      backdrop.hidden = false;
      void loadMpAvailable();
    } else {
      if (title) title.textContent = 'Editar terminal';
      if (submit) submit.textContent = 'Guardar';
      if (editOnly) editOnly.hidden = false;
      backdrop.hidden = false;
    }
  }

  function closeModal() {
    if (state.dom.modalBackdrop) state.dom.modalBackdrop.hidden = true;
    state.mpAvailable = null;
    state.mpRowBusy.clear();
    setMpStatus('');
  }

  async function submitModal() {
    const tenant = getSelectedTenantId();
    if (!tenant) {
      alert('Selecione uma empresa no topo.');
      return;
    }
    const name = String(state.dom.formName.value || '').trim();
    if (!name) {
      alert('Informe o nome do terminal.');
      return;
    }
    const unitVal = getFormUnitId();
    const sn = state.dom.formSerial.value.trim();
    const ext = state.dom.formExternalId.value.trim();
    const storeId = state.dom.formExternalStoreId?.value?.trim() || '';
    const posId = state.dom.formExternalPosId?.value?.trim() || '';
    const body = {
      provider: 'mercado_pago',
      name,
      ...(sn ? { serialNumber: sn } : {}),
      ...(ext ? { externalTerminalId: ext } : {}),
      ...(storeId ? { externalStoreId: storeId } : {}),
      ...(posId ? { externalPosId: posId } : {}),
      ...(unitVal ? { unitId: unitVal } : {}),
    };
    const editId = qs('#posTerminalEditId').value.trim();

    try {
      state.loading = true;
      if (state.modalMode === 'create') {
        await api('POST', `/pos/terminals${tenantQuery()}`, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        const patch = {
          name,
          unitId: unitVal || null,
          serialNumber: state.dom.formSerial.value.trim() || null,
          externalTerminalId: state.dom.formExternalId.value.trim() || null,
        };
        const tok = state.dom.formAccessToken?.value?.trim();
        if (tok) patch.accessToken = tok;
        await api('PATCH', `/pos/terminals/${encodeURIComponent(editId)}${tenantQuery()}`, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      }
      closeModal();
      await refresh();
      const msg = state.modalMode === 'create'
        ? 'Terminal criado. Marque Online na tabela para liberar cobranças.'
        : 'Terminal atualizado.';
      setStatus(state.dom.termStatus, msg, 'success');
    } catch (e) {
      alert(e?.message || 'Falha ao salvar terminal.');
    } finally {
      state.loading = false;
    }
  }

  async function syncTerminalMp(id) {
    try {
      const payload = await api('POST', `/pos/terminals/${encodeURIComponent(id)}/sync-mp${tenantQuery()}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await refresh();
      const hint = payload?.hint || 'Sincronização com Mercado Pago concluída.';
      setStatus(state.dom.termStatus, hint, 'success');
    } catch (e) {
      alert(e?.message || 'Falha ao sincronizar com Mercado Pago.');
    }
  }

  async function setTerminalStatus(id, status) {
    try {
      await api('PATCH', `/pos/terminals/${encodeURIComponent(id)}/status${tenantQuery()}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refresh();
      setStatus(state.dom.termStatus, 'Status NeuraFlow atualizado.', 'success');
    } catch (e) {
      alert(e?.message || 'Falha ao alterar status.');
    }
  }

  async function deleteTerminal(id) {
    if (!window.confirm('Desativar este terminal? Ele deixará de aparecer na listagem.')) return;
    try {
      await api('DELETE', `/pos/terminals/${encodeURIComponent(id)}${tenantQuery()}`);
      await refresh();
      setStatus(state.dom.termStatus, 'Terminal desativado.', 'success');
    } catch (e) {
      alert(e?.message || 'Falha ao excluir.');
    }
  }

  function applySubTab(tab) {
    state.subTab = tab;
    document.querySelectorAll('[data-pos-subtab]').forEach((btn) => {
      const on = btn.dataset.posSubtab === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    const termPanel = state.dom.panelTerminals;
    const txPanel = state.dom.panelTransactions;
    if (termPanel) termPanel.hidden = tab !== 'terminais';
    if (txPanel) txPanel.hidden = tab !== 'transacoes';
  }

  async function refresh() {
    const tenant = getSelectedTenantId();
    if (!tenant) {
      setStatus(state.dom.termStatus, 'Selecione uma empresa no campo Empresa acima.', 'warn');
      setStatus(state.dom.txStatus, '—', 'neutral');
      state.terminals = [];
      state.transactions = [];
      renderTerminalRows();
      renderTransactionRows();
      return;
    }
    try {
      setStatus(state.dom.termStatus, 'Carregando…', 'neutral');
      await loadBranches();
      await loadTerminals();
      renderTerminalRows();
      setStatus(state.dom.termStatus, `${state.terminals.length} terminal(is).`, 'success');

      setStatus(state.dom.txStatus, 'Carregando transações…', 'neutral');
      await loadTransactions();
      renderTransactionRows();
      setStatus(state.dom.txStatus, `${state.transactions.length} transação(ões).`, 'success');
    } catch (e) {
      setStatus(state.dom.termStatus, e?.message || 'Erro ao carregar terminais.', 'warn');
      setStatus(state.dom.txStatus, '—', 'neutral');
    }
  }

  function resolveMutatePermission() {
    try {
      const session = window.ReservaAiAuth?.getSession?.() || window.__lastAdminSession;
      const g = String(session?.permissionGroup || '').toLowerCase();
      const role = String(session?.role || '').toLowerCase();
      state.canMutate = ['admin', 'platform_admin', 'owner', 'tenant_admin'].includes(g)
        || ['admin', 'platform_admin', 'owner', 'tenant_admin'].includes(role)
        || g === '';
    } catch (e) {
      state.canMutate = true;
    }
    if (state.dom.newBtn) state.dom.newBtn.hidden = !state.canMutate;
  }

  function bindEvents() {
    state.dom.refresh?.addEventListener('click', () => { void refresh(); });
    state.dom.newBtn?.addEventListener('click', () => {
      if (!getSelectedTenantId()) {
        alert('Selecione uma empresa.');
        return;
      }
      fillUnitSelects();
      openModal('create', null);
    });
    state.dom.unitFilter?.addEventListener('change', () => { void refresh(); });
    state.dom.formUnitId?.addEventListener('change', () => {
      if (state.modalMode === 'create' && !state.dom.modalBackdrop?.hidden) {
        void loadMpAvailable();
      }
    });
    state.dom.mpRefresh?.addEventListener('click', () => { void loadMpAvailable(); });

    qs('#operatorConfigTenant')?.addEventListener('change', () => {
      const tab = qs('[data-operator-tab].is-active')?.dataset.operatorTab;
      if (tab === 'pos' || tab === 'pagamentos') void refresh();
    });

    document.querySelectorAll('[data-pos-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => applySubTab(btn.dataset.posSubtab || 'terminais'));
    });

    state.dom.modalClose?.addEventListener('click', closeModal);
    state.dom.modalCancel?.addEventListener('click', closeModal);
    state.dom.modalSubmit?.addEventListener('click', () => { void submitModal(); });
    state.dom.modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === state.dom.modalBackdrop) closeModal();
    });

    state.dom.mpTableBody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pos-mp-action]');
      if (!btn) return;
      const mpId = btn.getAttribute('data-pos-mp-id');
      const action = btn.getAttribute('data-pos-mp-action');
      const item = findMpItem(mpId);
      if (!item) return;
      if (action === 'add') void addTerminalFromMp(item);
      if (action === 'convert') void convertMpToPdv(item);
      if (action === 'use') useMpInForm(item);
    });

    const onTerminalGridClick = (e) => {
      const btn = e.target.closest('[data-pos-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-pos-id');
      const action = btn.getAttribute('data-pos-action');
      const t = state.terminals.find((x) => String(x.id) === String(id));
      if (action === 'edit' && t) {
        fillUnitSelects();
        openModal('edit', t);
      }
      if (action === 'sync-mp') void syncTerminalMp(id);
      if (action === 'online') void setTerminalStatus(id, 'online');
      if (action === 'offline') void setTerminalStatus(id, 'offline');
      if (action === 'delete') void deleteTerminal(id);
    };
    state.dom.terminalsGrid?.addEventListener('click', onTerminalGridClick);
    state.dom.tableTerminals?.addEventListener('click', onTerminalGridClick);
  }

  function mount() {
    if (state.mounted) return true;
    const root = qs('#posTerminalsRoot');
    if (!root) return false;
    state.dom = {
      root,
      unitFilter: qs('#posTerminalUnitFilter'),
      newBtn: qs('#posTerminalNewBtn'),
      refresh: qs('#posTerminalsRefresh'),
      termStatus: qs('#posTerminalsStatus'),
      txStatus: qs('#posTransactionsStatus'),
      kpiStrip: qs('#posTerminalsKpi'),
      terminalsGrid: qs('#posTerminalsGrid'),
      tableTerminals: qs('#posTerminalsTableBody'),
      tableTx: qs('#posTransactionsTableBody'),
      panelTerminals: qs('#posTerminalsPanel'),
      panelTransactions: qs('#posTransactionsPanel'),
      modal: qs('#posTerminalModal'),
      modalBackdrop: qs('#posTerminalModalBackdrop'),
      modalTitle: qs('#posTerminalModalTitle'),
      modalClose: qs('#posTerminalModalClose'),
      modalCancel: qs('#posTerminalModalCancel'),
      modalSubmit: qs('#posTerminalModalSubmit'),
      mpImportSection: qs('#posMpImportSection'),
      modalManualDivider: qs('#posModalManualDivider'),
      modalManualSection: qs('#posModalManualSection'),
      mpSummary: qs('#posMpSummary'),
      mpStatus: qs('#posMpStatus'),
      mpRefresh: qs('#posMpRefreshList'),
      mpTableBody: qs('#posMpAvailableTableBody'),
      formName: qs('#posTerminalFormName'),
      formUnitId: qs('#posTerminalFormUnitId'),
      formSerial: qs('#posTerminalFormSerial'),
      formExternalId: qs('#posTerminalFormExternalId'),
      formExternalStoreId: qs('#posTerminalFormExternalStoreId'),
      formExternalPosId: qs('#posTerminalFormExternalPosId'),
      formAccessToken: qs('#posTerminalFormAccessToken'),
      accessWrap: qs('#posTerminalAccessTokenWrap'),
    };
    resolveMutatePermission();
    bindEvents();
    applySubTab('terminais');
    if (state.dom.modalBackdrop && state.dom.modalBackdrop.parentElement !== document.body) {
      document.body.appendChild(state.dom.modalBackdrop);
    }
    state.mounted = true;
    return true;
  }

  function activate() {
    if (!mount()) return;
    resolveMutatePermission();
    void refresh();
  }

  window.ReservaAiPosTerminalsAdmin = {
    mount,
    activate,
    refresh,
    getBranches: () => state.branches.slice(),
  };
}());
