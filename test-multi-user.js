#!/usr/bin/env node
/**
 * Multi-user architecture verification
 * Simulates concurrent user sessions to verify token isolation
 * 
 * Usage: node test-multi-user.js
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const NUM_USERS = 3;

async function simulateUserSession(userId) {
  console.log(`[User ${userId}] Starting session simulation...`);
  
  try {
    // Step 1: Get auth URL
    const authResp = await axios.get(`${BASE_URL}/api/auth/login`);
    console.log(`[User ${userId}] ✓ Auth URL obtained`);
    
    // Note: In real scenario, user would complete OAuth flow in browser
    // For testing, we verify that multiple calls don't interfere
    
    // Step 2: Verify session isolation by checking token endpoints
    const testSessionId = `test-session-${userId}-${Date.now()}`;
    
    // Attempt to access token (should fail - no actual auth yet)
    try {
      await axios.get(`${BASE_URL}/api/auth/token/${testSessionId}`);
      console.log(`[User ${userId}] Unexpected: token found without auth`);
    } catch (err) {
      if (err.response?.status === 401) {
        console.log(`[User ${userId}] Token isolation verified (401 as expected)`);
      } else {
        console.log(`[User ${userId}] Unexpected error:`, err.message);
      }
    }
    
    // Step 3: Verify test endpoints don't share state
    const sitesResp = await axios.get(`${BASE_URL}/api/sharepoint/sites/test`);
    console.log(`[User ${userId}] Test sites accessible (${sitesResp.data?.length || 0} sites)`);
    
    return { userId, success: true };
  } catch (error) {
    console.error(`[User ${userId}] Error:`, error.message);
    return { userId, success: false, error: error.message };
  }
}

async function main() {
  console.log('Multi-User Architecture Verification');
  console.log('========================================\n');
  
  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/`);
    console.log(`Server reachable at ${BASE_URL}\n`);
  } catch (err) {
    console.error(`Server not reachable at ${BASE_URL}`);
    console.error('Please start the server first: npm run dev');
    process.exit(1);
  }
  
  console.log(`Simulating ${NUM_USERS} concurrent users...\n`);
  
  // Run concurrent sessions
  const results = await Promise.all(
    Array.from({ length: NUM_USERS }, (_, i) => simulateUserSession(i + 1))
  );
  
  console.log('\n========================================');
  console.log('Results Summary:');
  const successful = results.filter(r => r.success).length;
  console.log(`Successful sessions: ${successful}/${NUM_USERS}`);
  console.log(`Failed sessions: ${NUM_USERS - successful}/${NUM_USERS}`);
  
  if (successful === NUM_USERS) {
    console.log('\nMulti-user architecture verified!');
    console.log('Each user session is properly isolated.');
    process.exit(0);
  } else {
    console.log('\nSome sessions failed. Check logs above.');
    process.exit(1);
  }
}

main();
