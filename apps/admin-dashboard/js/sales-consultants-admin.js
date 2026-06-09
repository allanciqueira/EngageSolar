/**
 * Vendedores / Consultores — NeuraFlow via /api/operator/sales-consultants
 */
(function () {
  const KIND_OPTIONS = [
    { value: '', label: 'Todos os tipos' },
    { value: 'CONSULTANT', label: 'Consultor(a)' },
    { value: 'SALESPERSON', label: 'Vendedor(a)' },
    { value: 'SENIOR', label: 'Sênior' },
    { value: 'MANAGER', label: 'Gestor(a) comercial' },
    { value: 'EXTERNAL', label: 'Externo / representante' },
  ];

  const EMPLOYMENT_OPTIONS = [
    { value: '', label: 'Todos os vínculos' },
    { value: 'CLT', label: 'CLT' },
    { value: 'PJ', label: 'PJ' },
    { value: 'COMMISSION_ONLY', label: 'Só comissão' },
    { value: 'INTERN', label: 'Estagiário(a)' },
    { value: 'EXTERNAL_PARTNER', label: 'Parceiro externo' },
  ];

  const WORK_MODE_OPTIONS = [
    { value: 'REMOTE', label: 'Remoto' },
    { value: 'ONSITE', label: 'Presencial' },
    { value: 'HYBRID', label: 'Híbrido' },
    { value: 'FIELD', label: 'Campo / visitas' },
  ];

  const ACTIVE_FILTER_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'true', label: 'Ativos' },
    { value: 'false', label: 'Inativos' },
  ];

  const MODAL_TABS = [
    { id: 'identificacao', label: 'Identificação' },
    { id: 'contacto', label: 'Contacto' },
    { id: 'vinculo', label: 'Vínculo' },
    { id: 'registro', label: 'Registo interno' },
    { id: 'comercial', label: 'Comercial' },
    { id: 'acesso', label: 'Acesso' },
    { id: 'observacoes', label: 'Observações' },
  ];

  const state = {
    mounted: false,
    initialized: false,
    active: false,
    session: null,
    selectedTenantId: '',
    rows: [],
    filteredRows: [],
    selectedId: '',
    searchTerm: '',
    filterActive: 'true',
    filterKind: '',
    filterEmployment: '',
    loading: false,
    error: '',
    canWrite: false,
    members: [],
    branches: [],
    editorMode: 'create',
    editorId: '',
    editorTab: 'identificacao',
    avatarObjectUrls: {},
    avatarPreviewUrl: '',
    dom: {},
    modals: {},
  };

  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const escapeAttr = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const qs = (selector) => document.querySelector(selector);

  const isAbsoluteAvatarUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

  const isProtectedAvatarPath = (path) => {
    const value = String(path || '').trim();
    return value.includes('/sales-consultants/') && value.includes('/avatar');
  };

  const imageSrc = (path) => {
    const value = String(path || '').trim();
    if (!value) return '';
    if (value.startsWith('data:image')) return value;
    if (isAbsoluteAvatarUrl(value)) return value;
    const gateway = String(window.RESERVAAI_GATEWAY_URL || '').trim().replace(/\/$/, '');
    const origin = String(window.location?.origin || '').replace(/\/$/, '');
    const base = gateway || origin;
    return base ? `${base}${value.startsWith('/') ? value : `/${value}`}` : value;
  };

  const buildLegacyAvatarPath = (consultantId) => {
    const tenantId = resolveTenantId();
    return `/api/operator/tenants/${encodeURIComponent(tenantId)}/sales-consultants/${encodeURIComponent(consultantId)}/avatar`;
  };

  const resolveAvatarPresentation = (row) => {
    const id = String(row?.id || '').trim();
    const avatarUrl = String(row?.avatarUrl || '').trim();
    if (avatarUrl && (isAbsoluteAvatarUrl(avatarUrl) || avatarUrl.startsWith('data:image'))) {
      return { type: 'direct', src: avatarUrl };
    }
    if (avatarUrl && !isProtectedAvatarPath(avatarUrl)) {
      const resolved = imageSrc(avatarUrl);
      if (resolved) return { type: 'direct', src: resolved };
    }
    if (id) return { type: 'protected', id };
    return { type: 'initial' };
  };

  const buildListAvatarBlock = (row) => {
    const initial = getInitial(row);
    const color = String(row.color || '').trim();
    const presentation = resolveAvatarPresentation(row);
    if (presentation.type === 'direct') {
      return `<span class="operator-pro-avatar users-pro-item-avatar has-image"><img class="pro-item-avatar-img" src="${escapeAttr(presentation.src)}" alt="" loading="lazy" /></span>`;
    }
    if (presentation.type === 'protected') {
      return `<span class="operator-pro-avatar users-pro-item-avatar has-image"><img class="pro-item-avatar-img" data-sc-avatar-id="${escapeAttr(presentation.id)}" alt="" loading="lazy" /></span>`;
    }
    const avatarStyle = color ? ` style="background:${escapeAttr(color)}"` : '';
    return `<span class="operator-pro-avatar users-pro-item-avatar"${avatarStyle}>${escapeHtml(initial)}</span>`;
  };

  const renderDetailAvatar = (row) => {
    const avatar = state.dom.detailAvatar;
    if (!avatar) return;
    const initial = getInitial(row);
    const color = String(row.color || '#2563eb').trim();
    const presentation = resolveAvatarPresentation(row);
    if (presentation.type === 'direct') {
      avatar.className = 'pro-hero-avatar has-image';
      avatar.style.background = '';
      avatar.innerHTML = `<img class="pro-hero-avatar-img" src="${escapeAttr(presentation.src)}" alt="" loading="lazy" />`;
      return;
    }
    if (presentation.type === 'protected') {
      avatar.className = 'pro-hero-avatar has-image';
      avatar.style.background = '';
      avatar.innerHTML = `<img class="pro-hero-avatar-img" data-sc-avatar-id="${escapeAttr(presentation.id)}" alt="" loading="lazy" />`;
      void hydrateAvatars();
      return;
    }
    avatar.className = 'pro-hero-avatar';
    avatar.style.background = color;
    avatar.textContent = initial;
  };

  const fetchProtectedAvatarUrl = async (consultantId) => {
    const id = String(consultantId || '').trim();
    if (!id) return '';
    if (state.avatarObjectUrls[id]) return state.avatarObjectUrls[id];
    const token = window.ReservaAiAuth?.getAccessToken?.() || state.session?.externalAccessToken || '';
    const response = await fetch(buildLegacyAvatarPath(id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!response.ok) return '';
    const blob = await response.blob();
    if (!blob || !blob.size) return '';
    const objectUrl = URL.createObjectURL(blob);
    state.avatarObjectUrls[id] = objectUrl;
    return objectUrl;
  };

  const hydrateAvatars = async () => {
    const images = Array.from(document.querySelectorAll('img[data-sc-avatar-id]'));
    await Promise.all(images.map(async (image) => {
      const id = String(image.getAttribute('data-sc-avatar-id') || '').trim();
      if (!id) return;
      try {
        const src = await fetchProtectedAvatarUrl(id);
        if (src) image.src = src;
      } catch (_err) {
        const row = state.rows.find((item) => String(item.id) === id);
        const parent = image.closest('.users-pro-item-avatar, .pro-hero-avatar');
        if (parent && row) {
          parent.classList.remove('has-image');
          parent.textContent = getInitial(row);
          parent.style.background = String(row.color || '#2563eb').trim();
          image.remove();
        }
      }
    }));
  };

  const revokeAvatarObjectUrls = () => {
    Object.values(state.avatarObjectUrls).forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (_err) { /* noop */ }
    });
    state.avatarObjectUrls = {};
    if (state.avatarPreviewUrl) {
      try { URL.revokeObjectURL(state.avatarPreviewUrl); } catch (_err) { /* noop */ }
      state.avatarPreviewUrl = '';
    }
  };

  const resetFormAvatar = async (row = null) => {
    const fileInput = qs('#scFormAvatarFile');
    if (fileInput) fileInput.value = '';
    const preview = qs('#scFormAvatarPreview');
    const wrap = qs('#scFormAvatarPreviewWrap');
    if (!preview || !wrap) return;

    if (state.avatarPreviewUrl) {
      try { URL.revokeObjectURL(state.avatarPreviewUrl); } catch (_err) { /* noop */ }
      state.avatarPreviewUrl = '';
    }

    if (!row) {
      preview.removeAttribute('src');
      wrap.hidden = true;
      return;
    }

    const presentation = resolveAvatarPresentation(row);
    if (presentation.type === 'direct') {
      preview.src = presentation.src;
      wrap.hidden = false;
      return;
    }
    if (presentation.type === 'protected') {
      try {
        const src = await fetchProtectedAvatarUrl(presentation.id);
        if (src) {
          preview.src = src;
          wrap.hidden = false;
          return;
        }
      } catch (_err) { /* fallback to empty preview */ }
    }
    preview.removeAttribute('src');
    wrap.hidden = true;
  };

  const uploadAvatar = async (consultantId, file) => {
    const tenantId = resolveTenantId();
    const formData = new FormData();
    formData.append('file', file);
    return requestOperator(
      `/api/operator/tenants/${encodeURIComponent(tenantId)}/sales-consultants/${encodeURIComponent(consultantId)}/avatar`,
      { method: 'POST', body: formData },
    );
  };

  const getApi = () => {
    const api = window.ReservaAiApi || window.EngageSolarApi;
    return api && typeof api.request === 'function' ? api : null;
  };

  const labelFor = (options, value, fallback = '—') => {
    const hit = options.find((item) => item.value === value);
    return hit ? hit.label : (value ? String(value) : fallback);
  };

  const resolveTenantId = () => {
    if (state.selectedTenantId) return state.selectedTenantId;
    if (window.ReservaPermissions?.resolveEffectiveTenantId) {
      return window.ReservaPermissions.resolveEffectiveTenantId(state.session);
    }
    return String(state.session?.activeTenantId || state.session?.tenantId || '').trim();
  };

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

  const canManageTenant = () => {
    if (window.ReservaPermissions?.canManageTenantSession?.(state.session)) return true;
    if (state.session?.canManageTenant === true || state.session?.managedTenant === true) return true;
    const tenantId = resolveTenantId();
    const memberships = Array.isArray(state.session?.tenants) ? state.session.tenants : [];
    return memberships.some((tenant) => {
      const id = String(tenant?.id || tenant?.tenantId || '').trim();
      if (tenantId && id && id !== tenantId) return false;
      const role = String(tenant?.role || '').toUpperCase();
      return tenant?.canManageTenant === true || role === 'OWNER' || role === 'ADMIN' || role === 'TENANT_ADMIN';
    });
  };

  const unwrapArray = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const nested = payload.data ?? payload.items ?? payload.results ?? payload.rows;
    return Array.isArray(nested) ? nested : [];
  };

  const displayName = (row) => {
    const display = String(row?.displayName || '').trim();
    if (display) return display;
    return String(row?.name || 'Vendedor').trim();
  };

  const getInitial = (row) => {
    const name = displayName(row);
    return (name[0] || '?').toUpperCase();
  };

  const formatMoney = (value) => {
    if (value == null || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  };

  const formatPct = (value) => {
    if (value == null || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num}%`;
  };

  const formatDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const parts = raw.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return raw;
  };

  const requestOperator = async (path, options = {}) => {
    const api = getApi();
    if (!api) throw new Error('Cliente API indisponível.');
    return api.request(path, options);
  };

  const buildListPath = (tenantId) => {
    const params = new URLSearchParams({ includeBranches: 'true' });
    if (state.filterActive) params.set('active', state.filterActive);
    if (state.filterKind) params.set('kind', state.filterKind);
    if (state.filterEmployment) params.set('employmentType', state.filterEmployment);
    return `/api/operator/tenants/${encodeURIComponent(tenantId)}/sales-consultants?${params}`;
  };

  const applyFilters = () => {
    const term = String(state.searchTerm || '').trim().toLowerCase();
    state.filteredRows = state.rows.filter((row) => {
      if (!term) return true;
      const haystack = [
        row?.name,
        row?.displayName,
        row?.email,
        row?.phone,
        row?.position,
        row?.internalCode,
        row?.user?.fullName,
        row?.user?.email,
      ].map((item) => String(item || '').toLowerCase()).join(' ');
      return haystack.includes(term);
    });
  };

  const setStatus = (message, tone = 'neutral') => {
    const node = state.dom.status;
    if (!node) return;
    node.textContent = String(message || '').trim() || 'Pronto';
    node.dataset.tone = tone;
  };

  const renderTenantSelect = () => {
    const select = state.dom.tenantSelect;
    if (!select) return;
    const options = getTenantOptions();
    const current = resolveTenantId();
    select.innerHTML = options.map((item) => (
      `<option value="${escapeAttr(item.id)}"${item.id === current ? ' selected' : ''}>${escapeHtml(item.name)}</option>`
    )).join('');
    state.selectedTenantId = String(select.value || current || '').trim();
  };

  const renderList = () => {
    const list = state.dom.list;
    if (!list) return;
    if (state.loading) {
      list.innerHTML = '<div class="pro-list-empty">Carregando vendedores...</div>';
      return;
    }
    if (state.error) {
      list.innerHTML = `<div class="pro-list-empty">${escapeHtml(state.error)}</div>`;
      return;
    }
    if (!state.filteredRows.length) {
      list.innerHTML = '<div class="pro-list-empty">Nenhum vendedor encontrado.</div>';
      return;
    }
    list.innerHTML = state.filteredRows.map((row) => {
      const id = String(row.id || '');
      const isSelected = state.selectedId === id;
      const isActive = row.isActive !== false;
      const kindLabel = labelFor(KIND_OPTIONS.slice(1), row.kind, '');
      const position = String(row.position || row.department || '').trim();
      const subtitle = [position, kindLabel].filter(Boolean).join(' · ') || 'Sem cargo';
      const avatarBlock = buildListAvatarBlock(row);
      return `
        <button type="button"
                class="pro-item sales-consultants-item${isSelected ? ' is-active' : ''}"
                data-sc-action="select"
                data-sc-id="${escapeAttr(id)}">
          <span class="pro-item-avatar">${avatarBlock}</span>
          <span class="pro-item-meta">
            <span class="pro-item-name">${escapeHtml(displayName(row))}</span>
            <span class="pro-item-role">${escapeHtml(subtitle)}</span>
            <span class="sales-consultants-item-meta">
              ${kindLabel ? `<span class="sales-consultants-chip">${escapeHtml(kindLabel)}</span>` : ''}
              <span class="sales-consultants-chip${isActive ? '' : ' is-off'}">${isActive ? 'Ativo' : 'Inativo'}</span>
            </span>
          </span>
        </button>
      `;
    }).join('');
    void hydrateAvatars();
  };

  const renderDetail = () => {
    const empty = state.dom.detailEmpty;
    const card = state.dom.detailCard;
    if (!empty || !card) return;

    const row = state.filteredRows.find((item) => String(item.id) === state.selectedId)
      || state.rows.find((item) => String(item.id) === state.selectedId);

    if (!row) {
      empty.hidden = false;
      card.hidden = true;
      return;
    }

    empty.hidden = true;
    card.hidden = false;

    const name = displayName(row);
    renderDetailAvatar(row);
    if (state.dom.detailName) state.dom.detailName.textContent = name;
    if (state.dom.detailContacts) {
      const contacts = [
        row.email ? `✉ ${row.email}` : '',
        row.phone ? `☎ ${row.phone}` : '',
        row.whatsappPhone ? `WhatsApp ${row.whatsappPhone}` : '',
      ].filter(Boolean);
      state.dom.detailContacts.textContent = contacts.length
        ? contacts.join(' · ')
        : 'Sem contacto cadastrado';
    }
    if (state.dom.detailBadges) {
      const badges = [
        labelFor(KIND_OPTIONS.slice(1), row.kind, ''),
        labelFor(EMPLOYMENT_OPTIONS.slice(1), row.employmentType, ''),
        row.isActive === false ? 'Inativo' : 'Ativo',
      ].filter(Boolean);
      state.dom.detailBadges.innerHTML = badges.map((badge) => (
        `<span class="pro-badge">${escapeHtml(badge)}</span>`
      )).join('');
    }
    if (state.dom.detailKpis) {
      state.dom.detailKpis.innerHTML = `
        <div class="sales-consultants-kpi">
          <span>Meta mensal</span>
          <strong>${escapeHtml(formatMoney(row.monthlyGoal))}</strong>
        </div>
        <div class="sales-consultants-kpi">
          <span>Comissão produto</span>
          <strong>${escapeHtml(formatPct(row.productCommissionPct))}</strong>
        </div>
        <div class="sales-consultants-kpi">
          <span>Comissão serviço</span>
          <strong>${escapeHtml(formatPct(row.serviceCommissionPct))}</strong>
        </div>
      `;
    }
    if (state.dom.detailFacts) {
      const branchNames = (Array.isArray(row.branchIds) ? row.branchIds : [])
        .map((id) => {
          const hit = state.branches.find((b) => String(b.id) === String(id));
          return hit ? (hit.name || hit.displayName || id) : id;
        })
        .filter(Boolean);
      const userLabel = row.user
        ? `${row.user.fullName || row.user.email || row.userId}`
        : (row.userId ? row.userId : '—');
      const facts = [
        ['Cargo', row.position || '—'],
        ['Departamento', row.department || '—'],
        ['Território', row.territory || '—'],
        ['Código interno', row.internalCode || '—'],
        ['Matrícula', row.employeeRegistration || '—'],
        ['Admissão', formatDate(row.hireDate)],
        ['Utilizador ligado', userLabel],
        ['Filiais', branchNames.length ? branchNames.join(', ') : '—'],
        ['Notas', row.notes || '—'],
      ];
      state.dom.detailFacts.innerHTML = facts.map(([label, value]) => `
        <div class="sales-consultants-fact">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </div>
      `).join('');
    }

    const canWrite = state.canWrite;
    if (state.dom.detailEdit) state.dom.detailEdit.disabled = !canWrite;
    if (state.dom.detailDelete) state.dom.detailDelete.disabled = !canWrite;
    if (state.dom.detailToggle) {
      const isActive = row.isActive !== false;
      state.dom.detailToggle.textContent = isActive ? 'Inativar' : 'Reativar';
      state.dom.detailToggle.disabled = !canWrite;
    }
    if (state.dom.readonlyNote) {
      state.dom.readonlyNote.hidden = canWrite;
    }
  };

  const syncWriteUi = () => {
    state.canWrite = canManageTenant();
    const addBtn = state.dom.addButton;
    if (addBtn) addBtn.disabled = !state.canWrite;
    renderDetail();
  };

  const loadBranches = async (tenantId) => {
    try {
      const payload = await requestOperator(`/api/operator/branches?tenantId=${encodeURIComponent(tenantId)}`);
      state.branches = unwrapArray(payload);
    } catch (_err) {
      state.branches = [];
    }
  };

  const loadMembers = async (tenantId) => {
    try {
      const payload = await requestOperator(`/api/operator/tenants/${encodeURIComponent(tenantId)}/members`);
      state.members = unwrapArray(payload);
    } catch (_err) {
      state.members = [];
    }
  };

  const loadList = async () => {
    const tenantId = resolveTenantId();
    if (!tenantId) {
      state.error = 'Selecione uma empresa.';
      state.rows = [];
      applyFilters();
      renderList();
      renderDetail();
      setStatus('Empresa não definida.', 'warn');
      return;
    }

    state.loading = true;
    state.error = '';
    renderList();
    setStatus('Carregando vendedores...', 'neutral');

    try {
      const [listPayload] = await Promise.all([
        requestOperator(buildListPath(tenantId)),
        loadBranches(tenantId),
        loadMembers(tenantId),
      ]);
      state.rows = unwrapArray(listPayload);
      if (!state.selectedId && state.rows.length) {
        state.selectedId = String(state.rows[0].id || '');
      } else if (state.selectedId && !state.rows.some((row) => String(row.id) === state.selectedId)) {
        state.selectedId = state.rows.length ? String(state.rows[0].id || '') : '';
      }
      applyFilters();
      setStatus(`${state.rows.length} vendedor(es)`, 'ok');
    } catch (err) {
      state.rows = [];
      state.error = err?.message || 'Falha ao carregar vendedores.';
      setStatus(state.error, 'error');
    } finally {
      state.loading = false;
      applyFilters();
      renderList();
      renderDetail();
      syncWriteUi();
    }
  };

  const emptyFormValues = () => ({
    name: '',
    displayName: '',
    email: '',
    phone: '',
    whatsappPhone: '',
    documentCpf: '',
    documentRg: '',
    color: '#2563eb',
    kind: 'CONSULTANT',
    employmentType: 'CLT',
    workMode: 'FIELD',
    isEmployee: true,
    employeeRegistration: '',
    internalCode: '',
    hireDate: '',
    terminationDate: '',
    department: 'Comercial',
    position: '',
    territory: '',
    productCommissionPct: '',
    serviceCommissionPct: '',
    monthlyGoal: '',
    commissionNotes: '',
    notes: '',
    isActive: true,
    userId: '',
    branchIds: [],
  });

  const readFormValues = () => {
    const get = (id) => qs(`#${id}`);
    const numOrNull = (id) => {
      const raw = String(get(id)?.value || '').trim();
      if (!raw) return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    };
    const branchSelect = get('scFormBranchIds');
    const branchIds = branchSelect
      ? Array.from(branchSelect.selectedOptions).map((opt) => opt.value).filter(Boolean)
      : [];
    return {
      name: String(get('scFormName')?.value || '').trim(),
      displayName: String(get('scFormDisplayName')?.value || '').trim() || null,
      email: String(get('scFormEmail')?.value || '').trim() || null,
      phone: String(get('scFormPhone')?.value || '').trim() || null,
      whatsappPhone: String(get('scFormWhatsapp')?.value || '').trim() || null,
      documentCpf: String(get('scFormCpf')?.value || '').replace(/\D/g, '') || null,
      documentRg: String(get('scFormRg')?.value || '').trim() || null,
      color: String(get('scFormColor')?.value || '').trim() || null,
      kind: String(get('scFormKind')?.value || 'CONSULTANT').trim(),
      employmentType: String(get('scFormEmployment')?.value || 'CLT').trim(),
      workMode: String(get('scFormWorkMode')?.value || 'FIELD').trim(),
      isEmployee: Boolean(get('scFormIsEmployee')?.checked),
      employeeRegistration: String(get('scFormRegistration')?.value || '').trim() || null,
      internalCode: String(get('scFormInternalCode')?.value || '').trim() || null,
      hireDate: String(get('scFormHireDate')?.value || '').trim() || null,
      terminationDate: String(get('scFormTerminationDate')?.value || '').trim() || null,
      department: String(get('scFormDepartment')?.value || '').trim() || null,
      position: String(get('scFormPosition')?.value || '').trim() || null,
      territory: String(get('scFormTerritory')?.value || '').trim() || null,
      productCommissionPct: numOrNull('scFormProductCommission'),
      serviceCommissionPct: numOrNull('scFormServiceCommission'),
      monthlyGoal: numOrNull('scFormMonthlyGoal'),
      commissionNotes: String(get('scFormCommissionNotes')?.value || '').trim() || null,
      notes: String(get('scFormNotes')?.value || '').trim() || null,
      isActive: Boolean(get('scFormIsActive')?.checked),
      userId: String(get('scFormUserId')?.value || '').trim() || null,
      branchIds,
    };
  };

  const fillForm = (values) => {
    const set = (id, value) => {
      const node = qs(`#${id}`);
      if (!node) return;
      if (node.type === 'checkbox') {
        node.checked = Boolean(value);
      } else {
        node.value = value == null ? '' : String(value);
      }
    };
    const data = { ...emptyFormValues(), ...values };
    set('scFormName', data.name);
    set('scFormDisplayName', data.displayName);
    set('scFormEmail', data.email);
    set('scFormPhone', data.phone);
    set('scFormWhatsapp', data.whatsappPhone);
    set('scFormCpf', data.documentCpf);
    set('scFormRg', data.documentRg);
    set('scFormColor', data.color || '#2563eb');
    set('scFormKind', data.kind);
    set('scFormEmployment', data.employmentType);
    set('scFormWorkMode', data.workMode);
    set('scFormIsEmployee', data.isEmployee);
    set('scFormRegistration', data.employeeRegistration);
    set('scFormInternalCode', data.internalCode);
    set('scFormHireDate', data.hireDate);
    set('scFormTerminationDate', data.terminationDate);
    set('scFormDepartment', data.department);
    set('scFormPosition', data.position);
    set('scFormTerritory', data.territory);
    set('scFormProductCommission', data.productCommissionPct);
    set('scFormServiceCommission', data.serviceCommissionPct);
    set('scFormMonthlyGoal', data.monthlyGoal);
    set('scFormCommissionNotes', data.commissionNotes);
    set('scFormNotes', data.notes);
    set('scFormIsActive', data.isActive);
    set('scFormUserId', data.userId);
    const branchSelect = qs('#scFormBranchIds');
    if (branchSelect) {
      const ids = new Set((Array.isArray(data.branchIds) ? data.branchIds : []).map(String));
      Array.from(branchSelect.options).forEach((opt) => {
        opt.selected = ids.has(String(opt.value));
      });
    }
  };

  const renderFormSelects = () => {
    const renderOptions = (selectId, options, selected) => {
      const select = qs(`#${selectId}`);
      if (!select) return;
      select.innerHTML = options.map((item) => (
        `<option value="${escapeAttr(item.value)}"${item.value === selected ? ' selected' : ''}>${escapeHtml(item.label)}</option>`
      )).join('');
    };
    renderOptions('scFormKind', KIND_OPTIONS.slice(1), 'CONSULTANT');
    renderOptions('scFormEmployment', EMPLOYMENT_OPTIONS.slice(1), 'CLT');
    renderOptions('scFormWorkMode', WORK_MODE_OPTIONS, 'FIELD');

    const userSelect = qs('#scFormUserId');
    if (userSelect) {
      const options = ['<option value="">— Sem utilizador —</option>'];
      state.members.forEach((member) => {
        const id = String(member.userId || member.user_id || member.id || '').trim();
        if (!id) return;
        const label = String(member.fullName || member.email || id).trim();
        options.push(`<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`);
      });
      userSelect.innerHTML = options.join('');
    }

    const branchSelect = qs('#scFormBranchIds');
    if (branchSelect) {
      branchSelect.innerHTML = state.branches.map((branch) => {
        const id = String(branch.id || '').trim();
        const label = String(branch.name || branch.displayName || id).trim();
        return `<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`;
      }).join('');
    }
  };

  const setModalTab = (tabId) => {
    state.editorTab = MODAL_TABS.some((tab) => tab.id === tabId) ? tabId : 'identificacao';
    const tabsRoot = state.dom.modalTabs;
    if (tabsRoot) {
      tabsRoot.querySelectorAll('[data-sc-tab]').forEach((btn) => {
        const active = btn.getAttribute('data-sc-tab') === state.editorTab;
        btn.classList.toggle('is-active', active);
      });
    }
    document.querySelectorAll('[data-sc-tab-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.getAttribute('data-sc-tab-panel') === state.editorTab);
    });
  };

  const openEditor = async (mode, id = '') => {
    if (!state.canWrite && mode !== 'view') return;
    state.editorMode = mode;
    state.editorId = String(id || '').trim();
    renderFormSelects();
    setModalTab('identificacao');

    const title = state.dom.modalTitle;
    const saveBtn = state.dom.modalSave;
    if (title) {
      title.textContent = mode === 'create' ? 'Novo vendedor' : 'Editar vendedor';
    }
    if (saveBtn) saveBtn.hidden = mode === 'view';

    let editorRow = null;
    if (mode === 'create') {
      fillForm(emptyFormValues());
      await resetFormAvatar(null);
    } else {
      try {
        const tenantId = resolveTenantId();
        const payload = await requestOperator(
          `/api/operator/tenants/${encodeURIComponent(tenantId)}/sales-consultants/${encodeURIComponent(state.editorId)}`,
        );
        editorRow = payload && typeof payload === 'object' ? payload : null;
        fillForm(editorRow || emptyFormValues());
        await resetFormAvatar(editorRow);
      } catch (err) {
        window.alert(err?.message || 'Falha ao carregar vendedor.');
        return;
      }
    }

    state.modals.editor?.open?.();
  };

  const closeEditor = () => {
    state.modals.editor?.close?.();
  };

  const saveEditor = async () => {
    const tenantId = resolveTenantId();
    if (!tenantId) return;
    const values = readFormValues();
    if (!values.name) {
      window.alert('Informe o nome do vendedor.');
      setModalTab('identificacao');
      qs('#scFormName')?.focus();
      return;
    }

    const avatarFile = qs('#scFormAvatarFile')?.files?.[0];
    if (avatarFile) {
      if (avatarFile.type !== 'image/jpeg') {
        window.alert('O avatar deve ser um arquivo JPEG.');
        setModalTab('identificacao');
        return;
      }
      if (avatarFile.size > 2 * 1024 * 1024) {
        window.alert('O avatar deve ter no máximo 2 MB.');
        setModalTab('identificacao');
        return;
      }
    }

    const saveBtn = state.dom.modalSave;
    if (saveBtn) saveBtn.disabled = true;
    setStatus('Salvando vendedor...', 'neutral');

    try {
      let consultantId = state.editorId;
      if (state.editorMode === 'create') {
        const created = await requestOperator(
          `/api/operator/tenants/${encodeURIComponent(tenantId)}/sales-consultants`,
          { method: 'POST', body: JSON.stringify(values) },
        );
        consultantId = String(created?.id || '').trim();
        if (consultantId) state.selectedId = consultantId;
      } else {
        await requestOperator(
          `/api/operator/tenants/${encodeURIComponent(tenantId)}/sales-consultants/${encodeURIComponent(state.editorId)}`,
          { method: 'PATCH', body: JSON.stringify(values) },
        );
        state.selectedId = state.editorId;
      }

      if (avatarFile && consultantId) {
        const uploadResult = await uploadAvatar(consultantId, avatarFile);
        const uploadedUrl = String(uploadResult?.avatarUrl || '').trim();
        if (uploadedUrl) {
          revokeAvatarObjectUrls();
        }
      }

      closeEditor();
      await loadList();
      setStatus('Vendedor salvo.', 'ok');
    } catch (err) {
      window.alert(err?.message || 'Falha ao salvar vendedor.');
      setStatus(err?.message || 'Falha ao salvar.', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

  const toggleActive = async () => {
    const row = state.rows.find((item) => String(item.id) === state.selectedId);
    if (!row || !state.canWrite) return;
    const tenantId = resolveTenantId();
    const nextActive = row.isActive === false;
    try {
      await requestOperator(
        `/api/operator/tenants/${encodeURIComponent(tenantId)}/sales-consultants/${encodeURIComponent(state.selectedId)}`,
        { method: 'PATCH', body: JSON.stringify({ isActive: nextActive }) },
      );
      await loadList();
    } catch (err) {
      window.alert(err?.message || 'Falha ao atualizar status.');
    }
  };

  const deleteSelected = async () => {
    if (!state.selectedId || !state.canWrite) return;
    const row = state.rows.find((item) => String(item.id) === state.selectedId);
    const name = row ? displayName(row) : 'este vendedor';
    if (!window.confirm(`Remover ${name}? Esta ação não pode ser desfeita.`)) return;
    const tenantId = resolveTenantId();
    try {
      await requestOperator(
        `/api/operator/tenants/${encodeURIComponent(tenantId)}/sales-consultants/${encodeURIComponent(state.selectedId)}`,
        { method: 'DELETE' },
      );
      state.selectedId = '';
      await loadList();
      setStatus('Vendedor removido.', 'ok');
    } catch (err) {
      window.alert(err?.message || 'Falha ao remover vendedor.');
    }
  };

  const openUsersPanel = () => {
    closeEditor();
    document.querySelector('[data-es-nav="usuarios"]')?.click?.();
  };

  const bindEvents = () => {
    if (state.mounted) return;
    state.mounted = true;

    state.dom.root = qs('#salesConsultantsRoot');
    state.dom.status = qs('#salesConsultantsStatus');
    state.dom.tenantSelect = qs('#salesConsultantsTenant');
    state.dom.search = qs('#salesConsultantsSearch');
    state.dom.filterActive = qs('#salesConsultantsFilterActive');
    state.dom.filterKind = qs('#salesConsultantsFilterKind');
    state.dom.filterEmployment = qs('#salesConsultantsFilterEmployment');
    state.dom.list = qs('#salesConsultantsList');
    state.dom.addButton = qs('#salesConsultantsAdd');
    state.dom.refreshButton = qs('#salesConsultantsRefresh');
    state.dom.readonlyNote = qs('#salesConsultantsReadonlyNote');
    state.dom.detailEmpty = qs('#salesConsultantsDetailEmpty');
    state.dom.detailCard = qs('#salesConsultantsDetailCard');
    state.dom.detailAvatar = qs('#salesConsultantsDetailAvatar');
    state.dom.detailName = qs('#salesConsultantsDetailName');
    state.dom.detailBadges = qs('#salesConsultantsDetailBadges');
    state.dom.detailContacts = qs('#salesConsultantsDetailContacts');
    state.dom.detailKpis = qs('#salesConsultantsDetailKpis');
    state.dom.detailFacts = qs('#salesConsultantsDetailFacts');
    state.dom.detailEdit = qs('#salesConsultantsDetailEdit');
    state.dom.detailToggle = qs('#salesConsultantsDetailToggle');
    state.dom.detailDelete = qs('#salesConsultantsDetailDelete');
    state.dom.modal = qs('#salesConsultantsModal');
    state.dom.modalTitle = qs('#salesConsultantsModalTitle');
    state.dom.modalSave = qs('#salesConsultantsModalSave');
    state.dom.modalTabs = qs('#salesConsultantsModalTabs');

    const modalBackdrop = state.dom.modal;
    state.modals.editor = (window.ReservaAiModal || {
      createModalController(el) {
        return {
          open() { if (el) el.hidden = false; document.body.style.overflow = 'hidden'; },
          close() { if (el) el.hidden = true; document.body.style.removeProperty('overflow'); },
        };
      },
    }).createModalController(modalBackdrop);

    state.dom.tenantSelect?.addEventListener('change', () => {
      state.selectedTenantId = String(state.dom.tenantSelect.value || '').trim();
      state.selectedId = '';
      void loadList();
    });

    state.dom.search?.addEventListener('input', () => {
      state.searchTerm = String(state.dom.search.value || '');
      applyFilters();
      renderList();
    });

    const onFilterChange = () => {
      state.filterActive = String(state.dom.filterActive?.value || '');
      state.filterKind = String(state.dom.filterKind?.value || '');
      state.filterEmployment = String(state.dom.filterEmployment?.value || '');
      void loadList();
    };
    state.dom.filterActive?.addEventListener('change', onFilterChange);
    state.dom.filterKind?.addEventListener('change', onFilterChange);
    state.dom.filterEmployment?.addEventListener('change', onFilterChange);

    state.dom.refreshButton?.addEventListener('click', () => { void loadList(); });
    state.dom.addButton?.addEventListener('click', () => { void openEditor('create'); });
    state.dom.detailEdit?.addEventListener('click', () => {
      if (state.selectedId) void openEditor('edit', state.selectedId);
    });
    state.dom.detailToggle?.addEventListener('click', () => { void toggleActive(); });
    state.dom.detailDelete?.addEventListener('click', () => { void deleteSelected(); });

    state.dom.list?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-sc-action="select"]');
      if (!btn) return;
      state.selectedId = String(btn.getAttribute('data-sc-id') || '');
      renderList();
      renderDetail();
    });

    state.dom.modalTabs?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-sc-tab]');
      if (!btn) return;
      setModalTab(btn.getAttribute('data-sc-tab') || 'identificacao');
    });

    qs('#salesConsultantsModalClose')?.addEventListener('click', closeEditor);
    qs('#salesConsultantsModalCancel')?.addEventListener('click', closeEditor);
    state.dom.modalSave?.addEventListener('click', () => { void saveEditor(); });
    qs('#salesConsultantsOpenUsers')?.addEventListener('click', openUsersPanel);

    qs('#scFormAvatarFile')?.addEventListener('change', (event) => {
      const file = event.target?.files?.[0];
      const preview = qs('#scFormAvatarPreview');
      const wrap = qs('#scFormAvatarPreviewWrap');
      if (!preview || !wrap) return;
      if (state.avatarPreviewUrl) {
        try { URL.revokeObjectURL(state.avatarPreviewUrl); } catch (_err) { /* noop */ }
        state.avatarPreviewUrl = '';
      }
      if (!file) {
        preview.removeAttribute('src');
        wrap.hidden = true;
        return;
      }
      state.avatarPreviewUrl = URL.createObjectURL(file);
      preview.src = state.avatarPreviewUrl;
      wrap.hidden = false;
    });

    modalBackdrop?.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) closeEditor();
    });
  };

  const renderFilterSelects = () => {
    const fill = (select, options, selected) => {
      if (!select) return;
      select.innerHTML = options.map((item) => (
        `<option value="${escapeAttr(item.value)}"${item.value === selected ? ' selected' : ''}>${escapeHtml(item.label)}</option>`
      )).join('');
    };
    fill(state.dom.filterActive, ACTIVE_FILTER_OPTIONS, state.filterActive);
    fill(state.dom.filterKind, KIND_OPTIONS, state.filterKind);
    fill(state.dom.filterEmployment, EMPLOYMENT_OPTIONS, state.filterEmployment);
  };

  function init(options = {}) {
    if (state.initialized) return;
    state.initialized = true;
    state.session = options.session || state.session;
    bindEvents();
    renderFilterSelects();
    renderTenantSelect();
    syncWriteUi();
  }

  function activate(session) {
    state.active = true;
    state.session = session || state.session;
    if (!state.initialized) init({ session: state.session });
    renderTenantSelect();
    renderFilterSelects();
    syncWriteUi();
    void loadList();
  }

  function deactivate() {
    state.active = false;
    closeEditor();
    revokeAvatarObjectUrls();
  }

  window.ReservaAiSalesConsultantsAdmin = {
    init,
    activate,
    deactivate,
  };
})();
