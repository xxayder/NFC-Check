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
        }))
      })
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: "Server error" };
  } finally {
    await client.end();
  }
};
