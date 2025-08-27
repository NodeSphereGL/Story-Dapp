#!/usr/bin/env tsx

import { pool } from '../src/db/mysql';

/**
 * Script to verify percentage calculations manually
 * This helps debug why the API is returning strange percentage changes
 */
class CalculationVerifier {
  
  async verify(): Promise<void> {
    console.log('🔍 Starting calculation verification...');
    
    try {
      // Get all dApps
      const dapps = await this.getDapps();
      
      for (const dapp of dapps) {
        console.log(`\n📊 Verifying calculations for: ${dapp.title} (${dapp.slug})`);
        await this.verifyDappCalculations(dapp);
      }
      
      console.log('\n✅ Verification completed!');
      
    } catch (error) {
      console.error('❌ Verification failed:', error);
      throw error;
    }
  }

  private async getDapps(): Promise<Array<{ id: number; title: string; slug: string }>> {
    const [rows] = await pool.execute(`
      SELECT id, title, slug FROM dapps WHERE status = 1 ORDER BY priority ASC, id ASC
    `);
    return rows as Array<{ id: number; title: string; slug: string }>;
  }

  private async verifyDappCalculations(dapp: { id: number; title: string; slug: string }): Promise<void> {
    try {
      // Calculate time windows (same logic as API)
      const now = new Date();
      const t0 = this.floorToHourUTC(now);
      
      const t24h = new Date(t0.getTime() - 24 * 60 * 60 * 1000);
      const t7d = new Date(t0.getTime() - 7 * 24 * 60 * 60 * 1000);
      const t30d = new Date(t0.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const t24hPrev = new Date(t24h.getTime() - 24 * 60 * 60 * 1000);
      const t7dPrev = new Date(t7d.getTime() - 7 * 24 * 60 * 60 * 1000);
      const t30dPrev = new Date(t30d.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      console.log(`   ⏰ Time windows:`);
      console.log(`      24H: ${t24h.toISOString()} → ${t0.toISOString()}`);
      console.log(`      24H Prev: ${t24hPrev.toISOString()} → ${t24h.toISOString()}`);
      console.log(`      7D: ${t7d.toISOString()} → ${t0.toISOString()}`);
      console.log(`      7D Prev: ${t7dPrev.toISOString()} → ${t7d.toISOString()}`);
      console.log(`      30D: ${t30d.toISOString()} → ${t0.toISOString()}`);
      console.log(`      30D Prev: ${t30dPrev.toISOString()} → ${t30d.toISOString()}`);
      
      // Get transaction counts for each period
      const stats24h = await this.getDappStats(dapp.id, t24h, t0);
      const stats24hPrev = await this.getDappStats(dapp.id, t24hPrev, t24h);
      const stats7d = await this.getDappStats(dapp.id, t7d, t0);
      const stats7dPrev = await this.getDappStats(dapp.id, t7dPrev, t7d);
      const stats30d = await this.getDappStats(dapp.id, t30d, t0);
      const stats30dPrev = await this.getDappStats(dapp.id, t30dPrev, t30d);
      
      console.log(`\n   📊 Transaction counts:`);
      console.log(`      24H Current: ${stats24h.tx_count}, Previous: ${stats24hPrev.tx_count}`);
      console.log(`      7D Current: ${stats7d.tx_count}, Previous: ${stats7dPrev.tx_count}`);
      console.log(`      30D Current: ${stats30d.tx_count}, Previous: ${stats30dPrev.tx_count}`);
      
      // Calculate percentage changes manually
      const change24h = this.calculateChange(stats24h.tx_count, stats24hPrev.tx_count);
      const change7d = this.calculateChange(stats7d.tx_count, stats7dPrev.tx_count);
      const change30d = this.calculateChange(stats30d.tx_count, stats30dPrev.tx_count);
      
      console.log(`\n   📈 Manual calculations:`);
      console.log(`      24H Change: ${change24h}`);
      console.log(`      7D Change: ${change7d}`);
      console.log(`      30D Change: ${change30d}`);
      
      // Get user counts for each period
      const users24h = await this.getDappUsers(dapp.id, t24h, t0);
      const users24hPrev = await this.getDappUsers(dapp.id, t24hPrev, t24h);
      const users7d = await this.getDappUsers(dapp.id, t7d, t0);
      const users7dPrev = await this.getDappUsers(dapp.id, t7dPrev, t7d);
      const users30d = await this.getDappUsers(dapp.id, t30d, t0);
      const users30dPrev = await this.getDappUsers(dapp.id, t30dPrev, t30d);
      
      console.log(`\n   👥 User counts:`);
      console.log(`      24H Current: ${users24h}, Previous: ${users24hPrev}`);
      console.log(`      7D Current: ${users7d}, Previous: ${users7dPrev}`);
      console.log(`      30D Current: ${users30d}, Previous: ${users30dPrev}`);
      
      // Calculate user percentage changes
      const userChange24h = this.calculateChange(users24h, users24hPrev);
      const userChange7d = this.calculateChange(users7d, users7dPrev);
      const userChange30d = this.calculateChange(users30d, users30dPrev);
      
      console.log(`\n   📈 User change calculations:`);
      console.log(`      24H Change: ${userChange24h}`);
      console.log(`      7D Change: ${userChange7d}`);
      console.log(`      30D Change: ${userChange30d}`);
      
      // Show hourly breakdown for debugging
      await this.showHourlyBreakdown(dapp.id, t24h, t0);
      
    } catch (error) {
      console.error(`   ❌ Error verifying ${dapp.title}:`, error);
    }
  }

  private async getDappStats(dappId: number, startTime: Date, endTime: Date): Promise<{ tx_count: number; unique_users: number }> {
    const [rows] = await pool.execute(`
      SELECT 
        COALESCE(SUM(tx_count), 0) as tx_count,
        COALESCE(SUM(unique_users), 0) as unique_users
      FROM dapp_stats_hourly 
      WHERE dapp_id = ? AND chain_id = 1 
        AND ts_hour >= ? AND ts_hour < ?
    `, [dappId, startTime, endTime]);
    
    const result = (rows as any[])[0];
    return {
      tx_count: result.tx_count || 0,
      unique_users: result.unique_users || 0
    };
  }

  private async getDappUsers(dappId: number, startTime: Date, endTime: Date): Promise<number> {
    const [rows] = await pool.execute(`
      SELECT COUNT(DISTINCT user_address) as unique_users
      FROM dapp_hourly_users 
      WHERE dapp_id = ? AND chain_id = 1 
        AND ts_hour >= ? AND ts_hour < ?
    `, [dappId, startTime, endTime]);
    
    return (rows as any[])[0].unique_users || 0;
  }

  private calculateChange(current: number, previous: number): string {
    if (previous === 0) {
      return current > 0 ? '100%' : '0%';
    }
    
    const percentage = ((current - previous) / previous) * 100;
    const formatted = percentage.toFixed(2);
    return `${formatted.replace(/\.00$/, '')}%`;
  }

  private floorToHourUTC(date: Date): Date {
    const utc = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    utc.setMinutes(0, 0, 0);
    return utc;
  }

  private async showHourlyBreakdown(dappId: number, startTime: Date, endTime: Date): Promise<void> {
    console.log(`\n   🕐 Hourly breakdown (last 24h):`);
    
    const [rows] = await pool.execute(`
      SELECT 
        ts_hour,
        tx_count,
        unique_users
      FROM dapp_stats_hourly 
      WHERE dapp_id = ? AND chain_id = 1 
        AND ts_hour >= ? AND ts_hour < ?
      ORDER BY ts_hour DESC
      LIMIT 24
    `, [dappId, startTime, endTime]);
    
    const hours = rows as Array<{ ts_hour: Date; tx_count: number; unique_users: number }>;
    
    if (hours.length === 0) {
      console.log(`      No hourly data found`);
      return;
    }
    
    hours.forEach(hour => {
      const timeStr = hour.ts_hour.toISOString().substring(11, 16); // HH:MM
      console.log(`      ${timeStr}: ${hour.tx_count} txs, ${hour.unique_users} users`);
    });
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const verifier = new CalculationVerifier();
  
  try {
    await verifier.verify();
    console.log('\n🎉 Verification completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
