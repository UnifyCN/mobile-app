// Real Next.js page, cookie proxy, local Auth and persisted actions. CMS is a transport fixture.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../..'),run=join(root,'build/profile-371-r1');
const web='/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root';
const require=createRequire(join(web,'package.json'));
const {chromium}=require('playwright'),{createServerClient}=require('@supabase/ssr');
const origin='http://127.0.0.1:3487',api='http://127.0.0.1:64510';
const status=execFileSync('supabase',['status','--workdir',join(run,'supabase/tests/companion-actions'),'-o','env'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const env=Object.fromEntries(status.trim().split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')];}));
assert.equal(env.API_URL,api);
const {people}=JSON.parse(await readFile(join(run,'browser-private.json'),'utf8')),a=people[0],b=people[1];
const out=join(here,'browser');await mkdir(out,{recursive:true});
const label=process.argv[2]??'browser';
const results={label,actualPage:true,actualCookieProxy:true,localAuth:true,cmsFixture:true,hosted:false,modelAttempts:0,checks:[],requests:[],matrix:[]};
const extension=join(run,'zoom-extension');await mkdir(extension,{recursive:true});
await writeFile(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Owned profile zoom check',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));
await writeFile(join(extension,'background.js'),'chrome.runtime.onInstalled.addListener(() => {});');
const context=await chromium.launchPersistentContext(join(run,'browser-profile'),{headless:true,channel:'chromium',viewport:{width:1280,height:900},
  reducedMotion:'reduce',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
const page=context.pages()[0]??await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message.slice(0,300)));
async function cookiesFor(person){
  const cookies=[];
  const client=createServerClient(api,env.ANON_KEY,{cookies:{getAll:()=>[],setAll:values=>cookies.push(...values)}});
  const auth=await client.auth.setSession({access_token:person.session.access_token,refresh_token:person.session.refresh_token});
  assert.equal(auth.error,null);
  await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:origin,httpOnly:false,sameSite:'Lax'})));
  await context.addCookies([{name:'unify_onboarded',value:person.id,url:origin},{name:'unify_consented',value:person.id,url:origin},{name:'unify_lang',value:'en',url:origin}]);
}
async function profileRead(person){
  const started=performance.now();
  const response=await fetch(api+'/rest/v1/user_onboarding_profiles?select=province,arrival_date&id=eq.'+person.id,{headers:{apikey:env.ANON_KEY,authorization:'Bearer '+person.session.access_token}});
  const raw=await response.text(),rows=JSON.parse(raw);
  results.requests.push({path:'owned profile read',status:response.status,bytes:Buffer.byteLength(raw),rows:rows.length,ms:Math.round(performance.now()-started)});
  assert.equal(response.status,200);assert.equal(rows.length,1);return rows[0];
}
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin&&url.pathname.startsWith('/analytics-fixture/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  if ((url.pathname.startsWith('/api/companion')&&!url.pathname.startsWith('/api/companion/actions'))||url.pathname.endsWith('/rag-query')){
    results.modelAttempts++;return route.abort('blockedbyclient');
  }
  if(url.hostname==='profile371fixture.apicdn.sanity.io'||url.hostname==='profile371fixture.api.sanity.io'){
    const query=url.searchParams.get('query')??'';
    let result=[];
    if(query.includes('checklist')){
      const stage=JSON.parse(url.searchParams.get('$stage')??'"not_arrived"');
      const prefix=stage==='not_arrived'?'Synthetic':'Synthetic settled';
      result=[['bc-371',prefix+' BC-only task','British Columbia'],['on-371',prefix+' Ontario-only task','Ontario'],['national-371',prefix+' national task',null]]
        .map(([_id,title,province])=>({_id,title,province,description:'Synthetic CMS fixture',longer_description:null,class:'do_now',class_order:1,link_tab:'companion',module:null,submodule:null,i18n:null}));
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result})});
  }
  if(url.origin===origin||url.origin===api)return route.continue();
  return route.abort('blockedbyclient');
});
page.on('response',async response=>{
  if(!response.url().startsWith(origin+'/api/companion/actions'))return;
  try{const body=response.request().postDataJSON();const raw=await response.text();results.requests.push({path:'/api/companion/actions',action:body.action,status:response.status(),bytes:Buffer.byteLength(raw)});}catch{}
});
await context.addInitScript(({ids})=>{
  ids.forEach(id=>localStorage.setItem('unify.whatsNewTourSeen:2026-09:'+id,'1'));
  if(!localStorage.getItem('user_preferred_language'))localStorage.setItem('user_preferred_language','en');
},{ids:people.map(p=>p.id)});
let thrown;
try{
  const reset=await fetch(api+'/rest/v1/user_onboarding_profiles?id=eq.'+a.id,{method:'PATCH',headers:{apikey:env.ANON_KEY,
    authorization:'Bearer '+a.session.access_token,'content-type':'application/json'},body:JSON.stringify({province:'British Columbia',arrival_date:'2026-11-07',stage:0,preferred_language:'en'})});
  assert.equal(reset.status,204);
  await cookiesFor(a);
  await page.goto(origin+'/companion',{waitUntil:'domcontentloaded'});
  await page.getByText('Ask me anything, Synthetic.',{exact:true}).waitFor();
  await page.addScriptTag({path:join(web,'node_modules/posthog-js/dist/array.full.no-external.js')});
  await page.evaluate(prefix=>{
    window.__profileAnalytics=[];
    window.posthog.init('synthetic-profile-371',{api_host:prefix+'/analytics-fixture',persistence:'memory',
      capture_pageview:false,capture_pageleave:false,disable_session_recording:true,
      advanced_disable_flags:true,disable_external_dependency_loading:true,autocapture:true,opt_out_useragent_filter:true,
      before_send:event=>{window.__profileAnalytics.push(event);return null;}});
  },origin);
  await page.evaluate(()=>{const button=document.createElement('button');button.textContent='Synthetic positive analytics control';button.id='profile-analytics-positive';document.body.append(button);});
  await page.locator('#profile-analytics-positive').click();
  assert(await page.evaluate(()=>window.__profileAnalytics.some(e=>e.event==='$autocapture')),'analytics positive control did not capture');
  await page.locator('#profile-analytics-positive').evaluate(el=>el.remove());
  const composer=page.getByLabel('Message Companion');await composer.waitFor();
  await composer.fill('Keep this question through profile review and resize');
  const opener=page.getByRole('button',{name:'Open',exact:true});await opener.click();
  let panel=page.getByRole('dialog');await panel.waitFor();await panel.getByRole('button',{name:'Profile',exact:true}).click();
  await panel.getByText('British Columbia',{exact:true}).waitFor();
  await page.evaluate(()=>{window.__profileAnalytics=[];});
  await panel.getByRole('button',{name:'Edit province',exact:true}).click();
  await panel.getByLabel('Province',{exact:true}).fill('ON');
  await panel.getByRole('button',{name:'Review profile change',exact:true}).click();
  await panel.getByText('Current: British Columbia',{exact:true}).waitFor();
  await panel.getByText('Proposed: Ontario',{exact:true}).waitFor();
  assert.equal((await profileRead(a)).province,'British Columbia');
  const save=panel.getByRole('button',{name:'Save profile change',exact:true});await save.focus();await save.press('Enter');
  await panel.getByText('Changed province from British Columbia to Ontario',{exact:true}).waitFor();
  assert.equal(await save.evaluate(el=>document.activeElement===el),true);
  assert.equal((await profileRead(a)).province,'Ontario');
  assert.equal(await composer.inputValue(),'Keep this question through profile review and resize');
  const analytics=await page.evaluate(()=>window.__profileAnalytics);
  assert.equal(analytics.filter(e=>['$autocapture','$rageclick','$dead_click','$copy_autocapture'].includes(e.event)).length,0,'profile interactions reached automatic analytics');
  results.analytics={packageVersion:JSON.parse(await readFile(join(web,'node_modules/posthog-js/package.json'),'utf8')).version,sdk:'installed posthog-js; actual public init; fixture transport; before_send captured then dropped',positiveControl:true,privateDomEvents:0};
  results.checks.push('old/proposed values; reviewed save; cookie proxy; committed read; focus; composer draft; no automatic profile analytics');
  await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  assert.equal(await opener.evaluate(el=>document.activeElement===el),true);
  await page.getByRole('link',{name:'Checklist',exact:true}).first().click();
  await page.getByText('Synthetic Ontario-only task',{exact:true}).waitFor();
  await page.getByText('Synthetic national task',{exact:true}).waitFor();
  assert.equal(await page.getByText('Synthetic BC-only task',{exact:true}).count(),0,'Checklist kept content for the old province');
  await page.getByText('Synthetic retained SIN progress',{exact:true}).waitFor();
  results.checks.push('Checklist uses new province and retains saved progress');
  await page.getByRole('link',{name:'Companion',exact:true}).first().click();
  await page.getByRole('button',{name:/Synthetic settlement plan/}).click();
  panel=page.getByRole('dialog');
  await panel.getByRole('button',{name:'Approve and add 1 task',exact:true}).click();
  await panel.getByText('Something this plan depends on changed since you reviewed it. Check it again before you approve.',{exact:true}).waitFor();
  const tasks=await fetch(api+'/rest/v1/custom_checklist_tasks?select=id&user_id=eq.'+a.id,{headers:{apikey:env.ANON_KEY,authorization:'Bearer '+a.session.access_token}});
  assert.equal(tasks.status,200);assert.equal((await tasks.json()).length,1,'stale plan approval created a task');
  results.checks.push('old plan approval blocked; durable revised review; saved progress retained');
  await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});

  // A private extension calls Chrome tabs.setZoom. This changes actual browser zoom,
  // rather than CSS zoom, device pixel emulation or a pinch scale.
  const zoomWorker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker',{timeout:15000});
  const zoom=async factor=>zoomWorker.evaluate(async({prefix,factor})=>{
    const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith(prefix));
    if(!tab)throw Error('owned browser tab not found');
    await chrome.tabs.setZoom(tab.id,factor);return chrome.tabs.getZoom(tab.id);
  },{prefix:origin,factor});
  for(const locale of ['en','ar']){
    const copy=JSON.parse(await readFile(join(web,'lib/i18n/locales',locale,'translation.json'),'utf8'));
    await fetch(api+'/rest/v1/user_onboarding_profiles?id=eq.'+a.id,{method:'PATCH',headers:{apikey:env.ANON_KEY,authorization:'Bearer '+a.session.access_token,'content-type':'application/json'},body:JSON.stringify({preferred_language:locale})});
    await context.addCookies([{name:'unify_lang',value:locale,url:origin}]);
    await page.evaluate(value=>localStorage.setItem('user_preferred_language',value),locale);
    await zoom(1);await page.setViewportSize({width:1280,height:900});
    await page.goto(origin+'/companion',{waitUntil:'domcontentloaded'});
    await page.getByText(copy.companion.welcomeTitleNamed.replace('{{name}}','Synthetic'),{exact:true}).waitFor();
    const currentComposer=page.getByLabel(copy.companion.messageInputAria);await currentComposer.waitFor();
    const open=page.getByRole('button',{name:copy.taskActions.open,exact:true});
    await open.waitFor();await currentComposer.fill('Unsent '+locale+' question survives real resize');
    await open.click();panel=page.getByRole('dialog');await panel.waitFor();
    await panel.getByRole('button',{name:copy.profileActions.title,exact:true}).click();
    await panel.getByRole('button',{name:copy.profileActions.edit.province,exact:true}).click();
    const input=panel.getByLabel(copy.profileActions.input.province,{exact:true});await input.fill('Quebec');await input.focus();
    for(const width of [1280,390])for(const factor of [1,2]){
      await page.setViewportSize({width,height:900});assert.equal(await zoom(factor),factor);
      await input.scrollIntoViewIfNeeded();
      assert.equal(await input.inputValue(),'Quebec');
      assert.equal(await currentComposer.inputValue(),'Unsent '+locale+' question survives real resize');
      assert.equal(await input.evaluate(el=>document.activeElement===el),true);
      const layout=await panel.evaluate(el=>({innerWidth,devicePixelRatio,dir:document.documentElement.dir,
        scrollWidth:document.documentElement.scrollWidth,panelWidth:el.getBoundingClientRect().width,panelScrollWidth:el.scrollWidth,viewportScale:visualViewport?.scale,
        reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
        controls:[...el.querySelectorAll('button,input')].map(n=>({name:n.getAttribute('aria-label')??n.textContent,
          height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})),
        activeAnimations:el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length}));
      assert(layout.scrollWidth<=layout.innerWidth+1,'horizontal overflow');
      assert(layout.panelWidth<=layout.innerWidth+1,'drawer exceeds viewport');
      assert(layout.controls.every(c=>c.left>=-1&&c.right<=layout.innerWidth+1),'control clipped outside viewport');
      assert.equal(layout.dir,locale==='ar'?'rtl':'ltr');assert.equal(layout.reduced,true);
      assert(layout.controls.every(c=>c.height>=43.5),'an added control is below 44 CSS pixels');
      assert(layout.controls.every(c=>c.width>=43.5),'an added control is too narrow');
      const name=`profile-${locale}-${width}-zoom-${factor}`;
      await page.screenshot({path:join(out,name+'.png'),fullPage:false});
      results.matrix.push({name,browserZoom:factor,physicalViewportWidth:width,...layout});
    }
    await zoom(1);await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  }
  // A new authenticated page reads the saved profile, never the unsaved Quebec editor value.
  assert.equal((await profileRead(a)).province,'Ontario');
  await cookiesFor(b);await page.goto(origin+'/companion',{waitUntil:'domcontentloaded'});
  await page.getByText('Ask me anything, Synthetic.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Open',exact:true}).click();panel=page.getByRole('dialog');
  await panel.getByRole('button',{name:'Profile',exact:true}).click();await panel.getByText('Quebec',{exact:true}).waitFor();
  assert.equal(await panel.getByText('Ontario',{exact:true}).count(),0);
  assert.equal(await panel.getByLabel('Province',{exact:true}).count(),0,'previous account editor survived');
  assert.equal(results.modelAttempts,0);
  results.checks.push('real keyboard and resize; focus; narrow layout; Arabic RTL; actual Chrome 200 percent zoom; reduced motion; account isolation');
  results.pass=true;
}catch(error){thrown=error;results.pass=false;results.failure=String(error.message).slice(0,1000);}
finally{
  results.modelAttempts=results.modelAttempts;
  results.pageErrorCount=errors.length;
  await page.screenshot({path:join(out,label+'.png'),fullPage:true}).catch(()=>{});
  await writeFile(join(out,label+'.json'),JSON.stringify(results,null,2)+'\n');
  await context.close();
}
console.log(JSON.stringify({label,pass:results.pass,checks:results.checks,modelAttempts:results.modelAttempts,pageErrorCount:results.pageErrorCount}));
if(thrown)throw thrown;
