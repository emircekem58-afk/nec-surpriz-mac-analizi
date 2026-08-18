function norm(s){return String(s||'').toLocaleLowerCase('tr-TR');}
function implied(odds){ return odds > 1 ? Math.min(99.9, 100/odds) : 0; }
function pct(n){ return `${Number(n||0).toFixed(1)}%`; }

const COMMON = ['maç sonucu','maç kazananı','1x2','çifte şans','alt','üst','toplam gol','karşılıklı gol','handikap','set','oyun'];
const SPECIAL = ['oyuncu','şut','isabet','gol atar','korner','kart','faul','ofsayt','ace','servis','break','set','oyun'];
const TENNIS_OK = new Set(['match_winner','set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);
const DIRECTIONAL_TENNIS = new Set(['match_winner','set1_winner','set2_winner','game_handicap','set_handicap','winner_total_combo']);

function flat(match){
  const out=[];
  for(const m of match.markets||[]) for(const o of m.outcomes||[]) if(Number(o.odds)>1) out.push({market:m,outcome:o,odds:Number(o.odds)});
  return out;
}
function fairProbability(c){
  const inv=(c.market.outcomes||[]).filter(o=>Number(o.odds)>1).map(o=>1/Number(o.odds));
  const sum=inv.reduce((a,b)=>a+b,0);
  return sum>0 ? (1/c.odds)/sum*100 : implied(c.odds);
}
function isRecommendable(c,match){
  if(Number(match.sportType)!==5) return true;
  return c.market.known!==false && TENNIS_OK.has(c.market.kind);
}
function marketQuality(c,match){
  const n=norm(c.market.name); let q=0;
  if(!isRecommendable(c,match)) return -100;
  if(Number(match.sportType)===5){
    const k=c.market.kind;
    if(k==='match_winner') q+=42;
    if(k==='set1_winner'||k==='set2_winner') q+=28;
    if(k==='total_games') q+=25;
    if(k==='set_handicap'||k==='game_handicap') q+=23;
    if(k==='home_games_total'||k==='away_games_total') q+=20;
    if(k==='set_match'||k==='winner_total_combo') q+=10;
    if(k==='set_score') q+=5;
    return q;
  }
  if(COMMON.some(k=>n.includes(k))) q+=16;
  if(SPECIAL.some(k=>n.includes(k))) q+=6;
  if(n.includes('doğru skor')) q-=12;
  return q;
}
function choose(cands,min,max,match,mode='middle'){
  const arr=cands.filter(c=>c.odds>=min&&c.odds<=max&&isRecommendable(c,match));
  if(!arr.length) return null;
  return arr.sort((a,b)=>{
    const qa=marketQuality(a,match),qb=marketQuality(b,match);
    if(qb!==qa) return qb-qa;
    if(mode==='safe') return a.odds-b.odds;
    const mid=(min+max)/2; return Math.abs(a.odds-mid)-Math.abs(b.odds-mid);
  })[0];
}
function formText(form,match){
  if(!form) return null;
  const h=form.home,a=form.away,bits=[];
  if(h) bits.push(`${match.home}: son ${h.played} maç ${h.wins}G-${h.draws}B-${h.losses}M, ${h.over25}/${h.played} Üst 2.5, ${h.btts}/${h.played} KG Var`);
  if(a) bits.push(`${match.away}: son ${a.played} maç ${a.wins}G-${a.draws}B-${a.losses}M, ${a.over25}/${a.played} Üst 2.5, ${a.btts}/${a.played} KG Var`);
  return bits.join(' · ');
}
function footballTrend(c,form,match){
  const t=formText(form,match);
  if(!t) return 'Son maç form verisi güvenilir biçimde eşleşmedi; NEÇ bu seçimde istatistik uydurmadı.';
  const n=norm(c.market.name+' '+c.outcome.label),h=form.home,a=form.away,notes=[];
  if(n.includes('üst')&&h&&a) notes.push(`iki takımın eşleşen son maçlarında Üst 2.5 toplam ${h.over25+a.over25}/${h.played+a.played}`);
  if((n.includes('karşılıklı')||n.includes('kg'))&&h&&a) notes.push(`KG Var toplam ${h.btts+a.btts}/${h.played+a.played}`);
  if((n==='1'||n.includes('maç sonucu 1'))&&h) notes.push(`${match.home} galibiyet oranı son örneklemde ${h.wins}/${h.played}`);
  if((n==='2'||n.includes('maç sonucu 2'))&&a) notes.push(`${match.away} galibiyet oranı son örneklemde ${a.wins}/${a.played}`);
  return notes.length?`${t}. Seçimle doğrudan ilgili sinyal: ${notes.join('; ')}.`:t;
}
function tennisSide(c,match){
  const k=c.market.kind,n=Number(c.outcome.n||0);
  if(['match_winner','set1_winner','set2_winner','game_handicap','set_handicap'].includes(k)) return n===1?'home':n===2?'away':null;
  if(k==='winner_total_combo'){
    const label=norm(c.outcome.label);
    if(label.includes(norm(match.home))) return 'home';
    if(label.includes(norm(match.away))) return 'away';
  }
  return null;
}
function tennisSupport(c,cands,match){
  const side=tennisSide(c,match);
  if(!side) return [];
  const seen=new Set(),rows=[];
  for(const x of cands){
    if(x===c||!isRecommendable(x,match)||!DIRECTIONAL_TENNIS.has(x.market.kind)) continue;
    if(tennisSide(x,match)!==side) continue;
    const fp=fairProbability(x);
    if(fp<49) continue;
    const key=`${x.market.name}:${x.market.spread??''}`;
    if(seen.has(key)) continue;
    seen.add(key);
    rows.push({name:x.market.name,selection:x.outcome.label,odds:x.odds,fair:fp});
  }
  return rows.sort((a,b)=>b.fair-a.fair).slice(0,3);
}
function totalDirection(c){
  const l=norm(c.outcome.label);
  if(l.includes('üst')) return 'üst';
  if(l.includes('alt')) return 'alt';
  return null;
}
function totalSupport(c,cands,match){
  const d=totalDirection(c); if(!d) return [];
  const kinds=new Set(['total_games','home_games_total','away_games_total']);
  if(!kinds.has(c.market.kind)) return [];
  return cands.filter(x=>x!==c&&x.market.kind===c.market.kind&&totalDirection(x)===d&&isRecommendable(x,match))
    .map(x=>({line:x.market.spread,odds:x.odds,fair:fairProbability(x)}))
    .sort((a,b)=>Math.abs((a.line||0)-(c.market.spread||0))-Math.abs((b.line||0)-(c.market.spread||0))).slice(0,2);
}
function betMeaning(c,match){
  if(Number(match.sportType)===5){
    const k=c.market.kind,s=c.outcome.label;
    if(k==='match_winner') return `${s} karşılaşmayı kazanır.`;
    if(k==='set1_winner') return `${s} ilk seti kazanır.`;
    if(k==='set2_winner') return `${s} ikinci seti kazanır.`;
    if(k==='set_score') return `Maçın set skoru ${s} olur.`;
    if(k==='total_games') return `Maçtaki toplam oyun (game) sayısı ${s} koşulunu karşılar.`;
    if(k==='home_games_total'||k==='away_games_total') return `${s}: ilgili oyuncunun maç boyunca kazandığı toplam oyun sayısına göre sonuçlanır.`;
    if(k==='set_handicap') return `${s} set handikabı uygulanır. + handikap oyuncuya set avantajı, - handikap ise set farkıyla kazanma zorunluluğu verir.`;
    if(k==='game_handicap') return `${s} oyun handikabı uygulanır; maç sonundaki toplam game farkına bu çizgi eklenerek bahis sonuçlanır.`;
    if(k==='winner_total_combo') return `${s}: hem kazanan oyuncu hem de toplam oyun çizgisi aynı anda doğru olmalıdır.`;
    if(k==='set_match') return `${s}: ilk isim ilk setin, ikinci isim maçın kazananını ifade eder; iki koşul da tutmalıdır.`;
  }
  return `${c.market.name} marketinde ${c.outcome.label} seçimi.`;
}
function tennisReason(c,cands,match){
  const raw=implied(c.odds),fair=fairProbability(c),parts=[];
  parts.push(`Oran ${c.odds.toFixed(2)} ham olarak ${pct(raw)} olasılık ima ediyor; aynı marketteki diğer seçeneklerle marjı normalize edince piyasanın bu seçeneğe verdiği ağırlık yaklaşık ${pct(fair)}.`);
  if(fair>=55) parts.push('Bu, kendi marketi içinde güçlü tarafa yakın bir fiyatlama.');
  else if(fair>=42) parts.push('Market dengeli; seçim tek taraflı favoriden çok oran bandı ve market dengesi nedeniyle öne çıkıyor.');
  else parts.push('Bu seçim piyasanın düşük olasılıklı tarafında; NEÇ bunu yalnızca sürpriz oran bandına uyduğu için değerlendiriyor, güvenli seçim olarak değil.');
  const support=tennisSupport(c,cands,match);
  if(support.length){
    parts.push(`Aynı oyuncu yönünü çapraz doğrulayan market${support.length>1?'ler':''}: ${support.map(x=>`${x.name} → ${x.selection} ${x.odds.toFixed(2)} (normalize ${pct(x.fair)})`).join('; ')}.`);
  }
  const totals=totalSupport(c,cands,match);
  if(totals.length) parts.push(`Komşu toplam oyun çizgilerinde de aynı ${totalDirection(c)} yönü açık: ${totals.map(x=>`${x.line} çizgisi ${x.odds.toFixed(2)}`).join(', ')}. Bu, seçimin tek bir izole orana dayanmadığını gösteriyor.`);
  if(!support.length&&!totals.length) parts.push('Bu market için ikinci bir bağımsız form/istatistik teyidi yok; bu nedenle gerekçe yalnızca gerçek bülten fiyatlaması ve market içi dengeye dayanıyor.');
  return parts.join(' ');
}
function genericReason(c,form,match,cands){
  const raw=implied(c.odds),fair=fairProbability(c);
  const price=`Oran ${c.odds.toFixed(2)} ham ${pct(raw)} olasılığa karşılık geliyor; market içi marj normalize edildiğinde yaklaşık ${pct(fair)} ağırlık oluşuyor.`;
  if(Number(match.sportType)===5) return tennisReason(c,cands,match);
  return `${price} ${footballTrend(c,form,match)}`;
}
function makePick(label,c,form,match,tag,cands){
  if(!c) return {label,available:false,tag,reason:'Bu oran bandında açıklaması güvenilir biçimde çözülebilen uygun bir resmi market bulunamadı; teknik market kodu veya yapay seçim gösterilmedi.'};
  const meaning=betMeaning(c,match);
  return {label,available:true,tag,market:c.market.name,selection:c.outcome.label,odds:c.odds,implied:+implied(c.odds).toFixed(1),fair:+fairProbability(c).toFixed(1),meaning,reason:`Bu bahis ne demek? ${meaning} Neden NEÇ seçti? ${genericReason(c,form,match,cands)}`};
}
function specialCandidates(cands,match){
  if(Number(match.sportType)===5){
    const specialKinds=new Set(['set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);
    return cands.filter(c=>specialKinds.has(c.market.kind)&&isRecommendable(c,match)).sort((a,b)=>marketQuality(b,match)-marketQuality(a,match)||a.odds-b.odds);
  }
  return cands.filter(c=>SPECIAL.some(k=>norm(c.market.name).includes(k))).sort((a,b)=>marketQuality(b,match)-marketQuality(a,match)||a.odds-b.odds);
}
function insights(match,cands,form){
  const items=[];
  if(Number(match.sportType)===5){
    const main=cands.filter(c=>c.market.kind==='match_winner').sort((a,b)=>a.odds-b.odds);
    if(main.length>=2){
      const f=fairProbability(main[0]);
      items.push({title:'🎾 Ana Piyasa Dengesi',text:`Maç kazananı marketinde ${main[0].outcome.label} ${main[0].odds.toFixed(2)} ile önde; marj normalize edildiğinde yaklaşık ${pct(f)} piyasa ağırlığı taşıyor. NEÇ diğer tenis seçimlerini bu ana yönle çapraz kontrol ediyor.`});
    }
    const known=new Set(cands.filter(c=>isRecommendable(c,match)).map(c=>c.market.kind));
    items.push({title:'🧩 Çapraz Market Kanıtı',text:`Bu maçta anlamı çözülebilen ${known.size} farklı tenis market ailesi var. Öneriler mümkün olduğunda maç kazananı, set, handikap ve toplam oyun piyasalarının birbirini desteklemesine göre seçiliyor.`});
    items.push({title:'🧪 Veri Kalitesi',text:'Teniste son-10 performans verisi bu sürümde güvenilir dış kaynaktan eşleştirilmediyse uydurulmuyor. Her gerekçe gerçek oran, normalize piyasa ağırlığı ve aynı maçtaki çapraz marketlerden üretiliyor.'});
    return items;
  }
  const ms=cands.filter(c=>/maç sonucu|1x2/i.test(c.market.name));
  const fav=ms.slice().sort((a,b)=>a.odds-b.odds)[0];
  const volatile=cands.filter(c=>/(üst|karşılıklı|kg var)/i.test(c.market.name+' '+c.outcome.label)&&c.odds<1.85);
  if(fav&&fav.odds<1.55&&volatile.length) items.push({title:'⚡ Ters Köşe Alarmı',text:`Favori ${fav.odds.toFixed(2)} seviyesinde kısa; buna rağmen gol/karşılıklı gol piyasasında da güçlü fiyatlar var. Maç senaryosu favorinin beklenenden daha açık oynamasına müsait olabilir.`});
  const h=form?.home,a=form?.away;
  if(h&&a){const draws=h.draws+a.draws;if(draws<=2&&h.played+a.played>=12)items.push({title:'🧨 Seri Kırılma Radarı',text:`Eşleşen son ${h.played+a.played} takım-maç örneğinde beraberlik yalnızca ${draws} kez görüldü. Bu tek başına bahis sebebi değil; yalnızca oran da değer veriyorsa sürpriz sinyali.`});}
  else items.push({title:'🧪 Veri Kalitesi',text:'Son-10 form eşlemesi bulunamadı. NEÇ bu durumda istatistik uydurmuyor; gerekçeyi gerçek bülten fiyatlamasıyla sınırlandırıyor.'});
  items.push({title:'📡 Market Derinliği',text:`Bu maçta ${(match.markets||[]).length} gerçek market grubu okunabildi. Market derinliği arttıkça özel seçimleri çapraz doğrulama imkânı yükselir.`});
  return items;
}
function analyzeMatch(match,form){
  const cands=flat(match);
  const safe=choose(cands,1.20,2.20,match,'safe');
  const med=choose(cands,5.00,7.99,match);
  const agg=choose(cands,10.00,20.99,match);
  const sp=specialCandidates(cands,match);
  const used=new Set([safe,med,agg].filter(Boolean).map(x=>`${x.market.id}:${x.outcome.n}`));
  const special=sp.filter(x=>!used.has(`${x.market.id}:${x.outcome.n}`));
  const p4=special[0]||null,p5=special.find(x=>x.market.id!==p4?.market.id)||special[1]||null;
  const picks=[
    makePick('1 · En Yüksek Güvenli Aday',safe,form,match,'GÜVEN',cands),
    makePick('2 · Orta Sürpriz',med,form,match,'5–7 ORAN',cands),
    makePick('3 · Agresif Sürpriz',agg,form,match,'10–20 ORAN',cands),
    makePick('4 · Özel Market',p4,form,match,Number(match.sportType)===5?'SET / OYUN / HANDİKAP':'OYUNCU / ŞUT / KORNER',cands),
    makePick('5 · Özel Market+',p5,form,match,'ALTERNATİF',cands)
  ];
  const validKnown=cands.filter(c=>isRecommendable(c,match)).length;
  const radar=Math.min(99,Math.round(35+(med?18:0)+(agg?18:0)+(special.length?12:0)+Math.min(16,validKnown/4)));
  return {matchId:match.id,radar,picks,insights:insights(match,cands,form),form,generatedAt:new Date().toISOString(),disclaimer:'NEÇ seçimleri garanti değildir. Her seçim gerçek bülten oranı, market içi olasılık dengesi, çapraz market teyidi ve bulunabiliyorsa form verisiyle gerekçelendirilir.'};
}
module.exports={analyzeMatch};
