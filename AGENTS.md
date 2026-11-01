# Instructions for AI coding assistants

This repository is the Manometer Originator Kit: it seals and sends signal proposals to the Manometer referee. A proposal is scored on paper. It is never an order.

## Commands

```bash
npm install
npm test
```

## How to use it

- `README.md` has the API and a full example, and `examples/send.js` is a working script.
- The full contract is at https://manometer.bet/developers.html, and https://manometer.bet/llms-full.txt has the site as plain text.
- Credentials come from the environment (`MANOMETER_SOURCE`, `MANOMETER_KEY`). Never write them into a file you commit.
- Sending the same `proposalId` again returns the same receipt, so a retry after a network error is safe.

## Do not

- Edit `lib/`. Those files are byte-identical copies of the referee's modules.
- Edit `dist/` by hand. `npm test` builds it from `src/` and `lib/`.
- Commit an API key.

Commit with `git commit -s` (Developer Certificate of Origin).
