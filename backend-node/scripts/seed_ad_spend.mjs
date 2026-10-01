import pg from 'pg';
import crypto from 'crypto';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://apicem:Root123@localhost:5432/apicem',
});

await client.connect();

const tenantsRes = await client.query(`
  SELECT DISTINCT tenant_id, name 
  FROM app.tenants 
  WHERE name NOT LIKE '%vitest%'
`);

const tenants = tenantsRes.rows;
console.log(`Found ${tenants.length} target tenants for ad spend seeding:`, tenants.map(t => `${t.name} (${t.tenant_id})`));

const GOOGLE_CAMPAIGNS = [
  { id: 'g_1', name: 'Brand - Search', channel: 'SEARCH', baseSpend: 65, baseRoas: 6.5, ctr: 0.05 },
  { id: 'g_2', name: 'Prospecting - Performance Max', channel: 'PERFORMANCE_MAX', baseSpend: 110, baseRoas: 3.8, ctr: 0.025 },
  { id: 'g_3', name: 'Retargeting - Display', channel: 'DISPLAY', baseSpend: 35, baseRoas: 4.2, ctr: 0.015 },
  { id: 'g_4', name: 'Shopping - Core Catalog', channel: 'SHOPPING', baseSpend: 85, baseRoas: 4.0, ctr: 0.03 },
];

const META_CAMPAIGNS = [
  { id: 'm_1', name: 'Conversions - Lookalike 1%', channel: 'Paid Social', baseSpend: 95, baseRoas: 3.5, ctr: 0.02 },
  { id: 'm_2', name: 'Retargeting - Cart Abandoners', channel: 'Paid Social', baseSpend: 50, baseRoas: 5.2, ctr: 0.035 },
  { id: 'm_3', name: 'Awareness - Video Views', channel: 'Paid Social', baseSpend: 40, baseRoas: 1.8, ctr: 0.01 },
];

// Generate dates from 2026-04-01 to 2026-10-01 (184 days)
const dates = [];
const curr = new Date('2026-04-01T00:00:00Z');
const end = new Date('2026-10-01T00:00:00Z');
while (curr <= end) {
  dates.push(curr.toISOString().slice(0, 10));
  curr.setUTCDate(curr.getUTCDate() + 1);
}

for (const tenant of tenants) {
  const tenantId = tenant.tenant_id;
  console.log(`\nSeeding Google & Meta Ads for tenant ${tenant.name} (${tenantId})...`);

  // 1. Ensure connections exist
  const existingConns = await client.query(
    'SELECT source_type FROM app.connections WHERE tenant_id = $1',
    [tenantId]
  );
  const types = new Set(existingConns.rows.map(r => r.source_type));

  if (!types.has('google_ads')) {
    await client.query(`
      INSERT INTO app.connections (tenant_id, source_type, display_name, status, use_mock_data)
      VALUES ($1, 'google_ads', 'Google Ads', 'active', true)
    `, [tenantId]);
    console.log('Created Google Ads connection');
  }

  if (!types.has('meta_ads')) {
    await client.query(`
      INSERT INTO app.connections (tenant_id, source_type, display_name, status, use_mock_data)
      VALUES ($1, 'meta_ads', 'Meta Ads', 'active', true)
    `, [tenantId]);
    console.log('Created Meta Ads connection');
  }

  // 2. Clean up existing ad spend & dim_campaign for this tenant
  await client.query('DELETE FROM marts.fct_ad_spend WHERE tenant_id = $1', [tenantId]);
  await client.query('DELETE FROM marts.dim_campaign WHERE tenant_id = $1', [tenantId]);

  // 3. Insert dim_campaign rows
  for (const c of GOOGLE_CAMPAIGNS) {
    const key = `gads_${c.id}`;
    await client.query(`
      INSERT INTO marts.dim_campaign (tenant_id, campaign_key, campaign_name, source_system, channel)
      VALUES ($1, $2, $3, 'google_ads', $4)
    `, [tenantId, key, c.name, c.channel]);
  }

  for (const c of META_CAMPAIGNS) {
    const key = `meta_${c.id}`;
    await client.query(`
      INSERT INTO marts.dim_campaign (tenant_id, campaign_key, campaign_name, source_system, channel)
      VALUES ($1, $2, $3, 'meta_ads', $4)
    `, [tenantId, key, c.name, c.channel]);
  }

  // 4. Insert fct_ad_spend rows in batches
  const rows = [];
  let dayIdx = 0;

  for (const dateStr of dates) {
    dayIdx++;
    // Weekend boost simulation
    const dayOfWeek = new Date(dateStr).getUTCDay();
    const weekendMult = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.25 : 1.0;
    const wave = 1.0 + Math.sin(dayIdx / 7) * 0.15;

    for (const c of GOOGLE_CAMPAIGNS) {
      const key = `gads_${c.id}`;
      // Pseudo-random deterministic factor
      const seed = (dayIdx * 17 + c.id.charCodeAt(2) * 31) % 100 / 100;
      const spend = Math.round(c.baseSpend * weekendMult * wave * (0.85 + seed * 0.3) * 100) / 100;
      const cpc = 0.9 + seed * 0.6;
      const clicks = Math.max(5, Math.round(spend / cpc));
      const impressions = Math.round(clicks / c.ctr);
      const convRate = 0.05 + seed * 0.04;
      const conversions = Math.max(1, Math.round(clicks * convRate));
      const aov = 75 + seed * 50;
      const convValue = Math.round(spend * c.baseRoas * (0.85 + seed * 0.3) * 100) / 100;

      rows.push([tenantId, dateStr, 'google_ads', key, spend, clicks, impressions, conversions, convValue]);
    }

    for (const c of META_CAMPAIGNS) {
      const key = `meta_${c.id}`;
      const seed = (dayIdx * 23 + c.id.charCodeAt(2) * 43) % 100 / 100;
      const spend = Math.round(c.baseSpend * weekendMult * wave * (0.85 + seed * 0.3) * 100) / 100;
      const cpc = 0.7 + seed * 0.5;
      const clicks = Math.max(5, Math.round(spend / cpc));
      const impressions = Math.round(clicks / c.ctr);
      const convRate = 0.04 + seed * 0.035;
      const conversions = Math.max(1, Math.round(clicks * convRate));
      const convValue = Math.round(spend * c.baseRoas * (0.85 + seed * 0.3) * 100) / 100;

      rows.push([tenantId, dateStr, 'meta_ads', key, spend, clicks, impressions, conversions, convValue]);
    }
  }

  // Batch insert rows
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const valuePlaceholders = [];
    const flatParams = [];
    let pIdx = 1;

    for (const r of chunk) {
      valuePlaceholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
      flatParams.push(...r);
    }

    await client.query(`
      INSERT INTO marts.fct_ad_spend (tenant_id, date_key, source_system, campaign_key, spend, clicks, impressions, conversions, conversion_value)
      VALUES ${valuePlaceholders.join(', ')}
    `, flatParams);
  }

  console.log(`Inserted ${rows.length} ad spend rows for ${tenant.name}`);
}

// Summary check
const totalCount = await client.query('SELECT count(*) FROM marts.fct_ad_spend');
const sumSpend = await client.query('SELECT sum(spend) as total_spend, sum(conversion_value) as total_val FROM marts.fct_ad_spend');
console.log(`\nAd spend seeding complete!`);
console.log(`Total rows in marts.fct_ad_spend: ${totalCount.rows[0].count}`);
console.log(`Total spend: $${Number(sumSpend.rows[0].total_spend).toLocaleString()}`);
console.log(`Total conversion value: $${Number(sumSpend.rows[0].total_val).toLocaleString()}`);

await client.end();
