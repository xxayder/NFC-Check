const { Client } = require("pg");

exports.handler = async function (event) {
  const parts = event.path.split("/").filter(Boolean);
  const tagIdRaw = parts[parts.length - 1] || "";
  const tagId = tagIdRaw.trim().toLowerCase();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { statusCode: 500, body: "Missing DATABASE_URL env var" };
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    // Try to insert today's scan (unique per day)
    const insertResult = await client.query(
      `INSERT INTO nfc_scans (tag_id, scan_date)
       VALUES ($1, CURRENT_DATE)
       ON CONFLICT DO NOTHING
       RETURNING 1`,
      [tagId]
    );

    // Only increment if this is the first scan today
    if (insertResult.rowCount === 1) {
      await client.query(
        `UPDATE nfc_tags
         SET visit_count = COALESCE(visit_count, 0) + 1,
             last_visit_at = NOW()
         WHERE tag_id = $1
           AND status = 'active'`,
        [tagId]
      );
    }

    // Always fetch deep link
    const linkResult = await client.query(
      `SELECT glide_deep_link
       FROM nfc_tags
       WHERE tag_id = $1
         AND status = 'active'
       LIMIT 1`,
      [tagId]
    );

    if (linkResult.rows.length === 0) {
      return {
        statusCode: 404,
        body: `Invalid or unregistered tag: ${tagId}`,
      };
    }

    return {
      statusCode: 302,
      headers: { Location: linkResult.rows[0].glide_deep_link },
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  } finally {
    await client.end();
  }
};
