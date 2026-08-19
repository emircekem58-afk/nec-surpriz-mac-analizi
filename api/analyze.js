const { analyzeFootball } = require('../lib/analyzer-football-opinion');
const { analyzeTennis } = require('../lib/analyzer-tennis');
const { fetchFlashscoreForm, fetchFlashscoreTennisForm } = require('../lib/flashscore');
const RESULT_DEPENDENT_SPECIALS=new Set([214,215,442,444,588,589,590,591,592,705]);
function withTimeout(promise,ms){return Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(null),ms))])}
function analysisMatch(match){if(Number(match?.sportType)!==1)return match;return{...match,markets:(match.markets||[]).filter(m=>!RESULT_DEPENDENT_SPECIALS.has(Number(m?.typeId)))}}
function emergencyAnalysis(match,message){return{radar:0,form:null,formStatus:'fallback',scenario:{title:'Analiz üretilemedi',summary:'Nesine oranları görünmeye devam ediyor; analiz motoru bu istekte sonuç üretemedi.',formText:'',confidence:0,betOpinion:'Sırf kart dolsun diye bahis önerisi üretmiyorum.',betOpinionTitle:'💬 NEÇ ORAN YORUMU',specialComment:'',specialOdds:null},picks:[],ideas:[],insights:[{title:'⚠️ Teknik not',text:message||'Analiz servisi yanıt vermedi.'}],analyzedAt:new Date().toISOString(),degraded:true,disclaimer:'Teknik hata halinde sahte seçim üretilmez.'}}
module.exports=async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});res.setHeader('Cache-Control','no-store, max-age=0');
 try{
  const original=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!original||!original.id||!Array.isArray(original.markets))return res.status(400).json({error:'Geçersiz maç verisi'});
  const match=analysisMatch(original),sport=Number(match.sportType);let form=null,sourceMode='market-only';
  if(sport===1){form=await withTimeout(fetchFlashscoreForm(match),8000).catch(e=>{console.warn('[flashscore-promise]',match.id,e?.message||e);return null});sourceMode=form?'flashscore-direct':'market-only-football'}
  else if(sport===5){form=await withTimeout(fetchFlashscoreTennisForm(match),7000).catch(e=>{console.warn('[flashscore-tennis-promise]',match.id,e?.message||e);return null});sourceMode=form?'flashscore-tennis':'market-only-tennis'}
  try{
   let result=sport===1?analyzeFootball(match,form):sport===5?analyzeTennis(match,form):null;
   result=result||emergencyAnalysis(original,'Analiz adayı oluşturulamadı');
   result.fullMarketCount=original.marketCount||original.markets.length;result.analysisMarketCount=match.markets.length;
   result.researchMode=Boolean(form&&String(form.source||'').toLowerCase().includes('flashscore'));result.formStatus=result.formStatus||sourceMode;
   if(sport===1&&!form)result.researchWarning='Flashscore son formu bu istekte hızlı süre içinde eşleşmedi; ana yön piyasa temeliyle düşük güvenli kuruldu. Oyuncu/şut verisi uydurulmadı.';
   if(sport===1&&form)result.researchWarning='Flashscore formu ve doğrulanabilen takım şut/isabetli şut ortalamaları kullanıldı. NEÇ Oran Yorumu, ana yön ile fiyat cazibesini birbirinden ayrı değerlendirir.';
   if(sport===5&&!form)result.researchWarning='Flashscore tenis formu hızlı süre içinde eşleşmedi. Tek Maç Kazananı marketinden iki zıt bahis üretilmez; yalnızca piyasa ana görüşü gösterilir.';
   if(sport===5&&form)result.researchWarning='Tenis analizi futbol risk kartlarından ayrıdır. Ana oyuncu görüşü + fiyat yorumu üretilir; karşı oyuncu sırf daha yüksek oranlı diye “sürpriz” yapılmaz.';
   if(form?.eventId)result.flashscore={verified:true,eventId:form.eventId,url:form.flashscoreUrl,stats:form.flashStats||{}};
   console.log('[analyze-ok]',match.id,sourceMode,'picks',(result.picks||[]).length,'ideas',(result.ideas||[]).length,'main',result.picks?.[0]?.selection||'none');
   return res.status(200).json(result);
  }catch(e){console.error('[analyzer]',match.id,e);return res.status(200).json(emergencyAnalysis(original,e?.message||'NEÇ analiz motoru çalıştırılamadı'))}
 }catch(e){console.error('[analyze-request]',e);return res.status(200).json(emergencyAnalysis(req.body||{},e?.message||'Analiz isteği işlenemedi'))}
};
