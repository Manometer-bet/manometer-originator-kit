"use strict";
// The part of the kit that runs anywhere: building and checking proposals, drand rounds, talking to the referee.
// No Node modules here, so that the browser build can use the same code. Sealing and signature checks are handed in.
const DRAND = require("../lib/drand.js");
const FEED = require("../lib/feed-core.js");

const DEFAULT_URL = "https://manometer.bet";
const SPORT_MARKETS = { fb: ["1x2", "ah", "total"], basket: ["ml", "spread", "total"], tennis: ["ml", "games"], cs2: ["ml", "total"] };

const roundAt = (ms) => DRAND.rundeAb(ms);
const roundTime = (round) => DRAND.rundeZeit(round);

function newId(rand) {
  const r = rand || (() => Math.random());
  let s = ""; for (let i = 0; i < 24; i++) s += Math.floor(r() * 16).toString(16);
  return "p_" + s;
}

// Build a proposal. `game` is an entry from the catalog (games()), or give home, away and kickoff yourself.
// Without fairOdds the proposal says the bet is worth taking at minOdds: fairOdds = minOdds, devigMethod "tipster".
function buildProposal(o, now, rand) {
  const t = now == null ? Date.now() : now, g = o.game || {};
  const fairGiven = o.fairOdds != null && o.fairOdds !== "";
  const kickoff = typeof (g.kickoff != null ? g.kickoff : o.kickoff) === "number" ? (g.kickoff != null ? g.kickoff : o.kickoff) : Date.parse(o.kickoff);
  const p = {
    proposalId: o.proposalId || newId(rand),
    sourceId: o.sourceId,
    sport: g.sport || o.sport,
    mkt: o.market,
    sel: o.selection,
    eventIdentity: { home: g.home || o.home, away: g.away || o.away, league: g.league || o.league || "", startsTs: kickoff },
    fairOdds: fairGiven ? Number(o.fairOdds) : Number(o.minOdds),
    devigMethod: fairGiven ? (o.devigMethod || "shin") : "tipster",
    minOdds: Number(o.minOdds),
    tsCreated: t,
    ttlMs: Math.round((o.ttlSeconds != null ? Number(o.ttlSeconds) : 120) * 1000),
  };
  const pin = g.pinId != null ? g.pinId : o.pinId;
  if (pin != null && pin !== "") p.eventIdentity.pinId = String(pin);
  if (o.line != null && o.line !== "") p.line = Number(o.line);
  if (o.scope) p.scope = o.scope;
  if (o.ev != null && o.ev !== "") p.ev = Number(o.ev);
  if (o.stakeHint != null && o.stakeHint !== "") p.stakeHint = Number(o.stakeHint);
  if (g.live === true || o.live === true) p.live = true;
  return p;
}

// Contract v1, exactly as the referee checks it. { ok, errors }
function validate(p, now) { return FEED.feedValidateProposal(p, now == null ? Date.now() : now); }

function createClient(o) {
  const opts = o || {};
  const base = String(opts.baseUrl || DEFAULT_URL).replace(/\/+$/, "");
  const doFetch = opts.fetch || ((u, x) => globalThis.fetch(u, x));
  const seal = opts.seal;
  const need = () => { if (!opts.sourceId || !opts.apiKey) throw new Error("sourceId and apiKey are required"); };
  async function call(method, path, body) {
    const r = await doFetch(base + path, method === "POST" ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method });
    let j = null; try { j = await r.json(); } catch (_) { j = null; }
    return { status: r.status, ok: !!(r.status >= 200 && r.status < 300 && j && j.ok !== false), json: j };
  }
  const client = {
    // The catalog of games you can send on: pre-match and live, lines without prices.
    async games(q) {
      need();
      const a = typeof q === "string" ? { q } : q || {};
      const r = await call("POST", "/site/quelle/spiele", { sourceId: opts.sourceId, apiKey: opts.apiKey, q: a.q || "", sport: a.sport });
      if (!r.ok) throw new Error((r.json && r.json.error) || "catalog: HTTP " + r.status);
      return r.json.games;
    },
    // Send a proposal. Pre-match proposals are sealed until kick-off unless you pass { seal: false }; live proposals always go in clear.
    // The referee answers the same proposalId with the same receipt, so a retry after a network error is safe.
    async send(p, sendOpts) {
      need();
      const so = sendOpts || {};
      const v = validate(p, so.now);
      if (!v.ok) return { ok: false, status: 0, error: "invalid proposal: " + v.errors.join("; "), errors: v.errors };
      const env = { sourceId: opts.sourceId, apiKey: opts.apiKey, proposalId: p.proposalId };
      const sealIt = p.live !== true && so.seal !== false;
      if (sealIt) {
        if (typeof seal !== "function") return { ok: false, status: 0, error: "sealing is not available here; load the tlock bundle or pass { seal: false }" };
        env.sealed = { ciphertext: await seal(JSON.stringify(p), roundAt(p.eventIdentity.startsTs)) };
      } else env.proposal = p;
      const tries = Math.max(1, Number(so.tries) || 1);
      let last = null;
      for (let i = 0; i < tries; i++) {
        try { last = await call("POST", "/netz/submit", env); } catch (e) { last = { status: 0, ok: false, json: { error: String((e && e.message) || e) } }; }
        if (last.ok || (last.status >= 400 && last.status < 500 && last.status !== 429)) break;
        if (i + 1 < tries) await new Promise((w) => setTimeout(w, 500 * Math.pow(2, i)));
      }
      return { ok: last.ok, status: last.status, sealed: sealIt, receipt: last.json && last.json.receipt, duplicate: !!(last.json && last.json.duplicate), error: last.ok ? null : (last.json && last.json.error) || "HTTP " + last.status };
    },
    async receipt(rid) { const r = await call("GET", "/netz/quittung/" + encodeURIComponent(rid)); if (!r.ok) throw new Error((r.json && r.json.error) || "receipt: HTTP " + r.status); return r.json.receipt || r.json; },
    async publicKey() { const r = await call("GET", "/netz/pubkey"); if (!r.ok) throw new Error((r.json && r.json.error) || "public key: HTTP " + r.status); return r.json; },
  };
  return client;
}

module.exports = { createClient, buildProposal, validate, roundAt, roundTime, newId, SPORT_MARKETS, DEFAULT_URL, QUICKNET: DRAND.QUICKNET, markets: FEED.FEED_MARKETS };
