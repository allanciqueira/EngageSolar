/**
 * Feriados e datas especiais — CRUD via GET/POST/PATCH/DELETE /special-dates
 * Registado por config-admin.js (attach).
 */
(function () {
  let api = null;

  function getState() {
    return api?.state;
  }

  function normalizeDateValue(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return raw.slice(0, 10);
  }

  function normalizeSpecialDateRow(row) {
    if (!row || typeof row !== 'object') return null;
    return {
      id: String(row.id || '').trim(),
      unitId: row.unitId != null && String(row.unitId).trim() ? String(row.unitId).trim() : null,
      date: normalizeDateValue(row.date),
      isRecurringYearly: row.isRecurringYearly === true,
      isClosed: row.isClosed === true,
      startTime: row.startTime ? String(row.startTime).trim() : null,
      endTime: row.endTime ? String(row.endTime).trim() : null,
      reason: row.reason != null ? String(row.reason).trim() : '',
    };
  }

  function branchNameById(unitId) {
    const state = getState();
    if (!unitId) return 'Empresa inteira';
    const branch = (state?.branches || []).find((b) => b.id === unitId);
    return branch?.name || 'Unidade';
  }

  function sortedBranches() {
    const state = getState();
    return [...(state?.branches || [])]
      .filter((b) => String(b?.name || '').trim())
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  }

  function formatDatePt(dateYmd) {
    if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return dateYmd || '—';
    const [y, m, d] = dateYmd.split('-');
    return `${d}/${m}/${y}`;
  }

  function compareTime(a, b) {
    const toMin = (t) => {
      const parts = String(t || '').split(':');
      return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
    };
    return toMin(a) - toMin(b);
  }

  function resetSpecialDatesForm() {
    const state = getState();
    if (!state) return;
    state.specialDatesEditingId = '';
    const dom = api.dom;
    if (dom.specialDatesUnit) dom.specialDatesUnit.value = '';
    if (dom.specialDatesDate) dom.specialDatesDate.value = '';
    if (dom.specialDatesKind) dom.specialDatesKind.value = 'closed';
    if (dom.specialDatesStart) dom.specialDatesStart.value = '08:00';
    if (dom.specialDatesEnd) dom.specialDatesEnd.value = '18:00';
    if (dom.specialDatesReason) dom.specialDatesReason.value = '';
    if (dom.specialDatesRecurring) dom.specialDatesRecurring.checked = false;
    applySpecialDatesKindUi();
    updateSpecialDatesSubmitLabel();
  }

  function applySpecialDatesKindUi() {
    const dom = api.dom;
    if (!dom.specialDatesWindowFields) return;
    const isClosed = dom.specialDatesKind?.value === 'closed';
    dom.specialDatesWindowFields.hidden = isClosed;
    dom.specialDatesWindowFields.classList.toggle('is-hidden', isClosed);
  }

  function updateSpecialDatesSubmitLabel() {
    const state = getState();
    const dom = api.dom;
    if (!dom.specialDatesSubmit) return;
    dom.specialDatesSubmit.textContent = state?.specialDatesEditingId ? 'Salvar edição' : 'Adicionar';
    if (dom.specialDatesCancelEdit) {
      dom.specialDatesCancelEdit.hidden = !state?.specialDatesEditingId;
    }
  }

  function applySpecialDatesReadonlyState() {
    const canManage = api.canManageSelectedTenant?.() !== false;
    const dom = api.dom;
    const controls = [
      dom.specialDatesUnit,
      dom.specialDatesDate,
      dom.specialDatesKind,
      dom.specialDatesStart,
      dom.specialDatesEnd,
      dom.specialDatesReason,
      dom.specialDatesRecurring,
      dom.specialDatesSubmit,
      dom.specialDatesYearFilter,
      dom.specialDatesSearch,
    ].filter(Boolean);
    controls.forEach((el) => {
      el.disabled = !canManage;
    });
    if (dom.specialDatesReadonlyNote) {
      dom.specialDatesReadonlyNote.hidden = canManage;
    }
    if (dom.specialDatesFormCard) {
      dom.specialDatesFormCard.classList.toggle('is-readonly', !canManage);
    }
  }

  function renderSpecialDatesUnitOptions() {
    const dom = api.dom;
    if (!dom.specialDatesUnit) return;
    const options = ['<option value="">Empresa inteira (todas as unidades)</option>']
      .concat(sortedBranches().map((b) => `<option value="${api.escapeHtml(b.id)}">${api.escapeHtml(b.name)}</option>`));
    dom.specialDatesUnit.innerHTML = options.join('');
  }

  function getFilteredSpecialDates() {
    const state = getState();
    let rows = Array.isArray(state?.specialDates) ? state.specialDates.slice() : [];
    const year = String(state?.specialDatesYearFilter || '').trim();
    if (year) {
      rows = rows.filter((row) => row.date.startsWith(`${year}-`));
    }
    const q = String(state?.specialDatesSearch || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) => {
        const unitLabel = branchNameById(row.unitId).toLowerCase();
        const typeLabel = row.isClosed ? 'fechado' : 'horário especial';
        const reason = String(row.reason || '').toLowerCase();
        return unitLabel.includes(q) || typeLabel.includes(q) || reason.includes(q) || row.date.includes(q);
      });
    }
    return rows.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      const aUnit = a.unitId || '';
      const bUnit = b.unitId || '';
      return aUnit.localeCompare(bUnit);
    });
  }

  function renderSpecialDatesYearFilterOptions() {
    const dom = api.dom;
    if (!dom.specialDatesYearFilter) return;
    const state = getState();
    const years = new Set((state?.specialDates || []).map((row) => row.date.slice(0, 4)).filter(Boolean));
    const sorted = Array.from(years).sort((a, b) => b.localeCompare(a));
    const current = state?.specialDatesYearFilter || '';
    dom.specialDatesYearFilter.innerHTML = [
      '<option value="">Todos os anos</option>',
      ...sorted.map((y) => `<option value="${api.escapeHtml(y)}">${api.escapeHtml(y)}</option>`),
    ].join('');
    dom.specialDatesYearFilter.value = sorted.includes(current) ? current : '';
  }

  function renderSpecialDatesList() {
    const dom = api.dom;
    if (!dom.specialDatesList) return;
    const state = getState();
    if (state?.specialDatesLoading) {
      dom.specialDatesList.innerHTML = '<p class="operator-special-dates-empty">Carregando regras…</p>';
      return;
    }
    const rows = getFilteredSpecialDates();
    if (!rows.length) {
      dom.specialDatesList.innerHTML = '<p class="operator-special-dates-empty">Nenhuma data especial cadastrada ainda.</p>';
      return;
    }
    const canManage = api.canManageSelectedTenant?.() !== false;
    dom.specialDatesList.innerHTML = rows.map((row) => {
      const typeLabel = row.isClosed
        ? 'Fechado'
        : `Horário especial (${row.startTime || '—'} – ${row.endTime || '—'})`;
      return `
        <article class="operator-special-dates-item" data-special-date-id="${api.escapeHtml(row.id)}">
          <div class="operator-special-dates-item-main">
            <div class="operator-special-dates-item-date">${api.escapeHtml(formatDatePt(row.date))}</div>
            <div class="operator-special-dates-item-badges">
              <span class="operator-special-dates-badge">${api.escapeHtml(branchNameById(row.unitId))}</span>
              ${row.isRecurringYearly ? '<span class="operator-special-dates-badge is-recurring">Recorrente</span>' : ''}
              <span class="operator-special-dates-badge is-type">${api.escapeHtml(typeLabel)}</span>
            </div>
            ${row.reason ? `<p class="operator-special-dates-item-reason">${api.escapeHtml(row.reason)}</p>` : ''}
          </div>
          ${canManage ? `
            <div class="operator-special-dates-item-actions">
              <button type="button" class="pro-btn-ghost operator-special-dates-edit" data-special-date-edit="${api.escapeHtml(row.id)}">Editar</button>
              <button type="button" class="pro-btn-danger operator-special-dates-delete" data-special-date-delete="${api.escapeHtml(row.id)}">Remover</button>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');
  }

  function fillFormFromRow(row) {
    const dom = api.dom;
    const state = getState();
    if (!row || !dom.specialDatesDate) return;
    state.specialDatesEditingId = row.id;
    if (dom.specialDatesUnit) dom.specialDatesUnit.value = row.unitId || '';
    dom.specialDatesDate.value = row.date;
    if (dom.specialDatesKind) dom.specialDatesKind.value = row.isClosed ? 'closed' : 'window';
    if (dom.specialDatesStart) dom.specialDatesStart.value = row.startTime || '08:00';
    if (dom.specialDatesEnd) dom.specialDatesEnd.value = row.endTime || '18:00';
    if (dom.specialDatesReason) dom.specialDatesReason.value = row.reason || '';
    if (dom.specialDatesRecurring) dom.specialDatesRecurring.checked = row.isRecurringYearly === true;
    applySpecialDatesKindUi();
    updateSpecialDatesSubmitLabel();
  }

  function collectSpecialDateBody() {
    const dom = api.dom;
    const date = String(dom.specialDatesDate?.value || '').trim();
    const kind = dom.specialDatesKind?.value === 'window' ? 'window' : 'closed';
    const unitRaw = String(dom.specialDatesUnit?.value || '').trim();
    const body = {
      unitId: unitRaw || null,
      date,
      isRecurringYearly: dom.specialDatesRecurring?.checked === true,
      isClosed: kind === 'closed',
      reason: String(dom.specialDatesReason?.value || '').trim().slice(0, 180) || null,
    };
    if (kind === 'window') {
      body.startTime = String(dom.specialDatesStart?.value || '').trim();
      body.endTime = String(dom.specialDatesEnd?.value || '').trim();
    }
    return body;
  }

  function validateSpecialDateBody(body) {
    if (!body.date) {
      return 'Informe a data.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return 'Data inválida.';
    }
    if (!body.isClosed) {
      if (!body.startTime || !body.endTime) {
        return 'Informe hora início e hora fim para horário especial.';
      }
      if (compareTime(body.endTime, body.startTime) <= 0) {
        return 'Hora fim deve ser depois da hora início.';
      }
    }
    return '';
  }

  async function loadSpecialDates() {
    const state = getState();
    if (!state?.selectedTenantId) {
      state.specialDates = [];
      renderSpecialDatesList();
      return;
    }
    state.specialDatesLoading = true;
    renderSpecialDatesList();
    try {
      const payload = await api.requestExternal(`/special-dates${api.tenantQuery()}`);
      const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
      state.specialDates = rows.map(normalizeSpecialDateRow).filter(Boolean);
    } catch (error) {
      state.specialDates = [];
      api.setStatus(error?.message || 'Não foi possível carregar feriados e datas especiais.', 'warn');
    } finally {
      state.specialDatesLoading = false;
      renderSpecialDatesYearFilterOptions();
      renderSpecialDatesList();
    }
  }

  async function saveSpecialDate() {
    if (api.canManageSelectedTenant?.() === false) {
      api.setStatus('Apenas administradores podem gerir estas regras.', 'warn');
      return;
    }
    const body = collectSpecialDateBody();
    const validation = validateSpecialDateBody(body);
    if (validation) {
      api.setStatus(validation, 'warn');
      return;
    }
    const state = getState();
    const isEdit = Boolean(state.specialDatesEditingId);
    api.setStatus(isEdit ? 'Salvando edição…' : 'Adicionando data especial…', 'neutral');
    try {
      if (isEdit) {
        await api.requestExternal(`/special-dates/${encodeURIComponent(state.specialDatesEditingId)}${api.tenantQuery()}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        await api.recordAudit?.(
          'SPECIAL_DATE_UPDATED',
          'special-date',
          state.specialDatesEditingId,
          'Data especial atualizada.',
          { tenantId: state.selectedTenantId, date: body.date },
        );
      } else {
        await api.requestExternal(`/special-dates${api.tenantQuery()}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        await api.recordAudit?.(
          'SPECIAL_DATE_CREATED',
          'special-date',
          state.selectedTenantId,
          'Data especial criada.',
          { tenantId: state.selectedTenantId, date: body.date },
        );
      }
      resetSpecialDatesForm();
      await loadSpecialDates();
      api.setStatus(isEdit ? 'Data especial atualizada.' : 'Data especial adicionada.', 'success');
    } catch (error) {
      api.setStatus(error?.message || 'Não foi possível guardar a data especial.', 'warn');
    }
  }

  async function deleteSpecialDate(id) {
    if (!id || api.canManageSelectedTenant?.() === false) return;
    const state = getState();
    const row = state.specialDates.find((r) => r.id === id);
    const label = row ? formatDatePt(row.date) : 'esta data';
    if (!window.confirm(`Remover a regra de ${label}?`)) return;
    api.setStatus('Removendo data especial…', 'neutral');
    try {
      await api.requestExternal(`/special-dates/${encodeURIComponent(id)}${api.tenantQuery()}`, {
        method: 'DELETE',
      });
      if (state.specialDatesEditingId === id) {
        resetSpecialDatesForm();
      }
      await loadSpecialDates();
      api.setStatus('Data especial removida.', 'success');
    } catch (error) {
      api.setStatus(error?.message || 'Não foi possível remover a data especial.', 'warn');
    }
  }

  function bindEvents() {
    const dom = api.dom;
    dom.specialDatesKind?.addEventListener('change', applySpecialDatesKindUi);
    dom.specialDatesSubmit?.addEventListener('click', () => { void saveSpecialDate(); });
    dom.specialDatesCancelEdit?.addEventListener('click', resetSpecialDatesForm);
    dom.specialDatesYearFilter?.addEventListener('change', () => {
      const state = getState();
      state.specialDatesYearFilter = dom.specialDatesYearFilter.value;
      renderSpecialDatesList();
    });
    dom.specialDatesSearch?.addEventListener('input', () => {
      const state = getState();
      state.specialDatesSearch = dom.specialDatesSearch.value;
      renderSpecialDatesList();
    });
    dom.specialDatesList?.addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-special-date-edit]');
      const deleteBtn = event.target.closest('[data-special-date-delete]');
      if (editBtn) {
        const id = editBtn.getAttribute('data-special-date-edit');
        const row = getState().specialDates.find((r) => r.id === id);
        if (row) fillFormFromRow(row);
        return;
      }
      if (deleteBtn) {
        void deleteSpecialDate(deleteBtn.getAttribute('data-special-date-delete'));
      }
    });
  }

  function mountDom() {
    const root = document.querySelector('#operatorSpecialDatesRoot');
    if (!root) return false;
    api.dom = {
      ...api.dom,
      specialDatesUnit: document.querySelector('#operatorSpecialDatesUnit'),
      specialDatesDate: document.querySelector('#operatorSpecialDatesDate'),
      specialDatesKind: document.querySelector('#operatorSpecialDatesKind'),
      specialDatesStart: document.querySelector('#operatorSpecialDatesStart'),
      specialDatesEnd: document.querySelector('#operatorSpecialDatesEnd'),
      specialDatesReason: document.querySelector('#operatorSpecialDatesReason'),
      specialDatesRecurring: document.querySelector('#operatorSpecialDatesRecurring'),
      specialDatesSubmit: document.querySelector('#operatorSpecialDatesSubmit'),
      specialDatesCancelEdit: document.querySelector('#operatorSpecialDatesCancelEdit'),
      specialDatesWindowFields: document.querySelector('#operatorSpecialDatesWindowFields'),
      specialDatesYearFilter: document.querySelector('#operatorSpecialDatesYearFilter'),
      specialDatesSearch: document.querySelector('#operatorSpecialDatesSearch'),
      specialDatesList: document.querySelector('#operatorSpecialDatesList'),
      specialDatesReadonlyNote: document.querySelector('#operatorSpecialDatesReadonlyNote'),
      specialDatesFormCard: document.querySelector('#operatorSpecialDatesFormCard'),
    };
    return true;
  }

  window.ReservaAiOperatorSpecialDates = {
    attach(context) {
      api = { dom: {}, ...context };
      mountDom();
      bindEvents();
    },
    resetForm: resetSpecialDatesForm,
    renderUnitOptions: renderSpecialDatesUnitOptions,
    renderAll() {
      renderSpecialDatesUnitOptions();
      renderSpecialDatesYearFilterOptions();
      renderSpecialDatesList();
      applySpecialDatesReadonlyState();
      applySpecialDatesKindUi();
      updateSpecialDatesSubmitLabel();
    },
    async onTabActivated() {
      renderSpecialDatesUnitOptions();
      applySpecialDatesReadonlyState();
      await loadSpecialDates();
    },
    async onWorkspaceLoaded() {
      const state = getState();
      if (state) {
        state.specialDates = [];
        state.specialDatesEditingId = '';
        state.specialDatesYearFilter = '';
        state.specialDatesSearch = '';
      }
      resetSpecialDatesForm();
      if (state?.activeTab === 'feriados') {
        await loadSpecialDates();
      }
    },
  };
})();
