// Platform-specific approval for MPP payments. On macOS, uses Touch ID
// via compiled Objective-C (LocalAuthentication framework). On Windows,
// uses PowerShell Get-Credential. On Linux, uses terminal readline.
//
// Ported from visa-mcp/src/security/approval.ts, adapted for Talaria.

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { getDb } from '../db';

const execAsync = promisify(exec);

function ceilCents(amount: number): string {
  return Math.max(0.01, Math.ceil(amount * 100) / 100).toFixed(2);
}

export interface ApprovalRequest {
  amount: number;
  merchantName: string;
  description: string;
  rail: 'stablecoin';
}

export interface ApprovalResult {
  approved: boolean;
  method: 'biometric' | 'dialog' | 'terminal' | 'auto';
  timestamp: string;
}

function getStringPref(key: string, fallback: string): string {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM user_preferences WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

function getNumericPref(key: string, fallback: number): number {
  const v = parseFloat(getStringPref(key, String(fallback)));
  return isNaN(v) ? fallback : v;
}

export class ApprovalManager {
  static async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const approvalMode = getStringPref('security.approval_mode', 'threshold');
    const autoApproveUnder = getNumericPref('security.auto_approve_under', 0.05);

    if (approvalMode === 'none') {
      return { approved: true, method: 'auto', timestamp: new Date().toISOString() };
    }

    if (approvalMode === 'always-biometric') {
      return this.requestBiometricApproval(request);
    }

    // threshold mode
    if (request.amount <= autoApproveUnder) {
      return { approved: true, method: 'auto', timestamp: new Date().toISOString() };
    }

    return this.requestBiometricApproval(request);
  }

  static async requestSensitiveConfirmation(action: string): Promise<boolean> {
    const platform = os.platform();

    if (platform === 'darwin') {
      const reason = `Confirm: ${action}`;
      try {
        return await this.runTouchID(reason);
      } catch {
        return this.requestConfirmationDialog(action);
      }
    }

    if (!process.stdin.isTTY) return false;

    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`Confirm: ${action}? (yes/no): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      });
    });
  }

  static async requestDestructiveConfirmation(action: string): Promise<boolean> {
    const platform = os.platform();

    if (platform === 'darwin') {
      const reason = `Confirm: ${action} — this will delete all saved credentials`;
      try {
        return await this.runTouchID(reason);
      } catch {
        return this.requestDestructiveDialogConfirmation(action);
      }
    }

    if (!process.stdin.isTTY) return false;

    console.log('\n' + '='.repeat(50));
    console.log(`DESTRUCTIVE ACTION: ${action}`);
    console.log('This will delete all saved credentials.');
    console.log('This cannot be undone.');
    console.log('='.repeat(50));

    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Type "DELETE" to confirm: ', (answer) => {
        rl.close();
        resolve(answer === 'DELETE');
      });
    });
  }

  // ── Platform dispatch ─────────────────────────────────────────────

  private static async requestBiometricApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const platform = os.platform();
    if (platform === 'darwin') {
      return this.requestMacOSTouchIDApproval(request);
    } else if (platform === 'win32') {
      return this.requestWindowsCredentialApproval(request);
    }
    return this.requestTerminalApproval(request);
  }

  private static async requestDialogApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const platform = os.platform();
    if (platform === 'darwin') {
      return this.requestMacOSDialogApproval(request);
    } else if (platform === 'win32') {
      return this.requestWindowsDialogApproval(request);
    }
    return this.requestTerminalApproval(request);
  }

  // ── macOS Touch ID ────────────────────────────────────────────────

  private static async requestMacOSTouchIDApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const reason = `pay $${ceilCents(request.amount)} to ${request.merchantName} via USDC`;

    try {
      const success = await this.runTouchID(reason);
      if (success) {
        return { approved: true, method: 'biometric', timestamp: new Date().toISOString() };
      }
    } catch {
      return this.requestDialogApproval(request);
    }

    return { approved: false, method: 'biometric', timestamp: new Date().toISOString() };
  }

  private static async runTouchID(reason: string): Promise<boolean> {
    const escapedReason = this.escapeObjC(reason).slice(0, 200);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria_touchid_'));
    const srcFile = path.join(tmpDir, 'talaria_touchid.m');
    const binFile = path.join(tmpDir, 'talaria_touchid');

    const objc = `#import <LocalAuthentication/LocalAuthentication.h>
#import <Foundation/Foundation.h>
int main() {
  LAContext *context = [[LAContext alloc] init];
  NSError *error = nil;
  if (![context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error]) {
    printf("RESULT:error\\n");
    return 1;
  }
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  __block BOOL ok = NO;
  [context evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
           localizedReason:@"${escapedReason}"
                     reply:^(BOOL success, NSError *err) { ok = success; dispatch_semaphore_signal(sem); }];
  dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
  printf(ok ? "RESULT:success\\n" : "RESULT:cancelled\\n");
  return 0;
}
`;

    fs.writeFileSync(srcFile, objc);

    try {
      await execAsync(
        `clang -framework LocalAuthentication -framework Foundation -o "${binFile}" "${srcFile}"`,
        { timeout: 30000 }
      );
      const { stdout } = await execAsync(`"${binFile}"`, { timeout: 60000 });

      if (stdout.trim().includes('RESULT:success')) return true;
      if (stdout.trim().includes('RESULT:error')) throw new Error('Biometrics unavailable');
      return false;
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }
  }

  // ── macOS NSAlert dialog (fallback) ───────────────────────────────

  private static async requestMacOSDialogApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const escapedMerchant = this.escapeObjC(request.merchantName).slice(0, 100);
    const escapedDesc = this.escapeObjC(request.description).slice(0, 200);
    const amount = ceilCents(request.amount);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria_dialog_'));
    const srcFile = path.join(tmpDir, 'talaria_dialog.m');
    const binFile = path.join(tmpDir, 'talaria_dialog');

    const objc = `#import <Cocoa/Cocoa.h>
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Talaria Payment Approval";
    alert.informativeText = @"Amount: $${amount}\\nTo: ${escapedMerchant}\\nFor: ${escapedDesc}\\nRail: USDC (Tempo)";
    [alert addButtonWithTitle:@"Approve"];
    [alert addButtonWithTitle:@"Cancel"];
    alert.window.level = NSFloatingWindowLevel;
    [NSApp activateIgnoringOtherApps:YES];
    NSModalResponse response = [alert runModal];
    printf(response == NSAlertFirstButtonReturn ? "RESULT:approved\\n" : "RESULT:cancelled\\n");
  }
  return 0;
}
`;

    try {
      fs.writeFileSync(srcFile, objc);
      await execAsync(`clang -framework Cocoa -o "${binFile}" "${srcFile}"`, { timeout: 30000 });
      const { stdout } = await execAsync(`"${binFile}"`, { timeout: 60000 });
      if (stdout.trim().includes('RESULT:approved')) {
        return { approved: true, method: 'dialog', timestamp: new Date().toISOString() };
      }
    } catch {
      // Dialog cancelled or failed
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }
    return { approved: false, method: 'dialog', timestamp: new Date().toISOString() };
  }

  private static async requestConfirmationDialog(action: string): Promise<boolean> {
    const escapedAction = this.escapeObjC(action).slice(0, 100);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria_dialog_'));
    const srcFile = path.join(tmpDir, 'talaria_dialog.m');
    const binFile = path.join(tmpDir, 'talaria_dialog');

    const objc = `#import <Cocoa/Cocoa.h>
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Talaria — ${escapedAction}";
    alert.informativeText = @"Please confirm this action.";
    [alert addButtonWithTitle:@"Confirm"];
    [alert addButtonWithTitle:@"Cancel"];
    alert.window.level = NSFloatingWindowLevel;
    [NSApp activateIgnoringOtherApps:YES];
    NSModalResponse response = [alert runModal];
    printf(response == NSAlertFirstButtonReturn ? "RESULT:approved\\n" : "RESULT:cancelled\\n");
  }
  return 0;
}
`;

    try {
      fs.writeFileSync(srcFile, objc);
      await execAsync(`clang -framework Cocoa -o "${binFile}" "${srcFile}"`, { timeout: 30000 });
      const { stdout } = await execAsync(`"${binFile}"`, { timeout: 60000 });
      return stdout.trim().includes('RESULT:approved');
    } catch {
      return false;
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }
  }

  private static async requestDestructiveDialogConfirmation(action: string): Promise<boolean> {
    const escapedAction = this.escapeObjC(action).slice(0, 100);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria_dialog_'));
    const srcFile = path.join(tmpDir, 'talaria_dialog.m');
    const binFile = path.join(tmpDir, 'talaria_dialog');

    const objc = `#import <Cocoa/Cocoa.h>
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Talaria — ${escapedAction}";
    alert.informativeText = @"This will delete all saved credentials.\\n\\nThis cannot be undone.";
    [alert addButtonWithTitle:@"Confirm"];
    [alert addButtonWithTitle:@"Cancel"];
    alert.window.level = NSFloatingWindowLevel;
    [NSApp activateIgnoringOtherApps:YES];
    NSModalResponse response = [alert runModal];
    printf(response == NSAlertFirstButtonReturn ? "RESULT:approved\\n" : "RESULT:cancelled\\n");
  }
  return 0;
}
`;

    try {
      fs.writeFileSync(srcFile, objc);
      await execAsync(`clang -framework Cocoa -o "${binFile}" "${srcFile}"`, { timeout: 30000 });
      const { stdout } = await execAsync(`"${binFile}"`, { timeout: 60000 });
      return stdout.trim().includes('RESULT:approved');
    } catch {
      return false;
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }
  }

  // ── Windows ───────────────────────────────────────────────────────

  private static async requestWindowsCredentialApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const message = `Talaria: Pay $${ceilCents(request.amount)} to ${request.merchantName}`;
    try {
      const script = `
        $cred = Get-Credential -Message "${message.replace(/"/g, '\\"')}" -UserName $env:USERNAME
        if ($cred) { "approved" } else { "cancelled" }
      `;
      const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 60000 });
      if (stdout.trim() === 'approved') {
        return { approved: true, method: 'biometric', timestamp: new Date().toISOString() };
      }
    } catch {
      // Fallback to dialog
      return this.requestWindowsDialogApproval(request);
    }
    return { approved: false, method: 'biometric', timestamp: new Date().toISOString() };
  }

  private static async requestWindowsDialogApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const message = this.formatApprovalMessage(request);
    try {
      const script = `
        Add-Type -AssemblyName PresentationFramework
        $result = [System.Windows.MessageBox]::Show("${message.replace(/"/g, '\\"')}", "Talaria Payment", "YesNo", "Question")
        if ($result -eq "Yes") { "approved" } else { "cancelled" }
      `;
      const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 60000 });
      if (stdout.trim() === 'approved') {
        return { approved: true, method: 'dialog', timestamp: new Date().toISOString() };
      }
    } catch {
      // Dialog failed
    }
    return { approved: false, method: 'dialog', timestamp: new Date().toISOString() };
  }

  // ── Terminal (Linux / fallback) ───────────────────────────────────

  private static async requestTerminalApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    if (!process.stdin.isTTY) {
      return { approved: false, method: 'terminal', timestamp: new Date().toISOString() };
    }

    const message = this.formatApprovalMessage(request);
    console.log('\n' + '='.repeat(50));
    console.log('PAYMENT APPROVAL REQUIRED');
    console.log('='.repeat(50));
    console.log(message);
    console.log('='.repeat(50));

    const approved = await new Promise<boolean>((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Approve this payment? (y/n): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });

    return { approved, method: 'terminal', timestamp: new Date().toISOString() };
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private static formatApprovalMessage(request: ApprovalRequest): string {
    return [
      `Amount: $${ceilCents(request.amount)}`,
      `To: ${request.merchantName}`,
      `For: ${request.description}`,
      'Rail: USDC (Tempo)',
    ].join('\n');
  }

  private static escapeObjC(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\0/g, '')
      .replace(/[^\x20-\x7E]/g, '?');
  }
}
