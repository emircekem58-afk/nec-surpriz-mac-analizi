function norm(s){return String(s||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function implied(odds){return odds>1?100/odds:0;}
function pct(n){return `${Number(n||0).toFixed(1)}%`;}
function signedPct(n){const v=Number(n||0);return `${v>=0?'+':''}${v.toFixed(1)}%`;}
function isTechnical(s){return /^(market|bahis|seçenek|secenek|option|outcome|selection)\s*[#:_-]?\s*\d+\b/i.test(String(s||'').trim());}

const TENNIS_OK=new Set(['match_winner','set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);
const SPECIAL_KINDS=new Set(['htft','player_goal','player_first_goal','player_assist','player_card','player_sot','player_shot','player_fouled','player_foul','player_offside','player_goal_assist','goalkeeper_saves','corners_total','cards_total','corner_handicap','set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);

function kindOf(c){
  const direct=c?.market?.kind;
  if(direct&&direct!=='other') return direct;
  const n=norm(c?.market?.name);
  const l=norm(c?.outcome?.label);
  const htftLabel=/^[12x]\s*[\/-]\s*[12x]$/i.test(l);
  if(htftLabel && (n.includes('ilk yarı')||n.includes('ilk yari')||n.includes('devre')||n.includes('iy/ms')||n.includes('iy ms'))) return 'htft';
  if((n.includes('ilk yarı')||n.includes('ilk yari')||n.includes('devre'))&&(n.includes('maç sonucu')||n.includes('mac sonucu'))) return 'htft';
  return direct||'other';
}

function flat(match){
  const out=[];
  for(const market of match.markets||[]){
    if(!market||market.known===false||isTechnical(market.name)) continue;
    for(const outcome of market.outcomes||[]){
      const odds=Number(outcome?.odds);
      if(!(odds>1)||isTechnical(outcome?.label)) continue;
      out.push({market,outcome,odds});
    }
  }
  return out;
}

function fairProbability(c){
  const valid=(c.market.outcomes||[]).map(o=>Number(o.odds)).filter(o=>o>1);
  const sum=valid.reduce((s,o)=>s+1/o,0);
  return sum>0?((1/c.odds)/sum)*100:implied(c.odds);
}

function isRecommendable(c,match){
  if(!c||c.market?.known===false||isTechnical(c.market?.name)||isTechnical(c.outcome?.label)) return false;
  if(Number(match.sportType)===5) return TENNIS_OK.has(kindOf(c));
  return true;
}

function marketQuality(c,match){
  if(!isRecommendable(c,match)) return -100;
  const k=kindOf(c);
  if(Number(match.sportType)===5){
    return ({match_winner:52,set1_winner:34,set2_winner:30,total_games:30,game_handicap:27,set_handicap:27,home_games_total:22,away_games_total:22,set_match:14,winner_total_combo:12,set_score:8})[k]||4;
  }
  return ({match_result:55,match_winner:50,btts:42,total_goals:42,double_chance:34,handicap_result:28,handicap:26,asian_handicap:26,first_half_total:24,htft:18,corners_total:20,cards_total:18,most_corners:16,goal_range:14,odd_even:12})[k] || (SPECIAL_KINDS.has(k)?10:6);
}

function safeRate(n,d){return d>0?n/d:null;}
function formCoverage(form){
  const hp=Number(form?.home?.played||0),ap=Number(form?.away?.played||0);
  return {hp,ap,total:hp+ap,usable:hp>=4&&ap>=4,quality:clamp((hp+ap)/20,0,1)};
}
function matchSide(c,match){
  const l=norm(c.outcome.label),home=norm(match.home),away=norm(match.away);
  if(l==='1'||l===home||l.includes(home)) return 'home';
  if(l==='x'||l==='beraberlik'||l==='draw'||l==='eşit') return 'draw';
  if(l==='2'||l===away||l.includes(away)) return 'away';
  return null;
}
function totalDirection(c){
  const l=norm(c.outcome.label);
  if(l.includes('üst')||l.includes('over')) return 'over';
  if(l.includes('alt')||l.includes('under')) return 'under';
  return null;
}
function bttsDirection(c){
  const l=norm(c.outcome.label);
  if(l==='var'||l.includes('evet')||l.includes('yes')) return 'yes';
  if(l==='yok'||l.includes('hayır')||l.includes('hayir')||l.includes('no')) return 'no';
  return null;
}
function extractLine(c){
  if(Number.isFinite(Number(c.market.spread))) return Number(c.market.spread);
  const m=String(c.outcome.label||'').replace(',','.').match(/(\d+(?:\.\d+)?)/);
  return m?Number(m[1]):null;
}
function htftCombo(c){
  const m=String(c?.outcome?.label||'').toUpperCase().match(/([12X])\s*[\/-]\s*([12X])/);
  return m?`${m[1]}/${m[2]}`:null;
}
function htftMeaning(combo,match){
  const home=match.home,away=match.away;
  const map={
    '1/1':`${home} ilk yarıyı önde kapatır ve maçı kazanır.`,
    '1/X':`${home} ilk yarıyı önde kapatır, maç berabere biter.`,
    '1/2':`${home} ilk yarıyı önde kapatır, ${away} maçı çevirip kazanır.`,
    'X/1':`İlk yarı berabere biter, ${home} maçı kazanır.`,
    'X/X':'İlk yarı ve maç sonucu berabere biter.',
    'X/2':`İlk yarı berabere biter, ${away} maçı kazanır.`,
    '2/1':`${away} ilk yarıyı önde kapatır, ${home} maçı çevirip kazanır.`,
    '2/X':`${away} ilk yarıyı önde kapatır, maç berabere biter.`,
    '2/2':`${away} ilk yarıyı önde kapatır ve maçı kazanır.`
  };
  return map[combo]||`İlk Yarı/Maç Sonucu ${combo}.`;
}

function empiricalProbability(c,form,match){
  const cov=formCoverage(form);
  if(Number(match.sportType)!==1||!cov.usable) return null;
  const h=form.home,a=form.away,k=kindOf(c);
  const hw=safeRate(h.wins,h.played),hd=safeRate(h.draws,h.played),hl=safeRate(h.losses,h.played);
  const aw=safeRate(a.wins,a.played),ad=safeRate(a.draws,a.played),al=safeRate(a.losses,a.played);

  if(k==='match_result'||k==='match_winner'){
    const side=matchSide(c,match);
    if(side==='home') return {p:100*((hw+al)/2),sample:h.played+a.played,basis:`${match.home} galibiyet ${h.wins}/${h.played}; ${match.away} mağlubiyet ${a.losses}/${a.played}`};
    if(side==='draw') return {p:100*((hd+ad)/2),sample:h.played+a.played,basis:`Beraberlik sıklığı ${h.draws}/${h.played} ve ${a.draws}/${a.played}`};
    if(side==='away') return {p:100*((aw+hl)/2),sample:h.played+a.played,basis:`${match.away} galibiyet ${a.wins}/${a.played}; ${match.home} mağlubiyet ${h.losses}/${h.played}`};
  }

  if(k==='double_chance'){
    const l=norm(c.outcome.label);
    const ph=(hw+al)/2,pd=(hd+ad)/2,pa=(aw+hl)/2;
    if(l==='1x') return {p:100*clamp(ph+pd,0,1),sample:h.played+a.played,basis:'Son formdan ev sahibi galibiyet + beraberlik bileşimi'};
    if(l==='12') return {p:100*clamp(ph+pa,0,1),sample:h.played+a.played,basis:'Son formdan beraberlik dışı sonuç bileşimi'};
    if(l==='x2') return {p:100*clamp(pd+pa,0,1),sample:h.played+a.played,basis:'Son formdan beraberlik + deplasman galibiyeti bileşimi'};
  }

  if(k==='total_goals'){
    const line=extractLine(c),dir=totalDirection(c);
    if(line!==null&&Math.abs(line-2.5)<0.01&&dir){
      const over=(safeRate(h.over25,h.played)+safeRate(a.over25,a.played))/2;
      const p=dir==='over'?over:1-over;
      return {p:100*p,sample:h.played+a.played,basis:`Üst 2.5 sıklığı ${h.over25}/${h.played} ve ${a.over25}/${a.played}`};
    }
  }

  if(k==='btts'){
    const dir=bttsDirection(c);
    if(dir){
      const yes=(safeRate(h.btts,h.played)+safeRate(a.btts,a.played))/2;
      return {p:100*(dir==='yes'?yes:1-yes),sample:h.played+a.played,basis:`KG Var sıklığı ${h.btts}/${h.played} ve ${a.btts}/${a.played}`};
    }
  }

  if(k==='htft'){
    const combo=htftCombo(c);
    if(!combo) return null;
    const hr=h?.htftByRole?.home,ar=a?.htftByRole?.away;
    const hp=Number(hr?.played||0),ap=Number(ar?.played||0);
    const hc=Number(hr?.counts?.[combo]||0),ac=Number(ar?.counts?.[combo]||0);
    const sample=hp+ap,observed=hc+ac;
    if(sample<4) return null;
    return {
      p:100*(observed/sample),sample,observed,
      basis:`Rol uyumlu geçmişte ${match.home} iç sahada ${combo} ${hc}/${hp}, ${match.away} deplasmanda ${combo} ${ac}/${ap}; toplam ${observed}/${sample}`
    };
  }
  return null;
}

function modelMetrics(c,form,match){
  const fair=fairProbability(c),raw=implied(c.odds),emp=empiricalProbability(c,form,match);
  if(!emp) return {raw,fair,model:null,av:null,ev:null,confidence:'Veri yetersiz',confidencePct:0,basis:null,sample:0,observed:null,empirical:null};
  const cov=formCoverage(form);
  const empirical=clamp(emp.p,0.5,99.5);
  const k=kindOf(c);
  const marketWeight=k==='htft'?0.72:0.60;
  const empiricalWeight=1-marketWeight;
  const model=clamp(fair*marketWeight+empirical*empiricalWeight,0.5,99.5);
  const av=model-fair;
  const ev=(model/100)*c.odds-1;
  const sample=Number(emp.sample||cov.total||0);
  const agreement=1-clamp(Math.abs(empirical-fair)/50,0,1);
  let confidencePct=Math.round(18+Math.min(sample,20)*2.1+agreement*20);
  if(k==='htft') confidencePct=Math.min(confidencePct,58);
  else confidencePct=Math.min(confidencePct,82);
  confidencePct=clamp(confidencePct,12,82);
  const confidence=confidencePct>=70?'Yüksek':confidencePct>=55?'Orta-Yüksek':confidencePct>=40?'Orta':'Düşük';
  return {raw,fair,model,av,ev,confidence,confidencePct,basis:emp.basis,empirical,sample,observed:emp.observed??null};
}

function candidateScore(c,form,match,min,max){
  const m=modelMetrics(c,form,match);
  const mid=(min+max)/2;
  let score=marketQuality(c,match)-Math.abs(c.odds-mid)*1.5;
  if(m.model!==null){
    score+=20+clamp(m.av*4,-20,34)+(m.confidencePct/10);
    if(m.ev>0) score+=8;
  }else score-=10;
  return {score,metrics:m};
}
function candidateId(c){return c?`${c.market?.id??c.market?.typeId}:${c.outcome?.n}:${c.odds}`:'';}
function choose(cands,min,max,form,match,exclude=new Set()){
  const rows=cands.filter(c=>c.odds>=min&&c.odds<=max&&isRecommendable(c,match)&&!exclude.has(candidateId(c)));
  if(!rows.length) return null;
  return rows.map(c=>({c,...candidateScore(c,form,match,min,max)})).sort((a,b)=>b.score-a.score)[0].c;
}
function chooseBigSurprise(cands,form,match,exclude=new Set()){
  const rows=cands.filter(c=>c.odds>=4&&c.odds<=40&&isRecommendable(c,match)&&!exclude.has(candidateId(c)));
  if(!rows.length) return null;
  return rows.map(c=>{
    const m=modelMetrics(c,form,match),k=kindOf(c);
    let score=marketQuality(c,match)+Math.min(18,Math.log2(c.odds)*4);
    if(k==='htft') score+=15;
    if(m.model!==null) score+=20+clamp(m.av*5,-25,40)+(m.ev>0?10:0)+(m.confidencePct/12);
    else score-=15;
    return {c,m,score};
  }).sort((a,b)=>b.score-a.score)[0].c;
}
function chooseSpecial(cands,form,match,exclude=new Set()){
  const rows=cands.filter(c=>SPECIAL_KINDS.has(kindOf(c))&&isRecommendable(c,match)&&!exclude.has(candidateId(c)));
  if(!rows.length) return null;
  return rows.map(c=>({c,m:modelMetrics(c,form,match)})).sort((a,b)=>{
    const am=a.m.model!==null?1:0,bm=b.m.model!==null?1:0;
    if(bm!==am) return bm-am;
    if((b.m.av??-99)!==(a.m.av??-99)) return (b.m.av??-99)-(a.m.av??-99);
    return marketQuality(b.c,match)-marketQuality(a.c,match)||a.c.odds-b.c.odds;
  })[0].c;
}

function betMeaning(c,match){
  const k=kindOf(c),s=c.outcome.label;
  if(Number(match.sportType)===5){
    if(k==='match_winner') return `${s} karşılaşmayı kazanır.`;
    if(k==='set1_winner') return `${s} ilk seti kazanır.`;
    if(k==='set2_winner') return `${s} ikinci seti kazanır.`;
    if(k==='set_score') return `Maçın set skoru ${s} olur.`;
    if(k==='total_games') return `Maçtaki toplam oyun sayısı ${s} koşuluna göre sonuçlanır.`;
    if(k==='home_games_total'||k==='away_games_total') return `${s}: ilgili oyuncunun toplam kazandığı oyun sayısına göre sonuçlanır.`;
    if(k==='set_handicap'||k==='game_handicap') return `${s} handikap çizgisi uygulanır.`;
    if(k==='winner_total_combo') return `${s}: kazanan ve toplam oyun koşulları birlikte gerçekleşmelidir.`;
    if(k==='set_match') return `${s}: set ve maç kazananı koşulları birlikte gerçekleşmelidir.`;
  }
  if(k==='htft') return htftMeaning(htftCombo(c),match);
  if(k==='match_result') return `Maç Sonucu ${s}.`;
  if(k==='double_chance') return `Çifte Şans ${s}.`;
  if(k==='total_goals'||k==='first_half_total'||k==='corners_total'||k==='cards_total') return `${c.market.name}: ${s}.`;
  if(k==='btts') return `Karşılıklı Gol ${s}.`;
  return `${c.market.name} marketinde ${s} seçimi.`;
}

function reasonFor(c,form,match){
  const m=modelMetrics(c,form,match),k=kindOf(c);
  const parts=[`Nesine oranı ${c.odds.toFixed(2)} → ham ima edilen olasılık ${pct(m.raw)}; aynı marketteki marj normalize edilince piyasa ağırlığı ${pct(m.fair)}.`];
  if(m.model!==null){
    if(k==='htft'&&m.observed===0){
      parts.push(`Rol uyumlu son ${m.sample} tarihsel örnekte bu ${htftCombo(c)} senaryosu hiç görülmedi. Bu durum “artık olur” anlamına gelmez; yalnızca senaryonun çok nadir olduğunu gösterir.`);
    }else if(k==='htft'){
      parts.push(`Rol uyumlu son ${m.sample} tarihsel örnekte bu senaryo ${m.observed} kez görüldü.`);
    }
    parts.push(`NEÇ gerçekleşme olasılığı ${pct(m.model)}; veri güveni ${m.confidencePct}%.`);
    parts.push(`AV ${m.av>=0?'+':''}${m.av.toFixed(1)} puan; teorik EV ${signedPct(m.ev*100)}.`);
    if(m.basis) parts.push(`Dayanak: ${m.basis}.`);
    if(k==='htft'){
      if(m.av>0.5&&m.ev>0) parts.push('Oran nadirliği modelin hesapladığı olasılığa göre yeterince telafi ediyor; bu yüzden yalnızca yüksek riskli sürpriz adayı olarak değerlendirilebilir.');
      else parts.push('Sadece uzun süredir görülmemiş olması bahis sebebi değil; mevcut fiyat model açısından yeterli değer bırakmıyorsa öneri sayılmaz.');
    }
  }else{
    parts.push('Bu market için bağımsız ve güvenilir performans örneklemi yetersiz; NEÇ gerçekleşme olasılığı, AV veya güven yüzdesi uydurulmadı.');
  }
  return parts.join(' ');
}

function makePick(label,c,form,match,tag){
  if(!c) return {label,available:false,tag,reason:'Bu kategori için anlamı ve verisi güvenilir biçimde çözülebilen uygun bir market bulunamadı. Ham market kodu veya yapay tahmin gösterilmedi.'};
  const m=modelMetrics(c,form,match);
  const meaning=betMeaning(c,match);
  return {
    label,available:true,tag,market:c.market.name,selection:c.outcome.label,odds:c.odds,
    implied:+m.raw.toFixed(1),fair:+m.fair.toFixed(1),model:m.model===null?null:+m.model.toFixed(1),
    av:m.av===null?null:+m.av.toFixed(1),ev:m.ev===null?null:+((m.ev)*100).toFixed(1),
    confidence:m.confidence,confidencePct:m.confidencePct,
    recommended:m.model!==null&&m.av>0.5&&m.ev>0&&m.confidencePct>=30,
    meaning,reason:`${meaning} ${reasonFor(c,form,match)}`
  };
}

function insights(match,cands,form){
  const items=[];
  const modeled=cands.map(c=>({c,m:modelMetrics(c,form,match)})).filter(x=>x.m.model!==null).sort((a,b)=>b.m.av-a.m.av);
  if(modeled.length){
    const best=modeled[0];
    items.push({title:'📈 En Yüksek Bağımsız AV',text:`${best.c.market.name} · ${best.c.outcome.label} ${best.c.odds.toFixed(2)} oranında NEÇ olasılığı ${pct(best.m.model)}, piyasa ${pct(best.m.fair)}, AV ${best.m.av>=0?'+':''}${best.m.av.toFixed(1)} puan; veri güveni ${best.m.confidencePct}%.`});
  }else{
    items.push({title:'📈 AV Durumu',text:'Bu maçta bağımsız performans verisiyle doğrulanabilen market bulunamadı. AV veya tahmin yüzdesi üretilmedi.'});
  }
  const cov=formCoverage(form);
  if(Number(match.sportType)===1){
    items.push({title:'🧪 Veri Kalitesi',text:cov.usable?`Form eşleşmesi kullanılabilir: ${match.home} ${cov.hp} maç, ${match.away} ${cov.ap} maç. İlk yarı/maç sonucu için ayrıca yalnızca devre skoru okunabilen rol-uyumlu örnekler kullanılır.`:'Son-form eşleşmesi yetersiz. Model olasılığı ve AV yalnızca yeterli veri olan marketlerde gösterilir.'});
  }else{
    items.push({title:'🧪 Veri Kalitesi',text:'Teniste bağımsız oyuncu-form kaynağı henüz güvenilir biçimde bağlı değil. Bu nedenle oranlardan yapay “NEÇ olasılığı” türetilmiyor.'});
  }
  const known=new Set(cands.map(c=>kindOf(c)||c.market.name));
  items.push({title:'📡 Market Derinliği',text:`Anlamı çözülebilen ${known.size} farklı market ailesi ve ${cands.length} gerçek fiyat seçeneği analiz motoruna girdi. Oranlar Nesine bülteninden değiştirilmeden kullanılıyor.`});
  return items;
}

function radarScore(match,cands,form){
  const modeled=cands.map(c=>({c,m:modelMetrics(c,form,match)})).filter(x=>x.m.model!==null);
  if(!modeled.length) return clamp(Math.round(20+Math.min(18,cands.length/4)),1,50);
  const bestAv=Math.max(...modeled.map(x=>x.m.av));
  const positiveSurprises=modeled.filter(x=>x.c.odds>=2.5&&x.m.av>1&&x.m.ev>0).length;
  const avgConfidence=modeled.reduce((s,x)=>s+x.m.confidencePct,0)/modeled.length;
  return clamp(Math.round(24+clamp(bestAv,0,12)*3.2+Math.min(15,positiveSurprises*3)+avgConfidence*.18),1,99);
}

function analyzeMatch(match,form){
  const cands=flat(match),used=new Set();
  const p1=choose(cands,1.20,2.20,form,match,used); if(p1)used.add(candidateId(p1));
  const p2=choose(cands,2.21,4.99,form,match,used); if(p2)used.add(candidateId(p2));
  const p3=choose(cands,5.00,9.99,form,match,used); if(p3)used.add(candidateId(p3));
  const p4=chooseBigSurprise(cands,form,match,used); if(p4)used.add(candidateId(p4));
  const p5=chooseSpecial(cands,form,match,used); if(p5)used.add(candidateId(p5));
  const picks=[
    makePick('Dengeli Aday',p1,form,match,'DÜŞÜK ORAN'),
    makePick('Sürpriz Aday',p2,form,match,'ORTA SÜRPRİZ'),
    makePick('Yüksek Sürpriz',p3,form,match,'YÜKSEK ORAN'),
    makePick('En Büyük Sürpriz',p4,form,match,'🔥 EN BÜYÜK SÜRPRİZ'),
    makePick('Özel Market',p5,form,match,'ÖZEL')
  ];
  return {
    radar:radarScore(match,cands,form),
    form:form||null,
    picks,
    insights:insights(match,cands,form),
    analyzedAt:new Date().toISOString(),
    disclaimer:'Oranlar Nesine bülteninden geldiği haliyle kullanılır. NEÇ olasılığı yalnızca bağımsız veri yeterliyse hesaplanır. “Uzun süredir olmadı, artık olur” mantığı kullanılmaz. AV ve EV istatistiksel model göstergesidir; kesin sonuç veya kazanç garantisi değildir.'
  };
}

module.exports={analyzeMatch};
