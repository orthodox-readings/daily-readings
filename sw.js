/* Minimal offline shell. Data caching is handled in-page via localStorage. */
var CACHE = "orthodox-readings-v11";
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
      return Promise.all(keys.map(function(k){ if(k!==CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var url = new URL(e.request.url);
  // Only manage our own app-shell files. Let API/network calls pass straight through.
  if(url.origin === self.location.origin){
    e.respondWith(
      caches.match(e.request).then(function(hit){
        return hit || fetch(e.request).then(function(res){
          return res;
        }).catch(function(){ return caches.match("./index.html"); });
      })
    );
  }
});
