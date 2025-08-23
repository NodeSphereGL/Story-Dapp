import * as cron from 'node-cron';
import { ingestionConfig } from '../config/env';
import { ingestMultipleDapps } from './ingest';
import { pool } from '../db/mysql';

// Default dApps to track (these will be overridden by database data)
const DEFAULT_DAPPS = [
  { slug: 'storyhunt', title: 'StoryHunt' },
  { slug: 'verio', title: 'Verio' },
  { slug: 'piperx', title: 'PiperX' },
  // Add more dApps as needed
];

export interface SchedulerConfig {
  dapps?: Array<{ slug: string; title: string }>;
  cronExpression?: string;
  enabled?: boolean;
}

/**
 * Scheduler for running ingestion jobs on a schedule
 */
export class IngestionScheduler {
  private config: SchedulerConfig;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  /**
   * Fetch active dApps from database
   */
  private async fetchActiveDapps(): Promise<Array<{ slug: string; title: string }>> {
    try {
      const [rows] = await pool.execute(`
        SELECT slug, title 
        FROM dapps 
        WHERE status = 1 
        ORDER BY priority ASC, id ASC
      `);
      
      const dapps = rows as Array<{ slug: string; title: string }>;
      console.log(`📊 Fetched ${dapps.length} active dApps from database`);
      
      if (dapps.length === 0) {
        console.log('⚠️  No active dApps found in database, using defaults');
        return DEFAULT_DAPPS;
      }
      
      return dapps;
    } catch (error) {
      console.error('❌ Error fetching dApps from database:', error);
      console.log('⚠️  Falling back to default dApps');
      return DEFAULT_DAPPS;
    }
  }

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      dapps: DEFAULT_DAPPS,
      cronExpression: `*/${ingestionConfig.intervalMinutes} * * * *`, // Every N minutes
      enabled: true,
      ...config
    };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('⏸️  Scheduler is disabled');
      return;
    }

    if (this.cronJob) {
      console.log('⚠️  Scheduler is already running');
      return;
    }

    console.log(`🚀 Starting ingestion scheduler with cron: ${this.config.cronExpression}`);
    console.log(`📱 Tracking ${this.config.dapps!.length} dApps`);

    // Create cron job
    this.cronJob = cron.schedule(this.config.cronExpression!, async () => {
      await this.runScheduledIngestion();
    }, {
      timezone: 'UTC'
    });

    // Run initial ingestion after a short delay
    setTimeout(async () => {
      console.log('🔄 Running initial ingestion...');
      await this.runScheduledIngestion();
    }, 10000); // 10 seconds delay

    console.log('✅ Scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob.destroy();
      this.cronJob = null;
      console.log('⏹️  Scheduler stopped');
    }
  }

  /**
   * Run the scheduled ingestion job
   */
  private async runScheduledIngestion(): Promise<void> {
    if (this.isRunning) {
      console.log('⏳ Ingestion already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log(`🔄 Starting scheduled ingestion at ${new Date().toISOString()}`);
      
      // Fetch active dApps from database
      const activeDapps = await this.fetchActiveDapps();
      
      if (activeDapps.length === 0) {
        console.log('⚠️  No dApps to process, skipping ingestion');
        return;
      }
      
      console.log(`📱 Processing ${activeDapps.length} active dApps: ${activeDapps.map(d => d.slug).join(', ')}`);
      
      const results = await ingestMultipleDapps(activeDapps);
      
      const successCount = results.filter(r => r.success).length;
      const totalTransactions = results.reduce((sum, r) => sum + r.transactionsProcessed, 0);
      
      console.log(`✅ Scheduled ingestion completed: ${successCount}/${results.length} dApps successful`);
      console.log(`📊 Total transactions processed: ${totalTransactions}`);
      
    } catch (error) {
      console.error('❌ Scheduled ingestion failed:', error);
    } finally {
      this.isRunning = false;
      const duration = Date.now() - startTime;
      console.log(`⏱️  Scheduled ingestion took ${duration}ms`);
    }
  }

  /**
   * Manually trigger ingestion
   */
  async triggerIngestion(): Promise<void> {
    console.log('🔄 Manually triggering ingestion...');
    await this.runScheduledIngestion();
  }

  /**
   * Manually trigger ingestion for specific dApps
   */
  async triggerIngestionForDapps(dappSlugs: string[]): Promise<void> {
    console.log(`🔄 Manually triggering ingestion for dApps: ${dappSlugs.join(', ')}`);
    
    try {
      // Fetch specific dApps from database
      const [rows] = await pool.execute(`
        SELECT slug, title 
        FROM dapps 
        WHERE status = 1 AND slug IN (${dappSlugs.map(() => '?').join(',')})
        ORDER BY priority ASC, id ASC
      `, dappSlugs);
      
      const dapps = rows as Array<{ slug: string; title: string }>;
      
      if (dapps.length === 0) {
        console.log('⚠️  No matching active dApps found');
        return;
      }
      
      console.log(`📱 Processing ${dapps.length} dApps: ${dapps.map(d => d.slug).join(', ')}`);
      
      const results = await ingestMultipleDapps(dapps);
      const successCount = results.filter(r => r.success).length;
      const totalTransactions = results.reduce((sum, r) => sum + r.transactionsProcessed, 0);
      
      console.log(`✅ Manual ingestion completed: ${successCount}/${results.length} dApps successful`);
      console.log(`📊 Total transactions processed: ${totalTransactions}`);
      
    } catch (error) {
      console.error('❌ Manual ingestion failed:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    enabled: boolean;
    cronExpression: string;
    dappsCount: number;
    isCurrentlyRunning: boolean;
  } {
    return {
      running: !!this.cronJob,
      enabled: this.config.enabled!,
      cronExpression: this.config.cronExpression!,
      dappsCount: this.config.dapps!.length,
      isCurrentlyRunning: this.isRunning
    };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️  Scheduler configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const ingestionScheduler = new IngestionScheduler();

// Export convenience functions
export function startScheduler(config?: SchedulerConfig): void {
  if (config) {
    ingestionScheduler.updateConfig(config);
  }
  ingestionScheduler.start();
}

export function stopScheduler(): void {
  ingestionScheduler.stop();
}

export async function getSchedulerStatus() {
  return await ingestionScheduler.getStatus();
}

export async function triggerManualIngestion(): Promise<void> {
  await ingestionScheduler.triggerIngestion();
}

export async function triggerIngestionForDapps(dappSlugs: string[]): Promise<void> {
  await ingestionScheduler.triggerIngestionForDapps(dappSlugs);
}
