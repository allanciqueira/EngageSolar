/**
 * Engage Solar — Audiências (dashboard analítico + listagem).
 */
(function () {
  const api = () => window.EngageAudiencesDashboardApi;
  const REFRESH_MS = 60 * 1000;

  const ORIGIN_COLORS = {
    meta_ads: '#2563eb',
    google_ads: '#dc2626',
    site_forms: '#7c3aed',
    referral: '#16a34a',
    import: '#64748b',
    crm: '#0891b2',
    manual: '#ca8a04',
    other: '#94a3b8',
  };

  const KPI_ACCENTS = [
    { accent: '#7c3aed', iconBg: '#f5f3ff' },
    { accent: '#16a34a', iconBg: '#ecfdf5' },
    { accent: '#2563eb', iconBg: '#eff6ff' },
    { accent: '#ea580c', iconBg: '#fff7ed' },
    { accent: '#dc2626', iconBg: '#fef2f2' },
  ];

  const ICONS = {
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    userPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>',
    meta: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>',
    google: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.24 10.285V13.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0 5.482 0 0 5.482 0 12.24s5.482 12.24 12.24 12.24c6.813 0 11.714-4.766 11.714-11.491 0-.775-.082-1.364-.218-1.949H12.24z"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    referral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>',
  };

  const state = {
    mounted: false,
    active: false,
    session: null,
    loading: false,
    error: '',
    dateFrom: '',
    dateTo: '',
    growthWindow: '30d',
    originFilter: 'all',
    sort: 'updatedAt',
    sortDir: 'desc',
    page: 1,
    limit: 5,
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
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function formatPct(value, decimals) {
    const n = Number(value || 0);
    const d = decimals == null ? 0 : decimals;
    return `${n.toFixed(d)}%`;
  }

  function formatDeltaPct(pct) {
    const n = Number(pct || 0);
    if (!n) return '<span class="ead-delta ead-delta--neutral">— vs período anterior</span>';
    const sign = n > 0 ? '+' : '';
    const tone = n > 0 ? 'up' : 'down';
    return `<span class="ead-delta ead-delta--${tone}">${sign}${n}% vs período anterior</span>`;
  }

  function formatDeltaAbs(delta, suffix) {
    const n = Number(delta || 0);
    if (!n) return '<span class="ead-delta ead-delta--neutral">— vs período anterior</span>';
    const sign = n > 0 ? '+' : '';
    const tone = n > 0 ? 'up' : 'down';
    return `<span class="ead-delta ead-delta--${tone}">${sign}${n} ${suffix || ''} vs período anterior</span>`;
  }

  function formatDateShort(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR');
  }

  function formatDateRangeLabel(from, to) {
    if (!from || !to) return 'Últimos 7 dias';
    const f = formatDateShort(from);
    const t = formatDateShort(to);
    return `${f} – ${t}`;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function originIcon(originId) {
    const key = String(originId || 'other').trim();
    const map = {
      meta_ads: ICONS.meta,
      google_ads: ICONS.google,
      site_forms: ICONS.web,
      referral: ICONS.referral,
      import: ICONS.import,
    };
    return map[key] || ICONS.web;
  }

  function originColor(originId) {
    return ORIGIN_COLORS[String(originId || 'other')] || ORIGIN_COLORS.other;
  }

  function getGrowthChartSeries(data) {
    const full = data?.growth?.seriesFull || data?.growth?.series || [];
    const endIso = state.dateTo
      || data?.window?.to
      || full[full.length - 1]?.date
      || '';
    return api().prepareGrowthChartSeries(
      full,
      state.growthWindow,
      data?.summary?.totalContacts,
      endIso,
    );
  }

  function renderGrowthChart(series, partial) {
    const rows = Array.isArray(series) ? series : [];
    if (!rows.length) {
      return `<div class="ead-empty">${partial ? 'Histórico indisponível (métricas parciais).' : 'Sem histórico no período.'}</div>`;
    }
    const values = rows.map((p) => Number(p.totalEligible ?? 0));
    const w = 520;
    const h = 180;
    const pad = { t: 12, r: 8, b: 28, l: 44 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const max = Math.max(...values, 1);
    const min = 0;
    const range = Math.max(max - min, 1);
    const points = values.map((v, i) => {
      const x = pad.l + (i / Math.max(values.length - 1, 1)) * innerW;
      const y = pad.t + innerH - ((v - min) / range) * innerH;
      return { x, y, v };
    });
    const line = points.map((p) => `${p.x},${p.y}`).join(' ');
    const area = `${pad.l},${pad.t + innerH} ${line} ${pad.l + innerW},${pad.t + innerH}`;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const val = min + range * t;
      const y = pad.t + innerH - t * innerH;
      const rounded = Math.round(val);
      const label = rounded >= 1000
        ? `${Math.round(rounded / 1000)}K`
        : formatNumber(rounded);
      return `<line x1="${pad.l}" y1="${y}" x2="${pad.l + innerW}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="10">${label}</text>`;
    }).join('');
    const xLabels = rows.length
      ? rows.filter((_, i) => i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1).map((row, idx, arr) => {
        const i = rows.indexOf(row);
        const x = pad.l + (i / Math.max(rows.length - 1, 1)) * innerW;
        const label = formatDateShort(row.date).slice(0, 5);
        return `<text x="${x}" y="${h - 6}" text-anchor="middle" fill="#94a3b8" font-size="10">${escapeHtml(label)}</text>`;
      }).join('')
      : '<text x="260" y="170" text-anchor="middle" fill="#94a3b8" font-size="11">Sem histórico no período</text>';

    return `
      <div class="ead-chart-area">
        <svg class="ead-line-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
          ${yTicks}
          <polygon points="${area}" fill="url(#eadGrowthGrad)" opacity="0.35"/>
          <polyline fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${line}"/>
          <defs>
            <linearGradient id="eadGrowthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2563eb"/>
              <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
            </linearGradient>
          </defs>
        </svg>
        ${xLabels ? `<svg class="ead-line-chart-labels" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${xLabels}</svg>` : ''}
      </div>`;
  }

  function renderDonutChart(origins, partial) {
    const rows = Array.isArray(origins) ? origins : [];
    if (!rows.length) {
      return `<div class="ead-empty">${partial ? 'Origens indisponíveis (métricas parciais).' : 'Sem dados de origem.'}</div>`;
    }
    const size = 160;
    const stroke = 28;
    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    const segments = rows.map((row) => {
      const pct = Math.min(100, Math.max(0, Number(row.pct || 0)));
      const dash = (pct / 100) * circumference;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${originColor(row.originId)}" stroke-width="${stroke}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += dash;
      return seg;
    }).join('');
    const legend = rows.map((row) => `
      <div class="ead-donut-legend-row">
        <span class="ead-donut-dot" style="background:${originColor(row.originId)}"></span>
        <span class="ead-donut-legend-label">${escapeHtml(row.labelPt)}</span>
        <strong title="${formatNumber(row.count)} contatos">${formatPct(row.pct, 1)}</strong>
      </div>`).join('');

    return `
      <div class="ead-donut-wrap">
        <svg class="ead-donut" viewBox="0 0 ${size} ${size}" aria-hidden="true">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2f8" stroke-width="${stroke}"/>
          ${segments}
        </svg>
        <div class="ead-donut-legend">${legend}</div>
      </div>`;
  }

  function renderQualityGauge(quality) {
    const q = quality || {};
    const pct = Math.min(100, Math.max(0, Number(q.score || 0)));
    const label = q.scoreLabel || (pct >= 90 ? 'Ótima' : pct >= 75 ? 'Boa' : 'Regular');
    const angle = (pct / 100) * 180;
    const r = 52;
    const cx = 70;
    const cy = 70;
    const rad = (a) => (Math.PI / 180) * (180 - a);
    const x1 = cx + r * Math.cos(rad(0));
    const y1 = cy - r * Math.sin(rad(0));
    const x2 = cx + r * Math.cos(rad(angle));
    const y2 = cy - r * Math.sin(rad(angle));
    const large = angle > 90 ? 1 : 0;
    const arc = angle > 0
      ? `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}" fill="none" stroke="#2563eb" stroke-width="10" stroke-linecap="round"/>`
      : '';

    const rows = [
      { key: 'valid', label: 'Válidos', color: '#16a34a' },
      { key: 'invalid', label: 'Inválidos', color: '#dc2626' },
      { key: 'optOut', label: 'Opt-out', color: '#ea580c' },
      { key: 'duplicates', label: 'Duplicados', color: '#64748b' },
    ];

    const breakdown = rows.map((row) => {
      const bucket = q[row.key] || {};
      return `
        <div class="ead-quality-row">
          <span class="ead-quality-row-left">
            <span class="ead-quality-dot" style="background:${row.color}"></span>
            ${escapeHtml(row.label)}
          </span>
          <strong>${formatPct(bucket.pct ?? 0, 1)}</strong>
        </div>`;
    }).join('');

    return `
      <div class="ead-quality">
        <div class="ead-quality-gauge">
          <svg viewBox="0 0 140 80" aria-hidden="true">
            <path d="M 18 70 A 52 52 0 0 1 122 70" fill="none" stroke="#e2e8f0" stroke-width="10" stroke-linecap="round"/>
            ${arc}
          </svg>
          <div class="ead-quality-score">
            <strong>${Math.round(pct)}%</strong>
            <span>${escapeHtml(label)}</span>
          </div>
        </div>
        <div class="ead-quality-breakdown">${breakdown}</div>
        <button type="button" class="ead-link-btn" id="eadQualityDetailsBtn">Ver detalhes da qualidade →</button>
      </div>`;
  }

  function renderKpiCards(summary) {
    const s = summary || {};
    const cards = [
      {
        label: 'Total de contatos',
        value: formatNumber(s.totalContacts),
        sub: 'Todos os contatos da base',
        delta: '',
        icon: ICONS.users,
      },
      {
        label: 'Novos contatos (7 dias)',
        value: formatNumber(s.newContacts),
        sub: '',
        delta: formatDeltaPct(s.newContactsDeltaPct),
        icon: ICONS.userPlus,
      },
      {
        label: 'Taxa de resposta geral',
        value: formatPct(s.responseRate, 0),
        sub: '',
        delta: formatDeltaPct(s.responseRateDeltaPct),
        icon: ICONS.reply,
      },
      {
        label: 'Campanhas enviadas',
        value: formatNumber(s.campaignsSent),
        sub: '',
        delta: formatDeltaAbs(s.campaignsSentDelta, 'campanhas'),
        icon: ICONS.send,
      },
      {
        label: 'Contatos opt-out',
        value: formatNumber(s.optOutCount),
        sub: `${formatPct(s.optOutPct, 1)} do total da base`,
        delta: '',
        icon: ICONS.ban,
      },
    ];

    return `<div class="ead-kpi-grid">${cards.map((card, index) => {
      const accent = KPI_ACCENTS[index] || KPI_ACCENTS[0];
      return `
        <article class="ead-kpi-card" style="--ead-kpi-accent:${accent.accent};--ead-kpi-icon-bg:${accent.iconBg}">
          <span class="ead-kpi-icon" aria-hidden="true">${card.icon}</span>
          <span class="ead-kpi-label">${escapeHtml(card.label)}</span>
          <strong class="ead-kpi-value">${escapeHtml(card.value)}</strong>
          ${card.delta ? `<div class="ead-kpi-delta">${card.delta}</div>` : ''}
          ${card.sub ? `<span class="ead-kpi-sub">${escapeHtml(card.sub)}</span>` : ''}
        </article>`;
    }).join('')}</div>`;
  }

  function renderOriginPerformance(items) {
    const rows = Array.isArray(items) && items.length ? items : [];
    if (!rows.length) {
      return '<div class="ead-empty">Sem dados de desempenho por origem no período.</div>';
    }
    return rows.map((row) => `
      <div class="ead-perf-row">
        <span class="ead-perf-origin">
          <span class="ead-perf-icon" style="color:${originColor(row.originId)}">${originIcon(row.originId)}</span>
          ${escapeHtml(row.labelPt)}
        </span>
        <span class="ead-perf-stat"><small>Enviados</small><strong>${formatNumber(row.sent)}</strong></span>
        <span class="ead-perf-stat"><small>Responderam</small><strong>${formatNumber(row.responded)}</strong></span>
        <span class="ead-perf-rate" title="${formatNumber(row.responded)} / ${formatNumber(row.sent)}">${formatPct(row.responseRate, 1)}</span>
      </div>`).join('');
  }

  function statusTagHtml(item) {
    const tag = String(item.statusTag || '').trim();
    if (tag === 'active_campaign' || item.statusTagLabelPt) {
      const label = item.statusTagLabelPt || 'Campanha ativa';
      return `<span class="ead-status-tag ead-status-tag--active">${escapeHtml(label)}</span>`;
    }
    if (tag === 'permanent_base') {
      return `<span class="ead-status-tag ead-status-tag--base">Base permanente</span>`;
    }
    return '';
  }

  function renderAudiencesTable(items, meta) {
    const rows = Array.isArray(items) ? items : [];
    const total = Number(meta?.total ?? rows.length);
    const page = Number(meta?.page ?? state.page);
    const limit = Number(meta?.limit ?? state.limit);
    const from = total ? (page - 1) * limit + 1 : 0;
    const to = Math.min(page * limit, total);
    const pages = Math.max(1, Math.ceil(total / limit));

    const body = rows.length
      ? rows.map((item) => {
        const ratePct = Math.min(100, Math.max(0, Math.round(Number(item.responseRate || 0))));
        const lastCamp = item.lastCampaign;
        return `
          <tr>
            <td>
              <div class="ead-audience-name">
                <span class="ead-audience-avatar" aria-hidden="true">${escapeHtml(initials(item.name))}</span>
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  ${statusTagHtml(item)}
                </div>
              </div>
            </td>
            <td>
              <span class="ead-origin-cell">
                <span class="ead-perf-icon" style="color:${originColor(item.primaryOriginId)}">${originIcon(item.primaryOriginId)}</span>
                ${escapeHtml(item.primaryOriginLabelPt || '—')}
              </span>
            </td>
            <td><strong>${formatNumber(item.contactCount)}</strong></td>
            <td>
              ${lastCamp
                ? `<div class="ead-last-campaign"><strong>${escapeHtml(lastCamp.name)}</strong><small>${escapeHtml(lastCamp.relativeLabelPt || formatDateShort(lastCamp.sentAt))}</small></div>`
                : '<span class="ead-muted">—</span>'}
            </td>
            <td>
              <div class="ead-rate-cell">
                <span>${formatPct(item.responseRate, 0)}</span>
                <div class="ead-rate-bar" aria-hidden="true"><span style="width:${Math.max(4, ratePct)}%"></span></div>
              </div>
            </td>
            <td>${escapeHtml(formatDateShort(item.updatedAt))}</td>
            <td class="ead-actions">
              <button type="button" class="ead-icon-btn" title="Ver audiência" data-ead-view="${escapeAttr(item.id)}">${ICONS.eye}</button>
              <button type="button" class="ead-icon-btn" title="Enviar campanha" data-ead-campaign="${escapeAttr(item.id)}">${ICONS.plane}</button>
              <button type="button" class="ead-icon-btn" title="Mais opções" data-ead-more="${escapeAttr(item.id)}">${ICONS.more}</button>
            </td>
          </tr>`;
      }).join('')
      : '<tr><td colspan="7" class="ead-muted">Nenhuma audiência encontrada.</td></tr>';

    const pageButtons = Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => {
      const active = p === page ? ' is-active' : '';
      return `<button type="button" class="ead-page-btn${active}" data-ead-page="${p}">${p}</button>`;
    }).join('');

    return `
      <div class="ead-table-card">
        <header class="ead-table-head">
          <h3>Audiências</h3>
          <div class="ead-table-head-actions">
            <label class="ead-sort-label">
              Ordenar por:
              <select id="eadSortSelect" aria-label="Ordenação">
                <option value="updatedAt"${state.sort === 'updatedAt' ? ' selected' : ''}>Mais recentes</option>
                <option value="name"${state.sort === 'name' ? ' selected' : ''}>Nome</option>
                <option value="contacts"${state.sort === 'contacts' ? ' selected' : ''}>Contatos</option>
                <option value="responseRate"${state.sort === 'responseRate' ? ' selected' : ''}>Taxa de resposta</option>
              </select>
            </label>
            <button type="button" class="ead-btn ead-btn--primary" id="eadNewAudienceBtn">+ Nova Audiência</button>
          </div>
        </header>
        <div class="ead-table-wrap">
          <table class="ead-table" aria-label="Lista de audiências">
            <thead>
              <tr>
                <th>Nome da audiência</th>
                <th>Origem</th>
                <th>Contatos</th>
                <th>Última campanha</th>
                <th>Taxa de resposta</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <footer class="ead-table-foot">
          <span>Mostrando ${from} a ${to} de ${formatNumber(total)} audiências</span>
          <div class="ead-pagination">
            ${pageButtons}
            ${page < pages ? `<button type="button" class="ead-page-btn" data-ead-page="${page + 1}">›</button>` : ''}
          </div>
        </footer>
      </div>`;
  }

  function renderToolbar() {
    return `
      <header class="ead-toolbar">
        <div class="ead-toolbar-copy">
          <p class="ead-eyebrow">Engage Solar</p>
          <h2 class="ead-title">Audiências</h2>
          <p class="ead-lead">Gerencie suas audiências e acompanhe o desempenho das suas bases de contatos.</p>
        </div>
        <div class="ead-toolbar-actions">
          <label class="ead-period-pill">
            ${ICONS.calendar}
            <input type="date" id="eadDateFrom" value="${escapeAttr(state.dateFrom)}" aria-label="Data inicial"/>
            <span class="ead-period-sep">–</span>
            <input type="date" id="eadDateTo" value="${escapeAttr(state.dateTo)}" aria-label="Data final"/>
          </label>
          <button type="button" class="ead-btn ead-btn--ghost" id="eadFilterBtn" disabled title="Em breve">${ICONS.filter} Filtros</button>
          <button type="button" class="ead-btn ead-btn--outline" id="eadRefreshBtn">${ICONS.refresh} Atualizar</button>
        </div>
      </header>`;
  }

  function renderPartialBanner() {
    if (!state.data?.partial) return '';
    return `
      <div class="ead-partial-banner" role="status">
        Métricas parciais — dashboard agregado indisponível; exibindo listagem básica de audiências.
      </div>`;
  }

  function renderTipCard() {
    return `
      <section class="ead-tip-card">
        <span class="ead-tip-icon" aria-hidden="true">${ICONS.bulb}</span>
        <div>
          <strong>Dica</strong>
          <p>Mantenha sua base sempre atualizada e segmentada para melhores resultados nas campanhas.</p>
          <button type="button" class="ead-link-btn" id="eadTipLinkBtn">Saiba mais sobre gestão de audiências →</button>
        </div>
      </section>`;
  }

  function renderContent() {
    if (state.loading && !state.data) {
      return '<div class="ead-loading">Carregando audiências…</div>';
    }
    if (state.error && !state.data) {
      return `<div class="ead-error" role="alert">${escapeHtml(state.error)}</div>`;
    }
    if (!state.data) return '<div class="ead-muted">Sem dados.</div>';

    const data = state.data;
    return `
      ${renderPartialBanner()}
      ${renderKpiCards(data.summary)}
      <div class="ead-charts-grid">
        <section class="ead-panel-card">
          <header class="ead-panel-head">
            <h3>Crescimento da base</h3>
            <select id="eadGrowthWindow" aria-label="Período do gráfico">
              <option value="30d"${state.growthWindow === '30d' ? ' selected' : ''}>Últimos 30 dias</option>
              <option value="7d"${state.growthWindow === '7d' ? ' selected' : ''}>Últimos 7 dias</option>
            </select>
          </header>
          <div class="ead-panel-body">${renderGrowthChart(getGrowthChartSeries(data), data.partial)}</div>
        </section>
        <section class="ead-panel-card">
          <header class="ead-panel-head">
            <h3>Origem dos contatos</h3>
            <select id="eadOriginFilter" aria-label="Filtrar origem">
              <option value="all"${state.originFilter === 'all' ? ' selected' : ''}>Todos os canais</option>
            </select>
          </header>
          <div class="ead-panel-body">${renderDonutChart(data.origins, data.partial)}</div>
        </section>
        <section class="ead-panel-card">
          <header class="ead-panel-head">
            <h3>Desempenho por origem</h3>
            <select aria-label="Período desempenho" disabled>
              <option>Últimos 30 dias</option>
            </select>
          </header>
          <div class="ead-panel-body ead-perf-list">${renderOriginPerformance(data.originPerformance)}</div>
        </section>
      </div>
      <div class="ead-bottom-grid">
        ${renderAudiencesTable(data.audiences?.items, data.audiences?.meta)}
        <div class="ead-side-col">
          <section class="ead-panel-card">
            <header class="ead-panel-head"><h3>Qualidade da base</h3></header>
            <div class="ead-panel-body">${renderQualityGauge(data.quality)}</div>
          </section>
          ${renderTipCard()}
        </div>
      </div>`;
  }

  function render() {
    if (!state.dom.root) return;
    state.dom.root.innerHTML = `
      <div class="ead-shell">
        ${renderToolbar()}
        ${renderContent()}
      </div>`;
    bindEvents();
  }

  function bindEvents() {
    if (!state.dom.root) return;

    state.dom.root.querySelector('#eadRefreshBtn')?.addEventListener('click', () => loadData());
    state.dom.root.querySelector('#eadDateFrom')?.addEventListener('change', (e) => {
      state.dateFrom = e.target.value;
      state.page = 1;
      loadData();
    });
    state.dom.root.querySelector('#eadDateTo')?.addEventListener('change', (e) => {
      state.dateTo = e.target.value;
      state.page = 1;
      loadData();
    });
    state.dom.root.querySelector('#eadSortSelect')?.addEventListener('change', (e) => {
      state.sort = e.target.value;
      state.page = 1;
      loadData();
    });
    state.dom.root.querySelector('#eadGrowthWindow')?.addEventListener('change', (e) => {
      state.growthWindow = e.target.value;
      render();
    });
    state.dom.root.querySelector('#eadNewAudienceBtn')?.addEventListener('click', () => {
      window.EngageContactAudiences?.open?.(state.session);
    });
    state.dom.root.querySelector('#eadQualityDetailsBtn')?.addEventListener('click', () => {
      try { sessionStorage.setItem('engage-config-tab', 'contact-hub'); } catch (_e) { /* ignore */ }
      document.querySelector('[data-es-nav="engage-config"]')?.click();
    });
    state.dom.root.querySelector('#eadTipLinkBtn')?.addEventListener('click', () => {
      try { sessionStorage.setItem('engage-config-tab', 'contact-hub'); } catch (_e) { /* ignore */ }
      document.querySelector('[data-es-nav="engage-config"]')?.click();
    });

    state.dom.root.querySelectorAll('[data-ead-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.page = Number(btn.dataset.eadPage || 1);
        loadData();
      });
    });
    state.dom.root.querySelectorAll('[data-ead-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.EngageContactAudiences?.open?.(state.session, btn.dataset.eadView);
      });
    });
    state.dom.root.querySelectorAll('[data-ead-campaign]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelector('[data-es-nav="campanhas"]')?.click();
      });
    });
    state.dom.root.querySelectorAll('[data-ead-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.EngageContactAudiences?.open?.(state.session, btn.dataset.eadMore);
      });
    });
  }

  async function loadData() {
    if (!state.active) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      state.data = await api().load(state.session, {
        from: state.dateFrom,
        to: state.dateTo,
        page: state.page,
        limit: state.limit,
        sort: state.sort,
        sortDir: state.sortDir,
      });
    } catch (err) {
      const status = Number(err?.statusCode || err?.status || 0);
      state.error = status === 401
        ? 'Sessão expirada ou token inválido. Faça login novamente.'
        : (err?.message || 'Falha ao carregar Audiências.');
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
    state.dom.root = document.getElementById('adminEngageAudiencesDashboardRoot');
    if (!state.dom.root || state.mounted) return;
    state.mounted = true;
  }

  function activate(session) {
    mount();
    state.active = true;
    state.session = session || null;
    const range = api()?.defaultDateRange?.() || {};
    state.dateFrom = range.from || '';
    state.dateTo = range.to || '';
    loadData();
    startRefresh();
  }

  function deactivate() {
    state.active = false;
    stopRefresh();
  }

  window.ReservaAiEngageAudiencesDashboardAdmin = {
    activate,
    deactivate,
    reload: loadData,
  };
})();
