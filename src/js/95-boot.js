  // ---------- day navigation ----------
  function goDays(n){ state.date=new Date(state.date.getFullYear(),state.date.getMonth(),state.date.getDate()+n); syncTodayBtn(); load(); }
  function goToday(){ state.date=startOfToday(); syncTodayBtn(); load(); }
  function syncTodayBtn(){ el("today").classList.toggle("hidden", isToday(state.date)); }

  el("prev").addEventListener("click", function(){ goDays(-1); });
  el("next").addEventListener("click", function(){ goDays(1); });
  el("today").addEventListener("click", goToday);
  el("date").addEventListener("click", openCalendar);
  el("calBtn").addEventListener("click", openCalendar);
  function openShare(ctx){
    el("shareTitle").textContent = ctx==="quote" ? "Share the saying" : "Share this day";
    var first=true;
    each("#shareMenu .arow", function(r){
      var on=r.getAttribute("data-ctx")===ctx; show(r, on);
      r.classList.toggle("first", on && first); if(on) first=false;
    });
    openSheet("shareMenu");
  }
  el("shareBtn").addEventListener("click", function(){ openShare("day"); });
  el("quoteShare").addEventListener("click", function(){ openShare("quote"); });
  el("shareTextBtn").addEventListener("click", function(){ closeLayer(); shareDay(); });
  el("shareDayBtn").addEventListener("click", function(){ closeLayer(); shareTile("day"); });
  el("shareWisdomBtn").addEventListener("click", function(){ closeLayer(); shareTile("wisdom"); });
  el("shareQuoteTextBtn").addEventListener("click", function(){ closeLayer(); var q=quoteLine(); if(q) shareText(q+"\n"+appURL(), "Wisdom of the Fathers"); });
  el("copyQuoteBtn").addEventListener("click", function(){ closeLayer(); var q=quoteLine(); if(q) copyText(q, function(){ toast("Copied"); }); });
  function toggleCommem(){
    var open=el("commemCard").classList.toggle("open");
    el("commemHead").setAttribute("aria-expanded", open ? "true" : "false");
  }
  el("commemHead").addEventListener("click", toggleCommem);
  el("commemHead").addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggleCommem(); } });
  function toggleOthers(){
    var open=el("otherCard").classList.toggle("open");
    el("otherHead").setAttribute("aria-expanded", open ? "true" : "false");
  }
  el("otherHead").addEventListener("click", toggleOthers);
  el("otherHead").addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggleOthers(); } });
  el("openAllBtn").addEventListener("click", function(){
    var rs=document.querySelectorAll("#readings .reading");
    var anyClosed=Array.prototype.some.call(rs, function(r){ return !r.classList.contains("open"); });
    Array.prototype.forEach.call(rs, function(r){ r.classList.toggle("open", anyClosed); });
    syncOpenAll();
  });

  // swipe left/right on the Today view to change day; arrow keys do the same on a keyboard
  var tx=0, ty=0, tOK=false;
  document.addEventListener("touchstart", function(e){
    tx=e.touches[0].clientX; ty=e.touches[0].clientY;
    tOK = state.tab==="today" && !layers.some(function(L){ return L.kind!=="tab"; }) && !(e.target.closest && e.target.closest(".seg,.tabs"));
  }, {passive:true});
  document.addEventListener("touchend", function(e){
    if(!tOK) return;
    var dx=e.changedTouches[0].clientX-tx, dy=e.changedTouches[0].clientY-ty;
    if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.6){ goDays(dx<0?1:-1); }
  }, {passive:true});
  document.addEventListener("keydown", function(e){
    if(layers.some(function(L){ return L.kind!=="tab"; })) return;
    if(e.target && /input|textarea|select/i.test(e.target.tagName||"")) return;
    if(e.key==="ArrowLeft"){ if(state.tab==="today") goDays(-1); else if(state.tab==="scripture") rdStep(-1); }
    if(e.key==="ArrowRight"){ if(state.tab==="today") goDays(1); else if(state.tab==="scripture") rdStep(1); }
  });

  // ---------- boot ----------
  if(SCALES.indexOf(state.scale)<0) state.scale=100;
  if(state.theme!=="auto") document.documentElement.setAttribute("data-theme", state.theme);
  paintTheme(); applyScale(); paintPrefs(); paintNet();
  loadFathers(); renderSavedQuotesSub(); bootToast();
  window.__parseRef = parseRef;       // exposed for automated tests
  window.__paschaCivil = paschaCivil;
  window.__litKey = liturgicalKey;
  window.__litInfo = litInfo;
  window.__sourceFast = sourceFast;
  window.__rocorAdjust = rocorAdjust;
  window.__newMartyrsSunday = newMartyrsSunday;
  window.__isMemorialOnly = isMemorialOnly;
  window.__fastRule = fastRule;
  window.__dayRule = dayRule;
  window.__seasonOf = seasonOf;
  window.__azbykaURL = azbykaURL;
  window.__prologueURL = prologueURL;
  window.__supplementFor = supplementFor;
  window.__toneOfWeek = toneOfWeek;
  window.__buildTile = buildTile;
  window.__gospelRef = findGospelRef;
  window.__setFathers = function(f){ var old=FATHERS; FATHERS=f; renderQuote(); return old; };
  window.__yearEvents = yearEvents;
  window.__buildYearTile = function(y){ yearShown=y||state.date.getFullYear(); return buildYearTile(); };
  window.__showTab = showTab;
  window.__openReader = openReader;
  window.__state = state;
  window.__selectDay = selectDay;
  window.__liturgicalSeason = liturgicalSeason;
  window.__pool = pool;
  window.__readBackup = readBackup;
  window.__mergeData = mergeData;
  window.__deviceData = deviceData;
  window.__pruneSaved = pruneSaved;
  window.__checkNewDay = checkNewDay;
  window.__paintPackages = paintPackages;
  window.__pkg = PK;
  window.__backupText = backupText;
  window.__quoteForDay = quoteForDay;
  maybeInstallBanner();
  load();              // first load (Old Calendar)
  syncTodayBtn();
  setTimeout(pruneSaved, 5000);

  if("serviceWorker" in navigator){
    window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
  }
