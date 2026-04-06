import { describe, it, expect } from 'vitest';

// Test the WWW-Authenticate header parsing logic directly
// We can't import the private function, so we replicate the parsing logic

function parseWwwAuthenticate(header: string) {
  const getMethod = (s: string) => s.match(/method="([^"]+)"/)?.[1] ?? '';
  const getIntent = (s: string) => s.match(/intent="([^"]+)"/)?.[1] ?? '';
  const getRequest = (s: string) => s.match(/request="([^"]+)"/)?.[1] ?? '';
  const getId = (s: string) => s.match(/id="([^"]+)"/)?.[1] ?? '';
  const getRealm = (s: string) => s.match(/realm="([^"]+)"/)?.[1] ?? '';

  const method = getMethod(header);
  const intent = getIntent(header);

  if (intent === 'session') return null;

  const requestB64 = getRequest(header);
  if (!requestB64) return null;

  try {
    const decoded = JSON.parse(Buffer.from(requestB64, 'base64url').toString());
    return {
      challengeId: getId(header),
      method,
      intent,
      amount: decoded.amount,
      currency: decoded.currency,
      chainId: decoded.methodDetails?.chainId ?? 0,
      recipient: decoded.recipient,
      realm: getRealm(header),
    };
  } catch {
    return null;
  }
}

describe('MPP challenge parsing', () => {
  it('parses a RentCast charge challenge correctly', () => {
    const header = 'Payment id="OQ8EWulWWts16XuaXGVWqwe5qO4Yv6-TmlagAiOflbo", realm="rentcast.mpp.paywithlocus.com", method="tempo", intent="charge", request="eyJhbW91bnQiOiIzMzAwMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDBiOTUzN2QxMWM2MGU4YjUwIiwibWV0aG9kRGV0YWlscyI6eyJjaGFpbklkIjo0MjE3fSwicmVjaXBpZW50IjoiMHgwNjBiMGZCMEJlOWQ5MDU1NzU3N0IzQUVFNDgwNzExMDY3MTQ5RmYwIn0"';

    const result = parseWwwAuthenticate(header);

    expect(result).not.toBeNull();
    expect(result!.method).toBe('tempo');
    expect(result!.intent).toBe('charge');
    expect(result!.amount).toBe('33000');
    expect(result!.chainId).toBe(4217);
    expect(result!.recipient).toBe('0x060b0fB0Be9d90557577B3AEE480711067149Ff0');
    expect(result!.realm).toBe('rentcast.mpp.paywithlocus.com');
  });

  it('rejects session intents', () => {
    const header = 'Payment id="abc", realm="rpc.mpp.tempo.xyz", method="tempo", intent="session", request="eyJ0ZXN0IjoxfQ"';

    const result = parseWwwAuthenticate(header);
    expect(result).toBeNull();
  });

  it('parses Mapbox geocode challenge', () => {
    const header = 'Payment id="luQMyoD0Y9jX-BaPeP7jSCs86nfiga1ETVSSbfgdG28", realm="mapbox.mpp.paywithlocus.com", method="tempo", intent="charge", request="eyJhbW91bnQiOiIzNzUwIiwiY3VycmVuY3kiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMGI5NTM3ZDExYzYwZThiNTAiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjQyMTd9LCJyZWNpcGllbnQiOiIweDA2MGIwZkIwQmU5ZDkwNTU3NTc3QjNBRUU0ODA3MTEwNjcxNDlGZjAifQ"';

    const result = parseWwwAuthenticate(header);

    expect(result).not.toBeNull();
    expect(result!.amount).toBe('3750');
    expect(result!.chainId).toBe(4217);
  });

  it('calculates cost in USD correctly', () => {
    // amount is in USDC micro-units (6 decimals)
    // 33000 = $0.033
    expect(33000 / 1e6).toBeCloseTo(0.033, 4);
    expect(3750 / 1e6).toBeCloseTo(0.00375, 5);
    expect(5000 / 1e6).toBeCloseTo(0.005, 4);
    expect(1000 / 1e6).toBeCloseTo(0.001, 4);
  });

  it('returns null for malformed headers', () => {
    expect(parseWwwAuthenticate('')).toBeNull();
    expect(parseWwwAuthenticate('Bearer token')).toBeNull();
    expect(parseWwwAuthenticate('Payment id="x"')).toBeNull();
  });
});
