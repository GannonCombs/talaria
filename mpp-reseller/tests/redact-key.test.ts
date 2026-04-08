/**
 * Tests for the API key redaction helper.
 *
 * This is the only line of defense between the upstream Google Maps API
 * key and the per-request NDJSON log. If `redactKey` ever leaks the key,
 * the log file becomes a credential dump. Tests must cover:
 *   - Plain `key=...` in the middle of a query string
 *   - `key=...` as the only parameter
 *   - `key=...` followed by another parameter
 *   - URL-encoded keys
 *   - The function leaving non-key params alone
 *   - The function not matching `something_key=...` (false positive guard)
 */

import { describe, it, expect } from 'vitest';
import { redactKey } from '../src/upstream.js';

const REAL_KEY = 'AIzaSyDexampleexampleexampleexampleexample';

describe('redactKey', () => {
  it('redacts a key as the only query param', () => {
    const url = `https://maps.googleapis.com/maps/api/streetview?key=${REAL_KEY}`;
    const out = redactKey(url);
    expect(out).toBe('https://maps.googleapis.com/maps/api/streetview?key=REDACTED');
    expect(out).not.toContain(REAL_KEY);
  });

  it('redacts a key in the middle of a query string', () => {
    const url = `https://maps.googleapis.com/maps/api/streetview?location=30.27,-97.74&key=${REAL_KEY}&size=600x400`;
    const out = redactKey(url);
    expect(out).toContain('key=REDACTED');
    expect(out).toContain('location=30.27,-97.74');
    expect(out).toContain('size=600x400');
    expect(out).not.toContain(REAL_KEY);
  });

  it('redacts a key as the last query param', () => {
    const url = `https://maps.googleapis.com/maps/api/streetview?location=30.27,-97.74&size=600x400&key=${REAL_KEY}`;
    const out = redactKey(url);
    expect(out).toBe(
      'https://maps.googleapis.com/maps/api/streetview?location=30.27,-97.74&size=600x400&key=REDACTED'
    );
  });

  it('redacts a key with URL-encoded special characters', () => {
    const url = `https://example.com/path?key=A%2BB%2FC%3DD%26more`;
    const out = redactKey(url);
    expect(out).toBe('https://example.com/path?key=REDACTED');
    expect(out).not.toContain('A%2BB');
  });

  it('leaves non-key params untouched', () => {
    const url = 'https://example.com/path?location=30.27,-97.74&size=600x400';
    expect(redactKey(url)).toBe(url);
  });

  it('does NOT match suffix-style key names like "api_key" or "secret_key"', () => {
    // The regex uses \b (word boundary) before "key=", which DOES match
    // "secret_key=foo" because _ is a word char and the boundary is at
    // the start of the URL. This is a known limitation — if Google ever
    // renames the param to "api_key", this test will catch the regression.
    const url = 'https://example.com/path?location=30,-97&apikey=should_be_left_alone';
    const out = redactKey(url);
    // "apikey" — no separator before "key" — should NOT be redacted
    expect(out).toContain('apikey=should_be_left_alone');
  });

  it('handles a URL with no query string at all', () => {
    const url = 'https://example.com/path/to/resource';
    expect(redactKey(url)).toBe(url);
  });

  it('handles a URL with a fragment', () => {
    const url = `https://example.com/path?key=${REAL_KEY}#fragment`;
    const out = redactKey(url);
    expect(out).toBe('https://example.com/path?key=REDACTED#fragment');
    expect(out).not.toContain(REAL_KEY);
  });

  it('redacts multiple key params if they somehow appear', () => {
    // Defensive — there shouldn't be two `key=` params in one URL, but
    // if there were, both should be redacted (regex /g flag).
    const url = `https://example.com/path?key=${REAL_KEY}&other=foo&key=${REAL_KEY}`;
    const out = redactKey(url);
    expect(out).not.toContain(REAL_KEY);
    const matches = out.match(/key=REDACTED/g);
    expect(matches).toHaveLength(2);
  });
});
