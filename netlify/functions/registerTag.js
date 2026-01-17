const { Client } = require("pg");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "ok" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

  const adminKey = (process.env.ADMIN_KEY || "").trim();
  if (!adminKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing ADMIN_KEY" }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  if ((body.admin_key || "") !== adminKey) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const tagId = (body.tag_id || "").toString().trim();
  const businessId = (body.business_id || "").toString().trim();
  const publicUrl = (body.business_public_url || "").toString().trim();
  const status = (body.status || "active").toString().trim();

  if (!tagId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing tag_id" }) };
  if (!publicUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing business_public_url" }) };

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    await client.query(
      `INSERT INTO nfc_tags (tag_id, business_id, status, business_public_url)
       VALUES ($1, NULLIF($2,''), $3, $4)
       ON CONFLICT (tag_id) DO UPDATE
       SET business_id = EXCLUDED.business_id,
           status = EXCLUDED.status,
           business_public_url = EXCLUDED.business_public_url`,
      [tagId, businessId, status, publicUrl]
    );

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, tag_id: tagId }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  } finally {
    await client.end();
  }
};
