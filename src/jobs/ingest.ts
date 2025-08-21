import { dappRepository } from '../repos/dapps';
import { statsRepository } from '../repos/stats';
import { calculateIngestionCutoff } from '../utils/time';
import { ingestionConfig } from '../config/env';

export interface IngestionJobConfig {
  dappSlug: string;
  dappName: string;
  hoursBack?: number;
}

export interface IngestionJobResult {
  success: boolean;
  dappId: number;
  addressesProcessed: number;
  transactionsProcessed: number;
  hoursTouched: number;
  error?: string;
  duration: number;
}

/**
 * Ingestion job for processing dApp data
 */
export class IngestionJob {
  private config: IngestionJobConfig;

  constructor(config: IngestionJobConfig) {
    this.config = {
      hoursBack: ingestionConfig.hoursBack,
      ...config
    };
  }

  /**
   * Execute the ingestion job
   */
  async execute(): Promise<IngestionJobResult> {
    const startTime = Date.now();
    const result: IngestionJobResult = {
      success: false,
      dappId: 0,
      addressesProcessed: 0,
      transactionsProcessed: 0,
      hoursTouched: 0,
      duration: 0
    };

    try {
      console.log(`🚀 Starting ingestion job for ${this.config.dappSlug}`);
      
      // Step 1: Get or create dApp
      const dappId = await dappRepository.getOrCreateDapp(
        this.config.dappSlug,
        this.config.dappName
      );
      result.dappId = dappId;

      // Step 2: Sync dApp addresses from Storyscan
      await dappRepository.syncDappAddresses(dappId, this.config.dappSlug);

      // Step 3: Get dApp addresses
      const addresses = await dappRepository.getDappAddresses(dappId);
      const addressHashes = addresses.map(addr => addr.address_hash);
      
      if (addressHashes.length === 0) {
        throw new Error(`No addresses found for dApp ${this.config.dappSlug}`);
      }

      // Step 4: Calculate cutoff time
      const cutoffTime = calculateIngestionCutoff(this.config.hoursBack!);
      console.log(`Ingestion cutoff time: ${cutoffTime.toISOString()}`);

      // Step 5: Ingest transactions and update stats
      const statsResult = await statsRepository.ingestDappTransactions(
        dappId,
        addressHashes,
        cutoffTime
      );

      // Update result with stats
      result.addressesProcessed = statsResult.addressesProcessed;
      result.transactionsProcessed = statsResult.transactionsProcessed;
      result.hoursTouched = statsResult.hoursTouched.size;
      result.success = true;

      console.log(`✅ Ingestion job completed successfully for ${this.config.dappSlug}`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Ingestion job failed for ${this.config.dappSlug}:`, errorMessage);
      result.error = errorMessage;
      result.success = false;
    } finally {
      result.duration = Date.now() - startTime;
      console.log(`⏱️  Ingestion job took ${result.duration}ms for ${this.config.dappSlug}`);
    }

    return result;
  }

  /**
   * Execute ingestion for multiple dApps
   */
  static async executeMultiple(configs: IngestionJobConfig[]): Promise<IngestionJobResult[]> {
    console.log(`🚀 Starting batch ingestion for ${configs.length} dApps`);
    
    const results: IngestionJobResult[] = [];
    
    for (const config of configs) {
      try {
        const job = new IngestionJob(config);
        const result = await job.execute();
        results.push(result);
        
        // Small delay between dApps
        if (configs.indexOf(config) < configs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`Failed to execute ingestion job for ${config.dappSlug}:`, error);
        results.push({
          success: false,
          dappId: 0,
          addressesProcessed: 0,
          transactionsProcessed: 0,
          hoursTouched: 0,
          error: error instanceof Error ? error.message : String(error),
          duration: 0
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Batch ingestion completed: ${successCount}/${configs.length} successful`);
    
    return results;
  }

  /**
   * Get job configuration
   */
  getConfig(): IngestionJobConfig {
    return { ...this.config };
  }
}

// Export convenience functions
export async function ingestDapp(slug: string, name: string, hoursBack?: number): Promise<IngestionJobResult> {
  const job = new IngestionJob({ dappSlug: slug, dappName: name, hoursBack });
  return job.execute();
}

export async function ingestMultipleDapps(dapps: Array<{ slug: string; name: string }>): Promise<IngestionJobResult[]> {
  const configs = dapps.map(dapp => ({ dappSlug: dapp.slug, dappName: dapp.name }));
  return IngestionJob.executeMultiple(configs);
}
