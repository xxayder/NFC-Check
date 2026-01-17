const { Client } = require("pg");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const businessId = event.queryStringParameters?.business_id;
  if (!businessId) {
    return { statusCode: 400, body: "Missing business_id" };
  }

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
         SUM(amount_cents)::int AS total_cents
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
     COUNT(*)::int AS tx_count
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
     COUNT(*)::int AS tx_count
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
     COUNT(*)::int AS tx_count
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
     COUNT(*)::int AS tx_count
   FROM nfc_transactions
   WHERE business_id = $1
   GROUP BY year
   ORDER BY year`,
  [businessId]
);

    const summary = summaryRes.rows[0];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: businessId,
        total_transactions: summary.total_transactions,
        total_spent: (summary.total_cents / 100).toFixed(2),
        avg_transaction: (Number(summary.avg_cents) / 100).toFixed(2),
        monthly: monthlyRes.rows.map(r => ({
          month: String(r.month).slice(0, 10),
          total_spent: (r.total_cents / 100).toFixed(2)
        })),
        daily: dailyRes.rows.map(r => ({
          day: r.day,
          total_spent: (r.total_cents / 100).toFixed(2),
          tx_count: r.tx_count
        })),
        weekly: weeklyRes.rows.map(r => ({
          week_start: r.week_start,
          total_spent: (r.total_cents / 100).toFixed(2),
          tx_count: r.tx_count
        })),
        quarterly: quarterlyRes.rows.map(r => ({
          quarter: r.quarter,
          total_spent: (r.total_cents / 100).toFixed(2),
          tx_count: r.tx_count
        })),
        yearly: yearlyRes.rows.map(r => ({
          year: r.year,
          total_spent: (r.total_cents / 100).toFixed(2),
          tx_count: r.tx_count
        })),

      })
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: "Server error" };
  } finally {
    await client.end();
  }
};
