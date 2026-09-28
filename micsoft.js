/* Microsoft Rewards for Egern — personal migration of ScriptCat #5979 v3.6.90.
 * Source author: zxwbn@foxmail.com / zxwbn01; source has no declared license.
 * See README.md for source provenance, configuration and verification limits.
 * Generic queries/renders; schedule runs bounded tasks; request captures opt-in cookies.
 */
const MR_WEB='https://rewards.bing.com', MR_BING='https://www.bing.com';
const MR_APP='https://prod.rewardsplatform.microsoft.com';
const MR_SCOPE='service::prod.rewardsplatform.microsoft.com::MBI_SSL';
const MR_PC='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.2420.81';
const MR_MOBILE='Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36 EdgA/123.0.2420.102';

export default async function(ctx){
  const e={...ctx.env},account=String(e.ACCOUNT_ID||'default').trim(),prefix='msrewards:v1:'+account+':';
  const r={ctx,e,prefix,deadline:Date.now()+160000};
  // Request/response contexts must never fall through into queries or earning tasks.
  if(ctx.request){if(!ctx.response)mrCapture(r);return;}
  const scheduled=typeof ctx.cron==='string'&&ctx.cron.length>0;
  let lockId=null;
  try{
    for(const [key,kind,host] of [['REWARDS_COOKIE','rewards','rewards.bing.com'],['BING_COOKIE','bing','www.bing.com']]){
      if(String(e[key]||'').trim())continue;
      const saved=mrLoad(r,'cookie:'+kind);
      e[key]=saved?.host===host&&mrValidCookie(saved.value)?saved.value:'';
    }
    if(scheduled){
      const lock=mrLoad(r,'lock');if(lock?.until>Date.now())return;
      lockId=mrId();mrSave(r,'lock',{id:lockId,until:Date.now()+200000});
      if(mrLoad(r,'lock')?.id!==lockId)return;
    }
    const day=mrDay(e.TIMEZONE||'Asia/Shanghai');
    let state=mrLoad(r,'state');if(!state||state.day!==day)state={day,actions:{},notes:{},searchIndex:0,searchMisses:0};
    let snapshot;
    try{snapshot=await mrSnapshot(r);mrSave(r,'snapshot',snapshot);}
    catch(err){
      const old=mrLoad(r,'snapshot');
      if(!scheduled&&!err.auth&&old&&Date.now()-old.at<86400000)return mrWidget(ctx,old,state,'离线缓存');
      throw err;
    }
    if(!scheduled)return mrWidget(ctx,snapshot,state,'服务端数据');
    if(!['SIGN','READ','PROMOS','SEARCH'].some(k=>mrEnabled(e,'TASK_'+k)))return;
    if(mrEnabled(e,'LOCK_CN')){
      const html=await mrRequest(r,'GET',MR_BING+'/','bing');
      const country=html.match(/RevIpCC\s*:\s*"([A-Za-z]{2})"/)?.[1]?.toUpperCase();
      if(country!=='CN')throw Error(country?'地区锁定：当前为 '+country:'无法确认地区，本轮任务未执行');
    }
    // Always save before any action; a broken/full ledger fails closed.
    mrSave(r,'state',state);
    for(const [flag,task] of [['SIGN',mrSign],['READ',mrRead],['PROMOS',mrPromos],['SEARCH',mrSearch]]){
      if(!mrEnabled(e,'TASK_'+flag)){state.notes[flag]='已关闭';continue;}
      if(Date.now()>r.deadline-20000){state.notes[flag]='本轮时间不足，下轮继续';continue;}
      try{await task(r,state,snapshot);}catch(err){state.notes[flag]=mrMessage(err);}
      mrSave(r,'state',state);
    }
    // Never infer points from submitted task count.
    try{snapshot=await mrSnapshot(r);mrSave(r,'snapshot',snapshot);for(const p of [...snapshot.promos,...snapshot.earnTasks]){const action=state.actions['promo:'+p.id];if(action&&p.complete){action.status='活动已确认';state.notes.PROMOS='活动已确认（服务端）';}}}catch{state.notes.QUERY='任务后查询失败，保留上次数据';}
    state.lastRun=Date.now();mrSave(r,'state',state);
    if(mrEnabled(e,'NOTIFY',false)&&ctx.notify)ctx.notify({title:'Microsoft Rewards',body:'余额 '+mrNumber(snapshot.balance)+'；'+Object.values(state.notes).join(' · ')});
  }catch(err){
    const message=mrMessage(err);
    if(scheduled){try{mrSave(r,'lastError',{message,at:Date.now()});}catch{}if(mrEnabled(e,'NOTIFY',false)&&ctx.notify)ctx.notify({title:'Microsoft Rewards 需要处理',body:message});return;}
    return mrError(ctx,message);
  }finally{
    if(scheduled&&lockId){try{if(mrLoad(r,'lock')?.id===lockId)mrSave(r,'lock',{until:0});}catch{}}
  }
}
function mrValidCookie(value){
  return typeof value==='string'&&value.length<=32768&&!/[\r\n\x00]/.test(value)&&value.split(';').some(part=>/^\s*(?:_U|MSPAuth|RPSSecAuth)\s*=\s*\S+/.test(part));
}
function mrCapture(r){
  const {ctx}=r;
  const notice=body=>{try{ctx.notify?.({title:'Microsoft Rewards · Cookie',body,sound:false});}catch{}};
  try{
    const req=ctx.request,url=new URL(req.url);
    if(req.method!=='GET'||url.protocol!=='https:'||url.port||url.username||url.password||url.searchParams.get('egern_capture')!=='1')return;
    const kind=url.hostname==='rewards.bing.com'&&['/','/earn'].includes(url.pathname)?'rewards':url.hostname==='www.bing.com'&&url.pathname==='/'?'bing':null;
    if(!kind)return;
    const label=kind==='rewards'?'Rewards':'Bing';
    const cookie=ctx.request.headers.get('cookie');
    if(!mrValidCookie(cookie)){notice(label+' 未保存：未识别到有效格式的登录 Cookie。先登录，再重新打开获取链接。');return;}
    const previous=mrLoad(r,'cookie:'+kind);
    // Discard a prior balance before changing credentials, but preserve task receipts.
    if(kind==='rewards'&&previous?.value!==cookie)ctx.storage.set(r.prefix+'snapshot','');
    mrSave(r,'cookie:'+kind,{host:url.hostname,value:cookie,at:Date.now()});
    notice(label+' Cookie 已保存到本机；请刷新小组件验证登录状态。Env 手填值优先。');
  }catch{notice('Cookie 保存失败，请检查 Egern 本地存储和脚本配置；原网页继续加载。');}
}
function mrEnabled(e,key,fallback=true){const v=e[key];return v===undefined||v===''?fallback:!['false','0','off','no'].includes(String(v).toLowerCase());}
function mrLoad(r,key){const raw=r.ctx.storage.get(r.prefix+key);if(!raw)return null;try{return JSON.parse(raw);}catch{throw Error('本地状态损坏，请更换 ACCOUNT_ID 后重新配置');}}
function mrSave(r,key,value){r.ctx.storage.set(r.prefix+key,JSON.stringify(value));}
function mrDay(tz){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function mrId(){if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16);});}
function mrMessage(e){return e?.safe||e?.message==='本地状态损坏，请更换 ACCOUNT_ID 后重新配置'?String(e.safe||e.message):/^(缺少|请|本地|地区|无法|服务端|授权|登录|数据|网页|积分|本轮)/.test(e?.message||'')?e.message:'请求失败或存储不可用，请检查网络及 Egern 日志';}
function mrFault(message,auth=false){const e=Error(message);e.safe=message;e.auth=auth;return e;}
function mrForm(obj){return Object.entries(obj).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');}
async function mrRequest(r,method,url,kind,body,headers={}){
  const host=new URL(url).hostname;
  if(!['rewards.bing.com','www.bing.com','prod.rewardsplatform.microsoft.com','login.live.com'].includes(host))throw mrFault('请求域名不在迁移脚本允许列表中');
  if(Date.now()>r.deadline-2000)throw mrFault('本轮执行时间已用尽');
  const h={'User-Agent':kind==='app'?MR_MOBILE:MR_PC,...headers};
  if(kind==='web'||kind==='bing'){
    const cookie=kind==='web'?r.e.REWARDS_COOKIE:r.e.BING_COOKIE;
    if(!cookie)throw mrFault('缺少 '+(kind==='web'?'REWARDS_COOKIE':'BING_COOKIE')+'，请打开配套 Cookie 获取链接或在 Env 填写',true);
    h.Cookie=headers.Cookie||cookie;
  }
  // Explicit cookie routing. Never let redirects forward credentials off-domain.
  const options={headers:h,timeout:Math.min(8000,r.deadline-Date.now()),credentials:'omit',redirect:'manual',...(body!==undefined?{body}:{}),...(r.e.POLICY?{policy:r.e.POLICY}:{})};
  const resp=await r.ctx.http[method.toLowerCase()](url,options);
  if(resp.status===401||resp.status===403)throw mrFault('登录或授权已过期（HTTP '+resp.status+'），请更新对应凭据',true);
  if(resp.status>=300&&resp.status<400)throw mrFault('登录跳转：请更新 Cookie 后重试',true);
  if(resp.status<200||resp.status>=300)throw mrFault('数据源 HTTP '+resp.status);
  return await resp.text();
}
function mrJson(text){try{return JSON.parse(text);}catch{throw mrFault('数据源没有返回有效 JSON，可能需要重新登录',true);}}
function mrNumeric(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;}
function mrCounter(list){if(!Array.isArray(list)||!list.length)return {current:null,max:null};let current=0,max=0;for(const x of list){const c=mrNumeric(x.pointProgress),m=mrNumeric(x.pointProgressMax??x.pointMax);current=current===null||c===null?null:current+c;max=max===null||m===null?null:max+m;}return {current,max};}
function mrEmbedded(html,key){
  const needle='"'+key+'"',at=html.indexOf(needle);if(at<0)return null;
  const colon=html.indexOf(':',at+needle.length);if(colon<0)return null;let start=colon+1;while(/\s/.test(html[start]||''))start++;
  if(!['{','['].includes(html[start]))return null;
  let depth=0,string=false,escape=false;
  for(let i=start;i<html.length;i++){const c=html[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;continue;}if(c==='"')string=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0){try{return JSON.parse(html.slice(start,i+1));}catch{return null;}}}}
  return null;
}
function mrEarn(html){
  const clean=String(html).replace(/\\"/g,'"'),p=mrEmbedded(clean,'pointsCounters'),balance=clean.match(/"(?:balance|availablePoints)"\s*:\s*(\d+)/);
  if(!p||!balance)return null;
  return {balance:Number(balance[1]),pc:{current:mrNumeric(p.pc?.progress),max:mrNumeric(p.pc?.max)},mobile:{current:mrNumeric(p.mobile?.progress),max:mrNumeric(p.mobile?.max)},today:mrNumeric(p.totalPoints??p.dailyOffer)};
}
async function mrSnapshot(r){
  let html='',earn=null,api=null,webError;
  try{html=await mrRequest(r,'GET',MR_WEB+'/earn','web');earn=mrEarn(html);}catch(e){webError=e;}
  try{const j=mrJson(await mrRequest(r,'GET',MR_WEB+'/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest','web',undefined,{'X-Requested-With':'XMLHttpRequest',Referer:MR_WEB+'/'}));api=j.dashboard||j;if(!api.userStatus)api=null;}catch(e){webError=e;}
  if(!earn&&!api)throw webError||mrFault('登录状态无效，未取得积分数据',true);
  const u=api?.userStatus||{},c=u.counters||{},day=mrDay(r.e.TIMEZONE||'Asia/Shanghai'),d=day.split('-');
  const dailyKey=d.length===3?d[1]+'/'+d[2]+'/'+d[0]:'';
  const promos=[...(api?.dailySetPromotions?.[dailyKey]||[]),...(api?.morePromotions||[])].filter(p=>p.priority>-2&&p.exclusiveLockedFeatureStatus!=='locked');
  const out={balance:mrNumeric(u.availablePoints),pc:mrCounter(c.pcSearch),mobile:mrCounter(c.mobileSearch),today:mrCounter(c.dailyPoint).current,...earn,level:u.levelInfo?.activeLevel||'',promos:promos.map(p=>({id:p.offerId,hash:p.hash,title:p.title||p.offerId,complete:!!p.complete})),at:Date.now(),day};
  out.earnTasks=mrEarnTasks(html);return out;
}
function mrEarnTasks(html){
  const clean=String(html).replace(/\\"/g,'"'),cards=mrEmbedded(clean,'activityCards'),result=[],seen=new Set();
  const walk=x=>{if(!x||typeof x!=='object')return;if(x.offerId&&x.hash&&typeof x.isCompleted==='boolean'&&!seen.has(x.offerId)){seen.add(x.offerId);result.push({id:x.offerId,hash:x.hash,complete:x.isCompleted,title:x.title||x.offerId});}for(const v of Object.values(x))if(v&&typeof v==='object')Array.isArray(v)?v.forEach(walk):walk(v);};
  walk(cards);return result;
}
async function mrToken(r){
  const revision=String(r.e.AUTH_REVISION||'1'),saved=mrLoad(r,'oauth'),old=String(saved?.revision||'1')===revision?saved:null;
  if(old?.access&&old.expires>Date.now()+60000)return old.access;
  const refresh=old?.refresh||r.e.REFRESH_TOKEN;
  let payload={client_id:'0000000040170455'};
  if(refresh)payload={...payload,refresh_token:refresh,scope:MR_SCOPE,grant_type:'refresh_token'};
  else{
    let code=String(r.e.AUTH_CODE||'').trim();if(code.includes('://')){try{code=new URL(code).searchParams.get('code')||'';}catch{code='';}}
    if(!code)throw mrFault('缺少 AUTH_CODE 或 REFRESH_TOKEN；签入和阅读需要 OAuth 授权');
    payload={...payload,code,redirect_uri:'https://login.live.com/oauth20_desktop.srf',grant_type:'authorization_code'};
  }
  const raw=await mrRequest(r,'POST','https://login.live.com/oauth20_token.srf','oauth',mrForm(payload),{'Content-Type':'application/x-www-form-urlencoded'}),j=mrJson(raw);
  if(!j.access_token)throw mrFault('授权更新失败，请重新获取 AUTH_CODE',true);
  mrSave(r,'oauth',{access:j.access_token,refresh:j.refresh_token||refresh,revision,expires:Date.now()+Math.max(60,Number(j.expires_in)||3600)*1000});return j.access_token;
}
async function mrApp(r,method,path,body){
  const access=await mrToken(r),country=String(r.e.COUNTRY||'cn').toLowerCase();
  return mrJson(await mrRequest(r,method,MR_APP+path,'app',body===undefined?undefined:JSON.stringify(body),{'Content-Type':'application/json; charset=UTF-8',Authorization:'Bearer '+access,'x-rewards-appid':'SAAndroid/31.4.2110003555','x-rewards-ismobile':'true','x-rewards-country':country,'x-rewards-partnerid':'startapp','x-rewards-flights':'rwgobig'}));
}
function mrPrepare(r,state,key){
  if(state.actions[key])return false;
  state.actions[key]={status:'待确认',id:mrId(),at:Date.now()};mrSave(r,'state',state);return true;
}
async function mrSign(r,s){
  if(s.actions.sign){s.notes.SIGN=s.actions.sign.status;return;}
  await mrToken(r); // Do not create a pending action when authorization itself is missing.
  if(!mrPrepare(r,s,'sign'))return;
  const j=await mrApp(r,'POST','/dapi/me/activities',{amount:1,attributes:{},id:s.actions.sign.id,type:103,country:r.e.COUNTRY||'cn',risk_context:{},channel:'SAAndroid'});
  const points=mrNumeric(j.response?.activity?.p);
  s.actions.sign.status=points===null?'签到待确认':'签到已确认';s.actions.sign.points=points;s.notes.SIGN=s.actions.sign.status;
}
async function mrRead(r,s){
  const j=await mrApp(r,'GET','/dapi/me?channel=SAAndroid&options=613');const p=j.response?.promotions?.find(x=>x.attributes?.offerid==='ENUS_readarticle3_30points');
  const current=mrNumeric(p?.attributes?.progress),max=mrNumeric(p?.attributes?.max);
  if(current===null||max===null){s.notes.READ='阅读额度未知，未提交';return;}
  s.read={current,max};if(current>=max){s.notes.READ='阅读已完成 '+current+'/'+max;return;}
  const key='read:'+current;if(!mrPrepare(r,s,key)){s.notes.READ='阅读 '+current+'/'+max+'，上次提交待确认';return;}
  await mrApp(r,'POST','/dapi/me/activities',{amount:1,country:r.e.COUNTRY||'cn',id:s.actions[key].id,type:101,attributes:{offerid:'ENUS_readarticle3_30points'}});
  s.notes.READ='阅读已提交，等待服务端进度更新';
  const after=await mrApp(r,'GET','/dapi/me?channel=SAAndroid&options=613');const task=after.response?.promotions?.find(x=>x.attributes?.offerid==='ENUS_readarticle3_30points');const next=mrNumeric(task?.attributes?.progress);
  if(next!==null){s.read={current:next,max};if(next>current){s.actions[key].status='服务端已确认';s.notes.READ='阅读 '+next+'/'+max;}}
}
async function mrPromos(r,s,snap){
  const tasks=[...snap.earnTasks.map(p=>({...p,kind:'earn'})),...snap.promos.map(p=>({...p,kind:'dash'}))];
  const item=tasks.find(p=>!p.complete&&p.id&&p.hash&&!s.actions['promo:'+p.id]);
  if(!item){s.notes.PROMOS=tasks.some(p=>!p.complete)?'活动提交待确认':'没有可执行活动';return;}
  let csrf=null,action=null;
  if(item.kind==='dash'){
    const html=await mrRequest(r,'GET',MR_WEB+'/','web');csrf=html.match(/RequestVerificationToken[^>]*value="([^"]+)"/)?.[1]||html.match(/"verificationToken"\s*:\s*"([^"]+)"/)?.[1];
    if(!csrf)throw mrFault('网页活动缺少验证令牌，未提交');
  }else{action=String(r.e.EARN_ACTION_ID||'70babbc81d2724f60d29a95c03b3d739cba77cea92');if(!/^(?:[a-f0-9]{40}|[a-f0-9]{42})$/i.test(action))throw mrFault('网页 EARN_ACTION_ID 格式错误');}
  const key='promo:'+item.id;if(!mrPrepare(r,s,key))return;
  if(item.kind==='earn'){
    await mrRequest(r,'POST',MR_WEB+'/earn','web',JSON.stringify([item.hash,11,{offerid:item.id,isPromotional:'$undefined',timezoneOffset:String(r.e.TIMEZONE_OFFSET||'-480')}]),{'Content-Type':'text/plain;charset=UTF-8','next-action':action,Referer:MR_WEB+'/earn'});
  }else{
    await mrRequest(r,'POST',MR_WEB+'/api/reportactivity?X-Requested-With=XMLHttpRequest','web',mrForm({id:item.id,hash:item.hash,activityAmount:1,__RequestVerificationToken:csrf}),{'Content-Type':'application/x-www-form-urlencoded',Referer:MR_WEB+'/'});
    // Retain the original browser-reporting channel; no local points are awarded.
    if(r.e.BING_COOKIE)await mrRequest(r,'POST',MR_BING+'/msrewards/api/v1/ReportActivity?ajaxreq=1','bing',JSON.stringify({ActivitySubType:'quiz',ActivityType:'notification',OfferId:item.id,Channel:'Bing.Com',PartnerId:'BingTrivia',Timezone:Number(r.e.TIMEZONE_OFFSET||-480)}),{'Content-Type':'application/json'});
  }
  s.notes.PROMOS='活动已提交，等待服务端确认';
}
async function mrSearch(r,s,snap){
  const quota=k=>snap[k]?.current!==null&&snap[k]?.max!==null&&snap[k]?.current<snap[k]?.max;
  const total=(snap.pc.current||0)+(snap.mobile.current||0);
  if(s.lastSearch!==undefined){if(total<=s.lastSearch)s.searchMisses++;else s.searchMisses=0;s.lastSearch=undefined;}
  if(s.searchMisses>=2){s.notes.SEARCH='搜索进度连续未增长，今日停止';return;}
  if(!quota('pc')&&!quota('mobile')){s.notes.SEARCH=snap.pc.max===null||snap.mobile.max===null?'搜索额度未知，未提交':'搜索额度已完成';return;}
  const mobile=quota('mobile')&&(!quota('pc')||s.searchIndex%2===1),counter=mobile?snap.mobile:snap.pc;
  const key='search:'+s.searchIndex;if(!mrPrepare(r,s,key))return;
  const custom=String(r.e.SEARCH_TERMS||'').split('|').map(x=>x.trim()).filter(Boolean);
  const words=custom.length?custom:['今日科技新闻','天文观测','城市天气','自然摄影','开源软件','历史博物馆','世界地理','森林生态','咖啡制作','阅读推荐','太空探索','旅行路线'];
  const term=words[s.searchIndex%words.length]+' '+s.day+' '+(s.searchIndex+1),query=MR_BING+'/search?'+mrForm({q:term,form:'QBLH',...(mrEnabled(r.e,'LOCK_CN')?{mkt:'zh-CN'}:{})});
  const ua=mobile?MR_MOBILE:MR_PC;
  const cookie=String(r.e.BING_COOKIE||'').split(';').map(x=>x.trim()).filter(x=>x&&!/^(_EDGE_S|_RwBf|_Rwho)=/.test(x)).join('; ')+'; _Rwho=u='+(mobile?'m':'d')+'&ts='+s.day;
  const searchHeaders={'User-Agent':ua,Cookie:cookie};
  const html=await mrRequest(r,'GET',query,'bing',undefined,{...searchHeaders,Referer:MR_BING+'/'});
  const ig=html.match(/\bIG\s*:\s*"([A-Fa-f0-9]+)"/)?.[1];
  if(ig){
    const base='?IG='+encodeURIComponent(ig)+'&IID=SERP.5047&ajaxreq=1';
    await mrRequest(r,'POST',MR_BING+'/rewardsapp/ncheader'+base,'bing','wb=1%3bi%3d1%3bv%3d1',{...searchHeaders,Referer:query,'Content-Type':'application/x-www-form-urlencoded'});
    await mrRequest(r,'POST',MR_BING+'/rewardsapp/reportActivity'+base,'bing',mrForm({url:query,V:'web'}),{...searchHeaders,Referer:query,'Content-Type':'application/x-www-form-urlencoded'});
    const click=html.match(/class="b_algo[\s\S]*?href="([^"]+)"\s+h="ID=([^";]+)[^"]*"/);
    if(click)await mrRequest(r,'GET',MR_BING+'/fd/ls/GLinkPingPost.aspx?'+mrForm({IG:ig,ID:click[2],url:click[1]}),'bing',undefined,{...searchHeaders,Referer:query});
  }
  s.searchIndex++;s.lastSearch=total;s.notes.SEARCH=(mobile?'手机':'电脑')+'搜索已提交 '+counter.current+'/'+counter.max+'，以查询结果为准';
}
function mrNumber(v){return v===null||v===undefined?'—':Number(v).toLocaleString('en-US');}
function mrTxt(text,size=12,color='#F5F7FC',extra={}){return {type:'text',text:String(text),font:{size,weight:'medium'},textColor:color,maxLines:1,minScale:0.65,...extra};}
function mrRow(children,extra={}){return {type:'stack',direction:'row',alignItems:'center',gap:7,children,...extra};}
function mrCol(children,extra={}){return {type:'stack',direction:'column',alignItems:'start',gap:4,children,...extra};}
function mrBar(name,c,color,width=130){const ratio=c.max>0&&c.current!==null?Math.min(1,Math.max(0,c.current/c.max)):0;return mrCol([mrRow([mrTxt(name,10,'#ADBBD0'),{type:'spacer'},mrTxt(mrNumber(c.current)+' / '+mrNumber(c.max),11)]),mrRow([...(ratio>0?[{type:'stack',height:5,flex:ratio,backgroundColor:color,borderRadius:3,children:[]}]:[]),...(ratio<1?[{type:'stack',height:5,flex:1-ratio,backgroundColor:'#FFFFFF16',borderRadius:3,children:[]}]:[])],{gap:0,width})]);}
function mrWidget(ctx,snap,state,status){
  const family=ctx.widgetFamily||'systemMedium',small=family==='systemSmall',large=family==='systemLarge'||family==='systemExtraLarge';
  const notes=state.notes||{},error=(()=>{try{return JSON.parse(ctx.storage.get('msrewards:v1:'+(ctx.env?.ACCOUNT_ID||'default')+':lastError')||'null');}catch{return null;}})();
  if(family.startsWith('accessory'))return {type:'widget',url:MR_WEB+'/',children:[{type:'text',text:family==='accessoryInline'?'Rewards '+mrNumber(snap.balance)+' · '+status:mrNumber(snap.balance),font:{size:family==='accessoryCircular'?16:20,weight:'bold'},minScale:0.5,maxLines:1},...(family==='accessoryInline'?[]:[{type:'text',text:status,font:{size:9},maxLines:1}])]};
  const oldDay=snap.day!==mrDay(ctx.env?.TIMEZONE||'Asia/Shanghai');
  const balance=mrCol([mrTxt('可用积分',10,'#ADBBD0'),mrTxt(mrNumber(snap.balance),small?30:36,'#FFFFFF',{font:{size:small?30:36,weight:'bold'}}),mrTxt((oldDay?'上次记录':'今日')+' +'+mrNumber(snap.today),10,'#8AE0BB')],{flex:1});
  const progress=mrCol([mrBar('电脑搜索',snap.pc,'#72B7FF',large?280:130),mrBar('手机搜索',snap.mobile,'#8AE0BB',large?280:130)],{flex:1,gap:10});
  const children=[mrRow([mrTxt(small?'REWARDS':'MICROSOFT / REWARDS',9,'#8FC5FF'),{type:'spacer'},mrTxt(oldDay?'跨日缓存':status,8,'#ADBBD0')]),{type:'spacer'}];
  if(small)children.push(balance,mrTxt('电脑 '+mrNumber(snap.pc.current)+' / '+mrNumber(snap.pc.max),10,'#ADBBD0'),mrTxt('手机 '+mrNumber(snap.mobile.current)+' / '+mrNumber(snap.mobile.max),10,'#ADBBD0'));
  else if(large)children.push(balance,progress);
  else children.push(mrRow([balance,progress],{gap:18}));
  children.push({type:'spacer'});
  if(large){children.push(mrRow([mrTxt('任务状态',12,'#8AE0BB'),{type:'spacer'},mrTxt(snap.level,10,'#ADBBD0')]));for(const [key,label] of [['SIGN','签入'],['READ','阅读'],['PROMOS','活动'],['SEARCH','搜索']])children.push(mrRow([mrTxt(label,11,'#ADBBD0'),mrTxt(notes[key]||'尚未执行',11,'#F5F7FC',{flex:1,maxLines:1})]));if(error&&error.at>(state.lastRun||0))children.push(mrTxt(error.message,10,'#FFC78A',{maxLines:2}));}
  children.push(mrRow([mrTxt('查询',8,'#ADBBD0'),{type:'date',date:new Date(snap.at).toISOString(),format:'relative',font:{size:8},textColor:'#ADBBD0'},{type:'spacer'},mrTxt('点按打开 Rewards',8,'#ADBBD0')]));
  return {type:'widget',url:MR_WEB+'/',padding:small?12:14,gap:small?5:7,backgroundGradient:{type:'linear',colors:['#101F39','#1A3353'],startPoint:{x:0,y:0},endPoint:{x:1,y:1}},refreshAfter:new Date(Date.now()+1800000).toISOString(),children};
}
function mrError(ctx,message){return {type:'widget',url:MR_WEB+'/',padding:ctx.widgetFamily?.startsWith('accessory')?0:14,gap:8,children:[mrTxt('Microsoft Rewards',14,'#74AFFF'),mrTxt(message,11,undefined,{maxLines:4})],refreshAfter:new Date(Date.now()+1800000).toISOString()};}

