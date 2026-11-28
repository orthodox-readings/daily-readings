/* Daily Readings — offline support (service worker), version 36, build 823edba0ed.
   Made by tools/build.py from src/sw.template.js: edit the template, not sw.js.

   What it keeps:
     CACHE        the app itself (page, sayings, icons, fonts, package list, source registry). Its name carries the
                  version and a hash of everything the app ships, so any change reaches installed phones on their
                  next open, and the previous copy is removed only after the new one is complete.
     GREEK_CACHE  Greek New Testament chapters (Byzantine Textform)          } kept across app updates; filled as
     TEXT_CACHE   KJV and Patriarchal Text, one file per book                } chapters are read or packages saved
   Day data (readings, saints, fasts) is kept by the page itself, not here. Nothing personal is ever stored here. */
var PREFIX = "dr-preview-";
var CACHE = PREFIX + "v36-823edba0ed";
var GREEK_CACHE = PREFIX + "greek-1";
var TEXT_CACHE = PREFIX + "texts-1";
var KEEP = [CACHE, GREEK_CACHE, TEXT_CACHE];
var ASSETS = [
  "./", "./index.html",
  "./manifest.webmanifest",
  "./packages.json",
  "./fathers.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
  "./fonts/literata-greek-400-normal.woff2",
  "./fonts/literata-greek-500-normal.woff2",
  "./fonts/literata-greek-ext-400-normal.woff2",
  "./fonts/literata-greek-ext-500-normal.woff2",
  "./fonts/literata-latin-400-normal.woff2",
  "./fonts/literata-latin-500-normal.woff2",
  "./data/sources.json"
];
var SCOPE = new URL("./", self.location.href).pathname;   // e.g. /daily-readings/

self.addEventListener("install", function(e){
  // cache:"reload" fetches fresh copies, never ones the browser kept from an earlier version. If any file
  // fails, installation fails and the previous version stays in charge, complete and untouched.
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(ASSETS.map(function(u){ return new Request(u, {cache: "reload"}); }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  // Remove only this app's own older copies. Caches with other names (the review copy, other sites) are left alone.
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k.indexOf(PREFIX) === 0 && KEEP.indexOf(k) < 0) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Texts: from the device when saved, otherwise from the network (and then kept, but only if the file is
// complete and readable). A request marked "X-Daily-Readings: fresh" — an offline-package download or the repair
// of a damaged copy — always goes to the network; the page checks that file and stores it itself. (The request's
// cache mode is not used for this: browsers set it to "reload" for every request while developer tools have the
// cache switched off, which would stop saved texts being read offline.)
function cacheFirst(cacheName, req){
  if(req.headers.get("X-Daily-Readings") === "fresh") return fetch(req);
  return caches.open(cacheName).then(function(c){
    return c.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        if(res && res.ok){
          var check = res.clone(), keep = res.clone();
          check.text().then(function(t){ JSON.parse(t); return c.put(req, keep); }).catch(function(){});
        }
        return res;
      });
    });
  }, function(){ return fetch(req); });
}

function appFile(req){
  return caches.match(req, {cacheName: CACHE}).then(function(hit){
    return hit || fetch(req);
  }, function(){ return fetch(req); });
}

self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;            // readings API and other sites: straight to the network
  var path = url.pathname;
  if(path.indexOf(SCOPE) !== 0) return;                      // outside this app
  var rel = path.slice(SCOPE.length);
  if(e.request.mode === "navigate" || rel === "" || rel === "index.html"){
    // NETWORK-FIRST for the page: every online open gets the newest version; the saved copy serves offline.
    var isApp = (rel === "" || rel === "index.html");
    var req = e.request;
    try{ req = new Request(e.request, {cache: "no-cache"}); }catch(err){}   // always ask the server whether the page changed
    e.respondWith(
      fetch(req).then(function(res){
        if(isApp && res && res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ return c.put("./index.html", copy); }).catch(function(){}); }
        return res;
      }).catch(function(){
        return caches.match("./index.html", {cacheName: CACHE}).then(function(hit){
          return hit || caches.match("./index.html");
        }).then(function(hit){
          return hit || new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>" +
            "<p style='font:16px system-ui;padding:24px'>Daily Readings needs a connection to open for the first time.</p>",
            {status: 503, headers: {"Content-Type": "text/html; charset=utf-8"}});
        });
      })
    );
  } else if(rel.indexOf("greek/") === 0){
    e.respondWith(cacheFirst(GREEK_CACHE, e.request));
  } else if(rel.indexOf("kjv/") === 0 || rel.indexOf("greek-pt/") === 0){
    e.respondWith(cacheFirst(TEXT_CACHE, e.request));
  } else {
    // The app's own files (icons, fonts, sayings, package list): from this version's copy, refreshed by each update.
    e.respondWith(appFile(e.request));
  }
});
