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
 */
class AllDappsCrawler {
  private chainId: number = 1; // Default to main chain
  private processedDapps: number = 0;
  private totalDapps: number = 0;
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Main execution method
   */
  async run(): Promise<void> {
    console.log('🚀 Starting comprehensive dApp crawling...');
    console.log('⏰ Start time:', this.startTime.toISOString());
    
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
    
    // Set a reasonable cutoff time (e.g., 30 days back)
    const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    console.log(`   ⏰ Processing transactions from ${cutoffTime.toISOString()} onwards`);
    
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
  const crawler = new AllDappsCrawler();
  
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
