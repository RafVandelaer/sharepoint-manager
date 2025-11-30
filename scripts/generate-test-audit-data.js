/**
 * Test script to generate sample audit data
 * Run: node scripts/generate-test-audit-data.js
 */

const auditLogger = require('../services/auditLogger');

console.log('🧪 Generating test audit data...\n');

// Simulate various user actions
const actions = [
  'LOGIN_SUCCESS',
  'CONFIG_CREATED',
  'SCAN_STARTED',
  'DRY_RUN_STARTED',
  'DRY_RUN_COMPLETED',
  'CLEANUP_STARTED',
  'CLEANUP_COMPLETED',
  'LOGOUT'
];

const tenants = [
  'tenant-contoso',
  'tenant-fabrikam',
  'tenant-northwind',
  'tenant-adventure',
  'tenant-tailspin'
];

const users = [
  'john.doe@example.com',
  'jane.smith@example.com',
  'bob.wilson@example.com',
  'alice.johnson@example.com',
  'charlie.brown@example.com'
];

// Generate 100 random audit events
for (let i = 0; i < 100; i++) {
  const action = actions[Math.floor(Math.random() * actions.length)];
  const tenant = tenants[Math.floor(Math.random() * tenants.length)];
  const user = users[Math.floor(Math.random() * users.length)];
  const sessionId = `session-${Math.floor(Math.random() * 50)}`;

  auditLogger.logAudit(action, sessionId, tenant, user, {
    randomData: Math.random(),
    timestamp: Date.now()
  });

  if ((i + 1) % 20 === 0) {
    console.log(`✅ Generated ${i + 1} events...`);
  }
}

console.log('\n✨ Test data generated successfully!');
console.log('📁 Check: logs/archive/audit-*.jsonl');
console.log('🌐 Open: http://localhost:3000/admin-dashboard.html\n');

// Display hash consistency test
console.log('🔒 Hash consistency test:');
const testEmail = 'john.doe@example.com';
const hash1 = auditLogger.hashIdentifier(testEmail);
const hash2 = auditLogger.hashIdentifier(testEmail);
console.log(`Email: ${testEmail}`);
console.log(`Hash 1: ${hash1}`);
console.log(`Hash 2: ${hash2}`);
console.log(`Consistent: ${hash1 === hash2 ? '✅' : '❌'}`);
console.log(`Reversible: ❌ (SHA-256 is one-way)\n`);
