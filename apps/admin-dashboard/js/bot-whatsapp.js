(function () {
  function getMessagingApiBaseUrl() {
    return `${window.RESERVAAI_MESSAGING_API_BASE_URL || '/api/messaging'}`.replace(/\/$/, '');
  }
  const TENANT_STORAGE_KEY = 'reservaai.messaging.tenant';
  const LOGIN_TENANT_STORAGE_KEY = 'reservaai.login.tenantId';

  const ICONS = {
    check: '<svg viewBox="0 0 16 11" width="14" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 6 5.2 10 14.8 0.8"/></svg>',
    doubleCheck: '<svg viewBox="0 0 18 11" width="14" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 6 5.2 10 11.8 1.6"/><polyline points="5.6 6 9.6 10 17 0.8"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    windowOpen: '<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    windowLock: '<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  };

  const WINDOW_CLOSING_THRESHOLD_MS = 2 * 60 * 60 * 1000;
  const WINDOW_LIST_HINT_THRESHOLD_MS = 12 * 60 * 60 * 1000;

  const FILE_MAX_BYTES = 15 * 1024 * 1024;
  const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
  const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  const COMPOSER_EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '👍', '🙏', '❤️', '🔥', '✅', '🎉', '👏', '💪', '🤝', '📎', '📞', '📅', '💰'];
  const ALLOWED_FILE_TYPES = {
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    xls: ['application/vnd.ms-excel'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    mp4: ['video/mp4'],
  };

  const QUICK_TEMPLATES = {
    schedule: 'Posso te sugerir alguns horários disponíveis ainda nesta semana?',
    book: 'Vou confirmar seu agendamento. Pode me dizer o serviço, profissional e horário?',
    charge: 'Vou gerar o link de pagamento via PIX/cartão para você. Posso prosseguir?',
    package: 'Tenho um pacote especial que pode te interessar. Quer que eu envie as opções?',
  };

  const state = {
    mounted: false,
    active: false,
    initialized: false,
    authService: null,
    session: null,
    me: null,
    tenantOptions: [],
    selectedTenantId: '',
    conversations: [],
    selectedConversationId: null,
    messages: [],
    search: '',
    activeFilter: 'all',
    botEnabled: true,
    busy: false,
    isSendingText: false,
    isUploadingFile: false,
    isUploadingAudio: false,
    isReacting: false,
    pendingFile: null,
    pendingAudioBlob: null,
    pendingAudioUrl: null,
    audioRecorder: null,
    audioRecordingStream: null,
    audioRecordingStartedAt: 0,
    mediaObjectUrls: {},
    emojiPanelOpen: false,
    pollerId: null,
    windowTickerId: null,
    lastMessageStatus: 'Aguardando seleção de conversa.',
    dom: {},
  };

  function normalizeMessageContent(message) {
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content;
    }

    return 'Mensagem sem conteúdo de texto.';
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }

  function writeStorage(key, value) {
    try {
      if (!value) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function resolveSessionTenantId(session) {
    if (!session || typeof session !== 'object') {
      return '';
    }
    return String(
      session.activeTenantId
      || session.tenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || '',
    ).trim();
  }

  function readPreferredLoginTenantId() {
    const fromAuth = state.authService?.getPreferredLoginTenantId?.()
      || window.ReservaAiAuth?.getPreferredLoginTenantId?.();
    if (fromAuth) {
      return String(fromAuth).trim();
    }
    return String(readStorage(LOGIN_TENANT_STORAGE_KEY) || '').trim();
  }

  function resolveInitialMessagingTenantId(session, tenantOptions) {
    const options = Array.isArray(tenantOptions) ? tenantOptions : [];
    const ids = new Set(options.map((tenant) => String(tenant?.id || '').trim()).filter(Boolean));
    const pick = (candidate) => {
      const id = String(candidate || '').trim();
      return id && ids.has(id) ? id : '';
    };
    return pick(resolveSessionTenantId(session))
      || pick(readPreferredLoginTenantId())
      || pick(readStorage(TENANT_STORAGE_KEY))
      || pick(options[0]?.id);
  }

  function syncSelectedTenantFromSession(session, options = {}) {
    const { persist = true, render = false } = options;
    const tenantOptions = state.tenantOptions.length ? state.tenantOptions : [];
    const nextId = resolveInitialMessagingTenantId(session || state.session, tenantOptions);
    if (!nextId) {
      return false;
    }
    const changed = state.selectedTenantId !== nextId;
    state.selectedTenantId = nextId;
    if (persist) {
      writeStorage(TENANT_STORAGE_KEY, nextId);
    }
    if (render || changed) {
      renderTenantOptions();
    }
    return changed;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPhone(phone) {
    const raw = String(phone || '').trim();
    if (!raw) {
      return 'Sem telefone';
    }

    if (raw.toLowerCase().startsWith('lid:')) {
      return raw;
    }

    const digits = raw.replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
      return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
    }

    if (digits.length === 11 && digits[2] === '9') {
      return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
    }

    if (digits.length === 12 && digits.startsWith('55')) {
      return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }

    if (digits.length === 10) {
      return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    return raw;
  }

  function hashHue(input) {
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = input.charCodeAt(index) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
  }

  function avatarGradient(seed) {
    const hue = hashHue(seed || 'reservaai');
    return `linear-gradient(135deg, hsl(${hue}, 64%, 52%), hsl(${(hue + 42) % 360}, 58%, 42%))`;
  }

  function conversationTitle(conversation) {
    return conversation.contactProfileName?.trim() || formatPhone(conversation.phone);
  }

  function conversationInitials(conversation) {
    const source = conversation.contactProfileName?.trim() || formatPhone(conversation.phone);
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatChatListTime(value) {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return formatTime(value);
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    }

    const sameYear = date.getFullYear() === today.getFullYear();
    return sameYear
      ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function formatDateLabel(value) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hoje';
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    }

    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function windowIsOpen(expiresAt) {
    return Boolean(expiresAt) && new Date(expiresAt) > new Date();
  }

  function formatDuration(ms) {
    const safe = Math.max(0, Math.abs(ms));
    const totalSeconds = Math.floor(safe / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;
    if (days >= 1) {
      return hours > 0 ? `${days}d${hours}h` : `${days}d`;
    }
    if (totalHours >= 1) {
      return minutes > 0 ? `${totalHours}h${minutes}m` : `${totalHours}h`;
    }
    if (totalMinutes >= 1) {
      return `${totalMinutes}m`;
    }
    return '<1m';
  }

  function formatWindowStatus(expiresAt) {
    if (!expiresAt) {
      return {
        isOpen: false,
        tone: 'closed',
        label: 'Janela fechada',
        listLabel: 'fechada',
        crmLabel: 'Fechada',
        warningTitle: 'Janela fechada',
        warningHint: 'Só é possível enviar um template aprovado pela Meta (HSM).',
        expiresInMs: -Infinity,
      };
    }
    const expires = new Date(expiresAt).getTime();
    if (Number.isNaN(expires)) {
      return {
        isOpen: false,
        tone: 'closed',
        label: 'Janela fechada',
        listLabel: 'fechada',
        crmLabel: 'Fechada',
        warningTitle: 'Janela fechada',
        warningHint: 'Só é possível enviar um template aprovado pela Meta (HSM).',
        expiresInMs: -Infinity,
      };
    }
    const diff = expires - Date.now();
    if (diff <= 0) {
      const closedFor = formatDuration(diff);
      return {
        isOpen: false,
        tone: 'closed',
        label: closedFor === '<1m' ? 'Janela fechada agora' : `Janela fechada há ${closedFor}`,
        listLabel: 'fechada',
        crmLabel: closedFor === '<1m' ? 'Fechada agora' : `Fechada há ${closedFor}`,
        warningTitle: closedFor === '<1m' ? 'Janela fechada' : `Janela fechada há ${closedFor}`,
        warningHint: 'Só é possível enviar um template aprovado pela Meta (HSM).',
        expiresInMs: diff,
      };
    }
    const remaining = formatDuration(diff);
    if (diff <= WINDOW_CLOSING_THRESHOLD_MS) {
      return {
        isOpen: true,
        tone: 'closing',
        label: `Janela fecha em ${remaining}`,
        listLabel: remaining,
        crmLabel: `Fecha em ${remaining}`,
        warningTitle: `Janela fecha em ${remaining}`,
        warningHint: 'Envie agora ou prepare um template aprovado (HSM) para depois do prazo.',
        expiresInMs: diff,
      };
    }
    return {
      isOpen: true,
      tone: 'open',
      label: `Janela aberta · expira em ${remaining}`,
      listLabel: diff <= WINDOW_LIST_HINT_THRESHOLD_MS ? remaining : '',
      crmLabel: `Aberta · ${remaining}`,
      warningTitle: '',
      warningHint: '',
      expiresInMs: diff,
    };
  }

  function getCurrentToken() {
    return state.authService?.getAccessToken?.() || state.session?.externalAccessToken || '';
  }

  async function requestExternal(path, options = {}) {
    const token = getCurrentToken();
    if (!token) {
      state.authService?.redirectToLogin?.('token_required');
      throw new Error('Sessão autenticada indisponível.');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);

    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (options.body !== undefined && !isFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const base = getMessagingApiBaseUrl();
    const isSameOrigin =
      base.startsWith('/')
      || (typeof window !== 'undefined'
        && window.location.protocol.startsWith('http')
        && base.startsWith(window.location.origin));

    const response = await fetch(`${base}${path}`, {
      ...options,
      headers,
      credentials: isSameOrigin ? 'include' : 'omit',
      mode: isSameOrigin ? 'same-origin' : 'cors',
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');

    if (response.status === 401) {
      state.authService?.clearSession?.();
      state.authService?.redirectToLogin?.('token_required');
      throw new Error('Sessão de integração expirada.');
    }

    if (!response.ok) {
      throw window.EngageUserMessages?.buildHttpError
        ? window.EngageUserMessages.buildHttpError(response.status, payload, { context: 'whatsapp' })
        : new Error('Não foi possível completar a ação no WhatsApp.');
    }

    return payload;
  }

  function setSyncMessage(message, tone) {
    if (!state.dom.sync) {
      return;
    }

    state.dom.sync.textContent = message;
    state.dom.sync.dataset.tone = tone || 'neutral';
  }

  async function recordAudit(actionType, entityType, entityId, description, details) {
    await window.ReservaAiAdminAudit?.record?.({
      sourceModule: 'mensageria',
      actionType,
      entityType,
      entityId,
      description,
      details,
    });
  }

  function formatUserError(error, context = 'whatsapp') {
    return window.EngageUserMessages?.formatCatchError
      ? window.EngageUserMessages.formatCatchError(error, { context })
      : String(error?.message || error || 'Não foi possível completar a ação no WhatsApp.');
  }

  function setError(message) {
    if (!state.dom.error) {
      return;
    }

    if (!message) {
      state.dom.error.hidden = true;
      state.dom.error.textContent = '';
      return;
    }

    state.dom.error.hidden = false;
    state.dom.error.textContent = message;
  }

  function getSelectedConversation() {
    return state.conversations.find((c) => c.id === state.selectedConversationId) || null;
  }

  function composerWindowIsOpen() {
    const conversation = getSelectedConversation();
    return !conversation || windowIsOpen(conversation.windowExpiresAt);
  }

  function guardComposerWindow() {
    const conversation = getSelectedConversation();
    if (conversation && !windowIsOpen(conversation.windowExpiresAt)) {
      const status = formatWindowStatus(conversation.windowExpiresAt);
      setError(`${status.warningTitle}. Só é possível enviar um template aprovado pela Meta (HSM).`);
      applyWindowState();
      return false;
    }
    return true;
  }

  function messageDisplayText(message) {
    const display = message?.displayContent;
    if (typeof display === 'string' && display.trim()) {
      return display;
    }
    return normalizeMessageContent(message);
  }

  function formatFileSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function validateSelectedFile(file) {
    if (!file) {
      return 'Nenhum arquivo selecionado.';
    }
    if (file.size > FILE_MAX_BYTES) {
      return `Arquivo muito grande (máx. ${formatFileSize(FILE_MAX_BYTES)}).`;
    }
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const allowedMimes = ALLOWED_FILE_TYPES[ext];
    if (!allowedMimes) {
      return 'Tipo de arquivo não permitido. Use PDF, Office, JPG, PNG, WEBP ou MP4.';
    }
    const mime = String(file.type || '').toLowerCase();
    if (mime && !allowedMimes.includes(mime)) {
      return 'O tipo MIME do arquivo não corresponde à extensão.';
    }
    return '';
  }

  async function loadMessageMediaBlob(messageId) {
    const token = getCurrentToken();
    if (!token || !state.selectedTenantId || !messageId) {
      throw new Error('Não foi possível carregar a mídia.');
    }
    const url = `${externalApiBaseUrl}/messages/${encodeURIComponent(messageId)}/media?tenantId=${encodeURIComponent(state.selectedTenantId)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
      mode: 'cors',
    });
    if (response.status === 401) {
      state.authService?.clearSession?.();
      state.authService?.redirectToLogin?.('token_required');
      throw new Error('Sessão de integração expirada.');
    }
    if (!response.ok) {
      throw new Error(`Mídia indisponível (${response.status}).`);
    }
    return response.blob();
  }

  function revokePendingAudioUrl() {
    if (state.pendingAudioUrl) {
      URL.revokeObjectURL(state.pendingAudioUrl);
      state.pendingAudioUrl = null;
    }
  }

  function clearPendingFile() {
    if (state.pendingFile?.previewUrl) {
      URL.revokeObjectURL(state.pendingFile.previewUrl);
    }
    state.pendingFile = null;
    if (state.dom.attachPreview) state.dom.attachPreview.hidden = true;
    if (state.dom.attachPreviewMain) state.dom.attachPreviewMain.innerHTML = '';
    if (state.dom.attachCaption) state.dom.attachCaption.value = '';
    if (state.dom.fileInput) state.dom.fileInput.value = '';
  }

  function clearPendingAudio() {
    revokePendingAudioUrl();
    state.pendingAudioBlob = null;
    if (state.dom.audioPreview) state.dom.audioPreview.hidden = true;
    if (state.dom.audioPreviewLabel) state.dom.audioPreviewLabel.textContent = 'Gravando…';
    if (state.dom.audioPreviewPlayer) {
      state.dom.audioPreviewPlayer.hidden = true;
      state.dom.audioPreviewPlayer.removeAttribute('src');
    }
    if (state.dom.audioSend) state.dom.audioSend.hidden = true;
  }

  async function stopAudioRecording() {
    const recorder = state.audioRecorder;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }
    await new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.stop();
    });
    state.audioRecordingStream?.getTracks?.().forEach((track) => track.stop());
    state.audioRecordingStream = null;
    state.audioRecorder = null;
  }

  function renderReactionsRow(reactions) {
    if (!Array.isArray(reactions) || !reactions.length) {
      return '';
    }
    const items = reactions.map((reaction) => (
      `<span class="whats-pro-reaction-chip" title="${escapeHtml(reaction.source || '')}">${escapeHtml(reaction.emoji || '')}</span>`
    )).join('');
    return `<div class="whats-pro-bubble-reactions">${items}</div>`;
  }

  function renderInboundReactBar(messageId) {
    if (!composerWindowIsOpen()) {
      return '';
    }
    const buttons = QUICK_REACTION_EMOJIS.map((emoji) => (
      `<button type="button" class="whats-pro-react-btn" data-react-message-id="${escapeHtml(messageId)}" data-react-emoji="${escapeHtml(emoji)}" aria-label="Reagir ${escapeHtml(emoji)}">${emoji}</button>`
    )).join('');
    return `<div class="whats-pro-react-bar" role="toolbar" aria-label="Reagir à mensagem">${buttons}</div>`;
  }

  function renderMessageBody(message) {
    const text = messageDisplayText(message);
    const safeText = escapeHtml(text).replace(/\n/g, '<br />');

    if (message.contactPayload?.formattedName) {
      const phone = message.contactPayload.phones?.[0]?.phone || '';
      return `
        <div class="whats-pro-bubble-contact">
          <span class="whats-pro-bubble-contact-icon" aria-hidden="true">👤</span>
          <div>
            <strong>${escapeHtml(message.contactPayload.formattedName)}</strong>
            <span>${escapeHtml(formatPhone(phone))}</span>
          </div>
        </div>
        ${safeText ? `<div class="whats-pro-bubble-text">${safeText}</div>` : ''}`;
    }

    const kind = message.mediaKind;
    if (!kind) {
      return `<div class="whats-pro-bubble-text">${safeText}</div>`;
    }

    const fileName = escapeHtml(message.mediaFileName || 'arquivo');
    let mediaInner = `<span class="whats-pro-media-loading">Carregando mídia…</span>`;
    if (kind === 'image') {
      mediaInner = `<img class="whats-pro-media-image" alt="${fileName}" loading="lazy" />`;
    } else if (kind === 'video') {
      mediaInner = `<video class="whats-pro-media-video" controls preload="metadata"></video>`;
    } else if (kind === 'audio') {
      mediaInner = `<audio class="whats-pro-media-audio" controls preload="metadata"></audio>`;
    } else {
      mediaInner = `
        <span class="whats-pro-media-doc-icon" aria-hidden="true">📄</span>
        <span class="whats-pro-media-doc-name">${fileName}</span>
        <a class="whats-pro-media-doc-link" href="#" data-media-open>Abrir</a>`;
    }

    const caption = text && !/^\[(Imagem|Documento|Vídeo|Áudio|Audio):/i.test(text)
      ? `<div class="whats-pro-bubble-text">${safeText}</div>`
      : '';

    return `
      <div class="whats-pro-bubble-media" data-media-message-id="${escapeHtml(message.id)}" data-media-kind="${escapeHtml(kind)}">
        ${mediaInner}
      </div>
      ${caption}`;
  }

  function applyMediaToSlot(slot, objectUrl, kind) {
    if (!slot || !objectUrl) return;
    const loading = slot.querySelector('.whats-pro-media-loading');
    if (loading) loading.remove();

    if (kind === 'image') {
      let img = slot.querySelector('.whats-pro-media-image');
      if (!img) {
        img = document.createElement('img');
        img.className = 'whats-pro-media-image';
        img.loading = 'lazy';
        slot.appendChild(img);
      }
      img.src = objectUrl;
      img.alt = slot.closest('.whats-pro-bubble')?.querySelector('.whats-pro-media-doc-name')?.textContent || 'Imagem';
      return;
    }

    if (kind === 'video') {
      let video = slot.querySelector('.whats-pro-media-video');
      if (!video) {
        video = document.createElement('video');
        video.className = 'whats-pro-media-video';
        video.controls = true;
        video.preload = 'metadata';
        slot.appendChild(video);
      }
      video.src = objectUrl;
      return;
    }

    if (kind === 'audio') {
      let audio = slot.querySelector('.whats-pro-media-audio');
      if (!audio) {
        audio = document.createElement('audio');
        audio.className = 'whats-pro-media-audio';
        audio.controls = true;
        audio.preload = 'metadata';
        slot.appendChild(audio);
      }
      audio.src = objectUrl;
      return;
    }

    const link = slot.querySelector('[data-media-open]');
    if (link) {
      link.href = objectUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  }

  async function hydrateMessageMedia() {
    if (!state.dom.messages) return;

    const slots = state.dom.messages.querySelectorAll('[data-media-message-id]');
    await Promise.all([...slots].map(async (slot) => {
      const messageId = slot.dataset.mediaMessageId;
      const kind = slot.dataset.mediaKind;
      if (!messageId || !kind) return;

      if (state.mediaObjectUrls[messageId]) {
        applyMediaToSlot(slot, state.mediaObjectUrls[messageId], kind);
        return;
      }

      try {
        const blob = await loadMessageMediaBlob(messageId);
        const objectUrl = URL.createObjectURL(blob);
        state.mediaObjectUrls[messageId] = objectUrl;
        applyMediaToSlot(slot, objectUrl, kind);
      } catch (error) {
        const loading = slot.querySelector('.whats-pro-media-loading');
        if (loading) {
          loading.textContent = 'Pré-visualização indisponível';
        }
      }
    }));
  }

  function bindMessageInteractions() {
    if (!state.dom.messages) return;

    state.dom.messages.querySelectorAll('[data-react-message-id]').forEach((button) => {
      if (button.dataset.boundReact === '1') return;
      button.dataset.boundReact = '1';
      button.addEventListener('click', () => {
        void reactToMessage(button.dataset.reactMessageId, button.dataset.reactEmoji);
      });
    });
  }

  function populateEmojiPanel() {
    if (!state.dom.emojiPanel || state.dom.emojiPanel.dataset.ready === '1') return;
    state.dom.emojiPanel.dataset.ready = '1';
    state.dom.emojiPanel.innerHTML = COMPOSER_EMOJIS.map((emoji) => (
      `<button type="button" class="whats-pro-emoji-btn" data-emoji="${escapeHtml(emoji)}" role="menuitem">${emoji}</button>`
    )).join('');
    state.dom.emojiPanel.querySelectorAll('[data-emoji]').forEach((button) => {
      button.addEventListener('click', () => {
        insertEmojiIntoComposer(button.dataset.emoji);
      });
    });
  }

  function insertEmojiIntoComposer(emoji) {
    if (!state.dom.composerInput || !emoji) return;
    const input = state.dom.composerInput;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = `${before}${emoji}${after}`;
    const nextPos = start + emoji.length;
    input.setSelectionRange(nextPos, nextPos);
    input.focus();
    updateComposerControls();
    closeEmojiPanel();
  }

  function toggleEmojiPanel() {
    if (!state.dom.emojiPanel || !state.dom.emojiBtn) return;
    if (!composerWindowIsOpen()) {
      guardComposerWindow();
      return;
    }
    state.emojiPanelOpen = !state.emojiPanelOpen;
    state.dom.emojiPanel.hidden = !state.emojiPanelOpen;
    state.dom.emojiBtn.setAttribute('aria-expanded', state.emojiPanelOpen ? 'true' : 'false');
  }

  function closeEmojiPanel() {
    state.emojiPanelOpen = false;
    if (state.dom.emojiPanel) state.dom.emojiPanel.hidden = true;
    if (state.dom.emojiBtn) state.dom.emojiBtn.setAttribute('aria-expanded', 'false');
  }

  function portalContactModal() {
    if (!state.dom.contactModal || state.dom.contactModal.dataset.portaled === '1') return;
    document.body.appendChild(state.dom.contactModal);
    state.dom.contactModal.dataset.portaled = '1';
  }

  function openContactModal() {
    if (!guardComposerWindow()) return;
    if (!state.dom.contactModal) return;
    portalContactModal();
    state.dom.contactModal.hidden = false;
    state.dom.contactName?.focus();
  }

  function closeContactModal() {
    if (!state.dom.contactModal) return;
    state.dom.contactModal.hidden = true;
    if (state.dom.contactForm) state.dom.contactForm.reset();
  }

  function renderAttachPreview(file) {
    if (!state.dom.attachPreview || !state.dom.attachPreviewMain) return;
    const validation = validateSelectedFile(file);
    if (validation) {
      setError(validation);
      clearPendingFile();
      return;
    }

    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    state.pendingFile = { file, previewUrl };

    const thumb = previewUrl
      ? `<img class="whats-pro-attach-thumb" src="${previewUrl}" alt="" />`
      : `<span class="whats-pro-attach-file-icon" aria-hidden="true">📎</span>`;

    state.dom.attachPreviewMain.innerHTML = `
      ${thumb}
      <div class="whats-pro-attach-meta">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(formatFileSize(file.size))}</span>
      </div>`;
    state.dom.attachPreview.hidden = false;
    state.dom.attachCaption?.focus();
  }

  function updateComposerControls() {
    if (!state.dom.send || !state.dom.composerInput || !state.dom.micBtn) {
      return;
    }

    const hasText = String(state.dom.composerInput.value || '').trim().length > 0;
    const isRecording = Boolean(state.audioRecorder && state.audioRecorder.state === 'recording');
    const composerLocked = !composerWindowIsOpen();
    const composerBusy = state.isSendingText || state.isUploadingFile || state.isUploadingAudio;

    state.dom.micBtn.style.display = hasText || isRecording ? 'none' : '';
    state.dom.send.style.display = hasText && !isRecording ? '' : 'none';

    if (state.dom.micBtn) {
      state.dom.micBtn.disabled = composerLocked || composerBusy || Boolean(state.pendingFile);
      state.dom.micBtn.setAttribute('aria-label', isRecording ? 'Parar gravação' : 'Gravar áudio');
      state.dom.micBtn.classList.toggle('is-recording', isRecording);
    }

    const mediaLocked = composerLocked || composerBusy;
    [
      state.dom.emojiBtn,
      state.dom.attachBtn,
      state.dom.contactBtn,
      state.dom.composerInput,
      state.dom.send,
      state.dom.attachSend,
      state.dom.audioSend,
      state.dom.contactSend,
    ].forEach((el) => {
      if (!el) return;
      if (el === state.dom.composerInput) {
        el.disabled = composerLocked || state.isSendingText;
      } else if (el === state.dom.send) {
        el.disabled = composerLocked || state.isSendingText || !hasText;
      } else if (el === state.dom.attachSend) {
        el.disabled = mediaLocked || state.isUploadingFile || !state.pendingFile;
      } else if (el === state.dom.audioSend) {
        el.disabled = mediaLocked || state.isUploadingAudio || !state.pendingAudioBlob;
      } else if (el === state.dom.contactSend) {
        el.disabled = mediaLocked || state.isSendingText;
      } else {
        el.disabled = mediaLocked;
      }
    });
  }

  function updateDebug(statusOverride) {
    if (!state.dom.debug) {
      return;
    }

    const selectedConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId);
    const conversationLabel = selectedConversation
      ? `${conversationTitle(selectedConversation)} (${selectedConversation.id})`
      : 'nenhuma';
    const status = statusOverride || state.lastMessageStatus;
    state.dom.debug.textContent = `Diagnóstico: conversa=${conversationLabel} | mensagens=${state.messages.length} | status=${status}`;
  }

  function normalizeTenantOption(tenant) {
    const safe = tenant || {};
    return {
      ...safe,
      id: safe.id || '',
      name: safe.name || safe.legalName || safe.tradeName || 'Empresa sem nome',
      role: safe.role || '',
      canManageTenant: typeof safe.canManageTenant === 'boolean'
        ? safe.canManageTenant
        : (safe.role === 'OWNER' || safe.role === 'ADMIN'),
      document: safe.document || safe.cnpj || '',
      cnpj: safe.cnpj || safe.document || '',
      businessEmail: safe.businessEmail || safe.email || '',
      email: safe.email || safe.businessEmail || '',
    };
  }

  function renderTenantOptions() {
    if (!state.dom.tenantSelect) {
      return;
    }

    state.dom.tenantSelect.innerHTML = state.tenantOptions
      .map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name)}</option>`)
      .join('');
    state.dom.tenantSelect.value = state.selectedTenantId || '';
  }

  function isGroupConversation(conversation) {
    const phone = String(conversation?.phone || '').toLowerCase();
    return phone.startsWith('lid:') || phone.includes('@g.us') || conversation?.isGroup === true;
  }

  function unreadCountFor(conversation) {
    const explicit = Number(conversation?.unreadCount || conversation?.unread || 0);
    if (Number.isFinite(explicit) && explicit > 0) {
      return explicit;
    }
    const last = conversation?.messages?.[0];
    if (last && last.direction === 'inbound') {
      return 1;
    }
    return 0;
  }

  function lastMessageOf(conversation) {
    if (!conversation || !Array.isArray(conversation.messages) || !conversation.messages.length) {
      return null;
    }
    return conversation.messages[0];
  }

  function passesActiveFilter(conversation) {
    switch (state.activeFilter) {
      case 'unread':
        return unreadCountFor(conversation) > 0;
      case 'ai':
        return state.botEnabled === true;
      case 'groups':
        return isGroupConversation(conversation);
      case 'closed':
        return !windowIsOpen(conversation.windowExpiresAt);
      case 'all':
      default:
        return true;
    }
  }

  function filteredConversations() {
    const searchTerm = state.search.trim().toLowerCase();
    return state.conversations.filter((conversation) => {
      if (!passesActiveFilter(conversation)) {
        return false;
      }
      if (!searchTerm) {
        return true;
      }
      const last = lastMessageOf(conversation);
      const lastText = last ? normalizeMessageContent(last) : '';
      return conversationTitle(conversation).toLowerCase().includes(searchTerm)
        || formatPhone(conversation.phone).toLowerCase().includes(searchTerm)
        || lastText.toLowerCase().includes(searchTerm);
    });
  }

  function renderFilters() {
    if (!state.dom.filters) {
      return;
    }
    state.dom.filters.querySelectorAll('[data-conv-filter]').forEach((button) => {
      const filter = button.dataset.convFilter;
      const isActive = filter === state.activeFilter;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const counts = {
      all: state.conversations.length,
      unread: state.conversations.reduce((acc, c) => acc + (unreadCountFor(c) > 0 ? 1 : 0), 0),
      closed: state.conversations.reduce((acc, c) => acc + (windowIsOpen(c.windowExpiresAt) ? 0 : 1), 0),
    };
    state.dom.filters.querySelectorAll('[data-conv-filter-count]').forEach((node) => {
      const filter = node.dataset.convFilterCount;
      const value = counts[filter];
      if (typeof value === 'number') {
        node.textContent = String(value);
        node.hidden = false;
      }
    });
  }

  function renderConversations() {
    if (!state.dom.chatList) {
      return;
    }

    renderFilters();

    const items = filteredConversations();
    if (!items.length) {
      state.dom.chatList.innerHTML = '<div class="whats-pro-chat-empty">Nenhuma conversa encontrada para este filtro.</div>';
      return;
    }

    state.dom.chatList.innerHTML = items
      .map((conversation) => {
        const last = lastMessageOf(conversation);
        const active = conversation.id === state.selectedConversationId;
        const unread = unreadCountFor(conversation);
        const titleText = conversationTitle(conversation);
        const previewText = last ? normalizeMessageContent(last) : 'Sem mensagens ainda.';
        const time = last ? formatChatListTime(last.createdAt) : '';
        const previewIcon = last && last.direction === 'outbound'
          ? `<span class="whats-pro-chat-preview-icon ${windowIsOpen(conversation.windowExpiresAt) ? 'is-read' : ''}">${ICONS.doubleCheck}</span>`
          : '';
        const previewLine = last && last.direction === 'outbound'
          ? `<span class="whats-pro-chat-preview">${previewIcon}<span>${escapeHtml(previewText)}</span></span>`
          : `<span class="whats-pro-chat-preview"><span>${escapeHtml(previewText)}</span></span>`;

        const windowStatus = formatWindowStatus(conversation.windowExpiresAt);
        const windowPillHtml = windowStatus.tone === 'closed'
          ? `<span class="whats-pro-chat-window" data-tone="closed">${ICONS.windowLock}<span>fechada</span></span>`
          : (windowStatus.tone === 'closing'
            ? `<span class="whats-pro-chat-window" data-tone="closing">${ICONS.windowOpen}<span>${escapeHtml(windowStatus.listLabel)}</span></span>`
            : (windowStatus.listLabel
              ? `<span class="whats-pro-chat-window" data-tone="open">${ICONS.windowOpen}<span>${escapeHtml(windowStatus.listLabel)}</span></span>`
              : ''));

        const tagsHtml = isGroupConversation(conversation)
          ? '<span class="whats-pro-chat-tag">grupo</span>'
          : (state.botEnabled && windowStatus.tone !== 'closed' ? '<span class="whats-pro-chat-tag">IA</span>' : '');

        const onlineClass = windowStatus.isOpen ? 'is-online' : '';

        return `
          <button class="whats-pro-chat-item ${active ? 'is-active' : ''} ${unread > 0 ? 'has-unread' : ''}" type="button" data-conversation-id="${escapeHtml(conversation.id)}">
            <span class="whats-pro-chat-avatar ${onlineClass}" style="background:${escapeHtml(avatarGradient(conversation.phone || conversation.id))}">${escapeHtml(conversationInitials(conversation))}</span>
            <span class="whats-pro-chat-copy">
              <span class="whats-pro-chat-row">
                <strong>${escapeHtml(titleText)}</strong>
                <time class="whats-pro-chat-time">${escapeHtml(time)}</time>
              </span>
              <span class="whats-pro-chat-foot">
                ${previewLine}
                <span class="whats-pro-chat-end">
                  ${windowPillHtml}
                  ${tagsHtml}
                  ${unread > 0 ? `<span class="whats-pro-chat-badge">${escapeHtml(String(unread))}</span>` : ''}
                </span>
              </span>
            </span>
          </button>`;
      })
      .join('');

    state.dom.chatList.querySelectorAll('[data-conversation-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedConversationId = button.dataset.conversationId;
        Object.values(state.mediaObjectUrls).forEach((url) => URL.revokeObjectURL(url));
        state.mediaObjectUrls = {};
        clearPendingFile();
        void stopAudioRecording();
        clearPendingAudio();
        closeEmojiPanel();
        closeContactModal();
        state.dom.shell?.classList.add('is-thread-open');
        highlightSelectedConversation();
        setError('');
        renderThreadLoading();
        renderCrm();
        void loadMessages(true);
      });
    });
  }

  function highlightSelectedConversation() {
    if (!state.dom.chatList) {
      return;
    }

    state.dom.chatList.querySelectorAll('[data-conversation-id]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.conversationId === state.selectedConversationId);
    });
  }

  function renderMessages() {
    if (!state.dom.messages) {
      return;
    }

    if (!state.messages.length) {
      state.dom.messages.innerHTML = '<div class="whats-pro-chat-empty">Nenhuma mensagem encontrada para esta conversa.</div>';
      return;
    }

    const sorted = [...state.messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const rows = [];
    let lastDay = '';
    const lastOutboundIndex = (() => {
      for (let i = sorted.length - 1; i >= 0; i -= 1) {
        if (sorted[i].direction === 'outbound') return i;
      }
      return -1;
    })();

    sorted.forEach((message, index) => {
      const currentDay = new Date(message.createdAt).toDateString();
      if (currentDay !== lastDay) {
        lastDay = currentDay;
        rows.push(`<div class="whats-pro-day-separator">${escapeHtml(formatDateLabel(message.createdAt))}</div>`);
      }

      const isOutbound = message.direction === 'outbound';
      const author = isOutbound
        ? 'Equipe / IA'
        : 'Cliente';
      const checkClass = isOutbound && index === lastOutboundIndex ? 'is-read' : '';
      const checkIcon = isOutbound ? ICONS.doubleCheck : '';
      const time = escapeHtml(formatTime(message.createdAt));

      rows.push(`
        <div class="whats-pro-bubble-row ${isOutbound ? 'is-outbound' : 'is-inbound'}" data-message-row-id="${escapeHtml(message.id)}">
          <article class="whats-pro-bubble">
            <span class="whats-pro-bubble-author">${escapeHtml(author)}</span>
            ${renderMessageBody(message)}
            ${renderReactionsRow(message.reactions)}
            <div class="whats-pro-bubble-foot ${checkClass}">
              <span>${time}</span>
              ${checkIcon}
            </div>
          </article>
          ${!isOutbound ? renderInboundReactBar(message.id) : ''}
        </div>`);
    });

    state.dom.messages.innerHTML = rows.join('');
    bindMessageInteractions();
    void hydrateMessageMedia();
    state.dom.messages.scrollTop = state.dom.messages.scrollHeight;
  }

  function applyWindowState() {
    const selectedConversation = state.conversations.find((c) => c.id === state.selectedConversationId);
    const status = selectedConversation
      ? formatWindowStatus(selectedConversation.windowExpiresAt)
      : null;

    if (state.dom.threadWindow) {
      if (!status) {
        state.dom.threadWindow.hidden = true;
      } else {
        state.dom.threadWindow.hidden = false;
        state.dom.threadWindow.dataset.tone = status.tone;
        const label = state.dom.threadWindow.querySelector('[data-window-label]');
        if (label) label.textContent = status.label;
      }
    }

    if (state.dom.windowWarning) {
      if (status && status.tone !== 'open') {
        state.dom.windowWarning.hidden = false;
        state.dom.windowWarning.dataset.tone = status.tone;
        if (state.dom.windowWarningTitle) state.dom.windowWarningTitle.textContent = status.warningTitle;
        if (state.dom.windowWarningHint) state.dom.windowWarningHint.textContent = status.warningHint;
      } else {
        state.dom.windowWarning.hidden = true;
      }
    }

    const composerLocked = Boolean(status && !status.isOpen);
    if (state.dom.composer) {
      state.dom.composer.classList.toggle('is-locked', composerLocked);
    }
    if (state.dom.composerInput) {
      state.dom.composerInput.disabled = composerLocked;
      state.dom.composerInput.placeholder = composerLocked
        ? 'Janela fechada — só é possível enviar template aprovado pela Meta (HSM).'
        : 'Digite uma mensagem para o cliente…';
    }
    if (state.dom.send) {
      state.dom.send.disabled = composerLocked;
    }
    if (state.dom.quickActions) {
      state.dom.quickActions.hidden = composerLocked;
    }

    updateComposerControls();

    if (state.dom.crmWindow) {
      if (status) {
        state.dom.crmWindow.classList.add('whats-pro-crm-window-state');
        state.dom.crmWindow.dataset.tone = status.tone;
        state.dom.crmWindow.textContent = status.crmLabel;
      } else {
        state.dom.crmWindow.classList.remove('whats-pro-crm-window-state');
        state.dom.crmWindow.removeAttribute('data-tone');
        state.dom.crmWindow.textContent = '—';
      }
    }
  }

  function startWindowTicker() {
    stopWindowTicker();
    state.windowTickerId = window.setInterval(() => {
      if (!state.active) return;
      applyWindowState();
      renderFilters();
    }, 60 * 1000);
  }

  function stopWindowTicker() {
    if (state.windowTickerId) {
      window.clearInterval(state.windowTickerId);
      state.windowTickerId = null;
    }
  }

  function renderThread() {
    const selectedConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId);
    const hasSelection = Boolean(selectedConversation);

    if (state.dom.empty) {
      state.dom.empty.hidden = hasSelection;
    }
    if (state.dom.thread) {
      state.dom.thread.hidden = !hasSelection;
    }

    if (!hasSelection) {
      applyWindowState();
      updateDebug('Nenhuma conversa selecionada.');
      return;
    }

    state.dom.headerName.textContent = conversationTitle(selectedConversation);
    const open = windowIsOpen(selectedConversation.windowExpiresAt);
    state.dom.headerMeta.textContent = `${open ? 'online agora' : 'sem janela ativa'} · ${selectedConversation.connector === 'whatsapp_api' ? 'WhatsApp Cloud API' : (selectedConversation.connector || 'WhatsApp')}`;
    state.dom.avatar.textContent = conversationInitials(selectedConversation);
    state.dom.avatar.style.background = avatarGradient(selectedConversation.phone || selectedConversation.id);
    state.dom.avatar.classList.toggle('is-online', open);

    if (state.dom.threadStatus) {
      const txt = state.botEnabled ? 'IA ativa' : 'IA pausada';
      state.dom.threadStatus.dataset.tone = state.botEnabled ? 'neutral' : 'warn';
      state.dom.threadStatus.querySelector('span:last-child').textContent = txt;
    }

    applyWindowState();
    renderMessages();
    updateDebug();
  }

  function renderThreadLoading() {
    const selectedConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId);
    if (!selectedConversation) {
      renderThread();
      return;
    }

    if (state.dom.empty) {
      state.dom.empty.hidden = true;
    }
    if (state.dom.thread) {
      state.dom.thread.hidden = false;
    }

    state.dom.headerName.textContent = conversationTitle(selectedConversation);
    state.dom.headerMeta.textContent = 'Carregando mensagens…';
    state.dom.avatar.textContent = conversationInitials(selectedConversation);
    state.dom.avatar.style.background = avatarGradient(selectedConversation.phone || selectedConversation.id);
    state.dom.messages.innerHTML = '<div class="whats-pro-chat-empty">Carregando conversa…</div>';
    updateDebug('Carregando mensagens...');
  }

  function renderCrm() {
    if (!state.dom.crm) {
      return;
    }
    const conversation = state.conversations.find((c) => c.id === state.selectedConversationId);
    if (!conversation) {
      state.dom.crm.hidden = true;
      return;
    }

    state.dom.crm.hidden = false;

    if (state.dom.crmAvatar) {
      state.dom.crmAvatar.textContent = conversationInitials(conversation);
      state.dom.crmAvatar.style.background = avatarGradient(conversation.phone || conversation.id);
    }
    if (state.dom.crmName) {
      state.dom.crmName.textContent = conversationTitle(conversation);
    }
    if (state.dom.crmPhone) {
      state.dom.crmPhone.textContent = formatPhone(conversation.phone);
    }
    if (state.dom.crmAvgTicket) {
      const avg = Number(conversation?.customer?.avgTicket || conversation?.metrics?.avgTicket || 0);
      state.dom.crmAvgTicket.textContent = avg > 0
        ? avg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—';
    }
    if (state.dom.crmLastVisit) {
      const last = conversation?.customer?.lastVisitAt || conversation?.lastAppointmentAt;
      state.dom.crmLastVisit.textContent = last ? formatChatListTime(last) : '—';
    }
    if (state.dom.crmMessageCount) {
      state.dom.crmMessageCount.textContent = String(conversation?._count?.messages || state.messages.length || 0);
    }
    if (state.dom.crmNotes) {
      const notes = conversation?.customer?.internalNotes || conversation?.notes;
      state.dom.crmNotes.textContent = notes && String(notes).trim()
        ? String(notes)
        : 'Nenhuma nota cadastrada para este contato.';
    }

    applyWindowState();
  }

  function updateToggleState() {
    const selectedTenant = state.tenantOptions.find((tenant) => tenant.id === state.selectedTenantId);
    const canToggle = window.ReservaPermissions?.canManageOperatorTenant?.(
      state.session || state.me,
      state.selectedTenantId,
      state.tenantOptions,
      state.me,
    ) ?? (
      state.me?.platformRole === 'PLATFORM_ADMIN'
      || selectedTenant?.canManageTenant === true
      || ['OWNER', 'ADMIN'].includes(String(selectedTenant?.role || '').toUpperCase())
    );

    if (state.dom.toggleOn) {
      state.dom.toggleOn.disabled = state.busy || !canToggle;
      state.dom.toggleOn.classList.toggle('is-active', state.botEnabled);
      state.dom.toggleOn.title = state.botEnabled ? 'IA ativa' : 'Ativar IA';
    }

    if (state.dom.toggleOff) {
      state.dom.toggleOff.disabled = state.busy || !canToggle;
      state.dom.toggleOff.classList.toggle('is-active', !state.botEnabled);
      state.dom.toggleOff.title = !state.botEnabled ? 'IA pausada' : 'Pausar IA';
    }

    if (state.dom.toggleHint) {
      if (!selectedTenant) {
        state.dom.toggleHint.textContent = 'Selecione uma empresa para carregar o status da IA.';
      } else if (!canToggle) {
        state.dom.toggleHint.textContent = 'Somente administradores podem alterar o estado da IA.';
      } else if (state.botEnabled) {
        state.dom.toggleHint.textContent = `IA ativa em ${selectedTenant.name}. Respostas automáticas habilitadas.`;
      } else {
        state.dom.toggleHint.textContent = `IA pausada em ${selectedTenant.name}. Apenas envio manual.`;
      }
    }

    if (state.dom.threadStatus) {
      const txt = state.botEnabled ? 'IA ativa' : 'IA pausada';
      state.dom.threadStatus.dataset.tone = state.botEnabled ? 'neutral' : 'warn';
      const label = state.dom.threadStatus.querySelector('span:last-child');
      if (label) label.textContent = txt;
    }
  }

  function updateLiveBadge() {
    const badge = qs('#botInboxLiveBadge');
    if (!badge) {
      return;
    }
    const source = state.session?.externalTokenSource || '';
    const live = source === 'live';
    const label = live ? 'Conexão ativa' : 'Sessão em validação';
    badge.querySelector('span:last-child') && (badge.querySelector('span:last-child').textContent = label);
    badge.dataset.tone = live ? 'success' : 'warn';
  }

  function updateComposerSendIcon() {
    updateComposerControls();
  }

  async function loadMessages(forceRender) {
    if (!state.selectedTenantId || !state.selectedConversationId) {
      state.messages = [];
      renderThread();
      return;
    }

    try {
      if (forceRender) {
        renderThreadLoading();
      }

      const payload = await requestExternal(
        `/messages?conversationId=${encodeURIComponent(state.selectedConversationId)}&tenantId=${encodeURIComponent(state.selectedTenantId)}`,
      );
      state.messages = Array.isArray(payload) ? payload : [];
      state.lastMessageStatus = `Sincronização concluída com ${state.messages.length} mensagens.`;
      renderThread();
      renderCrm();
    } catch (error) {
      state.messages = [];
      state.lastMessageStatus = formatUserError(error, 'whatsappInbox');
      renderThread();
      setError(formatUserError(error, 'whatsappInbox'));
    }
  }

  async function loadSettings() {
    if (!state.selectedTenantId) {
      return;
    }

    try {
      const payload = await requestExternal(`/tenant-settings?tenantId=${encodeURIComponent(state.selectedTenantId)}`);
      state.botEnabled = typeof payload?.botEnabled === 'boolean' ? payload.botEnabled : true;
      updateToggleState();
    } catch (error) {
      updateToggleState();
    }
  }

  async function loadConversations() {
    if (!state.selectedTenantId) {
      state.conversations = [];
      renderConversations();
      renderThread();
      return;
    }

    const payload = await requestExternal(`/conversations?tenantId=${encodeURIComponent(state.selectedTenantId)}`);
    state.conversations = Array.isArray(payload) ? payload : [];

    if (!state.selectedConversationId || !state.conversations.some((conversation) => conversation.id === state.selectedConversationId)) {
      state.selectedConversationId = state.conversations[0]?.id || null;
    }

    renderConversations();
    await loadMessages(true);
  }

  async function refreshWorkspace(showLoading) {
    if (!state.active) {
      return;
    }

    if (state.initialized) {
      syncSelectedTenantFromSession(state.session, { persist: true, render: true });
    }

    try {
      if (showLoading) {
        setSyncMessage('Sincronizando conversas e status da IA…', 'neutral');
      }
      setError('');
      await loadSettings();
      await loadConversations();
      setSyncMessage('Inbox sincronizada.', 'success');
    } catch (error) {
      setSyncMessage(formatUserError(error, 'whatsappSync'), 'error');
      setError(formatUserError(error, 'whatsappSync'));
    }
  }

  async function bootstrap() {
    if (state.initialized) {
      return;
    }

    setSyncMessage('Consultando perfil e empresas disponíveis…', 'neutral');
    updateLiveBadge();

    const me = await requestExternal('/auth/me');
    state.me = me;

    if (me.platformRole === 'PLATFORM_ADMIN') {
      const tenants = await requestExternal('/tenants');
      state.tenantOptions = Array.isArray(tenants) ? tenants.map(normalizeTenantOption) : [];
    } else {
      state.tenantOptions = Array.isArray(me.tenants) ? me.tenants.map(normalizeTenantOption) : [];
    }

    syncSelectedTenantFromSession(state.session, { persist: true, render: true });
    updateToggleState();
    state.initialized = true;
  }

  async function sendMessage() {
    const content = state.dom.composerInput?.value?.trim();
    if (!state.selectedTenantId || !state.selectedConversationId || !content) {
      return;
    }

    if (!guardComposerWindow()) {
      return;
    }

    state.isSendingText = true;
    updateComposerControls();
    setError('');

    try {
      await requestExternal(`/messages/send?tenantId=${encodeURIComponent(state.selectedTenantId)}`, {
        method: 'POST',
        body: JSON.stringify({
          conversationId: state.selectedConversationId,
          content,
        }),
      });
      await recordAudit('WHATSAPP_MESSAGE_SENT', 'conversation', state.selectedConversationId, 'Mensagem enviada manualmente no inbox do WhatsApp.', {
        tenantId: state.selectedTenantId,
        conversationId: state.selectedConversationId,
        content,
      });
      state.dom.composerInput.value = '';
      updateComposerControls();
      await loadMessages(false);
      await loadConversationsSilently();
    } catch (error) {
      setError(formatUserError(error, 'whatsappSend'));
    } finally {
      state.isSendingText = false;
      updateComposerControls();
    }
  }

  async function loadConversationsSilently() {
    if (!state.selectedTenantId) return;
    try {
      const payload = await requestExternal(`/conversations?tenantId=${encodeURIComponent(state.selectedTenantId)}`);
      state.conversations = Array.isArray(payload) ? payload : [];
      renderConversations();
      renderCrm();
    } catch (error) {
      // Mantém lista atual se refresh leve falhar.
    }
  }

  async function sendFileMessage() {
    const pending = state.pendingFile;
    if (!pending?.file || !state.selectedTenantId || !state.selectedConversationId) {
      return;
    }
    if (!guardComposerWindow()) return;

    const validation = validateSelectedFile(pending.file);
    if (validation) {
      setError(validation);
      return;
    }

    state.isUploadingFile = true;
    updateComposerControls();
    setError('');

    try {
      const form = new FormData();
      form.append('conversationId', state.selectedConversationId);
      form.append('file', pending.file, pending.file.name);
      const caption = state.dom.attachCaption?.value?.trim();
      if (caption) {
        form.append('caption', caption);
      }

      await requestExternal(`/messages/send-file?tenantId=${encodeURIComponent(state.selectedTenantId)}`, {
        method: 'POST',
        body: form,
      });

      await recordAudit('WHATSAPP_FILE_SENT', 'conversation', state.selectedConversationId, 'Arquivo enviado no inbox do WhatsApp.', {
        tenantId: state.selectedTenantId,
        conversationId: state.selectedConversationId,
        fileName: pending.file.name,
      });

      clearPendingFile();
      await loadMessages(false);
      await loadConversationsSilently();
    } catch (error) {
      setError(formatUserError(error, 'whatsappSend'));
    } finally {
      state.isUploadingFile = false;
      updateComposerControls();
    }
  }

  async function sendAudioMessage() {
    if (!state.pendingAudioBlob || !state.selectedTenantId || !state.selectedConversationId) {
      return;
    }
    if (!guardComposerWindow()) return;

    if (state.pendingAudioBlob.size > AUDIO_MAX_BYTES) {
      setError(`Áudio muito grande (máx. ${formatFileSize(AUDIO_MAX_BYTES)}).`);
      return;
    }

    state.isUploadingAudio = true;
    updateComposerControls();
    setError('');

    try {
      const form = new FormData();
      form.append('conversationId', state.selectedConversationId);
      form.append('audio', state.pendingAudioBlob, `audio-${Date.now()}.webm`);

      await requestExternal(`/messages/send-audio?tenantId=${encodeURIComponent(state.selectedTenantId)}`, {
        method: 'POST',
        body: form,
      });

      await recordAudit('WHATSAPP_AUDIO_SENT', 'conversation', state.selectedConversationId, 'Áudio enviado no inbox do WhatsApp.', {
        tenantId: state.selectedTenantId,
        conversationId: state.selectedConversationId,
      });

      clearPendingAudio();
      await loadMessages(false);
      await loadConversationsSilently();
    } catch (error) {
      setError(formatUserError(error, 'whatsappSend'));
    } finally {
      state.isUploadingAudio = false;
      updateComposerControls();
    }
  }

  async function reactToMessage(messageId, emoji) {
    if (!messageId || !emoji || !state.selectedTenantId) {
      return;
    }
    if (!guardComposerWindow()) return;

    state.isReacting = true;
    setError('');

    try {
      const payload = await requestExternal(
        `/messages/${encodeURIComponent(messageId)}/react?tenantId=${encodeURIComponent(state.selectedTenantId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        },
      );

      if (Array.isArray(payload?.reactions)) {
        state.messages = state.messages.map((message) => (
          message.id === messageId ? { ...message, reactions: payload.reactions } : message
        ));
        renderMessages();
      } else {
        await loadMessages(false);
      }
    } catch (error) {
      setError(formatUserError(error, 'whatsapp'));
    } finally {
      state.isReacting = false;
    }
  }

  async function sendContactMessage() {
    if (!state.selectedTenantId || !state.selectedConversationId) {
      return;
    }
    if (!guardComposerWindow()) return;

    const formattedName = state.dom.contactName?.value?.trim();
    const phone = state.dom.contactPhone?.value?.trim();
    const phoneType = state.dom.contactPhoneType?.value || 'CELL';

    if (!formattedName || !phone) {
      setError('Informe nome e telefone do contato.');
      return;
    }

    state.isSendingText = true;
    updateComposerControls();
    setError('');

    try {
      await requestExternal(`/messages/send-contact?tenantId=${encodeURIComponent(state.selectedTenantId)}`, {
        method: 'POST',
        body: JSON.stringify({
          conversationId: state.selectedConversationId,
          formattedName,
          phone,
          phoneType,
        }),
      });

      await recordAudit('WHATSAPP_CONTACT_SENT', 'conversation', state.selectedConversationId, 'Contato enviado no inbox do WhatsApp.', {
        tenantId: state.selectedTenantId,
        conversationId: state.selectedConversationId,
        formattedName,
        phone,
      });

      closeContactModal();
      await loadMessages(false);
      await loadConversationsSilently();
    } catch (error) {
      setError(formatUserError(error, 'whatsappSend'));
    } finally {
      state.isSendingText = false;
      updateComposerControls();
    }
  }

  async function toggleAudioRecording() {
    if (!guardComposerWindow()) return;

    if (state.audioRecorder && state.audioRecorder.state === 'recording') {
      await stopAudioRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Gravação de áudio não suportada neste navegador.');
      return;
    }

    try {
      clearPendingAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        state.pendingAudioBlob = blob;
        revokePendingAudioUrl();
        state.pendingAudioUrl = URL.createObjectURL(blob);
        if (state.dom.audioPreview) state.dom.audioPreview.hidden = false;
        if (state.dom.audioPreviewLabel) state.dom.audioPreviewLabel.textContent = 'Pré-escuta';
        if (state.dom.audioPreviewPlayer) {
          state.dom.audioPreviewPlayer.hidden = false;
          state.dom.audioPreviewPlayer.src = state.pendingAudioUrl;
        }
        if (state.dom.audioSend) state.dom.audioSend.hidden = false;
        updateComposerControls();
      });

      state.audioRecorder = recorder;
      state.audioRecordingStream = stream;
      state.audioRecordingStartedAt = Date.now();
      recorder.start();
      if (state.dom.audioPreview) state.dom.audioPreview.hidden = false;
      if (state.dom.audioPreviewLabel) state.dom.audioPreviewLabel.textContent = 'Gravando… clique no microfone para parar';
      if (state.dom.audioPreviewPlayer) state.dom.audioPreviewPlayer.hidden = true;
      if (state.dom.audioSend) state.dom.audioSend.hidden = true;
      updateComposerControls();
    } catch (error) {
      setError('Não foi possível acessar o microfone.');
    }
  }

  async function toggleBot(nextValue) {
    if (!state.selectedTenantId) {
      return;
    }

    state.busy = true;
    updateToggleState();
    setError('');

    try {
      await requestExternal(`/tenant-settings?tenantId=${encodeURIComponent(state.selectedTenantId)}`, {
        method: 'PUT',
        body: JSON.stringify({ botEnabled: nextValue }),
      });
      await recordAudit('WHATSAPP_BOT_TOGGLED', 'tenant-settings', state.selectedTenantId, nextValue ? 'Bot do WhatsApp ativado.' : 'Bot do WhatsApp pausado.', {
        tenantId: state.selectedTenantId,
        botEnabled: nextValue,
      });
      state.botEnabled = nextValue;
      updateToggleState();
      renderConversations();
      renderThread();
      setSyncMessage(nextValue ? 'IA ativada para esta empresa.' : 'IA pausada para esta empresa.', 'success');
    } catch (error) {
      setError(formatUserError(error, 'settings'));
    } finally {
      state.busy = false;
      updateToggleState();
    }
  }

  function stopPolling() {
    if (!state.pollerId) {
      return;
    }

    window.clearInterval(state.pollerId);
    state.pollerId = null;
  }

  function applyQuickAction(action) {
    const template = QUICK_TEMPLATES[action];
    if (!template || !state.dom.composerInput) {
      return;
    }
    state.dom.composerInput.value = template;
    state.dom.composerInput.focus();
    updateComposerSendIcon();
  }

  function handleCrmAction(action) {
    if (!action || !state.selectedConversationId) {
      return;
    }
    const conversation = state.conversations.find((c) => c.id === state.selectedConversationId);
    const detail = {
      action,
      conversationId: state.selectedConversationId,
      tenantId: state.selectedTenantId,
      contact: conversation
        ? { phone: conversation.phone, name: conversationTitle(conversation) }
        : null,
    };
    window.dispatchEvent(new CustomEvent('reserva:whatsapp-crm-action', { detail }));
  }

  function handleTemplateRequest() {
    if (!state.selectedConversationId) {
      return;
    }
    const conversation = state.conversations.find((c) => c.id === state.selectedConversationId);
    const status = conversation ? formatWindowStatus(conversation.windowExpiresAt) : null;
    const detail = {
      conversationId: state.selectedConversationId,
      tenantId: state.selectedTenantId,
      windowStatus: status ? { tone: status.tone, expiresInMs: status.expiresInMs } : null,
      contact: conversation
        ? { phone: conversation.phone, name: conversationTitle(conversation) }
        : null,
    };
    window.dispatchEvent(new CustomEvent('reserva:whatsapp-template-request', { detail }));
  }

  function bindEvents() {
    state.dom.tenantSelect?.addEventListener('change', () => {
      state.selectedTenantId = state.dom.tenantSelect.value;
      writeStorage(TENANT_STORAGE_KEY, state.selectedTenantId);
      const tenant = state.tenantOptions.find((item) => item.id === state.selectedTenantId);
      const saveLogin = state.authService?.savePreferredLoginTenant
        || window.ReservaAiAuth?.savePreferredLoginTenant;
      saveLogin?.(state.selectedTenantId, tenant?.name);
      state.selectedConversationId = null;
      state.messages = [];
      void refreshWorkspace(true);
    });

    state.dom.search?.addEventListener('input', () => {
      state.search = state.dom.search.value || '';
      renderConversations();
    });

    state.dom.filters?.querySelectorAll('[data-conv-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeFilter = button.dataset.convFilter || 'all';
        renderConversations();
      });
    });

    state.dom.composerInput?.addEventListener('input', () => {
      updateComposerSendIcon();
    });

    state.dom.composerInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
      }
    });

    state.dom.send?.addEventListener('click', () => {
      void sendMessage();
    });

    state.dom.toggleOn?.addEventListener('click', () => {
      void toggleBot(true);
    });

    state.dom.toggleOff?.addEventListener('click', () => {
      void toggleBot(false);
    });

    state.dom.quickActions?.querySelectorAll('[data-quick-action]').forEach((button) => {
      button.addEventListener('click', () => {
        applyQuickAction(button.dataset.quickAction);
      });
    });

    state.dom.crm?.querySelectorAll('[data-crm-action]').forEach((button) => {
      button.addEventListener('click', () => {
        handleCrmAction(button.dataset.crmAction);
      });
    });

    state.dom.threadBack?.addEventListener('click', () => {
      state.dom.shell?.classList.remove('is-thread-open');
    });

    state.dom.windowTemplateBtn?.addEventListener('click', () => {
      handleTemplateRequest();
    });

    state.dom.emojiBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleEmojiPanel();
    });

    state.dom.attachBtn?.addEventListener('click', () => {
      if (!guardComposerWindow()) return;
      state.dom.fileInput?.click();
    });

    state.dom.fileInput?.addEventListener('change', () => {
      const file = state.dom.fileInput?.files?.[0];
      if (!file) return;
      closeEmojiPanel();
      renderAttachPreview(file);
      updateComposerControls();
    });

    state.dom.attachCancel?.addEventListener('click', () => {
      clearPendingFile();
      updateComposerControls();
    });

    state.dom.attachSend?.addEventListener('click', () => {
      void sendFileMessage();
    });

    state.dom.micBtn?.addEventListener('click', () => {
      void toggleAudioRecording();
    });

    state.dom.audioDiscard?.addEventListener('click', async () => {
      await stopAudioRecording();
      clearPendingAudio();
      updateComposerControls();
    });

    state.dom.audioSend?.addEventListener('click', () => {
      void sendAudioMessage();
    });

    state.dom.contactBtn?.addEventListener('click', () => {
      openContactModal();
    });

    state.dom.contactClose?.addEventListener('click', () => {
      closeContactModal();
    });

    state.dom.contactCancel?.addEventListener('click', () => {
      closeContactModal();
    });

    state.dom.contactModal?.addEventListener('click', (event) => {
      if (event.target === state.dom.contactModal) {
        closeContactModal();
      }
    });

    state.dom.contactSend?.addEventListener('click', () => {
      void sendContactMessage();
    });

    state.dom.contactForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void sendContactMessage();
    });

    document.addEventListener('click', (event) => {
      if (!state.emojiPanelOpen) return;
      const target = event.target;
      if (state.dom.emojiPanel?.contains(target) || state.dom.emojiBtn?.contains(target)) {
        return;
      }
      closeEmojiPanel();
    });
  }

  function mount() {
    if (state.mounted) {
      return true;
    }

    const root = qs('#botInboxRoot');
    if (!root) {
      return false;
    }

    state.dom = {
      root,
      shell: root,
      tenantSelect: qs('#botInboxTenant'),
      search: qs('#botInboxSearch'),
      toggleOn: qs('#botInboxToggleOn'),
      toggleOff: qs('#botInboxToggleOff'),
      toggleHint: qs('#botInboxToggleHint'),
      sync: qs('#botInboxSync'),
      filters: qs('#botInboxFilters'),
      chatList: qs('#botInboxChatList'),
      empty: qs('#botInboxEmpty'),
      thread: qs('#botInboxThread'),
      threadStatus: qs('#botInboxThreadStatus'),
      threadWindow: qs('#botInboxThreadWindow'),
      threadBack: root.querySelector('[data-whats-back]'),
      debug: qs('#botInboxDebug'),
      headerName: qs('#botInboxHeaderName'),
      headerMeta: qs('#botInboxHeaderMeta'),
      avatar: qs('#botInboxAvatar'),
      messages: qs('#botInboxMessages'),
      error: qs('#botInboxError'),
      composer: root.querySelector('.whats-pro-composer'),
      composerInput: qs('#botInboxComposerInput'),
      send: qs('#botInboxSend'),
      micBtn: qs('#botInboxMicBtn'),
      emojiBtn: qs('#botInboxEmojiBtn'),
      emojiPanel: qs('#botInboxEmojiPanel'),
      attachBtn: qs('#botInboxAttachBtn'),
      contactBtn: qs('#botInboxContactBtn'),
      fileInput: qs('#botInboxFileInput'),
      attachPreview: qs('#botInboxAttachPreview'),
      attachPreviewMain: qs('#botInboxAttachPreviewMain'),
      attachCaption: qs('#botInboxAttachCaption'),
      attachCancel: qs('#botInboxAttachCancel'),
      attachSend: qs('#botInboxAttachSend'),
      audioPreview: qs('#botInboxAudioPreview'),
      audioPreviewLabel: qs('#botInboxAudioPreviewLabel'),
      audioPreviewPlayer: qs('#botInboxAudioPreviewPlayer'),
      audioDiscard: qs('#botInboxAudioDiscard'),
      audioSend: qs('#botInboxAudioSend'),
      contactModal: qs('#botInboxContactModal'),
      contactForm: qs('#botInboxContactForm'),
      contactName: qs('#botInboxContactName'),
      contactPhone: qs('#botInboxContactPhone'),
      contactPhoneType: qs('#botInboxContactPhoneType'),
      contactClose: qs('#botInboxContactClose'),
      contactCancel: qs('#botInboxContactCancel'),
      contactSend: qs('#botInboxContactSend'),
      quickActions: qs('#botInboxQuickActions'),
      windowWarning: qs('#botInboxWindowWarning'),
      windowWarningTitle: qs('#botInboxWindowWarningTitle'),
      windowWarningHint: qs('#botInboxWindowWarningHint'),
      windowTemplateBtn: qs('#botInboxWindowTemplateBtn'),
      crm: qs('#botInboxCrmPanel'),
      crmAvatar: qs('#botInboxCrmAvatar'),
      crmName: qs('#botInboxCrmName'),
      crmPhone: qs('#botInboxCrmPhone'),
      crmAvgTicket: qs('#botInboxCrmAvgTicket'),
      crmLastVisit: qs('#botInboxCrmLastVisit'),
      crmMessageCount: qs('#botInboxCrmMessageCount'),
      crmWindow: qs('#botInboxCrmWindowState'),
      crmNotes: qs('#botInboxCrmNotes'),
    };

    if (state.dom.empty) {
      state.dom.empty.hidden = false;
    }

    if (state.dom.thread) {
      state.dom.thread.hidden = true;
    }

    bindEvents();
    populateEmojiPanel();
    portalContactModal();
    updateComposerControls();
    renderThread();
    renderCrm();
    updateDebug();
    state.mounted = true;
    return true;
  }

  async function activate(session) {
    if (!mount()) {
      return;
    }

    state.session = session || state.session;
    state.active = true;
    updateLiveBadge();
    setSyncMessage('Abrindo inbox do WhatsApp…', 'neutral');
    startWindowTicker();

    try {
      await bootstrap();
      syncSelectedTenantFromSession(state.session, { persist: true, render: true });
      await refreshWorkspace(true);
    } catch (error) {
      setSyncMessage(formatUserError(error, 'whatsappInbox'), 'error');
      setError(formatUserError(error, 'whatsappInbox'));
    }
  }

  function deactivate() {
    state.active = false;
    stopPolling();
    stopWindowTicker();
    void stopAudioRecording();
    clearPendingFile();
    clearPendingAudio();
    Object.values(state.mediaObjectUrls).forEach((url) => URL.revokeObjectURL(url));
    state.mediaObjectUrls = {};
    closeEmojiPanel();
    closeContactModal();
  }

  function init(context) {
    state.authService = context?.authService || state.authService;
    state.session = context?.session || state.session;
    mount();
    updateLiveBadge();
  }

  window.ReservaAiBotInbox = {
    init,
    activate,
    deactivate,
  };
})();
