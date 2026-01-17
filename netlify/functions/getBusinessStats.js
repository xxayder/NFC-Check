const { Client } = require("pg");

exports.handler = async function (event) {
  // CORS (needed when Glide calls this endpoint)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: "ok",
    };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const businessId = event.queryStringParameters?.business_id;
  if (!businessId) {
    return { statusCode: 400, body: "Missing business_id" };
  }

  // NEW: mode flag (place it here)
  const mode = event.queryStringParameters?.mode || "all";

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const summaryRes = await client.query(
      `SELECT
         COUNT(*)::int AS total_transactions,
         COALESCE(SUM(amount_cents),0)::int AS total_cents,
         COALESCE(AVG(amount_cents),0)::numeric(12,2) AS avg_cents
       FROM nfc_transactions
       WHERE business_id = $1`,
      [businessId]
    );

    const monthlyRes = await client.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', occurred_at), 'YYYY-MM-01') AS month,
         SUM(amount_cents)::int AS total_cents,
         COUNT(*)::int AS tx_count,
         AVG(amount_cents)::numeric(12,2) AS avg_cents
       FROM nfc_transactions
       WHERE business_id = $1
       GROUP BY month
       ORDER BY month`,
      [businessId]
    );

    const dailyRes = await client.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('day', occurred_at), 'YYYY-MM-DD') AS day,
         SUM(amount_cents)::int AS total_cents,
         COUNT(*)::int AS tx_count,
         AVG(amount_cents)::numeric(12,2) AS avg_cents
       FROM nfc_transactions
       WHERE business_id = $1
       GROUP BY day
       ORDER BY day`,
      [businessId]
    );

    const weeklyRes = await client.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('week', occurred_at), 'YYYY-MM-DD') AS week_start,
         SUM(amount_cents)::int AS total_cents,
         COUNT(*)::int AS tx_count,
         AVG(amount_cents)::numeric(12,2) AS avg_cents
       FROM nfc_transactions
       WHERE business_id = $1
       GROUP BY week_start
       ORDER BY week_start`,
      [businessId]
    );

    const quarterlyRes = await client.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('quarter', occurred_at), 'YYYY-"Q"Q') AS quarter,
         SUM(amount_cents)::int AS total_cents,
         COUNT(*)::int AS tx_count,
         AVG(amount_cents)::numeric(12,2) AS avg_cents
       FROM nfc_transactions
       WHERE business_id = $1
       GROUP BY quarter
       ORDER BY quarter`,
      [businessId]
    );

    const yearlyRes = await client.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('year', occurred_at), 'YYYY') AS year,
         SUM(amount_cents)::int AS total_cents,
         COUNT(*)::int AS tx_count,
         AVG(amount_cents)::numeric(12,2) AS avg_cents
       FROM nfc_transactions
       WHERE business_id = $1
       GROUP BY year
       ORDER BY year`,
      [businessId]
    );

    const projRes = await client.query(
      `SELECT COALESCE(SUM(amount_cents),0)::int AS last_30d_cents
       FROM nfc_transactions
       WHERE business_id = $1
         AND occurred_at >= NOW() - INTERVAL '30 days'`,
      [businessId]
    );

    const activeDaysRes = await client.query(
      `SELECT COUNT(DISTINCT DATE(occurred_at))::int AS active_days
       FROM nfc_transactions
       WHERE business_id = $1
         AND occurred_at >= NOW() - INTERVAL '30 days'`,
      [businessId]
    );

    const summary = summaryRes.rows[0];
    const last30 = projRes.rows[0].last_30d_cents;
    const activeDays = Math.max(activeDaysRes.rows[0].active_days, 1);

    // Build one full payload, then slice based on mode
    const payloadAll = {
      business_id: businessId,
      total_transactions: summary.total_transactions,
      total_spent: (summary.total_cents / 100).toFixed(2),
      avg_transaction: (Number(summary.avg_cents) / 100).toFixed(2),

      avg_daily_last_30d: ((last30 / activeDays) / 100).toFixed(2),
      projection_next_30d: (((last30 / activeDays) / 100) * 30).toFixed(2),
      active_days_last_30d: activeDaysRes.rows[0].active_days,

      monthly: monthlyRes.rows.map((r) => ({
        month: r.month,
        total_spent: (r.total_cents / 100).toFixed(2),
        tx_count: r.tx_count,
        avg_tx: (Number(r.avg_cents) / 100).toFixed(2),
      })),

      daily: dailyRes.rows.map((r) => ({
        day: r.day,
        total_spent: (r.total_cents / 100).toFixed(2),
        tx_count: r.tx_count,
        avg_tx: (Number(r.avg_cents) / 100).toFixed(2),
      })),

      weekly: weeklyRes.rows.map((r) => ({
        week_start: r.week_start,
        total_spent: (r.total_cents / 100).toFixed(2),
        tx_count: r.tx_count,
        avg_tx: (Number(r.avg_cents) / 100).toFixed(2),
      })),

      quarterly: quarterlyRes.rows.map((r) => ({
        quarter: r.quarter,
        total_spent: (r.total_cents / 100).toFixed(2),
        tx_count: r.tx_count,
        avg_tx: (Number(r.avg_cents) / 100).toFixed(2),
      })),

      yearly: yearlyRes.rows.map((r) => ({
        year: r.year,
        total_spent: (r.total_cents / 100).toFixed(2),
        tx_count: r.tx_count,
        avg_tx: (Number(r.avg_cents) / 100).toFixed(2),
      })),
    };

    const payloadSummary = {
      business_id: payloadAll.business_id,
      total_transactions: payloadAll.total_transactions,
      total_spent: payloadAll.total_spent,
      avg_transaction: payloadAll.avg_transaction,
      avg_daily_last_30d: payloadAll.avg_daily_last_30d,
      projection_next_30d: payloadAll.projection_next_30d,
      active_days_last_30d: payloadAll.active_days_last_30d,
    };

    const payloadSeries = {
      business_id: payloadAll.business_id,
      daily: payloadAll.daily,
      weekly: payloadAll.weekly,
      monthly: payloadAll.monthly,
      quarterly: payloadAll.quarterly,
      yearly: payloadAll.yearly,
    };

    const payload =
      mode === "summary" ? payloadSummary : mode === "series" ? payloadSeries : payloadAll;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(payload),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Server error",
    };
  } finally {
    await client.end();
  }
};
