const base = require('./analyzer-v6');

function norm(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[ı]/g, 'i').replace(/[ş]/g, 's')
    .replace(/[ç]/g, 'c').replace(/[ğ]/g, 'g').replace(/[ö]/g, 'o').replace(/[ü]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function verified(o) { return o?.labelVerified === true || Boolean(o?.sourceLabel); }
function side(label, match) {
  const l = norm(label), h = norm(match.home), a = norm(match.away);
  if (l === '1' || (h && l.includes(h))) return 'home';
  if (l === '2' || (a && l.includes(a))) return 'away';
  if (l === 'x' || l.includes('beraber')) return 'draw';
  return null;
}
function dc(label) {
  const l = norm(label).replace(/\s/g, '');
  if (l.startsWith('1x')) return ['home', 'draw'];
  if (l.startsWith('x2')) return ['draw', 'away'];
  if (l.startsWith('12')) return ['home', 'away'];
  return [];
}
function htft(label) {
  const z = String(label || '').toUpperCase().match(/([12X])\s*[\/-]\s*([12X])/);
  if (!z) return null;
  const cv = x => x === '1' ? 'home' : x === '2' ? 'away' : 'draw';
  return [cv(z[1]), cv(z[2])];
}
function totalDir(label) {
  const l = norm(label);
  return l.includes('ust') ? 'over' : l.includes('alt') ? 'under' : null;
}
function bttsDir(label) {
  const l = norm(label);
  return l.includes('var') ? 'yes' : (l.includes('yok') || l.includes('hayir')) ? 'no' : null;
}
function goalRange(label) {
  const l = norm(label);
  if (l.includes('6+')) return [6, 20];
  const z = l.match(/(\d+)\s*[-:]\s*(\d+)/);
  return z ? [+z[1], +z[2]] : null;
}
const SAFE = new Set([
  'match_result', 'match_winner', 'double_chance', 'htft', 'total_goals', 'btts',
  'goal_range', 'first_goal_team', 'result_total_combo', 'result_btts_combo', 'total_btts_combo'
]);
function profile(form) {
  if (!(form?.home?.played >= 4 && form?.away?.played >= 4)) return null;
  const h = form.home, a = form.away, total = h.played + a.played;
  const expH = ((h.avgGF || 0) + (a.avgGA || 0)) / 2;
  const expA = ((a.avgGF || 0) + (h.avgGA || 0)) / 2;
  return { over: (h.over25 + a.over25) / total, btts: (h.btts + a.btts) / total, totalExp: expH + expA };
}
function coherent(c, main, p, match) {
  if (!SAFE.has(c.market.kind) || /^Nesine Market\b/i.test(c.market.name)) return false;
  const k = c.market.kind, l = c.outcome.label;
  if (['match_result', 'match_winner'].includes(k)) return side(l, match) === main;
  if (k === 'double_chance') return dc(l).includes(main);
  if (k === 'htft') return htft(l)?.[1] === main;
  if (k === 'first_goal_team') {
    const x = side(l, match);
    if (x && x !== main) return false;
  }
  if (!p) return true;
  if (k === 'total_goals') {
    const d = totalDir(l);
    return p.over >= .55 ? d === 'over' : p.over <= .45 ? d === 'under' : true;
  }
  if (k === 'btts') {
    const d = bttsDir(l);
    return p.btts >= .52 ? d === 'yes' : p.btts <= .48 ? d === 'no' : true;
  }
  if (k === 'goal_range') {
    const r = goalRange(l);
    return !r || (p.totalExp >= r[0] - .65 && p.totalExp <= r[1] + .65);
  }
  return true;
}
function storyReason(c, role, main, p, match) {
  const lead = main === 'home' ? match.home : main === 'away' ? match.away : 'beraberlik';
  if (c.market.kind === 'double_chance')
    return `NEÇ düşüncesi: Ana yön ${lead}. ${c.outcome.label}, bu tarafı beraberlikle koruyor; temkinli seçimde 12 gibi beraberliği dışlayan seçenek yerine gerçek hata payı bırakıyorum.`;
  if (c.market.kind === 'htft') {
    const z = htft(c.outcome.label);
    const first = z?.[0] === 'home' ? match.home : z?.[0] === 'away' ? match.away : 'beraberlik';
    return `NEÇ düşüncesi: ${c.outcome.label}, ilk yarı ${first} / maç sonu ${lead}. Final ayağı ana hikâyeyi koruyor; ilk yarı şartı oranı yükselten ekstra risk.${role === 'big' ? ' Bu yüzden bu bir uç senaryo, ana tahmin değil.' : ''}`;
  }
  if (c.market.kind === 'total_goals')
    return `NEÇ düşüncesi: Ana yön ${lead}; son formda 2.5 Üst eğilimi yaklaşık %${p ? (p.over * 100).toFixed(0) : '—'}. ${c.outcome.label}, bu tempo eğiliminin tersine değil aynı yönüne oynuyor.`;
  if (c.market.kind === 'btts')
    return `NEÇ düşüncesi: KG Var eğilimi yaklaşık %${p ? (p.btts * 100).toFixed(0) : '—'}. ${c.outcome.label}, maç sonucunun kopyası olmak yerine iki takımın skor katkısını ayrıca fiyatlıyor.`;
  if (c.market.kind === 'goal_range')
    return `NEÇ düşüncesi: Basit toplam gol beklentisi ${p ? p.totalExp.toFixed(2) : '—'}. ${c.outcome.label}, bu merkeze yakın dar skor bandı olduğu için daha yüksek oranlı ama ana tempo fikriyle çelişmeyen bir senaryo.`;
  return `NEÇ düşüncesi: Ana yön ${lead}; ${c.market.name} · ${c.outcome.label}, maçın ana omurgasını bozmadan farklı bir risk katmanı ekliyor.`;
}
function desirability(c, role) {
  const kind = c.market.kind;
  const kindScore = kind === 'htft' ? 10 : kind === 'goal_range' ? 9 : kind === 'total_goals' ? 8 : kind === 'btts' ? 7 : kind === 'first_goal_team' ? 6 : 4;
  const target = role === 'big' ? 6 : role === 'surprise' ? 3 : 2.5;
  return kindScore - Math.abs(Math.log(Math.max(c.odds, 1.01) / target)) * 2;
}
function pickCandidate(all, used, main, p, match, role) {
  const primary = role === 'big' ? c => c.odds >= 3.5 && c.odds <= 15
    : role === 'surprise' ? c => c.odds >= 2 && c.odds <= 5.5
    : c => c.odds >= 1.65 && c.odds <= 12;
  const relaxed = role === 'big' ? c => c.odds >= 3 && c.odds <= 15
    : role === 'surprise' ? c => c.odds >= 1.85 && c.odds <= 5.5
    : c => c.odds >= 1.55 && c.odds <= 12;
  let q = all.filter(c => !used.has(`${c.market.name}|${c.outcome.label}`) && coherent(c, main, p, match) && primary(c));
  if (!q.length) q = all.filter(c => !used.has(`${c.market.name}|${c.outcome.label}`) && coherent(c, main, p, match) && relaxed(c));
  q.sort((a, b) => desirability(b, role) - desirability(a, role));
  return q[0] || null;
}

function analyzeMatch(match, form) {
  const result = base.analyzeMatch(match, form);
  if (!result?.picks || Number(match?.sportType) !== 1) return result;
  const mainPick = result.picks.find(x => x.label === 'Ana Senaryo');
  const main = mainPick ? side(mainPick.selection, match) : null;
  if (!main) return result;
  const p = profile(form);

  const all = [];
  for (const market of match.markets || []) {
    for (const outcome of market.outcomes || []) {
      const odds = Number(outcome.odds);
      if (odds > 1 && verified(outcome)) all.push({ market, outcome, odds });
    }
  }

  // Gerçek temkinli seçim: favori yönü beraberlikle koru.
  const safeIdx = result.picks.findIndex(x => x.label === 'Temkinli Seçim');
  if (safeIdx >= 0 && main !== 'draw') {
    const safe = all
      .filter(c => c.market.kind === 'double_chance' && dc(c.outcome.label).includes(main) && dc(c.outcome.label).includes('draw') && c.odds <= 2)
      .sort((a, b) => a.odds - b.odds)[0];
    if (safe) {
      result.picks[safeIdx] = {
        ...result.picks[safeIdx], market: safe.market.name, selection: safe.outcome.label, odds: safe.odds,
        av: 0, recommended: false, confidencePct: 64,
        reason: storyReason(safe, 'safe', main, p, match)
      };
    }
  }

  // Üç risk kartını global dağıt: önce yüksek oran rezerve edilir.
  const used = new Set();
  for (const label of ['Ana Senaryo', 'Temkinli Seçim']) {
    const x = result.picks.find(p => p.label === label && p.available !== false);
    if (x) used.add(`${x.market}|${x.selection}`);
  }
  const plan = [
    ['Çok Sürpriz', 'big', 36],
    ['Sürpriz Seçim', 'surprise', 48],
    ['NEÇ Özel', 'special', 50]
  ];
  for (const [label, role, confidence] of plan) {
    const idx = result.picks.findIndex(x => x.label === label);
    if (idx < 0) continue;
    const best = pickCandidate(all, used, main, p, match, role);
    if (!best) {
      result.picks[idx] = {
        ...result.picks[idx], available: false, odds: null, av: null, recommended: false,
        reason: `NEÇ düşüncesi: ${label} için ana maç hikâyesiyle tutarlı, güvenli etiketi doğrulanmış uygun oran bulunamadı. Sırf beşinci kart dolsun diye ters seçim üretmiyorum.`
      };
      continue;
    }
    used.add(`${best.market.name}|${best.outcome.label}`);
    result.picks[idx] = {
      ...result.picks[idx], available: true, market: best.market.name, selection: best.outcome.label,
      odds: best.odds, av: 0, recommended: false, confidencePct: confidence,
      reason: storyReason(best, role, main, p, match)
    };
  }

  const special = result.picks.find(x => x.label === 'NEÇ Özel' && x.available !== false);
  if (result.scenario) {
    result.scenario.specialComment = special?.reason || 'NEÇ Özel için tutarlı doğrulanmış ek market bulunamadı.';
    result.scenario.specialOdds = special?.odds ?? null;
    result.scenario.specialMarket = special?.market ?? null;
    result.scenario.specialSelection = special?.selection ?? null;
  }
  return result;
}

module.exports = { analyzeMatch };
