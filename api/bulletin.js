const { fetchBulletin } = require('../lib/nesine');

function istanbulDate(ts){
  if(!ts) return null;
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));
}

module.exports = async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const all=await fetchBulletin();
    const sport=req.query?.sport ? Number(req.query.sport) : 0;
    const date=String(req.query?.date||'').trim();
    const search=String(req.query?.search||'').toLocaleLowerCase('tr-TR').trim();
    let matches=all;
    if([1,5].includes(sport)) matches=matches.filter(m=>m.sportType===sport);
    if(date) matches=matches.filter(m=>istanbulDate(m.startTimestamp)===date || m.date===date);
    if(search) matches=matches.filter(m=>`${m.home} ${m.away} ${m.league}`.toLocaleLowerCase('tr-TR').includes(search));
    const sports={football:all.filter(m=>m.sportType===1).length,tennis:all.filter(m=>m.sportType===5).length};
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json({source:'Nesine Bülten',fetchedAt:new Date().toISOString(),total:matches.length,sports,matches});
  }catch(e){
    console.error('[bulletin]',e);
    return res.status(502).json({error:e.message||'Bülten alınamadı',sourceStatus:e.status||null,detail:e.preview||null,noFakeData:true});
  }
};
