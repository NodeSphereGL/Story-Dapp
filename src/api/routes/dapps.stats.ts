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
  users: {
    current: number;
    formatted: string;
    change_24h: number;
    change_7d: number;
    change_30d: number;
    change_type: 'positive' | 'negative' | 'neutral';
  };
  transactions: {
    current_24h: number;
    current_7d: number;
    current_30d: number;
    formatted: string;
    change_24h: number;
    change_7d: number;
    change_30d: number;
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
    
    // Get dApp IDs
    const dappIds: number[] = [];
    const dappNames: string[] = [];
    
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
        
        // Get sparkline for this dApp
        const dappSparkline = sparklineData
          .filter(s => s.dapp_id === dappId)
          .map(s => s.tx_count);
        
        const sparklineTrend = include_sparklines ? getTrendFromSparkline(dappSparkline) : undefined;

        return {
          name,
          users: {
            current: current?.unique_users || 0,
            formatted: (current?.unique_users || 0).toString(),
            change_24h: 0, // TODO: Implement 24h change calculation
            change_7d: 0,  // TODO: Implement 7d change calculation
            change_30d: 0, // TODO: Implement 30d change calculation
            change_type: 'neutral' as const
          },
          transactions: {
            current_24h: current?.tx_count || 0,
            current_7d: 0,  // TODO: Implement 7d calculation
            current_30d: 0, // TODO: Implement 30d calculation
            formatted: (current?.tx_count || 0).toString(),
            change_24h: createChangeData(
              current?.tx_count || 0,
              previous?.tx_count || 0
            ).value,
            change_7d: 0,   // TODO: Implement 7d change calculation
            change_30d: 0,  // TODO: Implement 30d change calculation
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
