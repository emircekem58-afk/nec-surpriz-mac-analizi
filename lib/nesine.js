const BULLETIN_URL = 'https://bulten.nesine.com/api/bulten/getprebultenfull';

const SPORT_NAMES = { 1: 'Futbol', 5: 'Tenis' };

const COMMON_MARKET_NAMES = {
  1:'Maç Sonucu', 3:'Çifte Şans', 11:'Toplam Gol Alt/Üst', 14:'İlk Yarı Alt/Üst',
  38:'Karşılıklı Gol', 43:'Toplam Gol Aralığı', 49:'Tek/Çift', 100:'Handikaplı Maç Sonucu',
  182:'Maç Kazananı', 185:'Handikap', 216:'Toplam Korner Alt/Üst', 218:'Kart Puanı Alt/Üst',
  220:'En Çok Korner', 272:'Sonuç + Alt/Üst', 291:'İlk Golü Hangi Takım Atar?',
  338:'Maç Sonucu + KG', 414:'Maç Sonucu + KG', 418:'Asya Handikap', 424:'Toplam Korner Alt/Üst',
  426:'Korner Handikabı', 438:'Maç Sonucu + Alt/Üst', 446:'Alt/Üst + KG',
  583:'Toplam Korner Alt/Üst', 701:'Oyuncu Gol Atar', 702:'İlk Golü Atan Oyuncu',
  707:'Oyuncu Asist Yapar', 709:'Oyuncu Kart Görür', 712:'Oyuncu Asist Yapar',
  714:'Oyuncu Kaleyi Bulan Şut', 740:'Oyuncu Şut Çeker', 741:'Oyuncu Faul Alır',
  742:'Oyuncu Faul Yapar', 743:'Oyuncu Ofsayta Düşer', 765:'Oyuncu Gol veya Asist',
  798:'Korner Handikabı', 803:'Kaleci Kurtarış'
};

const TENNIS_MARKETS = {
  182:{name:'Maç Kazananı',kind:'match_winner'},
  183:{name:'1. Set Kazananı',kind:'set1_winner'},
  184:{name:'2. Set Kazananı',kind:'set2_winner'},
  185:{name:'Set Handikabı / Oyuncu Set Kazanır',kind:'set_cover'},
  187:{name:'Maç Set Skoru',kind:'set_score'},
  189:{name:'Toplam Oyun Alt/Üst',kind:'total_games'},
  190:{name:'1. Oyuncu Toplam Oyun',kind:'home_games_total'},
  191:{name:'2. Oyuncu Toplam Oyun',kind:'away_games_total'},
  237:{name:'Toplam Set / Maç Uzunluğu',kind:'total_sets'},
  239:{name:'Set Özel Bahsi',kind:'set_special'},
  312:{name:'Oyun Handikabı',kind:'game_handicap'},
  418:{name:'Tenis Özel - Set/Oyun',kind:'tennis_special'},
  420:{name:'Set Handikabı',kind:'set_handicap'},
  422:{name:'Kazanan + Toplam Oyun Kombosu',kind:'winner_total_combo'},
  424:{name:'Tenis Maç Özel',kind:'tennis_special'},
  426:{name:'1. Set / Maç Kazananı',kind:'set_match'},
  432:{name:'1. Set Özel',kind:'set_special'},
  434:{name:'2. Set Özel',kind:'set_special'},
  494:{name:'1. Set Doğru Skor',kind:'set_correct_score'}
};

function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function fmt(v){
  const n=Number(v||0);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/,'');
}
function signed(v){ const n=Number(v||0); return `${n>0?'+':''}${fmt(n)}`; }

function tennisMeta(mtid){ return TENNIS_MARKETS[Number(mtid)] || {name:'Diğer Tenis Bahsi',kind:'other'}; }

function marketName(market, sportType) {
  if (market?.MN) return String(market.MN);
  const mtid=Number(market?.MTID||0);
  if (sportType===5) return tennisMeta(mtid).name;
  return COMMON_MARKET_NAMES[mtid] || 'Diğer Bahis Marketi';
}

function fallbackOutcomeLabel(market, oc, ctx) {
  const mtid = Number(market?.MTID || 0);
  const n = Number(oc?.N || 0);
  const spread = num(market?.SOV);
  const home=ctx?.home||'1. Oyuncu';
  const away=ctx?.away||'2. Oyuncu';

  if (ctx?.sportType===5) {
    if ([182,183,184].includes(mtid)) return n===1?home:n===2?away:`Seçenek ${n}`;
    if ([312,420].includes(mtid) && spread!==null) {
      return n===1 ? `${home} (${signed(spread)})` : n===2 ? `${away} (${signed(-spread)})` : `Seçenek ${n}`;
    }
    if (mtid===189 && spread!==null) return n===1?`Alt ${fmt(spread)}`:n===2?`Üst ${fmt(spread)}`:`Seçenek ${n}`;
    if (mtid===190 && spread!==null) return n===1?`${home} Alt ${fmt(spread)}`:n===2?`${home} Üst ${fmt(spread)}`:`Seçenek ${n}`;
    if (mtid===191 && spread!==null) return n===1?`${away} Alt ${fmt(spread)}`:n===2?`${away} Üst ${fmt(spread)}`:`Seçenek ${n}`;
    if (mtid===187) return ({1:'2-0',2:'2-1',3:'1-2',4:'0-2'})[n] || `Set skoru ${n}`;
    if (mtid===426) return ({1:`${home} / ${home}`,2:`${home} / ${away}`,3:`${away} / ${home}`,4:`${away} / ${away}`})[n] || `Kombinasyon ${n}`;
    if (mtid===422 && spread!==null) return ({1:`${home} + Alt ${fmt(spread)}`,2:`${home} + Üst ${fmt(spread)}`,3:`${away} + Alt ${fmt(spread)}`,4:`${away} + Üst ${fmt(spread)}`})[n] || `Kombinasyon ${n}`;
    if ([185,237,239,418,424,432,434].includes(mtid)) return n===1?'1. seçenek':n===2?'2. seçenek':`Seçenek ${n}`;
    if (mtid===494) return `1. set skor seçeneği ${n}`;
  }

  if (mtid === 1) return ({1:'1',2:'X',3:'2'})[n] || `Seçenek ${n}`;
  if (mtid === 3) return ({1:'1X',2:'12',3:'X2'})[n] || `Seçenek ${n}`;
  if ([11,14,155,209].includes(mtid)) {
    const s = spread !== null ? ` ${fmt(spread)}` : '';
    return n === 1 ? `Alt${s}` : n === 2 ? `Üst${s}` : `Seçenek ${n}`;
  }
  return `Seçenek ${n}`;
}

function normalizeMarket(market, ctx) {
  const typeId=Number(market?.MTID || 0);
  const outcomes = Array.isArray(market?.OCA) ? market.OCA.map((oc) => ({
    n: Number(oc?.N || 0),
    label: String(oc?.ON || fallbackOutcomeLabel(market, oc, ctx)),
    odds: num(oc?.O),
    no: oc?.NO ?? null
  })).filter(x => x.odds && x.odds > 1) : [];

  const meta=ctx?.sportType===5 ? tennisMeta(typeId) : null;
  return {
    id: market?.ID ?? null,
    typeId,
    name: marketName(market, ctx?.sportType),
    kind: meta?.kind || 'other',
    known: ctx?.sportType===5 ? meta?.kind!=='other' : Boolean(market?.MN || COMMON_MARKET_NAMES[typeId]),
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
    for (const item of leagues) if (item?.LID != null && item?.N) m.set(item.LID, String(item.N));
  }
  return m;
}

function normalizeEvent(ev, leagues) {
  const sportType = Number(ev?.TYPE || 0);
  const startTimestamp = num(ev?.ESD);
  const ctx={sportType,home:String(ev?.HN||''),away:String(ev?.AN||'')};
  const markets = Array.isArray(ev?.MA) ? ev.MA.map(m=>normalizeMarket(m,ctx)).filter(m => m.outcomes.length) : [];
  return {
    id: String(ev?.C ?? ev?.EV ?? `${ev?.HN || ''}-${ev?.AN || ''}-${startTimestamp || ''}`),
    eventId: ev?.EV ?? null,
    sportType,
    sport: SPORT_NAMES[sportType] || `Spor ${sportType}`,
    home: String(ev?.HN || ''),
    away: String(ev?.AN || ''),
    displayName: String(ev?.ENO || `${ev?.HN || ''} - ${ev?.AN || ''}`),
    leagueCode: ev?.LC ?? null,
    league: leagues.get(ev?.LC) || 'Lig bilgisi yok',
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
        'User-Agent': 'Mozilla/5.0 (compatible; NEC-Analiz/2.2)'
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
