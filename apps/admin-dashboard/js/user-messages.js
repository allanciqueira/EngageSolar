/**
 * Mensagens de erro amigáveis e padronizadas — Engage Solar.
 */
(function () {
  const CONTEXT_DEFAULTS = {
    default: 'Não foi possível concluir a operação. Tente novamente em instantes.',
    auth: 'Não foi possível entrar. Verifique seus dados e tente novamente.',
    session: 'Sua sessão expirou. Faça login novamente.',
    permission: 'Você não tem permissão para esta ação.',
    network: 'Não conseguimos conectar ao servidor. Verifique sua internet e tente novamente.',
    load: 'Não foi possível carregar os dados. Tente novamente.',
    save: 'Não foi possível salvar. Revise os dados e tente novamente.',
    whatsapp: 'Não foi possível completar a ação no WhatsApp. Tente novamente.',
    whatsappInbox: 'Não foi possível carregar a caixa de entrada do WhatsApp.',
    whatsappSend: 'Não foi possível enviar a mensagem. Tente novamente.',
    whatsappSync: 'Não foi possível sincronizar o WhatsApp. Tente novamente.',
    engage: 'Não foi possível conectar ao Engage neste momento.',
    engageMeta: 'Não foi possível carregar as conexões Meta.',
    dashboard: 'Não foi possível carregar o painel. Tente novamente.',
    settings: 'Não foi possível atualizar as configurações.',
    users: 'Não foi possível concluir a ação com usuários.',
    profile: 'Não foi possível atualizar o perfil.',
  };

  const STATUS_MESSAGES = {
    400: 'Dados inválidos. Revise as informações e tente novamente.',
    401: CONTEXT_DEFAULTS.session,
    403: CONTEXT_DEFAULTS.permission,
    404: 'Não encontramos o que você pediu. Atualize a página e tente de novo.',
    409: 'Esta ação conflita com informações já cadastradas.',
    422: 'Alguns campos precisam de ajuste. Revise o formulário.',
    429: 'Muitas tentativas seguidas. Aguarde um momento e tente novamente.',
    500: 'Ocorreu um erro no servidor. Tente novamente em instantes.',
    502: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
    503: 'Serviço em manutenção. Tente novamente em instantes.',
    504: 'O servidor demorou para responder. Tente novamente.',
  };

  const CODE_MESSAGES = {
    TENANT_REQUIRED: 'Selecione a empresa para continuar.',
    engage_env_disabled: 'O Engage não está disponível neste ambiente.',
    tenant_not_found: 'Empresa não encontrada.',
    FORBIDDEN: CONTEXT_DEFAULTS.permission,
    UNAUTHORIZED: CONTEXT_DEFAULTS.session,
    invalid_credentials: 'E-mail ou senha incorretos.',
    user_not_found: 'Este e-mail não está cadastrado. Solicite acesso ao administrador.',
    token_expired: 'Sua sessão expirou. Faça login novamente.',
    token_invalid: 'Link ou token inválido. Solicite novamente.',
  };

  const EXACT_MESSAGES = {
    'Sem permissão para esta ação.': 'Você não tem permissão para esta ação.',
    'Sem permissão para sincronizar.': 'Você não tem permissão para sincronizar.',
    'Sem permissão para alterar configurações desta empresa.': 'Você não tem permissão para alterar as configurações desta empresa.',
    'Sem permissão para alterar configurações.': 'Você não tem permissão para alterar estas configurações.',
    'Sessão autenticada indisponível.': CONTEXT_DEFAULTS.session,
    'Sessão de integração expirada.': CONTEXT_DEFAULTS.session,
    'Token externo indisponível.': CONTEXT_DEFAULTS.session,
    'Sessão inválida. Faça login com usuário e senha.': CONTEXT_DEFAULTS.session,
    'Forbidden': CONTEXT_DEFAULTS.permission,
    'Unauthorized': CONTEXT_DEFAULTS.session,
    'NetworkError when attempting to fetch resource.': CONTEXT_DEFAULTS.network,
    'Failed to fetch': CONTEXT_DEFAULTS.network,
  };

  const TECHNICAL_PATTERNS = [
    /falha na requisi[cç][aã]o/i,
    /falha na integra[cç][aã]o/i,
    /falha externa/i,
    /\(\d{3}\)/,
    /status\s*code/i,
    /gateway/i,
    /neuraflow/i,
    /\/api\//i,
    /\/engage\//i,
    /proxy/i,
    /cors/i,
    /bad gateway/i,
    /internal server error/i,
    /rota\s+\//i,
    /deploy do/i,
    /502\/503/i,
  ];

  const ACCENT_FIXES = [
    [/Nao foi/gi, 'Não foi'],
    [/Nao e/gi, 'Não é'],
    [/nao foi/gi, 'não foi'],
    [/nao e/gi, 'não é'],
    [/Faca /gi, 'Faça '],
    [/faca /gi, 'faça '],
    [/Solicitacao/gi, 'Solicitação'],
    [/invalido/gi, 'inválido'],
    [/invalida/gi, 'inválida'],
    [/autenticar no momento/gi, 'entrar no momento'],
    [/recuperacao/gi, 'recuperação'],
  ];

  function applyAccentFixes(text) {
    let out = String(text || '').trim();
    ACCENT_FIXES.forEach(([pattern, replacement]) => {
      out = out.replace(pattern, replacement);
    });
    return out;
  }

  function toText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
      return value.map((item) => toText(item)).filter(Boolean).join(' ');
    }
    if (typeof value === 'object') {
      return toText(value.message || value.error || value.hint || value.detail || '');
    }
    return String(value).trim();
  }

  function extractErrorShape(input) {
    if (!input) {
      return { message: '', statusCode: 0, code: '' };
    }
    if (typeof input === 'string') {
      return { message: input, statusCode: 0, code: '' };
    }
    const details = input.details && typeof input.details === 'object' ? input.details : null;
    const message = toText(
      input.message
      || input.hint
      || details?.message
      || details?.hint
      || input.error
      || details?.error,
    );
    const statusCode = Number(
      input.statusCode
      || input.status
      || details?.statusCode
      || 0,
    ) || 0;
    const code = String(
      input.code
      || details?.error
      || details?.code
      || '',
    ).trim();
    return { message, statusCode, code };
  }

  function isTechnicalMessage(text) {
    const safe = String(text || '').trim();
    if (!safe) return true;
    if (safe.length > 180) return true;
    return TECHNICAL_PATTERNS.some((pattern) => pattern.test(safe));
  }

  function resolveByCode(code) {
    const key = String(code || '').trim();
    if (!key) return '';
    return CODE_MESSAGES[key] || CODE_MESSAGES[key.toUpperCase()] || '';
  }

  function resolveByStatus(status, context) {
    const statusCode = Number(status) || 0;
    if (!statusCode) return '';
    if (STATUS_MESSAGES[statusCode]) return STATUS_MESSAGES[statusCode];
    if (statusCode >= 500) return CONTEXT_DEFAULTS.network;
    return CONTEXT_DEFAULTS[context] || CONTEXT_DEFAULTS.default;
  }

  function formatApiError(input, options = {}) {
    const context = options.context || 'default';
    const fallback = options.fallback || CONTEXT_DEFAULTS[context] || CONTEXT_DEFAULTS.default;
    const { message, statusCode, code } = extractErrorShape(input);

    const byCode = resolveByCode(code);
    if (byCode) return byCode;

    const normalized = applyAccentFixes(message);
    if (normalized && EXACT_MESSAGES[normalized]) {
      return EXACT_MESSAGES[normalized];
    }

    if (normalized && !isTechnicalMessage(normalized) && normalized.length <= 160) {
      return normalized;
    }

    if (statusCode) {
      return resolveByStatus(statusCode, context);
    }

    if (/failed to fetch|networkerror|load failed/i.test(normalized)) {
      return CONTEXT_DEFAULTS.network;
    }

    return fallback;
  }

  function buildHttpError(status, payload, options = {}) {
    const rawMessage = typeof payload === 'string'
      ? payload
      : toText(payload?.message || payload?.hint || payload?.error || '');
    const code = String(
      (payload && typeof payload === 'object' ? payload.error || payload.code : '')
      || '',
    ).trim();

    const friendly = formatApiError(
      { message: rawMessage, statusCode: status, code },
      options,
    );

    const err = new Error(friendly);
    err.statusCode = Number(payload?.statusCode ?? status) || status;
    err.code = code;
    if (payload && typeof payload === 'object') {
      err.hint = payload.hint;
      err.details = payload;
    }
    return err;
  }

  function formatCatchError(error, options = {}) {
    return formatApiError(error, options);
  }

  window.EngageUserMessages = {
    CONTEXT_DEFAULTS,
    STATUS_MESSAGES,
    formatApiError,
    formatCatchError,
    buildHttpError,
  };
})();
