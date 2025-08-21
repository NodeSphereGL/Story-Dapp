import { testConnection, closePool } from '../src/db/mysql';
import { storyscanClient } from '../src/clients/storyscan';
import { dappRepository } from '../src/repos/dapps';
import { statsRepository } from '../src/repos/stats';

/**
 * Test script to verify system setup
 * Tests database connection, API connectivity, and basic functionality
 */

async function testDatabaseConnection(): Promise<boolean> {
  try {
    console.log('🔌 Testing database connection...');
    await testConnection();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

async function testStoryscanAPI(): Promise<boolean> {
  try {
    console.log('🔌 Testing Storyscan API connection...');
    const healthy = await storyscanClient.healthCheck();
    if (healthy) {
      console.log('✅ Storyscan API connection successful');
      return true;
    } else {
      console.warn('⚠️  Storyscan API health check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Storyscan API connection failed:', error);
    return false;
  }
}

async function testDappRepository(): Promise<boolean> {
  try {
    console.log('🔌 Testing dApp repository...');
    
    // Test getting chain ID
    const chainId = dappRepository.getChainId();
    console.log(`✅ Chain ID: ${chainId}`);
    
    // Test getting dApps
    const dapp = await dappRepository.getDapp('story-hunt');
    if (dapp) {
      console.log(`✅ Found dApp: ${dapp.name} (ID: ${dapp.id})`);
    } else {
      console.log('ℹ️  No dApp found (this is normal for fresh setup)');
    }
    
    return true;
  } catch (error) {
    console.error('❌ dApp repository test failed:', error);
    return false;
  }
}

async function testStatsRepository(): Promise<boolean> {
  try {
    console.log('🔌 Testing stats repository...');
    
    // Test getting chain ID
    const chainId = statsRepository.getChainId();
    console.log(`✅ Chain ID: ${chainId}`);
    
    return true;
  } catch (error) {
    console.error('❌ Stats repository test failed:', error);
    return false;
  }
}

async function runAllTests(): Promise<void> {
  console.log('🧪 Starting system tests...\n');
  
  const tests = [
    { name: 'Database Connection', fn: testDatabaseConnection },
    { name: 'Storyscan API', fn: testStoryscanAPI },
    { name: 'dApp Repository', fn: testDappRepository },
    { name: 'Stats Repository', fn: testStatsRepository }
  ];
  
  const results: Array<{ name: string; passed: boolean }> = [];
  
  for (const test of tests) {
    const passed = await test.fn();
    results.push({ name: test.name, passed });
    console.log(''); // Empty line for readability
  }
  
  // Summary
  console.log('📊 Test Results Summary:');
  console.log('========================');
  
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  
  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name}`);
  });
  
  console.log(`\n🎯 Overall: ${passedCount}/${totalCount} tests passed`);
  
  if (passedCount === totalCount) {
    console.log('🎉 All tests passed! System is ready to use.');
  } else {
    console.log('⚠️  Some tests failed. Please check the errors above.');
  }
}

async function main(): Promise<void> {
  try {
    await runAllTests();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    // Cleanup
    try {
      await closePool();
      await storyscanClient.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runAllTests };
