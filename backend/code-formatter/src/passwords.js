// Puente Node -> backend/security/passwords.py (Argon2id). Un worker Python de larga vida; las peticiones se serializan
// (acota la memoria usada por Argon2). La contraseña viaja por stdin, nunca por argv.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../security/passwords.py');
const TIMEOUT_MS = 15_000;

export function createPasswordService({ python = process.env.PYTHON_BIN || 'python', script = SCRIPT } = {}) {
  let child = null;
  let nextId = 1;
  const pending = new Map();
  let chain = Promise.resolve();

  const fail = (err) => { for (const p of pending.values()) p.reject(err); pending.clear(); };

  function ensure() {
    if (child) return child;
    child = spawn(python, [script, '--worker'], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); msg.ok ? p.resolve(msg) : p.reject(new Error(`passwords.py: ${msg.error}`)); }
    });
    child.on('error', (err) => { child = null; fail(err); });
    child.on('exit', () => { child = null; fail(new Error('passwords.py terminó')); });
    return child;
  }

  const call = (req) => {
    const run = () => new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('passwords.py timeout')); }, TIMEOUT_MS);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      ensure().stdin.write(`${JSON.stringify({ id, ...req })}\n`);
    });
    chain = chain.then(run, run);
    return chain;
  };

  return {
    hash: async (password) => (await call({ op: 'hash', password })).hash,
    /** -> { valid, rehash } */
    verify: async (hash, password) => { const r = await call({ op: 'verify', hash, password }); return { valid: r.valid, rehash: r.rehash }; },
    close: () => { child?.stdin.end(); child = null; },
  };
}
