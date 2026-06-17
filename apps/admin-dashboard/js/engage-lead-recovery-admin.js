/**
 * Engage Intelligence → Lead Recovery Intelligence (painel standalone).
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-LEAD-RECOVERY-INTELLIGENCE.md
 */
(function () {
  const api = () => window.EngageLeadRecoveryApi;
  const CONTACTS_LIMIT = 100;
  const OPP_SORT_KEYS = [
    'name', 'recoveryScore', 'recoveryPriority', 'recoveryDaysSinceLoss', 'barrier',
    'recommendedAction', 'specialCaseBadge', 'registeredAt', 'sourceAudienceName',
    'lastCampaignName', 'lastCampaignSentAt', 'lastCampaignFailedAt',
    'lastCampaignReadAt', 'lastCampaignReplyAt',
  ];

  let session = null;
  let active = false;
  let loading = false;
  let busy = false;
  let viewTab = 'decision';
  let oppPage = 1;
  const OPP_PAGE_SIZE = 20;

  const MAIN_TABS = [
    { id: 'decision', label: 'Decisão' },
    { id: 'analytics', label: 'Recovery Analytics' },
  ];

  const ICONS = {
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 .88.21 1.71.58 2.45A5.5 5.5 0 0 0 6.5 21h11a5.5 5.5 0 0 0 1.92-10.05A5.5 5.5 0 0 0 14.5 2 5.5 5.5 0 0 0 9.5 2z"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  };

  const KPI_STYLES = [
    { icon: ICONS.users, bg: '#f5f3ff', color: '#7c3aed' },
    { icon: ICONS.alert, bg: '#fef2f2', color: '#dc2626' },
    { icon: ICONS.clock, bg: '#fef9c3', color: '#ca8a04' },
    { icon: ICONS.target, bg: '#eff6ff', color: '#2563eb' },
    { icon: ICONS.ban, bg: '#f1f5f9', color: '#64748b' },
    { icon: ICONS.brain, bg: '#ecfdf5', color: '#16a34a' },
    { icon: ICONS.money, bg: '#faf5ff', color: '#9333ea' },
    { icon: ICONS.money, bg: '#eff6ff', color: '#2563eb' },
  ];
  let stats = null;
  let insights = null;
  let signals = null;
  let contacts = { items: [] };
  let opportunities = { items: [], total: 0, filterLabel: '' };
  let signalId = '';
  let oppSortBy = 'recoveryScore';
  let oppSortDir = 'desc';
  let contactsSortBy = 'recoveryScore';
  let contactsSortDir = 'desc';
  let reclassifyPreview = null;
  let reclassifyForce = false;
  let auditData = null;
  let error = '';
  let activateSeq = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function isStandalonePanel() {
    return document.body.dataset.esPanelActive === 'engage-intelligence';
  }

  function getRoot() {
    if (isStandalonePanel()) {
      return document.getElementById('adminEngageLeadRecoveryRoot');
    }
    return document.getElementById('engageLeadRecoveryContent')
      || document.getElementById('adminEngageLeadRecoveryRoot');
  }

  function activeQueueQuery(extra = {}) {
    return api().activeQueueParams(extra);
  }

  function isDecisionTab() {
    return viewTab === 'decision';
  }

  function pctOf(part, total) {
    const p = Number(part || 0);
    const t = Number(total || 0);
    if (!t) return '—';
    return `${((p / t) * 100).toFixed(1).replace('.', ',')}% do total`;
  }

  function defaultDateLabel() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return `${from.toLocaleDateString('pt-BR')} – ${to.toLocaleDateString('pt-BR')}`;
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

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR');
    } catch (_e) {
      return '—';
    }
  }

  function formatTokens(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n >= 1_000_000) {
      return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} M`;
    }
    if (n >= 1000) {
      return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} k`;
    }
    return n.toLocaleString('pt-BR');
  }

  function formatCostUsd(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `US$ ${n.toFixed(4)}`;
  }

  function formatDays(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toLocaleString('pt-BR')} dias`;
  }

  function formatCampaignTimestamp(iso) {
    if (!iso) return '—';
    return formatDateTime(iso);
  }

  function formatCampaignFailed(row) {
    const at = row?.lastCampaignFailedAt;
    const hint = String(
      row?.lastCampaignFailedHint
      || row?.lastCampaignFailureHint
      || row?.lastCampaignFailureReason
      || '',
    ).trim();
    if (!at && !hint) return '—';
    const parts = [];
    if (at) parts.push(formatDateTime(at));
    if (hint) parts.push(hint);
    return parts.join(' · ');
  }

  function renderLastCampaignCell(row) {
    const name = row.lastCampaignName || '—';
    const engagement = row.campaignEngagementLabel
      ? ` · ${row.campaignEngagementLabel}`
      : '';
    return `${escapeHtml(name)}${engagement ? escapeHtml(engagement) : ''}`;
  }

  function canManage() {
    return api()?.canManage?.(session) || false;
  }

  let feedbackMsg = '';
  let feedbackTone = 'neutral';

  function isActivationCurrent(seq) {
    return active && seq === activateSeq;
  }

  function setFeedback(message, tone = 'neutral') {
    feedbackMsg = message || '';
    feedbackTone = tone;
    if (active) render();
  }

  function setLoading(on) {
    loading = on;
    if (active) render();
  }

  function priorityTone(code) {
    const key = String(code || '').toUpperCase();
    if (key === 'ALTA') return 'danger';
    if (key === 'MEDIA') return 'info';
    if (key === 'BAIXA') return 'muted';
    if (key === 'DESCARTAR') return 'muted';
    return 'muted';
  }

  function priorityChip(code) {
    const tone = priorityTone(code);
    return `<span class="elri-priority" data-tone="${escapeHtml(tone)}">${escapeHtml(api().labelPriority(code))}</span>`;
  }

  function kpiCard(label, value, sub, styleIndex) {
    const style = KPI_STYLES[styleIndex] || KPI_STYLES[0];
    return `
      <article class="elri-kpi-card">
        <div class="elri-kpi-head">
          <span class="elri-kpi-icon" style="background:${style.bg};color:${style.color}">${style.icon}</span>
        </div>
        <p class="elri-kpi-label">${escapeHtml(label)}</p>
        <p class="elri-kpi-value">${escapeHtml(String(value ?? '—'))}</p>
        ${sub ? `<p class="elri-kpi-sub">${escapeHtml(sub)}</p>` : ''}
      </article>`;
  }

  function renderToolbar() {
    const adminBtns = canManage()
      ? `<button type="button" class="elri-btn elri-btn--ghost" data-elri-action="reclassify"${busy ? ' disabled' : ''}>Reprocessar leads…</button>`
      : '';
    const fullscreenBtn = !isStandalonePanel()
      ? `<button type="button" class="elri-btn elri-btn--outline" data-elri-open-standalone>Engage Intelligence</button>`
      : '';
    return `
      <header class="elri-toolbar">
        <div>
          <p class="elri-breadcrumb">Engage Solar › Inteligência › Lead Recovery</p>
          <h2 class="elri-title">Lead Recovery Intelligence</h2>
          <p class="elri-lead">Painel de decisão sobre leads perdidos — priorização, insights e reprocessamento controlado.</p>
        </div>
        <div class="elri-toolbar-actions">
          <span class="elri-period-pill">${ICONS.calendar} ${escapeHtml(defaultDateLabel())}</span>
          <button type="button" class="elri-btn elri-btn--ghost" disabled title="Em breve">${ICONS.filter} Filtros</button>
          ${canManage() ? `<button type="button" class="elri-btn elri-btn--outline" data-elri-action="export"${busy ? ' disabled' : ''}>${ICONS.export} Exportar</button>` : ''}
          <button type="button" class="elri-btn elri-btn--ghost" data-elri-action="refresh"${loading || busy ? ' disabled' : ''}>${ICONS.refresh} Atualizar</button>
          ${adminBtns}
          ${fullscreenBtn}
        </div>
      </header>`;
  }

  function renderMainTabs() {
    return `
      <nav class="elri-main-tabs" role="tablist" aria-label="Lead Recovery">
        ${MAIN_TABS.map((tab) => {
          const active = viewTab === tab.id ? ' is-active' : '';
          const soon = tab.soon ? ' is-soon' : '';
          const disabled = tab.soon ? ' disabled' : '';
          return `<button type="button" class="elri-main-tab${active}${soon}" role="tab" data-elri-main-tab="${escapeAttr(tab.id)}"${disabled}>${escapeHtml(tab.label)}</button>`;
        }).join('')}
      </nav>`;
  }

  function renderDecisionKpis() {
    const s = stats || {};
    const activeTotal = Number(s.activeOpportunityCount ?? insights?.totalAnalyzed ?? 0);
    return `
      <div class="elri-kpi-grid">
        ${kpiCard('Oportunidades ativas', s.activeOpportunityCount ?? '—', 'fila operacional', 0)}
        ${kpiCard('Alta prioridade (ativas)', s.activeHighPriorityCount ?? 0, pctOf(s.activeHighPriorityCount, activeTotal), 1)}
        ${kpiCard('Média prioridade (ativas)', s.activeMediumPriorityCount ?? 0, pctOf(s.activeMediumPriorityCount, activeTotal), 2)}
        ${kpiCard('Baixa prioridade (ativas)', s.activeLowPriorityCount ?? 0, pctOf(s.activeLowPriorityCount, activeTotal), 3)}
        ${kpiCard('Descartar (base total)', s.discardPriorityCount ?? 0, 'inclui IA na fila ativa', 4)}
        ${kpiCard('Análises com IA', s.aiAnalysesWithTokens ?? s.aiCount ?? 0, '', 5)}
        ${kpiCard('Tokens IA (total)', formatTokens(s.totalAiTokens), '', 6)}
        ${kpiCard('Custo IA estimado', formatCostUsd(s.totalEstimatedCostUsd), '', 7)}
      </div>`;
  }

  function renderAnalyticsKpis() {
    const s = stats || {};
    return `
      <div class="elri-kpi-grid">
        ${kpiCard('Leads classificados', s.totalClassified ?? 0, '', 0)}
        ${kpiCard('Recovery Score médio', s.avgRecoveryScore ?? '—', '', 1)}
        ${kpiCard('Alta prioridade', s.highPriorityCount ?? 0, '', 2)}
        ${kpiCard('Média prioridade', s.mediumPriorityCount ?? 0, '', 3)}
        ${kpiCard('Baixa prioridade', s.lowPriorityCount ?? 0, '', 4)}
        ${kpiCard('Descartar', s.discardPriorityCount ?? 0, '', 5)}
        ${kpiCard('Enriquecidos por IA', s.aiCount ?? 0, '', 6)}
        ${kpiCard('Enriquecidos por regras', s.rulesCount ?? 0, '', 7)}
      </div>
      <div class="elri-kpi-grid elri-kpi-grid--secondary">
        ${kpiCard('Análises com tokens', s.aiAnalysesWithTokens ?? 0, '', 5)}
        ${kpiCard('Tokens IA (total)', formatTokens(s.totalAiTokens), '', 6)}
        ${kpiCard('Custo IA estimado', formatCostUsd(s.totalEstimatedCostUsd), '', 7)}
      </div>`;
  }

  function renderHeroBanner() {
    const nba = insights?.nextBestAction;
    if (!nba) return '';
    const count = Number(nba.leadCount || 0);
    const time = nba.bestTimeLabel || nba.bestTimeWindow || '';
    const channels = nba.suggestedChannels || nba.channels || '';
    const channelText = Array.isArray(channels) ? channels.join(' e ') : String(channels || '');
    const details = [
      `Campanha recomendada: ${nba.campaignLabel || '—'}`,
      time ? `Melhor horário: ${time}` : '',
      channelText ? `Canais sugeridos: ${channelText}` : (nba.reason || ''),
    ].filter(Boolean).join(' · ');
    return `
      <section class="elri-hero-banner">
        <div class="elri-hero-banner-copy">
          <span class="elri-hero-icon">${ICONS.rocket}</span>
          <div>
            <strong>${escapeHtml(String(count))} leads recuperáveis identificados</strong>
            <p>${escapeHtml(details)}</p>
          </div>
        </div>
        <button type="button" class="elri-btn elri-btn--primary" data-elri-scroll="opportunities">Ver oportunidades</button>
      </section>`;
  }

  function renderInsightBar(label, count, max) {
    const pct = max > 0 ? Math.round((Number(count) / max) * 100) : 0;
    return `
      <div class="elri-insight-row">
        <span class="elri-insight-row-label">${escapeHtml(label)}</span>
        <span class="elri-insight-row-count">${escapeHtml(String(count ?? 0))} leads</span>
        <div class="elri-insight-bar" aria-hidden="true"><span style="width:${Math.max(4, pct)}%"></span></div>
      </div>`;
  }

  function renderRecoveryInsights() {
    const ri = insights?.recoveryInsights || {};
    const highlights = Array.isArray(ri.signalHighlights) ? ri.signalHighlights : [];
    const rows = [
      { label: `Principal barreira: ${ri.primaryBarrier?.label || '—'}`, count: ri.primaryBarrier?.count },
      { label: `Principal canal ineficaz: ${ri.primaryChannel?.label || '—'}`, count: ri.primaryChannel?.count },
      ...highlights.map((h) => ({ label: h.label || '—', count: h.count })),
    ].filter((r) => r.label);
    const max = rows.reduce((m, r) => Math.max(m, Number(r.count || 0)), 1);
    return `
      <section class="elri-panel">
        <h3>Recovery Insights</h3>
        ${rows.length ? rows.map((r) => renderInsightBar(r.label, r.count, max)).join('') : '<p class="elri-empty">Sem insights.</p>'}
      </section>`;
  }

  function renderSpecialOpportunities() {
    const items = Array.isArray(insights?.specialOpportunities) ? insights.specialOpportunities : [];
    return `
      <section class="elri-panel">
        <div class="elri-panel-head">
          <h3>Oportunidades encontradas</h3>
          ${signalId ? '<button type="button" class="elri-link-btn" id="engageLeadRecoveryClearSignal">Ver todas</button>' : ''}
        </div>
        <div class="elri-opp-list">
          ${items.length ? items.map((item) => {
            const sid = String(item.signalId || item.id || '').trim();
            const active = sid && sid === signalId;
            const rawBadge = String(item.badge || '').trim().toUpperCase();
            const badgeLabel = rawBadge === 'ATENCAO'
              ? 'ATENÇÃO'
              : (rawBadge === 'ABORDAGEM_ESPECIFICA' ? 'ABORDAGEM ESPECÍFICA' : 'ALTA OPORTUNIDADE');
            const tone = rawBadge === 'ATENCAO' ? 'warn' : 'ok';
            return `
              <div class="elri-opp-item">
                <button type="button" class="${active ? 'is-active' : ''}" data-elri-signal="${escapeAttr(sid)}">${escapeHtml(item.label || '—')}</button>
                <span class="elri-opp-count">${escapeHtml(String(item.count ?? 0))} lead${Number(item.count) === 1 ? '' : 's'}</span>
                <span class="elri-opp-badge" data-tone="${tone}">${escapeHtml(badgeLabel)}</span>
              </div>`;
          }).join('') : '<p class="elri-empty">Nenhuma oportunidade especial.</p>'}
        </div>
      </section>`;
  }

  function renderBaseSummary() {
    const rows = Array.isArray(insights?.baseSummary) ? insights.baseSummary : [];
    if (!rows.length) return '';
    const pills = rows.map((row, idx) => {
      const main = idx === 0
        ? `${row.count ?? 0} ${row.label || ''}`.trim()
        : `${row.percentage ?? 0}% ${row.label || ''}`.trim();
      return `<div class="elri-base-pill"><strong>${escapeHtml(String(main))}</strong></div>`;
    }).join('');
    return `<section class="elri-base-strip" aria-label="Resumo da base">${pills}</section>`;
  }

  function sortHeader(key, label, currentBy, currentDir, table = 'opportunities') {
    const active = currentBy === key;
    const arrow = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th scope="col"><button type="button" class="elri-sort-btn" data-elri-sort="${escapeAttr(key)}" data-elri-sort-table="${escapeAttr(table)}">${escapeHtml(label)}${arrow}</button></th>`;
  }

  function renderOpportunitiesTable() {
    const items = Array.isArray(opportunities.items) ? opportunities.items : [];
    const total = Number(opportunities.total || items.length);
    const filterLabel = opportunities.filterLabel ? `<p class="ec-mc-muted">Filtro: ${escapeHtml(opportunities.filterLabel)}</p>` : '';
    const headers = `
      ${sortHeader('name', 'Nome', oppSortBy, oppSortDir)}
      ${sortHeader('recoveryScore', 'Score', oppSortBy, oppSortDir)}
      ${sortHeader('recoveryPriority', 'Prioridade', oppSortBy, oppSortDir)}
      ${sortHeader('recoveryDaysSinceLoss', 'Dias desde a perda', oppSortBy, oppSortDir)}
      ${sortHeader('barrier', 'Barreira', oppSortBy, oppSortDir)}
      ${sortHeader('recommendedAction', 'Ação', oppSortBy, oppSortDir)}
      ${sortHeader('specialCaseBadge', 'Destaque', oppSortBy, oppSortDir)}
      ${sortHeader('registeredAt', 'Cadastro', oppSortBy, oppSortDir)}
      ${sortHeader('sourceAudienceName', 'Audiência', oppSortBy, oppSortDir)}
      ${sortHeader('lastCampaignName', 'Última campanha', oppSortBy, oppSortDir)}
      ${sortHeader('lastCampaignSentAt', 'Enviado há', oppSortBy, oppSortDir)}
      ${sortHeader('lastCampaignFailedAt', 'Falha', oppSortBy, oppSortDir)}
      ${sortHeader('lastCampaignReadAt', 'Leu', oppSortBy, oppSortDir)}
      ${sortHeader('lastCampaignReplyAt', 'Respondeu', oppSortBy, oppSortDir)}
      <th scope="col">Ações</th>`;
    const rows = items.map((row) => {
      const special = Boolean(row.specialCaseKind);
      const action = row.specialCaseActionHint || row.recommendedAction || '—';
      const badgeKey = String(row.specialCaseBadge || '').trim().toUpperCase();
      const badgeLabel = badgeKey === 'CASO_ESPECIAL'
        ? 'CASO ESPECIAL'
        : api().labelOpportunityBadge(row.specialCaseBadge);
      const badgeTone = badgeKey === 'CASO_ESPECIAL' ? 'special' : 'warn';
      return `
        <tr class="${special ? 'elri-row-special' : ''}">
          <td>${escapeHtml(row.name || row.phone || '—')}</td>
          <td><strong>${escapeHtml(String(row.recoveryScore ?? '—'))}</strong></td>
          <td>${priorityChip(row.recoveryPriority)}</td>
          <td>${escapeHtml(formatDays(row.recoveryDaysSinceLoss))}</td>
          <td>${escapeHtml(row.barrier || '—')}</td>
          <td>${escapeHtml(action)}</td>
          <td>${badgeLabel ? `<span class="elri-opp-badge" data-tone="${badgeTone}">${escapeHtml(badgeLabel)}</span>` : '—'}</td>
          <td>${escapeHtml(formatDateTime(row.registeredAt))}</td>
          <td>${escapeHtml(row.sourceAudienceName || '—')}</td>
          <td>${renderLastCampaignCell(row)}</td>
          <td>${escapeHtml(formatCampaignTimestamp(row.lastCampaignSentAt))}</td>
          <td>${escapeHtml(formatCampaignFailed(row))}</td>
          <td>${escapeHtml(formatCampaignTimestamp(row.lastCampaignReadAt))}</td>
          <td>${escapeHtml(formatCampaignTimestamp(row.lastCampaignReplyAt))}</td>
          <td><button type="button" class="elri-link-btn" data-elri-audit="${escapeAttr(row.contactId || row.id)}">Ver detalhes</button></td>
        </tr>`;
    }).join('');
    const pages = Math.max(1, Math.ceil(total / OPP_PAGE_SIZE));
    const from = total ? (oppPage - 1) * OPP_PAGE_SIZE + 1 : 0;
    const to = Math.min(oppPage * OPP_PAGE_SIZE, total);
    const pageBtns = Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => {
      const active = p === oppPage ? ' is-active' : '';
      return `<button type="button" class="elri-page-btn${active}" data-elri-opp-page="${p}">${p}</button>`;
    }).join('');
    const sortOptions = [
      { key: 'recoveryScore', label: 'Score' },
      { key: 'recoveryDaysSinceLoss', label: 'Dias desde a perda' },
      { key: 'name', label: 'Nome' },
    ];
    const sortSelect = sortOptions.map((o) => {
      const sel = oppSortBy === o.key ? ' selected' : '';
      return `<option value="${escapeAttr(o.key)}"${sel}>${escapeHtml(o.label)}</option>`;
    }).join('');
    return `
      <section class="elri-table-card" id="elriOpportunitiesSection">
        <header class="elri-table-head">
          <h3>Top 20 oportunidades de recuperação</h3>
          <div class="elri-table-actions">
            ${filterLabel ? `<span class="elri-kpi-sub">${escapeHtml(opportunities.filterLabel)}</span>` : ''}
            <label>Ordenar por:
              <select id="elriOppSortSelect" aria-label="Ordenação">${sortSelect}</select>
            </label>
            <button type="button" class="elri-btn elri-btn--outline" data-elri-scroll="queue">Ver fila ativa</button>
          </div>
        </header>
        <div class="elri-table-wrap">
          <table class="elri-table" aria-label="Top oportunidades">
            <thead><tr>${headers}</tr></thead>
            <tbody>${rows || '<tr><td colspan="15">Nenhuma oportunidade.</td></tr>'}</tbody>
          </table>
        </div>
        <footer class="elri-table-foot">
          <span>Mostrando ${from} a ${to} de ${total.toLocaleString('pt-BR')} oportunidades</span>
          <div class="elri-pagination">
            ${pageBtns}
            ${oppPage < pages ? `<button type="button" class="elri-page-btn" data-elri-opp-page="${oppPage + 1}">›</button>` : ''}
          </div>
        </footer>
      </section>`;
  }

  function renderContactsTable() {
    const items = Array.isArray(contacts.items) ? contacts.items : [];
    const headers = `
      ${sortHeader('name', 'Nome', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('category', 'Categoria', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('recoveryScore', 'Score', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('recoveryPriority', 'Prioridade', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('recoveryDaysSinceLoss', 'Dias desde a perda', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('barrier', 'Barreira', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('recommendedAction', 'Ação recomendada', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('registeredAt', 'Cadastro', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('sourceAudienceName', 'Audiência', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('lastCampaignName', 'Última campanha', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('lastCampaignSentAt', 'Enviado há', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('lastCampaignFailedAt', 'Falha', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('lastCampaignReadAt', 'Leu', contactsSortBy, contactsSortDir, 'contacts')}
      ${sortHeader('lastCampaignReplyAt', 'Respondeu', contactsSortBy, contactsSortDir, 'contacts')}
      <th scope="col">Auditoria</th>`;
    const rows = items.map((row) => `
      <tr>
        <td>${escapeHtml(row.name || row.phone || '—')}</td>
        <td>${escapeHtml(api().labelCategory(row.category || row.lossCategory))}</td>
        <td>${escapeHtml(String(row.recoveryScore ?? '—'))}</td>
        <td>${priorityChip(row.recoveryPriority)}</td>
        <td>${escapeHtml(formatDays(row.recoveryDaysSinceLoss))}</td>
        <td>${escapeHtml(row.barrier || '—')}</td>
        <td>${escapeHtml(row.recommendedAction || '—')}</td>
        <td class="ec-mc-muted">${escapeHtml(formatDateTime(row.registeredAt))}</td>
        <td>${escapeHtml(row.sourceAudienceName || '—')}</td>
        <td>${renderLastCampaignCell(row)}</td>
        <td class="ec-mc-muted">${escapeHtml(formatCampaignTimestamp(row.lastCampaignSentAt))}</td>
        <td class="ec-mc-muted">${escapeHtml(formatCampaignFailed(row))}</td>
        <td class="ec-mc-muted">${escapeHtml(formatCampaignTimestamp(row.lastCampaignReadAt))}</td>
        <td class="ec-mc-muted">${escapeHtml(formatCampaignTimestamp(row.lastCampaignReplyAt))}</td>
        <td><button type="button" class="elri-link-btn" data-elri-audit="${escapeAttr(row.contactId || row.id)}">Ver detalhes</button></td>
      </tr>`).join('');
    return `
      <section class="elri-table-card" id="elriActiveQueueSection">
        <header class="elri-table-head">
          <div>
            <h3>Fila ativa — quem precisa de ação agora</h3>
            <p class="elri-table-sub">Apenas oportunidades ACTIVE — leads ainda sem campanha enviada. Respostas, envios, leituras, falhas de entrega e contato efetuado saem desta fila automaticamente.</p>
          </div>
        </header>
        <div class="elri-table-wrap">
          <table class="elri-table" aria-label="Fila ativa de recuperação">
            <thead>
              <tr>${headers}</tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="15">Nenhum lead na fila ativa. Todos já receberam campanha ou foram encerrados manualmente.</td></tr>'}</tbody>
          </table>
        </div>
      </section>`;
  }

  function renderScoreDistribution() {
    const rows = Array.isArray(stats?.scoreDistribution) ? stats.scoreDistribution : [];
    const max = rows.reduce((acc, row) => Math.max(acc, Number(row.count || 0)), 0) || 1;
    return `
      <section class="elri-card">
        <h3>Distribuição do Recovery Score</h3>
        <div class="elri-bars">
          ${rows.map((row) => {
            const count = Number(row.count || 0);
            const pct = Math.round((count / max) * 100);
            return `
              <div class="elri-bar-row">
                <span class="elri-bar-label">${escapeHtml(row.label || '—')}</span>
                <div class="elri-bar-track"><div class="elri-bar-fill" style="width:${pct}%"></div></div>
                <span class="elri-bar-count">${escapeHtml(String(count))}</span>
              </div>`;
          }).join('') || '<p class="ec-mc-muted">Sem distribuição disponível.</p>'}
        </div>
      </section>`;
  }

  function renderTopSignals() {
    const rows = Array.isArray(signals?.topSignals) ? signals.topSignals : [];
    return `
      <section class="elri-card">
        <h3>Top sinais (raw)</h3>
        <p class="ec-mc-muted elri-analytics-sub">Métricas técnicas do motor de priorização — uso interno e observabilidade.</p>
        <div class="elri-signal-grid">
          ${rows.map((row) => `
            <article class="elri-signal-card">
              <strong>${escapeHtml(row.label || '—')}</strong>
              <span>${escapeHtml(String(row.count ?? 0))}</span>
            </article>`).join('') || '<p class="ec-mc-muted">Sem sinais.</p>'}
        </div>
      </section>`;
  }

  function renderTabBody() {
    if (viewTab === 'analytics') {
      return `
        ${renderAnalyticsKpis()}
        ${renderScoreDistribution()}
        ${renderTopSignals()}`;
    }
    return `
      ${renderDecisionKpis()}
      ${renderHeroBanner()}
      <div class="elri-two-col">
        ${renderRecoveryInsights()}
        ${renderSpecialOpportunities()}
      </div>
      ${renderBaseSummary()}
      ${renderOpportunitiesTable()}
      ${renderContactsTable()}`;
  }

  function renderShell() {
    const root = getRoot();
    if (!root) return;
    if (loading && !stats && !insights) {
      root.innerHTML = `<div class="elri-shell"><div class="elri-loading">Carregando Lead Recovery…</div></div>`;
      return;
    }
    const feedback = feedbackMsg
      ? `<div class="elri-feedback" data-tone="${escapeHtml(feedbackTone)}" role="status">${escapeHtml(feedbackMsg)}</div>`
      : '';
    root.innerHTML = `
      <div class="elri-shell">
        ${renderToolbar()}
        ${renderMainTabs()}
        ${feedback}
        ${renderTabBody()}
      </div>`;
    bindContentEvents(root);
    bindShellEvents(root);
  }

  function bindShellEvents(root) {
    root.querySelector('[data-elri-action="refresh"]')?.addEventListener('click', () => void refreshAll());
    root.querySelector('[data-elri-action="export"]')?.addEventListener('click', () => void onExportAudits());
    root.querySelector('[data-elri-action="reclassify"]')?.addEventListener('click', () => void openReclassifyModal());
    root.querySelector('[data-elri-open-standalone]')?.addEventListener('click', () => {
      document.querySelector('[data-es-nav="engage-intelligence"]')?.click();
    });
    root.querySelectorAll('[data-elri-main-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const next = btn.dataset.elriMainTab || 'decision';
        if (next === viewTab) return;
        viewTab = next;
        if (isDecisionTab()) {
          void refreshDecisionQueue();
        } else {
          render();
        }
      });
    });
    root.querySelectorAll('[data-elri-scroll]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.elriScroll === 'queue'
          ? '#elriActiveQueueSection'
          : '#elriOpportunitiesSection';
        document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    root.querySelector('#elriOppSortSelect')?.addEventListener('change', (e) => {
      oppSortBy = e.target.value || 'recoveryScore';
      oppPage = 1;
      void loadOpportunities();
    });
    root.querySelectorAll('[data-elri-opp-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        oppPage = Number(btn.dataset.elriOppPage || 1);
        void loadOpportunities();
      });
    });
  }

  function bindContentEvents(root) {
    root.querySelector('#engageLeadRecoveryClearSignal')?.addEventListener('click', () => {
      signalId = '';
      oppPage = 1;
      void loadOpportunities();
    });
    root.querySelectorAll('[data-elri-signal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.elriSignal || '';
        signalId = signalId === sid ? '' : sid;
        oppPage = 1;
        void loadOpportunities();
      });
    });
    root.querySelectorAll('[data-elri-audit]').forEach((btn) => {
      btn.addEventListener('click', () => void openAuditModal(btn.dataset.elriAudit));
    });
    root.querySelectorAll('[data-elri-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.elriSort || 'recoveryScore';
        const table = btn.dataset.elriSortTable || 'opportunities';
        if (table === 'contacts') {
          if (contactsSortBy === key) {
            contactsSortDir = contactsSortDir === 'asc' ? 'desc' : 'asc';
          } else {
            contactsSortBy = key;
            contactsSortDir = 'desc';
          }
          void loadContacts();
          return;
        }
        if (oppSortBy === key) {
          oppSortDir = oppSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          oppSortBy = key;
          oppSortDir = 'desc';
        }
        oppPage = 1;
        void loadOpportunities();
      });
    });
  }

  function renderReclassifyModal() {
    const modal = $('engageLeadRecoveryReclassifyModal');
    const body = $('engageLeadRecoveryReclassifyBody');
    const foot = $('engageLeadRecoveryReclassifyFooter');
    if (!modal || !body || !foot) return;
    const p = reclassifyPreview || {};
    const enqueued = Number(p.enqueuedCount || 0);
    body.innerHTML = `
      <p class="elri-modal-lead">Escolha o escopo para evitar custo desnecessário de tokens. Importações mensais já classificam automaticamente só contatos novos ou com dados alterados.</p>
      <p class="elri-scope-fixed"><strong>Escopo:</strong> Somente sem classificação</p>
      <label class="elri-check">
        <input type="checkbox" id="engageLeadRecoveryForce" ${reclassifyForce ? 'checked' : ''} />
        <span>Forçar re-análise (mesmo se dados não mudaram)</span>
      </label>
      <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageLeadRecoveryPreviewBtn"${busy ? ' disabled' : ''}>Atualizar estimativa</button>
      <dl class="elri-preview-dl">
        <div><dt>Candidatos no escopo</dt><dd>${escapeHtml(String(p.candidateCount ?? '—'))}</dd></div>
        <div><dt>Serão enfileirados</dt><dd>${escapeHtml(String(p.enqueuedCount ?? '—'))}${Number(p.cappedCount || 0) > 0 ? ` (limite ${escapeHtml(String(p.limits?.reclassifyMax ?? ''))})` : ''}</dd></div>
        <div><dt>Ignorados (sem mudança)</dt><dd>${escapeHtml(String(p.skippedUnchanged ?? '—'))}</dd></div>
        <div><dt>Ignorados (classificação manual)</dt><dd>${escapeHtml(String(p.skippedManual ?? '—'))}</dd></div>
        <div><dt>Chamadas LLM estimadas</dt><dd>${p.useFallbackOnly ? '0 (modo regras)' : escapeHtml(String(p.estimatedLlmCalls ?? '—'))}</dd></div>
      </dl>
      ${p.warning ? `<p class="elri-warning">${escapeHtml(p.warning)}</p>` : ''}`;
    foot.innerHTML = `
      <button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-elri-reclassify-close>Cancelar</button>
      <button type="button" class="ec-mc-btn ec-mc-btn--primary" id="engageLeadRecoveryConfirmBtn"${enqueued <= 0 || busy ? ' disabled' : ''}>Confirmar reprocessamento</button>`;
    body.querySelector('#engageLeadRecoveryForce')?.addEventListener('change', (e) => {
      reclassifyForce = !!e.target.checked;
      void loadReclassifyPreview();
    });
    body.querySelector('#engageLeadRecoveryPreviewBtn')?.addEventListener('click', () => void loadReclassifyPreview());
    foot.querySelector('[data-elri-reclassify-close]')?.addEventListener('click', closeReclassifyModal);
    foot.querySelector('#engageLeadRecoveryConfirmBtn')?.addEventListener('click', () => void confirmReclassify());
  }

  function renderAuditModal() {
    const modal = $('engageLeadRecoveryAuditModal');
    const body = $('engageLeadRecoveryAuditBody');
    if (!modal || !body) return;
    if (!auditData) {
      body.innerHTML = '<p class="ec-mc-muted">Carregando…</p>';
      return;
    }
    const evidence = Array.isArray(auditData.evidence) ? auditData.evidence : [];
    const reasons = Array.isArray(auditData.recoveryScoreReason) ? auditData.recoveryScoreReason : [];
    body.innerHTML = `
      <header class="elri-audit-head">
        <h3>${escapeHtml(auditData.name || auditData.phone || 'Lead')}</h3>
      </header>
      <dl class="elri-dl">
        <div><dt>Categoria</dt><dd>${escapeHtml(api().labelCategory(auditData.category))}</dd></div>
        <div><dt>Recovery Score</dt><dd>${escapeHtml(String(auditData.recoveryScore ?? '—'))}</dd></div>
        <div><dt>Prioridade</dt><dd>${priorityChip(auditData.recoveryPriority)}</dd></div>
        <div><dt>Barreira</dt><dd>${escapeHtml(auditData.barrier || '—')}</dd></div>
        <div><dt>Ação recomendada</dt><dd>${escapeHtml(auditData.recommendedAction || '—')}</dd></div>
        <div><dt>Origem</dt><dd>${escapeHtml(auditData.source || '—')}</dd></div>
      </dl>
      ${evidence.length ? `<section><h4>Evidências</h4><ul>${evidence.map((e) => `<li>${escapeHtml(typeof e === 'string' ? e : e?.text || JSON.stringify(e))}</li>`).join('')}</ul></section>` : ''}
      ${reasons.length ? `<section><h4>Recovery Factors</h4><ul>${reasons.map((r) => `<li>${escapeHtml(typeof r === 'string' ? r : r?.label || r?.reason || JSON.stringify(r))}</li>`).join('')}</ul></section>` : ''}
      ${auditData.reasoning ? `<section><h4>Contexto</h4><p>${escapeHtml(auditData.reasoning)}</p></section>` : ''}
      ${auditData.fallbackUsed || auditData.errorMessage ? `
        <section class="elri-warning-block">
          <h4>Erro IA</h4>
          <p>${escapeHtml(auditData.errorCode || '')} ${escapeHtml(auditData.errorMessage || '')}</p>
        </section>` : ''}
      <dl class="elri-dl">
        <div><dt>Modelo</dt><dd>${escapeHtml(auditData.model || '—')}</dd></div>
        <div><dt>Tokens</dt><dd>${escapeHtml(formatTokens(auditData.totalTokens))} (in ${escapeHtml(String(auditData.inputTokens ?? '—'))} / out ${escapeHtml(String(auditData.outputTokens ?? '—'))})</dd></div>
        <div><dt>Custo estimado</dt><dd>${escapeHtml(formatCostUsd(auditData.estimatedCostUsd))}</dd></div>
      </dl>
      <details class="elri-debug">
        <summary>Debug</summary>
        <pre class="elri-debug-pre">${escapeHtml([auditData.inputText, auditData.userPrompt, auditData.systemPrompt, auditData.rawResponse].filter(Boolean).join('\n\n---\n\n') || '—')}</pre>
      </details>`;
  }

  function render() {
    renderShell();
    renderReclassifyModal();
    renderAuditModal();
  }

  async function loadOpportunities() {
    const seq = activateSeq;
    if (!isActivationCurrent(seq)) return;
    try {
      const params = activeQueueQuery({
        limit: OPP_PAGE_SIZE,
        offset: (oppPage - 1) * OPP_PAGE_SIZE,
        sortBy: oppSortBy,
        sortDir: oppSortDir,
      });
      if (signalId) params.signalId = signalId;
      opportunities = await api().getOpportunities(session, params);
      if (!Array.isArray(opportunities.items)) opportunities.items = [];
    } catch (err) {
      if (!isActivationCurrent(seq)) return;
      opportunities = { items: [], total: 0 };
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
      return;
    }
    if (isActivationCurrent(seq)) render();
  }

  async function loadContacts() {
    const seq = activateSeq;
    if (!isActivationCurrent(seq)) return;
    try {
      contacts = await api().getContacts(session, activeQueueQuery({
        limit: CONTACTS_LIMIT,
        sortBy: contactsSortBy,
        sortDir: contactsSortDir,
      }));
      if (!Array.isArray(contacts.items)) contacts.items = [];
    } catch (err) {
      if (!isActivationCurrent(seq)) return;
      contacts = { items: [] };
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
      return;
    }
    if (isActivationCurrent(seq)) render();
  }

  async function refreshDecisionQueue() {
    const seq = activateSeq;
    if (!isActivationCurrent(seq) || !isDecisionTab()) return;
    try {
      insights = await api().getInsights(session, activeQueueQuery());
      if (!isActivationCurrent(seq)) return;
      await Promise.all([loadContacts(), loadOpportunities()]);
    } catch (err) {
      if (!isActivationCurrent(seq)) return;
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    }
  }

  async function refreshAll() {
    const seq = activateSeq;
    if (!isActivationCurrent(seq)) return;
    setLoading(true);
    setFeedback('');
    error = '';
    try {
      const [statsRes, signalsRes] = await Promise.all([
        api().getStats(session),
        api().getSignals(session),
      ]);
      if (!isActivationCurrent(seq)) return;
      stats = statsRes;
      signals = signalsRes;
      if (isDecisionTab()) {
        insights = await api().getInsights(session, activeQueueQuery());
        if (!isActivationCurrent(seq)) return;
        await Promise.all([loadContacts(), loadOpportunities()]);
      } else {
        insights = null;
        contacts = { items: [] };
        opportunities = { items: [], total: 0 };
      }
    } catch (err) {
      if (!isActivationCurrent(seq)) return;
      const mapped = api().mapApiError(err);
      error = mapped.message;
      setFeedback(mapped.message, 'danger');
    } finally {
      if (!isActivationCurrent(seq)) return;
      setLoading(false);
      render();
    }
  }

  async function loadReclassifyPreview() {
    busy = true;
    renderReclassifyModal();
    try {
      reclassifyPreview = await api().reclassifyPreview(session, { force: reclassifyForce });
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      busy = false;
      renderReclassifyModal();
    }
  }

  async function openReclassifyModal() {
    if (!canManage()) return;
    const modal = $('engageLeadRecoveryReclassifyModal');
    if (modal) modal.hidden = false;
    reclassifyForce = false;
    await loadReclassifyPreview();
  }

  function closeReclassifyModal() {
    const modal = $('engageLeadRecoveryReclassifyModal');
    if (modal) modal.hidden = true;
    reclassifyPreview = null;
  }

  async function confirmReclassify() {
    if (!canManage() || busy) return;
    busy = true;
    renderReclassifyModal();
    try {
      await api().reclassify(session, { force: reclassifyForce });
      setFeedback('Reprocessamento enfileirado. Aguarde alguns minutos e atualize.', 'success');
      closeReclassifyModal();
      await refreshAll();
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      busy = false;
      render();
    }
  }

  async function openAuditModal(contactId) {
    if (!contactId) return;
    auditData = null;
    const modal = $('engageLeadRecoveryAuditModal');
    if (modal) modal.hidden = false;
    renderAuditModal();
    try {
      auditData = await api().getContactAudit(session, contactId);
    } catch (err) {
      const mapped = api().mapApiError(err);
      auditData = { reasoning: mapped.message };
    }
    renderAuditModal();
  }

  function closeAuditModal() {
    const modal = $('engageLeadRecoveryAuditModal');
    if (modal) modal.hidden = true;
    auditData = null;
  }

  async function onExportAudits() {
    if (!canManage() || busy) return;
    busy = true;
    render();
    try {
      const data = await api().exportAudits(session);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lead-recovery-audits-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback('Auditorias exportadas.', 'success');
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      busy = false;
      render();
    }
  }

  let modalsBound = false;

  function bindModals() {
    if (modalsBound) return;
    document.addEventListener('click', (e) => {
      if (!active) return;
      if (e.target.closest('[data-elri-reclassify-close]')) closeReclassifyModal();
      if (e.target.closest('[data-elri-audit-close]')) closeAuditModal();
    });
    $('engageLeadRecoveryReclassifyModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'engageLeadRecoveryReclassifyModal') closeReclassifyModal();
    });
    $('engageLeadRecoveryAuditModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'engageLeadRecoveryAuditModal') closeAuditModal();
    });
    modalsBound = true;
  }

  async function activate(nextSession) {
    const seq = ++activateSeq;
    active = true;
    if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
      session = await window.ReservaPermissions.enrichSessionWithOperatorMe(nextSession || session);
    } else {
      session = nextSession || session;
    }
    if (!isActivationCurrent(seq)) return;
    viewTab = 'decision';
    oppPage = 1;
    signalId = '';
    error = '';
    feedbackMsg = '';
    feedbackTone = 'neutral';
    bindModals();
    render();
    await refreshAll();
  }

  function clearRoots() {
    const standalone = document.getElementById('adminEngageLeadRecoveryRoot');
    const embedded = document.getElementById('engageLeadRecoveryContent');
    if (standalone) standalone.innerHTML = '';
    if (embedded) embedded.innerHTML = '';
  }

  function deactivate() {
    activateSeq += 1;
    active = false;
    loading = false;
    busy = false;
    closeReclassifyModal();
    closeAuditModal();
    feedbackMsg = '';
    feedbackTone = 'neutral';
    clearRoots();
  }

  window.EngageLeadRecovery = { activate, deactivate };
})();
