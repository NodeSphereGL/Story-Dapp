import { Request, Response } from 'express';
import { z } from 'zod';
import { calculateWindowBounds, Timeframe } from '../../utils/time';
import { createChangeData, getTrendFromSparkline } from '../../utils/format';
import { statsRepository } from '../../repos/stats';
import { dappRepository } from '../../repos/dapps';

// Request validation schema
const statsRequestSchema = z.object({
  timeframe: z.enum(['24H', '7D', '30D']),
  dapp_names: z.array(z.string()).min(1).max(10),
  include_sparklines: z.boolean().optional().default(false)
});

export type StatsRequest = z.infer<typeof statsRequestSchema>;

// Response interfaces
interface DappStatsResponse {
  name: string;
  all_time_txs: number;
  users: {
    current: number;
    formatted: string;
    current_24h: number;
    current_7d: number;
    current_30d: number;
    change_24h: string;
    change_7d: string;
    change_30d: string;
    change_type: 'positive' | 'negative' | 'neutral';
  };
  transactions: {
    current_24h: number;
    current_7d: number;
    current_30d: number;
    formatted: string;
    change_24h: string;
    change_7d: string;
    change_30d: string;
    change_type: 'positive' | 'negative' | 'neutral';
  };
  sparkline_data: number[] | undefined;
  sparkline_trend: 'up' | 'down' | 'stable' | undefined;
  last_updated: string;
}

interface ApiResponse {
  success: boolean;
  data: DappStatsResponse[];
  metadata: {
    total_dapps: number;
    last_crawl: string;
    data_sources: string[];
  };
}

/**
 * GET /api/dapps/stats endpoint
 */
export async function getDappStats(req: Request, res: Response): Promise<void> {
  try {
    // Parse and validate request
    const body = req.body;
    const validation = statsRequestSchema.safeParse(body);
    
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format()
      });
      return;
    }

    const { timeframe, dapp_names, include_sparklines } = validation.data;
    
    console.log(`📊 Processing stats request for ${dapp_names.length} dApps, timeframe: ${timeframe}`);

    // Calculate time windows
    const { t0, t1, tPrev1 } = calculateWindowBounds(timeframe);
    
    // Get dApp IDs and all-time transaction counts
    const dappIds: number[] = [];
    const dappNames: string[] = [];
    const dappAllTimeTxs: number[] = [];
    
    for (const dappName of dapp_names) {
      try {
        // Try to find dApp by slug first, then by name
        let dapp = await dappRepository.getDapp(dappName);
        if (!dapp) {
          // Try with slugified name
          const slug = dappName.toLowerCase().replace(/\s+/g, '-');
          dapp = await dappRepository.getDapp(slug);
        }
        
        if (dapp) {
          dappIds.push(dapp.id);
          dappNames.push(dapp.title);
          dappAllTimeTxs.push(dapp.all_time_txs || 0);
        } else {
          console.warn(`dApp not found: ${dappName}`);
        }
      } catch (error) {
        console.error(`Error looking up dApp ${dappName}:`, error);
      }
    }

    if (dappIds.length === 0) {
      res.status(404).json({
        success: false,
        error: 'No valid dApps found'
      });
      return;
    }

    // Get current window stats
    const currentStats = await statsRepository.getDappStats(dappIds, t1, t0);
    
    // Get previous window stats for comparison
    const previousStats = await statsRepository.getDappStats(dappIds, tPrev1, t1);
    
    // Use t0 (floored to hour UTC) to build all windows for consistency with hourly buckets
    const now = t0;
    
    // Current periods
    const t24h = new Date(t0.getTime() - 24 * 60 * 60 * 1000);        // Last 24h
    const t7d = new Date(t0.getTime() - 7 * 24 * 60 * 60 * 1000);      // Last 7d  
    const t30d = new Date(t0.getTime() - 30 * 24 * 60 * 60 * 1000);    // Last 30d
    
    // Previous equal periods for comparison
    const t24hPrev = new Date(t24h.getTime() - 24 * 60 * 60 * 1000);   // 24h before t24h (previous 24h)
    const t7dPrev = new Date(t7d.getTime() - 7 * 24 * 60 * 60 * 1000); // 7d before t7d (previous 7d)
    const t30dPrev = new Date(t30d.getTime() - 30 * 24 * 60 * 60 * 1000); // 30d before t30d (previous 30d)
    
    // Get stats for current periods
    const stats24h = await statsRepository.getDappStats(dappIds, t24h, now);
    const stats7d = await statsRepository.getDappStats(dappIds, t7d, now);
    const stats30d = await statsRepository.getDappStats(dappIds, t30d, now);
    
    // Get stats for previous equal periods to calculate changes
    const stats24hPrev = await statsRepository.getDappStats(dappIds, t24hPrev, t24h);
    const stats7dPrev = await statsRepository.getDappStats(dappIds, t7dPrev, t7d);
    const stats30dPrev = await statsRepository.getDappStats(dappIds, t30dPrev, t30d);
    
    // Log time windows for debugging
    console.log('🕐 Time windows for change calculations:');
    console.log(`   24H: Current ${t24h.toISOString()} → ${now.toISOString()}, Previous ${t24hPrev.toISOString()} → ${t24h.toISOString()}`);
    console.log(`   7D:  Current ${t7d.toISOString()} → ${now.toISOString()}, Previous ${t7dPrev.toISOString()} → ${t7d.toISOString()}`);
    console.log(`   30D: Current ${t30d.toISOString()} → ${now.toISOString()}, Previous ${t30dPrev.toISOString()} → ${t30d.toISOString()}`);
    
    // Get sparkline data if requested
    let sparklineData: any[] = [];
    if (include_sparklines) {
      sparklineData = await statsRepository.getSparklineData(dappIds, t1, t0);
    }

    // Build response
    const response: ApiResponse = {
      success: true,
      data: dappNames.map((name, index) => {
        const dappId = dappIds[index];
        const current = currentStats.find(s => s.dapp_id === dappId);
        const previous = previousStats.find(s => s.dapp_id === dappId);
        
        // Get stats for different time periods
        const current24h = stats24h.find(s => s.dapp_id === dappId);
        const current7d = stats7d.find(s => s.dapp_id === dappId);
        const current30d = stats30d.find(s => s.dapp_id === dappId);
        
        // Get stats for previous periods to calculate changes
        const prev24h = stats24hPrev.find(s => s.dapp_id === dappId);
        const prev7d = stats7dPrev.find(s => s.dapp_id === dappId);
        const prev30d = stats30dPrev.find(s => s.dapp_id === dappId);
        
        // Helper function to calculate meaningful change percentages
                  const calculateChange = (current: number, previous: number): string => {
            if (previous === 0) {
              return current > 0 ? '100%' : '0%'; // If no previous data, show 100% for any activity
            }
            if (current === 0) {
              return previous > 0 ? '-100%' : '0%'; // If no current data, show -100% for any previous activity
            }
            const percentage = ((current - previous) / previous) * 100;
            const formatted = percentage.toFixed(2);
            // Remove .00 if decimal is zero
            return `${formatted.replace(/\.00$/, '')}%`;
          };
        

        
        // Format numbers like Facebook/X (27.2K, 1.5M, etc.)
        const formatNumber = (num: number): string => {
          if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
          }
          if (num >= 1000) {
            return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
          }
          return num.toString();
        };
        
        // Get sparkline for this dApp
        const dappSparkline = sparklineData
          .filter(s => s.dapp_id === dappId)
          .map(s => s.tx_count);
        
        const sparklineTrend = include_sparklines ? getTrendFromSparkline(dappSparkline) : undefined;

        return {
          name,
          all_time_txs: dappAllTimeTxs[index] || 0,
          users: {
            current: current?.unique_users || 0,
            formatted: formatNumber(current?.unique_users || 0),
            current_24h: current24h?.unique_users || 0,
            current_7d: current7d?.unique_users || 0,
            current_30d: current30d?.unique_users || 0,
            change_24h: calculateChange(
              current24h?.unique_users || 0,
              prev24h?.unique_users || 0
            ),
            change_7d: calculateChange(
              current7d?.unique_users || 0,
              prev7d?.unique_users || 0
            ),
            change_30d: calculateChange(
              current30d?.unique_users || 0,
              prev30d?.unique_users || 0
            ),
            change_type: createChangeData(
              current?.unique_users || 0,
              previous?.unique_users || 0
            ).change_type
          },
                      transactions: {
              current_24h: current24h?.tx_count || 0,
              current_7d: current7d?.tx_count || 0,
              current_30d: current30d?.tx_count || 0,
              formatted: formatNumber(current?.tx_count || 0),
            change_24h: calculateChange(
              current24h?.tx_count || 0,
              prev24h?.tx_count || 0
            ),
            change_7d: calculateChange(
              current7d?.tx_count || 0,
              prev7d?.tx_count || 0
            ),
            change_30d: calculateChange(
              current30d?.tx_count || 0,
              prev30d?.tx_count || 0
            ),
            change_type: createChangeData(
              current?.tx_count || 0,
              previous?.tx_count || 0
            ).change_type
          },
          sparkline_data: include_sparklines ? dappSparkline : undefined,
          sparkline_trend: sparklineTrend,
          last_updated: new Date().toISOString()
        };
      }),
      metadata: {
        total_dapps: dappIds.length,
        last_crawl: new Date().toISOString(),
        data_sources: ['storyscan']
      }
    };

    res.json(response);
    
  } catch (error) {
    console.error('Error processing dApp stats request:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/dapps/stats endpoint (alternative for GET requests)
 */
export async function getDappStatsGet(req: Request, res: Response): Promise<void> {
  try {
    // Convert query parameters to body format for validation
    const timeframe = req.query['timeframe'];
    const dapp_names = req.query['dapp_names'];
    const include_sparklines = req.query['include_sparklines'];
    
    // Validate required parameters
    if (!timeframe || !dapp_names) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters: timeframe and dapp_names'
      });
      return;
    }
    
    const body = {
      timeframe: timeframe as Timeframe,
      dapp_names: Array.isArray(dapp_names) 
        ? dapp_names 
        : [dapp_names as string],
      include_sparklines: include_sparklines === 'true'
    };
    
    // Set body and call the main handler
    req.body = body;
    await getDappStats(req, res);
  } catch (error) {
    console.error('Error in getDappStatsGet:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
