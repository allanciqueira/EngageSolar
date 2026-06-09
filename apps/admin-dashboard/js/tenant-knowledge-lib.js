/**
 * Constantes KB complementar (paridade NeuraFlow tenant-knowledge.ts)
 */
(function () {
  const ALLOWED = ['Empresa', 'Pagamento', 'Estacionamento', 'Promoção', 'FAQ', 'Observação', 'Localização', 'Outros'];

  const BLOCKED_CATEGORY_PATTERNS = [
    /^hor[aá]rio(s)?$/i,
    /^servi[cç]o(s)?$/i,
    /^profissional(es)?$/i,
    /^agenda$/i,
    /^disponibilidade$/i,
    /^business_hours$/i,
    /^horarios_atendimento$/i,
    /^precos?$/i,
    /^pre[cç]os?$/i,
  ];

  /** Títulos típicos de cards operacionais legados (demo/produção). */
  const OPERATIONAL_LEGACY_TITLE_PATTERNS = [
    /^hor[aá]rio(s)?\s+(de\s+)?funcionamento$/i,
    /^hor[aá]rios?(\s+de\s+atendimento)?$/i,
    /^pre[cç]os?\s+e\s+combos?$/i,
    /^pre[cç]os?(\s+oficiais?)?$/i,
    /^servi[cç]os?(\s+oferecidos?)?$/i,
    /^pol[ií]ticas?\s+e\s+agendamento$/i,
    /^cat[aá]logo\s+de\s+servi[cç]os?$/i,
    /^lista\s+de\s+servi[cç]os?$/i,
    /^agenda(\s+de\s+atendimento)?$/i,
    /^disponibilidade(\s+de\s+hor[aá]rios?)?$/i,
  ];

  const OPERATIONAL_TEXT_PATTERNS = [
    /\bhor[aá]rio de funcionamento\b/i,
    /\bfuncionamos\b.{0,40}\b(seg|ter|qua|qui|sex|s[aá]b|dom)\b/i,
    /\bcat[aá]logo de servi[cç]os\b/i,
    /\blista de servi[cç]os\b/i,
    /\bpre[cç]o(s)?\s+(do|da|de)\s+servi[cç]o\b/i,
    /\bcorte\s+(masculino|feminino|barba)\s+r\$\s*\d/i,
    /\bprofissionais?\b.{0,30}\batende(m)?\b/i,
    /\bagendamento\b.{0,40}\b(slot|vaga|hor[aá]rio dispon[ií]vel)\b/i,
    /\bdura[cç][aã]o\b.{0,30}\bminutos\b.{0,30}\bservi[cç]o\b/i,
  ];

  const COMPLEMENTARY_CATEGORY_ALIASES = {
    premiações: 'Promoção',
    premiacoes: 'Promoção',
    promocoes: 'Promoção',
  };

  const TENANT_KB_ORGANIZATION_SUMMARY =
    'Como organizar: um assunto por vez; título = pergunta ou tema; informação = resposta clara em 1 a 3 frases. Horários, serviços, profissionais e agenda são geridos nas áreas operacionais — não cadastre isso aqui.';

  const TENANT_KB_PAGE_LEAD =
    'Cadastre detalhes complementares (estacionamento, formas de pagamento, promoções, políticas, etc.) para o atendimento automático. Horários, serviços, profissionais e agenda continuam sendo geridos nas áreas operacionais do sistema.';

  const TENANT_KB_SELECT_OPTIONS = [
    { value: 'Empresa', label: 'Empresa — ambiente, políticas, diferenciais' },
    { value: 'Pagamento', label: 'Pagamento — Pix, cartão, parcelamento' },
    { value: 'Estacionamento', label: 'Estacionamento — vagas, custo, acesso' },
    { value: 'Promoção', label: 'Promoção — campanhas e fidelidade' },
    { value: 'FAQ', label: 'FAQ — pergunta do cliente + resposta' },
    { value: 'Observação', label: 'Observação — avisos e exceções' },
    { value: 'Localização', label: 'Localização — endereço e como chegar' },
    { value: 'Outros', label: 'Outros — demais informações' },
  ];

  const TENANT_KB_TYPE_GUIDES = {
    Empresa: {
      whenToUse: 'Ambiente, políticas e diferenciais do estabelecimento.',
      titlePlaceholder: 'Ex.: Bebidas na recepção',
      contentPlaceholder: 'Ex.: Oferecemos água, café e chá de cortesia enquanto o cliente aguarda.',
      titleHint: 'Nome curto do tema.',
      contentHint: '1 a 3 frases factuais; máx. 500 caracteres.',
    },
    Pagamento: {
      whenToUse: 'Formas de pagamento, parcelamento e gorjeta (texto informativo).',
      titlePlaceholder: 'Ex.: Formas de pagamento',
      contentPlaceholder: 'Ex.: Aceitamos Pix, dinheiro, cartão de crédito e débito.',
      titleHint: 'Nome do tema de pagamento.',
      contentHint: 'Não substitui preços de serviços do catálogo.',
    },
    Estacionamento: {
      whenToUse: 'Vagas, custo e acesso ao estacionamento.',
      titlePlaceholder: 'Ex.: Estacionamento gratuito',
      contentPlaceholder: 'Ex.: Estacionamento gratuito para clientes no pátio lateral.',
      titleHint: 'Tema de estacionamento.',
      contentHint: 'Seja específico sobre custo e local.',
    },
    Promoção: {
      whenToUse: 'Campanhas, fidelidade e descontos (sem preços oficiais de serviços).',
      titlePlaceholder: 'Ex.: Indique um amigo',
      contentPlaceholder: 'Ex.: Quem indicar um novo cliente ganha 15% no próximo serviço.',
      titleHint: 'Nome da promoção.',
      contentHint: 'Promoções vencidas: desative em vez de apagar.',
    },
    FAQ: {
      whenToUse: 'Pergunta frequente do cliente e resposta direta.',
      titlePlaceholder: 'Ex.: Posso remarcar pelo WhatsApp?',
      contentPlaceholder: 'Ex.: Sim. Peça a remarcação por aqui informando nome e horário desejado.',
      titleHint: 'Escreva como o cliente pergunta.',
      contentHint: 'Informação = resposta objetiva.',
    },
    Observação: {
      whenToUse: 'Avisos, exceções e políticas pontuais.',
      titlePlaceholder: 'Ex.: Chegada atrasada',
      contentPlaceholder: 'Ex.: Atrasos acima de 15 minutos podem exigir reagendamento.',
      titleHint: 'Tema do aviso.',
      contentHint: 'Evite repetir regras da agenda.',
    },
    Localização: {
      whenToUse: 'Endereço e como chegar (texto).',
      titlePlaceholder: 'Ex.: Endereço completo',
      contentPlaceholder: 'Ex.: Rua das Palmeiras, 250, Loja 3 — Centro, São Paulo/SP.',
      titleHint: 'Tema de localização.',
      contentHint: 'Complementa mapas; não substitui unidades cadastradas.',
    },
    Outros: {
      whenToUse: 'Demais informações que não se encaixam nos tipos acima.',
      titlePlaceholder: 'Ex.: Wi-Fi para clientes',
      contentPlaceholder: 'Ex.: Rede “Salao-Visitante”; senha na recepção.',
      titleHint: 'Nome do tema.',
      contentHint: 'Mantenha curto e factual.',
    },
  };

  const TENANT_KB_EXAMPLES = {
    Empresa: [
      { title: 'Bebidas na recepção', content: 'Oferecemos água, café e chá de cortesia enquanto o cliente aguarda.' },
      { title: 'Política infantil', content: 'Atendemos menores acompanhados de responsável. Não fazemos serviço em crianças abaixo de 8 anos.' },
    ],
    Pagamento: [
      { title: 'Formas de pagamento', content: 'Aceitamos Pix, dinheiro, cartão de crédito e débito. Não aceitamos cheque.' },
      { title: 'Parcelamento no cartão', content: 'Parcelamos em até 3x sem juros para compras acima de R$ 100, conforme disponibilidade na maquininha.' },
    ],
    Estacionamento: [
      { title: 'Estacionamento gratuito', content: 'Estacionamento gratuito para clientes no pátio lateral (vagas limitadas).' },
      { title: 'Estacionamento na rua', content: 'Há vagas em zona azul na Rua das Flores; aplicativo Zona Azul aceito.' },
    ],
    Promoção: [
      { title: 'Indique um amigo', content: 'Quem indicar um novo cliente ganha 15% no próximo serviço (uma vez por indicação).' },
      { title: 'Desconto de aniversário', content: 'No mês do aniversário, 10% em qualquer serviço (não cumulativo).' },
    ],
    FAQ: [
      { title: 'Posso remarcar pelo WhatsApp?', content: 'Sim. Peça a remarcação por aqui informando nome e horário desejado.' },
      { title: 'Atendem sem agendamento?', content: 'Preferimos agendamento. Encaixes dependem da disponibilidade do dia.' },
    ],
    Observação: [
      { title: 'Chegada atrasada', content: 'Atrasos acima de 15 minutos podem exigir reagendamento, conforme disponibilidade.' },
      { title: 'Animais de estimação', content: 'Não permitimos animais no salão, exceto cães-guia identificados.' },
    ],
    Localização: [
      { title: 'Endereço completo', content: 'Rua das Palmeiras, 250, Loja 3 — Centro, São Paulo/SP. CEP 01310-000.' },
      { title: 'Como chegar de metrô', content: 'Saída República, 5 min a pé; virar à direita na praça.' },
    ],
    Outros: [
      { title: 'Wi-Fi para clientes', content: 'Rede “Salao-Visitante”; senha na recepção.' },
      { title: 'Idiomas no atendimento', content: 'Português; inglês básico sob disponibilidade.' },
    ],
  };

  function normalizeCategory(category) {
    const raw = String(category || '').trim();
    if (!raw) return 'Outros';
    if (BLOCKED_CATEGORY_PATTERNS.some((pattern) => pattern.test(raw))) {
      return '';
    }
    const alias = COMPLEMENTARY_CATEGORY_ALIASES[raw.toLowerCase()];
    if (alias) return alias;
    const exact = ALLOWED.find((item) => item.toLowerCase() === raw.toLowerCase());
    return exact || 'Outros';
  }

  function displayCategory(category) {
    const raw = String(category || '').trim();
    if (!raw) return 'Outros';
    if (/^premia/i.test(raw)) return 'Premiações';
    const normalized = normalizeCategory(raw);
    return normalized || 'Outros';
  }

  function categoryForApi(category) {
    const raw = String(category || '').trim();
    if (/^premia/i.test(raw)) return 'Promoção';
    const normalized = normalizeCategory(raw);
    return normalized || 'Outros';
  }

  function isBlockedCategory(category) {
    const raw = String(category || '').trim();
    if (!raw) return false;
    return BLOCKED_CATEGORY_PATTERNS.some((pattern) => pattern.test(raw));
  }

  function detectOperationalText(title, content, options = {}) {
    const allowPayment = options.allowPayment === true;
    const combined = `${String(title || '')}\n${String(content || '')}`;
    if (!allowPayment) {
      if (/\bcorte\s+.+\s+r\$\s*\d/i.test(combined) || /\bservi[cç]o\b.+\br\$\s*\d/i.test(combined)) {
        return true;
      }
    }
    return OPERATIONAL_TEXT_PATTERNS.some((pattern) => pattern.test(combined));
  }

  function isOperationalLegacyItem(item) {
    if (!item || typeof item !== 'object') return false;
    const rawCategory = String(item.categoryRaw ?? item.category ?? '').trim();
    const title = String(item.title || '').trim();
    const content = String(item.content || '').trim();

    if (isBlockedCategory(rawCategory)) return true;
    if (OPERATIONAL_LEGACY_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return true;
    if (/hor[aá]rio/i.test(title) && /funcionamento/i.test(title)) return true;
    if (/pre[cç]o/i.test(title) && /combo/i.test(title)) return true;
    if (/^servi[cç]os?$/i.test(title)) return true;
    if (/pol[ií]ticas?/i.test(title) && /agendamento/i.test(title)) return true;

    const allowPayment = /^pagamento$/i.test(rawCategory) || item.category === 'Pagamento';
    return detectOperationalText(title, content, { allowPayment });
  }

  function validateOperationalForm(form) {
    if (isBlockedCategory(form.type)) {
      return 'Tipo operacional não permitido na base complementar (use horários, serviços e agenda nas áreas operacionais).';
    }
    if (detectOperationalText(form.title, form.content, { allowPayment: form.type === 'Pagamento' })) {
      return 'Este assunto é operacional — use Serviços, Horários ou Agenda nas áreas operacionais. Não cadastre preços de serviço, catálogo ou disponibilidade aqui.';
    }
    if (OPERATIONAL_LEGACY_TITLE_PATTERNS.some((pattern) => pattern.test(String(form.title || '').trim()))) {
      return 'Este título é operacional — remova ou configure em Serviços/Horários.';
    }
    return '';
  }

  const OPERATIONAL_BANNER_MESSAGE =
    'Existem itens operacionais legados nesta lista. Remova ou desative-os — horários, preços de serviço, catálogo e agenda são configurados nas áreas operacionais do sistema.';

  window.ReservaAiTenantKnowledgeLib = {
    ALLOWED_CATEGORIES: ALLOWED,
    TENANT_KB_ORGANIZATION_SUMMARY,
    TENANT_KB_PAGE_LEAD,
    TENANT_KB_SELECT_OPTIONS,
    TENANT_KB_TYPE_GUIDES,
    TENANT_KB_EXAMPLES,
    CONTENT_MAX_LENGTH: 500,
    TITLE_MIN_LENGTH: 2,
    TITLE_MAX_LENGTH: 200,
    normalizeCategory,
    displayCategory,
    categoryForApi,
    isBlockedCategory,
    isOperationalLegacyItem,
    validateOperationalForm,
    detectOperationalText,
    OPERATIONAL_BANNER_MESSAGE,
  };
})();
