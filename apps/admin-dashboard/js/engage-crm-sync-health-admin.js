/**
 * Engage Config → Saúde da sincronização CRM (CRM Sync Health).
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-CRM-SYNC-HEALTH.md
 */
(function () {
  const api = () => window.EngageContactHubApi;

  let session = null;
  let active = false;
  let loading = false;
  let busy = false;
  let health = null;
  let lastActivity = null;
  let error = '';

  const STATUS_LABELS = {
    healthy: { label: 'Saudável', tone: 'success' },
    attention: { label: 'Atenção — há clientes por importar', tone: 'warn' },
    degraded: { label: 'Degradado — cobertura baixa', tone: 'danger' },
  };

  const METRICS = [
    { key: 'customersTotal', label: 'Clientes CRM', format: 'int' },
    { key: 'customersWithPhone', label: 'Com telefone', format: 'int' },
    { key: 'linkedCustomers', label: 'Contactos ligados', format: 'int' },
    { key: 'coveragePct', label: 'Cobertura', format: 'pct' },
    { key: 'toImport', label: 'Por importar', format: 'int' },
    { key: 'syncErrors', label: 'Erros de sync', format: 'int' },
    { key: 'lastSyncAt', label: 'Última sincronização', format: 'relative' },
    { key: 'contactsEligible', label: 'Contactos elegíveis', format: 'int' },
  ];

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

  function canManage() {
    return api()?.canManageContacts?.(session) || false;
  }

  function formatRelativeTime(iso) {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms)) return '—';
    if (ms < 60_000) return 'agora';
    if (ms < 3_600_000) return `há ${Math.floor(ms / 60_000)} min`;
    if (ms < 86_400_000) return `há ${Math.floor(ms / 3_600_000)} h`;
    return new Date(iso).toLocaleString('pt-BR');
  }

  function formatMetricValue(key, format, data) {
    const raw = data?.[key];
    if (format === 'pct') {
      if (raw == null || raw === '') return '—';
      const n = Number(raw);
      return Number.isFinite(n) ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—';
    }
    if (format === 'relative') {
      return formatRelativeTime(raw);
    }
    if (raw == null || raw === '') return '0';
    const n = Number(raw);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR') : escapeHtml(String(raw));
  }

  function statusChip(data) {
    const status = String(data?.status || 'healthy').toLowerCase();
    const meta = STATUS_LABELS[status] || STATUS_LABELS.healthy;
    return `<span class="ec-mc-chip" data-tone="${escapeHtml(meta.tone)}">${escapeHtml(meta.label)}</span>`;
  }

  function buildSummary(data) {
    if (!data) return '';
    const parts = [
      `<strong>${escapeHtml(String(data.customersTotal ?? 0))}</strong> clientes CRM`,
      `<strong>${escapeHtml(String(data.customersWithPhone ?? 0))}</strong> com telefone`,
      `<strong>${escapeHtml(String(data.linkedCustomers ?? 0))}</strong> ligados`,
      `<strong>${escapeHtml(String(data.customersWithoutPhone ?? 0))}</strong> sem telefone`,
      `<strong>${escapeHtml(String(data.syncErrors ?? 0))}</strong> erros de sync`,
      data.coveragePct != null
        ? `Cobertura <strong>${escapeHtml(String(data.coveragePct))}%</strong>`
        : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }

  function setFeedback(message, tone = 'neutral') {
    const el = $('engageCrmSyncFeedback');
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
    const el = $('engageCrmSyncLoading');
    if (el) el.hidden = !on;
    render();
  }

  function renderMetrics() {
    const grid = $('engageCrmSyncMetrics');
    if (!grid) return;
    if (!health) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = METRICS.map((metric) => `
      <article class="ecsh-metric-card">
        <p class="ecsh-metric-label">${escapeHtml(metric.label)}</p>
        <p class="ecsh-metric-value">${formatMetricValue(metric.key, metric.format, health)}</p>
      </article>`).join('');
  }

  function renderActivity() {
    const el = $('engageCrmSyncActivity');
    if (!el) return;
    if (!lastActivity?.batch) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const batch = lastActivity.batch;
    const rows = [
      ['created', 'Criados'],
      ['updated', 'Actualizados'],
      ['linked', 'Ligados'],
      ['skipped', 'Ignorados'],
      ['failed', 'Falharam'],
    ].map(([key, label]) => `
      <div class="ecsh-activity-item">
        <span class="ecsh-activity-label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(batch[key] ?? 0))}</strong>
      </div>`).join('');

    const errors = Array.isArray(batch.errors) ? batch.errors.slice(0, 10) : [];
    const errorsHtml = errors.length
      ? `<ul class="ecsh-activity-errors">${errors.map((entry) => {
        const id = entry?.customerId || entry?.id || '—';
        const reason = entry?.reason || entry?.message || 'Erro';
        return `<li><code>${escapeHtml(String(id))}</code>: ${escapeHtml(String(reason))}</li>`;
      }).join('')}</ul>`
      : '';

    el.hidden = false;
    el.innerHTML = `
      <h3>Actividade recente</h3>
      <div class="ecsh-activity-grid">${rows}</div>
      ${errorsHtml}`;
  }

  function renderEmptyState() {
    const el = $('engageCrmSyncEmpty');
    if (!el) return;
    const show = health && Number(health.customersTotal || 0) === 0 && !loading && !error;
    el.hidden = !show;
  }

  function renderHint() {
    const el = $('engageCrmSyncHint');
    if (!el || !health) {
      if (el) el.hidden = true;
      return;
    }
    const toImport = Number(health.toImport || 0);
    if (toImport === 0 && Number(health.customersWithPhone || 0) > 0) {
      el.hidden = false;
      el.textContent = 'Todos os clientes com telefone estão ligados ao Contact Hub.';
      return;
    }
    el.hidden = true;
    el.textContent = '';
  }

  function render() {
    const summary = $('engageCrmSyncSummary');
    const statusEl = $('engageCrmSyncStatus');
    const errorEl = $('engageCrmSyncError');
    const actions = $('engageCrmSyncActions');

    if (errorEl) {
      if (error) {
        errorEl.hidden = false;
        errorEl.textContent = error;
      } else {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
    }

    if (summary) {
      summary.innerHTML = health ? buildSummary(health) : '';
      summary.hidden = !health;
    }

    if (statusEl) {
      statusEl.innerHTML = health ? statusChip(health) : '';
      statusEl.hidden = !health;
    }

    if (actions) {
      const manage = canManage();
      const toImport = Number(health?.toImport || 0);
      const disabled = busy || loading ? ' disabled' : '';
      actions.innerHTML = `
        <button type="button" class="ec-mc-btn" id="engageCrmSyncRefreshBtn"${disabled}>Actualizar</button>
        ${manage ? `<button type="button" class="ec-mc-btn ec-mc-btn--primary" id="engageCrmSyncImportBtn"${disabled || toImport === 0 ? ' disabled' : ''}>Importar do CRM</button>` : ''}
        ${manage ? `<button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageCrmSyncReconcileBtn"${disabled}>Reconciliar tudo</button>` : ''}
        <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageCrmSyncContactHubBtn">Contact Hub</button>`;
      actions.querySelector('#engageCrmSyncRefreshBtn')?.addEventListener('click', onRefresh);
      actions.querySelector('#engageCrmSyncImportBtn')?.addEventListener('click', onImport);
      actions.querySelector('#engageCrmSyncReconcileBtn')?.addEventListener('click', onReconcile);
      actions.querySelector('#engageCrmSyncContactHubBtn')?.addEventListener('click', onOpenContactHub);
    }

    renderMetrics();
    renderActivity();
    renderEmptyState();
    renderHint();
  }

  function mapError(err) {
    const status = Number(err?.statusCode || 0);
    if (status === 401) {
      return { message: 'Sessão expirada. Faça login novamente.', redirectLogin: true };
    }
    if (status === 403) {
      return { message: 'Apenas administradores podem importar ou reconciliar.' };
    }
    return api()?.mapApiError?.(err) || { message: err?.message || 'Não foi possível carregar. Tente actualizar.' };
  }

  async function loadHealth() {
    setLoading(true);
    error = '';
    try {
      health = await api().getCrmSyncHealth(session);
      setFeedback('');
    } catch (err) {
      const mapped = mapError(err);
      error = mapped.message;
      health = null;
      if (mapped.redirectLogin) {
        window.EngageSolarAuth?.redirectToLogin?.('session_expired');
      }
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    if (busy || loading) return;
    await loadHealth();
  }

  async function runMutation(action) {
    if (busy || loading || !canManage()) return;
    busy = true;
    setFeedback(action === 'import' ? 'A importar do CRM…' : 'A reconciliar contactos…', 'neutral');
    render();
    try {
      const result = action === 'import'
        ? await api().importCrm(session)
        : await api().reconcileCrm(session);
      lastActivity = result;
      if (result?.stats) {
        health = { ...health, ...result.stats };
      }
      setFeedback(
        action === 'import' ? 'Importação do CRM concluída.' : 'Reconciliação concluída.',
        'success',
      );
      await loadHealth();
    } catch (err) {
      const mapped = mapError(err);
      setFeedback(mapped.message, mapped.redirectLogin ? 'danger' : 'danger');
      if (mapped.redirectLogin) {
        window.EngageSolarAuth?.redirectToLogin?.('session_expired');
      }
    } finally {
      busy = false;
      render();
    }
  }

  function onImport() {
    runMutation('import');
  }

  function onReconcile() {
    if (!window.confirm('Reconciliar todos os clientes com telefone no Contact Hub?')) return;
    runMutation('reconcile');
  }

  function onOpenContactHub() {
    window.EngageConfig?.setActiveTab?.('contact-hub');
  }

  function activate(nextSession) {
    active = true;
    session = nextSession || null;
    lastActivity = null;
    loadHealth();
  }

  function deactivate() {
    active = false;
    session = null;
    health = null;
    lastActivity = null;
    error = '';
    busy = false;
    loading = false;
    setFeedback('');
  }

  window.EngageCrmSyncHealth = {
    activate,
    deactivate,
    isActive: () => active,
  };
})();
