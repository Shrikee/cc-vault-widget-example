// The explainer's timeline — src/lib/explainerSteps.ts.
//
// The vesting step and its worked example are the spec's copy, verbatim
// (§"The surfaces — Variant B", the explainer row), so they are asserted here
// as whole sentences: with no component tests in this repo (spec, "Not covered
// by tests"), this module IS the surface.
//
// Both products are asserted, and the 24h one is the point of half of this
// file: the spec's §"Deliberately unchanged" keeps that product on stage-1
// copy, so every sentence stage 2 amends must be shown NOT to have reached it.
import { describe, expect, it } from "vitest";

import { ROSTER } from "../config/vaults";
import { vaultById } from "./vaultRegistry";
import { explainerSteps, type ExplainerStep } from "./explainerSteps";

const vault30d = vaultById(ROSTER, "coinchange-30d-polygon");
const vault24h = vaultById(ROSTER, "coinchange-24h-polygon");

const stepNamed = (steps: ExplainerStep[], title: string): ExplainerStep => {
  const step = steps.find((s) => s.title === title);
  if (!step) throw new Error(`no step ${JSON.stringify(title)}`);
  return step;
};

describe("the vesting-gap product's timeline", () => {
  const steps = explainerSteps(vault30d);

  it("puts the vesting term between earning and redeeming", () => {
    expect(steps.map((s) => s.title)).toEqual([
      "Deposit USDT",
      "1-day share lock",
      "Earn yield",
      "30-day vesting term",
      "Request a redemption",
      "Solver fills to USDT",
    ]);
  });

  it("states the cap in the spec's words", () => {
    expect(stepNamed(steps, "30-day vesting term").body).toBe(
      "Yield Prime 30d shares vest over 30 days — separately from the 1-day " +
        "share lock, and only on this product, whose vesting term outlives " +
        "its lock. Redeem before they vest and you are entitled to no more " +
        "than what you paid: a cap, not a floor."
    );
  });

  it("sets off the worked example", () => {
    expect(stepNamed(steps, "30-day vesting term").example).toBe(
      "For example: 10,000 USDT deposited at 1.000000 a share, redeemed on " +
        "day 20 when the share price is 1.001370, is capped at 1.000000 a " +
        "share — it pays 9,999.99 USDT, not 10,013.70. The withdraw panel " +
        "shows you that number before you post."
    );
  });

  it("names the posted spread where the request is described", () => {
    expect(stepNamed(steps, "Request a redemption").body).toBe(
      "Choose how many shares to redeem. This posts a request to the " +
        "AtomicQueue at the share price minus the posted redemption spread — " +
        "the wider of your own spread and the one your entitlement requires."
    );
  });

  it("promises no fill", () => {
    expect(stepNamed(steps, "Solver fills to USDT").body).toBe(
      "An off-chain solver decides whether to fill your request. When it " +
        "does, USDT arrives in your wallet — no separate claim step. You can " +
        "stop an open request before it fills."
    );
  });

  it("sets off nothing but the vesting step", () => {
    expect(steps.filter((s) => s.example !== undefined)).toHaveLength(1);
  });
});

describe("the product with no vesting gap", () => {
  const steps = explainerSteps(vault24h);

  it("has no vesting step and no example", () => {
    expect(steps.map((s) => s.title)).toEqual([
      "Deposit USDT",
      "1-day share lock",
      "Earn yield",
      "Request a redemption",
      "Solver fills to USDT",
    ]);
    expect(steps.every((s) => s.example === undefined)).toBe(true);
  });

  it("keeps stage 1's copy word for word", () => {
    expect(stepNamed(steps, "Request a redemption").body).toBe(
      "Choose how many shares to redeem. This posts a request to the " +
        "AtomicQueue at NAV minus a small spread."
    );
    expect(stepNamed(steps, "Solver fills to USDT").body).toBe(
      "An off-chain solver fills your request and sends USDT to your wallet " +
        "— no separate claim step. You can stop an open request before it " +
        "fills."
    );
  });
});
