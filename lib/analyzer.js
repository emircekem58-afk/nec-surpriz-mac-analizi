function norm(s){return String(s||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function implied(odds){return odds>1?100/odds:0;}
function pct(n){return `${Number(n||0).toFixed(1)}%`;}
function signedPct(n){const v=Number(n||0);return `${v>=0?'+':''}${v.toFixed(1)}%`;}
function isTechnical(s){return /^(market|bahis|seçenek|secenek|option|outcome|selection)\s*[#:_-]?\s*\d+\b/i.test(String(s||'').trim());}

const TENNIS_OK=new Set(['match_winner','set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);
const SPECIAL_KINDS=new Set(['player_goal','player_first_goal','player_assist','player_card','player_sot','player_shot','player_fouled','player_foul','player_offside','player_goal_assist','goalkeeper_saves','corners_total','cards_total','corner_handicap','set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);

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
  if(Number(match.sportType)===5) return TENNIS_OK.has(c.market.kind);
  return true;
}

function marketQuality(c,match){
  if(!isRecommendable(c,match)) return -100;
  const k=c.market.kind||'other';
  if(Number(match.sportType)===5){
    return ({match_winner:52,set1_winner:34,set2_winner:30,total_games:30,game_handicap:27,set_handicap:27,home_games_total:22,away_games_total:22,set_match:14,winner_total_combo:12,set_score:8})[k]||4;
  }
  return ({match_result:55,match_winner:50,btts:42,total_goals:42,double_chance:34,handicap_result:28,handicap:26,asian_handicap:26,first_half_total:24,corners_total:20,cards_total:18,most_corners:16,goal_range:14,odd_even:12})[k] || (SPECIAL_KINDS.has(k)?10:6);
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

function empiricalProbability(c,form,match){
  const cov=formCoverage(form);
  if(Number(match.sportType)!==1||!cov.usable) return null;
  const h=form.home,a=form.away,k=c.market.kind;
  const hw=safeRate(h.wins,h.played),hd=safeRate(h.draws,h.played),hl=safeRate(h.losses,h.played);
  const aw=safeRate(a.wins,a.played),ad=safeRate(a.draws,a.played),al=safeRate(a.losses,a.played);

  if(k==='match_result'||k==='match_winner'){
    const side=matchSide(c,match);
    if(side==='home') return {p:100*((hw+al)/2),basis:`${match.home} galibiyet ${h.wins}/${h.played}; ${match.away} mağlubiyet ${a.losses}/${a.played}`};
    if(side==='draw') return {p:100*((hd+ad)/2),basis:`Beraberlik sıklığı ${h.draws}/${h.played} ve ${a.draws}/${a.played}`};
    if(side==='away') return {p:100*((aw+hl)/2),basis:`${match.away} galibiyet ${a.wins}/${a.played}; ${match.home} mağlubiyet ${h.losses}/${h.played}`};
  }

  if(k==='double_chance'){
    const l=norm(c.outcome.label);
    const ph=(hw+al)/2,pd=(hd+ad)/2,pa=(aw+hl)/2;
    if(l==='1x') return {p:100*clamp(ph+pd,0,1),basis:'Son formdan ev sahibi galibiyet + beraberlik bileşimi'};
    if(l==='12') return {p:100*clamp(ph+pa,0,1),basis:'Son formdan beraberlik dışı sonuç bileşimi'};
    if(l==='x2') return {p:100*clamp(pd+pa,0,1),basis:'Son formdan beraberlik + deplasman galibiyeti bileşimi'};
  }

  if(k==='total_goals'){
    const line=extractLine(c),dir=totalDirection(c);
    if(line!==null&&Math.abs(line-2.5)<0.01&&dir){
      const over=(safeRate(h.over25,h.played)+safeRate(a.over25,a.played))/2;
      const p=dir==='over'?over:1-over;
      return {p:100*p,basis:`Üst 2.5 sıklığı ${h.over25}/${h.played} ve ${a.over25}/${a.played}`};
    }
  }

  if(k==='btts'){
    const dir=bttsDirection(c);
    if(dir){
      const yes=(safeRate(h.btts,h.played)+safeRate(a.btts,a.played))/2;
      return {p:100*(dir==='yes'?yes:1-yes),basis:`KG Var sıklığı ${h.btts}/${h.played} ve ${a.btts}/${a.played}`};
    }
  }
  return null;
}

function modelMetrics(c,form,match){
  const fair=fairProbability(c),raw=implied(c.odds),emp=empiricalProbability(c,form,match);
  if(!emp) return {raw,fair,model:null,av:null,ev:null,confidence:'Veri yetersiz',basis:null};
  const cov=formCoverage(form);
  const empirical=clamp(emp.p,2,98);
  const model=clamp(fair*0.60+empirical*0.40,2,98);
  const av=model-fair;
  const ev=(model/100)*c.odds-1;
  const confidence=cov.total>=16&&Math.abs(av)>=4?'Orta-Yüksek':cov.total>=12?'Orta':'Düşük-Orta';
  return {raw,fair,model,av,ev,confidence,basis:emp.basis,empirical};
}

function candidateScore(c,form,match,min,max){
  const m=modelMetrics(c,form,match);
  const mid=(min+max)/2;
  let score=marketQuality(c,match)-Math.abs(c.odds-mid)*1.5;
  if(m.model!==null){
    score+=24+clamp(m.av*4,-20,32);
    if(m.ev>0) score+=8;
  }else score-=8;
  return {score,metrics:m};
}
function choose(cands,min,max,form,match){
  const rows=cands.filter(c=>c.odds>=min&&c.odds<=max&&isRecommendable(c,match));
  if(!rows.length) return null;
  return rows.map(c=>({c,...candidateScore(c,form,match,min,max)})).sort((a,b)=>b.score-a.score)[0].c;
}
function chooseSpecial(cands,form,match){
  const rows=cands.filter(c=>SPECIAL_KINDS.has(c.market.kind)&&isRecommendable(c,match));
  if(!rows.length) return null;
  return rows.map(c=>({c,m:modelMetrics(c,form,match)})).sort((a,b)=>{
    const am=a.m.model!==null?1:0,bm=b.m.model!==null?1:0;
    if(bm!==am) return bm-am;
    if((b.m.av??-99)!==(a.m.av??-99)) return (b.m.av??-99)-(a.m.av??-99);
    return marketQuality(b.c,match)-marketQuality(a.c,match)||a.c.odds-b.c.odds;
  })[0].c;
}

function betMeaning(c,match){
  const k=c.market.kind,s=c.outcome.label;
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
  if(k==='match_result') return `Maç Sonucu ${s}.`;
  if(k==='double_chance') return `Çifte Şans ${s}.`;
  if(k==='total_goals'||k==='first_half_total'||k==='corners_total'||k==='cards_total') return `${c.market.name}: ${s}.`;
  if(k==='btts') return `Karşılıklı Gol ${s}.`;
  return `${c.market.name} marketinde ${s} seçimi.`;
}

function reasonFor(c,form,match){
  const m=modelMetrics(c,form,match);
  const parts=[`Oran ${c.odds.toFixed(2)} → ham ima edilen olasılık ${pct(m.raw)}; aynı marketteki oran marjı normalize edilince piyasa ağırlığı ${pct(m.fair)}.`];
  if(m.model!==null){
    parts.push(`NEÇ modeli bağımsız son-form sinyalini piyasa ile muhafazakâr biçimde harmanlayınca ${pct(m.model)} üretiyor.`);
    parts.push(`AV ${m.av>=0?'+':''}${m.av.toFixed(1)} puan; teorik EV ${signedPct(m.ev*100)}.`);
    if(m.basis) parts.push(`Dayanak: ${m.basis}.`);
  }else{
    parts.push('Bu market için bağımsız ve güvenilir performans modeli yok; bu yüzden NEÇ olasılığı veya AV uydurulmadı. Bu seçim yalnızca gerçek bülten fiyatlaması olarak gösteriliyor.');
  }
  return parts.join(' ');
}

function makePick(label,c,form,match,tag){
  if(!c) return {label,available:false,tag,reason:'Bu oran bandında anlamı güvenilir biçimde çözülebilen uygun bir market bulunamadı. Ham market kodu veya “Seçenek 1” gösterilmedi.'};
  const m=modelMetrics(c,form,match);
  const meaning=betMeaning(c,match);
  return {
    label,available:true,tag,market:c.market.name,selection:c.outcome.label,odds:c.odds,
    implied:+m.raw.toFixed(1),fair:+m.fair.toFixed(1),model:m.model===null?null:+m.model.toFixed(1),
    av:m.av===null?null:+m.av.toFixed(1),ev:m.ev===null?null:+((m.ev)*100).toFixed(1),confidence:m.confidence,
    recommended:m.model!==null&&m.av>0.5&&m.ev>0,
    meaning,reason:`${meaning} ${reasonFor(c,form,match)}`
  };
}

function insights(match,cands,form){
  const items=[];
  const modeled=cands.map(c=>({c,m:modelMetrics(c,form,match)})).filter(x=>x.m.model!==null).sort((a,b)=>b.m.av-a.m.av);
  if(modeled.length){
    const best=modeled[0];
    items.push({title:'📈 En Yüksek Bağımsız AV',text:`${best.c.market.name} · ${best.c.outcome.label} ${best.c.odds.toFixed(2)} oranında NEÇ ${pct(best.m.model)}, piyasa ${pct(best.m.fair)}, AV ${best.m.av>=0?'+':''}${best.m.av.toFixed(1)} puan.`});
  }else{
    items.push({title:'📈 AV Durumu',text:'Bu maçta bağımsız performans verisiyle doğrulanabilen market bulunamadı. AV sayısı üretilmedi; sahte güven verilmedi.'});
  }
  const cov=formCoverage(form);
  if(Number(match.sportType)===1){
    items.push({title:'🧪 Veri Kalitesi',text:cov.usable?`Form eşleşmesi kullanılabilir: ${match.home} ${cov.hp} maç, ${match.away} ${cov.ap} maç. Model piyasa olasılığını tamamen terk etmiyor; form sinyalini %40 ağırlıkla ekliyor.`:'Son-form eşleşmesi yetersiz. Model olasılığı ve AV yalnızca yeterli veri olan marketlerde gösterilir.'});
  }else{
    items.push({title:'🧪 Veri Kalitesi',text:'Teniste bu sürümde bağımsız oyuncu-form kaynağı bağlı değil. Bu nedenle oranlardan yapay “NEÇ olasılığı” türetilmiyor.'});
  }
  const known=new Set(cands.map(c=>c.market.kind||c.market.name));
  items.push({title:'📡 Market Derinliği',text:`Anlamı çözülebilen ${known.size} farklı market ailesi ve ${cands.length} fiyat seçeneği analiz motoruna girdi. Teknik/anonim marketler analiz dışında bırakıldı.`});
  return items;
}

function radarScore(match,cands,form){
  const modeled=cands.map(c=>({c,m:modelMetrics(c,form,match)})).filter(x=>x.m.model!==null);
  if(!modeled.length) return clamp(Math.round(24+Math.min(18,cands.length/4)),1,55);
  const bestAv=Math.max(...modeled.map(x=>x.m.av));
  const positiveSurprises=modeled.filter(x=>x.c.odds>=2.5&&x.m.av>1).length;
  const cov=formCoverage(form);
  return clamp(Math.round(30+clamp(bestAv,0,12)*3.5+Math.min(12,positiveSurprises*3)+cov.quality*12),1,99);
}

function analyzeMatch(match,form){
  const cands=flat(match);
  const picks=[
    makePick('Dengeli Aday',choose(cands,1.20,2.20,form,match),form,match,'DÜŞÜK ORAN'),
    makePick('Sürpriz Aday',choose(cands,2.21,4.99,form,match),form,match,'ORTA SÜRPRİZ'),
    makePick('Yüksek Sürpriz',choose(cands,5.00,9.99,form,match),form,match,'YÜKSEK ORAN'),
    makePick('Agresif Aday',choose(cands,10.00,20.99,form,match),form,match,'AGRESİF'),
    makePick('Özel Market',chooseSpecial(cands,form,match),form,match,'ÖZEL')
  ];
  return {
    radar:radarScore(match,cands,form),
    form:form||null,
    picks,
    insights:insights(match,cands,form),
    analyzedAt:new Date().toISOString(),
    disclaimer:'NEÇ olasılığı yalnızca bağımsız form verisi yeterliyse hesaplanır. AV = NEÇ model olasılığı − normalize piyasa olasılığıdır; kesin sonuç veya kazanç garantisi değildir. Teknik market kodları ve çözülemeyen seçimler bilinçli olarak gösterilmez.'
  };
}

module.exports={analyzeMatch};
