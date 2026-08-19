const CACHE=new Map();

function text(v){return String(v??'').replace(/\s+/g,' ').trim()}
function keyFor(match){return `${match.id}|${(match.markets||[]).flatMap(m=>(m.outcomes||[]).map(o=>`${m.id??m.typeId}:${o.n}:${o.odds}`)).join('|')}`}
function isVerified(o){return o?.labelVerified===true||Boolean(o?.sourceLabel)}
function isFlashscoreUrl(url){return /^https?:\/\/([^/]+\.)?flashscore\.(com|com\.tr)(\/|$)/i.test(String(url||''))}

function candidates(match){
  const rows=[];
  for(const m of match.markets||[]){
    for(const o of m.outcomes||[]){
      const odds=Number(o?.odds);
      if(!(odds>1)||!isVerified(o))continue;
      rows.push({key:`${m.id??m.typeId}:${o.n}`,market:text(m.name),selection:text(o.label),odds,kind:text(m.kind),typeId:Number(m.typeId||0),sourceLabel:Boolean(o.sourceLabel)});
    }
  }
  return rows.slice(0,500);
}

function outputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const parts=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')parts.push(c.text);
  return parts.join('\n');
}
function parseJson(s){
  const raw=String(s||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a<0||b<a)throw new Error('Araştırma modeli JSON döndürmedi');
  return JSON.parse(raw.slice(a,b+1));
}
function sourceUrls(data){
  const out=[],seen=new Set();
  const walk=x=>{
    if(!x||typeof x!=='object')return;
    if(typeof x.url==='string'&&/^https?:\/\//.test(x.url)&&!seen.has(x.url)){seen.add(x.url);out.push({url:x.url,title:text(x.title||x.name||'Kaynak')})}
    if(Array.isArray(x))x.forEach(walk);else Object.values(x).forEach(walk);
  };
  walk(data?.output);
  return out.slice(0,16);
}

const STAT_REQUIREMENTS={
  corners_total:'corners',corner_handicap:'corners',most_corners:'corners',
  cards_total:'cards',team_shots_total:'shots',team_sot_total:'sot',goalkeeper_saves:'saves',
  player_shot:'shots',player_sot:'sot',player_card:'cards'
};
function playerKind(kind){return /^player_/.test(String(kind||''))}
function pickAllowed(p,c,flash){
  const stats=new Set((flash?.statsVerified||[]).map(x=>text(x).toLowerCase()));
  const req=STAT_REQUIREMENTS[c.kind];
  if(req&&!stats.has(req))return false;
  if(playerKind(c.kind)){
    if(p?.lineupVerified!==true)return false;
    if(!stats.has('lineups'))return false;
    if(['player_goal','player_first_goal','player_goal_assist','player_assist'].includes(c.kind)&&!stats.has('player_stats'))return false;
  }
  return true;
}

async function fetchWebResearch(match){
  if(Number(match?.sportType)!==1)return null;
  const rows=candidates(match);
  if(rows.length<3)return null;
  const cacheKey=keyFor(match),cached=CACHE.get(cacheKey);
  if(cached&&Date.now()-cached.at<15*60*1000)return cached.value;
  const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  if(!token)return null;

  const marketText=rows.map(r=>`${r.key} | ${r.market} | ${r.selection} | ${r.odds.toFixed(2)} | ${r.kind}`).join('\n');
  const prompt=`${match.home} - ${match.away} futbol maçı için NEÇ araştırması yap. Lig: ${match.league}. Başlangıç: ${match.date||''} ${match.time||''}.

FLASHCORE/FLASHSCORE ANA KAYNAK KURALI:
1) Önce web aramasıyla TAM TAKIM ADLARINI kullanarak Flashscore/Flashscore.com.tr futbol takım sayfalarını bul. Örnek sorgu mantığı: site:flashscore.com.tr/takim/ "${match.home}" futbol sonuçlar ve site:flashscore.com.tr/takim/ "${match.away}" futbol sonuçlar. Gerekirse flashscore.com kullan.
2) Yanlış spor, kadın takımı, U21/U19, e-spor veya benzer isimli başka kulüp sayfasını kullanma. Lig/ülke ve takım adı bağlamını kontrol et.
3) İki takımın mümkünse son 5-10 resmi maçını Flashscore'dan kontrol et. Sonuçlar, atılan/yenen goller ve ev/deplasman ayrımını değerlendir.
4) Flashscore maç detaylarında bulunabiliyorsa xG, toplam şut, kaleyi bulan şut, korner, kart, faul, ofsayt, oyuncu dakikaları ve kadro/ilk 11 verilerini kontrol et.
5) Korner/şut/kart gibi özel market ancak ilgili Flashscore istatistiğini gerçekten bulduysan seçilebilir.
6) Oyuncu marketi ancak oyuncunun bu maçta başlamasının veya anlamlı süre almasının beklendiğini güncel kadro/ilk 11 bilgisiyle doğruladıysan seçilebilir. Ayrıca oyuncuya ait ilgili istatistik Flashscore'da bulunmalı. Emin değilsen oyuncu marketi seçme.
7) Flashscore'da bulunmayan güncel sakatlık/ceza/rotasyon bilgisi için resmi kulüp, lig veya güvenilir güncel haber kaynağı ikinci kaynak olarak kullanılabilir; fakat form ve maç istatistiklerinde Flashscore ana referans olsun.
8) Eski haberleri güncel durum gibi kullanma. Maç tarihine en yakın bilgiye öncelik ver.
9) Beş seçim tek bir maç hikayesi anlatsın ve birbirine ters düşmesin.
10) Sırf oran yüksek diye seçim yapma. Her seçimde somut takım/oyuncu verisi kullan.
11) Aşağıdaki liste Nesine bülteninden gelen DOĞRULANMIŞ seçim-oran çiftleridir. SADECE bu listedeki key değerlerini seç. Oranı/market adını değiştirme ve yeni bahis uydurma.
12) Mümkünse roller: Ana Senaryo, Temkinli Seçim, Sürpriz Seçim, Çok Sürpriz, NEÇ Özel. Kanıt yoksa rolü boş bırak; zorla 5 seçim üretme.

NESİNE DOĞRULANMIŞ SEÇİMLER:
${marketText}

SADECE JSON döndür. Şema:
{"title":"kısa ana maç hikayesi","summary":"3-6 cümle maç değerlendirmesi","formText":"Flashscore son form özeti","lineupNote":"güncel kadro/eksik/ilk 11 notu","confidence":0,"flashscore":{"matchedHome":true,"matchedAway":true,"matchupFound":false,"exactNames":true,"statsVerified":["results","goals","home_away","xg","shots","sot","corners","cards","saves","lineups","player_stats"],"notes":["Flashscore'da doğrulanan kısa veri"]},"picks":[{"role":"Ana Senaryo|Temkinli Seçim|Sürpriz Seçim|Çok Sürpriz|NEÇ Özel","key":"listedeki exact key","reason":"seçimi Flashscore ve güncel maç verisiyle 2-5 cümlede açıkla","confidence":0,"lineupVerified":false}],"researchNotes":["kısa güncel bulgu"]}`;

  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),29000);
  try{
    const res=await fetch('https://ai-gateway.vercel.sh/v1/responses',{
      method:'POST',signal:ctrl.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({model:'openai/gpt-5.6-sol',tools:[{type:'web_search'}],input:prompt,max_output_tokens:3200,reasoning:{effort:'medium'}})
    });
    const body=await res.text();
    if(!res.ok)throw new Error(`AI Gateway ${res.status}: ${body.slice(0,240)}`);
    const data=JSON.parse(body),obj=parseJson(outputText(data));
    const sources=sourceUrls(data),flashSources=sources.filter(s=>isFlashscoreUrl(s.url));
    const flash=obj.flashscore||{};
    const flashscoreVerified=flashSources.length>0&&flash.exactNames===true&&((flash.matchedHome===true&&flash.matchedAway===true)||flash.matchupFound===true);
    if(!flashscoreVerified){
      console.warn('[flashscore-miss]',match.id,{flashSources:flashSources.length,matchedHome:flash.matchedHome,matchedAway:flash.matchedAway,matchupFound:flash.matchupFound,exactNames:flash.exactNames});
      return null;
    }

    const map=new Map(rows.map(r=>[r.key,r])),used=new Set(),picks=[];
    for(const p of Array.isArray(obj.picks)?obj.picks:[]){
      const c=map.get(String(p.key||''));
      if(!c||used.has(c.key)||!pickAllowed(p,c,flash))continue;
      used.add(c.key);
      picks.push({role:text(p.role),candidate:c,reason:text(p.reason),confidence:Math.max(1,Math.min(99,Number(p.confidence)||45)),lineupVerified:p.lineupVerified===true});
      if(picks.length>=5)break;
    }
    if(!picks.length)return null;

    const value={
      title:text(obj.title)||`${match.home} - ${match.away} Flashscore araştırması`,summary:text(obj.summary),formText:text(obj.formText),lineupNote:text(obj.lineupNote),
      confidence:Math.max(1,Math.min(99,Number(obj.confidence)||50)),picks,
      researchNotes:(obj.researchNotes||[]).map(text).filter(Boolean).slice(0,8),sources,
      flashscore:{verified:true,sourceCount:flashSources.length,statsVerified:(flash.statsVerified||[]).map(text),notes:(flash.notes||[]).map(text).filter(Boolean).slice(0,6)},
      researchedAt:new Date().toISOString(),engine:'Vercel AI Gateway + Flashscore-first web research'
    };
    CACHE.set(cacheKey,{at:Date.now(),value});
    return value;
  }catch(e){console.warn('[web-research]',match.id,e?.message||e);return null}finally{clearTimeout(timer)}
}

module.exports={fetchWebResearch};