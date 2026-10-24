/* HUZZAH! game engine — shared by the server (authoritative) and the browser (display helpers).
   Rules match the single-player build 27. */
(function (root) {
const SU=['♠','♥','♦','♣','✦'],COL=['#6f9be8','#9b6bff','#ff4a4a','#8fff00','#ffe600'],RK=[0,0,2,3,4,5,6,7,8,9,10,'J','Q','K','A'];
const EV=[['Archery',2,0],['Sword Fight',2,3],['Joust',2,4],['Grand Melee',2,5],['Champion',1,5]],TR=[10,11,12,13,14];
const HN=['High card','Pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush','Royal flush'];
const HP0=[0,2,4,6,8,10,12,14,16,18];
const NOB=[
{id:'j-arch',name:'The Jester',ev:0,kind:'lowpair',h:[3,0,2,1,4],txt:'Lowest pair'},
{id:'c-sf',name:'The Countess',ev:1,kind:'gap',h:[2,1,4,3,0],txt:'Biggest gap between your 2 cards'},
{id:'d-sf',name:'The Duke',ev:1,kind:'sum10',h:[2,0,3,4,1],txt:'Two number cards adding to 10 (highest card wins)'},
{id:'p-sf',name:'The Princess',ev:1,kind:'str3',h:[4,1,2,0,3],txt:'Best 3-card straight (use 1 or 2 pocket cards)'},
{id:'b-jo',name:'The Baron',ev:2,kind:'suit',suit:0,h:[0,2,1,4,3],txt:'Highest Spade'},
{id:'p-jo',name:'The Princess',ev:2,kind:'consec',h:[1,2,0,3,4],txt:'Highest consecutive pair'},
{id:'d-gm',name:'The Duke',ev:3,kind:'consec',h:[0,3,4,1,2],txt:'Highest consecutive pair'},
{id:'c-gm',name:'The Countess',ev:3,kind:'lowpair',h:[3,4,1,2,0],txt:'Lowest pair'},
{id:'b-ch',name:'The Baron',ev:4,kind:'suit',suit:1,h:[1,4,3,0,2],txt:'Highest Heart'},
{id:'j-ch',name:'The Jester',ev:4,kind:'lowdia',h:[4,3,0,2,1],txt:'Lowest Diamond'}];
const OBJ=[{id:'ch5',t:'Win Champion with a 5 or lower',k:'ch5',v:5},{id:'flush',t:'Win with a flush',k:'hand',cat:5,v:3},{id:'gm13',t:'Win day 1 or 3 Grand Melee',k:'ev',ev:3,ws:[0,2],v:2},{id:'fh',t:'Win with a full house',k:'hand',cat:6,v:3},{id:'ch24',t:'Win day 2 or 4 Champion',k:'ev',ev:4,ws:[1,3],v:2},{id:'kq',t:'Win with a king and queen from your pocket',k:'kq',v:5},{id:'trips',t:'Win with 3 of a kind',k:'hand',cat:3,v:2},{id:'ch13',t:'Win day 1 or 3 Champion',k:'ev',ev:4,ws:[0,2],v:2},{id:'jo24',t:'Win day 2 or 4 Joust',k:'ev',ev:2,ws:[1,3],v:2},{id:'ar24',t:'Win day 2 or 4 Archery',k:'ev',ev:0,ws:[1,3],v:2},{id:'jo13',t:'Win day 1 or 3 Joust',k:'ev',ev:2,ws:[0,2],v:2},{id:'sf24',t:'Win day 2 or 4 Sword Fight',k:'ev',ev:1,ws:[1,3],v:2},{id:'str',t:'Win with a straight',k:'hand',cat:4,v:2},{id:'gm24',t:'Win day 2 or 4 Grand Melee',k:'ev',ev:3,ws:[1,3],v:2},{id:'sf13',t:'Win day 1 or 3 Sword Fight',k:'ev',ev:1,ws:[0,2],v:2},{id:'ar13',t:'Win day 1 or 3 Archery',k:'ev',ev:0,ws:[0,2],v:2}];
/* nn: nobles in play (0-3); od: objectives dealt per player (0 = off); rfl: objective refills (0 off, 1 once, 99 unlimited) */
const defaultCfg=()=>({nord:'desc',obon:true,sm:'pts',hp:HP0.slice(),obv:OBJ.map(o=>o.v),nn:2,od:2,rfl:0});

/* ---------- pure helpers ---------- */
const srt=(a,b)=>a.r-b.r||a.s-b.s;
const same=(a,b)=>a.s==b.s&&a.r==b.r;
function shuf(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a}
const cmp=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d}return 0};
function combos(a,k,s=0,cur=[],out=[]){if(cur.length==k){out.push(cur.slice());return out}for(let i=s;i<a.length;i++){cur.push(a[i]);combos(a,k,i+1,cur,out);cur.pop()}return out}
const perm=a=>a.length<2?[a]:a.flatMap((x,i)=>perm(a.filter((_,j)=>j!=i)).map(q=>[x,...q]));
function eN(c){const n=c.length,r=c.map(x=>x.r).sort((a,b)=>b-a),fl=n==5&&c.every(x=>x.s==c[0].s);let hi=r[0],st=n==5&&r.every((v,i)=>!i||r[i-1]-v==1);
 if(n==5&&!st&&r.join()=='14,5,4,3,2'){st=true;hi=5}
 const m={};r.forEach(v=>m[v]=(m[v]||0)+1);const g=Object.entries(m).map(([v,k])=>[k,+v]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]),sh=g.map(x=>x[0]).join(''),rr=g.map(x=>x[1]);
 const cat=st&&fl?(hi==14?9:8):sh[0]=='4'?7:sh=='32'?6:fl?5:st?4:sh[0]=='3'?3:sh.slice(0,2)=='22'?2:sh[0]=='2'?1:0;
 return [cat,...(st?[hi]:rr)]}
const best=c=>c.length<=5?eN(c):combos(c,5).map(eN).sort((a,b)=>cmp(b,a))[0];
const bestCards=c=>c.length<=5?c:combos(c,5).sort((a,b)=>cmp(eN(b),eN(a)))[0];
const tie=(c,h)=>c.slice().sort((a,b)=>b.r-a.r||h.indexOf(a.s)-h.indexOf(b.s)).map(x=>h.length-h.indexOf(x.s));
/* Champion: only matches with your own card count (a pair already on the board doesn't help anyone) */
const champ=(c,cm)=>{const n=cm.filter(x=>x.r==c.r).length;return [[0,1,3,7][Math.min(n,3)],c.r]};
const handKey=(pl,cm,ev)=>ev==4&&pl.length==1?champ(pl[0],cm):best(pl.concat(cm));
const key=(pl,cm,h,ev)=>handKey(pl,cm,ev).concat(tie(pl,h));
const hname=(k,ev)=>ev==0?['High card','Pair'][k[0]]:HN[k[0]];
const tk=tie;
function nq(nb,pk,cm){const a=pk[0],b=pk[1],two=pk.length==2;
 if(nb.kind=='lowpair')return two&&a.r==b.r?{k:[-a.r],c:pk}:null;
 if(nb.kind=='gap')return two?{k:[Math.abs(a.r-b.r)],c:pk}:null;
 if(nb.kind=='sum10')return two&&a.r<=10&&b.r<=10&&a.r+b.r==10?{k:[Math.max(a.r,b.r)],c:pk}:null;
 if(nb.kind=='consec')return two&&Math.abs(a.r-b.r)==1?{k:[Math.max(a.r,b.r)],c:pk}:null;
 if(nb.kind=='lowdia'){const d=pk.filter(c=>c.s==2).sort((x,y)=>x.r-y.r);return d.length?{k:[-d[0].r],c:[d[0]]}:null}
 if(nb.kind=='suit'){const d=pk.filter(c=>c.s==nb.suit).sort((x,y)=>y.r-x.r);return d.length?{k:[d[0].r],c:[d[0]]}:null}
 if(nb.kind=='str3'){const all=pk.concat(cm),R=r=>r==1?14:r,has=r=>all.some(c=>c.r==R(r)),ph=r=>pk.some(c=>c.r==R(r));
  for(let t=14;t>=3;t--)if(has(t)&&has(t-1)&&has(t-2)&&(ph(t)||ph(t-1)||ph(t-2)))return{k:[t],c:[t,t-1,t-2].map(r=>pk.find(c=>c.r==R(r))||cm.find(c=>c.r==R(r)))};
  return null}
 return null}
const nkey=(nb,r)=>r.k.concat(tk(r.c,nb.h));

/* ---------- state-dependent helpers (work on server state and on a player's view) ---------- */
const NV=g=>g.cfg.nord=='asc'?[2,3]:[3,2];
const TRO=g=>g.trs[Math.min(19,g.wave*5+g.ev)];
const npts=(g,i)=>g.cl.filter(c=>c.p==i).reduce((a,c)=>a+NV(g)[c.i],0);
const hpts=(g,p)=>p.tr.length?g.cfg.hp[best(p.tr)[0]]:0;
const ach=(g,o,i,from)=>g.hist.slice(from==null?(g.P[i].obAt||0):from).some(x=>x.win==i&&(o.k=='ev'?x.e==o.ev&&o.ws.includes(x.w):o.k=='hand'?x.cat==o.cat:o.k=='ch5'?x.e==4&&x.pl[0].r<=5:o.k=='kq'?x.pl.some(c=>c.r==13)&&x.pl.some(c=>c.r==12):o.k=='arch0'?x.e==0&&x.cat==0:false));
const obv=(g,ob)=>g.cfg.obv[ob]!=null?g.cfg.obv[ob]:OBJ[ob].v;
const obp=(g,i)=>{const p=g.P[i];if(!g.cfg.obon)return 0;return (p.done||[]).reduce((a,o)=>a+obv(g,o),0)+(p.ob!=null&&ach(g,OBJ[p.ob],i)?obv(g,p.ob):0)};
/* player still has to choose an objective before playing */
const needOb=(g,p)=>!!(g.cfg.obon&&p.ob==null&&p.oc&&p.oc.length);
function ranking(g){const fk=i=>{const p=g.P[i],hk=p.tr.length?best(p.tr):[-1],tt=p.tr.length?tie(p.tr,g.trs[19].h):[],np=npts(g,i);return g.cfg.sm=='pts'?[hpts(g,p)+np+obp(g,i)].concat(hk,tt):hk.concat([np],tt)};
 return g.P.map((p,i)=>({p,i,k:fk(i)})).sort((a,b)=>cmp(b.k,a.k))}

/* ---------- authoritative game flow (server) ---------- */
function drawNoble(g,ex){const act=g.nobles.map(z=>z.n.id),ok=n=>!ex.some(o=>o.ev==n.ev||o.kind==n.kind);if(!g.nd.length)g.nd=shuf(NOB.filter(n=>!act.includes(n.id)));let i=g.nd.findIndex(ok);if(i<0){g.nd=shuf(NOB.filter(n=>!act.includes(n.id)));i=g.nd.findIndex(ok);if(i<0)i=0}return g.nd.splice(i,1)[0]}
function begin(g){while(g.comm.length<EV[g.ev][2])g.comm.push(g.deck.pop())}
function deal(g){const kept=g.P.map(p=>p.hand.slice()),kc=[].concat(...kept),d=[];
 for(let s=0;s<(g.n>4?5:4);s++)for(let r=2;r<=14;r++)if(!kc.some(c=>c.s==s&&c.r==r))d.push({s,r});shuf(d);
 g.P.forEach((p,i)=>{p.hand=kept[i].concat(d.splice(0,10-kept[i].length)).sort(srt);p.pl=[];p.sel=null});g.deck=d;g.comm=[];begin(g)}
function newGame(players,cfg){const n=players.length;cfg=Object.assign(defaultCfg(),cfg||{});cfg.obon=cfg.od>0;
 const trs=new Array(20),HS=[0,1,2,3].map(s=>shuf(perm([0,1,2,3,4].slice(0,n>4?5:4).filter(x=>x!=s))).slice(0,5));
 TR.forEach((r,i)=>{const ws=shuf([0,1,2,3]);for(let w=0;w<4;w++){const s=ws[w];trs[w*5+i]={s,r,h:[s,...HS[s][i]]}}});
 const g={n,cfg,P:players.map(x=>({n:x.name,bot:!!x.bot,hand:[],tr:[],pl:[],sel:null,cont:false,oc:[],ob:null,done:[],rf:0,obAt:0})),trs,wave:0,ev:0,phase:'pick',gain:[],nd:shuf(NOB.slice()),nobles:[],cl:[],nlog:[],olog:[],hist:[],ks:null,win:null};
 const od=shuf(OBJ.map((_,i)=>i));g.od=od;
 if(cfg.obon)g.P.forEach(p=>{for(let k=0;k<cfg.od;k++)p.oc.push(od.length?od.pop():Math.random()*OBJ.length|0);p.ob=(p.bot||cfg.od==1)?p.oc[Math.random()*p.oc.length|0]:null});
 for(let i=0;i<cfg.nn;i++)g.nobles.push({n:drawNoble(g,g.nobles.map(z=>z.n)),sp:[null,null]});
 deal(g);return g}
/* bots play like people: each has a temperament, gets tilted by losing streaks, cocky after a win, and sometimes goes with a gut call */
/* bots play like people: each has a temperament, gets tilted by losing streaks, cocky after a win, and sometimes goes with a gut call.
   They also plan: they spend good cards on trophies that build their final poker hand, chase the nobles at this event,
   and hold on to cards that qualify for nobles coming later in the wave. */
const MOODS={cold:{sv:1,nz:150,nb:1,slip:0,plan:0},hothead:{sv:.55,nz:260,nb:1,slip:.08,plan:1},miser:{sv:1.5,nz:260,nb:1,slip:.06,plan:1},glory:{sv:.9,nz:260,nb:1.8,slip:.06,plan:1},gambler:{sv:.85,nz:480,nb:1.2,slip:.12,plan:1},steady:{sv:1,nz:220,nb:1.2,slip:.04,plan:1}};
const TEMPERS=['hothead','miser','glory','gambler','steady'];
function botPick(g,p){if(!p.mood)p.mood=TEMPERS[Math.random()*TEMPERS.length|0];
 const M=MOODS[p.mood]||MOODS.steady,i=g.P.indexOf(p),k=EV[g.ev][1],lv=g.nobles.filter(z=>z.n.ev==g.ev);
 let sv=M.sv,lost=0;for(let j=g.hist.length-1;j>=0&&g.hist[j].win!=i;j--)lost++;
 if(M.slip){if(lost>=3)sv*=.6;else if(g.hist.length&&g.hist[g.hist.length-1].win==i)sv*=1.2}
 let want=1;
 if(M.plan){const hv=cs=>cs.length?g.cfg.hp[best(cs)[0]]:0,d=hv([...p.tr,TRO(g)])-hv(p.tr);
  want=d>0?1+d/4:(p.tr.length>=5?.6:1);sv/=want}
 const later=M.plan?g.nobles.filter(z=>z.n.ev>g.ev):[];
 const w=[25,22,15,8,0][g.ev]*sv,all=[];
 for(const c of combos(p.hand,k)){const e=handKey(c,g.comm,g.ev);let s=(e[0]*1000+(e[1]||0)*12+(e[2]||0))*(M.plan?Math.min(1.6,want):1)-w*c.reduce((a,x)=>a+x.r,0)+Math.random()*M.nz;
  lv.forEach(z=>{const r=nq(z.n,c,g.comm);if(r)s+=(M.plan?420+90*NV(g)[z.sp.indexOf(null)]:250+30*NV(g)[z.sp.indexOf(null)])*M.nb});
  if(later.length){const rest=p.hand.filter(x=>!c.includes(x));
   later.forEach(z=>{const kk=EV[z.n.ev][1];if(rest.length>=kk&&combos(rest,kk).some(cc=>nq(z.n,cc,g.comm)))s+=140*M.nb})}
  all.push([s,c])}
 all.sort((a,b)=>b[0]-a[0]);
 return (Math.random()<M.slip?all[Math.random()*Math.min(3,all.length)|0]:all[0])[1]}
/* player i picks objective k from their dealt options; can switch until the first reveal, and picks once after a refill */
function pickObj(g,i,k){const p=g.P[i];if(!p||p.bot||g.phase=='end'||!Number.isInteger(k)||k<0||k>=p.oc.length)return false;if((g.hist.length||p.rf)&&p.ob!=null)return false;p.ob=p.oc[k];return true}
/* could objective o still be completed in a future event? */
function stillPossible(g,o){const fut=(we,ee)=>we>g.wave||(we==g.wave&&ee>g.ev);if(g.wave==3&&g.ev==4)return false;if(o.k=='ev')return o.ws.some(x=>fut(x,o.ev));if(o.k=='ch5')return [0,1,2,3].some(x=>fut(x,4));return true}
/* refill variant: a completed objective scores and the player draws new options */
function refillObjectives(g){g.olog=[];if(!g.cfg.obon||!g.cfg.rfl)return;g.P.forEach((p,i)=>{if(p.ob==null||!ach(g,OBJ[p.ob],i)||p.rf>=g.cfg.rfl)return;
 const v=obv(g,p.ob);p.done.push(p.ob);p.ob=null;p.rf++;p.obAt=g.hist.length;
 const held=g.P.flatMap(q=>[q.ob,...q.done]),oc=shuf(g.od.filter(k=>!held.includes(k)&&stillPossible(g,OBJ[k]))).slice(0,g.cfg.od);
 g.od=g.od.filter(k=>!oc.includes(k));p.oc=oc;if(oc.length&&(p.bot||oc.length==1))p.ob=oc[Math.random()*oc.length|0];
 g.olog.push(`${p.n} completed a secret objective (+${v})${oc.length?' and draws a new one':''}.`)})}
/* player i locks in cards [{s,r}]; returns true if accepted */
function play(g,i,cards){const p=g.P[i];if(!p||p.bot||g.phase!='pick'||!Array.isArray(cards))return false;
 if(needOb(g,p))return false;
 if(cards.length!=EV[g.ev][1])return false;
 const sel=[];for(const c of cards){const h=p.hand.find(x=>same(x,c)&&!sel.includes(x));if(!h)return false;sel.push(h)}
 p.sel=sel;return true}
function unplay(g,i){const p=g.P[i];if(!p||g.phase!='pick')return false;p.sel=null;return true}
const allIn=g=>g.phase=='pick'&&g.P.every(p=>p.bot||p.sel);
function reveal(g){const T=TRO(g);
 g.P.forEach(p=>{const c=p.bot?botPick(g,p):p.sel;p.pl=c;p.hand=p.hand.filter(x=>!c.includes(x));p.sel=null});
 g.ks=g.P.map(p=>key(p.pl,g.comm,T.h,g.ev));let w=0;g.ks.forEach((x,i)=>{if(cmp(x,g.ks[w])>0)w=i});
 g.nlog=[];g.ncl=[];const ex=[];
 g.nobles.forEach((z,ni)=>{if(z.n.ev!=g.ev)return;let bi=-1,bk=null;
  g.P.forEach((p,i)=>{const r=nq(z.n,p.pl,g.comm);if(!r)return;const kk=nkey(z.n,r);if(!bk||cmp(kk,bk)>0){bk=kk;bi=i}});
  if(bi<0){g.nlog.push(`${z.n.name} (${z.n.txt}): nobody qualified.`);return}
  const idx=z.sp.indexOf(null);z.sp[idx]=bi;g.cl.push({p:bi,i:idx});g.ncl.push({p:bi,v:NV(g)[idx],nm:z.n.name});g.nlog.push(`${g.P[bi].n} claims a spot on ${z.n.name} (${z.n.txt}): +${NV(g)[idx]}`);
  if(z.sp.every(x=>x!=null))ex.push(ni)});
 ex.forEach(ni=>{const old=g.nobles[ni].n,nz=drawNoble(g,g.nobles.filter((_,j)=>j!=ni).map(z=>z.n));g.nobles[ni]={n:nz,sp:[null,null]};g.nlog.push(`${old.name} is exhausted. New noble: ${nz.name} (${EV[nz.ev][0]}).`)});
 g.hist.push({w:g.wave,e:g.ev,win:w,cat:g.ks[w][0],pl:g.P[w].pl.slice()});g.win=w;g.P[w].tr.push(T);g.phase='show';g.P.forEach(p=>p.cont=false);refillObjectives(g)}
function nxt(g){g.P.forEach(p=>p.cont=false);
 if(g.ev==4){if(g.wave==3){g.phase='end';return}g.wave++;g.ev=0;g.phase='pick';deal(g)}
 else{g.ev++;g.phase='pick';g.P.forEach(p=>{p.pl=[];p.sel=null});begin(g)}}
/* what player `me` is allowed to see */
function view(g,me){const open=g.phase=='end';
 return {n:g.n,cfg:g.cfg,trs:g.trs,wave:g.wave,ev:g.ev,phase:g.phase,comm:g.comm,nobles:g.nobles,cl:g.cl,nlog:g.nlog,ncl:g.phase=='show'?g.ncl||[]:[],olog:g.olog,hist:g.hist,ks:g.phase=='show'?g.ks:null,win:g.win,me,
  P:g.P.map((p,i)=>{const o={n:p.n,bot:p.bot,tr:p.tr,pl:g.phase=='pick'?[]:p.pl,hc:p.hand.length,locked:!!p.sel,cont:p.cont,ob:null,oc:null,hand:null,sel:null,done:null,dn:p.done.length,rf:0,obAt:0};
   if(i==me||open){o.ob=p.ob;o.done=p.done;o.rf=p.rf;o.obAt=p.obAt}
   if(i==me){o.hand=p.hand;o.oc=p.oc;o.sel=p.sel}
   return o})}}

const API={SU,COL,RK,EV,TR,HN,HP0,NOB,OBJ,defaultCfg,srt,same,shuf,cmp,combos,eN,best,bestCards,tie,key,handKey,champ,hname,nq,nkey,NV,TRO,npts,hpts,ach,obv,obp,needOb,ranking,
 newGame,deal,botPick,pickObj,stillPossible,refillObjectives,play,unplay,allIn,reveal,nxt,view};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.HZ=API;
})(this);
