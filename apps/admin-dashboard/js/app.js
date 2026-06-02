(function () {
  const KPI_ICONS = {
    leads: '🎯',
    chat: '💬',
    reply: '↩️',
    proposal: '💰',
    sale: '✅',
    money: '📈',
  };

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'leads', label: 'Leads', icon: '🎯' },
    { id: 'conversas', label: 'Conversas', icon: '💬', badge: 12 },
    { id: 'campanhas', label: 'Campanhas', icon: '📋' },
    { id: 'automacoes', label: 'Automações', icon: '🤖' },
    { id: 'followup', label: 'Follow-up', icon: '📞', badge: 4 },
    { id: 'pipeline', label: 'Pipeline', icon: '📈' },
    { id: 'clientes', label: 'Clientes', icon: '👥' },
    { id: 'propostas', label: 'Propostas', icon: '💰' },
    { id: 'relatorios', label: 'Relatórios', icon: '📊' },
    { id: 'configuracoes', label: 'Configurações', icon: '⚙️' },
  ];

  const PLACEHOLDER_TITLES = {
    leads: 'Leads',
    conversas: 'Conversas WhatsApp',
    campanhas: 'Campanhas',
    automacoes: 'Automações',
    followup: 'Follow-up',
    pipeline: 'Pipeline de Vendas',
    clientes: 'Clientes',
    propostas: 'Propostas',
    relatorios: 'Relatórios',
    configuracoes: 'Configurações',
  };

  const state = {
    panel: 'dashboard',
    data: null,
  };

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatNumber(value) {
    return Number(value).toLocaleString('pt-BR');
  }

  function renderNav() {
    const nav = qs('#esNav');
    if (!nav) return;

    nav.innerHTML = NAV.map((item) => `
      <button type="button" class="es-nav-item${item.id === state.panel ? ' is-active' : ''}" data-es-nav="${item.id}">
        <span class="es-nav-icon" aria-hidden="true">${item.icon}</span>
        <span class="es-nav-label">${escapeHtml(item.label)}</span>
        ${item.badge ? `<span class="es-nav-badge">${item.badge}</span>` : ''}
      </button>
    `).join('');

    nav.querySelectorAll('[data-es-nav]').forEach((button) => {
      button.addEventListener('click', () => activatePanel(button.dataset.esNav));
    });
  }

  function activatePanel(panelId) {
    state.panel = panelId;
    document.body.dataset.esPanelActive = panelId;

    renderNav();

    document.querySelectorAll('[data-es-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.esPanel !== panelId;
    });

    const title = PLACEHOLDER_TITLES[panelId] || 'Dashboard';
    const heroTitle = qs('#esHeroTitle');
    const heroSub = qs('#esHeroSubtitle');
    if (heroTitle) {
      heroTitle.textContent = panelId === 'dashboard'
        ? '☀️ Engage Solar CRM'
        : title;
    }
    if (heroSub) {
      heroSub.textContent = panelId === 'dashboard'
        ? 'Conectando leads em vendas — visão geral do seu negócio solar'
        : `Módulo ${title} — em breve na Fase 2`;
    }
  }

  function renderKpis(kpis) {
    const mount = qs('#esKpiGrid');
    if (!mount || !Array.isArray(kpis)) return;

    mount.innerHTML = kpis.map((kpi) => `
      <article class="es-kpi-card">
        <header>
          <span>${escapeHtml(kpi.label)}</span>
          <span class="es-kpi-icon" aria-hidden="true">${KPI_ICONS[kpi.icon] || '📊'}</span>
        </header>
        <strong>${escapeHtml(kpi.value)}</strong>
        <span class="es-kpi-delta">${escapeHtml(kpi.delta)}</span>
      </article>
    `).join('');
  }

  function renderPipeline(pipeline, conversion) {
    const mount = qs('#esPipeline');
    if (!mount || !Array.isArray(pipeline)) return;

    const max = Math.max(...pipeline.map((row) => row.count), 1);
    mount.innerHTML = `
      <div class="es-funnel">
        ${pipeline.map((row) => `
          <div class="es-funnel-row">
            <span>${escapeHtml(row.stage)}</span>
            <div class="es-funnel-bar" aria-hidden="true">
              <span style="width:${Math.max(8, (row.count / max) * 100)}%"></span>
            </div>
            <strong>${row.count}</strong>
          </div>
        `).join('')}
      </div>
      <p class="es-funnel-foot">Taxa de conversão geral: <strong>${escapeHtml(conversion)}</strong></p>
    `;
  }

  function renderWhatsapp(wa) {
    const mount = qs('#esWhatsapp');
    if (!mount || !wa) return;

    mount.innerHTML = `
      <div class="es-wa-stats">
        <div class="es-wa-stat"><span>Mensagens enviadas</span><strong>${formatNumber(wa.sent)}</strong></div>
        <div class="es-wa-stat"><span>Entregues</span><strong>${formatNumber(wa.delivered)}</strong></div>
        <div class="es-wa-stat"><span>Lidas</span><strong>${formatNumber(wa.read)}</strong></div>
        <div class="es-wa-stat"><span>Respondidas</span><strong>${formatNumber(wa.replied)}</strong></div>
      </div>
      <div class="es-wa-highlight">
        <span>Taxa de resposta</span>
        <strong>${wa.responseRate}%</strong>
        <span>${escapeHtml(wa.responseDelta)}</span>
      </div>
    `;
  }

  function renderInsights(insights) {
    const mount = qs('#esInsights');
    if (!mount || !Array.isArray(insights)) return;

    mount.innerHTML = insights.map((item) => `
      <div class="es-insight" data-tone="${escapeHtml(item.tone)}">
        <span class="es-insight-dot" aria-hidden="true"></span>
        <span>${escapeHtml(item.text)}</span>
      </div>
    `).join('');
  }

  function renderCampaigns(campaigns) {
    const mount = qs('#esCampaigns');
    if (!mount || !Array.isArray(campaigns)) return;

    mount.innerHTML = campaigns.map((c) => `
      <article class="es-campaign">
        <h3>${escapeHtml(c.name)}</h3>
        <div class="es-campaign-metrics">
          <div><span>Enviados</span><strong>${formatNumber(c.sent)}</strong></div>
          <div><span>Resposta</span><strong>${c.responsePct}%</strong></div>
          <div><span>Agendamentos</span><strong>${c.appointments}</strong></div>
          <div><span>Vendas</span><strong>${c.sales}</strong></div>
        </div>
      </article>
    `).join('');
  }

  function renderSellers(sellers) {
    const mount = qs('#esSellers');
    if (!mount || !Array.isArray(sellers)) return;

    mount.innerHTML = sellers.map((seller, index) => `
      <div class="es-seller">
        <span class="es-seller-rank">${index + 1}</span>
        <span class="es-seller-avatar" aria-hidden="true">${escapeHtml(seller.initials)}</span>
        <div class="es-seller-info">
          <strong>${escapeHtml(seller.name)}</strong>
          <span>${seller.proposals} propostas · ${seller.sales} vendas</span>
        </div>
        <span class="es-seller-revenue">${escapeHtml(seller.revenue)}</span>
      </div>
    `).join('');
  }

  function renderFinance(finance) {
    const mount = qs('#esFinance');
    if (!mount || !finance) return;

    mount.innerHTML = `
      <div class="es-finance-kpis">
        <div class="es-finance-kpi"><span>Pipeline</span><strong>${escapeHtml(finance.pipeline)}</strong></div>
        <div class="es-finance-kpi"><span>Propostas abertas</span><strong>${escapeHtml(finance.openProposals)}</strong></div>
        <div class="es-finance-kpi"><span>Fechados no mês</span><strong>${escapeHtml(finance.closedMonth)}</strong></div>
      </div>
      <div class="es-goal">
        <div class="es-goal-head">
          <span>Meta do mês: ${escapeHtml(finance.goal)}</span>
          <strong>${finance.goalPct}%</strong>
        </div>
        <div class="es-goal-bar" aria-hidden="true">
          <span style="width:${finance.goalPct}%"></span>
        </div>
      </div>
    `;
  }

  function renderDashboard(data) {
    renderKpis(data.kpis);
    renderPipeline(data.pipeline, data.pipelineConversion);
    renderWhatsapp(data.whatsapp);
    renderInsights(data.insights);
    renderCampaigns(data.campaigns);
    renderSellers(data.sellers);
    renderFinance(data.finance);
  }

  async function loadData() {
    const response = await fetch('./data/mock-dashboard.json');
    if (!response.ok) {
      throw new Error('Não foi possível carregar os dados do dashboard.');
    }
    state.data = await response.json();
    renderDashboard(state.data);
  }

  function bindChrome() {
    qs('#esSidebarToggle')?.addEventListener('click', () => {
      const app = qs('.es-app');
      if (!app) return;
      const collapsed = app.dataset.sidebar === 'collapsed';
      app.dataset.sidebar = collapsed ? 'expanded' : 'collapsed';
    });

    qs('#esMobileToggle')?.addEventListener('click', () => {
      const app = qs('.es-app');
      if (!app) return;
      app.dataset.mobileNav = app.dataset.mobileNav === 'open' ? 'closed' : 'open';
    });
  }

  async function init() {
    bindChrome();
    renderNav();
    activatePanel('dashboard');
    try {
      await loadData();
    } catch (error) {
      const grid = qs('#esKpiGrid');
      if (grid) {
        grid.innerHTML = `<div class="es-placeholder">${escapeHtml(error.message)}</div>`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
