/**
 * Contact Hub — painel simples de audiências (Fase 3).
 */
(function () {
  let session = null;
  let open = false;
  let loading = false;
  let error = '';
  let listPayload = { items: [], total: 0 };
  let detail = null;
  let selectedId = null;

  function api() {
    return window.EngageContactHubApi;
  }

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
      return new Date(iso).toLocaleString('pt-BR');
    } catch (_e) {
      return '—';
    }
  }

  function labelType(value) {
    const key = String(value || '').toUpperCase();
    if (key === 'DYNAMIC') return 'Dinâmica';
    if (key === 'STATIC') return 'Estática';
    return value || '—';
  }

  function renderList() {
    const items = Array.isArray(listPayload.items) ? listPayload.items : [];
    if (!items.length) {
      return '<p class="ec-mc-muted">Nenhuma audiência encontrada.</p>';
    }
    const rows = items.map((item) => {
      const id = escapeHtml(item.id);
      const active = selectedId === item.id ? ' is-active' : '';
      return `
        <tr class="${active}">
          <td><button type="button" class="ech-phone-link" data-ech-audience="${id}">${escapeHtml(item.name || '—')}</button></td>
          <td>${escapeHtml(labelType(item.type || item.audienceType))}</td>
          <td>${escapeHtml(String(item.memberCount ?? item.members ?? '—'))}</td>
          <td class="ec-mc-muted">${escapeHtml(formatDateTime(item.updatedAt || item.createdAt))}</td>
        </tr>`;
    }).join('');
    return `
      <div class="ech-table-wrap" style="max-height:280px;">
        <table class="ech-table" aria-label="Audiências">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Membros</th><th>Actualizado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderDetail() {
    if (!detail) return '';
    return `
      <section class="ech-section" style="margin-top:1rem;">
        <h3>${escapeHtml(detail.name || 'Audiência')}</h3>
        <dl class="ech-dl">
          <div><dt>Tipo</dt><dd>${escapeHtml(labelType(detail.type || detail.audienceType))}</dd></div>
          <div><dt>Membros</dt><dd>${escapeHtml(String(detail.memberCount ?? detail.members ?? '—'))}</dd></div>
          <div><dt>Criada</dt><dd>${escapeHtml(formatDateTime(detail.createdAt))}</dd></div>
          <div><dt>ID</dt><dd class="ec-mc-mono">${escapeHtml(detail.id || '—')}</dd></div>
        </dl>
        <button type="button" class="ec-mc-btn ec-mc-btn--primary" id="echAudienceUseCampaign">Usar em campanha</button>
      </section>`;
  }

  function render() {
    const modal = $('engageContactAudiencesModal');
    if (!modal) return;
    modal.hidden = !open;
    if (!open) return;

    const body = $('engageContactAudiencesBody');
    const err = $('engageContactAudiencesError');
    if (body) {
      body.innerHTML = loading
        ? '<p class="ec-mc-muted">Carregando audiências…</p>'
        : `${renderList()}${renderDetail()}`;
    }
    if (err) {
      err.hidden = !error;
      err.textContent = error || '';
    }

    body?.querySelectorAll('[data-ech-audience]').forEach((btn) => {
      btn.addEventListener('click', () => void loadDetail(btn.dataset.echAudience));
    });
    $('echAudienceUseCampaign')?.addEventListener('click', () => {
      close();
      document.querySelector('[data-es-nav="campanhas"]')?.click();
    });
  }

  async function loadList() {
    loading = true;
    error = '';
    render();
    try {
      listPayload = await api().listAudiences(session, { limit: 100 });
      if (!Array.isArray(listPayload.items)) {
        listPayload.items = Array.isArray(listPayload) ? listPayload : [];
      }
    } catch (err) {
      listPayload = { items: [], total: 0 };
      error = api().mapApiError(err).message;
    } finally {
      loading = false;
      render();
    }
  }

  async function loadDetail(audienceId) {
    if (!audienceId) return;
    selectedId = audienceId;
    loading = true;
    error = '';
    render();
    try {
      detail = await api().getAudience(session, audienceId);
    } catch (err) {
      detail = null;
      error = api().mapApiError(err).message;
    } finally {
      loading = false;
      render();
    }
  }

  async function openPanel(nextSession, audienceId) {
    session = nextSession;
    open = true;
    selectedId = audienceId || null;
    detail = null;
    await loadList();
    if (audienceId) await loadDetail(audienceId);
  }

  function close() {
    open = false;
    render();
  }

  function bindModal() {
    const modal = $('engageContactAudiencesModal');
    if (!modal || modal.dataset.bound === '1') return;
    modal.querySelector('[data-ech-audiences-close]')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    modal.dataset.bound = '1';
  }

  window.EngageContactAudiences = {
    open: openPanel,
    close,
    bindModal,
  };
})();
