// Half one of the entitlement drift check: the bytes (run: npm run drift:entitlement)
//
// src/entitlement/ is a byte-exact copy of the solver's entitlement rule. This script
// recomputes the SHA-1 of each vendored file and compares it against the table in
// src/entitlement/PROVENANCE.md. The note is the single source of truth — the pinned
// repository, the commit and the four hashes are all read from it, never hard-coded here
// — so a copy and its provenance can never quietly disagree, and re-vendoring means
// editing the note, not this script.
//
// It needs no solver checkout and no network. With a checkout, the `git show ... | diff`
// recipe in PROVENANCE.md is the equivalent check and also shows what moved.
//
// PASS (exit 0): src/entitlement/ holds exactly the vendored files the note lists, and
//   each one hashes to the value the note records.
// FAIL (exit 1): a vendored file's bytes moved (each mismatch named, with both hashes),
//   a file is missing, an unexpected file has appeared beside the copy, or the note no
//   longer records exactly the four files.
// HARNESS FAILURE (exit 3): the check itself broke — never read this as drift.
//
// Half two — the behaviour — is `npm run test:entitlement`, which runs the two vendored
// suites unmodified on vitest.entitlement.config.ts. `npm run drift:entitlement` is the
// pair, in that order.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const VENDOR_DIR = path.join(ROOT, "src", "entitlement");
const NOTE_NAME = "PROVENANCE.md";
const NOTE_PATH = path.join(VENDOR_DIR, NOTE_NAME);
const NOTE = path.relative(ROOT, NOTE_PATH);

// The set is fixed by the vendoring decision, not discovered: a file appearing in or
// vanishing from the directory is itself drift, so the expected names are spelled out
// and the directory is read back against them below.
const VENDORED_FILES = [
  "entitlement.ts",
  "entitlement.spec.ts",
  "entitlement.regression.spec.ts",
  "entitlement.cases.json",
];

const SHA1 = /`([0-9a-f]{40})`/;

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

/**
 * Read the pinned source and the recorded SHA-1s out of PROVENANCE.md.
 *
 * A hash row is any line carrying a backticked vendored filename and a backticked 40-hex
 * digest, which keeps the note human-readable prose rather than a machine format while
 * still being the one place the hashes live. A digest on a line that does not name
 * exactly one vendored file is treated as a malformed or stale row and fails the check,
 * so the note cannot drift into listing something other than the four.
 */
function readNote() {
  if (!fs.existsSync(NOTE_PATH)) {
    fail(`${NOTE} is missing — the vendored copy has no provenance to check against.`);
  }
  const lines = fs.readFileSync(NOTE_PATH, "utf8").split("\n");

  const field = (label) => {
    const row = lines.find((l) => l.startsWith(`| ${label} `));
    const value = row && row.match(/`([^`]+)`/);
    if (!value) fail(`${NOTE} records no "${label}" — the pin is incomplete.`);
    return value[1];
  };
  const source = { repo: field("Source repository"), commit: field("Commit") };

  const hashes = new Map();
  for (const line of lines) {
    const digestMatch = line.match(SHA1);
    if (!digestMatch) continue;
    const named = VENDORED_FILES.filter((f) => line.includes(`\`${f}\``));
    if (named.length !== 1) {
      fail(
        `${NOTE} carries a SHA-1 (${digestMatch[1]}) on a line that does not name exactly one ` +
          `vendored file. The note must record hashes for these four files and no others: ` +
          `${VENDORED_FILES.join(", ")}.`
      );
    }
    if (hashes.has(named[0])) fail(`${NOTE} records \`${named[0]}\` more than once.`);
    hashes.set(named[0], digestMatch[1]);
  }

  const unrecorded = VENDORED_FILES.filter((f) => !hashes.has(f));
  if (unrecorded.length > 0) {
    fail(
      `${NOTE} records no SHA-1 for: ${unrecorded.join(", ")}. ` +
        `Every vendored file must be listed in the note's table.`
    );
  }
  return { source, hashes };
}

/** A file that appeared beside the copy is drift too — the directory holds the four and the note. */
function checkNoStrangers() {
  const expected = new Set([...VENDORED_FILES, NOTE_NAME]);
  const strangers = fs.readdirSync(VENDOR_DIR).filter((entry) => !expected.has(entry));
  if (strangers.length > 0) {
    fail(
      `unexpected file(s) beside the vendored copy in src/entitlement/: ${strangers.join(", ")}. ` +
        `That directory holds the four vendored files and ${NOTE_NAME}, nothing else — put this ` +
        `repo's own code somewhere it will not be mistaken for the copy.`
    );
  }
}

function main() {
  if (!fs.existsSync(VENDOR_DIR)) {
    fail(`src/entitlement/ is missing — the vendored copy is not in this checkout.`);
  }
  const { source, hashes } = readNote();
  checkNoStrangers();

  const pin = `${source.repo}@${source.commit}`;
  const mismatches = [];

  for (const file of VENDORED_FILES) {
    const full = path.join(VENDOR_DIR, file);
    if (!fs.existsSync(full)) {
      mismatches.push(`  ${file}\n    MISSING — the file is not in src/entitlement/`);
      continue;
    }
    const actual = crypto.createHash("sha1").update(fs.readFileSync(full)).digest("hex");
    const expected = hashes.get(file);
    if (actual === expected) {
      console.log(`  ok  ${file}  ${actual}`);
    } else {
      mismatches.push(`  ${file}\n    recorded ${expected}\n    actual   ${actual}`);
    }
  }

  if (mismatches.length > 0) {
    console.error(
      `\nFAIL: ${mismatches.length} of ${VENDORED_FILES.length} vendored file(s) no longer match ` +
        `${NOTE}:\n\n${mismatches.join("\n")}\n\n` +
        `These files are a byte-exact copy of ${pin} and must not be edited here. Restore them ` +
        `(\`git show ${source.commit}:src/core/<file> > src/entitlement/<file>\` from a solver ` +
        `checkout), or — if you are deliberately re-vendoring — follow the re-vendoring procedure ` +
        `in ${NOTE} and record the new commit and SHA-1s there.`
    );
    process.exit(1);
  }

  console.log(`\nPASS: all ${VENDORED_FILES.length} vendored files match ${NOTE} (${pin}).`);
  process.exit(0);
}

try {
  main();
} catch (e) {
  // Never let a crash in the checker read as drift in the copy.
  console.error("HARNESS FAILURE:", e);
  process.exit(3);
}
