/**
 * Engage Solar — Pipeline de Leads (Kanban comercial).
 */
(function () {
  const api = () => window.EngagePipelineApi;
  const REFRESH_MS = 45 * 1000;

  const ICONS = {
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>',
    move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>',
  };

  const state = {
    mounted: false,
    active: false,
    session: null,
    loading: false,
    error: '',
    usingMock: false,
    summary: null,
    kanban: null,
    agents: [],
    filters: {
      assignedTo: '',
      campaignId: '',
      temperature: '',
      q: '',
    },
    filtersOpen: false,
    mobileColumn: 'NEW',
    drag: null,
    refreshTimerId: null,
    searchDebounceId: null,
    intelligence: {
      open: false,
      loading: false,
      error: '',
      leadId: null,
      card: null,
      payload: null,
    },
    dom: {},
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function formatRelativeTime(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `há ${days} dia${days === 1 ? '' : 's'}`;
  }

  function formatDateShort(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR');
  }

  function pctOfActive(value, active) {
    const base = Number(active || 0);
    if (!base) return '';
    const pct = Math.round((Number(value || 0) / base) * 100);
    return `${pct}% do total`;
  }

  function columnMeta(key) {
    return api()?.LEAD_STATUS_COLUMNS?.[key] || { emoji: '', label: key, status: key };
  }

  function temperatureDisplay(card) {
    const temp = String(card?.leadTemperature || '').toUpperCase();
    const meta = api()?.LEAD_TEMPERATURE?.[temp];
    if (!meta) return '';
    const manual = String(card?.temperatureSource || '').toUpperCase() === 'MANUAL';
    const manualTag = manual
      ? '<span class="epl-temp-manual" title="Temperatura definida manualmente">manual</span>'
      : '';
    return `<span class="epl-temp-icon" data-tone="${escapeAttr(meta.tone)}" title="${escapeAttr(meta.label)}${manual ? ' (definido manualmente)' : ''}">${meta.icon}${manualTag}</span>`;
  }

  function priorityBadge(priority) {
    const tone = api()?.priorityTone?.(priority);
    const label = api()?.priorityLabel?.(priority);
    if (!tone || !label) return '';
    return `<span class="epl-priority-badge" data-tone="${escapeAttr(tone)}">${escapeHtml(label)}</span>`;
  }

  function gradeBadge(grade) {
    const raw = String(grade || '').trim();
    if (!raw) return '';
    const tone = api()?.gradeTone?.(raw) || 'neutral';
    return `<span class="epl-grade-badge" data-tone="${escapeAttr(tone)}" title="Grade comercial">${escapeHtml(raw)}</span>`;
  }

  function intelligenceRow(card) {
    const priority = priorityBadge(card.commercialPriority);
    const grade = gradeBadge(card.leadGrade);
    const temp = temperatureDisplay(card);
    if (!priority && !grade && !temp) return '';
    return `<div class="epl-card-intelligence">${priority}${grade}${temp}</div>`;
  }

  function sourceIcon(source) {
    const map = { AI: '🤖', MANUAL: '✋', RECOVERY: '♻️' };
    const icon = map[String(source || '').toUpperCase()];
    return icon ? `<span class="epl-source-icon" title="${escapeAttr(source)}">${icon}</span>` : '';
  }

  function renderKpiCards() {
    const summary = state.summary || {};
    const defs = api()?.KPI_DEFS || [];
    return `<div class="epl-kpi-grid">${defs.map((def) => {
      const value = summary[def.key] ?? 0;
      const pct = def.hidePct ? '' : pctOfActive(value, summary.activeLeads);
      return `
        <article class="epl-kpi-card" data-tone="${escapeAttr(def.tone)}">
          <span class="epl-kpi-label">${escapeHtml(def.label)}</span>
          <strong class="epl-kpi-value">${formatNumber(value)}</strong>
          ${pct ? `<small class="epl-kpi-pct">${escapeHtml(pct)}</small>` : ''}
        </article>`;
    }).join('')}</div>`;
  }

  function renderCard(card, columnKey) {
    if (!card?.id) return '';
    const scoreTone = api()?.scoreTone?.(card.leadScore) || 'neutral';
    const scoreHtml = card.leadScore != null
      ? `<span class="epl-score-badge" data-tone="${scoreTone}" title="Lead Score comercial">${Math.round(card.leadScore)}</span>`
      : '';
    const snippet = card.lastMessage || card.title || '—';
    const campaign = card.sourceCampaignName
      ? `<div class="epl-card-campaign">Campanha: ${escapeHtml(card.sourceCampaignName)}</div>`
      : '';
    const assignee = card.assignedAgentName
      ? `<div class="epl-card-assignee"><span class="epl-card-assignee-avatar">${escapeHtml(api().initials(card.assignedAgentName))}</span> Responsável: ${escapeHtml(card.assignedAgentName)}</div>`
      : '<div class="epl-card-assignee epl-card-assignee--empty">Sem responsável</div>';
    const followUp = columnKey === 'FOLLOW_UP' && card.nextContactAt
      ? `<div class="epl-card-followup">Retorno previsto: ${escapeHtml(formatDateShort(card.nextContactAt))}</div>`
      : '';
    const closed = columnKey === 'CLOSED'
      ? `<span class="epl-closed-badge">Fechado</span>`
      : '';

    return `
      <article class="epl-card"
        draggable="true"
        data-lead-id="${escapeAttr(card.id)}"
        data-conversation-id="${escapeAttr(card.conversationId)}"
        data-column-key="${escapeAttr(columnKey)}"
        tabindex="0"
        role="button"
        aria-label="Lead ${escapeAttr(card.name)}">
        <header class="epl-card-head">
          <div class="epl-card-contact">
            <span class="epl-card-avatar">${escapeHtml(api().initials(card.name))}</span>
            <div>
              <strong class="epl-card-name">${escapeHtml(card.name)}</strong>
              <small class="epl-card-phone">${escapeHtml(api().formatPhoneDisplay(card.phone))}</small>
            </div>
          </div>
          <div class="epl-card-head-actions">
            ${sourceIcon(card.source)}
            <button type="button" class="epl-card-intel-btn" data-show-intelligence="${escapeAttr(card.id)}" title="Por que este score?">📊</button>
            <button type="button" class="epl-card-wa" data-open-conversation="${escapeAttr(card.conversationId)}" title="Abrir conversa">${ICONS.wa}</button>
            <button type="button" class="epl-card-move-menu" data-move-menu="${escapeAttr(card.id)}" title="Mover para…">${ICONS.move}</button>
          </div>
        </header>
        ${intelligenceRow(card)}
        <p class="epl-card-snippet">${escapeHtml(snippet)}</p>
        ${campaign}
        ${assignee}
        ${followUp}
        <footer class="epl-card-foot">
          <span class="epl-card-time">${escapeHtml(formatRelativeTime(card.lastInteractionAt))}</span>
          <div class="epl-card-badges">
            ${closed}
            ${scoreHtml}
          </div>
        </footer>
      </article>`;
  }

  function renderColumn(col) {
    const meta = columnMeta(col.key);
    const cards = Array.isArray(col.cards) ? col.cards : [];
    const cardsHtml = cards.length
      ? cards.map((c) => renderCard(c, col.key)).join('')
      : '<p class="epl-column-empty">Nenhum lead</p>';
    const more = col.total > cards.length
      ? `<button type="button" class="epl-column-more" disabled title="Ver mais — em breve">Ver mais (${col.total - cards.length})</button>`
      : '';

    return `
      <section class="epl-column" data-column-key="${escapeAttr(col.key)}" aria-label="${escapeAttr(meta.label)}">
        <header class="epl-column-head">
          <h3><span class="epl-column-emoji">${meta.emoji}</span> ${escapeHtml(meta.label)}</h3>
          <span class="epl-column-count">${formatNumber(col.total)}</span>
        </header>
        <div class="epl-column-drop" data-drop-column="${escapeAttr(col.key)}">
          ${cardsHtml}
        </div>
        ${more}
        <button type="button" class="epl-column-add" data-new-lead>+ Adicionar lead</button>
      </section>`;
  }

  function renderKanban() {
    const columns = state.kanban?.columns || [];
    if (!columns.length && !state.loading) {
      return `<div class="epl-empty-state">
        <p>Ainda não há leads. Eles aparecem quando a IA detecta interesse nas respostas ou quando você cria manualmente.</p>
      </div>`;
    }
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isMobile) {
      const tabs = columns.map((col) => {
        const meta = columnMeta(col.key);
        const active = col.key === state.mobileColumn ? ' is-active' : '';
        return `<button type="button" class="epl-mobile-tab${active}" data-mobile-column="${escapeAttr(col.key)}">${meta.emoji} ${escapeHtml(meta.label)} (${formatNumber(col.total)})</button>`;
      }).join('');
      const activeCol = columns.find((c) => c.key === state.mobileColumn) || columns[0];
      return `<div class="epl-mobile-tabs" role="tablist">${tabs}</div><div class="epl-kanban epl-kanban--mobile">${activeCol ? renderColumn(activeCol) : ''}</div>`;
    }
    return `<div class="epl-kanban">${columns.map(renderColumn).join('')}</div>`;
  }

  function renderFiltersPanel() {
    const agents = state.agents || [];
    const agentOptions = agents.map((a) =>
      `<option value="${escapeAttr(a.salesConsultantId)}"${state.filters.assignedTo === a.salesConsultantId ? ' selected' : ''}>${escapeHtml(a.displayName)}</option>`,
    ).join('');

    return `
      <div class="epl-filters${state.filtersOpen ? ' is-open' : ''}" id="eplFiltersPanel" ${state.filtersOpen ? '' : 'hidden'}>
        <div class="epl-filters-grid">
          <label class="epl-filter-field">
            <span>Responsável</span>
            <select id="eplFilterAssigned">
              <option value="">Todos</option>
              <option value="me"${state.filters.assignedTo === 'me' ? ' selected' : ''}>Meus</option>
              <option value="unassigned"${state.filters.assignedTo === 'unassigned' ? ' selected' : ''}>Sem responsável</option>
              ${agentOptions}
            </select>
          </label>
          <label class="epl-filter-field">
            <span>Temperatura</span>
            <select id="eplFilterTemperature">
              <option value="">Todas</option>
              <option value="HOT"${state.filters.temperature === 'HOT' ? ' selected' : ''}>Muito quente</option>
              <option value="WARM"${state.filters.temperature === 'WARM' ? ' selected' : ''}>Interessado</option>
              <option value="COLD"${state.filters.temperature === 'COLD' ? ' selected' : ''}>Frio</option>
            </select>
          </label>
          <label class="epl-filter-field">
            <span>Campanha (ID)</span>
            <input type="text" id="eplFilterCampaign" placeholder="UUID da campanha" value="${escapeAttr(state.filters.campaignId)}" />
          </label>
          <label class="epl-filter-field epl-filter-field--search">
            <span>Busca</span>
            <input type="search" id="eplFilterSearch" placeholder="Nome, telefone, título…" value="${escapeAttr(state.filters.q)}" />
          </label>
        </div>
        <div class="epl-filters-actions">
          <button type="button" class="epl-btn epl-btn--ghost" id="eplClearFilters">Limpar filtros</button>
          <button type="button" class="epl-btn epl-btn--primary" id="eplApplyFilters">Aplicar</button>
        </div>
      </div>`;
  }

  function renderToolbar() {
    return `
      <header class="epl-toolbar">
        <div class="epl-toolbar-copy">
          <p class="epl-eyebrow">Comercial · Kanban</p>
          <h1 class="epl-title">Pipeline de Leads</h1>
          <p class="epl-subtitle">Oportunidades comerciais ligadas às conversas — arraste cards entre colunas ou abra o Inbox para atender.</p>
        </div>
        <div class="epl-toolbar-actions">
          <label class="epl-search-wrap">
            ${ICONS.search}
            <input type="search" id="eplQuickSearch" placeholder="Buscar por nome, telefone ou campanha…" value="${escapeAttr(state.filters.q)}" />
          </label>
          <button type="button" class="epl-btn epl-btn--outline" id="eplToggleFilters">${ICONS.filter} Filtros</button>
          <button type="button" class="epl-btn epl-btn--ghost" id="eplRefreshBtn" title="Atualizar">${ICONS.refresh}</button>
          <button type="button" class="epl-btn epl-btn--primary" id="eplNewLeadBtn">${ICONS.plus} Novo Lead</button>
        </div>
      </header>
      ${state.usingMock ? '<div class="epl-mock-banner" role="status">Modo demonstração (ENGAGE_PIPELINE_USE_MOCK=true).</div>' : ''}
      ${state.error ? `<div class="epl-error-banner" role="alert">${escapeHtml(state.error)} <button type="button" class="epl-link-btn" id="eplRetryBtn">Tentar novamente</button></div>` : ''}
      ${renderFiltersPanel()}`;
  }

  function renderContent() {
    if (state.loading && !state.kanban) {
      return `<div class="epl-loading"><div class="epl-skeleton-kpi"></div><div class="epl-skeleton-kanban"></div></div>`;
    }
    return `${renderKpiCards()}${renderKanban()}`;
  }

  function renderIntelligenceDrawer() {
    const intel = state.intelligence;
    if (!intel.open) return '';
    const card = intel.card || {};
    const payload = intel.payload?.intelligence || {};
    const breakdown = Array.isArray(payload.breakdown) ? payload.breakdown : [];
    const computedAt = payload.computedAt
      ? new Date(payload.computedAt).toLocaleString('pt-BR')
      : '—';

    const body = intel.loading
      ? '<div class="epl-intel-loading">Calculando inteligência…</div>'
      : intel.error
        ? `<div class="epl-intel-error" role="alert">${escapeHtml(intel.error)}</div>`
        : `
          <div class="epl-intel-summary">
            ${priorityBadge(payload.priority || card.commercialPriority)}
            ${gradeBadge(payload.grade || card.leadGrade)}
            ${temperatureDisplay({
              leadTemperature: payload.temperature || card.leadTemperature,
              temperatureSource: payload.temperatureSource || card.temperatureSource,
            })}
            ${payload.score != null ? `<span class="epl-intel-score">Lead Score: <strong>${Math.round(payload.score)}</strong></span>` : ''}
          </div>
          <p class="epl-intel-meta">Atualizado: ${escapeHtml(computedAt)}${payload.temperatureSource === 'MANUAL' ? ' · Temperatura definida manualmente' : ''}</p>
          <h3 class="epl-intel-breakdown-title">Por que este score?</h3>
          ${breakdown.length
            ? `<ul class="epl-intel-breakdown">${breakdown.map((row) => {
              const w = Number(row.weight || 0);
              const tone = w >= 0 ? 'positive' : 'negative';
              const sign = w > 0 ? '+' : '';
              return `<li data-tone="${tone}"><span>${escapeHtml(row.label || row.key || '')}</span><strong>${sign}${w}</strong></li>`;
            }).join('')}</ul>`
            : '<p class="epl-intel-empty">Sem detalhamento disponível.</p>'}`;

    return `
      <div class="epl-intel-backdrop" id="eplIntelBackdrop" aria-hidden="true"></div>
      <aside class="epl-intel-drawer" id="eplIntelDrawer" role="dialog" aria-labelledby="eplIntelTitle">
        <header class="epl-intel-head">
          <div>
            <p class="epl-intel-eyebrow">Lead Intelligence</p>
            <h2 id="eplIntelTitle">${escapeHtml(card.name || 'Lead')}</h2>
            <p class="epl-intel-sub">${escapeHtml(api()?.formatPhoneDisplay?.(card.phone) || '')}</p>
          </div>
          <button type="button" class="epl-intel-close" id="eplIntelClose" aria-label="Fechar">×</button>
        </header>
        <div class="epl-intel-body">${body}</div>
        <footer class="epl-intel-foot">
          <button type="button" class="epl-btn epl-btn--outline" id="eplIntelOpenInbox">Abrir conversa</button>
          <button type="button" class="epl-btn epl-btn--ghost" id="eplIntelCloseFoot">Fechar</button>
        </footer>
      </aside>`;
  }

  function findCardById(leadId) {
    const columns = state.kanban?.columns || [];
    for (const col of columns) {
      const hit = (col.cards || []).find((c) => c.id === leadId);
      if (hit) return hit;
    }
    return null;
  }

  function closeIntelligenceDrawer() {
    state.intelligence.open = false;
    state.intelligence.loading = false;
    state.intelligence.error = '';
    state.intelligence.leadId = null;
    state.intelligence.card = null;
    state.intelligence.payload = null;
    document.getElementById('eplIntelDrawer')?.remove();
    document.getElementById('eplIntelBackdrop')?.remove();
  }

  function refreshIntelligenceDrawerDOM() {
    document.getElementById('eplIntelBackdrop')?.remove();
    document.getElementById('eplIntelDrawer')?.remove();
    if (!state.intelligence.open) return;
    document.body.insertAdjacentHTML('beforeend', renderIntelligenceDrawer());
    bindIntelligenceDrawer();
  }

  async function openIntelligenceDrawer(leadId) {
    const card = findCardById(leadId);
    if (!card) return;
    state.intelligence = {
      open: true,
      loading: true,
      error: '',
      leadId,
      card,
      payload: null,
    };
    refreshIntelligenceDrawerDOM();

    try {
      state.intelligence.payload = await api().getLeadIntelligence(state.session, leadId);
      state.intelligence.error = '';
    } catch (err) {
      state.intelligence.error = api().mapApiError(err).message;
    } finally {
      state.intelligence.loading = false;
      refreshIntelligenceDrawerDOM();
    }
  }

  function bindIntelligenceDrawer() {
    document.getElementById('eplIntelBackdrop')?.addEventListener('click', closeIntelligenceDrawer);
    document.getElementById('eplIntelClose')?.addEventListener('click', closeIntelligenceDrawer);
    document.getElementById('eplIntelCloseFoot')?.addEventListener('click', closeIntelligenceDrawer);
    document.getElementById('eplIntelOpenInbox')?.addEventListener('click', () => {
      const convId = state.intelligence.card?.conversationId;
      closeIntelligenceDrawer();
      void openConversation(convId);
    });
  }

  function render() {
    if (!state.dom.root) return;
    state.dom.root.innerHTML = `${renderToolbar()}<div class="epl-body">${renderContent()}</div>`;
    bindDom();
  }

  function bindDom() {
    state.dom.refreshBtn = state.dom.root.querySelector('#eplRefreshBtn');
    state.dom.newLeadBtn = state.dom.root.querySelector('#eplNewLeadBtn');
    state.dom.toggleFilters = state.dom.root.querySelector('#eplToggleFilters');
    state.dom.quickSearch = state.dom.root.querySelector('#eplQuickSearch');
    state.dom.retryBtn = state.dom.root.querySelector('#eplRetryBtn');
    state.dom.clearFilters = state.dom.root.querySelector('#eplClearFilters');
    state.dom.applyFilters = state.dom.root.querySelector('#eplApplyFilters');

    state.dom.refreshBtn?.addEventListener('click', () => loadData());
    state.dom.retryBtn?.addEventListener('click', () => loadData());
    state.dom.newLeadBtn?.addEventListener('click', () => promptNewLead());
    state.dom.toggleFilters?.addEventListener('click', () => {
      state.filtersOpen = !state.filtersOpen;
      render();
    });
    state.dom.clearFilters?.addEventListener('click', () => {
      state.filters = { assignedTo: '', campaignId: '', temperature: '', q: '' };
      loadData();
    });
    state.dom.applyFilters?.addEventListener('click', () => {
      state.filters.assignedTo = state.dom.root.querySelector('#eplFilterAssigned')?.value || '';
      state.filters.temperature = state.dom.root.querySelector('#eplFilterTemperature')?.value || '';
      state.filters.campaignId = state.dom.root.querySelector('#eplFilterCampaign')?.value?.trim() || '';
      state.filters.q = state.dom.root.querySelector('#eplFilterSearch')?.value?.trim() || '';
      state.filtersOpen = false;
      loadKanbanOnly();
    });

    state.dom.quickSearch?.addEventListener('input', () => {
      clearTimeout(state.searchDebounceId);
      state.searchDebounceId = setTimeout(() => {
        state.filters.q = state.dom.quickSearch.value.trim();
        loadKanbanOnly();
      }, 300);
    });

    state.dom.root.querySelectorAll('[data-mobile-column]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mobileColumn = btn.dataset.mobileColumn || 'NEW';
        render();
      });
    });

    state.dom.root.querySelectorAll('[data-show-intelligence]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        void openIntelligenceDrawer(btn.dataset.showIntelligence);
      });
    });

    state.dom.root.querySelectorAll('[data-open-conversation]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        void openConversation(btn.dataset.openConversation);
      });
    });

    state.dom.root.querySelectorAll('.epl-card').forEach((cardEl) => {
      cardEl.addEventListener('click', (event) => {
        if (event.target.closest('[data-open-conversation], [data-move-menu], [data-show-intelligence], button')) return;
        void openConversation(cardEl.dataset.conversationId);
      });
      cardEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void openConversation(cardEl.dataset.conversationId);
        }
      });
      cardEl.addEventListener('dragstart', onDragStart);
      cardEl.addEventListener('dragend', onDragEnd);
    });

    state.dom.root.querySelectorAll('[data-move-menu]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        showMoveMenu(btn.dataset.moveMenu, btn.closest('.epl-card')?.dataset.columnKey);
      });
    });

    state.dom.root.querySelectorAll('[data-drop-column]').forEach((zone) => {
      zone.addEventListener('dragover', onDragOver);
      zone.addEventListener('dragleave', onDragLeave);
      zone.addEventListener('drop', onDrop);
    });

    state.dom.root.querySelectorAll('[data-new-lead]').forEach((btn) => {
      btn.addEventListener('click', () => promptNewLead());
    });
  }

  function showMoveMenu(leadId, fromColumn) {
    const columns = Object.keys(api()?.LEAD_STATUS_COLUMNS || {});
    const options = columns.map((key, i) => `${i + 1}. ${columnMeta(key).emoji} ${columnMeta(key).label}`).join('\n');
    const choice = window.prompt(`Mover lead para:\n${options}\n\nDigite o número da coluna:`);
    if (!choice) return;
    const idx = Number(choice) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= columns.length) return;
    void moveLead(leadId, fromColumn, columns[idx]);
  }

  function onDragStart(event) {
    const card = event.currentTarget;
    state.drag = {
      leadId: card.dataset.leadId,
      fromColumn: card.dataset.columnKey,
      element: card,
    };
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.leadId || '');
  }

  function onDragEnd(event) {
    event.currentTarget.classList.remove('is-dragging');
    state.dom.root.querySelectorAll('.epl-column-drop.is-drag-over').forEach((el) => el.classList.remove('is-drag-over'));
    state.drag = null;
  }

  function onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('is-drag-over');
  }

  function onDragLeave(event) {
    event.currentTarget.classList.remove('is-drag-over');
  }

  function onDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('is-drag-over');
    const toColumn = event.currentTarget.dataset.dropColumn;
    if (!state.drag?.leadId || !toColumn || toColumn === state.drag.fromColumn) return;
    void moveLead(state.drag.leadId, state.drag.fromColumn, toColumn);
  }

  async function moveLead(leadId, fromColumn, toColumn) {
    const status = columnMeta(toColumn).status || toColumn;
    let body = { status };
    if (toColumn === 'FOLLOW_UP') {
      const dateRaw = window.prompt('Data de retorno (AAAA-MM-DD):', new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
      if (!dateRaw) return;
      body.nextContactAt = new Date(`${dateRaw}T12:00:00.000Z`).toISOString();
    }
    if (toColumn === 'CLOSED') {
      const reason = window.prompt('Motivo do encerramento (won, lost, no_interest — opcional):', 'won');
      if (reason) body.closedReason = reason.trim();
    }

    optimisticMove(leadId, fromColumn, toColumn);
    try {
      await api().patchLeadStatus(state.session, leadId, body);
      await loadData({ silent: true });
    } catch (err) {
      optimisticMove(leadId, toColumn, fromColumn);
      const mapped = api().mapApiError(err);
      state.error = mapped.message;
      render();
    }
  }

  function optimisticMove(leadId, fromColumn, toColumn) {
    if (!state.kanban?.columns) return;
    let card = null;
    const fromCol = state.kanban.columns.find((c) => c.key === fromColumn);
    const toCol = state.kanban.columns.find((c) => c.key === toColumn);
    if (!fromCol || !toCol) return;
    fromCol.cards = fromCol.cards.filter((c) => {
      if (c.id === leadId) {
        card = { ...c, kanbanColumn: toColumn, status: columnMeta(toColumn).status };
        return false;
      }
      return true;
    });
    if (card) {
      toCol.cards.unshift(card);
      fromCol.total = Math.max(0, fromCol.total - 1);
      toCol.total += 1;
    }
    render();
  }

  async function openConversation(conversationId) {
    const id = String(conversationId || '').trim();
    if (!id) return;
    const inbox = window.ReservaAiBotInbox;
    if (!inbox) return;
    inbox.prepareConversation?.(id);
    const onConversas = document.querySelector('[data-es-nav="conversas"]')?.classList.contains('is-active');
    if (!onConversas) {
      document.querySelector('[data-es-nav="conversas"]')?.click();
    }
    if (inbox.isActive?.()) {
      await inbox.selectConversation(id, state.session);
    } else {
      await inbox.activate(state.session);
    }
  }

  async function promptNewLead() {
    const conversationId = window.prompt('ID da conversa para criar Lead (conversationId):');
    if (!conversationId?.trim()) return;
    try {
      const result = await api().createLead(state.session, { conversationId: conversationId.trim() });
      if (!result.created) {
        window.alert('Já existia um lead ativo para esta conversa. O card foi destacado no Kanban.');
      }
      await loadData();
      if (result.lead?.kanbanColumn) state.mobileColumn = result.lead.kanbanColumn;
    } catch (err) {
      const mapped = api().mapApiError(err);
      state.error = mapped.message;
      render();
    }
  }

  async function loadKanbanOnly() {
    if (!state.active || !state.session) return;
    try {
      state.kanban = await api().getKanban(state.session, state.filters);
      state.usingMock = state.kanban?.mock === true;
      state.error = '';
    } catch (err) {
      state.error = api().mapApiError(err).message;
    }
    render();
  }

  async function loadData(options = {}) {
    if (!state.active || !state.session) return;
    const silent = options.silent === true;
    if (!silent) {
      state.loading = true;
      state.error = '';
      render();
    }
    try {
      const [summary, kanban, agents] = await Promise.all([
        api().getSummary(state.session),
        api().getKanban(state.session, state.filters),
        state.agents.length ? Promise.resolve(state.agents) : api().getAgents(state.session),
      ]);
      state.summary = summary;
      state.kanban = kanban;
      if (!state.agents.length) state.agents = agents;
      state.usingMock = summary?.mock === true || kanban?.mock === true;
      state.error = '';
    } catch (err) {
      state.error = api().mapApiError(err).message;
    } finally {
      state.loading = false;
      render();
    }
  }

  function startRefresh() {
    stopRefresh();
    state.refreshTimerId = setInterval(() => {
      if (state.active) loadData({ silent: true });
    }, REFRESH_MS);
  }

  function stopRefresh() {
    if (state.refreshTimerId) {
      clearInterval(state.refreshTimerId);
      state.refreshTimerId = null;
    }
  }

  function mount() {
    state.dom.root = document.getElementById('adminEngagePipelineRoot');
    if (!state.dom.root || state.mounted) return state.mounted;
    state.mounted = true;
    render();
    return true;
  }

  function activate(session) {
    mount();
    state.session = session || state.session;
    state.active = true;
    void loadData();
    startRefresh();
  }

  function deactivate() {
    state.active = false;
    stopRefresh();
    closeIntelligenceDrawer();
  }

  window.ReservaAiEngagePipelineAdmin = {
    activate,
    deactivate,
    reload: loadData,
    openConversation,
  };
})();
