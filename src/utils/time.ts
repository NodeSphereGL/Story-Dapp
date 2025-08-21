/**
 * Time utility functions for Story Protocol dApp stats
 * All times are handled in UTC
 */

export type Timeframe = '24H' | '7D' | '30D';

export interface TimeWindow {
  t0: Date;      // Current UTC hour (floored)
  t1: Date;      // Start of current window
  tPrev1: Date;  // Start of previous window
}

/**
 * Floor a date to the start of the UTC hour
 */
export function floorToHourUTC(date: Date): Date {
  const floored = new Date(date);
  floored.setUTCMinutes(0, 0, 0);
  return floored;
}

/**
 * Calculate time window boundaries for a given timeframe
 */
export function calculateWindowBounds(timeframe: Timeframe): TimeWindow {
  const t0 = floorToHourUTC(new Date());
  
  let hours: number;
  switch (timeframe) {
    case '24H':
      hours = 24;
      break;
    case '7D':
      hours = 7 * 24;
      break;
    case '30D':
      hours = 30 * 24;
      break;
    default:
      throw new Error(`Invalid timeframe: ${timeframe}`);
  }
  
  const t1 = new Date(t0.getTime() - hours * 3600 * 1000);
  const tPrev1 = new Date(t1.getTime() - hours * 3600 * 1000);
  
  return { t0, t1, tPrev1 };
}

/**
 * Parse block time from Storyscan API response
 * Expects ISO string or Unix timestamp
 */
export function parseBlockTime(blockTime: string | number): Date {
  if (typeof blockTime === 'string') {
    return new Date(blockTime);
  } else {
    // Unix timestamp in seconds
    return new Date(blockTime * 1000);
  }
}

/**
 * Check if a date is within a time window
 */
export function isWithinWindow(date: Date, start: Date, end: Date): boolean {
  return date >= start && date < end;
}

/**
 * Format date for display (UTC)
 */
export function formatDateUTC(date: Date): string {
  return date.toISOString();
}

/**
 * Get hours difference between two dates
 */
export function getHoursDifference(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60));
}

/**
 * Get current UTC hour as a Date object
 */
export function getCurrentUTCHour(): Date {
  return floorToHourUTC(new Date());
}

/**
 * Calculate cutoff time for ingestion (now - hoursBack)
 */
export function calculateIngestionCutoff(hoursBack: number): Date {
  const now = new Date();
  return new Date(now.getTime() - hoursBack * 3600 * 1000);
}
