(function () {
  const authService = window.EngageSolarAuth;
  const cfg = window.ENGAGESOLAR_CONFIG || {};
  const form = document.querySelector('#esLoginForm');
  const messageBox = document.querySelector('#esLoginMessage');
  const passwordInput = document.querySelector('#esPassword');
  const passwordToggle = document.querySelector('#esPasswordToggle');
  const rememberCheckbox = document.querySelector('#esRemember');
  const submitBtn = document.querySelector('#esLoginSubmit');
  const loginSubmitLabel = document.querySelector('#esLoginSubmitLabel');
  const socialButtons = Array.from(document.querySelectorAll('[data-auth-provider]'));
  const tenantPicker = document.querySelector('#esTenantPicker');
  const tenantSelect = document.querySelector('#esTenantSelect');
  const credentialsBlock = document.querySelector('#esLoginCredentials');
  const REMEMBER_USER_KEY = 'engagesolar.login.rememberUser';
  const LOGIN_TENANTS_CACHE_KEY = 'engagesolar.login.tenantsCache';

  if (!authService || !form) {
    return;
  }

  let tenantPickerRequired = false;
  let cachedTenantOptions = [];
  let pendingOAuthProvider = '';

  const providerLabels = {
    google: 'Google',
    apple: 'Apple',
    microsoft: 'Microsoft',
  };

  const setMessage = (message, type = 'info') => {
    if (!messageBox) return;
    messageBox.textContent = message || '';
    messageBox.dataset.type = type;
    messageBox.hidden = !message;
  };

  const formatLoginError = (error, fallback) => (
    window.EngageUserMessages?.formatCatchError
      ? window.EngageUserMessages.formatCatchError(error, { context: 'auth', fallback })
      : (error?.message || fallback)
  );

  const formatTenantRole = (role) => {
    const safe = String(role || '').toUpperCase();
    if (safe === 'OWNER') return 'Proprietário';
    if (safe === 'ADMIN') return 'Administrador';
    if (safe === 'OPERATOR') return 'Operador';
    return safe ? safe.charAt(0) + safe.slice(1).toLowerCase() : '';
  };

  const normalizeTenantOption = (row) => {
    if (!row || typeof row !== 'object') return null;
    const id = String(row.id || row.tenantId || row.tenant_id || '').trim();
    if (!id) return null;
    const name = String(row.name || row.title || row.displayName || row.tenantName || 'Empresa').trim();
    const role = formatTenantRole(row.role || row.tenantRole);
    return { id, name, role };
  };

  const cacheTenantOptions = (options) => {
    cachedTenantOptions = Array.isArray(options) ? options : [];
    try {
      if (cachedTenantOptions.length) {
        window.sessionStorage.setItem(LOGIN_TENANTS_CACHE_KEY, JSON.stringify(cachedTenantOptions));
      } else {
        window.sessionStorage.removeItem(LOGIN_TENANTS_CACHE_KEY);
      }
    } catch (e) {
      /* noop */
    }
  };

  const readCachedTenantOptions = () => {
    if (cachedTenantOptions.length) return cachedTenantOptions;
    try {
      const raw = window.sessionStorage.getItem(LOGIN_TENANTS_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeTenantOption).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  };

  const updateSubmitForTenantStep = (active) => {
    if (loginSubmitLabel) {
      loginSubmitLabel.textContent = active
        ? 'Continuar na empresa selecionada'
        : 'Acessar Plataforma';
    }
  };

  const hideTenantPicker = () => {
    tenantPickerRequired = false;
    if (tenantPicker) tenantPicker.hidden = true;
    if (tenantSelect) tenantSelect.required = false;
    updateSubmitForTenantStep(false);
  };

  const showTenantPicker = (tenants) => {
    if (!tenantPicker || !tenantSelect) return [];
    const options = (Array.isArray(tenants) ? tenants : [])
      .map(normalizeTenantOption)
      .filter(Boolean);
    if (!options.length) return [];
    cacheTenantOptions(options);
    tenantPickerRequired = true;
    tenantPicker.hidden = false;
    tenantSelect.required = true;
    tenantSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione a empresa…';
    tenantSelect.appendChild(placeholder);
    options.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.role ? `${item.name} · ${item.role}` : item.name;
      tenantSelect.appendChild(opt);
    });
    tenantSelect.value = '';
    updateSubmitForTenantStep(true);
    tenantSelect.focus();
    return options;
  };

  const isTenantPickerVisible = () => Boolean(tenantPicker && !tenantPicker.hidden);

  const resolvePendingOAuthProvider = () => {
    const fromQuery = String(new URLSearchParams(window.location.search).get('provider') || '').trim().toLowerCase();
    return fromQuery || String(pendingOAuthProvider || '').trim().toLowerCase();
  };

  const isOAuthPending = () => Boolean(resolvePendingOAuthProvider());

  const activateOAuthPendingMode = (provider) => {
    pendingOAuthProvider = String(provider || '').trim().toLowerCase();
    if (credentialsBlock) credentialsBlock.hidden = true;
    if (passwordInput) passwordInput.required = false;
    const userField = form.querySelector('[name="usuario"]');
    if (userField) userField.required = false;
  };

  const deactivateOAuthPendingMode = () => {
    pendingOAuthProvider = '';
    if (credentialsBlock) credentialsBlock.hidden = false;
    if (passwordInput) passwordInput.required = true;
    const userField = form.querySelector('[name="usuario"]');
    if (userField) userField.required = true;
  };

  const resolveLoginTenantId = () => {
    if (isTenantPickerVisible() && tenantSelect) {
      return String(tenantSelect.value || '').trim();
    }
    return String(cfg.tenantId || authService.getPreferredLoginTenantId?.() || '').trim();
  };

  const handleTenantRequired = async (tenants) => {
    const options = showTenantPicker(tenants);
    if (!options.length) {
      setMessage('Não foi possível listar as empresas disponíveis. Tente novamente.', 'error');
      return;
    }
    const label = options.length === 1
      ? 'Confirme a empresa e clique em «Continuar na empresa selecionada».'
      : `Você tem acesso a ${options.length} empresas. Selecione qual deseja usar.`;
    setMessage(label, 'error');
  };

  const cleanLoginQueryFromUrl = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (e) {
      /* noop */
    }
  };

  const setProviderState = (button, enabled) => {
    button.disabled = !enabled;
    button.hidden = !enabled;
  };

  passwordToggle?.addEventListener('click', () => {
    if (!passwordInput) return;
    const revealing = passwordInput.type === 'password';
    passwordInput.type = revealing ? 'text' : 'password';
    passwordToggle.setAttribute('aria-pressed', revealing ? 'true' : 'false');
    passwordToggle.setAttribute('aria-label', revealing ? 'Ocultar senha' : 'Mostrar senha');
    const iconShow = passwordToggle.querySelector('.es-password-icon-show');
    const iconHide = passwordToggle.querySelector('.es-password-icon-hide');
    if (revealing) {
      iconShow?.setAttribute('hidden', '');
      iconHide?.removeAttribute('hidden');
    } else {
      iconHide?.setAttribute('hidden', '');
      iconShow?.removeAttribute('hidden');
    }
  });

  try {
    const saved = localStorage.getItem(REMEMBER_USER_KEY);
    if (saved) {
      const userField = form.querySelector('[name="usuario"]');
      if (userField) userField.value = saved;
      if (rememberCheckbox) rememberCheckbox.checked = true;
    }
  } catch (e) {
    /* noop */
  }

  const completeLoginSuccess = async (result, options = {}) => {
    const session = result?.session || result;
    const chosenTenantId = resolveLoginTenantId();
    const hasLiveToken = Boolean(String(session?.externalAccessToken || '').trim());
    const skipTenantGate = Boolean(options.oauthCompleted || (hasLiveToken && chosenTenantId));
    let tenantChoices = cachedTenantOptions.length
      ? cachedTenantOptions
      : (Array.isArray(session?.tenants) ? session.tenants : []).map(normalizeTenantOption).filter(Boolean);

    if (!skipTenantGate && !chosenTenantId && !tenantChoices.length) {
      try {
        const pending = await authService.fetchPendingLoginTenants?.();
        tenantChoices = (Array.isArray(pending) ? pending : []).map(normalizeTenantOption).filter(Boolean);
        if (tenantChoices.length) cacheTenantOptions(tenantChoices);
      } catch (e) {
        /* noop */
      }
    }

    if (!skipTenantGate && !chosenTenantId && tenantChoices.length >= 1) {
      await handleTenantRequired(tenantChoices);
      return;
    }

    try {
      const usuario = form.querySelector('[name="usuario"]')?.value || '';
      if (rememberCheckbox?.checked && usuario) {
        localStorage.setItem(REMEMBER_USER_KEY, usuario);
      } else {
        localStorage.removeItem(REMEMBER_USER_KEY);
      }
    } catch (e) {
      /* noop */
    }

    if (chosenTenantId) {
      const match = cachedTenantOptions.find((item) => item.id === chosenTenantId);
      authService.savePreferredLoginTenant?.(chosenTenantId, match?.name || cfg.tenantName);
      if (session && typeof session === 'object') {
        session.tenantId = chosenTenantId;
        session.activeTenantId = chosenTenantId;
        if (match?.name) session.tenantName = match.name;
        authService.saveSession(session);
      }
    }

    deactivateOAuthPendingMode();
    hideTenantPicker();
    cleanLoginQueryFromUrl();
    setMessage('Login realizado. Redirecionando…', 'success');
    window.setTimeout(() => authService.redirectToApp(session?.redirectTo), 350);
  };

  const applyQueryFeedback = () => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('logout') === 'success') {
      setMessage('Sua sessão foi encerrada com sucesso.', 'success');
      return;
    }
    if (query.get('session') === 'expired') {
      setMessage('Sua sessão expirou. Entre novamente.', 'error');
      return;
    }
    const error = query.get('error');
    if (error === 'social_login_failed') {
      setMessage('Falha ao concluir o login social. Tente novamente.', 'error');
      return;
    }
    if (error === 'user_not_registered') {
      setMessage('Este e-mail não está cadastrado. Solicite acesso ao administrador.', 'error');
      return;
    }
    if (error === 'token_required') {
      setMessage('Faça login para continuar.', 'error');
      return;
    }
    if (error === 'tenant_required') {
      setMessage('Selecione a empresa para concluir o login.', 'error');
    }
    if (error && !['tenant_required', 'token_required'].includes(error)) {
      setMessage('Não foi possível entrar. Tente novamente.', 'error');
    }
  };

  const restorePendingTenantsFromOAuth = async () => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('error') !== 'tenant_required') return;
    const provider = query.get('provider');
    if (provider) activateOAuthPendingMode(provider);
    try {
      const tenants = await authService.fetchPendingLoginTenants?.();
      const list = (Array.isArray(tenants) ? tenants : []).map(normalizeTenantOption).filter(Boolean);
      if (list.length) {
        showTenantPicker(list);
        const providerLabel = providerLabels[resolvePendingOAuthProvider()] || 'provedor social';
        setMessage(
          list.length > 1
            ? `Login com ${providerLabel} OK. Escolha a empresa e continue.`
            : `Login com ${providerLabel} OK. Selecione a empresa e continue.`,
          'error',
        );
        return;
      }
      const cached = readCachedTenantOptions();
      if (cached.length) showTenantPicker(cached);
    } catch (e) {
      /* noop */
    }
  };

  const initProviders = async () => {
    try {
      const providers = await authService.fetchProviders();
      socialButtons.forEach((button) => {
        const key = button.dataset.authProvider;
        setProviderState(button, Boolean(providers[key]));
      });
    } catch (error) {
      socialButtons.forEach((button) => setProviderState(button, false));
      setMessage(formatLoginError(error, 'Não foi possível carregar os provedores de login.'), 'error');
    }
  };

  const shouldAutoRedirectToAdmin = () => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('logout') === 'success') return false;
    if (query.get('error') === 'tenant_required') return false;
    if (query.get('provider')) return false;
    if (query.get('error')) return false;
    if (query.get('session') === 'expired') return false;
    return !isOAuthPending();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const usuario = String(formData.get('usuario') || '').trim();
    const senha = String(formData.get('senha') || '');
    const tenantId = resolveLoginTenantId();

    if (isTenantPickerVisible() && tenantPickerRequired && !tenantId) {
      setMessage('Selecione a empresa onde deseja entrar.', 'error');
      tenantSelect?.focus();
      return;
    }

    if (isOAuthPending()) {
      setMessage('Concluindo login social…');
      submitBtn?.setAttribute('disabled', 'disabled');
      try {
        const result = await authService.completeOAuthLogin(tenantId);
        await completeLoginSuccess(result, { oauthCompleted: true });
      } catch (error) {
        if (error?.code === 'TENANT_REQUIRED' && Array.isArray(error.tenants) && error.tenants.length) {
          await handleTenantRequired(error.tenants);
          return;
        }
        setMessage(formatLoginError(error, 'Não foi possível concluir o login social.'), 'error');
      } finally {
        submitBtn?.removeAttribute('disabled');
      }
      return;
    }

    if (!usuario || !senha) {
      setMessage('Informe usuário e senha.', 'error');
      return;
    }

    submitBtn?.setAttribute('disabled', 'disabled');
    setMessage('Validando credenciais…');
    try {
      const result = await authService.loginWithPassword(usuario, senha, { tenantId });
      await completeLoginSuccess(result);
    } catch (error) {
      if (error?.code === 'TENANT_REQUIRED' && Array.isArray(error.tenants) && error.tenants.length) {
        await handleTenantRequired(error.tenants);
        return;
      }
      setMessage(formatLoginError(error, 'Não foi possível entrar. Verifique usuário e senha.'), 'error');
    } finally {
      submitBtn?.removeAttribute('disabled');
    }
  });

  socialButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) {
        setMessage(
          `O login com ${providerLabels[button.dataset.authProvider] || 'provedor'} não está configurado.`,
          'error',
        );
        return;
      }
      const tenantId = resolveLoginTenantId();
      if (isTenantPickerVisible() && tenantPickerRequired && !tenantId) {
        setMessage('Selecione a empresa antes de continuar.', 'error');
        tenantSelect?.focus();
        return;
      }
      setMessage(`Redirecionando para ${providerLabels[button.dataset.authProvider] || 'login social'}…`);
      window.location.href = authService.buildOAuthUrl(button.dataset.authProvider, tenantId);
    });
  });

  const init = async () => {
    const tenantBadge = document.querySelector('#esTenantBadge');
    if (tenantBadge) {
      tenantBadge.textContent = cfg.tenantName || authService.getPreferredLoginTenantName?.() || 'Dmetc';
    }

    applyQueryFeedback();
    await restorePendingTenantsFromOAuth();

    const params = new URLSearchParams(window.location.search);
    const provider = params.get('provider');
    if (provider && params.get('error') !== 'tenant_required') {
      activateOAuthPendingMode(provider);
      setMessage('Concluindo login social…');
      try {
        const result = await authService.completeOAuthLogin(resolveLoginTenantId());
        await completeLoginSuccess(result, { oauthCompleted: true });
        return;
      } catch (error) {
        if (error?.code === 'TENANT_REQUIRED' && Array.isArray(error.tenants) && error.tenants.length) {
          await handleTenantRequired(error.tenants);
          return;
        }
        setMessage(formatLoginError(error, 'Não foi possível concluir o login social.'), 'error');
      }
    }

    await initProviders();

    if (shouldAutoRedirectToAdmin()) {
      try {
        const session = await authService.syncSession();
        if (session?.externalAccessToken) {
          authService.redirectToApp(session.redirectTo);
        }
      } catch (e) {
        /* noop */
      }
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
