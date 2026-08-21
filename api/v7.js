const v6 = require('./v6');

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (v) => clean(v)
  .toLocaleLowerCase('tr-TR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[ı]/g, 'i').replace(/[ş]/g, 's').replace(/[ç]/g, 'c')
  .replace(/[ğ]/g, 'g').replace(/[ö]/g, 'o').replace(/[ü]/g, 'u');

function isTechnicalSelection(value) {
  const s = clean(value);
  if (!s) return true;
  if (/^(seçenek|secenek|seçim|secim|option|outcome|selection)\s*[#:_-]?\s*\d+$/i.test(s)) return true;
  if (/^market\s*\d+$/i.test(s)) return true;
  return false;
}

function marketKind(pick, match) {
  if (pick?.family) return pick.family;
  const id = Number(pick?.marketTypeId);
  const market = (match?.markets || []).find((m) => Number(m.typeId) === id);
  return market?.kind || '';
}

function displaySelection(pick, match) {
  const selection = clean(pick?.selection);
  const kind = marketKind(pick, match);
  const upper = selection.toUpperCase().replace(/\s+/g, '');
  if (kind === 'match_result') {
    if (upper === '1') return `${match.home} kazanır`;
    if (upper === 'X') return 'Beraberlik';
    if (upper === '2') return `${match.away} kazanır`;
  }
  if (kind === 'double_chance') {
    if (upper === '1X') return `${match.home} kaybetmez (1X)`;
    if (upper === 'X2') return `${match.away} kaybetmez (X2)`;
    if (upper === '12') return 'Beraberlik olmaz (12)';
  }
  if (kind === 'htft') {
    const parts = upper.split('/');
    if (parts.length === 2) {
      const name = (x) => x === '1' ? match.home : x === '2' ? match.away : 'Beraberlik';
      return `İY ${name(parts[0])} / MS ${name(parts[1])}`;
    }
  }
  if (kind === 'btts') return /var|evet/i.test(selection) ? 'Karşılıklı gol var' : 'Karşılıklı gol yok';
  if (kind === 'total_goals') return selection;
  if (kind === 'goal_range') return `${selection} toplam gol`;
  return selection;
}

function favoriteRead(match) {
  const mk = (match?.markets || []).find((m) => m.kind === 'match_result' || Number(m.typeId) === 1);
  if (!mk) return null;
  const options = (mk.outcomes || []).filter((o) => Number(o.odds) > 1 && !isTechnicalSelection(o.label));
  if (!options.length) return null;
  const sorted = [...options].sort((a, b) => Number(a.odds) - Number(b.odds));
  const best = sorted[0];
  const s = clean(best.label).toUpperCase();
  const team = s === '1' ? match.home : s === '2' ? match.away : s === 'X' ? 'Beraberlik' : clean(best.label);
  return { team, odds: Number(best.odds), label: s, gap: sorted[1] ? Number(sorted[1].odds) - Number(best.odds) : 0 };
}

function totalRead(match) {
  const markets = (match?.markets || []).filter((m) => m.kind === 'total_goals' || [11,12,13].includes(Number(m.typeId)));
  let best = null;
  for (const mk of markets) {
    const rows = (mk.outcomes || []).filter((o) => Number(o.odds) > 1 && /alt|üst|ust/i.test(clean(o.label)));
    if (rows.length < 2) continue;
    const under = rows.filter((o) => /alt/i.test(clean(o.label))).sort((a,b)=>Number(a.odds)-Number(b.odds))[0];
    const over = rows.filter((o) => /üst|ust/i.test(clean(o.label))).sort((a,b)=>Number(a.odds)-Number(b.odds))[0];
    if (!under || !over) continue;
    const diff = Math.abs(Number(under.odds) - Number(over.odds));
    const candidate = { lean: Number(under.odds) + 0.04 < Number(over.odds) ? 'under' : Number(over.odds) + 0.04 < Number(under.odds) ? 'over' : 'balanced', under, over, diff };
    if (!best || diff > best.diff) best = candidate;
  }
  return best;
}

function buildCommentary(match, analysis) {
  if (Number(match?.sportType) === 5) {
    const title = analysis?.scenario?.title || 'Tenis maçı dengesi';
    const source = analysis?.formStatus === 'verified-form' ? 'Son maç verisi de doğrulanabildi.' : 'Son maç verisi doğrulanamadığı için yorum ağırlıklı olarak canlı fiyat yapısına dayanıyor.';
    return {
      title,
      text: `${analysis?.scenario?.summary || 'Maç kazananı piyasasında bir taraf öne çıkıyor.'} ${source}`,
      risk: 'Set başlangıcı ve servis kırılmaları tenis bahislerinde yönü hızlı değiştirebilir.'
    };
  }

  const fav = favoriteRead(match);
  const total = totalRead(match);
  let first;
  if (!fav || fav.team === 'Beraberlik') {
    first = 'Taraf marketinde çok net bir üstünlük görünmüyor; bu nedenle maçı tek bir favoriye bağlamak doğru değil.';
  } else if (fav.odds <= 1.50) {
    first = `Bahis piyasası ${fav.team} tarafını maçın belirgin favorisi olarak görüyor.`;
  } else if (fav.odds <= 1.90) {
    first = `${fav.team} maç öncesi fiyatlamada bir adım önde, ancak fark tek taraflı bir maç demek için yeterince büyük değil.`;
  } else {
    first = `${fav.team} tarafı hafif önde görünse de 1X2 fiyatları dengeli bir maça işaret ediyor.`;
  }

  let tempo = 'Gol marketinde net bir Alt/Üst baskısı olmadığı için tempo konusunda keskin bir hüküm vermiyorum.';
  if (total?.lean === 'under') tempo = 'Gol fiyatları daha kontrollü ve dar skorlu bir maç ihtimalini biraz daha öne çıkarıyor.';
  if (total?.lean === 'over') tempo = 'Gol fiyatları açık oyun ve birden fazla gol üretilebilecek bir tempoyu biraz daha öne çıkarıyor.';

  const verified = analysis?.formStatus === 'verified-form';
  const formLine = verified
    ? `Doğrulanmış son maç verisi de hesaba katıldı. ${clean(analysis?.scenario?.summary)}`
    : 'Bu maçta bağımsız son-form eşleşmesi doğrulanmadı; bu yüzden yorumu sadece oranlardan kesin sonuç çıkarıyormuş gibi sunmuyorum.';

  let risk = 'Ana senaryoyu bozan en önemli risk, maçın ilk bölümünde beklenmedik gol/kırmızı kart gibi oyunun yapısını değiştiren bir gelişme.';
  if (fav?.odds <= 1.35) risk = `${fav.team} çok düşük fiyatlandığı için favori yön doğru olsa bile oran cazibesi sınırlı; sırf oran yükselsin diye ters kombinasyon üretmiyorum.`;
  if (!fav || fav.odds > 2.10) risk = 'Taraflar birbirine yakın fiyatlandığı için yüksek oranlı sonuç bahisleri normalden daha kırılgan.';

  const title = fav && fav.team !== 'Beraberlik' ? `${fav.team} bir adım önde` : 'Dengeli maç profili';
  return { title, text: `${first} ${tempo} ${formLine}`, risk };
}

function humanReason(pick, match, analysis) {
  const kind = marketKind(pick, match);
  const display = displaySelection(pick, match);
  const verified = analysis?.formStatus === 'verified-form';
  if (kind === 'match_result') return `${display}, maçın düz taraf okumasıyla aynı yönde. ${verified ? 'Doğrulanmış son maç verisi ve 1X2 fiyatı aynı tarafı desteklediği için ana seçenek olarak tutuldu.' : 'Form doğrulanmadığı için bu seçim yalnızca piyasa yönüyle destekleniyor ve güven seviyesi sınırlı tutuluyor.'}`;
  if (kind === 'double_chance') return `${display}, ana maç yönünü korurken beraberlik ihtimaline de alan bırakıyor; bu yüzden düz sonuca göre daha temkinli bir seçim.`;
  if (kind === 'total_goals') return `${display}, maçın beklenen tempo/gol yönünü oynuyor. ${verified ? 'Son maç gol üretimi ile piyasa çizgisi birlikte değerlendirildi.' : 'Form doğrulanmadığı için bu bahis yalnızca fiyat yapısı açık bir yön gösteriyorsa tutuluyor.'}`;
  if (kind === 'btts') return `${display}, iki tarafın gol bulup bulamayacağı senaryosunu oynuyor; ana maç yönüyle çelişmediği sürece alternatif olarak tutuluyor.`;
  if (kind === 'goal_range') return `${display}, dar bir skor aralığı istediği için doğal olarak yüksek riskli. Ana tercih değil; yalnızca maçın gol hikâyesi bu aralığı destekliyorsa gösteriliyor.`;
  if (kind === 'htft') return `${display}, ilk yarı ve maç sonunu birlikte doğru bilmeyi gerektiriyor. Bu yüzden yüksek riskli ve yalnızca maç sonu yönü ana yorumla uyumlu olduğunda gösteriliyor.`;
  if (['result_total_combo','result_btts_combo','total_btts_combo'].includes(kind)) return `${display}, iki ayrı koşulun aynı anda gerçekleşmesini gerektiriyor. Kaynak seçim adı doğrulanmış olsa bile bu bahis ana tercih değil, yüksek riskli alternatif.`;
  return clean(pick?.reason) || 'Bu seçim maçın ana senaryosuyla çelişmediği için listede tutuldu.';
}

function transformAnalysis(payload, match) {
  if (!payload || typeof payload !== 'object') return payload;
  const verified = payload.formStatus === 'verified-form';
  const commentary = buildCommentary(match || {}, payload);
  const seen = new Set();
  const picks = [];
  for (const p of payload.picks || []) {
    if (isTechnicalSelection(p.selection) || /^Market\s*\d+$/i.test(clean(p.market))) continue;
    const confidence = Math.max(0, Math.min(verified ? 78 : 58, Number(p.confidencePct || 0)));
    if (Number(p.odds) >= 5.5 && confidence < 35) continue;
    const display = displaySelection(p, match || {});
    if (!display || isTechnicalSelection(display)) continue;
    const key = `${clean(p.market)}|${display}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let tag = clean(p.tag || p.label || 'Alternatif');
    if (/çok sürpriz/i.test(tag)) tag = 'CESUR SENARYO';
    picks.push({
      ...p,
      av: undefined,
      displayName: display,
      confidencePct: Math.round(confidence),
      tag,
      reason: humanReason(p, match || {}, payload),
      riskText: Number(p.odds) >= 5.5 ? 'Çok yüksek risk' : Number(p.odds) >= 3 ? 'Yüksek risk' : Number(p.odds) >= 1.85 ? 'Orta risk' : 'Daha düşük risk'
    });
  }
  const scenario = {
    ...(payload.scenario || {}),
    title: commentary.title,
    matchCommentary: commentary.text,
    summary: commentary.text,
    riskText: commentary.risk,
    betOpinionTitle: 'Bahis özeti',
    betOpinion: picks.length
      ? `${picks[0].displayName} ilk değerlendirilen seçim. Daha yüksek oranlı alternatifler yalnızca aynı maç hikâyesini bozmadığında gösteriliyor.`
      : 'Bu maçta adı ve mantığı açık şekilde savunabildiğim bir bahis oluşmadı; pas geçiyorum.'
  };
  return { ...payload, scenario, picks: picks.slice(0, 5), analysisLanguage: 'human-v7' };
}

function cleanCouponLeg(leg) {
  if (!leg || isTechnicalSelection(leg.selection) || /^Market\s*\d+$/i.test(clean(leg.market))) return null;
  return { ...leg, displayName: displaySelection(leg, leg), reason: clean(leg.reason) || 'Maçın ana senaryosuyla uyumlu olduğu için kupona alındı.' };
}

function productOdds(legs) {
  return legs.length ? +legs.reduce((p, x) => p * Number(x.odds || 1), 1).toFixed(2) : null;
}

function transformCoupons(payload) {
  if (!payload?.coupons) return payload;
  const coupons = payload.coupons.map((c) => {
    let legs = (c.legs || []).map(cleanCouponLeg).filter(Boolean);
    if (c.name === 'Sistem Kuponu') {
      legs = legs.filter((x) => Number(x.odds) >= 3).slice(0, 3);
      if (legs.length !== 3) legs = [];
    }
    if (c.name === 'Ters Sonuç Sistemi') {
      legs = legs.filter((x) => /^(1\/2|2\/1|X\/1|X\/2|1\/X|2\/X)$/i.test(clean(x.selection))).slice(0, 3);
      if (legs.length !== 3) legs = [];
    }
    return {
      ...c,
      legs,
      totalOdds: productOdds(legs),
      combinationCount: c.system === '2-3' && legs.length === 3 ? 4 : c.system ? 0 : c.combinationCount,
      note: legs.length ? c.note : 'Bu profil için bugün yeterli sayıda okunabilir ve gerekçeli seçim oluşmadı; kupon zorla doldurulmadı.'
    };
  });
  return { ...payload, coupons, languageVersion: 'v7' };
}

function capture(realRes, transform) {
  let code = 200;
  const proxy = {
    setHeader: (...args) => realRes.setHeader(...args),
    status(value) { code = value; return this; },
    json(value) {
      const next = code >= 200 && code < 300 ? transform(value) : value;
      return realRes.status(code).json(next);
    }
  };
  return proxy;
}

async function handler(req, res) {
  const route = String(req.query?.route || '').replace(/^\//, '');
  const match = req.method === 'POST' && route === 'analyze'
    ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body)
    : null;
  const transform = route === 'analyze'
    ? (value) => transformAnalysis(value, match)
    : route === 'coupons'
      ? transformCoupons
      : (value) => value;
  return v6(req, capture(res, transform));
}

handler._test = { isTechnicalSelection, displaySelection, buildCommentary, transformAnalysis, transformCoupons };
module.exports = handler;
