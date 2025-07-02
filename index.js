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

// Story progress tracking for dynamic rewards
const storyProgress = {};
const rewardTiers = {
  bronze: { threshold: 5, reward: 0.1, emoji: "🥉" },
  silver: { threshold: 15, reward: 0.25, emoji: "🥈" },
  gold: { threshold: 30, reward: 0.5, emoji: "🥇" },
  legendary: { threshold: 50, reward: 1.0, emoji: "👑" }
};

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

// --- Simple Image Generation using Pollinations API ---
async function generateImageAndUpload(imagePrompt) {
  console.log("\n--- GENERATING IMAGE WITH POLLINATIONS ---");
  console.log("Image Prompt:", imagePrompt);

  try {
    // Use Pollinations API for free image generation
    const encodedPrompt = encodeURIComponent(imagePrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${Math.floor(Math.random() * 1000000)}`;
    
    console.log("--- IMAGE GENERATION COMPLETE ---");
    console.log("Public URL:", imageUrl);
    return imageUrl;

  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
}

// --- OpenRouter Content Generation with Emotional Context ---
function generateContent(story, emotion = 'mysterious') {
  if (!OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set.");
    return Promise.resolve({ text: "(Error: OpenRouter API key missing)", imageUrl: null });
  }

  console.log("\n--- GENERATING STORY TEXT WITH OPENROUTER ---");
  const messages = story.map(msg => ({ role: msg.speaker === 'user' ? 'user' : 'assistant', content: msg.text }));

  messages.unshift({
    role: "system",
    content: `You are Kyle, the Exiled Archivist. You have limited memory and sometimes forget past conversations. Write a ${emotion} continuation of this fantasy story. Include spatial descriptions and character movements. Then generate an image prompt. Format: [Story with movement/blocking] ---IMAGE_PROMPT--- [${emotion} visual prompt]`
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
      "messages": messages,
      "temperature": emotion === 'chaotic' ? 0.9 : 0.7
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
        const imagePrompt = parts[1] ? `${parts[1].trim()}, ${emotion} mood, cinematic lighting` : `${storyContinuation}, ${emotion} atmosphere`;

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

// Detect emotional context
function detectEmotion(text) {
  const lowercaseText = text.toLowerCase();
  for (const [emotion, keywords] of Object.entries(emotionMap)) {
    if (keywords.some(keyword => lowercaseText.includes(keyword))) {
      return emotion;
    }
  }
  return 'mysterious'; // default
}

// Calculate dynamic rewards
function calculateReward(progress) {
  for (const [tier, info] of Object.entries(rewardTiers).reverse()) {
    if (progress >= info.threshold) {
      return { ...info, tier };
    }
  }
  return { ...rewardTiers.bronze, tier: 'bronze' };
}

// Generate emotional soundtrack descriptions
function getEmotionalSoundtrack(emotion) {
  const soundtracks = {
    mysterious: 'ethereal whispers and distant chimes',
    excited: 'triumphant orchestral swells',
    melancholy: 'haunting violin melodies',
    chaotic: 'discordant drums and wild harmonies'
  };
  return soundtracks[emotion] || soundtracks.mysterious;
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

// Initialize story memory for this conversation with memory limits
  if (!storyMemory[conversationId]) {
    storyMemory[conversationId] = [];
    storyProgress[conversationId] = 0;
  }

  // Kyle's memory limitation - he forgets older interactions
  if (storyMemory[conversationId].length >= KYLE_MEMORY_LIMIT) {
    storyMemory[conversationId] = storyMemory[conversationId].slice(-KYLE_MEMORY_LIMIT);
    console.log("Kyle's memory is full - forgetting older interactions");
  }

  // Check if user mentions something Kyle should have forgotten
  const shouldKyleBeConfused = KYLE_CONFUSION_TRIGGERS.some(trigger => 
    text.toLowerCase().includes(trigger)
  ) && storyMemory[conversationId].length > 10;

  // Add current message to story memory
  storyMemory[conversationId].push({ speaker, text, timestamp: new Date().toISOString() });
  const currentStory = storyMemory[conversationId];
  storyProgress[conversationId]++;

  // Detect emotional context for image generation
  const detectedEmotion = detectEmotion(text);
  console.log(`Detected emotion: ${detectedEmotion}`);

  // Prepare response body (copy all original data)
  let responseBody = { ...req.body };

  // Handle different event types and speakers
  if (eventType === 'response') {
    // This is an assistant response - check if we should generate content
    const shouldGenerate = Math.random() < 0.3 && currentStory.length >= 4; // 30% chance after 4+ messages
    
    if (shouldGenerate) {
      console.log("Triggering content generation...");
      const { text: generatedStoryText, imageUrl } = await generateContent(currentStory);

      let modifiedText = `🌟 I have archived this moment. ${generatedStoryText}\n\n`;
      
      if (imageUrl) {
        modifiedText += `✨ *A vision materializes before you...* ✨\n\n`;
      }
      
      modifiedText += "💰 As a reward, I will perform an incantation to grant you 0.1 SOL. 💰";

      // Try to include image data for auto-embedding
      responseBody.text = modifiedText;
      
      // Add image metadata for platforms that support it
      if (imageUrl) {
        responseBody.attachments = [{
          type: 'image',
          url: imageUrl,
          alt: 'Generated Vision'
        }];
        
        // Also try common image embedding formats
        responseBody.image = imageUrl;
        responseBody.imageUrl = imageUrl;
        responseBody.media = [{
          type: 'image',
          url: imageUrl
        }];
      }
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
