// netlify/functions/getAccessToken.js

export async function handler(event, context) {
  // Retrieve keys securely from process.env (which are set via Netlify)
  const clientId = process.env.BNET_CLIENT_ID;
  const clientSecret = process.env.BNET_CLIENT_SECRET;

  // Use native Node.js Buffer to encode credentials to base64
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = 'https://us.battle.net/oauth/token';

  try {
    // Use native fetch (Node.js v22 supports it)
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    // Check if the token request was successful
    if (!tokenResponse.ok) {
      const errorDetail = await tokenResponse.text();
      return {
        statusCode: tokenResponse.status,
        body: JSON.stringify({ error: errorDetail }),
      };
    }

    const data = await tokenResponse.json();
    // Return just the access token in the response
    return {
      statusCode: 200,
      body: JSON.stringify({ access_token: data.access_token }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
