  // ---------- Backup and restore ----------
  // The file format is documented in docs/BACKUP-FORMAT.md. A backup holds only the reader's own records and
  // settings — never saved days, offline texts or anything about the device — and the app never sends it
  // anywhere: the reader chooses where the file goes.
  var BK_FORMAT = "daily-readings-backup", BK_VERSION = 1;
  var BK_CHOICES = {
    "pref:lang":["en","par","grc"], "pref:greek":["0","1"], "pref:theme":["auto","light","dark"],
    "pref:gkEd":["rp","pt"], "pref:txt":["kjv","nkjv"], "pref:reviewQuotes":["0","1"]
  };
  // Every storage key a restore may change (and the undo snapshot keeps)
  var BK_KEYS = ["pref:lang","pref:greek","pref:theme","pref:scale","pref:gkEd","pref:txt","pref:todayHide","pref:reviewQuotes",
                 "reader:pos","user:bookmarks","user:highlights","user:fastlog","user:fastnotes","user:favQuotes"];
  var ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  function isInt(n, lo, hi){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n && n>=lo && n<=hi; }
  function okVerse(x){ return !!x && typeof x==="object" && isInt(x.b,40,66) && isInt(x.c,1,ntInfo(x.b)[2]) && isInt(x.v,1,200); }
  function cleanVerse(x){
    var o={b:x.b, c:x.c, v:x.v};
    if(typeof x.s==="string") o.s=x.s.slice(0,200);
    if(typeof x.t==="number" && isFinite(x.t)) o.t=x.t;
    return o;
  }
  function isMap(o){ return !!o && typeof o==="object" && !Array.isArray(o); }
  function plural(n, w){ return n+" "+w+(n===1 ? "" : "s"); }

  // What is on this device now, in the backup's shape
  function deviceData(){
    var settings={};
    Object.keys(BK_CHOICES).concat(["pref:scale"]).forEach(function(k){ var v=store.getItem(k); if(v!=null) settings[k]=v; });
    var th=jget("pref:todayHide", null); if(Array.isArray(th)) settings["pref:todayHide"]=th;
    var rp=jget("reader:pos", null), fl=jget("user:fastlog", {}), fn=jget("user:fastnotes", {}), fq=jget("user:favQuotes", []);
    return {
      settings: settings,
      reader: okVerse(rp) ? {b:rp.b, c:rp.c, v:rp.v||1} : null,
      bookmarks: savedList("user:bookmarks"), highlights: savedList("user:highlights"),
      fastlog: isMap(fl) ? fl : {}, fastnotes: isMap(fn) ? fn : {}, savedSayings: Array.isArray(fq) ? fq : []
    };
  }
  function countsText(d){
    var parts=[plural(d.bookmarks.length,"bookmark"), plural(d.highlights.length,"highlight"),
               plural(Object.keys(d.fastlog).length,"fasting note"), plural(Object.keys(d.fastnotes).length,"written note"),
               plural(d.savedSayings.length,"saved saying")];
    return parts.join(" · ");
  }

  // Reads a parsed file; anything that is not exactly what the app writes is left out and counted.
  function readBackup(obj){
    if(!isMap(obj) || obj.format!==BK_FORMAT) return {error:"This file is not a Daily Readings backup."};
    if(typeof obj.version!=="number" || obj.version<1) return {error:"This backup file is damaged: it has no version number."};
    if(obj.version>BK_VERSION) return {error:"This backup was made by a newer version of Daily Readings. Update the app, then try again."};
    var d=obj.data; if(!isMap(d)) return {error:"This backup file is damaged: it holds no data."};
    var out={settings:{}, reader:null, bookmarks:[], highlights:[], fastlog:{}, fastnotes:{}, savedSayings:[]}, bad=0;
    if(d.settings!=null){
      if(isMap(d.settings)) Object.keys(d.settings).forEach(function(k){
        var v=d.settings[k];
        if(BK_CHOICES[k]){ if(BK_CHOICES[k].indexOf(v)>-1) out.settings[k]=v; else bad++; }
        else if(k==="pref:scale"){ var n=parseInt(v,10); if(SCALES.indexOf(n)>-1) out.settings[k]=String(n); else bad++; }
        else if(k==="pref:todayHide"){
          if(Array.isArray(v)) out.settings[k]=v.filter(function(x){ return TODAY_SECTIONS.some(function(t){ return t.id===x; }); });
          else bad++;
        } else bad++;
      }); else bad++;
    }
    if(d.reader!=null){ if(okVerse(d.reader)) out.reader={b:d.reader.b, c:d.reader.c, v:d.reader.v}; else bad++; }
    ["bookmarks","highlights"].forEach(function(k){
      if(d[k]==null) return;
      if(!Array.isArray(d[k])){ bad++; return; }
      var seen={};
      d[k].forEach(function(x){
        if(!okVerse(x)){ bad++; return; }
        var id=x.b+":"+x.c+":"+x.v; if(seen[id]) return; seen[id]=1; out[k].push(cleanVerse(x));
      });
    });
    if(d.fastlog!=null){
      if(isMap(d.fastlog)) Object.keys(d.fastlog).forEach(function(k){ var v=d.fastlog[k]; if(ISO_DAY.test(k) && (v==="k"||v==="p")) out.fastlog[k]=v; else bad++; });
      else bad++;
    }
    if(d.fastnotes!=null){
      if(isMap(d.fastnotes)) Object.keys(d.fastnotes).forEach(function(k){
        var v=d.fastnotes[k];
        if(ISO_DAY.test(k) && typeof v==="string" && v.trim()) out.fastnotes[k]=v.slice(0,500); else bad++;
      }); else bad++;
    }
    if(d.savedSayings!=null){
      if(Array.isArray(d.savedSayings)) d.savedSayings.forEach(function(x){
        if(typeof x==="string" && /^q\d{3,4}$/.test(x)){ if(out.savedSayings.indexOf(x)<0) out.savedSayings.push(x); } else bad++;
      }); else bad++;
    }
    var made = (typeof obj.created==="string" && !isNaN(Date.parse(obj.created))) ? new Date(obj.created) : null;
    return {data:out, bad:bad, created:made, app:(typeof obj.app==="string" ? obj.app.slice(0,12) : "")};
  }

  function writeData(d){
    Object.keys(BK_CHOICES).concat(["pref:scale"]).forEach(function(k){
      if(d.settings[k]!=null) store.setItem(k, d.settings[k]); else store.removeItem(k);
    });
    if(Array.isArray(d.settings["pref:todayHide"])) jset("pref:todayHide", d.settings["pref:todayHide"]); else store.removeItem("pref:todayHide");
    if(d.reader) jset("reader:pos", d.reader); else store.removeItem("reader:pos");
    jset("user:bookmarks", d.bookmarks); jset("user:highlights", d.highlights);
    jset("user:fastlog", d.fastlog); jset("user:fastnotes", d.fastnotes); jset("user:favQuotes", d.savedSayings);
  }
  // Merge: the backup fills in what this device lacks. Where both hold something for the same verse or day,
  // this device's entry is kept. Settings and reading position on this device stay as they are.
  function mergeData(dev, bk){
    function verses(a, b){
      var seen={}, out=[];
      a.concat(b).forEach(function(x){ var id=x.b+":"+x.c+":"+x.v; if(!seen[id]){ seen[id]=1; out.push(x); } });
      return out;
    }
    function fill(a, b){ var o={}; Object.keys(b).forEach(function(k){ o[k]=b[k]; }); Object.keys(a).forEach(function(k){ o[k]=a[k]; }); return o; }
    return {
      settings: dev.settings, reader: dev.reader || bk.reader,
      bookmarks: verses(dev.bookmarks, bk.bookmarks), highlights: verses(dev.highlights, bk.highlights),
      fastlog: fill(dev.fastlog, bk.fastlog), fastnotes: fill(dev.fastnotes, bk.fastnotes),
      savedSayings: dev.savedSayings.concat(bk.savedSayings.filter(function(x){ return dev.savedSayings.indexOf(x)<0; }))
    };
  }
  // Before any restore, what was here is kept so the restore can be undone
  function snapshot(){
    var items={}; BK_KEYS.forEach(function(k){ items[k]=store.getItem(k); });
    jset("backup:undo", {t:Date.now(), items:items});
  }
  function reloadWith(msg){
    try{ sessionStorage.setItem("dr:toast", msg); }catch(e){}
    setTimeout(function(){ location.reload(); }, 300);
  }
  function undoRestore(){
    var u=jget("backup:undo", null); if(!u || !isMap(u.items)) return;
    BK_KEYS.forEach(function(k){ var v=u.items[k]; if(v==null) store.removeItem(k); else store.setItem(k, String(v)); });
    store.removeItem("backup:undo");
    reloadWith("What was on this device before the restore is back");
  }

  // ----- saving a backup -----
  function backupFileName(){ return "daily-readings-backup-"+isoKey(new Date())+".json"; }
  function backupText(){
    return JSON.stringify({
      format: BK_FORMAT, version: BK_VERSION, created: new Date().toISOString(), app: APP_VERSION,
      about: "Personal data from the Daily Readings app: bookmarks, highlights, fasting notes, saved sayings, reading position and settings. "+
             "Restore it in Settings → Backup and restore. The format is described in docs/BACKUP-FORMAT.md in the app's source.",
      data: deviceData()
    }, null, 1);
  }
  function canShareFiles(){
    try{ return !!(navigator.canShare && navigator.share && navigator.canShare({files:[new File(["{}"], "t.json", {type:"application/json"})]})); }
    catch(e){ return false; }
  }
  function markBackedUp(){ store.setItem("backup:last", String(Date.now())); paintBackupCard(); }
  function downloadBackup(){
    var blob=new Blob([backupText()], {type:"application/json"}), url=URL.createObjectURL(blob);
    var a=document.createElement("a"); a.href=url; a.download=backupFileName(); a.style.display="none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
    markBackedUp(); closeLayer();
    toast("Backup file ready — look in your downloads");
  }
  function shareBackup(){
    var f=new File([backupText()], backupFileName(), {type:"application/json"});
    navigator.share({files:[f], title:"Daily Readings backup"}).then(function(){ markBackedUp(); closeLayer(); }).catch(function(){});
  }
  function openBackup(){
    var body=el("backupBody"); body.innerHTML="";
    var d=deviceData();
    body.appendChild(mk("p","bkcount", countsText(d)+" · your reading position and settings"));
    body.appendChild(mk("p","warn","This file holds your private fasting notes, bookmarks and highlights. Anyone who has the file can read them. "+
      "Daily Readings does not send it anywhere — you choose where it goes."));
    var dl=mk("button","btn","Download the file"); dl.id="bkDownload";
    dl.addEventListener("click", downloadBackup); body.appendChild(dl);
    if(canShareFiles()){
      var sh=mk("button","btn ghost","Share or save to…"); sh.id="bkShare";
      sh.addEventListener("click", shareBackup); body.appendChild(sh);
    }
    body.appendChild(mk("p","note","File name: "+backupFileName()));
    openSheet("backupSheet");
  }

  // ----- restoring -----
  var pendingRestore=null;
  function restoreMessage(text){
    var body=el("restoreBody"); body.innerHTML="";
    body.appendChild(mk("p","warn",text));
    var ok=mk("button","btn ghost","Close"); ok.addEventListener("click", closeLayer); body.appendChild(ok);
    if(topKind()!=="sheet") openSheet("restoreSheet");
  }
  function showRestore(res){
    if(res.error){ restoreMessage(res.error); return; }
    pendingRestore=res;
    var body=el("restoreBody"); body.innerHTML="";
    body.appendChild(mk("p","bkmade","Backup made "+(res.created ? fmtDate(res.created) : "on an unknown date")+(res.app ? " · version "+res.app : "")));
    body.appendChild(mk("p","bkcount","In the backup: "+countsText(res.data)));
    if(res.bad) body.appendChild(mk("p","note", (res.bad===1 ? "1 entry" : res.bad+" entries")+" could not be read and will be left out."));
    var opts=mk("div","bkopts"), mode="merge";
    function opt(id, title, sub){
      var b=mk("button","opt"+(id===mode ? " active" : "")); b.setAttribute("data-mode", id);
      b.appendChild(mk("span","rd"));
      var t=mk("span"); t.appendChild(mk("b","",title)); t.appendChild(mk("small","",sub)); b.appendChild(t);
      b.addEventListener("click", function(){
        mode=id; each("#restoreBody .bkopts .opt", function(o){ o.classList.toggle("active", o.getAttribute("data-mode")===id); });
        show(cf, false); show(go, true);
      });
      opts.appendChild(b);
    }
    opt("merge", "Merge with this device", "Adds the backup’s bookmarks, highlights, fasting notes and saved sayings to what is here. "+
      "Where both hold something for the same verse or day, this device’s is kept. Settings here stay as they are.");
    opt("replace", "Replace what is on this device", "Makes this device match the backup exactly — records, reading position and settings. "+
      "Anything here that is not in the backup is removed.");
    body.appendChild(opts);
    var go=mk("button","btn","Restore"); go.id="bkRestoreGo"; body.appendChild(go);
    var cf=mk("div","bkconfirm hidden");
    cf.appendChild(mk("p","warn","On this device now: "+countsText(deviceData())+". All of it will be replaced by the backup. "+
      "You can undo this afterwards in Settings → Backup and restore."));
    var yes=mk("button","btn","Replace"), no=mk("button","btn ghost","Cancel");
    yes.id="bkReplaceYes"; cf.appendChild(yes); cf.appendChild(no); body.appendChild(cf);
    go.addEventListener("click", function(){
      if(mode==="replace"){ show(cf, true); show(go, false); return; }
      applyRestore("merge");
    });
    no.addEventListener("click", function(){ show(cf, false); show(go, true); });
    yes.addEventListener("click", function(){ applyRestore("replace"); });
    if(topKind()!=="sheet") openSheet("restoreSheet");
  }
  function applyRestore(mode){
    var res=pendingRestore; if(!res) return;
    snapshot();
    writeData(mode==="replace" ? res.data : mergeData(deviceData(), res.data));
    pendingRestore=null;
    reloadWith(mode==="replace" ? "Restored — this device now matches the backup" : "Restored — the backup is merged with this device");
  }
  el("restoreBtn").addEventListener("click", function(){ var f=el("restoreFile"); f.value=""; f.click(); });
  el("restoreFile").addEventListener("change", function(){
    var file=this.files && this.files[0]; if(!file) return;
    if(file.size > 2*1048576){ restoreMessage("This file is too large to be a Daily Readings backup."); return; }
    var fr=new FileReader();
    fr.onload=function(){
      var obj; try{ obj=JSON.parse(String(fr.result)); }
      catch(e){ restoreMessage("This file could not be read. Choose a backup saved by Daily Readings — its name ends in .json."); return; }
      showRestore(readBackup(obj));
    };
    fr.onerror=function(){ restoreMessage("This file could not be opened."); };
    fr.readAsText(file);
  });
  el("backupBtn").addEventListener("click", openBackup);
  el("undoBtn").addEventListener("click", undoRestore);
  function paintBackupCard(){
    var last=parseInt(store.getItem("backup:last")||"0",10);
    el("backupSub").textContent = "The file holds your private notes and records. Keep it somewhere safe."+
      (last ? " Last saved "+new Date(last).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})+"." : "");
    var u=jget("backup:undo", null);
    show(el("undoRow"), !!(u && u.t));
    if(u && u.t) el("undoLbl").textContent = "Puts back what was on this device before the restore of "+
      new Date(u.t).toLocaleDateString("en-AU",{day:"numeric",month:"long"})+" at "+new Date(u.t).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})+".";
  }
  function bootToast(){
    try{ var m=sessionStorage.getItem("dr:toast"); if(m){ sessionStorage.removeItem("dr:toast"); setTimeout(function(){ toast(m); }, 500); } }catch(e){}
  }
