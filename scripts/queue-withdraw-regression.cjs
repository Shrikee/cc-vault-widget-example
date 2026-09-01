// Regression test for the queueWithdraw 18-decimal overflow (run: npm run test:withdraw)
//
// boring-vault-ui@1.6.1's queueWithdraw converted the share amount to base
// units with BigNumber.toNumber(). For an 18-decimal vault like CCUSD, any
// amount above ~0.009 shares exceeds Number.MAX_SAFE_INTEGER, and ethers v6
// rejects unsafe JS numbers while ABI-encoding the approve call:
//   overflow (argument="value", value=10000000000000000000, code=INVALID_ARGUMENT)
// so every realistic redemption request failed before the wallet even opened.
// Upstream fixed this in 1.6.3 (commit 523c8ab "Better large number handling":
// decimal strings via toFixed(0)); we depend on that version. This test guards
// against any dependency change that would reintroduce the overflow.
//
// This drives the REAL compiled queueWithdraw — the exact code the dApp runs —
// with a minimal hook dispatcher standing in for React (the dist only uses
// createContext/useContext/useState/useEffect/useCallback + jsx) and a real
// ethers Wallet over an in-process mock JSON-RPC transport. No network, no
// chain, deterministic.
//
// It also drives the OTHER end of the same call — the discount. Stage 2 posts
// the entitlement's required spread when it is wider than the holder's own, and
// that spread is a ppm integer the widget hands over as a percent STRING
// (`String(d / 1e4)`, src/lib/postingRule.ts `formatDiscountPercent`), which the
// library multiplies by 10⁴ and rounds with `toFixed(0)`. If that round trip
// lost a unit, the queue would carry a discount the depositor was never shown —
// and one ppm is the difference between a request the solver fills and one it
// skips. So the vector `1, 274, 999, 1000, 1026, 9999, 10000` (a lone unit, the
// live 30d required spread, both sides of the 0.1% default, a required spread
// over it, and both ends of the contract's 1% maximum) goes through the real
// compiled `queueWithdraw` and is read back off the calldata.
//
// PASS (exit 0): withdrawStatus.success, two txs broadcast, on-wire calldata
//   carries approve/offerAmount of exactly 10n * 10n**18n, and every discount
//   in the vector arrives on the wire as exactly its own ppm.
// FAIL (exit 1): the original overflow is back — i.e. boring-vault-ui was
//   downgraded below 1.6.3 or a regression shipped upstream — or a discount
//   did not survive the library's string conversion.
// HARNESS FAILURE (exit 3): the stand-in React/RPC scaffolding did not settle;
//   nothing is claimed about the library either way.
"use strict";
const path = require("path");
const fs = require("fs");
const { createRequire } = require("module");

const ROOT = path.join(__dirname, "..");
const NM = path.join(ROOT, "node_modules");
const ethers = require(path.join(NM, "ethers"));
const CTX_PATH = path.join(NM, "boring-vault-ui/dist/contexts/v1/BoringVaultContextV1.js");

// The package logs heavily; keep test output readable.
const quiet = { log: console.log, warn: console.warn, error: console.error };
console.log = console.warn = () => {};

/* ---------------- minimal React stand-in ---------------- */
const cells = []; // hook state, positional
let cursor = 0;
let effectQueue = [];
const prevDeps = [];
let rerenderRequested = false;
const createdContexts = [];

function depsChanged(a, b) {
  if (a === undefined) return true;
  if (a.length !== b.length) return true;
  return a.some((v, i) => !Object.is(v, b[i]));
}

const FakeReact = {
  createContext(defaultValue) {
    const ctx = { _value: defaultValue };
    ctx.Provider = { _ctx: ctx };
    createdContexts.push(ctx);
    return ctx;
  },
  useContext: (ctx) => ctx._value,
  useState(init) {
    const i = cursor++;
    if (!(i in cells)) cells[i] = typeof init === "function" ? init() : init;
    const set = (v) => {
      cells[i] = typeof v === "function" ? v(cells[i]) : v;
      rerenderRequested = true;
    };
    return [cells[i], set];
  },
  useEffect(fn, deps) {
    const i = cursor++;
    effectQueue.push({ i, fn, deps });
  },
  useCallback: (fn) => fn,
};
const FakeJsxRuntime = {
  jsx(type, props) {
    if (type && type._ctx) type._ctx._value = props.value; // capture Provider value
    return props && props.children;
  },
};
FakeJsxRuntime.jsxs = FakeJsxRuntime.jsx;

/* ------ load the dist module with react shimmed, everything else real ------ */
function loadContextModule() {
  const realRequire = createRequire(CTX_PATH);
  const shimRequire = (id) => {
    if (id === "react") return FakeReact;
    if (id === "react/jsx-runtime") return FakeJsxRuntime;
    return realRequire(id);
  };
  const src = fs.readFileSync(CTX_PATH, "utf8");
  const mod = { exports: {} };
  new Function("require", "module", "exports", "__dirname", "__filename", src)(
    shimRequire, mod, mod.exports, path.dirname(CTX_PATH), CTX_PATH
  );
  return mod.exports;
}

/* ---------------- in-process mock chain ---------------- */
const ADDR = {
  vault: "0x1111111111111111111111111111111111111111",
  teller: "0x2222222222222222222222222222222222222222",
  accountant: "0x3333333333333333333333333333333333333333",
  lens: "0x4444444444444444444444444444444444444444",
  queue: "0x5555555555555555555555555555555555555555",
  usdt: "0x6666666666666666666666666666666666666666",
};
const lensIface = new ethers.Interface(require(path.join(NM, "boring-vault-ui/dist/abis/v1/BoringLensABI")).default);
const vaultIface = new ethers.Interface(require(path.join(NM, "boring-vault-ui/dist/abis/v1/BoringVaultABI")).default);
const queueIface = new ethers.Interface(require(path.join(NM, "boring-vault-ui/dist/abis/v1/BoringWithdrawQueueContractABI")).default);
const SEL = {
  allowance: vaultIface.getFunction("allowance").selector,
  exchangeRate: lensIface.getFunction("exchangeRate").selector,
};
const uint256 = (n) => ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [n]);

class MockRpc extends ethers.JsonRpcProvider {
  constructor() {
    super("http://in-process.invalid", 1, {
      staticNetwork: ethers.Network.from(1),
      batchMaxCount: 1,
      cacheTimeout: -1,
    });
    this.nonce = 0;
    this.sentRaw = [];
  }
  async _send(payload) {
    const reqs = Array.isArray(payload) ? payload : [payload];
    return reqs.map((req) => ({ jsonrpc: "2.0", id: req.id, result: this.handle(req) }));
  }
  handle({ method, params }) {
    switch (method) {
      case "eth_chainId": return "0x1";
      case "eth_blockNumber": return "0x20";
      case "eth_getTransactionCount": return "0x" + (this.nonce++).toString(16);
      case "eth_estimateGas": return "0x30000";
      case "eth_gasPrice":
      case "eth_maxPriorityFeePerGas": return "0x3b9aca00";
      case "eth_getBlockByNumber":
        return {
          number: "0x20", hash: "0x" + "ab".repeat(32), parentHash: "0x" + "cd".repeat(32),
          timestamp: "0x1", nonce: "0x0000000000000000", difficulty: "0x0",
          gasLimit: "0x1c9c380", gasUsed: "0x0", miner: ADDR.vault, extraData: "0x",
          baseFeePerGas: "0x3b9aca00", transactions: [],
        };
      case "eth_call": {
        const sel = (params[0].data || "0x").slice(0, 10);
        if (sel === SEL.allowance) return uint256(0);            // nothing approved yet
        if (sel === SEL.exchangeRate) return uint256(1_000_000); // 1 share ≈ 1 USDT (6 dp)
        return uint256(0);
      }
      case "eth_sendRawTransaction": {
        this.sentRaw.push(params[0]);
        return ethers.keccak256(params[0]);
      }
      case "eth_getTransactionReceipt": {
        const raw = this.sentRaw.find((r) => ethers.keccak256(r) === params[0]);
        if (!raw) return null;
        const tx = ethers.Transaction.from(raw);
        return {
          transactionHash: params[0], transactionIndex: "0x0",
          blockHash: "0x" + "ab".repeat(32), blockNumber: "0x1f",
          from: tx.from, to: tx.to, contractAddress: null,
          cumulativeGasUsed: "0x5208", gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00",
          logs: [], logsBloom: "0x" + "00".repeat(256), status: "0x1", type: "0x2",
        };
      }
      default:
        throw new Error(`mock rpc: unhandled method ${method}`);
    }
  }
}

/* ---------------- render + drive ---------------- */
function capturedValue() {
  const ctx = createdContexts.find(
    (c) => c._value && typeof c._value === "object" && "queueWithdraw" in c._value
  );
  return ctx && ctx._value;
}

async function main() {
  const { BoringVaultV1Provider } = loadContextModule();
  const provider = new MockRpc();
  const signer = new ethers.Wallet("0x" + "42".repeat(32), provider);

  const props = {
    children: null,
    chain: "ethereum",
    vaultContract: ADDR.vault,
    tellerContract: ADDR.teller,
    accountantContract: ADDR.accountant,
    lensContract: ADDR.lens,
    withdrawQueueContract: ADDR.queue,
    ethersProvider: provider,
    depositTokens: [{ address: ADDR.usdt, decimals: 6 }],
    withdrawTokens: [{ address: ADDR.usdt, decimals: 6 }],
    baseAsset: { address: ADDR.usdt, decimals: 6 },
    vaultDecimals: 18, // CCUSD shares — the decimals that trigger the overflow
  };

  const render = () => {
    cursor = 0;
    effectQueue = [];
    rerenderRequested = false;
    BoringVaultV1Provider(props);
    for (const e of effectQueue) {
      if (depsChanged(prevDeps[e.i], e.deps)) {
        prevDeps[e.i] = e.deps;
        e.fn();
      }
    }
  };
  let guard = 0;
  do {
    render();
    if (++guard > 50) throw new Error("render loop did not settle");
  } while (rerenderRequested);
  render(); // one more pass so captured closures see final state

  const ctxValue = capturedValue();
  if (!ctxValue || !ctxValue.isBoringV1ContextReady) {
    throw new Error("context did not become ready — harness setup problem");
  }

  // The user-reported scenario: redeem 10 CCUSD shares for USDT.
  await ctxValue.queueWithdraw(signer, "10", { address: ADDR.usdt, decimals: 6 }, "0.25", "4");
  render();
  const finalStatus = capturedValue().withdrawStatus;

  if (finalStatus.error && /overflow/.test(finalStatus.error)) {
    quiet.error(`FAIL: queueWithdraw overflows on 18-decimal amounts: ${finalStatus.error}`);
    quiet.error("boring-vault-ui must be >= 1.6.3 (upstream fix commit 523c8ab). Check the installed version.");
    process.exit(1);
  }
  if (!finalStatus.success) {
    quiet.error(`FAIL: queueWithdraw did not succeed: ${JSON.stringify(finalStatus)}`);
    process.exit(1);
  }

  const txs = provider.sentRaw.map((r) => ethers.Transaction.from(r));
  const approve = vaultIface.decodeFunctionData("approve", txs[0].data);
  const req = queueIface.decodeFunctionData("safeUpdateAtomicRequest", txs[1].data);
  const WANT = 10n * 10n ** 18n; // 10 shares in 18-decimal base units, exact
  const ok =
    txs.length === 2 &&
    txs[0].to.toLowerCase() === ADDR.vault &&
    approve[0].toLowerCase() === ADDR.queue &&
    approve[1] === WANT &&
    txs[1].to.toLowerCase() === ADDR.queue &&
    req[0].toLowerCase() === ADDR.vault &&
    req[1].toLowerCase() === ADDR.usdt &&
    req[2][2] === WANT &&
    req[4] === 2500n; // 0.25% * 10000

  if (!ok) {
    quiet.error("FAIL: unexpected on-wire calldata");
    quiet.error(`approve(${approve[0]}, ${approve[1]}); offerAmount=${req[2][2]}; discount=${req[4]}`);
    process.exit(1);
  }
  quiet.log("PASS: queueWithdraw(10 shares, 18-decimal vault) broadcasts approve + safeUpdateAtomicRequest with exact base units");

  // ---- the on-wire discount ----
  //
  // The widget's own formatting, mirrored (src/lib/postingRule.ts
  // `formatDiscountPercent`; src/lib/postingRule.test.ts brute-forces all of
  // 0..10000 against the installed bignumber.js). Here the same string goes
  // through the real compiled queueWithdraw and is read back off the calldata,
  // so what is asserted is the wire and not the arithmetic.
  const formatDiscountPercent = (ppm) => String(ppm / 1e4);
  const DISCOUNT_PPM_VECTOR = [1, 274, 999, 1000, 1026, 9999, 10000];

  for (const ppm of DISCOUNT_PPM_VECTOR) {
    const before = provider.sentRaw.length;
    await ctxValue.queueWithdraw(
      signer,
      "10",
      { address: ADDR.usdt, decimals: 6 },
      formatDiscountPercent(ppm),
      "4"
    );
    render();
    const status = capturedValue().withdrawStatus;
    if (!status.success) {
      quiet.error(`FAIL: queueWithdraw at ${ppm} ppm did not succeed: ${JSON.stringify(status)}`);
      process.exit(1);
    }
    const sent = provider.sentRaw.slice(before).map((r) => ethers.Transaction.from(r));
    const queued = sent[sent.length - 1];
    if (!queued || queued.to.toLowerCase() !== ADDR.queue) {
      quiet.error(`FAIL: ${ppm} ppm did not reach the queue: ${sent.length} tx(s) broadcast`);
      process.exit(1);
    }
    const posted = queueIface.decodeFunctionData("safeUpdateAtomicRequest", queued.data);
    if (posted[4] !== BigInt(ppm)) {
      quiet.error(
        `FAIL: discount ${ppm} ppm went on the wire as ${posted[4]} ` +
          `(sent as "${formatDiscountPercent(ppm)}")`
      );
      quiet.error("The percent string does not survive the library's x 10^4 -> toFixed(0).");
      process.exit(1);
    }
    if (posted[2][2] !== WANT) {
      quiet.error(`FAIL: offerAmount changed under the discount vector: ${posted[2][2]}`);
      process.exit(1);
    }
  }
  quiet.log(
    `PASS: on-wire discount equals the posted ppm for ${DISCOUNT_PPM_VECTOR.join(", ")}`
  );
  process.exit(0);
}

main().catch((e) => {
  quiet.error("HARNESS FAILURE:", e);
  process.exit(3);
});
