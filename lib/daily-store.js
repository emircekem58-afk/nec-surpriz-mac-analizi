let fallback=new Map();
async function runtime(){try{const mod=await import('@vercel/functions');return mod.getCache({namespace:'nec-daily'})}catch(e){console.warn('[runtime-cache-unavailable]',e?.message||e);return null}}
async function get(key){const c=await runtime();if(c){try{return await c.get(key)}catch(e){console.warn('[cache-get]',key,e?.message||e)}}const x=fallback.get(key);return x&&x.exp>Date.now()?x.value:null}
async function set(key,value,ttl=8*24*3600){const c=await runtime();if(c){try{await c.set(key,value,{ttl,tags:['nec-daily'],name:'NEC daily snapshot'});return value}catch(e){console.warn('[cache-set]',key,e?.message||e)}}fallback.set(key,{value,exp:Date.now()+ttl*1000});return value}
async function del(key){const c=await runtime();if(c){try{await c.delete(key)}catch(e){console.warn('[cache-del]',key,e?.message||e)}}fallback.delete(key)}
module.exports={get,set,del};
