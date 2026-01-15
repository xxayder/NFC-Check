import { Client } from "pg";

export async function handler(event) {
  // Expected path: /t/<tagId>
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

    const result = await client.query(
      `SELECT glide_deep_link
       FROM nfc_tags
       WHERE tag_id = $1
       AND status = 'active'
       LIMIT 1`,
      [tagId]
    );

    if (result.rows.length === 0) {
      return { statusCode: 404, body: `Invalid or unregistered tag: ${tagId}` };
    }

    return {
      statusCode: 302,
      headers: { Location: result.rows[0].glide_deep_link },
    };
  } catch (err) {
  console.error(err);
  return {
    statusCode: 500,
    body: "Server error",
  };
}
 finally {
    await client.end();
  }
}
