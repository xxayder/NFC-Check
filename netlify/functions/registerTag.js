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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const adminKey = (process.env.ADMIN_KEY || "").trim();
  if (!adminKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing ADMIN_KEY" }) };

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if ((body.admin_key || "") !== adminKey) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const tagIdInput = (body.tag_id || "").toString().trim(); // DO NOT lowercase
  const businessId = (body.business_id || "").toString().trim();
  const publicUrl = (body.business_public_url || "").toString().trim();
  const status = (body.status || "active").toString().trim();

  if (!tagIdInput) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing tag_id" }) };
  if (!publicUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing business_public_url" }) };

  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing DATABASE_URL" }) };

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    // 1) Try update by case-insensitive match (handles LOWER(tag_id) unique index cleanly)
    const upd = await client.query(
      `UPDATE nfc_tags
       SET business_id = NULLIF($2,''),
           status = $3,
           business_public_url = $4,
           updated_at = NOW()
       WHERE LOWER(tag_id) = LOWER($1)
       RETURNING tag_id`,
      [tagIdInput, businessId, status, publicUrl]
    );

    if (upd.rowCount === 1) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, tag_id: upd.rows[0].tag_id, action: "updated" }),
      };
    }

    // 2) No existing row -> insert
    const ins = await client.query(
      `INSERT INTO nfc_tags (tag_id, business_id, status, business_public_url, visit_count, last_visit_at)
       VALUES ($1, NULLIF($2,''), $3, $4, 0, NOW())
       RETURNING tag_id`,
      [tagIdInput, businessId, status, publicUrl]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, tag_id: ins.rows[0].tag_id, action: "created" }),
    };
  } catch (e) {
    console.error(e);
    // Temporary: return the message so you can see the real constraint failing
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error", detail: e.message }) };
  } finally {
    await client.end();
  }
};
