#!/usr/bin/env tsx

import { pool } from '../src/db/mysql';
import { storyscanClient } from '../src/clients/storyscan';

interface DappRecord {
  id: number;
  dapp_id: string;
  slug: string;
  title: string;
  all_time_txs: number;
}

interface AddressItem {
  hash: string;
  name: string;
  transactions_count: string;
  metadata: {
    tags: Array<{
      name: string;
      tagType: string;
      slug: string;
      ordinal: number;
      meta: any;
    }>;
  };
}

/**
 * Script to update all dApps with their all-time transaction counts
 * Fetches data from Storyscan API and updates the database
 */
class AllTimeTxsUpdater {
  private processedDapps: number = 0;
  private totalDapps: number = 0;
  private startTime: Date;
  private totalTransactions: number = 0;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Main execution method
   */
  async run(): Promise<void> {
    console.log('🚀 Starting all-time transaction count update...');
    console.log('⏰ Start time:', this.startTime.toISOString());
    
    try {
      // Get all active dApps
      const dapps = await this.getAllActiveDapps();
      this.totalDapps = dapps.length;
      
      if (dapps.length === 0) {
        console.log('❌ No active dApps found in database');
        return;
      }

      console.log(`📊 Found ${dapps.length} active dApps to update`);
      
      // Process each dApp
      for (const dapp of dapps) {
        await this.updateDappAllTimeTxs(dapp);
        this.processedDapps++;
        
        // Progress update
        const progress = ((this.processedDapps / this.totalDapps) * 100).toFixed(1);
        console.log(`📈 Progress: ${this.processedDapps}/${this.totalDapps} (${progress}%)`);
      }

      // Final summary
      await this.printFinalSummary();
      
    } catch (error) {
      console.error('❌ Fatal error during update:', error);
      throw error;
    }
  }

  /**
   * Get all active dApps from database
   */
  private async getAllActiveDapps(): Promise<DappRecord[]> {
    console.log('🔍 Fetching all active dApps from database...');
    
    const [rows] = await pool.execute(`
      SELECT id, dapp_id, slug, title, all_time_txs
      FROM dapps 
      WHERE status = 1 
      ORDER BY priority ASC, id ASC
    `);
    
    const dapps = rows as DappRecord[];
    console.log(`✅ Found ${dapps.length} active dApps`);
    
    // Log dApps with their current all-time txs
    dapps.forEach(dapp => {
      const currentTxs = dapp.all_time_txs || 0;
      console.log(`  - ${dapp.title} (${dapp.slug}): ${currentTxs.toLocaleString()} txs`);
    });
    
    return dapps;
  }

  /**
   * Update a single dApp with its all-time transaction count
   */
  private async updateDappAllTimeTxs(dapp: DappRecord): Promise<void> {
    console.log(`\n🔄 Updating ${dapp.title} (${dapp.slug})...`);
    
    try {
      // Get addresses from Storyscan API
      const addressItems = await storyscanClient.getAddressesBySlug(dapp.slug, 'protocol');
      
      if (!addressItems || addressItems.length === 0) {
        console.log(`   ⚠️  No addresses found for ${dapp.slug}, setting to 0`);
        await this.updateDappTxsCount(dapp.id, 0);
        return;
      }
      
      console.log(`   📡 API returned ${addressItems.length} address items`);
      
      // Calculate total transactions across all addresses
      let totalTxs = 0;
      const addressDetails: Array<{ hash: string; name: string; txs: number }> = [];
      
      for (const item of addressItems) {
        const txs = parseInt(item.transactions_count || '0', 10);
        totalTxs += txs;
        
        addressDetails.push({
          hash: item.hash,
          name: item.name || 'Unknown',
          txs: txs
        });
        
        console.log(`     📍 ${item.name || 'Unknown'} (${item.hash}): ${txs.toLocaleString()} txs`);
      }
      
      console.log(`   📊 Total all-time transactions: ${totalTxs.toLocaleString()}`);
      
      // Update database
      await this.updateDappTxsCount(dapp.id, totalTxs);
      
      // Update total counter
      this.totalTransactions += totalTxs;
      
      console.log(`   ✅ Updated ${dapp.title} with ${totalTxs.toLocaleString()} transactions`);
      
    } catch (error) {
      console.error(`   ❌ Error updating ${dapp.title}:`, error);
      
      // Set to 0 if API fails
      try {
        await this.updateDappTxsCount(dapp.id, 0);
        console.log(`   ⚠️  Set ${dapp.title} to 0 transactions due to API error`);
      } catch (dbError) {
        console.error(`   ❌ Failed to set ${dapp.title} to 0:`, dbError);
      }
    }
  }

  /**
   * Update dApp transaction count in database
   */
  private async updateDappTxsCount(dappId: number, txsCount: number): Promise<void> {
    await pool.execute(`
      UPDATE dapps 
      SET all_time_txs = ?, updated_at = NOW()
      WHERE id = ?
    `, [txsCount, dappId]);
  }

  /**
   * Print final summary
   */
  private async printFinalSummary(): Promise<void> {
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();
    
    console.log('\n🎉 ALL-TIME TRANSACTION UPDATE COMPLETED!');
    console.log('==========================================');
    console.log(`📊 Total dApps processed: ${this.processedDapps}/${this.totalDapps}`);
    console.log(`📈 Total transactions across all dApps: ${this.totalTransactions.toLocaleString()}`);
    console.log(`⏰ Total duration: ${(duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`🚀 Average time per dApp: ${(duration / this.processedDapps / 1000).toFixed(2)} seconds`);
    console.log(`📅 Completed at: ${endTime.toISOString()}`);
    
    // Get updated database stats
    try {
      const [dappStats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_dapps,
          SUM(all_time_txs) as total_transactions,
          AVG(all_time_txs) as avg_transactions,
          MAX(all_time_txs) as max_transactions,
          MIN(all_time_txs) as min_transactions
        FROM dapps 
        WHERE status = 1
      `);
      
      const stats = (dappStats as any[])[0];
      
      console.log('\n📈 UPDATED DATABASE STATS:');
      console.log(`   Total Active dApps: ${stats.total_dapps}`);
      console.log(`   Total All-Time Transactions: ${(stats.total_transactions || 0).toLocaleString()}`);
      console.log(`   Average Transactions per dApp: ${Math.round(stats.avg_transactions || 0).toLocaleString()}`);
      console.log(`   Highest Transaction Count: ${(stats.max_transactions || 0).toLocaleString()}`);
      console.log(`   Lowest Transaction Count: ${(stats.min_transactions || 0).toLocaleString()}`);
      
      // Show top dApps by transaction count
      const [topDapps] = await pool.execute(`
        SELECT title, slug, all_time_txs
        FROM dapps 
        WHERE status = 1 AND all_time_txs > 0
        ORDER BY all_time_txs DESC 
        LIMIT 5
      `);
      
      if ((topDapps as any[]).length > 0) {
        console.log('\n🏆 TOP DAPPS BY TRANSACTION COUNT:');
        (topDapps as any[]).forEach((dapp, index) => {
          const rank = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
          console.log(`   ${rank} ${dapp.title}: ${dapp.all_time_txs.toLocaleString()} txs`);
        });
      }
      
    } catch (error) {
      console.error('   ❌ Error fetching updated database stats:', error);
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const updater = new AllTimeTxsUpdater();
  
  try {
    await updater.run();
    console.log('\n✅ All-time transaction update completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
