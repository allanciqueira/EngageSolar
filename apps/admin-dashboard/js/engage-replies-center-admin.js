/**
 * Engage Solar — Central de Respostas (respostas de campanha).
 */
(function () {
  const api = () => window.EngageRepliesCenterApi;
  const REFRESH_MS = 30 * 1000;
  const WINDOW_OPTIONS = [
    { key: '1d', label: 'Último dia' },
    { key: '7d', label: 'Última semana' },
    { key: '15d', label: 'Últimos 15 dias' },
    { key: '30d', label: 'Último mês' },
  ];

  const TAB_OPTIONS = [
    { key: 'all', label: 'Todas' },
    { key: 'action', label: 'Precisam de ação' },
    { key: 'interested', label: 'Interessados' },
    { key: 'defer', label: 'Retorno futuro' },
    { key: 'no_interest', label: 'Sem interesse' },
    { key: 'unclassified', label: 'Não classificados' },
  ];

  const CLASS_TONES = {
    INTERESTED: 'ok',
    INTERESSADO: 'ok',
    SCHEDULED_RETURN: 'warn',
    RETORNO_FUTURO: 'warn',
    ADIADO: 'warn',
    NO_INTEREST: 'danger',
    SEM_INTERESSE: 'danger',
    DOUBT: 'info',
    DUVIDAS: 'info',
    UNCLASSIFIED: 'neutral',
    NAO_CLASSIFICADO: 'neutral',
  };

  const state = {
    mounted: false,
    active: false,
    session: null,
    loading: false,
    error: '',
    windowKey: '7d',
    activeTab: 'all',
    searchTerm: '',
    data: null,
    refreshTimerId: null,
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
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatNumber(value) {
    const n = Number(value || 0);
    return n.toLocaleString('pt-BR');
  }

  function formatDelta(pct) {
    const n = Number(pct || 0);
    if (!n) return '— vs período anterior';
    const sign = n > 0 ? '+' : '';
    const tone = n > 0 ? 'up' : 'down';
    return `<span class="erc-delta" data-tone="${tone}">${sign}${n}% vs período anterior</span>`;
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

  function classificationTone(key) {
    const normalized = String(key || '').trim().toUpperCase().replace(/\s+/g, '_');
    return CLASS_TONES[normalized] || 'neutral';
  }

  function classificationLabel(item) {
    if (item?.classificationLabel) return item.classificationLabel;
    const map = {
      INTERESTED: 'Interessado',
      SCHEDULED_RETURN: 'Retorno futuro',
      NO_INTEREST: 'Sem interesse',
      DOUBT: 'Dúvidas',
      UNCLASSIFIED: 'Não classificado',
      ADIADO: 'Retorno futuro',
      SEM_INTERESSE: 'Sem interesse',
      INTERESSADO: 'Interessado',
    };
    const key = String(item?.classification || '').trim().toUpperCase();
    return map[key] || key || '—';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function sparklineSvg(values, color) {
    const data = Array.isArray(values) && values.length ? values : [4, 6, 5, 7, 6, 8, 7];
    const w = 120;
    const h = 36;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = Math.max(max - min, 1);
    const points = data.map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    }).join(' ');
    return `<svg class="erc-sparkline" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" points="${points}"/></svg>`;
  }

  function renderAvatar(item) {
    if (item.avatarUrl) {
      return `<img class="erc-avatar" src="${escapeAttr(item.avatarUrl)}" alt="" loading="lazy" />`;
    }
    return `<span class="erc-avatar erc-avatar--initials" aria-hidden="true">${escapeHtml(initials(item.contactName))}</span>`;
  }

  function renderClassificationChip(item) {
    const label = classificationLabel(item);
    const tone = classificationTone(item.classification || label);
    return `<span class="erc-chip" data-tone="${tone}">${escapeHtml(label)}</span>`;
  }

  function renderKpiCards(summary) {
    const s = summary || {};
    const cards = [
      { label: 'Campanhas ativas', value: formatNumber(s.activeCampaigns), delta: '', link: 'campanhas', linkLabel: 'Ver campanhas →' },
      { label: 'Mensagens enviadas', value: formatNumber(s.messagesSent), delta: formatDelta(s.messagesSentDeltaPct) },
      { label: 'Respostas recebidas', value: formatNumber(s.repliesReceived), delta: formatDelta(s.repliesDeltaPct) },
      { label: 'Precisam de ação', value: formatNumber(s.needAction), delta: formatDelta(s.needActionDeltaPct) },
      { label: 'Pediram retorno', value: formatNumber(s.scheduledReturn), delta: formatDelta(s.scheduledReturnDeltaPct) },
      { label: 'Sem classificação', value: formatNumber(s.unclassified), delta: '' },
    ];
    return `<div class="erc-kpi-grid">${cards.map((card) => `
      <article class="erc-kpi-card">
        <span class="erc-kpi-label">${escapeHtml(card.label)}</span>
        <strong class="erc-kpi-value">${escapeHtml(card.value)}</strong>
        ${card.delta ? `<div class="erc-kpi-delta">${card.delta}</div>` : ''}
        ${card.link ? `<button type="button" class="erc-kpi-link" data-es-nav-jump="${escapeHtml(card.link)}">${escapeHtml(card.linkLabel)}</button>` : ''}
      </article>
    `).join('')}</div>`;
  }

  function renderActionList(title, count, items, mode) {
    const rows = Array.isArray(items) ? items : [];
    const body = rows.length
      ? rows.map((item) => `
        <article class="erc-list-item">
          <div class="erc-list-item-head">
            ${renderAvatar(item)}
            <div class="erc-list-item-copy">
              <strong>${escapeHtml(item.contactName)}</strong>
              ${item.phone ? `<small class="erc-phone">${escapeHtml(item.phone)}</small>` : ''}
              <p>${escapeHtml(item.messagePreview || '—')}</p>
              <div class="erc-list-item-meta">
                <span>${escapeHtml(item.campaignName)}</span>
                <span>${formatRelativeTime(item.receivedAt)}</span>
              </div>
            </div>
          </div>
          ${mode === 'scheduled' && item.nextContactAt
            ? `<span class="erc-return-badge">Retorno em ${formatDateShort(item.nextContactAt)}</span>`
            : ''}
          <div class="erc-list-item-actions">
            <button type="button" class="erc-btn erc-btn--ghost" data-open-conversation="${escapeAttr(item.conversationId || item.id)}">
              ${mode === 'scheduled' ? 'Ver conversa' : 'Abrir conversa'}
            </button>
            ${mode === 'action' && item.needsSeller !== false
              ? '<button type="button" class="erc-btn erc-btn--outline" disabled title="Em breve">Atribuir vendedor</button>'
              : ''}
          </div>
        </article>
      `).join('')
      : '<p class="erc-muted">Nenhuma resposta nesta categoria.</p>';
    return `
      <section class="erc-panel-card">
        <header class="erc-panel-card-head">
          <h3>${escapeHtml(title)} <span class="erc-count">(${formatNumber(count)})</span></h3>
        </header>
        <div class="erc-list">${body}</div>
      </section>
    `;
  }

  function renderInterestBuckets(buckets, totalInterested) {
    const rows = Array.isArray(buckets) ? buckets : [];
    const body = rows.length
      ? rows.map((row) => `
        <div class="erc-interest-row">
          <span>${escapeHtml(row.label)}</span>
          <strong>${formatNumber(row.count)}</strong>
        </div>
      `).join('')
      : '<p class="erc-muted">Sem interesses classificados no período.</p>';
    return `
      <section class="erc-panel-card">
        <header class="erc-panel-card-head">
          <h3>Interessados <span class="erc-count">(${formatNumber(totalInterested)})</span></h3>
        </header>
        <div class="erc-interest-list">${body}</div>
      </section>
    `;
  }

  function renderResponseTime(avgMinutes, series) {
    const label = avgMinutes > 0 ? `${avgMinutes} min` : '—';
    return `
      <section class="erc-panel-card erc-panel-card--compact">
        <header class="erc-panel-card-head">
          <h3>Tempo médio de resposta</h3>
        </header>
        <div class="erc-response-time">
          <strong>${escapeHtml(label)}</strong>
          ${sparklineSvg(series, '#2563eb')}
        </div>
      </section>
    `;
  }

  function renderAiClassification(buckets) {
    const rows = Array.isArray(buckets) ? buckets : [];
    const body = rows.length
      ? rows.map((row) => `
        <div class="erc-ai-row">
          <div class="erc-ai-row-label">
            <span>${escapeHtml(row.label)}</span>
            <small>${formatNumber(row.count)} · ${Number(row.pct || 0)}%</small>
          </div>
          <div class="erc-ai-bar" aria-hidden="true"><span style="width:${Math.max(4, Number(row.pct || 0))}%"></span></div>
        </div>
      `).join('')
      : '<p class="erc-muted">Classificação IA indisponível.</p>';
    return `
      <section class="erc-panel-card">
        <header class="erc-panel-card-head">
          <h3>Classificação da IA</h3>
        </header>
        <div class="erc-ai-list">${body}</div>
      </section>
    `;
  }

  function renderAiTip(tip) {
    if (!tip?.message) return '';
    return `
      <section class="erc-tip-card">
        <span class="erc-tip-badge">Dica da IA</span>
        <p>${escapeHtml(tip.message)}</p>
      </section>
    `;
  }

  function tabCount(key, data) {
    const tabs = data?.conversations?.tabs || {};
    const map = {
      all: tabs.all,
      action: tabs.needAction,
      interested: tabs.interested,
      defer: tabs.scheduledReturn,
      no_interest: tabs.noInterest,
      unclassified: tabs.unclassified,
    };
    return Number(map[key] ?? 0);
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

  function renderTableTabs() {
    return TAB_OPTIONS.map((tab) => {
      const count = tabCount(tab.key, state.data);
      const active = state.activeTab === tab.key ? ' is-active' : '';
      return `<button type="button" class="erc-tab${active}" data-erc-tab="${escapeAttr(tab.key)}">${escapeHtml(tab.label)} (${formatNumber(count)})</button>`;
    }).join('');
  }

  function renderTableRows(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return '<tr><td colspan="6" class="erc-muted">Nenhuma conversa encontrada.</td></tr>';
    }
    return rows.map((item) => `
      <tr>
        <td>
          <div class="erc-table-contact">
            ${renderAvatar(item)}
            <div>
              <strong>${escapeHtml(item.contactName)}</strong>
              <small>${escapeHtml(item.phone || '—')}</small>
            </div>
          </div>
        </td>
        <td class="erc-table-message">${escapeHtml(item.messagePreview || '—')}</td>
        <td>
          ${item.campaignId
            ? `<button type="button" class="erc-link" data-open-campaign="${escapeAttr(item.campaignId)}">${escapeHtml(item.campaignName)}</button>`
            : escapeHtml(item.campaignName)}
        </td>
        <td>${renderClassificationChip(item)}</td>
        <td>${formatRelativeTime(item.receivedAt)}</td>
        <td class="erc-table-actions">
          <button type="button" class="erc-icon-btn" title="Abrir WhatsApp" data-open-conversation="${escapeAttr(item.conversationId || item.id)}">💬</button>
        </td>
      </tr>
    `).join('');
  }

  function renderToolbar() {
    const windowOptions = WINDOW_OPTIONS.map((opt) => {
      const selected = opt.key === state.windowKey ? ' selected' : '';
      return `<option value="${escapeAttr(opt.key)}"${selected}>${escapeHtml(opt.label)}</option>`;
    }).join('');
    const windowLabel = state.data?.window?.label || WINDOW_OPTIONS.find((w) => w.key === state.windowKey)?.label || '';
    return `
      <header class="erc-toolbar">
        <div class="erc-toolbar-copy">
          <p class="erc-eyebrow">Engage</p>
          <h2 class="erc-title">Central de Respostas</h2>
          <p class="erc-lead">Acompanhe todas as respostas das suas campanhas em um só lugar.</p>
          ${windowLabel ? `<p class="erc-window-hint">Período: ${escapeHtml(windowLabel)}</p>` : ''}
        </div>
        <div class="erc-toolbar-actions">
          <label class="erc-field">
            <span>Período</span>
            <select id="ercWindowSelect">${windowOptions}</select>
          </label>
          <button type="button" class="erc-btn erc-btn--outline" id="ercRefreshBtn">Atualizar</button>
        </div>
      </header>
    `;
  }

  function renderContent() {
    const data = state.data;
    if (state.loading && !data) {
      return '<div class="erc-loading">Carregando respostas…</div>';
    }
    if (state.error && !data) {
      return `<div class="erc-error" role="alert">${escapeHtml(state.error)}</div>`;
    }
    if (!data) return '<div class="erc-muted">Sem dados.</div>';

    const interestedTotal = tabCount('interested', data) || data.interestBuckets.reduce((sum, b) => sum + Number(b.count || 0), 0);

    return `
      ${renderKpiCards(data.summary)}
      <div class="erc-main-grid">
        <div class="erc-main-col">
          ${renderActionList('Respostas que precisam de ação', data.summary.needAction, data.needActionItems, 'action')}
          ${renderActionList('Pediram para retornar depois', data.summary.scheduledReturn, data.scheduledReturnItems, 'scheduled')}
        </div>
        <div class="erc-side-col">
          ${renderInterestBuckets(data.interestBuckets, interestedTotal)}
          ${renderResponseTime(data.avgResponseTimeMinutes, data.responseTimeSeries)}
          ${renderAiClassification(data.aiClassification)}
          ${renderAiTip(data.aiTip)}
        </div>
      </div>
      <section class="erc-table-section">
        <div class="erc-table-toolbar">
          <div class="erc-tabs" role="tablist">${renderTableTabs()}</div>
          <div class="erc-table-tools">
            <input type="search" id="ercSearchInput" class="erc-search" placeholder="Buscar conversas…" value="${escapeAttr(state.searchTerm)}" />
            <button type="button" class="erc-btn erc-btn--outline" id="ercExportBtn" disabled title="Em breve">Exportar</button>
          </div>
        </div>
        <div class="erc-table-wrap">
          <table class="erc-table">
            <thead>
              <tr>
                <th>Contato</th>
                <th>Mensagem</th>
                <th>Campanha</th>
                <th>Classificação IA</th>
                <th>Recebido em</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>${renderTableRows(data.conversations.items)}</tbody>
          </table>
        </div>
        <footer class="erc-footer">
          Atualizado ${formatRelativeTime(data.fetchedAt)} · refresh 30s
          ${state.error ? ` · <span class="erc-footer-warn">${escapeHtml(state.error)}</span>` : ''}
        </footer>
      </section>
    `;
  }

  function render() {
    if (!state.dom.root) return;
    state.dom.root.innerHTML = `${renderToolbar()}<div class="erc-body">${renderContent()}</div>`;
    bindDom();
  }

  function bindDom() {
    state.dom.windowSelect = state.dom.root.querySelector('#ercWindowSelect');
    state.dom.refreshBtn = state.dom.root.querySelector('#ercRefreshBtn');
    state.dom.searchInput = state.dom.root.querySelector('#ercSearchInput');
    state.dom.exportBtn = state.dom.root.querySelector('#ercExportBtn');

    state.dom.windowSelect?.addEventListener('change', () => {
      state.windowKey = state.dom.windowSelect.value || '7d';
      loadData();
    });
    state.dom.refreshBtn?.addEventListener('click', () => loadData());
    state.dom.searchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        state.searchTerm = state.dom.searchInput.value.trim();
        loadData();
      }
    });

    state.dom.root.querySelectorAll('[data-erc-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeTab = button.dataset.ercTab || '';
        loadData();
      });
    });

    state.dom.root.querySelectorAll('[data-open-conversation]').forEach((button) => {
      button.addEventListener('click', () => {
        void openConversation(button.dataset.openConversation);
      });
    });

    state.dom.root.querySelectorAll('[data-open-campaign]').forEach((button) => {
      button.addEventListener('click', () => {
        const campaignId = button.dataset.openCampaign;
        document.querySelector('[data-es-nav="campanhas"]')?.click();
        if (campaignId && window.ReservaAiEngageCampaignsAdmin?.selectCampaign) {
          window.ReservaAiEngageCampaignsAdmin.selectCampaign(campaignId);
        }
      });
    });

    state.dom.root.querySelectorAll('[data-es-nav-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        const panel = button.dataset.esNavJump;
        document.querySelector(`[data-es-nav="${panel}"]`)?.click();
      });
    });
  }

  async function loadData() {
    if (!state.active || !state.session) return;
    const token = String(
      state.session?.externalAccessToken
      || window.ReservaAiAuth?.getAccessToken?.()
      || window.EngageSolarAuth?.getAccessToken?.()
      || '',
    ).trim();
    if (!token) {
      state.error = 'Sessão sem token de acesso. Faça login novamente.';
      state.loading = false;
      render();
      return;
    }
    state.loading = true;
    state.error = '';
    render();
    try {
      const payload = await api().load(state.session, {
        window: state.windowKey,
        tab: state.activeTab,
        q: state.searchTerm,
        limit: 50,
      });
      state.data = payload;
    } catch (err) {
      const status = Number(err?.statusCode || err?.status || err?.details?.status || 0);
      if (status === 401) {
        state.error = 'Sessão expirada ou token inválido. Faça login novamente.';
      } else {
        state.error = err?.message || 'Falha ao carregar Central de Respostas.';
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  function startRefresh() {
    stopRefresh();
    state.refreshTimerId = window.setInterval(() => {
      if (state.active) loadData();
    }, REFRESH_MS);
  }

  function stopRefresh() {
    if (state.refreshTimerId) {
      window.clearInterval(state.refreshTimerId);
      state.refreshTimerId = null;
    }
  }

  function mount() {
    state.dom.root = document.getElementById('adminEngageRepliesCenterRoot');
    if (!state.dom.root || state.mounted) return;
    state.mounted = true;
  }

  function activate(session) {
    mount();
    state.active = true;
    state.session = session || null;
    loadData();
    startRefresh();
  }

  function deactivate() {
    state.active = false;
    stopRefresh();
  }

  window.ReservaAiEngageRepliesCenterAdmin = {
    activate,
    deactivate,
    reload: loadData,
  };
})();
