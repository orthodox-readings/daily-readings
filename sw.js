/* Daily Readings — offline support. Day data is kept in the page (localStorage); this file keeps the app itself.
   Cache names carry the version: changing CACHE makes every installed copy fetch the new app on its next open. */
var PREFIX = "orthodox-readings-";
var CACHE = PREFIX + "v34";
var GREEK_CACHE = PREFIX + "greek-1";    // Greek NT by chapter (Robinson–Pierpont), kept across app updates
var TEXT_CACHE = PREFIX + "texts-1";     // KJV and Patriarchal Text by book, kept across app updates
var KEEP = [CACHE, GREEK_CACHE, TEXT_CACHE];
var ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./fathers.json",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png",
  "./fonts/literata-latin-400-normal.woff2",
  "./fonts/literata-greek-400-normal.woff2",
  "./fonts/literata-greek-ext-400-normal.woff2",
  "./fonts/literata-latin-500-normal.woff2",
  "./fonts/literata-greek-500-normal.woff2",
  "./fonts/literata-greek-ext-500-normal.woff2"
];
var SCOPE = new URL("./", self.location.href).pathname;   // e.g. /daily-readings/

self.addEventListener("install", function(e){
  // cache:"reload" fetches fresh copies, never ones the browser kept from an earlier version
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(ASSETS.map(function(u){ return new Request(u, {cache: "reload"}); }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  // Remove only this app's own older caches. Caches with other names (another build on this site) are left alone.
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k.indexOf(PREFIX) === 0 && KEEP.indexOf(k) < 0) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function cacheFirst(cacheName, req){
  return caches.open(cacheName).then(function(c){
    return c.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        if(res && res.ok) c.put(req, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;            // readings API and other sites: straight to the network
  var path = url.pathname;
  if(path.indexOf(SCOPE) !== 0) return;                      // outside this app
  var rel = path.slice(SCOPE.length);
  if(rel.indexOf("preview/") === 0) return;                // the review copy has its own service worker
  if(e.request.mode === "navigate" || rel === "" || rel === "index.html"){
    // NETWORK-FIRST for the page: every online open gets the newest version; the saved copy serves offline.
    var isApp = (rel === "" || rel === "index.html");
    var req = e.request;
    try{ req = new Request(e.request, {cache: "no-cache"}); }catch(err){}   // always ask the server whether the page changed
    e.respondWith(
      fetch(req).then(function(res){
        if(isApp && res && res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put("./index.html", copy); }); }
        return res;
      }).catch(function(){
        return caches.match("./index.html", {cacheName: CACHE}).then(function(hit){ return hit || caches.match("./index.html"); });
      })
    );
  } else if(rel.indexOf("greek/") === 0){
    e.respondWith(cacheFirst(GREEK_CACHE, e.request));
  } else if(rel.indexOf("kjv/") === 0 || rel.indexOf("greek-pt/") === 0){
    e.respondWith(cacheFirst(TEXT_CACHE, e.request));
  } else {
    // Cache-first for the app's own files (icons, fonts, sayings), refreshed by the version change.
    e.respondWith(
      caches.match(e.request, {cacheName: CACHE}).then(function(hit){ return hit || fetch(e.request); })
    );
  }
});
