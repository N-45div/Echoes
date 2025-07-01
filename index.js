const express = require('express');
const crypto = require('crypto');
const { GoogleGenerativeAI, Modality } = require('@google/generative-ai');
const { put } = require('@vercel/blob');
const cors = require('cors');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();

// IMPORTANT: For a real application, use process.env.WEBHOOK_SECRET
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// API Keys from environment variables
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

app.use(cors()); // Enable CORS for all origins
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store the raw body for signature verification
  }
}));

const storyMemory = {};

// --- Signature Verification Middleware ---
function verifySignature(req, res, next) {
  const signature = req.headers['x-signature'];
  if (!signature) {
    console.warn('Webhook received without x-signature header.');
    // For Vercel deployment, we might allow requests without signature for testing
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    return res.status(403).send('Forbidden: Missing signature');
  }

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = hmac.update(req.rawBody).digest('base64');

  if (digest !== signature) {
    console.warn('Webhook received with invalid signature.');
    return res.status(403).send('Forbidden: Invalid signature');
  }

  next();
}

// --- Gemini Image Generation and Vercel Blob Upload ---
async function generateImageAndUpload(imagePrompt) {
  if (!GEMINI_API_KEY || !BLOB_READ_WRITE_TOKEN) {
    console.error("GEMINI_API_KEY or BLOB_READ_WRITE_TOKEN is not set.");
    return null;
  }

  console.log("\n--- GENERATING IMAGE WITH GEMINI ---");
  console.log("Image Prompt:", imagePrompt);

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-preview-image-generation" });

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: imagePrompt }]
      }],
      generationConfig: {
        responseMimeType: "image/png",
      },
      safetySettings: [],
    });

    const response = result.response;
    const imageData = response.candidates[0].content.parts[0].inlineData.data;

    console.log("--- IMAGE GENERATION COMPLETE. UPLOADING TO VERCEL BLOB ---");

    // Convert base64 to Buffer
    const imageBuffer = Buffer.from(imageData, 'base64');
    const filename = `comic-panel-${Date.now()}.png`;

    const { url } = await put(filename, imageBuffer, {
      access: 'public',
      token: BLOB_READ_WRITE_TOKEN,
      contentType: 'image/png',
    });

    console.log("--- IMAGE UPLOADED TO VERCEL BLOB ---");
    console.log("Public URL:", url);
    return url;

  } catch (error) {
    console.error("Error generating image with Gemini or uploading to Blob:", error);
    return null;
  }
}

// --- OpenRouter Content Generation ---
function generateContent(story) {
  if (!OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set.");
    return Promise.resolve({ text: "(Error: OpenRouter API key missing)", imageUrl: null });
  }

  console.log("\n--- GENERATING STORY TEXT WITH OPENROUTER ---");
  const messages = story.map(msg => ({ role: msg.speaker === 'user' ? 'user' : 'assistant', content: msg.text }));

  messages.unshift({
    role: "system",
    content: "You are Kyle, the Exiled Archivist. Collaboratively write a fantasy story. Provide a short, dreamlike continuation of the narrative. Then, generate a concise, descriptive prompt for an image that captures the essence of your text. Format: [Your Story Continuation] ---IMAGE_PROMPT--- [Image Prompt]"
  });

  const options = {
    method: "POST",
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "mistralai/mistral-7b-instruct:free",
      "messages": messages
    })
  };

  return new Promise((resolve) => {
    request(options, async (error, response, body) => {
      if (error) {
        console.error("Error generating content:", error);
        return resolve({ text: "(Error generating story content or image)", imageUrl: null });
      }

      try {
        const data = JSON.parse(body);
        if (data.error) {
          console.error("Error from OpenRouter API:", data.error.message);
          return resolve({ text: `(Error from OpenRouter: ${data.error.message})`, imageUrl: null });
        }
        const fullResponse = data.choices[0].message.content;
        const parts = fullResponse.split("---IMAGE_PROMPT---");
        const storyContinuation = parts[0].trim();
        const imagePrompt = parts[1] ? parts[1].trim() : storyContinuation;

        console.log("--- OPENROUTER GENERATION COMPLETE ---");

        const imageUrl = await generateImageAndUpload(imagePrompt);

        resolve({ text: storyContinuation, imageUrl: imageUrl });
      } catch (e) {
        console.error("Error parsing response from OpenRouter:", e);
        resolve({ text: "(Error parsing response from OpenRouter)", imageUrl: null });
      }
    });
  });
}



app.get('/', (req, res) => {
  res.send('Echoes of Creation is listening!');
});

// Main webhook endpoint
app.post('/webhook', verifySignature, async (req, res) => {
  console.log(`\n--- Webhook Received: [Speaker: ${req.body.speaker}] ---`);

  const { conversationId, text, speaker } = req.body;

  if (!conversationId || !speaker) {
    return res.status(400).send('Missing required fields');
  }

  if (!storyMemory[conversationId]) {
    storyMemory[conversationId] = [];
  }

  storyMemory[conversationId].push({ speaker, text, timestamp: new Date().toISOString() });
  const currentStory = storyMemory[conversationId];

  let responseBody = req.body;

  if (speaker.toLowerCase() !== 'user') {
    if (currentStory.length > 0 && currentStory.length % 4 === 0) {
      console.log("Triggering content generation...");
      const { text: generatedStoryText, imageUrl } = await generateContent(currentStory);

      let modifiedText = `I have archived this moment. ${generatedStoryText} `;
      if (imageUrl) {
        modifiedText += `A vision has appeared: ${imageUrl}`;
      }
      modifiedText += " As a reward, I will perform an incantation to grant you 0.1 SOL.";

      responseBody.text = modifiedText;
    }

    // responseBody = transformForSwig(responseBody);
  }

  console.log("Final response body:", JSON.stringify(responseBody, null, 2));
  res.status(200).json(responseBody);
});

// Export the app for Vercel
module.exports = app;