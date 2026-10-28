import {createPlanClient} from '@/services/companionActions/planClient';

const proposal=(id:string)=>({plan_proposal_id:id,proposal_revision:1,status:'draft',kind:'retry',goal:'Review work',items:[],change_count:0,context:null,unresolved:[],tasks:[]});
const first=proposal('first');const last=proposal('last');
const raw={plan_id:'plan',goal:'Review work',revision:1,removed:false,items:[],receipt:null,updated_at:'2026-10-27T00:00:00Z',review:last};
const cases:[string,Record<string,unknown>,string,string[]?][]=[
 ['absent',raw,'ok',['last']],
 ['empty',{...raw,reviews:[]},'ok',[]],
 ['two',{...raw,reviews:[first,last]},'ok',['first','last']],
 ['null',{...raw,reviews:null},'unknown'],
 ['object',{...raw,reviews:{}},'unknown'],
 ['string',{...raw,reviews:'broken'},'unknown'],
 ['number',{...raw,reviews:1},'unknown'],
 ['bad member',{...raw,reviews:[{}]},'unknown'],
];
for(const [label,plan,expected,ids] of cases){
 it(`independent parser: ${label}`,async()=>{
  // Falsifier: a present malformed collection is accepted as a valid partial plan,
  // an explicit empty collection falls back, or an old service without the field fails.
  const client=createPlanClient({platform:'web',appVersion:'test',transport:async()=>({status:200,body:{plans:[plan],drafts:[]}})});
  const result=await client.plans();
  console.log(JSON.stringify({label,expected,actual:result.kind,ids:result.kind==='ok'?result.plans[0].reviews.map(r=>r.id):null}));
  expect(result.kind).toBe(expected);
  if(result.kind==='ok') expect(result.plans[0].reviews.map(r=>r.id)).toEqual(ids);
 });
}
