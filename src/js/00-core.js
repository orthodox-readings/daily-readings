  "use strict";
  // Filled in by tools/build.py: the human version and a hash of everything the app ships.
  var APP_VERSION = "@@VERSION@@", APP_BUILD = "@@BUILD@@";
  // Offline storage names; the service worker (sw.js) uses the same prefix. tools/make_preview.py changes it
  // for the review copy, so a preview never touches the live app's offline storage.
  var CACHE_PREFIX = "orthodox-readings-";
  // The New King James Version stays off until its publisher (HarperCollins Christian Publishing) grants
  // permission. The code that fetched it is kept so it can be switched back on once permission is in writing.
  var NKJV_ENABLED = false;
  // ΛΟΓΟΣ (Logos), the separate Greek-learning app: set its published address here to show a link in Settings.
  // Leave it empty until that app is actually available.
  var LOGOS_URL = "";
  // Storage shim: real localStorage where available, in-memory fallback where it's blocked
  // (sandboxed previews, some private-browsing modes) so the app always boots.
  var store = (function(){
    try{ var t="__probe"; localStorage.setItem(t,t); localStorage.removeItem(t); return localStorage; }
    catch(e){
      var m = {};
      return {
        getItem: function(k){ return Object.prototype.hasOwnProperty.call(m,k) ? m[k] : null; },
        setItem: function(k,v){ m[k] = String(v); },
        removeItem: function(k){ delete m[k]; }
      };
    }
  })();
  function jget(k, def){ try{ var r=store.getItem(k); return r ? JSON.parse(r) : def; }catch(e){ return def; } }
  function jset(k, v){ try{ store.setItem(k, JSON.stringify(v)); }catch(e){} }

  var API = "https://orthocal.info/api";      // {cal}/{yyyy}/{m}/{d}/
  var PROXY = "https://api.allorigins.win/raw?url="; // fallback if direct fetch is blocked
  // Saved preferences. Every key written by earlier versions keeps its name and format:
  //   pref:txt (kjv|nkjv) · pref:scale (percent) · pref:greek ("1"/"0") · pref:installDismissed
  //   day:julian:Y-M-D (saved days) · nkjv:book:chapter (saved NKJV chapters)
  // New in v34: pref:lang (en|par|grc) · pref:theme (auto|light|dark) · pref:gkEd (rp|pt)
  //   reader:pos · user:bookmarks · user:highlights · user:fastlog
  // New in v35: pref:todayHide (Today sections hidden) · pref:reviewQuotes ("1" = include sayings awaiting review)
  //   user:fastnotes (private note per fast day) · user:favQuotes (saved sayings) · pkg:<cache prefix><package>
  //   All user:*, pref:* and reader:* items go into a backup; day:* and pkg:* are working copies, not personal data.
  function initialLang(){
    var l = store.getItem("pref:lang");
    if(l==="en" || l==="par" || l==="grc") return l;
    return store.getItem("pref:greek")==="1" ? "par" : "en";   // carry the old Greek switch over
  }
  function initialTheme(){ var t=store.getItem("pref:theme"); return (t==="light"||t==="dark") ? t : "auto"; }
  var state = {
    cal: "julian",   // the app follows the Old Calendar — a stored "gregorian" pref from old versions is deliberately ignored
    // English text of the daily readings: "kjv" (in the calendar data) or "nkjv" (fetched; paused — see NKJV_ENABLED).
    // A stored "nkjv" choice is left as it is, so it returns if the NKJV is ever licensed.
    txt: NKJV_ENABLED ? (store.getItem("pref:txt") || "nkjv") : "kjv",
    lang: initialLang(),                          // en = English · par = English with Greek · grc = Greek
    gkEd: store.getItem("pref:gkEd")==="pt" ? "pt" : "rp",   // Greek edition: Robinson–Pierpont or Patriarchal 1904
    theme: initialTheme(),
    scale: parseInt(store.getItem("pref:scale")||"100",10) || 100,
    todayHide: (function(){ var a=jget("pref:todayHide", []); return Array.isArray(a) ? a : []; })(),
    reviewQuotes: store.getItem("pref:reviewQuotes")==="1",
    date: startOfToday(),
    tab: "today",
    renderSeq: 0
  };
  var lastRender = null;

  // ---------- helpers ----------
  function startOfToday(){ var n=new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function keyOf(cal,d){ return "day:"+cal+":"+d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); }
  function apiUrl(cal,d){ return API+"/"+cal+"/"+d.getFullYear()+"/"+(d.getMonth()+1)+"/"+d.getDate()+"/"; }
  function isToday(d){ var t=startOfToday(); return d.getTime()===t.getTime(); }
  function fmtDate(d){
    try{ return d.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"}); }
    catch(e){ return d.toDateString(); }
  }
  function el(id){ return document.getElementById(id); }
  function show(node,on){ node.classList[on?"remove":"add"]("hidden"); }
  function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function dayOnly(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function isoKey(d){ return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2); }
  function each(sel, fn){ Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function mk(tag, cls, text){ var n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; }
  var toastT=null;
  function toast(msg){
    var t=el("toast"); t.textContent=msg; show(t,true);
    clearTimeout(toastT); toastT=setTimeout(function(){ show(t,false); }, 1800);
  }
  function copyText(text, done){
    function fallback(){
      var t=document.createElement("textarea"); t.value=text; t.style.position="fixed"; t.style.opacity="0";
      document.body.appendChild(t); t.select();
      try{ document.execCommand("copy"); if(done) done(); }catch(e){}
      t.remove();
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ if(done) done(); }).catch(fallback);
    } else fallback();
  }

  // ---------- layers: sheets, focus mode and "away from Today" each take one Back press ----------
  var layers=[], expectPop=[];
  function pushLayer(closeFn, kind){
    var L={close:closeFn, kind:kind, pushed:false};
    try{ history.pushState({l:layers.length+1}, ""); L.pushed=true; }catch(e){}
    layers.push(L);
  }
  function dropLayer(run){                       // programmatic close of the top layer
    var L=layers.pop(); if(!L) return;
    if(run) L.close();
    if(L.pushed){ expectPop.push(Date.now()); try{ history.back(); }catch(e){ expectPop.pop(); } }
  }
  function closeLayer(){ dropLayer(true); }
  function topKind(){ return layers.length ? layers[layers.length-1].kind : ""; }
  window.addEventListener("popstate", function(){
    var now=Date.now();
    while(expectPop.length && now-expectPop[0] > 1500) expectPop.shift();
    if(expectPop.length){ expectPop.shift(); return; }       // our own history.back()
    var L=layers.pop(); if(L) L.close();                        // the phone's Back button
  });
  function openSheet(id){
    show(el(id), true);
    pushLayer(function(){ show(el(id), false); }, "sheet");
  }
  each(".scrim", function(s){
    s.addEventListener("click", function(e){
      if(e.target===s || (e.target.closest && e.target.closest("[data-close]"))) closeLayer();
    });
  });
  document.addEventListener("keydown", function(e){
    if(e.key==="Escape" && layers.length && topKind()!=="tab") closeLayer();
  });

  // ---------- the five views ----------
  var TABS=["today","calendar","scripture","prayer","settings"], scrollMem={};
  function showTab(name, fromLayer){
    if(TABS.indexOf(name)<0) return;
    if(name===state.tab){ window.scrollTo(0,0); return; }
    scrollMem[state.tab]=window.pageYOffset||0;
    var prev=state.tab; state.tab=name;
    TABS.forEach(function(t){ el("view-"+t).hidden = (t!==name); document.body.classList.toggle("tab-"+t, t===name); });
    each(".tab", function(b){
      var on=b.getAttribute("data-tab")===name;
      b.classList.toggle("active", on);
      if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
    });
    if(name==="calendar"){ syncCalToDay(false); renderCalendar(); }
    if(name==="scripture") ensureReader();
    if(name==="prayer") renderPrayersLink();
    if(name==="settings") renderSettings();
    window.scrollTo(0, scrollMem[name]||0);
    if(fromLayer) return;
    if(prev==="today") pushLayer(function(){ showTab("today", true); }, "tab");
    else if(name==="today" && topKind()==="tab") dropLayer(false);
  }
  each(".tab", function(b){ b.addEventListener("click", function(){ showTab(b.getAttribute("data-tab")); }); });
  el("setBtn").addEventListener("click", function(){ showTab("settings"); });
  el("toPrayer").addEventListener("click", function(){ showTab("prayer"); });

  // ---------- theme ----------
  function effectiveTheme(){
    var a=document.documentElement.getAttribute("data-theme");
    if(a==="dark"||a==="light") return a;
    return (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  function paintTheme(){
    var dark = effectiveTheme()==="dark";
    var meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content", dark ? "#15110F" : "#FAF7EF");
    el("themeBtn").querySelector("use").setAttribute("href", dark ? "#i-today" : "#i-moon");
    each("#themeSeg button", function(b){ b.classList.toggle("active", b.getAttribute("data-theme")===state.theme); });
  }
  function setTheme(t){
    state.theme=t; store.setItem("pref:theme", t);
    if(t==="auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    paintTheme();
  }
  el("themeBtn").addEventListener("click", function(){ setTheme(effectiveTheme()==="dark" ? "light" : "dark"); });
  each("#themeSeg button", function(b){ b.addEventListener("click", function(){ setTheme(b.getAttribute("data-theme")); }); });
  if(window.matchMedia){
    var mq=matchMedia("(prefers-color-scheme: dark)");
    if(mq.addEventListener) mq.addEventListener("change", paintTheme); else if(mq.addListener) mq.addListener(paintTheme);
  }

  // ---------- reading size (applies to Scripture, sayings and lives; the interface keeps its size) ----------
  var SCALES=[90,100,110,120,130,145,160];
  function applyScale(){
    document.documentElement.style.setProperty("--rs", String(state.scale/100));
    el("scaleLbl").textContent = state.scale+"%";
  }
  function bumpScale(dir){
    var i=SCALES.indexOf(state.scale); if(i<0) i=1;
    i=Math.max(0, Math.min(SCALES.length-1, i+dir));
    state.scale=SCALES[i]; store.setItem("pref:scale", String(state.scale)); applyScale();
  }
  each("#sizeSeg button, #rdSizeSeg button, #setSizeSeg button", function(b){
    b.addEventListener("click", function(){ bumpScale(b.getAttribute("data-sz")==="+" ? 1 : -1); });
  });

