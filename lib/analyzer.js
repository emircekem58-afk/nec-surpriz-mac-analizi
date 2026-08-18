function norm(s){return String(s||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function implied(odds){return odds>1?100/odds:0;}
function avg(n,d){return d>0?n/d:0;}
function isTechnical(s){return /^(market|bahis|seçenek|secenek|option|outcome|selection)\s*[#:_-]?\s*\d+\b/i.test(String(s||'').trim());}
const FOOTBALL_ANALYZABLE=new Set(['match_result','match_winner','double_chance','total_goals','btts','htft']);
const TENNIS_OK=new Set(['match_winner','set1_winner','set2_winner','set_score','total_games','home_games_total','away_games_total','game_handicap','set_handicap','winner_total_combo','set_match']);

function kindOf(c){
  const direct=c?.market?.kind;
  if(direct&&direct!=='other')return direct;
  const n=norm(c?.market?.name),l=norm(c?.outcome?.label);
  if(/^[12x]\s*[\/-]\s*[12x]$/i.test(l)&&(n.includes('ilk yar')||n.includes('devre')||n.includes('iy/ms')))return'htft';
  if((n.includes('ilk yar')||n.includes('devre'))&&(n.includes('maç sonucu')||n.includes('mac sonucu')))return'htft';
  if(n.includes('karşılıklı gol')||n.includes('karsilikli gol')||n==='kg')return'btts';
  if(n.includes('toplam gol')&&(n.includes('alt')||n.includes('üst')||n.includes('ust')))return'total_goals';
  return direct||'other';
}
function flat(match){
  const out=[];
  for(const market of match?.markets||[]){
    if(!market||market.known===false||isTechnical(market.name))continue;
    for(const outcome of market.outcomes||[]){
      const odds=Number(outcome?.odds);
      if(!(odds>1)||isTechnical(outcome?.label))continue;
      out.push({market,outcome,odds});
    }
  }
  return out;
}
function fairProbability(c){
  if(kindOf(c)==='double_chance')return implied(c.odds);
  const valid=(c?.market?.outcomes||[]).map(o=>Number(o.odds)).filter(o=>o>1);
  const sum=valid.reduce((s,o)=>s+1/o,0);
  return sum>0?((1/c.odds)/sum)*100:implied(c.odds);
}
function sideOf(c,match){
  const l=norm(c?.outcome?.label),h=norm(match?.home),a=norm(match?.away);
  if(l==='1'||(h&&(l===h||l.includes(h))))return'home';
  if(l==='x'||l==='beraberlik'||l==='draw'||l==='eşit')return'draw';
  if(l==='2'||(a&&(l===a||l.includes(a))))return'away';
  return null;
}
function totalDir(c){const l=norm(c?.outcome?.label);if(l.includes('üst')||l.includes('ust')||l.includes('over'))return'over';if(l.includes('alt')||l.includes('under'))return'under';return null;}
function bttsDir(c){const l=norm(c?.outcome?.label);if(l==='var'||l.includes('evet')||l.includes('yes'))return'yes';if(l==='yok'||l.includes('hayır')||l.includes('hayir')||l.includes('no'))return'no';return null;}
function extractLine(c){if(Number.isFinite(Number(c?.market?.spread)))return Number(c.market.spread);const m=String(c?.outcome?.label||'').replace(',','.').match(/(\d+(?:\.\d+)?)/);return m?Number(m[1]):null;}
function htftCombo(c){const m=String(c?.outcome?.label||'').toUpperCase().match(/([12X])\s*[\/-]\s*([12X])/);return m?`${m[1]}/${m[2]}`:null;}
function finalSideFromCombo(combo){const f=String(combo||'').split('/')[1];return f==='1'?'home':f==='2'?'away':f==='X'?'draw':null;}
function dcSides(label){const l=norm(label).replace(/\s/g,'');if(l==='1x')return new Set(['home','draw']);if(l==='x2')return new Set(['draw','away']);if(l==='12')return new Set(['home','away']);return null;}
function formOk(form){return !!(form?.home?.played>=4&&form?.away?.played>=4);}
function normalize3(o){const s=(o.home||0)+(o.draw||0)+(o.away||0);return s>0?{home:o.home/s*100,draw:o.draw/s*100,away:o.away/s*100}:{home:33.3,draw:33.4,away:33.3};}
function recentTR(s){return String(s||'').replaceAll('W','G').replaceAll('D','B').replaceAll('L','M');}

function marketResultProbabilities(cands,match){
  const raw={home:0,draw:0,away:0};
  for(const c of cands){
    if(!['match_result','match_winner'].includes(kindOf(c)))continue;
    const side=sideOf(c,match);if(side)raw[side]=Math.max(raw[side],fairProbability(c));
  }
  return normalize3(raw);
}
function roleEmpirical(form){
  if(!formOk(form))return null;
  const h=form.home,a=form.away,hr=h.roleStats?.home,ar=a.roleStats?.away;
  const overall={
    home:(avg(h.wins,h.played)+avg(a.losses,a.played))/2,
    draw:(avg(h.draws,h.played)+avg(a.draws,a.played))/2,
    away:(avg(a.wins,a.played)+avg(h.losses,h.played))/2
  };
  if(hr?.played>=2&&ar?.played>=2){
    const role={
      home:(avg(hr.wins,hr.played)+avg(ar.losses,ar.played))/2,
      draw:(avg(hr.draws,hr.played)+avg(ar.draws,ar.played))/2,
      away:(avg(ar.wins,ar.played)+avg(hr.losses,hr.played))/2
    };
    return normalize3({home:overall.home*.65+role.home*.35,draw:overall.draw*.65+role.draw*.35,away:overall.away*.65+role.away*.35});
  }
  return normalize3(overall);
}
function marketLean(cands,kind,dirFn,preferredLine=null){
  let rows=cands.filter(c=>kindOf(c)===kind&&dirFn(c));
  if(preferredLine!==null){
    const exact=rows.filter(c=>{const line=extractLine(c);return line!==null&&Math.abs(line-preferredLine)<.11;});
    if(exact.length)rows=exact;
  }
  if(!rows.length)return null;
  const best=rows.map(c=>({dir:dirFn(c),p:fairProbability(c)})).sort((a,b)=>b.p-a.p)[0];
  return best?.dir||null;
}
function teamFormText(form,match){
  if(!formOk(form))return 'Bağımsız takım formu bu maç için yeterli eşleşmedi. Ana yön yalnızca gerçek bülten fiyatlamasıyla sınırlandırıldı.';
  const h=form.home,a=form.away,hr=h.roleStats?.home,ar=a.roleStats?.away;
  let t=`${match.home} son ${h.played} maçta ${h.wins}G ${h.draws}B ${h.losses}M; ${h.goalsFor}-${h.goalsAgainst} gol, maç başı ${h.avgGF.toFixed(2)} atıp ${h.avgGA.toFixed(2)} yedi. Son 5 formu ${recentTR(h.recent)}${h.recentScores?.length?` (${h.recentScores.join(', ')})`:''}. ${h.cleanSheets} maç gol yemedi, ${h.failedToScore} maç gol atamadı. `;
  t+=`${match.away} son ${a.played} maçta ${a.wins}G ${a.draws}B ${a.losses}M; ${a.goalsFor}-${a.goalsAgainst} gol, maç başı ${a.avgGF.toFixed(2)} atıp ${a.avgGA.toFixed(2)} yedi. Son 5 formu ${recentTR(a.recent)}${a.recentScores?.length?` (${a.recentScores.join(', ')})`:''}. ${a.cleanSheets} maç gol yemedi, ${a.failedToScore} maç gol atamadı.`;
  if(hr?.played>=2&&ar?.played>=2)t+=` Rol bazında ${match.home} evinde ${hr.played} maçta ${hr.wins}G ${hr.draws}B ${hr.losses}M (${hr.avgGF.toFixed(2)} gol/maç); ${match.away} deplasmanda ${ar.played} maçta ${ar.wins}G ${ar.draws}B ${ar.losses}M (${ar.avgGF.toFixed(2)} gol/maç).`;
  return t;
}
function buildScenario(match,cands,form){
  if(Number(match.sportType)===5){
    const winners=cands.filter(c=>kindOf(c)==='match_winner').sort((a,b)=>fairProbability(b)-fairProbability(a));
    const leader=winners[0]||cands[0]||null,primary=sideOf(leader,match)||'home';
    return {primary,goalLean:null,bttsLean:null,confidence:24,probabilities:null,title:primary==='home'?`${match.home} ana yön`:`${match.away} ana yön`,summary:'Teniste bağımsız oyuncu formu henüz yeterli değil. Bu yüzden tek yön korunuyor fakat yüksek güven üretilmiyor.',formText:'Tenis form kaynağı sınırlı; yalnızca gerçek maç kazananı fiyatı yön olarak kullanılıyor.'};
  }
  const market=marketResultProbabilities(cands,match),emp=roleEmpirical(form);
  const probabilities=emp?normalize3({home:market.home*.48+emp.home*.52,draw:market.draw*.48+emp.draw*.52,away:market.away*.48+emp.away*.52}):market;
  const primary=Object.entries(probabilities).sort((a,b)=>b[1]-a[1])[0][0];
  let goalLean=null,bttsLean=null;
  if(formOk(form)){
    const over=(avg(form.home.over25,form.home.played)+avg(form.away.over25,form.away.played))/2;
    const kg=(avg(form.home.btts,form.home.played)+avg(form.away.btts,form.away.played))/2;
    if(over>=.55)goalLean='over';else if(over<=.45)goalLean='under';
    if(kg>=.55)bttsLean='yes';else if(kg<=.45)bttsLean='no';
  }
  if(!goalLean)goalLean=marketLean(cands,'total_goals',totalDir,2.5);
  if(!bttsLean)bttsLean=marketLean(cands,'btts',bttsDir,null);
  const sorted=Object.values(probabilities).sort((a,b)=>b-a),lead=sorted[0]-sorted[1];
  const confidence=clamp(Math.round((formOk(form)?48:24)+lead*.75),20,84);
  const sideName=primary==='home'?match.home:primary==='away'?match.away:'beraberlik';
  const title=primary==='draw'?'Beraberlik / dengeli maç ekseni':`${sideName} ana yön`;
  let summary=primary==='home'?`NEÇ ana yönü ${match.home} tarafında kuruyor.`:primary==='away'?`NEÇ ana yönü ${match.away} tarafında kuruyor.`:'NEÇ iki taraf arasında keskin üstünlük görmediği için beraberlik eksenini ana yön yapıyor.';
  summary+=' Sonuç bahisleri, çifte şans ve İY/MS seçimleri bu yönün tersine çıkamaz.';
  if(goalLean)summary+=` Gol marketlerinde tek yön kilidi: ${goalLean==='over'?'Üst':'Alt'}.`;
  if(bttsLean)summary+=` KG marketlerinde tek yön kilidi: ${bttsLean==='yes'?'KG Var':'KG Yok'}.`;
  return {primary,goalLean,bttsLean,confidence,probabilities,title,summary,formText:teamFormText(form,match)};
}
function compatible(c,s,match){
  const k=kindOf(c);
  if(Number(match.sportType)===5){if(k==='match_winner')return sideOf(c,match)===s.primary;return TENNIS_OK.has(k);}
  if(!FOOTBALL_ANALYZABLE.has(k))return false;
  if(['match_result','match_winner'].includes(k))return sideOf(c,match)===s.primary;
  if(k==='double_chance'){
    const sides=dcSides(c.outcome.label);if(!sides)return false;
    if(s.primary==='home')return sides.has('home')&&!sides.has('away');
    if(s.primary==='away')return sides.has('away')&&!sides.has('home');
    return sides.has('draw');
  }
  if(k==='htft')return finalSideFromCombo(htftCombo(c))===s.primary;
  if(k==='total_goals')return !!s.goalLean&&totalDir(c)===s.goalLean;
  if(k==='btts')return !!s.bttsLean&&bttsDir(c)===s.bttsLean;
  return false;
}
function modelFor(c,s,form,match){
  const fair=fairProbability(c),k=kindOf(c);let model=fair,source='market';
  if(Number(match.sportType)===1){
    if(['match_result','match_winner'].includes(k)&&s.probabilities){const side=sideOf(c,match);if(side){model=s.probabilities[side];source='form+market';}}
    else if(k==='double_chance'&&s.probabilities){const sides=dcSides(c.outcome.label);if(sides){model=[...sides].reduce((x,y)=>x+(s.probabilities[y]||0),0);source='form+market';}}
    else if(k==='total_goals'&&formOk(form)){
      const line=extractLine(c),dir=totalDir(c);if(line!==null&&Math.abs(line-2.5)<.11&&dir){const over=(avg(form.home.over25,form.home.played)+avg(form.away.over25,form.away.played))/2*100;model=dir==='over'?over:100-over;source='form';}
    }else if(k==='btts'&&formOk(form)){
      const dir=bttsDir(c);if(dir){const yes=(avg(form.home.btts,form.home.played)+avg(form.away.btts,form.away.played))/2*100;model=dir==='yes'?yes:100-yes;source='form';}
    }else if(k==='htft'&&formOk(form)){
      const combo=htftCombo(c),hr=form.home?.htftByRole?.home,ar=form.away?.htftByRole?.away;
      const n=Number(hr?.played||0)+Number(ar?.played||0),hits=Number(hr?.counts?.[combo]||0)+Number(ar?.counts?.[combo]||0);
      if(combo&&n>=4){model=fair*.72+(hits/n*100)*.28;source='htft-history';}
    }
  }
  model=clamp(model,.5,99.5);const av=model-fair;
  const confidence=source==='market'?18:source==='htft-history'?Math.min(58,30+(Number(form?.home?.played||0)+Number(form?.away?.played||0))*1.4):source==='form'?Math.min(76,s.confidence+4):s.confidence;
  return {fair,model,av,confidence:clamp(Math.round(confidence),12,84),source};
}
function resultEvidence(form,match){
  if(!formOk(form))return 'Bağımsız form teyidi yok; bu seçim yalnızca ana piyasa yönünü takip ediyor.';
  const h=form.home,a=form.away,hr=h.roleStats?.home,ar=a.roleStats?.away;
  let text=`${match.home} ${h.wins}/${h.played} galibiyet ve ${h.avgGF.toFixed(2)} gol/maç; ${match.away} ${a.wins}/${a.played} galibiyet ve ${a.avgGF.toFixed(2)} gol/maç.`;
  if(hr?.played>=2&&ar?.played>=2)text+=` Ev/deplasman rolü: ${match.home} ${hr.wins}G/${hr.played}, ${match.away} ${ar.wins}G/${ar.played}.`;
  return text;
}
function reasonFor(c,s,form,match,role){
  const k=kindOf(c),m=modelFor(c,s,form,match),parts=[];
  if(role==='main')parts.push(`Ana sonuç yönü: ${s.title}.`);
  else if(role==='safe')parts.push('Ana senaryonun daha temkinli ve zıt yön içermeyen versiyonu.');
  else if(role==='surprise')parts.push('Ana hikâyeyi bozmadan oranı yükselten sürpriz varyasyon.');
  else if(role==='big')parts.push('Aynı ana hikâyenin en agresif, fakat sonuç/gol/KG kilitleriyle hâlâ uyumlu varyasyonu.');
  else parts.push('NEÇ Özel, yalnızca ana senaryoyla uyumlu ve veriyle açıklanabilen marketler arasından seçildi.');

  if(['match_result','match_winner','double_chance'].includes(k))parts.push(resultEvidence(form,match));
  if(k==='total_goals'){
    if(formOk(form))parts.push(`Son ${form.home.played+form.away.played} takım-maç örneğinin ${form.home.over25+form.away.over25} tanesinde 2.5 Üst oluştu. Bu nedenle gol yönü ${s.goalLean==='over'?'Üst':'Alt'} olarak kilitlendi.`);
    else parts.push(`Gol yönü bültendeki 2.5 çizgisinin fiyatlamasından ${s.goalLean==='over'?'Üst':'Alt'} olarak kilitlendi; bağımsız form teyidi yok.`);
  }
  if(k==='btts'){
    if(formOk(form))parts.push(`İki takımın son maçları toplamında KG Var ${form.home.btts+form.away.btts}/${form.home.played+form.away.played} kez görüldü; KG yönü ${s.bttsLean==='yes'?'Var':'Yok'} olarak sabitlendi.`);
    else parts.push(`KG yönü gerçek bülten fiyatlamasından ${s.bttsLean==='yes'?'Var':'Yok'} olarak sabitlendi; bağımsız form teyidi yok.`);
  }
  if(k==='htft'){
    const combo=htftCombo(c),hr=form?.home?.htftByRole?.home,ar=form?.away?.htftByRole?.away;
    const sample=Number(hr?.played||0)+Number(ar?.played||0),hits=Number(hr?.counts?.[combo]||0)+Number(ar?.counts?.[combo]||0);
    if(sample>=4)parts.push(hits?`Rol uyumlu ${sample} geçmiş örnekte ${combo} ${hits} kez görüldü.`:`Rol uyumlu ${sample} geçmiş örnekte ${combo} hiç görülmedi; bu yüzden yalnızca yüksek riskli sürpriz olarak kalır, “artık olur” mantığı kullanılmaz.`);
    else parts.push('İY/MS için yeterli devre skoru örneği yok; bu market yüksek riskli kabul edildi.');
  }
  if(m.source==='market')parts.push('Bu market için bağımsız model oluşmadığı için NEÇ AV 0.0 civarında tutulur; yapay değer üretilmez.');
  else if(m.av>0.5)parts.push(`NEÇ AV +${m.av.toFixed(1)} puan; form verisi mevcut fiyatın biraz üzerinde destek veriyor.`);
  else if(m.av<-0.5)parts.push(`NEÇ AV ${m.av.toFixed(1)} puan; senaryoyla uyumlu olsa da fiyat değer açısından güçlü değil.`);
  else parts.push(`NEÇ AV ${m.av.toFixed(1)} puan; model ile fiyat birbirine yakın.`);
  return parts.join(' ');
}
function idOf(c){return `${c?.market?.id??c?.market?.typeId}:${c?.outcome?.n}:${c?.odds}`;}
function score(c,s,form,match,role){
  if(!compatible(c,s,match))return-9999;
  const m=modelFor(c,s,form,match),k=kindOf(c);let z=m.av*5+m.confidence*.18;
  if(role==='main')z+=['match_result','match_winner'].includes(k)?90:-50;
  if(role==='safe'){if(k==='double_chance')z+=70;if(c.odds<=2.4)z+=15;}
  if(role==='surprise'){if(c.odds>=2.1&&c.odds<=7.5)z+=42-Math.abs(c.odds-3.4)*3;else z-=50;if(['htft','total_goals','btts'].includes(k))z+=10;}
  if(role==='big'){if(c.odds>=4&&c.odds<=40)z+=45+Math.min(18,Math.log2(c.odds)*3);else z-=60;if(k==='htft')z+=20;}
  if(role==='special'){if(m.source!=='market')z+=35;if(m.av>0)z+=25;if(['total_goals','btts','htft'].includes(k))z+=8;if(c.odds>=1.35&&c.odds<=8)z+=8;}
  return z;
}
function choose(cands,s,form,match,role,used){
  let rows=cands.filter(c=>!used.has(idOf(c))&&compatible(c,s,match));
  if(role==='main')rows=rows.filter(c=>['match_result','match_winner'].includes(kindOf(c)));
  if(role==='safe'){
    const dc=rows.filter(c=>kindOf(c)==='double_chance');
    if(dc.length)rows=dc;else rows=rows.filter(c=>c.odds<=2.8);
  }
  if(role==='surprise')rows=rows.filter(c=>c.odds>=2.1&&c.odds<=7.5);
  if(role==='big')rows=rows.filter(c=>c.odds>=4&&c.odds<=40);
  if(!rows.length)return null;
  return rows.map(c=>({c,z:score(c,s,form,match,role)})).sort((a,b)=>b.z-a.z)[0].c;
}
function chooseSpecial(cands,s,form,match,used){
  const rows=cands.filter(c=>compatible(c,s,match));if(!rows.length)return null;
  const unique=rows.filter(c=>!used.has(idOf(c))),pool=unique.length?unique:rows;
  const modeled=pool.filter(c=>modelFor(c,s,form,match).source!=='market');
  const finalPool=modeled.length?modeled:pool;
  return finalPool.map(c=>({c,z:score(c,s,form,match,'special')})).sort((a,b)=>b.z-a.z)[0].c;
}
function makePick(label,c,s,form,match,role,tag){
  if(!c)return{label,available:false,tag,av:0,avText:'0.0',confidencePct:0,reason:'Ana maç hikâyesiyle çelişmeden bu kategoriye uygun gerçek bir market bulunamadı.'};
  const m=modelFor(c,s,form,match);
  return {label,available:true,tag,market:c.market.name,selection:c.outcome.label,odds:c.odds,av:+m.av.toFixed(1),avText:`${m.av>=0?'+':''}${m.av.toFixed(1)}`,confidencePct:m.confidence,model:+m.model.toFixed(1),fair:+m.fair.toFixed(1),recommended:m.source!=='market'&&m.av>0.5&&m.confidence>=30,reason:reasonFor(c,s,form,match,role)};
}
function specialComment(s,form,match,p){
  if(!p?.available)return`${s.summary} ${s.formText} NEÇ Özel için uygun ve çelişkisiz bir market bulunamadı.`;
  return `${s.summary} ${s.formText} NEÇ Özel seçim: ${p.market} — ${p.selection}, oran ${Number(p.odds).toFixed(2)}. ${p.reason}`;
}
function radar(s,picks){const avs=picks.filter(p=>p.available).map(p=>p.av),best=avs.length?Math.max(...avs):0;return clamp(Math.round(22+s.confidence*.58+Math.max(0,best)*3),1,99);}
function analyzeMatch(match,form){
  const cands=flat(match),s=buildScenario(match,cands,form),used=new Set();
  const take=role=>{const c=choose(cands,s,form,match,role,used);if(c)used.add(idOf(c));return c;};
  const main=take('main'),safe=take('safe'),surprise=take('surprise'),big=take('big');
  const special=chooseSpecial(cands,s,form,match,used)||main||safe||surprise||big||cands.find(c=>compatible(c,s,match))||null;
  const picks=[
    makePick('Ana Senaryo',main,s,form,match,'main','ANA YÖN'),
    makePick('Temkinli Seçim',safe,s,form,match,'safe','TEMKİNLİ'),
    makePick('Sürpriz Seçim',surprise,s,form,match,'surprise','SÜRPRİZ'),
    makePick('En Büyük Sürpriz',big,s,form,match,'big','🔥 EN BÜYÜK SÜRPRİZ'),
    makePick('NEÇ Özel',special,s,form,match,'special','⭐ NEÇ ÖZEL')
  ];
  const sp=picks[4];
  return {
    radar:radar(s,picks),form:form||null,
    scenario:{title:s.title,summary:s.summary,formText:s.formText,confidence:s.confidence,locks:{result:s.primary,goals:s.goalLean,btts:s.bttsLean},specialComment:specialComment(s,form,match,sp),specialOdds:sp.available?sp.odds:null,specialMarket:sp.available?sp.market:null,specialSelection:sp.available?sp.selection:null,av:sp.available?sp.av:0},
    picks,
    insights:[
      {title:'🧭 Çelişki Kilidi',text:`Sonuç yönü ${s.primary==='home'?match.home:s.primary==='away'?match.away:'Beraberlik'}; gol yönü ${s.goalLean==='over'?'Üst':s.goalLean==='under'?'Alt':'kilit yok'}; KG yönü ${s.bttsLean==='yes'?'Var':s.bttsLean==='no'?'Yok':'kilit yok'}. Ters seçimler analizden çıkarılır.`},
      {title:'📋 Takım Formu',text:s.formText},
      {title:'⭐ NEÇ Özel Yorum',text:specialComment(s,form,match,sp)}
    ],
    analyzedAt:new Date().toISOString(),
    disclaimer:'Tüm seçimler tek maç hikâyesine bağlıdır. Sonuç, gol ve KG yönlerinde ters bahis aynı analizde yer alamaz. NEÇ AV her kartta gösterilir; bağımsız veri yoksa 0.0 civarında tutulur ve veri uydurulmaz. Oranlar bültenden değiştirilmeden kullanılır.'
  };
}
module.exports={analyzeMatch};
