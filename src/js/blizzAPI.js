// src/js/blizzAPI.js
import ENV from './env.js';

async function getKeys() {
  try {
    return {
      client_id: ENV.CLIENT_ID,
      client_secret: ENV.CLIENT_SECRET
    };
  } catch (error) {
    console.error('Error getting keys:', error);
  }
}

async function getAccessToken() {
  const keys = await getKeys();
  console.log('Keys:', keys); // Debug: Check what client_id and client_secret are
  if (keys) {
    const { client_id, client_secret } = keys;
    const url = 'https://us.battle.net/oauth/token';
    const auth = btoa(`${client_id}:${client_secret}`);
    console.log('Auth Header:', `Basic ${auth}`); // Debug: Check the encoded auth
    try {
      const tokenResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      if (tokenResponse.ok) {
        const data = await tokenResponse.json();
        return data.access_token;
      } else {
        throw new Error(await tokenResponse.text());
      }
    } catch (error) {
      console.log(error);
    }
  }
}

export { getAccessToken };
