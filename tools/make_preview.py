#!/usr/bin/env python3
"""Make a review copy of Daily Readings that can sit beside the live app without disturbing it.

    python3 tools/make_preview.py OUT_DIR

The copy is meant to be served at <site>/daily-readings/preview/. It differs from the live app in four ways:
  * a small "Preview" tag in the header, and "(Preview)" in the page title and app name;
  * its own service-worker cache names ("dr-preview-..."), so it never deletes or reuses the live app's caches;
  * a short script that restores the live app's offline page. Phones that already have the live app installed
    send their first visit to /preview/ through the live service worker, which keeps a copy of whatever page it
    fetched as the live app's offline page. The script puts the real live page back a few seconds later;
  * the production service worker's "leave /preview/ alone" line is removed (it has no meaning inside the copy).
Everything else (readings, data files, fonts, saved preferences) is identical to the production build.
"""
import json, os, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "..", "preview-build")
if os.path.isdir(out):
    shutil.rmtree(out)
os.makedirs(out)

def sub_once(text, old, new, what):
    n = text.count(old)
    if n != 1:
        sys.exit("make_preview: expected one %s, found %d" % (what, n))
    return text.replace(old, new)

html = open(os.path.join(REPO, "index.html"), encoding="utf-8").read()
html = sub_once(html, "<title>Daily Readings</title>", "<title>Daily Readings (Preview)</title>", "title")
html = sub_once(html, '<p class="s">Your daily spiritual companion.</p>\n    </div>',
                '<p class="s">Your daily spiritual companion.</p>\n    </div><span class="preview" title="Development version for review">Preview</span>',
                "header subtitle")
html = sub_once(html, 'var APP_VERSION = "v34";', 'var APP_VERSION = "v34 preview";', "version")
REPAIR = r'''<script>
/* Preview copy only. The live app's service worker (scope /daily-readings/) answers the very first visit to
   this page and keeps a copy of it as the live app's offline page. Put the live page back in its cache. */
(function(){
  if(!("caches" in window) || !window.fetch) return;
  var live = new URL("../index.html", location.href).href;
  function repair(){
    fetch(live, {cache:"no-store"}).then(function(res){
      if(!res || !res.ok) return;
      return res.clone().text().then(function(t){
        if(t.indexOf('class="preview"') > -1) return;          // only ever store the live page
        return caches.keys().then(function(keys){
          return Promise.all(keys.filter(function(k){ return /^orthodox-readings-v\d+$/.test(k); }).map(function(k){
            return caches.open(k).then(function(c){ return c.put(live, res.clone()); });
          }));
        });
      });
    }).catch(function(){});
  }
  setTimeout(repair, 2500); setTimeout(repair, 10000);
})();
</script>
</body>'''
html = sub_once(html, "</body>", REPAIR, "</body>")
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)

sw = open(os.path.join(REPO, "sw.js"), encoding="utf-8").read()
sw = sub_once(sw, 'var PREFIX = "orthodox-readings-";', 'var PREFIX = "dr-preview-";', "cache prefix")
sw = sub_once(sw, '  if(rel.indexOf("preview/") === 0) return;                // the review copy has its own service worker\n', "", "preview skip")
open(os.path.join(out, "sw.js"), "w", encoding="utf-8").write(sw)

man = json.load(open(os.path.join(REPO, "manifest.webmanifest"), encoding="utf-8"))
man["name"] = "Daily Readings Preview"
man["short_name"] = "Preview"
open(os.path.join(out, "manifest.webmanifest"), "w", encoding="utf-8").write(json.dumps(man, indent=2, ensure_ascii=False) + "\n")

for f in ("fathers.json", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon-32.png"):
    shutil.copy(os.path.join(REPO, f), out)
for d in ("greek", "greek-pt", "kjv", "fonts"):
    shutil.copytree(os.path.join(REPO, d), os.path.join(out, d))
print("preview copy written to", os.path.abspath(out))
