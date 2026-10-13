const $ = (s) => document.querySelector(s);
const toast = (msg) => { const t=$("#toast"); t.textContent=msg; t.style.display="block"; clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>t.style.display="none",4500); };
async function api(url, options={}) {
  const res=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data=await res.json().catch(()=>({error:"Unexpected server response."}));
  if(!res.ok) throw new Error(data.error||"Request failed.");
  return data;
}
function formObject(form){return Object.fromEntries(new FormData(form).entries());}
function showDashboard(data){
  $("#auth").classList.add("hidden"); $("#hero").classList.add("hidden"); $("#dashboard").classList.remove("hidden"); $("#logoutBtn").classList.remove("hidden");
  $("#userName").textContent=data.user.name; $("#adminPanel").classList.toggle("hidden",data.user.role!=="admin");
  const pending=data.transactions.filter(t=>t.status==="pending").length; $("#pendingCount").textContent=pending;
  $("#activityRows").innerHTML=data.transactions.length?data.transactions.map(t=>`<tr><td>${escapeHtml(t.type.replaceAll("_"," "))}</td><td>${escapeHtml(String(t.amount))} ${escapeHtml(t.currency)}</td><td><span class="status ${escapeHtml(t.status)}">${escapeHtml(t.status)}</span></td><td>${escapeHtml(t.created_at)}</td></tr>`).join(""):'<tr><td colspan="4" class="muted">No activity yet.</td></tr>';
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function refresh(){try{showDashboard(await api("/api/me"));}catch(e){if(!e.message.includes("sign in"))toast(e.message);}}
$("#registerForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/register",{method:"POST",body:JSON.stringify(formObject(e.target))});e.target.reset();await refresh();toast("Account created in test mode.");}catch(err){toast(err.message);}});
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify(formObject(e.target))});e.target.reset();await refresh();toast("Signed in successfully.");}catch(err){toast(err.message);}});
$("#logoutBtn").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST",body:"{}"});}catch{} $("#dashboard").classList.add("hidden");$("#hero").classList.remove("hidden");$("#auth").classList.remove("hidden");$("#logoutBtn").classList.add("hidden");toast("Signed out.");});
$("#depositForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=formObject(e.target);const result=await api("/api/deposit-request",{method:"POST",body:JSON.stringify(d)});e.target.reset();await refresh();toast(result.message);}catch(err){toast(err.message);}});
$("#withdrawForm").addEventListener("submit",async e=>{e.preventDefault();try{const result=await api("/api/withdrawal-request",{method:"POST",body:JSON.stringify(formObject(e.target))});e.target.reset();await refresh();toast(result.message);}catch(err){toast(err.message);}});
$("#refreshBtn").addEventListener("click",refresh);
$("#loadAdminBtn").addEventListener("click",async()=>{try{const d=await api("/api/admin/transactions");$("#adminRows").innerHTML=d.transactions.map(t=>`<tr><td>${escapeHtml(t.email)}</td><td>${escapeHtml(t.type)}</td><td>${escapeHtml(String(t.amount))} ${escapeHtml(t.currency)}</td><td>${escapeHtml(t.status)}</td><td>${t.status==="pending"?`<button class="btn btn-outline btn-small" data-review="${t.id}" data-decision="approved">Approve status</button> <button class="btn btn-outline btn-small" data-review="${t.id}" data-decision="rejected">Reject</button>`:"—"}</td></tr>`).join("")||'<tr><td colspan="5">No requests.</td></tr>';}catch(e){toast(e.message);}});
$("#adminRows").addEventListener("click",async e=>{const b=e.target.closest("[data-review]");if(!b)return;try{await api(`/api/admin/transactions/${b.dataset.review}/review`,{method:"POST",body:JSON.stringify({decision:b.dataset.decision,note:"Reviewed in test-mode admin panel"})});toast("Test status updated; no funds moved.");$("#loadAdminBtn").click();refresh();}catch(err){toast(err.message);}});
api("/api/me").then(showDashboard).catch(()=>{});
