function norm(v){return String(v??'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim()}
function n(v){const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:null}
function ouLine(text){const m=norm(text).match(/(?:alt|üst)\s*([0-9]+(?:[.,][0-9]+)?)/i);return m?n(m[1]):null}
function directSelection(p){return norm(p?.selection).replace(/\s/g,'')}
function signal(p,match={}){
  const market=norm(p?.market),sel=norm(p?.selection),label=norm(p?.label),tag=norm(p?.tag),text=`${market} ${sel} ${label} ${tag}`;
  const line=ouLine(`${market} ${sel}`);
  let minGoals=null,maxGoals=null,goalMode='neutral',btts='neutral',side='neutral';
  if(/\balt\b/.test(text)&&line!==null){maxGoals=Math.ceil(line)-1;if(line<=3.5)goalMode='low'}
  if(/\büst\b/.test(text)&&line!==null){minGoals=Math.floor(line)+1;if(line>=2.5)goalMode='high'}
  if(/(^|\s)0\s*[-–]\s*1($|\s)/.test(text)){maxGoals=maxGoals===null?1:Math.min(maxGoals,1);goalMode='low'}
  if(/(^|\s)2\s*[-–]\s*3($|\s)/.test(text)){minGoals=minGoals===null?2:Math.max(minGoals,2);maxGoals=maxGoals===null?3:Math.min(maxGoals,3)}
  if(/(^|\s)4\s*[-–]\s*5($|\s)/.test(text)){minGoals=minGoals===null?4:Math.max(minGoals,4);goalMode='high'}
  if(/(^|\s)6\+/.test(text)){minGoals=minGoals===null?6:Math.max(minGoals,6);goalMode='high'}
  if(/karşılıklı gol.*\bvar\b|\bkg\s*var\b/.test(text)){btts='yes';minGoals=minGoals===null?2:Math.max(minGoals,2);goalMode=goalMode==='low'?'low':'high'}
  if(/karşılıklı gol.*\byok\b|\bkg\s*yok\b/.test(text)){btts='no';if(goalMode==='neutral')goalMode='low'}
  if(/her iki yarıda.*gol|iki yarıda da gol|iki yarıda gol/.test(text)){minGoals=minGoals===null?2:Math.max(minGoals,2);goalMode='high'}
  if(/gol atar|ilk gol|golcü|hat.?trick|hat trick/.test(text)){minGoals=minGoals===null?1:Math.max(minGoals,1)}
  const ds=directSelection(p);
  const isResult=/maç sonucu|handikaplı maç sonucu|çifte şans|sonuç \(|sonuç$/.test(market);
  const isHtft=/ilk yarı\s*\/\s*maç sonucu|iy\s*\/\s*ms|ilk yarı.*maç sonu/.test(market)||/^[12x]\/([12x])$/.test(ds);
  if(isHtft){const ft=ds.split('/').pop();if(ft==='1')side='home';if(ft==='2')side='away';if(ft==='x')side='draw'}
  else if(isResult){if(ds==='1'||ds==='1x')side='home';else if(ds==='2'||ds==='x2')side='away';else if(ds==='x')side='draw'}
  const home=norm(match?.home),away=norm(match?.away);
  if(home&&sel===home)side='home';if(away&&sel===away)side='away';
  if(/ev sahibi/.test(text)&&!/deplasman/.test(text))side='home';
  if(/deplasman/.test(text)&&!/ev sahibi/.test(text))side='away';
  if((side==='home'||side==='away')&&isResult){minGoals=minGoals===null?1:Math.max(minGoals,1)}
  const reversal=isHtft&&/^(1\/2|2\/1|x\/1|x\/2|1\/x|2\/x)$/.test(ds);
  return{goalMode,btts,side,minGoals,maxGoals,reversal,isHtft,text};
}
function oppositeSide(a,b){return(a==='home'&&b==='away')||(a==='away'&&b==='home')}
function compatible(a,b,match){const A=signal(a,match),B=signal(b,match);
  if(A.maxGoals!==null&&B.minGoals!==null&&B.minGoals>A.maxGoals)return false;
  if(B.maxGoals!==null&&A.minGoals!==null&&A.minGoals>B.maxGoals)return false;
  if(A.btts!=='neutral'&&B.btts!=='neutral'&&A.btts!==B.btts)return false;
  if(A.goalMode==='low'&&B.goalMode==='high')return false;
  if(A.goalMode==='high'&&B.goalMode==='low')return false;
  if(oppositeSide(A.side,B.side))return false;
  if((A.maxGoals===0&&['home','away'].includes(B.side))||(B.maxGoals===0&&['home','away'].includes(A.side)))return false;
  if((A.goalMode==='low'&&B.reversal)||(B.goalMode==='low'&&A.reversal))return false;
  return true;
}
function samePick(a,b){return norm(a?.market)===norm(b?.market)&&norm(a?.selection)===norm(b?.selection)}
function specialIdea(p){const t=norm(`${p?.market} ${p?.tag}`);return /oyuncu|şut|isabet|korner|kart|kurtarış|ofsayt|faul|pas/.test(t)}
function cohereAnalysis(result,match,maxPicks=5){if(!result||!Array.isArray(result.picks))return result;
  const available=result.picks.filter(p=>p&&p.available!==false&&Number(p.odds)>1);
  if(!available.length)return result;
  const anchor=available.find(p=>p.recommended)||available[0];
  const chosen=[];
  const add=p=>{if(!p||chosen.some(x=>samePick(x,p)))return false;if(chosen.every(x=>compatible(x,p,match))&&compatible(anchor,p,match)){chosen.push(p);return true}return false};
  add(anchor);for(const p of available){if(chosen.length>=maxPicks)break;add(p)}
  const ideas=Array.isArray(result.ideas)?result.ideas.filter(p=>p&&Number(p.odds)>1):[];
  for(const p of ideas){if(chosen.length>=maxPicks)break;if(!specialIdea(p))continue;if(add({...p,label:p.label||'Özel Market Fikri',available:true,recommended:false})){} }
  const cleanIdeas=ideas.filter(p=>!chosen.some(x=>samePick(x,p))&&chosen.every(x=>compatible(x,p,match))).slice(0,5);
  const dropped=Math.max(0,available.length-chosen.filter(x=>available.includes(x)).length);
  return{...result,picks:chosen.slice(0,maxPicks),ideas:cleanIdeas,coherence:{anchor:{market:anchor.market,selection:anchor.selection},dropped}};
}
function isReversalPick(p){return signal(p,{}).reversal}
module.exports={cohereAnalysis,compatible,signal,isReversalPick};
