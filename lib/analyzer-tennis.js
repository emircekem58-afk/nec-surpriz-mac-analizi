function norm(s){return String(s||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ı]/g,'i').replace(/[ş]/g,'s').replace(/[ç]/g,'c').replace(/[ğ]/g,'g').replace(/[ö]/g,'o').replace(/[ü]/g,'u').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function verified(o){return o?.labelVerified===true||Boolean(o?.sourceLabel)}
function fairRows(match){
  const market=(match.markets||[]).find(m=>m.kind==='match_winner'||Number(m.typeId)===182);
  if(!market)return null;
  const rows=(market.outcomes||[]).filter(o=>Number(o.odds)>1&&verified(o)).map(o=>({outcome:o,odds:Number(o.odds)}));
  if(!rows.length)return null;
  const sum=rows.reduce((s,r)=>s+1/r.odds,0)||1;
  rows.forEach(r=>r.fair=(1/r.odds)/sum*100);
  return{market,rows};
}
function playerSide(label,match){const l=norm(label),h=norm(match.home),a=norm(match.away);if(l===h||l.includes(h)||h.includes(l))return'home';if(l===a||l.includes(a)||a.includes(l))return'away';return null}
function formOk(form){return !!(form?.home?.played>=4&&form?.away?.played>=4)}
function formRate(x){return x?.played?x.wins/x.played*100:null}
function recentText(x){return x?.recent?String(x.recent).replace(/-/g,' · '):'—'}
function chooseDirection(match,form,data){
  const marketLeader=[...data.rows].sort((a,b)=>b.fair-a.fair)[0];
  if(!formOk(form))return{row:marketLeader,source:'market',marketLeader,conflict:false,homeRate:null,awayRate:null};
  const homeRate=formRate(form.home),awayRate=formRate(form.away);
  const scored=data.rows.map(r=>{const side=playerSide(r.outcome.label,match);const fr=side==='home'?homeRate:side==='away'?awayRate:50;return{...r,score:r.fair*.68+fr*.32,side,formRate:fr}}).sort((a,b)=>b.score-a.score);
  let row=scored[0]||marketLeader;
  const marketSide=playerSide(marketLeader.outcome.label,match),formSide=homeRate>=awayRate?'home':'away';
  const conflict=marketSide&&formSide&&marketSide!==formSide;
  if(marketLeader.odds<=1.25&&row.outcome.label!==marketLeader.outcome.label)row=marketLeader;
  return{row,source:'blend',marketLeader,conflict,homeRate,awayRate,formSide,marketSide};
}
function opinion(match,form,dir){
  const row=dir.row,chosen=row.outcome.label,odds=row.odds;
  if(!formOk(form)){
    if(odds<=1.30)return `NEÇ oran yorumu: ${chosen} maçın piyasa favorisi ancak ${odds.toFixed(2)} fiyatı bana tekli bahis için zayıf geliyor. Form doğrulanmadığı için bu kadar kısa oranda ekstra risk almıyorum; yön ${chosen}, bahis kararı PAS.`;
    if(odds<=1.85)return `NEÇ oran yorumu: Piyasa ${chosen} tarafını öne çıkarıyor ve ${odds.toFixed(2)} fiyatı makul bantta. Form doğrulanmadığı için bunu güçlü tavsiye değil, düşük güvenli ana yön olarak görüyorum.`;
    return `NEÇ oran yorumu: ${chosen} ${odds.toFixed(2)} ile yüksek fiyatlanıyor. Form doğrulanmadan bu oranı sırf yüksek diye sürpriz olarak önermiyorum.`;
  }
  const side=playerSide(chosen,match),own=side==='home'?dir.homeRate:dir.awayRate,other=side==='home'?dir.awayRate:dir.homeRate;
  const edge=(own??50)-(other??50);
  if(odds<=1.25)return `NEÇ oran yorumu: ${chosen} ana yön ama ${odds.toFixed(2)} çok kısa. Son maç kazanma oranı yaklaşık %${own.toFixed(0)} olsa da bu fiyat hata payını karşılamıyor; benim tercihim yönü not edip tekli bahiste PAS.`;
  if(edge>=20&&odds>=1.45)return `NEÇ oran yorumu: ${chosen} son formda rakibinden belirgin biçimde önde (%${own.toFixed(0)} - %${other.toFixed(0)}) ve fiyat ${odds.toFixed(2)}. Bu yüzden bu oranı oynanabilir buluyorum; tenis tarafında ana tercih ile sürpriz tercihi birbirine ters çevirmiyorum.`;
  if(dir.conflict)return `NEÇ oran yorumu: Piyasa ile son form aynı oyuncuyu göstermiyor. Bu yüzden ${chosen} ${odds.toFixed(2)} yönünü ana görüşte tutuyorum ama güveni düşürüyorum; karşı tarafa ayrı “sürpriz seçim” açmıyorum. Bu maçta agresif bahis yerine küçük risk/PAS daha doğru.`;
  if(odds<=1.80)return `NEÇ oran yorumu: ${chosen} hem piyasa hem son form tarafında önde. ${odds.toFixed(2)} fiyatı kabul edilebilir; yine de fark çok büyük değilse bunu yüksek güvenli kupon ayağı değil, kontrollü tercih olarak görüyorum.`;
  return `NEÇ oran yorumu: ${chosen} tarafında form desteği var ve ${odds.toFixed(2)} fiyatı kısa değil. Bu nedenle oran ilgi çekici; ancak tenis varyansı nedeniyle ana görüş dışında ters yönlü ikinci seçim üretmiyorum.`;
}
function analyzeTennis(match,form){
  const data=fairRows(match);if(!data)return null;
  const dir=chooseDirection(match,form,data),row=dir.row,chosen=row.outcome.label,other=data.rows.find(r=>r.outcome.label!==chosen);
  const ok=formOk(form),side=playerSide(chosen,match),own=ok?(side==='home'?dir.homeRate:dir.awayRate):null,opp=ok?(side==='home'?dir.awayRate:dir.homeRate):null;
  const formSentence=ok?`${match.home}: son ${form.home.played} maçta ${form.home.wins} galibiyet (${recentText(form.home)}); ${match.away}: ${form.away.wins} galibiyet (${recentText(form.away)}).`:'Flashscore son maç formu bu istekte güvenle eşleşmedi.';
  const priceSentence=data.rows.map(r=>`${r.outcome.label} ${r.odds.toFixed(2)}`).join(' · ');
  const conflict=dir.conflict?' Piyasa favorisi ile son maç formunun öne çıkardığı oyuncu farklı; bu nedenle güven aşağı çekildi.':'';
  const summary=`${formSentence} Nesine maç kazananı fiyatı: ${priceSentence}.${conflict} NEÇ ana yönü ${chosen}; karşı oyuncuyu sırf oranı daha yüksek diye “Sürpriz” adıyla ikinci kez önermiyorum.`;
  const confidence=Math.round(clamp(ok?(dir.conflict?52:60+Math.max(0,(own||50)-(opp||50))*.25):40,35,74));
  const marketFair=row.fair,model=ok?clamp(marketFair*.68+(own||50)*.32,5,95):marketFair,av=model-marketFair;
  const pick={label:'Ana Tenis Görüşü',tag:'🎾 ANA TENİS YÖNÜ',available:true,market:data.market.name,selection:chosen,odds:row.odds,av:+av.toFixed(1),model:+model.toFixed(1),fair:+marketFair.toFixed(1),confidencePct:confidence,recommended:ok&&!dir.conflict&&row.odds>=1.35,reason:opinion(match,form,dir)};
  const whyNot=other?`Karşı taraf ${other.outcome.label} ${other.odds.toFixed(2)}. ${ok?`Son form kazanma oranları yaklaşık %${dir.homeRate.toFixed(0)} - %${dir.awayRate.toFixed(0)}.`:'Form doğrulanmadığı için'} Bu fiyatı yalnızca “daha yüksek oran” olduğu için sürpriz kartına taşımıyorum.`:'Karşı tarafın doğrulanmış fiyatı bültende yok; ikinci seçim üretmiyorum.';
  return{radar:Math.round(clamp(38+Math.max(0,av)*2+(ok?8:0),1,85)),form,formStatus:ok?'flashscore-tennis':'market-only-tennis',scenario:{title:`Tenis ana görüşü: ${chosen}`,summary,formText:ok?`Son 10 maç kazanma profili: ${match.home} %${dir.homeRate.toFixed(0)} · ${match.away} %${dir.awayRate.toFixed(0)}.`:'Form doğrulanamadı; yalnızca gerçek Nesine maç kazananı fiyatı kullanıldı.',confidence,betOpinion:opinion(match,form,dir),betOpinionTitle:'🎾 NEÇ TENİS ORAN YORUMU',specialComment:'Teniste yalnızca aynı hikâyeyi destekleyen farklı bir market varsa ek seçim üretilir. Bu maçta ters yönlü ikinci bahis yok.',specialOdds:null},picks:[pick],ideas:[],insights:[{title:'⚖️ Neden iki tarafa da oynamıyorum?',text:whyNot},{title:'🧭 Tenis kuralı',text:'Ana görüş oyuncu yönüdür. Temkinli/Sürpriz/Çok Sürpriz kartları ancak set, handikap veya oyun marketi aynı hikâyeyi destekliyorsa oluşur; tek Maç Kazananı marketinden iki zıt öneri üretilmez.'}],research:{engine:form?.source||'Nesine maç kazananı piyasası',sources:form?.flashscoreUrl?[{url:form.flashscoreUrl,title:'Flashscore tenis maç merkezi'}]:[]},analyzedAt:new Date().toISOString(),disclaimer:'NEÇ tenis yorumu olasılık ve fiyat değerlendirmesidir; sonuç garantisi değildir.'};
}
module.exports={analyzeTennis};
