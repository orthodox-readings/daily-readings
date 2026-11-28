  // ---------- Settings view ----------
  function renderSettings(){
    paintPrefs(); paintTheme(); applyScale(); renderInstallRow();
    var days=0;
    try{ for(var i=0;i<localStorage.length;i++){ if(/^day:julian:/.test(localStorage.key(i)||"")) days++; } }catch(e){}
    var d=deviceData();
    el("dataLbl").textContent = plural(days,"day")+" of readings · "+countsText(d)+". Kept on this device only.";
    el("reviewQuotesSw").setAttribute("aria-checked", state.reviewQuotes ? "true" : "false");
    show(el("logosRow"), !!LOGOS_URL);
    if(LOGOS_URL) el("logosLink").setAttribute("href", LOGOS_URL);
    el("verLbl").textContent = " · Version "+APP_VERSION+" · build "+APP_BUILD;
    renderPackages(); paintBackupCard(); renderSources();
  }
  el("reviewQuotesSw").addEventListener("click", function(){
    state.reviewQuotes = !state.reviewQuotes;
    store.setItem("pref:reviewQuotes", state.reviewQuotes ? "1" : "0");
    el("reviewQuotesSw").setAttribute("aria-checked", state.reviewQuotes ? "true" : "false");
    renderQuote();
  });
  el("setCustomiseBtn").addEventListener("click", openCustomise);
  el("customiseBtn").addEventListener("click", openCustomise);

  // ---------- Sources & licences (data/sources.json, the content source registry) ----------
  var SOURCES=null;
  function renderSources(){
    var box=el("sourcesList");
    if(SOURCES){ paintSources(box); return; }
    fetchJSONWithRepair("data/sources.json").then(function(j){
      SOURCES = (j && Array.isArray(j.sources)) ? j.sources : [];
      paintSources(box);
    }).catch(function(){ box.textContent="The list of sources needs a connection the first time."; });
  }
  function paintSources(box){
    box.innerHTML="";
    var stats = (FATHERS && Array.isArray(FATHERS.quotes)) ? FATHERS.quotes.reduce(function(a,q){ a[quoteStatus(q)]=(a[quoteStatus(q)]||0)+1; return a; }, {}) : null;
    SOURCES.forEach(function(s){
      var det=document.createElement("details"); det.className="srcitem";
      var sum=document.createElement("summary"); sum.appendChild(mk("span","stitle",s.title||""));
      if(s.status) sum.appendChild(mk("span","stag"+(/paused/i.test(s.status) ? " paused" : (/link/i.test(s.status) ? " link" : "")), s.status));
      det.appendChild(sum);
      function line(label, value){ if(!value) return; var p=mk("p","sline"); p.appendChild(mk("b","",label+": ")); p.appendChild(document.createTextNode(value)); det.appendChild(p); }
      line("By", s.author); line("Edition", s.edition); line("Translation", s.translator); line("Publisher", s.publisher);
      line("Tradition", s.tradition); line("Used for", s.use); line("How", s.how); line("Licence", s.licence); line("Attribution", s.attribution);
      if(s.id==="sayings" && stats) line("In the collection", (stats.sourced||0)+" sourced · "+(stats.adapted||0)+" adapted · "+(stats.review||0)+" awaiting review (not shown unless turned on)");
      line("Checked", s.checked ? new Date(s.checked+"T00:00:00").toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"}) : "");
      line("Review", s.review);
      if(s.url){ var a=mk("a","",s.url.replace(/^https?:\/\//,"").replace(/\/$/,"")); a.href=s.url; a.target="_blank"; a.rel="noopener noreferrer"; var p=mk("p","sline"); p.appendChild(a); det.appendChild(p); }
      box.appendChild(det);
    });
  }

  // ---------- Support the Parish sheet ----------
  function openSupport(e){ if(e) e.preventDefault(); openSheet("supportOverlay"); }
  el("supportLink").addEventListener("click", openSupport);
  el("supportLink2").addEventListener("click", openSupport);
  each(".supcopy[data-copy]", function(b){
    b.addEventListener("click", function(){
      copyText(b.getAttribute("data-copy"), function(){
        b.classList.add("done"); b.textContent="✓";
        setTimeout(function(){ b.classList.remove("done"); b.textContent="Copy"; },1400);
      });
    });
  });

