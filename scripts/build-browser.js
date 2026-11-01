"use strict";
// Builds dist/originator-kit.js: the same core as in Node, as one file for a <script> tag. Exposes window.ManometerKit.
// No bundler, so the output is easy to read and to reproduce byte for byte. Load vendor/tlock.bundle.js first for sealing.
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, "..");
const MODULE = { "../lib/drand.js": "lib/drand.js", "../lib/feed-core.js": "lib/feed-core.js", "./core": "src/core.js" };
const stueck = (name, file) => "__m[" + JSON.stringify(name) + "] = function (module, exports, require) {\n" + fs.readFileSync(path.join(R, file), "utf8") + "\n};\n";
const pkg = JSON.parse(fs.readFileSync(path.join(R, "package.json"), "utf8"));
const out = "/* manometer-originator-kit " + pkg.version + " · Apache-2.0 · https://manometer.bet/open-source.html */\n(function (root) {\n\"use strict\";\nvar __m = {}, __c = {};\nfunction __r(n) { if (__c[n]) return __c[n].exports; var m = __c[n] = { exports: {} }; __m[n](m, m.exports, __r); return m.exports; }\n"
  + stueck("../lib/drand.js", MODULE["../lib/drand.js"]) + stueck("../lib/feed-core.js", MODULE["../lib/feed-core.js"]) + stueck("./core", MODULE["./core"])
  + "var core = __r(\"./core\");\nvar seal = function (text, round) { if (!(root.TLOCK && root.TLOCK.versiegle)) return Promise.reject(new Error(\"Load vendor/tlock.bundle.js before sealing\")); return root.TLOCK.versiegle(text, round); };\n"
  + "root.ManometerKit = Object.assign({}, core, { createClient: function (o) { return core.createClient(Object.assign({ seal: seal, fetch: function (u, x) { return root.fetch(u, x); } }, o)); } });\n"
  + "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n";
fs.mkdirSync(path.join(R, "dist"), { recursive: true });
fs.writeFileSync(path.join(R, "dist/originator-kit.js"), out);
console.log("dist/originator-kit.js", out.length, "bytes");
