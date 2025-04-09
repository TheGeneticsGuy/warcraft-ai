# Warcraft AI Reporter

[![Warcraft AI Reporter](https://i.imgur.com/hp9StIT.jpeg)](https://warcraft-ai-report.netlify.app/)
_Click the image to navigate to the live deployed website on Netlify!_

## Class Details

**Author:** Aaron Topping

**Class:** WDD 330 - BYU-Idaho, Winter Session 2025

**Professor:** Jordan Boyce

## Summary of the Project

Discover unique insights into the Players and Realms surrounding World of Warcraft. This site uses AI to generate brief, fun, flavorful and historical summaries for WoW realms or engaging character chronicles for players based on some of the available Armory data. In additiona to being able to explore the current realm status of all available realms, have fun reading an AI generated summary and history of your favorite realms. Get a unique perspective on all of your own alts, or those of your friends and guildies! Have fun exploring!

# Meta-Tags enabled:

_Follow the demo link below and **CLICK** "Parse Meta Data" to generate_

[View Meta Tag demo](https://metatags.io/?url=https%3A%2F%2Fwarcraft-ai-report.netlify.app%2F)

```
<!-- META properties Facebook -->
  <meta property="og:title" content="Warcraft AI Report" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://warcraft-ai-report.netlify.app/" />
  <meta property="og:image" content="/images/link-image.webp" />
  <meta property="og:description" content="WDD 330 Aaron Topping - Final Project - Warcraft AI Report" />

  <!-- Twitter(X) Card tags -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Warcraft AI Report" />
  <meta name="twitter:description" content="WDD 330 Aaron Topping - Final Project - Warcraft AI Report" />
  <meta name="twitter:image" content="/images/link-image.webp" />
  <meta name="twitter:url" content="https://warcraft-ai-report.netlify.app/" />
</head>
```

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

[Click here to view the Warcraft AI Reporter Project!](https://warcraft-ai-report.netlify.app/)
