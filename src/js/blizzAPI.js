async function getAccessToken() {
  try {
    // Call your Netlify Function endpoint to keep ID secret
    const response = await fetch('/.netlify/functions/get-bnet-token');

    if (!response.ok) {
      // Try to get error details from the function's response
      const errorData = await response
        .json()
        .catch(() => ({
          error: 'Failed to fetch token and parse error response.',
        }));
      console.error(
        'Error fetching token from Netlify function:',
        response.status,
        errorData,
      );
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`,
      );
    }

    const data = await response.json();
    if (data.access_token) {
      return data.access_token;
    } else {
      throw new Error(
        'Access token not found in response from Netlify function.',
      );
    }
  } catch (error) {
    console.error('Error getting access token:', error);
    // Handle the error appropriately in your UI, maybe return null or rethrow
    return null;
  }
}

export { getAccessToken };
