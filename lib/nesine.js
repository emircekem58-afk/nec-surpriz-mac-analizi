const BULLETIN_URL = 'https://bulten.nesine.com/api/bulten/getprebultenfull';

const SPORT_NAMES = { 1: 'Futbol', 5: 'Tenis' };

function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fallbackOutcomeLabel(market, oc) {
  const mtid = Number(market?.MTID || 0);
  const n = Number(oc?.N || 0);
  const spread = num(market?.SOV);
  if (mtid === 1) return ({1:'1',2:'X',3:'2'})[n] || `Seçenek ${n}`;
  if (mtid === 3) return ({1:'1X',2:'12',3:'X2'})[n] || `Seçenek ${n}`;
  if ([11,14,155,209].includes(mtid)) {
    const s = spread !== null ? ` ${spread}` : '';
    return n === 1 ? `Alt${s}` : n === 2 ? `Üst${s}` : `Seçenek ${n}`;
  }
  return `Seçenek ${n}`;
}

function normalizeMarket(market) {
  const outcomes = Array.isArray(market?.OCA) ? market.OCA.map((oc) => ({
    n: Number(oc?.N || 0),
    label: String(oc?.ON || fallbackOutcomeLabel(market, oc)),
    odds: num(oc?.O),
    no: oc?.NO ?? null
  })).filter(x => x.odds && x.odds > 1) : [];

  return {
    id: market?.ID ?? null,
    typeId: Number(market?.MTID || 0),
    name: String(market?.MN || `Market #${market?.MTID ?? '?'}`),
    spread: num(market?.SOV),
    status: market?.MS ?? null,
    inPlay: market?.INM === 1,
    outcomes
  };
}

function leagueMap(raw) {
  const m = new Map();
  const leagues = raw?.sg?.LA;
  if (Array.isArray(leagues)) {
    for (const item of leagues) {
      if (item?.LID != null && item?.N) m.set(item.LID, String(item.N));
    }
  }
  return m;
}

function normalizeEvent(ev, leagues) {
  const sportType = Number(ev?.TYPE || 0);
  const startTimestamp = num(ev?.ESD);
  const markets = Array.isArray(ev?.MA) ? ev.MA.map(normalizeMarket).filter(m => m.outcomes.length) : [];
  return {
    id: String(ev?.C ?? ev?.EV ?? `${ev?.HN || ''}-${ev?.AN || ''}-${startTimestamp || ''}`),
    eventId: ev?.EV ?? null,
    sportType,
    sport: SPORT_NAMES[sportType] || `Spor ${sportType}`,
    home: String(ev?.HN || ''),
    away: String(ev?.AN || ''),
    displayName: String(ev?.ENO || `${ev?.HN || ''} - ${ev?.AN || ''}`),
    leagueCode: ev?.LC ?? null,
    league: leagues.get(ev?.LC) || `Lig #${ev?.LC ?? '?'}`,
    date: String(ev?.D || ''),
    day: String(ev?.DAY || ''),
    time: String(ev?.T || ''),
    startTimestamp,
    live: ev?.LE === 1,
    markets,
    marketCount: markets.length
  };
}

async function fetchBulletin() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(BULLETIN_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; NEC-Analiz/2.1)'
      },
      cache: 'no-store',
      signal: ctrl.signal
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Kaynak HTTP ${res.status}`);
      err.status = res.status;
      err.preview = text.slice(0, 240);
      throw err;
    }
    let raw;
    try { raw = JSON.parse(text); }
    catch { throw new Error('Kaynak JSON formatında dönmedi'); }

    const events = raw?.sg?.EA;
    if (!Array.isArray(events)) throw new Error('Bülten şeması değişmiş: sg.EA bulunamadı');
    const leagues = leagueMap(raw);
    return events
      .filter(ev => [1,5].includes(Number(ev?.TYPE)) && (ev?.HN || ev?.ENO) && (ev?.AN || ev?.ENO))
      .map(ev => normalizeEvent(ev, leagues))
      .sort((a,b) => (a.startTimestamp || Number.MAX_SAFE_INTEGER) - (b.startTimestamp || Number.MAX_SAFE_INTEGER));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchBulletin };
