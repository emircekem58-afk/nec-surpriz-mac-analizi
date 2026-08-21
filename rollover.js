(()=>{
 let trackedDay=trDate();
 async function syncDay(){
  const now=trDate();
  if(now===trackedDay)return;
  const wasFollowingToday=selectedDate===trackedDay;
  trackedDay=now;
  if(wasFollowingToday){selectedDate=now;cache.clear()}
  $('#date').value=selectedDate;
  $('#today').classList.toggle('active',selectedDate===now);
  $('#tomorrow').classList.toggle('active',selectedDate===trDate(1));
  await Promise.allSettled([load(),coupons()]);
 }
 setInterval(syncDay,30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncDay()});
 window.addEventListener('focus',syncDay);
})();
