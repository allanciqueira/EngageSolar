/**
 * Engage Config → Contact Hub (lista + detalhe).
 */
(function () {
  const api = () => window.EngageContactHubApi;
  const PAGE_SIZE = 50;

  let session = null;
  let active = false;
  let loading = false;
  let busy = false;
  let view = 'list';
  let selectedId = null;
  let listPayload = { items: [], total: 0, page: 1, attributeKeys: [] };
  let crmStats = null;
  let detail = null;
  let campaignHistory = null;
  let filters = { q: '', city: '' };
  let page = 1;
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

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('pt-BR');
    } catch (_e) {
      return '—';
    }
  }

  function formatMoney(value) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return escapeHtml(String(value));
  }

  function chipHtml(label, tone) {
    const text = String(label || '').trim() ? escapeHtml(label) : '—';
    return `<span class="ec-mc-chip" data-tone="${escapeHtml(tone)}">${text}</span>`;
  }

  function contactStatusChip(item) {
    if (item?.optOut) return chipHtml('Opt-out', 'danger');
    if (item?.blocked) return chipHtml('Bloqueado', 'warn');
    if (item?.active === false) return chipHtml('Inactivo', 'muted');
    return chipHtml('Activo', 'success');
  }

  function formatPhone(item) {
    return item?.phone || item?.normalizedPhone || '—';
  }

  function attrValue(item, key) {
    const attrs = item?.attributes;
    if (!attrs || !key) return '—';
    if (Array.isArray(attrs)) {
      const row = attrs.find((a) => a?.key === key);
      return formatAttrDisplay(key, row?.value);
    }
    return formatAttrDisplay(key, attrs[key]);
  }

  function formatAttrDisplay(key, value) {
    if (value == null || value === '') return '—';
    if (key === 'loss_category') {
      return `<span class="ech-loss-badge">${escapeHtml(api().labelLossCategory(value))}</span>`;
    }
    if (key === 'next_contact_at') {
      return escapeHtml(formatDate(value));
    }
    return escapeHtml(String(value));
  }

  function setFeedback(message, tone = 'neutral') {
    const el = $('engageContactHubFeedback');
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
    const el = $('engageContactHubLoading');
    if (el) el.hidden = !on;
  }

  function canManage() {
    return api()?.canManageContacts?.(session) || false;
  }

  function renderCrmBanner() {
    const el = $('engageContactHubCrmBanner');
    if (!el) return;
    if (view !== 'list' || !crmStats) {
      el.hidden = true;
      return;
    }
    const s = crmStats;
    const text = [
      `<strong>${escapeHtml(String(s.customersTotal ?? 0))}</strong> clientes CRM`,
      `<strong>${escapeHtml(String(s.customersWithPhone ?? 0))}</strong> com telefone`,
      `<strong>${escapeHtml(String(s.linkedCustomers ?? 0))}</strong> sincronizados`,
      `<strong>${escapeHtml(String(s.toImport ?? 0))}</strong> por importar`,
      s.coveragePct != null ? `Cobertura <strong>${escapeHtml(String(s.coveragePct))}%</strong>` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const toImport = Number(s.toImport || 0);
    const importDisabled = !canManage() || toImport === 0 || busy ? ' disabled' : '';
    el.hidden = false;
    const csvBtn = canManage()
      ? `<button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageContactHubImportCsvBannerBtn"${busy ? ' disabled' : ''}>Importar CSV</button>`
      : '';
    el.innerHTML = `
      <p class="ech-crm-stats">${text}</p>
      <div class="ech-crm-actions">
        ${csvBtn}
        <button type="button" class="ec-mc-btn ec-mc-btn--primary" id="engageContactHubImportBtn"${importDisabled}>Importar do CRM</button>
      </div>`;
    el.querySelector('#engageContactHubImportBtn')?.addEventListener('click', onImportCrm);
    el.querySelector('#engageContactHubImportCsvBannerBtn')?.addEventListener('click', () => {
      if (!canManage() || busy) return;
      window.EngageContactImport?.open?.(session, {
        onComplete: async () => {
          setFeedback('Import CSV concluído. Audiência criada.', 'success');
          await Promise.all([loadCrmStats(), loadList()]);
        },
      });
    });
  }

  function renderListFilters() {
    const el = $('engageContactHubFilters');
    if (!el) return;
    if (view !== 'list') {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      <div class="ech-filters">
        <input type="search" id="engageContactHubSearch" placeholder="Nome, telefone ou e-mail" value="${escapeAttr(filters.q)}" />
        <input type="text" id="engageContactHubCity" placeholder="Filtrar por cidade" value="${escapeAttr(filters.city)}" />
        <button type="button" class="ec-mc-btn ec-mc-btn--primary" id="engageContactHubSearchBtn">Pesquisar</button>
      </div>
      <p class="ech-count" id="engageContactHubCount">${escapeHtml(String(listPayload.total ?? 0))} contacto(s)</p>`;
    el.querySelector('#engageContactHubSearchBtn')?.addEventListener('click', onSearch);
    el.querySelector('#engageContactHubSearch')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onSearch();
    });
    el.querySelector('#engageContactHubCity')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onSearch();
    });
  }

  function renderListTable() {
    const empty = $('engageContactHubEmpty');
    const wrap = $('engageContactHubTableWrap');
    const tbody = $('engageContactHubTableBody');
    const thead = $('engageContactHubTableHead');
    const pagination = $('engageContactHubPagination');
    const items = Array.isArray(listPayload.items) ? listPayload.items : [];
    const attrKeys = api().sortAttributeKeys(listPayload.attributeKeys || []);

    if (view !== 'list') {
      if (empty) empty.hidden = true;
      if (wrap) wrap.hidden = true;
      if (pagination) pagination.hidden = true;
      return;
    }

    if (items.length === 0 && !loading) {
      if (empty) {
        empty.hidden = false;
        empty.querySelector('p')?.replaceChildren?.();
      }
      if (wrap) wrap.hidden = true;
      if (pagination) pagination.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (wrap) wrap.hidden = false;

    if (thead) {
      const attrHeaders = attrKeys.map((k) => `<th scope="col">${escapeHtml(api().labelAttribute(k))}</th>`).join('');
      const actionsHead = canManage() ? '<th scope="col">Ações</th>' : '';
      thead.innerHTML = `
        <tr>
          <th scope="col">Telefone</th>
          <th scope="col">Nome</th>
          <th scope="col">Origem</th>
          <th scope="col">Estado</th>
          ${attrHeaders}
          <th scope="col">Actualizado</th>
          ${actionsHead}
        </tr>`;
    }

    if (tbody) {
      tbody.innerHTML = items
        .map((item) => {
          const id = escapeAttr(item.id);
          const phone = escapeHtml(formatPhone(item));
          const attrCells = attrKeys.map((k) => `<td>${attrValue(item, k)}</td>`).join('');
          const actions = canManage()
            ? `<td><button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-ech-open="${id}">Ver</button></td>`
            : '';
          return `
            <tr>
              <td><button type="button" class="ech-phone-link" data-ech-open="${id}">${phone}</button></td>
              <td>${escapeHtml(item.name || '—')}</td>
              <td>${escapeHtml(api().labelSourceType(item.sourceType))}</td>
              <td>${contactStatusChip(item)}</td>
              ${attrCells}
              <td class="ec-mc-muted">${escapeHtml(formatDateTime(item.updatedAt))}</td>
              ${actions}
            </tr>`;
        })
        .join('');
    }

    const total = Number(listPayload.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pagination) {
      pagination.hidden = totalPages <= 1;
      pagination.innerHTML = `
        <button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-ech-page="prev"${page <= 1 ? ' disabled' : ''}>Anterior</button>
        <span>Página ${page} de ${totalPages}</span>
        <button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-ech-page="next"${page >= totalPages ? ' disabled' : ''}>Seguinte</button>`;
    }
  }

  function highlightAttrKeys() {
    return new Set(['loss_category', 'next_contact_at', 'loss_category_source', 'reply_disposition_kind']);
  }

  function renderDetail() {
    const el = $('engageContactHubDetail');
    if (!el) return;
    if (view !== 'detail' || !detail) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    const sync = detail.crmSync || {};
    const crmData = detail.crmData || {};
    const canPromote =
      canManage() &&
      ['no_crm_customer', 'linked_by_phone'].includes(String(sync.syncStatus || ''));
    const hasCustomer = Boolean(sync.customerId);
    const attrs = Array.isArray(detail.attributes) ? [...detail.attributes] : [];
    attrs.sort((a, b) => {
      const hi = highlightAttrKeys();
      const ah = hi.has(a.key) ? 0 : 1;
      const bh = hi.has(b.key) ? 0 : 1;
      if (ah !== bh) return ah - bh;
      return String(a.key).localeCompare(String(b.key), 'pt-BR');
    });
    const events = (Array.isArray(detail.events) ? detail.events : []).slice(0, 15);
    const campaigns = Array.isArray(campaignHistory?.items) ? campaignHistory.items : [];
    const lastCampaign = campaignHistory?.lastCampaign;

    el.innerHTML = `
      <div class="ech-detail">
        <div class="ech-detail-head">
          <button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageContactHubBack">← Voltar</button>
          <div class="ech-detail-actions">
            ${canPromote ? '<button type="button" class="ec-mc-btn ec-mc-btn--primary" id="engageContactHubPromote">Promover para Cliente</button>' : ''}
            ${hasCustomer ? '<button type="button" class="ec-mc-btn ec-mc-btn--ghost" id="engageContactHubOpenClientes">Abrir Clientes</button>' : ''}
          </div>
        </div>

        <section class="ech-section">
          <h3>Identidade</h3>
          <dl class="ech-dl">
            <div><dt>Telefone</dt><dd>${escapeHtml(formatPhone(detail))}</dd></div>
            <div><dt>Nome</dt><dd>${escapeHtml(detail.name || '—')}</dd></div>
            <div><dt>E-mail</dt><dd>${escapeHtml(detail.email || '—')}</dd></div>
            <div><dt>Origem</dt><dd>${escapeHtml(api().labelSourceType(detail.sourceType))}${detail.sourceReferenceId ? ` · ${escapeHtml(detail.sourceReferenceId)}` : ''}</dd></div>
            <div><dt>Estado</dt><dd>${contactStatusChip(detail)}</dd></div>
          </dl>
        </section>

        <section class="ech-section">
          <h3>Sincronização CRM</h3>
          <dl class="ech-dl">
            <div><dt>Cliente CRM</dt><dd>${escapeHtml(sync.customerName || '—')}</dd></div>
            <div><dt>ID cliente</dt><dd class="ec-mc-mono">${escapeHtml(sync.customerId || '—')}</dd></div>
            <div><dt>Criado em</dt><dd>${escapeHtml(formatDateTime(sync.customerCreatedAt))}</dd></div>
            <div><dt>Estado sync</dt><dd>${escapeHtml(api().labelSyncStatus(sync.syncStatus))}</dd></div>
            <div><dt>Última sync</dt><dd>${escapeHtml(formatDateTime(sync.lastSyncAt))}</dd></div>
            <div><dt>Origem</dt><dd>${escapeHtml(sync.source || '—')}</dd></div>
          </dl>
          ${detail.linkedCrm ? `<p class="ec-mc-muted">Registo ligado: ${escapeHtml(detail.linkedCrm.type || '')} ${escapeHtml(detail.linkedCrm.label || detail.linkedCrm.id || '')}</p>` : ''}
        </section>

        <section class="ech-section">
          <h3>Dados CRM</h3>
          <dl class="ech-dl">
            <div><dt>Cliente</dt><dd>${escapeHtml(crmData.customer?.name || '—')} (${escapeHtml(crmData.customer?.status || '—')})</dd></div>
            <div><dt>Conversas</dt><dd>${escapeHtml(String(crmData.conversations?.count ?? '—'))}${crmData.conversations?.lastDate ? ` · última ${escapeHtml(formatDateTime(crmData.conversations.lastDate))}` : ''}</dd></div>
            <div><dt>Lead</dt><dd>${escapeHtml(crmData.leads?.status || '—')}${crmData.leads?.source ? ` · ${escapeHtml(crmData.leads.source)}` : ''}</dd></div>
            <div><dt>Proposta</dt><dd>${formatMoney(crmData.proposals?.value)} · ${escapeHtml(crmData.proposals?.status || '—')}</dd></div>
          </dl>
        </section>

        <section class="ech-section">
          <h3>Atributos</h3>
          ${attrs.length ? `
            <table class="ech-attrs-table" aria-label="Atributos">
              <thead><tr><th>Chave</th><th>Valor</th></tr></thead>
              <tbody>
                ${attrs.map((row) => `
                  <tr data-highlight="${highlightAttrKeys().has(row.key) ? 'true' : 'false'}">
                    <td>${escapeHtml(api().labelAttribute(row.key))}</td>
                    <td>${formatAttrDisplay(row.key, row.value)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>` : '<p class="ec-mc-muted">Sem atributos.</p>'}
        </section>

        ${events.length ? `
        <section class="ech-section">
          <h3>Eventos recentes</h3>
          <ul class="ec-mc-muted" style="margin:0;padding-left:1.1rem;font-size:0.8rem;">
            ${events.map((ev) => `<li>${escapeHtml(ev.title || ev.eventType || 'Evento')} · ${escapeHtml(ev.eventType || '')} · ${escapeHtml(formatDateTime(ev.occurredAt))}</li>`).join('')}
          </ul>
        </section>` : ''}

        <section class="ech-section">
          <h3>Campanhas Engage</h3>
          ${lastCampaign ? `<p>Última: <strong>${escapeHtml(lastCampaign.campaignName || '—')}</strong> · ${escapeHtml(lastCampaign.engagementLabel || '—')}</p>` : ''}
          ${campaigns.length ? `
            <div class="ech-table-wrap" style="max-height:240px;">
              <table class="ech-table" aria-label="Histórico campanhas">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Estado</th>
                    <th>Enviado</th>
                    <th>Entregue</th>
                    <th>Respondeu</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${campaigns.map((row) => `
                    <tr>
                      <td>${escapeHtml(row.campaignName || '—')}</td>
                      <td>${escapeHtml(row.recipientStatus || row.campaignStatus || '—')}</td>
                      <td>${escapeHtml(formatDateTime(row.sentAt))}</td>
                      <td>${escapeHtml(formatDateTime(row.deliveredAt))}</td>
                      <td>${escapeHtml(formatDateTime(row.repliedAt))}</td>
                      <td>${row.campaignId ? `<button type="button" class="ec-mc-btn ec-mc-btn--ghost" data-ech-campaign="${escapeAttr(row.campaignId)}">Abrir</button>` : '—'}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>` : '<p class="ec-mc-muted">Sem histórico de campanhas.</p>'}
        </section>
      </div>`;

    el.querySelector('#engageContactHubBack')?.addEventListener('click', () => {
      view = 'list';
      selectedId = null;
      detail = null;
      campaignHistory = null;
      render();
    });
    el.querySelector('#engageContactHubPromote')?.addEventListener('click', onPromote);
    el.querySelector('#engageContactHubOpenClientes')?.addEventListener('click', () => {
      document.querySelector('[data-es-nav="clientes"]')?.click();
    });
    el.querySelectorAll('[data-ech-campaign]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const campaignId = btn.dataset.echCampaign;
        document.querySelector('[data-es-nav="campanhas"]')?.click();
        window.ReservaAiEngageCampaignsAdmin?.selectCampaign?.(campaignId);
      });
    });
  }

  function render() {
    renderHeadActions();
    renderCrmBanner();
    renderListFilters();
    renderListTable();
    renderDetail();
    const count = $('engageContactHubCount');
    if (count) count.textContent = `${listPayload.total ?? 0} contacto(s)`;
  }

  async function loadCrmStats() {
    try {
      crmStats = await api().getCrmSyncStats(session);
    } catch (err) {
      crmStats = null;
      const mapped = api().mapApiError(err);
      if (mapped.redirectLogin) return;
    }
  }

  async function loadList() {
    setLoading(true);
    error = '';
    try {
      const params = { page, limit: PAGE_SIZE };
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.city.trim()) params.city = filters.city.trim();
      listPayload = await api().listContacts(session, params);
      if (!Array.isArray(listPayload.items)) listPayload.items = [];
    } catch (err) {
      listPayload = { items: [], total: 0, page: 1, attributeKeys: [] };
      const mapped = api().mapApiError(err);
      error = mapped.message;
      setFeedback(mapped.message, 'danger');
    } finally {
      setLoading(false);
      render();
    }
  }

  async function openDetail(contactId) {
    if (!contactId) return;
    view = 'detail';
    selectedId = contactId;
    setLoading(true);
    setFeedback('');
    try {
      const [contact, history] = await Promise.all([
        api().getContact(session, contactId),
        api().getCampaignHistory(session, contactId, { limit: 10 }),
      ]);
      detail = contact;
      campaignHistory = history;
    } catch (err) {
      view = 'list';
      selectedId = null;
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      setLoading(false);
      render();
    }
  }

  async function onSearch() {
    filters = {
      q: $('engageContactHubSearch')?.value || '',
      city: $('engageContactHubCity')?.value || '',
    };
    page = 1;
    await loadList();
  }

  async function onImportCrm() {
    if (!canManage() || busy) return;
    busy = true;
    renderCrmBanner();
    setFeedback('Importando contactos do CRM…', 'neutral');
    try {
      await api().importCrm(session);
      setFeedback('Importação concluída.', 'success');
      await Promise.all([loadCrmStats(), loadList()]);
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      busy = false;
      render();
    }
  }

  async function onPromote() {
    if (!selectedId || !canManage() || busy) return;
    busy = true;
    setFeedback('A promover contacto…', 'neutral');
    try {
      const result = await api().promoteToCustomer(session, selectedId);
      const status = result?.outcome?.status || result?.status;
      const messages = {
        created: 'Cliente criado em Clientes (CRM).',
        updated: 'Cliente existente actualizado e vinculado.',
        linked: 'Contacto vinculado ao cliente existente.',
        skipped: `Ignorado: ${result?.outcome?.reason || 'motivo desconhecido'}`,
      };
      setFeedback(messages[status] || 'Promoção concluída.', status === 'skipped' ? 'warn' : 'success');
      await openDetail(selectedId);
      await loadCrmStats();
    } catch (err) {
      const mapped = api().mapApiError(err);
      setFeedback(mapped.message, 'danger');
    } finally {
      busy = false;
    }
  }

  function renderHeadActions() {
    const links = $('engageContactHubLinks');
    if (!links) return;
    links.hidden = !canManage();
  }

  function bindHeadActions() {
    const root = $('engageContactHubRoot');
    if (!root || root.dataset.echHeadBound === '1') return;
    window.EngageContactImport?.bindModal?.();
    window.EngageContactAudiences?.bindModal?.();

    $('engageContactHubImportCsvBtn')?.addEventListener('click', () => {
      if (!canManage()) return;
      window.EngageContactImport?.open?.(session, {
        onComplete: async () => {
          setFeedback('Import CSV concluído. Audiência criada.', 'success');
          await Promise.all([loadCrmStats(), loadList()]);
        },
      });
    });

    $('engageContactHubAudiencesBtn')?.addEventListener('click', () => {
      window.EngageContactAudiences?.open?.(session);
    });
    root.dataset.echHeadBound = '1';
  }

  function bindTableEvents() {
    const root = $('engageContactHubRoot');
    if (!root || root.dataset.echBound === '1') return;
    root.addEventListener('click', (event) => {
      const openBtn = event.target.closest('[data-ech-open]');
      if (openBtn) {
        openDetail(openBtn.dataset.echOpen);
        return;
      }
      const pageBtn = event.target.closest('[data-ech-page]');
      if (pageBtn) {
        const dir = pageBtn.dataset.echPage;
        if (dir === 'prev' && page > 1) page -= 1;
        if (dir === 'next') page += 1;
        loadList();
      }
    });
    root.dataset.echBound = '1';
  }

  async function activate(nextSession) {
    active = true;
    if (window.ReservaPermissions?.enrichSessionWithOperatorMe) {
      session = await window.ReservaPermissions.enrichSessionWithOperatorMe(nextSession || session);
    } else {
      session = nextSession || session;
    }
    view = 'list';
    selectedId = null;
    detail = null;
    campaignHistory = null;
    page = 1;
    filters = { q: '', city: '' };
    error = '';
    setFeedback('');
    bindTableEvents();
    bindHeadActions();
    const lead = $('engageContactHubLead');
    if (lead) {
      lead.textContent = canManage()
        ? 'Contactos permanentes Engage — atributos, importação CSV/CRM e base para campanhas WhatsApp.'
        : 'Contactos Engage (somente leitura para operadores).';
    }
    setLoading(true);
    await Promise.all([loadCrmStats(), loadList()]);
    setLoading(false);
    render();
    if (error) setFeedback(error, 'danger');
  }

  function deactivate() {
    active = false;
    setLoading(false);
    setFeedback('');
  }

  window.EngageContactHub = { activate, deactivate };
})();
