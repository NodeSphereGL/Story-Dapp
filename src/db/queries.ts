import { pool } from './mysql';

// Types for database operations
export interface Dapp {
  id: number;
  slug: string;
  name: string;
  status: number;
  created_at: Date;
  updated_at: Date;
}

export interface Address {
  id: number;
  chain_id: number;
  address_hash: string;
  label: string | null;
  address_type: string | null;
  first_seen_at: Date | null;
  last_seen_at: Date | null;
}

export interface DappAddress {
  dapp_id: number;
  address_id: number;
  role: string | null;
}

export interface DappStatsHourly {
  dapp_id: number;
  chain_id: number;
  ts_hour: Date;
  tx_count: number;
  unique_users: number;
  updated_at: Date;
}

export interface DappHourlyUser {
  dapp_id: number;
  chain_id: number;
  ts_hour: Date;
  user_address: string;
}

// Dapp operations
export async function getDappBySlug(slug: string): Promise<Dapp | null> {
  const [rows] = await pool.execute(
    'SELECT * FROM dapps WHERE slug = ? AND status = 1',
    [slug]
  );
  return (rows as Dapp[])[0] || null;
}

export async function createDapp(slug: string, name: string): Promise<number> {
  const [result] = await pool.execute(
    'INSERT INTO dapps (slug, name) VALUES (?, ?)',
    [slug, name]
  );
  return (result as any).insertId;
}

export async function getDappAddresses(dappId: number): Promise<Address[]> {
  const [rows] = await pool.execute(`
    SELECT a.* FROM addresses a
    JOIN dapp_addresses da ON a.id = da.address_id
    WHERE da.dapp_id = ?
  `, [dappId]);
  return rows as Address[];
}

// Address operations
export async function getAddressByHash(chainId: number, addressHash: string): Promise<Address | null> {
  const [rows] = await pool.execute(
    'SELECT * FROM addresses WHERE chain_id = ? AND address_hash = ?',
    [chainId, addressHash.toLowerCase()]
  );
  return (rows as Address[])[0] || null;
}

export async function createAddress(
  chainId: number,
  addressHash: string,
  label?: string,
  addressType?: string
): Promise<number> {
  const [result] = await pool.execute(
    'INSERT INTO addresses (chain_id, address_hash, label, address_type) VALUES (?, ?, ?, ?)',
    [chainId, addressHash.toLowerCase(), label, addressType]
  );
  return (result as any).insertId;
}

export async function updateAddressLastSeen(addressId: number): Promise<void> {
  await pool.execute(
    'UPDATE addresses SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?',
    [addressId]
  );
}

export async function linkDappAddress(dappId: number, addressId: number, role?: string): Promise<void> {
  await pool.execute(
    'INSERT IGNORE INTO dapp_addresses (dapp_id, address_id, role) VALUES (?, ?, ?)',
    [dappId, addressId, role]
  );
}

// Stats operations
export async function upsertHourlyTxCount(
  dappId: number,
  chainId: number,
  tsHour: Date,
  delta: number = 1
): Promise<void> {
  await pool.execute(`
    INSERT INTO dapp_stats_hourly (dapp_id, chain_id, ts_hour, tx_count, unique_users)
    VALUES (?, ?, ?, ?, 0)
    ON DUPLICATE KEY UPDATE tx_count = tx_count + VALUES(tx_count)
  `, [dappId, chainId, tsHour, delta]);
}

export async function insertHourlyUserOnce(
  dappId: number,
  chainId: number,
  tsHour: Date,
  userAddress: string
): Promise<void> {
  await pool.execute(`
    INSERT IGNORE INTO dapp_hourly_users (dapp_id, chain_id, ts_hour, user_address)
    VALUES (?, ?, ?, ?)
  `, [dappId, chainId, tsHour, userAddress.toLowerCase()]);
}

export async function refreshHourlyUnique(dappId: number, chainId: number, tsHour: Date): Promise<void> {
  await pool.execute(`
    UPDATE dapp_stats_hourly 
    SET unique_users = (
      SELECT COUNT(*) FROM dapp_hourly_users 
      WHERE dapp_id = ? AND chain_id = ? AND ts_hour = ?
    )
    WHERE dapp_id = ? AND chain_id = ? AND ts_hour = ?
  `, [dappId, chainId, tsHour, dappId, chainId, tsHour]);
}

// Query operations for API
export async function getDappStatsInWindow(
  dappIds: number[],
  startTime: Date,
  endTime: Date
): Promise<Array<{ dapp_id: number; tx_count: number; unique_users: number }>> {
  const [rows] = await pool.execute(`
    SELECT dapp_id, SUM(tx_count) as tx_count, SUM(unique_users) as unique_users
    FROM dapp_stats_hourly
    WHERE ts_hour >= ? AND ts_hour < ? AND dapp_id IN (${dappIds.map(() => '?').join(',')})
    GROUP BY dapp_id
  `, [startTime, endTime, ...dappIds]);
  
  return rows as Array<{ dapp_id: number; tx_count: number; unique_users: number }>;
}

export async function getDappSparkline(
  dappIds: number[],
  startTime: Date,
  endTime: Date
): Promise<Array<{ dapp_id: number; ts_hour: Date; tx_count: number }>> {
  const [rows] = await pool.execute(`
    SELECT dapp_id, ts_hour, tx_count
    FROM dapp_stats_hourly
    WHERE ts_hour >= ? AND ts_hour < ? AND dapp_id IN (${dappIds.map(() => '?').join(',')})
    ORDER BY ts_hour ASC
  `, [startTime, endTime, ...dappIds]);
  
  return rows as Array<{ dapp_id: number; ts_hour: Date; tx_count: number }>;
}

// Utility queries
export async function getChainId(chainName: string): Promise<number> {
  const [rows] = await pool.execute(
    'SELECT id FROM chains WHERE name = ?',
    [chainName]
  );
  const result = rows as Array<{ id: number }>;
  return result[0]?.id || 1; // Default to 1 if not found
}

export async function createChainIfNotExists(chainName: string, chainKey: string): Promise<number> {
  const [result] = await pool.execute(
    'INSERT IGNORE INTO chains (name, chain_key) VALUES (?, ?)',
    [chainName, chainKey]
  );
  
  if ((result as any).insertId) {
    return (result as any).insertId;
  }
  
  // If no insert, get existing id
  const [rows] = await pool.execute(
    'SELECT id FROM chains WHERE name = ?',
    [chainName]
  );
  return (rows as Array<{ id: number }>)[0]?.id || 1;
}
