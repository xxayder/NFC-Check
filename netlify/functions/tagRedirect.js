const { Client } = require("pg");

exports.handler = async function (event) {
  // Expected path: /t/<tagId>
  const parts = event.path.split("/").filter(Boolean);
  const tagIdRaw = parts[parts.length - 1] || "";
  const tagId = tagIdRaw.trim().toLowerCase();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      statusCode: 500,
      body: "Missing DATABASE_URL env var",
    };
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();

    // Increment visit count and return deep link atomically
    const result = await client.query(
  `UPDATE nfc_tags
   SET visit_count = CASE
       WHEN last_visit_at::date < CURRENT_DATE OR last_visit_at IS NULL
       THEN COALESCE(visit_count, 0) + 1
       ELSE visit_count
     END,
     last_visit_at = NOW()
   WHERE tag_id = $1
     AND status = 'active'
   RETURNING glide_deep_link`,
  [tagId]
);


    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        body: `Invalid or unregistered tag: ${tagId}`,
      };
    }

    return {
      statusCode: 302,
      headers: {
        Location: result.rows[0].glide_deep_link,
      },
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: "Server error",
    };
  } finally {
    await client.end();
  }
};
