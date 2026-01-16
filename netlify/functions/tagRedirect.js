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

    // Record unique daily scan
    await client.query(
      `INSERT INTO nfc_scans (tag_id, scan_date)
       VALUES ($1, CURRENT_DATE)
       ON CONFLICT DO NOTHING`,
      [tagId]
    );

    // Increment visit_count only if today's scan exists
    const result = await client.query(
      `UPDATE nfc_tags
       SET visit_count = COALESCE(visit_count, 0) + 1,
           last_visit_at = NOW()
       WHERE tag_id = $1
         AND status = 'active'
         AND EXISTS (
           SELECT 1 FROM nfc_scans
           WHERE tag_id = $1
             AND scan_date = CURRENT_DATE
         )
       RETURNING glide_deep_link`,
      [tagId]
    );

    // If not incremented today, still fetch deep link
    if (result.rows.length === 0) {
      const fallback = await client.query(
        `SELECT glide_deep_link
         FROM nfc_tags
         WHERE tag_id = $1
           AND status = 'active'
         LIMIT 1`,
        [tagId]
      );

      if (fallback.rows.length === 0) {
        return {
          statusCode: 404,
          body: `Invalid or unregistered tag: ${tagId}`,
        };
      }

      return {
        statusCode: 302,
        headers: { Location: fallback.rows[0].glide_deep_link },
      };
    }

    return {
      statusCode: 302,
      headers: { Location: result.rows[0].glide_deep_link },
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  } finally {
    await client.end();
  }
};
