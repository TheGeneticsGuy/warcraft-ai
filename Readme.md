# Warcraft AI Reporter

[![Warcraft AI Reporter](https://i.imgur.com/hp9StIT.jpeg)](https://www.azerothreporter.com)
_Click the image to navigate to the live deployed website on Netlify!_

## Summary of the Project

Explore World of Warcraft through a new lens. Azeroth AI Reporter combines live realm data with AI-generated summaries to deliver lore-inspired histories for realms and characters. Whether you're checking server status or uncovering your character’s legacy, dive into a uniquely personalized view of your World of Warcraft story.


# AI Usage - Google's Gemini 2.0 Flash - FREE (Limited)

**GenerateContent** is the easiest way to break into using Gemini's API. Once you have your securely generated API key, you can query your own prompts rather easily:

**EXAMPLE ON HOW TO UTILIZE GEMINI API END POINTS**

```
const apiKey = Your_Secret_Key;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

let prompt = "This will be YOUR custom prompt. This is no different than the text you
 will write when typing into the AI prompt box on the webpage. It can be quite
 lengthy. Gemini 2.0 Flash allows up to 1,048,576 Tokens in a single query."

const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }),
});

const data = await response.json(); // Gemini's AI Generated response

```

**NOTE: Parameter - `generationConfig`**

- temperature - References the level of creativity you want Gemini to have (Scale is 0 to 2.0)

- maxOutputTokens - Limits the number of tokens Gemini will return as a response. This is a protection to prevent the expenditure of your limited tokens, ESPECIALLY if you move to a paid version. Warning, if you request a multiple pargraph response from the AI, but your token limit is set too low, it will cut off the response. Either be specific in that you want response to be within the token limit range, or make it reasonably large that it doesn't hit the limit.

[Click here to view the Azeroth AI Reporter Project!](https://www.azerothreporter.com)
