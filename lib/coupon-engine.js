const {fetchBulletin}=require('./nesine');
const {fetchFlashscoreForm,fetchFlashscoreTennisForm}=require('./flashscore');
const {analyzeFootball}=require('./analyzer-football');
const {analyzeTennis}=require('./analyzer-tennis-v2');
const {cohereAnalysis}=require('./coherence');
const CORE_FOOTBALL=new Set([1,3,5,11,12,13,14,38,43,49,100,101]);
const CORE_TENNIS=new Set([182,183,187,189]);
function dateTR(ts=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts))}
function verify(match){const markets=[];for(const m of match.markets||[]){const outcomes=[];for(const o of m.outcomes||[]){o.labelVerified=Boolean(o.sourceLabel)||(Number(match.sportType)===1&&CORE_FOOTBALL.has(Number(m.typeId)))||(Number(match.sportType)===5&&CORE_TENNIS.has(Number(m.typeId)));if(o.labelVerified&&Number(o.odds)>1)outcomes.push(o)}if(outcomes.length){m.outcomes=outcomes;markets.push(m)}}return{...match,markets,marketCount:markets.length,outcomeCount:markets.reduce((n,m)=>n+m.outcomes.length,0)}}
function withTimeout(p,ms){return Promise.race([p,new Promise(r=>setTimeout(()=>r(null),ms))])}
function rawAnalyze(match,form){return Number(match.sportType)===1?analyzeFootball(match,form):analyzeTennis(match,form)}
function analyze(match,form){const a=rawAnalyze(match,form);return Number(match.sportType)===1?cohereAnalysis(a,match,5):a}
function marketFor(match,p){return(match.markets||[]).find(m=>m.name===p.market&&(m.outcomes||[]).some(o=>o.label===p.selection&&Math.abs(Number(o.odds)-Number(p.odds))<.02))}
const GRADEABLE=new Set(['match_result','double_chance','total_goals','btts','goal_range','htft','match_winner','first_set_winner','total_games','set_score']);
function legFrom(match,p){if(!p?.available||!(Number(p.odds)>1))return null;const m=marketFor(match,p);if(!m||!GRADEABLE.has(m.kind))return null;return{id:`${match.id}:${m.id??m.typeId}:${p.selection}`,matchId:match.id,sportType:Number(match.sportType),sport:match.sport,home:match.home,away:match.away,league:match.league,startTimestamp:match.startTimestamp,marketKind:m.kind,market:p.market,selection:p.selection,odds:+Number(p.odds).toFixed(2),confidence:Number(p.confidencePct||0),av:Number(p.av||0),reason:String(p.reason||''),quality:Number(p.confidencePct||0)+Math.max(-8,Math.min(12,Number(p.av||0)))*1.5}}
function preliminary(match){try{return analyze(match,null)}catch{return null}}
async function enrichOne(match){let form=null;try{form=Number(match.sportType)===1?await withTimeout(fetchFlashscoreForm(match),4800):await withTimeout(fetchFlashscoreTennisForm(match),4200)}catch{};let a=null;try{a=analyze(match,form)}catch{}return{match,analysis:a,form:!!form}}
function dedupeLegs(legs){const map=new Map();for(const x of legs){if(!x)continue;const key=`${x.matchId}:${x.market}:${x.selection}`;const old=map.get(key);if(!old||x.quality>old.quality)map.set(key,x)}return[...map.values()]}
function beamBuild(pool,{min=1,max=99999,ideal=1,minLegs=1,maxLegs=5,beam=240}){let states=[{legs:[],product:1,quality:0,used:new Set()}],best=null;const sorted=[...pool].sort((a,b)=>b.quality-a.quality);for(let depth=0;depth<maxLegs;depth++){const next=[];for(const st of states){for(const leg of sorted){if(st.used.has(leg.matchId))continue;const product=st.product*leg.odds;if(product>max*1.7)continue;const used=new Set(st.used);used.add(leg.matchId);const ns={legs:[...st.legs,leg],product,quality:st.quality+leg.quality,used};if(ns.legs.length>=minLegs){const reached=product>=min&&product<=max,dist=Math.abs(Math.log(Math.max(product,.01)/ideal)),score=(reached?1000:0)+ns.quality*.12-dist*35-ns.legs.length*.8;if(!best||score>best.score)best={...ns,score,reached}}next.push(ns)}}next.sort((a,b)=>{const da=Math.abs(Math.log(Math.max(a.product,.01)/ideal)),db=Math.abs(Math.log(Math.max(b.product,.01)/ideal));return(b.quality*.1-db*25)-(a.quality*.1-da*25)});states=next.slice(0,beam);if(!states.length)break}return best}
function chooseMainOdds(match){const m=(match.markets||[]).find(x=>x.kind==='match_result');if(!m)return null;const vals=(m.outcomes||[]).map(o=>Number(o.odds)).filter(x=>x>1);if(vals.length<2)return null;return{min:Math.min(...vals),max:Math.max(...vals)}}
function reversalCandidates(match,analysis){if(Number(match.sportType)!==1)return[];const m=(match.markets||[]).find(x=>x.kind==='htft'||Number(x.typeId)===5);if(!m)return[];const main=chooseMainOdds(match),balance=main?main.max/main.min:3,radar=Number(analysis?.radar||0);const out=[];for(const o of m.outcomes||[]){const s=String(o.label||'').toUpperCase().replace(/\s/g,''),odds=Number(o.odds);if(!/^(1\/2|2\/1|X\/1|X\/2|1\/X|2\/X)$/.test(s)||!(odds>=3.5&&odds<=35))continue;let confidence=18+radar*.12+(balance<=1.8?7:balance<=2.3?3:0)+Math.min(8,25/odds);if(/^X\//.test(s))confidence+=3;if(/^(1\/2|2\/1)$/.test(s))confidence-=2;confidence=Math.max(18,Math.min(44,confidence));if(confidence<24)continue;out.push({id:`${match.id}:${m.id??m.typeId}:${o.label}`,matchId:match.id,sportType:1,sport:match.sport,home:match.home,away:match.away,league:match.league,startTimestamp:match.startTimestamp,marketKind:'htft',market:m.name,selection:o.label,odds:+odds.toFixed(2),confidence:+confidence.toFixed(0),av:0,reason:'İlk yarı/maç sonu yön değişimi yalnızca özel ters-sonuç sistemi için değerlendirildi.',quality:confidence+(balance<=1.8?8:0)+(radar*.08)})}return out}
function nCk(n,k){if(k<0||k>n)return 0;let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return Math.round(r)}
function comboCount(n,system){return String(system||'').split('-').map(Number).filter(k=>k>=1&&k<=n).reduce((s,k)=>s+nCk(n,k),0)}
function coupon(name,icon,built,system=null,target='',emptyNote='Bugün bu hedefe uygun yeterli bağımsız seçim oluşmadı.'){if(!built)return{name,icon,totalOdds:null,legs:[],targetReached:false,system,target,note:emptyNote,combinationCount:0};const c={name,icon,totalOdds:+built.product.toFixed(2),legs:built.legs,targetReached:!!built.reached,system,target,note:built.reached?'Hedef oran aralığı yakalandı.':'Hedefe en yakın veri destekli kombinasyon gösteriliyor; sırf hedef dolsun diye seçim eklenmedi.'};if(system)c.combinationCount=comboCount(c.legs.length,system);return c}
async function generateDailyCoupons(date=dateTR()){
 const raw=(await fetchBulletin()).filter(m=>dateTR(m.startTimestamp)===date||m.date===date).map(verify).filter(m=>m.startTimestamp>Date.now()-20*60*1000);
 const prelim=raw.map(match=>({match,a:preliminary(match)})).filter(x=>x.a?.picks?.some(p=>p.available));
 prelim.sort((a,b)=>(b.a.radar||0)-(a.a.radar||0));
 const shortlist=[...prelim.filter(x=>x.match.sportType===1).slice(0,12),...prelim.filter(x=>x.match.sportType===5).slice(0,7)];
 const enriched=await Promise.all(shortlist.map(x=>enrichOne(x.match)));
 const enrichedMap=new Map(enriched.map(x=>[x.match.id,x]));
 const analyses=prelim.map(x=>enrichedMap.get(x.match.id)||{match:x.match,analysis:x.a,form:false});
 let legs=[];for(const x of analyses)for(const p of x.analysis?.picks||[]){const l=legFrom(x.match,p);if(l)legs.push(l)}legs=dedupeLegs(legs);
 let reversals=[];for(const x of analyses)reversals.push(...reversalCandidates(x.match,x.analysis));reversals=dedupeLegs(reversals).sort((a,b)=>b.quality-a.quality).slice(0,36);
 const cautiousPool=legs.filter(x=>x.odds>=1.15&&x.odds<=1.85&&x.confidence>=50).sort((a,b)=>b.quality-a.quality).slice(0,30);
 const mainPool=legs.filter(x=>x.odds>=1.25&&x.odds<=3.6&&x.confidence>=44).sort((a,b)=>b.quality-a.quality).slice(0,38);
 const specialPool=legs.filter(x=>x.odds>=1.55&&x.odds<=7.5&&x.confidence>=35).sort((a,b)=>b.quality-a.quality).slice(0,46);
 const systemPool=legs.filter(x=>x.odds>=1.45&&x.odds<=6.5&&x.confidence>=34).sort((a,b)=>b.quality-a.quality).slice(0,52);
 const cautious=beamBuild(cautiousPool,{min:1.75,max:2.4,ideal:2.05,minLegs:1,maxLegs:3});
 const main=beamBuild(mainPool,{min:4.25,max:6.25,ideal:5,minLegs:2,maxLegs:4});
 const special=beamBuild(specialPool,{min:10,max:20,ideal:14,minLegs:2,maxLegs:5});
 const system=beamBuild(systemPool,{min:35,max:220,ideal:90,minLegs:5,maxLegs:8,beam:320});
 const reverseSystem=beamBuild(reversals,{min:250,max:12000,ideal:1800,minLegs:4,maxLegs:7,beam:320});
 const coupons=[
  coupon('Temkinli Kupon','🛡️',cautious,null,'Toplam oran ≈ 2'),
  coupon('Ana Kupon','🎯',main,null,'Toplam oran ≈ 5'),
  coupon('NEÇ Special','⭐',special,null,'Toplam oran 10–20'),
  coupon('Sistem Kuponu','🧩',system,'2-3-4','Dengeli yüksek oran sistemi'),
  coupon('Ters Sonuç Sistemi','🔄',reverseSystem,'2-3','Yalnızca İY/MS ters sonuçlar','Bugün veriyle savunabildiğim yeterli İY/MS ters sonuç seçimi oluşmadı; rastgele doldurulmadı.')
 ];
 return{date,generatedAt:new Date().toISOString(),matchCount:raw.length,analyzedCount:analyses.length,candidateCount:legs.length,reversalCandidateCount:reversals.length,coupons,method:'Nesine gerçek oranları + form verisi; aynı maç bir kuponda yalnızca bir kez kullanılır ve maç içi öneriler tek senaryoya göre tutarlılaştırılır.'}
}
module.exports={generateDailyCoupons,dateTR,verify};
