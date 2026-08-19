const base=require('./research');
function text(v){return String(v??'').trim().toLowerCase()}
async function fetchWebResearch(match,runtimeToken){const r=await base.fetchWebResearch(match,runtimeToken);if(!r)return null;const stats=new Set((r.flashscore?.statsVerified||[]).map(text));r.picks=(r.picks||[]).filter(p=>{const k=String(p.candidate?.kind||'');if(!/^player_/.test(k))return true;return p.lineupVerified===true&&stats.has('lineups')&&stats.has('player_stats')});return r}
module.exports={fetchWebResearch};
