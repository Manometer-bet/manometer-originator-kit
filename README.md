# Manometer Originator Kit

Seal and send signal proposals to the [Manometer](https://manometer.bet) referee, from Node or from the browser.

- **Catalog:** find the games you can send on, pre-match and live, with their lines. Without prices: those stay on the board.
- **Sealing:** a pre-match proposal is encrypted with tlock to the drand round of the kick-off. Nobody can read it before that round, including us. Only ciphertext leaves your machine.
- **Receipts:** every proposal gets a signed receipt. The kit checks the signature against the referee's public key.
- **Same rules as the referee:** `lib/` holds byte-identical copies of the referee's contract check, drand rounds and sealing.

## Install

Clone this repository, or download the kit in your Manometer account (API and keys), put it next to your code and run `npm install` in its folder. You need a source id and an API key from your Manometer account to send proposals.

Node 18 or newer. The only dependency is `tlock-js`, the drand team's reference code.

## Send a proposal

```js
const kit = require("./manometer-originator-kit");
const client = kit.createClient({ sourceId: "your-source", apiKey: process.env.MANOMETER_KEY });

const [game] = await client.games("arsenal");            // or { q: "arsenal", sport: "fb" }
const proposal = kit.buildProposal({
  sourceId: "your-source",
  game,
  market: "1x2",
  selection: "1",
  minOdds: 2.10,                                         // the lowest price you still want
  fairOdds: 2.00,                                        // optional: your own fair price
  devigMethod: "shin",
});

const result = await client.send(proposal, { tries: 3 });
console.log(result.ok ? result.receipt.rid : result.error);
```

Sending the same `proposalId` twice gives the same receipt twice, so a retry after a network error is safe.

Live games go in clear, because the match has already started. Winner markets only. Pre-match proposals are sealed unless you pass `{ seal: false }`.

## On the command line

```bash
export MANOMETER_SOURCE=your-source MANOMETER_KEY=...
node bin/manometer-originator.js games arsenal
node bin/manometer-originator.js send --pin 1612345 --market 1x2 --selection 1 --min 2.10 --fair 2.00
node bin/manometer-originator.js receipt r_0123456789abcdef01234567
node bin/manometer-originator.js round 2026-11-04T19:00:00Z
```

## In the browser

```html
<script src="vendor/tlock.bundle.js"></script>
<script src="dist/originator-kit.js"></script>
<script>
  const client = ManometerKit.createClient({ sourceId: "your-source", apiKey: "..." });
</script>
```

The browser build has the same functions as Node, except that it does not check receipt signatures. Keep your API key out of pages other people can open.

## Reference

| Function | What it does |
| --- | --- |
| `createClient({ sourceId, apiKey, baseUrl, fetch })` | Client with `games`, `send`, `receipt`, `publicKey`. |
| `buildProposal(options)` | Builds a contract v1 proposal from a catalog `game`, or from `sport`, `home`, `away`, `kickoff`. Options: `market`, `selection`, `minOdds`, `fairOdds`, `devigMethod`, `line`, `scope`, `ev`, `stakeHint`, `ttlSeconds`, `proposalId`. |
| `validate(proposal, now)` | The referee's own contract check: `{ ok, errors }`. `send` runs it first. |
| `sealProposal(proposal)` | `{ ciphertext, round, opensAt }`, if you want to store the seal yourself. |
| `sealHeader(ciphertext)` | The round and chain a seal names, without opening it. |
| `openSeal(ciphertext, beacon)` | Opens a seal with the drand beacon of its round. |
| `verifyReceipt(receipt, publicKey)` | Checks the Ed25519 signature of a receipt. |
| `roundAt(ms)`, `roundTime(round)` | drand quicknet rounds. `QUICKNET` holds the pinned chain. |
| `markets` | Sports, markets, selections and scopes of contract v1. |

The contract, sealing, receipts, scoring and error codes are documented at [manometer.bet/developers.html](https://manometer.bet/developers.html). To check a receipt, go to [manometer.bet/verify.html](https://manometer.bet/verify.html).

## Licence

Apache-2.0. The Manometer name and logo are not covered by the licence.
