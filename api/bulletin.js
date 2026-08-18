const { fetchBulletin } = require('../lib/nesine');

const VERIFIED_FALLBACK_MTIDS = new Set([
  1,3,5,7,8,9,11,12,13,14,15,20,29,38,43,48,49,100,101,155,161,164,
  185,216,272,291,299,301,338,342,343,414,416,418,424,426,438,446,450,
  452,459,461,583,601,602,656,801,822,823,824,866,867,884,887
]);

function istanbulDate(ts){
  if(!ts) return null;
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));
}

function verifyMarketLabels(matches){
  for(const match of matches||[]){
    const verifiedMarkets=[];
    for(const market of match.markets||[]){
      const mtid=Number(market?.typeId||0);
      const verifiedOutcomes=[];
      for(const outcome of market.outcomes||[]){
        // User-verified current Nesine display: MTID 599 fallback order is Evet / Hayır.
        // Explicit source text always has priority over every fallback mapping.
        if(mtid===599 && !outcome.sourceLabel){
          if(Number(outcome.n)===1) outcome.label='Evet';
          else if(Number(outcome.n)===2) outcome.label='Hayır';
        }
        outcome.labelVerified = Boolean(outcome.sourceLabel) || VERIFIED_FALLBACK_MTIDS.has(mtid) || mtid===599;
        outcome.labelSource = outcome.sourceLabel ? 'nesine-source' : (outcome.labelVerified ? 'verified-fallback' : 'unverified-fallback');
        if(outcome.labelVerified) verifiedOutcomes.push(outcome);
      }
      if(verifiedOutcomes.length){
        market.outcomes=verifiedOutcomes;
        verifiedMarkets.push(market);
      }
    }
    match.markets=verifiedMarkets;
    match.marketCount=verifiedMarkets.length;
    match.outcomeCount=verifiedMarkets.reduce((n,m)=>n+(m.outcomes?.length||0),0);
  }
  return matches;
}

module.exports = async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const all=verifyMarketLabels(await fetchBulletin());
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
