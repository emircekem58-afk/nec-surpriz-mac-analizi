const { fetchBulletin }=require('../lib/nesine');
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 try{
  const q=String(req.query?.search||'').toLocaleLowerCase('tr-TR').trim();
  const sport=Number(req.query?.sport||0);
  const all=await fetchBulletin();
  const match=all.find(m=>(!sport||Number(m.sportType)===sport)&&`${m.home} ${m.away} ${m.league}`.toLocaleLowerCase('tr-TR').includes(q));
  if(!match)return res.status(404).json({error:'match not found'});
  return res.status(200).json({id:match.id,home:match.home,away:match.away,league:match.league,markets:(match.markets||[]).map(m=>({typeId:m.typeId,name:m.name,sourceName:m.sourceName,kind:m.kind,spread:m.spread,outcomes:(m.outcomes||[]).map(o=>({n:o.n,label:o.label,sourceLabel:o.sourceLabel,odds:o.odds,no:o.no}))}))});
 }catch(e){return res.status(500).json({error:e.message||String(e)})}
};
