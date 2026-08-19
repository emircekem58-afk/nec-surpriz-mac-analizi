const { analyzeMatch } = require('../lib/analyzer');
const { fetchFootballForm } = require('../lib/form');
const { fetchFlashscoreForm } = require('../lib/flashscore');

const RESULT_DEPENDENT_SPECIALS=new Set([214,215,442,444,588,589,590,591,592,705]);
function withTimeout(promise,ms){return Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(null),ms))])}
function analysisMatch(match){if(Number(match?.sportType)!==1)return match;return{...match,markets:(match.markets||[]).filter(m=>!RESULT_DEPENDENT_SPECIALS.has(Number(m?.typeId)))}}
function emergencyAnalysis(match,message){return{radar:0,form:null,formStatus:'fallback',scenario:{title:'Analiz verisi geçici olarak alınamadı',summary:'Nesine oranları görünmeye devam eder; veri kaynağı cevap vermediği için seçim uydurulmadı.',formText:'',confidence:0,specialComment:'',specialOdds:null},picks:[],insights:[{title:'⚠️ Veri',text:message||'Flashscore ve yedek form kaynağı yanıt vermedi.'}],analyzedAt:new Date().toISOString(),degraded:true,disclaimer:'Yeterli veri olmadan seçim üretilmez.'}}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    const original=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!original||!original.id||!Array.isArray(original.markets))return res.status(400).json({error:'Geçersiz maç verisi'});
    const match=analysisMatch(original);
    if(Number(match.sportType)!==1)return res.status(200).json(analyzeMatch(match,null));
    let flash=null,espn=null;
    [flash,espn]=await Promise.all([
      withTimeout(fetchFlashscoreForm(match),16000).catch(e=>{console.warn('[flashscore-promise]',match.id,e?.message||e);return null}),
      match.home&&match.away?withTimeout(fetchFootballForm(match.home,match.away),7000).catch(()=>null):Promise.resolve(null)
    ]);
    const form=flash||espn;
    if(!form)return res.status(200).json(emergencyAnalysis(original,'Flashscore doğrudan feed ve ESPN yedek form kaynağı yeterli veri döndürmedi.'));
    try{
      const result=analyzeMatch(match,form);
      result.fullMarketCount=original.marketCount||original.markets.length;
      result.analysisMarketCount=match.markets.length;
      result.researchMode=Boolean(flash);
      result.formStatus=flash?'flashscore-direct':'espn-fallback';
      if(!flash)result.researchWarning='Flashscore eşleşmesi bu istekte kurulamadı; analiz ESPN son maç verisiyle üretildi.';
      if(flash)result.flashscore={verified:true,eventId:flash.eventId,url:flash.flashscoreUrl,stats:flash.flashStats||{}};
      console.log('[analyze-ok]',match.id,result.formStatus,'picks',(result.picks||[]).filter(p=>p.available).length);
      return res.status(200).json(result);
    }catch(e){console.error('[analyzer]',match.id,e);return res.status(200).json(emergencyAnalysis(original,e?.message||'NEÇ analiz motoru çalıştırılamadı'))}
  }catch(e){console.error('[analyze-request]',e);return res.status(200).json(emergencyAnalysis(req.body||{},e?.message||'Analiz isteği işlenemedi'))}
};