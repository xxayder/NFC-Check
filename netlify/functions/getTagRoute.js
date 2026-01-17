const { Client } = require("pg");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "ok" };
  if (event.httpMethod !== "GET")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

  // IMPORTANT: Row IDs are case-sensitive. DO NOT lowercase.
  const tagId = (event.queryStringParameters?.tag_id || "").toString().trim();
  if (!tagId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing tag_id" }) };

  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing DATABASE_URL env var" }) };
  }

  const template = (process.env.GLIDE_DEEPLINK_TEMPLATE || "").trim();
  if (!template.includes("{ROWID}")) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing/invalid GLIDE_DEEPLINK_TEMPLATE (must include {ROWID})" }),
    };
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    const res = await client.query(
        `SELECT tag_id, business_id, business_public_url
        FROM nfc_tags
        WHERE LOWER(tag_id) = LOWER($1)
            AND status = 'active'
        LIMIT 1`,
        [tagId]
        );

    if (res.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Invalid or inactive tag" }) };
        }

    const row = res.rows[0];

        // IMPORTANT: build using the canonical stored tag_id (correct case)
        const glide_deep_link = template.split("{ROWID}").join(row.tag_id);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            tag_id: row.tag_id,
            business_id: row.business_id || "",
            business_public_url: row.business_public_url || "",
            glide_deep_link,
        }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  } finally {
    await client.end();
  }
};
