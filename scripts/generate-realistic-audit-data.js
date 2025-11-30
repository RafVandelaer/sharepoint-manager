/**
 * Generate realistic test audit data spread over 30 days
 * Run: node scripts/generate-realistic-audit-data.js
 */

const auditLogger = require('../services/auditLogger');

console.log('🧪 Generating realistic audit data (30 days)...\n');

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
  'tenant-contoso-com',
  'tenant-fabrikam-com',
  'tenant-northwind-com'
];

const users = [
  'john.doe@contoso.com',
  'jane.smith@fabrikam.com',
  'bob.wilson@northwind.com'
];

// Generate events spread over last 30 days
const now = Date.now();
const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

let totalGenerated = 0;

// Generate 10-30 events per day with UPWARD TREND
// Older days (day 0) → fewer events, newer days (day 29) → more events
for (let day = 0; day < 30; day++) {
  // Gradual growth: day 0 = ~10 events, day 29 = ~38 events
  const growthFactor = 1 + (day / 30) * 1.8; // 1.0 → 2.8 multiplier
  const baseEvents = 10 + Math.floor(Math.random() * 10); // 10-20 base
  const eventsThisDay = Math.floor(baseEvents * growthFactor); // Apply growth
  
  for (let i = 0; i < eventsThisDay; i++) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    const tenant = tenants[Math.floor(Math.random() * tenants.length)];
    const user = users[Math.floor(Math.random() * users.length)];
    const sessionId = `session-${Math.floor(Math.random() * 10)}`;
    
    // Random time during this day
    const dayStart = thirtyDaysAgo + (day * 24 * 60 * 60 * 1000);
    const randomHour = Math.floor(Math.random() * 24);
    const randomMinute = Math.floor(Math.random() * 60);
    const timestamp = dayStart + (randomHour * 60 * 60 * 1000) + (randomMinute * 60 * 1000);
    
    // Create entry with backdated timestamp
    const entry = {
      timestamp: new Date(timestamp).toISOString(),
      action,
      userHash: auditLogger.hashIdentifier(user),
      tenantHash: auditLogger.hashIdentifier(tenant),
      metadata: {
        sessionId,
        generatedData: true
      }
    };
    
    // Write directly to archive (bypass current timestamp)
    const fs = require('fs');
    const path = require('path');
    const yearMonth = new Date(timestamp).toISOString().substring(0, 7);
    const archiveFile = path.join(__dirname, '..', 'logs', 'archive', `audit-${yearMonth}.jsonl`);
    
    fs.appendFileSync(archiveFile, JSON.stringify(entry) + '\n');
    totalGenerated++;
  }
  
  if ((day + 1) % 10 === 0) {
    console.log(`✅ Generated ${totalGenerated} events (${day + 1}/30 days)...`);
  }
}

console.log(`\n✨ Generated ${totalGenerated} events spread over 30 days!`);
console.log('📁 Check: logs/archive/audit-*.jsonl');
console.log('🌐 Refresh: http://localhost:3000/admin-dashboard.html\n');

// Show distribution
const hourCounts = new Array(24).fill(0);
const fs = require('fs');
const path = require('path');

// Read back and count by hour
const archiveDir = path.join(__dirname, '..', 'logs', 'archive');
const files = fs.readdirSync(archiveDir).filter(f => f.startsWith('audit-'));

files.forEach(file => {
  const content = fs.readFileSync(path.join(archiveDir, file), 'utf-8');
  content.split('\n').filter(l => l.trim()).forEach(line => {
    try {
      const entry = JSON.parse(line);
      if (entry.metadata?.generatedData) {
        const hour = new Date(entry.timestamp).getHours();
        hourCounts[hour]++;
      }
    } catch (e) {}
  });
});

console.log('📊 Hourly distribution:');
const maxCount = Math.max(...hourCounts);
hourCounts.forEach((count, hour) => {
  if (count > 0) {
    const bar = '█'.repeat(Math.ceil((count / maxCount) * 20));
    console.log(`  ${hour.toString().padStart(2, '0')}:00  ${bar} ${count}`);
  }
});
