  // ---------- data ----------
  function readCache(cal,d){
    try{ var raw=store.getItem(keyOf(cal,d)); return raw?JSON.parse(raw):null; }catch(e){ return null; }
  }
  function writeCache(cal,d,data){
    try{ store.setItem(keyOf(cal,d), JSON.stringify({t:Date.now(), data:data})); }catch(e){}
  }

  // A request that hears nothing for 15 seconds is given up, so a poor connection never leaves the day spinning.
  function fetchJSON(url, ms){
    var ctl = (typeof AbortController!=="undefined") ? new AbortController() : null;
    var timer = ctl ? setTimeout(function(){ ctl.abort(); }, ms||15000) : null;
    var opts = {headers:{Accept:"application/json"}}; if(ctl) opts.signal=ctl.signal;
    return fetch(url, opts).then(function(r){
      if(!r.ok) throw new Error("HTTP "+r.status); return r.json();
    }).then(function(j){ clearTimeout(timer); return j; }, function(e){ clearTimeout(timer); throw e; });
  }
  function fetchDay(cal,d){
    var url=apiUrl(cal,d);
    return fetchJSON(url).catch(function(){
      // fallback through a CORS proxy (covers unusual networks / transient blocks)
      return fetchJSON(PROXY+encodeURIComponent(url));
    });
  }

  // ---------- the app's own files, with recovery from a damaged offline copy ----------
  // If a stored file cannot be read (cut off mid-download, say), it is removed from the offline store and fetched
  // afresh; the fresh copy is stored again only once it has been read successfully.
  var APP_CACHE = CACHE_PREFIX + "v" + APP_VERSION + "-" + APP_BUILD;
  var GREEK_CACHE = CACHE_PREFIX + "greek-1", TEXT_CACHE = CACHE_PREFIX + "texts-1";
  function cachesOK(){ try{ return typeof caches!=="undefined" && !!caches.open; }catch(e){ return false; } }
  function absURL(rel){ return new URL(rel, location.href).href; }
  function cacheNameFor(rel){
    if(/^greek\//.test(rel)) return GREEK_CACHE;
    if(/^(kjv|greek-pt)\//.test(rel)) return TEXT_CACHE;
    return APP_CACHE;
  }
  function dropCached(rel){
    if(!cachesOK()) return Promise.resolve();
    var u=absURL(rel);
    return caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf(CACHE_PREFIX)===0; }).map(function(k){
        return caches.open(k).then(function(c){ return c.delete(u); });
      }));
    }).catch(function(){});
  }
  // A fresh copy from the server: past the browser's own cache, and past the offline store (see sw.js)
  var FRESH = {cache:"reload", headers:{"X-Daily-Readings":"fresh"}};
  function readJSON(r){
    if(!r || !r.ok) throw new Error("HTTP "+(r ? r.status : "?"));
    return r.text().then(function(t){ return JSON.parse(t); });
  }
  function fetchJSONWithRepair(rel){
    return fetch(rel).then(readJSON).catch(function(){
      return dropCached(rel).then(function(){ return fetch(rel, FRESH); }).then(function(r){
        var copy = (r && r.ok) ? r.clone() : null;
        return readJSON(r).then(function(j){
          if(copy && cachesOK()) caches.open(cacheNameFor(rel)).then(function(c){ return c.put(absURL(rel), copy); }).catch(function(){});
          return j;
        });
      });
    });
  }

  // ---------- connection notices ----------
  function savedOn(t){
    var d=new Date(t);
    if(sameDay(d, new Date())) return "today at "+d.toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"});
    return "on "+d.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  }
  function whyNot(){ return navigator.onLine===false ? "You’re offline." : "The calendar service could not be reached."; }
  function paintNet(){ show(el("netChip"), navigator.onLine===false); }

  function load(){
    el("offlineBanner").classList.remove("show");
    el("errorBanner").classList.remove("show");

    // instant paint from the saved copy if we have it
    var cached = readCache(state.cal, state.date);
    if(cached && cached.data){
      render(cached.data, {cached:true, when:new Date(cached.t).toLocaleDateString("en-AU")});
    } else {
      show(el("content"), false);
      el("loading").classList.remove("hidden");
    }
    var asked = state.date.getTime(), shown = new Date(asked);
    fetchDay(state.cal, shown).then(function(data){
      if(!data || typeof data!=="object") throw new Error("unexpected reply");
      writeCache(state.cal, shown, data);
      if(asked!==state.date.getTime()) return;                 // the reader has moved to another day meanwhile
      render(data, {cached:false});
      prefetchWeek();
    }).catch(function(){
      if(asked!==state.date.getTime()) return;
      if(cached && cached.data){
        // Say plainly that this is a saved copy, which day it is for, and when it was saved
        var b=el("offlineBanner");
        b.textContent = whyNot()+" Showing the copy of "+fmtDate(shown)+" saved "+savedOn(cached.t)+".";
        b.classList.add("show");
      } else {
        // Nothing saved for this day: show only what the app can work out exactly, and say so plainly
        render(null, {offline:true});
        var e=el("errorBanner"); e.textContent="";
        e.appendChild(document.createTextNode(whyNot()+" The readings, saints and fast for "+fmtDate(shown)+
          " are not on this device, so they are not shown. Try again when you are connected, or open "));
        var a=mk("a","","orthocal.info"); a.href="https://orthocal.info/"; a.target="_blank"; a.rel="noopener";
        e.appendChild(a); e.appendChild(document.createTextNode("."));
        e.classList.add("show");
      }
    });
  }
  window.addEventListener("online", function(){
    paintNet();
    if(el("offlineBanner").classList.contains("show") || el("errorBanner").classList.contains("show")) load();
  });
  window.addEventListener("offline", paintNet);

  // ---------- Quiet prefetch: keep the coming week readable offline ----------
  var prefetched=false;
  function prefetchWeek(){
    if(prefetched) return; prefetched=true;
    var base=startOfToday(), i=1;
    function next(){
      if(i>7){ topUpDays(); return; }                  // then the 30 days, if the reader saved them
      var d=new Date(base.getFullYear(), base.getMonth(), base.getDate()+i); i++;
      var c=readCache(state.cal,d);
      if(c && c.t && (Date.now()-c.t) < 3*86400000){ next(); return; }   // already fresh
      fetchDay(state.cal,d).then(function(data){ if(data && typeof data==="object") writeCache(state.cal,d,data); })
        .catch(function(){})
        .then(function(){ setTimeout(next, 400); });
    }
    setTimeout(next, 3000);
  }

  // ---------- Housekeeping: saved days are working copies, kept from two weeks back to six weeks ahead ----------
  // (localStorage is small; v34 never cleared old days). Personal records (user:*) are never touched here.
  // NKJV chapters saved by version 34 are cleared while the NKJV is paused — but not by the review copy, which
  // shares this storage with the live app.
  function pruneSaved(){
    var t=startOfToday(), lo=new Date(t.getFullYear(), t.getMonth(), t.getDate()-14), hi=new Date(t.getFullYear(), t.getMonth(), t.getDate()+45);
    var drop=[], keys=[];
    try{ for(var i=0;i<localStorage.length;i++) keys.push(localStorage.key(i)||""); }catch(e){}
    keys.forEach(function(k){
      var m=/^day:\w+:(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(k);
      if(m){ var d=new Date(+m[1], +m[2]-1, +m[3]); if(d<lo || d>hi) drop.push(k); }
      else if(/^nkjv:/.test(k) && !NKJV_ENABLED && CACHE_PREFIX==="orthodox-readings-") drop.push(k);
    });
    drop.forEach(function(k){ store.removeItem(k); });
    return drop.length;
  }

  // ---------- A new day: an app left open (or resumed) after midnight moves on to the new day ----------
  var shownToday = startOfToday().getTime();
  function checkNewDay(){
    var t=startOfToday();
    if(t.getTime()===shownToday) return false;
    var wasToday = state.date.getTime()===shownToday;
    shownToday=t.getTime(); prefetched=false;
    if(wasToday){ state.date=t; load(); }
    syncTodayBtn();
    if(state.tab==="calendar") renderCalendar();
    if(state.tab==="prayer") renderPrayersLink();
    return true;
  }
  document.addEventListener("visibilitychange", function(){ if(document.visibilityState==="visible") checkNewDay(); });
  window.addEventListener("focus", checkNewDay);
  window.addEventListener("pageshow", checkNewDay);
  setInterval(checkNewDay, 60000);

  // ---------- Install ----------
  var deferredInstall=null;
  function isStandalone(){
    return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone===true;
  }
  function maybeInstallBanner(){
    if(isStandalone() || store.getItem("pref:installDismissed")) return;
    if(deferredInstall){
      show(el("installGo"), true); show(el("installBanner"), true);
    } else if(/iphone|ipad|ipod/i.test(navigator.userAgent)){
      el("installTxt").textContent = "Keep Daily Readings with you: tap Share, then “Add to Home Screen”.";
      show(el("installGo"), false); show(el("installBanner"), true);
    }
  }
  window.addEventListener("beforeinstallprompt", function(e){
    e.preventDefault(); deferredInstall=e; maybeInstallBanner();
  });
  window.addEventListener("appinstalled", function(){
    show(el("installBanner"), false); store.setItem("pref:installDismissed","1");
  });
  el("installGo").addEventListener("click", function(){
    if(!deferredInstall) return;
    deferredInstall.prompt();
    (deferredInstall.userChoice || Promise.resolve()).then(function(){
      show(el("installBanner"), false); store.setItem("pref:installDismissed","1");
    });
  });
  el("installNo").addEventListener("click", function(){
    show(el("installBanner"), false); store.setItem("pref:installDismissed","1");
  });
  function renderInstallRow(){
    var ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
    if(isStandalone()){ show(el("setInstallRow"), false); return; }
    show(el("setInstallRow"), !!deferredInstall || ios);
    show(el("setInstallBtn"), !!deferredInstall);
    if(ios && !deferredInstall) el("setInstallLbl").textContent="In Safari, tap Share, then “Add to Home Screen”.";
  }
  window.addEventListener("beforeinstallprompt", function(){ setTimeout(renderInstallRow, 0); });
  el("setInstallBtn").addEventListener("click", function(){
    if(!deferredInstall) return;
    deferredInstall.prompt();
    (deferredInstall.userChoice || Promise.resolve()).then(function(){ deferredInstall=null; renderInstallRow(); });
  });
