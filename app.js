/* 2026 Marble Run registration site (GitHub Pages). Marble customiser + submission to the Google Apps Script inbox. */
const STATS = [
  {key:"mass", name:"Mass", ticks:["Light","Standard","Heavy"], why:{"-1":"Lighter: gets shoved around in crowds, but rides over rough patches and tips the seesaw decks less.","0":"Standard weight.","1":"Heavier: wins the shoving matches, but tips seesaw decks toward the slow side and climbs bumps less easily."}},
  {key:"bounce", name:"Bounce", ticks:["Dead","Standard","Lively"], why:{"-1":"Dead: steady through pins and bumpers, gains little from them.","0":"Standard bounce.","1":"Lively: scatters through pin fields and off bumpers. It can gain big, or bounce off a good line."}},
  {key:"grip", name:"Grip", ticks:["Slick","Standard","Grippy"], why:{"-1":"Slick: quick on smooth straights, slides wide on spinners and decks.","0":"Standard grip.","1":"Grippy: holds lines on spinners, decks and curves, loses a little on rough floors."}}];
const COLORS = ["#e63946","#ff7b1c","#ffcd3c","#3ccf5e","#16c2c2","#2f7bff","#7a3cff","#ff4fa3","#f4f1ff","#1b1b24","#8a5a2b","#9aa3b5"];
const PATTERNS = [["solid","Solid"],["stripe","Stripe"],["twin","Twin stripe"],["swirl","Swirl"],["dots","Dots"],["split","Split"],["checker","Checker"],["galaxy","Galaxy"]];
const TEAM_SPOTS = 8;
const defMarble = v => v==="A" ? {base:"#2f7bff", accent:"#f4f1ff", pattern:"stripe", image:null} : {base:"#ff4fa3", accent:"#ffcd3c", pattern:"swirl", image:null};
const S = {teams:[], draft:{name:"", team:"", mass:0, bounce:0, grip:0, A:defMarble("A"), B:defMarble("B")},
           code:"", submitted:false, editing:null, edit:null};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "");

/* ---------------- textures (1024x512 equirectangular, what the render wraps on the sphere) ---------------- */
const imgCache = new Map();
function loadImage(src){ if (imgCache.has(src)) return imgCache.get(src); const p = new Promise((res,rej)=>{ const i = new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; }); imgCache.set(src,p); return p; }
function paintPattern(g, W, H, m){
  g.fillStyle = m.base; g.fillRect(0,0,W,H);
  g.fillStyle = m.accent;
  const p = m.pattern;
  if (p==="stripe") g.fillRect(0, H*0.38, W, H*0.24);
  else if (p==="twin"){ g.fillRect(0,H*0.28,W,H*0.1); g.fillRect(0,H*0.62,W,H*0.1); }
  else if (p==="swirl"){ for (const off of [0, W/2]){ g.beginPath(); for (let x=0;x<=W;x+=8){ const y = H/2+Math.sin((x+off)/W*Math.PI*4)*H*0.26; x===0?g.moveTo(x,y-H*0.07):g.lineTo(x,y-H*0.07); } for (let x=W;x>=0;x-=8){ const y = H/2+Math.sin((x+off)/W*Math.PI*4)*H*0.26; g.lineTo(x,y+H*0.07); } g.closePath(); g.globalAlpha = off ? .55 : 1; g.fill(); g.globalAlpha = 1; } }
  else if (p==="dots"){ const r = H*0.055; for (let row=0; row<5; row++){ const y = H*(0.18+0.16*row); const n = Math.max(4, Math.round(12*Math.sin(Math.PI*y/H))); for (let i=0;i<n;i++){ const x = (i+(row%2?.5:0))*W/n; g.beginPath(); g.ellipse(x, y, r/Math.max(.35,Math.sin(Math.PI*y/H)), r, 0, 0, Math.PI*2); g.fill(); } } }
  else if (p==="split") g.fillRect(W/2, 0, W/2, H);
  else if (p==="checker"){ const cw = W/12, ch = H/6; for (let i=0;i<12;i++) for (let j=0;j<6;j++) if ((i+j)%2) g.fillRect(i*cw, j*ch, cw+1, ch+1); }
  else if (p==="galaxy"){ let seed = 7; const rnd = ()=>((seed = (seed*16807)%2147483647)/2147483647);
    const gr = g.createLinearGradient(0,0,W,0); gr.addColorStop(0,m.base); gr.addColorStop(.5,m.accent); gr.addColorStop(1,m.base); g.globalAlpha=.55; g.fillStyle=gr; g.fillRect(0,H*.25,W,H*.5); g.globalAlpha=1;
    g.fillStyle = "#ffffff"; for (let i=0;i<260;i++){ g.globalAlpha = .3+.7*rnd(); g.fillRect(rnd()*W, H*(.08+.84*rnd()), 2+rnd()*3, 2+rnd()*3); } g.globalAlpha = 1; }
}
async function buildTexture(m){
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512; const g = c.getContext("2d");
  if (m.image){
    g.fillStyle = m.base; g.fillRect(0,0,1024,512);
    const img = await loadImage(m.image);
    const s = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth-s)/2, sy = (img.naturalHeight-s)/2;
    g.drawImage(img, sx, sy, s, s, 0, 40, 512, 432);
    g.save(); g.translate(1024,0); g.scale(-1,1); g.drawImage(img, sx, sy, s, s, 0, 40, 512, 432); g.restore();
    g.fillStyle = m.base; g.fillRect(0,0,1024,44); g.fillRect(0,468,1024,44);
  } else paintPattern(g, 1024, 512, m);
  return c;
}
function texToData(c){ for (const q of [0.85,0.75,0.65,0.55]){ const d = c.toDataURL("image/jpeg", q); if (d.length < 180000) return d; }
  const s = document.createElement("canvas"); s.width = 768; s.height = 384; s.getContext("2d").drawImage(c,0,0,768,384); return s.toDataURL("image/jpeg", .6); }
async function fileToSquare(file){
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error("Choose a JPG or PNG picture.");
  if (file.size > 10*1024*1024) throw new Error("That picture is over 10 MB. Try a smaller copy.");
  const url = URL.createObjectURL(file);
  try { const img = await new Promise((res,rej)=>{ const i = new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error("That picture could not be read. Try a JPG or PNG.")); i.src=url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas"); c.width = c.height = 512;
    c.getContext("2d").drawImage(img, (img.naturalWidth-s)/2, (img.naturalHeight-s)/2, s, s, 0, 0, 512, 512);
    return c.toDataURL("image/jpeg", .85);
  } finally { URL.revokeObjectURL(url); }
}

/* ---------------- 3-D previews ---------------- */
const viewers = new Set();
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
function viewer(canvas){
  if (!window.THREE) return {setTexture(){}, dispose(){}};
  const r = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true}); r.setPixelRatio(Math.min(2, devicePixelRatio||1));
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28,1,.1,10); cam.position.set(0,.2,3.6);
  sc.add(new THREE.AmbientLight(0xffffff,.55)); const k = new THREE.DirectionalLight(0xffffff,.95); k.position.set(2,3,3); sc.add(k);
  const rim = new THREE.DirectionalLight(0xff8fd0,.35); rim.position.set(-3,1,-2); sc.add(rim);
  const mat = new THREE.MeshStandardMaterial({roughness:.16, metalness:.05}); const mesh = new THREE.Mesh(new THREE.SphereGeometry(1,64,32), mat); sc.add(mesh);
  const v = {canvas, r, sc, cam, mesh, mat,
    setTexture(src){ const t = new THREE.Texture(src); t.needsUpdate = true; if (mat.map) mat.map.dispose(); mat.map = t; mat.needsUpdate = true; },
    dispose(){ viewers.delete(v); if (mat.map) mat.map.dispose(); r.dispose(); }};
  viewers.add(v); return v;
}
(function frame(){
  for (const v of viewers){
    if (!v.canvas.isConnected){ v.dispose(); continue; }
    const w = v.canvas.clientWidth|0; if (w && v.canvas.width !== Math.round(w*v.r.getPixelRatio())) v.r.setSize(w, w, false);
    if (!still){ v.mesh.rotation.y += .012; v.mesh.rotation.x = Math.sin(performance.now()/1700)*.22; }
    v.r.render(v.sc, v.cam);
  }
  requestAnimationFrame(frame);
})();

/* ---------------- form ---------------- */
function renderStats(){
  const box = $("stats"); box.textContent = "";
  for (const st of STATS){
    const row = document.createElement("div"); row.className = "stat";
    const nm = document.createElement("label"); nm.className = "nm"; nm.textContent = st.name; nm.htmlFor = "st_"+st.key;
    const sl = document.createElement("div"); sl.className = "slider";
    const inp = document.createElement("input"); inp.type = "range"; inp.min = -1; inp.max = 1; inp.step = 1; inp.id = "st_"+st.key; inp.value = S.draft[st.key];
    const ticks = document.createElement("div"); ticks.className = "ticks";
    const why = document.createElement("div"); why.className = "why";
    const paint = ()=>{ const v = +inp.value; S.draft[st.key] = v; why.textContent = st.why[String(v)]; inp.setAttribute("aria-valuetext", st.ticks[v+1]);
      [...ticks.children].forEach((t,i)=>t.className = i===v+1 ? "on" : ""); };
    st.ticks.forEach(t=>{ const s = document.createElement("span"); s.textContent = t; ticks.append(s); });
    inp.oninput = ()=>{ paint(); saveDraft(); };
    sl.append(inp, ticks); row.append(nm, sl, why); box.append(row); paint();
  }
}
const cardViewers = {};
function renderMarbles(){
  const box = $("marbles"); box.textContent = "";
  for (const v of ["A","B"]){
    const card = document.createElement("div"); card.className = "mcard";
    const cv = document.createElement("canvas"); cv.className = "stage"; cv.setAttribute("role","img"); cv.setAttribute("aria-label","Marble "+v+" preview");
    const row = document.createElement("div"); row.className = "mrow";
    const t = document.createElement("span"); t.className = "tag"; t.textContent = "Marble "+v;
    const st = document.createElement("span"); st.id = "chip"+v; st.className = "chip";
    const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = "Customise"; b.id = "cust"+v; b.onclick = ()=>openSheet(v);
    row.append(t, st, b); card.append(cv, row); box.append(card);
    cardViewers[v] = viewer(cv); refreshCard(v);
  }
}
async function refreshCard(v){
  const c = await buildTexture(S.draft[v]); cardViewers[v]?.setTexture(c);
  const chip = $("chip"+v); chip.textContent = S.submitted ? "submitted" : "not submitted"; chip.className = "chip "+(S.submitted?"ok":"warn");
}
function saveDraft(){ try { localStorage.setItem("mr2026_draft", JSON.stringify({d:S.draft, code:S.code, submitted:S.submitted})); } catch(e){} }
function loadDraft(){ try { const x = JSON.parse(localStorage.getItem("mr2026_draft")||"null"); if (x && x.d){ Object.assign(S.draft, x.d); S.code = x.code||""; S.submitted = !!x.submitted; } } catch(e){} }

/* ---------------- customiser ---------------- */
let sheetViewer = null;
function swatches(boxId, key){
  const box = $(boxId); box.textContent = "";
  for (const c of COLORS){ const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.style.background = c; b.setAttribute("aria-label", c);
    b.setAttribute("aria-pressed", String(S.edit[key].toLowerCase()===c)); b.onclick = ()=>{ S.edit[key] = c; paintSheet(); }; box.append(b); }
  const pick = document.createElement("input"); pick.type = "color"; pick.value = S.edit[key]; pick.id = boxId+"Pick"; pick.setAttribute("aria-label","Custom colour");
  pick.oninput = ()=>{ S.edit[key] = pick.value; paintSheet(true); }; box.append(pick);
}
function patternButtons(){
  const box = $("pats"); box.textContent = "";
  for (const [k, label] of PATTERNS){
    const b = document.createElement("button"); b.type = "button"; b.className = "pat"; b.setAttribute("aria-pressed", String(!S.edit.image && S.edit.pattern===k));
    const c = document.createElement("canvas"); c.width = 128; c.height = 64; paintPattern(c.getContext("2d"), 128, 64, {...S.edit, pattern:k});
    const s = document.createElement("span"); s.textContent = label; b.append(c, s);
    b.onclick = ()=>{ S.edit.pattern = k; S.edit.image = null; paintSheet(); }; box.append(b);
  }
}
async function paintSheet(keepPickers){
  if (!keepPickers){ swatches("swBase","base"); swatches("swAccent","accent"); }
  patternButtons();
  $("clearImg").hidden = !S.edit.image;
  sheetViewer?.setTexture(await buildTexture(S.edit));
}
function openSheet(v){
  S.editing = v; S.edit = JSON.parse(JSON.stringify(S.draft[v]));
  $("sheetTitle").textContent = "Marble "+v; $("sheet").hidden = false;
  if (!sheetViewer) sheetViewer = viewer($("sheetStage"));
  paintSheet(); $("doneBtn").focus();
}
function closeSheet(){ $("sheet").hidden = true; S.editing = null; $("cust"+(S.lastEdit||"A"))?.focus(); }
$("cancelBtn").onclick = closeSheet;
$("sheet").addEventListener("keydown", e=>{ if (e.key==="Escape") closeSheet(); });
$("upload").onchange = async e=>{
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  try { S.edit.image = await fileToSquare(f); $("imgNote").textContent = "Picture added. Press Save marble to keep it."; paintSheet(true); }
  catch(err){ $("imgNote").textContent = err.message; }
};
$("clearImg").onclick = ()=>{ S.edit.image = null; paintSheet(true); };
$("doneBtn").onclick = async ()=>{
  const v = S.editing; S.lastEdit = v;
  S.draft[v] = S.edit; S.submitted = false; saveDraft(); closeSheet(); await refreshCard(v);
  setMsg("Marble "+v+" saved. Press Submit registration when your team is ready.", "");
};

/* ---------------- submitting (Google Apps Script web app -> your Google Drive + Sheet) ---------------- */
const ENDPOINT = (window.MR_CONFIG && window.MR_CONFIG.ENDPOINT) || "";
const LIVE = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(ENDPOINT);
function setMsg(t, cls){ const m = $("msg"); m.textContent = t; m.className = "msg"+(cls?" "+cls:""); }
async function call(params, body){
  const url = ENDPOINT+"?"+new URLSearchParams(params).toString();
  // text/plain keeps this a "simple" request (no CORS preflight), which Apps Script requires
  const r = await fetch(url, body ? {method:"POST", body:JSON.stringify(body), headers:{"Content-Type":"text/plain;charset=utf-8"}} : {});
  if (!r.ok) throw new Error("http "+r.status);
  return r.json();
}
async function submit(){
  S.draft.name = $("name").value; S.draft.team = $("team").value; saveDraft();
  const name = S.draft.name.trim(), team = S.draft.team.trim();
  if (!name || !team){ setMsg("Add your name and a team name, then press Submit.", "err"); (name ? $("team") : $("name")).focus(); return; }
  if (!LIVE){ setMsg("Registration isn't switched on yet. Check back soon!", "err"); return; }
  const btn = $("saveBtn"); btn.disabled = true; setMsg("Sending your entry…", "");
  try {
    const body = {name, team, mass:S.draft.mass, bounce:S.draft.bounce, grip:S.draft.grip, website:$("website").value,
                  code:($("editCode").value.trim() || S.code || "").toUpperCase(), marbles:{}, textures:{}};
    for (const v of ["A","B"]){ const m = S.draft[v];
      body.marbles[v] = {base:m.base, accent:m.accent, pattern:m.image ? "picture" : m.pattern};
      body.textures[v] = texToData(await buildTexture(m)); }
    const res = await call({action:"submit"}, body);
    if (res.ok){
      S.code = res.code; S.submitted = true; saveDraft();
      $("editBox").hidden = true; $("doneBox").hidden = false; $("codeOut").textContent = res.code;
      setMsg(res.updated ? "Your entry is updated." : "Your entry is in. Good luck on race day!", "ok");
      refreshCard("A"); refreshCard("B"); loadTeams();
    } else if (res.error === "team_taken"){
      $("editBox").hidden = false; $("editCode").focus();
      setMsg("That team name is taken. Enter its edit code or pick another name.", "err");
    } else if (res.error === "bad_code"){
      $("editBox").hidden = false; setMsg("That edit code doesn't match this team. Check it and try again.", "err");
    } else if (res.error === "closed"){
      setMsg("Registration is closed. Contact Josh if you still need to enter.", "err");
    } else setMsg(res.message || "Your entry couldn't be saved. Check the fields and try again.", "err");
  } catch(e){
    setMsg("Couldn't reach the registration server. Check your connection and press Submit again.", "err");
  } finally { btn.disabled = false; }
}
$("form").addEventListener("submit", e=>{ e.preventDefault(); submit(); });
for (const k of ["name","team"]) $(k).addEventListener("input", ()=>{ S.draft[k] = $(k).value; S.submitted = false; saveDraft(); });
document.addEventListener("input", e=>{ if (e.target.type === "range"){ S.submitted = false; saveDraft(); } });

/* ---------------- registered teams ---------------- */
function renderSpots(){
  const n = S.teams.length; const P = $("pips"); P.textContent = "";
  for (let i=0;i<TEAM_SPOTS;i++){ const s = document.createElement("span"); s.className = "pip"+(i<n?" on":""); P.append(s); }
  $("spotsTxt").textContent = !LIVE ? "Registration opens soon" : n >= TEAM_SPOTS ? `All ${TEAM_SPOTS} team spots claimed${n>TEAM_SPOTS?` · ${n-TEAM_SPOTS} on the waitlist`:""}` : `${n} of ${TEAM_SPOTS} team spots claimed`;
}
function renderField(){
  const F = $("field"); F.textContent = "";
  if (!S.teams.length){ const p = document.createElement("p"); p.className = "empty"; p.textContent = "No teams yet. Be the first: fill in the form above and press Submit."; F.append(p); }
  for (const t of S.teams){
    const d = document.createElement("div"); d.className = "team";
    const dots = document.createElement("div"); dots.className = "dots";
    for (const c of [t.a, t.b]){ const i = document.createElement("i"); i.style.background = /^#[0-9a-f]{6}$/i.test(c||"") ? c : "#666"; dots.append(i); }
    const b = document.createElement("b"); b.textContent = String(t.team||""); const s = document.createElement("span"); s.textContent = String(t.name||"");
    d.append(dots, b, s); F.append(d);
  }
  renderSpots();
}
async function loadTeams(){
  if (!LIVE){ renderSpots(); return; }
  try { const r = await call({action:"teams"}); if (r && r.ok){ S.teams = r.teams || []; renderField(); } }
  catch(e){ $("spotsTxt").textContent = "Couldn't load the team list right now."; }
}

/* ---------------- boot ---------------- */
loadDraft();
$("name").value = S.draft.name; $("team").value = S.draft.team;
if (S.code){ $("doneBox").hidden = false; $("codeOut").textContent = S.code; }
renderStats(); renderMarbles(); renderSpots(); loadTeams();
try { if (still){ const vid = $("bgvid"); vid.removeAttribute("autoplay"); vid.pause(); } } catch(e){}
