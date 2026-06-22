/**
 * Engage Solar — Drawer do Lead (resumo + qualificação solar).
 */
(function () {
  const api = () => window.EngagePipelineApi;

  const AVATAR_PALETTES = [
    { bg: '#dbeafe', fg: '#1d4ed8' },
    { bg: '#dcfce7', fg: '#15803d' },
    { bg: '#fce7f3', fg: '#be185d' },
    { bg: '#ffedd5', fg: '#c2410c' },
    { bg: '#e0e7ff', fg: '#4338ca' },
    { bg: '#f3e8ff', fg: '#7e22ce' },
    { bg: '#ccfbf1', fg: '#0f766e' },
  ];

  const state = {
    hooks: {},
    open: false,
    loading: false,
    saving: false,
    error: '',
    loadError: '',
    saveError: '',
    saveSuccess: '',
    leadId: null,
    card: null,
    detail: null,
    qualification: null,
    formDraft: {},
    activeTab: 'summary',
    drawerBundle: null,
    layout: 'default',
    mountMode: 'overlay',
    mountSelector: null,
    agents: [],
    agentsLoading: false,
    assignOpen: false,
    moveOpen: false,
    actionBusy: false,
    actionError: '',
    actionSuccess: '',
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function avatarPalette(seed) {
    const s = String(seed || '?');
    const hash = s.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  }

  function completenessPct() {
    return state.qualification?.completeness
      ?? state.card?.qualificationPct
      ?? null;
  }

  function renderCompletenessBar() {
    const pct = completenessPct();
    if (pct == null) return '';
    const width = Math.max(0, Math.min(100, pct));
    return `
      <div class="epl-drawer-complete">
        <div class="epl-drawer-complete-head">
          <span>Qualificação</span>
          <strong>${width}%</strong>
        </div>
        <div class="epl-drawer-complete-track" aria-hidden="true">
          <span style="width:${width}%"></span>
        </div>
      </div>`;
  }

  function renderSummaryRow(label, value) {
    return `
      <div class="epl-drawer-field epl-drawer-summary-field">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || '—')}</strong>
      </div>`;
  }

  function renderAssigneeSummaryRow(label, detail) {
    const name = detail?.assignedAgentName || detail?.assignedSalesConsultant?.name;
    if (!name) return renderSummaryRow(label, 'Sem responsável');
    const url = detail?.assignedAgentAvatarUrl || detail?.assignedSalesConsultant?.avatarUrl;
    const pal = avatarPalette(name);
    const inner = url
      ? `<img class="epl-drawer-person-photo" src="${escapeAttr(url)}" alt="" />`
      : `<span class="epl-drawer-person-initials" style="background:${pal.fg}">${escapeHtml(api()?.initials?.(name) || '?')}</span>`;
    return `
      <div class="epl-drawer-field epl-drawer-summary-field">
        <span>${escapeHtml(label)}</span>
        <strong class="epl-drawer-person">
          ${inner}
          <span>${escapeHtml(name)}</span>
        </strong>
      </div>`;
  }

  function tempLabel(card) {
    const temp = String(card?.leadTemperature || '').toUpperCase();
    const meta = api()?.LEAD_TEMPERATURE?.[temp];
    if (!meta) return '—';
    const manual = String(card?.temperatureSource || '').toUpperCase() === 'MANUAL' ? ' (manual)' : '';
    return `${meta.cardIcon || meta.icon} ${meta.label}${manual}`;
  }

  function statusLabelForCard(card) {
    const labels = window.EngageLeadsListApi?.statusLabel;
    const status = String(card?.status || '').trim().toUpperCase();
    if (labels) return labels(status);
    return status.replace(/_/g, ' ') || '—';
  }

  function statusToneForCard(card) {
    return window.EngageLeadsListApi?.statusTone?.(card?.status) || 'neutral';
  }

  function formatDrawerDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${date} às ${time}`;
  }

  function qualificationProgressMeta() {
    const pct = completenessPct();
    const defs = api()?.QUALIFICATION_FIELD_DEFS || [];
    const fields = state.qualification?.fields || state.formDraft || {};
    const filled = defs.filter((def) => {
      const value = fields[def.key];
      return value != null && value !== '';
    }).length;
    const total = defs.length || 10;
    return { pct: pct ?? 0, filled, total };
  }

  function renderPremiumKpis(card) {
    const pct = completenessPct();
    const score = card.leadScore != null ? Math.round(card.leadScore) : '—';
    const scoreTone = api()?.scoreTone?.(card.leadScore) || 'neutral';
    const temp = String(card.leadTemperature || '').toUpperCase();
    const tempMeta = api()?.LEAD_TEMPERATURE?.[temp];
    const tempLabel = temp === 'HOT' || temp === 'WARM' || temp === 'COLD' ? temp : (tempMeta?.label || '—');
    return `
      <div class="epl-drawer-kpi-row">
        <div class="epl-drawer-kpi">
          <span>Score</span>
          <strong class="epl-drawer-kpi-pill" data-tone="${escapeAttr(scoreTone)}">${escapeHtml(String(score))}</strong>
        </div>
        <div class="epl-drawer-kpi">
          <span>Temperatura</span>
          <strong class="epl-drawer-kpi-pill" data-tone="${escapeAttr(tempMeta?.tone || 'neutral')}">${tempMeta ? `${tempMeta.cardIcon || tempMeta.icon} ` : ''}${escapeHtml(tempLabel)}</strong>
        </div>
        <div class="epl-drawer-kpi epl-drawer-kpi--qual">
          <span>Qualificação</span>
          <strong class="epl-drawer-kpi-qual-value">${pct != null ? `${pct}%` : '—'}</strong>
          ${pct != null ? `<div class="epl-drawer-kpi-track"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>` : ''}
        </div>
        <div class="epl-drawer-kpi">
          <span>Status atual</span>
          <strong class="epl-drawer-kpi-pill" data-tone="${escapeAttr(statusToneForCard(card))}">${escapeHtml(statusLabelForCard(card))}</strong>
        </div>
      </div>`;
  }

  function columnOptions() {
    const cols = api()?.COLUMN_ORDER || Object.keys(api()?.LEAD_STATUS_COLUMNS || {});
    const labels = api()?.LEAD_STATUS_COLUMNS || {};
    return cols.map((key) => ({
      key,
      label: `${labels[key]?.emoji || ''} ${labels[key]?.label || key}`.trim(),
    }));
  }

  function renderAssignPanel() {
    if (!state.assignOpen) return '';
    const currentId = state.card?.assignedSalesConsultantId || '';
    return `
      <div class="epl-drawer-action-panel" id="eplDrawerAssignPanel">
        ${state.agentsLoading
          ? '<p class="epl-drawer-muted">Carregando consultores…</p>'
          : `
            <label class="epl-drawer-action-field">
              <span>Consultor comercial</span>
              <select id="eplDrawerAssignSelect"${state.actionBusy ? ' disabled' : ''}>
                <option value="">Selecione um responsável</option>
                ${state.agents.map((agent) => `
                  <option value="${escapeAttr(agent.salesConsultantId)}"${currentId === agent.salesConsultantId ? ' selected' : ''}>
                    ${escapeHtml(agent.displayName)}
                  </option>`).join('')}
              </select>
            </label>
            <div class="epl-drawer-action-panel-btns">
              <button type="button" class="epl-btn epl-btn--primary epl-btn--sm" id="eplDrawerAssignConfirm"${state.actionBusy ? ' disabled' : ''}>Confirmar</button>
              ${currentId ? `<button type="button" class="epl-btn epl-btn--ghost epl-btn--sm" id="eplDrawerAssignClear"${state.actionBusy ? ' disabled' : ''}>Remover</button>` : ''}
              <button type="button" class="epl-btn epl-btn--ghost epl-btn--sm" id="eplDrawerAssignCancel"${state.actionBusy ? ' disabled' : ''}>Cancelar</button>
            </div>
            ${!state.agents.length && !state.agentsLoading ? '<p class="epl-drawer-muted">Nenhum consultor ativo encontrado.</p>' : ''}`}
      </div>`;
  }

  function renderMovePanel() {
    if (!state.moveOpen) return '';
    const currentCol = state.card?.kanbanColumn || api()?.resolveKanbanColumn?.(state.card) || 'NEW';
    return `
      <div class="epl-drawer-action-panel" id="eplDrawerMovePanel">
        <label class="epl-drawer-action-field">
          <span>Coluna do pipeline</span>
          <select id="eplDrawerMoveSelect"${state.actionBusy ? ' disabled' : ''}>
            ${columnOptions().map((col) => `
              <option value="${escapeAttr(col.key)}"${col.key === currentCol ? ' selected' : ''}>${escapeHtml(col.label)}</option>`).join('')}
          </select>
        </label>
        <div class="epl-drawer-action-panel-btns">
          <button type="button" class="epl-btn epl-btn--primary epl-btn--sm" id="eplDrawerMoveConfirm"${state.actionBusy ? ' disabled' : ''}>Mover lead</button>
          <button type="button" class="epl-btn epl-btn--ghost epl-btn--sm" id="eplDrawerMoveCancel"${state.actionBusy ? ' disabled' : ''}>Cancelar</button>
        </div>
      </div>`;
  }

  function renderActionFeedback() {
    if (state.actionError) {
      return `<p class="epl-drawer-error" role="alert">${escapeHtml(state.actionError)}</p>`;
    }
    if (state.actionSuccess) {
      return `<p class="epl-drawer-success" role="status">${escapeHtml(state.actionSuccess)}</p>`;
    }
    return '';
  }

  async function ensureAgentsLoaded() {
    if (state.agents.length || state.agentsLoading) return;
    const session = state.hooks.getSession?.();
    if (!session) return;
    state.agentsLoading = true;
    refreshDOM();
    try {
      state.agents = await api().getAgents(session);
    } catch (err) {
      state.actionError = api()?.mapApiError?.(err)?.message || 'Erro ao carregar consultores.';
    } finally {
      state.agentsLoading = false;
    }
  }

  async function confirmAssign(consultantId) {
    const session = state.hooks.getSession?.();
    if (!session || !state.leadId || state.actionBusy) return;
    state.actionBusy = true;
    state.actionError = '';
    state.actionSuccess = '';
    refreshDOM();
    try {
      const updated = await api().patchLeadAssign(session, state.leadId, {
        salesConsultantId: consultantId || null,
      });
      if (updated) {
        state.card = { ...state.card, ...updated };
        if (state.detail?.lead) state.detail.lead = { ...state.detail.lead, ...updated };
      }
      state.assignOpen = false;
      state.actionSuccess = consultantId ? 'Responsável atribuído.' : 'Responsável removido.';
      state.hooks.onLeadUpdated?.(state.card);
    } catch (err) {
      state.actionError = api()?.mapApiError?.(err)?.message || 'Erro ao atribuir responsável.';
    } finally {
      state.actionBusy = false;
      refreshDOM();
    }
  }

  async function confirmMove(toColumn) {
    const session = state.hooks.getSession?.();
    if (!session || !state.leadId || !toColumn || state.actionBusy) return;
    const fromColumn = state.card?.kanbanColumn || api()?.resolveKanbanColumn?.(state.card) || 'NEW';
    if (toColumn === fromColumn) {
      state.actionError = 'O lead já está nesta coluna.';
      refreshDOM();
      return;
    }
    const status = api().columnKeyToApiStatus?.(toColumn) || toColumn;
    let body = { status };
    if (toColumn === 'FOLLOW_UP') {
      const dateRaw = window.prompt('Data de retorno (AAAA-MM-DD):', new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
      if (!dateRaw) return;
      body.nextContactAt = new Date(`${dateRaw}T12:00:00.000Z`).toISOString();
    }
    if (toColumn === 'CLOSED') {
      const reason = window.prompt('Motivo do encerramento (won, lost, no_interest — opcional):', 'won');
      if (reason) body.closedReason = reason.trim();
    }
    state.actionBusy = true;
    state.actionError = '';
    state.actionSuccess = '';
    refreshDOM();
    try {
      const updated = await api().patchLeadStatus(session, state.leadId, body);
      if (updated) {
        state.card = { ...state.card, ...updated };
        if (state.detail?.lead) state.detail.lead = { ...state.detail.lead, ...updated };
      }
      state.moveOpen = false;
      state.actionSuccess = 'Lead movido no pipeline.';
      state.hooks.onLeadUpdated?.(state.card);
    } catch (err) {
      state.actionError = api()?.mapApiError?.(err)?.message || 'Erro ao mover lead.';
    } finally {
      state.actionBusy = false;
      refreshDOM();
    }
  }

  function openAssignPanel() {
    state.moveOpen = false;
    state.assignOpen = true;
    state.actionError = '';
    state.actionSuccess = '';
    refreshDOM();
    void ensureAgentsLoaded().then(() => refreshDOM());
  }

  function openMovePanel() {
    state.assignOpen = false;
    state.moveOpen = true;
    state.actionError = '';
    state.actionSuccess = '';
    refreshDOM();
  }

  function renderPremiumSummaryTab() {
    const card = state.card || {};
    const detail = state.detail?.lead || card;
    const progress = qualificationProgressMeta();
    const suggestions = (state.qualification?.suggestions || state.drawerBundle?.aiSuggestions || [])
      .filter((s) => String(s.status || 'PENDING').toUpperCase() === 'PENDING')
      .slice(0, 3);
    const msgCount = state.drawerBundle?.conversation?.messageCount
      ?? state.drawerBundle?.conversation?.lastMessages?.length
      ?? state.drawerBundle?.activity?.length
      ?? null;
    return `
      <div class="epl-drawer-premium-resumo">
        <div class="epl-drawer-summary-grid">
          ${renderSummaryRow('Origem', detail.originLabel || detail.sourceCampaignName || 'WhatsApp Orgânico')}
          ${renderSummaryRow('Primeiro contato', formatDrawerDate(detail.createdAt))}
          ${renderSummaryRow('Campanha', detail.sourceCampaignName || 'Não atribuído')}
          ${renderSummaryRow('Última interação', window.EngageLeadsListApi?.formatRelativeTime?.(detail.lastInteractionAt) || formatDrawerDate(detail.lastInteractionAt))}
          ${renderAssigneeSummaryRow('Responsável', detail)}
          ${renderSummaryRow('Total de interações', msgCount != null ? `${msgCount} mensagens` : '—')}
          ${renderSummaryRow('Audiência', detail.sourceAudienceName || 'Não atribuído')}
          ${renderSummaryRow('Cliente desde', formatDrawerDate(detail.createdAt))}
        </div>
        <section class="epl-drawer-qual-card">
          <div class="epl-drawer-qual-card-head">
            <strong>Qualificação</strong>
            <span class="epl-drawer-qual-badge">${progress.pct}% Completo</span>
          </div>
          <div class="epl-drawer-qual-card-track" aria-hidden="true">
            <span style="width:${Math.max(0, Math.min(100, progress.pct))}%"></span>
          </div>
          <p class="epl-drawer-qual-foot">${progress.filled} de ${progress.total} informações preenchidas</p>
        </section>
        <section class="epl-drawer-quick-actions">
          <h3>Ações rápidas</h3>
          ${renderActionFeedback()}
          <div class="epl-drawer-quick-grid">
            <button type="button" class="epl-btn epl-btn--primary" data-drawer-action="qualification">Editar Qualificação</button>
            <button type="button" class="epl-btn epl-btn--outline" data-drawer-action="assign">Atribuir Responsável</button>
            <button type="button" class="epl-btn epl-btn--outline" data-drawer-action="conversation">Ver Conversa</button>
            <button type="button" class="epl-btn epl-btn--outline" data-drawer-action="pipeline">Mover no Pipeline</button>
            <button type="button" class="epl-btn epl-btn--outline" data-drawer-action="proposal" disabled title="Em breve">Criar Proposta</button>
          </div>
          ${renderAssignPanel()}
          ${renderMovePanel()}
        </section>
        ${suggestions.length ? `
          <section class="epl-drawer-ai-card">
            <header class="epl-drawer-ai-card-head">
              <span class="epl-drawer-ai-card-title">✨ Sugestões da IA</span>
              <small>${suggestions.length} sugestão${suggestions.length === 1 ? '' : 'ões'}</small>
            </header>
            ${suggestions.map((s) => {
              const conf = s.confidence != null
                ? Math.round((s.confidence > 1 ? s.confidence : s.confidence * 100))
                : null;
              const display = s.displayValue || fieldDisplayValue(s.field, s.value) || String(s.value ?? '—');
              return `
                <article class="epl-drawer-ai-item">
                  <div class="epl-drawer-ai-item-copy">
                    <span>${escapeHtml(s.label || s.field)}</span>
                    <strong>${escapeHtml(display)}</strong>
                    ${conf != null ? `<em>Confiança: ${conf}%</em>` : ''}
                  </div>
                  <button type="button" class="epl-btn epl-btn--outline epl-btn--sm" data-accept-suggestion="${escapeAttr(s.field)}">Aceitar</button>
                </article>`;
            }).join('')}
            <button type="button" class="epl-drawer-ai-more" data-drawer-action="qualification">Ver todas as sugestões</button>
          </section>` : ''}
      </div>`;
  }

  function renderSummaryTab() {
    if (state.layout === 'premium') return renderPremiumSummaryTab();
    const card = state.card || {};
    const detail = state.detail?.lead || card;
    return `
      <div class="epl-drawer-grid">
        ${renderSummaryRow('Nome', detail.name)}
        ${renderSummaryRow('Telefone', api()?.formatPhoneDisplay?.(detail.phone))}
        ${renderSummaryRow('Cidade', detail.city)}
        ${renderSummaryRow('Campanha', detail.sourceCampaignName)}
        ${renderSummaryRow('Audiência', detail.sourceAudienceName)}
        ${renderSummaryRow('Responsável', detail.assignedAgentName || 'Sem responsável')}
        ${renderSummaryRow('Score', detail.leadScore != null ? Math.round(detail.leadScore) : '—')}
        ${renderSummaryRow('Temperatura', tempLabel(detail))}
        ${renderSummaryRow('Grade', detail.leadGrade)}
        ${renderSummaryRow('Prioridade', api()?.priorityLabel?.(detail.commercialPriority) || '—')}
      </div>`;
  }

  function fieldDisplayValue(key, value) {
    if (value == null || value === '') return '';
    const def = (api()?.QUALIFICATION_FIELD_DEFS || []).find((f) => f.key === key);
    if (def?.type === 'boolean') return value === true ? 'Sim' : value === false ? 'Não' : '';
    if (api()?.qualificationFieldDisplayLabel) {
      return api().qualificationFieldDisplayLabel(key, value);
    }
    if (def?.options) return api()?.labelFromMap?.(def.options, value, String(value)) || String(value);
    if (def?.type === 'number' && key === 'avgConsumptionKwh') return api()?.formatConsumptionKwh?.(value);
    if (def?.type === 'date' && value) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
    }
    return String(value);
  }

  function buildSelectOptions(def, currentValue) {
    const valStr = currentValue == null ? '' : String(currentValue);
    const rows = [];
    if (Array.isArray(def.optionList) && def.optionList.length) {
      def.optionList.forEach((item) => {
        rows.push({ value: item, label: item });
      });
    } else if (def.options && typeof def.options === 'object') {
      Object.entries(def.options).forEach(([value, label]) => {
        rows.push({ value, label });
      });
    }
    if (valStr && !rows.some((row) => String(row.value) === valStr)) {
      rows.unshift({ value: valStr, label: valStr });
    }
    return rows;
  }

  function renderFormControl(def) {
    const val = state.formDraft[def.key];
    const id = `eplQf_${def.key}`;
    if (def.type === 'boolean') {
      return `
        <label class="epl-drawer-check">
          <input type="checkbox" id="${id}" data-qf-key="${escapeAttr(def.key)}"${val === true ? ' checked' : ''} />
          <span>${escapeHtml(def.label)}</span>
        </label>`;
    }
    if (def.type === 'select') {
      const valStr = val == null ? '' : String(val);
      const opts = buildSelectOptions(def, val).map(({ value, label }) => {
        const sel = valStr === String(value) ? ' selected' : '';
        return `<option value="${escapeAttr(value)}"${sel}>${escapeHtml(label)}</option>`;
      }).join('');
      return `
        <label class="epl-drawer-input">
          <span>${escapeHtml(def.label)}</span>
          <select id="${id}" data-qf-key="${escapeAttr(def.key)}">
            <option value="">—</option>
            ${opts}
          </select>
        </label>`;
    }
    if (def.type === 'textarea') {
      return `
        <label class="epl-drawer-input epl-drawer-input--full">
          <span>${escapeHtml(def.label)}</span>
          <textarea id="${id}" data-qf-key="${escapeAttr(def.key)}" rows="3">${escapeHtml(val || '')}</textarea>
        </label>`;
    }
    const inputType = def.type === 'date' ? 'date' : def.type === 'number' ? 'number' : 'text';
    let inputVal = val ?? '';
    if (def.type === 'date' && inputVal) {
      const d = new Date(inputVal);
      if (!Number.isNaN(d.getTime())) inputVal = d.toISOString().slice(0, 10);
    }
    const stepAttr = def.type === 'number' && def.step ? ` step="${escapeAttr(def.step)}"` : '';
    const placeholderAttr = def.placeholder ? ` placeholder="${escapeAttr(def.placeholder)}"` : '';
    return `
      <label class="epl-drawer-input${def.type === 'textarea' ? ' epl-drawer-input--full' : ''}">
        <span>${escapeHtml(def.label)}</span>
        <input type="${inputType}" id="${id}" data-qf-key="${escapeAttr(def.key)}" value="${escapeAttr(inputVal)}"${stepAttr}${placeholderAttr}${def.suffix && !def.placeholder ? ` placeholder="${escapeAttr(def.suffix)}"` : ''} />
      </label>`;
  }

  function renderSuggestions() {
    const items = (state.qualification?.suggestions || []).filter((s) => String(s.status || 'PENDING').toUpperCase() === 'PENDING');
    if (!items.length) {
      return '<p class="epl-drawer-muted">Nenhuma sugestão da IA no momento.</p>';
    }
    return `
      <div class="epl-drawer-ai">
        <h3>🤖 Sugestões da IA</h3>
        ${items.map((s) => {
          const conf = s.confidence != null
            ? `${Math.round((s.confidence > 1 ? s.confidence : s.confidence * 100))}%`
            : '—';
          const display = s.displayValue || fieldDisplayValue(s.field, s.value) || String(s.value ?? '—');
          return `
            <article class="epl-drawer-suggestion" data-suggestion-field="${escapeAttr(s.field)}">
              <div class="epl-drawer-suggestion-copy">
                <strong>${escapeHtml(s.label || s.field)}</strong>
                <span>${escapeHtml(display)}</span>
                <em>Confiança ${escapeHtml(conf)}</em>
              </div>
              <div class="epl-drawer-suggestion-actions">
                <button type="button" class="epl-btn epl-btn--primary epl-btn--sm" data-accept-suggestion="${escapeAttr(s.field)}">Aceitar</button>
                <button type="button" class="epl-btn epl-btn--ghost epl-btn--sm" data-dismiss-suggestion="${escapeAttr(s.field)}">Ignorar</button>
              </div>
            </article>`;
        }).join('')}
      </div>`;
  }

  function renderConversationTab() {
    const msgs = state.drawerBundle?.conversation?.lastMessages || [];
    if (!msgs.length) {
      return '<p class="epl-drawer-muted">Nenhuma mensagem recente.</p>';
    }
    return `
      <div class="epl-drawer-messages">
        ${msgs.map((m) => {
          const dir = String(m.direction || '').toLowerCase();
          const tone = dir === 'outbound' ? 'out' : 'in';
          const at = m.sentAt || m.createdAt;
          const when = at ? new Date(at).toLocaleString('pt-BR') : '';
          return `
            <article class="epl-drawer-msg" data-tone="${tone}">
              <header><strong>${escapeHtml(m.senderName || (tone === 'out' ? 'Operador' : 'Cliente'))}</strong><time>${escapeHtml(when)}</time></header>
              <p>${escapeHtml(String(m.content || ''))}</p>
            </article>`;
        }).join('')}
      </div>`;
  }

  function renderHistoryTab() {
    const items = state.drawerBundle?.history || [];
    if (!items.length) return '<p class="epl-drawer-muted">Sem histórico registrado.</p>';
    return `
      <ul class="epl-drawer-history">
        ${items.map((h) => `
          <li>
            <time>${escapeHtml(h.occurredAt ? new Date(h.occurredAt).toLocaleString('pt-BR') : '')}</time>
            <strong>${escapeHtml(h.title || h.kind || 'Evento')}</strong>
            <span>${escapeHtml(h.description || h.summary || '')}</span>
          </li>`).join('')}
      </ul>`;
  }

  function renderIntelligenceTab() {
    const intel = state.drawerBundle?.intelligence;
    if (!intel) return '<p class="epl-drawer-muted">Inteligência indisponível para este lead.</p>';
    const breakdown = Array.isArray(intel.breakdown) ? intel.breakdown : [];
    return `
      <div class="epl-drawer-grid">
        ${renderSummaryRow('Score', intel.score ?? intel.leadScore)}
        ${renderSummaryRow('Grade', intel.grade ?? intel.leadGrade)}
        ${renderSummaryRow('Temperatura', tempLabel({ leadTemperature: intel.temperature ?? intel.leadTemperature }))}
        ${renderSummaryRow('Prioridade', api()?.priorityLabel?.(intel.commercialPriority || intel.priority))}
      </div>
      ${breakdown.length ? `
        <h3 class="epl-drawer-subhead">Breakdown</h3>
        <ul class="epl-intel-breakdown">
          ${breakdown.map((b) => `<li><span>${escapeHtml(b.label || b.key)}</span><strong>${escapeHtml(String(b.value ?? b.score ?? ''))}</strong></li>`).join('')}
        </ul>` : ''}`;
  }

  function drawerTabs() {
    const tabs = [
      { id: 'summary', label: 'Resumo' },
      { id: 'qualification', label: 'Qualificação Solar' },
    ];
    if (state.layout === 'premium') {
      tabs.push({ id: 'activity', label: 'Atividades' });
      tabs.push({ id: 'conversation', label: 'Conversa' });
      tabs.push({ id: 'history', label: 'Histórico' });
      return tabs;
    }
    if (state.drawerBundle?.intelligence) tabs.push({ id: 'intelligence', label: 'Inteligência' });
    if (state.drawerBundle?.conversation?.lastMessages?.length) tabs.push({ id: 'conversation', label: 'Conversa' });
    if (state.drawerBundle?.history?.length) tabs.push({ id: 'history', label: 'Histórico' });
    return tabs;
  }

  function renderActivityTab() {
    const items = state.drawerBundle?.activity || [];
    if (!items.length) {
      return '<p class="epl-drawer-muted">Nenhuma atividade registrada ainda.</p>';
    }
    return `
      <div class="epl-drawer-activity">
        ${items.map((item, idx) => `
          <article class="epl-drawer-activity-item">
            <strong>${escapeHtml(item.title || `Atividade ${idx + 1}`)}</strong>
            <span>${escapeHtml(item.summary || 'Registro de interação com o lead.')}</span>
          </article>`).join('')}
      </div>`;
  }

  function renderDrawerBody() {
    if (state.loading) return '<div class="epl-drawer-loading">Carregando lead…</div>';
    if (state.loadError && !state.qualification) {
      return `<div class="epl-drawer-error" role="alert">${escapeHtml(state.loadError)}</div>`;
    }
    switch (state.activeTab) {
      case 'activity': return renderActivityTab();
      case 'qualification': return renderQualificationTab();
      case 'intelligence': return renderIntelligenceTab();
      case 'conversation': return renderConversationTab();
      case 'history': return renderHistoryTab();
      default: return renderSummaryTab();
    }
  }

  function renderQualificationTab() {
    const defs = api()?.QUALIFICATION_FIELD_DEFS || [];
    return `
      ${state.saveSuccess ? `<p class="epl-drawer-success" role="status">${escapeHtml(state.saveSuccess)}</p>` : ''}
      ${state.saveError ? `<p class="epl-drawer-error" role="alert">${escapeHtml(state.saveError)}</p>` : ''}
      ${renderSuggestions()}
      <form class="epl-drawer-form" id="eplQualificationForm">
        <div class="epl-drawer-form-grid">
          ${defs.map(renderFormControl).join('')}
        </div>
        <div class="epl-drawer-form-actions">
          <button type="submit" class="epl-btn epl-btn--primary" id="eplSaveQualification"${state.saving ? ' disabled' : ''}>
            ${state.saving ? 'Salvando…' : 'Salvar qualificação'}
          </button>
        </div>
      </form>`;
  }

  function renderPremiumHeader(card) {
    const initials = api()?.initials?.(card.name) || '?';
    const pal = avatarPalette(card.name);
    const phone = api()?.formatPhoneDisplay?.(card.phone) || card.phone || '—';
    const city = card.city ? `${card.city}` : '—';
    return `
      <header class="epl-drawer-hero">
        <button type="button" class="epl-drawer-close" id="eplLeadDrawerClose" aria-label="Fechar">×</button>
        <span class="epl-drawer-hero-avatar" style="background:${pal.bg};color:${pal.fg}">${escapeHtml(initials)}</span>
        <h2 id="eplLeadDrawerTitle">${escapeHtml(card.name || 'Lead')}</h2>
        <p class="epl-drawer-hero-line">
          <span class="epl-drawer-hero-icon epl-drawer-hero-icon--wa" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
          </span>
          ${escapeHtml(phone)}
        </p>
        <p class="epl-drawer-hero-line">
          <span class="epl-drawer-hero-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
          </span>
          ${escapeHtml(city)}
        </p>
        ${renderPremiumKpis(card)}
      </header>`;
  }

  function renderDrawer() {
    if (!state.open) return '';
    const card = state.card || {};
    const body = renderDrawerBody();
    const premium = state.layout === 'premium';
    const inline = state.mountMode === 'inline';
    const drawerClass = `epl-lead-drawer${premium ? ' is-premium' : ''}${inline ? ' is-inline' : ''}`;
    const backdrop = inline ? '' : '<div class="epl-drawer-backdrop" id="eplLeadDrawerBackdrop" aria-hidden="true"></div>';

    if (premium) {
      return `
        ${backdrop}
        <aside class="${drawerClass}" id="eplLeadDrawer" role="dialog" aria-labelledby="eplLeadDrawerTitle">
          ${renderPremiumHeader(card)}
          <nav class="epl-drawer-tabs epl-drawer-tabs--underline" role="tablist">
            ${drawerTabs().map((tab) => `
              <button type="button" class="epl-drawer-tab${state.activeTab === tab.id ? ' is-active' : ''}" data-drawer-tab="${escapeAttr(tab.id)}" role="tab">${escapeHtml(tab.label)}</button>`).join('')}
          </nav>
          <div class="epl-drawer-body">${body}</div>
        </aside>`;
    }

    return `
      ${backdrop}
      <aside class="${drawerClass}" id="eplLeadDrawer" role="dialog" aria-labelledby="eplLeadDrawerTitle">
        <header class="epl-drawer-head">
          <div>
            <p class="epl-drawer-eyebrow">Pipeline Comercial Solar</p>
            <h2 id="eplLeadDrawerTitle">${escapeHtml(card.name || 'Lead')}</h2>
            <p class="epl-drawer-sub">${escapeHtml(api()?.formatPhoneDisplay?.(card.phone) || '')}</p>
          </div>
          <button type="button" class="epl-drawer-close" id="eplLeadDrawerClose" aria-label="Fechar">×</button>
        </header>
        ${renderCompletenessBar()}
        <nav class="epl-drawer-tabs" role="tablist">
          ${drawerTabs().map((tab) => `
            <button type="button" class="epl-drawer-tab${state.activeTab === tab.id ? ' is-active' : ''}" data-drawer-tab="${escapeAttr(tab.id)}" role="tab">${escapeHtml(tab.label)}</button>`).join('')}
        </nav>
        <div class="epl-drawer-body">${body}</div>
        <footer class="epl-drawer-foot">
          <button type="button" class="epl-btn epl-btn--outline" id="eplLeadDrawerInbox">Abrir conversa</button>
          <button type="button" class="epl-btn epl-btn--ghost" id="eplLeadDrawerCloseFoot">Fechar</button>
        </footer>
      </aside>`;
  }

  function collectFormDraft() {
    const draft = { ...state.formDraft };
    document.querySelectorAll('#eplQualificationForm [data-qf-key]').forEach((el) => {
      const key = el.getAttribute('data-qf-key');
      if (!key) return;
      if (el.type === 'checkbox') draft[key] = el.checked;
      else if (el.type === 'number') draft[key] = el.value === '' ? null : Number(el.value);
      else if (el.type === 'date' && el.value) draft[key] = new Date(`${el.value}T12:00:00.000Z`).toISOString();
      else draft[key] = el.value === '' ? null : el.value;
    });
    state.formDraft = draft;
    return draft;
  }

  function syncFormDraftFromQualification() {
    const fields = state.qualification?.fields || {};
    state.formDraft = { ...fields };
  }

  function getDrawerMount() {
    if (state.mountMode === 'inline' && state.mountSelector) {
      return document.querySelector(state.mountSelector);
    }
    return document.body;
  }

  function refreshDOM() {
    document.getElementById('eplLeadDrawerBackdrop')?.remove();
    document.getElementById('eplLeadDrawer')?.remove();
    if (!state.open) return;
    const mount = getDrawerMount();
    if (!mount) return;
    mount.insertAdjacentHTML('beforeend', renderDrawer());
    bindDrawer();
  }

  function bindDrawer() {
    if (state.mountMode !== 'inline') {
      document.getElementById('eplLeadDrawerBackdrop')?.addEventListener('click', close);
    }
    document.getElementById('eplLeadDrawerClose')?.addEventListener('click', close);
    document.getElementById('eplLeadDrawerCloseFoot')?.addEventListener('click', close);
    document.getElementById('eplLeadDrawerInbox')?.addEventListener('click', () => {
      const convId = state.card?.conversationId;
      close();
      state.hooks.openConversation?.(convId);
    });

    document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.getAttribute('data-drawer-tab') || 'summary';
        refreshDOM();
      });
    });

    document.getElementById('eplQualificationForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      void saveQualification();
    });

    document.querySelectorAll('[data-accept-suggestion]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void acceptSuggestion(btn.getAttribute('data-accept-suggestion'));
      });
    });

    document.querySelectorAll('[data-dismiss-suggestion]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void dismissSuggestion(btn.getAttribute('data-dismiss-suggestion'));
      });
    });

    document.querySelectorAll('[data-drawer-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-drawer-action');
        if (action === 'qualification') {
          state.activeTab = 'qualification';
          refreshDOM();
          return;
        }
        if (action === 'conversation') {
          const convId = state.card?.conversationId;
          close();
          state.hooks.openConversation?.(convId);
          return;
        }
        if (action === 'assign') {
          openAssignPanel();
          return;
        }
        if (action === 'pipeline') {
          openMovePanel();
        }
      });
    });

    document.getElementById('eplDrawerAssignConfirm')?.addEventListener('click', () => {
      const id = document.getElementById('eplDrawerAssignSelect')?.value?.trim();
      if (!id) {
        state.actionError = 'Selecione um consultor.';
        refreshDOM();
        return;
      }
      void confirmAssign(id);
    });
    document.getElementById('eplDrawerAssignClear')?.addEventListener('click', () => {
      void confirmAssign(null);
    });
    document.getElementById('eplDrawerAssignCancel')?.addEventListener('click', () => {
      state.assignOpen = false;
      state.actionError = '';
      refreshDOM();
    });
    document.getElementById('eplDrawerMoveConfirm')?.addEventListener('click', () => {
      const col = document.getElementById('eplDrawerMoveSelect')?.value?.trim();
      if (!col) return;
      void confirmMove(col);
    });
    document.getElementById('eplDrawerMoveCancel')?.addEventListener('click', () => {
      state.moveOpen = false;
      state.actionError = '';
      refreshDOM();
    });
  }

  function hasQualificationFieldValues(fields) {
    if (!fields || typeof fields !== 'object') return false;
    return Object.values(fields).some((value) => value != null && value !== '');
  }

  function applyQualificationToCard(body) {
    if (!state.card) return;
    state.card.qualificationPct = state.qualification?.completeness ?? state.card.qualificationPct;
    if (body?.avgConsumptionKwh != null) state.card.avgConsumptionKwh = body.avgConsumptionKwh;
    if (body?.paymentMethod) {
      state.card.paymentMethod = api()?.normalizePaymentMethod?.(body.paymentMethod) || body.paymentMethod;
      state.card.paymentMethodLabel = state.card.paymentMethod;
    }
    if (body?.installationDeadline) {
      state.card.installationDeadline = api()?.normalizeInstallationTimeframe?.(body.installationDeadline)
        || body.installationDeadline;
      state.card.installationDeadlineLabel = state.card.installationDeadline;
    }
    if (body?.roofType) {
      state.card.roofType = api()?.normalizeRoofType?.(body.roofType) || body.roofType;
    }
    if (body?.city) state.card.city = body.city;
  }

  function syncCardFromQualification() {
    if (!state.card) return;
    applyQualificationToCard(state.qualification?.fields || state.formDraft || {});
    state.hooks.onLeadUpdated?.(state.card);
  }

  function applyDrawerBundle(bundle) {
    if (!bundle) return;
    state.drawerBundle = bundle;
    if (bundle.card) state.card = { ...state.card, ...bundle.card };
    if (bundle.qualification) {
      state.qualification = bundle.qualification;
      syncFormDraftFromQualification();
    }
  }

  async function loadLeadData() {
    const session = state.hooks.getSession?.();
    if (!session || !state.leadId) return;
    if (state.drawerBundle?.qualification) {
      syncFormDraftFromQualification();
      syncCardFromQualification();
      return;
    }
    state.loading = true;
    state.loadError = '';
    state.saveError = '';
    state.saveSuccess = '';
    refreshDOM();
    try {
      const detail = await api().getLead(session, state.leadId);
      state.detail = detail;
      if (detail?.lead) {
        state.card = { ...state.card, ...detail.lead };
      }
      try {
        state.qualification = await api().getLeadQualification(session, state.leadId);
      } catch (qualErr) {
        const status = Number(qualErr?.statusCode || qualErr?.status || 0);
        if (status !== 404) throw qualErr;
        state.qualification = { completeness: null, fields: {}, suggestions: [] };
        if (detail?.lead) {
          state.qualification = api().mergeQualificationFromCard?.(detail.lead, state.qualification)
            || state.qualification;
        }
      }
      syncFormDraftFromQualification();
      syncCardFromQualification();
      state.loadError = '';
    } catch (err) {
      state.loadError = api()?.mapApiError?.(err)?.message || err?.message || 'Erro ao carregar lead.';
    } finally {
      state.loading = false;
      refreshDOM();
    }
  }

  async function saveQualification() {
    const session = state.hooks.getSession?.();
    if (!session || !state.leadId || state.saving) return;
    const body = collectFormDraft();
    state.saving = true;
    state.saveError = '';
    state.saveSuccess = '';
    refreshDOM();
    try {
      state.qualification = await api().patchLeadQualification(session, state.leadId, body);
      syncFormDraftFromQualification();
      syncCardFromQualification();
      state.saveSuccess = 'Qualificação salva.';
    } catch (err) {
      const mapped = api()?.mapApiError?.(err) || { message: err?.message };
      const status = Number(err?.statusCode || err?.status || 0);
      if (mapped.code === 'qualification_not_persisted' || err?.code === 'qualification_not_persisted') {
        state.saveError = mapped.message;
      } else if (status === 404) {
        state.saveError = 'API de qualificação indisponível. Confirme deploy do api-engage (PATCH /engage/leads/:id/qualification).';
      } else {
        state.saveError = mapped.message || 'Erro ao salvar.';
      }
    } finally {
      state.saving = false;
      refreshDOM();
    }
  }

  async function acceptSuggestion(fieldKey) {
    const session = state.hooks.getSession?.();
    if (!session || !state.leadId || !fieldKey) return;
    try {
      state.qualification = await api().acceptQualificationSuggestion(session, state.leadId, fieldKey);
      syncFormDraftFromQualification();
      syncCardFromQualification();
      state.activeTab = 'qualification';
      refreshDOM();
    } catch (err) {
      state.saveError = api()?.mapApiError?.(err)?.message || err?.message || 'Erro ao aceitar sugestão.';
      refreshDOM();
    }
  }

  async function dismissSuggestion(fieldKey) {
    const session = state.hooks.getSession?.();
    if (!session || !state.leadId || !fieldKey) return;
    try {
      state.qualification = await api().dismissQualificationSuggestion(session, state.leadId, fieldKey);
      refreshDOM();
    } catch (err) {
      state.saveError = api()?.mapApiError?.(err)?.message || err?.message || 'Erro ao ignorar sugestão.';
      refreshDOM();
    }
  }

  function open(leadId, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const fromHook = state.hooks.findCard?.(leadId);
    const card = opts.card || (fromHook ? { ...fromHook } : null);
    if (!card && !opts.allowWithoutCard) return;
    state.open = true;
    state.leadId = leadId;
    state.card = card || { id: leadId, name: 'Lead' };
    state.detail = null;
    state.qualification = opts.bundle?.qualification || null;
    state.drawerBundle = opts.bundle || null;
    state.layout = opts.layout === 'default' ? 'default' : 'premium';
    state.mountMode = (opts.inline || state.hooks.preferInline) ? 'inline' : 'overlay';
    state.mountSelector = opts.mountSelector || state.hooks.mountSelector || null;
    state.formDraft = {};
    state.activeTab = 'summary';
    state.assignOpen = false;
    state.moveOpen = false;
    state.actionBusy = false;
    state.actionError = '';
    state.actionSuccess = '';
    state.loadError = '';
    state.saveError = '';
    state.saveSuccess = '';
    refreshDOM();
    if (opts.bundle) {
      applyDrawerBundle(opts.bundle);
      const hasFields = Object.keys(opts.bundle.qualification?.fields || {}).length > 0;
      if (!hasFields) {
        void loadLeadData();
      } else {
        refreshDOM();
      }
    } else {
      void loadLeadData();
    }
  }

  function close() {
    state.open = false;
    state.leadId = null;
    state.card = null;
    state.detail = null;
    state.qualification = null;
    state.drawerBundle = null;
    state.layout = 'default';
    state.mountMode = 'overlay';
    state.mountSelector = null;
    state.assignOpen = false;
    state.moveOpen = false;
    state.actionBusy = false;
    state.actionError = '';
    state.actionSuccess = '';
    state.loading = false;
    state.saving = false;
    state.loadError = '';
    state.saveError = '';
    state.saveSuccess = '';
    document.getElementById('eplLeadDrawerBackdrop')?.remove();
    document.getElementById('eplLeadDrawer')?.remove();
    state.hooks.onClose?.();
  }

  function init(hooks) {
    state.hooks = hooks || {};
  }

  window.EngagePipelineLeadDrawer = {
    init,
    open,
    close,
    refresh: refreshDOM,
    isOpen: () => state.open,
  };
})();
