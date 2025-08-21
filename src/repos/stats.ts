import { 
  upsertHourlyTxCount,
  insertHourlyUserOnce,
  refreshHourlyUnique,
  getDappStatsInWindow,
  getDappSparkline
} from '../db/queries';
import { storyscanClient, StoryscanTransaction } from '../clients/storyscan';
import { floorToHourUTC, parseBlockTime } from '../utils/time';

export interface IngestionResult {
  dappId: number;
  addressesProcessed: number;
  transactionsProcessed: number;
  hoursTouched: Set<Date>;
}

/**
 * Repository for managing dApp statistics and user data
 */
export class StatsRepository {
  private chainId: number = 1; // Default to Story mainnet

  constructor(chainId: number = 1) {
    this.chainId = chainId;
  }

  /**
   * Ingest transactions for a dApp and update hourly stats
   */
  async ingestDappTransactions(
    dappId: number,
    addresses: string[],
    cutoffTime: Date
  ): Promise<IngestionResult> {
    const result: IngestionResult = {
      dappId,
      addressesProcessed: 0,
      transactionsProcessed: 0,
      hoursTouched: new Set<Date>()
    };

    console.log(`Starting ingestion for dApp ${dappId} with ${addresses.length} addresses`);

    try {
      // Process each address
      for (const address of addresses) {
        try {
          await this.processAddressTransactions(dappId, address, cutoffTime, result);
          result.addressesProcessed++;
        } catch (error) {
          console.error(`Failed to process address ${address}:`, error);
          // Continue with other addresses
        }
      }

      // Refresh unique users for all touched hours
      await this.refreshTouchedHours(dappId, result.hoursTouched);

      console.log(`✅ Completed ingestion for dApp ${dappId}: ${result.transactionsProcessed} transactions, ${result.hoursTouched.size} hours`);
      return result;
    } catch (error) {
      console.error(`Failed to ingest transactions for dApp ${dappId}:`, error);
      throw error;
    }
  }

  /**
   * Process transactions for a single address
   */
  private async processAddressTransactions(
    dappId: number,
    address: string,
    cutoffTime: Date,
    result: IngestionResult
  ): Promise<void> {
    console.log(`Processing transactions for address: ${address}`);

    try {
      // Iterate through all transactions for this address
      for await (const tx of storyscanClient.iterateAddressTransactions(address, cutoffTime)) {
        // Skip failed transactions
        if (tx.status !== 'success') {
          continue;
        }

        // Parse block time and floor to hour
        const blockTime = parseBlockTime(tx.block_time);
        const tsHour = floorToHourUTC(blockTime);

        // Update hourly transaction count
        await upsertHourlyTxCount(dappId, this.chainId, tsHour, 1);

        // Add user address to hourly users
        await insertHourlyUserOnce(dappId, this.chainId, tsHour, tx.from);

        // Track touched hours
        result.hoursTouched.add(tsHour);
        result.transactionsProcessed++;

        // Log progress every 100 transactions
        if (result.transactionsProcessed % 100 === 0) {
          console.log(`Processed ${result.transactionsProcessed} transactions...`);
        }
      }
    } catch (error) {
      console.error(`Error processing transactions for address ${address}:`, error);
      throw error;
    }
  }

  /**
   * Refresh unique users count for all touched hours
   */
  private async refreshTouchedHours(dappId: number, hoursTouched: Set<Date>): Promise<void> {
    console.log(`Refreshing unique users for ${hoursTouched.size} hours`);

    for (const tsHour of hoursTouched) {
      try {
        await refreshHourlyUnique(dappId, this.chainId, tsHour);
      } catch (error) {
        console.error(`Failed to refresh unique users for hour ${tsHour}:`, error);
      }
    }
  }

  /**
   * Get dApp statistics for a time window
   */
  async getDappStats(
    dappIds: number[],
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ dapp_id: number; tx_count: number; unique_users: number }>> {
    try {
      return await getDappStatsInWindow(dappIds, startTime, endTime);
    } catch (error) {
      console.error('Failed to get dApp stats:', error);
      throw error;
    }
  }

  /**
   * Get sparkline data for dApps
   */
  async getSparklineData(
    dappIds: number[],
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ dapp_id: number; ts_hour: Date; tx_count: number }>> {
    try {
      return await getDappSparkline(dappIds, startTime, endTime);
    } catch (error) {
      console.error('Failed to get sparkline data:', error);
      throw error;
    }
  }

  /**
   * Get aggregated stats for multiple dApps
   */
  async getAggregatedStats(
    dappIds: number[],
    startTime: Date,
    endTime: Date
  ): Promise<{
    totalTransactions: number;
    totalUniqueUsers: number;
    dappBreakdown: Array<{ dapp_id: number; tx_count: number; unique_users: number }>;
  }> {
    try {
      const stats = await this.getDappStats(dappIds, startTime, endTime);
      
      const totalTransactions = stats.reduce((sum, stat) => sum + stat.tx_count, 0);
      const totalUniqueUsers = stats.reduce((sum, stat) => sum + stat.unique_users, 0);

      return {
        totalTransactions,
        totalUniqueUsers,
        dappBreakdown: stats
      };
    } catch (error) {
      console.error('Failed to get aggregated stats:', error);
      throw error;
    }
  }

  /**
   * Set chain ID
   */
  setChainId(chainId: number): void {
    this.chainId = chainId;
  }

  /**
   * Get chain ID
   */
  getChainId(): number {
    return this.chainId;
  }
}

// Export singleton instance
export const statsRepository = new StatsRepository();
