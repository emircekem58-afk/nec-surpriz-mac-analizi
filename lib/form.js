function clean(s) {
  return String(s || '').toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function closeName(a, b) {
  a = clean(a); b = clean(b);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const A = new Set(a.split(' ').filter(x => x.length > 2));
  const B = new Set(b.split(' ').filter(x => x.length > 2));
  let common = 0; for (const x of A) if (B.has(x)) common++;
  return common >= Math.min(2, A.size, B.size);
}

function ymd(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
}

function summarize(games, teamName) {
  const rows = [];
  for (const ev of games) {
    const comp = ev?.competitions?.[0];
    const cs = comp?.competitors;
    if (!Array.isArray(cs) || cs.length < 2) continue;
    const mine = cs.find(c => closeName(c?.team?.displayName, teamName));
    if (!mine) continue;
    const opp = cs.find(c => c !== mine);
    const my = Number(mine?.score ?? NaN), op = Number(opp?.score ?? NaN);
    if (!Number.isFinite(my) || !Number.isFinite(op)) continue;
    rows.push({
      date: ev?.date || null,
      gf: my, ga: op,
      result: my > op ? 'W' : my < op ? 'L' : 'D',
      over25: my + op > 2.5,
      btts: my > 0 && op > 0
    });
  }
  rows.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));
  const last = rows.slice(0,10);
  if (!last.length) return null;
  const count = k => last.filter(x => x[k]).length;
  return {
    played: last.length,
    wins: last.filter(x=>x.result==='W').length,
    draws: last.filter(x=>x.result==='D').length,
    losses: last.filter(x=>x.result==='L').length,
    goalsFor: last.reduce((s,x)=>s+x.gf,0),
    goalsAgainst: last.reduce((s,x)=>s+x.ga,0),
    over25: count('over25'),
    btts: count('btts')
  };
}

async function fetchFootballForm(home, away) {
  const end = new Date();
  const start = new Date(end.getTime() - 75*86400000);
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${ymd(start)}-${ymd(end)}&limit=1000`;
  const ctrl = new AbortController(); const timer = setTimeout(()=>ctrl.abort(),7000);
  try {
    const res = await fetch(url, { headers: {'Accept':'application/json','User-Agent':'Mozilla/5.0 NEC-Analiz/2.1'}, cache:'no-store', signal:ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const events = Array.isArray(data?.events) ? data.events : [];
    const h = summarize(events, home), a = summarize(events, away);
    if (!h && !a) return null;
    return { home:h, away:a, source:'ESPN public scoreboard', coverage:'best-effort' };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

module.exports = { fetchFootballForm };
