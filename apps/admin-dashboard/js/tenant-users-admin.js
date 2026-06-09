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
  const escapeAttr = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const getUserInitial = (item) => {
    const source = String((item && (item.fullName || item.email)) || '').trim();
    if (!source) return '?';
    return source.slice(0, 1).toUpperCase();
  };

  const isAbsoluteAvatarUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

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

  function isProtectedAvatarPath(path) {
    const value = String(path || '').trim();
    if (!value || value.startsWith('data:image')) return false;
    if (/^https?:\/\//i.test(value) && !value.includes('/api/') && !value.includes('/users/')) {
      return false;
    }
    return value.includes('/users/') || value.startsWith('/api/operator') || value.startsWith('/api/security');
  }

  function resolveSecurityAvatarFetchPath(avatarPath) {
    const raw = String(avatarPath || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/api/security')) return raw.replace(/^\/api\/security/, '');
    if (raw.startsWith('/api/operator')) return raw.replace(/^\/api\/operator/, '');
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  const buildAvatarHtml = (item, contextClass = 'pro-item-avatar-img', helper) => {
    const userId = item.userId || item.user_id || item.user?.id || '';
    const base64 = toAvatarDataUrlFromRawBase64(item.avatarBase64)
      || (String(item.avatarBase64 || '').startsWith('data:image') ? item.avatarBase64 : '');
    if (base64) {
      return `<img class="${contextClass}" src="${escapeAttr(base64)}" alt="Avatar" loading="lazy" />`;
    }
    const avatarUrl = String(item.avatarUrl || '').trim();
    if (avatarUrl && isAbsoluteAvatarUrl(avatarUrl)) {
      return `<img class="${contextClass}" src="${escapeAttr(avatarUrl)}" alt="Avatar" loading="lazy" />`;
    }
    if (item.avatarViewUrl && helper) {
      const viewRaw = String(item.avatarViewUrl || '').trim();
      if (viewRaw && isProtectedAvatarPath(viewRaw)) {
        return `<img class="${contextClass}" data-avatar-user-id="${escapeAttr(userId)}" data-avatar-path="${escapeAttr(viewRaw)}" alt="Avatar" loading="lazy" />`;
      }
      const viewSrc = helper.imageSrc(item.avatarViewUrl);
      if (viewSrc) {
        return `<img class="${contextClass}" src="${escapeAttr(viewSrc)}" alt="Avatar" loading="lazy" />`;
      }
    }
    if (avatarUrl && helper) {
      const resolved = helper.imageSrc(avatarUrl);
      if (resolved && isAbsoluteAvatarUrl(resolved)) {
        return `<img class="${contextClass}" src="${escapeAttr(resolved)}" alt="Avatar" loading="lazy" />`;
      }
      if (avatarUrl.startsWith('/') || resolved) {
        return `<img class="${contextClass}" data-avatar-user-id="${escapeAttr(userId)}" data-avatar-path="${escapeAttr(avatarUrl.startsWith('/') ? avatarUrl : resolved)}" alt="Avatar" loading="lazy" />`;
      }
    }
    return '';
  };

  /* Não usar window.ReservaAiMembersTable (table.js): layout legado sem select nem avatares. */
  const membersTable = {
    imageSrc(path) {
      const value = String(path || '').trim();
      if (!value) return '';
      if (value.startsWith('data:image')) return value;
      if (/^https?:\/\//i.test(value)) return value;
      const gateway = String(window.RESERVAAI_GATEWAY_URL || '').trim().replace(/\/$/, '');
      const origin = (window.location && window.location.origin ? window.location.origin : '').replace(/\/$/, '');
      const base = gateway || origin;
      return base ? `${base}${value.startsWith('/') ? value : `/${value}`}` : value;
    },
    renderRows(members) {
      const safeMembers = Array.isArray(members) ? members : [];
      if (!safeMembers.length) {
        return '<tr><td colspan="6" class="security-admin-empty">Nenhum usuário encontrado.</td></tr>';
      }
      return safeMembers.map((item) => `
        <tr>
          <td>${escapeHtml(item.fullName || item.email || '')}</td>
          <td>${escapeHtml(item.email || '')}</td>
          <td>${escapeHtml(item.role || '')}</td>
          <td>${item.isActive ? 'Ativo' : 'Inativo'}</td>
          <td>${escapeHtml(item.lastLoginAt || '')}</td>
          <td>
            <button class="btn members-action-btn" type="button" data-users-action="edit" data-membership-id="${escapeAttr(item.membershipId || '')}">Editar</button>
            <button class="btn members-action-btn" type="button" data-users-action="toggle" data-membership-id="${escapeAttr(item.membershipId || '')}">${item.isActive ? 'Inativar' : 'Ativar'}</button>
          </td>
        </tr>
      `).join('');
    },
    renderMobileCards(members, options = {}) {
      const safeMembers = Array.isArray(members) ? members : [];
      if (!safeMembers.length) {
        return '<div class="pro-list-empty">Nenhum usuário encontrado.</div>';
      }
      const selectedId = String(options.selectedMembershipId || '');
      return safeMembers.map((item) => {
        const membershipId = String(item.membershipId || '');
        const isActive = Boolean(item.isActive);
        const role = String(item.role || '').toUpperCase();
        const name = item.fullName || item.email || 'Usuário';
        const subtitle = item.email && item.fullName ? item.email : (role || '');
        const avatarHtml = buildAvatarHtml(item, 'pro-item-avatar-img', this);
        const initial = getUserInitial(item);
        const avatarBlock = avatarHtml
          ? `<span class="operator-pro-avatar users-pro-item-avatar has-image">${avatarHtml}</span>`
          : `<span class="operator-pro-avatar users-pro-item-avatar">${escapeHtml(initial)}</span>`;
        const statusClass = isActive ? 'pro-status-on' : 'pro-status-off';
        const statusLabel = isActive ? 'Ativo' : 'Inativo';
        const isSelected = selectedId && selectedId === membershipId;
        return `
          <button type="button"
                  class="pro-item users-pro-item${isSelected ? ' is-active' : ''}"
                  data-users-action="select"
                  data-membership-id="${escapeAttr(membershipId)}">
            <span class="pro-item-avatar">${avatarBlock}</span>
            <span class="pro-item-meta">
              <span class="pro-item-name">${escapeHtml(name)}</span>
              <span class="pro-item-role">${escapeHtml(subtitle)}</span>
            </span>
            <span class="pro-status-badge ${statusClass}">${statusLabel}</span>
          </button>
        `;
      }).join('');
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
    selectedMembershipId: '',
    editingMembershipId: '',
    editingUserId: '',
    securitySnapshot: null,
    avatarObjectUrls: {},
    dom: {},
    modals: {},
  };

  function qs(selector) { return document.querySelector(selector); }

  function isManagerSession(session) {
    if (session?.managedTenant === true) return true;
    if (window.ReservaPermissions?.isAdminSession?.(session)) return true;
    if (window.ReservaPermissions?.canManageTenantSession?.(session)) return true;
    if (session?.canManageTenant === true) return true;
    const memberships = Array.isArray(session?.tenants) ? session.tenants : [];
    return memberships.some((tenant) => {
      const role = String(tenant?.role || '').toUpperCase();
      return tenant?.canManageTenant === true || role === 'OWNER' || role === 'ADMIN' || role === 'TENANT_ADMIN';
    });
  }

  function resolveSessionUserId(session) {
    if (!session || typeof session !== 'object') {
      return '';
    }
    return String(session.id || session.userId || session.user?.id || '').trim();
  }

  function normalizeMembersList(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (!payload || typeof payload !== 'object') {
      return [];
    }
    const nested = payload.data ?? payload.items ?? payload.members ?? payload.results ?? payload.rows;
    return Array.isArray(nested) ? nested : [];
  }

  function normalizeMembershipId(value) {
    return String(value || '').trim();
  }

  function findMemberByUserId(userId) {
    const targetUserId = String(userId || '').trim().toLowerCase();
    const targetEmail = String(state.session?.email || '').trim().toLowerCase();
    if (!targetUserId && !targetEmail) {
      return null;
    }
    return state.members.find((item) => {
      const memberUserId = String(item?.userId || item?.user_id || '').trim().toLowerCase();
      if (targetUserId && memberUserId && memberUserId === targetUserId) {
        return true;
      }
      if (targetEmail) {
        const memberEmail = String(item?.email || '').trim().toLowerCase();
        return memberEmail === targetEmail;
      }
      return false;
    }) || null;
  }

  function resolveTenantIdFromSession(session) {
    if (!session || typeof session !== 'object') {
      return '';
    }
    const direct = String(
      session.activeTenantId
      || session.tenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || '',
    ).trim();
    if (direct) {
      return direct;
    }
    const tenants = Array.isArray(session.tenants) ? session.tenants : [];
    const firstTenant = tenants.find((tenant) => tenant && (tenant.id || tenant.tenantId));
    return String(firstTenant?.id || firstTenant?.tenantId || '').trim();
  }

  function isEditingSelf() {
    const sessionUserId = String(state.session?.id || '').trim();
    const editingUserId = String(state.editingUserId || '').trim();
    return Boolean(sessionUserId && editingUserId && sessionUserId === editingUserId);
  }

  function applySelfEditLocks() {
    const editingSelf = isEditingSelf();
    if (state.dom.editRole) {
      state.dom.editRole.disabled = editingSelf;
    }
    if (state.dom.editIsActive) {
      state.dom.editIsActive.disabled = editingSelf;
    }
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

  function hasMeaningfulChange(prev, next) {
    const prevValue = prev === undefined ? null : prev;
    const nextValue = next === undefined ? null : next;
    return prevValue !== nextValue;
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
      throw window.EngageUserMessages?.buildHttpError
        ? window.EngageUserMessages.buildHttpError(response.status, payload, { context: 'users' })
        : new Error('Não foi possível concluir a ação com usuários.');
    }
    return payload;
  }

  async function requestSecurity(path, options = {}) {
    const token = state.session?.externalAccessToken || authService?.getAccessToken?.() || '';
    if (!token) throw new Error('Token externo indisponível.');

    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (options.body && !isMultipart && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`/api/security${path}`, {
      ...options,
      headers,
      credentials: options.credentials || 'include',
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      throw window.EngageUserMessages?.buildHttpError
        ? window.EngageUserMessages.buildHttpError(response.status, payload, { context: 'users' })
        : new Error('Não foi possível concluir a ação com usuários.');
    }
    return payload;
  }

  function splitName(fullName) {
    const safe = String(fullName || '').trim();
    if (!safe) return { firstName: null, lastName: null };
    const parts = safe.split(/\s+/).filter(Boolean);
    const firstName = parts.shift() || null;
    const lastName = parts.length ? parts.join(' ') : null;
    return { firstName, lastName };
  }

  function normalizeMemberRecord(member) {
    if (!member || typeof member !== 'object') return member;
    const userId = String(
      member.userId || member.user_id || member.user?.id || member.neuraFlowUserId || '',
    ).trim();
    if (userId) member.userId = userId;
    const membershipId = String(
      member.membershipId || member.membership_id || member.id || '',
    ).trim();
    if (membershipId) member.membershipId = membershipId;
    return member;
  }

  function extractUserProfilePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.data && typeof payload.data === 'object') return payload.data;
    return payload;
  }

  async function loadSecurityUserById(userId) {
    if (!userId) return null;
    try {
      return await requestSecurity(`/users/${encodeURIComponent(userId)}`);
    } catch (securityError) {
      try {
        const payload = await requestExternal(`/users/${encodeURIComponent(userId)}`);
        return extractUserProfilePayload(payload);
      } catch (operatorError) {
        return null;
      }
    }
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
    ensureSelectionConsistent();
    renderMembers();
  }

  function ensureSelectionConsistent() {
    const list = Array.isArray(state.filteredMembers) ? state.filteredMembers : [];
    if (!list.length) {
      state.selectedMembershipId = '';
      return;
    }
    const stillVisible = list.find((item) => String(item.membershipId || '') === String(state.selectedMembershipId || ''));
    if (!stillVisible) {
      state.selectedMembershipId = String(list[0].membershipId || '');
    }
  }

  function renderMembers() {
    if (state.dom.tableBody) {
      state.dom.tableBody.innerHTML = membersTable.renderRows(state.filteredMembers);
    }
    if (state.dom.mobileList) {
      state.dom.mobileList.innerHTML = membersTable.renderMobileCards(state.filteredMembers, {
        selectedMembershipId: state.selectedMembershipId,
      });
    }
    renderDetail();
    void hydrateProtectedAvatars();
  }

  function getRoleLabel(role) {
    const safe = String(role || '').toUpperCase();
    if (safe === 'OWNER') return 'Proprietário';
    if (safe === 'ADMIN') return 'Administrador';
    if (safe === 'OPERATOR') return 'Operador';
    if (safe === 'TENANT_ADMIN') return 'Administrador da empresa';
    return safe || 'Sem papel';
  }

  function renderDetailAvatar(member) {
    if (!state.dom.detailAvatar) return;
    const initial = getUserInitial(member);
    const html = buildAvatarHtml(member, 'pro-hero-avatar-img', membersTable);
    if (html) {
      state.dom.detailAvatar.innerHTML = html;
      state.dom.detailAvatar.classList.add('has-image');
    } else {
      state.dom.detailAvatar.textContent = initial;
      state.dom.detailAvatar.classList.remove('has-image');
    }
  }

  function renderDetail() {
    if (!state.dom.detailEmpty || !state.dom.detailCard) return;
    const list = Array.isArray(state.filteredMembers) ? state.filteredMembers : [];
    const member = list.find((item) => String(item.membershipId || '') === String(state.selectedMembershipId || ''));
    if (!member) {
      state.dom.detailEmpty.hidden = false;
      state.dom.detailCard.hidden = true;
      return;
    }
    state.dom.detailEmpty.hidden = true;
    state.dom.detailCard.hidden = false;

    renderDetailAvatar(member);
    if (state.dom.detailOnlineDot) {
      state.dom.detailOnlineDot.hidden = !member.isActive;
    }
    if (state.dom.detailName) {
      state.dom.detailName.textContent = member.fullName || member.email || 'Usuário';
    }
    if (state.dom.detailVerified) {
      state.dom.detailVerified.hidden = !member.isActive;
    }

    if (state.dom.detailBadges) {
      const badges = [];
      badges.push(`<span class="pro-badge pro-badge-role">${escapeHtml(getRoleLabel(member.role))}</span>`);
      if (member.isActive) {
        badges.push('<span class="pro-badge pro-badge-status is-on">Ativo</span>');
      } else {
        badges.push('<span class="pro-badge pro-badge-status is-off">Inativo</span>');
      }
      state.dom.detailBadges.innerHTML = badges.join('');
    }

    if (state.dom.detailContacts) {
      const contacts = [];
      if (member.email) {
        contacts.push(`<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${escapeHtml(member.email)}</span>`);
      }
      if (member.phone) {
        contacts.push(`<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${escapeHtml(member.phone)}</span>`);
      }
      if (!contacts.length) {
        contacts.push('<span class="users-pro-muted">Sem contatos cadastrados</span>');
      }
      state.dom.detailContacts.innerHTML = contacts.join('');
    }

    if (state.dom.detailToggle) {
      state.dom.detailToggle.textContent = member.isActive ? 'Inativar usuário' : 'Ativar usuário';
      state.dom.detailToggle.dataset.membershipId = String(member.membershipId || '');
      state.dom.detailToggle.classList.toggle('is-deactivate', Boolean(member.isActive));
    }
    if (state.dom.detailEdit) {
      state.dom.detailEdit.dataset.membershipId = String(member.membershipId || '');
    }

    if (state.dom.detailKpis) {
      const kpis = [
        { label: 'Papel', value: escapeHtml(getRoleLabel(member.role)) },
        { label: 'Status', value: member.isActive ? 'Ativo' : 'Inativo' },
        { label: 'Último acesso', value: member.lastLoginAt ? escapeHtml(formatDateTime(member.lastLoginAt) || member.lastLoginAt) : '—' },
      ];
      state.dom.detailKpis.innerHTML = kpis.map((kpi) => `
        <div class="users-pro-kpi">
          <span class="users-pro-kpi-label">${kpi.label}</span>
          <strong class="users-pro-kpi-value">${kpi.value}</strong>
        </div>
      `).join('');
    }

    if (state.dom.detailFacts) {
      const facts = [
        { label: 'Nome completo', value: member.fullName || '—' },
        { label: 'E-mail', value: member.email || '—' },
        { label: 'Telefone', value: member.phone || '—' },
        { label: 'ID do membro', value: member.membershipId || '—' },
      ];
      state.dom.detailFacts.innerHTML = facts.map((fact) => `
        <div class="users-pro-fact">
          <span class="users-pro-fact-label">${escapeHtml(fact.label)}</span>
          <strong class="users-pro-fact-value">${escapeHtml(fact.value)}</strong>
        </div>
      `).join('');
    }
  }

  async function hydrateProtectedAvatars() {
    const token = state.session?.externalAccessToken || authService?.getAccessToken?.() || '';
    if (!token) return;
    const images = Array.from(document.querySelectorAll('img[data-avatar-path][data-avatar-user-id]'));
    for (const image of images) {
      const avatarPath = String(image.getAttribute('data-avatar-path') || '').trim();
      const userId = String(image.getAttribute('data-avatar-user-id') || '').trim();
      if (!avatarPath || !userId) continue;
      if (isAbsoluteAvatarUrl(avatarPath)) {
        image.src = avatarPath;
        image.removeAttribute('data-avatar-path');
        image.removeAttribute('data-avatar-user-id');
        continue;
      }
      if (state.avatarObjectUrls[userId]) {
        image.src = state.avatarObjectUrls[userId];
        continue;
      }
      try {
        const securityPath = resolveSecurityAvatarFetchPath(avatarPath);
        const fetchCandidates = [
          `/api/security${securityPath}`,
          `/api/operator${securityPath}`,
        ];
        let loaded = false;
        for (const candidate of fetchCandidates) {
          const response = await fetch(`${candidate}${candidate.includes('?') ? '&' : '?'}t=${Date.now()}`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include',
          });
          if (!response.ok) continue;
          const blob = await response.blob();
          if (!blob.size) continue;
          const objectUrl = URL.createObjectURL(blob);
          state.avatarObjectUrls[userId] = objectUrl;
          image.src = objectUrl;
          loaded = true;
          break;
        }
        if (!loaded) continue;
      } catch (error) {
        // Keep listing resilient if protected avatar fetch fails.
      }
    }
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
    const sessionTenantId = window.ReservaPermissions?.resolveEffectiveTenantId
      ? window.ReservaPermissions.resolveEffectiveTenantId(state.session)
      : resolveTenantIdFromSession(state.session);
    if (sessionTenantId && state.tenantOptions.some((tenant) => tenant.id === sessionTenantId)) {
      state.selectedTenantId = sessionTenantId;
    } else {
      state.selectedTenantId = state.tenantOptions[0]?.id || sessionTenantId || '';
    }
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
    state.members = normalizeMembersList(rows).map(normalizeMemberRecord);
    await enrichMembersWithProfiles();
    applyFilters();
    setStatus('Usuários carregados.', 'success');
  }

  async function enrichMembersWithProfiles() {
    if (!Array.isArray(state.members) || !state.members.length) return;
    const profileLoads = state.members.map(async (member) => {
      if (!member?.userId) return member;
      try {
        const profile = await loadSecurityUserById(member.userId);
        if (profile && profile.avatarBase64) {
          member.avatarBase64 = toAvatarDataUrlFromRawBase64(profile.avatarBase64) || profile.avatarBase64;
        }
        if (profile && profile.avatarUrl) {
          member.avatarUrl = profile.avatarUrl;
        }
        if (profile && profile.avatarViewUrl) {
          member.avatarViewUrl = profile.avatarViewUrl;
        }
      } catch (error) {
        // Keep list rendering resilient even if profile endpoint fails for one user.
      }
      return member;
    });
    await Promise.all(profileLoads);
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
    state.securitySnapshot = null;
    if (state.dom.editRole) {
      state.dom.editRole.disabled = false;
    }
    if (state.dom.editIsActive) {
      state.dom.editIsActive.disabled = false;
    }
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
    if (state.dom.editInternalCode) state.dom.editInternalCode.value = profile?.internalCode || '';
    state.dom.editCommissionPct.value = profile?.commissionPct ?? '';
    state.dom.editMonthlyGoal.value = profile?.monthlyGoal ?? '';
    if (state.dom.editPreferredLanguage) state.dom.editPreferredLanguage.value = profile?.preferredLanguage || '';
    if (state.dom.editTimezone) state.dom.editTimezone.value = profile?.timezone || '';
    state.dom.editTheme.value = profile?.theme || '';
    if (state.dom.editAttendanceStyle) state.dom.editAttendanceStyle.value = profile?.attendanceStyle || '';
    state.dom.editSpecialty.value = profile?.specialty || '';
    if (state.dom.editTags) state.dom.editTags.value = profile?.tags || '';
    if (state.dom.editSignature) state.dom.editSignature.value = profile?.signature || '';
    state.dom.editNotifyWhatsapp.checked = profile?.notifyWhatsapp !== false;
    state.dom.editNotifyEmail.checked = profile?.notifyEmail !== false;
    state.dom.editMfaEnabled.checked = profile?.mfaEnabled === true;
    state.dom.editLastPasswordChange.value = formatDateTime(profile?.lastPasswordChange) || 'Sem registro';
    state.dom.editAvatarFile.value = '';
    state.dom.editNewPassword.value = '';
    applySelfEditLocks();
  }

  async function openEditModal(membershipId, memberOverride = null) {
    const normalizedMembershipId = normalizeMembershipId(membershipId);
    const member = memberOverride
      || state.members.find((item) => normalizeMembershipId(item.membershipId || item.membership_id || item.id) === normalizedMembershipId);
    if (!member) {
      throw new Error('Usuário não encontrado para edição.');
    }
    resetEditForm();
    state.editingMembershipId = normalizeMembershipId(member.membershipId || member.membership_id || membershipId);
    state.editingUserId = member.userId || '';
    setFeedback('Carregando perfil completo...', 'neutral');
    let profile = {};
    let securityUser = null;
    if (state.editingUserId) {
      try {
        securityUser = await loadSecurityUserById(state.editingUserId);
        if (securityUser) {
          profile = securityUser;
        }
      } catch (error) {
        profile = {};
      }
    }
    state.securitySnapshot = securityUser;
    fillEditForm(member, profile);
    state.modals.edit.open();
    setFeedback('', 'neutral');
  }

  function portalModalBackdrop(backdrop) {
    if (!backdrop || backdrop.parentElement === document.body) {
      return;
    }
    document.body.appendChild(backdrop);
  }

  function wireModalControllers() {
    const editBackdrop = qs('#tenantUsersEditModal');
    const createBackdrop = qs('#tenantUsersCreateModal');
    if (editBackdrop) {
      portalModalBackdrop(editBackdrop);
      if (!state.modals.edit) {
        state.modals.edit = modalFactory.createModalController(editBackdrop);
      }
    }
    if (createBackdrop) {
      portalModalBackdrop(createBackdrop);
      if (!state.modals.create) {
        state.modals.create = modalFactory.createModalController(createBackdrop);
      }
    }
  }

  async function openEditModalForCurrentUser(session) {
    const resolvedSession = session || state.session;
    const userId = resolveSessionUserId(resolvedSession);
    if (!userId) {
      throw new Error('Sessão inválida.');
    }

    mount();
    wireModalControllers();
    if (!state.modals?.edit || !qs('#tenantUsersEditModal')) {
      throw new Error('Formulário de perfil indisponível.');
    }

    state.session = resolvedSession;
    const tenantId = resolveTenantIdFromSession(resolvedSession);
    if (!tenantId) {
      throw new Error('Nenhuma empresa ativa na sessão.');
    }

    state.selectedTenantId = tenantId;
    if (state.dom.tenant) {
      state.dom.tenant.value = tenantId;
    }

    let member = findMemberByUserId(userId);
    if (!member) {
      try {
        await loadMembers();
      } catch (loadError) {
        console.warn('Falha ao listar membros para abrir o perfil.', loadError);
      }
      member = findMemberByUserId(userId);
    }

    const membershipId = normalizeMembershipId(member?.membershipId || member?.membership_id || member?.id);
    if (!membershipId) {
      throw new Error('Não foi possível localizar seu cadastro nesta empresa.');
    }

    await openEditModal(membershipId, member);
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

    const securityPayload = {
      avatarUrl: toNullableTrimmed(state.securitySnapshot?.avatarUrl),
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
      internalCode: toNullableTrimmed(state.dom.editInternalCode?.value),
      commissionPct: toNullableNumber(state.dom.editCommissionPct.value),
      monthlyGoal: toNullableNumber(state.dom.editMonthlyGoal.value),
      preferredLanguage: toNullableTrimmed(state.dom.editPreferredLanguage?.value),
      timezone: toNullableTrimmed(state.dom.editTimezone?.value),
      theme: toNullableTrimmed(state.dom.editTheme.value),
      attendanceStyle: toNullableTrimmed(state.dom.editAttendanceStyle?.value),
      specialty: toNullableTrimmed(state.dom.editSpecialty.value),
      tags: toNullableTrimmed(state.dom.editTags?.value),
      signature: toNullableTrimmed(state.dom.editSignature?.value),
      notifyWhatsapp: Boolean(state.dom.editNotifyWhatsapp.checked),
      notifyEmail: Boolean(state.dom.editNotifyEmail.checked),
      mfaEnabled: Boolean(state.dom.editMfaEnabled.checked),
    };
    const snapshot = state.securitySnapshot || {};
    const canPatchSecurity = Boolean(state.editingUserId);
    let shouldPatchSecurity = canPatchSecurity && (
      hasMeaningfulChange(snapshot.avatarUrl || null, securityPayload.avatarUrl || null)
      || 
      hasMeaningfulChange(snapshot.socialName || null, securityPayload.socialName || null)
      || hasMeaningfulChange(formatDateOnly(snapshot.birthDate), securityPayload.birthDate || null)
      || hasMeaningfulChange(snapshot.gender || null, securityPayload.gender || null)
      || hasMeaningfulChange(snapshot.nationality || null, securityPayload.nationality || null)
      || hasMeaningfulChange(snapshot.documentCpf || null, securityPayload.documentCpf || null)
      || hasMeaningfulChange(snapshot.documentRg || null, securityPayload.documentRg || null)
      || hasMeaningfulChange(snapshot.phoneSecondary || null, securityPayload.phoneSecondary || null)
      || hasMeaningfulChange(snapshot.whatsapp || null, securityPayload.whatsapp || null)
      || hasMeaningfulChange(snapshot.zipCode || null, securityPayload.zipCode || null)
      || hasMeaningfulChange(snapshot.street || null, securityPayload.street || null)
      || hasMeaningfulChange(snapshot.number || null, securityPayload.number || null)
      || hasMeaningfulChange(snapshot.complement || null, securityPayload.complement || null)
      || hasMeaningfulChange(snapshot.district || null, securityPayload.district || null)
      || hasMeaningfulChange(snapshot.city || null, securityPayload.city || null)
      || hasMeaningfulChange(snapshot.state || null, securityPayload.state || null)
      || hasMeaningfulChange(snapshot.country || null, securityPayload.country || null)
      || hasMeaningfulChange(snapshot.position || null, securityPayload.position || null)
      || hasMeaningfulChange(snapshot.department || null, securityPayload.department || null)
      || hasMeaningfulChange(formatDateOnly(snapshot.hireDate), securityPayload.hireDate || null)
      || hasMeaningfulChange(snapshot.internalCode || null, securityPayload.internalCode || null)
      || hasMeaningfulChange(snapshot.commissionPct ?? null, securityPayload.commissionPct ?? null)
      || hasMeaningfulChange(snapshot.monthlyGoal ?? null, securityPayload.monthlyGoal ?? null)
      || hasMeaningfulChange(snapshot.preferredLanguage || null, securityPayload.preferredLanguage || null)
      || hasMeaningfulChange(snapshot.timezone || null, securityPayload.timezone || null)
      || hasMeaningfulChange(snapshot.theme || null, securityPayload.theme || null)
      || hasMeaningfulChange(snapshot.attendanceStyle || null, securityPayload.attendanceStyle || null)
      || hasMeaningfulChange(snapshot.specialty || null, securityPayload.specialty || null)
      || hasMeaningfulChange(snapshot.tags || null, securityPayload.tags || null)
      || hasMeaningfulChange(snapshot.signature || null, securityPayload.signature || null)
      || hasMeaningfulChange(Boolean(snapshot.notifyWhatsapp !== false), Boolean(securityPayload.notifyWhatsapp))
      || hasMeaningfulChange(Boolean(snapshot.notifyEmail !== false), Boolean(securityPayload.notifyEmail))
      || hasMeaningfulChange(Boolean(snapshot.mfaEnabled === true), Boolean(securityPayload.mfaEnabled))
    );
    let securityUpdateAttempted = false;

    state.dom.editSubmit.disabled = true;
    state.dom.editSubmit.textContent = 'Salvando...';
    try {
      await requestExternal(`/tenants/${encodeURIComponent(state.selectedTenantId)}/members/${encodeURIComponent(state.editingMembershipId)}`, {
        method: 'PATCH',
        body: JSON.stringify(membershipPayload),
      });
      const avatarFile = state.dom.editAvatarFile?.files?.[0];
      if (avatarFile && state.editingUserId) {
        const formData = new FormData();
        formData.append('file', avatarFile);
        const avatarUpload = await requestSecurity(`/users/${encodeURIComponent(state.editingUserId)}/avatar`, {
          method: 'POST',
          body: formData,
        });
        if (avatarUpload?.avatarUrl) {
          const uploadedAvatarUrl = String(avatarUpload.avatarUrl).trim();
          if (uploadedAvatarUrl) {
            securityPayload.avatarUrl = uploadedAvatarUrl;
            shouldPatchSecurity = true;
          }
        }
        if (avatarUpload?.avatarViewUrl) {
          const uploadedAvatarViewUrl = String(avatarUpload.avatarViewUrl).trim();
          if (uploadedAvatarViewUrl) {
            const member = state.members.find((item) => String(item.userId || '') === String(state.editingUserId));
            if (member) member.avatarViewUrl = uploadedAvatarViewUrl;
          }
        }
        if (avatarUpload?.avatarBase64) {
          const uploadedAvatarBase64 = String(avatarUpload.avatarBase64).trim();
          if (uploadedAvatarBase64) {
            const member = state.members.find((item) => String(item.userId || '') === String(state.editingUserId));
            if (member) {
              member.avatarBase64 = toAvatarDataUrlFromRawBase64(uploadedAvatarBase64) || uploadedAvatarBase64;
            }
          }
        }
      }
      if (shouldPatchSecurity) {
        securityUpdateAttempted = true;
        await requestSecurity(`/users/${encodeURIComponent(state.editingUserId)}`, {
          method: 'PATCH',
          body: JSON.stringify(securityPayload),
        });
      }
      const editedUserId = String(state.editingUserId || '').trim();
      const editedSelf = isEditingSelf();
      state.modals.edit.close();
      try {
        await loadMembers();
      } catch (reloadError) {
        console.warn('Não foi possível recarregar a lista de usuários após salvar.', reloadError);
      }
      if (editedSelf && editedUserId) {
        window.dispatchEvent(new CustomEvent('reservaai:profile-updated', {
          detail: { userId: editedUserId },
        }));
      }
      if (securityUpdateAttempted) {
        setFeedback('Perfil atualizado com sucesso.', 'success');
      } else {
        setFeedback('Dados básicos salvos. Campos adicionais dependem do mapeamento novo do backend.', 'warn');
      }
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

    const handleListAction = (event) => {
      const button = event.target.closest('[data-users-action]');
      if (!button) return;
      const membershipId = button.dataset.membershipId;
      const action = button.dataset.usersAction;
      if (!membershipId) return;
      if (action === 'select') {
        if (state.selectedMembershipId === membershipId) return;
        state.selectedMembershipId = membershipId;
        renderMembers();
      } else if (action === 'edit') {
        void openEditModal(membershipId).catch((error) => setFeedback(error.message || 'Falha ao abrir edição.', 'warn'));
      } else if (action === 'toggle') {
        void toggleUser(membershipId).catch((error) => setFeedback(error.message || 'Falha ao atualizar status.', 'warn'));
      }
    };
    if (state.dom.tableBody && !state.dom.tableBody.dataset.usersListBound) {
      state.dom.tableBody.dataset.usersListBound = '1';
      state.dom.tableBody.addEventListener('click', handleListAction);
    }
    if (state.dom.mobileList && !state.dom.mobileList.dataset.usersListBound) {
      state.dom.mobileList.dataset.usersListBound = '1';
      state.dom.mobileList.addEventListener('click', handleListAction);
    }
    if (state.dom.root && !state.dom.root.dataset.usersListBound) {
      state.dom.root.dataset.usersListBound = '1';
      state.dom.root.addEventListener('click', handleListAction);
    }

    state.dom.detailEdit?.addEventListener('click', () => {
      const membershipId = state.dom.detailEdit?.dataset?.membershipId || state.selectedMembershipId;
      if (!membershipId) return;
      void openEditModal(membershipId).catch((error) => setFeedback(error.message || 'Falha ao abrir edição.', 'warn'));
    });

    state.dom.detailToggle?.addEventListener('click', () => {
      const membershipId = state.dom.detailToggle?.dataset?.membershipId || state.selectedMembershipId;
      if (!membershipId) return;
      void toggleUser(membershipId).catch((error) => setFeedback(error.message || 'Falha ao atualizar status.', 'warn'));
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
    if (state.mounted) {
      wireModalControllers();
      return;
    }
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
    state.dom.detailEmpty = qs('#tenantUsersDetailEmpty');
    state.dom.detailCard = qs('#tenantUsersDetailCard');
    state.dom.detailAvatar = qs('#tenantUsersDetailAvatar');
    state.dom.detailOnlineDot = qs('#tenantUsersDetailOnlineDot');
    state.dom.detailName = qs('#tenantUsersDetailName');
    state.dom.detailVerified = qs('#tenantUsersDetailVerified');
    state.dom.detailBadges = qs('#tenantUsersDetailBadges');
    state.dom.detailContacts = qs('#tenantUsersDetailContacts');
    state.dom.detailEdit = qs('#tenantUsersDetailEdit');
    state.dom.detailToggle = qs('#tenantUsersDetailToggle');
    state.dom.detailKpis = qs('#tenantUsersDetailKpis');
    state.dom.detailFacts = qs('#tenantUsersDetailFacts');

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

    wireModalControllers();

    if (!state.dom.root || !state.dom.tenant || !state.dom.tableBody || !state.dom.createForm || !state.dom.editForm) {
      return;
    }

    bindEvents();
    state.mounted = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireModalControllers);
  } else {
    wireModalControllers();
  }

  window.ReservaAiTenantUsersAdmin = {
    openEditModalForCurrentUser,
    init({ session }) {
      state.session = session || null;
      mount();
    },
    async activate(session) {
      state.active = true;
      let resolved = session || state.session;
      if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
        resolved = await window.ReservaPermissions.enrichSessionWithOperatorMe(resolved);
      }
      state.session = resolved;
      state.initialized = false;
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
      Object.values(state.avatarObjectUrls).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (error) {}
      });
      state.avatarObjectUrls = {};
    },
  };
})();
