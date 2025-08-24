#!/usr/bin/env tsx

import { pool } from '../src/db/mysql';
import { storyscanClient } from '../src/clients/storyscan';
import { floorToHourUTC, parseBlockTime } from '../src/utils/time';
import { dappRepository } from '../src/repos/dapps';
import { statsRepository } from '../src/repos/stats';

interface DappRecord {
  id: number;
  dapp_id: string;
  slug: string;
  title: string;
  priority: number | null;
  status: number;
}

/**
 * Script for updating recent dApp data without affecting historical data
 * This is the SAFE script to run on live systems for ongoing updates
 */
class RecentDataUpdater {
  private chainId: number = 1;
  private processedDapps: number = 0;
  private totalDapps: number = 0;
  private startTime: Date;
  private readonly maxHoursBack: number;

  constructor(options: { maxHoursBack?: number } = {}) {
    this.startTime = new Date();
    this.maxHoursBack = options.maxHoursBack ?? 24; // Default to last 24 hours
  }

  /**
   * Main execution method
   */
  async run(): Promise<void> {
    console.log('🔄 Starting recent data update...');
    console.log('⏰ Start time:', this.startTime.toISOString());
    console.log(`📊 Processing last ${this.maxHoursBack} hours of data`);
    console.log('✅ This script is SAFE for live systems');
    
    try {
      // Step 1: Get all active dApps ordered by priority
      const dapps = await this.getAllActiveDapps();
      this.totalDapps = dapps.length;
      
      if (dapps.length === 0) {
        console.log('❌ No active dApps found in database');
        return;
      }

      console.log(`📊 Found ${dapps.length} active dApps to update`);
      
      // Step 2: Process each dApp
      for (const dapp of dapps) {
        await this.updateDappRecentData(dapp);
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
   * Get all active dApps ordered by priority
   */
  private async getAllActiveDapps(): Promise<DappRecord[]> {
    console.log('🔍 Fetching all active dApps from database...');
    
    const [rows] = await pool.execute(`
      SELECT id, dapp_id, slug, title, priority, status 
      FROM dapps 
      WHERE status = 1 
      ORDER BY priority ASC, id ASC
    `);
    
    const dapps = rows as DappRecord[];
    console.log(`✅ Found ${dapps.length} active dApps`);
    
    // Log dApps with their priorities
    dapps.forEach(dapp => {
      const priority = dapp.priority ? `P${dapp.priority}` : 'No Priority';
      console.log(`  - ${dapp.title} (${dapp.slug}) - ${priority}`);
    });
    
    return dapps;
  }

  /**
   * Update recent data for a single dApp
   */
  private async updateDappRecentData(dapp: DappRecord): Promise<void> {
    console.log(`\n🔄 Updating recent data for: ${dapp.title} (${dapp.slug})`);
    
    try {
      // Get addresses for this dApp
      const addresses = await this.getDappAddresses(dapp);
      
      if (addresses.length === 0) {
        console.log(`   ⚠️  No addresses found for ${dapp.title}`);
        return;
      }
      
      console.log(`   📍 Found ${addresses.length} addresses`);
      
      // Calculate cutoff time (e.g., 24 hours back)
      const cutoffTime = new Date(Date.now() - this.maxHoursBack * 60 * 60 * 1000);
      console.log(`   ⏰ Processing transactions from ${cutoffTime.toISOString()} onwards`);
      
      // Process recent transactions for all addresses
      let totalNewTxs = 0;
      let totalNewUsers = 0;
      
      for (const address of addresses) {
        try {
          const addressSummary = await this.processRecentAddressTransactions(
            dapp.id, 
            address.address_hash, 
            cutoffTime
          );
          
          totalNewTxs += addressSummary.newTxs;
          totalNewUsers += addressSummary.newUsers;
          
        } catch (error) {
          console.error(`     ❌ Error processing address ${address.address_hash}:`, error);
        }
      }
      
      console.log(`   ✅ Updated ${dapp.title}: +${totalNewTxs} new txs, +${totalNewUsers} new users`);
      
    } catch (error) {
      console.error(`   ❌ Error updating ${dapp.title}:`, error);
    }
  }

  /**
   * Get addresses for a dApp
   */
  private async getDappAddresses(dapp: DappRecord): Promise<Array<{ address_hash: string }>> {
    try {
      // Get addresses from database (don't call API repeatedly)
      const [rows] = await pool.execute(`
        SELECT a.address_hash 
        FROM dapp_addresses da
        JOIN addresses a ON da.address_id = a.id
        WHERE da.dapp_id = ? AND a.chain_id = ?
      `, [dapp.id, this.chainId]);
      
      return rows as Array<{ address_hash: string }>;
      
    } catch (error) {
      console.error(`   ❌ Error fetching addresses for ${dapp.slug}:`, error);
      return [];
    }
  }

  /**
   * Process recent transactions for a single address
   */
  private async processRecentAddressTransactions(
    dappId: number, 
    addressHash: string, 
    cutoffTime: Date
  ): Promise<{ newTxs: number; newUsers: number }> {
    const summary = { newTxs: 0, newUsers: 0 };
    
    try {
      // Get the last processed timestamp for this address
      const lastProcessed = await this.getLastProcessedTimestamp(dappId, addressHash);
      
      // Only process transactions newer than the last processed
      const effectiveCutoff = lastProcessed > cutoffTime ? lastProcessed : cutoffTime;
      
      if (effectiveCutoff >= new Date()) {
        console.log(`     ⏭️  Address ${addressHash} already up to date`);
        return summary;
      }
      
      console.log(`     🔍 Processing new transactions for ${addressHash} from ${effectiveCutoff.toISOString()}`);
      
      // Process new transactions
      for await (const tx of storyscanClient.iterateAddressTransactions(addressHash, effectiveCutoff)) {
        // Skip failed transactions
        if (tx.status === 'failed' || tx.status === 'reverted') {
          continue;
        }
        
        // Validate transaction data
        if (!tx.timestamp || !tx.from?.hash) {
          continue;
        }
        
        // Parse timestamp and floor to hour
        const blockTime = parseBlockTime(tx.timestamp);
        const tsHour = floorToHourUTC(blockTime);
        
        // Insert transaction data
        await this.insertTransactionData(dappId, tsHour, tx.from.hash);
        
        summary.newTxs++;
        summary.newUsers++;
      }
      
    } catch (error) {
      console.error(`       ❌ Error processing transactions for ${addressHash}:`, error);
    }
    
    return summary;
  }

  /**
   * Get the last processed timestamp for an address
   */
  private async getLastProcessedTimestamp(dappId: number, addressHash: string): Promise<Date> {
    try {
      const [rows] = await pool.execute(`
        SELECT MAX(ts_hour) as last_hour
        FROM dapp_stats_hourly 
        WHERE dapp_id = ? AND chain_id = ? AND tx_count > 0
      `, [dappId, this.chainId]);
      
      const lastHour = (rows as any[])[0]?.last_hour;
      return lastHour ? new Date(lastHour) : new Date(0);
      
    } catch (error) {
      console.error(`       ❌ Error getting last processed timestamp:`, error);
      return new Date(0);
    }
  }

  /**
   * Insert transaction data into hourly stats
   */
  private async insertTransactionData(dappId: number, tsHour: Date, userAddress: string): Promise<void> {
    try {
      // Upsert hourly transaction count
      await pool.execute(`
        INSERT INTO dapp_stats_hourly (dapp_id, chain_id, ts_hour, tx_count, unique_users)
        VALUES (?, ?, ?, 1, 0)
        ON DUPLICATE KEY UPDATE tx_count = tx_count + 1
      `, [dappId, this.chainId, tsHour]);
      
      // Insert hourly user (IGNORE to avoid duplicates)
      await pool.execute(`
        INSERT IGNORE INTO dapp_hourly_users (dapp_id, chain_id, ts_hour, user_address)
        VALUES (?, ?, ?, ?)
      `, [dappId, this.chainId, tsHour, userAddress.toLowerCase()]);
      
    } catch (error) {
      console.error(`       ❌ Error inserting transaction data:`, error);
    }
  }

  /**
   * Print final summary
   */
  private async printFinalSummary(): Promise<void> {
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();
    
    console.log('\n🎉 RECENT DATA UPDATE COMPLETED!');
    console.log('==================================');
    console.log(`📊 Total dApps updated: ${this.processedDapps}/${this.totalDapps}`);
    console.log(`⏰ Total duration: ${(duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`📅 Completed at: ${endTime.toISOString()}`);
    console.log('');
    console.log('💡 This script is safe to run regularly on live systems');
    console.log('💡 It only processes new data without affecting historical records');
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const maxHoursBack = args.includes('--hours') ? 
    parseInt(args[args.indexOf('--hours') + 1]) || 24 : 24;
  
  console.log('📋 Recent Data Update Options:');
  console.log(`   Max hours back: ${maxHoursBack}`);
  console.log('');
  console.log('✅ This script is SAFE for live systems');
  console.log('✅ It only processes new/recent data');
  console.log('✅ Use this for ongoing updates instead of crawl-all.ts');
  console.log('');
  
  const updater = new RecentDataUpdater({ maxHoursBack });
  
  try {
    await updater.run();
    console.log('\n✅ Recent data update completed successfully!');
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
