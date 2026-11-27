/* Minimal offline shell. Data caching is handled in-page via localStorage. */
var CACHE = "orthodox-readings-v33";
var GREEK_CACHE = "orthodox-readings-greek-1";   // Greek NT chapters, kept across app updates
var ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./fathers.json",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if(k!==CACHE && k!==GREEK_CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;   // API/network calls pass straight through

  var isShellPage = e.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") || url.pathname.endsWith("/");

  if(isShellPage){
    // NETWORK-FIRST for the page itself: every online open gets the newest
    // version immediately; the cached copy serves offline. (Cache-first here
    // once left phones stuck on an old version — v28.)
    e.respondWith(
      fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put("./index.html", copy); });
        return res;
      }).catch(function(){
        return caches.match("./index.html");
      })
    );
  } else if(url.pathname.indexOf("/greek/") > -1){
    // Greek New Testament chapters: cache-first, saved as they are read so they work offline afterwards.
    e.respondWith(
      caches.open(GREEK_CACHE).then(function(c){
        return c.match(e.request).then(function(hit){
          return hit || fetch(e.request).then(function(res){
            if(res && res.ok) c.put(e.request, res.clone());
            return res;
          });
        });
      })
    );
  } else {
    // Cache-first for static assets (icons, quotes), refreshed by version bump.
    e.respondWith(
      caches.match(e.request).then(function(hit){
        return hit || fetch(e.request).catch(function(){ return caches.match("./index.html"); });
      })
    );
  }
});
