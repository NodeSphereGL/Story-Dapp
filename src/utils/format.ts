/**
 * Formatting utilities for Story Protocol dApp stats
 */

export type ChangeType = 'positive' | 'negative' | 'neutral';

export interface ChangeData {
  value: number;
  formatted: string;
  change_type: ChangeType;
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentChange(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatLargeNumber(num: number): string {
  if (num < 1000) return num.toString();
  if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
  if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
  return (num / 1000000000).toFixed(1) + 'B';
}

/**
 * Determine change type based on percentage
 */
export function getChangeType(percentChange: number): ChangeType {
  if (percentChange > 0) return 'positive';
  if (percentChange < 0) return 'negative';
  return 'neutral';
}

/**
 * Format percentage change with sign
 */
export function formatPercentChange(percentChange: number): string {
  const sign = percentChange >= 0 ? '+' : '';
  return `${sign}${percentChange.toFixed(1)}%`;
}

/**
 * Create change data object for API response
 */
export function createChangeData(current: number, previous: number): ChangeData {
  const percentChange = calculatePercentChange(current, previous);
  return {
    value: percentChange,
    formatted: formatPercentChange(percentChange),
    change_type: getChangeType(percentChange)
  };
}

/**
 * Determine trend from sparkline data
 */
export function getTrendFromSparkline(data: number[]): 'up' | 'down' | 'stable' {
  if (data.length < 2) return 'stable';
  
  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  
  if (change > 5) return 'up';
  if (change < -5) return 'down';
  return 'stable';
}

/**
 * Format transaction count for display
 */
export function formatTransactionCount(count: number): string {
  return formatLargeNumber(count);
}

/**
 * Format user count for display
 */
export function formatUserCount(count: number): string {
  return formatLargeNumber(count);
}

/**
 * Round number to specified decimal places
 */
export function roundToDecimal(num: number, decimals: number = 2): number {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Format currency value (for future use)
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
