import { NextResponse } from 'next/server';
import { ApprovalManager } from '@/lib/security/approval';
import crypto from 'crypto';

// In-memory token store with 60-second TTL
const confirmationTokens = new Map<string, number>();

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, expires] of confirmationTokens) {
    if (now > expires) confirmationTokens.delete(token);
  }
}

export function validateConfirmationToken(token: string): boolean {
  cleanExpiredTokens();
  if (confirmationTokens.has(token)) {
    confirmationTokens.delete(token); // one-time use
    return true;
  }
  return false;
}

export async function POST(req: Request) {
  const { action } = await req.json();
  const confirmed = await ApprovalManager.requestSensitiveConfirmation(
    action ?? 'Update spending controls'
  );

  if (!confirmed) {
    return NextResponse.json({ confirmed: false }, { status: 403 });
  }

  const token = crypto.randomUUID();
  confirmationTokens.set(token, Date.now() + 60_000); // expires in 60s
  return NextResponse.json({ confirmed: true, token });
}

export const maxDuration = 120; // Touch ID can take a while
