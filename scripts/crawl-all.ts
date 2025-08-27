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

interface AddressRecord {
  id: number;
  address_hash: string;
  label: string | null;
}

interface TransactionSummary {
  totalTxs: number;
  uniqueUsers: Set<string>;
  hoursTouched: Set<Date>;
}

/**
 * Main crawling script for all dApps
 * 
 * ⚠️  WARNING: This script is designed for INITIAL DATA POPULATION only!
 * Running it on a live system with existing data will create artificial spikes.
 * 
 * For ongoing updates, use the regular ingestion scheduler instead.
 */
class AllDappsCrawler {
  private chainId: number = 1; // Default to main chain
  private processedDapps: number = 0;
  private totalDapps: number = 0;
  private startTime: Date;
  private readonly isHistoricalMode: boolean;
  private readonly maxDaysBack: number;

  constructor(options: { historical?: boolean; maxDaysBack?: number } = {}) {
    this.startTime = new Date();
    this.isHistoricalMode = options.historical ?? false;
    this.maxDaysBack = options.maxDaysBack ?? 90;
  }

  /**
   * Main execution method
   */
  async run(): Promise<void> {
    console.log('🚀 Starting comprehensive dApp crawling...');
    console.log('⏰ Start time:', this.startTime.toISOString());
    console.log(`📊 Mode: ${this.isHistoricalMode ? 'Historical (Full)' : 'Recent Only'}`);
    console.log(`📅 Max days back: ${this.maxDaysBack}`);
    
    // Safety check for live systems
    if (!this.isHistoricalMode) {
      await this.performSafetyCheck();
    }
    
    try {
      // Step 1: Get all active dApps ordered by priority
      const dapps = await this.getAllActiveDapps();
      this.totalDapps = dapps.length;
      
      if (dapps.length === 0) {
        console.log('❌ No active dApps found in database');
        return;
      }

      console.log(`📊 Found ${dapps.length} active dApps to process`);
      
      // Step 2: Process each dApp
      for (const dapp of dapps) {
        await this.processDapp(dapp);
        this.processedDapps++;
        
        // Progress update
        const progress = ((this.processedDapps / this.totalDapps) * 100).toFixed(1);
        console.log(`📈 Progress: ${this.processedDapps}/${this.totalDapps} (${progress}%)`);
      }

      // Final summary
      await this.printFinalSummary();
      
    } catch (error) {
      console.error('❌ Fatal error during crawling:', error);
      throw error;
    }
  }

  /**
   * Safety check to prevent running on live systems with existing data
   */
  private async performSafetyCheck(): Promise<void> {
    console.log('🔒 Performing safety check...');
    
    try {
      // Check if we already have significant data
      const [txCountResult] = await pool.execute('SELECT SUM(tx_count) as total FROM dapp_stats_hourly');
      const totalTxs = (txCountResult as any[])[0].total || 0;
      
      if (totalTxs > 10000) { // Arbitrary threshold
        console.log(`⚠️  WARNING: Database already contains ${totalTxs.toLocaleString()} transactions!`);
        console.log('⚠️  This suggests this is a live system with existing data.');
        console.log('⚠️  Running this script will create artificial data spikes!');
        console.log('');
        console.log('❓ Are you sure you want to continue?');
        console.log('   - Type "YES" to proceed (not recommended for live systems)');
        console.log('   - Press Ctrl+C to abort');
        console.log('');
        console.log('💡 Recommendation: Use the regular ingestion scheduler instead.');
        console.log('   Run: npm run start (for continuous ingestion)');
        console.log('   Or: npm run dapp:ingest (for manual ingestion)');
        
        // Wait for user confirmation
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise<string>((resolve) => {
          rl.question('Continue? (YES/Ctrl+C): ', resolve);
        });
        
        rl.close();
        
        if (answer !== 'YES') {
          console.log('❌ Aborted by user');
          process.exit(0);
        }
        
        console.log('⚠️  Proceeding with caution...');
      } else {
        console.log('✅ Safety check passed - minimal existing data detected');
      }
    } catch (error) {
      console.error('⚠️  Could not perform safety check:', error);
      console.log('⚠️  Proceeding with caution...');
    }
  }

  /**
   * Step 1: Get all active dApps ordered by priority
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
   * Step 2: Process a single dApp
   */
  private async processDapp(dapp: DappRecord): Promise<void> {
    console.log(`\n🔄 Processing dApp: ${dapp.title} (${dapp.slug})`);
    console.log(`   Priority: ${dapp.priority || 'None'}`);
    
    try {
      // Step 2A: Get addresses for this dApp
      const addresses = await this.getDappAddresses(dapp);
      
      if (addresses.length === 0) {
        console.log(`   ⚠️  No addresses found for ${dapp.title}`);
        return;
      }
      
      console.log(`   📍 Found ${addresses.length} addresses`);
      
      // Step 2B: Process transactions for all addresses
      const summary = await this.processAddressTransactions(dapp, addresses);
      
      // Step 2C: Insert aggregated data into database
      await this.insertAggregatedData(dapp, summary);
      
      console.log(`   ✅ Completed processing ${dapp.title}`);
      
    } catch (error) {
      console.error(`   ❌ Error processing ${dapp.title}:`, error);
      // Continue with next dApp
    }
  }

  /**
   * Step 2A: Get addresses for a dApp
   */
  private async getDappAddresses(dapp: DappRecord): Promise<AddressRecord[]> {
    try {
      console.log(`   🔍 Fetching addresses for ${dapp.slug}...`);
      
      // Get addresses from Storyscan API
      const addressItems = await storyscanClient.getAddressesBySlug(dapp.slug, 'protocol');
      
      if (!addressItems || addressItems.length === 0) {
        console.log(`   ⚠️  No addresses returned from API for ${dapp.slug}`);
        return [];
      }
      
      console.log(`   📡 API returned ${addressItems.length} address items`);
      
      // Process each address item
      const addresses: AddressRecord[] = [];
      for (const item of addressItems) {
        try {
          // Check if address already exists in DB
          let addressId: number;
          const [existingRows] = await pool.execute(
            'SELECT id FROM addresses WHERE address_hash = ? AND chain_id = ?',
            [item.hash.toLowerCase(), this.chainId]
          );
          
          if ((existingRows as any[]).length > 0) {
            addressId = (existingRows as any[])[0].id;
            console.log(`     🔄 Address ${item.hash} already exists (ID: ${addressId})`);
          } else {
            // Create new address
            const [result] = await pool.execute(
              'INSERT INTO addresses (chain_id, address_hash, label, address_type, first_seen_at) VALUES (?, ?, ?, ?, NOW())',
              [this.chainId, item.hash.toLowerCase(), item.name || `Address for ${dapp.title}`, 'contract']
            );
            addressId = (result as any).insertId;
            console.log(`     ✨ Created new address ${item.hash} (ID: ${addressId})`);
          }
          
          // Link address to dApp
          await pool.execute(
            'INSERT IGNORE INTO dapp_addresses (dapp_id, address_id, role) VALUES (?, ?, ?)',
            [dapp.id, addressId, 'contract']
          );
          
          addresses.push({
            id: addressId,
            address_hash: item.hash,
            label: item.name || `Address for ${dapp.title}`
          });
          
        } catch (error) {
          console.error(`     ❌ Error processing address ${item.hash}:`, error);
        }
      }
      
      return addresses;
      
    } catch (error) {
      console.error(`   ❌ Error fetching addresses for ${dapp.slug}:`, error);
      return [];
    }
  }

  /**
   * Step 2B: Process transactions for all addresses of a dApp
   */
  private async processAddressTransactions(dapp: DappRecord, addresses: AddressRecord[]): Promise<TransactionSummary> {
    console.log(`   📊 Processing transactions for ${addresses.length} addresses...`);
    
    const summary: TransactionSummary = {
      totalTxs: 0,
      uniqueUsers: new Set<string>(),
      hoursTouched: new Set<Date>()
    };
    
    // Set cutoff time based on mode
    const cutoffTime = new Date(Date.now() - this.maxDaysBack * 24 * 60 * 60 * 1000);
    console.log(`   ⏰ Processing transactions from ${cutoffTime.toISOString()} onwards (${this.maxDaysBack} days back)`);
    
    for (const address of addresses) {
      try {
        console.log(`     🔍 Processing address: ${address.address_hash}`);
        
        // Get transactions for this address
        const addressSummary = await this.processSingleAddressTransactions(
          dapp.id, 
          address.address_hash, 
          cutoffTime
        );
        
        // Aggregate results
        summary.totalTxs += addressSummary.totalTxs;
        addressSummary.uniqueUsers.forEach(user => summary.uniqueUsers.add(user));
        addressSummary.hoursTouched.forEach(hour => summary.hoursTouched.add(hour));
        
        console.log(`       📈 Address ${address.address_hash}: ${addressSummary.totalTxs} txs, ${addressSummary.uniqueUsers.size} users`);
        
      } catch (error) {
        console.error(`     ❌ Error processing address ${address.address_hash}:`, error);
      }
    }
    
    console.log(`   📊 Summary for ${dapp.title}: ${summary.totalTxs} total txs, ${summary.uniqueUsers.size} unique users, ${summary.hoursTouched.size} hours`);
    
    return summary;
  }

  /**
   * Process transactions for a single address
   */
  private async processSingleAddressTransactions(
    dappId: number, 
    addressHash: string, 
    cutoffTime: Date
  ): Promise<TransactionSummary> {
    const summary: TransactionSummary = {
      totalTxs: 0,
      uniqueUsers: new Set<string>(),
      hoursTouched: new Set<Date>()
    };
    
    try {
      // Iterate through transactions for this address
      for await (const tx of storyscanClient.iterateAddressTransactions(addressHash, cutoffTime)) {
        // Skip only explicitly failed transactions
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
        
        // Update summary
        summary.totalTxs++;
        summary.uniqueUsers.add(tx.from.hash.toLowerCase());
        summary.hoursTouched.add(tsHour);
        
        // Insert transaction data into hourly stats
        await this.insertTransactionData(dappId, tsHour, tx.from.hash);
      }
      
    } catch (error) {
      console.error(`       ❌ Error iterating transactions for ${addressHash}:`, error);
    }
    
    return summary;
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
   * Bulk insert transaction data for historical crawling
   */
  private async bulkInsertTransactionData(
    dappId: number, 
    hourData: Map<string, { txCount: number; users: Set<string> }>
  ): Promise<void> {
    try {
      console.log(`       💾 Bulk inserting data for ${hourData.size} hours...`);
      
      for (const [hourKey, data] of hourData) {
        const tsHour = new Date(hourKey);
        
        // Upsert hourly stats
        await pool.execute(`
          INSERT INTO dapp_stats_hourly (dapp_id, chain_id, ts_hour, tx_count, unique_users)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            tx_count = VALUES(tx_count),
            unique_users = VALUES(unique_users),
            updated_at = CURRENT_TIMESTAMP
        `, [dappId, this.chainId, tsHour, data.txCount, data.users.size]);
        
        // Insert users for this hour
        for (const userAddress of data.users) {
          await pool.execute(`
            INSERT INTO dapp_hourly_users (dapp_id, chain_id, ts_hour, user_address)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              dapp_id = dapp_id  -- No-op update to refresh timestamp
          `, [dappId, this.chainId, tsHour, userAddress.toLowerCase()]);
        }
      }
      
      console.log(`       ✅ Bulk insert completed for ${hourData.size} hours`);
      
    } catch (error) {
      console.error(`       ❌ Error in bulk insert:`, error);
    }
  }

  /**
   * Check if data already exists for a specific hour
   */
  private async checkHourDataExists(dappId: number, tsHour: Date): Promise<boolean> {
    const [exists] = await pool.execute(`
      SELECT COUNT(*) as count FROM dapp_stats_hourly 
      WHERE dapp_id = ? AND chain_id = ? AND ts_hour = ?
    `, [dappId, this.chainId, tsHour]);
    return (exists as any[])[0].count > 0;
  }

  /**
   * Step 2C: Insert aggregated data and refresh unique user counts
   */
  private async insertAggregatedData(dapp: DappRecord, summary: TransactionSummary): Promise<void> {
    try {
      console.log(`   💾 Refreshing unique user counts for ${summary.hoursTouched.size} hours...`);
      
      // Refresh unique user counts for all touched hours
      for (const tsHour of summary.hoursTouched) {
        await this.refreshHourlyUniqueUsers(dapp.id, tsHour);
      }
      
      console.log(`   ✅ Aggregated data inserted for ${dapp.title}`);
      
    } catch (error) {
      console.error(`   ❌ Error inserting aggregated data:`, error);
    }
  }

  /**
   * Refresh unique user count for a specific hour
   */
  private async refreshHourlyUniqueUsers(dappId: number, tsHour: Date): Promise<void> {
    try {
      await pool.execute(`
        UPDATE dapp_stats_hourly 
        SET unique_users = (
          SELECT COUNT(*) FROM dapp_hourly_users 
          WHERE dapp_id = ? AND chain_id = ? AND ts_hour = ?
        )
        WHERE dapp_id = ? AND chain_id = ? AND ts_hour = ?
      `, [dappId, this.chainId, tsHour, dappId, this.chainId, tsHour]);
      
    } catch (error) {
      console.error(`       ❌ Error refreshing unique users:`, error);
    }
  }

  /**
   * Print final summary
   */
  private async printFinalSummary(): Promise<void> {
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();
    
    console.log('\n🎉 CRAWLING COMPLETED!');
    console.log('========================');
    console.log(`📊 Total dApps processed: ${this.processedDapps}/${this.totalDapps}`);
    console.log(`⏰ Total duration: ${(duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`🚀 Average time per dApp: ${(duration / this.processedDapps / 1000).toFixed(2)} seconds`);
    console.log(`📅 Completed at: ${endTime.toISOString()}`);
    
    // Get some database stats
    try {
      const [dappCount] = await pool.execute('SELECT COUNT(*) as count FROM dapps WHERE status = 1');
      const [addressCount] = await pool.execute('SELECT COUNT(*) as count FROM addresses');
      const [txCount] = await pool.execute('SELECT SUM(tx_count) as total FROM dapp_stats_hourly');
      const [userCount] = await pool.execute('SELECT COUNT(DISTINCT user_address) as unique_users FROM dapp_hourly_users');
      
      console.log('\n📈 DATABASE STATS:');
      console.log(`   Active dApps: ${(dappCount as any[])[0].count}`);
      console.log(`   Total Addresses: ${(addressCount as any[])[0].count}`);
      console.log(`   Total Transactions: ${(txCount as any[])[0].total || 0}`);
      console.log(`   Unique Users: ${(userCount as any[])[0].unique_users || 0}`);
      
    } catch (error) {
      console.error('   ❌ Error fetching database stats:', error);
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const isHistorical = args.includes('--historical');
  const maxDaysBack = args.includes('--days') ? 
    parseInt(args[args.indexOf('--days') + 1]) || 90 : 90;
  
  console.log('📋 Script Options:');
  console.log(`   Historical mode: ${isHistorical ? 'Yes' : 'No'}`);
  console.log(`   Max days back: ${maxDaysBack}`);
  console.log('');
  
  if (isHistorical) {
    console.log('⚠️  HISTORICAL MODE: This will populate full historical data');
    console.log('⚠️  Use this for initial setup or data recovery only');
  } else {
    console.log('📊 RECENT MODE: This will only process recent data');
    console.log('📊 Use this for ongoing updates (recommended for live systems)');
  }
  console.log('');
  
  const crawler = new AllDappsCrawler({ 
    historical: isHistorical, 
    maxDaysBack 
  });
  
  try {
    await crawler.run();
    console.log('\n✅ All dApps crawling completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Crawling failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
