import axios, { AxiosInstance } from 'axios';
import Bottleneck from 'bottleneck';
import { storyscanConfig } from '../config/env';

export interface StoryscanAddress {
  address_hash: string;
  label: string;
  address_type: string;
}

export interface StoryscanTransaction {
  tx_hash: string;
  block_number: number;
  block_time: string;
  from: string;
  to: string;
  status: string;
  value: string;
  gas_used: string;
  gas_price: string;
}

export interface StoryscanTransactionResponse {
  items: StoryscanTransaction[];
  next_page_params?: string;
}

export interface StoryscanMetadataResponse {
  addresses: StoryscanAddress[];
}

/**
 * Storyscan API client with rate limiting and retry logic
 */
export class StoryscanClient {
  private client: AxiosInstance;
  private limiter: Bottleneck;

  constructor() {
    this.client = axios.create({
      baseURL: storyscanConfig.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'Story-DApp-Stats/1.0.0',
        'Accept': 'application/json',
      },
    });

    // Rate limiting: 8 requests per second (120ms between requests)
    this.limiter = new Bottleneck({
      minTime: storyscanConfig.rateLimitMs,
      maxConcurrent: 1,
    });

    // Add retry logic for failed requests
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status >= 500 || error.response?.status === 429) {
          // Retry with exponential backoff
          const retryCount = error.config.retryCount || 0;
          if (retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            error.config.retryCount = retryCount + 1;
            return this.client.request(error.config);
          }
        }
        throw error;
      }
    );
  }

  /**
   * Get addresses for a dApp by slug
   */
  async getAddressesBySlug(slug: string, tagType: string = 'protocol'): Promise<StoryscanAddress[]> {
    try {
      const response = await this.limiter.schedule(() =>
        this.client.get<StoryscanMetadataResponse>(`/api/v1/metadata/${slug}`, {
          params: { tag_type: tagType }
        })
      );
      
      return response.data.addresses || [];
    } catch (error) {
      console.error(`Failed to fetch addresses for ${slug}:`, error);
      throw new Error(`Failed to fetch addresses for ${slug}: ${error}`);
    }
  }

  /**
   * Get transactions for a specific address with pagination
   */
  async getAddressTransactions(
    address: string,
    pageParams?: string
  ): Promise<StoryscanTransactionResponse> {
    try {
      const params: any = {};
      if (pageParams) {
        params.next_page_params = pageParams;
      }

      const response = await this.limiter.schedule(() =>
        this.client.get<StoryscanTransactionResponse>(`/api/v1/addresses/${address}/transactions`, {
          params
        })
      );
      
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch transactions for ${address}:`, error);
      throw new Error(`Failed to fetch transactions for ${address}: ${error}`);
    }
  }

  /**
   * Async generator for iterating through all transactions for an address
   */
  async *iterateAddressTransactions(
    address: string,
    cutoffTime?: Date
  ): AsyncGenerator<StoryscanTransaction> {
    let nextPageParams: string | undefined;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.getAddressTransactions(address, nextPageParams);
        
        for (const tx of response.items) {
          // Check if we've reached the cutoff time
          if (cutoffTime) {
            const txTime = new Date(tx.block_time);
            if (txTime < cutoffTime) {
              hasMore = false;
              break;
            }
          }
          
          yield tx;
        }

        // Check if there are more pages
        nextPageParams = response.next_page_params;
        hasMore = !!nextPageParams;
        
        // Small delay between pages to be respectful
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error fetching transactions for ${address}:`, error);
        hasMore = false;
        throw error;
      }
    }
  }

  /**
   * Get transaction details by hash
   */
  async getTransactionByHash(txHash: string): Promise<StoryscanTransaction | null> {
    try {
      const response = await this.limiter.schedule(() =>
        this.client.get<StoryscanTransaction>(`/api/v1/transactions/${txHash}`)
      );
      
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch transaction ${txHash}:`, error);
      return null;
    }
  }

  /**
   * Health check for the API
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.limiter.schedule(() =>
        this.client.get('/api/v1/health', { timeout: 5000 })
      );
      return true;
    } catch (error) {
      console.error('Storyscan API health check failed:', error);
      return false;
    }
  }

  /**
   * Close the rate limiter
   */
  async close(): Promise<void> {
    await this.limiter.disconnect();
  }
}

// Export singleton instance
export const storyscanClient = new StoryscanClient();
