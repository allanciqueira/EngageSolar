/**
 * Utilitários — Templates WhatsApp (wizard Engage Solar).
 */
(function () {
  const PROMO_WORDS = [
    'promocao', 'promocional', 'promocoes', 'imperdivel', 'gratis', 'desconto', 'descontos',
    'oferta', 'ofertas', 'liquidacao', 'black friday', 'cyber monday', 'mega sale',
    'so hoje', 'só hoje', 'ultima chance', 'última chance', 'ultimas vagas', 'últimas vagas',
    'nao perca', 'não perca', 'corre', 'corra', 'clique aqui', 'acesse', 'cadastre-se',
    'compre agora', 'aproveite agora', 'urgente', 'imperdível',
  ];

  const LINK_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|com\.br|net|org|app|io|link|me)\b|bit\.ly|wa\.me|t\.me/i;

  function normalizeAccents(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function slugifyTemplateName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180);
  }

  function normalizePurpose(value) {
    return normalizeAccents(value)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
  }

  function buildTemplateName(prefix, purpose, version) {
    const p = String(prefix || '').trim().replace(/_+$/, '');
    const purposeNorm = normalizePurpose(purpose);
    const ver = String(version || 'v1').trim().replace(/^v/i, 'v');
    if (!p || !purposeNorm) return '';
    return `${p}_${purposeNorm}_${ver}`;
  }

  function extractPlaceholderIndices(body) {
    const indices = new Set();
    const re = /\{\{(\d+)\}\}/g;
    let match = re.exec(String(body || ''));
    while (match) {
      indices.add(Number(match[1]));
      match = re.exec(String(body || ''));
    }
    return [...indices].sort((a, b) => a - b);
  }

  function hasInvalidPlaceholders(body) {
    const text = String(body || '');
    const withoutValid = text.replace(/\{\{\d+\}\}/g, '');
    if (/\{\{[^}]*\}\}/.test(withoutValid)) return true;
    if (/\{[^{}]+\}/.test(withoutValid)) return true;
    if (/\[\[[^\]]+\]\]/.test(withoutValid)) return true;
    return false;
  }

  function placeholderIndexGaps(body) {
    const indices = extractPlaceholderIndices(body);
    if (indices.length <= 1) return [];
    const gaps = [];
    for (let i = 1; i < indices.length; i += 1) {
      if (indices[i] - indices[i - 1] > 1) {
        gaps.push(indices[i - 1], indices[i]);
      }
    }
    if (indices[0] > 1) gaps.unshift(1, indices[0]);
    return gaps;
  }

  function countEmojis(text) {
    const matches = String(text || '').match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
    return matches ? matches.length : 0;
  }

  function countCapsWords(text) {
    const words = String(text || '').replace(/\{\{\d+\}\}/g, ' ').split(/\s+/);
    return words.filter((w) => w.length >= 4 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  }

  function lintTemplateContent(body, category) {
    const text = String(body || '');
    const cat = String(category || 'MARKETING').toUpperCase();
    const items = [];
    const chars = text.length;
    const emojis = countEmojis(text);
    const placeholders = extractPlaceholderIndices(text).length;
    const capsWords = countCapsWords(text);

    if (!text.trim()) {
      items.push({ severity: 'error', code: 'body_empty', message: 'Corpo da mensagem é obrigatório.' });
    }
    if (chars >= 1024) {
      items.push({ severity: 'error', code: 'body_too_long', message: 'Máximo 1024 caracteres no corpo.' });
    } else if (chars > 600) {
      items.push({ severity: 'warning', code: 'body_long', message: 'Texto longo — prefira mensagens mais curtas.' });
    }
    if (LINK_RE.test(text)) {
      items.push({
        severity: 'error',
        code: 'link_found',
        message: 'Remova links do corpo — use botão URL na secção Botões.',
      });
    }
    if (hasInvalidPlaceholders(text)) {
      items.push({ severity: 'error', code: 'invalid_placeholder', message: 'Use apenas placeholders {{1}}, {{2}}, etc.' });
    }
    const gaps = placeholderIndexGaps(text);
    if (gaps.length) {
      items.push({
        severity: 'warning',
        code: 'placeholder_gap',
        message: 'Há saltos nos índices (ex.: {{1}} e {{3}} sem {{2}}) — a Meta aceita, mas confunde na campanha.',
      });
    }
    if (placeholders > 10) {
      items.push({ severity: 'error', code: 'too_many_vars', message: 'Máximo 10 variáveis no corpo.' });
    } else if (placeholders > 6) {
      items.push({ severity: 'warning', code: 'many_vars', message: 'Muitas variáveis — prefira 2 a 4.' });
    }
    if (emojis > 4) {
      items.push({ severity: 'error', code: 'too_many_emojis', message: 'Reduza a quantidade de emojis.' });
    } else if (cat === 'UTILITY' && emojis > 0) {
      items.push({ severity: 'error', code: 'emoji_utility', message: 'Templates UTILITY não devem usar emojis.' });
    } else if (cat === 'MARKETING' && emojis > 2) {
      items.push({ severity: 'warning', code: 'many_emojis', message: 'Use no máximo 1–2 emojis em MARKETING.' });
    }
    if (capsWords >= 4) {
      items.push({ severity: 'error', code: 'too_many_caps', message: 'Evite palavras inteiras em MAIÚSCULAS.' });
    } else if (capsWords >= 2) {
      items.push({ severity: 'warning', code: 'caps_words', message: 'Reduza palavras em MAIÚSCULAS.' });
    }

    const norm = normalizeAccents(text);
    PROMO_WORDS.forEach((word) => {
      if (!norm.includes(word)) return;
      const isUtility = cat === 'UTILITY';
      items.push({
        severity: isUtility ? 'error' : 'warning',
        code: `promo_${word.replace(/\s+/g, '_')}`,
        message: `Evite «${word}» — tom promocional${isUtility ? ' incompatível com UTILITY' : ''}.`,
      });
    });

    const severity = items.some((i) => i.severity === 'error')
      ? 'error'
      : (items.some((i) => i.severity === 'warning') ? 'warning' : 'ok');

    return {
      severity,
      items,
      stats: { chars, emojis, placeholders, capsWords },
      hasErrors: items.some((i) => i.severity === 'error'),
    };
  }

  function renderTemplatePreview(body, variables) {
    let text = String(body || '');
    const list = Array.isArray(variables) ? variables : [];
    list.forEach((variable) => {
      const index = Number(variable?.index);
      const sample = String(variable?.sample || variable?.name || `exemplo ${index}`).trim();
      if (!Number.isFinite(index) || index < 1) return;
      text = text.replace(new RegExp(`\\{\\{${index}\\}\\}`, 'g'), sample);
    });
    return text;
  }

  function suggestVariableName(index) {
    const map = {
      1: 'name',
      2: 'city',
      3: 'salesperson',
      4: 'tenant_name',
      5: 'phone',
      6: 'today',
    };
    return map[index] || `var_${index}`;
  }

  function defaultSampleForKey(key) {
    const samples = {
      name: 'Maria Silva',
      city: 'São Paulo',
      salesperson: 'João Vendedor',
      tenant_name: 'Promax Energia',
      phone: '+55 11 99999-0000',
      today: new Date().toLocaleDateString('pt-BR'),
    };
    return samples[key] || 'Exemplo';
  }

  function syncVariablesFromBody(body, existing) {
    const indices = extractPlaceholderIndices(body);
    const prev = Array.isArray(existing) ? existing : [];
    const byIndex = new Map(prev.map((v) => [Number(v.index), v]));
    return indices.map((index) => {
      const current = byIndex.get(index);
      const name = current?.name || suggestVariableName(index);
      return {
        index,
        name,
        sample: current?.sample || defaultSampleForKey(name),
      };
    });
  }

  function statusTone(status) {
    const value = String(status || '').toUpperCase();
    if (['APPROVED'].includes(value)) return 'ok';
    if (['PENDING', 'SUBMITTED', 'DRAFT'].includes(value)) return 'warn';
    if (['REJECTED', 'DISABLED', 'PAUSED'].includes(value)) return 'danger';
    return 'neutral';
  }

  function resolveTenantDisplayName(session) {
    if (!session || typeof session !== 'object') {
      return '';
    }

    const tenantId = window.ReservaPermissions?.resolveEffectiveTenantId?.(session)
      || String(session.activeTenantId || session.tenantId || '').trim();
    const tenants = Array.isArray(session.tenants) ? session.tenants : [];
    const pickName = (row) => String(
      row?.name || row?.tenantName || row?.tradeName || row?.legalName || '',
    ).trim();

    if (tenantId && tenants.length) {
      const match = tenants.find((row) => String(row?.id || row?.tenantId || '').trim() === tenantId);
      const fromMembership = pickName(match);
      if (fromMembership) return fromMembership;
    }

    const fromTenant = pickName(session.tenant);
    if (fromTenant) return fromTenant;

    const stored = String(session.tenantName || '').trim();
    if (stored) return stored;

    const preferred = window.EngageSolarAuth?.getPreferredLoginTenantName?.()
      || window.ReservaAiAuth?.getPreferredLoginTenantName?.()
      || '';
    return String(preferred || '').trim();
  }

  function deriveTenantPrefix(session) {
    const name = resolveTenantDisplayName(session);
    const slug = normalizePurpose(name);
    if (!slug) return 'engage_';
    const token = slug.split('_').filter(Boolean)[0] || slug;
    return `${token.slice(0, 24)}_`;
  }

  function isEditableStatus(status) {
    const value = String(status || '').toUpperCase();
    return value === 'DRAFT' || value === 'REJECTED';
  }

  const FOOTER_MAX = 60;
  const HEADER_TEXT_MAX = 60;
  const BUTTON_TEXT_MAX = 25;
  const MAX_BUTTONS = 3;
  const HTTPS_RE = /^https:\/\/.+/i;
  const PHONE_RE = /^\+?[0-9][0-9\s().-]{7,}$/;

  const HEADER_TYPE_OPTIONS = [
    { key: 'NONE', label: 'Nenhum' },
    { key: 'TEXT', label: 'Texto' },
    { key: 'IMAGE', label: 'IMAGE' },
    { key: 'VIDEO', label: 'VIDEO' },
    { key: 'DOCUMENT', label: 'DOCUMENT' },
  ];

  const BUTTON_TYPE_LABELS = {
    QUICK_REPLY: 'Quick Reply',
    URL: 'URL',
    PHONE_NUMBER: 'Telefone',
  };

  function normalizeHeaderType(value) {
    const key = String(value || 'NONE').trim().toUpperCase();
    return HEADER_TYPE_OPTIONS.some((opt) => opt.key === key) ? key : 'NONE';
  }

  function headerTypeRequiresMediaAsset(type) {
    const key = normalizeHeaderType(type);
    return key === 'IMAGE' || key === 'VIDEO' || key === 'DOCUMENT';
  }

  function mediaAssetTypeForHeader(type) {
    return normalizeHeaderType(type);
  }

  function emptyComponents() {
    return { headerType: 'NONE', headerText: '', footer: '', buttons: [] };
  }

  function parseFooterValue(value) {
    if (value == null) return '';
    if (typeof value === 'object') return String(value.text || '').trim();
    return String(value).trim();
  }

  function parseHeaderFromSource(source) {
    if (!source || typeof source !== 'object') {
      return { headerType: 'NONE', headerText: '' };
    }
    const header = source.header;
    if (header && typeof header === 'object') {
      return {
        headerType: normalizeHeaderType(header.type),
        headerText: String(header.text || '').trim(),
      };
    }
    if (source.headerType) {
      return {
        headerType: normalizeHeaderType(source.headerType),
        headerText: String(source.headerText || '').trim(),
      };
    }
    return { headerType: 'NONE', headerText: '' };
  }

  function defaultButton(type = 'URL') {
    return { type: String(type || 'URL').toUpperCase(), text: '', url: '', phoneNumber: '' };
  }

  function normalizeButtons(buttons) {
    if (!Array.isArray(buttons)) return [];
    return buttons.map((btn) => {
      const type = String(btn?.type || btn?.sub_type || 'QUICK_REPLY').toUpperCase();
      return {
        type,
        text: String(btn?.text || '').trim(),
        url: String(btn?.url || btn?.value || '').trim(),
        phoneNumber: String(btn?.phoneNumber || btn?.phone_number || btn?.phone || '').trim(),
      };
    });
  }

  function parseTemplateComponents(source) {
    if (!source) return emptyComponents();
    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (!trimmed) return emptyComponents();
      try {
        return parseTemplateComponents(JSON.parse(trimmed));
      } catch (_e) {
        return emptyComponents();
      }
    }
    if (typeof source === 'object' && !Array.isArray(source)) {
      if ('footer' in source || 'buttons' in source || 'header' in source || 'headerType' in source) {
        const header = parseHeaderFromSource(source);
        return {
          ...header,
          footer: parseFooterValue(source.footer),
          buttons: normalizeButtons(source.buttons),
        };
      }
    }
    if (Array.isArray(source)) {
      let footer = '';
      let buttons = [];
      let headerType = 'NONE';
      let headerText = '';
      source.forEach((comp) => {
        const type = String(comp?.type || '').toUpperCase();
        if (type === 'FOOTER') footer = String(comp.text || comp.footer || '');
        if (type === 'HEADER') {
          headerType = normalizeHeaderType(comp.format || comp.headerType || comp.type);
          headerText = String(comp.text || '').trim();
        }
        if (type === 'BUTTONS' || type === 'BUTTON') {
          buttons = normalizeButtons(comp.buttons || (comp.text ? [comp] : []));
        }
      });
      return { headerType, headerText, footer, buttons };
    }
    return emptyComponents();
  }

  function resolveTemplateComponents(item) {
    if (!item || typeof item !== 'object') return emptyComponents();
    const candidates = [
      item.templateComponents,
      item.whatsappComponents,
      item.draftComponents,
      item.components,
      item.metaComponents,
      item.structure?.components,
      item.draft?.templateComponents,
      item.template?.components,
      item.template?.templateComponents,
      item.preview?.templateComponents,
      item.preview?.components,
    ];
    let best = emptyComponents();
    candidates.forEach((candidate) => {
      const parsed = parseTemplateComponents(candidate);
      if (best.headerType === 'NONE' && parsed.headerType !== 'NONE') {
        best = { ...best, headerType: parsed.headerType, headerText: parsed.headerText };
      }
      if (!best.footer && parsed.footer) best = { ...best, footer: parsed.footer };
      if (!best.buttons.length && parsed.buttons.length) best = { ...best, buttons: parsed.buttons };
    });
    if (item.headerType && best.headerType === 'NONE') {
      best = { ...best, headerType: normalizeHeaderType(item.headerType) };
    }
    if (!best.footer && !best.buttons.length && best.headerType === 'NONE'
      && ('footer' in item || 'buttons' in item || 'header' in item)) {
      return parseTemplateComponents(item);
    }
    if (best.footer || best.buttons.length || best.headerType !== 'NONE') return best;
    return parseTemplateComponents(item.templateComponents);
  }

  function buildTemplateComponentsPayload(footer, buttons, headerType, headerText) {
    const cleanFooter = String(footer || '').trim();
    const cleanButtons = normalizeButtons(buttons).filter((btn) => {
      if (!btn.text) return false;
      if (btn.type === 'URL') return Boolean(btn.url);
      if (btn.type === 'PHONE_NUMBER') return Boolean(btn.phoneNumber);
      return true;
    });
    const type = normalizeHeaderType(headerType);
    const cleanHeaderText = String(headerText || '').trim();
    const hasHeader = type !== 'NONE' && (type !== 'TEXT' || cleanHeaderText);
    if (!cleanFooter && !cleanButtons.length && !hasHeader) return null;

    const payload = {};
    if (hasHeader) {
      payload.header = type === 'TEXT'
        ? { type: 'TEXT', text: cleanHeaderText }
        : { type };
    }
    if (cleanFooter) payload.footer = { text: cleanFooter };
    if (cleanButtons.length) {
      payload.buttons = cleanButtons.map((btn) => {
        if (btn.type === 'URL') {
          return { type: 'URL', text: btn.text, url: btn.url };
        }
        if (btn.type === 'PHONE_NUMBER') {
          return { type: 'PHONE_NUMBER', text: btn.text, phoneNumber: btn.phoneNumber };
        }
        return { type: 'QUICK_REPLY', text: btn.text };
      });
    }
    return payload;
  }

  function buildMetaStyleComponents(footer, buttons, body, headerType, headerText) {
    const cleanFooter = String(footer || '').trim();
    const cleanButtons = normalizeButtons(buttons).filter((btn) => {
      if (!btn.text) return false;
      if (btn.type === 'URL') return Boolean(btn.url);
      if (btn.type === 'PHONE_NUMBER') return Boolean(btn.phoneNumber);
      return true;
    });
    const type = normalizeHeaderType(headerType);
    const cleanHeaderText = String(headerText || '').trim();
    const components = [];
    const bodyText = String(body || '').trim();

    if (type === 'TEXT' && cleanHeaderText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: cleanHeaderText });
    } else if (headerTypeRequiresMediaAsset(type)) {
      components.push({ type: 'HEADER', format: type });
    }
    if (bodyText) {
      components.push({ type: 'BODY', text: bodyText });
    }
    if (cleanFooter) {
      components.push({ type: 'FOOTER', text: cleanFooter });
    }
    if (cleanButtons.length) {
      components.push({
        type: 'BUTTONS',
        buttons: cleanButtons.map((btn) => {
          if (btn.type === 'URL') {
            return { type: 'URL', text: btn.text, url: btn.url };
          }
          if (btn.type === 'PHONE_NUMBER') {
            return {
              type: 'PHONE_NUMBER',
              text: btn.text,
              phone_number: btn.phoneNumber,
              phoneNumber: btn.phoneNumber,
            };
          }
          return { type: 'QUICK_REPLY', text: btn.text };
        }),
      });
    }
    return components;
  }

  /** Inclui templateComponents + components (Meta) no POST/PATCH — api-engage pode persistir um ou outro. */
  function attachTemplateComponentsToPayload(payload, footer, buttons, body, headerType, headerText) {
    const rawButtons = normalizeButtons(buttons);
    const templateComponents = buildTemplateComponentsPayload(footer, buttons, headerType, headerText);
    const metaComponents = buildMetaStyleComponents(footer, buttons, body, headerType, headerText);
    const type = normalizeHeaderType(headerType);

    if (templateComponents) {
      payload.templateComponents = templateComponents;
      payload.whatsappComponents = templateComponents;
      if (type !== 'NONE') payload.headerType = type;
    } else if (!rawButtons.length && type === 'NONE') {
      payload.templateComponents = null;
    } else {
      payload.templateComponents = buildTemplateComponentsPayload(footer, buttons, headerType, headerText)
        || { header: type !== 'NONE' ? { type } : undefined, footer: null, buttons: [] };
    }

    if (metaComponents.length) {
      payload.components = metaComponents;
      payload.structure = { components: metaComponents };
    }
    return payload;
  }

  function readComponentsFromState(footer, buttons, headerType, headerText) {
    return {
      headerType: normalizeHeaderType(headerType),
      headerText: String(headerText || '').trim(),
      footer: String(footer || '').trim(),
      buttons: normalizeButtons(buttons),
    };
  }

  function lintTemplateComponents(footer, buttons, headerType, headerText) {
    const items = [];
    const foot = String(footer || '').trim();
    const list = normalizeButtons(buttons).filter((btn) => btn.text || btn.url || btn.phoneNumber);
    const type = normalizeHeaderType(headerType);
    const hText = String(headerText || '').trim();

    if (type === 'TEXT') {
      if (!hText) {
        items.push({ severity: 'error', code: 'header_text_required', message: 'Cabeçalho de texto exige conteúdo.' });
      } else if (hText.length > HEADER_TEXT_MAX) {
        items.push({
          severity: 'error',
          code: 'header_text_long',
          message: `Cabeçalho: máximo ${HEADER_TEXT_MAX} caracteres.`,
        });
      }
    }

    if (foot.length > FOOTER_MAX) {
      items.push({ severity: 'error', code: 'footer_long', message: `Rodapé: máximo ${FOOTER_MAX} caracteres.` });
    }

    if (list.length > MAX_BUTTONS) {
      items.push({ severity: 'error', code: 'too_many_buttons', message: `Máximo ${MAX_BUTTONS} botões por template.` });
    }

    const types = new Set(list.map((btn) => btn.type));
    const hasQuick = types.has('QUICK_REPLY');
    const hasCta = types.has('URL') || types.has('PHONE_NUMBER');
    if (hasQuick && hasCta) {
      items.push({
        severity: 'error',
        code: 'button_mix',
        message: 'Não misture Quick Reply com URL/Telefone no mesmo template.',
      });
    }

    list.forEach((btn, index) => {
      const n = index + 1;
      if (!btn.text) {
        items.push({ severity: 'error', code: `btn_${n}_text`, message: `Botão ${n}: texto obrigatório.` });
      } else if (btn.text.length > BUTTON_TEXT_MAX) {
        items.push({
          severity: 'error',
          code: `btn_${n}_text_long`,
          message: `Botão ${n}: texto máximo ${BUTTON_TEXT_MAX} caracteres.`,
        });
      }
      if (btn.type === 'URL') {
        if (!btn.url) {
          items.push({ severity: 'error', code: `btn_${n}_url`, message: `Botão ${n}: URL HTTPS obrigatória.` });
        } else if (!HTTPS_RE.test(btn.url)) {
          items.push({
            severity: 'error',
            code: `btn_${n}_url_https`,
            message: `Botão ${n}: URL deve começar com https://`,
          });
        }
      }
      if (btn.type === 'PHONE_NUMBER') {
        if (!btn.phoneNumber) {
          items.push({ severity: 'error', code: `btn_${n}_phone`, message: `Botão ${n}: telefone obrigatório.` });
        } else if (!PHONE_RE.test(btn.phoneNumber)) {
          items.push({
            severity: 'warning',
            code: `btn_${n}_phone_format`,
            message: `Botão ${n}: prefira formato internacional (+55…).`,
          });
        }
      }
    });

    return {
      severity: items.some((i) => i.severity === 'error')
        ? 'error'
        : (items.some((i) => i.severity === 'warning') ? 'warning' : 'ok'),
      items,
      hasErrors: items.some((i) => i.severity === 'error'),
    };
  }

  function renderWhatsAppPreview(body, variables, components, options) {
    const parsed = typeof components === 'object' && components
      ? readComponentsFromState(
        components.footer,
        components.buttons,
        components.headerType,
        components.headerText,
      )
      : parseTemplateComponents(components);
    const sampleAsset = options?.sampleAsset || null;
    const headerMediaUrl = String(
      sampleAsset?.publicUrl || sampleAsset?.url || sampleAsset?.previewUrl || '',
    ).trim();
    const headerMediaName = String(
      sampleAsset?.name || sampleAsset?.fileName || sampleAsset?.originalName || 'documento.pdf',
    ).trim();
    return {
      message: renderTemplatePreview(body, variables),
      footer: parsed.footer,
      buttons: parsed.buttons.filter((btn) => btn.text),
      headerType: parsed.headerType,
      headerText: parsed.headerText,
      headerMediaUrl,
      headerMediaName,
    };
  }

  window.EngageTemplatesUtils = {
    FOOTER_MAX,
    HEADER_TEXT_MAX,
    HEADER_TYPE_OPTIONS,
    BUTTON_TEXT_MAX,
    MAX_BUTTONS,
    BUTTON_TYPE_LABELS,
    slugifyTemplateName,
    normalizePurpose,
    buildTemplateName,
    extractPlaceholderIndices,
    placeholderIndexGaps,
    hasInvalidPlaceholders,
    lintTemplateContent,
    lintTemplateComponents,
    renderTemplatePreview,
    renderWhatsAppPreview,
    parseTemplateComponents,
    resolveTemplateComponents,
    buildTemplateComponentsPayload,
    buildMetaStyleComponents,
    attachTemplateComponentsToPayload,
    readComponentsFromState,
    normalizeButtons,
    defaultButton,
    normalizeHeaderType,
    headerTypeRequiresMediaAsset,
    mediaAssetTypeForHeader,
    emptyComponents,
    syncVariablesFromBody,
    suggestVariableName,
    defaultSampleForKey,
    statusTone,
    resolveTenantDisplayName,
    deriveTenantPrefix,
    isEditableStatus,
  };
})();
