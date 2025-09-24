require('dotenv').config();
const { GEMINI_API_KEY } = require('../config/defaults.json');

// The base URL for the Gemini API.
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Converts a string from a mixed script (like Tanglish or Hinglish) to a common language/script
 * and then translates it to a target language.
 * @param {string} text The input text to transliterate and translate.
 * @param {string} targetLang The target language code (e.g., "en", "es").
 * @returns {Promise<object>} A promise that resolves to an object with `commonText` and `translatedText`.
 */
async function transliterateAndTranslate(text, targetLang = "en") {
  const systemPrompt = "You are a helpful translator. Your only job is to provide a JSON response with the requested information.";
  const userPrompt = `
    1. Transliterate the following text into a common script (like English letters).
    2. Then, translate the original text into ${targetLang}.
    
    The text to process is: "${text}"
    
    Provide the response as a JSON object with two fields:
    - "commonText": The transliterated text.
    - "translatedText": The translated text.
  `;

  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "commonText": { "type": "STRING" },
          "translatedText": { "type": "STRING" }
        }
      }
    },
  };

  const response = await callGeminiApiWithBackoff(apiUrl, payload);
  if (response) {
    return response;
  } else {
    // Fallback in case of API failure or unexpected response.
    console.error("Failed to get a valid response from the Gemini API.");
    return { commonText: text, translatedText: text };
  }
}

/**
 * Calls the Gemini API with exponential backoff to handle potential rate limiting.
 * @param {string} url The API endpoint URL.
 * @param {object} payload The request body.
 * @param {number} retries The current retry count.
 * @returns {Promise<object|null>} The parsed JSON response or null on failure.
 */
async function callGeminiApiWithBackoff(url, payload, retries = 0) {
  const maxRetries = 5;
  const baseDelay = 1000; // 1 second

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        return JSON.parse(content);
      }
    } else if (response.status === 429 && retries < maxRetries) {
      // Exponential backoff for rate limiting
      const delay = baseDelay * Math.pow(2, retries) + Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiApiWithBackoff(url, payload, retries + 1);
    }

    return null;
  } catch (error) {
    console.error("Error during API call:", error);
    if (retries < maxRetries) {
      const delay = baseDelay * Math.pow(2, retries) + Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiApiWithBackoff(url, payload, retries + 1);
    }
    return null;
  }
}

// Export the function for use in other modules.
module.exports = { transliterateAndTranslate };
