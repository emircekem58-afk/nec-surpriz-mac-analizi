const { analyzeMatch } = require('../lib/analyzer');
const { fetchFootballForm } = require('../lib/form');

const RESULT_DEPENDENT_SPECIALS=new Set([214,215,442,444,588,589,590,591,592,705]);

function withTimeout(promise,ms){
  return Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(null),ms))]);
}

function analysisMatch(match){
  if(Number(match?.sportType)!==1) return match;
  return {
    ...match,
    markets:(match.markets||[]).filter(m=>!RESULT_DEPENDENT_SPECIALS.has(Number(m?.typeId)))
  };
}

function emergencyAnalysis(match,message){
  const markets=Array.isArray(match?.markets)?match.markets:[];
  const main=markets
    .filter(m=>/maç sonucu|mac sonucu|maç kazananı|mac kazanani/i.test(String(m?.name||'')))
    .flatMap(m=>(m.outcomes||[]).map(o=>({market:m.name,selection:o.label,odds:Number(o.odds)})))
    .filter(x=>x.odds>1)
    .sort((a,b)=>a.odds-b.odds)[0]||null;
  return {
    radar:20,form:null,
    scenario:{
      title:'Piyasa tabanlı geçici NEÇ senaryosu',
      summary:'Bağımsız form kaynağı bu istekte cevap vermedi. Maç ekranı kapatılmadı; yalnızca doğrulanmış bülten oranlarıyla sınırlı görünüm gösteriliyor.',
      formText:'Takım form verisi geçici olarak alınamadı. Veri uydurulmadı.',confidence:18,
      specialComment:main?`NEÇ Özel geçici seçim: ${main.market} — ${main.selection} (${main.odds.toFixed(2)}). Bu seçim yalnızca bülten fiyatına dayanır; form teyidi yoktur.`:'Bu maç için güvenilir ana market çözümlenemedi.',
      specialOdds:main?.odds??null,specialMarket:main?.market??null,specialSelection:main?.selection??null,av:0
    },
    picks:main?[{label:'Ana Senaryo',available:true,tag:'GEÇİCİ',market:main.market,selection:main.selection,odds:main.odds,av:0,avText:'0.0',confidencePct:18,model:null,fair:null,recommended:false,reason:'Takım form kaynağına ulaşılamadığı için yalnızca gerçek bülten fiyatı gösteriliyor; zıt veya uydurma ek tahmin üretilmedi.'}]:[],
    insights:[{title:'⚠️ Veri Kaynağı',text:message||'Bağımsız form servisi geçici olarak yanıt vermedi.'},{title:'🧭 Tutarlılık',text:'Form verisi yokken birbiriyle çelişen alternatif tahminler üretilmez.'}],
    analyzedAt:new Date().toISOString(),degraded:true,
    disclaimer:'Bu geçici görünüm yalnızca gerçek bülten oranlarını kullanır. Form verisi dönmediğinde istatistik veya AV uydurulmaz.'
  };
}

module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    const original=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!original||!original.id||!Array.isArray(original.markets)) return res.status(400).json({error:'Geçersiz maç verisi'});
    const match=analysisMatch(original);
    let form=null,formError=null;
    if(Number(match.sportType)===1&&match.home&&match.away){
      try{
        form=await withTimeout(fetchFootballForm(match.home,match.away),5500);
        if(!form) formError='Takım form servisi süre sınırı içinde yeterli veri döndürmedi.';
      }catch(e){
        formError=e?.message||'Takım form verisi alınamadı.';
        console.warn('[form-fallback]',match.id,formError);
        form=null;
      }
    }
    try{
      const result=analyzeMatch(match,form);
      result.formStatus=form?'ok':'fallback';
      result.fullMarketCount=original.marketCount||original.markets.length;
      result.analysisMarketCount=match.markets.length;
      if(formError) result.formWarning=formError;
      return res.status(200).json(result);
    }catch(e){
      console.error('[analyzer-primary]',match.id,e);
      try{
        const fallback=analyzeMatch(match,null);
        fallback.formStatus='fallback';
        fallback.formWarning='Form verisi veya gelişmiş analiz işlenemedi; oran tabanlı güvenli moda geçildi.';
        return res.status(200).json(fallback);
      }catch(e2){
        console.error('[analyzer-fallback]',match.id,e2);
        return res.status(200).json(emergencyAnalysis(original,e2?.message||e?.message));
      }
    }
  }catch(e){
    console.error('[analyze-request]',e);
    return res.status(200).json(emergencyAnalysis(req.body||{},e?.message||'Analiz isteği işlenirken beklenmeyen hata oluştu.'));
  }
};