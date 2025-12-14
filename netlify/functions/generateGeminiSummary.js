const ilvlThreshold = 500;
const achievementThreshold = 20000;
const mountThreshold = 400;
const petThreshold = 800;
const playerGuildSizeThresholds = {
  sizeable: 100,
  large: 500,
  massive: 800,
};

// --- Helper Function to Build the PLAYER Prompt ---
function buildPlayerPrompt(playerData) {
  if (!playerData || typeof playerData !== 'object') {
    console.error(
      'Invalid playerData received for prompt building:',
      playerData,
    );
    throw new Error(
      'Internal server error: Invalid player data for prompt generation.',
    );
  }
  const {
    name,
    race,
    character_class,
    level,
    realm,
    region,
    faction,
    title,
    guild,
    guildRank,
    guildMemberCount,
    averageItemLevel,
    isBattlemaster,
    has250kHKs,
    has100kHKs,
    achievementPoints,
    mountsCollected,
    petsCollected,
    gameVersionDisplay,
  } = playerData;
  if (
    !name ||
    !race ||
    !character_class ||
    !level ||
    !realm ||
    !region ||
    !faction ||
    !gameVersionDisplay
  ) {
    console.error('Missing essential fields in playerData:', playerData);
    throw new Error(
      'Internal server error: Incomplete player data for prompt generation.',
    );
  }
  let prompt = `Adopt the persona of a seasoned Azerothian chronicler recounting tales of heroes of Azeroth, of stories of great adventurers. Write a moderate summary, aiming for 4 to 5 paragraphs. Make it an engaging and flavorful summary of the adventurer known as "${name}".\n\n`;
  prompt += `This ${race} ${character_class} of level ${level} hails from the ${realm} realm in the ${region} region and fights for the ${faction}. In your summary, act as if you do not know if the player is male or female. If the player's class is of a darker nature, like death knight or warlock, try to match the tone.`;
  if (title) prompt += ` They currently bear the title "${title}".`;
  let guildNarrative = '';
  if (guild) {
    let roleDescription = '';
    if (guildRank === 0)
      roleDescription = `leading the guild "${guild}" as Guild Master`;
    else if (guildRank === 1 || guildRank === 2)
      roleDescription = `holding a position of authority as an Officer within the guild "${guild}"`;
    else roleDescription = `a member of the guild "${guild}"`;
    let sizeDescription = '';
    if (guildMemberCount !== null && typeof guildMemberCount === 'number') {
      if (guildMemberCount > playerGuildSizeThresholds.massive)
        sizeDescription = `, a truly massive community whose influence undoubtedly shapes their realm, boasting over ${guildMemberCount.toLocaleString()} members`;
      else if (guildMemberCount > playerGuildSizeThresholds.large)
        sizeDescription = `, a large and influential guild known across ${realm}, home to more than ${guildMemberCount.toLocaleString()} adventurers`;
      else if (guildMemberCount > playerGuildSizeThresholds.sizeable)
        sizeDescription = `, a sizeable fellowship of over ${guildMemberCount.toLocaleString()} souls`;
    } else if (guildMemberCount === null)
      sizeDescription = ' (whose full strength remains chronicled elsewhere)';
    guildNarrative = ` They stand ${roleDescription}${sizeDescription}. Weave a narrative of their role within this guild and the guild's place in the world.`;
  } else {
    guildNarrative = ` They currently wander Azeroth unaffiliated with a guild, perhaps preferring the solitude of a lone adventurer or seeking the right banner to rally behind.`;
  }
  prompt += guildNarrative;
  if (
    averageItemLevel &&
    typeof averageItemLevel === 'number' &&
    averageItemLevel >= ilvlThreshold
  )
    prompt += ` Their prowess in combat is reflected in their formidable average equipment power of ${averageItemLevel}.`;
  let achievementsMentioned = false;
  let achievementNarrative = ' Their exploits have not gone unnoticed.';
  if (isBattlemaster) {
    achievementNarrative += ` Known across the battlegrounds of Azeroth, they have earned the prestigious and hard-won title of Battlemaster.`;
    achievementsMentioned = true;
  }
  if (has250kHKs) {
    achievementNarrative += ` Their prowess in the theater of war is undeniable, having claimed over 250,000 honorable kills against foes of the opposing faction.`;
    achievementsMentioned = true;
  } else if (has100kHKs) {
    achievementNarrative += ` A veteran of countless skirmishes, they have amassed over 100,000 honorable kills in service to their faction.`;
    achievementsMentioned = true;
  }
  if (
    achievementPoints &&
    typeof achievementPoints === 'number' &&
    achievementPoints >= achievementThreshold
  ) {
    achievementNarrative += ` Their long list of deeds across the world has earned them a significant ${achievementPoints.toLocaleString()} achievement points.`;
    achievementsMentioned = true;
  }
  if (achievementsMentioned) prompt += achievementNarrative;
  const mentionMounts =
    mountsCollected !== null &&
    typeof mountsCollected === 'number' &&
    mountsCollected >= mountThreshold;
  const mentionPets =
    petsCollected !== null &&
    typeof petsCollected === 'number' &&
    petsCollected >= petThreshold;
  if (mentionMounts || mentionPets) {
    let collectionNarrative = ` Beyond the battlefield, their dedication extends to collecting the wonders of Azeroth`;
    if (mentionMounts && mentionPets)
      collectionNarrative += `; their stables boast around ${mountsCollected.toLocaleString()} mounts, while their menagerie overflows with roughly ${petsCollected.toLocaleString()} unique companion pets.`;
    else if (mentionMounts)
      collectionNarrative += `, particularly evident in their impressive stable containing around ${mountsCollected.toLocaleString()} mounts.`;
    else if (mentionPets)
      collectionNarrative += `, showcased by a delightful menagerie holding roughly ${petsCollected.toLocaleString()} unique companion pets.`;
    prompt += collectionNarrative;
  }
  prompt += `\n\nWeave these details (or lack thereof, omitting gracefully if details are sparse or insignificant) into a compelling narrative fitting the Warcraft universe. You do not need to use the exact sentences as I used above, it is merely to provide useful information for your narrative summary of the character. Mention their game version context (${gameVersionDisplay}) if they are playing on a Classic or Classic Era server. Do not mention this game version detail if they are on retail. Focus on making them sound like a notable figure or hero of Azeroth that stands for a righteous cause for the people of Azeroth, perhaps hinting at their motivations or impact. End with a sentence that sparks curiosity about their past exploits or future adventures. Avoid clichés like "gather 'round". Ensure the tone matches the character's class (${character_class}) and faction (${faction}) where appropriate.`;

  return prompt;
}

// --- Helper Function to Build the REALM Prompt ---
function buildRealmPrompt(realmData) {
  if (!realmData || typeof realmData !== 'object') {
    console.error('Invalid realmData received for prompt building:', realmData);
    throw new Error(
      'Internal server error: Invalid realm data for prompt generation.',
    );
  }

  // Destructure and validate essential fields
  const { name, region, type, category } = realmData; // Assuming 'type' is the raw type string like 'Normal', 'PvP'
  if (!name || !region || !type || !category) {
    console.error('Missing essential fields in realmData:', realmData);
    throw new Error(
      'Internal server error: Incomplete realm data for prompt generation.',
    );
  }

  // Perform the type/focus transformation server-side
  let descriptiveRealmType = type;
  let gameplayFocus = 'mixed'; // Default assumption
  const lowerCaseType = type.toLowerCase();

  switch (lowerCaseType) {
    case 'normal':
      descriptiveRealmType = 'Normal (PvE Focus)';
      gameplayFocus = 'PvE';
      break;
    case 'pve':
      descriptiveRealmType = 'PvE';
      gameplayFocus = 'PvE';
      break;
    case 'pvp':
      descriptiveRealmType = 'PvP';
      gameplayFocus = 'PvP';
      break;
    case 'rp':
      descriptiveRealmType = 'RP';
      gameplayFocus = 'Roleplaying';
      break;
    case 'rppvp':
      descriptiveRealmType = 'RPPvP';
      gameplayFocus = 'Roleplaying with PVP';
      break;
    default:
      descriptiveRealmType = `${type} (Unknown Ruleset)`;
      gameplayFocus = `an unclear focus based on type '${type}'`;
      break;
  }

  // Construct the prompt using server-side data
  const prompt = `
Adopt the persona of a knowledgeable and eloquent Azerothian chronicler or historian, recounting tales of Azeroth, of stories of great adventurers... Do not reference anything indicating the digital nature of the game or the world. Do not present this in the first person or name yourself. Present the summary of the specified realm below in a factual, but stylized role-playing demeanor.
Your task is to generate a detailed historical summary (approximately 2-3 paragraphs) for the World of Warcraft realm specified below.

**Realm Details Provided:**
*   **Realm Name:** ${name}
*   **Region:** ${region}
*   **Realm Type:** ${descriptiveRealmType}
*   **Game Category:** ${category}

**Instructions for the Chronicler:**

1.  **Focus:** Craft a narrative history centered *specifically* on the "${name}" (${region}) realm within the context of the ${category} game version.
2.  **Origin:** Discuss its origins. Based on your training data, mention the *general time period* or *expansion context* when "${name}" likely launched (e.g., "one of the original launch realms," "established during the Burning Crusade era," "emerged during the Cataclysm"). Do NOT state a specific month or year unless verifiable public knowledge for *this specific realm*. Avoid guessing exact dates. Using general eras or major events is preferred.
3.  **Realm Type Influence & Gameplay Focus:** This is crucial. Explain how its designation as a **"${descriptiveRealmType}"** realm shapes its culture and the typical experiences of its inhabitants. If the gameplay focus has to do with RP, or roleplaying, as shown here, ${gameplayFocus}, then describe what this means for adventurers on that realm and how it affects them. Be sure to never say similar descriptions like "Player Versus Environment" or "Player versus Player". Stick to just using the acronyms like PVE or PVP, when referencing the realm type or gameplay focus. The only exception is RP you can say the full thing as Roleplaying.
4.  **Notable History & Community:** Weave in any *widely known and verifiable* historical events, significant server-first achievements (relevant to the ${category}), renowned *long-standing guilds specifically associated with "${name}" or its connected group*, or famous player figures *if* your training data strongly supports their connection to *this specific realm*.
5.  **Famous Guilds - IMPORTANT CAVEAT:** Mention globally famous competitive guilds (like Liquid, Echo, Method, etc.) **ONLY IF** your training data strongly and accurately indicates they had a significant, well-documented historical presence, origin, or major achievement *directly tied to "${name}" or its specific connected realms*. **If there is no such direct, verifiable connection, DO NOT mention these famous guilds at all.** Focus on the realm's *own* history.
6.  **Tone & Style:** Write with narrative flair, evocative language, and the authority of an Azerothian historian. Maintain factual accuracy based on the provided details and your general knowledge base.
7.  **Handling Scarcity:** If significant historical details or notable events specific to "${name}" are scarce in your training data, acknowledge this humbly (e.g., "While specific chronicles are sparse...") rather than fabricating information. Prioritize accuracy and relevance to the provided realm details.
8.  **Length:** Aim for 2-3 informative paragraphs. Weave these details (or lack thereof) into a compelling narrative fitting the Warcraft universe. End with a sentence that sparks curiosity about the server's past exploits or future adventures. Avoid clichés like "gather 'round'", or "From the dusty tomes".

Begin your chronicle now for "${name}" (${region}).
`;

  return prompt;
}

// --- Main Handler ---
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('FATAL: Missing Gemini API key environment variable.');
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server configuration error: Missing API key.',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (err) {
    console.error('Error parsing request body:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  let generatedPrompt;
  let requestType = ''; // To know which type of prompt was generated

  try {
    // *** aCheck for playerData OR realmData ***
    if (requestBody?.playerData && typeof requestBody.playerData === 'object') {
      generatedPrompt = buildPlayerPrompt(requestBody.playerData);
      requestType = 'Player';
    } else if (
      requestBody?.realmData &&
      typeof requestBody.realmData === 'object'
    ) {
      generatedPrompt = buildRealmPrompt(requestBody.realmData);
      requestType = 'Realm';
    } else {
      // Neither expected key was found
      console.error(
        "Invalid request structure. Missing 'playerData' or 'realmData' object:",
        requestBody,
      );
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Invalid request: 'playerData' or 'realmData' object missing or invalid.",
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
  } catch (promptError) {
    console.error(
      `Error building ${requestType || 'Unknown'} prompt:`,
      promptError,
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          promptError.message ||
          `Failed to generate ${requestType} prompt content.`,
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  // Construct the actual payload for the Gemini API
  const geminiApiPayload = {
    contents: [{ parts: [{ text: generatedPrompt }] }],
    generationConfig: {
      temperature: requestType === 'Realm' ? 0.8 : 0.9,
      maxOutputTokens: 1024,
    },
  };

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;

    try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(geminiApiPayload),
    });

    const responseBodyText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseBodyText);
    } catch (parseErr) {
      console.error(
        `Failed to parse Gemini response for ${requestType} request as JSON. Status:`,
        response.status,
        'Body:',
        responseBodyText,
      );
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: 'Received non-JSON response from AI service.',
          details: responseBodyText,
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    if (!response.ok || responseData.error) {
      console.error(
        `Error response from Gemini API for ${requestType} request:`,
        response.status,
        responseData,
      );
    }
    // Log potential issues even on 200 OK
    if (responseData.promptFeedback?.blockReason) {
      console.warn(
        `Gemini ${requestType} prompt blocked:`,
        responseData.promptFeedback.blockReason,
        responseData.promptFeedback.safetyRatings,
      );
    }
    if (
      responseData.candidates?.[0]?.finishReason &&
      responseData.candidates[0].finishReason !== 'STOP'
    ) {
      console.warn(
        `Gemini ${requestType} finish reason:`,
        responseData.candidates[0].finishReason,
        responseData.candidates[0].safetyRatings,
      );
    }

    return {
      statusCode: response.status,
      body: JSON.stringify(responseData), // Forward Gemini's response
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error) {
    console.error(
      `Error fetching from Gemini API for ${requestType} request:`,
      error,
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: `Failed to communicate with the AI service for ${requestType} summary.`,
        details: error.message,
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
}
