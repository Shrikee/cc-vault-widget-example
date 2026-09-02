// What a depositor is told when something fails — and, deliberately, what they
// are not told (ADR-0004).
//
// Everything viem and ethers throw is written for the person running the
// endpoint: an HTTP error names the RPC URL (on this deployment a keyed
// QuickNode path, so the key is IN the URL), a provider's own text names its
// products and plans, a contract error dumps the call, its arguments and a
// docs link. None of that belongs on a depositor's screen. So a caught error's
// text never reaches one: the error is CLASSIFIED here into a fixed set of
// phrases the widget owns, and the classifier never echoes its input.
//
// The operator's words are not lost — every catch that feeds a surface calls
// `reportError` first, which puts the provider's own message and the raw
// object in the console, the operator's surface.

import { errorMessage } from "./logScan";

// The kinds a failure is sorted into. Coarse on purpose: a kind exists because
// a depositor can DO something different about it, not because the chain
// distinguishes it.
type FailureKind =
  | "rejected" // the wallet's owner said no
  | "no-gas" // the wallet cannot pay the network fee
  | "reverted" // the chain executed the call and refused it
  | "timeout" // the request ran out of time
  | "network" // the request never got an answer
  | "unknown";

// Everything worth reading off an error and its `cause` chain — viem nests the
// HTTP failure under the contract error, ethers keeps codes at the top — read
// with plain property checks so neither library is imported for its classes.
interface Signals {
  codes: string[];
  names: string[];
  text: string;
}

function gather(e: unknown): Signals {
  const codes: string[] = [];
  const names: string[] = [];
  const texts: string[] = [];
  let cursor: unknown = e;
  for (let depth = 0; depth < 8 && cursor != null; depth += 1) {
    if (typeof cursor === "string") {
      texts.push(cursor);
      break;
    }
    if (typeof cursor !== "object") break;
    const err = cursor as {
      code?: unknown;
      name?: unknown;
      message?: unknown;
      shortMessage?: unknown;
      details?: unknown;
      cause?: unknown;
    };
    if (typeof err.code === "string" || typeof err.code === "number")
      codes.push(String(err.code));
    if (typeof err.name === "string") names.push(err.name);
    for (const t of [err.message, err.shortMessage, err.details])
      if (typeof t === "string") texts.push(t);
    cursor = err.cause;
  }
  return { codes, names, text: texts.join("\n").toLowerCase() };
}

// Most specific first: a revert wrapped in a transport error is a revert, a
// transport error wrapped in a contract error is a transport error — walking
// the whole chain before deciding is what makes both come out right.
function classify(e: unknown): FailureKind {
  const { codes, names, text } = gather(e);
  const code = (c: string) => codes.includes(c);
  const named = (re: RegExp) => names.some((n) => re.test(n));
  const says = (re: RegExp) => re.test(text);

  if (
    code("4001") ||
    code("ACTION_REJECTED") ||
    named(/UserRejectedRequest/) ||
    says(/user rejected|user denied|rejected the request/)
  )
    return "rejected";
  if (code("CALL_EXCEPTION") || named(/Revert/) || says(/execution reverted|reverted/))
    return "reverted";
  if (code("INSUFFICIENT_FUNDS") || says(/insufficient funds/)) return "no-gas";
  if (code("TIMEOUT") || named(/Timeout/) || says(/timed out|timeout/))
    return "timeout";
  if (
    code("SERVER_ERROR") ||
    code("NETWORK_ERROR") ||
    named(/HttpRequest|WebSocketRequest|RpcRequest|InternalRpc|LimitExceeded|ResourceUnavailable/) ||
    says(
      /http request failed|failed to fetch|fetch failed|network|econn|socket|too many requests|rate limit|bad gateway|service unavailable|missing trie node|archive/
    )
  )
    return "network";
  return "unknown";
}

// The tail of a read failure's sentence — every surface supplies its own head
// ("Couldn't load deposit history: …", "Couldn't read your history from the
// chain — …"), so these start lowercase and carry no full stop, exactly as the
// old raw details did. A wallet kind cannot happen on a read; both fold into
// the phrases a depositor can act on the same way.
const READ_REASON: Record<FailureKind, string> = {
  rejected: "the request was cancelled",
  "no-gas": "the network request failed",
  reverted: "the read was rejected by the chain",
  timeout: "the network request timed out",
  network: "the network request failed",
  unknown: "something went wrong",
};

// A whole toast, for a transaction that failed. The two transport kinds tell
// the depositor to check the wallet first, because a transaction that timed
// out may still have landed — retrying on top of it is the mistake the
// sentence exists to prevent.
const ACTION_MESSAGE: Record<FailureKind, string> = {
  rejected: "Transaction declined in your wallet.",
  "no-gas": "Not enough funds in your wallet to pay the network fee.",
  reverted: "The transaction was rejected on-chain.",
  timeout:
    "The network timed out — check your wallet's recent activity before trying again.",
  network:
    "A network error interrupted the request — check your wallet's recent activity before trying again.",
  unknown: "Something went wrong — please try again.",
};

// Why a chain READ failed, in words safe for a depositor's screen.
export const readFailedReason = (e: unknown): string => READ_REASON[classify(e)];

// Why an ACTION (a transaction, or the SDK's deposit/withdraw status) failed,
// as a complete sentence for a toast. Takes the SDK's `status.error` string as
// readily as a thrown error.
export const actionFailedMessage = (e: unknown): string =>
  ACTION_MESSAGE[classify(e)];

// The operator's half of every catch: the provider's own message first (what
// src/lib/logScan.ts's `errorMessage` is for), then the raw object for the
// devtools drill-down. Call it beside `readFailedReason`/`actionFailedMessage`
// so the words the screen no longer quotes still exist where the operator
// looks.
export function reportError(context: string, e: unknown): void {
  console.error(`${context} — ${errorMessage(e)}`, e);
}
