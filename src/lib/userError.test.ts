// The depositor-facing error classifier — src/lib/userError.ts.
//
// One property above all: NOTHING from the input reaches the output. The
// errors these vectors carry are real shapes from viem and ethers, and they
// name exactly what ADR-0004 exists to keep off the screen — the keyed RPC
// URL, the provider's product names, the call and its arguments. So every
// assertion here is closed-set: the result must BE one of the phrases the
// widget owns, never merely resemble one.
import { describe, expect, it } from "vitest";

import { actionFailedMessage, readFailedReason } from "./userError";

// A viem HTTP transport failure, as thrown: the URL in the message, the
// provider's own words in `details`.
const httpRequestFailed = {
  name: "HttpRequestError",
  message:
    "HTTP request failed.\n\nStatus: 402\nURL: https://some-vivid-name.matic.example-rpc.invalid/0123456789abcdef0123456789abcdef01234567/\nRequest body: {...}",
  shortMessage: "HTTP request failed.",
  details:
    "Archive requests require the QuickNode Archive add-on on your quiknode.pro plan",
};

// The same failure the way a contract read hands it over: wrapped, with the
// transport error down the `cause` chain and the call spelled out on top.
const wrappedReadFailure = {
  name: "ContractFunctionExecutionError",
  message:
    'HTTP request failed.\n\nURL: https://some-vivid-name.matic.example-rpc.invalid/0123456789abcdef/\nContract Call:\n  address: 0x9fA6…\n  function: getUserAtomicRequest(...)\nDocs: https://viem.sh/docs/contract/readContract',
  shortMessage: "HTTP request failed.",
  cause: httpRequestFailed,
};

// ethers v6, declined in the wallet: the code at the top, the serialised
// payload in the message.
const ethersRejected = {
  code: "ACTION_REJECTED",
  message:
    'user rejected action (action="sendTransaction", transaction={...}, code=ACTION_REJECTED, version=6.13.4)',
};

const READ_PHRASES = [
  "the request was cancelled",
  "the read was rejected by the chain",
  "the network request timed out",
  "the network request failed",
  "something went wrong",
];

const ACTION_PHRASES = [
  "Transaction declined in your wallet.",
  "Not enough funds in your wallet to pay the network fee.",
  "The transaction was rejected on-chain.",
  "The network timed out — check your wallet's recent activity before trying again.",
  "A network error interrupted the request — check your wallet's recent activity before trying again.",
  "Something went wrong — please try again.",
];

describe("what each failure is told as", () => {
  it("classifies a transport failure as the network's, not the provider's", () => {
    expect(readFailedReason(httpRequestFailed)).toBe("the network request failed");
  });

  it("finds the transport failure down a contract error's cause chain", () => {
    expect(readFailedReason(wrappedReadFailure)).toBe("the network request failed");
  });

  it("reads a timeout as a timeout, wherever the chain says it", () => {
    expect(readFailedReason(new Error("request timed out after 10000ms"))).toBe(
      "the network request timed out"
    );
    expect(actionFailedMessage({ name: "TimeoutError", message: "took too long" })).toBe(
      "The network timed out — check your wallet's recent activity before trying again."
    );
  });

  it("tells a wallet decline apart from a failure", () => {
    expect(actionFailedMessage(ethersRejected)).toBe(
      "Transaction declined in your wallet."
    );
    // The EIP-1193 spelling of the same no.
    expect(actionFailedMessage({ code: 4001, message: "User denied transaction" })).toBe(
      "Transaction declined in your wallet."
    );
  });

  it("names the fee when the wallet cannot pay it", () => {
    expect(
      actionFailedMessage({ code: "INSUFFICIENT_FUNDS", message: "insufficient funds" })
    ).toBe("Not enough funds in your wallet to pay the network fee.");
  });

  it("calls a revert a revert, even wrapped in a transport-sounding message", () => {
    expect(actionFailedMessage(new Error("execution reverted: TellerPaused"))).toBe(
      "The transaction was rejected on-chain."
    );
    // A revert whose reason mentions funds is still the chain's no, not the
    // wallet's gas: revert outranks no-gas.
    expect(
      actionFailedMessage(new Error("execution reverted: insufficient funds for transfer"))
    ).toBe("The transaction was rejected on-chain.");
  });

  it("takes the SDK's status string as readily as a thrown error", () => {
    // useStatusToasts only ever has the message the SDK kept — a string.
    expect(actionFailedMessage("user rejected action (action=...)")).toBe(
      "Transaction declined in your wallet."
    );
  });

  it("says only 'something went wrong' about an error it cannot place", () => {
    expect(readFailedReason(new Error("¯\\_(ツ)_/¯"))).toBe("something went wrong");
    expect(actionFailedMessage(undefined)).toBe("Something went wrong — please try again.");
  });
});

describe("nothing from the input reaches the output", () => {
  // The vectors that most want to leak: every one carries the keyed URL, the
  // provider's name, or the call.
  const hostile = [
    httpRequestFailed,
    wrappedReadFailure,
    ethersRejected,
    new Error(
      "could not coalesce error (error={...}, url=https://some-vivid-name.matic.example-rpc.invalid/deadbeef/)"
    ),
    "Archive requests require a personal quiknode.pro token",
    { code: "SERVER_ERROR", message: "bad gateway", details: "cloudflare 502 at quiknode" },
    null,
    42,
    { message: 7, cause: { cause: { cause: "econnrefused 127.0.0.1:8545" } } },
  ];

  it("always answers from the widget's own closed set of phrases", () => {
    for (const e of hostile) {
      expect(READ_PHRASES).toContain(readFailedReason(e));
      expect(ACTION_PHRASES).toContain(actionFailedMessage(e));
    }
  });
});
