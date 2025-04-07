// netlify/functions/get-bnet-token.js
const fetch = require('node-fetch');

exports.handler = async function () {
  const client_id = process.env.BNET_CLIENT_ID;
  const client_secret = process.env.BNET_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server configuration error: Missing BNET credentials.',
      }),
    };
  }

  const url = 'https://us.battle.net/oauth/token';
  const auth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  try {
    const tokenResponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = await tokenResponse.json();

    if (!tokenResponse.ok) {
      // Log the error server-side for debugging, don't expose details usually
      console.error('Battle.net token error:', data);
      throw new Error(
        data.error_description || 'Failed to fetch Battle.net token',
      );
    }

    // Only return the access token to the client
    return {
      statusCode: 200,
      body: JSON.stringify({ access_token: data.access_token }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } catch (error) {
    console.error('Error in get-bnet-token function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};
