function norm(s){return String(s||'').toLocaleLowerCase('tr-TR');}
function implied(odds){ return odds > 1 ? Math.min(99.9, 100/odds) : 0; }
function pct(n){ return `${n.toFixed(1)}%`; }

const COMMON = ['maç sonucu','1x2','çifte şans','alt','üst','toplam gol','karşılıklı gol','handikap','set','oyun'];
const SPECIAL = ['oyuncu','şut','isabet','gol atar','korner','kart','faul','ofsayt','ace','servis','break','set','oyun'];

function flat(match){
  const out=[];
  for(const m of match.markets||[]) for(const o of m.outcomes||[]) if(Number(o.odds)>1) out.push({market:m, outcome:o, odds:Number(o.odds)});
  return out;
}
function marketQuality(name){
  const n=norm(name); let q=0;
  if(COMMON.some(k=>n.includes(k))) q+=12;
  if(SPECIAL.some(k=>n.includes(k))) q+=5;
  if(n.includes('doğru skor')) q-=10;
  return q;
}
function reasonBase(c){
  return `${c.market.name} / ${c.outcome.label} seçeneği resmi bültende ${c.odds.toFixed(2)} oranla açık. Bu fiyat yaklaşık ${pct(implied(c.odds))} ham olasılığa karşılık geliyor.`;
}
function choose(cands, min, max, mode='middle'){
  const arr=cands.filter(c=>c.odds>=min&&c.odds<=max);
  if(!arr.length) return null;
  return arr.sort((a,b)=>{
    const qa=marketQuality(a.market.name), qb=marketQuality(b.market.name);
    if(qb!==qa) return qb-qa;
    if(mode==='safe') return a.odds-b.odds;
    const mid=(min+max)/2; return Math.abs(a.odds-mid)-Math.abs(b.odds-mid);
  })[0];
}
function formText(form, match){
  if(!form) return null;
  const h=form.home,a=form.away;
  const bits=[];
  if(h) bits.push(`${match.home}: son ${h.played} maç ${h.wins}G-${h.draws}B-${h.losses}M, ${h.over25}/${h.played} Üst 2.5, ${h.btts}/${h.played} KG Var`);
  if(a) bits.push(`${match.away}: son ${a.played} maç ${a.wins}G-${a.draws}B-${a.losses}M, ${a.over25}/${a.played} Üst 2.5, ${a.btts}/${a.played} KG Var`);
  return bits.join(' · ');
}
function trendReason(c, form, match){
  const t=formText(form,match);
  if(!t) return 'Son-10 veri eşleşmesi güvenilir biçimde bulunamadığı için form istatistiği uydurulmadı; seçim yalnızca gerçek market/oran yapısından üretildi.';
  const n=norm(c.market.name+' '+c.outcome.label);
  const h=form.home,a=form.away;
  const notes=[];
  if(n.includes('üst') && h && a){
    const total=h.over25+a.over25, games=h.played+a.played;
    notes.push(`iki takımın eşleşen son maçlarında Üst 2.5 frekansı ${total}/${games}`);
  }
  if((n.includes('karşılıklı')||n.includes('kg')) && h && a){
    notes.push(`KG Var frekansı toplam ${h.btts+a.btts}/${h.played+a.played}`);
  }
  return notes.length ? `${t}. Ek sinyal: ${notes.join(', ')}.` : t;
}
function makePick(label,c,form,match,tag){
  if(!c) return {label,available:false,tag,reason:'Bu oran bandında resmi bültende uygun bir market bulunamadı; yapay oran veya bahis üretilmedi.'};
  return {label,available:true,tag,market:c.market.name,selection:c.outcome.label,odds:c.odds,implied:+implied(c.odds).toFixed(1),reason:`${reasonBase(c)} ${trendReason(c,form,match)}`};
}
function specialCandidates(cands){return cands.filter(c=>SPECIAL.some(k=>norm(c.market.name).includes(k))).sort((a,b)=>marketQuality(b.market.name)-marketQuality(a.market.name)||a.odds-b.odds);}
function insights(match,cands,form){
  const items=[];
  const ms=cands.filter(c=>/maç sonucu|1x2/i.test(c.market.name));
  const fav=ms.slice().sort((a,b)=>a.odds-b.odds)[0];
  const volatile=cands.filter(c=>/(üst|karşılıklı|kg var)/i.test(c.market.name+' '+c.outcome.label) && c.odds<1.85);
  if(fav&&fav.odds<1.55&&volatile.length) items.push({title:'⚡ Ters Köşe Alarmı',text:`Favori ${fav.odds.toFixed(2)} seviyesinde kısa; buna rağmen gol/karşılıklı gol piyasasında da güçlü fiyatlar var. Maç senaryosu favorinin beklenenden daha açık oynamasına müsait olabilir.`});
  const h=form?.home,a=form?.away;
  if(h&&a){
    const draws=h.draws+a.draws;
    if(draws<=2 && h.played+a.played>=12) items.push({title:'🧨 Seri Kırılma Radarı',text:`Eşleşen son ${h.played+a.played} takım-maç örneğinde beraberlik yalnızca ${draws} kez görüldü. Bu tek başına bahis sebebi değildir; yalnızca piyasa oranı da değer veriyorsa sürpriz sinyali sayılır.`});
  } else items.push({title:'🧪 Veri Kalitesi',text:'Son-10 form eşlemesi bulunamadı. NEÇ bu durumda istatistik uydurmuyor ve güven seviyesini yalnızca bülten marketleriyle sınırlandırıyor.'});
  const depth=(match.markets||[]).length;
  items.push({title:'📡 Market Derinliği',text:`Bu maçta ${depth} gerçek market grubu okunabildi. Market derinliği arttıkça oyuncu/şut/korner gibi özel seçim bulma ihtimali yükselir.`});
  return items;
}
function analyzeMatch(match, form){
  const cands=flat(match);
  const safe=choose(cands,1.20,2.20,'safe');
  const med=choose(cands,5.00,7.99);
  const agg=choose(cands,10.00,20.99);
  const sp=specialCandidates(cands);
  const used=new Set([safe,med,agg].filter(Boolean).map(x=>`${x.market.id}:${x.outcome.n}`));
  const special=sp.filter(x=>!used.has(`${x.market.id}:${x.outcome.n}`));
  const p4=special[0]||null, p5=special.find(x=>x.market.id!==p4?.market.id)||special[1]||null;
  const picks=[
    makePick('1 · En Yüksek Güvenli Aday',safe,form,match,'GÜVEN'),
    makePick('2 · Orta Sürpriz',med,form,match,'5–7 ORAN'),
    makePick('3 · Agresif Sürpriz',agg,form,match,'10–20 ORAN'),
    makePick('4 · Özel Market',p4,form,match,'OYUNCU / ŞUT / KORNER'),
    makePick('5 · Özel Market+',p5,form,match,'ALTERNATİF')
  ];
  const radar=Math.min(99,Math.round(35+(med?18:0)+(agg?18:0)+(special.length?12:0)+Math.min(16,(match.markets||[]).length/4)));
  return {matchId:match.id,radar,picks,insights:insights(match,cands,form),form,generatedAt:new Date().toISOString(),disclaimer:'NEÇ seçimleri garanti değildir; yalnızca mevcut resmi market/oran verisi ve bulunabilen istatistiklerden hesaplanan fikirlerdir.'};
}
module.exports={analyzeMatch};
