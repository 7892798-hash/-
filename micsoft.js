/* Microsoft Rewards for Egern — personal migration of ScriptCat #5979 v3.6.90.
 * Source author: zxwbn@foxmail.com / zxwbn01; source has no declared license.
 * See README.md for source provenance, configuration and verification limits.
 * Generic queries/renders; schedule runs bounded tasks; request captures opt-in cookies.
 * Cookie capture revision: 2026-09-28.3 (tap notification to copy the full Cookie).
 * Widget revision: 2026-09-29.11 (Moonwhite; noon/evening refresh windows).
 * Worker revision: 2026-09-29.11 (confirmed completion stops networking until the next day).
 * Auth capture revision: 2026-09-28.1 (opt-in callback, tap notification to copy AUTH_CODE).
 */
const MR_WEB='https://rewards.bing.com', MR_BING='https://www.bing.com';
const MR_APP='https://prod.rewardsplatform.microsoft.com';
const MR_SCOPE='service::prod.rewardsplatform.microsoft.com::MBI_SSL';
// Public reportActivity reference observed in the user's live page; Env can override after later deployments.
const MR_EARN_ACTION='707e6eb15bdfdd5fba193f0a77e934f7018faf87ce';
const MR_EARN_ROUTER=['',{children:['(nav)',{children:['earn',{children:['__PAGE__',{},null,null,4096]},null,null,4096]},null,null,4096]},null,null,4112];
const MR_PC='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.2420.81';
const MR_MOBILE='Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36 EdgA/123.0.2420.102';

export default async function(ctx){
  const e={...ctx.env},account=String(e.ACCOUNT_ID||'default').trim(),prefix='msrewards:v1:'+account+':';
  const r={ctx,e,prefix,deadline:Date.now()+160000};
  // Request/response contexts must never fall through into queries or earning tasks.
  if(ctx.request){if(!ctx.response){mrCaptureAuth(ctx);mrCapture(r);}return;}
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
    if(scheduled&&!['SIGN','READ','PROMOS','SEARCH'].some(k=>mrEnabled(e,'TASK_'+k)))return;
    if(scheduled&&(!mrEnabled(e,'POWER_SAVE')||mrEnabled(e,'FORCE_REFRESH',false)))mrSave(r,'workerDone',null);
    if(mrEnabled(e,'POWER_SAVE')&&!mrEnabled(e,'FORCE_REFRESH',false)){
      const saved=mrLoad(r,'snapshot');
      if(scheduled){
        const done=mrLoad(r,'workerDone'),settings=mrTaskFlags(e);
        if(done?.day===day&&done.settings===settings)return;
        if(mrRecentSnapshot(saved,day,Infinity)&&mrSettled(r,state,saved)){mrSave(r,'workerDone',{day,settings,at:Date.now()});return;}
      }else{
        const slot=mrWidgetWindow(e),poll=mrLoad(r,'widgetPoll'),cached=mrStoredSnapshot(saved);
        const attempted=slot.key&&poll?.slot===slot.key;
        if(attempted&&poll.error&&(!cached||poll.auth))return mrError(ctx,poll.error+'；可运行手动刷新');
        if(cached&&(!slot.key||attempted||saved.at>=slot.at))return mrWidget(ctx,saved,state,attempted&&poll.error?'离线缓存':'缓存');
        if(!slot.key||attempted)return mrError(ctx,'尚无积分缓存，请运行手动刷新脚本');
        // Record before querying, so repeated widget reloads cannot retry a failed slot indefinitely.
        r.widgetSlot=slot.key;mrSave(r,'widgetPoll',{slot:slot.key,at:Date.now()});
      }
    }
    let snapshot;
    try{snapshot=await mrSnapshot(r);mrSave(r,'snapshot',snapshot);}
    catch(err){
      if(r.widgetSlot)mrSave(r,'widgetPoll',{slot:r.widgetSlot,at:Date.now(),error:mrMessage(err),auth:!!err.auth});
      const old=mrLoad(r,'snapshot');
      if(!scheduled&&!err.auth&&old&&Date.now()-old.at<86400000)return mrWidget(ctx,old,state,'离线缓存');
      throw err;
    }
    if(!scheduled){
      if(mrEnabled(e,'FORCE_REFRESH',false))mrSave(r,'widgetPoll',null);
      // Worker may have finished while the two remote queries were in flight.
      const latest=mrLoad(r,'state');
      if(latest?.day===day)state=latest;
      return mrWidget(ctx,snapshot,state,'服务端数据');
    }
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
    try{snapshot=await mrSnapshot(r);mrSave(r,'snapshot',snapshot);delete state.notes.QUERY;for(const p of [...snapshot.promos,...snapshot.earnTasks]){const action=state.actions['promo:'+p.id];if(action&&p.complete){action.status='活动已确认';state.notes.PROMOS='活动已确认（服务端）';}}}catch{state.notes.QUERY='任务后查询失败，保留上次数据';}
    state.lastRun=Date.now();mrSave(r,'state',state);
    if(mrLoad(r,'lastError'))mrSave(r,'lastError',null);
    if(mrEnabled(e,'POWER_SAVE')&&mrSettled(r,state,snapshot))mrSave(r,'workerDone',{day,settings:mrTaskFlags(e),at:Date.now()});
    if(mrEnabled(e,'NOTIFY',false)&&ctx.notify)ctx.notify({title:'Microsoft Rewards · Worker v11',body:'账户 '+account+'；余额 '+mrNumber(snapshot.balance)+'；'+Object.values(state.notes).join(' · ')});
  }catch(err){
    const message=mrMessage(err);
    if(scheduled){try{mrSave(r,'lastError',{message,at:Date.now()});}catch{}if(mrEnabled(e,'NOTIFY',false)&&ctx.notify)ctx.notify({title:'Microsoft Rewards 需要处理 · Worker v11',body:'账户 '+account+'；'+message});return;}
    return mrError(ctx,message);
  }finally{
    if(scheduled&&lockId){try{if(mrLoad(r,'lock')?.id===lockId)mrSave(r,'lock',{until:0});}catch{}}
  }
}
function mrCaptureAuth(ctx){
  const notice=(body,code)=>{try{ctx.notify?.({title:'Microsoft Rewards · Auth v1',body,sound:false,...(code?{action:{type:'clipboard',text:code}}:{})});}catch{}};
  try{
    const req=ctx.request,url=new URL(req.url);
    if(req.method!=='GET'||url.protocol!=='https:'||url.hostname!=='login.live.com'||url.port||url.username||url.password||url.pathname!=='/oauth20_desktop.srf')return;
    // This marker scopes capture; it is not a CSRF verifier. No token exchange or session changes here.
    const states=url.searchParams.getAll('state');
    if(states.length!==1||states[0]!=='egern_rewards_auth_v1')return;
    if(url.searchParams.has('error')){notice('微软授权未完成或已取消，请重新打开配套授权链接登录。');return;}
    const codes=url.searchParams.getAll('code'),code=codes[0];
    if(codes.length!==1||!code||code.length>8192||/[^\x21-\x7E]/.test(code)){notice('未取得有效格式的 AUTH_CODE，请重新打开配套授权链接。');return;}
    // Leave the code unconsumed and out of storage/logs. The user chooses the worker/account.
    notice('AUTH_CODE 已捕获。点按本通知复制，粘贴到 ms-rewards-worker 的 Env → AUTH_CODE，保存后在 3 分钟内运行。尚未兑换授权令牌。',code);
  }catch{} // Notification or malformed URL must never interrupt the login request.
}
function mrValidCookie(value){
  // Cookie names are not a documented authentication contract. Only validate transport format.
  if(typeof value!=='string'||!value.trim()||value.length>32768||/[\x00-\x1F\x7F]/.test(value))return false;
  const pairs=value.split(';').map(part=>part.trim()).filter(Boolean);
  return pairs.every(part=>/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+=[\x20-\x7E]*$/.test(part))&&pairs.some(part=>part.slice(part.indexOf('=')+1).trim().length>0);
}
function mrCapture(r){
  const {ctx}=r;
  const notice=(body,cookie)=>{try{ctx.notify?.({title:'Microsoft Rewards · Cookie v3',body,sound:false,...(cookie?{action:{type:'clipboard',text:cookie}}:{})});}catch{}};
  try{
    const req=ctx.request,url=new URL(req.url);
    if(req.method!=='GET'||url.protocol!=='https:'||url.port||url.username||url.password||url.searchParams.get('egern_capture')!=='1')return;
    const kind=url.hostname==='rewards.bing.com'&&['/','/earn'].includes(url.pathname)?'rewards':url.hostname==='www.bing.com'&&url.pathname==='/'?'bing':null;
    if(!kind)return;
    const label=kind==='rewards'?'Rewards':'Bing';
    // HTTP/2 may split Cookie into multiple fields; the separator must be '; ', not ', '.
    const headers=req.headers,parts=typeof headers.getAll==='function'?headers.getAll('cookie'):null;
    const cookie=parts?.length?parts.join('; '):headers.get('cookie');
    if(cookie===null||cookie===undefined||cookie===''){notice(label+' 未保存：本次请求未携带 Cookie。请在显示已登录的同一 Safari 标签页重新打开获取链接。');return;}
    if(!mrValidCookie(cookie)){notice(label+' 未保存：Cookie 请求头格式异常、内容全空或超过 32 KB；已保留原凭据。');return;}
    let saved=false;
    try{
      const previous=mrLoad(r,'cookie:'+kind);
      // Discard a prior balance before changing credentials, but preserve task receipts.
      if(kind==='rewards'&&previous?.value!==cookie)ctx.storage.set(r.prefix+'snapshot','');
      mrSave(r,'cookie:'+kind,{host:url.hostname,value:cookie,at:Date.now()});
      saved=true;
    }catch{} // Copying must also work when persistence is unavailable or isolated.
    const envKey=kind==='rewards'?'REWARDS_COOKIE':'BING_COOKIE';
    notice(envKey+' 已捕获，点按本通知复制完整值，再粘贴到脚本 Env 的同名字段。'+(saved?'本地已保存':'本地保存失败，仍可复制')+'；待查询验证登录状态。',cookie);
  }catch{notice('Cookie 保存失败，请检查 Egern 本地存储和脚本配置；原网页继续加载。');}
}
function mrEnabled(e,key,fallback=true){const v=e[key];return v===undefined||v===''?fallback:!['false','0','off','no'].includes(String(v).toLowerCase());}
function mrTaskFlags(e){return ['SIGN','READ','PROMOS','SEARCH'].map(k=>mrEnabled(e,'TASK_'+k)?'1':'0').join('');}
function mrStoredSnapshot(s){return !!(s&&s.pc&&s.mobile&&Number.isFinite(s.at)&&Date.now()>=s.at);}
function mrRecentSnapshot(s,day,age){return !!(s&&s.day===day&&s.pc&&s.mobile&&Number.isFinite(s.at)&&Date.now()>=s.at&&Date.now()-s.at<age);}
function mrSettled(r,s,snap){
  if(s.day!==mrDay(r.e.TIMEZONE||'Asia/Shanghai')||!Number.isFinite(s.lastRun)||Date.now()<s.lastRun)return false;
  const error=mrLoad(r,'lastError');if(error?.at>=s.lastRun||s.notes?.QUERY)return false;
  const full=c=>Number.isFinite(c?.current)&&Number.isFinite(c?.max)&&c.current>=0&&c.max>=0&&c.current>=c.max;
  for(const key of ['SIGN','READ','PROMOS','SEARCH']){
    if(!mrEnabled(r.e,'TASK_'+key))continue;
    const note=String(s.notes?.[key]||'');
    if(!note||/已关闭|失败|错误|超时|未知|待确认|等待|未匹配|未取得|缺少|暂停|停止|时间不足|HTTP/.test(note))return false;
    if(key==='SIGN'&&s.actions?.sign?.status!=='签到已确认')return false;
    if(key==='READ'&&!(full(s.read)&&s.read.max>0))return false;
    if(key==='PROMOS'&&(!Array.isArray(snap.promos)||!Array.isArray(snap.earnTasks)||[...snap.promos,...snap.earnTasks].some(p=>!p.complete)))return false;
    if(key==='SEARCH'&&!(full(snap.pc)&&(full(snap.mobile)||(snap.mobile.max===null&&snap.appSearch?.day===s.day&&full(snap.appSearch)))))return false;
  }
  return true;
}
function mrLocalParts(at,tz){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function mrWallInstant(wall,tz){
  let at=wall;
  for(let i=0;i<3;i++){const p=mrLocalParts(at,tz),local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);at+=wall-local;}
  return at;
}
function mrWidgetWindow(e){
  const tz=e.TIMEZONE||'Asia/Shanghai',p=mrLocalParts(Date.now(),tz),base=Date.UTC(p.year,p.month-1,p.day);
  const hour=p.hour>=18?18:p.hour>=12?12:null,day=new Date(base).toISOString().slice(0,10);
  const nextWall=base+(p.hour<12?12:p.hour<18?18:36)*3600000;
  return {key:hour===null?null:day+'@'+hour,at:hour===null?null:mrWallInstant(base+hour*3600000,tz),nextAt:mrWallInstant(nextWall,tz)};
}
function mrRefresh(ctx){return new Date(mrEnabled(ctx.env||{},'POWER_SAVE')?mrWidgetWindow(ctx.env||{}).nextAt:Date.now()+300000).toISOString();}
function mrLoad(r,key){let raw;try{raw=r.ctx.storage.get(r.prefix+key);}catch{throw mrFault('本地存储读取失败（'+key+'）');}if(!raw)return null;try{return JSON.parse(raw);}catch{throw Error('本地状态损坏，请更换 ACCOUNT_ID 后重新配置');}}
function mrSave(r,key,value){try{r.ctx.storage.set(r.prefix+key,JSON.stringify(value));}catch{throw mrFault('本地存储写入失败（'+key+'）');}}
function mrDay(tz){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function mrId(){if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16);});}
function mrMessage(e){return e?.safe||e?.message==='本地状态损坏，请更换 ACCOUNT_ID 后重新配置'?String(e.safe||e.message):/^(缺少|请|本地|地区|无法|服务端|授权|登录|数据|网页|积分|本轮)/.test(e?.message||'')?e.message:'请求失败或存储不可用，请检查网络及 Egern 日志';}
function mrFault(message,auth=false){const e=Error(message);e.safe=message;e.auth=auth;return e;}
function mrForm(obj){return Object.entries(obj).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');}
async function mrRequest(r,method,url,kind,body,headers={}){
  let current=new URL(url);
  const bingHosts=['www.bing.com','cn.bing.com'];
  const allowed={web:['rewards.bing.com'],bing:bingHosts,app:['prod.rewardsplatform.microsoft.com'],oauth:['login.live.com']};
  const secure=u=>u.protocol==='https:'&&!u.port&&!u.username&&!u.password;
  if(!secure(current)||!allowed[kind]?.includes(current.hostname))throw mrFault('请求域名不在迁移脚本允许列表中');
  if(kind==='bing'&&r.bingBase)current=new URL(current.pathname+current.search,r.bingBase);
  // The diagnostic identifies our initial endpoint, never a redirect query or response body.
  const endpoint=method+' '+current.hostname+current.pathname;
  const credential=kind==='web'?'REWARDS_COOKIE':kind==='bing'?'BING_COOKIE':'OAuth 授权';
  const h={'User-Agent':kind==='app'?MR_MOBILE:MR_PC,...headers};
  if(kind==='web'||kind==='bing'){
    const cookie=kind==='web'?r.e.REWARDS_COOKIE:r.e.BING_COOKIE;
    if(!cookie)throw mrFault('缺少 '+(kind==='web'?'REWARDS_COOKIE':'BING_COOKIE')+'，请打开配套 Cookie 获取链接或在 Env 填写',true);
    h.Cookie=headers.Cookie||cookie;
  }
  for(let hops=0;;hops++){
    if(Date.now()>r.deadline-2000)throw mrFault('本轮执行时间已用尽');
    // Captured Bing cookies originate at www. Never copy host-bound cookies to cn.
    const sent={...h};
    if(kind==='bing'&&current.hostname!=='www.bing.com')sent.Cookie=String(sent.Cookie).split(';').map(x=>x.trim()).filter(x=>x&&!x.startsWith('__Host-')).join('; ');
    if(kind==='bing'&&sent.Referer){try{const ref=new URL(sent.Referer);if(bingHosts.includes(ref.hostname))sent.Referer=new URL(ref.pathname+ref.search,current.origin).href;}catch{}}
    const options={headers:sent,timeout:Math.min(8000,r.deadline-Date.now()),credentials:'omit',redirect:'manual',...(body!==undefined?{body}:{}),...(r.e.POLICY?{policy:r.e.POLICY}:{})};
    let resp;
    try{resp=await r.ctx.http[method.toLowerCase()](current.href,options);}catch(err){throw mrTransportFault(endpoint,err);}
    if(resp.status===401)throw mrFault(endpoint+'：HTTP 401，登录/授权未通过，请检查 '+credential,true);
    if(resp.status===403)throw mrFault(endpoint+'：HTTP 403，访问被拒绝；请检查网页登录验证、网络和 '+credential,true);
    if(resp.status>=300&&resp.status<400){
      let next;try{const location=resp.headers.get('location');if(location)next=new URL(location,current);}catch{}
      const detail=endpoint+'：HTTP '+resp.status+' → '+(next?.hostname||'无有效 Location');
      if(next&&['login.live.com','login.microsoftonline.com','account.live.com'].includes(next.hostname))throw mrFault(detail+'，跳到登录/验证页，请重新登录并更新 '+credential,true);
      if(method!=='GET'||body!==undefined)throw mrFault(detail+'；提交请求未自动重发');
      if(![301,302,303,307,308].includes(resp.status)||!next||!secure(next))throw mrFault(detail+'；跳转目标不受支持');
      const sameOrigin=next.origin===current.origin;
      const regional=kind==='bing'&&bingHosts.includes(next.hostname)&&next.pathname===current.pathname;
      if(!sameOrigin&&!regional)throw mrFault(detail+'；跨站或跨路径跳转已停止');
      if(hops>=3)throw mrFault(detail+'；跳转次数超过 3 次，本轮停止');
      current=next;continue;
    }
    if(resp.status<200||resp.status>=300){const fault=mrFault(endpoint+'：数据源 HTTP '+resp.status);fault.httpStatus=resp.status;throw fault;}
    if(kind==='bing')r.bingBase=current.origin;
    try{return await resp.text();}catch(err){throw mrTransportFault(endpoint,err);}
  }
}
function mrTransportFault(endpoint,err){
  // Classify only; never include native messages that may contain credentials or request URLs.
  const message=String(err?.message||''),timeout=/timed?\s*out|timeout|超时/i.test(message);
  return mrFault(endpoint+'：'+(timeout?'网络请求超时':'网络请求失败')+'，请检查 Egern 网络/策略及日志');
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
  r.earnDeployment=html.match(/[?&]dpl=([A-Za-z0-9_-]{1,80})(?=["'&\\\s<>]|$)/)?.[1]||null;
  try{const j=mrJson(await mrRequest(r,'GET',MR_WEB+'/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest','web',undefined,{'X-Requested-With':'XMLHttpRequest',Referer:MR_WEB+'/'}));api=j.dashboard||j;if(!api.userStatus)api=null;}catch(e){webError=e;}
  if(!earn&&!api)throw webError||mrFault('登录状态无效，未取得积分数据',true);
  const u=api?.userStatus||{},c=u.counters||{},day=mrDay(r.e.TIMEZONE||'Asia/Shanghai'),d=day.split('-');
  const dailyKey=d.length===3?d[1]+'/'+d[2]+'/'+d[0]:'';
  const promos=[...(api?.dailySetPromotions?.[dailyKey]||[]),...(api?.morePromotions||[])].filter(p=>p.priority>-2&&p.exclusiveLockedFeatureStatus!=='locked');
  // Select a whole counter from one source; never pair a progress value with another source's limit.
  const complete=x=>x&&x.current!==null&&x.max!==null;
  const counter=(primary,fallback)=>complete(primary)?primary:complete(fallback)?fallback:primary||fallback;
  const out={balance:earn?.balance??mrNumeric(u.availablePoints),pc:counter(earn?.pc,mrCounter(c.pcSearch)),mobile:counter(earn?.mobile,mrCounter(c.mobileSearch)),today:earn?.today??mrCounter(c.dailyPoint).current,level:u.levelInfo?.activeLevel||'',promos:promos.map(p=>({id:p.offerId,hash:p.hash,title:p.title||p.offerId,complete:!!p.complete})),at:Date.now(),day};
  out.earnTasks=mrEarnTasks(html);
  const appSearch=mrAppSearchObservation(r);if(appSearch)out.appSearch=appSearch;
  return out;
}
function mrAppSearchObservation(r){
  const x=mrLoad(r,'appSearch');
  return x&&x.day===mrDay(r.e.TIMEZONE||'Asia/Shanghai')&&Number.isFinite(x.at)&&Date.now()>=x.at&&Date.now()-x.at<3600000&&Number.isFinite(x.current)&&Number.isFinite(x.max)&&x.current>=0&&x.max>=x.current?x:null;
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
  const j=mrJson(await mrRequest(r,method,MR_APP+path,'app',body===undefined?undefined:JSON.stringify(body),{'Content-Type':'application/json; charset=UTF-8',Authorization:'Bearer '+access,'x-rewards-appid':'SAAndroid/31.4.2110003555','x-rewards-ismobile':'true','x-rewards-country':country,'x-rewards-partnerid':'startapp','x-rewards-flights':'rwgobig'}));
  if(method==='GET'&&path.startsWith('/dapi/me?')){
    // Observed in the user's App response. It is NOT an independent mobile search quota.
    const promotions=Array.isArray(j.response?.promotions)?j.response.promotions:[];
    const matches=promotions.filter(p=>p?.attributes?.type==='search'&&/^WW_search_global_/.test(p.attributes?.offerid||''));
    const a=matches.length===1?matches[0].attributes:null,current=mrNumeric(a?.progress),max=mrNumeric(a?.max);
    const valid=current!==null&&max!==null&&current>=0&&max>=current,at=Date.now(),day=mrDay(r.e.TIMEZONE||'Asia/Shanghai');
    mrSave(r,'appSearch',valid?{current,max,at,day}:null);
    const message=valid?'App 搜索 '+current+'/'+max:!Array.isArray(j.response?.promotions)?'App 未返回任务列表':matches.length===0?'App 返回 '+promotions.length+' 项任务，未匹配搜索额度':matches.length>1?'App 搜索匹配 '+matches.length+' 项，无法唯一识别':'App 搜索数值无效';
    mrSave(r,'appSearchStatus',{message,at,day});
  }
  return j;
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
  const configuredAction=String(r.e.EARN_ACTION_ID||MR_EARN_ACTION).trim();
  const tasks=[...snap.earnTasks.map(p=>({...p,kind:'earn'})),...snap.promos.map(p=>({...p,kind:'dash'}))];
  const item=tasks.find(p=>{
    if(p.complete||!p.id||!p.hash)return false;
    if(p.kind==='earn'&&s.earnBlockedAction===configuredAction)return false;
    const prior=s.actions['promo:'+p.id];
    return !prior||(p.kind==='earn'&&prior.httpStatus===404&&prior.actionId&&prior.actionId!==configuredAction);
  });
  if(!item){s.notes.PROMOS=s.earnBlockedAction===configuredAction?'网页活动接口 404，需更新 EARN_ACTION_ID':tasks.some(p=>!p.complete)?'活动提交待确认':'没有可执行活动';return;}
  let csrf=null,action=null;
  if(item.kind==='dash'){
    const html=await mrRequest(r,'GET',MR_WEB+'/','web');csrf=html.match(/RequestVerificationToken[^>]*value="([^"]+)"/)?.[1]||html.match(/"verificationToken"\s*:\s*"([^"]+)"/)?.[1];
    if(!csrf)throw mrFault('网页活动缺少验证令牌，未提交');
  }else{action=configuredAction;if(!/^(?:[a-f0-9]{40}|[a-f0-9]{42})$/i.test(action))throw mrFault('网页 EARN_ACTION_ID 格式错误');}
  const key='promo:'+item.id,previous=s.actions[key];
  if(previous){
    // Only a recorded HTTP 404 plus an explicitly changed action permits replay.
    const {attempts=[],...attempt}=previous;
    s.actions[key]={status:'待确认',id:mrId(),at:Date.now(),actionId:action,attempts:[...attempts,attempt]};mrSave(r,'state',s);
  }else if(!mrPrepare(r,s,key))return;
  if(item.kind==='earn'){
    s.actions[key].actionId=action;mrSave(r,'state',s);
    try{
      await mrRequest(r,'POST',MR_WEB+'/earn','web',JSON.stringify([item.hash,11,{offerid:item.id,isPromotional:'$undefined',timezoneOffset:String(r.e.TIMEZONE_OFFSET||'-480')}]),{'Content-Type':'text/plain;charset=UTF-8',Accept:'text/x-component',Origin:MR_WEB,'next-action':action,'next-router-state-tree':encodeURIComponent(JSON.stringify(MR_EARN_ROUTER)),...(r.earnDeployment?{'x-deployment-id':r.earnDeployment}:{}),Referer:MR_WEB+'/earn'});
    }catch(err){
      if(err.httpStatus===404){
        s.actions[key].httpStatus=404;s.actions[key].status='接口拒绝（HTTP 404）';s.earnBlockedAction=action;mrSave(r,'state',s);
        throw mrFault('活动「'+String(item.title||item.id).slice(0,60)+'」HTTP 404：需核对当前网页请求并更新 EARN_ACTION_ID');
      }
      throw err;
    }
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
  if(!quota('pc')&&!quota('mobile')){
    const app=mrAppSearchObservation(r);
    const diagnostic=mrLoad(r,'appSearchStatus'),fresh=diagnostic?.day===s.day&&Number.isFinite(diagnostic.at)&&Date.now()>=diagnostic.at&&Date.now()-diagnostic.at<3600000;
    s.notes.SEARCH=app&&app.current===app.max?'App 搜索已满 '+app.current+'/'+app.max+'；未提交额外搜索':snap.pc.max===null||snap.mobile.max===null?(app?'App 搜索 '+app.current+'/'+app.max+'；未取得独立设备额度':fresh?diagnostic.message:'App 搜索暂无有效查询记录')+'；未提交':'搜索额度已完成';return;
  }
  const mobile=quota('mobile')&&(!quota('pc')||s.searchIndex%2===1),counter=mobile?snap.mobile:snap.pc;
  const key='search:'+s.searchIndex;if(!mrPrepare(r,s,key))return;
  const custom=String(r.e.SEARCH_TERMS||'').split('|').map(x=>x.trim()).filter(Boolean);
  const words=custom.length?custom:['今日科技新闻','天文观测','城市天气','自然摄影','开源软件','历史博物馆','世界地理','森林生态','咖啡制作','阅读推荐','太空探索','旅行路线'];
  const term=words[s.searchIndex%words.length]+' '+s.day+' '+(s.searchIndex+1);
  let query=(r.bingBase||MR_BING)+'/search?'+mrForm({q:term,form:'QBLH',...(mrEnabled(r.e,'LOCK_CN')?{mkt:'zh-CN'}:{})});
  const ua=mobile?MR_MOBILE:MR_PC;
  const cookie=String(r.e.BING_COOKIE||'').split(';').map(x=>x.trim()).filter(x=>x&&!/^(_EDGE_S|_RwBf|_Rwho)=/.test(x)).join('; ')+'; _Rwho=u='+(mobile?'m':'d')+'&ts='+s.day;
  const searchHeaders={'User-Agent':ua,Cookie:cookie};
  const html=await mrRequest(r,'GET',query,'bing',undefined,{...searchHeaders,Referer:MR_BING+'/'});
  query=new URL(new URL(query).pathname+new URL(query).search,r.bingBase||MR_BING).href;
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
const MR_UI={
  bg:{light:'#FFFFFF',dark:'#15202D'},ink:{light:'#101D31',dark:'#F4F7FC'},
  muted:{light:'#586C87',dark:'#A9BAD0'},blue:{light:'#0066EA',dark:'#66ADFF'},
  soft:{light:'#EAF3FF',dark:'#233B58'},track:{light:'#DFE8F3',dark:'#35465D'},
  line:{light:'#E1E8F2',dark:'#344355'},card:{light:'#FBFDFF',dark:'#1C2A3B'},
  warn:{light:'#885112',dark:'#F0C789'},warnBg:{light:'#FFF3DE',dark:'#3B3024'}
};
function mrTxt(text,size=12,color=MR_UI.ink,extra={}){return {type:'text',text:String(text),font:{size,weight:'medium'},textColor:color,maxLines:1,minScale:0.8,...extra};}
function mrRow(children,extra={}){return {type:'stack',direction:'row',alignItems:'center',gap:7,children,...extra};}
function mrCol(children,extra={}){return {type:'stack',direction:'column',alignItems:'start',gap:4,children,...extra};}
function mrIcon(name,size=18,color=MR_UI.blue){return {type:'image',src:'sf-symbol:'+name,width:size,height:size,color};}
function mrLogo(size=17){return {type:'image',width:size,height:size,src:"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 21 21'><path fill='#F25022' d='M0 0h10v10H0z'/><path fill='#7FBA00' d='M11 0h10v10H11z'/><path fill='#00A4EF' d='M0 11h10v10H0z'/><path fill='#FFB900' d='M11 11h10v10H11z'/></svg>"};}
function mrRule(vertical=false){return {type:'stack',...(vertical?{width:1,height:30}:{height:1}),backgroundColor:MR_UI.line,children:[]};}
function mrDate(at,size=9,color=MR_UI.muted){return {type:'date',date:new Date(at).toISOString(),format:'relative',font:{size},textColor:color,maxLines:1};}
function mrPill(value,tone='good',size=10){return mrRow([mrTxt(value,size,tone==='warn'?MR_UI.warn:tone==='good'?MR_UI.blue:MR_UI.muted)],{padding:[3,6,3,6],gap:0,borderRadius:8,backgroundColor:tone==='warn'?MR_UI.warnBg:MR_UI.soft});}
function mrTrack(c,height=5,width){
  const ratio=Number.isFinite(c?.current)&&c.max>0?Math.max(0,Math.min(1,c.current/c.max)):0;
  return mrRow([...(ratio>0?[{type:'stack',height,flex:ratio,backgroundColor:MR_UI.blue,borderRadius:height/2,children:[]}]:[]),...(ratio<1?[{type:'stack',height,flex:1-ratio,backgroundColor:MR_UI.track,borderRadius:height/2,children:[]}]:[])],{gap:0,...(width?{width}:{})});
}
function mrBar(name,c,icon,compact=false){
  const value=c.current===null||c.max===null?'额度未知':mrNumber(c.current)+' / '+mrNumber(c.max);
  return mrCol([mrRow([mrIcon(icon,compact?12:16),mrTxt(name,compact?10:11,MR_UI.ink),{type:'spacer'}],{gap:4}),mrRow([mrTxt(value,compact?11:13,MR_UI.blue,{font:{size:compact?11:13,weight:'semibold'}}),{type:'spacer'}]),mrTrack(c,compact?4:5,compact?143:140)],{flex:1,gap:compact?2:4});
}
function mrUiTask(key,state){
  const note=String(state.notes?.[key]||''),meta={SIGN:['签到','calendar.badge.checkmark'],READ:['阅读','book'],PROMOS:['活动','gift'],SEARCH:['搜索','magnifyingglass']}[key];
  let value='待运行',tone='neutral',progress=null;
  const count=key==='READ'?note.match(/阅读(?:已完成)?\s*(\d+)\s*\/\s*(\d+)/):null;
  if(count)progress={current:Number(count[1]),max:Number(count[2])};
  else if(key==='READ'&&Number.isFinite(state.read?.current)&&Number.isFinite(state.read?.max))progress=state.read;
  if(!note)value='待运行';
  else if(note==='已关闭')value='已关闭';
  else if(/HTTP\s*\d{3}/.test(note)){value=note.match(/HTTP\s*\d{3}/)[0];tone='warn';}
  else if(/失败|超时|错误|缺少|未通过|拒绝|登录|授权|损坏|不可用|地区锁定|无法确认地区/.test(note)){value=/超时/.test(note)?'请求超时':/授权|登录|缺少/.test(note)?'需配置':'需处理';tone='warn';}
  else if(/待确认|等待|已提交/.test(note))value='待确认';
  else if(/未知|未匹配|无法唯一|数值无效|未返回|暂无有效|未取得/.test(note))value='额度未知';
  else if(/没有可执行活动/.test(note))value='暂无活动';
  else if(/停止/.test(note))value='已暂停';
  else if(/时间不足/.test(note))value='待下轮';
  else if(/已确认/.test(note)){value='已确认';tone='good';}
  else if(/已满|额度已完成/.test(note)){value='额度已满';tone='good';}
  else if(progress){value=progress.current+' / '+progress.max;tone=progress.max>0&&progress.current>=progress.max?'good':'neutral';}
  return {key,label:meta[0],icon:meta[1],value,tone,progress,note};
}
function mrTaskCard(task,compact=false){
  if(compact)return mrCol([mrTxt(task.label,9,MR_UI.muted),mrTxt(task.value,9,task.tone==='warn'?MR_UI.warn:task.tone==='good'?MR_UI.blue:MR_UI.ink)],{flex:1,gap:2});
  const value=mrPill(task.value,task.tone,9);
  return mrCol([mrIcon(task.icon,23,task.tone==='warn'?MR_UI.warn:MR_UI.blue),mrTxt(task.label,11),task.key==='READ'&&task.progress?mrTrack(task.progress,4,48):{type:'spacer',length:4},value],{flex:1,height:98,gap:6,padding:[9,7,9,7],borderRadius:12,borderWidth:1,borderColor:MR_UI.line,backgroundColor:MR_UI.card});
}
function mrUiReason(message){
  const s=String(message||'');
  const http=s.match(/HTTP\s*\d{3}/);if(http)return http[0]+' · 请查看 Worker 通知';
  if(/超时/.test(s))return '网络超时 · 稍后重试';
  if(/网络请求失败/.test(s))return '网络请求失败 · 请检查连接';
  if(/本地存储/.test(s))return '本地存储异常 · 请查看 Worker 通知';
  if(/REWARDS_COOKIE|BING_COOKIE/.test(s))return 'Cookie 需检查 · 请查看 Worker 通知';
  if(/AUTH_CODE|REFRESH_TOKEN|授权|登录/.test(s))return '登录授权需检查 · 请查看 Worker 通知';
  return '任务需处理 · 请查看 Worker 通知';
}
function mrWidget(ctx,snap,state,status){
  const family=ctx.widgetFamily||'systemMedium',small=family==='systemSmall',large=family==='systemLarge'||family==='systemExtraLarge';
  const account=String(ctx.env?.ACCOUNT_ID||'default').trim();
  const notes=state.notes||{},error=(()=>{try{return JSON.parse(ctx.storage.get('msrewards:v1:'+account+':lastError')||'null');}catch{return null;}})();
  const refreshAfter=mrRefresh(ctx);
  if(family.startsWith('accessory'))return {type:'widget',url:MR_WEB+'/',refreshAfter,children:[{type:'text',text:family==='accessoryInline'?'Rewards '+mrNumber(snap.balance)+' · '+status:mrNumber(snap.balance),font:{size:family==='accessoryCircular'?16:20,weight:'bold'},minScale:0.5,maxLines:1},...(family==='accessoryInline'?[]:[{type:'text',text:status,font:{size:9},maxLines:1}])]};
  const oldDay=snap.day!==mrDay(ctx.env?.TIMEZONE||'Asia/Shanghai'),cached=status==='离线缓存';
  const tasks=['SIGN','READ','PROMOS','SEARCH'].map(k=>mrUiTask(k,state));
  const latestError=error&&Number.isFinite(error.at)&&error.at>(state.lastRun||0)?error:null;
  const failedTask=tasks.find(t=>t.tone==='warn'),hasRecords=Object.keys(notes).length>0;
  const today=(oldDay?'上次':'今日')+' '+(snap.today===null?'—':'+'+mrNumber(snap.today));
  const balance=mrCol([mrTxt(mrNumber(snap.balance),small?30:large?46:31,MR_UI.ink,{font:{size:small?30:large?46:31,weight:'bold'},minScale:0.55}),mrTxt(oldDay||cached?'上次可用积分':'可用积分',small?9:10,MR_UI.muted)],{gap:0});
  const header=mrRow([mrLogo(small?13:large?20:14),mrTxt('Rewards',small?12:large?18:12,MR_UI.ink,{font:{size:small?12:large?18:12,weight:'bold'}}),{type:'spacer'},...(!small?[mrPill(today,'good',large?11:9)]:[])],{gap:6});
  const appFallback=snap.mobile.max===null&&snap.appSearch;
  const progress=mrRow([mrBar('电脑搜索',snap.pc,'laptopcomputer',!large),mrRule(true),mrBar(appFallback?'App 搜索':'手机搜索',appFallback||snap.mobile,'iphone',!large)],{gap:large?12:8});
  const freshness=oldDay?'跨日缓存':cached?'离线缓存':status==='缓存'?'缓存':'积分更新';
  const children=[header];
  if(small){
    children.push(balance,mrPill(today,'good',9),{type:'spacer'});
    if(latestError||failedTask)children.push(mrPill(latestError?'上次任务错误':failedTask.label+'需处理','warn',9));
    else children.push(mrRow([mrIcon('book',14),mrTxt('阅读',10),{type:'spacer'},mrTxt(tasks[1].value,10,MR_UI.blue)]),...(tasks[1].progress?[mrTrack(tasks[1].progress,4)]:[]));
    children.push(mrRow([mrTxt(freshness,8,MR_UI.muted),mrDate(snap.at,8)],{gap:4}));
  }else{
    children.push(mrRow([balance,{type:'spacer'},...(!large?[mrCol([mrTxt(freshness,8,MR_UI.muted),mrDate(snap.at,8)],{alignItems:'end',gap:1})]:[])],{gap:6}));
    if(large)children.push(mrRule());
    children.push(progress);
    if(large)children.push({type:'spacer'});
    if(!large&&latestError)children.push(mrCol([mrTxt('上次任务错误 · '+mrUiReason(latestError.message),9,MR_UI.warn),mrDate(latestError.at,8,MR_UI.warn)],{gap:1}));
    else children.push(mrRow(tasks.map(t=>mrTaskCard(t,!large)),{gap:large?7:8,alignItems:'start'}));
    if(large){
      if(latestError)children.push(mrCol([mrRow([mrTxt('上次任务错误',9,MR_UI.warn),{type:'spacer'},mrDate(latestError.at,8,MR_UI.warn)]),mrTxt(mrUiReason(latestError.message),9,MR_UI.warn)],{gap:3,padding:7,borderRadius:8,backgroundColor:MR_UI.warnBg}));
      else if(failedTask)children.push(mrTxt(failedTask.label+' · '+mrUiReason(failedTask.note),9,MR_UI.warn));
      else if(!hasRecords)children.push(mrTxt('未读到任务记录 · 账户 '+account,9,MR_UI.muted));
      const footer=[mrTxt(freshness,8,MR_UI.muted),mrDate(snap.at,8),{type:'spacer'}];
      if(state.lastRun)footer.push(mrTxt('任务',8,MR_UI.muted),mrDate(state.lastRun,8));
      children.push(mrRow(footer,{gap:4}));
    }
  }
  return {type:'widget',url:MR_WEB+'/',padding:large?16:12,gap:large?(latestError?4:8):4,backgroundColor:MR_UI.bg,refreshAfter,children};
}
function mrError(ctx,message){
  const lock=ctx.widgetFamily?.startsWith('accessory');
  return {type:'widget',url:MR_WEB+'/',padding:lock?0:14,gap:10,...(!lock?{backgroundColor:MR_UI.bg}:{}),children:[mrRow([mrIcon('exclamationmark.circle',18,MR_UI.warn),mrTxt('Rewards',14,MR_UI.ink,{font:{size:14,weight:'bold'}})]),mrTxt(message,11,MR_UI.muted,{maxLines:lock?2:4})],refreshAfter:mrRefresh(ctx)};
}