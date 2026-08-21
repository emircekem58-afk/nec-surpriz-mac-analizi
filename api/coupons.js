const store=require('../lib/daily-store');
const {generateDailyCoupons,dateTR,verify,reversalCandidates}=require('../lib/coupon-engine');
const {fetchBulletin}=require('../lib/nesine');
function hourTR(){return Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Istanbul',hour:'2-digit',hourCycle:'h23'}).format(new Date()))}
function nCk(n,k){if(k<0||k>n)return 0;let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return Math.round(r)}
function comboCount(n){return nCk(n,2)+nCk(n,3)}
async function diversifyReverse(snap,date){
 const card=(snap?.coupons||[]).find(c=>c.name==='İY/MS Ters Sistem');if(!card)return snap;
 const matches=(await fetchBulletin()).filter(m=>(dateTR(m.startTimestamp)===date||m.date===date)&&Number(m.sportType)===1&&m.startTimestamp>Date.now()-20*60*1000);
 let pool=[];for(const m of matches)pool.push(...reversalCandidates(verify(m),null));pool.sort((a,b)=>b.quality-a.quality);
 const chosen=[],used=new Set();const add=list=>{const x=list.find(v=>!used.has(v.matchId));if(!x)return false;chosen.push(x);used.add(x.matchId);return true};
 for(const type of ['1/2','2/1','X/1','X/2','1/X','2/X']){if(chosen.length>=6)break;add(pool.filter(x=>x.selection===type))}
 for(const x of pool){if(chosen.length>=6)break;if(used.has(x.matchId))continue;chosen.push(x);used.add(x.matchId)}
 const direct=chosen.filter(x=>x.selection==='1/2'||x.selection==='2/1').length;if(chosen.length<4||!direct)return snap;
 card.legs=chosen;card.totalOdds=+chosen.reduce((p,x)=>p*x.odds,1).toFixed(2);card.targetReached=true;card.combinationCount=comboCount(chosen.length);card.note='İY/MS türleri mümkün olduğunca dağıtıldı: 1/2 ve 2/1 öncelikli, ardından X/1, X/2, 1/X ve 2/X. Aynı maç yalnızca bir kez kullanılır.';
 snap.reversalCandidateCount=pool.length;snap.directReversalCandidateCount=pool.filter(x=>x.selection==='1/2'||x.selection==='2/1').length;snap.reverseSelectionMix=chosen.map(x=>x.selection);return snap;
}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});res.setHeader('Cache-Control','no-store, max-age=0');
 try{const today=dateTR(),date=String(req.query?.date||today),key=`coupons:${date}:v3-htft-mix`,force=String(req.query?.refresh||'')==='1';let snap=!force?await store.get(key):null;if(!snap){if(date===today&&hourTR()<9)return res.status(200).json({available:false,date,message:'Bugünün NEÇ kuponları İstanbul saatiyle 09:00 sonrası hazırlanır.'});snap=await generateDailyCoupons(date);snap=await diversifyReverse(snap,date);await store.set(key,snap,9*24*3600)}return res.status(200).json({available:true,...snap})}catch(e){console.error('[coupons]',e);return res.status(200).json({available:false,error:e.message||'Kuponlar hazırlanamadı'})}
};
