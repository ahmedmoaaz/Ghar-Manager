(function(){
var C=window.GHAR_CONFIG||{};
var $=function(i){return document.getElementById(i)};
var S={bills:[],expenses:[]},hid=null,tab="bills",month="",armed="",sb=null;

function pad(n){return(n<10?"0":"")+n}
function ymd(dt){return dt.getFullYear()+"-"+pad(dt.getMonth()+1)+"-"+pad(dt.getDate())}
var today=ymd(new Date());month=today.slice(0,7);
function days(s){var p=s.split("-"),a=new Date(p[0],p[1]-1,p[2]),q=today.split("-"),b=new Date(q[0],q[1]-1,q[2]);return Math.round((a-b)/864e5)}
function nextMonth(s){var p=s.split("-").map(Number),y=p[0],m=p[1],d=p[2],last=new Date(y,m+1,0).getDate();return ymd(new Date(y,m,Math.min(d,last)))}
function inr(n){return"₹"+Math.round(n).toLocaleString("en-IN")}
function esc(t){return String(t).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fmt(s){var p=s.split("-");return new Date(p[0],p[1]-1,p[2]).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}

function toBill(r){return{id:r.id,name:r.name,amount:+r.amount,due:r.due_date,cat:r.category,repeat:r.repeat_monthly}}
function toExp(r){return{id:r.id,name:r.name,amount:+r.amount,cat:r.category,date:r.paid_on,billId:r.bill_id,prevDue:r.prev_due,repeat:r.repeat_monthly}}
function flash(t){$("msg").textContent=t||"";$("amsg").textContent=t||""}
function must(r){if(r.error)throw r.error;return r.data}

function show(authed){$("auth").hidden=authed;$("app").hidden=!authed;if(!authed)$("add").hidden=true;else render()}

async function load(){
  try{
    var m=must(await sb.from("household_members").select("household_id").limit(1));
    if(!m.length)throw{message:"No home found for this account. Did you run schema.sql before signing up?"};
    hid=m[0].household_id;
    var b=must(await sb.from("bills").select("*").order("due_date"));
    var e=must(await sb.from("expenses").select("*").order("paid_on",{ascending:false}));
    S.bills=b.map(toBill);S.expenses=e.map(toExp);flash("");
  }catch(err){flash(err.message||String(err))}
  render();
}

function hero(){
  var due=0,n=0,over=0,oa=0,ms=0;
  S.bills.forEach(function(b){var k=days(b.due);if(k<0){over++;oa+=b.amount;due+=b.amount}else if(k<=7){due+=b.amount;n++}});
  S.expenses.forEach(function(e){if(e.date.slice(0,7)===today.slice(0,7))ms+=e.amount});
  $("dueAmt").textContent=inr(due);$("dueN").textContent=n;
  $("overN").textContent=over+" ("+inr(oa)+")";$("monthAmt").textContent=inr(ms);
}
function bills(){
  if(!S.bills.length)return'<div class="empty">No bills yet.<br>Tap <b>+ Add bill</b> to add your first one.</div>';
  return S.bills.slice().sort(function(a,b){return a.due<b.due?-1:1}).map(function(b){
    var k=days(b.due),t=k<0?'<span class="tag t-over">'+(-k)+'d overdue</span>':k===0?'<span class="tag t-soon">Due today</span>':k<=7?'<span class="tag t-soon">In '+k+'d</span>':'<span class="tag t-ok">In '+k+'d</span>';
    return'<div class="item"'+(k<0?' style="border-left:5px solid var(--red)"':'')+'><div class="main"><div class="name">'+esc(b.name)+'</div><div class="meta">'+t+fmt(b.due)+' · '+esc(b.cat)+(b.repeat?' · monthly':'')+'</div></div><div class="amt">'+inr(b.amount)+'</div><div><button class="btn" data-pay="'+b.id+'">Paid</button><button class="btn ghost" data-del="'+b.id+'" aria-label="Delete '+esc(b.name)+'">'+(armed===b.id?'Sure?':'✕')+'</button></div></div>'}).join("");
}
function spend(){
  var list=S.expenses.filter(function(e){return e.date.slice(0,7)===month}),tot=0,cat={};
  list.forEach(function(e){tot+=e.amount;cat[e.cat]=(cat[e.cat]||0)+e.amount});
  var pend=0,pn=0;S.bills.forEach(function(b){if(b.due.slice(0,7)===month||(month===today.slice(0,7)&&b.due<today)){pend+=b.amount;pn++}});
  var h='<label for="mo" style="margin-top:0">Month</label><input id="mo" type="month" value="'+month+'" style="margin-bottom:14px">';
  h+='<div class="item" style="display:block"><div class="row2"><span>Paid</span><span>'+inr(tot)+'</span></div><div class="row2" style="margin-top:6px"><span>Still to pay ('+pn+' bills)</span><span>'+inr(pend)+'</span></div><div class="row2" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px"><span>Month total</span><span>'+inr(tot+pend)+'</span></div></div>';
  if(!list.length)return h+'<div class="empty">Nothing paid yet this month.<br>Tap <b>Paid</b> on a bill and it shows up here.</div>';
  Object.keys(cat).sort(function(a,b){return cat[b]-cat[a]}).forEach(function(c){h+='<div class="row2"><span>'+esc(c)+'</span><span>'+inr(cat[c])+'</span></div><div class="bar"><i style="width:'+Math.round(cat[c]/tot*100)+'%"></i></div>'});
  h+='<h3 style="margin:18px 0 8px">Payments</h3>'+list.map(function(e){return'<div class="item"><div class="main"><div class="name">'+esc(e.name)+'</div><div class="meta">'+fmt(e.date)+' · '+esc(e.cat)+'</div></div><div class="amt">'+inr(e.amount)+'</div><button class="btn ghost" data-undo="'+e.id+'" aria-label="Undo payment of '+esc(e.name)+'">Undo</button></div>'}).join("");
  return h;
}
function render(){
  if($("app").hidden)return;
  hero();
  $("view").innerHTML=tab==="bills"?bills():spend();
  $("tb-bills").setAttribute("aria-selected",tab==="bills");
  $("tb-spend").setAttribute("aria-selected",tab==="spend");
  $("add").hidden=tab!=="bills";
  var mo=$("mo");if(mo)mo.onchange=function(){month=mo.value||month;render()};
}

async function pay(id){
  var b=S.bills.filter(function(x){return x.id===id})[0];if(!b)return;
  var r=must(await sb.from("expenses").insert({household_id:hid,bill_id:b.id,name:b.name,amount:b.amount,category:b.cat,paid_on:today,prev_due:b.due,repeat_monthly:b.repeat}).select().single());
  S.expenses.unshift(toExp(r));
  if(b.repeat){var nd=nextMonth(b.due);must(await sb.from("bills").update({due_date:nd}).eq("id",b.id));b.due=nd}
  else{must(await sb.from("bills").delete().eq("id",b.id));S.bills=S.bills.filter(function(x){return x.id!==id})}
}
async function undo(id){
  var x=S.expenses.filter(function(q){return q.id===id})[0];if(!x)return;
  must(await sb.from("expenses").delete().eq("id",id));
  S.expenses=S.expenses.filter(function(q){return q.id!==id});
  if(!x.prevDue)return;
  var bb=S.bills.filter(function(q){return q.id===x.billId})[0];
  if(bb){must(await sb.from("bills").update({due_date:x.prevDue}).eq("id",bb.id));bb.due=x.prevDue}
  else{var r=must(await sb.from("bills").insert({household_id:hid,name:x.name,amount:x.amount,due_date:x.prevDue,category:x.cat,repeat_monthly:!!x.repeat}).select().single());S.bills.push(toBill(r))}
}
async function remove(id){must(await sb.from("bills").delete().eq("id",id));S.bills=S.bills.filter(function(x){return x.id!==id})}
function run(p){flash("");return p.catch(function(e){flash(e.message||String(e))}).then(render)}

$("tb-bills").onclick=function(){tab="bills";render()};
$("tb-spend").onclick=function(){tab="spend";render()};
$("view").onclick=function(e){
  var p=e.target.getAttribute("data-pay"),d=e.target.getAttribute("data-del"),u=e.target.getAttribute("data-undo");
  if(p)run(pay(p));
  if(u)run(undo(u));
  if(d){if(armed===d){armed="";run(remove(d))}else{armed=d;render()}}
};
var dlg=$("dlg"),f=$("f");
$("add").onclick=function(){f.reset();$("d").value=today;dlg.showModal();$("n").focus()};
$("cx").onclick=function(){dlg.close()};
f.onsubmit=function(e){
  e.preventDefault();if(!f.reportValidity())return;
  var row={household_id:hid,name:$("n").value.trim(),amount:+$("a").value,due_date:$("d").value,category:$("c").value,repeat_monthly:$("r").checked};
  dlg.close();
  run((async function(){var r=must(await sb.from("bills").insert(row).select().single());S.bills.push(toBill(r))})());
};

function creds(){return{email:$("em").value.trim(),password:$("pw").value}}
$("login").onclick=async function(){flash("");var r=await sb.auth.signInWithPassword(creds());if(r.error)flash(r.error.message)};
$("signup").onclick=async function(){
  flash("");var r=await sb.auth.signUp(creds());
  if(r.error)flash(r.error.message);
  else if(!r.data.session)flash("Account created. Check your email to confirm, then log in.");
};
$("out").onclick=function(){sb.auth.signOut()};

if(!C.SUPABASE_URL||C.SUPABASE_URL.indexOf("PASTE")===0||!window.supabase){
  $("auth").hidden=false;flash("Open config.js and paste your Supabase URL and anon key.");
}else{
  sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange(function(ev,session){
    setTimeout(function(){
      if(session){$("who").textContent=session.user.email;show(true);load()}
      else{S={bills:[],expenses:[]};hid=null;show(false)}
    },0);
  });
}
})();
