/**
 * Engage Solar — Audiências (dashboard analítico).
 * BFF: GET /api/operator/engage/audiences/dashboard
 */
(function () {
  const adminApi = () => window.ReservaAiApi || window.EngageSolarApi;
  const hubApi = () => window.EngageContactHubApi;

  const ORIGIN_LABELS = {
    meta_ads: 'Meta Ads',
    google_ads: 'Google Ads',
    site_forms: 'Site / Formulários',
    referral: 'Indicação',
    import: 'Importação',
    crm: 'CRM NeuraFlow',
    manual: 'Manual / API',
    other: 'Outros',
  };

  function readExternalTokenClaims(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      return JSON.parse(atob(padded));
    } catch (_) {
      return null;
    }
  }

  function getDefaultTenantId(session) {
    const fromResolver = window.ReservaPermissions?.resolveEffectiveTenantId?.(session);
    if (fromResolver) return String(fromResolver).trim();
    const direct = String(
      session?.activeTenantId
      || session?.tenantId
      || session?.tenant?.id
      || session?.tenant?.tenantId
      || '',
    ).trim();
    if (direct) return direct;
    const claims = readExternalTokenClaims(session?.externalAccessToken);
    const fromJwt = String(claims?.tenantId || claims?.tenant_id || '').trim();
    if (fromJwt) return fromJwt;
    const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
    const first = tenants.find((t) => t && (t.id || t.tenantId));
    return String(first?.id || first?.tenantId || '').trim();
  }

  function tenantQuery(session, extra) {
    const tenantId = getDefaultTenantId(session);
    if (!tenantId) return '';
    const params = new URLSearchParams({ tenantId, ...(extra || {}) });
    return params.toString();
  }

  async function apiGet(paths, session) {
    const api = adminApi();
    if (!api?.request) throw new Error('API indisponível.');
    const list = Array.isArray(paths) ? paths : [paths];
    let lastErr = null;
    for (const path of list) {
      try {
        return await api.request(path, {
          method: 'GET',
          cache: 'no-store',
          session,
        });
      } catch (err) {
        lastErr = err;
        if (Number(err?.statusCode || err?.status || 0) !== 404) throw err;
      }
    }
    throw lastErr || new Error('Rota Engage não encontrada.');
  }

  function buildDashboardPaths(session, extraQuery) {
    const qs = tenantQuery(session, extraQuery);
    const encTenant = encodeURIComponent(getDefaultTenantId(session));
    return [
      `/api/operator/engage/audiences/dashboard?${qs}`,
      `/api/operator/engage/tenants/${encTenant}/audiences/dashboard?${qs.replace(/tenantId=[^&]+&?/, '')}`,
    ];
  }

  function isoDateOnly(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function defaultDateRange() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from: isoDateOnly(from), to: isoDateOnly(to) };
  }

  function parseDateOnly(iso) {
    const raw = String(iso || '').trim().slice(0, 10);
    if (!raw) return null;
    const d = new Date(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function rangeFromDays(days, endIso) {
    const end = parseDateOnly(endIso) || new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (Math.max(1, Number(days)) - 1));
    return { from: isoDateOnly(start), to: isoDateOnly(end) };
  }

  function minDateStr(a, b) {
    const left = String(a || '').slice(0, 10);
    const right = String(b || '').slice(0, 10);
    if (!left) return right;
    if (!right) return left;
    return left <= right ? left : right;
  }

  function filterGrowthSeriesByWindow(series, windowKey, endIso) {
    const rows = Array.isArray(series) ? series : [];
    if (!rows.length) return rows;
    const days = windowKey === '7d' ? 7 : 30;
    const { from, to } = rangeFromDays(days, endIso);
    const start = parseDateOnly(from);
    const end = parseDateOnly(to);
    if (!start || !end) return rows;

    const filtered = rows.filter((row) => {
      const d = parseDateOnly(row.date);
      return d && d >= start && d <= end;
    });
    return filtered.length ? filtered : rows;
  }

  function prepareGrowthChartSeries(series, windowKey, totalContacts, endIso) {
    const filtered = filterGrowthSeriesByWindow(series, windowKey, endIso);
    return enrichGrowthSeries(filtered, totalContacts);
  }

  /** API mistura fração (0–1) e percentual (0–100); normaliza para exibição 0–100. */
  function toPercentDisplay(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n > 0 && n <= 1) return n * 100;
    return n;
  }

  function rateFromCounts(responded, sent, fallbackRate) {
    const r = Number(responded || 0);
    const s = Number(sent || 0);
    if (s > 0) return (r / s) * 100;
    return toPercentDisplay(fallbackRate);
  }

  function normalizeQuality(raw, totalContacts) {
    const q = raw || {};
    const keys = ['valid', 'invalid', 'optOut', 'duplicates'];
    const buckets = keys.map((key) => ({
      key,
      count: Number(q[key]?.count ?? 0),
      pct: Number(q[key]?.pct ?? 0),
    }));
    const qualityBase = buckets
      .filter((b) => b.key !== 'duplicates')
      .reduce((sum, b) => sum + b.count, 0);
    const denominator = qualityBase > 0
      ? qualityBase
      : Number(totalContacts || 0);

    const normalized = {};
    buckets.forEach((bucket) => {
      let pct = toPercentDisplay(bucket.pct);
      if (bucket.count > 0 && denominator > 0) {
        pct = (bucket.count / denominator) * 100;
      }
      normalized[bucket.key] = { count: bucket.count, pct };
    });

    const valid = normalized.valid?.count ?? 0;
    const invalid = normalized.invalid?.count ?? 0;
    const optOut = normalized.optOut?.count ?? 0;
    const scoreBase = valid + invalid + optOut;
    let scorePct = toPercentDisplay(q.score);
    if (scoreBase > 0) {
      scorePct = (valid / scoreBase) * 100;
    }

    return {
      score: scorePct,
      scoreLabel: String(q.scoreLabel || '—').trim(),
      valid: normalized.valid,
      invalid: normalized.invalid,
      optOut: normalized.optOut,
      duplicates: normalized.duplicates,
      note: String(q.note || '').trim(),
    };
  }

  function normalizeOrigins(origins, totalContacts) {
    const rows = (Array.isArray(origins) ? origins : []).map((row) => {
      const originId = String(row?.originId || row?.id || 'other').trim();
      return {
        originId,
        labelPt: String(row?.labelPt || ORIGIN_LABELS[originId] || originId).trim(),
        count: Number(row?.count ?? 0),
        pct: Number(row?.pct ?? 0),
      };
    });
    const sumCounts = rows.reduce((sum, row) => sum + row.count, 0);
    const base = Number(totalContacts) > 0 ? Number(totalContacts) : sumCounts;
    return rows.map((row) => {
      let pct = toPercentDisplay(row.pct);
      if (row.count > 0 && base > 0) {
        pct = (row.count / base) * 100;
      }
      return { ...row, pct };
    });
  }

  function normalizeOriginPerformance(row) {
    const originId = String(row?.originId || 'other').trim();
    const sent = Number(row?.sent ?? row?.messagesSent ?? 0);
    const responded = Number(row?.responded ?? row?.replies ?? row?.uniqueRepliers ?? 0);
    return {
      originId,
      labelPt: String(row?.labelPt || ORIGIN_LABELS[originId] || originId).trim(),
      sent,
      responded,
      responseRate: rateFromCounts(responded, sent, row?.responseRate),
    };
  }

  function normalizeAudienceItem(row) {
    if (!row || typeof row !== 'object') return null;
    const lastCampaign = row.lastCampaign || null;
    const contactCount = Number(
      row.contactCount ?? row.memberCount ?? row.matchingContacts ?? row.lastMatchCount ?? 0,
    );
    const sent = Number(
      row.messagesSent ?? row.sent ?? row.sentCount ?? row.dispatched ?? 0,
    );
    const responded = Number(
      row.replies ?? row.responded ?? row.repliesCount ?? row.uniqueRepliers ?? 0,
    );
    let responseRate = rateFromCounts(responded, sent, row.responseRate);
    if (!sent && contactCount > 0 && responded > 0) {
      responseRate = (responded / contactCount) * 100;
    }

    return {
      id: String(row.id || '').trim(),
      name: String(row.name || '—').trim(),
      description: String(row.description || '').trim(),
      sourceType: String(row.sourceType || row.type || '').trim(),
      statusTag: String(row.statusTag || '').trim(),
      statusTagLabelPt: String(row.statusTagLabelPt || '').trim(),
      primaryOriginId: String(row.primaryOriginId || 'other').trim(),
      primaryOriginLabelPt: String(
        row.primaryOriginLabelPt || ORIGIN_LABELS[row.primaryOriginId] || 'Outros',
      ).trim(),
      contactCount,
      lastCampaign: lastCampaign
        ? {
          id: String(lastCampaign.id || '').trim(),
          name: String(lastCampaign.name || '—').trim(),
          sentAt: lastCampaign.sentAt || null,
          relativeLabelPt: String(lastCampaign.relativeLabelPt || '').trim(),
        }
        : null,
      responseRate,
      updatedAt: row.updatedAt || null,
      createdAt: row.createdAt || null,
    };
  }

  function normalizeSummary(summary, originPerformance) {
    const s = summary || {};
    const perf = Array.isArray(originPerformance) ? originPerformance : [];
    const perfSent = perf.reduce((sum, row) => sum + Number(row.sent || 0), 0);
    const perfResponded = perf.reduce((sum, row) => sum + Number(row.responded || 0), 0);
    const totalContacts = Number(s.totalContacts ?? 0);
    const optOutCount = Number(s.optOutCount ?? 0);

    let responseRate = rateFromCounts(perfResponded, perfSent, s.responseRate);
    if (!perfSent) {
      responseRate = toPercentDisplay(s.responseRate);
    }

    let optOutPct = toPercentDisplay(s.optOutPct);
    if (optOutCount > 0 && totalContacts > 0) {
      optOutPct = (optOutCount / totalContacts) * 100;
    }

    return {
      totalContacts,
      newContacts: Number(s.newContacts ?? 0),
      newContactsDeltaPct: Number(s.newContactsDeltaPct ?? 0),
      responseRate,
      responseRateDeltaPct: Number(s.responseRateDeltaPct ?? 0),
      campaignsSent: Number(s.campaignsSent ?? 0),
      campaignsSentDelta: Number(s.campaignsSentDelta ?? 0),
      optOutCount,
      optOutPct,
    };
  }

  function applyGrowthBaseline(rows, totalContacts) {
    const sumNew = rows.reduce((s, r) => s + r.newContacts, 0);
    const baseline = Math.max(0, totalContacts - sumNew);
    let running = baseline;
    return rows.map((row) => {
      running += row.newContacts;
      return { ...row, totalEligible: running };
    });
  }

  /** Garante série acumulada da base (alinha com card Total de contatos). */
  function enrichGrowthSeries(series, totalContacts) {
    const rows = (Array.isArray(series) ? series : []).map((point) => ({
      date: String(point.date || '').trim(),
      newContacts: Number(point.newContacts ?? 0),
      totalEligible: Number(point.totalEligible ?? 0),
    }));
    if (!rows.length) return rows;

    const total = Number(totalContacts || 0);
    const sumNew = rows.reduce((s, r) => s + r.newContacts, 0);
    const lastEligible = rows[rows.length - 1]?.totalEligible ?? 0;
    const maxEligible = rows.reduce((m, r) => Math.max(m, r.totalEligible), 0);

    const looksLikeNewOnly = maxEligible > 0
      && (Math.abs(maxEligible - sumNew) < 1 || lastEligible < total * 0.5);
    const missingEligible = maxEligible <= 0;

    if (total > 0 && (missingEligible || looksLikeNewOnly)) {
      return applyGrowthBaseline(rows, total);
    }

    if (total > 0 && lastEligible > 0 && lastEligible < total) {
      const offset = total - lastEligible;
      return rows.map((row) => ({
        ...row,
        totalEligible: row.totalEligible + offset,
      }));
    }

    return rows;
  }

  function normalizeDashboard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const summaryRaw = raw.summary || {};
    const growthSeriesRaw = Array.isArray(raw.growth?.series) ? raw.growth.series : [];
    const originPerformance = (Array.isArray(raw.originPerformance)
      ? raw.originPerformance
      : []).map(normalizeOriginPerformance);
    const summary = normalizeSummary(summaryRaw, originPerformance);
    const growthSeries = enrichGrowthSeries(growthSeriesRaw, summary.totalContacts);
    const origins = normalizeOrigins(raw.origins, summary.totalContacts);
    const audienceItems = Array.isArray(raw.audiences?.items)
      ? raw.audiences.items
      : Array.isArray(raw.items) ? raw.items : [];
    const meta = raw.audiences?.meta || raw.meta || {};

    return {
      partial: false,
      fetchedAt: raw.fetchedAt || null,
      window: raw.window || null,
      summary,
      growth: {
        granularity: String(raw.growth?.granularity || 'day').trim(),
        series: growthSeries,
        seriesFull: growthSeries,
      },
      origins,
      originPerformance,
      quality: normalizeQuality(raw.quality, summary.totalContacts),
      audiences: {
        items: audienceItems.map(normalizeAudienceItem).filter(Boolean),
        meta: {
          total: Number(meta.total ?? audienceItems.length),
          page: Number(meta.page ?? 1),
          limit: Number(meta.limit ?? 5),
        },
      },
    };
  }

  async function buildPartialDashboard(session, params) {
    const audiencesRaw = await hubApi().listAudiences(session, {
      limit: String(params?.limit || 25),
      page: String(params?.page || 1),
      sort: params?.sort || 'updatedAt',
      sortDir: params?.sortDir || 'desc',
    }).catch(() => ({ items: [] }));

    let responseCenter = null;
    try {
      responseCenter = await window.EngageRepliesCenterApi?.load?.(session, { window: '7d' });
    } catch (_) {
      responseCenter = null;
    }

    const items = Array.isArray(audiencesRaw?.items)
      ? audiencesRaw.items
      : Array.isArray(audiencesRaw) ? audiencesRaw : [];
    const totalMembers = items.reduce(
      (sum, row) => sum + Number(row.memberCount ?? row.matchingContacts ?? 0),
      0,
    );
    const sent = Number(responseCenter?.summary?.messagesSent ?? 0);
    const replies = Number(responseCenter?.summary?.repliesReceived ?? 0);
    const responseRate = sent > 0 ? (replies / sent) * 100 : 0;

    return {
      partial: true,
      fetchedAt: new Date().toISOString(),
      window: null,
      summary: {
        totalContacts: totalMembers,
        newContacts: 0,
        newContactsDeltaPct: 0,
        responseRate,
        responseRateDeltaPct: 0,
        campaignsSent: Number(responseCenter?.summary?.activeCampaigns ?? 0),
        campaignsSentDelta: 0,
        optOutCount: 0,
        optOutPct: 0,
      },
      growth: { granularity: 'day', series: [], seriesFull: [] },
      origins: items.length
        ? [{ originId: 'import', labelPt: 'Importação', count: totalMembers, pct: 100 }]
        : [],
      originPerformance: [],
      quality: {
        score: totalMembers ? 100 : 0,
        scoreLabel: '—',
        valid: { count: totalMembers, pct: totalMembers ? 100 : 0 },
        invalid: { count: 0, pct: 0 },
        optOut: { count: 0, pct: 0 },
        duplicates: { count: 0, pct: 0 },
        note: '',
      },
      audiences: {
        items: items.map((row) => normalizeAudienceItem({
          id: row.id,
          name: row.name,
          sourceType: row.sourceType || row.type,
          contactCount: row.memberCount ?? row.matchingContacts,
          updatedAt: row.updatedAt,
          createdAt: row.createdAt,
          primaryOriginId: 'import',
          primaryOriginLabelPt: 'Importação',
        })).filter(Boolean),
        meta: {
          total: Number(audiencesRaw?.total ?? items.length),
          page: Number(params?.page || 1),
          limit: Number(params?.limit || 5),
        },
      },
    };
  }

  async function fetchGrowthSeriesExtended(session, toolbarRange, totalContacts) {
    const extended = rangeFromDays(30, toolbarRange.to);
    if (extended.from >= toolbarRange.from) {
      return null;
    }
    const extra = {
      from: extended.from,
      to: toolbarRange.to,
      window: '30d',
      limit: '1',
      page: '1',
    };
    const raw = await apiGet(buildDashboardPaths(session, extra), session);
    const series = Array.isArray(raw?.growth?.series) ? raw.growth.series : [];
    if (!series.length) return null;
    return enrichGrowthSeries(series, totalContacts);
  }

  async function load(session, options = {}) {
    const range = options.from && options.to
      ? { from: options.from, to: options.to }
      : defaultDateRange();
    const extra = {
      from: range.from,
      to: range.to,
      page: String(options.page || 1),
      limit: String(options.limit || 5),
      sort: options.sort || 'updatedAt',
      sortDir: options.sortDir || 'desc',
    };
    Object.keys(extra).forEach((key) => {
      if (!extra[key]) delete extra[key];
    });

    try {
      const raw = await apiGet(buildDashboardPaths(session, extra), session);
      const normalized = normalizeDashboard(raw);
      try {
        const extendedGrowth = await fetchGrowthSeriesExtended(
          session,
          range,
          normalized.summary.totalContacts,
        );
        if (extendedGrowth?.length) {
          normalized.growth.seriesFull = extendedGrowth;
        }
      } catch (_) {
        /* série principal já disponível */
      }
      return normalized;
    } catch (err) {
      const status = Number(err?.statusCode || err?.status || 0);
      if (status !== 404) throw err;
      return buildPartialDashboard(session, extra);
    }
  }

  window.EngageAudiencesDashboardApi = {
    getDefaultTenantId,
    defaultDateRange,
    toPercentDisplay,
    prepareGrowthChartSeries,
    load,
    normalizeDashboard,
    ORIGIN_LABELS,
  };
})();
