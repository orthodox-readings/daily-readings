  // ---------- Wisdom of the Fathers (bundled, rotates with the viewed day) ----------
  // fathers.json (format 2) gives each saying an id, its source and a status:
  //   "sourced"  the work (and where known the place in it) is identified and the wording is a faithful rendering
  //   "adapted"  the passage is identified but the wording is condensed or paraphrased (shown as "adapted")
  //   "review"   the source is not yet confirmed, or the attribution needs a priest's or scholar's review.
  //              These are left out of the daily rotation unless the reader asks for them in Settings,
  //              and are then marked "Source awaiting review". Nothing is ever attributed by guesswork.
  var FATHERS=null, currentQuote=null;
  function loadFathers(){
    fetchJSONWithRepair("fathers.json").then(function(j){
      FATHERS=j; if(lastRender) renderQuote();
    }).catch(function(){});
  }
  function quoteStatus(q){ return q.status || "sourced"; }
  function quotePool(){
    if(!FATHERS || !Array.isArray(FATHERS.quotes)) return [];
    return FATHERS.quotes.filter(function(q){ return state.reviewQuotes || quoteStatus(q)!=="review"; });
  }
  function quoteSource(q){
    // "Work, place · tr. Translator", with "adapted" where the wording is condensed
    var parts=[];
    if(q.work) parts.push(q.work + (q.ref ? ", " + q.ref : ""));
    else if(q.src && quoteStatus(q)!=="review") parts.push(q.src);
    if(quoteStatus(q)==="adapted" && !/adapted/i.test(parts.join(" "))) parts.push("adapted");
    return parts.join(" · ");
  }
  function quoteForDay(d){
    var pool=quotePool(); if(!pool.length) return null;
    var start=new Date(d.getFullYear(),0,1), doy=Math.round((dayOnly(d)-start)/86400000);
    return pool[((doy % pool.length)+pool.length) % pool.length];
  }
  function renderQuote(){
    var card=el("quoteCard");
    var q=quoteForDay(state.date);
    currentQuote=q;
    if(!q){ card.classList.add("hidden"); applyTodayLayoutSafe(); return; }
    el("quoteText").textContent="“"+q.q+"”";
    var by=el("quoteBy"); by.textContent=q.by;
    var src=quoteSource(q);
    if(src) by.appendChild(mk("small","",src));
    show(el("quoteStatus"), quoteStatus(q)==="review");
    var long = q.q.length > 220;   // long sayings fold to four lines
    el("quoteText").classList.toggle("clamped", long);
    show(el("quoteMore"), long);
    el("quoteMore").textContent = "Read the whole saying";
    paintQuoteFav();
    card.classList.remove("hidden");
    applyTodayLayoutSafe();
  }
  function applyTodayLayoutSafe(){ if(lastRender) applyTodayLayout(); }
  function quoteLine(q){
    q = q || currentQuote; if(!q) return "";
    var src=quoteSource(q);
    return "“"+q.q+"” — "+q.by+(src ? " ("+src+")" : "");
  }
  el("quoteMore").addEventListener("click", function(){
    var clamped = el("quoteText").classList.toggle("clamped");
    el("quoteMore").textContent = clamped ? "Read the whole saying" : "Show less";
  });

  // Saved sayings: a private list of ids on this device (user:favQuotes)
  function favQuotes(){ var a=jget("user:favQuotes", []); return Array.isArray(a) ? a : []; }
  function isFavQuote(q){ return !!q && !!q.id && favQuotes().indexOf(q.id)>-1; }
  function paintQuoteFav(){
    var on=isFavQuote(currentQuote), b=el("quoteFav");
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", on ? "Remove from saved sayings" : "Save this saying");
  }
  function toggleFavQuote(q){
    if(!q || !q.id) return false;
    var a=favQuotes(), i=a.indexOf(q.id);
    if(i>-1) a.splice(i,1); else a.push(q.id);
    jset("user:favQuotes", a); paintQuoteFav(); renderSavedQuotesSub();
    return i<0;
  }
  el("quoteFav").addEventListener("click", function(){
    var on=toggleFavQuote(currentQuote);
    toast(on ? "Saved to your sayings" : "Removed from your sayings");
  });
  function quoteById(id){
    if(!FATHERS || !Array.isArray(FATHERS.quotes)) return null;
    for(var i=0;i<FATHERS.quotes.length;i++) if(FATHERS.quotes[i].id===id) return FATHERS.quotes[i];
    return null;
  }
  function renderSavedQuotesSub(){
    var n=favQuotes().length;
    el("savedQuotesSub").textContent = n ? (n===1 ? "1 saying saved" : n+" sayings saved") : "Tap ♡ on a saying to keep it here";
  }
  function renderSavedQuotes(){
    var body=el("savedQuotesBody"); body.innerHTML="";
    var ids=favQuotes();
    if(!ids.length){ body.appendChild(mk("p","empty","No saved sayings yet. Tap ♡ on the Wisdom of the Fathers card to keep a saying here.")); return; }
    ids.slice().reverse().forEach(function(id){
      var q=quoteById(id); if(!q) return;
      var row=mk("div","sqrow");
      row.appendChild(mk("p","sqtext","“"+q.q+"”"));
      var by=mk("p","sqby",q.by); var src=quoteSource(q); if(src) by.appendChild(mk("small","",src)); row.appendChild(by);
      var acts=mk("div","sqacts");
      var cp=mk("button","linkbtn","Copy"); cp.addEventListener("click", function(){ copyText(quoteLine(q), function(){ toast("Copied"); }); });
      var sh=mk("button","linkbtn","Share"); sh.addEventListener("click", function(){ shareText(quoteLine(q)+"\n"+appURL(), "Wisdom of the Fathers"); });
      var rm=mk("button","linkbtn","Remove"); rm.addEventListener("click", function(){ toggleFavQuote(q); renderSavedQuotes(); });
      acts.appendChild(cp); acts.appendChild(sh); acts.appendChild(rm); row.appendChild(acts);
      body.appendChild(row);
    });
  }
  el("savedQuotesLink").addEventListener("click", function(){ renderSavedQuotes(); openSheet("savedQuotesSheet"); });

  // ---------- Lives of the Saints (Abbamoses notes carried by orthocal) ----------
  function renderLives(data){
    var stories=(data && (data.stories || data.lives)) || [];
    var lw=el("livesList"); lw.innerHTML="";
    (Array.isArray(stories)?stories:[]).forEach(function(st){
      var title=String((st && (st.title||st.name))||"").trim() || "Life";
      var text=String((st && (st.story||st.content||st.text))||"")
        .replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n\n")
        .replace(/<[^>]*>/g," ").replace(/[ \t]+/g," ").trim();
      if(!text) return;
      var det=document.createElement("details"); det.className="life";
      var sum=document.createElement("summary"); sum.textContent=title; det.appendChild(sum);
      var dv=document.createElement("div"); dv.className="ltext";
      text.split(/\n{2,}/).forEach(function(par){
        par=par.trim(); if(!par) return;
        var p=document.createElement("p"); p.textContent=par; dv.appendChild(p);
      });
      det.appendChild(dv); lw.appendChild(det);
    });
    show(el("livesCard"), lw.childNodes.length>0);
  }

  // ---------- Tone of the week (Octoechos) ----------
  // Thomas Sunday (Pascha + 7) begins Tone 1; the tone advances each Sunday and cycles 1–8
  // until the next Palm Sunday. Weekdays take the tone of the preceding Sunday.
  // No tone of the week from Palm Sunday through Bright Saturday.
  // Verified against OrthoChristian: 1 Mar 2026 = 5, 19 Apr = 1, 26 Apr = 2, 2 Aug = 8, 22 Nov = 8, 3 Jan 2027 = 6.
  function toneOfWeek(d){
    var t=new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var P=paschaCivil(t.getFullYear());
    var diff=Math.round((t-P)/86400000);
    if(diff<-7){ P=paschaCivil(t.getFullYear()-1); diff=Math.round((t-P)/86400000); }
    else if(diff<7) return null;
    return ((Math.floor(diff/7)-1)%8)+1;
  }

  // ---------- Daily prayers (Holy Myrrh-bearers): the prayers for this time of day come first ----------
  function renderPrayersLink(){
    var evening = new Date().getHours() >= 16, base="https://www.myrrh-bearers.org/";
    el("prayersTitle").textContent = evening ? "Prayers Before Sleep" : "Morning Prayers";
    el("prayersLink").setAttribute("href", base + (evening ? "evening.htm" : "morning.htm"));
    el("prayersLink").querySelector("use").setAttribute("href", evening ? "#i-moon" : "#i-candle");
    el("prayersAltTitle").textContent = evening ? "Morning Prayers" : "Prayers Before Sleep";
    el("prayersAltLink").setAttribute("href", base + (evening ? "morning.htm" : "evening.htm"));
    el("prayersAltLink").querySelector("use").setAttribute("href", evening ? "#i-candle" : "#i-moon");
  }

