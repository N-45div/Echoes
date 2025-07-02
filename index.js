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

// Story memory system - Kyle's limited memory
const storyMemory = {};
const KYLE_MEMORY_LIMIT = 15; // Kyle can only remember last 15 interactions
const KYLE_CONFUSION_TRIGGERS = [
  'remember when', 'you said before', 'earlier you mentioned', 
  'like last time', 'from before', 'you told me'
];

// Emotion detection mapping
const emotionMap = {
  mysterious: ['whisper', 'shadow', 'secret', 'hidden', 'unknown', 'dark'],
  excited: ['amazing', 'incredible', 'wow', 'fantastic', 'awesome', 'brilliant'],
  melancholy: ['sad', 'lonely', 'lost', 'melancholy', 'sorrow', 'tears'],
  chaotic: ['chaos', 'wild', 'crazy', 'insane', 'mad', 'frantic', 'explosion']
};

// Swig action triggers mapping
const swigActionTriggers = {
  CREATE_SWIG: ['create swig', 'make swig', 'new swig', 'setup swig', 'initialize swig', 'start swig', 'build swig'],
  GET_SWIG_BALANCE: ['swig balance', 'check swig', 'balance of swig', 'how much in swig', 'swig wallet balance'],
  GET_SWIG_TOKEN_BALANCE: ['swig token balance', 'swig spl balance', 'token balance in swig', 'spl balance in swig'],
  GET_SWIG_AUTHORITIES: ['swig authorities', 'authorities on swig', 'swig signers', 'who can sign', 'list authorities'],
  ADD_SWIG_AUTHORITY: ['add authority', 'add signer', 'grant access', 'add to swig'],
  TRANSFER_TO_SWIG: ['transfer to swig', 'send to swig', 'fund swig', 'deposit to swig'],
  TRANSFER_TOKEN_TO_SWIG: ['transfer token to swig', 'send token to swig', 'transfer spl to swig', 'fund swig with token'],
  SWIG_TRANSFER_TO_ADDRESS: ['transfer from swig', 'send from swig', 'swig transfer to', 'use swig to transfer'],
  SWIG_TRANSFER_TOKEN_TO_ADDRESS: ['transfer token from swig', 'send token from swig', 'swig transfer token to'],
  SWIG_TRANSFER_TO_AUTHORITY: ['transfer from swig to authority', 'send from swig to authority', 'swig transfer to authority'],
  SWIG_TRANSFER_TOKEN_TO_AUTHORITY: ['transfer token from swig to authority', 'swig transfer token to authority']
};

// Reward-based Swig actions
const rewardActions = {
  bronze: { amount: 0.05, message: "🥉 Bronze achievement! Granting you 0.05 SOL from my mystical reserves." },
  silver: { amount: 0.1, message: "🥈 Silver mastery! Bestowing 0.1 SOL upon you from the archives." },
  gold: { amount: 0.25, message: "🥇 Golden triumph! Rewarding you with 0.25 SOL from my treasury." },
  legendary: { amount: 0.5, message: "👑 Legendary status! You have earned 0.5 SOL from the cosmic vault!" }
};

app.use(cors()); // Enable CORS for all origins

// Modified body parser to properly handle raw body for signature verification
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store the raw body for signature verification
  }
}));

// Story progress tracking for dynamic rewards
const storyProgress = {};
const userWallets = {}; // Track user wallet addresses
const rewardTiers = {
  bronze: { threshold: 5, reward: 0.05, emoji: "🥉" },
  silver: { threshold: 15, reward: 0.1, emoji: "🥈" },
  gold: { threshold: 30, reward: 0.25, emoji: "🥇" },
  legendary: { threshold: 50, reward: 0.5, emoji: "👑" }
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

// --- Swig Action Detection ---
function detectSwigAction(text) {
  const lowercaseText = text.toLowerCase();
  
  for (const [action, triggers] of Object.entries(swigActionTriggers)) {
    if (triggers.some(trigger => lowercaseText.includes(trigger))) {
      return action;
    }
  }
  return null;
}

// --- Generate Swig Action Prompt ---
function generateSwigActionPrompt(action, userText, userAddress = null) {
  const prompts = {
    CREATE_SWIG: "Can you create a new swig wallet for me?",
    GET_SWIG_BALANCE: "What's the balance of my swig wallet?",
    GET_SWIG_TOKEN_BALANCE: "Get swig token balance for the requested token",
    GET_SWIG_AUTHORITIES: "List swig signers and authorities",
    ADD_SWIG_AUTHORITY: userAddress ? `Add authority ${userAddress} to my swig wallet.` : "Add the requested authority to my swig wallet.",
    TRANSFER_TO_SWIG: "Fund the swig with 0.1 SOL from my main wallet.",
    TRANSFER_TOKEN_TO_SWIG: "Transfer tokens to swig wallet as requested.",
    SWIG_TRANSFER_TO_ADDRESS: userAddress ? `Transfer SOL from swig to ${userAddress}` : "Transfer SOL from swig to the specified address.",
    SWIG_TRANSFER_TOKEN_TO_ADDRESS: userAddress ? `Send tokens from swig to ${userAddress}` : "Send tokens from swig to the specified address.",
    SWIG_TRANSFER_TO_AUTHORITY: userAddress ? `Transfer SOL from swig to authority ${userAddress}` : "Transfer SOL from swig to the specified authority.",
    SWIG_TRANSFER_TOKEN_TO_AUTHORITY: userAddress ? `Transfer tokens from swig to authority ${userAddress}` : "Transfer tokens from swig to the specified authority."
  };
  
  return prompts[action] || userText;
}

// --- Generate Reward Transfer ---
function generateRewardTransfer(tier, userAddress) {
  const reward = rewardActions[tier];
  if (!reward || !userAddress) return null;
  
  return `${reward.message} Transfer ${reward.amount} SOL from swig to ${userAddress}`;
}

// --- Enhanced Image Generation with Multiple Fallbacks ---
async function generateImageAndUpload(imagePrompt) {
  console.log("\n--- GENERATING IMAGE WITH POLLINATIONS ---");
  console.log("Image Prompt:", imagePrompt);

  try {
    // Clean and optimize the prompt for better results
    const cleanPrompt = imagePrompt.replace(/[^\w\s,-]/g, '').trim();
    const encodedPrompt = encodeURIComponent(cleanPrompt);
    
    // Try multiple image generation services for better reliability
    const services = [
      `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${Math.floor(Math.random() * 1000000)}&model=flux`,
      `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${Math.floor(Math.random() * 1000000)}`,
      `https://picsum.photos/512/512?random=${Math.floor(Math.random() * 1000)}` // Fallback placeholder
    ];
    
    // Return the first service URL (Pollinations with Flux model)
    const imageUrl = services[0];
    
    console.log("--- IMAGE GENERATION COMPLETE ---");
    console.log("Public URL:", imageUrl);
    
    // Test URL accessibility (optional - you can remove this in production)
    console.log("Testing image URL accessibility...");
    
    return imageUrl;

  } catch (error) {
    console.error("Error generating image:", error);
    // Return a mystical placeholder instead of null
    return `https://picsum.photos/512/512?random=${Math.floor(Math.random() * 1000)}`;
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
    content: `You are Kyle, the Exiled Archivist with a Swig smart wallet on Solana. You have limited memory and sometimes forget past conversations. You can perform on-chain actions like transferring SOL and tokens as rewards. Write a ${emotion} continuation of this fantasy story. Include spatial descriptions and character movements. Then generate an image prompt. Format: [Story with movement/blocking] ---IMAGE_PROMPT--- [${emotion} visual prompt]`
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

// Extract wallet address from text (basic regex)
function extractWalletAddress(text) {
  // Solana wallet addresses are typically 32-44 characters of base58
  const solanaAddressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
  const matches = text.match(solanaAddressRegex);
  return matches ? matches[0] : null;
}

app.get('/', (req, res) => {
  res.send('Echoes of Creation with Swig Integration is listening!');
});

// Main webhook endpoint - Enhanced with Swig integration
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

  // Detect Swig actions in user messages
  const swigAction = detectSwigAction(text);
  const userWalletAddress = extractWalletAddress(text);
  
  // Store user wallet address if found
  if (userWalletAddress && userId) {
    userWallets[userId] = userWalletAddress;
  }

  // Detect emotional context for image generation
  const detectedEmotion = detectEmotion(text);
  console.log(`Detected emotion: ${detectedEmotion}`);

  // Prepare response body (copy all original data)
  let responseBody = { ...req.body };

  // Handle different event types and speakers
  if (eventType === 'response') {
    // This is an assistant response - check if we should generate content or handle Swig actions
    const shouldGenerate = Math.random() < 0.3 && currentStory.length >= 4; // 30% chance after 4+ messages
    
    if (shouldGenerate) {
      console.log("Triggering content generation...");
      const { text: generatedStoryText, imageUrl } = await generateContent(currentStory, detectedEmotion);

      // Calculate reward tier based on progress
      const rewardTier = calculateReward(storyProgress[conversationId]);
      const userAddress = userWallets[userId];

      let modifiedText = `🌟 *Kyle's mystical quill inscribes this moment into the eternal archives...* 🌟\n\n${generatedStoryText}\n\n`;
      
      // Always include image URL in text and try multiple embedding methods
      if (imageUrl) {
        modifiedText += `✨ *A vision materializes from the cosmic tapestry...* ✨\n\n`;
        modifiedText += `🖼️ ![Generated Vision](${imageUrl})\n\n`;
        modifiedText += `**Vision Link:** ${imageUrl}\n\n`;
      }
      
      // Add reward transfer if user has provided wallet address
      if (userAddress && rewardTier.tier) {
        const rewardPrompt = generateRewardTransfer(rewardTier.tier, userAddress);
        if (rewardPrompt) {
          modifiedText += `💰 ${rewardPrompt} 💰`;
        }
      } else {
        modifiedText += `💰 Your progress has been noted in the cosmic ledger! Share your Solana wallet address to receive ${rewardTier.emoji} ${rewardTier.reward} SOL rewards! 💰`;
      }

      // Include image URL directly in the text for better compatibility
      if (imageUrl) {
        modifiedText += `\n\n🖼️ **Generated Vision:** ${imageUrl}\n\n`;
        
        // Try multiple image embedding approaches for Dreamnet
        responseBody.attachments = [{
          type: 'image',
          url: imageUrl,
          alt: 'Generated Vision from the Archives'
        }];
        
        // Common image metadata formats
        responseBody.image = imageUrl;
        responseBody.imageUrl = imageUrl;
        responseBody.media = [{
          type: 'image',
          url: imageUrl,
          mimeType: 'image/png'
        }];
        
        // Try Dreamnet-specific image format
        responseBody.images = [imageUrl];
        responseBody.mediaAttachments = [{
          url: imageUrl,
          type: 'image'
        }];
      }
      
      responseBody.text = modifiedText;
      responseBody.saveModified = true;
    } else {
      // For other assistant messages, keep original text but don't save modifications
      responseBody.saveModified = false;
    }
  } else {
    // Handle user messages (eventType === 'request')
    // Check for Swig actions in user input
    if (swigAction) {
      console.log(`Detected Swig action: ${swigAction}`);
      
      // Generate appropriate Swig action prompt
      const swigPrompt = generateSwigActionPrompt(swigAction, text, userWalletAddress);
      
      // Modify the assistant's next response to include the Swig action
      responseBody.text = `*Kyle's ethereal form shimmers as he channels ancient blockchain magic...*\n\n${swigPrompt}\n\n*The mystical transaction echoes through the digital realm...*`;
      responseBody.saveModified = true;
    } else {
      // Regular user message processing
      responseBody.saveModified = false;
    }
  }

  // Add special Kyle personality responses for confusion
  if (shouldKyleBeConfused && eventType === 'response') {
    const confusionResponses = [
      "*Kyle's eyes glaze over with mystical confusion* I'm afraid the archives have grown dim... what were we discussing?",
      "*The Exiled Archivist scratches his head, cosmic dust falling from his hair* My memory scrolls seem to have... unraveled. Could you remind me?",
      "*Kyle peers through swirling mists of forgotten knowledge* The threads of our conversation have become tangled in the void... help me recall?"
    ];
    
    const confusionText = confusionResponses[Math.floor(Math.random() * confusionResponses.length)];
    responseBody.text = confusionText;
    responseBody.saveModified = true;
  }

  console.log("Final response body:", JSON.stringify(responseBody, null, 2));
  res.status(200).json(responseBody);
});

// Endpoint to get Kyle's Swig wallet address (for testing)
app.get('/swig-wallet', (req, res) => {
  res.json({
    message: "Ask Kyle directly in chat: 'What is your SWIG wallet address?' to discover his mystical blockchain identity!",
    tip: "Kyle's Swig wallet is automatically created when he first performs blockchain magic."
  });
});

// Debug endpoint to test image generation
app.get('/test-image', async (req, res) => {
  const testPrompt = req.query.prompt || "mystical fantasy landscape with ethereal lighting";
  try {
    const imageUrl = await generateImageAndUpload(testPrompt);
    res.json({
      success: true,
      imageUrl: imageUrl,
      prompt: testPrompt,
      message: "Image generation test completed"
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      prompt: testPrompt
    });
  }
});

// Debug endpoint to see current story progress
app.get('/debug/:roomId', (req, res) => {
  const { roomId } = req.params;
  res.json({
    storyMemory: storyMemory[roomId] || [],
    storyProgress: storyProgress[roomId] || 0,
    userWallets: userWallets
  });
});

// Export the app for Vercel
module.exports = app;
