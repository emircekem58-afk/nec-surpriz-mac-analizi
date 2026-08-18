const { analyzeMatch } = require('../lib/analyzer');
const { fetchFootballForm } = require('../lib/form');

module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const match=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!match||!match.id||!Array.isArray(match.markets)) return res.status(400).json({error:'Geçersiz maç verisi'});
    let form=null;
    if(Number(match.sportType)===1 && match.home && match.away) form=await fetchFootballForm(match.home,match.away);
    const result=analyzeMatch(match,form);
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json(result);
  }catch(e){
    console.error('[analyze]',e);
    return res.status(500).json({error:'Analiz oluşturulamadı'});
  }
};
