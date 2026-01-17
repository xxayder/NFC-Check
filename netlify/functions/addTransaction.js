const { Client } = require("pg");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "ok" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const business_id = body.business_id;
  const tag_id = (body.tag_id || "").toString().trim().toLowerCase();
  const amount_cents = Number(body.amount_cents);

  if (!business_id || !tag_id || !Number.isFinite(amount_cents) || amount_cents <= 0) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing/invalid fields", expected: ["business_id", "tag_id", "amount_cents (>0)"] }),
    };
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    await client.query(
      `INSERT INTO nfc_transactions (business_id, tag_id, amount_cents)
       VALUES ($1, $2, $3)`,
      [business_id, tag_id, Math.round(amount_cents)]
    );
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ 
      success: true,
      receive: { business_id, tag_id, amount_cents: Math.round(amount_cents)} }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error" }) };
  } finally {
    await client.end();
  }
};
