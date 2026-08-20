const store=require('../lib/daily-store');
const {generateDailyCoupons,dateTR}=require('../lib/coupon-engine');
function hourTR(){return Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Istanbul',hour:'2-digit',hourCycle:'h23'}).format(new Date()))}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});res.setHeader('Cache-Control','no-store, max-age=0');
 try{const today=dateTR(),date=String(req.query?.date||today),key=`coupons:${date}:v1`,force=String(req.query?.refresh||'')==='1';let snap=!force?await store.get(key):null;if(!snap){if(date===today&&hourTR()<9)return res.status(200).json({available:false,date,message:'Bugünün NEÇ kuponları İstanbul saatiyle 09:00 sonrası hazırlanır.'});snap=await generateDailyCoupons(date);await store.set(key,snap,9*24*3600)}return res.status(200).json({available:true,...snap})}catch(e){console.error('[coupons]',e);return res.status(200).json({available:false,error:e.message||'Kuponlar hazırlanamadı'})}
};
