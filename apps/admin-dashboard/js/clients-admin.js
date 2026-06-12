/**
 * Módulo Clientes — NeuraFlow via /api/operator/customers
 */
(function () {
  const CLIENTS_PAGE_SIZE = 40;

  const SOLAR_PIPELINE_STAGE_LABELS = {
    NEW: 'Novo',
    QUALIFIED: 'Qualificado',
    SIMULATED: 'Simulado',
    PROPOSAL_SENT: 'Proposta enviada',
    NEGOTIATION: 'Em negociação',
    WON: 'Fechado',
    LOST: 'Perdido',
    DEFERRED: 'Adiado',
  };

  const LIFECYCLE_STATUS_LABELS = {
    LEAD: 'Lead',
    CLIENT: 'Cliente',
    INACTIVE: 'Inativo',
  };

  const state = {
    mounted: false,
    active: false,
    session: null,
    selectedTenantId: '',
    rows: [],
    selectedCustomerId: '',
    searchTerm: '',
    dateField: 'updatedAt',
    dateFrom: '',
    dateTo: '',
    sortBy: 'updatedAt',
    sortDir: 'desc',
    loading: false,
    loadingMore: false,
    error: '',
    nextCursor: '',
    hasMore: false,
    loadGen: 0,
    dashboardData: null,
    dashboardLoading: false,
    dashboardError: '',
    dashboardTab: 'simulations',
    shellView: 'lista',
    avatarById: {},
    avatarHydrationInFlight: new Set(),
    editorMode: 'create',
    editorCustomerId: '',
    editorOriginal: null,
    editorGlobalBound: false,
    dom: {},
  };

  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const escapeAttr = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const qs = (selector) => document.querySelector(selector);

  const getApi = () => {
    const api = window.ReservaAiApi || window.EngageSolarApi;
    return api && typeof api.request === 'function' ? api : null;
  };

  const resolveTenantId = () => {
    if (window.ReservaPermissions?.resolveEffectiveTenantId) {
      return window.ReservaPermissions.resolveEffectiveTenantId(state.session);
    }
    return String(state.session?.activeTenantId || state.session?.tenantId || '').trim();
  };

  const isPlatformAdmin = () => window.ReservaPermissions?.isPlatformAdminSession?.(state.session) === true;

  const getTenantOptions = () => {
    const tenants = Array.isArray(state.session?.tenants) ? state.session.tenants : [];
    const options = tenants
      .map((tenant) => ({
        id: String(tenant?.id || tenant?.tenantId || '').trim(),
        name: String(tenant?.name || tenant?.tenantName || tenant?.legalName || 'Empresa').trim(),
      }))
      .filter((item) => item.id);
    const fallbackId = resolveTenantId();
    const fallbackName = String(state.session?.tenantName || state.session?.tenant?.name || 'Empresa').trim();
    if (fallbackId && !options.some((item) => item.id === fallbackId)) {
      options.unshift({ id: fallbackId, name: fallbackName || fallbackId });
    }
    return options;
  };

  const unwrapArray = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const nested = payload.data ?? payload.items ?? payload.customers ?? payload.results ?? payload.rows;
    return Array.isArray(nested) ? nested : [];
  };

  const pickNextCursor = (payload) => {
    if (!payload || typeof payload !== 'object') return '';
    const direct = payload.nextCursor ?? payload.next_cursor ?? payload?.meta?.nextCursor ?? payload?.pagination?.nextCursor;
    return direct ? String(direct) : '';
  };

  const pickCustomerDisplayName = (customer, fallback = 'Cliente') => {
    const full = String(customer?.fullName || '').trim();
    if (full) return full;
    const preferred = String(customer?.preferredName || '').trim();
    if (preferred) return preferred;
    return fallback;
  };

  const getClientInitial = (client) => {
    const name = String(client?.fullName || client?.preferredName || '?').trim();
    return (name[0] || '?').toUpperCase();
  };

  const resolveAvatarMediaUrl = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.startsWith('data:image')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    const gateway = String(window.RESERVAAI_GATEWAY_URL || '').trim().replace(/\/$/, '');
    const origin = String(window.location?.origin || '').replace(/\/$/, '');
    const base = gateway || origin;
    if (value.startsWith('/') && base) return `${base}${value}`;
    return value;
  };

  const toAvatarDataUrlFromRawBase64 = (rawValue) => {
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
  };

  const pickAvatarStringFromCustomerRecord = (record) => {
    if (!record || typeof record !== 'object') return '';
    const rawAvatar = record.avatar;
    const fromAvatarObject = rawAvatar && typeof rawAvatar === 'object'
      ? (rawAvatar.url || rawAvatar.src || rawAvatar.href || '')
      : (typeof rawAvatar === 'string' ? rawAvatar : '');
    const picked = String(
      fromAvatarObject
      || record.clientAvatar
      || record.avatarViewUrl
      || record.avatarUrl
      || record.avatarBase64
      || record.photo
      || record.photoUrl
      || record.picture
      || record.image
      || record.profilePicture
      || record.profileImage
      || '',
    ).trim();
    return resolveAvatarMediaUrl(picked) || toAvatarDataUrlFromRawBase64(picked);
  };

  const unwrapCustomerDetailPayload = (detail) => {
    if (!detail || typeof detail !== 'object') return null;
    const d = detail.data;
    if (d && typeof d === 'object') {
      if (d.customer && typeof d.customer === 'object') return d.customer;
      return d;
    }
    if (detail.customer && typeof detail.customer === 'object') return detail.customer;
    return detail;
  };

  const getClientAvatarSrc = (client) => {
    const id = String(client?.id || '').trim();
    const candidates = [
      id ? state.avatarById[id] : '',
      client?.clientAvatar,
      client?.avatarUrl,
      client?.avatar,
      client?.avatarViewUrl,
      client?.avatarBase64,
      client?.photo,
      client?.photoUrl,
      client?.picture,
      client?.image,
      client?.profilePicture,
      client?.profileImage,
    ];
    for (const item of candidates) {
      const value = String(item || '').trim();
      if (!value) continue;
      const resolved = resolveAvatarMediaUrl(value);
      if (resolved && (resolved.startsWith('data:image') || /^https?:\/\//i.test(resolved))) {
        return resolved;
      }
      const dataUrl = toAvatarDataUrlFromRawBase64(value);
      if (dataUrl) return dataUrl;
    }
    return pickAvatarStringFromCustomerRecord(client);
  };

  const cacheCustomerAvatar = (customerId, customer) => {
    const id = String(customerId || '').trim();
    if (!id || !customer) return;
    const avatar = pickAvatarStringFromCustomerRecord(customer);
    if (avatar) state.avatarById[id] = avatar;
  };

  async function hydrateClientAvatar(customerId, tenantId) {
    const id = String(customerId || '').trim();
    const tid = String(tenantId || '').trim();
    if (!id || !tid || state.avatarHydrationInFlight.has(id) || state.avatarById[id]) return;
    state.avatarHydrationInFlight.add(id);
    const api = getApi();
    try {
      if (!api) return;
      const detail = await api.request(`/api/operator/customers/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tid)}`);
      const customer = unwrapCustomerDetailPayload(detail);
      const avatarCandidate = pickAvatarStringFromCustomerRecord(customer || {});
      if (avatarCandidate) state.avatarById[id] = avatarCandidate;
    } catch (_error) {
      /* ignore */
    } finally {
      state.avatarHydrationInFlight.delete(id);
    }
  }

  async function hydrateClientsListAvatars() {
    const tenantId = resolveTenantId();
    if (!tenantId || !state.rows.length) return;
    const targets = state.rows
      .map((item) => String(item?.id || '').trim())
      .filter((id) => id && !state.avatarById[id])
      .slice(0, 12);
    if (!targets.length) return;
    await Promise.all(targets.map((id) => hydrateClientAvatar(id, tenantId)));
    renderRows();
    renderDashboard();
  }

  const formatClientsDate = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
  };

  const formatClientsCurrency = (value) => {
    const amount = Number(value || 0);
    return Number.isFinite(amount)
      ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'R$ 0,00';
  };

  const formatClientsCurrencyOptional = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatKwh = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    return `${amount.toLocaleString('pt-BR')} kWh`;
  };

  const formatClientsDateTime = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
  };

  const formatLifecycleLabel = (status) => {
    const key = String(status || '').trim().toUpperCase();
    return LIFECYCLE_STATUS_LABELS[key] || (key || '—');
  };

  const formatPipelineStageLabel = (stage, fallbackLabel) => {
    const label = String(fallbackLabel || '').trim();
    if (label) return label;
    const key = String(stage || '').trim().toUpperCase();
    return SOLAR_PIPELINE_STAGE_LABELS[key] || (key || '—');
  };

  const buildSolarFallbackDashboard = (customer) => ({
    profile: 'solar',
    pendingSolarApi: true,
    customer: customer && typeof customer === 'object' ? customer : {},
    summary: {
      avgConsumptionKwh: null,
      avgBillAmount: null,
      simulationsTotal: 0,
      pipelineStage: null,
      pipelineStageLabel: null,
      lastConversationAt: customer?.lastSeenAt || null,
      proposalValue: null,
    },
    tabs: {
      simulations: { items: [], total: 0 },
      conversations: { items: [], total: 0 },
      about: {
        internalNote: customer?.notes || null,
        tags: customer?.lifecycleStatus ? [String(customer.lifecycleStatus)] : [],
      },
    },
  });

  const openClientInbox = () => {
    document.querySelector('[data-es-nav="conversas"]')?.click();
  };

  const buildQuery = ({ cursor = '' } = {}) => {
    const tenantId = resolveTenantId();
    if (!tenantId) return '';
    state.selectedTenantId = tenantId;
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    if (state.searchTerm.trim()) params.set('search', state.searchTerm.trim());
    params.set('dateField', state.dateField || 'updatedAt');
    if (state.dateFrom) params.set('dateFrom', state.dateFrom);
    if (state.dateTo) params.set('dateTo', state.dateTo);
    params.set('sortBy', state.sortBy || 'updatedAt');
    params.set('sortDir', state.sortDir || 'desc');
    params.set('limit', String(CLIENTS_PAGE_SIZE));
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  };

  const setFeedback = (message = '', tone = 'neutral') => {
    const el = state.dom.feedback;
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.dataset.tone = 'neutral';
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.dataset.tone = tone;
  };

  const renderTenantSelect = () => {
    const select = state.dom.tenant;
    if (!select) return;
    const options = getTenantOptions();
    if (!state.selectedTenantId) state.selectedTenantId = resolveTenantId();
    select.innerHTML = options.length
      ? options.map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name)}</option>`).join('')
      : '<option value="">Sem empresa</option>';
    select.value = state.selectedTenantId || resolveTenantId();
    select.disabled = !isPlatformAdmin();
  };

  const renderRows = () => {
    const list = state.dom.list;
    if (!list) return;
    if (state.loading) {
      list.innerHTML = '<div class="pro-list-empty clients-pro-empty-loading">Carregando clientes...</div>';
      return;
    }
    if (state.error) {
      list.innerHTML = `<div class="pro-list-empty">${escapeHtml(state.error)}</div>`;
      return;
    }
    if (!state.rows.length) {
      list.innerHTML = '<div class="pro-list-empty">Nenhum cliente encontrado.</div>';
      return;
    }
    const itemsHtml = state.rows.map((client) => {
      const id = String(client?.id || '').trim();
      const isActive = id && id === state.selectedCustomerId;
      const name = pickCustomerDisplayName(client);
      const phone = String(client?.phone || '').trim();
      const email = String(client?.email || '').trim();
      const cityLine = [client?.city, client?.state].filter(Boolean).join('/');
      const lifecycleLabel = formatLifecycleLabel(client?.lifecycleStatus);
      const subtitleParts = [];
      if (cityLine) subtitleParts.push(cityLine);
      else if (phone) subtitleParts.push(phone);
      else if (email) subtitleParts.push(email);
      if (lifecycleLabel && lifecycleLabel !== '—') subtitleParts.push(lifecycleLabel);
      const subtitle = subtitleParts.length ? subtitleParts.join(' · ') : '—';
      const source = String(client?.source || '').trim().toUpperCase();
      const whatsappTag = source === 'WHATSAPP'
        ? '<span class="clients-source-whatsapp" title="Origem WhatsApp"><span class="clients-source-whatsapp-icon" aria-hidden="true"></span>WhatsApp</span>'
        : '';
      const initial = getClientInitial(client);
      const avatarSrc = getClientAvatarSrc({ ...client, id });
      const avatarBlock = avatarSrc
        ? `<span class="operator-pro-avatar clients-pro-item-avatar has-image"><img src="${escapeAttr(avatarSrc)}" alt="${escapeAttr(name)}" loading="lazy" /></span>`
        : `<span class="operator-pro-avatar clients-pro-item-avatar">${escapeHtml(initial)}</span>`;
      return `
        <button type="button"
                class="pro-item clients-pro-item${isActive ? ' is-active' : ''}"
                data-customer-id="${escapeHtml(id)}">
          <span class="pro-item-avatar">${avatarBlock}</span>
          <span class="pro-item-meta">
            <span class="pro-item-name">${escapeHtml(name)}</span>
            <span class="pro-item-role">${escapeHtml(subtitle)}</span>
          </span>
          <span class="clients-pro-item-tag">${whatsappTag}</span>
        </button>
      `;
    }).join('');
    let footer = '';
    if (state.loadingMore) {
      footer = '<div class="pro-list-empty clients-pro-empty-loading clients-pro-load-more">Carregando mais clientes...</div>';
    } else if (state.hasMore) {
      footer = '<div class="pro-list-empty clients-pro-load-more clients-pro-load-more-hint">Role para carregar mais</div>';
    }
    list.innerHTML = itemsHtml + footer;
  };

  const renderSimulationsTab = (simulationsTab) => {
    if (state.dashboardData?.pendingSolarApi) {
      return '<div class="clients-pro-content-empty">Aguardando API solar dashboard.</div>';
    }
    const items = Array.isArray(simulationsTab?.items) ? simulationsTab.items : [];
    if (!items.length) {
      return '<p class="clients-pro-muted">Sem simulações registadas. O cliente pode simular pelo WhatsApp (conta, kWh ou valor em R$).</p>';
    }
    const rows = items.map((item) => {
      const payback = Number(item?.paybackAnos);
      const paybackText = Number.isFinite(payback) ? `${payback.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos` : '—';
      const kwp = Number(item?.sistemaKwp);
      const kwpText = Number.isFinite(kwp) ? `${kwp.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWp` : '—';
      return `
        <tr>
          <td>${escapeHtml(String(item?.mes || '—'))}</td>
          <td>${escapeHtml(formatKwh(item?.consumoKwh))}</td>
          <td>${escapeHtml(formatClientsCurrencyOptional(item?.valor))}</td>
          <td>${escapeHtml(kwpText)}</td>
          <td>${escapeHtml(formatClientsCurrencyOptional(item?.investimento))}</td>
          <td>${escapeHtml(paybackText)}</td>
        </tr>
      `;
    }).join('');
    return `
      <div class="clients-pro-sim-table-wrap">
        <table class="clients-pro-sim-table">
          <thead>
            <tr>
              <th>Mês ref.</th>
              <th>Consumo</th>
              <th>Conta</th>
              <th>Sistema</th>
              <th>Investimento</th>
              <th>Payback</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  };

  const renderConversationsTab = (conversationsTab) => {
    const items = Array.isArray(conversationsTab?.items) ? conversationsTab.items : [];
    if (!items.length) {
      return `
        <div class="clients-pro-conversations-empty">
          <p class="clients-pro-muted">Sem conversas.</p>
          <button type="button" class="clients-pro-secondary-action" data-clients-open-inbox>Abrir inbox</button>
        </div>
      `;
    }
    const rows = items.map((item) => {
      const phone = String(item?.phone || '').trim();
      const lastAt = formatClientsDateTime(item?.lastMessageAt || item?.createdAt);
      const convId = String(item?.id || '').trim();
      const inboxBtn = convId
        ? `<button type="button" class="clients-pro-secondary-action" data-clients-open-inbox="${escapeAttr(convId)}">Abrir inbox</button>`
        : '';
      return `
        <div class="clients-pro-list-row clients-pro-conversation-row">
          <div class="clients-pro-conversation-main">
            <strong class="clients-pro-list-row-title">${escapeHtml(phone || 'Conversa')}</strong>
            <span class="clients-pro-muted">Última mensagem: ${escapeHtml(lastAt)}</span>
          </div>
          ${inboxBtn}
        </div>
      `;
    }).join('');
    return `<div class="clients-pro-list-rows clients-pro-conversation-rows">${rows}</div>`;
  };

  const renderAboutTab = (customer, about, summary) => {
    const facts = [
      { label: 'Documento', value: customer?.document || '—' },
      { label: 'Nascimento', value: customer?.birthDate ? formatClientsDate(customer.birthDate) : '—' },
      { label: 'Gênero', value: customer?.gender || '—' },
      { label: 'Origem', value: customer?.source || '—' },
      { label: 'Estado CRM', value: formatLifecycleLabel(customer?.lifecycleStatus) },
      { label: 'E-mail', value: customer?.email || '—' },
      { label: 'Telefone', value: customer?.phone || '—' },
      { label: 'Empresa', value: customer?.companyName || '—' },
      { label: 'CNPJ', value: customer?.cnpj || '—' },
      { label: 'Site', value: customer?.website || '—' },
    ];
    const addressLine = [
      [customer?.street, customer?.number].filter(Boolean).join(', '),
      customer?.complement,
      customer?.neighborhood,
      [customer?.city, customer?.state].filter(Boolean).join('/'),
      customer?.zipCode ? `CEP ${customer.zipCode}` : '',
    ].filter(Boolean).join(' · ');
    if (addressLine) {
      facts.push({ label: 'Endereço', value: addressLine });
    }
    if (summary?.utilityCompany) {
      facts.push({ label: 'Concessionária', value: summary.utilityCompany });
    }
    if (summary?.installationType) {
      facts.push({ label: 'Tipo instalação', value: summary.installationType });
    }
    if (summary?.salesConsultant?.name || summary?.salesConsultant?.displayName) {
      facts.push({
        label: 'Consultor',
        value: summary.salesConsultant.displayName || summary.salesConsultant.name,
      });
    }
    const factsHtml = facts.map((fact) => `
      <div class="clients-pro-fact">
        <span class="clients-pro-fact-label">${escapeHtml(fact.label)}</span>
        <strong class="clients-pro-fact-value">${escapeHtml(String(fact.value))}</strong>
      </div>
    `).join('');
    const note = String(about?.internalNote || customer?.notes || '').trim();
    const tags = Array.isArray(about?.tags) ? about.tags.filter(Boolean) : [];
    const tagsHtml = tags.length
      ? `<div class="clients-pro-about-tags">${tags.map((tag) => `<span class="clients-pro-section-tag">${escapeHtml(String(tag))}</span>`).join('')}</div>`
      : '';
    return `
      <div class="clients-pro-fact-grid">${factsHtml}</div>
      ${tagsHtml}
      <section class="clients-pro-section">
        <header class="clients-pro-section-head"><strong>Observações</strong></header>
        <p class="clients-pro-note">${note ? escapeHtml(note) : '<span class="clients-pro-muted">Nenhuma observação cadastrada.</span>'}</p>
      </section>
    `;
  };

  const renderDashboardTab = () => {
    const content = state.dom.dashboardContent;
    if (!content) return;
    if (state.dashboardLoading) {
      content.innerHTML = '<div class="clients-pro-content-empty">Carregando detalhes do cliente...</div>';
      return;
    }
    if (state.dashboardError) {
      content.innerHTML = `<div class="clients-pro-content-empty">${escapeHtml(state.dashboardError)}</div>`;
      return;
    }
    if (!state.dashboardData) {
      content.innerHTML = '<div class="clients-pro-content-empty">Selecione um cliente para ver detalhes.</div>';
      return;
    }

    const tabs = state.dashboardData?.tabs || {};
    const summary = state.dashboardData?.summary || {};

    if (state.dashboardTab === 'simulations') {
      content.innerHTML = renderSimulationsTab(tabs?.simulations || {});
      content.querySelectorAll('[data-clients-open-inbox]').forEach((btn) => {
        btn.addEventListener('click', () => openClientInbox());
      });
      return;
    }

    if (state.dashboardTab === 'conversations') {
      content.innerHTML = renderConversationsTab(tabs?.conversations || {});
      content.querySelectorAll('[data-clients-open-inbox]').forEach((btn) => {
        btn.addEventListener('click', () => openClientInbox());
      });
      return;
    }

    if (state.dashboardTab === 'about') {
      const customer = state.dashboardData?.customer || {};
      const about = tabs?.about || {};
      content.innerHTML = renderAboutTab(customer, about, summary);
      return;
    }

    content.innerHTML = '<div class="clients-pro-content-empty">Nenhum item disponível nesta aba.</div>';
  };

  const renderDashboard = () => {
    if (!state.dom.dashboardName || !state.dom.dashboardMeta || !state.dom.dashboardKpis) return;
    if (!state.selectedCustomerId) {
      if (state.dom.editBtn) state.dom.editBtn.disabled = true;
      if (state.dom.deleteBtn) state.dom.deleteBtn.disabled = true;
      if (state.dom.dashboardAvatar) {
        state.dom.dashboardAvatar.textContent = '?';
        state.dom.dashboardAvatar.classList.remove('has-image');
      }
      state.dom.dashboardName.textContent = 'Selecione um cliente';
      state.dom.dashboardMeta.innerHTML = '<span class="clients-pro-muted">Clique em um cliente na lista para ver os dados.</span>';
      state.dom.dashboardKpis.innerHTML = '';
      if (state.dom.dashboardBadges) state.dom.dashboardBadges.innerHTML = '';
      if (state.dom.dashboardContent) {
        state.dom.dashboardContent.innerHTML = '<div class="clients-pro-content-empty">Nenhum cliente selecionado.</div>';
      }
      return;
    }
    const customer = state.dashboardData?.customer
      || state.rows.find((item) => String(item?.id || '') === state.selectedCustomerId)
      || {};
    const summary = state.dashboardData?.summary || {};
    if (state.dom.editBtn) state.dom.editBtn.disabled = false;
    if (state.dom.deleteBtn) state.dom.deleteBtn.disabled = false;
    const displayName = pickCustomerDisplayName(customer);
    const avatarSrc = getClientAvatarSrc({ ...customer, id: state.selectedCustomerId });
    if (state.dom.dashboardAvatar) {
      if (avatarSrc) {
        state.dom.dashboardAvatar.innerHTML = `<img src="${escapeAttr(avatarSrc)}" alt="${escapeAttr(displayName)}" loading="lazy" />`;
        state.dom.dashboardAvatar.classList.add('has-image');
      } else {
        state.dom.dashboardAvatar.textContent = getClientInitial(customer);
        state.dom.dashboardAvatar.classList.remove('has-image');
      }
    }
    state.dom.dashboardName.textContent = displayName;
    const source = String(customer?.source || '').trim().toUpperCase();
    const phone = String(customer?.phone || '').trim();
    const email = String(customer?.email || '').trim();
    const bits = [];
    if (phone) {
      bits.push(`<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${escapeHtml(phone)}</span>`);
    }
    if (email) {
      bits.push(`<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${escapeHtml(email)}</span>`);
    }
    if (source === 'WHATSAPP') {
      bits.push('<span class="clients-source-whatsapp" title="Origem WhatsApp"><span class="clients-source-whatsapp-icon" aria-hidden="true"></span>WhatsApp</span>');
    }
    state.dom.dashboardMeta.innerHTML = bits.length
      ? bits.join('')
      : '<span class="clients-pro-muted">Sem contatos cadastrados</span>';
    if (state.dom.dashboardBadges) {
      const lifecycle = formatLifecycleLabel(customer?.lifecycleStatus);
      const pipeline = formatPipelineStageLabel(summary?.pipelineStage, summary?.pipelineStageLabel);
      const badgeBits = [];
      if (lifecycle && lifecycle !== '—') {
        badgeBits.push(`<span class="clients-pro-badge clients-pro-badge--lifecycle">${escapeHtml(lifecycle)}</span>`);
      }
      if (pipeline && pipeline !== '—') {
        badgeBits.push(`<span class="clients-pro-badge clients-pro-badge--pipeline">${escapeHtml(pipeline)}</span>`);
      }
      state.dom.dashboardBadges.innerHTML = badgeBits.join('');
    }
    const kpis = [
      { label: 'Consumo médio', value: formatKwh(summary?.avgConsumptionKwh) },
      { label: 'Conta média', value: formatClientsCurrencyOptional(summary?.avgBillAmount) },
      { label: 'Simulações', value: String(summary?.simulationsTotal ?? '—') },
      { label: 'Estágio no funil', value: formatPipelineStageLabel(summary?.pipelineStage, summary?.pipelineStageLabel) },
      { label: 'Última conversa', value: formatClientsDateTime(summary?.lastConversationAt) },
      { label: 'Valor proposta', value: formatClientsCurrencyOptional(summary?.proposalValue) },
    ];
    state.dom.dashboardKpis.innerHTML = kpis.map((kpi) => `
      <article class="clients-pro-kpi">
        <span class="clients-pro-kpi-label">${escapeHtml(kpi.label)}</span>
        <strong class="clients-pro-kpi-value">${escapeHtml(kpi.value)}</strong>
      </article>
    `).join('');
    renderDashboardTab();
  };

  const setShellView = (view) => {
    state.shellView = view === 'grupos' ? 'grupos' : 'lista';
    if (state.dom.clientsView) state.dom.clientsView.hidden = state.shellView !== 'lista';
    if (state.dom.groupsView) state.dom.groupsView.hidden = state.shellView !== 'grupos';
    state.dom.tabLista?.classList.toggle('is-active', state.shellView === 'lista');
    state.dom.tabGrupos?.classList.toggle('is-active', state.shellView === 'grupos');
    if (state.shellView === 'grupos' && state.dom.groupsList) {
      state.dom.groupsList.innerHTML = '<div class="clients-pro-content-empty">Grupos inteligentes em breve.</div>';
    }
  };

  async function loadCustomerDashboard(customerId) {
    const api = getApi();
    const tenantId = resolveTenantId();
    if (!api || !customerId || !tenantId) return;
    state.selectedCustomerId = customerId;
    state.dashboardLoading = true;
    state.dashboardError = '';
    renderDashboard();
    try {
      const query = new URLSearchParams({
        profile: 'solar',
        simulationsLimit: '20',
        conversationsLimit: '10',
      }).toString();
      state.dashboardData = await api.request(`/api/operator/customers/${encodeURIComponent(customerId)}/dashboard?${query}`);
      const customer = unwrapCustomerDetailPayload(state.dashboardData)
        || state.dashboardData?.customer
        || null;
      if (customer) {
        cacheCustomerAvatar(customerId, customer);
      } else if (state.dashboardData?.customer?.avatar) {
        state.avatarById[customerId] = String(state.dashboardData.customer.avatar);
      }
      state.dashboardError = '';
    } catch (error) {
      const status = Number(error?.statusCode || error?.status || 0);
      if (status === 404) {
        try {
          const detail = await api.request(`/api/operator/customers/${encodeURIComponent(customerId)}?tenantId=${encodeURIComponent(tenantId)}`);
          const customer = unwrapCustomerDetailPayload(detail) || detail;
          state.dashboardData = buildSolarFallbackDashboard(customer);
          if (customer) cacheCustomerAvatar(customerId, customer);
          state.dashboardError = '';
        } catch (detailError) {
          state.dashboardData = null;
          state.dashboardError = String(detailError?.message || 'Não foi possível carregar os detalhes do cliente.');
        }
      } else {
        state.dashboardData = null;
        state.dashboardError = String(error?.message || 'Não foi possível carregar os detalhes do cliente.');
      }
    } finally {
      state.dashboardLoading = false;
      renderRows();
      renderDashboard();
    }
  }

  async function loadClients() {
    const api = getApi();
    const query = buildQuery();
    if (!api || !query) {
      state.rows = [];
      state.error = '';
      setFeedback('Selecione uma empresa para listar clientes.', 'warn');
      renderRows();
      renderDashboard();
      return;
    }
    state.loadGen += 1;
    const gen = state.loadGen;
    state.loading = true;
    state.loadingMore = false;
    state.error = '';
    setFeedback('');
    renderRows();
    try {
      const payload = await api.request(`/api/operator/customers?${query}`);
      if (gen !== state.loadGen) return;
      state.rows = unwrapArray(payload);
      state.nextCursor = pickNextCursor(payload);
      state.hasMore = Boolean(state.nextCursor);
      const hasSelection = state.rows.some((item) => String(item?.id || '') === String(state.selectedCustomerId || ''));
      if (!hasSelection) {
        state.selectedCustomerId = state.rows[0]?.id || '';
        state.dashboardData = null;
      }
      if (!state.rows.length) setFeedback('Nenhum cliente encontrado.', 'neutral');
      void hydrateClientsListAvatars();
    } catch (error) {
      if (gen !== state.loadGen) return;
      state.rows = [];
      state.nextCursor = '';
      state.hasMore = false;
      state.error = String(error?.message || 'Não foi possível carregar clientes.');
      setFeedback(state.error, 'warn');
    } finally {
      if (gen === state.loadGen) {
        state.loading = false;
        renderRows();
        renderDashboard();
        if (state.selectedCustomerId && !state.dashboardData && !state.dashboardLoading) {
          void loadCustomerDashboard(state.selectedCustomerId);
        }
      }
    }
  }

  async function loadMoreClients() {
    const api = getApi();
    if (!api || state.loading || state.loadingMore || !state.hasMore || !state.nextCursor) return;
    const query = buildQuery({ cursor: state.nextCursor });
    if (!query) return;
    const gen = state.loadGen;
    state.loadingMore = true;
    renderRows();
    try {
      const payload = await api.request(`/api/operator/customers?${query}`);
      if (gen !== state.loadGen) return;
      const more = unwrapArray(payload);
      const seen = new Set(state.rows.map((item) => String(item?.id || '')));
      for (const row of more) {
        const id = String(row?.id || '');
        if (id && !seen.has(id)) {
          seen.add(id);
          state.rows.push(row);
        }
      }
      state.nextCursor = pickNextCursor(payload);
      state.hasMore = Boolean(state.nextCursor);
      void hydrateClientsListAvatars();
    } catch (error) {
      if (gen !== state.loadGen) return;
      state.hasMore = false;
      setFeedback(String(error?.message || 'Não foi possível carregar mais clientes.'), 'warn');
    } finally {
      if (gen === state.loadGen) {
        state.loadingMore = false;
        renderRows();
      }
    }
  }

  const toClientsDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });

  const resetClientsEditorForm = () => {
    state.dom.editorForm?.reset();
    if (state.dom.editorAvatar) state.dom.editorAvatar.value = '';
  };

  const closeClientsEditor = () => {
    if (state.dom.editorBackdrop) state.dom.editorBackdrop.hidden = true;
    state.editorCustomerId = '';
    state.editorMode = 'create';
    state.editorOriginal = null;
    document.body.style.removeProperty('overflow');
  };

  const openClientsEditor = ({ mode, customer } = {}) => {
    state.editorMode = mode === 'edit' ? 'edit' : 'create';
    state.editorCustomerId = String(customer?.id || '').trim();
    state.editorOriginal = customer && typeof customer === 'object' ? { ...customer } : null;
    resetClientsEditorForm();
    if (state.dom.editorTitle) {
      state.dom.editorTitle.textContent = state.editorMode === 'edit' ? 'Editar cliente' : 'Novo cliente';
    }
    if (state.dom.editorSubmit) {
      state.dom.editorSubmit.textContent = state.editorMode === 'edit' ? 'Salvar alterações' : 'Criar cliente';
    }
    if (customer) {
      if (state.dom.editorFullName) state.dom.editorFullName.value = String(customer.fullName || '');
      if (state.dom.editorPreferredName) state.dom.editorPreferredName.value = String(customer.preferredName || '');
      if (state.dom.editorPhone) state.dom.editorPhone.value = String(customer.phone || '');
      if (state.dom.editorEmail) state.dom.editorEmail.value = String(customer.email || '');
      if (state.dom.editorDocument) state.dom.editorDocument.value = String(customer.document || '');
      if (state.dom.editorBirthDate) state.dom.editorBirthDate.value = String(customer.birthDate || '').slice(0, 10);
      if (state.dom.editorGender) state.dom.editorGender.value = String(customer.gender || '');
      if (state.dom.editorSource) state.dom.editorSource.value = String(customer.source || '');
      if (state.dom.editorLifecycle) state.dom.editorLifecycle.value = String(customer.lifecycleStatus || 'LEAD');
      if (state.dom.editorZipCode) state.dom.editorZipCode.value = String(customer.zipCode || '');
      if (state.dom.editorCity) state.dom.editorCity.value = String(customer.city || '');
      if (state.dom.editorState) state.dom.editorState.value = String(customer.state || '');
      if (state.dom.editorStreet) state.dom.editorStreet.value = String(customer.street || '');
      if (state.dom.editorNumber) state.dom.editorNumber.value = String(customer.number || '');
      if (state.dom.editorComplement) state.dom.editorComplement.value = String(customer.complement || '');
      if (state.dom.editorNeighborhood) state.dom.editorNeighborhood.value = String(customer.neighborhood || '');
      if (state.dom.editorNotes) state.dom.editorNotes.value = String(customer.notes || '');
    } else if (state.dom.editorLifecycle) {
      state.dom.editorLifecycle.value = 'LEAD';
    }
    if (state.dom.editorBackdrop) {
      state.dom.editorBackdrop.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  };

  const buildCustomerPayloadFromEditor = async () => {
    const lifecycleStatus = state.editorMode === 'create'
      ? String(state.dom.editorLifecycle?.value || 'LEAD').trim() || 'LEAD'
      : String(state.dom.editorLifecycle?.value || state.editorOriginal?.lifecycleStatus || 'LEAD').trim() || 'LEAD';
    const payload = {
      fullName: String(state.dom.editorFullName?.value || '').trim(),
      preferredName: String(state.dom.editorPreferredName?.value || '').trim() || undefined,
      phone: String(state.dom.editorPhone?.value || '').trim() || undefined,
      email: String(state.dom.editorEmail?.value || '').trim() || undefined,
      document: String(state.dom.editorDocument?.value || '').trim() || undefined,
      birthDate: String(state.dom.editorBirthDate?.value || '').trim() || undefined,
      gender: String(state.dom.editorGender?.value || '').trim() || undefined,
      source: String(state.dom.editorSource?.value || '').trim() || undefined,
      sourceNote: String(state.editorOriginal?.sourceNote || '').trim() || undefined,
      lifecycleStatus,
      lgpdConsent: state.editorOriginal?.lgpdConsent === true,
      whatsappOptIn: state.editorOriginal?.whatsappOptIn === true,
      isActive: state.editorOriginal?.isActive !== false,
      zipCode: String(state.dom.editorZipCode?.value || '').trim() || undefined,
      street: String(state.dom.editorStreet?.value || '').trim() || undefined,
      number: String(state.dom.editorNumber?.value || '').trim() || undefined,
      complement: String(state.dom.editorComplement?.value || '').trim() || undefined,
      neighborhood: String(state.dom.editorNeighborhood?.value || '').trim() || undefined,
      city: String(state.dom.editorCity?.value || '').trim() || undefined,
      state: String(state.dom.editorState?.value || '').trim().toUpperCase().slice(0, 2) || undefined,
      notes: String(state.dom.editorNotes?.value || '').trim() || undefined,
    };
    const avatarFile = state.dom.editorAvatar?.files?.[0];
    if (avatarFile) {
      payload.avatar = await toClientsDataUrl(avatarFile);
    }
    return payload;
  };

  const normalizeComparableField = (value) => String(value || '').trim();

  const buildCustomerPatchPayload = (payload) => {
    if (!state.editorOriginal || typeof state.editorOriginal !== 'object') return payload;
    const nextPayload = {};
    const keys = [
      'fullName', 'preferredName', 'phone', 'email', 'document', 'birthDate', 'gender',
      'source', 'sourceNote', 'lifecycleStatus', 'notes',
      'zipCode', 'street', 'number', 'complement', 'neighborhood', 'city', 'state',
    ];
    keys.forEach((key) => {
      if (!(key in payload)) return;
      const nextValue = payload[key];
      const prevValue = state.editorOriginal[key];
      if (normalizeComparableField(nextValue) !== normalizeComparableField(prevValue)) {
        nextPayload[key] = nextValue;
      }
    });
    if (Object.prototype.hasOwnProperty.call(payload, 'avatar')) {
      nextPayload.avatar = payload.avatar;
    }
    return nextPayload;
  };

  async function openCreateCustomerEditor() {
    openClientsEditor({ mode: 'create' });
  }

  async function openEditCustomerEditor() {
    const customerId = String(state.selectedCustomerId || '').trim();
    const tenantId = resolveTenantId();
    if (!customerId || !tenantId) return;
    const api = getApi();
    if (!api) return;
    try {
      const detail = await api.request(`/api/operator/customers/${encodeURIComponent(customerId)}?tenantId=${encodeURIComponent(tenantId)}`);
      const customer = unwrapCustomerDetailPayload(detail) || detail;
      openClientsEditor({ mode: 'edit', customer });
    } catch (error) {
      setFeedback(error?.message || 'Não foi possível carregar os dados do cliente para edição.', 'warn');
    }
  }

  async function deleteSelectedCustomer() {
    const customerId = String(state.selectedCustomerId || '').trim();
    const tenantId = resolveTenantId();
    if (!customerId || !tenantId) return;
    const selected = state.rows.find((item) => String(item?.id || '') === customerId);
    const customerName = String(selected?.fullName || selected?.preferredName || 'este cliente').trim();
    if (!window.confirm(`Deseja realmente deletar ${customerName}? Essa ação não pode ser desfeita.`)) return;
    const api = getApi();
    if (!api) return;
    if (state.dom.deleteBtn) state.dom.deleteBtn.disabled = true;
    try {
      await api.request(`/api/operator/customers/${encodeURIComponent(customerId)}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'DELETE',
      });
      delete state.avatarById[customerId];
      state.selectedCustomerId = '';
      state.dashboardData = null;
      state.dashboardError = '';
      await loadClients();
    } catch (error) {
      setFeedback(error?.message || 'Não foi possível deletar o cliente.', 'warn');
    } finally {
      if (state.dom.deleteBtn) state.dom.deleteBtn.disabled = false;
    }
  }

  async function submitClientsEditor(event) {
    if (event) event.preventDefault();
    const tenantId = resolveTenantId();
    if (!tenantId) {
      setFeedback('Selecione uma empresa antes de salvar cliente.', 'warn');
      return;
    }
    const api = getApi();
    if (!api) return;
    const payload = await buildCustomerPayloadFromEditor();
    if (!payload.fullName) {
      setFeedback('Nome completo é obrigatório.', 'warn');
      return;
    }
    if (state.dom.editorSubmit) state.dom.editorSubmit.disabled = true;
    try {
      if (state.editorMode === 'edit' && state.editorCustomerId) {
        const patchPayload = buildCustomerPatchPayload(payload);
        if (!Object.keys(patchPayload).length) {
          setFeedback('Nenhuma alteração detectada para salvar.', 'neutral');
          closeClientsEditor();
          return;
        }
        await api.request(`/api/operator/customers/${encodeURIComponent(state.editorCustomerId)}?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'PATCH',
          body: JSON.stringify(patchPayload),
        });
        delete state.avatarById[state.editorCustomerId];
      } else {
        const created = await api.request(`/api/operator/customers?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const createdId = String(created?.id || created?.data?.id || '').trim();
        if (createdId) state.selectedCustomerId = createdId;
      }
      closeClientsEditor();
      state.dashboardData = null;
      state.dashboardError = '';
      await loadClients();
      if (state.selectedCustomerId) {
        await loadCustomerDashboard(state.selectedCustomerId);
      }
    } catch (error) {
      setFeedback(error?.message || 'Não foi possível salvar o cliente.', 'warn');
    } finally {
      if (state.dom.editorSubmit) state.dom.editorSubmit.disabled = false;
    }
  }

  const bindEditorEvents = () => {
    if (state.editorGlobalBound) return;
    state.editorGlobalBound = true;
    state.dom.editorClose?.addEventListener('click', closeClientsEditor);
    state.dom.editorCancel?.addEventListener('click', closeClientsEditor);
    state.dom.editorBackdrop?.addEventListener('click', (event) => {
      if (event.target === state.dom.editorBackdrop) closeClientsEditor();
    });
    state.dom.editorForm?.addEventListener('submit', (event) => {
      void submitClientsEditor(event);
    });
  };

  function bindEvents() {
    if (state.mounted) return;
    state.dom.search?.addEventListener('input', () => {
      state.searchTerm = state.dom.search?.value || '';
      window.clearTimeout(state.searchDebounceId);
      state.searchDebounceId = window.setTimeout(() => void loadClients(), 280);
    });
    state.dom.tenant?.addEventListener('change', () => {
      state.selectedTenantId = state.dom.tenant?.value || '';
      state.selectedCustomerId = '';
      state.dashboardData = null;
      void loadClients();
    });
    state.dom.dateField?.addEventListener('change', () => {
      state.dateField = state.dom.dateField?.value || 'updatedAt';
      void loadClients();
    });
    state.dom.dateFrom?.addEventListener('change', () => {
      state.dateFrom = state.dom.dateFrom?.value || '';
      void loadClients();
    });
    state.dom.dateTo?.addEventListener('change', () => {
      state.dateTo = state.dom.dateTo?.value || '';
      void loadClients();
    });
    state.dom.clearDates?.addEventListener('click', () => {
      state.dateFrom = '';
      state.dateTo = '';
      if (state.dom.dateFrom) state.dom.dateFrom.value = '';
      if (state.dom.dateTo) state.dom.dateTo.value = '';
      void loadClients();
    });
    state.dom.root?.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-customer-id]');
      if (!trigger) return;
      const customerId = trigger.getAttribute('data-customer-id') || '';
      if (customerId) void loadCustomerDashboard(customerId);
    });
    state.dom.list?.addEventListener('scroll', () => {
      if (!state.dom.list || !state.hasMore || state.loadingMore || state.loading) return;
      const distance = state.dom.list.scrollHeight - state.dom.list.scrollTop - state.dom.list.clientHeight;
      if (distance <= 160) void loadMoreClients();
    }, { passive: true });
    state.dom.dashboardTabs?.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-customer-tab]');
      if (!tab) return;
      state.dashboardTab = tab.getAttribute('data-customer-tab') || 'simulations';
      state.dom.dashboardTabs?.querySelectorAll('[data-customer-tab]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-customer-tab') === state.dashboardTab);
      });
      renderDashboardTab();
    });
    state.dom.tabLista?.addEventListener('click', () => setShellView('lista'));
    state.dom.tabGrupos?.addEventListener('click', () => setShellView('grupos'));
    state.dom.createBtn?.addEventListener('click', () => {
      void openCreateCustomerEditor();
    });
    state.dom.editBtn?.addEventListener('click', () => {
      void openEditCustomerEditor();
    });
    state.dom.deleteBtn?.addEventListener('click', () => {
      void deleteSelectedCustomer();
    });
    bindEditorEvents();
    state.mounted = true;
  }

  function mount() {
    state.dom.root = qs('#adminClientsRoot');
    state.dom.tenant = qs('#adminClientsTenant');
    state.dom.search = qs('#adminClientsSearch');
    state.dom.dateField = qs('#adminClientsDateField');
    state.dom.dateFrom = qs('#adminClientsDateFrom');
    state.dom.dateTo = qs('#adminClientsDateTo');
    state.dom.clearDates = qs('#adminClientsClearDates');
    state.dom.feedback = qs('#adminClientsFeedback');
    state.dom.list = qs('#adminClientsList');
    state.dom.dashboardAvatar = qs('#adminClientsDashboardAvatar');
    state.dom.dashboardName = qs('#adminClientsDashboardName');
    state.dom.dashboardMeta = qs('#adminClientsDashboardMeta');
    state.dom.dashboardBadges = qs('#adminClientsDashboardBadges');
    state.dom.dashboardKpis = qs('#adminClientsDashboardKpis');
    state.dom.dashboardTabs = qs('#adminClientsDashboardTabs');
    state.dom.dashboardContent = qs('#adminClientsDashboardContent');
    state.dom.editBtn = qs('#adminClientsEditButton');
    state.dom.deleteBtn = qs('#adminClientsDeleteButton');
    state.dom.tabLista = qs('#adminClientsTabLista');
    state.dom.tabGrupos = qs('#adminClientsTabGrupos');
    state.dom.clientsView = qs('#adminClientsClientsView');
    state.dom.groupsView = qs('#adminClientsGroupsView');
    state.dom.groupsList = qs('#adminClientsGroupsList');
    state.dom.createBtn = qs('#adminClientsCreateButton');
    state.dom.editorBackdrop = qs('#adminClientsEditorBackdrop');
    state.dom.editorTitle = qs('#adminClientsEditorTitle');
    state.dom.editorClose = qs('#adminClientsEditorClose');
    state.dom.editorCancel = qs('#adminClientsEditorCancel');
    state.dom.editorForm = qs('#adminClientsEditorForm');
    state.dom.editorSubmit = qs('#adminClientsEditorSubmit');
    state.dom.editorFullName = qs('#adminClientsEditorFullName');
    state.dom.editorPreferredName = qs('#adminClientsEditorPreferredName');
    state.dom.editorPhone = qs('#adminClientsEditorPhone');
    state.dom.editorEmail = qs('#adminClientsEditorEmail');
    state.dom.editorDocument = qs('#adminClientsEditorDocument');
    state.dom.editorBirthDate = qs('#adminClientsEditorBirthDate');
    state.dom.editorGender = qs('#adminClientsEditorGender');
    state.dom.editorSource = qs('#adminClientsEditorSource');
    state.dom.editorLifecycle = qs('#adminClientsEditorLifecycle');
    state.dom.editorZipCode = qs('#adminClientsEditorZipCode');
    state.dom.editorCity = qs('#adminClientsEditorCity');
    state.dom.editorState = qs('#adminClientsEditorState');
    state.dom.editorStreet = qs('#adminClientsEditorStreet');
    state.dom.editorNumber = qs('#adminClientsEditorNumber');
    state.dom.editorComplement = qs('#adminClientsEditorComplement');
    state.dom.editorNeighborhood = qs('#adminClientsEditorNeighborhood');
    state.dom.editorNotes = qs('#adminClientsEditorNotes');
    state.dom.editorAvatar = qs('#adminClientsEditorAvatar');
    if (!state.dom.root || !state.dom.list) return false;
    bindEvents();
    return true;
  }

  window.ReservaAiClientsAdmin = {
    init({ session } = {}) {
      state.session = session || state.session;
      mount();
    },
    async activate(session) {
      let resolved = session || state.session;
      if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
        resolved = await window.ReservaPermissions.enrichSessionWithOperatorMe(resolved);
      }
      state.session = resolved;
      state.active = true;
      if (!mount()) return;
      state.selectedTenantId = resolveTenantId();
      renderTenantSelect();
      setShellView('lista');
      await loadClients();
    },
    deactivate() {
      state.active = false;
      closeClientsEditor();
    },
  };
}());
