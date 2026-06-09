(function () {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function roleBadgeClass(role) {
    const safe = String(role || '').toUpperCase();
    if (safe === 'ADMIN' || safe === 'OWNER') return 'is-admin';
    return 'is-operator';
  }

  function statusBadgeClass(isActive) {
    return isActive ? 'is-active' : 'is-inactive';
  }

  function getInitial(name, email) {
    const base = String(name || email || '?').trim();
    return (base[0] || '?').toUpperCase();
  }

  function formatDateTime(value) {
    if (!value) return 'Nunca acessou';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value));
    } catch (error) {
      return 'Sem registro';
    }
  }

  function renderRows(members, options = {}) {
    const safeMembers = Array.isArray(members) ? members : [];
    if (!safeMembers.length) {
      return '<tr><td colspan="6" class="security-admin-empty">Nenhum usuário encontrado.</td></tr>';
    }

    return safeMembers.map((item) => `
      <tr>
        <td>
          <div class="members-user-cell">
            <span class="members-avatar">${escapeHtml(getInitial(item.fullName, item.email))}</span>
            <strong>${escapeHtml(item.fullName || item.email)}</strong>
          </div>
        </td>
        <td>${escapeHtml(item.email)}</td>
        <td><span class="members-badge ${roleBadgeClass(item.role)}">${escapeHtml(item.role)}</span></td>
        <td><span class="members-badge ${statusBadgeClass(Boolean(item.isActive))}">${item.isActive ? 'Ativo' : 'Inativo'}</span></td>
        <td>${escapeHtml(formatDateTime(item.lastLoginAt))}</td>
        <td>
          <div class="members-actions">
            <button class="btn btn-ghost" type="button" data-users-action="edit" data-membership-id="${escapeHtml(item.membershipId)}">Editar</button>
            <button class="btn btn-ghost" type="button" data-users-action="toggle" data-membership-id="${escapeHtml(item.membershipId)}">${item.isActive ? 'Inativar' : 'Ativar'}</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderMobileCards(members) {
    const safeMembers = Array.isArray(members) ? members : [];
    if (!safeMembers.length) {
      return '<article class="members-mobile-card members-mobile-card-empty">Nenhum usuário encontrado.</article>';
    }

    return safeMembers.map((item) => `
      <article class="members-mobile-card">
        <header>
          <div class="members-user-cell">
            <span class="members-avatar">${escapeHtml(getInitial(item.fullName, item.email))}</span>
            <div>
              <strong>${escapeHtml(item.fullName || item.email)}</strong>
              <p>${escapeHtml(item.email)}</p>
            </div>
          </div>
          <span class="members-badge ${roleBadgeClass(item.role)}">${escapeHtml(item.role)}</span>
        </header>
        <div class="members-mobile-meta">
          <span class="members-badge ${statusBadgeClass(Boolean(item.isActive))}">${item.isActive ? 'Ativo' : 'Inativo'}</span>
          <small>${escapeHtml(formatDateTime(item.lastLoginAt))}</small>
        </div>
        <div class="members-actions">
          <button class="btn btn-ghost" type="button" data-users-action="edit" data-membership-id="${escapeHtml(item.membershipId)}">Editar</button>
          <button class="btn btn-ghost" type="button" data-users-action="toggle" data-membership-id="${escapeHtml(item.membershipId)}">${item.isActive ? 'Inativar' : 'Ativar'}</button>
        </div>
      </article>
    `).join('');
  }

  window.ReservaAiMembersTable = {
    renderRows,
    renderMobileCards,
  };
})();
