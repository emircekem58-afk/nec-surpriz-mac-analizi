const {fetchBulletin}=require('./nesine');
const {fetchFlashscoreForm,fetchFlashscoreTennisForm}=require('./flashscore');
const {analyzeFootball}=require('./analyzer-football');
const {analyzeTennis}=require('./analyzer-tennis');
const CORE_FOOTBALL=new Set([1,3,5,11,12,13,14,38,43,49,100,101]);
const CORE_TENNIS=new Set([182]);
function dateTR(ts=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts))}
function verify(match){const markets=[];for(const m of match.markets||[]){const outcomes=[];for(const o of m.outcomes||[]){o.labelVerified=Boolean(o.sourceLabel)||(Number(match.sportType)===1&&CORE_FOOTBALL.has(Number(m.typeId)))||(Number(match.sportType)===5&&CORE_TENNIS.has(Number(m.typeId)));if(o.labelVerified&&Number(o.odds)>1)outcomes.push(o)}if(outcomes.length){m.outcomes=outcomes;markets.push(m)}}return{...match,markets,marketCount:markets.length,outcomeCount:markets.reduce((n,m)=>n+m.outcomes.length,0)}}
function withTimeout(p,ms){return Promise.race([p,new Promise(r=>setTimeout(()=>r(null),ms))])}
function analyze(match,form){return Number(match.sportType)===1?analyzeFootball(match,form):analyzeTennis(match,form)}
function marketFor(match,p){return(match.markets||[]).find(m=>m.name===p.market&&(m.outcomes||[]).some(o=>o.label===p.selection&&Math.abs(Number(o.odds)-Number(p.odds))<.02))}
const GRADEABLE=new Set(['match_result','double_chance','total_goals','btts','goal_range','match_winner']);
function legFrom(match,p){if(!p?.available||!(Number(p.odds)>1))return null;const m=marketFor(match,p);if(!m||!GRADEABLE.has(m.kind))return null;return{id:`${match.id}:${m.id??m.typeId}:${p.selection}`,matchId:match.id,sportType:Number(match.sportType),sport:match.sport,home:match.home,away:match.away,league:match.league,startTimestamp:match.startTimestamp,marketKind:m.kind,market:p.market,selection:p.selection,odds:+Number(p.odds).toFixed(2),confidence:Number(p.confidencePct||0),av:Number(p.av||0),reason:String(p.reason||''),quality:Number(p.confidencePct||0)+Math.max(-8,Math.min(12,Number(p.av||0)))*1.5}}
function preliminary(match){try{return analyze(match,null)}catch{return null}}
async function enrichOne(match){let form=null;try{form=Number(match.sportType)===1?await withTimeout(fetchFlashscoreForm(match),4800):await withTimeout(fetchFlashscoreTennisForm(match),4200)}catch{};let a=null;try{a=analyze(match,form)}catch{}return{match,analysis:a,form:!!form}}
function dedupeLegs(legs){const map=new Map();for(const x of legs){if(!x)continue;const key=`${x.matchId}:${x.market}:${x.selection}`;const old=map.get(key);if(!old||x.quality>old.quality)map.set(key,x)}return[...map.values()]}
function beamBuild(pool,{min=1,max=99999,ideal=1,minLegs=1,maxLegs=5,beam=240}){let states=[{legs:[],product:1,quality:0,used:new Set()}],best=null;const sorted=[...pool].sort((a,b)=>b.quality-a.quality);for(let depth=0;depth<maxLegs;depth++){const next=[];for(const st of states){for(const leg of sorted){if(st.used.has(leg.matchId))continue;const product=st.product*leg.odds;if(product>max*1.7)continue;const used=new Set(st.used);used.add(leg.matchId);const ns={legs:[...st.legs,leg],product,quality:st.quality+leg.quality,used};if(ns.legs.length>=minLegs){const reached=product>=min&&product<=max,dist=Math.abs(Math.log(Math.max(product,.01)/ideal)),score=(reached?1000:0)+ns.quality*.12-dist*35-ns.legs.length*.8;if(!best||score>best.score)best={...ns,score,reached}}next.push(ns)}}next.sort((a,b)=>{const da=Math.abs(Math.log(Math.max(a.product,.01)/ideal)),db=Math.abs(Math.log(Math.max(b.product,.01)/ideal));return(b.quality*.1-db*25)-(a.quality*.1-da*25)});states=next.slice(0,beam);if(!states.length)break}return best}
function coupon(name,icon,built,system=null,target=''){if(!built)return{name,icon,totalOdds:null,legs:[],targetReached:false,system,target,note:'Bugün bu hedefe uygun yeterli bağımsız seçim oluşmadı.'};return{name,icon,totalOdds:+built.product.toFixed(2),legs:built.legs,targetReached:!!built.reached,system,target,note:built.reached?'Hedef oran aralığı yakalandı.':'Hedefe en yakın veri destekli kombinasyon gösteriliyor; sırf hedef dolsun diye seçim eklenmedi.'}}
async function generateDailyCoupons(date=dateTR()){
 const raw=(await fetchBulletin()).filter(m=>dateTR(m.startTimestamp)===date||m.date===date).map(verify).filter(m=>m.startTimestamp>Date.now()-20*60*1000);
 const prelim=raw.map(match=>({match,a:preliminary(match)})).filter(x=>x.a?.picks?.some(p=>p.available));
 prelim.sort((a,b)=>(b.a.radar||0)-(a.a.radar||0));
 const shortlist=[...prelim.filter(x=>x.match.sportType===1).slice(0,10),...prelim.filter(x=>x.match.sportType===5).slice(0,6)];
 const enriched=await Promise.all(shortlist.map(x=>enrichOne(x.match)));
 const enrichedMap=new Map(enriched.map(x=>[x.match.id,x]));
 const analyses=prelim.map(x=>enrichedMap.get(x.match.id)||{match:x.match,analysis:x.a,form:false});
 let legs=[];for(const x of analyses)for(const p of x.analysis?.picks||[]){const l=legFrom(x.match,p);if(l)legs.push(l)}legs=dedupeLegs(legs);
 const bankPool=legs.filter(x=>x.odds>=1.12&&x.odds<=1.85&&x.confidence>=48).sort((a,b)=>b.quality-a.quality).slice(0,28);
 const surprisePool=legs.filter(x=>x.odds>=1.45&&x.odds<=4.8&&x.confidence>=40).sort((a,b)=>b.quality-a.quality).slice(0,36);
 const extremePool=legs.filter(x=>x.odds>=1.75&&x.odds<=7&&x.confidence>=33).sort((a,b)=>b.quality-a.quality).slice(0,42);
 const systemPool=legs.filter(x=>x.odds>=1.8&&x.odds<=9&&x.confidence>=30).sort((a,b)=>b.quality-a.quality).slice(0,50);
 const bank=beamBuild(bankPool,{min:2,max:5,ideal:3.8,minLegs:2,maxLegs:5});
 const surprise=beamBuild(surprisePool,{min:10,max:35,ideal:16,minLegs:3,maxLegs:5});
 const extreme=beamBuild(extremePool,{min:50,max:100,ideal:75,minLegs:4,maxLegs:7});
 const system=beamBuild(systemPool,{min:1000,max:2000,ideal:1450,minLegs:6,maxLegs:9,beam:320});
 const coupons=[coupon('BANKO Kupon','🛡️',bank,null,'Toplam oran 2–5'),coupon('Sürpriz Kupon','🎯',surprise,null,'Toplam oran 10+'),coupon('Aşırı Sürpriz','🔥',extreme,null,'Toplam oran 50–100'),coupon('Sistem Kuponu','🧩',system,'2-3','Ham toplam oran 1000–2000')];
 if(system?.legs?.length){const n=system.legs.length;coupons[3].combinationCount=n*(n-1)/2+n*(n-1)*(n-2)/6}
 return{date,generatedAt:new Date().toISOString(),matchCount:raw.length,analyzedCount:analyses.length,candidateCount:legs.length,coupons,method:'Nesine gerçek oranları + Flashscore formu; aynı maç bir kuponda yalnızca bir kez kullanılır.'}
}
module.exports={generateDailyCoupons,dateTR,verify};
