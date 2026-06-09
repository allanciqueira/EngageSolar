(function () {
  const authService = window.ReservaAiAuth;
  const modalFactory = window.ReservaAiModal || {
    createModalController(backdropElement) {
      if (!backdropElement) {
        return {
          open() {},
          close() {},
          isOpen() { return false; },
        };
      }
      return {
        open() { backdropElement.hidden = false; document.body.style.overflow = 'hidden'; },
        close() { backdropElement.hidden = true; document.body.style.removeProperty('overflow'); },
        isOpen() { return !backdropElement.hidden; },
      };
    },
  };
  const membersTable = window.ReservaAiMembersTable || {
    renderRows(members) {
      const safeMembers = Array.isArray(members) ? members : [];
      if (!safeMembers.length) {
        return '<tr><td colspan="6" class="security-admin-empty">Nenhum usuário encontrado.</td></tr>';
      }
      return safeMembers.map((item) => `
        <tr>
          <td><strong>${String(item.fullName || item.email || '')}</strong></td>
          <td>${String(item.email || '')}</td>
          <td>${String(item.role || '')}</td>
          <td>${item.isActive ? 'Ativo' : 'Inativo'}</td>
          <td>${String(item.lastLoginAt || '')}</td>
          <td><button class="btn btn-ghost" type="button" data-users-action="edit" data-membership-id="${String(item.membershipId || '')}">Editar</button></td>
        </tr>
      `).join('');
    },
    renderMobileCards(members) {
      const safeMembers = Array.isArray(members) ? members : [];
      return safeMembers.map((item) => `<article class="members-mobile-card"><strong>${String(item.fullName || item.email || '')}</strong></article>`).join('');
    },
  };

  const state = {
    mounted: false,
    initialized: false,
    session: null,
    me: null,
    active: false,
    tenantOptions: [],
    selectedTenantId: '',
    members: [],
    filteredMembers: [],
    editingMembershipId: '',
    editingUserId: '',
    dom: {},
    modals: {},
  };

  function qs(selector) { return document.querySelector(selector); }

  function isManagerSession(session) {
    if (session?.canManageTenant === true) return true;
    const memberships = Array.isArray(session?.tenants) ? session.tenants : [];
    return memberships.some((tenant) => {
      const role = String(tenant?.role || '').toUpperCase();
      return tenant?.canManageTenant === true || role === 'OWNER' || role === 'ADMIN' || role === 'TENANT_ADMIN';
    });
  }

  function normalizeTenantOption(tenant) {
    const role = String(tenant?.role || '').toUpperCase();
    return {
      id: tenant?.id || tenant?.tenantId || '',
      name: tenant?.name || tenant?.legalName || tenant?.tradeName || 'Empresa sem nome',
      canManageTenant: tenant?.canManageTenant === true || role === 'OWNER' || role === 'ADMIN' || role === 'TENANT_ADMIN',
    };
  }

  function setStatus(message, tone = 'neutral') {
    if (!state.dom.status) return;
    state.dom.status.textContent = message;
    state.dom.status.dataset.tone = tone;
  }

  function setFeedback(message, tone = 'neutral') {
    if (!state.dom.feedback) return;
    state.dom.feedback.textContent = message;
    state.dom.feedback.dataset.tone = tone;
  }

  function toNullableTrimmed(value) {
    const safe = String(value || '').trim();
    return safe ? safe : null;
  }

  function toNullableNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toDateOnly(value) {
    const safe = String(value || '').trim();
    return safe || null;
  }

  function formatDateOnly(value) {
    if (!value) return '';
    const source = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function formatDateTime(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch (error) {
      return '';
    }
  }

  async function requestExternal(path, options = {}) {
    const token = state.session?.externalAccessToken || authService?.getAccessToken?.() || '';
    if (!token) throw new Error('Token externo indisponível.');

    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (options.body && !isMultipart && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`/api/operator${path}`, {
      ...options,
      headers,
      credentials: options.credentials || 'include',
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || payload?.error || `Falha (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  function renderTenants() {
    if (!state.dom.tenant) return;
    state.dom.tenant.innerHTML = state.tenantOptions.map((tenant) => `<option value="${tenant.id}">${tenant.name}</option>`).join('');
    state.dom.tenant.value = state.selectedTenantId || '';
  }

  function applyFilters() {
    const query = String(state.dom.search?.value || '').trim().toLowerCase();
    const role = String(state.dom.roleFilter?.value || '').toUpperCase();
    state.filteredMembers = state.members.filter((item) => {
      const text = `${item.fullName || ''} ${item.email || ''}`.toLowerCase();
      const matchesQuery = !query || text.includes(query);
      const matchesRole = !role || String(item.role || '').toUpperCase() === role;
      return matchesQuery && matchesRole;
    });
    renderMembers();
  }

  function renderMembers() {
    state.dom.tableBody.innerHTML = membersTable.renderRows(state.filteredMembers);
    state.dom.mobileList.innerHTML = membersTable.renderMobileCards(state.filteredMembers);
  }

  async function bootstrap() {
    if (state.initialized) return;
    setStatus('Carregando empresas...', 'neutral');
    const me = await requestExternal('/auth/me');
    state.me = me;
    if (me?.platformRole === 'PLATFORM_ADMIN') {
      const tenants = await requestExternal('/tenants');
      state.tenantOptions = (Array.isArray(tenants) ? tenants : []).map(normalizeTenantOption);
    } else {
      state.tenantOptions = (Array.isArray(me?.tenants) ? me.tenants : [])
        .map(normalizeTenantOption)
        .filter((tenant) => tenant.canManageTenant);
    }
    state.selectedTenantId = state.tenantOptions[0]?.id || '';
    renderTenants();
    state.initialized = true;
  }

  async function loadMembers() {
    if (!state.selectedTenantId) {
      state.members = [];
      applyFilters();
      setStatus('Nenhuma empresa disponível.', 'warn');
      return;
    }
    setStatus('Carregando usuários...', 'neutral');
    const rows = await requestExternal(`/tenants/${encodeURIComponent(state.selectedTenantId)}/members`);
    state.members = Array.isArray(rows) ? rows : [];
    applyFilters();
    setStatus('Usuários carregados.', 'success');
  }

  function resetCreateForm() {
    state.dom.createForm?.reset();
    if (state.dom.createIsActive) state.dom.createIsActive.checked = true;
    if (state.dom.createRole) state.dom.createRole.value = 'OPERATOR';
  }

  function resetEditForm() {
    state.dom.editForm?.reset();
    state.editingMembershipId = '';
    state.editingUserId = '';
    state.dom.editTabs?.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.usersTab === 'main');
    });
    document.querySelectorAll('[data-users-tab-content]').forEach((section) => {
      section.classList.toggle('is-active', section.dataset.usersTabContent === 'main');
    });
  }

  function fillEditForm(member, profile) {
    state.dom.editFullName.value = member.fullName || '';
    state.dom.editEmail.value = member.email || '';
    state.dom.editRole.value = member.role || 'OPERATOR';
    state.dom.editPhone.value = member.phone || '';
    state.dom.editPhoneSecondary.value = profile?.phoneSecondary || '';
    state.dom.editWhatsapp.value = profile?.whatsapp || '';
    state.dom.editIsActive.checked = Boolean(member.isActive);
    state.dom.editSocialName.value = profile?.socialName || '';
    state.dom.editBirthDate.value = formatDateOnly(profile?.birthDate);
    state.dom.editGender.value = profile?.gender || '';
    state.dom.editNationality.value = profile?.nationality || '';
    state.dom.editDocumentCpf.value = profile?.documentCpf || '';
    state.dom.editDocumentRg.value = profile?.documentRg || '';
    state.dom.editZipCode.value = profile?.zipCode || '';
    state.dom.editStreet.value = profile?.street || '';
    state.dom.editAddressNumber.value = profile?.number || '';
    state.dom.editComplement.value = profile?.complement || '';
    state.dom.editDistrict.value = profile?.district || '';
    state.dom.editCity.value = profile?.city || '';
    state.dom.editState.value = profile?.state || '';
    state.dom.editCountry.value = profile?.country || '';
    state.dom.editPosition.value = profile?.position || '';
    state.dom.editDepartment.value = profile?.department || '';
    state.dom.editHireDate.value = formatDateOnly(profile?.hireDate);
    state.dom.editInternalCode.value = profile?.internalCode || '';
    state.dom.editCommissionPct.value = profile?.commissionPct ?? '';
    state.dom.editMonthlyGoal.value = profile?.monthlyGoal ?? '';
    state.dom.editPreferredLanguage.value = profile?.preferredLanguage || '';
    state.dom.editTimezone.value = profile?.timezone || '';
    state.dom.editTheme.value = profile?.theme || '';
    state.dom.editAttendanceStyle.value = profile?.attendanceStyle || '';
    state.dom.editSpecialty.value = profile?.specialty || '';
    state.dom.editTags.value = profile?.tags || '';
    state.dom.editSignature.value = profile?.signature || '';
    state.dom.editNotifyWhatsapp.checked = profile?.notifyWhatsapp !== false;
    state.dom.editNotifyEmail.checked = profile?.notifyEmail !== false;
    state.dom.editMfaEnabled.checked = profile?.mfaEnabled === true;
    state.dom.editLastPasswordChange.value = formatDateTime(profile?.lastPasswordChange) || 'Sem registro';
    state.dom.editAvatarFile.value = '';
    state.dom.editNewPassword.value = '';
  }

  async function openEditModal(membershipId) {
    const member = state.members.find((item) => item.membershipId === membershipId);
    if (!member) return;
    resetEditForm();
    state.editingMembershipId = membershipId;
    state.editingUserId = member.userId || '';
    setFeedback('Carregando perfil completo...', 'neutral');
    let profile = {};
    if (state.editingUserId) {
      profile = await requestExternal(`/users/${encodeURIComponent(state.editingUserId)}`);
    }
    fillEditForm(member, profile);
    state.modals.edit.open();
    setFeedback('', 'neutral');
  }

  function resolveMembershipIdFromCreateResponse(created) {
    if (!created || typeof created !== 'object') return '';
    const direct = created.membershipId || created.membership_id;
    if (direct) return String(direct).trim();
    if (created.data && typeof created.data === 'object') {
      const nested = created.data.membershipId || created.data.membership_id || created.data.id;
      if (nested) return String(nested).trim();
    }
    if (created.member && typeof created.member === 'object') {
      const member = created.member.membershipId || created.member.membership_id || created.member.id;
      if (member) return String(member).trim();
    }
    return '';
  }

  async function createUser() {
    if (!state.selectedTenantId) throw new Error('Selecione uma empresa.');
    const email = String(state.dom.createEmail.value || '').trim().toLowerCase();
    const fullName = String(state.dom.createFullName.value || '').trim();
    const role = state.dom.createRole.value;
    const password = String(state.dom.createPassword.value || '');
    const wantActive = Boolean(state.dom.createIsActive.checked);
    if (!email || !email.includes('@')) throw new Error('Informe um e-mail válido.');

    state.dom.createSubmit.disabled = true;
    state.dom.createSubmit.textContent = 'Criando...';
    try {
      const payload = { email, role };
      if (fullName) payload.fullName = fullName;
      if (password) payload.password = password;

      const created = await requestExternal(`/tenants/${encodeURIComponent(state.selectedTenantId)}/members`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      let feedbackMessage = 'Usuário criado com sucesso.';
      let feedbackTone = 'success';

      if (!wantActive) {
        let membershipId = resolveMembershipIdFromCreateResponse(created);
        if (!membershipId) {
          await loadMembers();
          const match = state.members.find(
            (item) => String(item.email || '').trim().toLowerCase() === email,
          );
          membershipId = String(match?.membershipId || '').trim();
        }
        if (membershipId) {
          await requestExternal(`/tenants/${encodeURIComponent(state.selectedTenantId)}/members/${encodeURIComponent(membershipId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: false }),
          });
        } else {
          feedbackMessage = 'Usuário criado, mas não foi possível aplicar status inativo. Atualize manualmente.';
          feedbackTone = 'warn';
        }
      }

      resetCreateForm();
      state.modals.create.close();
      await loadMembers();
      setFeedback(feedbackMessage, feedbackTone);
    } finally {
      state.dom.createSubmit.disabled = false;
      state.dom.createSubmit.textContent = 'Criar usuário';
    }
  }

  async function saveEditUser() {
    if (!state.editingMembershipId || !state.selectedTenantId) throw new Error('Selecione um usuário.');
    const membershipPayload = {
      email: String(state.dom.editEmail.value || '').trim().toLowerCase(),
      role: state.dom.editRole.value,
      fullName: String(state.dom.editFullName.value || '').trim(),
      phone: String(state.dom.editPhone.value || '').trim(),
      isActive: Boolean(state.dom.editIsActive.checked),
    };
    const newPassword = String(state.dom.editNewPassword.value || '');
    if (newPassword) membershipPayload.newPassword = newPassword;

    const profilePayload = {
      socialName: toNullableTrimmed(state.dom.editSocialName.value),
      birthDate: toDateOnly(state.dom.editBirthDate.value),
      gender: toNullableTrimmed(state.dom.editGender.value),
      nationality: toNullableTrimmed(state.dom.editNationality.value),
      documentCpf: toNullableTrimmed(state.dom.editDocumentCpf.value),
      documentRg: toNullableTrimmed(state.dom.editDocumentRg.value),
      phoneSecondary: toNullableTrimmed(state.dom.editPhoneSecondary.value),
      whatsapp: toNullableTrimmed(state.dom.editWhatsapp.value),
      zipCode: toNullableTrimmed(state.dom.editZipCode.value),
      street: toNullableTrimmed(state.dom.editStreet.value),
      number: toNullableTrimmed(state.dom.editAddressNumber.value),
      complement: toNullableTrimmed(state.dom.editComplement.value),
      district: toNullableTrimmed(state.dom.editDistrict.value),
      city: toNullableTrimmed(state.dom.editCity.value),
      state: toNullableTrimmed(state.dom.editState.value),
      country: toNullableTrimmed(state.dom.editCountry.value),
      position: toNullableTrimmed(state.dom.editPosition.value),
      department: toNullableTrimmed(state.dom.editDepartment.value),
      hireDate: toDateOnly(state.dom.editHireDate.value),
      internalCode: toNullableTrimmed(state.dom.editInternalCode.value),
      commissionPct: toNullableNumber(state.dom.editCommissionPct.value),
      monthlyGoal: toNullableNumber(state.dom.editMonthlyGoal.value),
      preferredLanguage: toNullableTrimmed(state.dom.editPreferredLanguage.value),
      timezone: toNullableTrimmed(state.dom.editTimezone.value),
      theme: toNullableTrimmed(state.dom.editTheme.value),
      attendanceStyle: toNullableTrimmed(state.dom.editAttendanceStyle.value),
      specialty: toNullableTrimmed(state.dom.editSpecialty.value),
      tags: toNullableTrimmed(state.dom.editTags.value),
      signature: toNullableTrimmed(state.dom.editSignature.value),
      notifyWhatsapp: Boolean(state.dom.editNotifyWhatsapp.checked),
      notifyEmail: Boolean(state.dom.editNotifyEmail.checked),
      mfaEnabled: Boolean(state.dom.editMfaEnabled.checked),
    };

    state.dom.editSubmit.disabled = true;
    state.dom.editSubmit.textContent = 'Salvando...';
    try {
      await requestExternal(`/tenants/${encodeURIComponent(state.selectedTenantId)}/members/${encodeURIComponent(state.editingMembershipId)}`, {
        method: 'PATCH',
        body: JSON.stringify(membershipPayload),
      });
      if (state.editingUserId) {
        await requestExternal(`/users/${encodeURIComponent(state.editingUserId)}`, {
          method: 'PATCH',
          body: JSON.stringify(profilePayload),
        });
        const avatarFile = state.dom.editAvatarFile?.files?.[0];
        if (avatarFile) {
          const formData = new FormData();
          formData.append('file', avatarFile);
          await requestExternal(`/users/${encodeURIComponent(state.editingUserId)}/avatar`, {
            method: 'POST',
            body: formData,
            headers: {},
          });
        }
      }
      state.modals.edit.close();
      await loadMembers();
      setFeedback('Perfil atualizado com sucesso.', 'success');
    } finally {
      state.dom.editSubmit.disabled = false;
      state.dom.editSubmit.textContent = 'Salvar alterações';
    }
  }

  async function toggleUser(membershipId) {
    const member = state.members.find((item) => item.membershipId === membershipId);
    if (!member) return;
    await requestExternal(`/tenants/${encodeURIComponent(state.selectedTenantId)}/members/${encodeURIComponent(membershipId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !member.isActive }),
    });
    await loadMembers();
  }

  function bindEvents() {
    state.dom.refresh.addEventListener('click', () => void loadMembers());
    state.dom.tenant.addEventListener('change', () => {
      state.selectedTenantId = state.dom.tenant.value || '';
      void loadMembers();
    });
    state.dom.search.addEventListener('input', applyFilters);
    state.dom.roleFilter.addEventListener('change', applyFilters);
    state.dom.openCreate.addEventListener('click', () => {
      resetCreateForm();
      state.modals.create.open();
    });
    state.dom.createClose.addEventListener('click', () => state.modals.create.close());
    state.dom.createCancel.addEventListener('click', () => state.modals.create.close());
    state.dom.editClose.addEventListener('click', () => state.modals.edit.close());
    state.dom.editCancel.addEventListener('click', () => state.modals.edit.close());

    state.dom.createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void createUser().catch((error) => setFeedback(error.message || 'Não foi possível criar o usuário.', 'warn'));
    });

    state.dom.editForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void saveEditUser().catch((error) => setFeedback(error.message || 'Não foi possível salvar o perfil.', 'warn'));
    });

    state.dom.tableBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-users-action]');
      if (!button) return;
      const membershipId = button.dataset.membershipId;
      const action = button.dataset.usersAction;
      if (!membershipId) return;
      if (action === 'edit') {
        void openEditModal(membershipId).catch((error) => setFeedback(error.message || 'Falha ao abrir edição.', 'warn'));
      } else if (action === 'toggle') {
        void toggleUser(membershipId).catch((error) => setFeedback(error.message || 'Falha ao atualizar status.', 'warn'));
      }
    });

    state.dom.mobileList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-users-action]');
      if (!button) return;
      const membershipId = button.dataset.membershipId;
      const action = button.dataset.usersAction;
      if (!membershipId) return;
      if (action === 'edit') {
        void openEditModal(membershipId).catch((error) => setFeedback(error.message || 'Falha ao abrir edição.', 'warn'));
      } else if (action === 'toggle') {
        void toggleUser(membershipId).catch((error) => setFeedback(error.message || 'Falha ao atualizar status.', 'warn'));
      }
    });

    state.dom.editTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-users-tab]');
      if (!button) return;
      const tab = button.dataset.usersTab;
      state.dom.editTabs.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item.dataset.usersTab === tab));
      document.querySelectorAll('[data-users-tab-content]').forEach((section) => {
        section.classList.toggle('is-active', section.dataset.usersTabContent === tab);
      });
    });
  }

  function mount() {
    if (state.mounted) return;
    state.dom.root = qs('#tenantUsersRoot');
    state.dom.status = qs('#tenantUsersStatus');
    state.dom.feedback = qs('#tenantUsersFeedback');
    state.dom.tenant = qs('#tenantUsersTenant');
    state.dom.search = qs('#tenantUsersSearch');
    state.dom.roleFilter = qs('#tenantUsersRoleFilter');
    state.dom.refresh = qs('#tenantUsersRefresh');
    state.dom.openCreate = qs('#tenantUsersOpenCreate');
    state.dom.tableBody = qs('#tenantUsersTableBody');
    state.dom.mobileList = qs('#tenantUsersMobileList');

    state.dom.createForm = qs('#tenantUsersCreateForm');
    state.dom.createClose = qs('#tenantUsersCreateClose');
    state.dom.createCancel = qs('#tenantUsersCreateCancel');
    state.dom.createSubmit = qs('#tenantUsersCreateSubmit');
    state.dom.createFullName = qs('#tenantUsersCreateFullName');
    state.dom.createEmail = qs('#tenantUsersCreateEmail');
    state.dom.createRole = qs('#tenantUsersCreateRole');
    state.dom.createIsActive = qs('#tenantUsersCreateIsActive');
    state.dom.createPassword = qs('#tenantUsersCreatePassword');

    state.dom.editForm = qs('#tenantUsersEditForm');
    state.dom.editClose = qs('#tenantUsersEditClose');
    state.dom.editCancel = qs('#tenantUsersEditCancel');
    state.dom.editSubmit = qs('#tenantUsersEditSubmit');
    state.dom.editTabs = qs('#tenantUsersEditTabs');
    state.dom.editFullName = qs('#tenantUsersEditFullName');
    state.dom.editEmail = qs('#tenantUsersEditEmail');
    state.dom.editRole = qs('#tenantUsersEditRole');
    state.dom.editPhone = qs('#tenantUsersEditPhone');
    state.dom.editPhoneSecondary = qs('#tenantUsersEditPhoneSecondary');
    state.dom.editWhatsapp = qs('#tenantUsersEditWhatsapp');
    state.dom.editNewPassword = qs('#tenantUsersEditNewPassword');
    state.dom.editIsActive = qs('#tenantUsersEditIsActive');
    state.dom.editZipCode = qs('#tenantUsersEditZipCode');
    state.dom.editStreet = qs('#tenantUsersEditStreet');
    state.dom.editAddressNumber = qs('#tenantUsersEditAddressNumber');
    state.dom.editComplement = qs('#tenantUsersEditComplement');
    state.dom.editDistrict = qs('#tenantUsersEditDistrict');
    state.dom.editCity = qs('#tenantUsersEditCity');
    state.dom.editState = qs('#tenantUsersEditState');
    state.dom.editCountry = qs('#tenantUsersEditCountry');
    state.dom.editSocialName = qs('#tenantUsersEditSocialName');
    state.dom.editBirthDate = qs('#tenantUsersEditBirthDate');
    state.dom.editGender = qs('#tenantUsersEditGender');
    state.dom.editNationality = qs('#tenantUsersEditNationality');
    state.dom.editDocumentCpf = qs('#tenantUsersEditDocumentCpf');
    state.dom.editDocumentRg = qs('#tenantUsersEditDocumentRg');
    state.dom.editAvatarFile = qs('#tenantUsersEditAvatarFile');
    state.dom.editPosition = qs('#tenantUsersEditPosition');
    state.dom.editDepartment = qs('#tenantUsersEditDepartment');
    state.dom.editHireDate = qs('#tenantUsersEditHireDate');
    state.dom.editInternalCode = qs('#tenantUsersEditInternalCode');
    state.dom.editCommissionPct = qs('#tenantUsersEditCommissionPct');
    state.dom.editMonthlyGoal = qs('#tenantUsersEditMonthlyGoal');
    state.dom.editPreferredLanguage = qs('#tenantUsersEditPreferredLanguage');
    state.dom.editTimezone = qs('#tenantUsersEditTimezone');
    state.dom.editTheme = qs('#tenantUsersEditTheme');
    state.dom.editAttendanceStyle = qs('#tenantUsersEditAttendanceStyle');
    state.dom.editSpecialty = qs('#tenantUsersEditSpecialty');
    state.dom.editTags = qs('#tenantUsersEditTags');
    state.dom.editSignature = qs('#tenantUsersEditSignature');
    state.dom.editNotifyWhatsapp = qs('#tenantUsersEditNotifyWhatsapp');
    state.dom.editNotifyEmail = qs('#tenantUsersEditNotifyEmail');
    state.dom.editMfaEnabled = qs('#tenantUsersEditMfaEnabled');
    state.dom.editLastPasswordChange = qs('#tenantUsersEditLastPasswordChange');

    if (!state.dom.root || !state.dom.tenant || !state.dom.tableBody || !state.dom.createForm || !state.dom.editForm) {
      return;
    }

    state.modals.create = modalFactory.createModalController(qs('#tenantUsersCreateModal'));
    state.modals.edit = modalFactory.createModalController(qs('#tenantUsersEditModal'));

    bindEvents();
    state.mounted = true;
  }

  window.ReservaAiTenantUsersAdmin = {
    init({ session }) {
      state.session = session || null;
      mount();
    },
    async activate(session) {
      state.active = true;
      state.session = session || state.session;
      mount();
      if (!isManagerSession(state.session)) {
        state.members = [];
        applyFilters();
        setStatus('Acesso restrito: apenas OWNER/ADMIN podem gerir membros.', 'warn');
        return;
      }
      try {
        await bootstrap();
        await loadMembers();
      } catch (error) {
        setStatus(error.message || 'Não foi possível carregar a gestão de membros.', 'warn');
      }
    },
    deactivate() {
      state.active = false;
      state.modals.create?.close();
      state.modals.edit?.close();
    },
  };
})();
