/**
 * Engage Config → Timeline de campanha (hub + detalhe).
 */
(function () {
  const api = () => window.EngageCampaignTimelineApi;
  const REFRESH_MS = 15_000;

  const EVENT_LABELS = {
    'campaign.created': 'Campanha criada',
    'recipients.imported': 'Destinatários importados',
    'campaign.scheduled': 'Campanha agendada',
    'dry_run.started': 'Envio / simulação iniciada',
    'batch.processed': 'Batch processado',
    'rate_limit.applied': 'Rate limit aplicado',
    'cooldown.triggered': 'Cooldown aplicado',
    'send_window.blocked': 'Janela de envio fechada',
    'campaign.completed': 'Campanha concluída',
    'safety.warning': 'Aviso de segurança',
    'safety.blocked': 'Bloqueio de segurança',
    'message.replied': 'Mensagem respondida',
    'protection.auto_paused': 'Pausa automática (proteção)',
    'protection.auto_resumed': 'Retoma automática',
    'protection.manual_paused': 'Pausa manual',
    'protection.manual_resumed': 'Retoma manual',
    'throughput.enforced': 'Limite inteligente de throughput',
  };

  const EVENT_TONES = {
    'campaign.created': 'muted',
    'recipients.imported': 'muted',
    'campaign.scheduled': 'muted',
    'dry_run.started': 'muted',
    'batch.processed': 'muted',
    'rate_limit.applied': 'warn',
    'cooldown.triggered': 'info',
    'send_window.blocked': 'warn',
    'campaign.completed': 'success',
    'safety.warning': 'warn',
    'safety.blocked': 'danger',
    'message.replied': 'success',
    'protection.auto_paused': 'warn',
    'protection.auto_resumed': 'success',
    'protection.manual_paused': 'warn',
    'protection.manual_resumed': 'success',
    'throughput.enforced': 'warn',
  };

  const STATUS_LABELS = {
    DRAFT: 'Rascunho',
    SCHEDULED: 'Agendada',
    RUNNING: 'Em envio',
    PAUSED: 'Pausada',
    COMPLETED: 'Concluída',
  };

  const LEGEND = [
    { label: 'Criada', tone: 'muted' },
    { label: 'Importados', tone: 'muted' },
    { label: 'Agendada', tone: 'muted' },
    { label: 'Início envio', tone: 'muted' },
    { label: 'Batch', tone: 'muted' },
    { label: 'Rate limit', tone: 'warn' },
    { label: 'Cooldown', tone: 'info' },
    { label: 'Janela fechada', tone: 'warn' },
    { label: 'Concluída', tone: 'success' },
  ];

  let session = null;
  let active = false;
  let view = 'list';
  let selectedCampaignId = '';
  let campaigns = [];
  let timeline = null;
  let dashboard = null;
  let loading = false;
  let error = '';
  let refreshTimerId = null;

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

  function statusLabel(status) {
    const key = String(status || '').trim().toUpperCase();
    return STATUS_LABELS[key] || status || '—';
  }

  function statusTone(status) {
    const key = String(status || '').trim().toUpperCase();
    if (key === 'COMPLETED') return 'success';
    if (key === 'RUNNING' || key === 'SCHEDULED' || key === 'PAUSED') return 'warn';
    if (key === 'FAILED') return 'danger';
    return 'muted';
  }

  function statusChip(status) {
    return `<span class="ec-mc-chip" data-tone="${escapeHtml(statusTone(status))}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function eventLabel(event) {
    const type = String(event?.eventType || '').trim();
    const mapped = EVENT_LABELS[type];
    if (mapped) return mapped;
    return String(event?.title || type || 'Evento').trim();
  }

  function eventTone(eventType) {
    return EVENT_TONES[String(eventType || '').trim()] || 'muted';
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR');
    } catch (_e) {
      return '—';
    }
  }

  function campaignName() {
    const fromDash = dashboard?.campaign?.name || dashboard?.name;
    if (fromDash) return fromDash;
    const row = campaigns.find((c) => String(c.id) === selectedCampaignId);
    return row?.name || 'Campanha';
  }

  function campaignStatus() {
    return dashboard?.campaign?.status || dashboard?.status
      || campaigns.find((c) => String(c.id) === selectedCampaignId)?.status
      || '';
  }

  function sortEvents(events) {
    return [...(events || [])].sort((a, b) => {
      const ta = new Date(a?.occurredAt || 0).getTime();
      const tb = new Date(b?.occurredAt || 0).getTime();
      return ta - tb;
    });
  }

  function setFeedback(message, tone = 'neutral') {
    const el = $('engageCampaignTimelineFeedback');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.dataset.tone = tone;
    el.textContent = message;
  }

  function renderLegend() {
    const el = $('engageCampaignTimelineLegend');
    if (!el) return;
    if (view !== 'detail') {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = LEGEND.map((item) => `
      <span class="ectl-legend-item">
        <span class="ectl-legend-dot ectl-timeline-dot" data-tone="${escapeHtml(item.tone)}"></span>
        ${escapeHtml(item.label)}
      </span>`).join('');
  }

  function renderList() {
    const el = $('engageCampaignTimelineContent');
    if (!el) return;

    if (loading) {
      el.innerHTML = '<div class="ec-mc-loading">Carregando…</div>';
      return;
    }

    if (error) {
      el.innerHTML = `<p class="ec-mc-feedback" data-tone="danger" role="alert">${escapeHtml(error)}</p>`;
      return;
    }

    if (!campaigns.length) {
      el.innerHTML = `
        <div class="ec-mc-empty">
          <strong>Nenhuma campanha encontrada</strong>
          <p>Crie uma campanha para ver a linha do tempo operacional.</p>
        </div>`;
      return;
    }

    const sorted = [...campaigns].sort((a, b) => {
      const ta = new Date(a?.updatedAt || 0).getTime();
      const tb = new Date(b?.updatedAt || 0).getTime();
      return tb - ta;
    });

    const rows = sorted.map((row) => {
      const id = String(row.id || '');
      return `
        <tr>
          <td>${escapeHtml(row.name || '—')}</td>
          <td>${statusChip(row.status)}</td>
          <td>${escapeHtml(String(row.recipientCount ?? 0))}</td>
          <td>
            <button type="button" class="ec-mc-btn ec-mc-btn--primary" data-ectl-open="${escapeAttr(id)}">Abrir timeline</button>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="ec-mc-table-wrap">
        <table class="ec-mc-table" aria-label="Campanhas">
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Estado</th>
              <th>Destinatários</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    el.querySelectorAll('[data-ectl-open]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.dataset.ectlOpen));
    });
  }

  function renderMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || !Object.keys(metadata).length) {
      return '';
    }
    const text = JSON.stringify(metadata, null, 2);
    return `
      <details class="ectl-timeline-meta">
        <summary>Detalhes técnicos</summary>
        <pre>${escapeHtml(text)}</pre>
      </details>`;
  }

  function renderDetail() {
    const el = $('engageCampaignTimelineContent');
    const head = $('engageCampaignTimelineHead');
    const actions = $('engageCampaignTimelineActions');
    if (!el) return;

    if (head) {
      head.innerHTML = `
        <div class="ec-mc-head-copy">
          <h2>${escapeHtml(campaignName())}</h2>
          <div>${statusChip(campaignStatus())}</div>
        </div>`;
    }

    if (actions) {
      actions.innerHTML = `
        <button type="button" class="ec-mc-btn" id="engageCampaignTimelineBackBtn">← Campanhas</button>
        <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageCampaignTimelineDashboardBtn">Dashboard</button>`;
      actions.querySelector('#engageCampaignTimelineBackBtn')?.addEventListener('click', showList);
      actions.querySelector('#engageCampaignTimelineDashboardBtn')?.addEventListener('click', openCampaignDashboard);
    }

    if (loading && !timeline) {
      el.innerHTML = '<div class="ec-mc-loading">Carregando…</div>';
      renderLegend();
      return;
    }

    if (error) {
      el.innerHTML = `<p class="ec-mc-feedback" data-tone="danger" role="alert">${escapeHtml(error)}</p>`;
      renderLegend();
      return;
    }

    const events = sortEvents(timeline?.events || []);
    const metaEl = $('engageCampaignTimelineMeta');
    if (metaEl) {
      metaEl.textContent = `${events.length} evento(s) · Actualização automática a cada 15 s`;
    }

    if (!events.length) {
      el.innerHTML = `
        <div class="ec-mc-empty">
          <strong>Ainda não há eventos</strong>
          <p>Eventos aparecem após importar audiência, executar envio e processar batches.</p>
        </div>`;
      renderLegend();
      return;
    }

    const items = events.map((event) => {
      const label = eventLabel(event);
      const title = String(event?.title || '').trim();
      const subtitle = title && title !== label ? title : '';
      const tone = eventTone(event.eventType);
      const conversationId = event?.metadata?.conversationId;
      const inboxBtn = event.eventType === 'message.replied' && conversationId
        ? `<button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-ectl-inbox="${escapeAttr(String(conversationId))}">Abrir conversa</button>`
        : '';
      return `
        <article class="ectl-timeline-item">
          <div class="ectl-timeline-marker">
            <span class="ectl-timeline-dot" data-tone="${escapeHtml(tone)}"></span>
          </div>
          <div class="ectl-timeline-body">
            <h4>${escapeHtml(label)}</h4>
            ${subtitle ? `<p class="ectl-timeline-subtitle">${escapeHtml(subtitle)}</p>` : ''}
            <p class="ectl-timeline-time">${escapeHtml(formatDateTime(event.occurredAt))}</p>
            ${renderMetadata(event.metadata)}
            ${inboxBtn}
          </div>
        </article>`;
    }).join('');

    el.innerHTML = `<div class="ectl-timeline">${items}</div>`;
    el.querySelectorAll('[data-ectl-inbox]').forEach((btn) => {
      btn.addEventListener('click', () => openInbox(btn.dataset.ectlInbox));
    });
    renderLegend();
  }

  function render() {
    const listHead = $('engageCampaignTimelineListHead');
    const detailHead = $('engageCampaignTimelineHead');
    const actions = $('engageCampaignTimelineActions');
    if (listHead) listHead.hidden = view !== 'list';
    if (detailHead) detailHead.hidden = view !== 'detail';
    if (actions) actions.hidden = view !== 'detail';
    if (view === 'list') {
      if (detailHead) detailHead.innerHTML = '';
      if (actions) actions.innerHTML = '';
      if ($('engageCampaignTimelineMeta')) $('engageCampaignTimelineMeta').textContent = '';
      renderList();
      renderLegend();
      return;
    }
    renderDetail();
  }

  function stopRefresh() {
    if (refreshTimerId) {
      window.clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
  }

  function startRefresh() {
    stopRefresh();
    refreshTimerId = window.setInterval(() => {
      if (active && view === 'detail' && selectedCampaignId) {
        void loadDetail(false);
      }
    }, REFRESH_MS);
  }

  async function loadList() {
    loading = true;
    error = '';
    setFeedback('');
    render();
    try {
      campaigns = await api().listCampaigns(session, 100);
    } catch (err) {
      const mapped = api().mapApiError(err);
      error = mapped.message;
      campaigns = [];
      if (mapped.redirectLogin) {
        window.EngageSolarAuth?.redirectToLogin?.('session_expired');
      }
    } finally {
      loading = false;
      render();
    }
  }

  async function loadDetail(showSpinner = true) {
    if (!selectedCampaignId) return;
    if (showSpinner) {
      loading = true;
      error = '';
      render();
    }
    try {
      const [timelineRes, dashboardRes] = await Promise.all([
        api().getCampaignTimeline(session, selectedCampaignId),
        api().getCampaignDashboard(session, selectedCampaignId).catch(() => null),
      ]);
      timeline = timelineRes;
      dashboard = dashboardRes;
      error = '';
    } catch (err) {
      const mapped = api().mapApiError(err);
      error = mapped.message;
      if (mapped.notFound) {
        timeline = null;
        dashboard = null;
      }
      if (mapped.redirectLogin) {
        window.EngageSolarAuth?.redirectToLogin?.('session_expired');
      }
    } finally {
      loading = false;
      render();
    }
  }

  function showList() {
    view = 'list';
    selectedCampaignId = '';
    timeline = null;
    dashboard = null;
    stopRefresh();
    loadList();
  }

  function openDetail(campaignId) {
    selectedCampaignId = String(campaignId || '').trim();
    if (!selectedCampaignId) return;
    view = 'detail';
    timeline = null;
    dashboard = null;
    void loadDetail(true);
    startRefresh();
  }

  function openCampaignDashboard() {
    if (!selectedCampaignId) return;
    window.ReservaAiEngageCampaignsAdmin?.selectCampaign?.(selectedCampaignId);
    document.querySelector('[data-es-nav="campanhas"]')?.click();
  }

  function openInbox(_conversationId) {
    document.querySelector('[data-es-nav="conversas"]')?.click();
  }

  function activate(nextSession) {
    active = true;
    session = nextSession || null;
    if (view === 'detail' && selectedCampaignId) {
      void loadDetail(true);
      startRefresh();
    } else {
      showList();
    }
  }

  function deactivate() {
    active = false;
    stopRefresh();
    session = null;
    view = 'list';
    selectedCampaignId = '';
    campaigns = [];
    timeline = null;
    dashboard = null;
    loading = false;
    error = '';
    setFeedback('');
  }

  window.EngageCampaignTimeline = {
    activate,
    deactivate,
    openDetail,
    isActive: () => active,
  };
})();
