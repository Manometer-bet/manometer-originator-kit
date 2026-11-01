#!/usr/bin/env node
"use strict";
// Command line for signal sources. Source and key come from the environment, so they stay out of your shell history:
//   MANOMETER_SOURCE=your-source MANOMETER_KEY=... manometer-originator games arsenal
const kit = require("../src/index.js");
const HELP = `manometer-originator: seal and send proposals to the Manometer referee

  manometer-originator games <text> [--sport fb|basket|tennis|cs2]    find a game, pre-match and live
  manometer-originator send --pin <id> --market <m> --selection <s> --min <odds> [options]
      --fair <odds> --devig <method> --line <x> --ttl <seconds> --clear
      Without --pin: --sport <s> --home <a> --away <b> --kickoff <ISO time in UTC>
  manometer-originator receipt <r_...>                                show a receipt and check its signature
  manometer-originator round [ISO time]                               drand round of a moment

Environment: MANOMETER_SOURCE, MANOMETER_KEY, MANOMETER_URL (default ${kit.DEFAULT_URL})
Pre-match proposals are sealed until kick-off. Live games go in clear. Exit code 0 = accepted.`;

function args(a) { const o = { _: [] }; for (let i = 0; i < a.length; i++) { if (a[i].startsWith("--")) { const k = a[i].slice(2); if (i + 1 < a.length && !a[i + 1].startsWith("--")) o[k] = a[++i]; else o[k] = true; } else o._.push(a[i]); } return o; }

async function main(argv, env, out, fetchFn) {
  const a = args(argv), cmd = a._[0];
  const client = kit.createClient({ sourceId: env.MANOMETER_SOURCE, apiKey: env.MANOMETER_KEY, baseUrl: env.MANOMETER_URL, fetch: fetchFn });
  if (!cmd || cmd === "help" || a.help) { out(HELP); return 0; }
  if (cmd === "round") { const t = a._[1] ? Date.parse(a._[1]) : Date.now(); if (isNaN(t)) { out("That is not a time."); return 2; } const r = kit.roundAt(t); out(r + "  " + new Date(kit.roundTime(r)).toISOString()); return 0; }
  if (cmd === "games") {
    const g = await client.games({ q: a._.slice(1).join(" "), sport: a.sport });
    if (!g.length) { out("No game found."); return 0; }
    for (const x of g) out([x.live ? "LIVE" : new Date(x.kickoff).toISOString().slice(0, 16) + "Z", x.pinId, x.sport, x.home + " – " + x.away, x.league].join("  "));
    return 0;
  }
  if (cmd === "receipt") {
    const r = await client.receipt(a._[1]), k = await client.publicKey();
    out(JSON.stringify(r, null, 2)); const gut = kit.verifyReceipt(r, k.publicKey);
    out(gut ? "Signature OK." : "SIGNATURE WRONG."); return gut ? 0 : 1;
  }
  if (cmd === "send") {
    let game = null;
    if (a.pin) { const found = await client.games({ q: "", sport: a.sport }).catch(() => []); game = (found || []).find((x) => String(x.pinId) === String(a.pin)) || null; if (!game && !a.home) { out("Game " + a.pin + " is not in the catalog. Use `games` to find it, or give --sport --home --away --kickoff."); return 2; } }
    const p = kit.buildProposal({ sourceId: env.MANOMETER_SOURCE, game, sport: a.sport, home: a.home, away: a.away, league: a.league, kickoff: a.kickoff, pinId: a.pin, market: a.market, selection: a.selection, minOdds: a.min, fairOdds: a.fair, devigMethod: a.devig, line: a.line, ttlSeconds: a.ttl, live: a.live === true });
    const r = await client.send(p, { seal: a.clear ? false : undefined, tries: 3 });
    if (!r.ok) { out("Not accepted: " + r.error); return 1; }
    out((r.duplicate ? "Already received. " : "Accepted. ") + (r.sealed ? "Sealed until round " + kit.roundAt(p.eventIdentity.startsTs) + ". " : "In clear. ") + "Receipt " + r.receipt.rid);
    return 0;
  }
  out(HELP); return 2;
}
if (require.main === module) main(process.argv.slice(2), process.env, (s) => console.log(s)).then((c) => process.exit(c), (e) => { console.error(String((e && e.message) || e)); process.exit(1); });
module.exports = { main };
