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
      items.push({ severity: 'error', code: 'link_found', message: 'Remova links do corpo — o cliente responde nesta conversa.' });
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

  window.EngageTemplatesUtils = {
    slugifyTemplateName,
    normalizePurpose,
    buildTemplateName,
    extractPlaceholderIndices,
    placeholderIndexGaps,
    hasInvalidPlaceholders,
    lintTemplateContent,
    renderTemplatePreview,
    syncVariablesFromBody,
    suggestVariableName,
    defaultSampleForKey,
    statusTone,
    resolveTenantDisplayName,
    deriveTenantPrefix,
    isEditableStatus,
  };
})();
