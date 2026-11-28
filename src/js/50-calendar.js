  // ---------- Year at a glance ----------
  var FEASTS_FIXED=[
    [9,8,"Nativity of the Theotokos","blue"],
    [9,14,"Exaltation of the Cross","red"],
    [11,21,"Entry of the Theotokos","blue"],
    [12,25,"Nativity of Christ","white"],
    [1,6,"Theophany of the Lord","white"],
    [2,2,"Meeting of the Lord","blue"],
    [3,25,"Annunciation","blue"],
    [8,6,"Transfiguration","white"],
    [8,15,"Dormition of the Theotokos","blue"]
  ];
  function addD(d,n){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n); }
  function yearEvents(y){
    var o=calOffsetDays(), feasts=[], fasts=[];
    for(var yy=y-1; yy<=y; yy++){
      FEASTS_FIXED.forEach(function(f){
        var d=new Date(yy, f[0]-1, f[1]+o);
        if(d.getFullYear()===y) feasts.push({d:d, name:f[2], lit:f[3]});
      });
    }
    var P=paschaCivil(y);
    feasts.push({d:addD(P,-7), name:"Palm Sunday — Entry into Jerusalem", lit:"green"});
    feasts.push({d:P, name:"PASCHA — the Resurrection of Christ", lit:"white", pascha:true});
    feasts.push({d:addD(P,39), name:"Ascension of the Lord", lit:"white"});
    feasts.push({d:addD(P,49), name:"Pentecost — Day of the Holy Trinity", lit:"green"});
    feasts.sort(function(a,b){ return a.d-b.d; });
    for(var y2=y-1; y2<=y; y2++){
      var Py=paschaCivil(y2);
      [ {name:"Great Lent & Holy Week", s:addD(Py,-48), e:addD(Py,-1)},
        {name:"Apostles’ Fast",         s:addD(Py,57),  e:new Date(y2,5,28+o)},
        {name:"Dormition Fast",         s:new Date(y2,7,1+o),  e:new Date(y2,7,14+o)},
        {name:"Nativity Fast",          s:new Date(y2,10,15+o), e:new Date(y2,11,24+o)}
      ].forEach(function(r){
        if(r.e<r.s) return;                                        // NS years can lose the Apostles' Fast
        if(r.e.getFullYear()>=y && r.s.getFullYear()<=y) fasts.push(r);
      });
    }
    fasts.sort(function(a,b){ return a.s-b.s; });
    return {feasts:feasts, fasts:fasts};
  }
  var yearShown=null;
  function fmtYD(d){ return d.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"}); }
  function fmtYR(r){
    var days=Math.round((r.e-r.s)/86400000)+1, opt={day:"numeric",month:"short"};
    var s=r.s.toLocaleDateString("en-AU",opt)+(r.s.getFullYear()!==yearShown? " "+r.s.getFullYear() : "");
    var e=r.e.toLocaleDateString("en-AU",opt)+(r.e.getFullYear()!==yearShown? " "+r.e.getFullYear() : "");
    return s+" – "+e+" · "+days+" days";
  }

  // ---------- Calendar view: month · week · year, a day panel and the fasting notes ----------
  var calMonth=null, calSel=null, calPane="month", calSyncedTo=null;
  function fastLog(){ return jget("user:fastlog", {}) || {}; }
  function syncCalToDay(force){
    // The calendar opens on the day being read; if that day has not changed, the reader's place is kept.
    if(force || !calSel || calSyncedTo!==state.date.getTime()){
      calSel=dayOnly(state.date); calMonth=new Date(calSel.getFullYear(), calSel.getMonth(), 1);
      calSyncedTo=state.date.getTime(); yearShown=calSel.getFullYear();
    }
  }
  function openCalendar(){
    syncCalToDay(true);
    if(state.tab==="calendar") renderCalendar(); else showTab("calendar");
  }
  function openDay(d){
    state.date=dayOnly(d); syncTodayBtn();
    showTab("today"); window.scrollTo(0,0); load();
  }
  function selectDay(d, reveal){
    calSel=dayOnly(d);
    if(!calMonth || calSel.getMonth()!==calMonth.getMonth() || calSel.getFullYear()!==calMonth.getFullYear())
      calMonth=new Date(calSel.getFullYear(), calSel.getMonth(), 1);
    renderCalendar();
    if(reveal) revealPanel();
  }
  function revealPanel(){
    var p=el("dayPanel"); if(p.classList.contains("hidden")) return;
    var r=p.getBoundingClientRect(), bottom=window.innerHeight-(el("tabs").offsetHeight||62);
    if(r.top > bottom-110){
      var smooth=!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
      try{ p.scrollIntoView({block:"nearest", behavior: smooth ? "smooth" : "auto"}); }catch(e){ p.scrollIntoView(false); }
    }
  }
  function renderCalendar(){
    if(!calSel) syncCalToDay(true);
    each("#calSeg button", function(b){ b.classList.toggle("active", b.getAttribute("data-pane")===calPane); });
    show(el("calMonthPane"), calPane==="month"); show(el("calWeekPane"), calPane==="week"); show(el("calYearPane"), calPane==="year");
    if(calPane==="month") renderCal();
    if(calPane==="week") renderWeek();
    if(calPane==="year"){ if(!yearShown) yearShown=calMonth.getFullYear(); renderYear(); }
    show(el("dayPanel"), calPane!=="year");
    renderDayPanel(); renderFastCard();
  }
  each("#calSeg button", function(b){ b.addEventListener("click", function(){
    calPane=b.getAttribute("data-pane"); if(calPane==="year") yearShown=calMonth.getFullYear(); renderCalendar();
  }); });

  function renderCal(){
    var y=calMonth.getFullYear(), mo=calMonth.getMonth();
    el("calTitle").textContent = calMonth.toLocaleDateString("en-AU",{month:"long"});
    el("calYearBtn").textContent = String(y);
    var first=new Date(y,mo,1);
    var startOffset=(first.getDay()+6)%7;                            // Monday-start grid
    var start=new Date(y,mo,1-startOffset);
    var today=startOfToday(), log=fastLog();
    var grid=el("calGrid"); grid.innerHTML="";
    ["M","T","W","T","F","S","S"].forEach(function(wd){ grid.appendChild(mk("div","cwd",wd)); });
    for(var i=0;i<42;i++){
      var d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
      var dr=dayRule(d), r=dr.r;
      var cell=mk("button","cd"+(r.f===1?" f1":"")+(r.f===2?" f2":"")+(dr.cat!=="free"?" cat-"+dr.cat:"")+
        (d.getMonth()!==mo?" om":"")+(sameDay(d,today)?" tod":"")+(sameDay(d,calSel)?" sel":""));
      var li=litInfo(d, null);
      cell.appendChild(mk("span","n",String(d.getDate())));
      if(r.feast) cell.appendChild(mk("span","mk","✚"));
      // A dot for the colour of a feast, of Great Lent and of the Paschal season (ordinary gold days and the red of the
      // other fasts are left plain, so that the fasting colours stay readable)
      if(LIT_DOT[li.key] && (li.basis==="feast" || (li.basis==="season" && li.key!=="red" && li.key!=="gold"))){
        var dot=mk("span","ld"+(li.key==="black"?" blk":"")); dot.style.background=LIT_DOT[li.key]; cell.appendChild(dot);
      }
      var note=log[isoKey(d)];
      if(note) cell.appendChild(mk("span","kept", note==="k" ? "✓" : "½"));
      cell.setAttribute("aria-label", d.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})+" — "+dr.label+(r.feast?" — "+r.feast:""));
      if(r.feast) cell.title=r.feast;
      (function(dd){ cell.addEventListener("click", function(){
        if(sameDay(dd,calSel)) openDay(dd); else selectDay(dd, true);   // first tap selects, second opens
      }); })(d);
      grid.appendChild(cell);
    }
  }
  function calNav(n){ calMonth=new Date(calMonth.getFullYear(), calMonth.getMonth()+n, 1); renderCalendar(); }

  function weekStart(d){ var t=dayOnly(d); return new Date(t.getFullYear(), t.getMonth(), t.getDate()-((t.getDay()+6)%7)); }
  function renderWeek(){
    var s=weekStart(calSel), e=addD(s,6), today=startOfToday(), log=fastLog();
    var o1={day:"numeric",month:"short"}, o2={day:"numeric",month:"short",year:"numeric"};
    el("wkTitle").textContent = s.toLocaleDateString("en-AU",o1)+" – "+e.toLocaleDateString("en-AU",o2);
    var box=el("wkRows"); box.innerHTML="";
    for(var i=0;i<7;i++){
      var d=addD(s,i), dr=dayRule(d);
      var row=mk("button","wrow"+(sameDay(d,today)?" tod":"")+(sameDay(d,calSel)?" sel":""));
      var wd=mk("span","wd"); wd.appendChild(mk("small","",d.toLocaleDateString("en-AU",{weekday:"short"}))); wd.appendChild(mk("b","",String(d.getDate())));
      row.appendChild(wd);
      var wx=mk("span","wx", dr.label);
      var sub=[tMonthDay(menaionOf(d))+" OS"]; if(dr.feast) sub.push(dr.feast);
      var note=log[isoKey(d)]; if(note) sub.push(note==="k" ? "You noted: kept" : "You noted: kept in part");
      wx.appendChild(mk("small","",sub.join(" · ")));
      row.appendChild(wx);
      var sw=mk("span","sw cat-"+dr.cat); sw.setAttribute("aria-hidden","true"); row.appendChild(sw);
      row.setAttribute("aria-label", d.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})+" — "+dr.label+(dr.feast?" — "+dr.feast:""));
      (function(dd){ row.addEventListener("click", function(){ if(sameDay(dd,calSel)) openDay(dd); else selectDay(dd, true); }); })(d);
      box.appendChild(row);
    }
  }
  function renderYear(){
    el("yrTitle").textContent=String(yearShown);
    var ev=yearEvents(yearShown), b=el("yrBody"); b.innerHTML="";
    b.appendChild(mk("p","eyebrow","The Great Feasts"));
    ev.feasts.forEach(function(f){
      var r=mk("button","yrow"+(f.pascha?" pascha":""));
      var dot=mk("span","ydot ydot-"+f.lit); dot.style.background=LIT_DOT[f.lit]||LIT_DOT.gold; r.appendChild(dot);
      r.appendChild(mk("span","ynm",f.name));
      r.appendChild(mk("span","ydt",fmtYD(f.d)));
      r.addEventListener("click", function(){ openDay(f.d); });
      b.appendChild(r);
    });
    b.appendChild(mk("p","eyebrow","The Fasting Seasons"));
    ev.fasts.forEach(function(f){
      var r=mk("div","yfast");
      r.appendChild(mk("span","ynm",f.name));
      r.appendChild(mk("span","ydt2",fmtYR(f)));
      b.appendChild(r);
    });
  }
  function renderDayPanel(){
    var dr=dayRule(calSel), tone=toneOfWeek(calSel);
    el("dpDate").textContent = fmtDate(calSel);
    el("dpSub").textContent = tMonthDay(menaionOf(calSel)) + ", Old Style" + (tone ? " · Tone " + tone : "");
    var pill=el("dpPill"); pill.className="pill cat-"+dr.cat; pill.textContent=dr.label;
    var why = (dr.why && !/^(saturday|sunday)$/i.test(dr.why)) ? dr.why.charAt(0).toUpperCase()+dr.why.slice(1) : "";
    var dpf = [dr.feast||"", (why && (!dr.feast || why.toLowerCase().indexOf(String(dr.feast).toLowerCase())<0)) ? why : ""].filter(Boolean).join(" · ");
    el("dpFeast").textContent = dpf; show(el("dpFeast"), !!dpf);
    show(el("dpJournal"), dr.r.f>0 && calSel<=startOfToday());   // a note can be made on the day or afterwards
    var cur=fastLog()[isoKey(calSel)] || "";
    each("#logSeg button", function(b){ b.classList.toggle("active", b.getAttribute("data-log")===cur); });
    var ta=el("fastNoteText");
    if(document.activeElement!==ta){ ta.setAttribute("data-day", isoKey(calSel)); ta.value = fastNotes()[isoKey(calSel)] || ""; }
  }
  // A private written note for a fast day (user:fastnotes), kept on this device only
  function fastNotes(){ var o=jget("user:fastnotes", {}); return (o && typeof o==="object" && !Array.isArray(o)) ? o : {}; }
  var noteT=null;
  function saveFastNote(){
    clearTimeout(noteT);
    var ta=el("fastNoteText"), o=fastNotes(), k=ta.getAttribute("data-day") || isoKey(calSel), v=ta.value.slice(0,500);
    if(v.trim()) o[k]=v; else delete o[k];
    jset("user:fastnotes", o);
  }
  el("fastNoteText").addEventListener("input", function(){ clearTimeout(noteT); noteT=setTimeout(saveFastNote, 400); });
  el("fastNoteText").addEventListener("blur", saveFastNote);
  each("#logSeg button", function(b){ b.addEventListener("click", function(){
    var log=fastLog(), k=isoKey(calSel), v=b.getAttribute("data-log");
    if(v) log[k]=v; else delete log[k];
    jset("user:fastlog", log); renderCalendar();
  }); });
  function renderFastCard(){
    var so=seasonOf(calSel);
    show(el("seasonBox"), !!so);
    if(so){
      el("seasonText").textContent = so.name+" — day "+so.day+" of "+so.len;
      el("seasonBar").style.width = Math.round(so.day/so.len*100)+"%";
    }
    var y=calSel.getFullYear(), mo=calSel.getMonth(), log=fastLog(), fastDays=0, kept=0, part=0;
    for(var d=new Date(y,mo,1); d.getMonth()===mo; d=addD(d,1)){
      if(fastRule(d).f>0) fastDays++;
      var n=log[isoKey(d)]; if(n==="k") kept++; else if(n==="p") part++;
    }
    var mname=calSel.toLocaleDateString("en-AU",{month:"long",year:"numeric"});
    var s=mname+": "+fastDays+(fastDays===1?" fast day":" fast days")+" by the general rule";
    if(kept||part) s+=". Your notes: "+kept+" kept"+(part ? ", "+part+" kept in part" : "");
    el("logSum").textContent = s+".";
  }
  el("calPrev").addEventListener("click", function(){ calNav(-1); });
  el("calNext").addEventListener("click", function(){ calNav(1); });
  el("wkPrev").addEventListener("click", function(){ selectDay(addD(calSel,-7)); });
  el("wkNext").addEventListener("click", function(){ selectDay(addD(calSel,7)); });
  el("dpOpen").addEventListener("click", function(){ openDay(calSel); });
  el("calYearBtn").addEventListener("click", function(){ calPane="year"; yearShown=calMonth.getFullYear(); renderCalendar(); });
  el("yrPrev").addEventListener("click", function(){ if(yearShown>1901){ yearShown--; renderYear(); } });
  el("yrNext").addEventListener("click", function(){ if(yearShown<2098){ yearShown++; renderYear(); } });
  el("yrShare").addEventListener("click", function(){ shareCanvas(buildYearTile(), "church-year-"+yearShown+".png"); });
  el("calTitle").addEventListener("click", function(){
    var dp=el("datePick"); dp.value = isoKey(calSel);
    if(dp.showPicker){ try{ dp.showPicker(); }catch(e){ dp.click(); } } else { dp.click(); }
  });
  el("datePick").addEventListener("change", function(){
    var v=el("datePick").value; if(!v) return;
    var p=v.split("-");
    selectDay(new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10)), true);
  });

