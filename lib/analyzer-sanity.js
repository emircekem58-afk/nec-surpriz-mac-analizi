const base = require('./analyzer-coherent');

function norm(s) {
  return String(s || '').toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ı]/g, 'i').replace(/[ş]/g, 's').replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g').replace(/[ö]/g, 'o').replace(/[ü]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function verified(o) { return o?.labelVerified === true || Boolean(o?.sourceLabel); }
function side(label, m) {
  const l = norm(label), h = norm(m.home), a = norm(m.away);
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
function range(label) {
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
  return {
    over: (h.over25 + a.over25) / total,
    btts: (h.btts + a.btts) / total,
    totalExp: expH + expA
  };
}
function good(c, main, p, match) {
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
    const r = range(l);
    return !r || (p.totalExp >= r[0] - .65 && p.totalExp <= r[1] + .65);
  }
  return true;
}
function band(label, odds) {
  if (label === 'Temkinli Seçim') return odds <= 2;
  if (label === 'Sürpriz Seçim') return odds >= 2 && odds <= 5.5;
  if (label === 'Çok Sürpriz') return odds >= 3.5 && odds <= 15;
  if (label === 'NEÇ Özel') return odds >= 1.65 && odds <= 12;
  return true;
}
function why(c, label, main, p, match) {
  const lead = main === 'home' ? match.home : main === 'away' ? match.away : 'beraberlik';
  if (c.market.kind === 'double_chance')
    return `NEÇ düşüncesi: Ana yön ${lead}. ${c.outcome.label} bu tarafı beraberlik ihtimaliyle birlikte koruyor; Temkinli kartta beraberliği dışlayan 12 yerine bu korumayı tercih ediyorum.`;
  if (c.market.kind === 'htft') {
    const z = htft(c.outcome.label);
    const first = z?.[0] === 'home' ? match.home : z?.[0] === 'away' ? match.away : 'beraberlik';
    return `NEÇ düşüncesi: ${c.outcome.label}, ilk yarı ${first} / maç sonu ${lead}. Final ayağı ana maç hikâyesiyle aynı; ilk yarı şartı oranı yükselten ekstra risk.`;
  }
  if (c.market.kind === 'total_goals')
    return `NEÇ düşüncesi: Ana yön ${lead}; son formda 2.5 Üst eğilimi yaklaşık %${p ? (p.over * 100).toFixed(0) : '—'}. ${c.outcome.label} bu tempo yönüyle aynı tarafta.`;
  if (c.market.kind === 'btts')
    return `NEÇ düşüncesi: KG Var eğilimi yaklaşık %${p ? (p.btts * 100).toFixed(0) : '—'}. ${c.outcome.label} ana maç hikâyesine ters düşmeden iki takımın skor katkısını ayrıca fiyatlıyor.`;
  if (c.market.kind === 'goal_range')
    return `NEÇ düşüncesi: Toplam gol beklentisi ${p ? p.totalExp.toFixed(2) : '—'} civarı. ${c.outcome.label} bu merkeze yakın dar ve daha yüksek oranlı skor senaryosu.`;
  return `NEÇ düşüncesi: Ana yön ${lead}; ${c.market.name} · ${c.outcome.label} bu omurgayı bozmadan farklı bir risk katmanı ekliyor.`;
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
  const used = new Set(result.picks.map(x => `${x.market}|${x.selection}`));

  // Temkinli seçim: ana tarafı beraberlikle koru. 12 temkinli değildir.
  const safeIdx = result.picks.findIndex(x => x.label === 'Temkinli Seçim');
  if (safeIdx >= 0 && main !== 'draw') {
    const best = all
      .filter(c => c.market.kind === 'double_chance' && dc(c.outcome.label).includes(main) && dc(c.outcome.label).includes('draw') && c.odds <= 2)
      .sort((a, b) => a.odds - b.odds)[0];
    if (best) {
      const old = result.picks[safeIdx];
      used.delete(`${old.market}|${old.selection}`);
      used.add(`${best.market.name}|${best.outcome.label}`);
      result.picks[safeIdx] = {
        ...old, market: best.market.name, selection: best.outcome.label, odds: best.odds,
        av: 0, recommended: false, confidencePct: 64,
        reason: why(best, 'Temkinli Seçim', main, p, match)
      };
    }
  }

  for (const label of ['Sürpriz Seçim', 'Çok Sürpriz', 'NEÇ Özel']) {
    const idx = result.picks.findIndex(x => x.label === label);
    if (idx < 0) continue;
    const current = result.picks[idx];
    const market = (match.markets || []).find(x => x.name === current.market);
    const outcome = market?.outcomes?.find(x => x.label === current.selection && Number(x.odds) === Number(current.odds));
    const currentCandidate = market && outcome ? { market, outcome, odds: Number(outcome.odds) } : null;

    if (currentCandidate && band(label, currentCandidate.odds) && good(currentCandidate, main, p, match)) {
      current.reason = why(currentCandidate, label, main, p, match);
      continue;
    }

    used.delete(`${current.market}|${current.selection}`);
    const pool = all
      .filter(c => !used.has(`${c.market.name}|${c.outcome.label}`) && band(label, c.odds) && good(c, main, p, match))
      .sort((a, b) => {
        const score = x => (x.market.kind === 'htft' ? 9 : x.market.kind === 'goal_range' ? 8 : x.market.kind === 'total_goals' ? 7 : x.market.kind === 'btts' ? 6 : 4) + Math.log(x.odds);
        return score(b) - score(a);
      });
    const best = pool[0];
    if (!best) continue;
    used.add(`${best.market.name}|${best.outcome.label}`);
    result.picks[idx] = {
      ...current, market: best.market.name, selection: best.outcome.label, odds: best.odds,
      av: 0, recommended: false, reason: why(best, label, main, p, match)
    };
  }

  const special = result.picks.find(x => x.label === 'NEÇ Özel');
  if (special && result.scenario) {
    result.scenario.specialComment = special.reason;
    result.scenario.specialOdds = special.odds;
    result.scenario.specialMarket = special.market;
    result.scenario.specialSelection = special.selection;
  }
  return result;
}

module.exports = { analyzeMatch };
