(function () {
  const STORAGE_KEY = 'reservaai.auth.session';
  const PASSWORD_CHANGE_FLAG_KEY = 'nf_require_password_change';
  const BIOMETRIC_ENABLED_KEY = 'reservaai.biometric.enabled';
  const BIOMETRIC_REFRESH_TOKEN_KEY = 'reservaai.biometric.refreshToken';
  const DEVICE_ID_STORAGE_KEY = 'reservaai.auth.deviceId';
  const LOGIN_TENANT_ID_KEY = 'reservaai.login.tenantId';
  const LOGIN_TENANT_NAME_KEY = 'reservaai.login.tenantName';
  const engageCfg = window.ENGAGESOLAR_CONFIG || {};
  const APP_HOME = String(engageCfg.dashboardPath || '/index.html').trim() || '/index.html';
  const LOGIN_PAGE = String(engageCfg.loginPath || '/login.html').trim() || '/login.html';
  const CHANGE_PASSWORD_PATH = String(engageCfg.changePasswordPath || '/change-password.html').trim();
  const isLocalFileRuntime = window.location.protocol === 'file:';
  const isEngageDevProxy =
    window.location.protocol.startsWith('http')
    && /^((localhost)|127\.0\.0\.1):5173$/i.test(window.location.host);
  const resolvedApiBaseUrl = window.RESERVAAI_API_BASE_URL
    || (isEngageDevProxy
      ? '/api/identity'
      : (window.location.protocol.startsWith('http')
        ? `${window.location.origin}/api/identity`
        : (isLocalFileRuntime ? 'http://10.0.2.2:8080/api/identity' : 'http://localhost:8080/api/identity')));
  const apiBaseUrl = `${resolvedApiBaseUrl}`.replace(/\/$/, '');
  const gatewayBaseUrl = `${window.RESERVAAI_GATEWAY_URL || (window.location.protocol.startsWith('http') ? window.location.origin : '')}`.replace(/\/$/, '');

  const getOrCreateDeviceId = () => {
    try {
      let id = String(window.localStorage.getItem(DEVICE_ID_STORAGE_KEY) || '').trim();
      if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
      }
      return id.slice(0, 128);
    } catch (error) {
      return '';
    }
  };

  const isLikelyJwt = (value) => {
    const parts = String(value || '').split('.');
    return parts.length === 3 && parts[0].length > 0 && parts[1].length > 0;
  };

  const parseJsonSafely = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  };

  const getStoredSession = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  };

  const getPreferredLoginTenantId = () => {
    try {
      return String(window.localStorage.getItem(LOGIN_TENANT_ID_KEY) || '').trim();
    } catch (error) {
      return '';
    }
  };

  const getPreferredLoginTenantName = () => {
    try {
      return String(window.localStorage.getItem(LOGIN_TENANT_NAME_KEY) || '').trim();
    } catch (error) {
      return '';
    }
  };

  const savePreferredLoginTenant = (tenantId, tenantName) => {
    const id = String(tenantId || '').trim();
    if (!id) {
      return;
    }
    try {
      window.localStorage.setItem(LOGIN_TENANT_ID_KEY, id);
      const name = String(tenantName || '').trim();
      if (name) {
        window.localStorage.setItem(LOGIN_TENANT_NAME_KEY, name);
      } else {
        window.localStorage.removeItem(LOGIN_TENANT_NAME_KEY);
      }
    } catch (error) {
      return undefined;
    }
    return undefined;
  };

  const clearPreferredLoginTenant = () => {
    try {
      window.localStorage.removeItem(LOGIN_TENANT_ID_KEY);
      window.localStorage.removeItem(LOGIN_TENANT_NAME_KEY);
    } catch (error) {
      return undefined;
    }
    return undefined;
  };

  let sessionExpiryHandled = false;

  const isAccessTokenExpired = (token, skewSeconds = 30) => {
    const claims = readJwtPayload(token);
    const exp = claims?.exp;
    if (exp == null || !Number.isFinite(Number(exp))) {
      return false;
    }
    return Date.now() >= Number(exp) * 1000 - skewSeconds * 1000;
  };

  const isOnLoginScreen = () => {
    try {
      return /\/admin\/login(?:\.html)?$|\/login\.html$/i.test(window.location.pathname)
        || window.location.pathname.endsWith(LOGIN_PAGE);
    } catch (error) {
      return false;
    }
  };

  /** Rotas cujo 401 indica token/sessão inválidos (não confundir com 401 de recurso/tenant). */
  const SESSION_PROBE_PATTERNS = [
    /\/api\/auth\/session(?:\?|$)/i,
    /\/api\/operator\/auth\/me(?:\?|$)/i,
    /\/auth\/me(?:\?|$)/i,
  ];

  const shouldExpireSessionOnUnauthorized = (requestUrl) => {
    const url = String(requestUrl || '');
    if (!url) {
      return false;
    }
    return SESSION_PROBE_PATTERNS.some((pattern) => pattern.test(url));
  };

  const handleSessionExpired = (options = {}) => {
    if (sessionExpiryHandled) {
      return false;
    }
    sessionExpiryHandled = true;
    clearSession();
    clearPreferredLoginTenant();
    try {
      window.sessionStorage.removeItem('reservaai.calendar.tenant');
    } catch (error) {
      /* noop */
    }
    if (options.silent || isOnLoginScreen()) {
      return true;
    }
    redirectToLogin('session=expired');
    return true;
  };

  const readJwtPayload = (token) => {
    const raw = String(token || '').trim();
    if (!raw) {
      return null;
    }
    const parts = raw.split('.');
    if (parts.length !== 3) {
      return null;
    }
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      const json = atob(padded);
      return JSON.parse(json);
    } catch (error) {
      return null;
    }
  };

  const extractJwtTenantRole = (token) => {
    const claims = readJwtPayload(token);
    if (!claims || typeof claims !== 'object') {
      return '';
    }
    return String(
      claims.tenantRole
      || claims.tenant_role
      || claims.role
      || claims.membershipRole
      || claims.membership_role
      || '',
    ).trim();
  };

  const resolveTenantRole = (payload, token, tenantId) => {
    const tenant = payload?.tenant && typeof payload.tenant === 'object' ? payload.tenant : null;
    if (tenant?.role) {
      return String(tenant.role).trim();
    }
    if (Array.isArray(payload?.tenants) && tenantId) {
      const row = payload.tenants.find((item) => {
        const id = String(item?.id || item?.tenantId || item?.tenant_id || '').trim();
        return id && id === tenantId;
      });
      if (row?.role) {
        return String(row.role).trim();
      }
    }
    const jwtRole = extractJwtTenantRole(token);
    if (jwtRole) {
      return jwtRole;
    }
    return String(payload?.tenantRole || payload?.permissionGroup || '').trim();
  };

  const extractTenantFromAuthPayload = (payload) => {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const tenant = payload.tenant && typeof payload.tenant === 'object' ? payload.tenant : null;
    const id = String(
      tenant?.id
      || tenant?.tenantId
      || payload.tenantId
      || payload.tenant_id
      || '',
    ).trim();
    if (!id) {
      return null;
    }
    const name = String(
      tenant?.name
      || tenant?.title
      || tenant?.displayName
      || payload.tenantName
      || '',
    ).trim();
    return { id, name };
  };

  const saveSession = (payload, options = {}) => {
    const neuraFlowUserId = String(payload?.neuraFlowUserId || payload?.neura_flow_user_id || '').trim();
    const loginTenantId = String(options.loginTenantId || '').trim();
    const loginTenantName = String(options.loginTenantName || getPreferredLoginTenantName() || '').trim();
    let tenantCtx = extractTenantFromAuthPayload(payload);
    if (!tenantCtx?.id) {
      const claims = readJwtPayload(payload?.externalAccessToken);
      const claimId = String(claims?.tenantId || claims?.tenant_id || '').trim();
      if (claimId) {
        tenantCtx = { id: claimId, name: loginTenantName };
      }
    }
    if (loginTenantId) {
      tenantCtx = {
        id: loginTenantId,
        name: loginTenantName || tenantCtx?.name || '',
      };
      savePreferredLoginTenant(loginTenantId, tenantCtx.name);
    } else if (tenantCtx?.id) {
      savePreferredLoginTenant(tenantCtx.id, tenantCtx.name);
    }
    const activeTenantId = String(tenantCtx?.id || loginTenantId || '').trim();
    const externalAccessToken = payload?.externalAccessToken || '';
    const tenantRole = resolveTenantRole(payload, externalAccessToken, activeTenantId);
    const permissionGroup = String(payload?.permissionGroup || '').trim();
    const jwtClaims = readJwtPayload(externalAccessToken);
    const tenantsFromPayload = Array.isArray(payload?.tenants) ? payload.tenants : [];
    const resolveTenantLabel = (tenantRow) => {
      if (!tenantRow || typeof tenantRow !== 'object') return '';
      return String(
        tenantRow.name
        || tenantRow.tenantName
        || tenantRow.legalName
        || tenantRow.tradeName
        || '',
      ).trim();
    };
    let resolvedTenantName = String(tenantCtx?.name || loginTenantName || '').trim();
    if (!resolvedTenantName && activeTenantId && tenantsFromPayload.length) {
      const activeRow = tenantsFromPayload.find(
        (row) => String(row?.id || row?.tenantId || '').trim() === activeTenantId,
      );
      resolvedTenantName = resolveTenantLabel(activeRow);
    }
    const canManageTenant = tenantsFromPayload.some((tenant) => {
      const role = String(tenant?.role || '').trim().toUpperCase();
      return tenant?.canManageTenant === true || role === 'OWNER' || role === 'ADMIN' || role === 'TENANT_ADMIN';
    });
    const session = {
      authenticated: Boolean(payload?.authenticated),
      username: payload?.username || '',
      email: payload?.email || payload?.username || '',
      fullName: payload?.fullName || '',
      displayName: payload?.fullName || payload?.displayName || payload?.username || payload?.email || '',
      neuraFlowUserId,
      id: neuraFlowUserId || String(payload?.id || '').trim(),
      permissionGroup,
      tenantRole: tenantRole || permissionGroup,
      platformRole: payload?.platformRole || (jwtClaims?.platformAdmin === true ? 'PLATFORM_ADMIN' : ''),
      managedTenant: payload?.managedTenant === true || jwtClaims?.managedTenant === true,
      tenants: tenantsFromPayload,
      canManageTenant: canManageTenant || payload?.canManageTenant === true,
      externalAccessToken: payload?.externalAccessToken || '',
      externalTokenSource: payload?.externalTokenSource || '',
      refreshToken: payload?.refreshToken || payload?.refresh_token || '',
      expiresIn: payload?.expiresIn != null ? Number(payload.expiresIn) : (payload?.expires_in != null ? Number(payload.expires_in) : null),
      tenantId: activeTenantId,
      activeTenantId,
      tenantName: resolvedTenantName || getPreferredLoginTenantName() || '',
      redirectTo: payload?.redirectTo || APP_HOME,
      requirePasswordChange: Boolean(payload?.requirePasswordChange),
    };

    if (session.requirePasswordChange) {
      session.redirectTo = CHANGE_PASSWORD_PATH;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    if (session.requirePasswordChange) {
      window.localStorage.setItem(PASSWORD_CHANGE_FLAG_KEY, 'true');
    } else {
      window.localStorage.removeItem(PASSWORD_CHANGE_FLAG_KEY);
    }
    return session;
  };

  const clearSession = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(PASSWORD_CHANGE_FLAG_KEY);
      window.localStorage.removeItem('reservaai.calendar.tenant');
    } catch (error) {
      return undefined;
    }
    return undefined;
  };

  const isPasswordChangeRequired = () => {
    try {
      const flag = window.localStorage.getItem(PASSWORD_CHANGE_FLAG_KEY) === 'true';
      return flag || Boolean(getStoredSession()?.requirePasswordChange);
    } catch (error) {
      return Boolean(getStoredSession()?.requirePasswordChange);
    }
  };

  const clearPasswordChangeRequired = () => {
    try {
      window.localStorage.removeItem(PASSWORD_CHANGE_FLAG_KEY);
      const current = getStoredSession();
      if (current) {
        current.requirePasswordChange = false;
        current.redirectTo = APP_HOME;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      }
    } catch (error) {
      return undefined;
    }
    return undefined;
  };

  const markPasswordChangeRequired = () => {
    try {
      window.localStorage.setItem(PASSWORD_CHANGE_FLAG_KEY, 'true');
      const current = getStoredSession();
      if (current) {
        current.requirePasswordChange = true;
        current.redirectTo = CHANGE_PASSWORD_PATH;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      }
    } catch (error) {
      return undefined;
    }
    return undefined;
  };

  const requestWithFallback = async (paths, options = {}) => {
    let lastResult = null;
    for (let index = 0; index < paths.length; index += 1) {
      const result = await authFetch(paths[index], options);
      lastResult = result;
      if (result.response.status !== 404 || index === paths.length - 1) {
        return result;
      }
    }
    return lastResult;
  };

  const authFetch = async (path, options = {}) => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      credentials: options.credentials || 'include',
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    const payload = await parseJsonSafely(response);
    return { response, payload };
  };

  const biometricLoginFetch = async (tokenValue) => {
    const biometricPath = '/api/auth/biometric-login';
    const body = JSON.stringify({ accessToken: tokenValue });
    const response = await fetch(`${apiBaseUrl}${biometricPath}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
    });
    const payload = await parseJsonSafely(response);
    return { response, payload };
  };

  const refreshSessionFetch = async (refreshTokenValue) => {
    const refreshPath = '/api/auth/refresh';
    const bodyPayload = {
      refreshToken: String(refreshTokenValue || '').trim(),
    };
    const clientId = window.RESERVAAI_NF_REFRESH_CLIENT_ID || window.RESERVAAI_NF_CLIENT_ID;
    if (clientId) {
      bodyPayload.clientId = String(clientId).trim();
    }
    const deviceId = getOrCreateDeviceId();
    if (deviceId) {
      bodyPayload.deviceId = deviceId;
    }
    const response = await fetch(`${apiBaseUrl}${refreshPath}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });
    const payload = await parseJsonSafely(response);
    return { response, payload };
  };

  const isCapacitorRuntime = () => Boolean(window.Capacitor && typeof window.Capacitor === 'object');

  const getCapacitorPlugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};

  const getBiometricPlugin = () => {
    const plugins = getCapacitorPlugins();
    return plugins.Biometrics || plugins.NativeBiometric || null;
  };

  const getSecureStoragePlugin = () => {
    const plugins = getCapacitorPlugins();
    return plugins.SecurePreferences
      || plugins.SecureStorage
      || plugins.CapacitorSecureStoragePlugin
      || plugins.CapacitorSecureStorage
      || null;
  };

  const extractPluginStoredValue = (result) => {
    if (result == null) {
      return '';
    }
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return String(result);
    }
    return String(
      result.value
      || result.result
      || result.data
      || result.item
      || result.storedValue
      || result.secureValue
      || ''
    );
  };

  const secureSet = async (key, value) => {
    const plugin = getSecureStoragePlugin();
    const normalizedValue = String(value || '');
    const persistLocalFallback = () => {
      window.localStorage.setItem(key, normalizedValue);
    };
    if (!plugin) {
      persistLocalFallback();
      return;
    }
    try {
      if (typeof plugin.set === 'function') {
        await plugin.set({ key, value: normalizedValue });
      } else if (typeof plugin.setItem === 'function') {
        await plugin.setItem({ key, value: normalizedValue });
      } else if (typeof plugin.setValue === 'function') {
        await plugin.setValue({ key, value: normalizedValue });
      } else if (typeof plugin.setPreference === 'function') {
        await plugin.setPreference({ key, value: normalizedValue });
      }
    } catch (error) {
      // ignored: fallback local guarantees portability across plugin variants
    }
    persistLocalFallback();
  };

  const secureGet = async (key) => {
    const plugin = getSecureStoragePlugin();
    const localFallback = () => String(window.localStorage.getItem(key) || '');
    if (!plugin) {
      return localFallback();
    }
    try {
      if (typeof plugin.get === 'function') {
        const result = await plugin.get({ key });
        const value = extractPluginStoredValue(result);
        return value || localFallback();
      }
      if (typeof plugin.getItem === 'function') {
        const result = await plugin.getItem({ key });
        const value = extractPluginStoredValue(result);
        return value || localFallback();
      }
      if (typeof plugin.getValue === 'function') {
        const result = await plugin.getValue({ key });
        const value = extractPluginStoredValue(result);
        return value || localFallback();
      }
      if (typeof plugin.getPreference === 'function') {
        const result = await plugin.getPreference({ key });
        const value = extractPluginStoredValue(result);
        return value || localFallback();
      }
    } catch (error) {
      return localFallback();
    }
    return localFallback();
  };

  const secureRemove = async (key) => {
    const plugin = getSecureStoragePlugin();
    if (!plugin) {
      window.localStorage.removeItem(key);
      return;
    }
    if (typeof plugin.remove === 'function') {
      await plugin.remove({ key });
      return;
    }
    if (typeof plugin.removeItem === 'function') {
      await plugin.removeItem({ key });
      return;
    }
    if (typeof plugin.removeValue === 'function') {
      await plugin.removeValue({ key });
      return;
    }
    if (typeof plugin.removePreference === 'function') {
      await plugin.removePreference({ key });
      return;
    }
    window.localStorage.removeItem(key);
  };

  const clearSecureSession = async () => {
    await Promise.all([
      secureRemove(BIOMETRIC_ENABLED_KEY).catch(() => undefined),
      secureRemove(BIOMETRIC_REFRESH_TOKEN_KEY).catch(() => undefined),
    ]);
  };

  const isBiometryAvailableOnDevice = async () => {
    if (!isCapacitorRuntime()) {
      return false;
    }
    const plugin = getBiometricPlugin();
    if (!plugin) {
      return false;
    }
    if (typeof plugin.isAvailable === 'function') {
      const status = await plugin.isAvailable();
      return Boolean(status?.isAvailable || status?.available);
    }
    if (typeof plugin.checkBiometry === 'function') {
      const status = await plugin.checkBiometry();
      return Boolean(status?.isAvailable || status?.strongBiometryIsAvailable || status?.weakBiometryIsAvailable);
    }
    return false;
  };

  const authenticateBiometry = async () => {
    const plugin = getBiometricPlugin();
    if (!plugin) {
      throw new Error('Biometria não disponível neste dispositivo.');
    }
    if (typeof plugin.authenticate === 'function') {
      await plugin.authenticate({
        reason: 'Confirme sua identidade para entrar com biometria.',
        title: 'Entrar com biometria',
        subtitle: 'ReservaAI',
      });
      return;
    }
    if (typeof plugin.verifyIdentity === 'function') {
      await plugin.verifyIdentity({
        reason: 'Confirme sua identidade para entrar com biometria.',
        title: 'Entrar com biometria',
        subtitle: 'ReservaAI',
      });
      return;
    }
    throw new Error('Plugin de biometria sem método compatível.');
  };

  const normalizeAuthPayload = (payload, response, usuarioFallback = '') => {
    const token = payload?.externalAccessToken || payload?.access_token || payload?.accessToken || '';
    const refresh = payload?.refreshToken || payload?.refresh_token || '';
    const expiresIn = payload?.expiresIn != null ? Number(payload.expiresIn) : (payload?.expires_in != null ? Number(payload.expires_in) : null);
    return payload?.authenticated
      ? payload
      : {
        authenticated: response.ok && Boolean(token),
        username: payload?.username || payload?.email || payload?.user?.email || usuarioFallback,
        email: payload?.email || payload?.user?.email || usuarioFallback,
        fullName: payload?.fullName || payload?.displayName || payload?.user?.fullName || '',
        displayName: payload?.displayName || payload?.fullName || payload?.user?.fullName || payload?.user?.email || usuarioFallback,
        neuraFlowUserId: String(payload?.neuraFlowUserId || payload?.neura_flow_user_id || '').trim(),
        id: String(payload?.neuraFlowUserId || payload?.neura_flow_user_id || payload?.id || payload?.user?.id || '').trim(),
        permissionGroup: payload?.permissionGroup || payload?.tenant?.role || '',
        externalAccessToken: token,
        externalTokenSource: payload?.externalTokenSource || 'live',
        requirePasswordChange: Boolean(payload?.requirePasswordChange),
        redirectTo: APP_HOME,
        refreshToken: refresh,
        expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
      };
  };

  const buildLoginPasswordError = (response, payload) => {
    const tenants = Array.isArray(payload?.tenants) ? payload.tenants : [];
    if (response.status === 400 && tenants.length > 0) {
      const err = new Error(
        typeof payload?.message === 'string' && payload.message
          ? payload.message
          : 'Sua conta está em mais de uma empresa. Escolha onde deseja entrar.',
      );
      err.code = payload?.code || 'TENANT_REQUIRED';
      err.tenants = tenants;
      return err;
    }
    const message = Array.isArray(payload?.message)
      ? payload.message.join(' ')
      : (payload?.message || payload?.error || 'Não foi possível entrar no momento.');
    return new Error(message);
  };

  const completeOAuthLogin = async (tenantId) => {
    const id = String(tenantId || '').trim();
    if (!id) {
      throw new Error('Selecione a empresa para continuar.');
    }

    const { response, payload } = await authFetch('/api/auth/oauth/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenantId: id }),
    });

    const normalizedPayload = normalizeAuthPayload(payload, response, '');

    if (!response.ok || !normalizedPayload?.authenticated) {
      const tenants = Array.isArray(payload?.tenants) ? payload.tenants : [];
      if (response.status === 400 && tenants.length > 0) {
        const err = new Error(
          typeof payload?.message === 'string' && payload.message
            ? payload.message
            : 'Sua conta está em mais de uma empresa. Escolha onde deseja entrar.',
        );
        err.code = payload?.code || 'TENANT_REQUIRED';
        err.tenants = tenants;
        throw err;
      }
      throw new Error(
        payload?.message
        || 'Não foi possível concluir o login social. Tente novamente com Google ou Apple.',
      );
    }

    const session = saveSession(normalizedPayload, {
      loginTenantId: id,
      loginTenantName: getPreferredLoginTenantName(),
    });
    return {
      session,
      refreshToken: String(normalizedPayload?.refreshToken || payload?.refreshToken || payload?.refresh_token || ''),
    };
  };

  const loginWithPassword = async (usuario, senha, options = {}) => {
    const tenantId = String(options.tenantId || '').trim();
    const body = { usuario, senha };
    if (tenantId) {
      body.tenantId = tenantId;
    }

    const { response, payload } = await authFetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const normalizedPayload = normalizeAuthPayload(payload, response, usuario);

    if (!response.ok || !normalizedPayload?.authenticated) {
      throw buildLoginPasswordError(response, payload);
    }

    const session = saveSession(normalizedPayload, {
      loginTenantId: tenantId,
      loginTenantName: getPreferredLoginTenantName(),
    });
    return {
      session,
      refreshToken: String(normalizedPayload?.refreshToken || payload?.refreshToken || payload?.refresh_token || ''),
    };
  };

  const resolveBiometricSessionToken = async (tokenHint) => {
    const direct = String(tokenHint || '').trim();
    if (direct) {
      return direct;
    }

    const stored = getStoredSession();
    const fromRefresh = String(stored?.refreshToken || '').trim();
    if (fromRefresh) {
      return fromRefresh;
    }
    const fromStored = String(stored?.externalAccessToken || '').trim();
    if (fromStored) {
      return fromStored;
    }

    const synced = await syncSession().catch(() => null);
    return String(synced?.refreshToken || synced?.externalAccessToken || '').trim();
  };

  const enableBiometricLogin = async (refreshToken) => {
    const normalizedToken = await resolveBiometricSessionToken(refreshToken);
    if (!normalizedToken) {
      throw new Error('Token de sessão indisponível para ativar biometria.');
    }
    const available = await isBiometryAvailableOnDevice();
    if (!available) {
      throw new Error('Biometria não disponível ou não cadastrada neste dispositivo.');
    }
    await secureSet(BIOMETRIC_REFRESH_TOKEN_KEY, normalizedToken);
    await secureSet(BIOMETRIC_ENABLED_KEY, 'true');
    return true;
  };

  const disableBiometricLogin = async () => {
    await clearSecureSession();
    return true;
  };

  const isBiometricLoginAvailable = async () => {
    if (!isCapacitorRuntime()) {
      return { available: false, reason: 'not_mobile' };
    }
    const enabled = (await secureGet(BIOMETRIC_ENABLED_KEY)) === 'true';
    const refreshToken = await secureGet(BIOMETRIC_REFRESH_TOKEN_KEY);
    const hasBiometry = await isBiometryAvailableOnDevice();
    return {
      available: Boolean(enabled && refreshToken && hasBiometry),
      biometricEnabled: enabled,
      hasRefreshToken: Boolean(refreshToken),
      hasBiometry,
    };
  };

  const loginWithBiometrics = async () => {
    await authenticateBiometry();
    const storedCredential = await secureGet(BIOMETRIC_REFRESH_TOKEN_KEY);
    if (!storedCredential) {
      throw new Error('Sessão biométrica não encontrada. Faça login com senha.');
    }
    let response;
    let payload;
    if (isLikelyJwt(storedCredential)) {
      const result = await biometricLoginFetch(storedCredential);
      response = result.response;
      payload = result.payload;
    } else {
      const result = await refreshSessionFetch(storedCredential);
      response = result.response;
      payload = result.payload;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await clearSecureSession();
        clearSession();
        throw new Error('Seu acesso biométrico expirou. Faça login com usuário e senha.');
      }
      throw new Error(payload?.message || 'Não foi possível renovar a sessão com biometria.');
    }
    const normalizedPayload = normalizeAuthPayload(payload || {}, response, '');
    if (!normalizedPayload?.authenticated || !normalizedPayload?.externalAccessToken) {
      await clearSecureSession();
      clearSession();
      throw new Error('Sessão inválida. Faça login com usuário e senha.');
    }
    saveSession(normalizedPayload);
    const rotatedRefresh = String(normalizedPayload?.refreshToken || '').trim();
    if (rotatedRefresh) {
      await secureSet(BIOMETRIC_REFRESH_TOKEN_KEY, rotatedRefresh);
    }
    return getStoredSession();
  };

  const enrichSessionFromAuthMe = async (session) => {
    if (!session?.externalAccessToken) {
      return session;
    }
    const token = session.externalAccessToken;
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    let updated = session;
    const merge = (payload) => {
      if (!payload || typeof payload !== 'object') return;
      updated = window.ReservaPermissions?.mergeOperatorAuthMe?.(updated, payload) || updated;
    };

    const base = `${apiBaseUrl}`.replace(/\/$/, '');
    const messagingBase = base.includes('/api/identity')
      ? base.replace(/\/api\/identity$/, '/api/messaging')
      : '/api/messaging';
    try {
      const response = await fetch(`${messagingBase}/auth/me`, { method: 'GET', headers, credentials: 'include' });
      if (response.ok) {
        merge(await response.json());
      }
    } catch (_error) {
      /* noop */
    }

    try {
      const operatorResponse = await fetch('/api/operator/auth/me', { method: 'GET', headers, credentials: 'include' });
      if (operatorResponse.ok) {
        merge(await operatorResponse.json());
      }
    } catch (_error) {
      /* noop */
    }

    if (updated !== session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  };

  const syncSession = async () => {
    const { response, payload } = await authFetch('/api/auth/session');

    if (response.status === 401) {
      handleSessionExpired({ silent: isOnLoginScreen() });
      return null;
    }

    if (!response.ok || !payload?.authenticated || !payload?.externalAccessToken) {
      clearSession();
      return null;
    }

    const saved = saveSession(payload);
    return enrichSessionFromAuthMe(saved);
  };

  const fetchProviders = async () => {
    const { response, payload } = await authFetch('/api/auth/providers');
    if (!response.ok || !payload) {
      throw new Error('Não foi possível carregar as opções de login.');
    }

    return payload;
  };

  const logout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      return undefined;
    } finally {
      clearSession();
      clearPreferredLoginTenant();
    }

    return undefined;
  };

  const forgotPassword = async (email) => {
    const { response } = await authFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      throw new Error('Não foi possível processar sua solicitação. Tente novamente em instantes.');
    }
    return { ok: true };
  };

  const resetPassword = async (token, newPassword) => {
    const { response, payload } = await authFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    if (!response.ok) {
      throw new Error(payload?.message || 'Token invalido ou expirado. Solicite uma nova recuperacao.');
    }
    return { ok: true };
  };

  const changePassword = async (currentPassword, newPassword) => {
    const jwt = getStoredSession()?.externalAccessToken || '';
    if (!jwt) {
      throw new Error('Sua sessao expirou. Faca login novamente.');
    }
    const { response, payload } = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Senha atual invalida.');
      }
      if (response.status === 409) {
        throw new Error('A nova senha nao pode ser igual a senha atual.');
      }
      throw new Error(
        window.EngageUserMessages?.formatApiError
          ? window.EngageUserMessages.formatApiError(payload || {}, { context: 'auth', fallback: 'Não foi possível alterar a senha agora.' })
          : (payload?.message || 'Não foi possível alterar a senha agora.'),
      );
    }
    clearPasswordChangeRequired();
    return { ok: true };
  };

  const normalizeAdminPath = (redirectTo) => {
    if (!redirectTo) {
      return APP_HOME;
    }

    if (redirectTo === '/admin' || redirectTo === '/admin.html' || redirectTo === '/admin/admin.html') {
      return APP_HOME;
    }

    if (redirectTo === '/login.html' || redirectTo === '/admin/login.html' || redirectTo === '/admin/login') {
      return LOGIN_PAGE;
    }

    return redirectTo;
  };

  const redirectToAdmin = (redirectTo) => {
    if (isPasswordChangeRequired()) {
      window.location.href = CHANGE_PASSWORD_PATH;
      return;
    }
    window.location.href = normalizeAdminPath(redirectTo);
  };

  const redirectToChangePassword = () => {
    window.location.href = CHANGE_PASSWORD_PATH;
  };

  const redirectToLogin = (reason) => {
    const query = reason
      ? (reason.includes('=') ? `?${reason}` : `?error=${encodeURIComponent(reason)}`)
      : '';
    window.location.href = `${LOGIN_PAGE}${query}`;
  };

  const requireAuthenticatedSession = async () => {
    const currentQuery = new URLSearchParams(window.location.search);
    const forceRefresh = currentQuery.get('auth') === 'success';
    const stored = !forceRefresh ? getStoredSession() : null;

    const acceptStoredToken = (candidate) => {
      const token = String(candidate?.externalAccessToken || '').trim();
      if (!token) {
        return false;
      }
      const source = String(candidate?.externalTokenSource || '').toLowerCase();
      return source === 'live' || source === 'biometric' || !source;
    };

    if (acceptStoredToken(stored)) {
      if (isAccessTokenExpired(stored.externalAccessToken)) {
        clearSession();
      } else {
        if (isPasswordChangeRequired() && !window.location.pathname.endsWith('/change-password')) {
          redirectToChangePassword();
        }
        return stored;
      }
    }

    const synced = await syncSession();
    if (acceptStoredToken(synced)) {
      if (isAccessTokenExpired(synced.externalAccessToken)) {
        handleSessionExpired();
        return null;
      }
      if (isPasswordChangeRequired() && !window.location.pathname.endsWith('/change-password')) {
        redirectToChangePassword();
      }
      return synced;
    }

    redirectToLogin('token_required');
    return null;
  };

  const fetchPendingLoginTenants = async () => {
    const { response, payload } = await authFetch('/api/auth/pending-tenants', { method: 'GET' });
    if (response.status === 204 || !response.ok) {
      return [];
    }
    return Array.isArray(payload?.tenants) ? payload.tenants : [];
  };

  const buildOAuthUrl = (providerName, tenantId) => {
    const base = `${apiBaseUrl}/oauth2/authorization/${providerName}`;
    const id = String(tenantId || '').trim();
    if (!id) {
      return base;
    }
    const qs = new URLSearchParams({ tenantId: id });
    return `${base}?${qs.toString()}`;
  };

  const defaultTenantId = String(engageCfg.tenantId || '').trim();
  const defaultTenantName = String(engageCfg.tenantName || '').trim();
  if (defaultTenantId && !getPreferredLoginTenantId()) {
    savePreferredLoginTenant(defaultTenantId, defaultTenantName);
  }

  window.ReservaAiAuth = {
    apiBaseUrl,
    getStoredSession,
    /** Alias: sessão persistida (sem merge /auth/me). Preferir `ReservaAiAdminSession.getSession` no iframe do admin. */
    getSession: getStoredSession,
    saveSession,
    clearSession,
    isPasswordChangeRequired,
    clearPasswordChangeRequired,
    markPasswordChangeRequired,
    loginWithPassword,
    completeOAuthLogin,
    fetchPendingLoginTenants,
    getPreferredLoginTenantId,
    getPreferredLoginTenantName,
    savePreferredLoginTenant,
    clearPreferredLoginTenant,
    enableBiometricLogin,
    isBiometricLoginAvailable,
    loginWithBiometrics,
    disableBiometricLogin,
    clearSecureSession,
    forgotPassword,
    resetPassword,
    changePassword,
    syncSession,
    fetchProviders,
    logout,
    redirectToAdmin,
    redirectToChangePassword,
    redirectToLogin,
    handleSessionExpired,
    shouldExpireSessionOnUnauthorized,
    isAccessTokenExpired,
    requireAuthenticatedSession,
    buildOAuthUrl,
    getAccessToken() {
      return getStoredSession()?.externalAccessToken || '';
    },
    enrichSessionFromAuthMe,
    formatTenantRoleLabel(role) {
      const safe = String(role || '').trim().toUpperCase();
      if (safe === 'OWNER') return 'Proprietário';
      if (safe === 'ADMIN') return 'Administrador';
      if (safe === 'OPERATOR') return 'Operador';
      if (safe === 'PLATFORM_ADMIN') return 'Administrador da plataforma';
      const lower = String(role || '').trim().toLowerCase();
      if (lower === 'admin') return 'Administrador';
      if (lower === 'owner') return 'Proprietário';
      if (lower === 'operator' || lower === 'operador') return 'Operador';
      return safe ? safe.charAt(0) + safe.slice(1).toLowerCase() : '';
    },
  };

  window.EngageSolarAuth = window.ReservaAiAuth;
  window.EngageSolarAuth.redirectToApp = window.ReservaAiAuth.redirectToAdmin;
  window.EngageSolarAuth.requireAuth = window.ReservaAiAuth.requireAuthenticatedSession;
})();