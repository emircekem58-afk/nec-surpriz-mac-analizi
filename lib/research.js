const CACHE=new Map();

function text(v){return String(v??'').replace(/\s+/g,' ').trim()}
function keyFor(match){return `${match.id}|${(match.markets||[]).flatMap(m=>(m.outcomes||[]).map(o=>`${m.id??m.typeId}:${o.n}:${o.odds}`)).join('|')}`}
function isVerified(o){return o?.labelVerified===true||Boolean(o?.sourceLabel)}
function candidates(match){
  const rows=[];
  for(const m of match.markets||[]){
    for(const o of m.outcomes||[]){
      const odds=Number(o?.odds);
      if(!(odds>1)||!isVerified(o))continue;
      rows.push({
        key:`${m.id??m.typeId}:${o.n}`,
        market:text(m.name),selection:text(o.label),odds,
        kind:text(m.kind),typeId:Number(m.typeId||0),sourceLabel:Boolean(o.sourceLabel)
      });
    }
  }
  return rows.slice(0,450);
}
function outputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const parts=[];
  for(const item of data?.output||[]){
    for(const c of item?.content||[]){if(typeof c?.text==='string')parts.push(c.text)}
  }
  return parts.join('\n');
}
function parseJson(s){
  const raw=String(s||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a<0||b<a)throw new Error('Araştırma modeli JSON döndürmedi');
  return JSON.parse(raw.slice(a,b+1));
}
function sourceUrls(data){
  const out=[];
  const seen=new Set();
  const walk=x=>{
    if(!x||typeof x!=='object')return;
    if(typeof x.url==='string'&&/^https?:\/\//.test(x.url)&&!seen.has(x.url)){seen.add(x.url);out.push({url:x.url,title:text(x.title||x.name||'Kaynak')})}
    if(Array.isArray(x))x.forEach(walk);else Object.values(x).forEach(walk);
  };
  walk(data?.output);
  return out.slice(0,10);
}
async function fetchWebResearch(match){
  if(Number(match?.sportType)!==1)return null;
  const rows=candidates(match);
  if(rows.length<5)return null;
  const cacheKey=keyFor(match),cached=CACHE.get(cacheKey);
  if(cached&&Date.now()-cached.at<20*60*1000)return cached.value;
  const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  if(!token)return null;
  const marketText=rows.map(r=>`${r.key} | ${r.market} | ${r.selection} | ${r.odds.toFixed(2)} | ${r.kind}`).join('\n');
  const prompt=`Bugün ${match.home} - ${match.away} futbol maçı için NEÇ maç araştırması yapıyorsun. Lig: ${match.league}. Başlangıç: ${match.date||''} ${match.time||''}.

WEB ARAŞTIRMASI ZORUNLU:
- İki takımın mümkünse son 5-10 resmi maçını ve ev/deplasman formunu kontrol et.
- Güncel sakatlık, ceza, rotasyon, teknik direktör açıklaması ve muhtemel/teyitli ilk 11 haberlarını ara.
- Oyuncu marketi seçeceksen oyuncunun bu maçta başlamasının veya anlamlı süre almasının beklendiğini güvenilir güncel kaynaktan doğrula. Doğrulayamıyorsan oyuncu marketi seçme.
- Eski haberleri güncel durum gibi kullanma; maç tarihine en yakın kaynakları tercih et.
- Birbirine zıt seçimler yapma. Beş seçim tek bir maç hikayesi anlatsın.
- Sırf oran yüksek diye seçim yapma. Her seçim için takım/oyuncu/maç verisine dayalı somut gerekçe yaz.
- Aşağıdaki liste Nesine bülteninden gelen DOĞRULANMIŞ seçim-oran çiftleridir. SADECE bu listedeki key değerlerini seç. Oranı veya marketi değiştirme, yeni bahis uydurma.
- Mümkünse 5 farklı rol üret: Ana Senaryo, Temkinli Seçim, Sürpriz Seçim, Çok Sürpriz, NEÇ Özel. Beşinin de savunulabilir olması şart. Bir rol için yeterli kanıt yoksa o rolü atla; sahte seçim üretme.

NESİNE SEÇİMLERİ:
${marketText}

SADECE JSON döndür, markdown kullanma. Şema:
{"title":"kısa ana maç hikayesi","summary":"maçı güncel araştırmaya göre 3-6 cümlede değerlendir","formText":"son form ve ev/deplasman özeti","lineupNote":"güncel kadro/eksik/muhtemel 11 notu","confidence":0,"picks":[{"role":"Ana Senaryo|Temkinli Seçim|Sürpriz Seçim|Çok Sürpriz|NEÇ Özel","key":"listedeki exact key","reason":"neden bu seçimi seçtiğini takım/oyuncu verileriyle 2-5 cümlede açıkla","confidence":0}],"researchNotes":["kısa güncel bulgu"]}`;
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),26000);
  try{
    const res=await fetch('https://ai-gateway.vercel.sh/v1/responses',{
      method:'POST',signal:ctrl.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({
        model:'openai/gpt-5.6-sol',
        tools:[{type:'web_search'}],
        input:prompt,
        max_output_tokens:2600,
        reasoning:{effort:'medium'}
      })
    });
    const body=await res.text();
    if(!res.ok)throw new Error(`AI Gateway ${res.status}: ${body.slice(0,220)}`);
    const data=JSON.parse(body),obj=parseJson(outputText(data));
    const map=new Map(rows.map(r=>[r.key,r]));
    const used=new Set();
    const picks=[];
    for(const p of Array.isArray(obj.picks)?obj.picks:[]){
      const c=map.get(String(p.key||''));
      if(!c||used.has(c.key))continue;
      used.add(c.key);
      picks.push({role:text(p.role),candidate:c,reason:text(p.reason),confidence:Math.max(1,Math.min(99,Number(p.confidence)||45))});
      if(picks.length>=5)break;
    }
    if(!picks.length)return null;
    const value={
      title:text(obj.title)||`${match.home} - ${match.away} web araştırması`,
      summary:text(obj.summary),formText:text(obj.formText),lineupNote:text(obj.lineupNote),
      confidence:Math.max(1,Math.min(99,Number(obj.confidence)||50)),
      picks,researchNotes:(obj.researchNotes||[]).map(text).filter(Boolean).slice(0,6),
      sources:sourceUrls(data),researchedAt:new Date().toISOString(),engine:'Vercel AI Gateway + web search'
    };
    CACHE.set(cacheKey,{at:Date.now(),value});
    return value;
  }catch(e){console.warn('[web-research]',match.id,e?.message||e);return null}finally{clearTimeout(timer)}
}

module.exports={fetchWebResearch};