function norm(s){return String(s||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function implied(odds){return odds>1?100/odds:0;}
function isTechnical(s){return /^(market|bahis|seçenek|secenek|option|outcome|selection)\s*[#:_-]?\s*\d+\b/i.test(String(s||'').trim());}
function avg(n,d){return d>0?n/d:0;}
function pct(n){return `${Number(n||0).toFixed(1)}%`;}
function fmt(n){return Number(n||0).toFixed(1).replace('.0','');}

const TENNIS_OK=new Set(['match_winner','set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);
const SPECIAL_KINDS=new Set(['htft','btts','total_goals','first_half_total','handicap_result','handicap','asian_handicap','corners_total','cards_total','corner_handicap','player_goal','player_first_goal','player_assist','player_card','player_sot','player_shot','player_goal_assist','goalkeeper_saves','set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);
const FOOTBALL_ANALYZABLE=new Set(['match_result','match_winner','double_chance','total_goals','btts','htft']);

function kindOf(c){
  const direct=c?.market?.kind;
  if(direct&&direct!=='other') return direct;
  const n=norm(c?.market?.name),l=norm(c?.outcome?.label);
  if(/^[12x]\s*[\/-]\s*[12x]$/i.test(l) && (n.includes('ilk yar')||n.includes('devre')||n.includes('iy/ms')||n.includes('iy ms'))) return 'htft';
  if((n.includes('ilk yar')||n.includes('devre'))&&(n.includes('maç sonucu')||n.includes('mac sonucu'))) return 'htft';
  if(n.includes('karşılıklı gol')||n.includes('karsilikli gol')||n==='kg') return 'btts';
  if(n.includes('toplam gol')&&(n.includes('alt')||n.includes('üst')||n.includes('ust'))) return 'total_goals';
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
  const k=kindOf(c);
  const nonExclusive=new Set(['double_chance']);
  if(nonExclusive.has(k)) return implied(c.odds);
  const valid=(c.market.outcomes||[]).map(o=>Number(o.odds)).filter(o=>o>1);
  const sum=valid.reduce((s,o)=>s+1/o,0);
  return sum>0?((1/c.odds)/sum)*100:implied(c.odds);
}
function sideOf(c,match){
  const l=norm(c.outcome.label),h=norm(match.home),a=norm(match.away);
  if(l==='1'||l===h||l.includes(h)) return 'home';
  if(l==='x'||l==='beraberlik'||l==='draw'||l==='eşit') return 'draw';
  if(l==='2'||l===a||l.includes(a)) return 'away';
  return null;
}
function totalDir(c){
  const l=norm(c.outcome.label);
  if(l.includes('üst')||l.includes('ust')||l.includes('over')) return 'over';
  if(l.includes('alt')||l.includes('under')) return 'under';
  return null;
}
function bttsDir(c){
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
function finalSideFromCombo(combo){
  if(!combo) return null;
  const f=combo.split('/')[1];
  return f==='1'?'home':f==='2'?'away':f==='X'?'draw':null;
}
function doubleChanceSides(label){
  const l=norm(label).replace(/\s/g,'');
  if(l==='1x') return new Set(['home','draw']);
  if(l==='x2') return new Set(['draw','away']);
  if(l==='12') return new Set(['home','away']);
  return null;
}
function formOk(form){return !!(form?.home?.played>=4&&form?.away?.played>=4);}
function resultMarket(cands,match){
  return cands.filter(c=>['match_result','match_winner'].includes(kindOf(c))&&sideOf(c,match));
}
function normalize3(obj){
  const s=(obj.home||0)+(obj.draw||0)+(obj.away||0);
  return s>0?{home:obj.home/s*100,draw:obj.draw/s*100,away:obj.away/s*100}:{home:33.3,draw:33.4,away:33.3};
}
function buildScenario(match,cands,form){
  if(Number(match.sportType)===5){
    const main=cands.filter(c=>kindOf(c)==='match_winner').map(c=>({c,p:fairProbability(c)})).sort((a,b)=>b.p-a.p);
    const leader=main[0]?.c||cands[0];
    const side=leader?sideOf(leader,match):null;
    const primary=side||'home';
    return {
      primary,goalLean:null,bttsLean:null,confidence:32,
      title: primary==='home'?`${match.home} tarafı önde`:`${match.away} tarafı önde`,
      summary:`Teniste bağımsız oyuncu-form kaynağı henüz yeterli olmadığı için ana yön resmi maç kazananı piyasasından okunuyor. NEÇ bu maçta zıt yönlü seçim üretmez.`,
      formText:'Bağımsız tenis form verisi sınırlı; yorum resmi market yönüyle sınırlandırıldı.',
      probabilities:null
    };
  }

  const market={home:0,draw:0,away:0};
  for(const c of resultMarket(cands,match)){
    const s=sideOf(c,match); if(s) market[s]=Math.max(market[s],fairProbability(c));
  }
  let mp=normalize3(market);
  let empirical=null;
  if(formOk(form)){
    const h=form.home,a=form.away;
    const home=(avg(h.wins,h.played)+avg(a.losses,a.played))/2;
    const draw=(avg(h.draws,h.played)+avg(a.draws,a.played))/2;
    const away=(avg(a.wins,a.played)+avg(h.losses,h.played))/2;
    empirical=normalize3({home,draw,away});
  }
  let probs=mp;
  if(empirical){
    probs=normalize3({
      home:mp.home*.55+empirical.home*.45,
      draw:mp.draw*.55+empirical.draw*.45,
      away:mp.away*.55+empirical.away*.45
    });
  }
  const primary=Object.entries(probs).sort((a,b)=>b[1]-a[1])[0][0];
  let goalLean=null,bttsLean=null;
  if(formOk(form)){
    const h=form.home,a=form.away;
    const overRate=(avg(h.over25,h.played)+avg(a.over25,a.played))/2;
    const bttsRate=(avg(h.btts,h.played)+avg(a.btts,a.played))/2;
    goalLean=overRate>=.58?'over':overRate<=.42?'under':null;
    bttsLean=bttsRate>=.58?'yes':bttsRate<=.42?'no':null;
  }
  const values=[probs.home,probs.draw,probs.away].sort((a,b)=>b-a);
  const lead=values[0]-values[1];
  const confidence=clamp(Math.round((formOk(form)?45:25)+Math.max(0,lead)*.7),20,82);
  const h=form?.home,a=form?.away;
  const sideName=primary==='home'?match.home:primary==='away'?match.away:'beraberlik';
  const title=primary==='draw'?`Dengeli maç — beraberlik ekseni`:`${sideName} ana yön`;
  const hr=h?.roleStats?.home, ar=a?.roleStats?.away;
  const rolePart=(hr?.played>=2&&ar?.played>=2)
    ? ` Ev sahibi rolünde ${match.home} ${hr.played} maçta ${hr.wins}G ${hr.draws}B ${hr.losses}M ve ${hr.avgGF.toFixed(2)} gol ortalaması; deplasman rolünde ${match.away} ${ar.played} maçta ${ar.wins}G ${ar.draws}B ${ar.losses}M ve ${ar.avgGF.toFixed(2)} gol ortalaması.`
    : '';
  const formText=formOk(form)
    ? `${match.home} son ${h.played} maçta ${h.wins}G ${h.draws}B ${h.losses}M; maç başı ${avg(h.goalsFor,h.played).toFixed(2)} gol atıp ${avg(h.goalsAgainst,h.played).toFixed(2)} gol yedi. ${match.away} son ${a.played} maçta ${a.wins}G ${a.draws}B ${a.losses}M; maç başı ${avg(a.goalsFor,a.played).toFixed(2)} gol atıp ${avg(a.goalsAgainst,a.played).toFixed(2)} gol yedi.${rolePart}`
    : 'İki takım için yeterli eşleşen form verisi bulunmadı; ana yön resmi oran dağılımından okunuyor.';
  let summary;
  if(primary==='home') summary=`NEÇ maçın ana hikâyesini ${match.home} lehine kuruyor. ${match.home} tarafını destekleyen seçimler kullanılacak; ${match.away} galibiyeti gibi zıt bahisler aynı analizde yer almayacak.`;
  else if(primary==='away') summary=`NEÇ maçın ana hikâyesini ${match.away} lehine kuruyor. ${match.away} tarafını destekleyen seçimler kullanılacak; ${match.home} galibiyeti gibi zıt bahisler aynı analizde yer almayacak.`;
  else summary='İki taraf arasında belirgin üstünlük oluşmadığı için ana senaryo beraberlik/dengeli oyun ekseninde. Keskin 1 veya 2 seçimleri yalnızca bu senaryoyla çelişmiyorsa kullanılacak.';
  if(goalLean==='over') summary+=' İki takımın son maç profili daha gollü senaryoya yakın.';
  if(goalLean==='under') summary+=' Son maç profili daha kontrollü/düşük skorlu senaryoya yakın.';
  if(bttsLean==='yes') summary+=' İki takımın da skor bulduğu maç oranı yüksek.';
  if(bttsLean==='no') summary+=' Taraflardan birinin gol bulamama ihtimali form verisinde öne çıkıyor.';
  return {primary,goalLean,bttsLean,confidence,title,summary,formText,probabilities:probs};
}
function isCompatible(c,scenario,match){
  const k=kindOf(c);
  if(Number(match.sportType)===5){
    if(k==='match_winner'){
      const s=sideOf(c,match); return !s||s===scenario.primary;
    }
    return true;
  }
  if(['match_result','match_winner'].includes(k)){
    return sideOf(c,match)===scenario.primary;
  }
  if(k==='double_chance'){
    const s=doubleChanceSides(c.outcome.label);
    if(!s) return true;
    if(scenario.primary==='home') return s.has('home')&&!s.has('away');
    if(scenario.primary==='away') return s.has('away')&&!s.has('home');
    return s.has('draw');
  }
  if(k==='htft'){
    return finalSideFromCombo(htftCombo(c))===scenario.primary;
  }
  if(k==='total_goals'&&scenario.goalLean){
    const d=totalDir(c);
    return !d||d===scenario.goalLean;
  }
  if(k==='btts'&&scenario.bttsLean){
    const d=bttsDir(c);
    return !d||d===scenario.bttsLean;
  }
  const l=norm(c.outcome.label);
  if(scenario.primary==='home' && (l==='2'||l.startsWith('2 /')||l.startsWith('2/'))) return false;
  if(scenario.primary==='away' && (l==='1'||l.startsWith('1 /')||l.startsWith('1/'))) return false;
  return true;
}
function modelFor(c,scenario,form,match){
  const fair=fairProbability(c),k=kindOf(c);
  let model=fair,source='market';
  if(Number(match.sportType)===1){
    if(['match_result','match_winner'].includes(k)){
      const s=sideOf(c,match);
      if(s&&scenario.probabilities?.[s]!=null){model=scenario.probabilities[s];source='form+market';}
    }else if(k==='double_chance'&&scenario.probabilities){
      const sides=doubleChanceSides(c.outcome.label);
      if(sides){model=[...sides].reduce((sum,s)=>sum+(scenario.probabilities[s]||0),0);source='form+market';}
    }else if(k==='total_goals'&&formOk(form)){
      const line=extractLine(c),dir=totalDir(c);
      if(line!==null&&Math.abs(line-2.5)<.01&&dir){
        const over=(avg(form.home.over25,form.home.played)+avg(form.away.over25,form.away.played))/2*100;
        model=dir==='over'?over:100-over; source='form';
      }
    }else if(k==='btts'&&formOk(form)){
      const dir=bttsDir(c);
      if(dir){
        const yes=(avg(form.home.btts,form.home.played)+avg(form.away.btts,form.away.played))/2*100;
        model=dir==='yes'?yes:100-yes; source='form';
      }
    }else if(k==='htft'&&formOk(form)){
      const combo=htftCombo(c);
      const hr=form.home?.htftByRole?.home,ar=form.away?.htftByRole?.away;
      const n=Number(hr?.played||0)+Number(ar?.played||0);
      const hits=Number(hr?.counts?.[combo]||0)+Number(ar?.counts?.[combo]||0);
      if(combo&&n>=4){model=fair*.72+(hits/n*100)*.28;source='htft-history';}
    }
  }
  model=clamp(model,.5,99.5);
  const av=model-fair;
  let confidence=source==='market'?18:source==='htft-history'?Math.min(58,30+(Number(form?.home?.played||0)+Number(form?.away?.played||0))*2):scenario.confidence;
  return {fair,model,av,ev:model/100*c.odds-1,confidence:clamp(Math.round(confidence),12,82),source};
}
function formSentence(form,match){
  if(!formOk(form)) return 'Yeterli bağımsız form eşleşmesi yok; bu seçimde yalnızca doğrulanabilen piyasa yönü kullanıldı.';
  const h=form.home,a=form.away;
  return `${match.home}: ${h.wins}/${h.played} galibiyet, ${h.goalsFor}-${h.goalsAgainst} gol; ${match.away}: ${a.wins}/${a.played} galibiyet, ${a.goalsFor}-${a.goalsAgainst} gol.`;
}
function pickReason(c,scenario,form,match,role){
  const k=kindOf(c),m=modelFor(c,scenario,form,match);
  const parts=[];
  if(role==='main') parts.push(`Bu seçim maçın ana yönüyle birebir aynı: ${scenario.title}.`);
  else if(role==='safe') parts.push('Bu seçim ana senaryonun daha temkinli versiyonu; ters sonucu aynı kupona sokmuyor.');
  else if(role==='surprise') parts.push('Bu seçim ana senaryoyu bozmadan oranı yükselten daha cesur varyasyon.');
  else if(role==='big') parts.push('Bu, aynı maç hikâyesinin en agresif ama hâlâ çelişmeyen sürpriz varyasyonu.');
  else parts.push('NEÇ Özel seçim, ana maç hikâyesiyle uyumlu gerçek marketler arasından seçildi.');
  parts.push(formSentence(form,match));
  if(k==='total_goals'){
    const d=totalDir(c);
    if(formOk(form)) parts.push(`Son maçlarda Üst 2.5 görülme sayısı toplam ${form.home.over25+form.away.over25}/${form.home.played+form.away.played}; bu yüzden ${d==='over'?'gollü':'daha kontrollü'} senaryo destekleniyor.`);
  }
  if(k==='btts'&&formOk(form)) parts.push(`KG Var toplam ${form.home.btts+form.away.btts}/${form.home.played+form.away.played} maçta görüldü.`);
  if(k==='htft'){
    const combo=htftCombo(c),hr=form?.home?.htftByRole?.home,ar=form?.away?.htftByRole?.away;
    const sample=Number(hr?.played||0)+Number(ar?.played||0),hits=Number(hr?.counts?.[combo]||0)+Number(ar?.counts?.[combo]||0);
    if(sample>=4){
      if(hits===0) parts.push(`Rol uyumlu ${sample} geçmiş örnekte ${combo} hiç görülmedi. Bu “artık olur” demek değildir; yalnızca çok nadir olduğu için yüksek riskli sürpriz olarak tutulur.`);
      else parts.push(`Rol uyumlu ${sample} geçmiş örnekte ${combo} ${hits} kez görüldü; bu yüzden tamamen rastgele bir kombinasyon değil.`);
    }
  }
  if(m.av>0.5) parts.push(`NEÇ AV +${m.av.toFixed(1)} puan: form yönü mevcut fiyattan biraz daha olumlu.`);
  else if(m.av<-0.5) parts.push(`NEÇ AV ${m.av.toFixed(1)} puan: oran yüksek olsa da model bu fiyatı güçlü değer olarak görmüyor.`);
  else parts.push(`NEÇ AV ${m.av.toFixed(1)} puan: fiyat ile model birbirine yakın, belirgin değer avantajı yok.`);
  return parts.join(' ');
}
function candidateScore(c,scenario,form,match,role){
  if(!isCompatible(c,scenario,match)) return -9999;
  const m=modelFor(c,scenario,form,match),k=kindOf(c);
  let score=(m.av*5)+(m.confidence*.18);
  if(role==='main'){
    if(['match_result','match_winner'].includes(k)) score+=80;
    else score-=20;
  }
  if(role==='safe'){
    if(k==='double_chance') score+=60;
    if(c.odds<=2.2) score+=18;
  }
  if(role==='surprise'){
    if(c.odds>=2.2&&c.odds<=6) score+=40-Math.abs(c.odds-3.4)*3;
    if(['htft','total_goals','btts','handicap_result','handicap'].includes(k)) score+=10;
  }
  if(role==='big'){
    if(c.odds>=5&&c.odds<=40) score+=42+Math.min(18,Math.log2(c.odds)*3);
    if(k==='htft') score+=18;
  }
  if(role==='special'){
    if(SPECIAL_KINDS.has(k)) score+=45;
    if(c.odds>=1.5&&c.odds<=12) score+=12;
  }
  return score;
}
function choose(cands,scenario,form,match,role,used=new Set()){
  let rows=cands.filter(c=>!used.has(`${c.market.id??c.market.typeId}:${c.outcome.n}:${c.odds}`)&&isCompatible(c,scenario,match));
  if(role==='main') rows=rows.filter(c=>['match_result','match_winner'].includes(kindOf(c)));
  if(role==='safe'){
    const dc=rows.filter(c=>kindOf(c)==='double_chance');
    if(dc.length){
      return dc.map(c=>({c,s:candidateScore(c,scenario,form,match,role)})).sort((a,b)=>b.s-a.s)[0].c;
    }
    rows=rows.filter(c=>c.odds<=2.8);
  }
  if(Number(match.sportType)===1 && ['safe','surprise','big'].includes(role)) rows=rows.filter(c=>FOOTBALL_ANALYZABLE.has(kindOf(c)));
  if(role==='surprise') rows=rows.filter(c=>c.odds>=2.1&&c.odds<=7.5);
  if(role==='big') rows=rows.filter(c=>c.odds>=4);
  if(!rows.length) return null;
  return rows.map(c=>({c,s:candidateScore(c,scenario,form,match,role)})).sort((a,b)=>b.s-a.s)[0].c;
}
function chooseNecSpecial(cands,scenario,form,match){
  const rows=cands.filter(c=>isCompatible(c,scenario,match));
  if(!rows.length) return null;
  const modeled=rows.filter(c=>modelFor(c,scenario,form,match).source!=='market');
  const pool=modeled.length?modeled:rows.filter(c=>['match_result','match_winner'].includes(kindOf(c)));
  const finalPool=pool.length?pool:rows;
  return finalPool.map(c=>{
    const m=modelFor(c,scenario,form,match),k=kindOf(c);
    let score=m.av*7+m.confidence*.22;
    if(m.source!=='market') score+=18;
    if(['total_goals','btts','htft'].includes(k)) score+=10;
    if(c.odds>=1.35&&c.odds<=8) score+=8;
    if(m.av>0) score+=18;
    return {c,score};
  }).sort((a,b)=>b.score-a.score)[0].c;
}
function makePick(label,c,scenario,form,match,role,tag){
  if(!c) return {label,available:false,tag,av:0,avText:'0.0',reason:'Ana maç senaryosuyla çelişmeden bu kategoriye uygun gerçek bir market bulunamadı.'};
  const m=modelFor(c,scenario,form,match);
  return {
    label,available:true,tag,market:c.market.name,selection:c.outcome.label,odds:c.odds,
    av:+m.av.toFixed(1),avText:`${m.av>=0?'+':''}${m.av.toFixed(1)}`,
    confidencePct:m.confidence,model:+m.model.toFixed(1),fair:+m.fair.toFixed(1),
    recommended:m.av>0.5&&m.confidence>=30,
    reason:pickReason(c,scenario,form,match,role)
  };
}
function specialComment(scenario,form,match,special){
  const f=scenario.formText;
  let text=`${scenario.summary} ${f}`;
  if(special?.available) text+=` NEÇ Özel: ${special.market} — ${special.selection} (${Number(special.odds).toFixed(2)}). ${special.reason}`;
  return text;
}
function radarScore(scenario,picks){
  const avs=picks.filter(p=>p.available).map(p=>p.av);
  const best=avs.length?Math.max(...avs):0;
  return clamp(Math.round(24+scenario.confidence*.55+Math.max(0,best)*3),1,99);
}
function analyzeMatch(match,form){
  const cands=flat(match);
  const scenario=buildScenario(match,cands,form);
  const used=new Set(),take=(role)=>{
    const c=choose(cands,scenario,form,match,role,used);
    if(c) used.add(`${c.market.id??c.market.typeId}:${c.outcome.n}:${c.odds}`);
    return c;
  };
  const main=take('main');
  const safe=take('safe');
  const surprise=take('surprise');
  const big=take('big');
  const special=chooseNecSpecial(cands,scenario,form,match)||main||safe||surprise||big||cands.find(c=>isCompatible(c,scenario,match))||cands[0]||null;

  const picks=[
    makePick('Ana Senaryo',main,scenario,form,match,'main','ANA YÖN'),
    makePick('Temkinli Seçim',safe,scenario,form,match,'safe','TEMKİNLİ'),
    makePick('Sürpriz Seçim',surprise,scenario,form,match,'surprise','SÜRPRİZ'),
    makePick('En Büyük Sürpriz',big,scenario,form,match,'big','🔥 EN BÜYÜK SÜRPRİZ'),
    makePick('NEÇ Özel',special,scenario,form,match,'special','⭐ NEÇ ÖZEL')
  ];
  const sp=picks[4];
  return {
    radar:radarScore(scenario,picks),
    form:form||null,
    scenario:{
      title:scenario.title,
      summary:scenario.summary,
      formText:scenario.formText,
      confidence:scenario.confidence,
      specialComment:specialComment(scenario,form,match,sp),
      specialOdds:sp.available?sp.odds:null,
      specialMarket:sp.available?sp.market:null,
      specialSelection:sp.available?sp.selection:null,
      av:sp.available?sp.av:0
    },
    picks,
    insights:[
      {title:'🧭 Tek Maç Hikâyesi',text:'Bütün seçimler önce tek bir ana maç senaryosuna bağlanır. Ana yönle çelişen bahisler otomatik elenir.'},
      {title:'📋 Form Özeti',text:scenario.formText},
      {title:'⭐ NEÇ Özel Yorum',text:specialComment(scenario,form,match,sp)}
    ],
    analyzedAt:new Date().toISOString(),
    disclaimer:'NEÇ AV her seçimde gösterilir. Bağımsız form verisi yoksa AV 0.0 çevresinde kalır ve yorum bunu açıkça belirtir. Oranlar bültenden değiştirilmeden kullanılır; tahminler kesin sonuç garantisi değildir.'
  };
}
module.exports={analyzeMatch};
