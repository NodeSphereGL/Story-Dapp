import { 
  getDappBySlug, 
  createDapp, 
  getDappAddresses,
  getAddressByHash,
  createAddress,
  updateAddressLastSeen,
  updateAddressLabel,
  linkDappAddress,
  createChainIfNotExists
} from '../db/queries';
import { storyscanClient, StoryscanAddress } from '../clients/storyscan';

export interface DappInfo {
  slug: string;
  name: string;
  addresses: StoryscanAddress[];
}

/**
 * Repository for managing dApps and their addresses
 */
export class DappRepository {
  private chainId: number = 1; // Default to Story mainnet

  constructor() {
    this.initializeChain();
  }

  /**
   * Initialize the chain record if it doesn't exist
   */
  private async initializeChain(): Promise<void> {
    try {
      this.chainId = await createChainIfNotExists('story', 'story');
    } catch (error) {
      console.error('Failed to initialize chain:', error);
    }
  }

  /**
   * Get or create a dApp by slug
   */
  async getOrCreateDapp(slug: string, title: string): Promise<number> {
    try {
      // Try to get existing dApp
      const existingDapp = await getDappBySlug(slug);
      if (existingDapp) {
        console.log(`Found existing dApp: ${slug} (ID: ${existingDapp.id})`);
        return existingDapp.id;
      }

      // Create new dApp with minimal data
      const dappId = await createDapp({
        dapp_id: slug, // Use slug as dapp_id
        slug,
        title,
        external: false,
        internal_wallet: false
      });
      console.log(`Created new dApp: ${slug} (ID: ${dappId})`);
      return dappId;
    } catch (error) {
      console.error(`Failed to get or create dApp ${slug}:`, error);
      throw error;
    }
  }

  /**
   * Sync addresses for a dApp from Storyscan
   */
  async syncDappAddresses(dappId: number, slug: string): Promise<void> {
    try {
      console.log(`Syncing addresses for dApp: ${slug}`);
      
      // Fetch addresses from Storyscan
      const addresses = await storyscanClient.getAddressesBySlug(slug);
      console.log(`Found ${addresses.length} addresses for ${slug}`);

      // Process each address item (now they are objects with metadata)
      for (const addressItem of addresses) {
        await this.processAddress(dappId, addressItem);
      }

      console.log(`✅ Completed syncing addresses for ${slug}`);
    } catch (error) {
      console.error(`Failed to sync addresses for dApp ${slug}:`, error);
      throw error;
    }
  }

  /**
   * Process a single address for a dApp
   */
  private async processAddress(dappId: number, addressItem: any): Promise<void> {
    try {
      const normalizedAddressHash = addressItem.hash.toLowerCase();
      
      // Extract label from metadata tags where tagType is "name"
      let label = `Address for dApp ${dappId}`; // Default label
      if (addressItem.metadata?.tags) {
        const nameTag = addressItem.metadata.tags.find((tag: any) => tag.tagType === 'name');
        if (nameTag) {
          label = nameTag.name;
          console.log(`📝 Found label for ${normalizedAddressHash}: ${label}`);
        }
      }
      
      // Check if address already exists
      let addressId: number;
      const existingAddress = await getAddressByHash(this.chainId, normalizedAddressHash);
      
      if (existingAddress) {
        addressId = existingAddress.id;
        // Update last seen timestamp and label if it has changed
        if (existingAddress.label !== label) {
          await updateAddressLabel(addressId, label);
          console.log(`🔄 Updated label for existing address: ${normalizedAddressHash} -> ${label}`);
        } else {
          await updateAddressLastSeen(addressId);
          console.log(`✅ Updated existing address: ${normalizedAddressHash} (${label})`);
        }
      } else {
        // Create new address with extracted label
        addressId = await createAddress(
          this.chainId,
          normalizedAddressHash,
          label,
          'contract' // Default to contract since these are usually smart contract addresses
        );
        console.log(`🆕 Created new address: ${normalizedAddressHash} (ID: ${addressId}, Label: ${label})`);
      }

      // Link address to dApp
      await linkDappAddress(dappId, addressId, 'contract');
      console.log(`🔗 Linked address ${normalizedAddressHash} to dApp ${dappId}`);
    } catch (error) {
      console.error(`❌ Failed to process address ${addressItem.hash}:`, error);
      throw error;
    }
  }

  /**
   * Get all addresses for a dApp
   */
  async getDappAddresses(dappId: number): Promise<any[]> {
    try {
      return await getDappAddresses(dappId);
    } catch (error) {
      console.error(`Failed to get addresses for dApp ${dappId}:`, error);
      throw error;
    }
  }

  /**
   * Get dApp by slug
   */
  async getDapp(slug: string): Promise<any | null> {
    try {
      return await getDappBySlug(slug);
    } catch (error) {
      console.error(`Failed to get dApp ${slug}:`, error);
      throw error;
    }
  }

  /**
   * Sync multiple dApps
   */
  async syncMultipleDapps(dapps: DappInfo[]): Promise<void> {
    console.log(`Starting sync for ${dapps.length} dApps`);
    
    for (const dapp of dapps) {
      try {
        const dappId = await this.getOrCreateDapp(dapp.slug, dapp.name);
        await this.syncDappAddresses(dappId, dapp.slug);
        
        // Small delay between dApps to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to sync dApp ${dapp.slug}:`, error);
        // Continue with other dApps
      }
    }
    
    console.log('✅ Completed syncing all dApps');
  }

  /**
   * Get chain ID
   */
  getChainId(): number {
    return this.chainId;
  }
}

// Export singleton instance
export const dappRepository = new DappRepository();
