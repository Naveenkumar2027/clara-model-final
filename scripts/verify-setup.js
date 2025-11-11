#!/usr/bin/env node
/**
 * Comprehensive verification script for Clara project setup
 * Checks client, staff, server, and schedule feature configuration
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const errors = [];
const warnings = [];
const successes = [];

function check(name, condition, errorMsg, warnMsg) {
  if (condition) {
    successes.push(`✅ ${name}`);
  } else if (errorMsg) {
    errors.push(`❌ ${name}: ${errorMsg}`);
  } else if (warnMsg) {
    warnings.push(`⚠️  ${name}: ${warnMsg}`);
  }
}

console.log('🔍 Verifying Clara Project Setup...\n');

// 1. Check environment variables
console.log('📋 Checking Environment Variables...');
const envPath = join(rootDir, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  
  check(
    'FEATURE_SCHEDULE_V1',
    envContent.includes('FEATURE_SCHEDULE_V1=true'),
    'FEATURE_SCHEDULE_V1 is not set to true',
    null
  );
  
  check(
    'VITE_FEATURE_SCHEDULE_V1',
    envContent.includes('VITE_FEATURE_SCHEDULE_V1=true'),
    null,
    'VITE_FEATURE_SCHEDULE_V1 is not set (will default to enabled)'
  );
  
  check(
    'VITE_API_BASE',
    envContent.includes('VITE_API_BASE'),
    null,
    'VITE_API_BASE is not set (will default to http://localhost:8080)'
  );
  
  check(
    'SERVER_PORT',
    envContent.includes('SERVER_PORT'),
    null,
    'SERVER_PORT is not set (will default to 8080)'
  );
} else {
  errors.push('❌ .env file not found');
}

// 2. Check shared-schedule package
console.log('\n📦 Checking shared-schedule Package...');
const sharedScheduleDir = join(rootDir, 'packages/shared-schedule');
check(
  'shared-schedule directory exists',
  existsSync(sharedScheduleDir),
  'shared-schedule package directory not found',
  null
);

const sharedScheduleDist = join(sharedScheduleDir, 'dist');
check(
  'shared-schedule built',
  existsSync(sharedScheduleDist) && existsSync(join(sharedScheduleDist, 'index.js')),
  'shared-schedule package not built. Run: npm --workspace packages/shared-schedule run build',
  null
);

const facultyDataFile = join(sharedScheduleDir, 'data/faculty-timetables.json');
check(
  'faculty-timetables.json exists',
  existsSync(facultyDataFile),
  'faculty-timetables.json not found',
  null
);

if (existsSync(facultyDataFile)) {
  try {
    const data = JSON.parse(readFileSync(facultyDataFile, 'utf-8'));
    check(
      'faculty-timetables.json is valid JSON',
      Array.isArray(data) && data.length > 0,
      'faculty-timetables.json is invalid or empty',
      null
    );
    if (Array.isArray(data)) {
      successes.push(`✅ Found ${data.length} faculty members in timetable data`);
    }
  } catch (e) {
    errors.push(`❌ faculty-timetables.json is invalid JSON: ${e.message}`);
  }
}

// 3. Check server setup
console.log('\n🖥️  Checking Server Setup...');
const serverDir = join(rootDir, 'apps/server');
check(
  'server directory exists',
  existsSync(serverDir),
  'server app directory not found',
  null
);

const serverPackageJson = join(serverDir, 'package.json');
if (existsSync(serverPackageJson)) {
  const serverPkg = JSON.parse(readFileSync(serverPackageJson, 'utf-8'));
  check(
    'server depends on @clara/shared-schedule',
    serverPkg.dependencies && serverPkg.dependencies['@clara/shared-schedule'],
    'server does not depend on @clara/shared-schedule',
    null
  );
}

const facultyRoutes = join(serverDir, 'src/routes/faculty.ts');
check(
  'faculty routes exist',
  existsSync(facultyRoutes),
  'faculty routes not found',
  null
);

// 4. Check client setup
console.log('\n💻 Checking Client Setup...');
const clientDir = join(rootDir, 'apps/client');
check(
  'client directory exists',
  existsSync(clientDir),
  'client app directory not found',
  null
);

const availabilityHandler = join(clientDir, 'src/services/availabilityQueryHandler.ts');
check(
  'availability query handler exists',
  existsSync(availabilityHandler),
  'availability query handler not found',
  null
);

// 5. Check staff setup
console.log('\n👥 Checking Staff Setup...');
const staffDir = join(rootDir, 'apps/staff');
check(
  'staff directory exists',
  existsSync(staffDir),
  'staff app directory not found',
  null
);

const timetableComponent = join(staffDir, 'components/Timetable.tsx');
check(
  'Timetable component exists',
  existsSync(timetableComponent),
  'Timetable component not found',
  null
);

// 6. Check package.json workspace configuration
console.log('\n⚙️  Checking Workspace Configuration...');
const rootPackageJson = join(rootDir, 'package.json');
if (existsSync(rootPackageJson)) {
  const rootPkg = JSON.parse(readFileSync(rootPackageJson, 'utf-8'));
  check(
    'workspaces configured',
    rootPkg.workspaces && rootPkg.workspaces.includes('packages/*'),
    'workspaces not configured correctly',
    null
  );
  
  check(
    'predev script exists',
    rootPkg.scripts && rootPkg.scripts.predev,
    'predev script not found (needed to build shared-schedule)',
    null
  );
}

// Print results
console.log('\n' + '='.repeat(50));
console.log('📊 Verification Results\n');

if (successes.length > 0) {
  console.log('✅ Successes:');
  successes.forEach(s => console.log(`   ${s}`));
  console.log();
}

if (warnings.length > 0) {
  console.log('⚠️  Warnings:');
  warnings.forEach(w => console.log(`   ${w}`));
  console.log();
}

if (errors.length > 0) {
  console.log('❌ Errors:');
  errors.forEach(e => console.log(`   ${e}`));
  console.log();
  process.exit(1);
} else {
  console.log('🎉 All checks passed! The project is ready to run.');
  console.log('\n💡 Next steps:');
  console.log('   1. Run: npm install (if not already done)');
  console.log('   2. Run: npm run dev');
  console.log('   3. Open http://localhost:5173 for client');
  console.log('   4. Open http://localhost:5174 for staff');
  console.log('   5. Server runs on http://localhost:8080');
  process.exit(0);
}

