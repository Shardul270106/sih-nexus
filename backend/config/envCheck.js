/**
 * Startup environment validation — MUST run first, before DB connection.
 * - Creates backend/.env from the template if missing
 * - Normalizes invalid values (e.g. ambient PORT=0 in some shells)
 * - Prints clear warnings instead of failing silently later
 */
const fs = require('fs');
const path = require('path');

function checkEnv() {
  const backendDir = path.join(__dirname, '..');
  const envPath = path.join(backendDir, '.env');
  const envExamplePath = path.join(backendDir, '.env.example');

  // 1. Ensure .env exists
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('📄 Created backend/.env from .env.example — review it before production use');
    } else {
      console.warn('⚠️  backend/.env not found and no .env.example template available');
    }
  }

  const warnings = [];

  // 2. PORT — guard against invalid/ambient values (e.g. PORT=0 exported by some shells)
  const rawPort = process.env.PORT;
  const port = parseInt(rawPort, 10);
  if (!rawPort || Number.isNaN(port) || port <= 0 || port > 65535) {
    process.env.PORT = '5000';
    warnings.push(`PORT was ${rawPort === undefined ? 'not set' : `invalid ("${rawPort}")`} — defaulted to 5000`);
  }

  // 3. JWT secret
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change-me')) {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'dev-insecure-jwt-secret';
    warnings.push('JWT_SECRET missing or default — tokens are NOT secure. Set it in backend/.env');
  }

  // 4. Database URI
  if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/agni_drishti';
    warnings.push('MONGODB_URI not set — defaulting to mongodb://127.0.0.1:27017/agni_drishti');
  }

  // 5. FIRMS key — demo mode notice (not an error)
  if (!process.env.FIRMS_MAP_KEY || process.env.FIRMS_MAP_KEY === 'your_firms_map_key_here') {
    warnings.push('FIRMS_MAP_KEY not set — running in SYNTHETIC DEMO data mode');
  }

  warnings.forEach((w) => console.warn('⚠️  ' + w));
  return true;
}

module.exports = { checkEnv };
