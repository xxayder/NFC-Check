const { Client } = require("pg");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  const businessId = event.queryStringParameters?.business_id;
  if (!businessId) {
    return { statusCode: 400, headers, body: "Missing business_id" };
  }

  const limit = Math.min(Number(event.queryStringParameters?.limit || 50), 200);

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const res = await client.query(
      `SELECT
         occurred_at,
         tag_id,
         amount_cents::int AS amount_cents
       FROM nfc_transactions
       WHERE business_id = $1
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [businessId, limit]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(
        res.rows.map(r => ({
          occurred_at: r.occurred_at,              // ISO in JSON
          tag_id: r.tag_id,
          amount: (r.amount_cents / 100).toFixed(2)
        }))
      ),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: "Server error" };
  } finally {
    await client.end();
  }
};
