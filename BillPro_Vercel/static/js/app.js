// ═══════════════════════════════════════════════════════════════
//  BillPro — Frontend (talks to Flask API, no localStorage)
// ═══════════════════════════════════════════════════════════════

var S = {
  currentUser: null,
  invoices:    [],
  customers:   [],
  items:       [],
  cfg: { company:'My Business', tax_rate:10, currency:'$',
         invoice_prefix:'INV-', invoice_counter:1001,
         company_address:'', company_phone:'', company_email:'' },
  feed: [],
  newFeed: 0,
  editingId: null,
  saving: false
};

// ── Tiny helpers ─────────────────────────────────────────────────
function g(id){ return document.getElementById(id); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sym(){ return S.cfg.currency||'$'; }
function taxRate(){ return parseFloat(S.cfg.tax_rate)||0; }
function fmt(n){ return sym()+parseFloat(n||0).toFixed(2); }

function toast(msg, ok){
  var t=g('toast');
  t.textContent=msg;
  t.style.background = ok===false ? 'var(--red)' : 'var(--t1)';
  t.classList.add('show');
  clearTimeout(t._t);
  t._t=setTimeout(function(){ t.classList.remove('show'); }, 2800);
}

// ── API wrapper ───────────────────────────────────────────────────
function api(method, url, body, cb){
  var opts = { method: method, headers: { 'Content-Type':'application/json' } };
  if(body) opts.body = JSON.stringify(body);
  fetch(url, opts)
    .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, data:d}; }); })
    .then(function(r){ cb(r.ok ? null : (r.data.error||'Error'), r.data); })
    .catch(function(e){ cb(e.message||'Network error', null); });
}

// ── Auth ──────────────────────────────────────────────────────────
function doLogin(){
  var u=g('l-user').value.trim(), p=g('l-pass').value.trim();
  if(!u||!p){ g('l-err').style.display='block'; g('l-err').textContent='Enter username and password.'; return; }
  api('POST','/api/login',{username:u,password:p},function(err,data){
    if(err){ g('l-err').style.display='block'; g('l-err').textContent='Invalid username or password.'; return; }
    S.currentUser=data.user;
    g('login-overlay').style.display='none';
    g('cur-user-badge').textContent=data.user.name+(data.user.role==='admin'?' (admin)':'');
    g('admin-btn').style.display=data.user.role==='admin'?'flex':'none';
    loadAll();
  });
}
function doLogout(){
  api('POST','/api/logout',null,function(){
    S.currentUser=null; S.invoices=[]; S.customers=[];
    g('admin-panel').style.display='none';
    g('edit-overlay').style.display='none';
    closeCustModal();
    g('login-overlay').style.display='flex';
    g('l-user').value=''; g('l-pass').value='';
    g('l-err').style.display='none';
  });
}

// ── Load all data from API ────────────────────────────────────────
function loadAll(){
  api('GET','/api/settings',null,function(e,d){ if(!e){ S.cfg=d; } });
  api('GET','/api/items',null,function(e,d){ if(!e){ S.items=d; renderItemsList(); } });
  api('GET','/api/customers',null,function(e,d){ if(!e){ S.customers=d; } });
  api('GET','/api/invoices',null,function(e,d){
    if(!e){
      S.invoices=d;
      renderDashboard();
      renderInvoices();
      renderCustomers();
      renderPayments();
    }
  });
}

// ── Sidebar ───────────────────────────────────────────────────────
function openSidebar(){ g('sidebar').classList.add('open'); g('sb-overlay').classList.add('show'); }
function closeSidebar(){ g('sidebar').classList.remove('open'); g('sb-overlay').classList.remove('show'); }

// ── Navigation ────────────────────────────────────────────────────
var PAGE_TITLES={dashboard:'Dashboard',invoices:'Invoices','new-invoice':'New Invoice',
                 customers:'Customers',payments:'Payments','live-feed':'Live Feed'};
function nav(page, el){
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  g('page-'+page).classList.add('active');
  g('page-title').textContent=PAGE_TITLES[page]||page;
  if(el) el.classList.add('active');
  g('admin-panel').style.display='none';
  hideAC();
  closeSidebar();
  if(page==='dashboard')   renderDashboard();
  if(page==='invoices')    renderInvoices();
  if(page==='customers')   { api('GET','/api/customers',null,function(e,d){ if(!e){S.customers=d; renderCustomers();} }); }
  if(page==='payments')    renderPayments();
  if(page==='new-invoice') resetForm();
  if(page==='live-feed')   { S.newFeed=0; g('feed-badge').style.display='none'; renderFeed(); }
}

// ── Admin Panel ───────────────────────────────────────────────────
function toggleAdmin(){
  if(!S.currentUser||S.currentUser.role!=='admin'){ alert('Admin only.'); return; }
  var p=g('admin-panel');
  p.style.display=(p.style.display==='none'||!p.style.display)?'block':'none';
  if(p.style.display==='block'){ renderItemsList(); renderUsersList(); populateCfg(); }
}
function apTab(tab,el){
  ['items','users','settings'].forEach(function(t){ g('ap-'+t).style.display='none'; });
  document.querySelectorAll('.ap-tab').forEach(function(t){ t.classList.remove('active'); });
  g('ap-'+tab).style.display='block'; el.classList.add('active');
}
function populateCfg(){
  g('cfg-company').value=S.cfg.company||'';
  g('cfg-tax').value=S.cfg.tax_rate||10;
  g('cfg-cur').value=S.cfg.currency||'$';
  g('cfg-pfx').value=S.cfg.invoice_prefix||'INV-';
  g('cfg-addr').value=S.cfg.company_address||'';
  g('cfg-phone').value=S.cfg.company_phone||'';
  g('cfg-email').value=S.cfg.company_email||'';
}
function saveCfg(){
  var cfg={
    company:g('cfg-company').value||'My Business',
    tax_rate:parseFloat(g('cfg-tax').value)||10,
    currency:g('cfg-cur').value||'$',
    invoice_prefix:g('cfg-pfx').value||'INV-',
    company_address:g('cfg-addr').value||'',
    company_phone:g('cfg-phone').value||'',
    company_email:g('cfg-email').value||''
  };
  api('POST','/api/settings',cfg,function(err){
    if(err){ toast('Save failed: '+err, false); return; }
    S.cfg=Object.assign(S.cfg,cfg);
    toast('Settings saved!');
    var ns=g('ni-sym'); if(ns) ns.textContent=sym();
    var es=g('ei-sym'); if(es) es.textContent=sym();
  });
}

// Items (catalog)
function addItem(){
  var n=g('item-name').value.trim(), p=parseFloat(g('item-price').value)||0;
  if(!n){ alert('Enter item name.'); return; }
  api('POST','/api/items',{name:n,price:p},function(err,d){
    if(err){ toast('Error: '+err, false); return; }
    S.items.push(d);
    g('item-name').value=''; g('item-price').value='';
    renderItemsList(); toast('Item added!');
  });
}
function renderItemsList(){
  var html=S.items.map(function(it){
    return '<tr><td>'+esc(it.name)+'</td><td>'+sym()+parseFloat(it.price||0).toFixed(2)+'</td>'
      +'<td><button class="btn btn-sm btn-icon" onclick="delItem('+it.id+')"><i class="ti ti-trash" style="font-size:13px;color:var(--red)"></i></button></td></tr>';
  }).join('');
  g('items-list').innerHTML=html||'<tr><td colspan="3" class="empty" style="padding:.75rem">No items yet.</td></tr>';
}
function delItem(id){
  if(!confirm('Delete this item?')) return;
  api('DELETE','/api/items/'+id,null,function(err){
    if(err){ toast('Error: '+err, false); return; }
    S.items=S.items.filter(function(i){ return i.id!==id; });
    renderItemsList(); toast('Item deleted.');
  });
}

// Users
function addUser(){
  var u=g('nu-user').value.trim(), p=g('nu-pass').value.trim(),
      n=g('nu-name').value.trim(), r=g('nu-role').value;
  if(!u||!p){ alert('Username and password required.'); return; }
  api('POST','/api/users',{username:u,password:p,name:n||u,role:r},function(err){
    if(err){ toast('Error: '+err, false); return; }
    g('nu-user').value=''; g('nu-pass').value=''; g('nu-name').value='';
    api('GET','/api/users',null,function(e,d){ if(!e) renderUsersList(d); });
    toast('User created!');
  });
}
function renderUsersList(users){
  if(!users) return;
  g('users-list').innerHTML=users.map(function(u,i){
    return '<tr><td>'+esc(u.username)+'</td><td>'+esc(u.name)+'</td>'
      +'<td><span class="badge '+(u.role==='admin'?'bi':'bw')+'">'+u.role+'</span></td>'
      +'<td>'+(i>0?'<button class="btn btn-sm btn-icon" onclick="delUser('+u.id+')"><i class="ti ti-trash" style="font-size:13px;color:var(--red)"></i></button>':'')+'</td></tr>';
  }).join('');
}
function delUser(id){
  if(!confirm('Delete this user?')) return;
  api('DELETE','/api/users/'+id,null,function(err){
    if(err){ toast('Error: '+err, false); return; }
    api('GET','/api/users',null,function(e,d){ if(!e) renderUsersList(d); });
    toast('User deleted.');
  });
}

// ── New Invoice Form ──────────────────────────────────────────────
var acActive=null, acIdx=-1;

function resetForm(prefill){
  prefill=prefill||{};
  g('ni-cust').value=prefill.customer_name||'';
  g('ni-phone').value=prefill.customer_phone||'';
  g('ni-disc').value='0';
  g('ni-notes').value='Payment due within 30 days. Thank you for your business!';
  g('ni-sym').textContent=sym();
  var today=new Date().toISOString().split('T')[0]; g('ni-date').value=today;
  var due=new Date(); due.setDate(due.getDate()+30); g('ni-due').value=due.toISOString().split('T')[0];
  g('li-body').innerHTML='';
  addLI(); calcN();
}

function makeRowHTML(desc,qty,rate){
  desc=desc||''; qty=(qty!=null)?qty:1; rate=rate||0;
  var id='r'+Date.now()+Math.random().toString(36).slice(2,5);
  return '<tr id="'+id+'">'
    +'<td style="position:relative"><input type="text" class="li-desc" placeholder="Description…" value="'+esc(desc)+'" style="width:100%"></td>'
    +'<td><input type="number" class="li-qty" value="'+qty+'" min="0.01" step="any" style="width:65px" oninput="calcN()"></td>'
    +'<td><input type="number" class="li-rate" value="'+rate+'" min="0" step="0.01" style="width:80px" oninput="calcN()"></td>'
    +'<td class="li-amt" style="padding-left:8px;color:var(--t2);font-size:12px">'+sym()+(qty*rate).toFixed(2)+'</td>'
    +'<td><button class="btn btn-sm btn-icon" onclick="rmRow(this)" title="Remove"><i class="ti ti-trash" style="font-size:13px;color:var(--red)"></i></button>'
    +' <button class="btn btn-sm btn-icon" onclick="addLIAfter(this)" title="Add below"><i class="ti ti-row-insert-bottom" style="font-size:13px;color:var(--blue)"></i></button></td>'
    +'</tr>';
}
function addLI(desc,qty,rate){
  g('li-body').insertAdjacentHTML('beforeend',makeRowHTML(desc,qty,rate));
  var rows=g('li-body').querySelectorAll('tr');
  attachRowEvents(rows[rows.length-1]);
  if(desc) calcN();
}
function addLIAfter(btn){
  var tr=btn.closest('tr');
  tr.insertAdjacentHTML('afterend',makeRowHTML());
  attachRowEvents(tr.nextElementSibling);
  tr.nextElementSibling.querySelector('.li-desc').focus();
}
function rmRow(btn){
  if(g('li-body').querySelectorAll('tr').length>1){ btn.closest('tr').remove(); calcN(); }
}
function attachRowEvents(tr){
  var desc=tr.querySelector('.li-desc');
  var qty=tr.querySelector('.li-qty');
  var rate=tr.querySelector('.li-rate');
  desc.addEventListener('input',  function(){ showAC(this,tr); });
  desc.addEventListener('focus',  function(){ if(this.value.trim()) showAC(this,tr); });
  desc.addEventListener('blur',   function(){ setTimeout(hideAC,200); });
  desc.addEventListener('keydown',function(e){ descKey(e,this,tr); });
  qty.addEventListener('keydown', function(e){ if(e.key==='Enter'){e.preventDefault();rate.focus();rate.select();} });
  rate.addEventListener('keydown',function(e){
    if(e.key==='Enter'){
      e.preventDefault();
      var all=Array.from(g('li-body').querySelectorAll('tr'));
      var idx=all.indexOf(tr);
      if(idx===all.length-1){ addLI(); setTimeout(function(){ g('li-body').querySelectorAll('.li-desc')[idx+1].focus(); },30); }
      else { all[idx+1].querySelector('.li-desc').focus(); }
    }
  });
}

// ── Autocomplete ──────────────────────────────────────────────────
function showAC(input,tr){
  acActive=input;
  var val=input.value.trim().toLowerCase();
  if(!val){ hideAC(); return; }
  var matches=S.items.filter(function(it){ return it.name.toLowerCase().indexOf(val)>-1; });
  if(!matches.length){ hideAC(); return; }
  acIdx=-1;
  var html=matches.map(function(it){
    return '<div class="ac-item" data-id="'+it.id+'" onmousedown="pickAC('+it.id+',event)">'
      +'<span>'+esc(it.name)+'</span><span class="ac-price">'+sym()+parseFloat(it.price||0).toFixed(2)+'</span></div>';
  }).join('');
  var box=g('ac-box');
  box.innerHTML=html; box.style.display='block'; box._matches=matches;
  var tRect=g('ni-table').getBoundingClientRect();
  var iRect=input.getBoundingClientRect();
  box.style.top=(iRect.bottom-tRect.top+2)+'px';
  box.style.left=(iRect.left-tRect.left)+'px';
  box.style.minWidth=iRect.width+'px';
}
function hideAC(){
  var box=g('ac-box'); if(box){ box.style.display='none'; box._matches=null; }
  acIdx=-1; acActive=null;
}
function pickAC(id,e){
  if(e) e.preventDefault();
  var item=S.items.find(function(i){ return i.id===id; });
  if(!item||!acActive) return;
  var tr=acActive.closest('tr');
  acActive.value=item.name;
  tr.querySelector('.li-qty').value=1;
  tr.querySelector('.li-rate').value=parseFloat(item.price||0).toFixed(2);
  hideAC(); calcN();
  tr.querySelector('.li-qty').focus(); tr.querySelector('.li-qty').select();
}
function descKey(e,input,tr){
  var box=g('ac-box'), matches=box._matches||[];
  if(box.style.display==='block'&&matches.length){
    if(e.key==='ArrowDown'){ e.preventDefault(); acIdx=Math.min(acIdx+1,matches.length-1); hlAC(); return; }
    if(e.key==='ArrowUp'){   e.preventDefault(); acIdx=Math.max(acIdx-1,0); hlAC(); return; }
    if(e.key==='Enter'){
      e.preventDefault();
      if(acIdx>=0&&matches[acIdx]) pickAC(matches[acIdx].id);
      else { hideAC(); tr.querySelector('.li-qty').focus(); tr.querySelector('.li-qty').select(); }
      return;
    }
    if(e.key==='Escape'){ hideAC(); return; }
  } else if(e.key==='Enter'){
    e.preventDefault(); hideAC();
    tr.querySelector('.li-qty').focus(); tr.querySelector('.li-qty').select();
  }
}
function hlAC(){
  document.querySelectorAll('.ac-item').forEach(function(el,i){ el.classList.toggle('sel',i===acIdx); });
  var sel=document.querySelector('.ac-item.sel'); if(sel) sel.scrollIntoView({block:'nearest'});
}
function discKey(e){ if(e.key==='Enter'){ e.preventDefault(); saveInvoice(); } }

// ── Totals ────────────────────────────────────────────────────────
function calcN(){
  var sub=0;
  document.querySelectorAll('#li-body tr').forEach(function(tr){
    var q=parseFloat((tr.querySelector('.li-qty')||{}).value)||0;
    var r=parseFloat((tr.querySelector('.li-rate')||{}).value)||0;
    var a=q*r; sub+=a;
    var c=tr.querySelector('.li-amt'); if(c) c.textContent=sym()+a.toFixed(2);
  });
  var tax=sub*(taxRate()/100);
  var disc=parseFloat(g('ni-disc').value)||0;
  var total=Math.max(0,sub+tax-disc);
  g('ni-sub').textContent=fmt(sub);
  g('ni-tax').textContent=fmt(tax);
  g('ni-tax-lbl').textContent='Tax ('+taxRate()+'%)';
  g('ni-total').textContent=fmt(total);
  return {sub:sub,tax:tax,disc:disc,total:total};
}

// ── Save Invoice ──────────────────────────────────────────────────
function saveInvoice(){
  if(S.saving) return; S.saving=true;
  g('save-btn').disabled=true;
  var cust=g('ni-cust').value.trim();
  if(!cust){ alert('Customer name required.'); S.saving=false; g('save-btn').disabled=false; return; }
  var items=[]; var sub=0;
  document.querySelectorAll('#li-body tr').forEach(function(tr){
    var desc=(tr.querySelector('.li-desc')||{}).value||'';
    var qty=parseFloat((tr.querySelector('.li-qty')||{}).value)||0;
    var rate=parseFloat((tr.querySelector('.li-rate')||{}).value)||0;
    var amt=qty*rate; sub+=amt;
    if(desc||amt>0) items.push({desc:desc,qty:qty,rate:rate,amount:amt});
  });
  var tax=sub*(taxRate()/100);
  var disc=parseFloat(g('ni-disc').value)||0;
  var total=Math.max(0,sub+tax-disc);
  var payload={
    customer_name:cust,
    customer_phone:g('ni-phone').value.trim(),
    date:g('ni-date').value,
    due_date:g('ni-due').value,
    items:items, subtotal:sub, tax:tax, discount:disc, total:total,
    notes:g('ni-notes').value, status:'unpaid'
  };
  api('POST','/api/invoices',payload,function(err,inv){
    S.saving=false; g('save-btn').disabled=false;
    if(err){ toast('Save failed: '+err, false); return; }
    S.invoices.unshift(inv);
    // ensure customer in local list
    if(!S.customers.find(function(c){ return c.name===cust; })){
      api('GET','/api/customers',null,function(e,d){ if(!e) S.customers=d; });
    }
    pushFeed(inv);
    toast('Invoice '+inv.invoice_number+' saved!');
    setTimeout(function(){
      nav('invoices',document.querySelectorAll('.nav-item')[1]);
    },300);
  });
}

// ── Edit Invoice ──────────────────────────────────────────────────
function openEdit(id){
  var inv=S.invoices.find(function(i){ return i.id===id; });
  if(!inv) return;
  S.editingId=id;
  g('edit-inv-num').textContent=inv.invoice_number;
  g('ei-cust').value=inv.customer_name;
  g('ei-phone').value=inv.customer_phone||'';
  g('ei-date').value=inv.date;
  g('ei-due').value=inv.due_date||'';
  g('ei-status').value=inv.status;
  g('ei-notes').value=inv.notes||'';
  g('ei-disc').value=parseFloat(inv.discount||0).toFixed(2);
  g('ei-sym').textContent=sym();
  g('ei-li-body').innerHTML='';
  var its=inv.items||[];
  if(its.length) its.forEach(function(it){ addELI(it.desc||it.description,it.qty,it.rate); });
  else addELI();
  calcE();
  g('edit-overlay').style.display='flex';
}
function closeEdit(){ g('edit-overlay').style.display='none'; S.editingId=null; }
function addELI(desc,qty,rate){
  desc=desc||''; qty=(qty!=null)?qty:1; rate=rate||0;
  var tr=document.createElement('tr');
  tr.innerHTML='<td><input type="text" class="ei-desc" placeholder="Description" value="'+esc(desc)+'" style="width:100%"></td>'
    +'<td><input type="number" class="ei-qty" value="'+qty+'" min="0.01" step="any" style="width:65px" oninput="calcE()"></td>'
    +'<td><input type="number" class="ei-rate" value="'+rate+'" min="0" step="0.01" style="width:80px" oninput="calcE()"></td>'
    +'<td class="ei-amt" style="padding-left:8px;color:var(--t2);font-size:12px">'+sym()+(parseFloat(qty)*parseFloat(rate)).toFixed(2)+'</td>'
    +'<td><button class="btn btn-sm btn-icon" onclick="this.closest(\'tr\').remove();calcE()"><i class="ti ti-trash" style="font-size:13px;color:var(--red)"></i></button></td>';
  g('ei-li-body').appendChild(tr);
}
function calcE(){
  var sub=0;
  document.querySelectorAll('#ei-li-body tr').forEach(function(row){
    var q=parseFloat((row.querySelector('.ei-qty')||{}).value)||0;
    var r=parseFloat((row.querySelector('.ei-rate')||{}).value)||0;
    var a=q*r; sub+=a;
    var c=row.querySelector('.ei-amt'); if(c) c.textContent=sym()+a.toFixed(2);
  });
  var tax=sub*(taxRate()/100);
  var disc=parseFloat(g('ei-disc').value)||0;
  var total=Math.max(0,sub+tax-disc);
  g('ei-sub').textContent=fmt(sub);
  g('ei-tax').textContent=fmt(tax);
  g('ei-tax-lbl').textContent='Tax ('+taxRate()+'%)';
  g('ei-total').textContent=fmt(total);
}
function saveEdit(){
  var cust=g('ei-cust').value.trim();
  if(!cust){ alert('Customer name required.'); return; }
  var items=[]; var sub=0;
  document.querySelectorAll('#ei-li-body tr').forEach(function(row){
    var desc=(row.querySelector('.ei-desc')||{}).value||'';
    var qty=parseFloat((row.querySelector('.ei-qty')||{}).value)||0;
    var rate=parseFloat((row.querySelector('.ei-rate')||{}).value)||0;
    var amt=qty*rate; sub+=amt;
    if(desc||amt>0) items.push({desc:desc,qty:qty,rate:rate,amount:amt});
  });
  var tax=sub*(taxRate()/100);
  var disc=parseFloat(g('ei-disc').value)||0;
  var payload={
    customer_name:cust, customer_phone:g('ei-phone').value.trim(),
    date:g('ei-date').value, due_date:g('ei-due').value,
    status:g('ei-status').value, notes:g('ei-notes').value,
    items:items, subtotal:sub, tax:tax, discount:disc,
    total:Math.max(0,sub+tax-disc)
  };
  api('PUT','/api/invoices/'+S.editingId,payload,function(err,inv){
    if(err){ toast('Save failed: '+err, false); return; }
    var idx=S.invoices.findIndex(function(i){ return i.id===S.editingId; });
    if(idx>-1) S.invoices[idx]=inv;
    closeEdit();
    renderInvoices(); renderDashboard(); renderPayments();
    toast('Invoice updated!');
  });
}

// ── Mark Paid ─────────────────────────────────────────────────────
function markPaid(id, cb){
  api('PATCH','/api/invoices/'+id+'/status',{status:'paid'},function(err){
    if(err){ toast('Error: '+err, false); return; }
    var inv=S.invoices.find(function(i){ return i.id===id; });
    if(inv) inv.status='paid';
    renderInvoices(); renderPayments(); renderDashboard();
    toast('Marked as paid!');
    if(cb) cb();
  });
}

// ── Delete Invoice ────────────────────────────────────────────────
function deleteInvoice(id){
  if(!confirm('Delete this invoice? This cannot be undone.')) return;
  api('DELETE','/api/invoices/'+id,null,function(err){
    if(err){ toast('Error: '+err, false); return; }
    S.invoices=S.invoices.filter(function(i){ return i.id!==id; });
    renderInvoices(); renderDashboard(); renderPayments();
    toast('Invoice deleted.');
  });
}

// ── PDF ───────────────────────────────────────────────────────────
function downloadPDF(id){
  window.open('/api/invoices/'+id+'/pdf', '_blank');
}

// ── Live Feed ─────────────────────────────────────────────────────
function pushFeed(inv){
  S.feed.unshift({inv:inv,time:new Date().toLocaleTimeString()});
  S.newFeed++;
  g('feed-badge').textContent=S.newFeed; g('feed-badge').style.display='inline';
  if(g('page-live-feed').classList.contains('active')){ S.newFeed=0; g('feed-badge').style.display='none'; renderFeed(); }
}
function renderFeed(){
  if(!S.feed.length){ g('live-feed-list').innerHTML='<div class="empty"><i class="ti ti-activity"></i>No activity yet.</div>'; return; }
  g('live-feed-list').innerHTML=S.feed.map(function(f){
    return '<div class="fi"><span style="color:var(--blue);font-weight:700">'+esc(f.inv.invoice_number)+'</span>'
      +' <span style="color:var(--t3);margin:0 5px">•</span> '+esc(f.inv.customer_name)
      +' <span style="color:var(--t3);margin:0 5px">•</span> <strong>'+fmt(f.inv.total)+'</strong>'
      +' <span style="color:var(--t3);margin:0 5px">by</span> <span class="badge bi">'+esc(f.inv.created_by||'—')+'</span>'
      +'<span style="font-size:10px;color:var(--t3);margin-left:8px">'+f.time+'</span></div>';
  }).join('');
}

// ── Render: Dashboard ─────────────────────────────────────────────
function renderDashboard(){
  var paid=0,unpaid=0;
  S.invoices.forEach(function(i){ if(i.status==='paid') paid+=parseFloat(i.total||0); else unpaid+=parseFloat(i.total||0); });
  g('m-rev').textContent=fmt(paid);
  g('m-out').textContent=fmt(unpaid);
  g('m-cnt').textContent=S.invoices.length;
  g('m-cust').textContent=S.customers.length;
  g('dash-inv').innerHTML=S.invoices.length
    ?S.invoices.slice(0,6).map(function(i){
      return '<tr>'
        +'<td style="color:var(--blue);font-weight:600">'+esc(i.invoice_number)+'</td>'
        +'<td><span class="cust-link" onclick="openCustModal(\''+safeAttr(i.customer_name)+'\')">'+esc(i.customer_name)+'</span></td>'
        +'<td><span class="badge bi" style="font-size:10px">'+esc(i.created_by||'—')+'</span></td>'
        +'<td>'+esc(i.date)+'</td><td>'+fmt(i.total)+'</td>'
        +'<td><span class="badge '+(i.status==='paid'?'bs':i.status==='overdue'?'bd':'bw')+'">'+esc(i.status)+'</span></td>'
        +'</tr>';
    }).join('')
    :'<tr><td colspan="6" class="empty"><i class="ti ti-file-off"></i>No invoices yet</td></tr>';
}

// ── Render: Invoices ──────────────────────────────────────────────
function renderInvoices(){
  var search=(g('inv-search')&&g('inv-search').value||'').toLowerCase();
  var fs=g('inv-filter')&&g('inv-filter').value||'';
  var isAdmin=S.currentUser&&S.currentUser.role==='admin';
  var list=S.invoices.filter(function(i){
    return(!search||(i.customer_name||'').toLowerCase().indexOf(search)>-1||(i.invoice_number||'').toLowerCase().indexOf(search)>-1)
      &&(!fs||i.status===fs);
  });
  g('inv-count-lbl').textContent=list.length+' invoice'+(list.length!==1?'s':'');
  g('inv-body').innerHTML=list.length
    ?list.map(function(i){
      return '<tr>'
        +'<td style="color:var(--blue);font-weight:600">'+esc(i.invoice_number)+'</td>'
        +'<td><span class="cust-link" onclick="openCustModal(\''+safeAttr(i.customer_name)+'\')">'+esc(i.customer_name)+'</span></td>'
        +'<td><span class="badge bi" style="font-size:10px">'+esc(i.created_by||'—')+'</span></td>'
        +'<td>'+esc(i.date)+'</td><td>'+esc(i.due_date||'')+'</td>'
        +'<td style="font-weight:600">'+fmt(i.total)+'</td>'
        +'<td><span class="badge '+(i.status==='paid'?'bs':i.status==='overdue'?'bd':'bw')+'">'+esc(i.status)+'</span></td>'
        +'<td><div style="display:flex;gap:4px;flex-wrap:wrap">'
        +(isAdmin?'<button class="btn btn-sm btn-blue" onclick="openEdit('+i.id+')"><i class="ti ti-edit"></i>Edit</button>':'')
        +'<button class="btn btn-sm" onclick="downloadPDF('+i.id+')" style="color:var(--red)"><i class="ti ti-file-type-pdf"></i>PDF</button>'
        +(i.status!=='paid'?'<button class="btn btn-sm btn-green" onclick="markPaid('+i.id+')"><i class="ti ti-check"></i>Paid</button>':'')
        +(isAdmin?'<button class="btn btn-sm btn-icon" onclick="deleteInvoice('+i.id+')" title="Delete"><i class="ti ti-trash" style="font-size:13px;color:var(--red)"></i></button>':'')
        +'</div></td></tr>';
    }).join('')
    :'<tr><td colspan="8" class="empty"><i class="ti ti-search-off"></i>No invoices found</td></tr>';
}

// ── Render: Customers ─────────────────────────────────────────────
function addCustomer(){
  var n=g('nc-name').value.trim();
  if(!n){ alert('Name required.'); return; }
  api('POST','/api/customers',{name:n,email:g('nc-email').value.trim(),phone:g('nc-phone').value.trim()},function(err,d){
    if(err){ toast('Error: '+err, false); return; }
    S.customers.push(d);
    g('nc-name').value=''; g('nc-email').value=''; g('nc-phone').value='';
    renderCustomers(); toast('Customer added!');
  });
}
function renderCustomers(){
  g('cust-body').innerHTML=S.customers.length
    ?S.customers.map(function(c){
      var ci=S.invoices.filter(function(i){ return i.customer_name===c.name; });
      var tot=ci.reduce(function(a,b){ return a+parseFloat(b.total||0); },0);
      var paid=ci.filter(function(i){ return i.status==='paid'; }).length;
      return '<tr>'
        +'<td><span class="cust-link" onclick="openCustModal(\''+safeAttr(c.name)+'\')">'+esc(c.name)+'</span></td>'
        +'<td style="color:var(--t2)">'+(c.email||'—')+'</td>'
        +'<td style="color:var(--t2)">'+(c.phone||'—')+'</td>'
        +'<td style="font-weight:600">'+fmt(tot)+'</td>'
        +'<td>'+ci.length+' <span style="color:var(--t3);font-size:11px">('+paid+' paid)</span></td>'
        +'<td><button class="btn btn-sm btn-blue" onclick="openCustModal(\''+safeAttr(c.name)+'\')"><i class="ti ti-eye"></i>View</button></td>'
        +'</tr>';
    }).join('')
    :'<tr><td colspan="6" class="empty"><i class="ti ti-users-off"></i>No customers yet</td></tr>';
}

// ── Render: Payments ──────────────────────────────────────────────
function renderPayments(){
  var pend=S.invoices.filter(function(i){ return i.status!=='paid'; });
  g('pay-body').innerHTML=pend.length
    ?pend.map(function(i){
      var due=i.due_date||'';
      var diff=due?Math.floor((new Date()-new Date(due))/86400000):0;
      var badge=diff>0?'<span class="badge bd">'+diff+'d overdue</span>':'<span class="badge bi">Due '+Math.abs(diff)+'d</span>';
      return '<tr>'
        +'<td style="color:var(--blue);font-weight:600">'+esc(i.invoice_number)+'</td>'
        +'<td><span class="cust-link" onclick="openCustModal(\''+safeAttr(i.customer_name)+'\')">'+esc(i.customer_name)+'</span></td>'
        +'<td style="font-weight:600">'+fmt(i.total)+'</td>'
        +'<td>'+esc(due)+'</td><td>'+badge+'</td>'
        +'<td><div style="display:flex;gap:4px">'
        +'<button class="btn btn-sm" onclick="downloadPDF('+i.id+')" style="color:var(--red)"><i class="ti ti-file-type-pdf"></i>PDF</button>'
        +'<button class="btn btn-p btn-sm" onclick="markPaid('+i.id+')"><i class="ti ti-check"></i>Mark Paid</button>'
        +'</div></td></tr>';
    }).join('')
    :'<tr><td colspan="6" class="empty"><i class="ti ti-checks"></i>All caught up — no pending payments!</td></tr>';
}

// ═══════════════════════════════════════════════════════════════
//  CUSTOMER DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
var _custModalName = null;

function safeAttr(s){
  // safe for use inside onclick='openCustModal("...")'
  return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
}

function openCustModal(name){
  _custModalName = name;
  var cust = S.customers.find(function(c){ return c.name===name; });
  if(!cust){ cust={id:null,name:name,email:'',phone:'',address:''}; }
  var invs = S.invoices.filter(function(i){ return i.customer_name===name; });
  _renderCustModal(cust, invs);
  g('cust-modal-overlay').style.display='flex';
}

function closeCustModal(){
  g('cust-modal-overlay').style.display='none';
  _custModalName=null;
}

function _renderCustModal(cust, invs){
  var isAdmin = S.currentUser && S.currentUser.role==='admin';
  var totalPaid=0, totalUnpaid=0;
  invs.forEach(function(i){
    if(i.status==='paid') totalPaid+=parseFloat(i.total||0);
    else totalUnpaid+=parseFloat(i.total||0);
  });

  var editSection = isAdmin
    ? '<div style="background:var(--bg2);border-radius:var(--r);padding:1rem;margin-bottom:1rem;border:.5px solid var(--bdr)">'
      +'<div style="font-size:12px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.3px;margin-bottom:.6rem">Edit Customer Info</div>'
      +'<div class="fgrid3">'
      +'<div class="fg"><label>Name</label><input type="text" id="cm-name" value="'+esc(cust.name)+'"></div>'
      +'<div class="fg"><label>Email</label><input type="email" id="cm-email" value="'+esc(cust.email||'')+'"></div>'
      +'<div class="fg"><label>Phone</label><input type="tel" id="cm-phone" value="'+esc(cust.phone||'')+'"></div>'
      +'</div>'
      +'<div class="fg"><label>Address</label><input type="text" id="cm-address" value="'+esc(cust.address||'')+'" placeholder="Street, City, Country"></div>'
      +'<div style="display:flex;gap:7px;margin-top:.3rem">'
      +(cust.id ? '<button class="btn btn-p btn-sm" onclick="saveCustEdit('+cust.id+')"><i class="ti ti-check"></i>Save Changes</button>' : '')
      +'<button class="btn btn-sm btn-blue" onclick="newInvoiceForCust(\''+safeAttr(cust.name)+'\',\''+safeAttr(cust.phone||'')+'\')"><i class="ti ti-file-plus"></i>New Invoice</button>'
      +'</div>'
      +'</div>'
    : '<div style="margin-bottom:1rem;display:flex;gap:8px">'
      +'<button class="btn btn-sm btn-blue" onclick="newInvoiceForCust(\''+safeAttr(cust.name)+'\',\''+safeAttr(cust.phone||'')+'\')"><i class="ti ti-file-plus"></i>New Invoice for this Customer</button>'
      +'</div>';

  var invRows = invs.length
    ? invs.map(function(i){
        var items=(i.items||[]).map(function(it){ return esc(it.desc||it.description||''); }).filter(Boolean).join(', ');
        return '<tr>'
          +'<td style="color:var(--blue);font-weight:600">'+esc(i.invoice_number)+'</td>'
          +'<td>'+esc(i.date)+'</td>'
          +'<td>'+esc(i.due_date||'')+'</td>'
          +'<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+items+'">'+(items||'—')+'</td>'
          +'<td style="font-weight:600">'+fmt(i.total)+'</td>'
          +'<td><span class="badge '+(i.status==='paid'?'bs':i.status==='overdue'?'bd':'bw')+'">'+esc(i.status)+'</span></td>'
          +'<td><div style="display:flex;gap:4px">'
          +'<button class="btn btn-sm" onclick="downloadPDF('+i.id+')" style="color:var(--red)"><i class="ti ti-file-type-pdf"></i>PDF</button>'
          +(i.status!=='paid'?'<button class="btn btn-sm btn-green" onclick="markPaid('+i.id+',function(){ openCustModal(\''+safeAttr(cust.name)+'\'); })"><i class="ti ti-check"></i>Paid</button>':'')
          +(isAdmin?'<button class="btn btn-sm btn-blue" onclick="closeEdit||null;openEdit('+i.id+')"><i class="ti ti-edit"></i>Edit</button>':'')
          +'</div></td></tr>';
      }).join('')
    : '<tr><td colspan="7" class="empty">No invoices yet.</td></tr>';

  g('cust-modal-body').innerHTML =
    '<div class="modal-hdr">'
    +'<h2 style="display:flex;align-items:center;gap:8px"><i class="ti ti-user-circle" style="font-size:20px;color:var(--blue)"></i>'+esc(cust.name)+'</h2>'
    +'<button class="btn btn-sm btn-icon" onclick="closeCustModal()"><i class="ti ti-x"></i></button>'
    +'</div>'
    // Metrics
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:1rem">'
    +'<div class="mc"><div class="mc-label">Total Invoices</div><div class="mc-val">'+invs.length+'</div></div>'
    +'<div class="mc"><div class="mc-label">Total Paid</div><div class="mc-val" style="color:var(--green)">'+fmt(totalPaid)+'</div></div>'
    +'<div class="mc"><div class="mc-label">Outstanding</div><div class="mc-val" style="color:var(--warn)">'+fmt(totalUnpaid)+'</div></div>'
    +'</div>'
    // Edit section
    + editSection
    // Invoice table
    +'<div class="ct" style="margin-bottom:.5rem">Invoice History</div>'
    +'<div class="table-wrap"><table>'
    +'<thead><tr><th>Invoice #</th><th>Date</th><th>Due</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>'
    +'<tbody>'+invRows+'</tbody>'
    +'</table></div>';
}

function saveCustEdit(cid){
  var payload={
    name:    g('cm-name').value.trim(),
    email:   g('cm-email').value.trim(),
    phone:   g('cm-phone').value.trim(),
    address: g('cm-address').value.trim()
  };
  if(!payload.name){ alert('Name required.'); return; }
  api('PUT','/api/customers/'+cid,payload,function(err,updated){
    if(err){ toast('Save failed: '+err, false); return; }
    var idx=S.customers.findIndex(function(c){ return c.id===cid; });
    if(idx>-1) S.customers[idx]=updated;
    // Update all invoices with old name
    var oldName=_custModalName;
    if(oldName && oldName!==updated.name){
      S.invoices.forEach(function(i){ if(i.customer_name===oldName) i.customer_name=updated.name; });
    }
    _custModalName=updated.name;
    toast('Customer updated!');
    openCustModal(updated.name);
    renderCustomers(); renderInvoices(); renderDashboard();
  });
}

function newInvoiceForCust(name, phone){
  closeCustModal();
  nav('new-invoice', document.querySelectorAll('.nav-item')[2]);
  setTimeout(function(){
    resetForm({customer_name:name, customer_phone:phone||''});
  }, 50);
}

// ── Click-outside handlers ────────────────────────────────────────
document.addEventListener('click',function(e){
  var p=g('admin-panel'), b=g('admin-btn');
  if(p&&p.style.display==='block'&&!p.contains(e.target)&&b&&!b.contains(e.target))
    p.style.display='none';
});
g('edit-overlay').addEventListener('click',function(e){
  if(e.target===g('edit-overlay')) closeEdit();
});
g('cust-modal-overlay').addEventListener('click',function(e){
  if(e.target===g('cust-modal-overlay')) closeCustModal();
});

// ── Init ──────────────────────────────────────────────────────────
(function(){
  // Check if already logged in
  api('GET','/api/me',null,function(err,data){
    if(!err && data.user){
      S.currentUser=data.user;
      g('login-overlay').style.display='none';
      g('cur-user-badge').textContent=data.user.name+(data.user.role==='admin'?' (admin)':'');
      g('admin-btn').style.display=data.user.role==='admin'?'flex':'none';
      loadAll();
    } else {
      g('login-overlay').style.display='flex';
    }
  });
  g('l-pass').addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
})();