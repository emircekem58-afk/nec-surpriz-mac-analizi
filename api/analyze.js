const { analyzeMatch } = require('../lib/analyzer');
const { fetchFootballForm } = require('../lib/form');
const { fetchWebResearch } = require('../lib/research');

const RESULT_DEPENDENT_SPECIALS=new Set([214,215,442,444,588,589,590,591,592,705]);
const TAGS={'Ana Senaryo':'ANA YÖN','Temkinli Seçim':'TEMKİNLİ','Sürpriz Seçim':'🎯 SÜRPRİZ','Çok Sürpriz':'🔥 ÇOK SÜRPRİZ','NEÇ Özel':'⭐ NEÇ ÖZEL'};
function withTimeout(promise,ms){return Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(null),ms))])}
function analysisMatch(match){if(Number(match?.sportType)!==1)return match;return{...match,markets:(match.markets||[]).filter(m=>!RESULT_DEPENDENT_SPECIALS.has(Number(m?.typeId)))}}
function researchAnalysis(match,research,form){
  const picks=(research.picks||[]).map(p=>({
    label:p.role||'NEÇ Seçimi',available:true,tag:TAGS[p.role]||'NEÇ ARAŞTIRMA',
    market:p.candidate.market,selection:p.candidate.selection,odds:p.candidate.odds,
    av:null,confidencePct:p.confidence,recommended:p.confidence>=58,
    reason:p.reason,kind:p.candidate.kind,researchBacked:true,lineupVerified:p.lineupVerified===true
  }));
  const special=picks.find(p=>p.label==='NEÇ Özel')||picks[picks.length-1]||null;
  const insights=[];
  if(research.flashscore?.verified){
    const stats=(research.flashscore.statsVerified||[]).join(', ');
    insights.push({title:'⚡ Flashscore Kontrolü',text:`İki takım Flashscore futbol sayfalarıyla eşleştirildi. Kullanılabilir doğrulanmış veri türleri: ${stats||'sonuç/form'}.`});
  }
  if(research.lineupNote)insights.push({title:'👥 Kadro / Eksikler',text:research.lineupNote});
  if(research.formText)insights.push({title:'📋 Son Form',text:research.formText});
  for(const note of research.flashscore?.notes||[])insights.push({title:'📊 Flashscore Verisi',text:note});
  for(const note of research.researchNotes||[])insights.push({title:'🔎 Güncel Araştırma',text:note});
  return{
    radar:Math.max(1,Math.min(99,Math.round(research.confidence))),
    form:form||null,formStatus:form?'ok':'research-only',researchMode:true,
    research:{engine:research.engine,researchedAt:research.researchedAt,sources:research.sources||[],flashscore:research.flashscore||null},
    scenario:{
      title:research.title,summary:research.summary,formText:research.formText,
      confidence:research.confidence,specialComment:special?.reason||research.summary,
      specialOdds:special?.odds??null,specialMarket:special?.market??null,specialSelection:special?.selection??null,av:null
    },
    picks,insights:insights.slice(0,10),analyzedAt:new Date().toISOString(),
    disclaimer:'NEÇ seçimleri Flashscore-first güncel web araştırması ve Nesine bülteninden gelen doğrulanmış seçim-oran çiftleri üzerinden oluşturulur. Korner/şut/kart/oyuncu gibi özel marketler ilgili Flashscore verisi doğrulanmadan seçilmez. Oyuncu bahsi için ayrıca kadro/oynama durumu teyidi gerekir. Tahminler garanti değildir.'
  };
}
function emergencyAnalysis(match,message){
  return{radar:0,form:null,scenario:{title:'Araştırma geçici olarak tamamlanamadı',summary:'Bu maçta güvenilir Flashscore/web araştırması tamamlanamadığı için NEÇ seçimi uydurulmadı.',formText:'',confidence:0,specialComment:'',specialOdds:null,specialMarket:null,specialSelection:null,av:null},picks:[],insights:[{title:'⚠️ Araştırma',text:message||'Araştırma servisi geçici olarak yanıt vermedi.'}],analyzedAt:new Date().toISOString(),degraded:true,disclaimer:'Veri yetersizken seçim üretilmez.'};
}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    const original=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!original||!original.id||!Array.isArray(original.markets))return res.status(400).json({error:'Geçersiz maç verisi'});
    const match=analysisMatch(original);
    if(Number(match.sportType)!==1){const r=analyzeMatch(match,null);return res.status(200).json(r)}
    let form=null,research=null,formError=null;
    const formPromise=(match.home&&match.away)?withTimeout(fetchFootballForm(match.home,match.away),7000).catch(e=>{formError=e?.message||'Form verisi alınamadı';return null}):Promise.resolve(null);
    const runtimeOidc=req.headers?.['x-vercel-oidc-token']||null;
    const researchPromise=withTimeout(fetchWebResearch(match,runtimeOidc),41000).catch(e=>{console.warn('[research-promise]',match.id,e?.message||e);return null});
    [form,research]=await Promise.all([formPromise,researchPromise]);
    if(research){
      const result=researchAnalysis(match,research,form);
      result.fullMarketCount=original.marketCount||original.markets.length;
      result.analysisMarketCount=match.markets.length;
      if(formError)result.formWarning=formError;
      return res.status(200).json(result);
    }
    try{
      const fallback=analyzeMatch(match,form);
      fallback.formStatus=form?'ok':'fallback';fallback.researchWarning='Flashscore-first araştırması bu istekte tamamlanamadı. Nesine oranları yine eksiksiz gösterilir; NEÇ seçimleri yalnızca doğrulanabilen takım formu varsa üretilir.';
      fallback.fullMarketCount=original.marketCount||original.markets.length;fallback.analysisMarketCount=match.markets.length;
      return res.status(200).json(fallback);
    }catch(e){return res.status(200).json(emergencyAnalysis(original,e?.message||'Analiz tamamlanamadı'))}
  }catch(e){console.error('[analyze-request]',e);return res.status(200).json(emergencyAnalysis(req.body||{},e?.message||'Analiz isteği işlenemedi'))}
};