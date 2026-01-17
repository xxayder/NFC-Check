const { Client } = require("pg");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "ok" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const tagId = (event.queryStringParameters?.tag_id || "").toString().trim().toLowerCase();
  if (!tagId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing tag_id" }) };
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const res = await client.query(
      `SELECT
         tag_id,
         business_public_url,
         glide_deep_link
       FROM nfc_tags
       WHERE tag_id = $1
         AND status = 'active'
       LIMIT 1`,
      [tagId]
    );

    if (res.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Invalid or inactive tag" }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(res.rows[0]) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  } finally {
    await client.end();
  }
};
