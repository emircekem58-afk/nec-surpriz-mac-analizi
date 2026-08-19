const { fetchBulletin }=require('../lib/nesine');
const { fetchFlashscoreForm }=require('../lib/flashscore');
const { analyzeMatch }=require('../lib/analyzer');
const CORE=new Set([1,3,5,11,12,13,14,38,43,49,100,101]);
function verify(match){for(const m of match.markets||[])for(const o of m.outcomes||[])o.labelVerified=Boolean(o.sourceLabel)||(Number(match.sportType)===1&&CORE.has(Number(m.typeId)));return match}
module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  res.setHeader('Cache-Control','no-store');
  try{
    const q=String(req.query?.search||'').toLocaleLowerCase('tr-TR').trim();
    let matches=(await fetchBulletin()).filter(m=>Number(m.sportType)===1);
    if(q)matches=matches.filter(m=>`${m.home} ${m.away} ${m.league}`.toLocaleLowerCase('tr-TR').includes(q));
    matches=matches.slice(0,12);
    const attempts=[];
    for(const raw of matches){
      const match=verify(raw);
      const started=Date.now();
      const form=await fetchFlashscoreForm(match);
      if(!form){attempts.push({match:`${match.home} - ${match.away}`,flash:false,ms:Date.now()-started});continue}
      const a=analyzeMatch(match,form),available=(a.picks||[]).filter(p=>p.available);
      return res.status(200).json({ok:true,match:{id:match.id,home:match.home,away:match.away,league:match.league},flashscore:{eventId:form.eventId,source:form.source,url:form.flashscoreUrl,homePlayed:form.home?.played,awayPlayed:form.away?.played,stats:form.flashStats},analysis:{availablePicks:available.length,picks:available.map(p=>({label:p.label,market:p.market,selection:p.selection,odds:p.odds,av:p.av,confidence:p.confidencePct})),title:a.scenario?.title},attempts});
    }
    return res.status(200).json({ok:false,error:'İlk 12 futbol maçında Flashscore eşleşmesi bulunamadı',attempts});
  }catch(e){console.error('[selftest]',e);return res.status(500).json({ok:false,error:e.message||String(e)})}
};