/**
 * Engage Solar — Central de Respostas (respostas de campanha).
 */
(function () {
  const api = () => window.EngageRepliesCenterApi;
  const REFRESH_MS = 30 * 1000;
  const WINDOW_OPTIONS = [
    { key: '1d', label: 'Hoje' },
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

  const KPI_ACCENTS = [
    { accent: '#2563eb', iconBg: '#eff6ff' },
    { accent: '#16a34a', iconBg: '#ecfdf5' },
    { accent: '#059669', iconBg: '#ecfdf5' },
    { accent: '#dc2626', iconBg: '#fef2f2' },
    { accent: '#ea580c', iconBg: '#fff7ed' },
    { accent: '#64748b', iconBg: '#f1f5f9' },
  ];

  const INTEREST_ICONS = {
    BUDGET: '📋',
    VISIT: '🏠',
    SIMULATION: '⚡',
    FINANCING: '💳',
    GENERAL_INTEREST: '✨',
  };

  const ICONS = {
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>',
    spark: '✨',
    campaigns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    sent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16v12H5.17L4 17.17V4z"/><polyline points="22 6 12 13 2 6"/></svg>',
    replies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
    action: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    unknown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
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
    scrollToTable: false,
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

  function timeUrgency(iso) {
    if (!iso) return 'low';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'low';
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 60) return 'high';
    if (mins < 360) return 'medium';
    return 'low';
  }

  function renderTimeBadge(iso) {
    const label = formatRelativeTime(iso);
    const urgency = timeUrgency(iso);
    return `<span class="erc-time-badge" data-urgency="${urgency}">${escapeHtml(label)}</span>`;
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
    const w = 240;
    const h = 48;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = Math.max(max - min, 1);
    const points = data.map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * w;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x},${y}`;
    }).join(' ');
    return `<div class="erc-sparkline-wrap"><svg class="erc-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${points}"/></svg></div>`;
  }

  function aiToneForKey(key) {
    const normalized = String(key || '').trim().toUpperCase();
    return CLASS_TONES[normalized] || 'neutral';
  }

  function interestIcon(key) {
    return INTEREST_ICONS[String(key || '').trim().toUpperCase()] || '📌';
  }

  function renderCampaignLink(item) {
    const name = item.campaignName || '—';
    if (!item.campaignId) return escapeHtml(name);
    return `<button type="button" class="erc-campaign-link" data-open-campaign="${escapeAttr(item.campaignId)}">${escapeHtml(name)}</button>`;
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

  function focusTab(tabKey, { scroll = true } = {}) {
    const next = String(tabKey || '').trim();
    if (!next || next === state.activeTab) {
      if (scroll) scrollToConversations();
      return;
    }
    state.activeTab = next;
    state.scrollToTable = scroll;
    loadData();
  }

  function scrollToConversations() {
    requestAnimationFrame(() => {
      const section = state.dom.root?.querySelector('#ercTableSection');
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderKpiCards(summary) {
    const s = summary || {};
    const cards = [
      { label: 'Campanhas ativas', value: formatNumber(s.activeCampaigns), delta: '', icon: ICONS.campaigns, link: 'campanhas', linkLabel: 'Ver campanhas →' },
      { label: 'Mensagens enviadas', value: formatNumber(s.messagesSent), delta: formatDelta(s.messagesSentDeltaPct), icon: ICONS.sent, tab: 'all', hint: 'Ver todas as respostas' },
      { label: 'Respostas recebidas', value: formatNumber(s.repliesReceived), delta: formatDelta(s.repliesDeltaPct), icon: ICONS.replies, tab: 'all', hint: 'Ver conversas' },
      { label: 'Precisam de ação', value: formatNumber(s.needAction), delta: formatDelta(s.needActionDeltaPct), icon: ICONS.action, tab: 'action', hint: 'Ver quem precisa de você' },
      { label: 'Pediram retorno', value: formatNumber(s.scheduledReturn), delta: formatDelta(s.scheduledReturnDeltaPct), icon: ICONS.clock, tab: 'defer', hint: 'Ver pedidos de retorno' },
      { label: 'Sem classificação', value: formatNumber(s.unclassified), delta: '', icon: ICONS.unknown, tab: 'unclassified', hint: 'Classificar agora' },
    ];
    return `<div class="erc-kpi-grid">${cards.map((card, index) => {
      const accent = KPI_ACCENTS[index] || KPI_ACCENTS[0];
      const isActive = card.tab && state.activeTab === card.tab;
      const clickable = !!card.tab;
      const activeClass = isActive ? ' is-active' : '';
      const clickClass = clickable ? ' erc-kpi-card--clickable' : '';
      const tabAttr = card.tab ? ` data-erc-kpi-tab="${escapeAttr(card.tab)}" role="button" tabindex="0" aria-pressed="${isActive ? 'true' : 'false'}"` : '';
      return `
      <article class="erc-kpi-card${clickClass}${activeClass}" style="--erc-kpi-accent:${accent.accent};--erc-kpi-icon-bg:${accent.iconBg}"${tabAttr}>
        <div class="erc-kpi-card-head">
          <span class="erc-kpi-icon" aria-hidden="true">${card.icon}</span>
        </div>
        <span class="erc-kpi-label">${escapeHtml(card.label)}</span>
        <strong class="erc-kpi-value">${escapeHtml(card.value)}</strong>
        ${card.delta ? `<div class="erc-kpi-delta">${card.delta}</div>` : ''}
        ${card.hint ? `<span class="erc-kpi-hint">${escapeHtml(card.hint)}</span>` : ''}
        ${card.link ? `<button type="button" class="erc-kpi-link" data-es-nav-jump="${escapeHtml(card.link)}">${escapeHtml(card.linkLabel)}</button>` : ''}
      </article>`;
    }).join('')}</div>`;
  }

  function renderActionList(title, count, items, mode, focusTab) {
    const rows = Array.isArray(items) ? items : [];
    const badgeTone = mode === 'action' ? 'danger' : 'warn';
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
                ${renderCampaignLink(item)}
                ${renderTimeBadge(item.receivedAt)}
              </div>
            </div>
          </div>
          ${mode === 'scheduled' && item.nextContactAt
            ? `<span class="erc-return-badge">Retorno em ${formatDateShort(item.nextContactAt)}</span>`
            : ''}
          <div class="erc-list-item-actions">
            <button type="button" class="erc-btn erc-btn--wa" title="Abrir WhatsApp" data-open-conversation="${escapeAttr(item.conversationId || item.id)}">${ICONS.wa}</button>
            <button type="button" class="erc-btn erc-btn--primary" data-open-conversation="${escapeAttr(item.conversationId || item.id)}">
              ${mode === 'scheduled' ? 'Ver conversa' : 'Abrir conversa'}
            </button>
            ${mode === 'action' && item.needsSeller !== false
              ? '<button type="button" class="erc-btn erc-btn--ghost" disabled title="Em breve">Atribuir vendedor</button>'
              : ''}
          </div>
        </article>
      `).join('')
      : `<div class="erc-empty-state">Nenhuma resposta nesta categoria.${focusTab && count > 0 ? ` <button type="button" class="erc-empty-link" data-erc-focus-tab="${escapeAttr(focusTab)}">Ver na lista completa (${formatNumber(count)})</button>` : ''}</div>`;
    return `
      <section class="erc-panel-card${focusTab ? ' erc-panel-card--clickable' : ''}"${focusTab ? ` data-erc-focus-tab="${escapeAttr(focusTab)}" role="button" tabindex="0"` : ''}>
        <header class="erc-panel-card-head">
          <h3>${escapeHtml(title)}</h3>
          <div class="erc-panel-card-head-actions">
            ${focusTab ? `<button type="button" class="erc-panel-see-all" data-erc-focus-tab="${escapeAttr(focusTab)}">Ver todas (${formatNumber(count)})</button>` : ''}
            <span class="erc-panel-badge" data-tone="${badgeTone}">${formatNumber(count)}</span>
          </div>
        </header>
        <div class="erc-panel-card-body">
          <div class="erc-list">${body}</div>
        </div>
      </section>
    `;
  }

  function renderInterestBuckets(buckets, totalInterested) {
    const rows = Array.isArray(buckets) ? buckets : [];
    const body = rows.length
      ? rows.map((row) => `
        <div class="erc-interest-row">
          <span class="erc-interest-row-left">
            <span class="erc-interest-icon" aria-hidden="true">${interestIcon(row.key)}</span>
            <span>${escapeHtml(row.label)}</span>
          </span>
          <strong>${formatNumber(row.count)}</strong>
        </div>
      `).join('')
      : `<div class="erc-empty-state">Sem interesses classificados no período.${totalInterested > 0 ? ` <button type="button" class="erc-empty-link" data-erc-focus-tab="interested">Ver interessados (${formatNumber(totalInterested)})</button>` : ''}</div>`;
    return `
      <section class="erc-panel-card erc-panel-card--clickable" data-erc-focus-tab="interested" role="button" tabindex="0">
        <header class="erc-panel-card-head">
          <h3>Interessados</h3>
          <div class="erc-panel-card-head-actions">
            <button type="button" class="erc-panel-see-all" data-erc-focus-tab="interested">Ver todas (${formatNumber(totalInterested)})</button>
            <span class="erc-panel-badge" data-tone="ok">${formatNumber(totalInterested)}</span>
          </div>
        </header>
        <div class="erc-panel-card-body">
          <div class="erc-interest-list">${body}</div>
        </div>
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
        <div class="erc-panel-card-body">
          <div class="erc-response-time">
            <strong>${escapeHtml(label)}</strong>
            <p class="erc-response-time-label">Média no período selecionado</p>
            ${sparklineSvg(series, '#2563eb')}
          </div>
        </div>
      </section>
    `;
  }

  function aiTabForKey(key) {
    const normalized = String(key || '').trim().toUpperCase().replace(/\s+/g, '_');
    const map = {
      INTERESTED: 'interested',
      INTERESSADO: 'interested',
      SCHEDULED_RETURN: 'defer',
      RETORNO_FUTURO: 'defer',
      ADIADO: 'defer',
      NO_INTEREST: 'no_interest',
      SEM_INTERESSE: 'no_interest',
      UNCLASSIFIED: 'unclassified',
      NAO_CLASSIFICADO: 'unclassified',
      DOUBT: 'action',
      DUVIDAS: 'action',
    };
    return map[normalized] || '';
  }

  function renderAiClassification(buckets) {
    const rows = Array.isArray(buckets) ? buckets : [];
    const body = rows.length
      ? rows.map((row) => {
        const tone = aiToneForKey(row.key || row.label);
        const tab = aiTabForKey(row.key || row.label);
        const tabAttr = tab ? ` data-erc-focus-tab="${escapeAttr(tab)}" role="button" tabindex="0"` : '';
        return `
        <div class="erc-ai-row${tab ? ' erc-ai-row--clickable' : ''}"${tabAttr}>
          <div class="erc-ai-row-label">
            <span class="erc-ai-row-label-left">
              <span class="erc-ai-dot" data-tone="${tone}"></span>
              <span>${escapeHtml(row.label)}</span>
            </span>
            <small>${formatNumber(row.count)} · ${Number(row.pct || 0)}%</small>
          </div>
          <div class="erc-ai-bar" aria-hidden="true"><span data-tone="${tone}" style="width:${Math.max(4, Number(row.pct || 0))}%"></span></div>
        </div>`;
      }).join('')
      : '<div class="erc-empty-state">Classificação IA indisponível.</div>';
    return `
      <section class="erc-panel-card">
        <header class="erc-panel-card-head">
          <h3>Classificação da IA</h3>
        </header>
        <div class="erc-panel-card-body">
          <div class="erc-ai-list">${body}</div>
        </div>
      </section>
    `;
  }

  function renderAiTip(tip) {
    if (!tip?.message) return '';
    return `
      <section class="erc-tip-card">
        <span class="erc-tip-badge">${ICONS.spark} Dica da IA</span>
        <p>${escapeHtml(tip.message)}</p>
        <button type="button" class="erc-btn" id="ercAiTipBtn">Ver conversas</button>
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
        <td>${renderTimeBadge(item.receivedAt)}</td>
        <td class="erc-table-actions">
          <button type="button" class="erc-icon-btn" data-tone="wa" title="Abrir WhatsApp" data-open-conversation="${escapeAttr(item.conversationId || item.id)}">${ICONS.wa}</button>
          <button type="button" class="erc-icon-btn" title="Abrir conversa" data-open-conversation="${escapeAttr(item.conversationId || item.id)}">↗</button>
          <button type="button" class="erc-icon-btn" title="Converter em Lead" data-convert-lead="${escapeAttr(item.conversationId || item.id)}">🎯</button>
        </td>
      </tr>
    `).join('');
  }

  function renderToolbar() {
    const windowOptions = WINDOW_OPTIONS.map((opt) => {
      const selected = opt.key === state.windowKey ? ' selected' : '';
      return `<option value="${escapeAttr(opt.key)}"${selected}>${escapeHtml(opt.label)}</option>`;
    }).join('');
    return `
      <header class="erc-toolbar">
        <div class="erc-toolbar-copy">
          <p class="erc-eyebrow">Engage Solar</p>
          <h2 class="erc-title">Central de Respostas</h2>
        </div>
        <div class="erc-toolbar-actions">
          <label class="erc-period-pill">
            ${ICONS.calendar}
            <select id="ercWindowSelect" aria-label="Período">${windowOptions}</select>
          </label>
          <button type="button" class="erc-btn erc-btn--ghost" id="ercFilterBtn" disabled title="Em breve">${ICONS.filter} Filtros</button>
          <button type="button" class="erc-btn erc-btn--outline" id="ercRefreshBtn">${ICONS.refresh} Atualizar</button>
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
        ${renderActionList('Respostas que precisam de ação', data.summary.needAction, data.needActionItems, 'action', 'action')}
        ${renderActionList('Pediram para retornar depois', data.summary.scheduledReturn, data.scheduledReturnItems, 'scheduled', 'defer')}
        ${renderInterestBuckets(data.interestBuckets, interestedTotal)}
        <div class="erc-insights-col">
          ${renderResponseTime(data.avgResponseTimeMinutes, data.responseTimeSeries)}
          ${renderAiClassification(data.aiClassification)}
          ${renderAiTip(data.aiTip)}
        </div>
      </div>
      <section class="erc-table-section" id="ercTableSection">
        <div class="erc-table-toolbar">
          <div class="erc-tabs" role="tablist">${renderTableTabs()}</div>
          <div class="erc-table-tools">
            <label class="erc-search-wrap">
              ${ICONS.search}
              <input type="search" id="ercSearchInput" class="erc-search" placeholder="Buscar conversas…" value="${escapeAttr(state.searchTerm)}" />
            </label>
            <button type="button" class="erc-btn erc-btn--outline" id="ercExportBtn" disabled title="Em breve">${ICONS.export} Exportar</button>
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
        focusTab(button.dataset.ercTab || '', { scroll: false });
      });
    });

    state.dom.root.querySelectorAll('[data-erc-kpi-tab]').forEach((card) => {
      const activate = (event) => {
        if (event?.target?.closest?.('[data-es-nav-jump]')) return;
        focusTab(card.dataset.ercKpiTab || '');
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate(event);
        }
      });
    });

    state.dom.root.querySelectorAll('[data-erc-focus-tab]').forEach((el) => {
      const activate = (event) => {
        if (event?.target?.closest?.('[data-open-conversation], [data-open-campaign], [data-es-nav-jump]')) return;
        focusTab(el.dataset.ercFocusTab || '');
      };
      el.addEventListener('click', activate);
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate(event);
        }
      });
    });

    state.dom.root.querySelectorAll('[data-open-conversation]').forEach((button) => {
      button.addEventListener('click', () => {
        void openConversation(button.dataset.openConversation);
      });
    });

    state.dom.root.querySelectorAll('[data-convert-lead]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const conversationId = button.dataset.convertLead;
        if (!conversationId || !window.EngagePipelineApi?.createLead) return;
        try {
          const result = await window.EngagePipelineApi.createLead(state.session, { conversationId });
          if (result.created === false) {
            const statusLabel = window.EngagePipelineApi.leadColumnLabel?.(result.lead)
              || result.lead?.status
              || 'ativo';
            window.alert(`Lead já existente — ${statusLabel}`);
          }
          document.querySelector('[data-es-nav="pipeline"]')?.click();
        } catch (err) {
          const mapped = window.EngagePipelineApi.mapApiError?.(err) || { message: err?.message };
          window.alert(mapped.message || 'Não foi possível converter em Lead.');
        }
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

    state.dom.root.querySelector('#ercAiTipBtn')?.addEventListener('click', () => {
      focusTab('action');
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
      if (state.scrollToTable) {
        state.scrollToTable = false;
        scrollToConversations();
      }
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
