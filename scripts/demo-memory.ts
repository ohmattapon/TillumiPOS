// Demo launcher (bun run demo:memory): sets demo-only dummy env, then runs the normal dev stack.
// A committed .env file is not an option (the pre-commit hook refuses every .env* name),
// and `VAR=x cmd` prefixes do not work on Windows PowerShell/cmd, so env is set here instead.
// Existing values win, so a developer can still override any of these.
const demo: Record<string, string> = {
  DEMO_MODE: 'memory',
  MEDIA_STORAGE: 'none',
  // Points at nothing (port 1): the demo server must never connect to it.
  DATABASE_URL: 'postgres://demo:your-demo-password@127.0.0.1:1/demo',
  JWT_SECRET: 'demo-jwt-secret-for-local-demo-only',
}
for (const [key, value] of Object.entries(demo)) Bun.env[key] ??= value

const child = Bun.spawn(['bun', 'run', 'dev'], { stdio: ['inherit', 'inherit', 'inherit'] })
process.exit(await child.exited)
