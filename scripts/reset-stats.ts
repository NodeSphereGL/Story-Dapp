#!/usr/bin/env tsx

import { pool } from '../src/db/mysql';

/**
 * Script to reset statistics data for testing
 * This will clear all hourly stats and user data
 */
class StatsResetter {
  
  async reset(): Promise<void> {
    console.log('🗑️  Starting statistics data reset...');
    
    try {
      // Check current data volume
      await this.showCurrentDataVolume();
      
      // Confirm with user
      await this.confirmReset();
      
      // Perform the reset
      await this.performReset();
      
      // Verify reset
      await this.verifyReset();
      
      console.log('✅ Statistics data reset completed successfully!');
      
    } catch (error) {
      console.error('❌ Reset failed:', error);
      throw error;
    }
  }

  private async showCurrentDataVolume(): Promise<void> {
    console.log('\n📊 Current Data Volume:');
    
    try {
      const [statsCount] = await pool.execute('SELECT COUNT(*) as count FROM dapp_stats_hourly');
      const [usersCount] = await pool.execute('SELECT COUNT(*) as count FROM dapp_hourly_users');
      const [totalTxs] = await pool.execute('SELECT SUM(tx_count) as total FROM dapp_stats_hourly');
      
      console.log(`   Hourly stats records: ${(statsCount as any[])[0].count}`);
      console.log(`   Hourly user records: ${(usersCount as any[])[0].count}`);
      console.log(`   Total transactions: ${(totalTxs as any[])[0].total || 0}`);
      
    } catch (error) {
      console.error('   ❌ Error checking data volume:', error);
    }
  }

  private async confirmReset(): Promise<void> {
    console.log('\n⚠️  WARNING: This will delete ALL statistics data!');
    console.log('⚠️  This action cannot be undone!');
    console.log('');
    console.log('❓ Are you sure you want to continue?');
    console.log('   - Type "RESET" to proceed');
    console.log('   - Press Ctrl+C to abort');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>((resolve) => {
      rl.question('Confirm reset (RESET/Ctrl+C): ', resolve);
    });
    
    rl.close();
    
    if (answer !== 'RESET') {
      console.log('❌ Reset aborted by user');
      process.exit(0);
    }
    
    console.log('⚠️  Proceeding with data reset...');
  }

  private async performReset(): Promise<void> {
    console.log('\n🔄 Performing data reset...');
    
    try {
      // Clear hourly statistics
      console.log('   Clearing hourly statistics...');
      await pool.execute('TRUNCATE TABLE dapp_stats_hourly');
      
      // Clear hourly users
      console.log('   Clearing hourly users...');
      await pool.execute('TRUNCATE TABLE dapp_hourly_users');
      
      // Clear dApp-address relationships (will be recreated)
      console.log('   Clearing dApp-address relationships...');
      await pool.execute('TRUNCATE TABLE dapp_addresses');
      
      // Clear addresses (will be recreated)
      console.log('   Clearing addresses...');
      await pool.execute('TRUNCATE TABLE addresses');
      
      console.log('   ✅ All statistics data cleared');
      
    } catch (error) {
      console.error('   ❌ Error during reset:', error);
      throw error;
    }
  }

  private async verifyReset(): Promise<void> {
    console.log('\n🔍 Verifying reset...');
    
    try {
      const [statsCount] = await pool.execute('SELECT COUNT(*) as count FROM dapp_stats_hourly');
      const [usersCount] = await pool.execute('SELECT COUNT(*) as count FROM dapp_hourly_users');
      const [addressesCount] = await pool.execute('SELECT COUNT(*) as count FROM addresses');
      const [dappAddressesCount] = await pool.execute('SELECT COUNT(*) as count FROM dapp_addresses');
      
      const stats = (statsCount as any[])[0].count;
      const users = (usersCount as any[])[0].count;
      const addresses = (addressesCount as any[])[0].count;
      const dappAddresses = (dappAddressesCount as any[])[0].count;
      
      if (stats === 0 && users === 0 && addresses === 0 && dappAddresses === 0) {
        console.log('   ✅ Reset verified: All tables are empty');
      } else {
        console.log('   ⚠️  Reset incomplete: Some data remains');
        console.log(`      Stats: ${stats}, Users: ${users}, Addresses: ${addresses}, dApp-Addresses: ${dappAddresses}`);
      }
      
    } catch (error) {
      console.error('   ❌ Error verifying reset:', error);
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const resetter = new StatsResetter();
  
  try {
    await resetter.reset();
    console.log('\n🎉 Reset completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Run: npm run crawl:all -- --historical --days 7 (for 1 week test)');
    console.log('   2. Test API: curl http://localhost:8002/api/dapps/stats');
    console.log('   3. Verify percentage calculations manually');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Reset failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
