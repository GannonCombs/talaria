/**
 * Tests for the wallet path safety guardrail.
 *
 * This is the most security-critical pure function in the project: it
 * decides whether a wallet read or write is allowed. The guardrail must:
 *   1. Reject any path that doesn't contain "mpp-reseller" segment
 *   2. Reject any path that doesn't contain "keys" segment
 *   3. Reject any path containing ".agentcash" anywhere
 *   4. Accept paths that satisfy all three rules
 *
 * If any of these checks ever silently passes a bad path, the
 * consequences are catastrophic — the script would happily overwrite
 * the user's main agentcash wallet. So the tests should be exhaustive
 * about both the happy path AND every distinct failure mode.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { assertSafeWalletPath } from '../src/wallet.js';

// Build paths using path.sep so the tests work on both Windows and *nix.
function p(...parts: string[]): string {
  return parts.join(path.sep);
}

describe('assertSafeWalletPath — happy paths', () => {
  it('accepts a normal mpp-reseller/keys/* path', () => {
    expect(() =>
      assertSafeWalletPath(p('C:', 'Users', 'gc', 'code', 'talaria', 'mpp-reseller', 'keys', 'reseller-wallet.json'))
    ).not.toThrow();
  });

  it('accepts a Linux-style mpp-reseller/keys/* path', () => {
    expect(() =>
      assertSafeWalletPath(p('', 'home', 'gc', 'talaria', 'mpp-reseller', 'keys', 'reseller-wallet.json'))
    ).not.toThrow();
  });

  it('accepts subfolders inside keys/', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'gc', 'mpp-reseller', 'keys', 'sub', 'wallet.json'))
    ).not.toThrow();
  });

  it('accepts read mode by default', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'mpp-reseller', 'keys', 'wallet.json'))
    ).not.toThrow();
  });

  it('accepts explicit write mode', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'mpp-reseller', 'keys', 'wallet.json'), 'write')
    ).not.toThrow();
  });
});

describe('assertSafeWalletPath — rejects missing mpp-reseller segment', () => {
  it('rejects a path with no mpp-reseller anywhere', () => {
    expect(() => assertSafeWalletPath(p('home', 'gc', 'keys', 'wallet.json'))).toThrow(/mpp-reseller/);
  });

  it('rejects a path that has "mpp-reseller" only as a substring of another segment', () => {
    // "mpp-reseller-evil" is NOT the same as "mpp-reseller" as a path segment.
    // The split-by-sep check requires an exact segment match.
    expect(() =>
      assertSafeWalletPath(p('home', 'mpp-reseller-evil', 'keys', 'wallet.json'))
    ).toThrow(/mpp-reseller/);
  });

  it('rejects a path with mpp-reseller in the filename only', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'gc', 'keys', 'mpp-reseller-wallet.json'))
    ).toThrow(/mpp-reseller/);
  });
});

describe('assertSafeWalletPath — rejects missing keys segment', () => {
  it('rejects a path inside mpp-reseller without keys/', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'gc', 'mpp-reseller', 'src', 'wallet.json'))
    ).toThrow(/keys/);
  });

  it('rejects a path with keys only as a substring', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'gc', 'mpp-reseller', 'mykeysfolder', 'wallet.json'))
    ).toThrow(/keys/);
  });
});

describe('assertSafeWalletPath — rejects .agentcash anywhere', () => {
  it('rejects ~/.agentcash/wallet.json directly', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'gc', '.agentcash', 'wallet.json'))
    ).toThrow(/agentcash/);
  });

  it('rejects a path that has .agentcash deep in the middle', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'gc', '.agentcash', 'mpp-reseller', 'keys', 'wallet.json'))
    ).toThrow(/agentcash/);
  });

  it('rejects a path that has .agentcash as a substring (case insensitive)', () => {
    expect(() =>
      assertSafeWalletPath(p('home', 'gc', 'mpp-reseller', 'keys', '.AGENTCASH-wallet.json'))
    ).toThrow(/agentcash/);
  });

  it('rejects even when mpp-reseller and keys are also present', () => {
    // The .agentcash check is the strongest — it should fire even if the
    // path appears to be inside the project tree.
    expect(() =>
      assertSafeWalletPath(p('mpp-reseller', 'keys', '.agentcash-evil.json'))
    ).toThrow(/agentcash/);
  });
});

describe('assertSafeWalletPath — error message labels', () => {
  it('uses "READ" in the error when called in read mode (default)', () => {
    expect(() => assertSafeWalletPath(p('home', 'evil.json'))).toThrow(/REFUSING TO READ/);
  });

  it('uses "WRITE" in the error when called in write mode', () => {
    expect(() => assertSafeWalletPath(p('home', 'evil.json'), 'write')).toThrow(/REFUSING TO WRITE/);
  });
});
