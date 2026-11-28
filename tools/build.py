#!/usr/bin/env python3
"""Build Daily Readings from its source modules.

    python3 tools/build.py            -> writes index.html, sw.js, manifest.webmanifest, packages.json
    python3 tools/build.py --check    -> fails if the committed build files are out of date

The app is still published as ONE page (index.html: fast to load, simple to cache), but it is edited as
modules in src/:
    src/page-head.html      <head> metadata
    src/css/*.css           styles, joined in file-name order (the order is the cascade order)
    src/html/*.html         markup, joined in file-name order
    src/js/*.js             the app, joined in file-name order inside one private scope
    src/sw.template.js      the offline service worker
    src/manifest.json       the home-screen manifest
    data/sources.json       the content source registry (shown in Settings -> Sources & licences)

Versioning is automatic: VERSION below is the human version; BUILD is a hash of everything the app
ships. The service worker's cache name carries both, so every change reaches installed phones.
"""
import hashlib, json, os, re, sys

VERSION = "36"                       # the human version number shown in Settings
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")

def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()

def joined(folder, ext):
    d = os.path.join(SRC, folder)
    names = sorted(n for n in os.listdir(d) if n.endswith(ext))
    return "".join(read("src", folder, n) for n in names), names

# ---------- offline packages: every bundled text the user can save for reading without a connection ----------
NT = [(40,28),(41,16),(42,24),(43,21),(44,28),(45,16),(46,16),(47,13),(48,6),(49,6),(50,4),(51,4),(52,5),(53,3),(54,6),
      (55,4),(56,3),(57,1),(58,13),(59,5),(60,5),(61,3),(62,5),(63,1),(64,1),(65,1),(66,22)]
PACKAGES = [
    {"id": "nt-kjv", "name": "New Testament — English", "sub": "King James Version", "unit": "books",
     "cache": "texts", "files": ["kjv/%d.json" % b for b, _ in NT]},
    {"id": "nt-rp",  "name": "New Testament — Greek", "sub": "Byzantine Textform (Robinson–Pierpont)", "unit": "chapters",
     "cache": "greek", "files": ["greek/%d/%d.json" % (b, c) for b, n in NT for c in range(1, n + 1)]},
    {"id": "nt-pt",  "name": "New Testament — Greek", "sub": "Patriarchal Text (1904/1912)", "unit": "books",
     "cache": "texts", "files": ["greek-pt/%d.json" % b for b, _ in NT]},
]

def build_packages():
    out = []
    for p in PACKAGES:
        h = hashlib.sha256(); size = 0
        for f in p["files"]:
            b = open(os.path.join(ROOT, f), "rb").read()
            h.update(f.encode() + b"\0" + b); size += len(b)
        q = dict(p); q["bytes"] = size; q["version"] = h.hexdigest()[:12]
        out.append(q)
    return out

def main(check=False):
    head = read("src", "page-head.html")
    css, css_files = joined("css", ".css")
    html, html_files = joined("html", ".html")
    js, js_files = joined("js", ".js")
    sources = json.loads(read("data", "sources.json")) if os.path.exists(os.path.join(ROOT, "data", "sources.json")) else None

    # Every file the app shell needs offline (fonts, sayings, icons) is part of the build hash.
    shell_assets = ["manifest.webmanifest", "packages.json", "fathers.json", "icon-192.png", "icon-512.png",
                    "apple-touch-icon.png", "favicon-32.png"] + \
                   ["fonts/" + n for n in sorted(os.listdir(os.path.join(ROOT, "fonts"))) if n.endswith(".woff2")]
    if sources is not None:
        shell_assets.append("data/sources.json")

    page = (head + "<style>\n" + css + "</style>\n</head>\n<body>\n" + html + "<script>\n(function(){\n" + js +
            "})();\n</script>\n</body>\n</html>\n")

    packages = build_packages()
    manifest = json.loads(read("src", "manifest.json"))
    manifest_txt = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    pk_txt = json.dumps({"format": "daily-readings-packages", "version": 1, "packages": packages}, ensure_ascii=False, indent=1) + "\n"

    h = hashlib.sha256()
    h.update(page.encode()); h.update(manifest_txt.encode()); h.update(pk_txt.encode())
    for a in shell_assets:
        if a in ("manifest.webmanifest", "packages.json"):      # generated here; already hashed above
            continue
        h.update(a.encode() + b"\0" + open(os.path.join(ROOT, a), "rb").read())
    sw_src = read("src", "sw.template.js")
    h.update(sw_src.encode())
    build = h.hexdigest()[:10]

    page = page.replace("@@VERSION@@", VERSION).replace("@@BUILD@@", build)
    sw = (sw_src.replace("@@VERSION@@", VERSION).replace("@@BUILD@@", build)
                .replace("@@ASSETS@@", ",\n".join('  "./%s"' % a for a in shell_assets)))
    assert "@@" not in page and "@@" not in sw, "unreplaced placeholder"

    outputs = {"index.html": page, "sw.js": sw, "manifest.webmanifest": manifest_txt, "packages.json": pk_txt}
    stale = []
    for name, text in outputs.items():
        path = os.path.join(ROOT, name)
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if old != text:
            stale.append(name)
            if not check:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)
    if check:
        if stale:
            sys.exit("build: out of date — run python3 tools/build.py (%s)" % ", ".join(stale))
        print("build: up to date (version %s, build %s)" % (VERSION, build))
    else:
        print("build: version %s, build %s — %d css, %d html, %d js modules; %s" %
              (VERSION, build, len(css_files), len(html_files), len(js_files), ", ".join(stale) or "no changes"))

if __name__ == "__main__":
    main(check="--check" in sys.argv)
