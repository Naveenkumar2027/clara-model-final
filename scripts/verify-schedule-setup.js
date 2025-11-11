#!/usr/bin/env node

/**
 * Verify that the Faculty Schedule & Availability System is set up correctly
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

console.log('🔍 Verifying Faculty Schedule & Availability System setup...\n');

let errors = [];
let warnings = [];

// 1. Check if .env file exists and has required variables
console.log('1. Checking environment variables...');
const envPath = join(rootDir, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  if (!envContent.includes('FEATURE_SCHEDULE_V1=true')) {
    errors.push('FEATURE_SCHEDULE_V1 is not set to true in .env');
  } else {
    console.log('   ✅ FEATURE_SCHEDULE_V1 is set');
  }
  if (!envContent.includes('VITE_FEATURE_SCHEDULE_V1=true')) {
    warnings.push('VITE_FEATURE_SCHEDULE_V1 is not set in .env (will default to enabled)');
  } else {
    console.log('   ✅ VITE_FEATURE_SCHEDULE_V1 is set');
  }
} else {
  errors.push('.env file not found');
}

// 2. Check if data file exists
console.log('\n2. Checking data file...');
const dataPath = join(rootDir, 'packages/shared-schedule/data/faculty-timetables.json');
if (existsSync(dataPath)) {
  try {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    if (Array.isArray(data) && data.length > 0) {
      console.log(`   ✅ Data file exists with ${data.length} faculty entries`);
    } else {
      errors.push('Data file exists but is empty or invalid');
    }
  } catch (error) {
    errors.push(`Data file exists but is invalid JSON: ${error.message}`);
  }
} else {
  errors.push(`Data file not found at: ${dataPath}`);
}

// 3. Check if shared-schedule package is built
console.log('\n3. Checking shared-schedule package...');
const packageDistPath = join(rootDir, 'packages/shared-schedule/dist');
if (existsSync(packageDistPath)) {
  const indexJs = join(packageDistPath, 'index.js');
  if (existsSync(indexJs)) {
    console.log('   ✅ Package is built');
  } else {
    warnings.push('Package dist folder exists but index.js is missing. Run: npm --workspace packages/shared-schedule run build');
  }
} else {
  warnings.push('Package not built yet. It will be built automatically on npm run dev');
}

// 4. Check if server package.json has the dependency
console.log('\n4. Checking server dependencies...');
const serverPackageJson = join(rootDir, 'apps/server/package.json');
if (existsSync(serverPackageJson)) {
  const serverPkg = JSON.parse(readFileSync(serverPackageJson, 'utf-8'));
  if (serverPkg.dependencies && serverPkg.dependencies['@clara/shared-schedule']) {
    console.log('   ✅ Server has @clara/shared-schedule dependency');
  } else {
    errors.push('Server package.json is missing @clara/shared-schedule dependency');
  }
} else {
  errors.push('Server package.json not found');
}

// 5. Check if routes file exists
console.log('\n5. Checking server routes...');
const routesPath = join(rootDir, 'apps/server/src/routes/faculty.ts');
if (existsSync(routesPath)) {
  console.log('   ✅ Faculty routes file exists');
} else {
  errors.push('Faculty routes file not found');
}

// 6. Check if client NLQ handler exists
console.log('\n6. Checking client NLQ handler...');
const clientHandlerPath = join(rootDir, 'apps/client/src/services/availabilityQueryHandler.ts');
if (existsSync(clientHandlerPath)) {
  console.log('   ✅ Client NLQ handler exists');
} else {
  errors.push('Client NLQ handler not found');
}

// Summary
console.log('\n' + '='.repeat(50));
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All checks passed! The system is ready to use.');
  console.log('\nNext steps:');
  console.log('1. Run: npm install');
  console.log('2. Run: npm run dev');
  console.log('3. Test NLQ: "Is Anitha ma\'am free now?"');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log('❌ Errors found:');
    errors.forEach(error => console.log(`   - ${error}`));
  }
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
  }
  if (errors.length > 0) {
    console.log('\nPlease fix the errors before running the system.');
    process.exit(1);
  } else {
    console.log('\n⚠️  Warnings found, but the system should still work.');
    process.exit(0);
  }
}

