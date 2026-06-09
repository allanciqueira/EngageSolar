/**
 * Permissões de tenant/admin — alinhado ao admin-shell (managedTenant, JWT, /auth/me).
 */
(function () {
  const MANAGE_ROLES = new Set(['OWNER', 'ADMIN', 'TENANT_ADMIN']);

  function readExternalTokenClaims(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      const json = atob(padded);
      const decoded = decodeURIComponent(
        Array.from(json)
          .map((ch) => `%${('00' + ch.charCodeAt(0).toString(16)).slice(-2)}`)
          .join(''),
      );
      return JSON.parse(decoded);
    } catch (_) {
      return null;
    }
  }

  function tenantHasManageAccess(tenant) {
    const role = String(tenant?.role || '').trim().toUpperCase();
    return tenant?.canManageTenant === true || MANAGE_ROLES.has(role);
  }

  function tenantRoleSuggestsManage(role) {
    return MANAGE_ROLES.has(String(role || '').trim().toUpperCase());
  }

  function sessionExternalTokenSuggestsElevation(session) {
    const claims = readExternalTokenClaims(session?.externalAccessToken);
    if (!claims) return false;
    if (claims.platformAdmin === true || claims.managedTenant === true) return true;
    const tenantRole = String(claims.tenantRole || claims.tenant_role || '').trim().toUpperCase();
    return tenantRoleSuggestsManage(tenantRole);
  }

  function isPlatformAdminSession(session) {
    const permissionGroup = String(session?.permissionGroup || '').trim().toLowerCase();
    const platformRole = String(session?.platformRole || '').trim().toUpperCase();
    return permissionGroup === 'platform_admin' || platformRole === 'PLATFORM_ADMIN';
  }

  function canManageTenantSession(session) {
    if (!session || typeof session !== 'object') return false;
    if (session.canManageTenant === true) return true;
    const memberships = Array.isArray(session.tenants) ? session.tenants : [];
    if (memberships.some((tenant) => tenantHasManageAccess(tenant))) return true;
    return sessionExternalTokenSuggestsElevation(session);
  }

  function isAdminSession(session) {
    if (!session || typeof session !== 'object') return false;
    const permissionGroup = String(session.permissionGroup || '').trim().toLowerCase();
    if (permissionGroup === 'admin' || permissionGroup === 'platform_admin') return true;
    if (session.canManageTenant === true) return true;
    if (session.platformRole === 'PLATFORM_ADMIN') return true;
    if (session.managedTenant === true) return true;
    const memberships = Array.isArray(session.tenants) ? session.tenants : [];
    if (memberships.some((tenant) => tenantHasManageAccess(tenant))) return true;
    const tenantRole = String(session.tenantRole || '').trim().toUpperCase();
    if (tenantRoleSuggestsManage(tenantRole)) return true;
    return sessionExternalTokenSuggestsElevation(session);
  }

  function isOperatorPermissionGroup(session) {
    const permissionGroup = String(session?.permissionGroup || '').trim().toLowerCase();
    return permissionGroup === 'operator' || permissionGroup === 'operador';
  }

  function isStrictOperatorSession(session) {
    if (!isOperatorPermissionGroup(session)) return false;
    if (isAdminSession(session)) return false;
    if (canManageTenantSession(session)) return false;
    if (session?.managedTenant === true) return false;
    if (session?.platformRole === 'PLATFORM_ADMIN') return false;
    return true;
  }

  function canAccessWhatsAppApi(session) {
    if (!session || typeof session !== 'object') return false;
    if (session.managedTenant === true) return true;
    return isAdminSession(session);
  }

  function resolveRoleForTenant(ctx, tenantId) {
    const tid = String(tenantId || '').trim();
    if (!tid) return '';
    const tenant = ctx?.tenant && typeof ctx.tenant === 'object' ? ctx.tenant : null;
    const tenantObjId = String(tenant?.id || tenant?.tenantId || '').trim();
    if (tenantObjId === tid && tenant?.role) {
      return String(tenant.role).trim();
    }
    const memberships = Array.isArray(ctx?.tenants) ? ctx.tenants : [];
    const row = memberships.find((item) => {
      const id = String(item?.id || item?.tenantId || '').trim();
      return id === tid;
    });
    if (row?.role) return String(row.role).trim();
    const activeId = String(ctx?.activeTenantId || ctx?.tenantId || '').trim();
    if (activeId === tid && ctx?.tenantRole) {
      return String(ctx.tenantRole).trim();
    }
    return '';
  }

  function canManageOperatorTenant(session, tenantId, tenantOptions, me) {
    const tid = String(tenantId || '').trim();
    if (!tid) return false;
    const ctx = {
      ...(session && typeof session === 'object' ? session : {}),
      ...(me && typeof me === 'object' ? me : {}),
    };
    if (ctx.managedTenant === true) return true;
    if (ctx.platformRole === 'PLATFORM_ADMIN' || isPlatformAdminSession(ctx)) return true;
    if (isAdminSession(ctx)) return true;
    if (canManageTenantSession(ctx)) return true;

    const opts = Array.isArray(tenantOptions) ? tenantOptions : [];
    const fromOptions = opts.find((item) => String(item?.id || item?.tenantId || '').trim() === tid);
    if (fromOptions) {
      if (fromOptions.canManageTenant === false) return false;
      if (tenantHasManageAccess(fromOptions)) return true;
    }

    const memberships = Array.isArray(ctx.tenants) ? ctx.tenants : [];
    const fromMembership = memberships.find((item) => String(item?.id || item?.tenantId || '').trim() === tid);
    if (fromMembership && tenantHasManageAccess(fromMembership)) return true;

    const role = resolveRoleForTenant(ctx, tid);
    if (tenantRoleSuggestsManage(role)) return true;

    return sessionExternalTokenSuggestsElevation(session);
  }

  function canSyncMetaConnections(session) {
    return canManageOperatorTenant(session, session?.activeTenantId || session?.tenantId, session?.tenants);
  }

  function normalizeTenantOption(tenant) {
    const safe = tenant && typeof tenant === 'object' ? tenant : {};
    const role = String(safe.role || '').trim();
    const roleUpper = role.toUpperCase();
    return {
      ...safe,
      id: safe.id || safe.tenantId || '',
      name: safe.name || safe.legalName || safe.tradeName || 'Empresa sem nome',
      role,
      canManageTenant: typeof safe.canManageTenant === 'boolean'
        ? safe.canManageTenant
        : tenantHasManageAccess({ role: roleUpper, canManageTenant: safe.canManageTenant }),
      document: safe.document || safe.cnpj || '',
      cnpj: safe.cnpj || safe.document || '',
      businessEmail: safe.businessEmail || safe.email || '',
      email: safe.email || safe.businessEmail || '',
      addressStreet: safe.addressStreet || safe.addressLine1 || '',
      addressLine1: safe.addressLine1 || safe.addressStreet || '',
      addressZipCode: safe.addressZipCode || safe.addressPostalCode || '',
      addressPostalCode: safe.addressPostalCode || safe.addressZipCode || '',
    };
  }

  function resolveEffectiveTenantId(session) {
    if (!session || typeof session !== 'object') return '';
    const direct = String(
      session.activeTenantId
      || session.tenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || '',
    ).trim();
    const tenants = Array.isArray(session.tenants) ? session.tenants : [];
    if (direct && (!tenants.length || tenants.some((t) => String(t?.id || t?.tenantId || '').trim() === direct))) {
      return direct;
    }
    const manageable = tenants.find((tenant) => tenantHasManageAccess(tenant));
    if (manageable) {
      return String(manageable.id || manageable.tenantId || '').trim();
    }
    const first = tenants.find((tenant) => tenant && (tenant.id || tenant.tenantId));
    return String(first?.id || first?.tenantId || direct || '').trim();
  }

  async function enrichSessionWithOperatorMe(session) {
    const base = session && typeof session === 'object' ? session : {};
    const api = window.EngageSolarApi || window.ReservaAiApi;
    if (!api?.request) return base;
    try {
      const me = await api.request('/api/operator/auth/me');
      return mergeOperatorAuthMe(base, me);
    } catch (_err) {
      return base;
    }
  }

  function mergeOperatorAuthMe(session, payload) {
    if (!payload || typeof payload !== 'object') {
      return session && typeof session === 'object' ? session : {};
    }
    const base = session && typeof session === 'object' ? session : {};
    const normalizePg = (value) => String(value || '').trim().toLowerCase();
    const payloadPg = normalizePg(payload.permissionGroup);
    const sessionPg = normalizePg(base.permissionGroup);
    const payloadLooksOperatorOnly = payloadPg === 'operator' || payloadPg === 'operador';
    const sessionMemberships = Array.isArray(base.tenants) ? base.tenants : [];
    const claims = readExternalTokenClaims(base.externalAccessToken);
    const sessionElevatedForMerge = base.managedTenant === true
      || payload.managedTenant === true
      || claims?.managedTenant === true
      || sessionPg === 'admin'
      || sessionPg === 'platform_admin'
      || base.canManageTenant === true
      || sessionMemberships.some((tenant) => tenantHasManageAccess(tenant));
    const permissionGroup = (sessionElevatedForMerge && payloadLooksOperatorOnly)
      ? (base.permissionGroup || payload.permissionGroup || '')
      : (payload.permissionGroup || base.permissionGroup || '');

    const mergedTenants = Array.isArray(payload.tenants) && payload.tenants.length > 0
      ? payload.tenants
      : (Array.isArray(base.tenants) ? base.tenants : []);
    const canManageTenant = mergedTenants.some((tenant) => tenantHasManageAccess(tenant))
      || Boolean(base.canManageTenant)
      || sessionElevatedForMerge;

    const activeTenantId = String(
      base.activeTenantId || base.tenantId || payload.tenantId || payload.tenant?.id || '',
    ).trim();

    let tenantRole = '';
    if (payload.tenant?.role) {
      tenantRole = String(payload.tenant.role).trim();
    } else if (Array.isArray(mergedTenants) && activeTenantId) {
      const row = mergedTenants.find((item) => String(item?.id || item?.tenantId || '').trim() === activeTenantId);
      if (row?.role) tenantRole = String(row.role).trim();
    }
    if (!tenantRole && base.tenantRole) {
      tenantRole = String(base.tenantRole).trim();
    }

    const effectiveTenantId = String(activeTenantId || base.activeTenantId || base.tenantId || '').trim();
    const tenantRow = mergedTenants.find(
      (item) => String(item?.id || item?.tenantId || '').trim() === effectiveTenantId,
    );
    const tenantName = String(
      tenantRow?.name
      || tenantRow?.tenantName
      || tenantRow?.legalName
      || tenantRow?.tradeName
      || payload.tenant?.name
      || payload.tenant?.tenantName
      || base.tenantName
      || '',
    ).trim();

    return {
      ...base,
      ...payload,
      permissionGroup,
      platformRole: payload.platformRole || base.platformRole || '',
      tenants: mergedTenants,
      canManageTenant,
      managedTenant: payload.managedTenant === true
        || base.managedTenant === true
        || claims?.managedTenant === true,
      tenantRole: tenantRole || base.tenantRole || permissionGroup,
      tenantId: effectiveTenantId || base.tenantId,
      activeTenantId: effectiveTenantId || base.activeTenantId,
      tenantName,
    };
  }

  const api = {
    tenantHasManageAccess,
    tenantRoleSuggestsManage,
    readExternalTokenClaims,
    sessionExternalTokenSuggestsElevation,
    isPlatformAdminSession,
    canManageTenantSession,
    isAdminSession,
    isOperatorPermissionGroup,
    isStrictOperatorSession,
    canAccessWhatsAppApi,
    canManageOperatorTenant,
    canSyncMetaConnections,
    normalizeTenantOption,
    mergeOperatorAuthMe,
    resolveEffectiveTenantId,
    enrichSessionWithOperatorMe,
    resolveRoleForTenant,
  };

  window.ReservaPermissions = api;

  const shell = window.ReservaAiAdminShell || {};
  window.ReservaAiAdminShell = {
    ...shell,
    canAccessWhatsAppApi,
    isAdminSession,
    isStrictOperatorSession,
    canManageTenantSession,
    canManageOperatorTenant,
    mergeOperatorAuthMe,
    normalizeTenantOption,
    getCurrentSession: shell.getCurrentSession || (() => null),
  };
})();
