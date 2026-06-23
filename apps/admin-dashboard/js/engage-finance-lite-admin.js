/**
 * Engage Solar — Financeiro Lite (Dashboard, Contas a Pagar, Recorrências, Categorias).
 */
(function () {
  const api = () => window.EngageFinanceLiteApi;

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  };

  const KPI_SVG = {
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  };

  const COLOR_PRESETS = ['#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#fb7185', '#64748b'];

  const state = {
    active: false,
    session: null,
    view: 'dashboard',
    loading: false,
    error: '',
    forbidden: false,
    usingMock: false,
    data: {},
    categories: [],
    modal: null,
    filters: { status: '', categoryId: '', search: '', page: 1, pageSize: 50 },
    dom: {},
  };

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(v) {
    return escapeHtml(v);
  }

  function kpiIcon(name) {
    return KPI_SVG[name] || KPI_SVG.calendar;
  }

  function statusChip(status) {
    const key = String(status || '').toUpperCase();
    const label = api()?.PAYABLE_STATUS_LABELS?.[key] || key || '—';
    const tone = api()?.PAYABLE_STATUS_TONES?.[key] || 'slate';
    return `<span class="efl-status" data-tone="${escapeAttr(tone)}">${escapeHtml(label)}</span>`;
  }

  function categoryChip(cat) {
    if (!cat?.name) return '<span class="efl-muted">—</span>';
    const color = cat.color || '#64748b';
    return `<span class="efl-cat-chip" style="--efl-cat:${escapeAttr(color)}">${escapeHtml(cat.name)}</span>`;
  }

  function renderToolbar() {
    const title = api()?.viewTitle?.(state.view) || 'Financeiro';
    return `
      <header class="efl-toolbar">
        <div class="efl-toolbar-copy">
          <p class="efl-eyebrow">Financeiro · Engage Solar</p>
          <h1 class="efl-title">${escapeHtml(title)}</h1>
        </div>
        <div class="efl-toolbar-actions">
          <button type="button" class="efl-btn efl-btn--outline" id="eflRefreshBtn">${ICONS.refresh} Atualizar</button>
          ${state.view === 'payables' ? `<button type="button" class="efl-btn efl-btn--primary" id="eflNewPayableBtn">${ICONS.plus} Nova conta</button>` : ''}
          ${state.view === 'recurring' ? `<button type="button" class="efl-btn efl-btn--primary" id="eflNewRecurringBtn">${ICONS.plus} Nova recorrência</button>` : ''}
          ${state.view === 'categories' ? `<button type="button" class="efl-btn efl-btn--primary" id="eflNewCategoryBtn">${ICONS.plus} Nova categoria</button>` : ''}
        </div>
      </header>`;
  }

  function renderMockBanner() {
    if (!state.usingMock) return '';
    return '<div class="efl-mock-banner" role="status">Modo demonstração — dados mock (API Financeiro indisponível).</div>';
  }

  function renderForbidden() {
    return `<div class="efl-forbidden" role="alert">
      <strong>Acesso restrito</strong>
      <p>${escapeHtml(api()?.FORBIDDEN_MSG || 'Sem permissão.')}</p>
    </div>`;
  }

  function renderSummaryCards(cards) {
    const data = cards || {};
    return `<div class="efl-kpi-grid">${(api()?.SUMMARY_CARDS || []).map((def) => {
      const value = data[def.key] ?? '0.00';
      const isOverdue = def.key === 'totalOverdue' && Number(value) > 0;
      return `
        <article class="efl-kpi-card${isOverdue ? ' is-alert' : ''}" data-tone="${escapeAttr(def.tone)}">
          <span class="efl-kpi-icon" aria-hidden="true">${kpiIcon(def.icon)}</span>
          <span class="efl-kpi-body">
            <span class="efl-kpi-label">${escapeHtml(def.label)}</span>
            <strong class="efl-kpi-value">${escapeHtml(api()?.formatBRL?.(value))}</strong>
          </span>
        </article>`;
    }).join('')}</div>`;
  }

  function renderUpcomingList(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return '<p class="efl-empty-inline">Nenhuma conta a vencer nos próximos dias.</p>';
    }
    return `<ul class="efl-upcoming-list">${rows.map((item) => `
      <li class="efl-upcoming-item">
        <div class="efl-upcoming-main">
          <strong>${escapeHtml(item.description)}</strong>
          ${categoryChip(item.category)}
        </div>
        <div class="efl-upcoming-meta">
          <span>${escapeHtml(api()?.formatBRL?.(item.amount))}</span>
          <span>${escapeHtml(api()?.formatDate?.(item.dueDate))}</span>
          ${statusChip(item.status)}
        </div>
      </li>`).join('')}</ul>`;
  }

  function renderCategoryBars(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return '<p class="efl-empty-inline">Sem despesas por categoria no período.</p>';
    }
    const max = Math.max(...rows.map((r) => Number(r.amount || 0)), 1);
    return `<div class="efl-cat-bars">${rows.map((row) => {
      const pct = Math.round((Number(row.amount || 0) / max) * 100);
      const color = row.color || '#64748b';
      return `
        <div class="efl-cat-bar-row">
          <div class="efl-cat-bar-head">
            <span class="efl-cat-bar-label" style="--efl-cat:${escapeAttr(color)}">${escapeHtml(row.categoryName)}</span>
            <span class="efl-cat-bar-value">${escapeHtml(api()?.formatBRL?.(row.amount))}</span>
          </div>
          <div class="efl-cat-bar-track"><span style="width:${pct}%;background:${escapeAttr(color)}"></span></div>
        </div>`;
    }).join('')}</div>`;
  }

  function renderDashboard() {
    const d = state.data.dashboard || {};
    return `
      ${renderSummaryCards(d.cards)}
      <div class="efl-dash-grid">
        <section class="efl-card">
          <h3 class="efl-card-title">Próximos vencimentos</h3>
          ${renderUpcomingList(d.upcoming?.items)}
        </section>
        <section class="efl-card">
          <h3 class="efl-card-title">Despesas por categoria</h3>
          ${renderCategoryBars(d.categoryBreakdown?.items)}
        </section>
      </div>`;
  }

  function renderPayablesFilters() {
    const cats = state.categories || [];
    const statusOpts = Object.entries(api()?.PAYABLE_STATUS_LABELS || {}).map(([k, label]) => {
      const sel = state.filters.status === k ? ' selected' : '';
      return `<option value="${escapeAttr(k)}"${sel}>${escapeHtml(label)}</option>`;
    }).join('');
    const catOpts = cats.map((c) => {
      const sel = state.filters.categoryId === c.id ? ' selected' : '';
      return `<option value="${escapeAttr(c.id)}"${sel}>${escapeHtml(c.name)}</option>`;
    }).join('');
    return `
      <div class="efl-filters">
        <label class="efl-search-wrap">${ICONS.search}
          <input type="search" id="eflSearchInput" placeholder="Buscar descrição, fornecedor ou centro…" value="${escapeAttr(state.filters.search)}" />
        </label>
        <select id="eflStatusFilter" class="efl-select" aria-label="Status">
          <option value="">Todos os status</option>${statusOpts}
        </select>
        <select id="eflCategoryFilter" class="efl-select" aria-label="Categoria">
          <option value="">Todas categorias</option>${catOpts}
        </select>
      </div>`;
  }

  function renderPayablesTable() {
    const items = state.data.payables?.items || [];
    if (!items.length && !state.loading) {
      return '<div class="efl-empty">Nenhuma conta encontrada.</div>';
    }
    return `
      <div class="efl-table-wrap">
        <table class="efl-table">
          <thead>
            <tr>
              <th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th>Centro de custo</th>
              <th>Valor</th><th>Vencimento</th><th>Status</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>${items.map((row) => `
            <tr>
              <td>
                <strong>${escapeHtml(row.description)}</strong>
                ${row.recurringRuleId ? '<span class="efl-badge">Recorrente</span>' : ''}
              </td>
              <td>${categoryChip(row.category)}</td>
              <td>${escapeHtml(row.supplier || '—')}</td>
              <td>${escapeHtml(row.costCenter || '—')}</td>
              <td class="efl-amount">${escapeHtml(api()?.formatBRL?.(row.amount))}</td>
              <td>${escapeHtml(api()?.formatDate?.(row.dueDate))}</td>
              <td>${statusChip(row.status)}</td>
              <td class="efl-actions">
                <button type="button" class="efl-btn efl-btn--xs" data-edit-payable="${escapeAttr(row.id)}">Editar</button>
                ${row.status !== 'PAID' ? `<button type="button" class="efl-btn efl-btn--xs efl-btn--success" data-pay-status="${escapeAttr(row.id)}" data-status="PAID">Pagar</button>` : ''}
                ${row.status !== 'CANCELLED' && row.status !== 'PAID' ? `<button type="button" class="efl-btn efl-btn--xs" data-pay-status="${escapeAttr(row.id)}" data-status="CANCELLED">Cancelar</button>` : ''}
                ${row.status === 'PAID' || row.status === 'CANCELLED' ? `<button type="button" class="efl-btn efl-btn--xs" data-pay-status="${escapeAttr(row.id)}" data-status="PENDING">Reabrir</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderRecurringTable() {
    const items = state.data.recurring?.items || [];
    if (!items.length && !state.loading) {
      return '<div class="efl-empty">Nenhuma recorrência cadastrada.</div>';
    }
    return `
      <p class="efl-hint">Ao criar ou editar regras ativas, serão geradas contas futuras para os próximos 90 dias.</p>
      <div class="efl-table-wrap">
        <table class="efl-table">
          <thead>
            <tr>
              <th>Descrição</th><th>Categoria</th><th>Centro de custo</th><th>Valor</th>
              <th>Frequência</th><th>Próxima geração</th><th>Status</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>${items.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.description)}</strong></td>
              <td>${categoryChip(row.category)}</td>
              <td>${escapeHtml(row.costCenter || '—')}</td>
              <td class="efl-amount">${escapeHtml(api()?.formatBRL?.(row.amount))}</td>
              <td>${escapeHtml(api()?.FREQUENCY_LABELS?.[row.frequency] || row.frequency)}</td>
              <td>${escapeHtml(api()?.formatDate?.(row.nextGenerationDate) || '—')}</td>
              <td>${row.active !== false ? '<span class="efl-status" data-tone="green">Ativa</span>' : '<span class="efl-status" data-tone="slate">Inativa</span>'}</td>
              <td class="efl-actions">
                <button type="button" class="efl-btn efl-btn--xs" data-edit-recurring="${escapeAttr(row.id)}">Editar</button>
                ${row.active !== false ? `<button type="button" class="efl-btn efl-btn--xs" data-deactivate-recurring="${escapeAttr(row.id)}">Desativar</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderCategoriesTable() {
    const items = state.data.categories?.items || state.categories || [];
    if (!items.length && !state.loading) {
      return '<div class="efl-empty">Nenhuma categoria cadastrada.</div>';
    }
    return `
      <div class="efl-table-wrap">
        <table class="efl-table">
          <thead><tr><th>Nome</th><th>Cor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${items.map((row) => `
            <tr>
              <td><span class="efl-cat-chip" style="--efl-cat:${escapeAttr(row.color || '#64748b')}">${escapeHtml(row.name)}</span></td>
              <td><span class="efl-color-dot" style="background:${escapeAttr(row.color || '#64748b')}"></span></td>
              <td>${row.active !== false ? '<span class="efl-status" data-tone="green">Ativa</span>' : '<span class="efl-status" data-tone="slate">Inativa</span>'}</td>
              <td class="efl-actions">
                <button type="button" class="efl-btn efl-btn--xs" data-edit-category="${escapeAttr(row.id)}">Editar</button>
                ${row.active !== false ? `<button type="button" class="efl-btn efl-btn--xs" data-deactivate-category="${escapeAttr(row.id)}">Desativar</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderContent() {
    if (state.forbidden) return renderForbidden();
    if (state.loading && !state.data[state.view]) {
      return '<div class="efl-loading">Carregando…</div>';
    }
    if (state.error && !state.data[state.view]) {
      return `<div class="efl-error" role="alert">${escapeHtml(state.error)}</div>`;
    }
    if (state.view === 'dashboard') return renderDashboard();
    if (state.view === 'payables') return `${renderPayablesFilters()}${renderPayablesTable()}`;
    if (state.view === 'recurring') return renderRecurringTable();
    if (state.view === 'categories') return renderCategoriesTable();
    return '';
  }

  function categoryOptions(selectedId) {
    return (state.categories || []).filter((c) => c.active !== false).map((c) => {
      const sel = c.id === selectedId ? ' selected' : '';
      return `<option value="${escapeAttr(c.id)}"${sel}>${escapeHtml(c.name)}</option>`;
    }).join('');
  }

  function colorPickerHtml(selected) {
    return COLOR_PRESETS.map((c) => {
      const active = c === selected ? ' is-active' : '';
      return `<button type="button" class="efl-color-pick${active}" data-color="${escapeAttr(c)}" style="background:${escapeAttr(c)}" aria-label="Cor ${escapeAttr(c)}"></button>`;
    }).join('');
  }

  function renderModal() {
    const m = state.modal;
    if (!m) return '';
    const hidden = '';
    if (m.type === 'payable') {
      const p = m.item || {};
      return `
        <div class="efl-modal-scrim" id="eflModalScrim">
          <div class="efl-modal" role="dialog" aria-labelledby="eflModalTitle">
            <header class="efl-modal-head"><h2 id="eflModalTitle">${m.mode === 'edit' ? 'Editar conta' : 'Nova conta avulsa'}</h2>
              <button type="button" class="efl-modal-close" id="eflModalClose" aria-label="Fechar">×</button></header>
            <form id="eflPayableForm" class="efl-form">
              <label>Descrição<input name="description" required value="${escapeAttr(p.description || '')}" /></label>
              <label>Categoria<select name="categoryId" required><option value="">Selecione…</option>${categoryOptions(p.categoryId)}</select></label>
              <label>Fornecedor<input name="supplier" value="${escapeAttr(p.supplier || '')}" placeholder="ex.: OpenAI, Hostinger" /></label>
              <label>Centro de custo<input name="costCenter" value="${escapeAttr(p.costCenter || '')}" placeholder="ex.: Engage Solar, Operação" /></label>
              <label>Valor (R$)<input name="amount" required inputmode="decimal" value="${escapeAttr(p.amount || '')}" placeholder="500,00" /></label>
              <label>Vencimento<input name="dueDate" type="date" required value="${escapeAttr((p.dueDate || '').slice(0, 10))}" /></label>
              <label>Observações<textarea name="notes" rows="2">${escapeHtml(p.notes || '')}</textarea></label>
              <footer class="efl-modal-foot">
                <button type="button" class="efl-btn efl-btn--ghost" id="eflModalCancel">Cancelar</button>
                <button type="submit" class="efl-btn efl-btn--primary">Salvar</button>
              </footer>
            </form>
          </div>
        </div>`;
    }
    if (m.type === 'recurring') {
      const r = m.item || {};
      const freqOpts = Object.entries(api()?.FREQUENCY_LABELS || {}).map(([k, label]) => {
        const sel = (r.frequency || 'MONTHLY') === k ? ' selected' : '';
        return `<option value="${escapeAttr(k)}"${sel}>${escapeHtml(label)}</option>`;
      }).join('');
      return `
        <div class="efl-modal-scrim" id="eflModalScrim">
          <div class="efl-modal" role="dialog" aria-labelledby="eflModalTitle">
            <header class="efl-modal-head"><h2 id="eflModalTitle">${m.mode === 'edit' ? 'Editar recorrência' : 'Nova recorrência'}</h2>
              <button type="button" class="efl-modal-close" id="eflModalClose" aria-label="Fechar">×</button></header>
            <form id="eflRecurringForm" class="efl-form">
              <p class="efl-hint">Serão geradas contas futuras para os próximos 90 dias.</p>
              <label>Descrição<input name="description" required value="${escapeAttr(r.description || '')}" /></label>
              <label>Categoria<select name="categoryId" required><option value="">Selecione…</option>${categoryOptions(r.categoryId)}</select></label>
              <label>Fornecedor<input name="supplier" value="${escapeAttr(r.supplier || '')}" /></label>
              <label>Centro de custo<input name="costCenter" value="${escapeAttr(r.costCenter || '')}" /></label>
              <label>Valor (R$)<input name="amount" required inputmode="decimal" value="${escapeAttr(r.amount || '')}" /></label>
              <label>Frequência<select name="frequency" required>${freqOpts}</select></label>
              <label>Início<input name="startDate" type="date" required value="${escapeAttr((r.startDate || '').slice(0, 10))}" /></label>
              <label>Fim (opcional)<input name="endDate" type="date" value="${escapeAttr((r.endDate || '').slice(0, 10))}" /></label>
              <label>Observações<textarea name="notes" rows="2">${escapeHtml(r.notes || '')}</textarea></label>
              <footer class="efl-modal-foot">
                <button type="button" class="efl-btn efl-btn--ghost" id="eflModalCancel">Cancelar</button>
                <button type="submit" class="efl-btn efl-btn--primary">Salvar</button>
              </footer>
            </form>
          </div>
        </div>`;
    }
    if (m.type === 'category') {
      const c = m.item || {};
      const color = c.color || COLOR_PRESETS[0];
      return `
        <div class="efl-modal-scrim" id="eflModalScrim">
          <div class="efl-modal efl-modal--sm" role="dialog" aria-labelledby="eflModalTitle">
            <header class="efl-modal-head"><h2 id="eflModalTitle">${m.mode === 'edit' ? 'Editar categoria' : 'Nova categoria'}</h2>
              <button type="button" class="efl-modal-close" id="eflModalClose" aria-label="Fechar">×</button></header>
            <form id="eflCategoryForm" class="efl-form">
              <label>Nome<input name="name" required value="${escapeAttr(c.name || '')}" placeholder="ex.: Software, Infraestrutura" /></label>
              <fieldset class="efl-color-field"><legend>Cor</legend>
                <input type="hidden" name="color" id="eflCategoryColor" value="${escapeAttr(color)}" />
                <div class="efl-color-picks" id="eflColorPicks">${colorPickerHtml(color)}</div>
              </fieldset>
              <footer class="efl-modal-foot">
                <button type="button" class="efl-btn efl-btn--ghost" id="eflModalCancel">Cancelar</button>
                <button type="submit" class="efl-btn efl-btn--primary">Salvar</button>
              </footer>
            </form>
          </div>
        </div>`;
    }
    return hidden;
  }

  function render() {
    if (!state.dom.root) return;
    state.dom.root.innerHTML = `
      <div class="efl-shell">
        ${renderToolbar()}
        ${renderMockBanner()}
        <div class="efl-body">${renderContent()}</div>
      </div>
      ${renderModal()}`;
    bindDom();
  }

  async function loadCategories() {
    try {
      const res = await api()?.listCategories?.(state.session, true);
      state.categories = res?.items || [];
      if (res?.mock) state.usingMock = true;
    } catch (_) {
      state.categories = [];
    }
  }

  async function loadData() {
    if (!state.active) return;
    state.loading = true;
    state.error = '';
    try {
      await loadCategories();
      if (state.view === 'dashboard') {
        const [summary, upcoming, categoryBreakdown] = await Promise.all([
          api().getDashboardSummary(state.session),
          api().getUpcoming(state.session),
          api().getCategoryBreakdown(state.session),
        ]);
        state.usingMock = !!(summary?.mock || upcoming?.mock || categoryBreakdown?.mock);
        state.data.dashboard = { cards: summary?.cards || {}, upcoming, categoryBreakdown };
      } else if (state.view === 'payables') {
        const res = await api().listPayables(state.session, {
          status: state.filters.status || undefined,
          categoryId: state.filters.categoryId || undefined,
          search: state.filters.search || undefined,
          page: state.filters.page,
          pageSize: state.filters.pageSize,
        });
        state.usingMock = !!res?.mock;
        state.data.payables = res;
      } else if (state.view === 'recurring') {
        const res = await api().listRecurring(state.session);
        state.usingMock = !!res?.mock;
        state.data.recurring = res;
      } else if (state.view === 'categories') {
        const res = await api().listCategories(state.session, true);
        state.usingMock = !!res?.mock;
        state.data.categories = res;
      }
    } catch (err) {
      if (err?.financeForbidden) {
        state.forbidden = true;
      } else {
        state.error = err?.message || 'Falha ao carregar Financeiro.';
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  function closeModal() {
    state.modal = null;
    render();
  }

  function openPayableModal(mode, item) {
    state.modal = { type: 'payable', mode, item: item || {} };
    render();
  }

  function openRecurringModal(mode, item) {
    state.modal = { type: 'recurring', mode, item: item || {} };
    render();
  }

  function openCategoryModal(mode, item) {
    state.modal = { type: 'category', mode, item: item || {} };
    render();
  }

  function formToObject(form) {
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = String(v).trim(); });
    return data;
  }

  function bindModal() {
    state.dom.root.querySelector('#eflModalClose')?.addEventListener('click', closeModal);
    state.dom.root.querySelector('#eflModalCancel')?.addEventListener('click', closeModal);
    state.dom.root.querySelector('#eflModalScrim')?.addEventListener('click', (e) => {
      if (e.target?.id === 'eflModalScrim') closeModal();
    });
    state.dom.root.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = state.dom.root.querySelector('#eflCategoryColor');
        if (input) input.value = btn.dataset.color;
        state.dom.root.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });

    state.dom.root.querySelector('#eflPayableForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = formToObject(e.target);
      const body = {
        description: raw.description,
        categoryId: raw.categoryId,
        supplier: raw.supplier || null,
        costCenter: raw.costCenter || null,
        amount: api().toApiAmount(raw.amount),
        dueDate: raw.dueDate,
        notes: raw.notes || null,
      };
      if (!body.amount) return;
      try {
        if (state.modal?.mode === 'edit' && state.modal?.item?.id) {
          await api().updatePayable(state.session, state.modal.item.id, body);
        } else {
          await api().createPayable(state.session, body);
        }
        closeModal();
        await loadData();
      } catch (err) {
        alert(err?.message || 'Falha ao salvar conta.');
      }
    });

    state.dom.root.querySelector('#eflRecurringForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = formToObject(e.target);
      const body = {
        description: raw.description,
        categoryId: raw.categoryId,
        supplier: raw.supplier || null,
        costCenter: raw.costCenter || null,
        amount: api().toApiAmount(raw.amount),
        frequency: raw.frequency,
        startDate: raw.startDate,
        endDate: raw.endDate || null,
        notes: raw.notes || null,
      };
      if (!body.amount) return;
      try {
        if (state.modal?.mode === 'edit' && state.modal?.item?.id) {
          await api().updateRecurring(state.session, state.modal.item.id, body);
        } else {
          await api().createRecurring(state.session, body);
        }
        closeModal();
        await loadData();
      } catch (err) {
        alert(err?.message || 'Falha ao salvar recorrência.');
      }
    });

    state.dom.root.querySelector('#eflCategoryForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = formToObject(e.target);
      const body = { name: raw.name, color: raw.color || COLOR_PRESETS[0], active: true };
      try {
        if (state.modal?.mode === 'edit' && state.modal?.item?.id) {
          await api().updateCategory(state.session, state.modal.item.id, body);
        } else {
          await api().createCategory(state.session, body);
        }
        closeModal();
        await loadData();
      } catch (err) {
        alert(err?.message || 'Falha ao salvar categoria.');
      }
    });
  }

  function bindDom() {
    state.dom.root.querySelector('#eflRefreshBtn')?.addEventListener('click', () => loadData());
    state.dom.root.querySelector('#eflNewPayableBtn')?.addEventListener('click', () => openPayableModal('create'));
    state.dom.root.querySelector('#eflNewRecurringBtn')?.addEventListener('click', () => openRecurringModal('create'));
    state.dom.root.querySelector('#eflNewCategoryBtn')?.addEventListener('click', () => openCategoryModal('create'));

    state.dom.root.querySelector('#eflSearchInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        state.filters.search = e.target.value.trim();
        state.filters.page = 1;
        loadData();
      }
    });
    state.dom.root.querySelector('#eflStatusFilter')?.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      state.filters.page = 1;
      loadData();
    });
    state.dom.root.querySelector('#eflCategoryFilter')?.addEventListener('change', (e) => {
      state.filters.categoryId = e.target.value;
      state.filters.page = 1;
      loadData();
    });

    state.dom.root.querySelectorAll('[data-edit-payable]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = (state.data.payables?.items || []).find((p) => p.id === btn.dataset.editPayable);
        openPayableModal('edit', item);
      });
    });
    state.dom.root.querySelectorAll('[data-pay-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api().patchPayableStatus(state.session, btn.dataset.payStatus, btn.dataset.status);
          await loadData();
        } catch (err) {
          alert(err?.message || 'Falha ao alterar status.');
        }
      });
    });
    state.dom.root.querySelectorAll('[data-edit-recurring]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = (state.data.recurring?.items || []).find((r) => r.id === btn.dataset.editRecurring);
        openRecurringModal('edit', item);
      });
    });
    state.dom.root.querySelectorAll('[data-deactivate-recurring]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Desativar esta recorrência? Contas já geradas serão preservadas.')) return;
        try {
          await api().deleteRecurring(state.session, btn.dataset.deactivateRecurring);
          await loadData();
        } catch (err) {
          alert(err?.message || 'Falha ao desativar.');
        }
      });
    });
    state.dom.root.querySelectorAll('[data-edit-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const items = state.data.categories?.items || state.categories || [];
        const item = items.find((c) => c.id === btn.dataset.editCategory);
        openCategoryModal('edit', item);
      });
    });
    state.dom.root.querySelectorAll('[data-deactivate-category]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Desativar esta categoria?')) return;
        try {
          await api().deleteCategory(state.session, btn.dataset.deactivateCategory);
          await loadData();
        } catch (err) {
          alert(err?.message || 'Falha ao desativar.');
        }
      });
    });

    bindModal();
  }

  function mount() {
    state.dom.root = document.getElementById('adminEngageFinanceLiteRoot');
    return !!state.dom.root;
  }

  function activate(session, panelId) {
    if (!mount()) return;
    state.session = session || state.session;
    state.active = true;
    state.forbidden = false;
    state.view = api()?.panelToView?.(panelId) || 'dashboard';
    void loadData();
  }

  function deactivate() {
    state.active = false;
    state.modal = null;
    if (state.dom.root) state.dom.root.innerHTML = '';
  }

  window.ReservaAiEngageFinanceLiteAdmin = {
    activate,
    deactivate,
    reload: loadData,
  };
})();
