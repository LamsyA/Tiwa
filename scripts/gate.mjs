// scripts/gate.mjs — stub (full implementation in P0-T14 reads gates/<n>.json).
// Usage: pnpm gate <phase>
const phase = process.argv[2];
if (!phase) {
  console.error('Usage: pnpm gate <phase>');
  process.exit(1);
}
console.log(`TODO P0-T14: gate ${phase} not wired yet (gates/${phase}.json missing).`);
process.exit(0);
