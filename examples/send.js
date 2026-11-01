// MANOMETER_SOURCE=your-source MANOMETER_KEY=... node examples/send.js arsenal
const kit = require("../src/index.js");
(async () => {
  const client = kit.createClient({ sourceId: process.env.MANOMETER_SOURCE, apiKey: process.env.MANOMETER_KEY });
  const games = await client.games(process.argv[2] || "");
  if (!games.length) return console.log("No game found.");
  const game = games[0];
  const p = kit.buildProposal({ sourceId: process.env.MANOMETER_SOURCE, game, market: game.sport === "fb" ? "1x2" : "ml", selection: game.sport === "fb" ? "1" : "home", minOdds: 2.1, fairOdds: 2.0, devigMethod: "shin" });
  const r = await client.send(p, { tries: 3 });
  console.log(r.ok ? "Accepted, receipt " + r.receipt.rid : "Not accepted: " + r.error);
})();
