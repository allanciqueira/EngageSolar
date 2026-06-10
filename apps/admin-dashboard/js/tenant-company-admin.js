(function () {
  const API_BASE = `${window.RESERVAAI_EXTERNAL_API_BASE_URL || '/api/operator'}`.replace(/\/$/, '');
  const LOGO_MAX_BYTES = 1024 * 1024;
  const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

  const API_SEGMENT_LABELS = {
    barber: 'Barbearia',
    beauty: 'Beleza / Salão',
    solar: 'Solar',
    spa: 'Spa',
    other: 'Outros',
  };

  const EDITABLE_FIELD_KEYS = [
    'legalName',
    'tradeName',
    'responsibleName',
    'financialResponsibleName',
    'phone',
    'businessEmail',
    'addressLine1',
    'addressLine2',
    'addressNeighborhood',
    'addressCity',
    'addressState',
    'addressPostalCode',
    'addressCountry',
  ];

  const state = {
    active: false,
    session: null,
    me: null,
    tenantOptions: [],
    tenantId: '',
    botEnabled: true,
    loadedTenant: null,
    pendingLogoBase64: null,
    pendingLogoMimeType: null,
    clearLogo: false,
    dom: {},
    bound: false,
  };

  const qs = (sel) => document.querySelector(sel);

  const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

  const normalizeText = (value) => String(value || '').trim();

  const formatCnpj = (value) => {
    const digits = onlyDigits(value);
    if (digits.length !== 14) return digits || '—';
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const formatCep = (value) => {
    const digits = onlyDigits(value);
    if (digits.length !== 8) return digits;
    return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  };

  const formatWhatsappApi = (value) => {
    const digits = onlyDigits(value);
    if (!digits) return '—';
    if (digits.length >= 12 && digits.startsWith('55')) {
      const ddd = digits.slice(2, 4);
      const rest = digits.slice(4);
      if (rest.length >= 9) {
        return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
      }
    }
    return `+${digits}`;
  };

  const segmentDisplay = (segment) => {
    const key = normalizeText(segment).toLowerCase();
    if (!key) return '—';
    const label = API_SEGMENT_LABELS[key];
    return label ? `${label} (${segment})` : segment;
  };

  const getToken = () => window.ReservaAiAuth?.getAccessToken?.()
    || state.session?.externalAccessToken
    || '';

  const requestApi = async (path, options = {}) => {
    const token = getToken();
    if (!token) {
      window.ReservaAiAuth?.redirectToLogin?.('token_required');
      throw new Error('Sessão autenticada indisponível.');
    }
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'omit',
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');
    if (response.status === 401) {
      window.ReservaAiAuth?.clearSession?.();
      window.ReservaAiAuth?.redirectToLogin?.('token_required');
      throw new Error('Sessão expirada.');
    }
    if (!response.ok) {
      const message = typeof payload === 'string'
        ? payload
        : payload?.message || `Falha na API (${response.status}).`;
      throw new Error(Array.isArray(message) ? message.join(', ') : message);
    }
    return payload;
  };

  const tenantQuery = () => {
    const tid = normalizeText(state.tenantId);
    return tid ? `?tenantId=${encodeURIComponent(tid)}` : '';
  };

  const canEdit = () => {
    const perms = window.ReservaPermissions;
    if (perms?.canManageOperatorTenant) {
      const options = state.tenantOptions.length ? state.tenantOptions : (state.session?.tenants || []);
      return perms.canManageOperatorTenant(state.session, state.tenantId, options, state.me);
    }
    if (!state.tenantId) return false;
    if (state.session?.platformRole === 'PLATFORM_ADMIN') return true;
    if (state.session?.canManageTenant === true) return true;
    const tenant = (state.session?.tenants || []).find((item) => String(item.id || item.tenantId) === state.tenantId);
    return tenant?.canManageTenant !== false;
  };

  const setInlineStatus = (text, tone = 'neutral') => {
    const el = state.dom.status;
    if (!el) return;
    el.textContent = text || '';
    el.dataset.tone = tone || 'neutral';
    el.hidden = !text;
  };

  const editableDomFields = () => [
    state.dom.legalName,
    state.dom.tradeName,
    state.dom.responsibleName,
    state.dom.financialResponsibleName,
    state.dom.phone,
    state.dom.businessEmail,
    state.dom.addressLine1,
    state.dom.addressLine2,
    state.dom.addressNeighborhood,
    state.dom.addressCity,
    state.dom.addressState,
    state.dom.addressPostalCode,
    state.dom.addressCountry,
    state.dom.saveBtn,
    state.dom.logoInput,
    state.dom.logoRemove,
  ];

  const setFormDisabled = (disabled) => {
    editableDomFields().forEach((el) => {
      if (el) el.disabled = disabled;
    });
    if (state.dom.logoDropzone) {
      state.dom.logoDropzone.classList.toggle('is-disabled', disabled);
    }
  };

  const applyReadonlyMode = () => {
    const editable = canEdit();
    if (state.dom.readonlyNote) {
      state.dom.readonlyNote.hidden = editable;
    }
    setFormDisabled(!editable);
  };

  const logoSrcFromTenant = (tenant) => {
    if (!tenant) return '';
    if (tenant.logoBase64) {
      const mime = tenant.logoMimeType || 'image/png';
      const raw = String(tenant.logoBase64);
      if (raw.startsWith('data:')) return raw;
      return `data:${mime};base64,${raw}`;
    }
    return '';
  };

  const renderLogoPreview = () => {
    const src = state.pendingLogoBase64 && state.pendingLogoMimeType
      ? `data:${state.pendingLogoMimeType};base64,${state.pendingLogoBase64}`
      : (state.clearLogo ? '' : logoSrcFromTenant(state.loadedTenant));
    if (state.dom.logoPreview) {
      if (src) {
        state.dom.logoPreview.src = src;
        state.dom.logoPreview.hidden = false;
      } else {
        state.dom.logoPreview.removeAttribute('src');
        state.dom.logoPreview.hidden = true;
      }
    }
    if (state.dom.logoPlaceholder) {
      state.dom.logoPlaceholder.hidden = Boolean(src);
    }
    if (state.dom.logoRemove) {
      const hasLogo = Boolean(src) && canEdit();
      state.dom.logoRemove.hidden = !hasLogo;
    }
  };

  const readFieldValue = (key) => {
    const el = state.dom[key];
    if (!el) return '';
    if (key === 'addressPostalCode') return onlyDigits(el.value);
    if (key === 'addressState' || key === 'addressCountry') {
      const value = normalizeText(el.value).toUpperCase();
      if (key === 'addressCountry' && !value) return 'BR';
      return value;
    }
    if (key === 'businessEmail') return normalizeText(el.value).toLowerCase();
    if (key === 'tradeName' || key === 'addressLine2' || key === 'addressNeighborhood') {
      const value = normalizeText(el.value);
      return value || null;
    }
    return normalizeText(el.value);
  };

  const loadedFieldValue = (key, tenant) => {
    const raw = tenant?.[key];
    if (key === 'addressPostalCode') return onlyDigits(raw);
    if (key === 'tradeName' || key === 'addressLine2' || key === 'addressNeighborhood') {
      return normalizeText(raw) || null;
    }
    if (key === 'businessEmail') return normalizeText(raw).toLowerCase();
    if (key === 'addressState' || key === 'addressCountry') {
      return normalizeText(raw).toUpperCase();
    }
    if (key === 'addressCountry' && !normalizeText(raw)) return 'BR';
    return normalizeText(raw);
  };

  const fillForm = (tenant) => {
    state.loadedTenant = tenant || null;
    state.pendingLogoBase64 = null;
    state.pendingLogoMimeType = null;
    state.clearLogo = false;

    if (state.dom.platformName) state.dom.platformName.value = tenant?.name || '—';
    if (state.dom.segment) state.dom.segment.value = segmentDisplay(tenant?.segment);
    if (state.dom.negocio) state.dom.negocio.value = tenant?.negocio || '—';
    if (state.dom.cnpj) state.dom.cnpj.value = tenant?.cnpj ? formatCnpj(tenant.cnpj) : '—';
    if (state.dom.whatsappApi) state.dom.whatsappApi.value = formatWhatsappApi(tenant?.whatsappApiNumber);

    if (state.dom.legalName) state.dom.legalName.value = tenant?.legalName || '';
    if (state.dom.tradeName) state.dom.tradeName.value = tenant?.tradeName || '';
    if (state.dom.responsibleName) state.dom.responsibleName.value = tenant?.responsibleName || '';
    if (state.dom.financialResponsibleName) {
      state.dom.financialResponsibleName.value = tenant?.financialResponsibleName || '';
    }
    if (state.dom.phone) state.dom.phone.value = tenant?.phone || '';
    if (state.dom.businessEmail) state.dom.businessEmail.value = tenant?.businessEmail || '';
    if (state.dom.addressLine1) state.dom.addressLine1.value = tenant?.addressLine1 || '';
    if (state.dom.addressLine2) state.dom.addressLine2.value = tenant?.addressLine2 || '';
    if (state.dom.addressNeighborhood) {
      state.dom.addressNeighborhood.value = tenant?.addressNeighborhood || '';
    }
    if (state.dom.addressCity) state.dom.addressCity.value = tenant?.addressCity || '';
    if (state.dom.addressState) state.dom.addressState.value = tenant?.addressState || '';
    if (state.dom.addressPostalCode) {
      state.dom.addressPostalCode.value = formatCep(tenant?.addressPostalCode);
    }
    if (state.dom.addressCountry) {
      state.dom.addressCountry.value = tenant?.addressCountry || 'BR';
    }
    if (state.dom.logoInput) state.dom.logoInput.value = '';
    renderLogoPreview();
    applyReadonlyMode();
  };

  const validateForm = () => {
    const legalName = readFieldValue('legalName');
    const responsibleName = readFieldValue('responsibleName');
    const financialResponsibleName = readFieldValue('financialResponsibleName');
    const phone = readFieldValue('phone');
    const businessEmail = readFieldValue('businessEmail');
    const addressLine1 = readFieldValue('addressLine1');
    const addressCity = readFieldValue('addressCity');
    const addressState = readFieldValue('addressState');
    const addressPostalCode = readFieldValue('addressPostalCode');
    const addressCountry = readFieldValue('addressCountry') || 'BR';

    if (legalName.length < 2) return 'Informe a razão social (mín. 2 caracteres).';
    if (responsibleName.length < 2) return 'Informe o nome do responsável (mín. 2 caracteres).';
    if (financialResponsibleName.length < 2) {
      return 'Informe o responsável financeiro (mín. 2 caracteres).';
    }
    if (phone.length < 8) return 'Informe um telefone comercial válido.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
      return 'Informe um e-mail comercial válido.';
    }
    if (addressLine1.length < 2) return 'Informe o logradouro e número.';
    if (addressCity.length < 2) return 'Informe a cidade.';
    if (!/^[A-Z]{2}$/.test(addressState)) return 'UF deve ter 2 letras (ex.: SP).';
    if (addressPostalCode.length !== 8) return 'CEP deve ter 8 dígitos.';
    if (!/^[A-Z]{2}$/.test(addressCountry)) return 'País deve ter 2 letras (ex.: BR).';
    return '';
  };

  const buildCompanyPayload = () => {
    const company = {};
    EDITABLE_FIELD_KEYS.forEach((key) => {
      company[key] = readFieldValue(key);
    });
    if (company.addressCountry === '') {
      company.addressCountry = 'BR';
    }
    if (state.clearLogo) {
      company.clearLogo = true;
    } else if (state.pendingLogoBase64 && state.pendingLogoMimeType) {
      company.logoBase64 = state.pendingLogoBase64;
      company.logoMimeType = state.pendingLogoMimeType;
    }
    return company;
  };

  const hasSaveableChanges = () => {
    const loaded = state.loadedTenant || {};
    const fieldsChanged = EDITABLE_FIELD_KEYS.some((key) => {
      return readFieldValue(key) !== loadedFieldValue(key, loaded);
    });
    const logoChanged = Boolean(state.pendingLogoBase64) || state.clearLogo;
    return fieldsChanged || logoChanged;
  };

  const load = async () => {
    if (!state.tenantId) {
      setInlineStatus('Selecione uma empresa.', 'warn');
      return;
    }
    setInlineStatus('Carregando dados da empresa…', 'neutral');
    setFormDisabled(true);
    try {
      const [tenant, settings] = await Promise.all([
        requestApi(`/tenants/${encodeURIComponent(state.tenantId)}`),
        requestApi(`/tenant-settings${tenantQuery()}`),
      ]);
      state.botEnabled = typeof settings?.botEnabled === 'boolean' ? settings.botEnabled : true;
      const company = settings?.company && typeof settings.company === 'object' ? settings.company : {};
      fillForm({ ...tenant, ...company, name: tenant?.name || company?.name });
      setInlineStatus('', 'neutral');
    } catch (err) {
      setInlineStatus(err?.message || 'Não foi possível carregar os dados da empresa.', 'error');
      setFormDisabled(true);
    }
  };

  const save = async () => {
    if (!canEdit()) {
      setInlineStatus('Sem permissão para alterar estes dados.', 'warn');
      return;
    }
    const validation = validateForm();
    if (validation) {
      setInlineStatus(validation, 'warn');
      return;
    }
    if (!hasSaveableChanges()) {
      setInlineStatus('Nenhuma alteração para guardar.', 'warn');
      return;
    }
    if (state.dom.saveBtn) state.dom.saveBtn.disabled = true;
    setInlineStatus('Guardando dados da empresa…', 'neutral');
    try {
      const payload = {
        botEnabled: state.botEnabled,
        company: buildCompanyPayload(),
      };
      await requestApi(`/tenant-settings${tenantQuery()}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await window.ReservaAiAdminAudit?.record?.({
        sourceModule: 'operacao',
        actionType: 'TENANT_COMPANY_UPDATED',
        entityType: 'tenant',
        entityId: state.tenantId,
        description: 'Dados cadastrais da empresa atualizados.',
        details: { tenantId: state.tenantId },
      });
      setInlineStatus('Dados da empresa guardados com sucesso.', 'ok');
      await load();
    } catch (err) {
      setInlineStatus(err?.message || 'Não foi possível guardar os dados.', 'error');
    } finally {
      applyReadonlyMode();
    }
  };

  const fileToLogoPayload = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o logótipo.'));
    reader.readAsDataURL(file);
  });

  const onLogoSelected = async (file) => {
    if (!file || !canEdit()) return;
    if (!LOGO_TYPES.has(file.type)) {
      setInlineStatus('Formato inválido. Use PNG, JPEG, WebP ou GIF.', 'warn');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setInlineStatus('O logótipo deve ter no máximo 1 MiB.', 'warn');
      return;
    }
    try {
      const logo = await fileToLogoPayload(file);
      state.pendingLogoBase64 = logo.base64;
      state.pendingLogoMimeType = logo.mimeType;
      state.clearLogo = false;
      renderLogoPreview();
      setInlineStatus('', 'neutral');
    } catch (err) {
      setInlineStatus(err?.message || 'Não foi possível processar o logótipo.', 'error');
    }
  };

  const bindDom = () => {
    if (state.dom.root) return;
    const root = qs('#tenantCompanyRoot');
    if (!root) return;
    state.dom = {
      root,
      status: qs('#tenantCompanyStatus'),
      readonlyNote: qs('#tenantCompanyReadonlyNote'),
      platformName: qs('#tenantCompanyPlatformName'),
      segment: qs('#tenantCompanySegment'),
      negocio: qs('#tenantCompanyNegocio'),
      cnpj: qs('#tenantCompanyCnpj'),
      whatsappApi: qs('#tenantCompanyWhatsappApi'),
      legalName: qs('#tenantCompanyLegalName'),
      tradeName: qs('#tenantCompanyTradeName'),
      responsibleName: qs('#tenantCompanyResponsibleName'),
      financialResponsibleName: qs('#tenantCompanyFinancialResponsibleName'),
      phone: qs('#tenantCompanyPhone'),
      businessEmail: qs('#tenantCompanyBusinessEmail'),
      addressLine1: qs('#tenantCompanyAddressLine1'),
      addressLine2: qs('#tenantCompanyAddressLine2'),
      addressNeighborhood: qs('#tenantCompanyAddressNeighborhood'),
      addressCity: qs('#tenantCompanyAddressCity'),
      addressState: qs('#tenantCompanyAddressState'),
      addressPostalCode: qs('#tenantCompanyAddressPostalCode'),
      addressCountry: qs('#tenantCompanyAddressCountry'),
      logoDropzone: qs('#tenantCompanyLogoDropzone'),
      logoInput: qs('#tenantCompanyLogoInput'),
      logoPreview: qs('#tenantCompanyLogoPreview'),
      logoPlaceholder: qs('#tenantCompanyLogoPlaceholder'),
      logoRemove: qs('#tenantCompanyLogoRemove'),
      saveBtn: qs('#tenantCompanySave'),
    };
  };

  const bindEvents = () => {
    if (state.bound) return;
    state.bound = true;

    state.dom.saveBtn?.addEventListener('click', () => { void save(); });

    state.dom.logoDropzone?.addEventListener('click', () => {
      if (!canEdit()) return;
      state.dom.logoInput?.click();
    });
    state.dom.logoDropzone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        state.dom.logoInput?.click();
      }
    });
    state.dom.logoInput?.addEventListener('change', () => {
      void onLogoSelected(state.dom.logoInput?.files?.[0]);
    });
    state.dom.logoDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (canEdit()) state.dom.logoDropzone?.classList.add('is-dragover');
    });
    state.dom.logoDropzone?.addEventListener('dragleave', () => {
      state.dom.logoDropzone?.classList.remove('is-dragover');
    });
    state.dom.logoDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      state.dom.logoDropzone?.classList.remove('is-dragover');
      void onLogoSelected(e.dataTransfer?.files?.[0]);
    });
    state.dom.logoRemove?.addEventListener('click', () => {
      if (!canEdit()) return;
      state.pendingLogoBase64 = null;
      state.pendingLogoMimeType = null;
      state.clearLogo = true;
      if (state.dom.logoInput) state.dom.logoInput.value = '';
      renderLogoPreview();
    });

    state.dom.addressState?.addEventListener('input', () => {
      state.dom.addressState.value = normalizeText(state.dom.addressState.value).toUpperCase().slice(0, 2);
    });
    state.dom.addressCountry?.addEventListener('input', () => {
      state.dom.addressCountry.value = normalizeText(state.dom.addressCountry.value).toUpperCase().slice(0, 2);
    });
    state.dom.addressPostalCode?.addEventListener('input', () => {
      const digits = onlyDigits(state.dom.addressPostalCode.value).slice(0, 8);
      state.dom.addressPostalCode.value = digits.length > 5
        ? `${digits.slice(0, 5)}-${digits.slice(5)}`
        : digits;
    });
  };

  const resolveTenantId = (context) => {
    const fromContext = normalizeText(context?.tenantId);
    if (fromContext) return fromContext;
    const fromSelect = normalizeText(document.getElementById('operatorConfigTenant')?.value);
    if (fromSelect) return fromSelect;
    const session = context?.session || state.session;
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return normalizeText(fromResolver);
    return normalizeText(
      session?.activeTenantId
      || session?.tenantId
      || session?.tenant?.id
      || '',
    );
  };

  window.ReservaAiTenantCompany = {
    async activate(context) {
      bindDom();
      bindEvents();
      state.active = true;
      state.session = context?.session || window.ReservaAiAdminShell?.getCurrentSession?.() || state.session;
      state.me = context?.me || state.me;
      state.tenantOptions = Array.isArray(context?.tenantOptions) ? context.tenantOptions : state.tenantOptions;
      state.tenantId = resolveTenantId(context);
      applyReadonlyMode();
      await load();
    },
    deactivate() {
      state.active = false;
      setInlineStatus('', 'neutral');
    },
    async reload(context) {
      if (!state.active) return;
      if (context?.tenantId) state.tenantId = normalizeText(context.tenantId);
      if (context?.session) state.session = context.session;
      if (context?.me) state.me = context.me;
      if (Array.isArray(context?.tenantOptions)) state.tenantOptions = context.tenantOptions;
      await load();
    },
  };
})();
