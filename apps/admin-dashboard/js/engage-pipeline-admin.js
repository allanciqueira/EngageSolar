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
    dom: {},
    newLeadModal: {
      open: false,
      loading: false,
      saving: false,
      query: '',
      conversations: [],
      selectedId: '',
      error: '',
    },
  };

  const leadDrawer = () => window.EngagePipelineLeadDrawer;

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

  function collectKanbanConversationIds() {
    const ids = new Set();
    (state.kanban?.columns || []).forEach((col) => {
      (col.cards || []).forEach((card) => {
        const id = String(card?.conversationId || '').trim();
        if (id) ids.add(id);
      });
    });
    return ids;
  }

  function renderNewLeadModal() {
    const modal = state.newLeadModal;
    document.getElementById('eplNewLeadModalBackdrop')?.remove();
    document.getElementById('eplNewLeadModal')?.remove();
    if (!modal.open) return;

    const existingLeadIds = collectKanbanConversationIds();
    const rows = api()?.filterConversationsForLeadPicker?.(modal.conversations, modal.query, 30) || [];

    const listHtml = modal.loading
      ? '<p class="epl-new-lead-loading">Carregando conversas…</p>'
      : (!rows.length
        ? `<p class="epl-new-lead-empty">${escapeHtml(
          modal.conversations.length && modal.query.trim()
            ? 'Nenhuma conversa encontrada.'
            : (modal.conversations.length ? 'Nenhuma conversa disponível.' : 'Digite nome ou telefone para buscar.'),
        )}</p>`
        : `<ul class="epl-new-lead-list" role="listbox" aria-label="Conversas">${rows.map((row) => {
          const selected = row.id === modal.selectedId;
          const hasLead = existingLeadIds.has(row.id);
          return `
            <li>
              <button type="button" class="epl-new-lead-item${selected ? ' is-selected' : ''}" data-conversation-id="${escapeAttr(row.id)}" role="option" aria-selected="${selected ? 'true' : 'false'}">
                <span class="epl-new-lead-item-avatar">${escapeHtml(api().initials(row.title))}</span>
                <span class="epl-new-lead-item-copy">
                  <strong>${escapeHtml(row.title)}</strong>
                  <span>${escapeHtml(row.phoneDisplay)}</span>
                  <small>${escapeHtml(row.lastMessagePreview)}</small>
                </span>
                ${hasLead ? '<span class="epl-new-lead-item-tag">Lead ativo</span>' : ''}
              </button>
            </li>`;
        }).join('')}</ul>`);

    document.body.insertAdjacentHTML('beforeend', `
      <div class="epl-new-lead-backdrop" id="eplNewLeadModalBackdrop"></div>
      <div class="epl-new-lead-modal" id="eplNewLeadModal" role="dialog" aria-labelledby="eplNewLeadModalTitle" aria-modal="true">
        <header class="epl-new-lead-head">
          <div>
            <p class="epl-new-lead-eyebrow">Pipeline Comercial</p>
            <h2 id="eplNewLeadModalTitle">Novo Lead</h2>
            <p class="epl-new-lead-sub">Busque a conversa do WhatsApp por nome, telefone ou trecho da última mensagem.</p>
          </div>
          <button type="button" class="epl-new-lead-close" id="eplNewLeadModalClose" aria-label="Fechar">×</button>
        </header>
        <div class="epl-new-lead-search">
          ${ICONS.search}
          <input type="search" id="eplNewLeadSearch" placeholder="Nome, telefone ou mensagem…" value="${escapeAttr(modal.query)}" autocomplete="off" />
        </div>
        ${modal.error ? `<p class="epl-new-lead-error" role="alert">${escapeHtml(modal.error)}</p>` : ''}
        <div class="epl-new-lead-body">${listHtml}</div>
        <footer class="epl-new-lead-foot">
          <button type="button" class="epl-btn epl-btn--ghost" id="eplNewLeadModalCancel">Cancelar</button>
          <button type="button" class="epl-btn epl-btn--primary" id="eplNewLeadModalSubmit"${!modal.selectedId || modal.saving ? ' disabled' : ''}>
            ${modal.saving ? 'Criando…' : 'Criar Lead'}
          </button>
        </footer>
      </div>`);

    document.getElementById('eplNewLeadModalBackdrop')?.addEventListener('click', closeNewLeadModal);
    document.getElementById('eplNewLeadModalClose')?.addEventListener('click', closeNewLeadModal);
    document.getElementById('eplNewLeadModalCancel')?.addEventListener('click', closeNewLeadModal);
    document.getElementById('eplNewLeadModalSubmit')?.addEventListener('click', () => { void submitNewLead(); });

    const searchInput = document.getElementById('eplNewLeadSearch');
    searchInput?.addEventListener('input', () => {
      state.newLeadModal.query = searchInput.value || '';
      renderNewLeadModal();
      searchInput.focus();
      const len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
    });
    searchInput?.focus();

    document.querySelectorAll('.epl-new-lead-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.newLeadModal.selectedId = btn.getAttribute('data-conversation-id') || '';
        state.newLeadModal.error = '';
        renderNewLeadModal();
      });
    });
  }

  function closeNewLeadModal() {
    state.newLeadModal.open = false;
    state.newLeadModal.loading = false;
    state.newLeadModal.saving = false;
    state.newLeadModal.query = '';
    state.newLeadModal.conversations = [];
    state.newLeadModal.selectedId = '';
    state.newLeadModal.error = '';
    document.getElementById('eplNewLeadModalBackdrop')?.remove();
    document.getElementById('eplNewLeadModal')?.remove();
  }

  async function loadNewLeadConversations() {
    state.newLeadModal.loading = true;
    state.newLeadModal.error = '';
    renderNewLeadModal();
    try {
      state.newLeadModal.conversations = await api().fetchMessagingConversations(state.session);
    } catch (err) {
      const mapped = api()?.mapApiError?.(err) || {};
      state.newLeadModal.error = mapped.message || err?.message || 'Erro ao carregar conversas.';
      state.newLeadModal.conversations = [];
    } finally {
      state.newLeadModal.loading = false;
      renderNewLeadModal();
    }
  }

  async function openNewLeadModal() {
    if (!state.session) return;
    state.newLeadModal.open = true;
    state.newLeadModal.query = '';
    state.newLeadModal.selectedId = '';
    state.newLeadModal.error = '';
    state.newLeadModal.conversations = [];
    renderNewLeadModal();
    await loadNewLeadConversations();
  }

  async function submitNewLead() {
    const conversationId = String(state.newLeadModal.selectedId || '').trim();
    if (!conversationId || state.newLeadModal.saving) return;
    state.newLeadModal.saving = true;
    state.newLeadModal.error = '';
    renderNewLeadModal();
    try {
      const result = await api().createLead(state.session, { conversationId });
      closeNewLeadModal();
      if (!result.created) {
        window.alert('Já existia um lead ativo para esta conversa. O card foi destacado no Kanban.');
      }
      await loadData();
      if (result.lead?.kanbanColumn) state.mobileColumn = result.lead.kanbanColumn;
    } catch (err) {
      const mapped = api().mapApiError(err);
      state.newLeadModal.saving = false;
      state.newLeadModal.error = mapped.message;
      renderNewLeadModal();
    }
  }

  async function promptNewLead() {
    await openNewLeadModal();
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

  function temperatureChip(card) {
    const temp = String(card?.leadTemperature || '').toUpperCase();
    const meta = api()?.LEAD_TEMPERATURE?.[temp];
    if (!meta) return '';
    return `<span class="epl-temp-chip" data-tone="${escapeAttr(meta.tone)}" title="${escapeAttr(meta.label)}">${meta.cardIcon || meta.icon}</span>`;
  }

  function qualificationBar(card) {
    const pct = api()?.normalizeQualificationPct?.(card?.qualificationPct);
    if (pct == null) return '';
    return `
      <div class="epl-card-qual">
        <div class="epl-card-qual-head">
          <span>📈 Qualificação</span>
          <strong>${pct}%</strong>
        </div>
        <div class="epl-card-qual-track"><span style="width:${pct}%"></span></div>
      </div>`;
  }

  function cardMetaLine(icon, value) {
    const text = String(value || '').trim();
    if (!text || text === '—') return '';
    return `<div class="epl-card-meta-item"><span aria-hidden="true">${icon}</span><span>${escapeHtml(text)}</span></div>`;
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

  function formatPhoneCard(phone) {
    const raw = String(phone || '').replace(/\D/g, '');
    if (raw.length >= 12 && raw.startsWith('55')) {
      const ddd = raw.slice(2, 4);
      const rest = raw.slice(4);
      if (rest.length >= 9) {
        return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
      }
    }
    if (raw.length >= 10) {
      const ddd = raw.slice(0, 2);
      const rest = raw.slice(2);
      return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
    }
    return api()?.formatPhoneDisplay?.(phone) || String(phone || '').trim() || '—';
  }

  function intelligenceRow(card) {
    const priority = priorityBadge(card.commercialPriority);
    const grade = gradeBadge(card.leadGrade);
    const temp = temperatureChip(card);
    const source = sourceIcon(card.source);
    if (!priority && !grade && !temp && !source) return '';
    return `<div class="epl-card-intelligence">${source}${priority}${grade}${temp}</div>`;
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
      ? `<span class="epl-score-pill" data-tone="${scoreTone}" title="Lead Score">📊 ${Math.round(card.leadScore)}</span>`
      : '';
    const assignee = card.assignedAgentName
      ? `<div class="epl-card-assignee"><span class="epl-card-assignee-avatar">${escapeHtml(api().initials(card.assignedAgentName))}</span><span class="epl-card-assignee-name">${escapeHtml(card.assignedAgentName)}</span></div>`
      : '<div class="epl-card-assignee epl-card-assignee--empty">Sem responsável</div>';
    const followUp = columnKey === 'FOLLOW_UP' && card.nextContactAt
      ? `<div class="epl-card-followup">Retorno: ${escapeHtml(formatDateShort(card.nextContactAt))}</div>`
      : '';
    const closed = columnKey === 'CLOSED' ? `<span class="epl-closed-badge">Fechado</span>` : '';
    const consumption = api()?.formatConsumptionKwh?.(card.avgConsumptionKwh);
    const payment = card.paymentMethodLabel || card.paymentMethod || null;
    const prazo = card.installationDeadlineLabel || card.installationDeadline || null;

    return `
      <article class="epl-card epl-card--solar"
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
            <div class="epl-card-identity">
              <strong class="epl-card-name" title="${escapeAttr(card.name)}">${escapeHtml(card.name)}</strong>
              <small class="epl-card-phone" title="${escapeAttr(api().formatPhoneDisplay(card.phone))}">${escapeHtml(formatPhoneCard(card.phone))}</small>
            </div>
          </div>
          <div class="epl-card-head-actions">
            <button type="button" class="epl-card-wa" data-open-conversation="${escapeAttr(card.conversationId)}" title="Abrir conversa">${ICONS.wa}</button>
            <button type="button" class="epl-card-move-menu" data-move-menu="${escapeAttr(card.id)}" title="Mover para…">${ICONS.move}</button>
          </div>
        </header>
        ${intelligenceRow(card)}
        <div class="epl-card-meta">
          ${cardMetaLine('📍', card.city)}
          ${cardMetaLine('⚡', consumption !== '—' ? consumption : null)}
          ${cardMetaLine('💰', payment !== '—' ? payment : null)}
          ${cardMetaLine('📅', prazo !== '—' ? prazo : null)}
        </div>
        ${qualificationBar(card)}
        ${assignee}
        ${followUp}
        <footer class="epl-card-foot">
          <span class="epl-card-time">${escapeHtml(formatRelativeTime(card.lastInteractionAt))}</span>
          <div class="epl-card-badges">${closed}${scoreHtml}</div>
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
          <p class="epl-eyebrow">Comercial · Energia Solar</p>
          <h1 class="epl-title">Pipeline Comercial</h1>
          <p class="epl-subtitle">Decida rapidamente quem qualificar, quem visitar e quem está pronto para proposta — sem abrir a conversa.</p>
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

  function findCardById(leadId) {
    const columns = state.kanban?.columns || [];
    for (const col of columns) {
      const hit = (col.cards || []).find((c) => c.id === leadId);
      if (hit) return hit;
    }
    return null;
  }

  function mergeCardInKanban(updated) {
    if (!updated?.id || !state.kanban?.columns) return;
    for (const col of state.kanban.columns) {
      const idx = (col.cards || []).findIndex((c) => c.id === updated.id);
      if (idx >= 0) {
        col.cards[idx] = { ...col.cards[idx], ...updated };
        render();
        return;
      }
    }
  }

  function openLeadDrawer(leadId) {
    leadDrawer()?.open?.(leadId);
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

    state.dom.root.querySelectorAll('[data-open-conversation]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        void openConversation(btn.dataset.openConversation);
      });
    });

    state.dom.root.querySelectorAll('.epl-card').forEach((cardEl) => {
      cardEl.addEventListener('click', (event) => {
        if (event.target.closest('[data-open-conversation], [data-move-menu], button')) return;
        openLeadDrawer(cardEl.dataset.leadId);
      });
      cardEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openLeadDrawer(cardEl.dataset.leadId);
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

    state.dom.root.querySelectorAll('.epl-column').forEach((colEl) => {
      colEl.addEventListener('dragover', onDragOver, true);
      colEl.addEventListener('dragleave', onDragLeave, true);
      colEl.addEventListener('drop', onDrop, true);
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
    const payload = {
      leadId: card.dataset.leadId,
      fromColumn: card.dataset.columnKey,
      element: card,
    };
    state.drag = payload;
    card.classList.add('is-dragging');
    state.dom.root?.classList.add('is-dragging-lead');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', payload.leadId || '');
    event.dataTransfer.setData('application/x-engage-lead', JSON.stringify({
      leadId: payload.leadId,
      fromColumn: payload.fromColumn,
    }));
  }

  function onDragEnd(event) {
    event.currentTarget.classList.remove('is-dragging');
    state.dom.root?.classList.remove('is-dragging-lead');
    state.dom.root?.querySelectorAll('.epl-column.is-drag-over').forEach((el) => el.classList.remove('is-drag-over'));
    state.drag = null;
  }

  function columnFromDropEvent(event) {
    const col = event.currentTarget.closest?.('.epl-column') || event.currentTarget;
    return col?.dataset?.columnKey || col?.dataset?.dropColumn || null;
  }

  function readDragPayload(event) {
    if (state.drag?.leadId) return state.drag;
    try {
      const raw = event.dataTransfer?.getData?.('application/x-engage-lead');
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    const leadId = event.dataTransfer?.getData?.('text/plain');
    if (leadId) return { leadId, fromColumn: null };
    return null;
  }

  function onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const col = event.currentTarget.closest?.('.epl-column') || event.currentTarget;
    col?.classList.add('is-drag-over');
  }

  function onDragLeave(event) {
    const col = event.currentTarget.closest?.('.epl-column') || event.currentTarget;
    const related = event.relatedTarget;
    if (related && col.contains(related)) return;
    col?.classList.remove('is-drag-over');
  }

  function onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const col = event.currentTarget.closest?.('.epl-column') || event.currentTarget;
    col?.classList.remove('is-drag-over');
    const toColumn = columnFromDropEvent(event);
    const payload = readDragPayload(event);
    if (!payload?.leadId || !toColumn) return;
    const fromColumn = payload.fromColumn || state.drag?.fromColumn;
    if (fromColumn && toColumn === fromColumn) return;
    void moveLead(payload.leadId, fromColumn, toColumn);
  }

  async function moveLead(leadId, fromColumn, toColumn) {
    const status = api().columnKeyToApiStatus?.(toColumn) || columnMeta(toColumn).status || toColumn;
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

    const resolvedFrom = fromColumn || findCardColumnKey(leadId);
    if (resolvedFrom) optimisticMove(leadId, resolvedFrom, toColumn);
    try {
      const updated = await api().patchLeadStatus(state.session, leadId, body);
      if (updated?.id && state.kanban) {
        state.kanban = api().mergeStatusPatchIntoKanban(state.kanban, updated);
      }
      state.summary = await api().getSummary(state.session);
      state.error = '';
      render();
    } catch (err) {
      if (resolvedFrom) optimisticMove(leadId, toColumn, resolvedFrom);
      const mapped = api().mapApiError(err);
      state.error = mapped.message;
      render();
    }
  }

  function findCardColumnKey(leadId) {
    if (!state.kanban?.columns) return null;
    for (const col of state.kanban.columns) {
      if ((col.cards || []).some((c) => c.id === leadId)) return col.key;
    }
    return null;
  }

  function optimisticMove(leadId, fromColumn, toColumn) {
    if (!state.kanban?.columns) return;
    let card = null;
    const fromCol = state.kanban.columns.find((c) => c.key === fromColumn);
    const toCol = state.kanban.columns.find((c) => c.key === toColumn);
    if (!fromCol || !toCol) return;
    fromCol.cards = fromCol.cards.filter((c) => {
      if (c.id === leadId) {
        card = { ...c, kanbanColumn: toColumn, status: api().columnKeyToApiStatus?.(toColumn) || columnMeta(toColumn).status };
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
    leadDrawer()?.init?.({
      getSession: () => state.session,
      preferInline: false,
      mountSelector: null,
      findCard: findCardById,
      onLeadUpdated: mergeCardInKanban,
      openConversation: (id) => { void openConversation(id); },
    });
    void loadData();
    startRefresh();
  }

  function deactivate() {
    state.active = false;
    stopRefresh();
    closeNewLeadModal();
    leadDrawer()?.close?.();
  }

  window.ReservaAiEngagePipelineAdmin = {
    activate,
    deactivate,
    reload: loadData,
    openConversation,
  };
})();
