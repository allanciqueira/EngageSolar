(function () {
  const KPI_ICONS = {
    leads: '🎯',
    chat: '💬',
    reply: '↩️',
    proposal: '📄',
    sale: '✅',
    money: '💰',
  };

  const INSIGHT_ICONS = {
    danger: '⚠️',
    warn: '🔥',
    info: '📈',
    success: '✨',
  };

  const MEDALS = { gold: '🥇', silver: '🥈', bronze: '🥉' };

  const FUNNEL_WIDTHS = [100, 84, 68, 52, 38, 26];

  const NAV_ICON_SVGS = {
    whatsapp:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">'
      + '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>'
      + '</svg>',
  };

  const SETTINGS = window.EngageSolarSettings;
  const SETTINGS_PANELS = SETTINGS?.SETTINGS_PANELS || new Set();
  const SETTINGS_TITLES = SETTINGS?.SETTINGS_TITLES || {};

  const SETTINGS_NAV = [
    { id: 'configuracoes-operador', label: 'Empresa' },
    { id: 'informacoes-adicionais', label: 'Informações adicionais' },
    { id: 'profissionais', label: 'Vendedores' },
    { id: 'usuarios', label: 'Usuários' },
    { id: 'plano-uso', label: 'Plano e Uso' },
    { id: 'auditoria', label: 'Auditoria' },
    { id: 'whatsapp-api', label: 'WhatsApp API' },
  ];

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'leads', label: 'Leads', icon: '🎯' },
    { id: 'conversas', label: 'Conversas', iconSvg: 'whatsapp' },
    { id: 'central-respostas', label: 'Central de Respostas', icon: '↩️' },
    { id: 'campanhas', label: 'Campanhas', icon: '📋' },
    { id: 'automacao', label: 'Automação', icon: '🤖' },
    { id: 'followup', label: 'Follow-up', icon: '📞', badge: 4 },
    { id: 'pipeline', label: 'Pipeline', icon: '📈' },
    { id: 'clientes', label: 'Clientes', icon: '👥' },
    { id: 'propostas', label: 'Propostas', icon: '💰' },
    { id: 'relatorios', label: 'Relatórios', icon: '📊' },
    { id: 'engage-config', label: 'Engage Config', icon: '☀️' },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: '⚙️',
      group: true,
      subNav: SETTINGS_NAV,
    },
  ];

  const PANEL_TITLES = {
    dashboard: 'Dashboard',
    leads: 'Leads',
    conversas: 'Conversas',
    'central-respostas': 'Central de Respostas',
    campanhas: 'Dashboard de campanhas',
    automacao: 'Automação',
    followup: 'Follow-up',
    pipeline: 'Pipeline',
    clientes: 'Clientes',
    propostas: 'Propostas',
    relatorios: 'Relatórios',
    'engage-config': 'Engage Config',
    ...SETTINGS_TITLES,
  };

  function isSettingsPanel(panelId) {
    return SETTINGS_PANELS.has(panelId);
  }

  function isConfigNavOpen(panelId) {
    return panelId === 'configuracoes' || isSettingsPanel(panelId);
  }

  function renderNavGroup(item, isOpen) {
    const subNav = item.subNav || [];
    const sub = subNav
      .map(
        (subItem) => `
        <button type="button" class="es-nav-item es-nav-subitem${subItem.id === state.panel ? ' is-active' : ''}" data-es-nav="${subItem.id}">
          <span class="es-nav-subitem-dot" aria-hidden="true"></span>
          <span class="es-nav-label">${escapeHtml(subItem.label)}</span>
        </button>`,
      )
      .join('');

    const groupClass = item.groupClass ? ` ${item.groupClass}` : '';
    const parentActive =
      item.id === 'configuracoes'
        ? isOpen && (state.panel === 'configuracoes' || isSettingsPanel(state.panel))
        : item.id === state.panel;

    return `
      <div class="es-nav-group${groupClass}" data-open="${isOpen ? 'true' : 'false'}">
        <button type="button" class="es-nav-item es-nav-group-trigger${parentActive ? ' is-active' : ''}" data-es-nav-toggle="${item.id}" aria-expanded="${isOpen ? 'true' : 'false'}">
          <span class="es-nav-icon" aria-hidden="true">${renderNavIcon(item)}</span>
          <span class="es-nav-label">${escapeHtml(item.label)}</span>
          <svg class="es-nav-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="es-nav-sublist" role="group" aria-label="${escapeHtml(item.label)}">${sub}</div>
      </div>`;
  }

  const botInbox = () => window.ReservaAiBotInbox;
  const state = {
    panel: 'dashboard',
    data: null,
    session: null,
    botInboxReady: false,
    inboxUnread: 0,
    inboxStatsReady: false,
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

  function renderNavIcon(item) {
    if (item?.iconSvg && NAV_ICON_SVGS[item.iconSvg]) {
      return NAV_ICON_SVGS[item.iconSvg];
    }
    return escapeHtml(item?.icon || '');
  }

  function formatNumber(value) {
    return Number(value).toLocaleString('pt-BR');
  }

  function sparklineSvg(points, color) {
    const w = 110;
    const h = 40;
    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;
    const step = w / (points.length - 1);
    const coords = points
      .map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * (h - 8) - 4;
        return `${x},${y}`;
      })
      .join(' ');
    return `<svg class="es-sparkline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/></svg>`;
  }

  function renderNav() {
    const nav = qs('#esNav');
    if (!nav) return;

    const configOpen = isConfigNavOpen(state.panel);

    const mainItems = NAV.map((item) => {
      if (!item.group) {
        const active = item.id === state.panel;
        const navExtra = item.id === 'engage-config' ? ' es-nav-item--engage-config' : '';
        let navBadge = '';
        if (item.id === 'conversas') {
          if (state.inboxStatsReady && state.inboxUnread > 0) {
            navBadge = `<span class="es-nav-badge">${state.inboxUnread > 99 ? '99+' : state.inboxUnread}</span>`;
          }
        } else if (item.badge) {
          navBadge = `<span class="es-nav-badge">${item.badge}</span>`;
        }
        return `
      <button type="button" class="es-nav-item${navExtra}${active ? ' is-active' : ''}" data-es-nav="${item.id}">
        <span class="es-nav-icon" aria-hidden="true">${renderNavIcon(item)}</span>
        <span class="es-nav-label">${escapeHtml(item.label)}</span>
        ${navBadge}
      </button>`;
      }

      return renderNavGroup(item, configOpen);
    }).join('');

    nav.innerHTML = mainItems;

    nav.querySelectorAll('[data-es-nav]').forEach((button) => {
      button.addEventListener('click', () => activatePanel(button.dataset.esNav));
    });

    nav.querySelectorAll('[data-es-nav-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const group = button.closest('.es-nav-group');
        const open = group?.getAttribute('data-open') === 'true';
        if (group) group.setAttribute('data-open', open ? 'false' : 'true');
        button.setAttribute('aria-expanded', open ? 'false' : 'true');
        const toggleId = button.dataset.esNavToggle;
        if (!open && !isSettingsPanel(state.panel) && toggleId === 'configuracoes') {
          activatePanel('configuracoes-operador');
        }
      });
    });
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 960px)').matches;
  }

  function setMobileNav(open) {
    const app = qs('.es-app');
    const scrim = qs('#esNavScrim');
    const toggle = qs('#esMobileToggle');
    if (!app) return;
    const next = open ? 'open' : 'closed';
    app.dataset.mobileNav = next;
    document.body.classList.toggle('es-mobile-nav-open', open && isMobileViewport());
    if (scrim) scrim.hidden = !open || !isMobileViewport();
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    }
  }

  function closeMobileNav() {
    setMobileNav(false);
  }

  function openMobileNav() {
    if (isMobileViewport()) setMobileNav(true);
  }

  function updateMobileTitle(panelId) {
    const title = qs('#esMobileTitle');
    if (!title) return;
    title.textContent = PANEL_TITLES[panelId] || panelId || 'Engage Solar';
  }

  function activatePanel(panelId) {
    state.panel = panelId;
    document.body.dataset.esPanelActive = panelId;
    updateMobileTitle(panelId);
    closeMobileNav();
    document.body.classList.toggle('es-mode-settings', isSettingsPanel(panelId));
    renderNav();

    document.querySelectorAll('[data-es-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.esPanel !== panelId;
    });

    const heroTitle = qs('#esHeroTitle');
    const heroSub = qs('#esHeroSubtitle');
    const pageHeading = qs('#esPageHeading');
    if (pageHeading) {
      pageHeading.hidden = panelId === 'conversas' || panelId === 'central-respostas' || panelId === 'engage-config' || panelId === 'clientes' || panelId === 'campanhas' || isSettingsPanel(panelId);
    }

    if (panelId === 'dashboard') {
      if (heroTitle) heroTitle.textContent = 'Dashboard';
      if (heroSub) heroSub.textContent = 'Visão geral do seu negócio solar';
    } else if (panelId === 'conversas') {
      if (heroTitle) heroTitle.textContent = 'Conversas';
      if (heroSub) heroSub.textContent = 'Inbox WhatsApp — mensagens e IA';
    } else if (panelId === 'engage-config') {
      if (heroTitle) heroTitle.textContent = 'Engage Config';
      if (heroSub) heroSub.textContent = 'Configuração da plataforma Engage Solar';
      window.EngageConfig?.activate?.(state.session);
    } else if (isSettingsPanel(panelId)) {
      const title = PANEL_TITLES[panelId] || panelId;
      if (heroTitle) heroTitle.textContent = title;
      if (heroSub) heroSub.textContent = 'Configurações da empresa e integrações';
      SETTINGS?.activateSettingsPanel?.(panelId, state.session);
    } else if (panelId === 'clientes') {
      const title = PANEL_TITLES[panelId] || panelId;
      if (heroTitle) heroTitle.textContent = title;
      if (heroSub) heroSub.textContent = 'CRM de contatos conectado ao NeuraFlow';
      window.ReservaAiClientsAdmin?.activate?.(state.session);
    } else if (panelId === 'campanhas') {
      const title = PANEL_TITLES[panelId] || panelId;
      if (heroTitle) heroTitle.textContent = title;
      if (heroSub) heroSub.textContent = 'Volume de mensagens e estado operacional das campanhas (ledger Engage).';
      window.ReservaAiEngageCampaignsAdmin?.activate?.(state.session);
    } else if (panelId === 'central-respostas') {
      const title = PANEL_TITLES[panelId] || panelId;
      if (heroTitle) heroTitle.textContent = title;
      if (heroSub) heroSub.textContent = 'Acompanhe todas as respostas das suas campanhas em um só lugar.';
      window.ReservaAiEngageRepliesCenterAdmin?.activate?.(state.session);
    } else {
      const title = PANEL_TITLES[panelId] || panelId;
      if (heroTitle) heroTitle.textContent = title;
      if (heroSub) heroSub.textContent = `Módulo ${title} — em breve`;
    }

    if (!isSettingsPanel(panelId)) {
      SETTINGS?.deactivateAllSettingsPanels?.();
    }
    if (panelId !== 'clientes') {
      window.ReservaAiClientsAdmin?.deactivate?.();
    }
    if (panelId !== 'engage-config') {
      window.EngageConfig?.deactivate?.();
    }
    if (panelId !== 'campanhas') {
      window.ReservaAiEngageCampaignsAdmin?.deactivate?.();
    }
    if (panelId !== 'central-respostas') {
      window.ReservaAiEngageRepliesCenterAdmin?.deactivate?.();
    }

    const inbox = botInbox();
    if (inbox) {
      if (panelId === 'conversas') {
        inbox.activate(state.session);
      } else {
        inbox.deactivate();
      }
    }
  }

  function renderKpis(kpis) {
    const mount = qs('#esKpiGrid');
    if (!mount || !Array.isArray(kpis)) return;

    mount.innerHTML = kpis
      .map(
        (kpi) => `
      <article class="es-kpi-card">
        <span class="es-kpi-icon" data-color="${escapeHtml(kpi.color)}" aria-hidden="true">${KPI_ICONS[kpi.icon] || '📊'}</span>
        <p class="es-kpi-label">${escapeHtml(kpi.label)}</p>
        <strong>${escapeHtml(kpi.value)}</strong>
        <span class="es-kpi-delta">${escapeHtml(kpi.delta)}</span>
      </article>
    `,
      )
      .join('');
  }

  function renderPipeline(pipeline, conversion) {
    const mount = qs('#esPipeline');
    if (!mount || !Array.isArray(pipeline)) return;

    mount.innerHTML = `
      <div class="es-funnel">
        ${pipeline
          .map(
            (row, index) => `
          <div class="es-funnel-row">
            <div class="es-funnel-track">
              <div class="es-funnel-bar" style="width:${FUNNEL_WIDTHS[index]}%;opacity:${1 - index * 0.06}">${escapeHtml(row.stage)}</div>
            </div>
            <div class="es-funnel-meta">
              <strong>${row.count}</strong>
              <span>${escapeHtml(row.pct)}</span>
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
      <span class="es-funnel-pill">Taxa de conversão geral: ${escapeHtml(conversion)}</span>
    `;
  }

  function renderWhatsapp(wa) {
    const mount = qs('#esWhatsapp');
    if (!mount || !wa) return;

    mount.innerHTML = `
      <div class="es-wa-stats">
        <div class="es-wa-stat"><span>Mensagens Enviadas</span><strong>${escapeHtml(wa.sent)}</strong></div>
        <div class="es-wa-stat"><span>Entregues</span><strong>${escapeHtml(wa.delivered)}</strong></div>
        <div class="es-wa-stat"><span>Lidas</span><strong>${escapeHtml(wa.read)}</strong></div>
        <div class="es-wa-stat"><span>Respondidas</span><strong>${escapeHtml(wa.replied)}</strong></div>
      </div>
      <div class="es-wa-footer">
        <div>
          <span class="es-kpi-label">Taxa de Resposta</span>
          <strong>${wa.responseRate}%</strong>
          <span class="es-kpi-delta">${escapeHtml(wa.responseDelta)}</span>
        </div>
        ${sparklineSvg([42, 48, 45, 52, 55, 58, wa.responseRate], '#22C55E')}
      </div>
    `;
  }

  function renderInsights(insights) {
    const mount = qs('#esInsights');
    if (!mount || !Array.isArray(insights)) return;

    mount.innerHTML = insights
      .map(
        (item) => `
      <div class="es-insight" data-tone="${escapeHtml(item.tone)}">
        <span class="es-insight-icon" aria-hidden="true">${INSIGHT_ICONS[item.tone] || '•'}</span>
        <div class="es-insight-body">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.desc)}</span>
        </div>
        <a href="#" class="es-insight-link">${escapeHtml(item.link)} →</a>
      </div>
    `,
      )
      .join('');
  }

  function renderCampaigns(campaigns) {
    const mount = qs('#esCampaigns');
    if (!mount || !Array.isArray(campaigns)) return;

    mount.innerHTML = campaigns
      .map(
        (c) => `
      <article class="es-campaign">
        <div class="es-campaign-head">
          <h3>${escapeHtml(c.name)}</h3>
          <span class="es-campaign-status">${escapeHtml(c.status)}</span>
        </div>
        <div class="es-campaign-metrics">
          <div><span>Enviados</span><strong>${formatNumber(c.sent)}</strong></div>
          <div><span>Respondidos</span><strong>${formatNumber(c.replied)}</strong></div>
          <div><span>Agendamentos</span><strong>${c.appointments}</strong></div>
          <div><span>Vendas</span><strong>${c.sales}</strong></div>
        </div>
        <div class="es-campaign-progress" aria-hidden="true"><span style="width:${c.progress}%"></span></div>
        <p class="es-campaign-budget">Orçamento: ${escapeHtml(c.budget)}</p>
      </article>
    `,
      )
      .join('');
  }

  function renderSellers(sellers) {
    const mount = qs('#esSellers');
    if (!mount || !Array.isArray(sellers)) return;

    mount.innerHTML = sellers
      .map((seller, index) => {
        const rank = seller.medal
          ? `<span class="es-seller-medal">${MEDALS[seller.medal]}</span>`
          : `<span class="es-seller-rank">${index + 1}</span>`;
        return `
      <div class="es-seller">
        ${rank}
        <span class="es-seller-avatar" aria-hidden="true">${escapeHtml(seller.initials)}</span>
        <div class="es-seller-info">
          <strong>${escapeHtml(seller.name)}</strong>
          <span>${seller.proposals} propostas · ${seller.sales} vendas</span>
        </div>
        <span class="es-seller-revenue">${escapeHtml(seller.revenue)}</span>
      </div>
    `;
      })
      .join('');
  }

  function renderFinance(finance, goal) {
    const mount = qs('#esFinance');
    if (!mount) return;

    const blocks = Array.isArray(finance)
      ? finance
      : [
          { label: 'Valor em Pipeline', value: finance.pipeline, color: '#2563EB', spark: [620, 700, 750, 800, 842] },
          { label: 'Propostas Abertas', value: finance.openProposals, color: '#F97316', spark: [240, 270, 290, 305, 312] },
          { label: 'Faturamento do Mês', value: finance.closedMonth, color: '#22C55E', spark: [120, 150, 175, 200, 212] },
        ];

    mount.innerHTML = `
      ${blocks
        .map(
          (block) => `
        <div class="es-finance-block">
          <div>
            <span>${escapeHtml(block.label)}</span>
            <strong>${escapeHtml(block.value)}</strong>
          </div>
          ${sparklineSvg(block.spark || [1, 2, 3, 4, 5], block.color)}
        </div>
      `,
        )
        .join('')}
      <div class="es-goal">
        <div class="es-goal-head">
          <span>Meta do mês: ${escapeHtml(goal.goal)}</span>
          <strong>${goal.pct}%</strong>
        </div>
        <div class="es-goal-bar" aria-hidden="true"><span style="width:${goal.pct}%"></span></div>
        <p class="es-goal-pct">${goal.pct}% da meta</p>
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
    renderFinance(data.finance, data.financeGoal);
  }

  async function loadData() {
    const response = await fetch('./data/mock-dashboard.json');
    if (!response.ok) {
      throw window.EngageUserMessages?.buildHttpError
        ? window.EngageUserMessages.buildHttpError(response.status, null, { context: 'dashboard' })
        : new Error('Não foi possível carregar o painel. Tente novamente.');
    }
    state.data = await response.json();
    renderDashboard(state.data);
  }

  function bindChrome() {
    qs('#esSidebarToggle')?.addEventListener('click', () => {
      const app = qs('.es-app');
      if (!app) return;
      app.dataset.sidebar = app.dataset.sidebar === 'collapsed' ? 'expanded' : 'collapsed';
    });

    qs('#esMobileToggle')?.addEventListener('click', () => {
      const app = qs('.es-app');
      if (!app) return;
      setMobileNav(app.dataset.mobileNav !== 'open');
    });

    qs('#esNavScrim')?.addEventListener('click', closeMobileNav);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMobileNav();
    });

    window.addEventListener('resize', () => {
      if (!isMobileViewport()) closeMobileNav();
    });
  }

  function toDisplayInitials(raw) {
    const name = String(raw || '').trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase() || '?';
  }

  function formatPermissionGroupLabel(group) {
    const auth = window.EngageSolarAuth;
    if (auth?.formatTenantRoleLabel) {
      const label = auth.formatTenantRoleLabel(group);
      if (label) return label;
    }
    const key = String(group || '').trim().toLowerCase();
    const labels = {
      owner: 'Proprietário',
      admin: 'Administrador',
      platform_admin: 'Administrador da plataforma',
      operator: 'Operador',
      operador: 'Operador',
      professional: 'Profissional',
      profissional: 'Profissional',
    };
    return labels[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '');
  }

  function resolveSessionRoleForDisplay(session) {
    return String(session?.tenantRole || session?.permissionGroup || '').trim();
  }

  function resolveSessionTenantName(session) {
    if (!session || typeof session !== 'object') return 'Engage Solar';

    const tenantId = window.ReservaPermissions?.resolveEffectiveTenantId
      ? window.ReservaPermissions.resolveEffectiveTenantId(session)
      : String(session.activeTenantId || session.tenantId || '').trim();
    const tenants = Array.isArray(session.tenants) ? session.tenants : [];

    const pickName = (row) => String(
      row?.name || row?.tenantName || row?.legalName || row?.tradeName || '',
    ).trim();

    if (tenantId && tenants.length) {
      const match = tenants.find((row) => String(row?.id || row?.tenantId || '').trim() === tenantId);
      const fromMembership = pickName(match);
      if (fromMembership) return fromMembership;
    }

    const fromTenantObject = pickName(session.tenant);
    if (fromTenantObject) return fromTenantObject;

    const storedName = String(session.tenantName || '').trim();
    if (storedName) return storedName;

    const preferredName = window.ReservaAiAuth?.getPreferredLoginTenantName?.() || '';
    if (preferredName) return preferredName;

    return 'Engage Solar';
  }

  function resolveAvatarMediaUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.startsWith('data:image')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    const gateway = String(window.RESERVAAI_GATEWAY_URL || '').trim().replace(/\/$/, '');
    const origin = String(window.location?.origin || '').replace(/\/$/, '');
    const base = gateway || origin;
    if (value.startsWith('/') && base) return `${base}${value}`;
    return value;
  }

  function toAvatarDataUrlFromRawBase64(rawValue) {
    const compact = String(rawValue || '').trim();
    if (!compact || compact.startsWith('data:image')) {
      return compact.startsWith('data:image') ? compact : '';
    }
    let mime = 'image/jpeg';
    if (compact.startsWith('iVBOR')) mime = 'image/png';
    else if (compact.startsWith('R0lGOD')) mime = 'image/gif';
    else if (compact.startsWith('UklGR')) mime = 'image/webp';
    if (/^[A-Za-z0-9+/=_-]+$/.test(compact.replace(/\s+/g, '')) && compact.replace(/\s+/g, '').length > 48) {
      return `data:${mime};base64,${compact}`;
    }
    return '';
  }

  function pickSessionAvatarSrc(session) {
    if (!session || typeof session !== 'object') return '';
    const candidates = [
      session.avatarBase64,
      session.avatarViewUrl,
      session.avatarUrl,
      session.picture,
      session.photoUrl,
    ];
    for (const item of candidates) {
      const raw = String(item || '').trim();
      if (!raw) continue;
      const resolved = resolveAvatarMediaUrl(raw);
      if (resolved && (resolved.startsWith('data:image') || /^https?:\/\//i.test(resolved) || resolved.startsWith('/'))) {
        return resolved;
      }
      const dataUrl = toAvatarDataUrlFromRawBase64(raw);
      if (dataUrl) return dataUrl;
    }
    return '';
  }

  function extractOperatorUserPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.data && typeof payload.data === 'object') return payload.data;
    return payload;
  }

  async function enrichSessionWithUserProfile(session) {
    const api = window.EngageSolarApi || window.ReservaAiApi;
    if (!session || !api?.request) return session;

    const userId = String(session.id || session.neuraFlowUserId || '').trim();
    let profile = null;

    if (userId) {
      try {
        const payload = await api.request(`/api/operator/users/${encodeURIComponent(userId)}`);
        profile = extractOperatorUserPayload(payload);
      } catch (_error) {
        /* noop */
      }
    }

    if (!profile?.avatarUrl && !profile?.avatarViewUrl && !profile?.avatarBase64) {
      try {
        const me = await api.request('/api/operator/auth/me');
        profile = { ...(profile || {}), ...(me && typeof me === 'object' ? me : {}) };
      } catch (_error) {
        /* noop */
      }
    }

    if (!profile) return session;

    return {
      ...session,
      avatarUrl: String(profile.avatarUrl || session.avatarUrl || '').trim(),
      avatarViewUrl: String(profile.avatarViewUrl || profile.avatarUrl || session.avatarViewUrl || '').trim(),
      avatarBase64: String(profile.avatarBase64 || session.avatarBase64 || '').trim(),
    };
  }

  let headerAvatarObjectUrl = '';

  function revokeHeaderAvatarObjectUrl() {
    if (headerAvatarObjectUrl) {
      URL.revokeObjectURL(headerAvatarObjectUrl);
      headerAvatarObjectUrl = '';
    }
  }

  async function resolveDisplayAvatarUrl(session) {
    const photo = pickSessionAvatarSrc(session);
    if (!photo) return '';

    if (photo.startsWith('data:image')) return photo;

    const token = session?.externalAccessToken || window.ReservaAiAuth?.getAccessToken?.() || '';
    const origin = String(window.location?.origin || '').replace(/\/$/, '');
    const isProtectedApiPath = (url) => url.startsWith('/api/') || (origin && url.startsWith(`${origin}/api/`));

    if (!isProtectedApiPath(photo) && /^https?:\/\//i.test(photo)) {
      return photo;
    }

    if (!token) {
      return isProtectedApiPath(photo) ? '' : photo;
    }

    const fetchCandidates = [];
    if (photo.startsWith('/')) {
      fetchCandidates.push(`${origin}${photo}`);
      if (photo.includes('/users/') && !photo.startsWith('/api/security')) {
        const tail = photo.replace(/^\/api\/operator/, '');
        if (tail.startsWith('/users/')) {
          fetchCandidates.push(`${origin}/api/security${tail}`);
        }
      }
    } else if (/^https?:\/\//i.test(photo)) {
      fetchCandidates.push(photo);
    }

    for (const url of fetchCandidates) {
      try {
        const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (!response.ok) continue;
        const blob = await response.blob();
        if (!blob.size) continue;
        revokeHeaderAvatarObjectUrl();
        headerAvatarObjectUrl = URL.createObjectURL(blob);
        return headerAvatarObjectUrl;
      } catch (_error) {
        /* noop */
      }
    }

    return isProtectedApiPath(photo) ? '' : photo;
  }

  async function applyHeaderAvatar(session) {
    const img = qs('#esProfileAvatarImg');
    const initialsEl = qs('#esProfileAvatarInitials');
    if (!initialsEl) return;

    const displayName = session?.displayName || session?.fullName || session?.username || '';
    const initials = toDisplayInitials(displayName);

    const showInitials = () => {
      revokeHeaderAvatarObjectUrl();
      if (img) {
        img.hidden = true;
        img.removeAttribute('src');
      }
      initialsEl.hidden = false;
      initialsEl.textContent = initials;
    };

    const photo = await resolveDisplayAvatarUrl(session);
    if (!photo || !img) {
      showInitials();
      return;
    }

    img.onload = () => {
      img.hidden = false;
      initialsEl.hidden = true;
    };
    img.onerror = showInitials;
    img.alt = displayName ? `Foto de ${displayName}` : '';
    img.src = photo;
    if (img.complete && img.naturalWidth > 0) {
      img.hidden = false;
      initialsEl.hidden = true;
    }
  }

  async function applySessionToChrome(session) {
    const displayName = session?.displayName || session?.fullName || session?.username || 'Administrador';
    const tenantName = resolveSessionTenantName(session);
    const roleLabel = formatPermissionGroupLabel(resolveSessionRoleForDisplay(session));
    const email = session?.email || session?.username || '';

    const nameEl = qs('#esUserName');
    const roleEl = qs('#esUserRole');
    const avatarEl = qs('#esUserAvatar');
    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = tenantName;
    if (avatarEl) avatarEl.textContent = toDisplayInitials(displayName);

    const profileName = qs('#esProfileDisplayName');
    const profileRole = qs('#esProfileRole');
    const profileMeta = qs('#esProfileMenuMeta');
    if (profileName) profileName.textContent = displayName;
    if (profileRole) profileRole.textContent = roleLabel;
    if (profileMeta) {
      profileMeta.textContent = email ? `${tenantName} · ${email}` : tenantName;
    }

    await applyHeaderAvatar(session);

    const tenantBtn = qs('.es-selector:not(.es-selector--lang) .es-selector-label');
    if (tenantBtn) tenantBtn.textContent = tenantName;
  }

  function bindProfileMenu() {
    const btn = qs('#esProfileMenuBtn');
    const menu = qs('#esProfileMenu');
    if (!btn || !menu) return;

    const close = () => {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    };

    const open = () => {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    };

    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (menu.hidden) open();
      else close();
    });

    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = event.target.closest('[data-es-profile-action]');
      if (!item) return;
      const action = item.getAttribute('data-es-profile-action');
      if (action === 'logout') {
        close();
        void performLogout();
        return;
      }
      close();
    });

    document.addEventListener('click', (event) => {
      if (menu.hidden) return;
      if (menu.contains(event.target) || btn.contains(event.target)) return;
      close();
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  async function performLogout() {
    const auth = window.EngageSolarAuth;
    if (auth) await auth.logout();
    window.location.replace('/login.html');
  }

  function bindLogout() {
    qs('#esLogoutBtn')?.addEventListener('click', () => {
      void performLogout();
    });
  }

  async function init() {
    const auth = window.EngageSolarAuth;
    if (auth) {
      state.session = await auth.requireAuth();
      if (!state.session) return;
      if (auth.enrichSessionFromAuthMe) {
        state.session = await auth.enrichSessionFromAuthMe(state.session);
      }
      state.session = await enrichSessionWithUserProfile(state.session);
      await applySessionToChrome(state.session);
      bindLogout();
    }

    const inbox = botInbox();
    if (inbox && auth && state.session) {
      inbox.init({ authService: auth, session: state.session });
      state.botInboxReady = true;
      if (inbox.refreshUnreadBadge) {
        void inbox.refreshUnreadBadge();
      }
    }

    if (SETTINGS && state.session) {
      SETTINGS.initSettingsModules(state.session);
    }

    bindChrome();
    bindProfileMenu();
    renderNav();
    activatePanel('dashboard');
    try {
      await loadData();
    } catch (error) {
      const grid = qs('#esKpiGrid');
      const friendly = window.EngageUserMessages?.formatCatchError
        ? window.EngageUserMessages.formatCatchError(error, { context: 'dashboard' })
        : (error?.message || 'Não foi possível carregar o painel.');
      if (grid) grid.innerHTML = `<div class="es-placeholder">${escapeHtml(friendly)}</div>`;
    }
  }

  window.addEventListener('reserva:inbox-stats', (event) => {
    const totalUnread = Number(event?.detail?.totalUnread);
    state.inboxUnread = Number.isFinite(totalUnread) && totalUnread >= 0 ? totalUnread : 0;
    state.inboxStatsReady = true;
    renderNav();
  });

  document.addEventListener('DOMContentLoaded', init);
})();
