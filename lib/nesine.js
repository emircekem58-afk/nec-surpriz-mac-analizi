const BULLETIN_URL = 'https://bulten.nesine.com/api/bulten/getprebultenfull';

const SPORT_NAMES = { 1: 'Futbol', 5: 'Tenis' };

const FOOTBALL_MARKETS = {
  1:{name:'Maç Sonucu',kind:'match_result'},
  3:{name:'Çifte Şans',kind:'double_chance'},
  11:{name:'Toplam Gol Alt/Üst',kind:'total_goals'},
  14:{name:'İlk Yarı Alt/Üst',kind:'first_half_total'},
  38:{name:'Karşılıklı Gol',kind:'btts'},
  43:{name:'Toplam Gol Aralığı',kind:'goal_range'},
  49:{name:'Tek/Çift',kind:'odd_even'},
  100:{name:'Handikaplı Maç Sonucu',kind:'handicap_result'},
  182:{name:'Maç Kazananı',kind:'match_winner'},
  185:{name:'Handikap',kind:'handicap'},
  216:{name:'Toplam Korner Alt/Üst',kind:'corners_total'},
  218:{name:'Kart Puanı Alt/Üst',kind:'cards_total'},
  220:{name:'En Çok Korner',kind:'most_corners'},
  272:{name:'Sonuç + Alt/Üst',kind:'result_total_combo'},
  291:{name:'İlk Golü Hangi Takım Atar?',kind:'first_goal_team'},
  338:{name:'Maç Sonucu + KG',kind:'result_btts_combo'},
  414:{name:'Maç Sonucu + KG',kind:'result_btts_combo'},
  418:{name:'Asya Handikap',kind:'asian_handicap'},
  424:{name:'Toplam Korner Alt/Üst',kind:'corners_total'},
  426:{name:'Korner Handikabı',kind:'corner_handicap'},
  438:{name:'Maç Sonucu + Alt/Üst',kind:'result_total_combo'},
  446:{name:'Alt/Üst + KG',kind:'total_btts_combo'},
  583:{name:'Toplam Korner Alt/Üst',kind:'corners_total'},
  701:{name:'Oyuncu Gol Atar',kind:'player_goal'},
  702:{name:'İlk Golü Atan Oyuncu',kind:'player_first_goal'},
  707:{name:'Oyuncu Asist Yapar',kind:'player_assist'},
  709:{name:'Oyuncu Kart Görür',kind:'player_card'},
  712:{name:'Oyuncu Asist Yapar',kind:'player_assist'},
  714:{name:'Oyuncu Kaleyi Bulan Şut',kind:'player_sot'},
  740:{name:'Oyuncu Şut Çeker',kind:'player_shot'},
  741:{name:'Oyuncu Faul Alır',kind:'player_fouled'},
  742:{name:'Oyuncu Faul Yapar',kind:'player_foul'},
  743:{name:'Oyuncu Ofsayta Düşer',kind:'player_offside'},
  765:{name:'Oyuncu Gol veya Asist',kind:'player_goal_assist'},
  798:{name:'Korner Handikabı',kind:'corner_handicap'},
  803:{name:'Kaleci Kurtarış',kind:'goalkeeper_saves'}
};

const TENNIS_MARKETS = {
  182:{name:'Maç Kazananı',kind:'match_winner'},
  183:{name:'1. Set Kazananı',kind:'set1_winner'},
  184:{name:'2. Set Kazananı',kind:'set2_winner'},
  185:{name:'Set Handikabı / Oyuncu Set Kazanır',kind:'set_handicap'},
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
function text(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
function isTechnicalText(v){
  const s=text(v).toLocaleLowerCase('tr-TR');
  if(!s) return true;
  return /^(market|bahis|seçenek|secenek|option|outcome|selection)\s*[#:_-]?\s*\d+$/i.test(s)
    || /^(market|bahis)\s+\d+\b/i.test(s)
    || /^(seçenek|secenek|option|outcome|selection)\s+\d+\b/i.test(s);
}
function humanText(v){ const s=text(v); return s && !isTechnicalText(s) ? s : null; }
function marketMeta(mtid,sportType){
  return sportType===5 ? TENNIS_MARKETS[mtid] : FOOTBALL_MARKETS[mtid];
}
function marketName(market,sportType){
  const mtid=Number(market?.MTID||0);
  const meta=marketMeta(mtid,sportType);
  const raw=humanText(market?.MN);
  return raw || meta?.name || null;
}

function fallbackOutcomeLabel(market, oc, ctx) {
  const mtid = Number(market?.MTID || 0);
  const n = Number(oc?.N || 0);
  const spread = num(market?.SOV);
  const home=ctx?.home||'1. Oyuncu';
  const away=ctx?.away||'2. Oyuncu';

  if (ctx?.sportType===5) {
    if ([182,183,184].includes(mtid)) return n===1?home:n===2?away:null;
    if ([185,312,420].includes(mtid) && spread!==null) {
      return n===1 ? `${home} (${signed(spread)})` : n===2 ? `${away} (${signed(-spread)})` : null;
    }
    if (mtid===189 && spread!==null) return n===1?`Alt ${fmt(spread)}`:n===2?`Üst ${fmt(spread)}`:null;
    if (mtid===190 && spread!==null) return n===1?`${home} Alt ${fmt(spread)}`:n===2?`${home} Üst ${fmt(spread)}`:null;
    if (mtid===191 && spread!==null) return n===1?`${away} Alt ${fmt(spread)}`:n===2?`${away} Üst ${fmt(spread)}`:null;
    if (mtid===187) return ({1:'2-0',2:'2-1',3:'1-2',4:'0-2'})[n] || null;
    if (mtid===426) return ({1:`${home} / ${home}`,2:`${home} / ${away}`,3:`${away} / ${home}`,4:`${away} / ${away}`})[n] || null;
    if (mtid===422 && spread!==null) return ({1:`${home} + Alt ${fmt(spread)}`,2:`${home} + Üst ${fmt(spread)}`,3:`${away} + Alt ${fmt(spread)}`,4:`${away} + Üst ${fmt(spread)}`})[n] || null;
    return null;
  }

  if ([1,100].includes(mtid)) return ({1:'1',2:'X',3:'2'})[n] || null;
  if (mtid===3) return ({1:'1X',2:'12',3:'X2'})[n] || null;
  if ([11,14,216,218,424,583].includes(mtid) && spread!==null) return n===1?`Alt ${fmt(spread)}`:n===2?`Üst ${fmt(spread)}`:null;
  if (mtid===38) return n===1?'Var':n===2?'Yok':null;
  if (mtid===49) return n===1?'Tek':n===2?'Çift':null;
  if (mtid===182) return n===1?home:n===2?away:null;
  if (mtid===220) return ({1:home,2:'Eşit',3:away})[n] || null;
  return null;
}

function normalizeMarket(market, ctx) {
  const typeId=Number(market?.MTID || 0);
  const meta=marketMeta(typeId,ctx?.sportType);
  const name=marketName(market,ctx?.sportType);
  if(!name) return null;

  const rows=Array.isArray(market?.OCA) ? market.OCA : [];
  const outcomes=rows.map((oc)=>{
    const odds=num(oc?.O);
    if(!odds || odds<=1) return null;
    const deterministic=fallbackOutcomeLabel(market,oc,ctx);
    const raw=humanText(oc?.ON);
    const label=deterministic || raw;
    if(!label) return null;
    return { n:Number(oc?.N||0), label, odds, no:oc?.NO ?? null };
  }).filter(Boolean);
  if(!outcomes.length) return null;

  const rawName=humanText(market?.MN);
  return {
    id: market?.ID ?? null,
    typeId,
    name,
    kind: meta?.kind || 'other',
    known: Boolean(meta || rawName),
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
  const ctx={sportType,home:text(ev?.HN),away:text(ev?.AN)};
  const markets = Array.isArray(ev?.MA) ? ev.MA.map(m=>normalizeMarket(m,ctx)).filter(Boolean) : [];
  return {
    id: String(ev?.C ?? ev?.EV ?? `${ctx.home}-${ctx.away}-${startTimestamp || ''}`),
    eventId: ev?.EV ?? null,
    sportType,
    sport: SPORT_NAMES[sportType] || `Spor ${sportType}`,
    home: ctx.home,
    away: ctx.away,
    displayName: text(ev?.ENO) || `${ctx.home} - ${ctx.away}`,
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
        'User-Agent': 'Mozilla/5.0 (compatible; NEC-Analiz/2.3)'
      },
      cache: 'no-store',
      signal: ctrl.signal
    });
    const body = await res.text();
    if (!res.ok) {
      const err = new Error(`Kaynak HTTP ${res.status}`);
      err.status = res.status;
      err.preview = body.slice(0, 240);
      throw err;
    }
    let raw;
    try { raw = JSON.parse(body); }
    catch { throw new Error('Kaynak JSON formatında dönmedi'); }

    const events = raw?.sg?.EA;
    if (!Array.isArray(events)) throw new Error('Bülten şeması değişmiş: sg.EA bulunamadı');
    const leagues = leagueMap(raw);
    return events
      .filter(ev => [1,5].includes(Number(ev?.TYPE)) && (ev?.HN || ev?.ENO) && (ev?.AN || ev?.ENO))
      .map(ev => normalizeEvent(ev, leagues))
      .filter(ev => ev.markets.length > 0)
      .sort((a,b) => (a.startTimestamp || Number.MAX_SAFE_INTEGER) - (b.startTimestamp || Number.MAX_SAFE_INTEGER));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchBulletin };
