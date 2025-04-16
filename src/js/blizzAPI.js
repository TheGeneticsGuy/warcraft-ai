async function getAccessToken() {
  try {
    // Call the Netlify function endpoint (relative path)
    const response = await fetch('/.netlify/functions/getAccessToken', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${await response.text()}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}

export { getAccessToken };
