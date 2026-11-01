"use strict";
// npm test: everything that works without the network, against a small stand-in for the referee. One test needs drand and is skipped offline.
const http = require("http"), fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const kit = require("../src/index.js");
const { main } = require("../bin/manometer-originator.js");
const KEY = require("../lib/schluessel.js");
const { kanon, sha256Hex } = require("../lib/kanon.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (x === undefined ? "" : "  " + JSON.stringify(x).slice(0, 400))); } };
const T0 = Date.UTC(2026, 10, 4, 18, 0), KO = T0 + 3600e3;
const game = { pinId: "1612345", sport: "fb", home: "Arsenal", away: "Everton", league: "Premier League", kickoff: KO, live: false, lines: { ah: [-0.5], total: [2.5] } };
const liveGame = Object.assign({}, game, { pinId: "1612346", kickoff: T0 - 1800e3, live: true });

// ---- proposals
let p = kit.buildProposal({ sourceId: "src", game, market: "1x2", selection: "1", minOdds: 2.1, fairOdds: 2, devigMethod: "shin", proposalId: "p1", ev: 5 }, T0);
ok("P1 built from a catalog game", p.eventIdentity.pinId === "1612345" && p.eventIdentity.home === "Arsenal" && p.eventIdentity.startsTs === KO && p.sport === "fb" && p.fairOdds === 2 && p.minOdds === 2.1 && p.ev === 5 && p.ttlMs === 120000, p);
ok("P2 fulfils contract v1", kit.validate(p, T0).ok, kit.validate(p, T0));
let q = kit.buildProposal({ sourceId: "src", game, market: "1x2", selection: "1", minOdds: 2.1 }, T0);
ok("P3 without a fair price: minOdds counts, devig tipster, fresh id", q.fairOdds === 2.1 && q.devigMethod === "tipster" && /^p_[0-9a-f]{24}$/.test(q.proposalId), q);
q = kit.buildProposal({ sourceId: "src", sport: "basket", home: "A", away: "B", kickoff: "2026-11-04T20:00:00Z", market: "spread", selection: "home", line: -4.5, minOdds: 1.9 }, T0);
ok("P4 by hand: kick-off as text, line", q.eventIdentity.startsTs === Date.UTC(2026, 10, 4, 20) && q.line === -4.5 && kit.validate(q, T0).ok, kit.validate(q, T0));
ok("P5 a market that needs a line fails without one", !kit.validate(kit.buildProposal({ sourceId: "src", game, market: "ah", selection: "home", minOdds: 2 }, T0), T0).ok);
ok("P6 wrong selection fails", !kit.validate(kit.buildProposal({ sourceId: "src", game, market: "1x2", selection: "home", minOdds: 2 }, T0), T0).ok);
q = kit.buildProposal({ sourceId: "src", game: liveGame, market: "1x2", selection: "X", minOdds: 3 }, T0);
ok("P7 live game: live flag set", q.live === true, q);
// ---- rounds
const r = kit.roundAt(KO);
ok("R1 first round at or after the time", kit.roundTime(r) >= KO && kit.roundTime(r - 1) < KO);
ok("R2 quicknet is pinned", kit.QUICKNET.hash === "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971" && kit.QUICKNET.period === 3);

(async () => {
  // ---- sealing
  const s = await kit.sealProposal(p);
  const h = kit.sealHeader(s.ciphertext);
  ok("S1 seal names the kick-off round and the chain, proposal unreadable", h.round === r && h.chain === kit.QUICKNET.hash && s.opensAt === kit.roundTime(r) && s.ciphertext.indexOf("Arsenal") < 0 && Buffer.from(s.ciphertext).toString("base64").indexOf(Buffer.from("Arsenal").toString("base64")) < 0, h);
  // ---- stand-in referee
  const sig = crypto.generateKeyPairSync("ed25519");
  const pubRoh = KEY.rohAusPublic(sig.publicKey);
  const signiere = (o) => Object.assign({}, o, { sig: crypto.sign(null, Buffer.from(kanon(o), "utf8"), sig.privateKey).toString("base64") });
  const seen = new Map(), calls = []; let antwort500 = 0;
  const srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
      const j = b ? JSON.parse(b) : {}; calls.push({ url: req.url, j });
      const send = (c, o) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.url === "/netz/pubkey") return send(200, { ok: true, publicKey: pubRoh });
      if (req.url.startsWith("/netz/quittung/")) { const q0 = [...seen.values()].find((x) => x.rid === req.url.split("/").pop()); return q0 ? send(200, { ok: true, receipt: q0 }) : send(404, { ok: false, error: "unknown receipt" }); }
      if (j.apiKey !== "k") return send(401, { ok: false, error: "unknown source or bad API key" });
      if (req.url === "/site/quelle/spiele") { const w = String(j.q || "").toLowerCase(); return send(200, { ok: true, games: [game, Object.assign({}, liveGame, { kickoff: Date.now() - 1800e3 })].filter((g) => (g.home + g.away).toLowerCase().indexOf(w) >= 0) }); }
      if (req.url === "/netz/submit") {
        if (antwort500-- > 0) return send(503, { ok: false, error: "market snapshot unavailable, retry" });
        const dup = seen.get(j.proposalId); if (dup) return send(200, { ok: true, duplicate: true, receipt: dup });
        const inhalt = j.sealed ? j.sealed.ciphertext : kanon(j.proposal);
        const rc = signiere({ v: 1, rid: "r_" + "a".repeat(24).slice(seen.size) + "b".repeat(seen.size), sourceId: j.sourceId, proposalId: j.proposalId, sealed: !!j.sealed, payloadSha256: sha256Hex(inhalt) });
        seen.set(j.proposalId, rc); return send(200, { ok: true, receipt: rc });
      }
      send(404, { ok: false });
    });
  });
  await new Promise((w) => srv.listen(0, "127.0.0.1", w));
  const url = "http://127.0.0.1:" + srv.address().port;
  const client = kit.createClient({ sourceId: "src", apiKey: "k", baseUrl: url });
  const gefunden = await client.games("arsenal");
  ok("C1 catalog", gefunden.length === 2 && gefunden[0].pinId === "1612345");
  let wurf = null; try { await kit.createClient({ sourceId: "src", apiKey: "falsch", baseUrl: url }).games("x"); } catch (e) { wurf = e.message; }
  ok("C2 wrong key: clear error", /bad API key/.test(wurf || ""), wurf);
  const a = await client.send(p, { now: T0 });
  ok("C3 pre-match goes sealed, no plain proposal on the wire", a.ok && a.sealed === true && !!calls[calls.length - 1].j.sealed && !calls[calls.length - 1].j.proposal && JSON.stringify(calls[calls.length - 1].j).indexOf("Arsenal") < 0, a);
  const pk = await client.publicKey();
  ok("C4 signed receipt checks out", kit.verifyReceipt(a.receipt, pk.publicKey) === true);
  ok("C5 a changed receipt fails", kit.verifyReceipt(Object.assign({}, a.receipt, { proposalId: "anders" }), pk.publicKey) === false);
  const a2 = await client.send(p, { now: T0 });
  ok("C6 same id, same receipt", a2.duplicate === true && a2.receipt.rid === a.receipt.rid);
  const pl = kit.buildProposal({ sourceId: "src", game: liveGame, market: "1x2", selection: "1", minOdds: 2, proposalId: "p-live" }, T0);
  const al = await client.send(pl, { now: T0 });
  ok("C7 live goes in clear", al.ok && al.sealed === false && calls[calls.length - 1].j.proposal.live === true, al);
  const pc = kit.buildProposal({ sourceId: "src", game, market: "1x2", selection: "2", minOdds: 2, proposalId: "p-clear" }, T0);
  ok("C8 clear on request", (await client.send(pc, { seal: false, now: T0 })).sealed === false);
  const kaputt = await client.send(kit.buildProposal({ sourceId: "src", game, market: "1x2", selection: "home", minOdds: 2 }, T0), { now: T0 });
  ok("C9 invalid proposal is not sent", kaputt.ok === false && /invalid proposal/.test(kaputt.error) && kaputt.status === 0, kaputt);
  antwort500 = 2; const n0 = calls.length;
  const nach = await client.send(kit.buildProposal({ sourceId: "src", game, market: "1x2", selection: "X", minOdds: 3, proposalId: "p-retry" }, T0), { seal: false, tries: 3, now: T0 });
  ok("C10 retries after 503, same id", nach.ok && calls.slice(n0).filter((c) => c.url === "/netz/submit").length === 3 && calls.slice(n0).every((c) => c.j.proposalId === "p-retry"), nach);
  antwort500 = 0; const n1 = calls.length;
  const nein = await kit.createClient({ sourceId: "src", apiKey: "falsch", baseUrl: url }).send(pc, { seal: false, tries: 3, now: T0 });
  ok("C11 no retry on 401", !nein.ok && nein.status === 401 && calls.length === n1 + 1, nein);
  const ohne = kit.createClient({ baseUrl: url }); let w2 = null; try { await ohne.games("x"); } catch (e) { w2 = e.message; }
  ok("C12 without credentials: says so", /required/.test(w2 || ""));
  // ---- CLI
  const lauf = async (arg, env) => { const o = []; const c = await main(arg, Object.assign({ MANOMETER_SOURCE: "src", MANOMETER_KEY: "k", MANOMETER_URL: url }, env || {}), (t) => o.push(t)); return { c, o: o.join("\n") }; };
  let l = await lauf(["help"]);
  ok("K1 help", l.c === 0 && /games <text>/.test(l.o));
  l = await lauf(["games", "arsenal"]);
  ok("K2 games shows id and teams, LIVE marked", l.c === 0 && /1612345/.test(l.o) && /Arsenal – Everton/.test(l.o) && /LIVE/.test(l.o), l.o);
  l = await lauf(["round", "2026-11-04T19:00:00Z"]);
  ok("K3 round", l.c === 0 && l.o.indexOf(String(r)) === 0, l.o);
  l = await lauf(["send", "--pin", "1612346", "--market", "1x2", "--selection", "1", "--min", "2.5"]);
  ok("K4 send on a live game: in clear, receipt shown", l.c === 0 && /In clear/.test(l.o) && /Receipt r_/.test(l.o), l.o);
  l = await lauf(["send", "--pin", "999", "--market", "1x2", "--selection", "1", "--min", "2.5"]);
  ok("K5 unknown game: exit code 2", l.c === 2, l);
  const rid = [...seen.values()][0].rid; l = await lauf(["receipt", rid]);
  ok("K6 receipt with signature check", l.c === 0 && /Signature OK/.test(l.o), l.o);
  // ---- browser build, in a sandbox with the real tlock bundle
  require("../scripts/build-browser.js");
  const box = { fetch: (u, x) => globalThis.fetch(u, x), Promise, setTimeout, crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, console, Date, JSON, Math, Object, Array, String, Number, Buffer, atob, btoa };
  box.globalThis = box; box.window = box; box.self = box; vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../vendor/tlock.bundle.js"), "utf8"), box);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../dist/originator-kit.js"), "utf8"), box);
  const B = box.ManometerKit;
  ok("B1 browser build exposes the same functions", B && typeof B.createClient === "function" && typeof B.buildProposal === "function" && B.roundAt(KO) === r);
  const bc = B.createClient({ sourceId: "src", apiKey: "k", baseUrl: url });
  const bp = B.buildProposal({ sourceId: "src", game, market: "1x2", selection: "1", minOdds: 2.2, proposalId: "p-browser" }, T0);
  const br = await bc.send(bp, { now: T0 });
  const bl = calls[calls.length - 1].j;
  ok("B2 browser seals with the bundle, the header is the same", br.ok && br.sealed && kit.sealHeader(bl.sealed.ciphertext).round === r, br);
  // ---- a real seal opens at its round (needs drand)
  const DRAND = require("../lib/drand.js");
  try {
    const vor = Date.now() - 120000, rv = kit.roundAt(vor);
    const c = await kit.sealProposal(Object.assign({}, p, { eventIdentity: Object.assign({}, p.eventIdentity, { startsTs: vor }) }));
    const b = await DRAND.holeBeacon(rv, globalThis.fetch);
    const offen = await kit.openSeal(c.ciphertext, b);
    ok("D1 real drand beacon opens the seal, and the proposal is intact", String(offen).indexOf("Arsenal") >= 0, String(offen).slice(0, 80));
    const anders = await DRAND.holeBeacon(rv - 1, globalThis.fetch);
    let zu = false; try { await kit.openSeal(c.ciphertext, anders); } catch (_) { zu = true; }
    ok("D2 another round's beacon does not open it", zu);
  } catch (e) { console.log("skipped D1/D2 (no drand): " + String(e && e.message).slice(0, 80)); }
  srv.close();
  console.log("manometer-originator-kit: pass " + pass + " fail " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); console.log("manometer-originator-kit: pass " + pass + " fail " + (fail + 1)); process.exit(1); });
