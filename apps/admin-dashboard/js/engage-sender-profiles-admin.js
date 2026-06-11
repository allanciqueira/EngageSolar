/**
 * Engage Config → Sender profiles.
 */
(function () {
  const api = () => window.EngageSenderProfilesApi;

  let session = null;
  let loading = false;
  let busyId = null;
  let lastPayload = { items: [] };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
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
    const text = String(label || '').trim() ? escapeHtml(label) : '—';
    return `<span class="ec-mc-chip" data-tone="${escapeHtml(tone)}">${text}</span>`;
  }

  function setFeedback(message, tone = 'neutral') {
    const el = $('engageSenderProfilesFeedback');
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
    const el = $('engageSenderProfilesLoading');
    if (el) el.hidden = !on;
  }

  function updateLead(canManage) {
    const lead = $('engageSenderProfilesLead');
    if (lead) {
      lead.textContent = canManage
        ? 'Perfil operacional do número WhatsApp Engage. Administradores podem marcar default, outbound e sync.'
        : 'Perfil operacional do número WhatsApp Engage (somente leitura para operadores).';
    }
  }

  function renderActions(row, canManage) {
    if (!canManage) return '';
    const id = String(row.metaPhoneNumberId || '').trim();
    if (!id) return '—';
    const disabled = busyId === id || loading ? ' disabled' : '';
    const defaultLabel = row.isDefaultSender ? 'Default ✓' : 'Marcar default';
    const outboundLabel = row.outboundEnabled ? 'Desativar outbound' : 'Ativar outbound';
    return `
      <div class="ec-sp-actions">
        <button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-sp-action="default" data-sp-id="${escapeAttr(id)}"${disabled}>${escapeHtml(defaultLabel)}</button>
        <button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-sp-action="outbound" data-sp-id="${escapeAttr(id)}"${disabled}>${escapeHtml(outboundLabel)}</button>
        <button type="button" class="ec-mc-btn ec-mc-btn--primary" data-sp-action="sync" data-sp-id="${escapeAttr(id)}"${disabled}>Sync Now</button>
      </div>`;
  }

  function escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function renderHealth(health) {
    if (!health || typeof health !== 'object') {
      return '—';
    }
    const score = Number.isFinite(Number(health.healthScore)) ? Number(health.healthScore) : null;
    const status = health.reputationStatus || '—';
    const tone = api()?.healthTone?.(status) || 'muted';
    return `
      <div class="ec-sp-health">
        ${score != null ? `<span class="ec-sp-health-score">Score: ${escapeHtml(String(score))}</span>` : ''}
        ${chipHtml(status, tone)}
      </div>`;
  }

  function renderTable(payload, canManage) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const empty = $('engageSenderProfilesEmpty');
    const wrap = $('engageSenderProfilesTableWrap');
    const tbody = $('engageSenderProfilesTableBody');
    const actionsHead = $('engageSenderProfilesActionsHead');

    if (actionsHead) {
      actionsHead.hidden = !canManage;
    }

    if (items.length === 0) {
      if (empty) empty.hidden = false;
      if (wrap) wrap.hidden = true;
      if (tbody) tbody.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;
    if (wrap) wrap.hidden = false;

    const senderApi = api();
    if (!tbody || !senderApi) return;

    tbody.innerHTML = items.map((row) => {
      const wabaName = row.wabaName?.trim() || '—';
      const wabaId = row.wabaId || '—';
      const source = row.metaUpdateSource?.trim() || '—';
      return `
        <tr data-sp-row="${escapeAttr(row.metaPhoneNumberId)}">
          <td>${escapeHtml(row.displayNumber || row.phoneNumberId || '—')}</td>
          <td>${escapeHtml(row.displayName?.trim() || '—')}</td>
          <td>${escapeHtml(wabaName)} <span class="ec-mc-muted">(${escapeHtml(wabaId)})</span></td>
          <td><code class="ec-mc-mono">${escapeHtml(row.phoneNumberId || '—')}</code></td>
          <td>${chipHtml(row.connectionStatus, senderApi.statusTone(row.connectionStatus))}</td>
          <td>${chipHtml(row.qualityRating, senderApi.statusTone(row.qualityRating))}</td>
          <td>${escapeHtml(senderApi.formatEngageMessagingTier(row.messagingTier))}</td>
          <td>${renderHealth(row.health)}</td>
          <td>${escapeHtml(formatDateTime(row.lastMetaSyncAt))}</td>
          <td>${escapeHtml(formatDateTime(row.lastMetaWebhookAt))}</td>
          <td>${escapeHtml(source)}</td>
          <td>${row.outboundEnabled ? 'Sim' : 'Não'}</td>
          ${canManage ? `<td>${renderActions(row, canManage)}</td>` : ''}
        </tr>`;
    }).join('');
  }

  async function load() {
    if (!session) return;
    const senderApi = api();
    if (!senderApi) return;

    setFeedback('');
    setLoading(true);
    const canManage = senderApi.canManageSenders(session);
    updateLead(canManage);

    try {
      const payload = await senderApi.listSenders(session);
      lastPayload = payload || { items: [] };
      renderTable(lastPayload, canManage);
    } catch (err) {
      const mapped = senderApi.mapApiError(err);
      setFeedback(mapped.message, 'danger');
      renderTable({ items: [] }, canManage);
      if (mapped.redirectLogin && window.EngageSolarAuth?.handleSessionExpired) {
        window.EngageSolarAuth.handleSessionExpired();
      }
    } finally {
      setLoading(false);
    }
  }

  function findRow(metaPhoneNumberId) {
    const tbody = $('engageSenderProfilesTableBody');
    if (!tbody) return null;
    const rows = [...tbody.querySelectorAll('tr[data-sp-row]')];
    const match = rows.find((tr) => tr.dataset.spRow === metaPhoneNumberId);
    if (!match) return null;
    const cells = match.querySelectorAll('td');
    return {
      metaPhoneNumberId,
      isDefaultSender: match.querySelector('[data-sp-action="default"]')?.textContent?.includes('✓'),
      outboundEnabled: cells[11]?.textContent?.trim() === 'Sim',
    };
  }

  async function onAction(action, metaPhoneNumberId) {
    const senderApi = api();
    if (!senderApi || !session || busyId || !senderApi.canManageSenders(session)) return;

    busyId = metaPhoneNumberId;
    setFeedback('');
    renderTable(lastPayload, senderApi.canManageSenders(session));

    try {
      if (action === 'default') {
        const row = findRow(metaPhoneNumberId);
        const nextDefault = !(row?.isDefaultSender);
        await senderApi.patchSender(session, metaPhoneNumberId, { isDefaultSender: nextDefault });
        setFeedback(nextDefault ? 'Remetente marcado como default.' : 'Default removido.', 'success');
      } else if (action === 'outbound') {
        const row = findRow(metaPhoneNumberId);
        const nextOutbound = !(row?.outboundEnabled);
        await senderApi.patchSender(session, metaPhoneNumberId, { activeForOutreach: nextOutbound });
        setFeedback(nextOutbound ? 'Outbound activado.' : 'Outbound desactivado.', 'success');
      } else if (action === 'sync') {
        const result = await senderApi.syncSender(session, metaPhoneNumberId);
        const synced = Number(result?.sync?.synced ?? 0);
        const failed = Number(result?.sync?.failed ?? 0);
        if (failed > 0) {
          setFeedback(`Sync parcial: ${synced} ok, ${failed} falha(s).`, 'warn');
        } else {
          setFeedback(synced > 0 ? `Sync ok: ${synced} número(s) actualizado(s).` : 'Sync concluído.', 'success');
        }
      }
      await load();
    } catch (err) {
      setFeedback(senderApi.mapApiError(err).message, 'danger');
    } finally {
      busyId = null;
    }
  }

  function bindOnce() {
    const tbody = $('engageSenderProfilesTableBody');
    if (!tbody || tbody.dataset.bound === '1') return;
    tbody.dataset.bound = '1';
    tbody.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-sp-action]');
      if (!btn || !tbody.contains(btn)) return;
      const action = btn.dataset.spAction;
      const id = btn.dataset.spId;
      if (!action || !id) return;
      void onAction(action, id);
    });
  }

  function activate(nextSession) {
    session = nextSession || null;
    bindOnce();
    void load();
  }

  function deactivate() {
    session = null;
    busyId = null;
    setFeedback('');
    setLoading(false);
  }

  window.EngageSenderProfiles = {
    activate,
    deactivate,
    reload: load,
  };
})();
