/**
 * Engage Solar — Dashboard Executivo (Fase 4).
 */
(function () {
  const api = () => window.EngageExecutiveDashboardApi;
  const REFRESH_MS = 30 * 1000;

  const state = {
    active: false,
    session: null,
    loading: false,
    error: '',
    data: null,
    windowKey: '30d',
    refreshTimerId: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(n) {
    return api()?.formatNumber?.(n) ?? String(n ?? 0);
  }

  function fmtPct(n) {
    return api()?.formatPctFraction?.(n) ?? '—';
  }

  function fmtDelta(n) {
    return api()?.formatDeltaPct?.(n) ?? { text: '—', tone: 'neutral' };
  }

  function renderKpis(summary) {
    const mount = $('esKpiGrid');
    if (!mount || !summary) return;
    const s = summary;
    const deliveryPct = s.messagesSent ? s.messagesDelivered / s.messagesSent : null;
    const cards = [
      {
        icon: '👥', color: 'purple', label: 'Total de Contatos',
        value: fmtNum(s.totalContacts),
        delta: fmtDelta(s.totalContactsDeltaPct),
        sub: s.newContacts != null ? `${fmtNum(s.newContacts)} novos no período` : '',
      },
      {
        icon: '📋', color: 'blue', label: 'Campanhas Ativas',
        value: fmtNum(s.activeCampaigns),
        delta: { text: s.campaignsInWindow ? `+${fmtNum(s.campaignsInWindow)} no período` : '—', tone: 'neutral' },
        sub: '',
      },
      {
        icon: '💬', color: 'navy', label: 'Mensagens Enviadas',
        value: fmtNum(s.messagesSent),
        delta: { text: deliveryPct != null ? `Entregues: ${fmtNum(s.messagesDelivered)} (${fmtPct(deliveryPct)})` : '—', tone: 'neutral' },
        sub: s.messagesRead != null ? `Lidas: ${fmtNum(s.messagesRead)}` : '',
      },
      {
        icon: '↩️', color: 'green', label: 'Respostas Recebidas',
        value: fmtNum(s.repliesReceived),
        delta: { text: `Taxa: ${fmtPct(s.responseRate)}`, tone: 'neutral' },
        sub: '',
      },
      {
        icon: '🎯', color: 'amber', label: 'Leads Gerados',
        value: fmtNum(s.leadsGenerated),
        delta: fmtDelta(s.leadsGeneratedDeltaPct),
        sub: '',
      },
      {
        icon: '✅', color: 'orange', label: 'Leads Recuperados',
        value: fmtNum(s.leadsRecovered),
        delta: { text: `Taxa: ${fmtPct(s.recoveryRate)}`, tone: 'neutral' },
        sub: '',
      },
    ];
    mount.innerHTML = cards.map((c) => `
      <article class="es-kpi-card es-exec-kpi">
        <span class="es-kpi-icon" data-color="${escapeHtml(c.color)}" aria-hidden="true">${c.icon}</span>
        <p class="es-kpi-label">${escapeHtml(c.label)}</p>
        <strong>${escapeHtml(c.value)}</strong>
        <span class="es-kpi-delta" data-tone="${escapeHtml(c.delta.tone)}">${escapeHtml(c.delta.text)}</span>
        ${c.sub ? `<small class="es-exec-kpi-sub">${escapeHtml(c.sub)}</small>` : ''}
      </article>
    `).join('');
  }

  function renderFunnel(funnel) {
    const mount = $('esExecFunnel');
    if (!mount) return;
    const stages = Array.isArray(funnel?.stages) ? funnel.stages : [];
    if (!stages.length) {
      mount.innerHTML = '<p class="es-exec-empty">Sem dados de funil no período.</p>';
      return;
    }
    const colors = api()?.FUNNEL_COLORS || {};
    mount.innerHTML = `
      <div class="es-exec-funnel">
        ${stages.map((stage) => {
          const width = Math.max(18, Math.round(Number(stage.pctOfBase || 0) * 100));
          const color = colors[stage.key] || '#64748b';
          return `
            <div class="es-exec-funnel-row">
              <div class="es-exec-funnel-bar-wrap">
                <div class="es-exec-funnel-bar" style="width:${width}%;background:${color}">
                  <span>${escapeHtml(stage.label || stage.key)}</span>
                </div>
              </div>
              <div class="es-exec-funnel-meta">
                <strong>${fmtNum(stage.value)}</strong>
                <span>${fmtPct(stage.pctOfBase)}</span>
                ${stage.pctOfPrevious != null ? `<small>${fmtPct(stage.pctOfPrevious)} conv.</small>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
      <p class="es-exec-funnel-foot">Taxa geral de recuperação: <strong>${fmtPct(funnel.overallRecoveryRate)}</strong></p>`;
  }

  function renderWhatsappChart(series) {
    const mount = $('esExecWaChart');
    if (!mount || !Array.isArray(series) || !series.length) {
      if (mount) mount.innerHTML = '<p class="es-exec-empty">Sem série temporal.</p>';
      return;
    }
    const w = 320;
    const h = 80;
    const rates = series.map((p) => Number(p.conversionRate || 0));
    const max = Math.max(...rates, 0.001);
    const min = Math.min(...rates, 0);
    const range = max - min || 1;
    const step = w / Math.max(series.length - 1, 1);
    const coords = rates.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${x},${y}`;
    }).join(' ');
    mount.innerHTML = `<svg class="es-exec-wa-chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-hidden="true"><polyline fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" points="${coords}"/></svg>`;
  }

  function renderWhatsapp(wa) {
    const mount = $('esExecWhatsapp');
    if (!mount || !wa) return;
    mount.innerHTML = `
      <div class="es-wa-stats es-exec-wa-stats">
        <div class="es-wa-stat"><span>Enviadas</span><strong>${fmtNum(wa.messagesSent)}</strong></div>
        <div class="es-wa-stat"><span>Entregues</span><strong>${fmtNum(wa.messagesDelivered)}</strong></div>
        <div class="es-wa-stat"><span>Lidas</span><strong>${fmtNum(wa.messagesRead)}</strong></div>
        <div class="es-wa-stat"><span>Respondidas</span><strong>${fmtNum(wa.messagesReplied)}</strong></div>
      </div>
      <div class="es-exec-wa-kpis">
        <div><span>Taxa de resposta</span><strong>${fmtPct(wa.responseRate)}</strong></div>
        <div><span>Taxa de leitura</span><strong>${fmtPct(wa.readRate)}</strong></div>
        <div><span>Conversão em lead</span><strong>${fmtPct(wa.leadConversionRate)}</strong></div>
      </div>
      <p class="es-exec-chart-label">Taxa de conversão em lead (por dia)</p>
      <div id="esExecWaChart"></div>`;
    renderWhatsappChart(wa.series);
  }

  function mapInsightHref(href) {
    const raw = String(href || '').trim();
    if (!raw) return null;
    if (raw.includes('pipeline') || raw.includes('leads')) return 'pipeline';
    if (raw.includes('campaign')) return 'campanhas';
    if (raw.includes('inbox') || raw.includes('conversation')) return 'conversas';
    if (raw.includes('response')) return 'central-respostas';
    return null;
  }

  function renderInsights(insightsPayload) {
    const mount = $('esExecInsights');
    if (!mount) return;
    const items = Array.isArray(insightsPayload?.insights) ? insightsPayload.insights : [];
    if (!items.length) {
      mount.innerHTML = '<p class="es-exec-empty">Nenhum insight relevante no momento.</p>';
      return;
    }
    mount.innerHTML = items.map((item) => {
      const panel = mapInsightHref(item.actionHref);
      return `
        <button type="button" class="es-exec-insight" data-severity="${escapeHtml(item.severity || 'info')}"${panel ? ` data-es-nav-jump="${panel}"` : ''}>
          <span class="es-exec-insight-icon">${escapeHtml(item.icon || '💡')}</span>
          <div class="es-exec-insight-body">
            <strong>${escapeHtml(item.title || '')}</strong>
            <span>${escapeHtml(item.description || '')}${item.count != null ? ` (${fmtNum(item.count)})` : ''}</span>
          </div>
        </button>`;
    }).join('');
  }

  function renderCampaignsTable(payload) {
    const mount = $('esExecCampaigns');
    if (!mount) return;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      mount.innerHTML = '<p class="es-exec-empty">Nenhuma campanha com atividade no período.</p>';
      return;
    }
    mount.innerHTML = `
      <div class="es-exec-table-wrap">
        <table class="es-exec-table">
          <thead><tr>
            <th>Campanha</th><th>Enviadas</th><th>Respostas</th><th>Leads</th><th>Recuperados</th><th>Conv.</th>
          </tr></thead>
          <tbody>
            ${items.map((row) => `
              <tr data-open-campaign="${escapeHtml(row.id || '')}">
                <td><strong>${escapeHtml(row.name || '—')}</strong></td>
                <td>${fmtNum(row.messagesSent)}</td>
                <td>${fmtNum(row.replies)}</td>
                <td>${fmtNum(row.leads)}</td>
                <td>${fmtNum(row.recovered)}</td>
                <td>${fmtPct(row.conversionRate)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button type="button" class="es-exec-link-btn" data-es-nav-jump="campanhas">Ver todas as campanhas →</button>`;
  }

  function renderAudiencesTable(payload) {
    const mount = $('esExecAudiences');
    if (!mount) return;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      mount.innerHTML = '<p class="es-exec-empty">Nenhuma audiência com dados no período.</p>';
      return;
    }
    mount.innerHTML = `
      <div class="es-exec-table-wrap">
        <table class="es-exec-table">
          <thead><tr>
            <th>Audiência</th><th>Contatos</th><th>Taxa resp.</th><th>Leads</th><th>Recuperados</th>
          </tr></thead>
          <tbody>
            ${items.map((row) => `
              <tr data-es-nav-jump="audiencias">
                <td><strong>${escapeHtml(row.name || '—')}</strong></td>
                <td>${fmtNum(row.contacts)}</td>
                <td>${fmtPct(row.responseRate)}</td>
                <td>${fmtNum(row.leads)}</td>
                <td>${fmtNum(row.recovered)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button type="button" class="es-exec-link-btn" data-es-nav-jump="audiencias">Ver todas as audiências →</button>`;
  }

  function renderPipelineDonut(payload) {
    const mount = $('esExecPipeline');
    if (!mount) return;
    const slices = Array.isArray(payload?.slices) ? payload.slices : [];
    const total = Number(payload?.total || 0);
    if (!slices.length) {
      mount.innerHTML = '<p class="es-exec-empty">Pipeline sem leads ativos.</p>';
      return;
    }
    const colors = api()?.PIPELINE_COLORS || {};
    let acc = 0;
    const gradientParts = slices.map((slice) => {
      const pct = Number(slice.pct || 0) * 100;
      const color = colors[slice.key] || '#94a3b8';
      const start = acc;
      acc += pct;
      return `${color} ${start}% ${acc}%`;
    });
    mount.innerHTML = `
      <div class="es-exec-donut-wrap">
        <div class="es-exec-donut" style="background:conic-gradient(${gradientParts.join(', ')})" role="img" aria-label="Distribuição do pipeline">
          <div class="es-exec-donut-center">
            <strong>${fmtNum(total)}</strong>
            <span>leads</span>
          </div>
        </div>
        <ul class="es-exec-donut-legend">
          ${slices.map((slice) => `
            <li>
              <span class="es-exec-dot" style="background:${colors[slice.key] || '#94a3b8'}"></span>
              <span>${escapeHtml(slice.label || slice.key)}</span>
              <strong>${fmtNum(slice.count)}</strong>
              <em>${fmtPct(slice.pct)}</em>
            </li>`).join('')}
        </ul>
      </div>
      <button type="button" class="es-exec-link-btn" data-es-nav-jump="pipeline">Ver pipeline completo →</button>`;
  }

  function renderToolbar() {
    const mount = $('esExecToolbar');
    if (!mount) return;
    const options = (api()?.WINDOW_OPTIONS || []).map((opt) => {
      const sel = opt.key === state.windowKey ? ' selected' : '';
      return `<option value="${escapeHtml(opt.key)}"${sel}>${escapeHtml(opt.label)}</option>`;
    }).join('');
    const windowLabel = api()?.windowLabel?.(state.data?.summary?.window, state.windowKey) || '';
    mount.innerHTML = `
      <div class="es-exec-toolbar">
        <label class="es-exec-period">
          <span>Período</span>
          <select id="esExecWindowSelect">${options}</select>
        </label>
        <span class="es-exec-period-label">${escapeHtml(windowLabel)}</span>
        <button type="button" class="es-exec-refresh-btn" id="esExecRefreshBtn" title="Atualizar">↻</button>
      </div>
      ${state.error ? `<div class="es-exec-error" role="alert">${escapeHtml(state.error)} <button type="button" id="esExecRetryBtn">Tentar novamente</button></div>` : ''}
      <p class="es-exec-footnote" id="esExecFetchedAt"></p>`;
  }

  function renderAll() {
    if (!state.data && state.loading) {
      $('esKpiGrid').innerHTML = '<div class="es-exec-skeleton es-exec-skeleton--kpi"></div>'.repeat(6);
      ['esExecFunnel', 'esExecWhatsapp', 'esExecInsights', 'esExecCampaigns', 'esExecAudiences', 'esExecPipeline'].forEach((id) => {
        const el = $(id);
        if (el) el.innerHTML = '<div class="es-exec-skeleton"></div>';
      });
    }
    renderToolbar();
    if (!state.data) return;
    renderKpis(state.data.summary);
    renderFunnel(state.data.funnel);
    renderWhatsapp(state.data.whatsapp);
    renderInsights(state.data.insights);
    renderCampaignsTable(state.data.campaigns);
    renderAudiencesTable(state.data.audiences);
    renderPipelineDonut(state.data.pipeline);
    const fetched = state.data.summary?.fetchedAt || state.data.pipeline?.fetchedAt;
    const foot = $('esExecFetchedAt');
    if (foot && fetched) {
      foot.textContent = `Dados atualizados em tempo real. Última atualização: ${api()?.formatDateTime?.(fetched) || fetched}`;
    }
    bindInteractions();
  }

  function bindInteractions() {
    const toolbar = $('esExecToolbar');
    if (toolbar && !toolbar.dataset.bound) {
      toolbar.dataset.bound = '1';
      toolbar.addEventListener('change', (e) => {
        if (e.target?.id === 'esExecWindowSelect') {
          state.windowKey = e.target.value || '30d';
          void loadData();
        }
      });
      toolbar.addEventListener('click', (e) => {
        if (e.target?.closest('#esExecRefreshBtn')) void loadData();
        if (e.target?.closest('#esExecRetryBtn')) void loadData();
      });
    }

    const panel = $('esPanelDashboard');
    if (panel && !panel.dataset.execBound) {
      panel.dataset.execBound = '1';
      panel.addEventListener('click', (e) => {
        const navJump = e.target.closest('[data-es-nav-jump]');
        if (navJump) {
          const panelId = navJump.getAttribute('data-es-nav-jump');
          if (panelId) document.querySelector(`[data-es-nav="${panelId}"]`)?.click();
          return;
        }
        const campaignRow = e.target.closest('[data-open-campaign]');
        if (campaignRow) {
          const id = campaignRow.getAttribute('data-open-campaign');
          document.querySelector('[data-es-nav="campanhas"]')?.click();
          if (id && window.ReservaAiEngageCampaignsAdmin?.selectCampaign) {
            window.ReservaAiEngageCampaignsAdmin.selectCampaign(id);
          }
        }
      });
    }
  }

  async function loadData(options = {}) {
    if (!state.active || !state.session) return;
    const silent = options.silent === true;
    if (!silent) {
      state.loading = true;
      state.error = '';
    }
    renderAll();
    try {
      state.data = await api().loadAll(state.session, { window: state.windowKey });
      state.error = '';
    } catch (err) {
      state.error = api()?.mapApiError?.(err) || err?.message || 'Erro ao carregar dashboard.';
      if (!silent) state.data = null;
    } finally {
      state.loading = false;
      renderAll();
    }
  }

  function startRefresh() {
    stopRefresh();
    state.refreshTimerId = setInterval(() => {
      if (state.active) void loadData({ silent: true });
    }, REFRESH_MS);
  }

  function stopRefresh() {
    if (state.refreshTimerId) {
      clearInterval(state.refreshTimerId);
      state.refreshTimerId = null;
    }
  }

  function activate(session) {
    state.session = session || state.session;
    state.active = true;
    void loadData();
    startRefresh();
  }

  function deactivate() {
    state.active = false;
    stopRefresh();
  }

  window.ReservaAiEngageExecutiveDashboard = {
    activate,
    deactivate,
    reload: loadData,
  };
})();
