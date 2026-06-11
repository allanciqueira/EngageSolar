/**
 * UI — Engage Config → Meta connections.
 */
(function () {
  const api = () => window.EngageMetaApi;
  let session = null;
  let loading = false;
  let syncing = false;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (_e) {
      return '—';
    }
  }

  function chipHtml(label, tone) {
    const text = label?.trim() ? escapeHtml(label) : '—';
    return `<span class="ec-mc-chip" data-tone="${escapeHtml(tone)}">${text}</span>`;
  }

  function setFeedback(message, tone = 'neutral') {
    const el = $('engageMetaConnectionsFeedback');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.dataset.tone = tone;
    el.textContent = message;
  }

  function setLoading(on) {
    loading = on;
    const el = $('engageMetaConnectionsLoading');
    if (el) el.hidden = !on;
  }

  function updateAdminCopy(canSync) {
    const lead = $('engageMetaConnectionsLead');
    if (lead) {
      lead.textContent = canSync
        ? 'Estado do número WhatsApp (cache NeuraFlow). Sync Now atualiza qualidade e limite na Meta.'
        : 'Estado do número WhatsApp (cache NeuraFlow).';
    }
  }

  function renderSnapshot(snapshot, canSync) {
    const rows = Array.isArray(snapshot?.phoneNumbers) ? snapshot.phoneNumbers : [];
    const empty = $('engageMetaConnectionsEmpty');
    const wrap = $('engageMetaConnectionsTableWrap');
    const tbody = $('engageMetaConnectionsTableBody');
    const syncBtn = $('engageMetaConnectionsSyncBtn');
    const syncLine = $('engageMetaConnectionsSyncLine');
    const tokenLine = $('engageMetaConnectionsTokenLine');

    if (syncLine) {
      const last = snapshot?.lastSyncAt;
      syncLine.hidden = !last;
      syncLine.textContent = last ? `Último sync: ${formatDateTime(last)}` : '';
    }

    if (tokenLine && canSync) {
      tokenLine.hidden = false;
      tokenLine.textContent = `Token Meta configurado: ${snapshot?.hasToken ? 'sim' : 'não'}`;
    } else if (tokenLine) {
      tokenLine.hidden = true;
    }

    if (syncBtn) {
      syncBtn.hidden = !canSync || rows.length === 0;
      syncBtn.disabled = syncing || loading;
    }

    if (rows.length === 0) {
      if (empty) empty.hidden = false;
      if (wrap) wrap.hidden = true;
      if (tbody) tbody.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;
    if (wrap) wrap.hidden = false;

    const metaApi = api();
    if (!tbody || !metaApi) return;

    tbody.innerHTML = rows
      .map((row) => {
        const wabaName = row.metaWaba?.name?.trim() || '—';
        const wabaId = row.metaWaba?.wabaId || '—';
        const lastSync =
          row.engagePhoneOperationalProfile?.lastMetaSyncAt || row.updatedAt;
        return `
        <tr>
          <td>${escapeHtml(row.displayNumber || '—')}</td>
          <td>${escapeHtml((row.verifiedName || '').trim() || '—')}</td>
          <td>${escapeHtml(wabaName)} <span class="ec-mc-muted">(${escapeHtml(wabaId)})</span></td>
          <td><code class="ec-mc-mono">${escapeHtml(row.phoneNumberId || '—')}</code></td>
          <td>${chipHtml(row.status, metaApi.statusTone(row.status))}</td>
          <td>${chipHtml(row.qualityRating, metaApi.statusTone(row.qualityRating))}</td>
          <td>${escapeHtml(metaApi.formatEngageMessagingTier(row.messagingTier))}</td>
          <td>${escapeHtml(formatDateTime(lastSync))}</td>
        </tr>`;
      })
      .join('');
  }

  async function load() {
    if (!session) return;
    const metaApi = api();
    if (!metaApi) return;

    setFeedback('');
    setLoading(true);
    const canSync = metaApi.canSyncMetaConnections(session);
    updateAdminCopy(canSync);

    try {
      const snapshot = await metaApi.loadMetaConnections(session);
      renderSnapshot(snapshot, canSync);
    } catch (err) {
      const mapped = metaApi.mapApiError(err);
      setFeedback(mapped.message, 'danger');
      renderSnapshot({ phoneNumbers: [] }, canSync);
      if (mapped.redirectLogin && window.EngageSolarAuth?.handleSessionExpired) {
        window.EngageSolarAuth.handleSessionExpired();
      }
    } finally {
      setLoading(false);
      const syncBtn = $('engageMetaConnectionsSyncBtn');
      if (syncBtn) syncBtn.disabled = syncing;
    }
  }

  async function onSync() {
    const metaApi = api();
    if (!metaApi || syncing || !metaApi.canSyncMetaConnections(session)) return;

    syncing = true;
    const syncBtn = $('engageMetaConnectionsSyncBtn');
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Sincronizando…';
    }
    setFeedback('');

    try {
      const result = await metaApi.syncMetaConnections(session);
      const synced = Number(result?.synced ?? 0);
      const failed = Number(result?.failed ?? 0);
      const snapshot = result?.snapshot;
      const canSync = metaApi.canSyncMetaConnections(session);

      if (snapshot) {
        renderSnapshot(snapshot, canSync);
      } else {
        await load();
      }

      if (failed > 0) {
        setFeedback(
          `Sync parcial: ${synced} ok, ${failed} falha(s). Contacte suporte NeuraFlow.`,
          'warn',
        );
      } else if (synced > 0) {
        setFeedback(`Sync ok: ${synced} número(s) atualizado(s) na Graph API.`, 'success');
      } else {
        setFeedback('Nenhum número atualizado.', 'warn');
      }
    } catch (err) {
      const mapped = metaApi.mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      syncing = false;
      if (syncBtn) {
        syncBtn.disabled = loading;
        syncBtn.textContent = 'Sync Now';
      }
    }
  }

  function bindOnce() {
    const btn = $('engageMetaConnectionsSyncBtn');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => void onSync());
  }

  async function activate(nextSession) {
    let resolved = nextSession || session;
    if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
      resolved = await window.ReservaPermissions.enrichSessionWithOperatorMe(resolved);
    }
    session = resolved;
    bindOnce();
    void load();
  }

  function deactivate() {
    session = null;
    setFeedback('');
    setLoading(false);
  }

  window.EngageMetaConnections = {
    activate,
    deactivate,
    reload: load,
  };
})();
