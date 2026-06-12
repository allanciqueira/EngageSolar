/**
 * Engage Config → Lead Recovery Intelligence.
 * @see HANDOFF-ENGAGE-SOLAR-FRONT-LEAD-RECOVERY-INTELLIGENCE.md
 */
(function () {
  const api = () => window.EngageLeadRecoveryApi;
  const OPP_LIMIT = 20;
  const CONTACTS_LIMIT = 100;
  const OPP_SORT_KEYS = [
    'name', 'recoveryScore', 'recoveryPriority', 'recoveryDaysSinceLoss', 'barrier',
    'recommendedAction', 'specialCaseBadge', 'registeredAt', 'sourceAudienceName',
    'lastCampaignName', 'lastCampaignSentAt', 'lastCampaignFailedAt',
    'lastCampaignReadAt', 'lastCampaignReplyAt',
  ];

  let session = null;
  let active = false;
  let loading = false;
  let busy = false;
  let viewTab = 'decision';
  let stats = null;
  let insights = null;
  let signals = null;
  let contacts = { items: [] };
  let opportunities = { items: [], total: 0, filterLabel: '' };
  let signalId = '';
  let oppSortBy = 'recoveryScore';
  let oppSortDir = 'desc';
  let contactsSortBy = 'recoveryScore';
  let contactsSortDir = 'desc';
  let reclassifyPreview = null;
  let reclassifyForce = false;
  let auditData = null;
  let error = '';

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

  function escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR');
    } catch (_e) {
      return '—';
    }
  }

  function formatTokens(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n >= 1_000_000) {
      return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} M`;
    }
    if (n >= 1000) {
      return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} k`;
    }
    return n.toLocaleString('pt-BR');
  }

  function formatCostUsd(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `US$ ${n.toFixed(4)}`;
  }

  function formatDays(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toLocaleString('pt-BR')} dias`;
  }

  function canManage() {
    return api()?.canManage?.(session) || false;
  }

  function setFeedback(message, tone = 'neutral') {
    const el = $('engageLeadRecoveryFeedback');
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
    const el = $('engageLeadRecoveryLoading');
    if (el) el.hidden = !on;
    render();
  }

  function priorityTone(code) {
    const key = String(code || '').toUpperCase();
    if (key === 'ALTA') return 'success';
    if (key === 'MEDIA') return 'warn';
    if (key === 'BAIXA') return 'muted';
    if (key === 'DESCARTAR') return 'danger';
    return 'muted';
  }

  function priorityChip(code) {
    return `<span class="ec-mc-chip" data-tone="${escapeHtml(priorityTone(code))}">${escapeHtml(api().labelPriority(code))}</span>`;
  }

  function metricCard(label, value) {
    return `
      <article class="elri-metric">
        <p class="elri-metric-label">${escapeHtml(label)}</p>
        <p class="elri-metric-value">${escapeHtml(String(value ?? '—'))}</p>
      </article>`;
  }

  function renderToolbar() {
    const el = $('engageLeadRecoveryActions');
    if (!el) return;
    const adminBtns = canManage()
      ? `
        <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageLeadRecoveryReclassifyBtn"${busy ? ' disabled' : ''}>Reprocessar leads…</button>
        <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageLeadRecoveryExportBtn"${busy ? ' disabled' : ''}>Exportar auditorias</button>`
      : '';
    el.innerHTML = `
      <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageLeadRecoveryRefreshBtn"${loading || busy ? ' disabled' : ''}>Atualizar</button>
      ${adminBtns}`;
    el.querySelector('#engageLeadRecoveryRefreshBtn')?.addEventListener('click', () => void refreshAll());
    el.querySelector('#engageLeadRecoveryReclassifyBtn')?.addEventListener('click', () => void openReclassifyModal());
    el.querySelector('#engageLeadRecoveryExportBtn')?.addEventListener('click', () => void onExportAudits());
  }

  function renderViewTabs() {
    const el = $('engageLeadRecoveryViewTabs');
    if (!el) return;
    el.innerHTML = `
      <button type="button" class="elri-view-tab${viewTab === 'decision' ? ' is-active' : ''}" data-elri-view="decision">Decisão</button>
      <button type="button" class="elri-view-tab${viewTab === 'analytics' ? ' is-active' : ''}" data-elri-view="analytics">Recovery Analytics</button>`;
    el.querySelectorAll('[data-elri-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        viewTab = btn.dataset.elriView || 'decision';
        render();
      });
    });
  }

  function renderDecisionKpis() {
    const s = stats || {};
    const i = insights || {};
    return `
      <div class="elri-kpi-grid">
        ${metricCard('Leads analisados', i.totalAnalyzed ?? '—')}
        ${metricCard('Alta prioridade', s.highPriorityCount ?? 0)}
        ${metricCard('Média prioridade', s.mediumPriorityCount ?? 0)}
        ${metricCard('Baixa prioridade', s.lowPriorityCount ?? 0)}
        ${metricCard('Descartar', s.discardPriorityCount ?? 0)}
        ${metricCard('Análises com IA (tokens)', s.aiAnalysesWithTokens ?? 0)}
        ${metricCard('Tokens IA (total)', formatTokens(s.totalAiTokens))}
        ${metricCard('Custo IA estimado', formatCostUsd(s.totalEstimatedCostUsd))}
      </div>`;
  }

  function renderNextAction() {
    const nba = insights?.nextBestAction;
    if (!nba) return '';
    return `
      <section class="elri-next-action">
        <p class="elri-next-action-eyebrow">Próxima ação recomendada</p>
        <p class="elri-next-action-count"><strong>${escapeHtml(String(nba.leadCount ?? 0))}</strong> leads</p>
        <p class="elri-next-action-campaign">${escapeHtml(nba.campaignLabel || '—')}</p>
        <p class="elri-next-action-reason">${escapeHtml(nba.reason || '')}</p>
      </section>`;
  }

  function renderRecoveryInsights() {
    const ri = insights?.recoveryInsights || {};
    const highlights = Array.isArray(ri.signalHighlights) ? ri.signalHighlights : [];
    return `
      <section class="elri-card">
        <h3>Recovery Insights</h3>
        <dl class="elri-dl">
          <div><dt>Principal barreira</dt><dd>${escapeHtml(ri.primaryBarrier?.label || '—')} · ${escapeHtml(String(ri.primaryBarrier?.count ?? 0))}</dd></div>
          <div><dt>Principal canal</dt><dd>${escapeHtml(ri.primaryChannel?.label || '—')} · ${escapeHtml(String(ri.primaryChannel?.count ?? 0))}</dd></div>
        </dl>
        ${highlights.length ? `
          <ul class="elri-highlight-list">
            ${highlights.map((h) => `<li>${escapeHtml(h.label || '—')} · <strong>${escapeHtml(String(h.count ?? 0))}</strong></li>`).join('')}
          </ul>` : ''}
      </section>`;
  }

  function renderSpecialOpportunities() {
    const items = Array.isArray(insights?.specialOpportunities) ? insights.specialOpportunities : [];
    if (!items.length) {
      return '<section class="elri-card"><h3>Oportunidades encontradas</h3><p class="ec-mc-muted">Nenhuma oportunidade especial.</p></section>';
    }
    return `
      <section class="elri-card">
        <div class="elri-card-head">
          <h3>Oportunidades encontradas</h3>
          ${signalId ? '<button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageLeadRecoveryClearSignal">Ver todas</button>' : ''}
        </div>
        <div class="elri-opp-grid">
          ${items.map((item) => {
            const sid = String(item.signalId || item.id || '').trim();
            const active = sid && sid === signalId;
            const badge = api().labelOpportunityBadge(item.badge);
            const badgeHtml = badge
              ? `<span class="elri-opp-badge" data-tone="${escapeHtml(String(item.badge || '').toUpperCase() === 'ATENCAO' ? 'warn' : 'info')}">${escapeHtml(badge)}</span>`
              : '';
            return `
              <button type="button" class="elri-opp-card${active ? ' is-active' : ''}" data-elri-signal="${escapeAttr(sid)}">
                <strong>${escapeHtml(item.label || '—')}</strong>
                <span>${escapeHtml(String(item.count ?? 0))} lead(s)</span>
                ${badgeHtml}
              </button>`;
          }).join('')}
        </div>
      </section>`;
  }

  function renderBaseSummary() {
    const rows = Array.isArray(insights?.baseSummary) ? insights.baseSummary : [];
    if (!rows.length) return '';
    return `
      <section class="elri-card">
        <h3>Resumo da base</h3>
        <ul class="elri-summary-list">
          ${rows.map((row, idx) => {
            const text = idx === 0
              ? `${row.count ?? 0} ${row.label || ''}`
              : `${row.percentage ?? 0}% ${row.label || ''}`;
            return `<li>${escapeHtml(String(text).trim())}</li>`;
          }).join('')}
        </ul>
      </section>`;
  }

  function sortHeader(key, label, currentBy, currentDir) {
    const active = currentBy === key;
    const arrow = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th scope="col"><button type="button" class="elri-sort-btn" data-elri-sort="${escapeAttr(key)}">${escapeHtml(label)}${arrow}</button></th>`;
  }

  function renderOpportunitiesTable() {
    const items = Array.isArray(opportunities.items) ? opportunities.items : [];
    const total = Number(opportunities.total || items.length);
    const filterLabel = opportunities.filterLabel ? `<p class="ec-mc-muted">Filtro: ${escapeHtml(opportunities.filterLabel)}</p>` : '';
    const headers = `
      ${sortHeader('name', 'Nome', oppSortBy, oppSortDir)}
      ${sortHeader('recoveryScore', 'Score', oppSortBy, oppSortDir)}
      ${sortHeader('recoveryPriority', 'Prioridade', oppSortBy, oppSortDir)}
      ${sortHeader('recoveryDaysSinceLoss', 'Dias desde perda', oppSortBy, oppSortDir)}
      ${sortHeader('barrier', 'Barreira', oppSortBy, oppSortDir)}
      <th scope="col">Ação</th>
      <th scope="col">Destaque</th>
      ${sortHeader('registeredAt', 'Cadastro', oppSortBy, oppSortDir)}
      ${sortHeader('sourceAudienceName', 'Audiência', oppSortBy, oppSortDir)}
      ${sortHeader('lastCampaignName', 'Última campanha', oppSortBy, oppSortDir)}
      ${sortHeader('lastCampaignSentAt', 'Enviado há', oppSortBy, oppSortDir)}
      <th scope="col">Auditoria</th>`;
    const rows = items.map((row) => {
      const special = Boolean(row.specialCaseKind);
      const action = row.specialCaseActionHint || row.recommendedAction || '—';
      const badge = api().labelOpportunityBadge(row.specialCaseBadge);
      return `
        <tr class="${special ? 'elri-row-special' : ''}">
          <td>${escapeHtml(row.name || row.phone || '—')}</td>
          <td>${escapeHtml(String(row.recoveryScore ?? '—'))}</td>
          <td>${priorityChip(row.recoveryPriority)}</td>
          <td>${escapeHtml(formatDays(row.recoveryDaysSinceLoss))}</td>
          <td>${escapeHtml(row.barrier || '—')}</td>
          <td>${escapeHtml(action)}</td>
          <td>${badge ? `<span class="elri-opp-badge" data-tone="warn">${escapeHtml(badge)}</span>` : '—'}</td>
          <td class="ec-mc-muted">${escapeHtml(formatDateTime(row.registeredAt))}</td>
          <td>${escapeHtml(row.sourceAudienceName || '—')}</td>
          <td>${escapeHtml(row.lastCampaignName || '—')}${row.campaignEngagementLabel ? ` · ${escapeHtml(row.campaignEngagementLabel)}` : ''}</td>
          <td class="ec-mc-muted">${escapeHtml(formatDateTime(row.lastCampaignSentAt))}</td>
          <td><button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-elri-audit="${escapeAttr(row.contactId || row.id)}">Ver auditoria</button></td>
        </tr>`;
    }).join('');
    return `
      <section class="elri-card">
        <h3>Top 20 oportunidades de recuperação</h3>
        ${filterLabel}
        <div class="elri-table-wrap">
          <table class="ech-table elri-table" aria-label="Top oportunidades">
            <thead><tr>${headers}</tr></thead>
            <tbody>${rows || '<tr><td colspan="12" class="ec-mc-muted">Nenhuma oportunidade.</td></tr>'}</tbody>
          </table>
        </div>
        ${total > items.length ? `<p class="elri-table-foot">Exibindo ${items.length} de ${total}</p>` : ''}
      </section>`;
  }

  function renderContactsTable() {
    const items = Array.isArray(contacts.items) ? contacts.items : [];
    const rows = items.map((row) => `
      <tr>
        <td>${escapeHtml(row.name || row.phone || '—')}</td>
        <td>${escapeHtml(api().labelCategory(row.category || row.lossCategory))}</td>
        <td>${escapeHtml(String(row.recoveryScore ?? '—'))}</td>
        <td>${priorityChip(row.recoveryPriority)}</td>
        <td>${escapeHtml(formatDays(row.recoveryDaysSinceLoss))}</td>
        <td>${escapeHtml(row.barrier || '—')}</td>
        <td>${escapeHtml(row.recommendedAction || '—')}</td>
        <td class="ec-mc-muted">${escapeHtml(formatDateTime(row.registeredAt))}</td>
        <td>${escapeHtml(row.sourceAudienceName || '—')}</td>
        <td>${escapeHtml(row.lastCampaignName || '—')}</td>
        <td class="ec-mc-muted">${escapeHtml(formatDateTime(row.lastCampaignSentAt))}</td>
        <td><button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-elri-audit="${escapeAttr(row.contactId || row.id)}">Ver auditoria</button></td>
      </tr>`).join('');
    return `
      <section class="elri-card">
        <h3>Leads para recuperação</h3>
        <div class="elri-table-wrap">
          <table class="ech-table elri-table" aria-label="Leads para recuperação">
            <thead>
              <tr>
                <th>Nome</th><th>Categoria</th><th>Score</th><th>Prioridade</th>
                <th>Dias desde perda</th><th>Barreira</th><th>Ação recomendada</th>
                <th>Cadastro</th><th>Audiência</th><th>Última campanha</th><th>Enviado</th><th>Auditoria</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="12" class="ec-mc-muted">Nenhum lead processado. Importe contatos ou execute reprocessamento.</td></tr>'}</tbody>
          </table>
        </div>
      </section>`;
  }

  function renderScoreDistribution() {
    const rows = Array.isArray(stats?.scoreDistribution) ? stats.scoreDistribution : [];
    const max = rows.reduce((acc, row) => Math.max(acc, Number(row.count || 0)), 0) || 1;
    return `
      <section class="elri-card">
        <h3>Distribuição do Recovery Score</h3>
        <div class="elri-bars">
          ${rows.map((row) => {
            const count = Number(row.count || 0);
            const pct = Math.round((count / max) * 100);
            return `
              <div class="elri-bar-row">
                <span class="elri-bar-label">${escapeHtml(row.label || '—')}</span>
                <div class="elri-bar-track"><div class="elri-bar-fill" style="width:${pct}%"></div></div>
                <span class="elri-bar-count">${escapeHtml(String(count))}</span>
              </div>`;
          }).join('') || '<p class="ec-mc-muted">Sem distribuição disponível.</p>'}
        </div>
      </section>`;
  }

  function renderTopSignals() {
    const rows = Array.isArray(signals?.topSignals) ? signals.topSignals : [];
    return `
      <section class="elri-card">
        <h3>Top sinais (raw)</h3>
        <p class="ec-mc-muted elri-analytics-sub">Métricas técnicas do motor de priorização — uso interno e observabilidade.</p>
        <div class="elri-signal-grid">
          ${rows.map((row) => `
            <article class="elri-signal-card">
              <strong>${escapeHtml(row.label || '—')}</strong>
              <span>${escapeHtml(String(row.count ?? 0))}</span>
            </article>`).join('') || '<p class="ec-mc-muted">Sem sinais.</p>'}
        </div>
      </section>`;
  }

  function renderAnalyticsKpis() {
    const s = stats || {};
    return `
      <div class="elri-kpi-grid">
        ${metricCard('Leads classificados', s.totalClassified ?? 0)}
        ${metricCard('Recovery Score médio', s.avgRecoveryScore ?? '—')}
        ${metricCard('Alta prioridade', s.highPriorityCount ?? 0)}
        ${metricCard('Média prioridade', s.mediumPriorityCount ?? 0)}
        ${metricCard('Baixa prioridade', s.lowPriorityCount ?? 0)}
        ${metricCard('Descartar', s.discardPriorityCount ?? 0)}
        ${metricCard('Enriquecidos por IA', s.aiCount ?? 0)}
        ${metricCard('Enriquecidos por regras', s.rulesCount ?? 0)}
        ${metricCard('Análises com tokens', s.aiAnalysesWithTokens ?? 0)}
        ${metricCard('Tokens IA (total)', formatTokens(s.totalAiTokens))}
        ${metricCard('Custo IA estimado', formatCostUsd(s.totalEstimatedCostUsd))}
      </div>`;
  }

  function renderDecisionView() {
    return `
      ${renderDecisionKpis()}
      ${renderNextAction()}
      <div class="elri-two-col">
        ${renderRecoveryInsights()}
        ${renderSpecialOpportunities()}
      </div>
      ${renderBaseSummary()}
      ${renderOpportunitiesTable()}
      ${renderContactsTable()}`;
  }

  function renderAnalyticsView() {
    return `
      ${renderAnalyticsKpis()}
      ${renderScoreDistribution()}
      ${renderTopSignals()}`;
  }

  function renderContent() {
    const el = $('engageLeadRecoveryContent');
    if (!el) return;
    if (loading && !stats && !insights) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = viewTab === 'analytics' ? renderAnalyticsView() : renderDecisionView();
    bindContentEvents(el);
  }

  function bindContentEvents(root) {
    root.querySelector('#engageLeadRecoveryClearSignal')?.addEventListener('click', () => {
      signalId = '';
      void loadOpportunities();
    });
    root.querySelectorAll('[data-elri-signal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.elriSignal || '';
        signalId = signalId === sid ? '' : sid;
        void loadOpportunities();
      });
    });
    root.querySelectorAll('[data-elri-audit]').forEach((btn) => {
      btn.addEventListener('click', () => void openAuditModal(btn.dataset.elriAudit));
    });
    root.querySelectorAll('[data-elri-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.elriSort || 'recoveryScore';
        if (oppSortBy === key) {
          oppSortDir = oppSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          oppSortBy = key;
          oppSortDir = 'desc';
        }
        void loadOpportunities();
      });
    });
  }

  function renderReclassifyModal() {
    const modal = $('engageLeadRecoveryReclassifyModal');
    const body = $('engageLeadRecoveryReclassifyBody');
    const foot = $('engageLeadRecoveryReclassifyFooter');
    if (!modal || !body || !foot) return;
    const p = reclassifyPreview || {};
    const enqueued = Number(p.enqueuedCount || 0);
    body.innerHTML = `
      <p class="elri-modal-lead">Escolha o escopo para evitar custo desnecessário de tokens. Importações mensais já classificam automaticamente só contatos novos ou com dados alterados.</p>
      <p class="elri-scope-fixed"><strong>Escopo:</strong> Somente sem classificação</p>
      <label class="elri-check">
        <input type="checkbox" id="engageLeadRecoveryForce" ${reclassifyForce ? 'checked' : ''} />
        <span>Forçar re-análise (mesmo se dados não mudaram)</span>
      </label>
      <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageLeadRecoveryPreviewBtn"${busy ? ' disabled' : ''}>Atualizar estimativa</button>
      <dl class="elri-preview-dl">
        <div><dt>Candidatos no escopo</dt><dd>${escapeHtml(String(p.candidateCount ?? '—'))}</dd></div>
        <div><dt>Serão enfileirados</dt><dd>${escapeHtml(String(p.enqueuedCount ?? '—'))}${Number(p.cappedCount || 0) > 0 ? ` (limite ${escapeHtml(String(p.limits?.reclassifyMax ?? ''))})` : ''}</dd></div>
        <div><dt>Ignorados (sem mudança)</dt><dd>${escapeHtml(String(p.skippedUnchanged ?? '—'))}</dd></div>
        <div><dt>Ignorados (classificação manual)</dt><dd>${escapeHtml(String(p.skippedManual ?? '—'))}</dd></div>
        <div><dt>Chamadas LLM estimadas</dt><dd>${p.useFallbackOnly ? '0 (modo regras)' : escapeHtml(String(p.estimatedLlmCalls ?? '—'))}</dd></div>
      </dl>
      ${p.warning ? `<p class="elri-warning">${escapeHtml(p.warning)}</p>` : ''}`;
    foot.innerHTML = `
      <button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-elri-reclassify-close>Cancelar</button>
      <button type="button" class="ec-mc-btn ec-mc-btn--primary" id="engageLeadRecoveryConfirmBtn"${enqueued <= 0 || busy ? ' disabled' : ''}>Confirmar reprocessamento</button>`;
    body.querySelector('#engageLeadRecoveryForce')?.addEventListener('change', (e) => {
      reclassifyForce = !!e.target.checked;
      void loadReclassifyPreview();
    });
    body.querySelector('#engageLeadRecoveryPreviewBtn')?.addEventListener('click', () => void loadReclassifyPreview());
    foot.querySelector('[data-elri-reclassify-close]')?.addEventListener('click', closeReclassifyModal);
    foot.querySelector('#engageLeadRecoveryConfirmBtn')?.addEventListener('click', () => void confirmReclassify());
  }

  function renderAuditModal() {
    const modal = $('engageLeadRecoveryAuditModal');
    const body = $('engageLeadRecoveryAuditBody');
    if (!modal || !body) return;
    if (!auditData) {
      body.innerHTML = '<p class="ec-mc-muted">Carregando…</p>';
      return;
    }
    const evidence = Array.isArray(auditData.evidence) ? auditData.evidence : [];
    const reasons = Array.isArray(auditData.recoveryScoreReason) ? auditData.recoveryScoreReason : [];
    body.innerHTML = `
      <header class="elri-audit-head">
        <h3>${escapeHtml(auditData.name || auditData.phone || 'Lead')}</h3>
      </header>
      <dl class="elri-dl">
        <div><dt>Categoria</dt><dd>${escapeHtml(api().labelCategory(auditData.category))}</dd></div>
        <div><dt>Recovery Score</dt><dd>${escapeHtml(String(auditData.recoveryScore ?? '—'))}</dd></div>
        <div><dt>Prioridade</dt><dd>${priorityChip(auditData.recoveryPriority)}</dd></div>
        <div><dt>Barreira</dt><dd>${escapeHtml(auditData.barrier || '—')}</dd></div>
        <div><dt>Ação recomendada</dt><dd>${escapeHtml(auditData.recommendedAction || '—')}</dd></div>
        <div><dt>Origem</dt><dd>${escapeHtml(auditData.source || '—')}</dd></div>
      </dl>
      ${evidence.length ? `<section><h4>Evidências</h4><ul>${evidence.map((e) => `<li>${escapeHtml(typeof e === 'string' ? e : e?.text || JSON.stringify(e))}</li>`).join('')}</ul></section>` : ''}
      ${reasons.length ? `<section><h4>Recovery Factors</h4><ul>${reasons.map((r) => `<li>${escapeHtml(typeof r === 'string' ? r : r?.label || r?.reason || JSON.stringify(r))}</li>`).join('')}</ul></section>` : ''}
      ${auditData.reasoning ? `<section><h4>Contexto</h4><p>${escapeHtml(auditData.reasoning)}</p></section>` : ''}
      ${auditData.fallbackUsed || auditData.errorMessage ? `
        <section class="elri-warning-block">
          <h4>Erro IA</h4>
          <p>${escapeHtml(auditData.errorCode || '')} ${escapeHtml(auditData.errorMessage || '')}</p>
        </section>` : ''}
      <dl class="elri-dl">
        <div><dt>Modelo</dt><dd>${escapeHtml(auditData.model || '—')}</dd></div>
        <div><dt>Tokens</dt><dd>${escapeHtml(formatTokens(auditData.totalTokens))} (in ${escapeHtml(String(auditData.inputTokens ?? '—'))} / out ${escapeHtml(String(auditData.outputTokens ?? '—'))})</dd></div>
        <div><dt>Custo estimado</dt><dd>${escapeHtml(formatCostUsd(auditData.estimatedCostUsd))}</dd></div>
      </dl>
      <details class="elri-debug">
        <summary>Debug</summary>
        <pre class="elri-debug-pre">${escapeHtml([auditData.inputText, auditData.userPrompt, auditData.systemPrompt, auditData.rawResponse].filter(Boolean).join('\n\n---\n\n') || '—')}</pre>
      </details>`;
  }

  function render() {
    renderToolbar();
    renderViewTabs();
    renderContent();
    renderReclassifyModal();
    renderAuditModal();
  }

  async function loadOpportunities() {
    try {
      const params = {
        limit: OPP_LIMIT,
        sortBy: oppSortBy,
        sortDir: oppSortDir,
      };
      if (signalId) params.signalId = signalId;
      opportunities = await api().getOpportunities(session, params);
      if (!Array.isArray(opportunities.items)) opportunities.items = [];
    } catch (err) {
      opportunities = { items: [], total: 0 };
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    }
    render();
  }

  async function loadContacts() {
    try {
      contacts = await api().getContacts(session, {
        limit: CONTACTS_LIMIT,
        sortBy: contactsSortBy,
        sortDir: contactsSortDir,
      });
      if (!Array.isArray(contacts.items)) contacts.items = [];
    } catch (err) {
      contacts = { items: [] };
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    }
  }

  async function refreshAll() {
    if (!active) return;
    setLoading(true);
    setFeedback('');
    error = '';
    try {
      const [statsRes, insightsRes, signalsRes] = await Promise.all([
        api().getStats(session),
        api().getInsights(session),
        api().getSignals(session),
      ]);
      stats = statsRes;
      insights = insightsRes;
      signals = signalsRes;
      await Promise.all([loadContacts(), loadOpportunities()]);
    } catch (err) {
      const mapped = api().mapApiError(err);
      error = mapped.message;
      setFeedback(mapped.message, 'danger');
    } finally {
      setLoading(false);
      render();
    }
  }

  async function loadReclassifyPreview() {
    busy = true;
    renderReclassifyModal();
    try {
      reclassifyPreview = await api().reclassifyPreview(session, { force: reclassifyForce });
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      busy = false;
      renderReclassifyModal();
    }
  }

  async function openReclassifyModal() {
    if (!canManage()) return;
    const modal = $('engageLeadRecoveryReclassifyModal');
    if (modal) modal.hidden = false;
    reclassifyForce = false;
    await loadReclassifyPreview();
  }

  function closeReclassifyModal() {
    const modal = $('engageLeadRecoveryReclassifyModal');
    if (modal) modal.hidden = true;
    reclassifyPreview = null;
  }

  async function confirmReclassify() {
    if (!canManage() || busy) return;
    busy = true;
    renderReclassifyModal();
    try {
      await api().reclassify(session, { force: reclassifyForce });
      setFeedback('Reprocessamento enfileirado. Aguarde alguns minutos e atualize.', 'success');
      closeReclassifyModal();
      await refreshAll();
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      busy = false;
      render();
    }
  }

  async function openAuditModal(contactId) {
    if (!contactId) return;
    auditData = null;
    const modal = $('engageLeadRecoveryAuditModal');
    if (modal) modal.hidden = false;
    renderAuditModal();
    try {
      auditData = await api().getContactAudit(session, contactId);
    } catch (err) {
      const mapped = api().mapApiError(err);
      auditData = { reasoning: mapped.message };
    }
    renderAuditModal();
  }

  function closeAuditModal() {
    const modal = $('engageLeadRecoveryAuditModal');
    if (modal) modal.hidden = true;
    auditData = null;
  }

  async function onExportAudits() {
    if (!canManage() || busy) return;
    busy = true;
    renderToolbar();
    try {
      const data = await api().exportAudits(session);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lead-recovery-audits-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback('Auditorias exportadas.', 'success');
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      busy = false;
      render();
    }
  }

  function bindModals() {
    const panel = document.querySelector('[data-ec-panel="lead-recovery-intelligence"]');
    if (!panel || panel.dataset.elriBound === '1') return;
    panel.addEventListener('click', (e) => {
      if (e.target.closest('[data-elri-reclassify-close]')) closeReclassifyModal();
      if (e.target.closest('[data-elri-audit-close]')) closeAuditModal();
    });
    $('engageLeadRecoveryReclassifyModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'engageLeadRecoveryReclassifyModal') closeReclassifyModal();
    });
    $('engageLeadRecoveryAuditModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'engageLeadRecoveryAuditModal') closeAuditModal();
    });
    panel.dataset.elriBound = '1';
  }

  async function activate(nextSession) {
    active = true;
    if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
      session = await window.ReservaPermissions.enrichSessionWithOperatorMe(nextSession || session);
    } else {
      session = nextSession || session;
    }
    viewTab = 'decision';
    signalId = '';
    error = '';
    setFeedback('');
    bindModals();
    await refreshAll();
  }

  function deactivate() {
    active = false;
    closeReclassifyModal();
    closeAuditModal();
    setLoading(false);
    setFeedback('');
  }

  window.EngageLeadRecovery = { activate, deactivate };
})();
