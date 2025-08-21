# Story Protocol dApp Stats — Design & Implementation (MySQL + TypeScript)

This document specifies the **database schema**, **project structure**, and **ingestion + API logic** to power a multi‑dApp statistics service for the Story Protocol ecosystem. Phase 1 focuses on two core metrics:

- `tx_count` — Number of outer transactions that hit any address mapped to a dApp.
- `unique_users` — Distinct EOA addresses (`from`) interacting with any mapped address of a dApp.

> Tech choices: **MySQL 8** for storage/rollups. **TypeScript/Node.js** for crawlers and API. Data source primarily **Storyscan (Blockscout REST v2 + metadata proxy)**.

---

## 1) Goals & Non‑Goals

**Goals (Phase 1)**

- Query dApp stats for 24H/7D/30D and return change vs. previous equal window.
- Optional sparkline (hourly series) for quick trend visualization.
- Support multiple dApps in a single API call.
- Exact `unique_users` (per hour) using a lightweight approach.

**Non‑Goals (Phase 1)**

- No advanced decoding (ABIs, method names) or volume/gas metrics.
- No per‑event analytics; focus is address‑level attribution.

---

## 2) Metric Definitions

- **Transactions**: Count of *successful* outer transactions where `to` or the touched contract address belongs to a dApp (via mapping). Internal txs are **excluded** in Phase 1 (optional later).
- **Unique Users**: `COUNT(DISTINCT from)` (EOA only) per hour window. We rely on explorer data to differentiate EOA/contract; as a simple heuristic we treat `from` as EOA in Phase 1.
- **Time windows**: strictly UTC. Hours are floored to the start of the hour.
- **Change %**: `(current - previous) / previous * 100`. If `previous=0`, define 100% (or 0 if current also 0).
- **Sparkline**: array of hourly `tx_count` within the selected timeframe.

---

## 3) High‑Level Flow

1. **Resolve dApp → addresses** using Storyscan metadata proxy (slug/label → list of addresses).
2. **Fetch transactions** per address using Storyscan REST v2, pull recent hours incrementally; stop when `block_time < cutoff`.
3. **Roll up** per (dapp\_id, chain\_id, ts\_hour): increment `tx_count` and collect `user_address` set.
4. **Refresh unique\_users** for each affected hour by counting rows in the per‑hour user set table.
5. API reads hourly rollups to serve `/api/dapps/stats`.

---

## 4) Data Model (ERD)

```
+-----------+       +-----------------+       +--------------------+
|  dapps    | 1   N |  dapp_addresses | N   1 |     addresses      |
+-----------+-------+-----------------+-------+--------------------+
| id (PK)   |       | dapp_id  (FK)   |       | id (PK)            |
| slug UQ   |       | address_id (FK) |       | chain_id           |
| name      |       | role            |       | address_hash UQ*   |
| status    |       +-----------------+       | label, type        |
+-----------+                                   first/last_seen    |
                                                +------------------+

+--------------------+          +---------------------+
| dapp_stats_hourly  |          | dapp_hourly_users   |
+--------------------+          +---------------------+
| dapp_id (PK part)  |          | dapp_id (PK part)   |
| chain_id (PK part) |          | chain_id (PK part)  |
| ts_hour  (PK part) |          | ts_hour  (PK part)  |
| tx_count           |          | user_address (PK)   |
| unique_users       |          +---------------------+
+--------------------+

(* UQ on (address_hash, chain_id))
```

**Optional (for lineage & audit):**

- `data_sources`, `ingestion_runs` to capture metadata about each crawl.
- `txs`, `tx_dapp_attribution` to persist raw txs and attribution rules (enable drilldown in later phases).

---

## 5) SQL DDL (MySQL 8)

> Adjust engine/charset as needed (InnoDB/utf8mb4). All times are UTC.

```sql
-- DAPPS
CREATE TABLE dapps (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  status TINYINT DEFAULT 1,                    -- 1 active, 0 inactive
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CHAINS (future-proof)
CREATE TABLE chains (
  id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,                   -- e.g., 'story'
  chain_key VARCHAR(64) NOT NULL,              -- internal key
  chain_id VARCHAR(64) NULL,                   -- EVM chain id string if applicable
  explorer_base_url VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_chain (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ADDRESSES
CREATE TABLE addresses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  chain_id SMALLINT NOT NULL,
  address_hash CHAR(42) NOT NULL,
  label VARCHAR(128) NULL,                     -- from metadata, e.g. SWAP_ROUTER_ADDRESS
  address_type VARCHAR(32) NULL,               -- router/factory/token/nft/vault/contract/eoa
  first_seen_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  UNIQUE KEY uniq_addr_chain (address_hash, chain_id),
  KEY idx_addr_chain (chain_id),
  CONSTRAINT fk_addr_chain FOREIGN KEY (chain_id) REFERENCES chains(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- N:N between dapps and addresses
CREATE TABLE dapp_addresses (
  dapp_id BIGINT NOT NULL,
  address_id BIGINT NOT NULL,
  role VARCHAR(64) NULL,                        -- router/factory/token/...
  PRIMARY KEY (dapp_id, address_id),
  KEY idx_da_dapp (dapp_id),
  KEY idx_da_addr (address_id),
  CONSTRAINT fk_da_dapp FOREIGN KEY (dapp_id) REFERENCES dapps(id),
  CONSTRAINT fk_da_addr FOREIGN KEY (address_id) REFERENCES addresses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- HOURLY ROLLUP (core for stats)
CREATE TABLE dapp_stats_hourly (
  dapp_id BIGINT NOT NULL,
  chain_id SMALLINT NOT NULL,
  ts_hour DATETIME NOT NULL,                    -- floored to hour (UTC)
  tx_count INT NOT NULL DEFAULT 0,
  unique_users INT NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dapp_id, chain_id, ts_hour),
  KEY idx_dsh_time (ts_hour),
  KEY idx_dsh_dapp_time (dapp_id, ts_hour),
  CONSTRAINT fk_dsh_chain FOREIGN KEY (chain_id) REFERENCES chains(id),
  CONSTRAINT fk_dsh_dapp  FOREIGN KEY (dapp_id)  REFERENCES dapps(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- EXACT UNIQUE USERS per hour (Phase 1 exactness)
CREATE TABLE dapp_hourly_users (
  dapp_id BIGINT NOT NULL,
  chain_id SMALLINT NOT NULL,
  ts_hour DATETIME NOT NULL,
  user_address CHAR(42) NOT NULL,
  PRIMARY KEY (dapp_id, chain_id, ts_hour, user_address),
  KEY idx_dhu_dapp_time (dapp_id, ts_hour),
  CONSTRAINT fk_dhu_chain FOREIGN KEY (chain_id) REFERENCES chains(id),
  CONSTRAINT fk_dhu_dapp  FOREIGN KEY (dapp_id)  REFERENCES dapps(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- OPTIONAL: data source lineage
CREATE TABLE data_sources (
  id INT PRIMARY KEY AUTO_INCREMENT,
  source VARCHAR(64) NOT NULL,                 -- 'storyscan', 'rpc', 'subgraph'
  meta JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ingestion_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  source_id INT NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  status VARCHAR(32) NOT NULL,                 -- success/failed/partial
  notes TEXT NULL,
  CONSTRAINT fk_ir_source FOREIGN KEY (source_id) REFERENCES data_sources(id),
  KEY idx_ir_time (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Seed suggestions**

```sql
INSERT INTO chains(name, chain_key) VALUES ('story', 'story');
INSERT INTO data_sources(source) VALUES ('storyscan');
```

---

## 6) Indexing & Performance

- `dapp_stats_hourly`: PK `(dapp_id, chain_id, ts_hour)` enables fast upsert and range queries for sparkline. Secondary index on `ts_hour` helps top‑N scans.
- `dapp_hourly_users`: PK avoids duplicates; exact uniqueness. For very large scale, consider Redis HyperLogLog per (dapp\_id, chain\_id, ts\_hour) and snapshot to MySQL hourly.
- Partitioning can be added later (by RANGE on `ts_hour`) if data grows significantly.

---

## 7) Ingestion Logic (Crawler)

**Inputs**: `slug` (e.g., `story-hunt`), `hoursBack` (e.g., 6), `chain_id` (default 1 for Story mainnet).

**Steps**

1. **Resolve dApp → address list** via metadata proxy. Upsert `addresses` (with `chain_id`) and link in `dapp_addresses`.
2. For each address:
   - Fetch transactions with keyset pagination (`next_page_params`).
   - For each tx:
     - Parse `block_time` (UTC). If `< cutoff (now - hoursBack)`, stop iterating this address.
     - If `status != success`, skip (Phase 1 policy).
     - `ts_hour = floor(block_time)` to hour.
     - `upsert tx_count += 1` into `dapp_stats_hourly` for (dapp\_id, chain\_id, ts\_hour).
     - Insert `user_address` (`from`) into `dapp_hourly_users` with `INSERT IGNORE`.
3. After the loop, for each touched `ts_hour`, run a refresh to update `unique_users = COUNT(*)` from `dapp_hourly_users`.
4. Persist an `ingestion_runs` row for observability.

**Idempotency**

- The use of `INSERT IGNORE` on `dapp_hourly_users` and `INSERT … ON DUPLICATE KEY UPDATE` on `dapp_stats_hourly` provides safe retries.
- Keep a memory/cache of hours touched in the run to minimize redundant `unique_users` refresh queries.

**Backfill**

- Separate job scanning older windows (by time). Avoid hammering the API; add rate limiting and backoff.

---

## 8) API Design — `GET /api/dapps/stats`

**Input (JSON body or query)**

```json
{
  "timeframe": "24H" | "7D" | "30D",
  "dapp_names": ["Story-Hunt", "Verio", "Meta-Pool"],
  "include_sparklines": true
}
```

**Output**

```json
{
  "success": true,
  "data": [
    {
      "name": "Story Hunt",
      "users": {
        "current": 15420,
        "formatted": "15.4K",
        "change_24h": 5.2,
        "change_7d": 12.8,
        "change_30d": 45.3,
        "change_type": "positive"
      },
      "transactions": {
        "current_24h": 8950,
        "current_7d": 62340,
        "current_30d": 245680,
        "formatted": "8.9K",
        "change_24h": 3.1,
        "change_7d": 8.7,
        "change_30d": 23.4,
        "change_type": "positive"
      },
      "sparkline_data": [120, 135, 128, 142, 156, 148, 162],
      "sparkline_trend": "up",
      "last_updated": "2024-01-15T10:30:00Z"
    }
  ],
  "metadata": {
    "total_dapps": 25,
    "last_crawl": "2024-01-15T10:30:00Z",
    "data_sources": ["storyscan"]
  }
}
```

**Query mechanics**

- Map input `dapp_names` to `dapp_id` by matching on `slug` or `name`.
- Define `{t0, t1, tPrev1}` where `t0` is the current UTC hour, `t1 = t0 - timeframe`, `tPrev1 = t1 - timeframe`.
- Query **current window** and **previous window** from `dapp_stats_hourly` and compute `% change`.
- Sparkline: fetch hourly rows in `[t1, t0)` ordered by `ts_hour`.

**Example SQL**

```sql
-- Current window\ nSELECT dapp_id, SUM(tx_count) AS tx, SUM(unique_users) AS uu
FROM dapp_stats_hourly
WHERE ts_hour >= ? AND ts_hour < ? AND dapp_id IN (?)
GROUP BY dapp_id;

-- Previous window
SELECT dapp_id, SUM(tx_count) AS tx, SUM(unique_users) AS uu
FROM dapp_stats_hourly
WHERE ts_hour >= ? AND ts_hour < ? AND dapp_id IN (?)
GROUP BY dapp_id;

-- Sparkline
SELECT dapp_id, ts_hour, tx_count
FROM dapp_stats_hourly
WHERE ts_hour >= ? AND ts_hour < ? AND dapp_id IN (?)
ORDER BY ts_hour ASC;
```

---

## 9) Project Structure (TypeScript)

```
.
├─ src/
│  ├─ config/
│  │  └─ env.ts                     # load env vars (DB URL, rate limits)
│  ├─ db/
│  │  ├─ mysql.ts                   # mysql2/promise pool
│  │  └─ queries.ts                 # shared query helpers
│  ├─ clients/
│  │  └─ storyscan.ts               # metadata + transactions client w/ rate limit
│  ├─ repos/
│  │  ├─ dapps.ts                   # upsert dapps/addresses/mapping
│  │  └─ stats.ts                   # upsert hourly stats & hourly users
│  ├─ jobs/
│  │  ├─ ingest.ts                  # ingest pipeline for one dApp
│  │  └─ scheduler.ts               # cron orchestration (node-cron/bullmq)
│  ├─ api/
│  │  ├─ server.ts                  # fastify/express bootstrap
│  │  └─ routes/
│  │     └─ dapps.stats.ts          # POST /api/dapps/stats
│  ├─ utils/
│  │  ├─ time.ts                    # floorToHourUTC, windows calc, parse block time
│  │  └─ format.ts                  # percentChange, formatKM, trendFromSeries
│  └─ index.ts                      # app entry (start API + scheduler)
├─ prisma/ or migrations/           # optional migration tool (knex/drizzle/prisma)
├─ scripts/
│  ├─ seed-dapps.ts                 # seed initial dApps & chains
│  └─ backfill.ts                   # historical backfill utility
├─ .env.example
├─ README.md                        # this document
└─ package.json
```

**Environment (.env)**

```
MYSQL_URL=mysql://user:pass@localhost:3306/story_stats?timezone=Z
STORYSCAN_BASE=https://www.storyscan.io
RATE_LIMIT_MIN_TIME_MS=120   # ~8 req/s global; tune as needed
INGEST_HOURS_BACK=6
PORT=8080
```

---

## 10) Module Responsibilities (Implementation Notes)

``

- `getAddressesBySlug(slug, tagType='protocol')` → returns list of `{address_hash, label, ...}`.
- `iterateAddressTransactions(address, params)` → async generator with keyset pagination, yields tx objects until no `next_page_params` or cutoff hit.
- Use `Bottleneck` for rate limiting, exponential backoff on 429/5xx.

``

- Upsert into `addresses` and `dapp_addresses` (linking by `(address_hash, chain_id)`).
- Normalize addresses to lowercase; set `first_seen_at/last_seen_at`.

``

- `upsertHourlyTxCount(dappId, chainId, tsHour, delta=1)` → `INSERT ... ON DUPLICATE KEY UPDATE`.
- `insertHourlyUserOnce(dappId, chainId, tsHour, user)` → `INSERT IGNORE`.
- `refreshHourlyUnique(dappId, chainId, tsHour)` → `UPDATE ... SET unique_users = (SELECT COUNT(*))`.

``

- Orchestrates: resolve addresses → iterate txs per address → roll up per hour → refresh uniques.
- Maintains a `Set<ts_hour>` of touched hours to minimize refresh calls.
- Skips failed tx; stops scanning an address when older than cutoff.

``

- Runs `ingestDappBySlug` per configured dApp every N minutes.
- Separate schedule for backfill (longer windows, lower rate).

``

- Accepts `timeframe`, `dapp_names[]`, `include_sparklines`.
- Maps names/slugs → ids, fetches current & previous windows, builds response with `% change`, `change_type`, sparkline trend.

---

## 11) Testing Plan

- **Unit**: time window math, percent change, trend detection; SQL upsert logic via test DB.
- **Integration**: mock Storyscan responses (metadata + tx pages) to verify ingestion idempotency and hour bucketing.
- **Load**: simulate multiple dApps and thousands of tx/h to test rollup performance and API latency.

---

## 12) Operations & Monitoring

- **Cron cadence**: every 2–5 minutes; `INGEST_HOURS_BACK=6` provides safety against brief downtime.
- **Alerts**: if no new rows in `dapp_stats_hourly` for >15 minutes; if `ingestion_runs.status != success`.
- **Backups**: daily snapshot of MySQL; verify restore quarterly.

---

## 13) Future Extensions (Phase 2+)

- Add `dapp_stats_daily` for long‑range charts; `materialized views` for top dApps.
- Add `gas_used`, `value_native_sum`, and per‑address breakdown tables.
- Support internal txs & event logs; method/topic decoding.
- Switch `unique_users` to approximate (Redis HLL) at very large scale.
- Multi‑chain support by populating `chains` and setting `chain_id` appropriately.

---

## 14) Security & Compliance

- Read‑only explorer APIs; no private keys involved.
- Rate limits and retries to avoid source throttling.
- Input validation for API; restrict `dapp_names` length & sanitize.

---

## 15) Example Pseudocode (TypeScript Snippets)

```ts
// time.ts
export function floorToHourUTC(d: Date) { const t = new Date(d); t.setUTCMinutes(0,0,0); return t; }
export function windowBounds(tf: '24H'|'7D'|'30D') {
  const t0 = floorToHourUTC(new Date());
  const hours = tf === '24H' ? 24 : tf === '7D' ? 168 : 720;
  const t1 = new Date(t0.getTime() - hours*3600_000);
  const tPrev1 = new Date(t1.getTime() - hours*3600_000);
  return { t0, t1, tPrev1 };
}
```

```ts
// stats.ts (repo)
export async function upsertHourlyTxCount(dappId:number, chainId:number, tsHour:Date, delta=1) {
  await pool.execute(
    `INSERT INTO dapp_stats_hourly (dapp_id, chain_id, ts_hour, tx_count, unique_users)
     VALUES (?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE tx_count = tx_count + VALUES(tx_count)`,
    [dappId, chainId, tsHour, delta]
  );
}
```

```ts
// API assemble (simplified)
const { t0, t1, tPrev1 } = windowBounds(timeframe);
const cur = await querySum(dappIds, t1, t0); // tx & uu
const prev = await querySum(dappIds, tPrev1, t1);
const spark = include ? await querySpark(dappIds, t1, t0) : {};
return buildResponse(cur, prev, spark);
```

---

## 16) Deliverables Checklist

-

> With this blueprint, you can scaffold the repo and start ingesting a few dApps (e.g., `Story-Hunt`) within hours, then iterate on metrics and coverage.

