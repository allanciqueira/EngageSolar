(function () {
  const createClient = window.createReservaAiApiClient;
  const auditApi = createClient ? createClient('/api/audit') : null;

  const state = {
    session: null,
  };

  const pendingEvents = [];
  let flushInFlight = false;

  const getSession = () => state.session || window.ReservaAiAuth?.getStoredSession?.() || null;

  const getActorHeaders = () => {
    const session = getSession();
    const headers = {};

    if (session?.username) {
      headers['X-ReservaAi-Actor-Username'] = session.username;
    }

    if (session?.displayName) {
      headers['X-ReservaAi-Actor-Display-Name'] = session.displayName;
    }

    return headers;
  };

  async function postAuditEvent(payload) {
    await auditApi.request('/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  async function flushPendingEvents() {
    if (flushInFlight || !auditApi) {
      return;
    }

    flushInFlight = true;
    try {
      while (pendingEvents.length) {
        const payload = pendingEvents.shift();
        try {
          await postAuditEvent(payload);
        } catch (error) {
          console.error('Falha ao registrar auditoria.', error);
        }
      }
    } finally {
      flushInFlight = false;
      if (pendingEvents.length) {
        void flushPendingEvents();
      }
    }
  }

  /**
   * Enfileira auditoria em background — não bloqueia a UI.
   * Callers podem usar `void record(...)` ou `await record(...)`; ambos retornam na hora.
   */
  function record({ sourceModule, actionType, entityType, entityId, description, details }) {
    if (!auditApi) {
      return;
    }

    const session = getSession();
    if (!session?.username) {
      return;
    }

    pendingEvents.push({
      actorUsername: session.username,
      actorDisplayName: session.displayName,
      sourceModule,
      actionType,
      entityType,
      entityId,
      description,
      details,
    });

    void flushPendingEvents();
  }

  window.ReservaAiAdminAudit = {
    init({ session }) {
      state.session = session || null;
    },
    getActorHeaders,
    record,
  };
})();
