
  // ---------- rendering the day ----------
  var LIT_NAME = { blue:"Blue", red:"Red", green:"Green", violet:"Violet", white:"White", gold:"Gold" };
  var LIT_DOT  = { burgundy:"#641E28", blue:"#2F4F86", red:"#A3262A", green:"#2F6B3F", violet:"#5B3A86", white:"#F3EEDF", gold:"#C5A46D" };
  var CAT_SHORT = { free:"No fast", fast:"Fast", strict:"Strict fast", fish:"Fish allowed", wine:"Wine & oil" };

  // The appointed Epistle and Gospel of the Liturgy are shown first and in full; other readings of the day
  // (Matins Gospel, Vespers readings, the Hours) are listed below them.
  function isLiturgyReading(r){ return /^(epistle|gospel)$/i.test(String(r.source||"").split(",")[0].trim()); }

  function render(data, opts){
    opts = opts || {};
    var dkey = keyOf(state.cal, state.date), keepOpen = [], livesOpen = [], othersOpen = false;
    if(lastRender && lastRender.key===dkey){          // same day again (fresh data, or a reading setting changed)
      each("#readings .reading, #otherReadings .reading", function(r,i){ if(r.classList.contains("open")) keepOpen.push(i); });
      each("#livesList .life", function(d,i){ if(d.open) livesOpen.push(i); });
      othersOpen = el("otherCard").classList.contains("open");
    }
    state.renderSeq++;                       // invalidates any in-flight NKJV/Greek swaps from a previous day
    lastRender = { data: data, opts: opts, key: dkey }; // lets the reading controls re-render instantly
    var t0 = dayOnly(state.date);
    var dEl=el("date"); dEl.textContent="";            // weekday as a small line above the date
    dEl.appendChild(mk("span","wd",state.date.toLocaleDateString("en-AU",{weekday:"long"})));
    dEl.appendChild(document.createTextNode(" "));
    dEl.appendChild(mk("span","dmy",state.date.toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})));
    var tone = toneOfWeek(state.date);
    // non-breaking spaces keep "Old Style" and "Tone 8" whole on narrow screens
    el("altdate").textContent = tMonthDay(menaionOf(state.date)).replace(" ", " ") + ", Old Style" + (tone ? " · Tone " + tone : "");

    // Season: worked out from the Paschalion and the Old Style date (the same engines as the Calendar).
    var season = liturgicalSeason(t0);
    el("tdSeason").textContent = season.name;
    el("tdSeasonSub").textContent = season.detail || "";
    show(el("tdSeasonSub"), !!season.detail);

    // Without the day's data the app shows only what it can work out exactly — the dates, the tone, the
    // season and a great feast. Readings, saints and the day's own fast are never guessed.
    var rule = dayRule(t0);
    el("summary").textContent = data ? ((data.summary_title || (data.titles && data.titles[0])) || "") : (rule.feast || "");

    // Fast — when the calendar notes no relaxation, the traditional strict norm applies; say so.
    var fdesc = (data && (data.fast_level_desc || data.fast_level_description)) || "";
    var fexc  = (data && (data.fast_exception_desc || (data.fast_exception && String(data.fast_exception)))) || "";
    var isFastDay = /fast/i.test(fdesc) && !/no fast|fast[\s-]?free/i.test(fdesc);
    var hasExc = !!(fexc && fexc !== "0");
    // An allowance only means something on an actual fast day. Some calendar records
    // carry a great saint's allowance (e.g. St Vladimir: fish) that applies only when
    // his feast falls on a Wednesday or Friday — on non-fast years it must be suppressed.
    var showExc = hasExc && isFastDay, cat;
    el("fastWrap").classList.remove("hidden","strict");
    el("fastDay").textContent = "";
    if(!data){
      cat = "none";
      el("fastKey").textContent = "Fasting";
      el("fastText").textContent = "Not available without a connection";
      el("fastExc").textContent = " · the Calendar tab shows the Church’s general rule";
    } else {
      el("fastKey").textContent = "Fasting";
      el("fastText").textContent = fdesc || "—";
      if(showExc){
        cat = /fish|caviar/i.test(fexc) ? "fish" : (/wine|oil/i.test(fexc) ? "wine" : "fast");
        el("fastExc").textContent = " · " + fexc;
      } else if(isFastDay){
        cat = "strict";
        el("fastWrap").classList.add("strict");
        el("fastExc").textContent = " · traditionally strict — many saints’ days allow wine & oil";
      } else {
        cat = "free";
        el("fastExc").textContent = (hasExc && /fast[\s-]?free/i.test(fexc)) ? " · fast-free week" : "";
      }
    }
    el("fastWrap").setAttribute("data-cat", cat);
    el("fastDot").style.background = cat==="none" ? "transparent" : "var(--k-"+cat+")";
    el("tdSeasonDot").style.background = season.fast ? "var(--k-fast)" : "var(--gold)";

    // Commemorations — show the FULL list: union of titles + feasts + saints (deduped), minus the headline
    var summary = el("summary").textContent;
    var seen = {}, list = [];
    function addCommem(v){
      if(v==null) return;
      v = String(v).trim(); if(!v) return;
      // Data hygiene: some feed entries arrive with the same text doubled
      // ("X X" — e.g. Righteous Anna, 23 Jul OS 2026). Collapse exact self-repeats.
      var half = Math.floor(v.length/2);
      if(half>3 && v.slice(0,half).trim() === v.slice(half).trim()) v = v.slice(0,half).trim();
      var k = v.toLowerCase();
      if(seen[k]) return; seen[k] = 1;
      if(v === summary) return;         // already shown as the headline
      list.push(v);
    }
    (data && Array.isArray(data.titles) ? data.titles : []).forEach(addCommem);
    ["feasts","saints"].forEach(function(k){
      if(data && Array.isArray(data[k])) data[k].forEach(function(x){
        addCommem(typeof x === "string" ? x : (x && (x.title || x.name || x.feast_name)));
      });
    });
    var ul = el("commemList"); ul.innerHTML="";
    list.forEach(function(t){ ul.appendChild(mk("li", "", t)); });
    // Parish supplement: ROCOR commemorations the upstream data lacks (see SUPPLEMENT)
    var supp = data ? supplementFor(state.date, [summary].concat(list)) : [];
    supp.forEach(function(t){ ul.appendChild(mk("li", "supp", t)); });
    show(el("commemSuppNote"), supp.length>0);
    el("commemLink").setAttribute("href", orthoChristianURL(state.date));
    el("commemCount").textContent = String(list.length+supp.length);
    var peek = list.filter(function(t){ return !/^begin/i.test(t); });
    el("commemPeek").textContent = (peek[0] || list[0] || supp[0] || "") + ((list.length+supp.length)>1 ? " …" : "");

    // Service notes
    var notes = data && data.service_notes;
    if(Array.isArray(notes)) notes = notes.filter(Boolean).join(" · ");
    el("notesText").textContent = notes || "";

    // Readings: the Liturgy Epistle and Gospel first, then the day's other readings
    var wrap = el("readings"), others = el("otherReadings");
    wrap.innerHTML=""; others.innerHTML="";
    wrap.className = "lang-"+state.lang; others.className = "cbody lang-"+state.lang;
    var readings = (data && data.readings) || [];
    if(!data){
      var off=mk("div","card"); off.id="offlineDay";
      off.appendChild(mk("p","eyebrow","Readings and saints"));
      var op=mk("p","note","The readings, saints and fast of this day need a connection the first time. Days you have opened, and the days you save in Settings → Offline reading, are kept on this device. The New Testament can be read in the Scripture tab.");
      op.style.margin="8px 0 0"; off.appendChild(op);
      wrap.appendChild(off);
    } else if(readings.length===0){
      var none=mk("div","card","No readings are listed for this day."); none.style.color="var(--muted2)";
      wrap.appendChild(none);
    }
    var main = readings.filter(isLiturgyReading), rest = readings.filter(function(r){ return !isLiturgyReading(r); });
    if(!main.length){ main = rest; rest = []; }          // a day without a Liturgy (e.g. Great Friday): show what is appointed
    var idx = 0;
    main.concat(rest).forEach(function(r){
      var i = idx++;
      var card=mk("div","reading"+(keepOpen.indexOf(i)>-1 ? " open" : "")+(i<main.length ? " primary" : ""));
      var head=mk("div","head"), h=mk("div","h");
      // Full lectionary label: e.g. "Vespers", "6th Matins Gospel", "Epistle — Apostles"
      var qual = String(r.desc || r.description || r.commemorated || "").trim();
      var srcLabel = String(r.source || "").trim();
      if(srcLabel.indexOf(",") > -1 && !qual){
        var sp = srcLabel.split(/,\s*/); srcLabel = sp[0]; qual = sp.slice(1).join(", ");
      }
      var fullLabel = srcLabel + (qual ? " — " + qual : "");
      if(fullLabel) h.appendChild(mk("div","src",fullLabel));
      var disp = r.display||r.short_display||"";
      var ref=mk("div","ref", disp||"Reading");
      var badge=mk("span","ver","KJV");
      ref.appendChild(badge); h.appendChild(ref); head.appendChild(h);
      head.appendChild(mk("span","chev","▼"));
      head.setAttribute("role","button"); head.setAttribute("tabindex","0");
      head.setAttribute("aria-expanded", keepOpen.indexOf(i)>-1 ? "true" : "false");
      function toggle(){ card.classList.toggle("open"); head.setAttribute("aria-expanded", card.classList.contains("open") ? "true":"false"); syncOpenAll(); }
      head.addEventListener("click", toggle);
      head.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(); } });
      card.appendChild(head);

      var body=mk("div","body"), txt=mk("div","txt");
      renderPassageKJV(txt, r);
      body.appendChild(txt);
      var pr = parseRef(disp);
      if(pr && pr.book>=40){
        var more=mk("button","linkbtn more","Read all of "+ntInfo(pr.book)[1]+" "+pr.segs[0].c+" →");
        more.addEventListener("click", function(){ openReader(pr.book, pr.segs[0].c, pr.segs[0].a, true); });
        body.appendChild(more);
      }
      card.appendChild(body);
      (i<main.length ? wrap : others).appendChild(card);

      if(state.lang!=="en") applyGreek(txt, disp, state.renderSeq);
      if(NKJV_ENABLED && state.txt==="nkjv") applyNKJV(txt, badge, disp, state.renderSeq);
    });
    el("otherCount").textContent = rest.length ? String(rest.length) : "";
    el("otherCard").classList.toggle("open", othersOpen);
    el("otherHead").setAttribute("aria-expanded", othersOpen ? "true" : "false");

    // Reading tools: language and size sit with the readings; open-all only when several
    show(el("readingsCtl"), readings.length>0);
    show(el("openAllBtn"), main.length>1);
    syncOpenAll();
    var gn=el("gkEdNote");
    gn.textContent = "Greek text: " + GK_ED[state.gkEd].cite + ".";
    show(gn, readings.length>0 && state.lang!=="en");

    // Liturgical colour, lives, tracker, links, quote, St Theophan
    applyLit(liturgicalKey(state.date, data, fdesc));
    renderLives(data);
    each("#livesList .life", function(d,i){ if(livesOpen.indexOf(i)>-1) d.open=true; });
    renderTracker(fdesc);
    renderPrayersLink();
    el("studyFor").textContent = "For " + state.date.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"});
    el("troparLink").setAttribute("href", htmURL(state.date));
    el("tdHymns").setAttribute("href", htmURL(state.date));
    el("prologueLink").setAttribute("href", prologueURL(state.date));
    renderAzbyka();
    renderQuote();
    renderTheophan(readings);

    // What is shown depends on the day's content and on the reader's own choice (Customise Today)
    el("commemCard").setAttribute("data-has", (list.length+supp.length)>0 ? "1" : "");
    el("notesCard").setAttribute("data-has", notes ? "1" : "");
    el("otherCard").setAttribute("data-has", rest.length ? "1" : "");
    applyTodayLayout();

    var stamp = !data ? "Not connected" : (opts.cached ? ("Saved copy" + (opts.when? " · "+opts.when : "")) : ("Updated " + new Date().toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})));
    el("stamp").textContent = stamp;

    show(el("content"), true);
    el("loading").classList.add("hidden");
  }
  function syncOpenAll(){
    var rs=document.querySelectorAll("#readings .reading");
    var anyClosed=Array.prototype.some.call(rs, function(r){ return !r.classList.contains("open"); });
    el("openAllBtn").textContent = anyClosed ? "Open all" : "Close all";
  }

  // ---------- Customise Today: which supplementary sections appear ----------
  // The date, season, fast and the Epistle and Gospel always show. A section with nothing to show for the day
  // (no service notes, say) stays hidden whatever the choice.
  var TODAY_SECTIONS = [
    {id:"prayers", name:"Morning and evening prayers", sub:"Links to the day’s prayers"},
    {id:"others",  name:"Other readings of the day", sub:"Matins Gospel, Vespers readings and others"},
    {id:"saints",  name:"Saints of the Day", sub:"Commemorations and Lives of the Saints"},
    {id:"hymns",   name:"Troparia and kontakia", sub:"Link to the day’s hymns"},
    {id:"wisdom",  name:"Wisdom of the Fathers", sub:"A saying for the day"},
    {id:"tracker", name:"Next feast and Pascha", sub:"Countdown in the date card"},
    {id:"notes",   name:"Service notes", sub:"When the calendar gives them"},
    {id:"more",    name:"More for this day", sub:"St Theophan, the Prologue, service texts"}
  ];
  function sectionOn(id){ return state.todayHide.indexOf(id)<0; }
  function applyTodayLayout(){
    each("#view-today [data-sec]", function(n){
      var id=n.getAttribute("data-sec"), on=sectionOn(id);
      if(n.hasAttribute("data-has") && !n.getAttribute("data-has")) on=false;
      if(id==="wisdom" && !currentQuote) on=false;
      show(n, on);
    });
  }
  function renderCustomise(){
    var box=el("custList"); box.innerHTML="";
    TODAY_SECTIONS.forEach(function(s){
      var row=mk("div","srow"), lab=mk("span","sl",s.name); lab.appendChild(mk("small","",s.sub));
      var sw=mk("button","switch"); sw.setAttribute("role","switch"); sw.setAttribute("aria-label", s.name);
      sw.setAttribute("aria-checked", sectionOn(s.id) ? "true" : "false"); sw.setAttribute("data-sec-id", s.id);
      sw.appendChild(mk("span"));
      sw.addEventListener("click", function(){
        var on = sw.getAttribute("aria-checked")!=="true";
        sw.setAttribute("aria-checked", on ? "true" : "false");
        state.todayHide = state.todayHide.filter(function(x){ return x!==s.id; });
        if(!on) state.todayHide.push(s.id);
        jset("pref:todayHide", state.todayHide);
        applyTodayLayout();
      });
      row.appendChild(lab); row.appendChild(sw); box.appendChild(row);
    });
  }
  function openCustomise(){ renderCustomise(); openSheet("customiseSheet"); }
