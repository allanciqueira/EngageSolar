/**
 * Configurações → WhatsApp API — perfil WhatsApp Business (Meta).
 * Proxy: /api/operator/meta-whatsapp/* → platform-integrations/meta-whatsapp/*
 */
(function () {
  const API_PREFIX = '/api/operator/meta-whatsapp';
  const ABOUT_MAX = 139;
  const DESCRIPTION_MAX = 512;
  const ADDRESS_MAX = 256;
  const EMAIL_MAX = 128;
  const PICTURE_MAX_BYTES = 5 * 1024 * 1024;

  const state = {
    mounted: false,
    active: false,
    session: null,
    tenantOptions: [],
    selectedTenantId: '',
    verticals: [],
    snapshot: null,
    loadedProfile: null,
    lastSyncAt: null,
    saveCooldownUntil: 0,
    pictureCooldownUntil: 0,
    pendingPictureFile: null,
    dom: {},
  };

  const qs = (sel) => document.querySelector(sel);

  const escapeHtml = (v) => String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const getApi = () => {
    const api = window.ReservaAiApi;
    return api && typeof api.request === 'function' ? api : null;
  };

  const parseApiError = (err) => (
    window.EngageUserMessages?.formatApiError
      ? window.EngageUserMessages.formatApiError(err, { context: 'whatsapp' })
      : String(err?.message || err?.hint || 'Não foi possível completar a ação no WhatsApp.')
  );

  const unwrapPayload = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    const inner = payload.data;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner;
    }
    return payload;
  };

  const tenantQuery = () => {
    const tid = String(state.selectedTenantId || '').trim();
    return tid ? `?tenantId=${encodeURIComponent(tid)}` : '';
  };

  const apiRequest = (path, options = {}) => {
    const api = getApi();
    if (!api) {
      return Promise.reject(new Error('API do admin indisponível.'));
    }
    const url = path.startsWith('/api/') ? path : `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
    const suffix = tenantQuery();
    const withQuery = suffix
      ? (url.includes('?') ? `${url}&${suffix.slice(1)}` : `${url}${suffix}`)
      : url;
    return api.request(withQuery, options);
  };

  const canManageWhatsAppApi = () => {
    const session = state.session
      || window.ReservaAiAdminSession?.getSession?.()
      || window.ReservaAiAdminShell?.getCurrentSession?.();
    return window.ReservaPermissions?.canAccessWhatsAppApi?.(session) === true
      || window.ReservaAiAdminShell?.canAccessWhatsAppApi?.(session) === true;
  };

  const setStatus = (text, tone = 'neutral') => {
    const el = state.dom.status;
    if (!el) return;
    el.textContent = text || '';
    el.dataset.tone = tone || 'neutral';
    el.hidden = !text;
  };

  const formatSyncAgo = () => {
    if (!state.lastSyncAt) return '';
    const diffMs = Date.now() - state.lastSyncAt;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'há instantes';
    if (min === 1) return 'há 1 min';
    return `há ${min} min`;
  };

  const updateSyncLabel = () => {
    const el = state.dom.syncLabel;
    if (!el) return;
    el.textContent = state.lastSyncAt ? `Última sincronização: ${formatSyncAgo()}` : '';
  };

  const normalizeStr = (v) => String(v ?? '').trim();

  const normalizeWebsites = (sites) => {
    const list = Array.isArray(sites) ? sites : [];
    return list.map((u) => normalizeStr(u)).filter(Boolean).slice(0, 2);
  };

  const readFormSnapshot = () => {
    const vertical = normalizeStr(state.dom.vertical?.value);
    return {
      vertical: vertical || null,
      description: normalizeStr(state.dom.description?.value),
      about: normalizeStr(state.dom.about?.value),
      address: normalizeStr(state.dom.address?.value),
      email: normalizeStr(state.dom.email?.value),
      websites: normalizeWebsites([
        state.dom.website1?.value,
        state.dom.website2?.value,
      ]),
    };
  };

  const snapshotFromProfile = (root) => {
    const profile = root?.profile || {};
    const sites = normalizeWebsites(profile.websites);
    return {
      vertical: normalizeStr(profile.vertical) || null,
      description: normalizeStr(profile.description),
      about: normalizeStr(profile.about),
      address: normalizeStr(profile.address),
      email: normalizeStr(profile.email),
      websites: sites,
    };
  };

  const snapshotsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const buildPartialPutBody = () => {
    const current = readFormSnapshot();
    const base = state.snapshot || {};
    const body = {};
    if (current.vertical !== base.vertical) {
      if (current.vertical) body.vertical = current.vertical;
    }
    if (current.description !== base.description) body.description = current.description;
    if (current.about !== base.about) {
      if (current.about) body.about = current.about;
    }
    if (current.address !== base.address) body.address = current.address;
    if (current.email !== base.email) body.email = current.email;
    if (!snapshotsEqual(current.websites, base.websites)) {
      body.websites = current.websites;
    }
    return body;
  };

  const isValidEmail = (email) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const isValidHttpsUrl = (url) => {
    if (!url) return true;
    try {
      const u = new URL(url);
      return u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const validateForm = () => {
    const snap = readFormSnapshot();
    if (snap.about && snap.about.length > ABOUT_MAX) {
      return `Sobre: máximo ${ABOUT_MAX} caracteres.`;
    }
    if (snap.description.length > DESCRIPTION_MAX) {
      return `Descrição: máximo ${DESCRIPTION_MAX} caracteres.`;
    }
    if (snap.address.length > ADDRESS_MAX) {
      return `Endereço: máximo ${ADDRESS_MAX} caracteres.`;
    }
    if (snap.email.length > EMAIL_MAX) {
      return `E-mail: máximo ${EMAIL_MAX} caracteres.`;
    }
    if (!isValidEmail(snap.email)) {
      return 'Informe um e-mail válido.';
    }
    for (const site of snap.websites) {
      if (!isValidHttpsUrl(site)) {
        return 'Sites devem usar https:// (ex.: https://www.exemplo.com.br).';
      }
    }
    return '';
  };

  const renderConnectionCard = (root) => {
    const phone = root?.whatsappPhone || {};
    const display = phone.displayNumberFormatted || phone.displayNumber || '—';
    const verified = normalizeStr(phone.verifiedName);
    const status = normalizeStr(phone.status).toUpperCase() || '—';
    const connected = status === 'CONNECTED';

    if (state.dom.connectionNumber) {
      state.dom.connectionNumber.textContent = display;
    }
    if (state.dom.connectionVerifiedName) {
      state.dom.connectionVerifiedName.textContent = verified || '—';
    }
    if (state.dom.connectionVerifiedBadge) {
      state.dom.connectionVerifiedBadge.hidden = !verified;
    }
    if (state.dom.connectionStatus) {
      state.dom.connectionStatus.textContent = connected ? 'CONECTADO' : status;
      state.dom.connectionStatus.dataset.tone = connected ? 'ok' : 'warn';
    }
    if (state.dom.headerStatus) {
      state.dom.headerStatus.textContent = connected ? 'Conectado' : status;
      state.dom.headerStatus.dataset.tone = connected ? 'ok' : 'warn';
    }
  };

  const renderRateLimits = (root) => {
    const limits = root?.rateLimits || {};
    const prof = limits.profileUpdate || {};
    const pic = limits.profilePicture || {};
    const profMax = prof.maxPerWindow ?? 5;
    const profWin = Math.round((prof.windowMs ?? 300000) / 60000);
    const picMax = pic.maxPerWindow ?? 3;
    const picWin = Math.round((pic.windowMs ?? 600000) / 60000);
    if (state.dom.rateProfile) {
      state.dom.rateProfile.textContent = `${profMax} a cada ${profWin} min`;
    }
    if (state.dom.ratePicture) {
      state.dom.ratePicture.textContent = `${picMax} a cada ${picWin} min`;
    }
  };

  const fillForm = (root) => {
    const profile = root?.profile || {};
    const sites = normalizeWebsites(profile.websites);
    if (state.dom.vertical) {
      state.dom.vertical.value = normalizeStr(profile.vertical) || '';
    }
    if (state.dom.description) state.dom.description.value = normalizeStr(profile.description);
    if (state.dom.about) state.dom.about.value = normalizeStr(profile.about);
    if (state.dom.address) state.dom.address.value = normalizeStr(profile.address);
    if (state.dom.email) state.dom.email.value = normalizeStr(profile.email);
    if (state.dom.website1) state.dom.website1.value = sites[0] || '';
    if (state.dom.website2) state.dom.website2.value = sites[1] || '';
    updateCharCounters();
    const picUrl = normalizeStr(profile.profilePictureUrl);
    if (state.dom.previewImg) {
      if (picUrl) {
        state.dom.previewImg.src = picUrl;
        state.dom.previewImg.hidden = false;
        state.dom.previewPlaceholder?.classList.add('is-hidden');
      } else {
        state.dom.previewImg.removeAttribute('src');
        state.dom.previewImg.hidden = true;
        state.dom.previewPlaceholder?.classList.remove('is-hidden');
      }
    }
    state.snapshot = snapshotFromProfile(root);
  };

  const updateCharCounters = () => {
    if (state.dom.aboutCounter) {
      const n = state.dom.about?.value?.length || 0;
      state.dom.aboutCounter.textContent = `${n} / ${ABOUT_MAX}`;
    }
    if (state.dom.descriptionCounter) {
      const n = state.dom.description?.value?.length || 0;
      state.dom.descriptionCounter.textContent = `${n} / ${DESCRIPTION_MAX}`;
    }
  };

  const renderVerticalOptions = () => {
    const select = state.dom.vertical;
    if (!select) return;
    const current = select.value;
    const options = ['<option value="">Selecione a categoria</option>'];
    state.verticals.forEach((v) => {
      const val = escapeHtml(v.value || '');
      const label = escapeHtml(v.label || v.value || '');
      options.push(`<option value="${val}">${label}</option>`);
    });
    select.innerHTML = options.join('');
    if (current) select.value = current;
  };

  const setFormDisabled = (disabled) => {
    const fields = [
      state.dom.vertical,
      state.dom.description,
      state.dom.about,
      state.dom.address,
      state.dom.email,
      state.dom.website1,
      state.dom.website2,
      state.dom.saveBtn,
      state.dom.uploadBtn,
      state.dom.fileInput,
    ];
    fields.forEach((el) => {
      if (el) el.disabled = disabled;
    });
    if (state.dom.dropzone) {
      state.dom.dropzone.classList.toggle('is-disabled', disabled);
    }
  };

  const showEmptyChannel = (message) => {
    if (state.dom.emptyState) {
      state.dom.emptyState.hidden = false;
      state.dom.emptyState.textContent = message;
    }
    if (state.dom.formShell) state.dom.formShell.hidden = true;
    setFormDisabled(true);
  };

  const hideEmptyChannel = () => {
    if (state.dom.emptyState) state.dom.emptyState.hidden = true;
    if (state.dom.formShell) state.dom.formShell.hidden = false;
    setFormDisabled(false);
    applyCooldownButtons();
  };

  const applyCooldownButtons = () => {
    const now = Date.now();
    if (state.dom.saveBtn) {
      const left = Math.max(0, state.saveCooldownUntil - now);
      state.dom.saveBtn.disabled = left > 0 || !canManageWhatsAppApi();
      if (left > 0) {
        state.dom.saveBtn.textContent = `Aguarde ${Math.ceil(left / 1000)}s`;
      } else {
        state.dom.saveBtn.textContent = 'Guardar na Meta';
      }
    }
    if (state.dom.uploadBtn) {
      const left = Math.max(0, state.pictureCooldownUntil - now);
      state.dom.uploadBtn.disabled = left > 0 || !canManageWhatsAppApi() || !state.pendingPictureFile;
      if (left > 0) {
        state.dom.uploadBtn.textContent = `Aguarde ${Math.ceil(left / 1000)}s`;
      } else {
        state.dom.uploadBtn.textContent = 'Enviar foto para a Meta';
      }
    }
  };

  const startCooldownFromError = (err, kind) => {
    const retry = Number(err?.details?.retryAfterSec ?? err?.retryAfterSec ?? 0);
    if (retry > 0) {
      const until = Date.now() + retry * 1000;
      if (kind === 'picture') state.pictureCooldownUntil = until;
      else state.saveCooldownUntil = until;
      applyCooldownButtons();
      const tick = () => {
        applyCooldownButtons();
        if (Date.now() < Math.max(state.saveCooldownUntil, state.pictureCooldownUntil)) {
          window.setTimeout(tick, 500);
        }
      };
      tick();
    }
  };

  const loadVerticals = async () => {
    if (state.verticals.length) return;
    const api = getApi();
    if (!api) return;
    try {
      const payload = await api.request(`${API_PREFIX}/business-profile/verticals`, { method: 'GET' });
      state.verticals = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
      renderVerticalOptions();
    } catch {
      state.verticals = [];
    }
  };

  const loadProfile = async () => {
    if (!state.selectedTenantId) {
      setStatus('Selecione uma empresa.', 'warn');
      return;
    }
    setStatus('Carregando perfil WhatsApp…', 'neutral');
    setFormDisabled(true);
    try {
      const payload = await apiRequest('/business-profile', { method: 'GET' });
      const root = unwrapPayload(payload);
      state.loadedProfile = root;
      state.lastSyncAt = Date.now();
      updateSyncLabel();
      renderConnectionCard(root);
      renderRateLimits(root);
      fillForm(root);
      hideEmptyChannel();
      setStatus('', 'neutral');
    } catch (err) {
      const code = err?.statusCode || err?.details?.statusCode;
      if (code === 404) {
        showEmptyChannel('Nenhum canal WhatsApp ativo para esta empresa. Conclua o onboarding do WhatsApp antes de configurar o perfil.');
        setStatus('', 'neutral');
        return;
      }
      showEmptyChannel(parseApiError(err));
      setStatus(parseApiError(err), 'error');
    }
  };

  const saveProfile = async () => {
    if (!canManageWhatsAppApi()) return;
    const validation = validateForm();
    if (validation) {
      setStatus(validation, 'warn');
      return;
    }
    const body = buildPartialPutBody();
    if (!Object.keys(body).length) {
      setStatus('Nenhuma alteração para guardar.', 'warn');
      return;
    }
    if (state.dom.saveBtn) state.dom.saveBtn.disabled = true;
    setStatus('Guardando na Meta…', 'neutral');
    try {
      const payload = await apiRequest('/business-profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const root = unwrapPayload(payload);
      state.loadedProfile = root;
      fillForm(root);
      state.lastSyncAt = Date.now();
      updateSyncLabel();
      setStatus('Perfil guardado. As alterações podem demorar alguns minutos a aparecer no WhatsApp.', 'ok');
    } catch (err) {
      if ((err?.statusCode || err?.details?.statusCode) === 429) {
        startCooldownFromError(err, 'save');
      }
      setStatus(parseApiError(err), 'error');
    } finally {
      applyCooldownButtons();
    }
  };

  const uploadPicture = async () => {
    if (!canManageWhatsAppApi() || !state.pendingPictureFile) return;
    const file = state.pendingPictureFile;
    if (file.size > PICTURE_MAX_BYTES) {
      setStatus('Imagem até 5 MB (JPEG ou PNG).', 'warn');
      return;
    }
    const fd = new FormData();
    fd.append('image', file);
    if (state.dom.uploadBtn) state.dom.uploadBtn.disabled = true;
    setStatus('Enviando foto para a Meta…', 'neutral');
    try {
      await apiRequest('/business-profile/profile-picture', {
        method: 'POST',
        body: fd,
      });
      state.pendingPictureFile = null;
      if (state.dom.fileInput) state.dom.fileInput.value = '';
      setStatus('Foto enviada. Pode levar alguns minutos para atualizar no WhatsApp.', 'ok');
      await loadProfile();
    } catch (err) {
      if ((err?.statusCode || err?.details?.statusCode) === 429) {
        startCooldownFromError(err, 'picture');
      }
      setStatus(parseApiError(err), 'error');
    } finally {
      applyCooldownButtons();
    }
  };

  const onFileSelected = (file) => {
    if (!file) return;
    const type = String(file.type || '').toLowerCase();
    if (!type.includes('jpeg') && !type.includes('jpg') && !type.includes('png')) {
      setStatus('Use JPEG ou PNG.', 'warn');
      return;
    }
    if (file.size > PICTURE_MAX_BYTES) {
      setStatus('Imagem até 5 MB.', 'warn');
      return;
    }
    state.pendingPictureFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      if (state.dom.previewImg && typeof reader.result === 'string') {
        state.dom.previewImg.src = reader.result;
        state.dom.previewImg.hidden = false;
        state.dom.previewPlaceholder?.classList.add('is-hidden');
      }
    };
    reader.readAsDataURL(file);
    applyCooldownButtons();
    setStatus('Pré-visualização pronta. Clique em «Enviar foto para a Meta».', 'neutral');
  };

  const populateTenantSelect = () => {
    const select = state.dom.tenantSelect;
    if (!select) return;
    const options = state.tenantOptions.map((t) => {
      const id = escapeHtml(t.id || '');
      const name = escapeHtml(t.name || id);
      return `<option value="${id}">${name}</option>`;
    });
    select.innerHTML = options.length ? options.join('') : '<option value="">—</option>';
    if (state.selectedTenantId) {
      select.value = state.selectedTenantId;
    }
  };

  const resolveTenantOptions = (session) => {
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const options = tenants
      .map((t) => ({
        id: String(t?.id || t?.tenantId || '').trim(),
        name: String(t?.name || t?.tenantName || t?.legalName || t?.tradeName || '').trim(),
      }))
      .filter((t) => t.id);
    const fallbackId = window.ReservaPermissions?.resolveEffectiveTenantId
      ? window.ReservaPermissions.resolveEffectiveTenantId(session)
      : String(session?.activeTenantId || session?.tenantId || '').trim();
    const fallbackName = String(
      session?.tenantName
      || session?.tenant?.name
      || session?.tenant?.tenantName
      || 'Empresa',
    ).trim();
    if (fallbackId && !options.some((item) => item.id === fallbackId)) {
      options.unshift({ id: fallbackId, name: fallbackName || fallbackId });
    }
    return options;
  };

  const bindDom = () => {
    const root = qs('#waApiRoot');
    if (!root) return;
    state.dom = {
      root,
      tenantSelect: qs('#waApiTenant'),
      refreshBtn: qs('#waApiRefresh'),
      status: qs('#waApiStatus'),
      syncLabel: qs('#waApiSyncLabel'),
      headerStatus: qs('#waApiHeaderStatus'),
      emptyState: qs('#waApiEmptyState'),
      formShell: qs('#waApiFormShell'),
      connectionNumber: qs('#waApiConnectionNumber'),
      connectionVerifiedName: qs('#waApiConnectionVerifiedName'),
      connectionVerifiedBadge: qs('#waApiConnectionVerified'),
      connectionStatus: qs('#waApiConnectionStatus'),
      vertical: qs('#waApiVertical'),
      description: qs('#waApiDescription'),
      about: qs('#waApiAbout'),
      address: qs('#waApiAddress'),
      email: qs('#waApiEmail'),
      website1: qs('#waApiWebsite1'),
      website2: qs('#waApiWebsite2'),
      aboutCounter: qs('#waApiAboutCounter'),
      descriptionCounter: qs('#waApiDescriptionCounter'),
      dropzone: qs('#waApiDropzone'),
      fileInput: qs('#waApiFileInput'),
      previewImg: qs('#waApiPreviewImg'),
      previewPlaceholder: qs('#waApiPreviewPlaceholder'),
      uploadBtn: qs('#waApiUploadPicture'),
      saveBtn: qs('#waApiSave'),
      rateProfile: qs('#waApiRateProfile'),
      ratePicture: qs('#waApiRatePicture'),
      readonlyNote: qs('#waApiReadonlyNote'),
    };
  };

  const bindEvents = () => {
    if (state.mounted) return;
    state.mounted = true;

    state.dom.tenantSelect?.addEventListener('change', () => {
      state.selectedTenantId = state.dom.tenantSelect?.value || '';
      void loadProfile();
    });

    state.dom.refreshBtn?.addEventListener('click', () => {
      void loadProfile();
    });

    state.dom.saveBtn?.addEventListener('click', () => {
      void saveProfile();
    });

    state.dom.uploadBtn?.addEventListener('click', () => {
      void uploadPicture();
    });

    [state.dom.about, state.dom.description].forEach((el) => {
      el?.addEventListener('input', updateCharCounters);
    });

    state.dom.fileInput?.addEventListener('change', (e) => {
      const file = e.target?.files?.[0];
      onFileSelected(file);
    });

    state.dom.dropzone?.addEventListener('click', () => {
      if (!state.dom.dropzone?.classList.contains('is-disabled')) {
        state.dom.fileInput?.click();
      }
    });

    state.dom.dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      state.dom.dropzone?.classList.add('is-dragover');
    });

    state.dom.dropzone?.addEventListener('dragleave', () => {
      state.dom.dropzone?.classList.remove('is-dragover');
    });

    state.dom.dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      state.dom.dropzone?.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      onFileSelected(file);
    });

    window.setInterval(() => {
      if (state.active) updateSyncLabel();
    }, 30000);
  };

  const applyReadonlyMode = () => {
    const canEdit = canManageWhatsAppApi();
    if (state.dom.readonlyNote) {
      state.dom.readonlyNote.hidden = canEdit;
    }
    if (!canEdit) {
      setFormDisabled(true);
      return;
    }
    applyCooldownButtons();
  };

  window.ReservaAiWhatsAppBusinessProfile = {
    async activate(session) {
      let resolved = session || window.ReservaAiAdminSession?.getSession?.() || state.session;
      if (resolved && window.ReservaPermissions?.mergeOperatorAuthMe && window.EngageSolarApi?.request) {
        try {
          const me = await window.EngageSolarApi.request('/api/operator/auth/me');
          resolved = window.ReservaPermissions.mergeOperatorAuthMe(resolved, me);
        } catch (_err) {
          /* perfil/perm: segue com sessão atual */
        }
      }
      state.session = resolved;
      state.active = true;
      bindDom();
      bindEvents();
      if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
        state.session = await window.ReservaPermissions.enrichSessionWithOperatorMe(state.session);
      }
      state.tenantOptions = resolveTenantOptions(state.session);
      state.selectedTenantId = window.ReservaPermissions?.resolveEffectiveTenantId
        ? window.ReservaPermissions.resolveEffectiveTenantId(state.session)
        : String(
          state.session?.activeTenantId
          || state.session?.tenantId
          || state.tenantOptions[0]?.id
          || '',
        ).trim();
      populateTenantSelect();
      applyReadonlyMode();
      await loadVerticals();
      await loadProfile();
    },
    deactivate() {
      state.active = false;
      state.pendingPictureFile = null;
    },
    reload() {
      if (!state.active) return;
      void loadProfile();
    },
  };
})();
