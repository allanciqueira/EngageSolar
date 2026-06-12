window.ENGAGESOLAR_CONFIG = {

  apiBaseUrl: '/api/identity',

  /** Rotas NeuraFlow api-engage (via gateway). Ver HANDOFF Meta connections. */

  engageApiBaseUrl: '/engage',

  gatewayUrl: '',

  tenantId: '096029c3-f6db-43af-a55a-fc7df608732f',

  tenantName: 'Dmetc',

  appName: 'Engage Solar',

  dashboardPath: '/index.html',

  loginPath: '/login.html',

  changePasswordPath: '/change-password.html',

};



const isEngageDevProxy =

  typeof window !== 'undefined'

  && /^((localhost)|127\.0\.0\.1):5173$/i.test(window.location.host);



if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {

  // Dev npm run dev: todas as URLs /api/* relativas → proxy 5173 → gateway ReservaAI :8080

  window.RESERVAAI_API_BASE_URL = '/api/identity';

  window.RESERVAAI_MESSAGING_API_BASE_URL = '/api/messaging';

  window.RESERVAAI_EXTERNAL_API_BASE_URL = '/api/messaging';

  window.RESERVAAI_OPERATOR_API_BASE_URL = '/api/operator';

  window.RESERVAAI_GATEWAY_URL = isEngageDevProxy ? '' : window.location.origin;

} else if (!window.RESERVAAI_API_BASE_URL) {

  window.RESERVAAI_API_BASE_URL = window.ENGAGESOLAR_CONFIG.apiBaseUrl;

}

if (typeof window !== 'undefined' && !window.RESERVAAI_MESSAGING_API_BASE_URL) {

  window.RESERVAAI_MESSAGING_API_BASE_URL = '/api/messaging';

}

