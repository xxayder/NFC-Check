const { Client } = require("pg");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { business_id, tag_id, amount_cents } = JSON.parse(event.body || "{}");
  if (!business_id || !tag_id || !amount_cents) {
    return { statusCode: 400, body: "Missing fields" };
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    await client.query(
      `INSERT INTO nfc_transactions (business_id, tag_id, amount_cents)
       VALUES ($1, $2, $3)`,
      [business_id, tag_id.toLowerCase(), amount_cents]
    );
    return { statusCode: 200, body: "ok" };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: "Server error" };
  } finally {
    await client.end();
  }
};
