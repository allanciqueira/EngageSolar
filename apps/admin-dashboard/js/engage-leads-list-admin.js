/**
 * Engage Solar — Tela Leads (lista tabular).
 */
(function () {
  const api = () => window.EngageLeadsListApi;
  const pipeline = () => window.EngagePipelineApi;
  const drawer = () => window.EngagePipelineLeadDrawer;

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>',
    campaign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11v2a4 4 0 0 0 4 4h1"/><path d="M7 15V9a5 5 0 0 1 10 0v6"/><path d="M11 19h2"/></svg>',
    google: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  };

  const KPI_SVG = {
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    headset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11v2a4 4 0 0 0 4 4h1"/><path d="M7 15V9a5 5 0 0 1 10 0v6"/><path d="M21 11v2a4 4 0 0 1-4 4h-1"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
  };

  const AVATAR_PALETTES = [
    { bg: '#dbeafe', fg: '#1d4ed8' },
    { bg: '#dcfce7', fg: '#15803d' },
    { bg: '#fce7f3', fg: '#be185d' },
    { bg: '#ffedd5', fg: '#c2410c' },
    { bg: '#e0e7ff', fg: '#4338ca' },
    { bg: '#f3e8ff', fg: '#7e22ce' },
    { bg: '#ccfbf1', fg: '#0f766e' },
  ];

  const state = {
    active: false,
    session: null,
    loading: false,
    error: '',
    usingMock: false,
    data: null,
    quickTab: 'all',
    filtersOpen: false,
    filters: {
      q: '',
      page: 1,
      limit: 20,
      sortBy: 'updatedAt',
      sortDir: 'desc',
      status: '',
      assignedTo: '',
      temperature: '',
      source: '',
    },
    searchDebounceId: null,
    selectedLeadId: null,
    dom: {},
  };

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(v) {
    return escapeHtml(v);
  }

  function avatarPalette(seed) {
    const s = String(seed || '?');
    const hash = s.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  }

  function leadAvatarHtml(name, size) {
    const pal = avatarPalette(name);
    const initials = pipeline()?.initials?.(name) || '?';
    const cls = size === 'lg' ? 'ell-lead-avatar ell-lead-avatar--lg' : 'ell-lead-avatar';
    return `<span class="${cls}" style="background:${pal.bg};color:${pal.fg}">${escapeHtml(initials)}</span>`;
  }

  function pctLabel(value, total, key) {
    if (key === 'totalLeads') return '100% do total';
    const pct = pctOf(value, total);
    return pct ? `${pct} do total` : '';
  }

  function formatNum(n) {
    return Number(n || 0).toLocaleString('pt-BR');
  }

  function pctOf(value, total) {
    const t = Number(total || 0);
    if (!t) return '';
    return `${Math.round((Number(value || 0) / t) * 100)}%`;
  }

  function formatPhoneCard(phone) {
    const raw = String(phone || '').replace(/\D/g, '');
    if (raw.length >= 12 && raw.startsWith('55')) {
      const ddd = raw.slice(2, 4);
      const rest = raw.slice(4);
      if (rest.length >= 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
    }
    return pipeline()?.formatPhoneDisplay?.(phone) || phone || '—';
  }

  function applyQuickTab(tabId) {
    const tab = (api()?.QUICK_TABS || []).find((t) => t.id === tabId);
    state.quickTab = tabId;
    state.filters.page = 1;
    state.filters.assignedTo = tab?.assignedTo || '';
    state.filters.temperature = tab?.temperature || '';
    if (tabId === 'all') {
      state.filters.assignedTo = '';
      if (!state.filters.status) state.filters.temperature = state.filters.temperature || '';
    }
    if (tabId !== 'hot' && tabId !== 'cold') {
      if (tabId === 'all') state.filters.temperature = '';
    }
  }

  function applySummaryFilter(cardDef) {
    if (!cardDef?.filter) {
      state.filters.status = '';
      state.filters.hasQualification = '';
      state.filters.qualificationMax = '';
      state.quickTab = 'all';
    } else {
      state.filters.page = 1;
      state.quickTab = 'all';
      Object.entries(cardDef.filter).forEach(([k, v]) => {
        state.filters[k] = v;
      });
    }
    void loadData();
  }

  function originIcon(source) {
    const key = String(source || '').toUpperCase();
    if (key === 'INBOUND') return ICONS.wa;
    if (key === 'AI' || key === 'CAMPAIGN') return ICONS.campaign;
    if (key === 'SIMULATION') return ICONS.google;
    return ICONS.campaign;
  }

  function kpiIcon(name) {
    return KPI_SVG[name] || KPI_SVG.users;
  }

  function renderSummaryCards() {
    const summary = state.data?.summary || {};
    const total = Number(summary.totalLeads || 0);
    return `<div class="ell-kpi-grid">${(api()?.SUMMARY_CARDS || []).map((def) => {
      const value = summary[def.key] ?? 0;
      const pct = def.key === 'totalLeads' ? '100%' : pctOf(value, total);
      return `
        <button type="button" class="ell-kpi-card" data-tone="${escapeAttr(def.tone)}" data-summary-filter="${escapeAttr(def.key)}">
          <span class="ell-kpi-icon" aria-hidden="true">${kpiIcon(def.icon)}</span>
          <span class="ell-kpi-body">
            <span class="ell-kpi-label">${escapeHtml(def.label)}</span>
            <strong class="ell-kpi-value">${formatNum(value)}</strong>
            ${pct ? `<small class="ell-kpi-pct">${escapeHtml(pctLabel(value, total, def.key))}</small>` : ''}
          </span>
        </button>`;
    }).join('')}</div>`;
  }

  function renderQuickTabs() {
    return `<div class="ell-quick-tabs" role="tablist">${(api()?.QUICK_TABS || []).map((tab) => `
      <button type="button" class="ell-quick-tab${state.quickTab === tab.id ? ' is-active' : ''}" data-quick-tab="${escapeAttr(tab.id)}" role="tab">
        ${escapeHtml(tab.label)}
      </button>`).join('')}</div>`;
  }

  function tempChip(temp) {
    const key = String(temp || '').toUpperCase();
    const meta = pipeline()?.LEAD_TEMPERATURE?.[key];
    if (!meta) return '<span class="ell-muted">—</span>';
    const label = key === 'HOT' || key === 'WARM' || key === 'COLD' ? key : meta.label;
    return `<span class="ell-temp" data-tone="${escapeAttr(meta.tone)}">${meta.cardIcon || meta.icon} ${escapeHtml(label)}</span>`;
  }

  function scorePill(score) {
    if (score == null || !Number.isFinite(Number(score))) return '<span class="ell-muted">—</span>';
    const tone = pipeline()?.scoreTone?.(score) || 'neutral';
    return `<span class="ell-score-pill" data-tone="${escapeAttr(tone)}">${Math.round(Number(score))}</span>`;
  }

  function originCell(row) {
    return `
      <span class="ell-origin">
        <span class="ell-origin-icon" data-source="${escapeAttr(row.source || '')}">${originIcon(row.source)}</span>
        <span class="ell-origin-label">${escapeHtml(row.originLabel)}</span>
      </span>`;
  }

  function interactionCell(row) {
    const time = api()?.formatRelativeTime?.(row.lastInteractionAt) || '—';
    let who = row.lastInteractionBy || '';
    if (!who) {
      const dir = String(row.lastMessageDirection || '').toLowerCase();
      if (dir === 'outbound') who = 'Você';
      else if (dir === 'inbound') who = 'Cliente';
    }
    return `
      <div class="ell-interaction">
        <span class="ell-time">${escapeHtml(time)}</span>
        ${who ? `<small class="ell-interaction-who">${escapeHtml(who)}</small>` : ''}
      </div>`;
  }

  function qualCell(row) {
    const pct = row.qualificationPct;
    if (pct == null) return '<span class="ell-muted">—</span>';
    const h = row.qualificationHighlights || {};
    const tip = [
      h.averageConsumptionKwh != null ? `${h.averageConsumptionKwh} kWh` : null,
      h.paymentMethod,
      h.installationTimeframe,
    ].filter(Boolean).join(' · ');
    return `
      <div class="ell-qual-cell" title="${escapeAttr(tip)}">
        <span class="ell-qual-pct">${pct}%</span>
        <div class="ell-qual-track"><span style="width:${pct}%"></span></div>
      </div>`;
  }

  function assigneeCell(row) {
    if (!row.assignedAgentName) return '<span class="ell-muted ell-unassigned">Sem responsável</span>';
    const pal = avatarPalette(row.assignedAgentName);
    const avatar = row.assignedAgentAvatarUrl
      ? `<img class="ell-assignee-photo" src="${escapeAttr(row.assignedAgentAvatarUrl)}" alt="" />`
      : `<span class="ell-assignee-avatar" style="background:${escapeAttr(row.assignedAgentColor || pal.fg)}">${escapeHtml(pipeline()?.initials?.(row.assignedAgentName) || '?')}</span>`;
    return `
      <span class="ell-assignee">
        ${avatar}
        <span class="ell-assignee-name">${escapeHtml(row.assignedAgentName)}</span>
      </span>`;
  }

  function renderSortTh(sortKey, label) {
    const active = state.filters.sortBy === sortKey;
    const dir = String(state.filters.sortDir || 'desc').toLowerCase();
    const ariaSort = active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const icon = active ? (dir === 'asc' ? '▲' : '▼') : '⇅';
    return `
      <th scope="col">
        <button type="button" class="ell-sort-btn${active ? ' is-active' : ''}" data-sort-col="${escapeAttr(sortKey)}" aria-sort="${escapeAttr(ariaSort)}">
          <span>${escapeHtml(label)}</span>
          <span class="ell-sort-icon" aria-hidden="true">${icon}</span>
        </button>
      </th>`;
  }

  function toggleColumnSort(sortKey) {
    if (!sortKey) return;
    if (state.filters.sortBy === sortKey) {
      state.filters.sortDir = state.filters.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.filters.sortBy = sortKey;
      state.filters.sortDir = api()?.defaultSortDir?.(sortKey) || 'desc';
    }
    state.filters.page = 1;
    loadData();
  }

  function renderTable() {
    const rows = state.data?.leads || [];
    if (!rows.length && !state.loading) {
      return '<div class="ell-empty">Nenhum lead encontrado para os filtros atuais.</div>';
    }
    const sortFields = api()?.TABLE_SORT_FIELDS || {};
    return `
      <div class="ell-table-wrap">
        <table class="ell-table">
          <thead>
            <tr>
              <th class="ell-th-check"><span class="ell-sr-only">Selecionar</span></th>
              ${renderSortTh('name', sortFields.name?.label || 'Lead')}
              ${renderSortTh('source', sortFields.source?.label || 'Origem')}
              ${renderSortTh('city', sortFields.city?.label || 'Cidade')}
              ${renderSortTh('leadScore', sortFields.leadScore?.label || 'Score')}
              ${renderSortTh('temperature', sortFields.temperature?.label || 'Temperatura')}
              ${renderSortTh('qualificationCompletion', sortFields.qualificationCompletion?.label || 'Qualificação')}
              ${renderSortTh('assignedAgentName', sortFields.assignedAgentName?.label || 'Responsável')}
              ${renderSortTh('lastInteractionAt', sortFields.lastInteractionAt?.label || 'Última interação')}
              ${renderSortTh('status', sortFields.status?.label || 'Status')}
              <th class="ell-th-actions"><span class="ell-sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr class="ell-row${state.selectedLeadId === row.id ? ' is-selected' : ''}" data-lead-id="${escapeAttr(row.id)}" tabindex="0" role="button">
                <td class="ell-td-check" data-stop-row>
                  <input type="checkbox" class="ell-row-check" aria-label="Selecionar ${escapeAttr(row.name)}" data-stop-row />
                </td>
                <td>
                  <div class="ell-lead-cell">
                    ${leadAvatarHtml(row.name)}
                    <div class="ell-lead-identity">
                      <strong title="${escapeAttr(row.name)}">${escapeHtml(row.name)}</strong>
                      <small title="${escapeAttr(row.phone)}">${escapeHtml(formatPhoneCard(row.phone))}</small>
                    </div>
                  </div>
                </td>
                <td>${originCell(row)}</td>
                <td>${escapeHtml(row.city || '—')}</td>
                <td>${scorePill(row.score)}</td>
                <td>${tempChip(row.temperature)}</td>
                <td>${qualCell(row)}</td>
                <td>${assigneeCell(row)}</td>
                <td>${interactionCell(row)}</td>
                <td><span class="ell-status" data-tone="${escapeAttr(api()?.statusTone?.(row.status))}">${escapeHtml(api()?.statusLabel?.(row.status))}</span></td>
                <td class="ell-td-actions" data-stop-row>
                  <button type="button" class="ell-row-menu" aria-label="Ações do lead" data-stop-row>${ICONS.menu}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderPagination() {
    const p = state.data?.pagination || {};
    const page = Number(p.page || 1);
    const totalPages = Number(p.totalPages || 1);
    const total = Number(p.total || 0);
    const limit = Number(p.limit || 20);
    const from = total ? (page - 1) * limit + 1 : 0;
    const to = Math.min(page * limit, total);
    const pages = [];
    const maxButtons = Math.min(totalPages, 5);
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    return `
      <footer class="ell-pagination">
        <span class="ell-pagination-meta">${from}-${to} de ${formatNum(total)} leads</span>
        <div class="ell-pagination-actions">
          <button type="button" class="ell-page-btn" id="ellPagePrev"${page <= 1 ? ' disabled' : ''} aria-label="Página anterior">‹</button>
          ${pages.map((n) => `
            <button type="button" class="ell-page-num${n === page ? ' is-active' : ''}" data-page-jump="${n}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`).join('')}
          <button type="button" class="ell-page-btn" id="ellPageNext"${page >= totalPages ? ' disabled' : ''} aria-label="Próxima página">›</button>
          <select id="ellPageSize" class="ell-page-size" aria-label="Itens por página">
            ${[10, 20, 50].map((n) => `<option value="${n}"${limit === n ? ' selected' : ''}>${n} por página</option>`).join('')}
          </select>
        </div>
      </footer>`;
  }

  function renderFilters() {
    if (!state.filtersOpen) return '';
    return `
      <div class="ell-filters">
        <label class="ell-filter-field">
          <span>Status</span>
          <input type="text" id="ellFilterStatus" placeholder="NEW,IN_PROGRESS" value="${escapeAttr(state.filters.status)}" />
        </label>
        <label class="ell-filter-field">
          <span>Origem</span>
          <select id="ellFilterSource">
            <option value="">Todas</option>
            ${Object.entries(api()?.SOURCE_LABELS || {}).map(([k, label]) => `<option value="${escapeAttr(k)}"${state.filters.source === k ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
          </select>
        </label>
        <label class="ell-filter-field">
          <span>Ordenar por</span>
          <select id="ellFilterSortBy">
            <option value="updatedAt"${state.filters.sortBy === 'updatedAt' ? ' selected' : ''}>Atualização</option>
            <option value="name"${state.filters.sortBy === 'name' ? ' selected' : ''}>Nome</option>
            <option value="source"${state.filters.sortBy === 'source' ? ' selected' : ''}>Origem</option>
            <option value="city"${state.filters.sortBy === 'city' ? ' selected' : ''}>Cidade</option>
            <option value="leadScore"${state.filters.sortBy === 'leadScore' ? ' selected' : ''}>Score</option>
            <option value="temperature"${state.filters.sortBy === 'temperature' ? ' selected' : ''}>Temperatura</option>
            <option value="qualificationCompletion"${state.filters.sortBy === 'qualificationCompletion' ? ' selected' : ''}>Qualificação</option>
            <option value="assignedAgentName"${state.filters.sortBy === 'assignedAgentName' ? ' selected' : ''}>Responsável</option>
            <option value="lastInteractionAt"${state.filters.sortBy === 'lastInteractionAt' ? ' selected' : ''}>Última interação</option>
            <option value="status"${state.filters.sortBy === 'status' ? ' selected' : ''}>Status</option>
          </select>
        </label>
        <label class="ell-filter-field">
          <span>Direção</span>
          <select id="ellFilterSortDir">
            <option value="desc"${state.filters.sortDir === 'desc' ? ' selected' : ''}>Decrescente</option>
            <option value="asc"${state.filters.sortDir === 'asc' ? ' selected' : ''}>Crescente</option>
          </select>
        </label>
        <div class="ell-filters-actions">
          <button type="button" class="epl-btn epl-btn--ghost" id="ellClearFilters">Limpar</button>
          <button type="button" class="epl-btn epl-btn--primary" id="ellApplyFilters">Aplicar</button>
        </div>
      </div>`;
  }

  function renderTopBar() {
    return `
      <header class="ell-top">
        <div class="ell-top-copy">
          <h1 class="ell-title">Leads</h1>
          <p class="ell-subtitle">Lista completa de oportunidades comerciais.</p>
        </div>
        <div class="ell-top-actions">
          <div class="ell-search-wrap">
            ${ICONS.search}
            <input type="search" id="ellSearch" placeholder="Buscar por nome, telefone, cidade, e-mail…" value="${escapeAttr(state.filters.q)}" />
          </div>
          <button type="button" class="ell-btn ell-btn--outline" id="ellToggleFilters">${ICONS.filter}<span>Filtros</span></button>
          <button type="button" class="ell-btn ell-btn--outline" id="ellExportBtn" disabled title="Em breve">${ICONS.export}<span>Exportar</span></button>
          <button type="button" class="ell-refresh-btn" id="ellRefreshBtn" title="Atualizar">${ICONS.refresh}</button>
        </div>
      </header>
      ${state.error ? `<div class="ell-error" role="alert">${escapeHtml(state.error)} <button type="button" id="ellRetryBtn">Tentar novamente</button></div>` : ''}
      ${state.usingMock ? '<p class="ell-mock-banner">Dados de demonstração — API <code>/engage/leads/list</code> indisponível.</p>' : ''}
      ${renderFilters()}`;
  }

  function render() {
    if (!state.dom.root) return;
    const split = !!state.selectedLeadId;
    state.dom.root.innerHTML = `
      <div class="ell-shell${split ? ' ell-shell--split is-drawer-open' : ''}">
        <div class="ell-layout">
          <div class="ell-main">
            ${renderTopBar()}
            <div class="ell-panel">
              ${state.loading && !state.data ? '<div class="ell-skeleton ell-skeleton--kpi"></div>' : renderSummaryCards()}
              ${renderQuickTabs()}
              ${state.loading && !state.data?.leads?.length ? '<div class="ell-skeleton ell-skeleton--table"></div>' : renderTable()}
              ${state.data ? renderPagination() : ''}
            </div>
          </div>
          <aside class="ell-drawer-pane" id="ellDrawerMount" aria-label="Detalhes do lead"></aside>
        </div>
      </div>`;
    bindDom();
    if (drawer()?.isOpen?.()) {
      drawer()?.refresh?.();
    }
  }

  function bindDom() {
    state.dom.root.querySelector('#ellRefreshBtn')?.addEventListener('click', () => loadData());
    state.dom.root.querySelector('#ellRetryBtn')?.addEventListener('click', () => loadData());
    state.dom.root.querySelector('#ellToggleFilters')?.addEventListener('click', () => {
      state.filtersOpen = !state.filtersOpen;
      render();
    });
    state.dom.root.querySelector('#ellClearFilters')?.addEventListener('click', () => {
      state.filters = { q: state.filters.q, page: 1, limit: state.filters.limit, sortBy: 'updatedAt', sortDir: 'desc', status: '', assignedTo: '', temperature: '', source: '' };
      state.quickTab = 'all';
      loadData();
    });
    state.dom.root.querySelector('#ellApplyFilters')?.addEventListener('click', () => {
      state.filters.status = state.dom.root.querySelector('#ellFilterStatus')?.value?.trim() || '';
      state.filters.source = state.dom.root.querySelector('#ellFilterSource')?.value || '';
      state.filters.sortBy = state.dom.root.querySelector('#ellFilterSortBy')?.value || 'updatedAt';
      state.filters.sortDir = state.dom.root.querySelector('#ellFilterSortDir')?.value || 'desc';
      state.filters.page = 1;
      state.filtersOpen = false;
      loadData();
    });

    const search = state.dom.root.querySelector('#ellSearch');
    search?.addEventListener('input', () => {
      clearTimeout(state.searchDebounceId);
      state.searchDebounceId = setTimeout(() => {
        state.filters.q = search.value.trim();
        state.filters.page = 1;
        loadData();
      }, 300);
    });

    state.dom.root.querySelectorAll('[data-summary-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-summary-filter');
        const def = (api()?.SUMMARY_CARDS || []).find((c) => c.key === key);
        applySummaryFilter(def);
      });
    });

    state.dom.root.querySelectorAll('[data-quick-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyQuickTab(btn.getAttribute('data-quick-tab') || 'all');
        loadData();
      });
    });

    state.dom.root.querySelectorAll('[data-sort-col]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleColumnSort(btn.getAttribute('data-sort-col'));
      });
    });

    state.dom.root.querySelectorAll('.ell-row').forEach((row) => {
      const open = (e) => {
        if (e?.target?.closest?.('[data-stop-row]')) return;
        void openLeadDrawer(row.getAttribute('data-lead-id'));
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
      });
    });

    state.dom.root.querySelectorAll('[data-page-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filters.page = Number(btn.getAttribute('data-page-jump')) || 1;
        loadData();
      });
    });

    state.dom.root.querySelector('#ellPagePrev')?.addEventListener('click', () => {
      if (state.filters.page > 1) { state.filters.page -= 1; loadData(); }
    });
    state.dom.root.querySelector('#ellPageNext')?.addEventListener('click', () => {
      const max = state.data?.pagination?.totalPages || 1;
      if (state.filters.page < max) { state.filters.page += 1; loadData(); }
    });
    state.dom.root.querySelector('#ellPageSize')?.addEventListener('change', (e) => {
      state.filters.limit = Number(e.target.value) || 20;
      state.filters.page = 1;
      loadData();
    });
  }

  async function openLeadDrawer(leadId) {
    const id = String(leadId || '').trim();
    if (!id || !state.session) return;
    state.selectedLeadId = id;
    render();
    try {
      const bundle = await api().getLeadDrawer(state.session, id);
      drawer()?.open?.(id, {
        card: bundle?.card,
        bundle,
        allowWithoutCard: true,
        layout: 'premium',
        inline: true,
        mountSelector: '#ellDrawerMount',
      });
    } catch (err) {
      state.selectedLeadId = null;
      const mapped = api().mapApiError(err);
      state.error = mapped.message;
      render();
    }
  }

  function findRowById(leadId) {
    return (state.data?.leads || []).find((r) => r.id === leadId) || null;
  }

  function mergeRowUpdate(updated) {
    if (!updated?.id || !state.data?.leads) return;
    const idx = state.data.leads.findIndex((r) => r.id === updated.id);
    if (idx >= 0) {
      state.data.leads[idx] = { ...state.data.leads[idx], ...api().normalizeRow(updated) };
      render();
    }
  }

  async function loadData() {
    if (!state.active || !state.session) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      state.data = await api().getLeadsList(state.session, state.filters);
      state.usingMock = state.data?.mock === true;
      state.error = '';
    } catch (err) {
      state.error = api().mapApiError(err).message;
    } finally {
      state.loading = false;
      render();
    }
  }

  function mount() {
    state.dom.root = document.getElementById('adminEngageLeadsListRoot');
    return !!state.dom.root;
  }

  function activate(session) {
    if (!mount()) return;
    state.session = session || state.session;
    state.active = true;
    drawer()?.init?.({
      getSession: () => state.session,
      preferInline: true,
      mountSelector: '#ellDrawerMount',
      findCard: (leadId) => {
        const row = findRowById(leadId);
        return row ? api().rowToCard(row) : null;
      },
      onLeadUpdated: (card) => {
        if (card?.id) mergeRowUpdate(card);
        void loadData();
      },
      onClose: () => {
        state.selectedLeadId = null;
        render();
      },
      openConversation: (convId) => {
        const inbox = window.ReservaAiBotInbox;
        if (!convId || !inbox) return;
        inbox.prepareConversation?.(convId);
        document.querySelector('[data-es-nav="conversas"]')?.click();
        if (inbox.isActive?.()) inbox.selectConversation(convId, state.session);
        else inbox.activate(state.session);
      },
    });
    void loadData();
  }

  function deactivate() {
    state.active = false;
    state.selectedLeadId = null;
    drawer()?.close?.();
  }

  window.ReservaAiEngageLeadsListAdmin = {
    activate,
    deactivate,
    reload: loadData,
  };
})();
