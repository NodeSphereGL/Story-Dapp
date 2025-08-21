import axios, { AxiosInstance } from 'axios';
import Bottleneck from 'bottleneck';
import { storyscanConfig } from '../config/env';

export interface StoryscanAddress {
  address_hash: string;
  label?: string;
  address_type?: string;
}

export interface StoryscanTransaction {
  hash: string;
  block_number: number;
  timestamp: string;
  from: { hash: string };
  to: { hash: string } | null;
  status: string;
  value: string;
  gas_used: string;
  gas_price: string;
  method?: string;
  fee: { value: string };
  confirmations: number;
  result: string;
}

export interface StoryscanTransactionResponse {
  items: StoryscanTransaction[];
  next_page_params?: string;
}

export interface StoryscanAddressItem {
  hash: string;
  name: string;
  metadata: {
    tags: Array<{
      name: string;
      tagType: string;
      slug: string;
      ordinal: number;
      meta: any;
    }>;
  };
  transactions_count: string;
  coin_balance: string;
  is_contract: boolean;
  is_verified: boolean;
}

export interface StoryscanMetadataResponse {
  addresses: string[];
  items: StoryscanAddressItem[];
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
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
  async getAddressesBySlug(slug: string, tagType: string = 'protocol'): Promise<StoryscanAddressItem[]> {
    try {
      console.log(`🔍 Fetching addresses for dApp: ${slug} with tag_type: ${tagType}`);
      
      // Use the correct API v2 endpoint
      const endpoint = `/api/v2/proxy/metadata/addresses`;
      
      console.log(`🔄 Using endpoint: ${endpoint}`);
      
      const response = await this.limiter.schedule(() =>
        this.client.get<StoryscanMetadataResponse>(endpoint, {
          params: { 
            slug: slug,
            tag_type: tagType
          },
          timeout: 15000
        })
      );
      
      console.log(`✅ Success with endpoint: ${endpoint}`);
      console.log(`📊 Found ${response.data.items?.length || 0} address items`);
      
      if (response.data.items && response.data.items.length > 0) {
        return response.data.items;
      }
      
      throw new Error(`No addresses found for dApp: ${slug}`);
      
    } catch (error) {
      console.error(`❌ Failed to fetch addresses for dApp ${slug}:`, error);
      
      // Handle axios errors properly
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.error(`🔍 Error details:`, {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
          url: axiosError.config?.url,
          params: axiosError.config?.params
        });
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch addresses for ${slug}: ${errorMessage}`);
    }
  }

  /**
   * Get transactions for a specific address with pagination
   */
  async getAddressTransactions(
    address: string,
    pageParams?: any
  ): Promise<StoryscanTransactionResponse> {
    try {
      console.log(`🔍 Fetching transactions for address: ${address}`);
      
      const params: any = {};
      if (pageParams) {
        // Handle pagination parameters properly
        if (typeof pageParams === 'string') {
          // If it's a string, try to parse it as JSON
          try {
            const parsedParams = JSON.parse(pageParams);
            Object.assign(params, parsedParams);
          } catch {
            // If parsing fails, use as-is
            params.next_page_params = pageParams;
          }
        } else if (typeof pageParams === 'object') {
          // If it's already an object, use it directly
          Object.assign(params, pageParams);
        }
      }

      // Use the correct API v2 endpoint
      const endpoint = `/api/v2/addresses/${address}/transactions`;
      
      console.log(`🔄 Using endpoint: ${endpoint}`);
      if (Object.keys(params).length > 0) {
        console.log(`📄 Pagination params:`, params);
      }
      
      const response = await this.limiter.schedule(() =>
        this.client.get<StoryscanTransactionResponse>(endpoint, {
          params,
          timeout: 15000
        })
      );
      
      console.log(`✅ Success with endpoint: ${endpoint}`);
      console.log(`📊 Found ${response.data.items?.length || 0} transactions`);
      
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to fetch transactions for ${address}:`, error);
      
      // Handle axios errors properly
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.error(`🔍 Error details:`, {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
          url: axiosError.config?.url,
          params: axiosError.config?.params
        });
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch transactions for ${address}: ${errorMessage}`);
    }
  }

  /**
   * Async generator for iterating through all transactions for an address
   */
  async *iterateAddressTransactions(
    address: string,
    cutoffTime?: Date
  ): AsyncGenerator<StoryscanTransaction> {
    let nextPageParams: any = undefined;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 10; // Limit to prevent infinite loops

    while (hasMore && pageCount < maxPages) {
      try {
        pageCount++;
        console.log(`📄 Fetching page ${pageCount} for address ${address}`);
        
        const response = await this.getAddressTransactions(address, nextPageParams);
        
        for (const tx of response.items) {
          // Check if we've reached the cutoff time
          if (cutoffTime) {
            const txTime = new Date(tx.timestamp);
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
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`❌ Error fetching page ${pageCount} for address ${address}:`, error);
        
        // If it's a pagination error (422), try to continue with what we have
        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as any;
          if (axiosError.response?.status === 422) {
            console.log(`⚠️  Pagination failed for ${address}, continuing with available data`);
            hasMore = false;
            break;
          }
        }
        
        // For other errors, stop processing this address
        hasMore = false;
        throw error;
      }
    }
    
    if (pageCount >= maxPages) {
      console.log(`⚠️  Reached maximum page limit (${maxPages}) for address ${address}`);
    }
  }

  /**
   * Get transaction details by hash
   */
  async getTransactionByHash(txHash: string): Promise<StoryscanTransaction | null> {
    try {
      console.log(`🔍 Fetching transaction details for hash: ${txHash}`);
      
      // Use the correct API v2 endpoint
      const endpoint = `/api/v2/transactions/${txHash}`;
      
      console.log(`🔄 Using endpoint: ${endpoint}`);
      
      const response = await this.limiter.schedule(() =>
        this.client.get<StoryscanTransaction>(endpoint, {
          timeout: 15000
        })
      );
      
      console.log(`✅ Success with endpoint: ${endpoint}`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to fetch transaction ${txHash}:`, error);
      
      // Handle axios errors properly
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.error(`🔍 Error details:`, {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data
        });
      }
      
      return null;
    }
  }

  /**
   * Health check for the API
   */
  async healthCheck(): Promise<boolean> {
    try {
      console.log('🏥 Checking Storyscan API health...');
      
      // Try a simple metadata request to test API connectivity
      const testSlug = 'story-hunt';
      const endpoint = `/api/v2/proxy/metadata/addresses`;
      
      console.log(`🔄 Testing API with endpoint: ${endpoint}`);
      
      const response = await this.limiter.schedule(() =>
        this.client.get(endpoint, { 
          timeout: 10000,
          params: {
            slug: testSlug,
            tag_type: 'protocol'
          }
        })
      );
      
      console.log(`✅ Health check successful!`);
      console.log(`📊 Found ${response.data.addresses?.length || 0} addresses for test dApp`);
      return true;
      
    } catch (error) {
      console.error('❌ Storyscan API health check failed:', error);
      
      // Handle axios errors properly
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.error('🔍 Health check error details:', {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data
        });
      }
      
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
