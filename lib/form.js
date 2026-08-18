function clean(s) {
  return String(s || '').toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}
function closeName(a,b){
  a=clean(a); b=clean(b);
  if(!a||!b) return false;
  if(a===b||a.includes(b)||b.includes(a)) return true;
  const A=new Set(a.split(' ').filter(x=>x.length>2));
  const B=new Set(b.split(' ').filter(x=>x.length>2));
  let common=0; for(const x of A) if(B.has(x)) common++;
  return common>=Math.min(2,A.size,B.size);
}
function ymd(d){return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;}
function scoreState(h,a){if(!Number.isFinite(h)||!Number.isFinite(a))return null;return h>a?'1':h<a?'2':'X';}
function competitorScore(c){const n=Number(c?.score??NaN);return Number.isFinite(n)?n:null;}
function halfTimeScore(comp){
  const cs=comp?.competitors;
  if(!Array.isArray(cs)||cs.length<2)return null;
  const home=cs.find(c=>c?.homeAway==='home')||cs[0];
  const away=cs.find(c=>c?.homeAway==='away')||cs.find(c=>c!==home);
  const hl=Array.isArray(home?.linescores)?home.linescores:[];
  const al=Array.isArray(away?.linescores)?away.linescores:[];
  const h1=Number(hl?.[0]?.value??hl?.[0]?.displayValue??NaN);
  const a1=Number(al?.[0]?.value??al?.[0]?.displayValue??NaN);
  if(Number.isFinite(h1)&&Number.isFinite(a1))return {home:h1,away:a1,source:'linescores'};
  return null;
}
function summarizeRows(rows){
  const played=rows.length;
  if(!played)return null;
  return {
    played,
    wins:rows.filter(x=>x.result==='W').length,
    draws:rows.filter(x=>x.result==='D').length,
    losses:rows.filter(x=>x.result==='L').length,
    goalsFor:rows.reduce((s,x)=>s+x.gf,0),
    goalsAgainst:rows.reduce((s,x)=>s+x.ga,0),
    over25:rows.filter(x=>x.over25).length,
    btts:rows.filter(x=>x.btts).length,
    cleanSheets:rows.filter(x=>x.ga===0).length,
    failedToScore:rows.filter(x=>x.gf===0).length,
    avgGF:rows.reduce((s,x)=>s+x.gf,0)/played,
    avgGA:rows.reduce((s,x)=>s+x.ga,0)/played,
    recent:rows.slice(0,5).map(x=>x.result).join('-')
  };
}
function summarize(games,teamName){
  const rows=[];
  for(const ev of games){
    const comp=ev?.competitions?.[0],cs=comp?.competitors;
    if(!Array.isArray(cs)||cs.length<2)continue;
    const mine=cs.find(c=>closeName(c?.team?.displayName,teamName));
    if(!mine)continue;
    const opp=cs.find(c=>c!==mine);
    const my=competitorScore(mine),op=competitorScore(opp);
    if(!Number.isFinite(my)||!Number.isFinite(op))continue;
    const role=mine?.homeAway==='away'?'away':mine?.homeAway==='home'?'home':null;
    const home=cs.find(c=>c?.homeAway==='home'),away=cs.find(c=>c?.homeAway==='away');
    const hs=competitorScore(home),as=competitorScore(away);
    const ht=halfTimeScore(comp);
    const htState=ht?scoreState(ht.home,ht.away):null,ftState=scoreState(hs,as);
    rows.push({
      date:ev?.date||null,gf:my,ga:op,
      result:my>op?'W':my<op?'L':'D',
      over25:my+op>2.5,btts:my>0&&op>0,role,
      htft:htState&&ftState?`${htState}/${ftState}`:null
    });
  }
  rows.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  const last=rows.slice(0,10);
  if(!last.length)return null;
  const base=summarizeRows(last);
  const roleStats={
    home:summarizeRows(last.filter(x=>x.role==='home')),
    away:summarizeRows(last.filter(x=>x.role==='away'))
  };
  const combos=['1/1','1/X','1/2','X/1','X/X','X/2','2/1','2/X','2/2'];
  const htftByRole={home:{played:0,counts:{}},away:{played:0,counts:{}}};
  for(const role of ['home','away']){
    const rr=last.filter(x=>x.role===role&&x.htft);
    htftByRole[role].played=rr.length;
    for(const combo of combos)htftByRole[role].counts[combo]=rr.filter(x=>x.htft===combo).length;
  }
  return {...base,roleStats,htftByRole};
}
const FORM_CACHE=new Map();
async function fetchFootballForm(home,away){
  const key=`${clean(home)}|${clean(away)}`;
  const cached=FORM_CACHE.get(key);
  if(cached&&Date.now()-cached.at<10*60*1000)return cached.value;
  const end=new Date(),start=new Date(end.getTime()-150*86400000),ranges=[];
  for(let cursor=new Date(start);cursor<end;cursor=new Date(cursor.getTime()+20*86400000)){
    const rEnd=new Date(Math.min(end.getTime(),cursor.getTime()+19*86400000));
    ranges.push([new Date(cursor),rEnd]);
  }
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9500);
  try{
    const batches=await Promise.all(ranges.map(async([from,to])=>{
      const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=1000`;
      try{
        const res=await fetch(url,{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 NEC-Analiz/3.0'},cache:'no-store',signal:ctrl.signal});
        if(!res.ok)return [];
        const data=await res.json();
        return Array.isArray(data?.events)?data.events:[];
      }catch{return [];}
    }));
    const byId=new Map();
    for(const ev of batches.flat())byId.set(String(ev?.id||ev?.uid||`${ev?.date}-${ev?.name||''}`),ev);
    const events=[...byId.values()];
    const h=summarize(events,home),a=summarize(events,away);
    if(!h&&!a)return null;
    const value={home:h,away:a,source:'ESPN public scoreboard',coverage:'best-effort / chunked 150-day lookup',htftCoverage:'only when half-time score is present'};
    FORM_CACHE.set(key,{at:Date.now(),value});
    return value;
  }catch{return null;}
  finally{clearTimeout(timer);}
}
module.exports={fetchFootballForm};
