(function () {
  const trimSlash = (value) => `${value || ''}`.replace(/\/$/, '');

  const gatewayUrl = trimSlash(window.RESERVAAI_GATEWAY_URL);
  const identityApiUrl = trimSlash(window.RESERVAAI_API_BASE_URL);
  const originIdentity =
    window.location.protocol.startsWith('http')
      ? trimSlash(`${window.location.origin}/api/identity`)
      : '';
  const isEngageDevProxy =
    window.location.protocol.startsWith('http')
    && /^((localhost)|127\.0\.0\.1):5173$/i.test(window.location.host);
  const legacyFallback = isEngageDevProxy
    ? ''
    : 'http://localhost:8080';

  const resolveIdentityBase = () => {
    if (identityApiUrl && identityApiUrl.startsWith('/')) {
      return identityApiUrl;
    }
    if (identityApiUrl) {
      return identityApiUrl;
    }
    if (gatewayUrl) {
      return `${gatewayUrl}/api/identity`;
    }
    if (originIdentity) {
      return originIdentity;
    }
    return isEngageDevProxy ? '/api/identity' : `${legacyFallback}/api/identity`;
  };

  const resolveGatewayBase = () => {
    if (isEngageDevProxy) {
      return '';
    }
    if (gatewayUrl) {
      return gatewayUrl;
    }
    if (window.location.protocol.startsWith('http')) {
      return trimSlash(window.location.origin);
    }
    if (identityApiUrl) {
      return identityApiUrl;
    }
    return legacyFallback;
  };

  const resolveBaseUrlForPath = (path) => {
    if (path.startsWith('http')) {
      return '';
    }
    if (path.startsWith('/api/auth/')) {
      return resolveIdentityBase();
    }
    return resolveGatewayBase();
  };

  const maybeHandleSessionExpired = (response, requestUrl) => {
    if (response.status !== 401) {
      return;
    }
    if (window.ReservaAiAuth?.shouldExpireSessionOnUnauthorized?.(requestUrl)) {
      window.ReservaAiAuth.handleSessionExpired();
    }
  };

  const parseResponse = async (response, requestUrl) => {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.json();
      if (!response.ok) {
        maybeHandleSessionExpired(response, requestUrl);
        const err = window.EngageUserMessages?.buildHttpError
          ? window.EngageUserMessages.buildHttpError(response.status, payload, { context: 'default' })
          : new Error(`Falha na requisição (${response.status}).`);
        if (!window.EngageUserMessages?.buildHttpError) {
          err.statusCode = response.status;
        }
        throw err;
      }

      return payload;
    }

    const payload = await response.text();
    if (!response.ok) {
      maybeHandleSessionExpired(response, requestUrl);
      throw window.EngageUserMessages?.buildHttpError
        ? window.EngageUserMessages.buildHttpError(response.status, payload, { context: 'default' })
        : Object.assign(new Error(`Falha na requisição (${response.status}).`), { statusCode: response.status });
    }

    return payload;
  };

  const createClient = (baseUrlOverride) => ({
    async request(path, options = {}) {
      const token = window.ReservaAiAuth?.getAccessToken?.() || '';
      const headers = new Headers(options.headers || {});
      const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;

      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json');
      }

      if (options.body !== undefined && !isMultipart && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const baseUrl =
        baseUrlOverride !== undefined && baseUrlOverride !== null
          ? trimSlash(baseUrlOverride)
          : resolveBaseUrlForPath(path);
      const requestUrl = path.startsWith('http') ? path : `${baseUrl}${path}`;
      const response = await fetch(requestUrl, {
        ...options,
        headers,
        credentials: options.credentials || 'include',
        mode: isEngageDevProxy ? 'same-origin' : (options.mode || 'cors'),
      });

      return parseResponse(response, requestUrl);
    },
  });

  window.ReservaAiApi = createClient();
  window.createReservaAiApiClient = createClient;
  window.EngageSolarApi = window.ReservaAiApi;
  window.createEngageSolarApiClient = createClient;
})();
