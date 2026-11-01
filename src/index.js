"use strict";
// Node entry point: core + real sealing with tlock-js + receipt signature check.
const crypto = require("crypto");
const core = require("./core.js");
const SIEGEL = require("../lib/siegel.js");
const KEY = require("../lib/schluessel.js");

const seal = (text, round) => SIEGEL.versiegle(text, round);
// Seal a proposal yourself, e.g. to store the ciphertext first. { ciphertext, round, opensAt }
async function sealProposal(p) {
  const round = core.roundAt(p.eventIdentity.startsTs);
  return { ciphertext: await seal(JSON.stringify(p), round), round, opensAt: core.roundTime(round) };
}
// Open a seal with the drand beacon of its round (after that round anyone can). Useful to check your own ciphertext.
async function openSeal(ciphertext, beacon) { return SIEGEL.oeffne(ciphertext, beacon && beacon.signature ? beacon.signature : beacon); }
function sealHeader(ciphertext) { const k = SIEGEL.kopf(ciphertext); return { round: k.runde, chain: k.kette }; }
// Signature of a receipt against the referee's public key (publicKey().publicKey, raw base64).
function verifyReceipt(receipt, publicKeyB64) { return KEY.pruefeSignatur(receipt, publicKeyB64); }

function createClient(o) { return core.createClient(Object.assign({ seal }, o)); }
function buildProposal(o, now) { return core.buildProposal(Object.assign({ proposalId: o.proposalId || "p_" + crypto.randomBytes(12).toString("hex") }, o), now); }

module.exports = Object.assign({}, core, { createClient, buildProposal, sealProposal, openSeal, sealHeader, verifyReceipt });
