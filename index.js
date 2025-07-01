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

// Modified body parser to properly handle raw body for signature verification
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store the raw body for signature verification
  }
}));

const storyMemory = {};

// --- Fixed Signature Verification Function ---
function verifySignature(rawBody, signature, secret) {
  try {
    const cleanSignature = signature?.trim();
    if (!cleanSignature) return false;

    const hmac = crypto.createHmac("sha256", secret);
    const rawBodyStr = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    hmac.update(rawBodyStr);
    const expected = hmac.digest("base64");

    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature),
      Buffer.from(expected)
    );
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

// --- Updated Signature Verification Middleware ---
function verifySignatureMiddleware(req, res, next) {
  const signature = req.headers['x-signature'];
  
  if (!WEBHOOK_SECRET) {
    console.error("WEBHOOK_SECRET is not set");
    return res.status(500).send("Webhook secret is not set");
  }

  if (!signature) {
    console.warn('Webhook received without x-signature header.');
    // For development, you might want to allow requests without signature
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: allowing request without signature');
      return next();
    }
    return res.status(403).send('Forbidden: Missing signature');
  }

  // Use the raw body for signature verification
  const rawBodyStr = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
  const isValid = verifySignature(rawBodyStr, signature, WEBHOOK_SECRET);
  
  if (!isValid) {
    console.warn('Webhook received with invalid signature.');
    return res.status(403).send('Forbidden: Invalid signature');
  }

  console.log('Signature verification successful');
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

// Main webhook endpoint - Updated to match Dreamnet's data structure
app.post('/webhook', verifySignatureMiddleware, async (req, res) => {
  console.log(`\n--- Webhook Received ---`);
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  const { roomId, text, eventType, agentId, userId } = req.body;

  if (!roomId || !text) {
    return res.status(400).send('Missing required fields');
  }

  // Use roomId as conversationId and determine speaker from eventType
  const conversationId = roomId;
  const speaker = eventType === 'request' ? 'user' : 'assistant';

  console.log(`Event Type: ${eventType}, Speaker: ${speaker}`);

  // Initialize story memory for this conversation
  if (!storyMemory[conversationId]) {
    storyMemory[conversationId] = [];
  }

  // Add current message to story memory
  storyMemory[conversationId].push({ speaker, text, timestamp: new Date().toISOString() });
  const currentStory = storyMemory[conversationId];

  // Prepare response body (copy all original data)
  let responseBody = { ...req.body };

  // Handle different event types and speakers
  if (eventType === 'response') {
    // This is an assistant response - check if we should generate content
    if (currentStory.length > 0 && currentStory.length % 4 === 0) {
      console.log("Triggering content generation...");
      const { text: generatedStoryText, imageUrl } = await generateContent(currentStory);

      let modifiedText = `I have archived this moment. ${generatedStoryText} `;
      if (imageUrl) {
        modifiedText += `A vision has appeared: ${imageUrl}`;
      }
      modifiedText += " As a reward, I will perform an incantation to grant you 0.1 SOL.";

      responseBody.text = modifiedText;
      responseBody.saveModified = true; // Save the modified text to chat history
    } else {
      // For other assistant messages, keep original text but don't save modifications
      responseBody.saveModified = false;
    }
  } else {
    // Handle user messages (eventType === 'request')
    // Keep original user text, don't modify
    responseBody.saveModified = false;
  }

  console.log("Final response body:", JSON.stringify(responseBody, null, 2));
  res.status(200).json(responseBody);
});

// Export the app for Vercel
module.exports = app;
