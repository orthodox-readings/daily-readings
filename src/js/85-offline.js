  // ---------- Offline reading: texts the reader chooses to keep on this device ----------
  // packages.json (made by tools/build.py) lists each bundled text with its files, total size and a version (a hash
  // of its contents). A package counts as saved only when every file has been downloaded, read back as complete
  // JSON and found in the offline store; its record (pkg:<cache prefix><id>) is written only then. What is on the
  // device is always worked out from the offline store itself, so an interrupted download shows as incomplete and
  // never as saved.
  //
  // The coming 30 days (readings, saints and fasts from orthocal.info) are kept as saved days in localStorage, the
  // same way the app keeps every day it opens. Once saved, the app tops the 30 days up quietly whenever it is online.
  var DAYS_PKG = { id:"days-30", kind:"days", days:30, name:"The coming 30 days", sub:"Readings, saints and fasting for each day", unit:"days" };
  var PK = { list:null, state:{}, queue:[], running:null, present:{} };
  function pkgKey(id){ return "pkg:"+CACHE_PREFIX+id; }
  function pkgRecord(id){ var r=jget(pkgKey(id), null); return (r && typeof r==="object") ? r : null; }
  function pkgCache(p){ return p.cache==="greek" ? GREEK_CACHE : TEXT_CACHE; }
  function pkgTotal(p){ return p.kind==="days" ? p.days : p.files.length; }
  function fmtBytes(n){ if(n < 1048576) return Math.max(1, Math.round(n/1024))+" KB"; return (n/1048576).toFixed(1).replace(/\.0$/,"")+" MB"; }
  function textsOK(){ return cachesOK() && ("serviceWorker" in navigator); }
  function loadPackages(){
    if(PK.list) return Promise.resolve(PK.list);
    return fetchJSONWithRepair("packages.json").then(function(j){
      PK.list = (j && Array.isArray(j.packages)) ? j.packages.filter(function(p){ return p && p.id && Array.isArray(p.files); }) : [];
      return PK.list;
    });
  }
  function allPackages(){ return [DAYS_PKG].concat(PK.list||[]); }

  // Runs `worker` on every item, at most `limit` at a time, and resolves ONCE — after every item has finished,
  // successfully or not — with the items that failed. (Version 34 ran four chains and reported the result as soon
  // as the first chain ran out of work, while the others were still downloading.)
  function pool(items, limit, worker, progress){
    return new Promise(function(resolve){
      var next=0, settled=0, failed=[];
      if(!items.length){ resolve(failed); return; }
      function launch(){
        if(next>=items.length) return;
        var item=items[next++];
        Promise.resolve().then(function(){ return worker(item); })
          .catch(function(){ failed.push(item); })
          .then(function(){
            settled++;
            try{ if(progress) progress(settled, items.length); }catch(e){}
            if(settled===items.length) resolve(failed); else launch();
          });
      }
      for(var k=0;k<Math.min(limit, items.length);k++) launch();
    });
  }

  // ----- the coming days -----
  function comingDays(n){
    var b=startOfToday(), out=[];
    for(var i=0;i<n;i++) out.push(new Date(b.getFullYear(), b.getMonth(), b.getDate()+i));
    return out;
  }
  function daySaved(d){ var c=readCache(state.cal,d); return !!(c && c.data); }
  function daysPresent(){ return comingDays(DAYS_PKG.days).filter(daySaved).length; }
  function daysAhead(){ return comingDays(DAYS_PKG.days).slice(1).filter(daySaved).length; }   // saved days after today
  function daysBytes(){
    var n=0, k=0;
    comingDays(DAYS_PKG.days).forEach(function(d){ var r=store.getItem(keyOf(state.cal,d)); if(r){ n+=r.length*2; k++; } });
    return {bytes:n, days:k};
  }
  function isDayData(data){ return !!data && typeof data==="object" && Array.isArray(data.readings); }
  function saveDays(p, st, onlyMissing){
    var days=comingDays(p.days);
    if(onlyMissing) days=days.filter(function(d){ var c=readCache(state.cal,d); return !(c && c.data); });
    st.total=days.length; st.done=0; paintPkgProgress(p);
    return pool(days, 3, function(d){                       // three at a time: gentle on the calendar service
      return fetchDay(state.cal, d).then(function(data){
        if(!isDayData(data)) throw new Error("unexpected reply");
        writeCache(state.cal, d, data);
        var back=readCache(state.cal, d);
        if(!back || !back.data) throw new Error("not stored");  // the device's storage is full
      });
    }, function(n){ st.done=n; paintPkgProgress(p); }).then(function(){
      return { missing: p.days - daysPresent() };
    });
  }

  // ----- bundled texts -----
  function storeFile(cache, f){
    return fetch(f, FRESH).then(function(r){
      if(!r.ok) throw new Error("HTTP "+r.status);
      var copy=r.clone();
      return r.text().then(function(t){ JSON.parse(t); return cache.put(absURL(f), copy); });   // only complete, readable files are kept
    });
  }
  function filesPresent(p){
    if(!textsOK()) return Promise.resolve(0);
    return caches.open(pkgCache(p)).then(function(c){
      return c.keys().then(function(reqs){
        var have={}; reqs.forEach(function(r){ have[r.url.split("?")[0]]=1; });
        return p.files.filter(function(f){ return have[absURL(f)]; }).length;
      });
    }).catch(function(){ return 0; });
  }
  function saveFiles(p, st, onlyMissing){
    return caches.open(pkgCache(p)).then(function(cache){
      var pick = onlyMissing ? cache.keys().then(function(reqs){
        var have={}; reqs.forEach(function(r){ have[r.url.split("?")[0]]=1; });
        return p.files.filter(function(f){ return !have[absURL(f)]; });
      }) : Promise.resolve(p.files.slice());
      return pick.then(function(todo){
        st.total=todo.length; st.done=0; paintPkgProgress(p);
        return pool(todo, 6, function(f){ return storeFile(cache, f); }, function(n){ st.done=n; paintPkgProgress(p); });
      }).then(function(){
        // Check the whole package, file by file, before calling it saved
        return Promise.all(p.files.map(function(f){ return cache.match(absURL(f)).then(function(h){ return h ? 0 : 1; }); }));
      }).then(function(miss){
        return { missing: miss.reduce(function(a,b){ return a+b; }, 0) };
      });
    });
  }

  function presentOf(p){ return p.kind==="days" ? Promise.resolve(daysPresent()) : filesPresent(p); }
  function runPackage(p, onlyMissing){
    var st = PK.state[p.id] = { running:true, done:0, total:0, msg:"" };
    paintPackages();
    var work = p.kind==="days" ? saveDays(p, st, onlyMissing) : saveFiles(p, st, onlyMissing);
    return work.then(function(res){
      st.running=false;
      var total=pkgTotal(p);
      if(res.missing===0){
        jset(pkgKey(p.id), p.kind==="days" ? {t:Date.now()} : {v:p.version, t:Date.now(), n:total});
        st.failed=false; st.msg="";
        askPersist();
        toast("Saved on this device: "+(p.kind==="days" ? "the coming 30 days" : p.name+(p.sub ? " ("+p.sub.replace(/ \(.*\)$/,"")+")" : "")));
      } else {
        st.failed=true;
        st.msg = "Saved "+(total-res.missing)+" of "+total+" "+p.unit+". "+res.missing+(res.missing===1?" was":" were")+
          " not downloaded — check your connection, then tap Retry.";
      }
    }).catch(function(){
      st.running=false; st.failed=true;
      st.msg="Saving stopped before it finished. Check your connection, then tap Retry.";
    }).then(function(){ paintPackages(); });
  }
  function enqueue(p, onlyMissing){
    if(PK.running===p.id || PK.queue.some(function(j){ return j.p.id===p.id; })) return;
    PK.queue.push({p:p, only:!!onlyMissing});
    PK.state[p.id] = { queued:true };
    paintPackages(); pumpQueue();
  }
  function pumpQueue(){
    if(PK.running || !PK.queue.length) return;
    var job=PK.queue.shift(); PK.running=job.p.id;
    runPackage(job.p, job.only).then(function(){ PK.running=null; pumpQueue(); });
  }
  function removePackage(p){
    var done;
    if(p.kind==="days"){
      comingDays(p.days).slice(1).forEach(function(d){ store.removeItem(keyOf(state.cal,d)); });   // today stays
      done=Promise.resolve();
    } else {
      done=caches.open(pkgCache(p)).then(function(c){
        return Promise.all(p.files.map(function(f){ return c.delete(absURL(f)); }));
      }).catch(function(){});
    }
    store.removeItem(pkgKey(p.id)); PK.state[p.id]={};
    return done.then(function(){ paintPackages(); toast("Removed from this device"); });
  }

  // ----- keeping the 30 days topped up once the reader has asked for them -----
  function topUpDays(){
    if(!pkgRecord(DAYS_PKG.id) || PK.running || navigator.onLine===false) return;
    var want=comingDays(DAYS_PKG.days).filter(function(d){
      var c=readCache(state.cal,d); return !(c && c.data) || (Date.now()-(c.t||0)) > 14*86400000;
    });
    pool(want, 2, function(d){
      return fetchDay(state.cal,d).then(function(data){ if(isDayData(data)) writeCache(state.cal,d,data); });
    }).then(function(){ if(state.tab==="settings") paintPackages(); });
  }

  // ----- storage -----
  function askPersist(){
    try{
      if(navigator.storage && navigator.storage.persist && navigator.storage.persisted){
        navigator.storage.persisted().then(function(p){ return p || navigator.storage.persist(); }).then(paintStorage, paintStorage);
      }
    }catch(e){}
  }
  function paintStorage(){
    var lbl=el("storageLbl");
    if(!(navigator.storage && navigator.storage.estimate)){ lbl.textContent=""; return; }
    Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)
    ]).then(function(r){
      var used=r[0] && r[0].usage || 0;
      lbl.textContent = "Offline data for this website: about "+fmtBytes(used)+". "+
        (r[1] ? "Your browser keeps it safe from automatic clean-up." :
                "If your phone runs short of space, the browser may clear saved texts; they can simply be saved again.");
    }).catch(function(){ lbl.textContent=""; });
  }

  // ----- the Settings card -----
  function pkgSize(p){
    if(p.kind==="days"){
      var b=daysBytes();
      return b.days ? "about "+fmtBytes(Math.round(b.bytes/b.days*p.days)) : "about 1 MB";
    }
    return fmtBytes(p.bytes||0);
  }
  function pkgStatus(p, have){
    var st=PK.state[p.id]||{}, total=pkgTotal(p), rec=pkgRecord(p.id);
    if(st.running) return { text:"Saving… "+(st.done||0)+" of "+(st.total||total)+" "+p.unit, btn:"Saving…", busy:true, bar:true };
    if(st.queued) return { text:"Waiting for the download before it to finish", btn:"Waiting…", busy:true };
    if(st.failed) return { text:st.msg, btn:"Retry", act:"retry", rm:have>0 };
    if(p.kind==="days"){
      var last=comingDays(p.days)[p.days-1];
      if(have===total) return { text:"Saved: every day to "+last.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})+
        (rec ? ". Kept up to date whenever you are online." : "."), btn: "Refresh", act:"all", rm:true, ok:true };
      if(have>0) return { text: have+" of the coming "+total+" days "+(have===1 ? "is" : "are")+" on this device", btn:"Save all 30", act:"all", rm:daysAhead()>0 };
      return { text:"Not saved", btn:"Save", act:"all" };
    }
    if(!textsOK()) return { text:"This browser cannot keep texts for offline reading.", none:true };
    if(have===total){
      if(rec && rec.v && rec.v!==p.version) return { text:"An updated text is available", btn:"Update", act:"all", rm:true };
      return { text: rec && rec.t ? "Saved on this device ("+new Date(rec.t).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})+")" :
        "On this device", rm:true, ok:true };
    }
    if(have>0) return { text:"Partly on this device: "+have+" of "+total+" "+p.unit, btn:"Save all", act:"all", rm:true };
    return { text:"Not saved", btn:"Save", act:"all" };
  }
  function pkgRow(p){
    var row=el("pkg-"+p.id);
    if(row) return row;
    row=mk("div","pkg"); row.id="pkg-"+p.id;
    var top=mk("div","pkrow"), lab=mk("span","sl");
    lab.appendChild(mk("b","",p.name));
    lab.appendChild(mk("small","pksub",""));
    var stat=mk("small","pkstat",""); stat.setAttribute("aria-live","polite"); lab.appendChild(stat);
    var btn=mk("button","btn soft pkbtn","Save");
    top.appendChild(lab); top.appendChild(btn); row.appendChild(top);
    var bar=mk("div","pkbar hidden"); bar.setAttribute("role","progressbar"); bar.setAttribute("aria-label", "Saving "+p.name);
    bar.setAttribute("aria-valuemin","0"); bar.appendChild(mk("i")); row.appendChild(bar);
    var rm=mk("button","linkbtn pkrm hidden","Remove from this device"); row.appendChild(rm);
    var cf=mk("div","pkconfirm hidden");
    cf.appendChild(mk("span","","Remove “"+p.name+(p.sub ? " — "+p.sub : "")+"” from this device? You can save it again at any time."));
    var yes=mk("button","btn soft","Remove"), no=mk("button","btn ghost","Keep");
    cf.appendChild(yes); cf.appendChild(no); row.appendChild(cf);
    btn.addEventListener("click", function(){
      var a=btn.getAttribute("data-act"); if(!a) return;
      if(p.kind!=="days" && !textsOK()) return;
      enqueue(p, a==="retry");
    });
    rm.addEventListener("click", function(){ show(cf,true); show(rm,false); });
    no.addEventListener("click", function(){ show(cf,false); show(rm,true); });
    yes.addEventListener("click", function(){ show(cf,false); removePackage(p); });
    el("pkgList").appendChild(row);
    return row;
  }
  function paintRow(p, have){
    var row=pkgRow(p), s=pkgStatus(p, have);
    row.querySelector(".pksub").textContent = [p.sub, pkgTotal(p)+" "+p.unit, pkgSize(p)].filter(Boolean).join(" · ");
    row.querySelector(".pkstat").textContent = s.text;
    row.classList.toggle("ok", !!s.ok);
    var btn=row.querySelector(".pkbtn");
    show(btn, !!s.btn); btn.textContent=s.btn||""; btn.disabled=!!s.busy;
    if(s.act) btn.setAttribute("data-act", s.act); else btn.removeAttribute("data-act");
    var cfOpen=!row.querySelector(".pkconfirm").classList.contains("hidden");
    show(row.querySelector(".pkrm"), !!s.rm && !s.busy && !cfOpen);
    if(s.busy || !s.rm) show(row.querySelector(".pkconfirm"), false);
    show(row.querySelector(".pkbar"), !!s.bar);
  }
  function paintPkgProgress(p){
    var row=el("pkg-"+p.id), st=PK.state[p.id]; if(!row || !st) return;
    var bar=row.querySelector(".pkbar"), tot=st.total||pkgTotal(p);
    bar.setAttribute("aria-valuemax", String(tot)); bar.setAttribute("aria-valuenow", String(st.done||0));
    bar.querySelector("i").style.width = (tot ? Math.round((st.done||0)/tot*100) : 0)+"%";
    if(st.running) row.querySelector(".pkstat").textContent = "Saving… "+(st.done||0)+" of "+tot+" "+p.unit;
  }
  var pkPaintSeq=0;
  function paintPackages(){
    var seq=++pkPaintSeq;
    return loadPackages().catch(function(){ return []; }).then(function(){
      return Promise.all(allPackages().map(presentOf));
    }).then(function(counts){
      if(seq!==pkPaintSeq) return;                    // a newer paint is on its way
      allPackages().forEach(function(p,i){ PK.present[p.id]=counts[i]; paintRow(p, counts[i]); paintPkgProgress(p); });
      paintStorage();
    });
  }
  function renderPackages(){
    paintPackages();
  }
