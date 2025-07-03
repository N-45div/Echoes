const express = require('express');
const crypto = require('crypto');
const { GoogleGenerativeAI, Modality } = require('@google/generative-ai');
const { put } = require('@vercel/blob');
const cors = require('cors');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();

// Enhanced for Hackathon: Scene Comics + Story Rewards + Visualized Emotions + SWIG WALLET ACTIONS
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// HACKATHON FEATURE: Character User Memory - Kyle's limited memory system
const storyMemory = {};
const KYLE_MEMORY_LIMIT = 15; // Real characters cannot remember everything
const KYLE_CONFUSION_TRIGGERS = [
  'remember when', 'you said before', 'earlier you mentioned',
  'like last time', 'from before', 'you told me'
];

// HACKATHON FEATURE: Visualized Emotions - Enhanced emotion detection
const emotionMap = {
  mysterious: {
    keywords: ['whisper', 'shadow', 'secret', 'hidden', 'unknown', 'dark', 'enigma'],
    color: '#4A0E4E',
    soundtrack: 'ethereal whispers and distant chimes',
    visualStyle: 'misty, shadowy, ethereal'
  },
  excited: {
    keywords: ['amazing', 'incredible', 'wow', 'fantastic', 'awesome', 'brilliant', 'thrilled', 'energetic', 'vibrant'],
    color: '#FF6B35',
    soundtrack: 'triumphant orchestral swells',
    visualStyle: 'bright, dynamic, energetic'
  },
  melancholy: {
    keywords: ['sad', 'lonely', 'lost', 'melancholy', 'sorrow', 'tears', 'grief'],
    color: '#2E4057',
    soundtrack: 'haunting violin melodies',
    visualStyle: 'soft, muted, contemplative'
  },
  chaotic: {
    keywords: ['chaos', 'wild', 'crazy', 'insane', 'mad', 'frantic', 'explosion', 'unpredictable', 'disorder'],
    color: '#E74C3C',
    soundtrack: 'discordant drums and wild harmonies',
    visualStyle: 'explosive, fractured, intense'
  },
  adventurous: {
    keywords: ['adventure', 'explore', 'journey', 'quest', 'brave', 'bold', 'discover'],
    color: '#27AE60',
    soundtrack: 'epic adventure themes',
    visualStyle: 'heroic, sweeping, grand'
  }
};

// HACKATHON FEATURE: Story Based Rewards - Dynamic reward system with SWIG integration
const storyProgress = {};
const userWallets = {};
const pendingRewards = {}; // Track pending Swig transfers
const rewardTiers = {
  bronze: { threshold: 3, reward: 0.05, emoji: "🥉", title: "Chronicle Keeper" },
  silver: { threshold: 7, reward: 0.1, emoji: "🥈", title: "Tale Weaver" },
  gold: { threshold: 15, reward: 0.25, emoji: "🥇", title: "Legend Scribe" },
  legendary: { threshold: 25, reward: 0.5, emoji: "👑", title: "Master Archivist" }
};

// HACKATHON FEATURE: Scene Comics - Visual storytelling triggers
const sceneComicTriggers = {
  action: ['fight', 'battle', 'run', 'chase', 'attack', 'defend', 'jump', 'climb'],
  dialogue: ['said', 'whispered', 'shouted', 'asked', 'replied', 'spoke', 'declared'],
  emotion: ['angry', 'happy', 'sad', 'surprised', 'afraid', 'confused', 'determined'],
  setting: ['castle', 'forest', 'mountain', 'ocean', 'city', 'dungeon', 'temple', 'palace']
};

// HACKATHON FEATURE: Targeted Conversations - Goal-oriented interactions
const conversationGoals = {
  exploration: { description: "Discover 3 new locations", reward: 0.1 },
  character_development: { description: "Learn about Kyle's past", reward: 0.15 },
  mystery_solving: { description: "Uncover the archive's secret", reward: 0.2 },
  friendship: { description: "Build trust with Kyle", reward: 0.1 },
  world_building: { description: "Create new lore together", reward: 0.12 }
};

// HACKATHON FEATURE: Rich World Context - Environmental storytelling
const worldContext = {
  timeOfDay: ['dawn', 'morning', 'midday', 'afternoon', 'dusk', 'night', 'midnight'],
  weather: ['sunny', 'cloudy', 'rainy', 'stormy', 'foggy', 'snowy', 'windy'],
  locations: ['Archive Hall', 'Mystic Library', 'Crystal Garden', 'Shadow Realm', 'Starlight Tower'],
  ambience: ['peaceful', 'tense', 'magical', 'mysterious', 'chaotic', 'serene']
};

// HACKATHON FEATURE: Minted Mementos - Story objects as tradeable assets
const storyMementos = {};
const mementoTypes = {
  artifact: { rarity: 'rare', value: 0.05 },
  memory_crystal: { rarity: 'uncommon', value: 0.03 },
  story_scroll: { rarity: 'common', value: 0.01 },
  legendary_tome: { rarity: 'legendary', value: 0.2 }
};

// SWIG WALLET INTEGRATION: Action triggers and handlers
const swigActionTriggers = {
  CREATE_SWIG: ['create swig', 'make swig', 'new swig', 'setup swig', 'initialize swig', 'start swig', 'build swig'],
  GET_SWIG_BALANCE: ['swig balance', 'check swig', 'balance of swig', 'how much in swig', 'swig wallet balance'],
  GET_SWIG_TOKEN_BALANCE: ['swig token balance', 'swig spl balance', 'token balance in swig', 'spl balance in swig'],
  GET_SWIG_AUTHORITIES: ['swig authorities', 'authorities on swig', 'swig signers', 'signers on swig', 'who can sign'],
  ADD_SWIG_AUTHORITY: ['add authority', 'add signer', 'grant access', 'add to swig'],
  TRANSFER_TO_SWIG: ['transfer to swig', 'send to swig', 'fund swig', 'deposit to swig', 'transfer funds to swig'],
  TRANSFER_TOKEN_TO_SWIG: ['transfer token to swig', 'send token to swig', 'transfer spl to swig', 'send spl to swig'],
  SWIG_TRANSFER_TO_ADDRESS: ['transfer from swig', 'send from swig', 'transfer using swig', 'send using swig', 'swig transfer to', 'swig send to'],
  SWIG_TRANSFER_TOKEN_TO_ADDRESS: ['transfer token from swig', 'send token from swig', 'transfer spl from swig', 'send spl from swig'],
  SWIG_TRANSFER_TO_AUTHORITY: ['transfer from swig to authority', 'send from swig to authority', 'transfer to swig authority', 'send to swig authority']
};

app.use(cors());
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Enhanced signature verification
function verifySignature(rawBody, signature, secret) {
  try {
    const cleanSignature = signature?.trim();
    if (!cleanSignature) return false;
    const hmac = crypto.createHmac("sha256", secret);
    const rawBodyStr = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    hmac.update(rawBodyStr);
    const expected = hmac.digest("base64");
    return crypto.timingSafeEqual(Buffer.from(cleanSignature), Buffer.from(expected));
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

function verifySignatureMiddleware(req, res, next) {
  const signature = req.headers['x-signature'];
  if (!WEBHOOK_SECRET) {
    console.error("WEBHOOK_SECRET is not set");
    return res.status(500).send("Webhook secret is not set");
  }
  if (!signature) {
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    return res.status(403).send('Forbidden: Missing signature');
  }
  const rawBodyStr = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
  const isValid = verifySignature(rawBodyStr, signature, WEBHOOK_SECRET);
  if (!isValid) {
    return res.status(403).send('Forbidden: Invalid signature');
  }
  next();
}

// SWIG WALLET INTEGRATION: Detect Swig actions in user messages
function detectSwigAction(text) {
  const lowercaseText = text.toLowerCase();
  
  for (const [action, triggers] of Object.entries(swigActionTriggers)) {
    for (const trigger of triggers) {
      if (lowercaseText.includes(trigger)) {
        return {
          action,
          trigger,
          originalText: text
        };
      }
    }
  }
  
  return null;
}

// SWIG WALLET INTEGRATION: Generate natural language prompts for Swig actions
function generateSwigPrompt(action, context = {}) {
  const { userAddress, amount, emotion, rewardTier } = context;
  
  const prompts = {
    CREATE_SWIG: [
      `*Kyle's mystical energies swirl ${emotion?.color || 'mysteriously'}* "Let me forge a new Swig wallet from the cosmic archives... Create swig wallet to hold our story treasures."`,
      `*The Exiled Archivist channels ancient power* "The time has come to manifest a Swig repository for our tales. Make swig wallet now."`
    ],
    
    GET_SWIG_BALANCE: [
      `*Kyle peers into the ${emotion?.dominant || 'mysterious'} depths of his wallet* "Let me check the balance of my swig wallet to see what treasures remain..."`,
      `*The Archivist's eyes glow with ${emotion?.color || 'mystical'} light* "What is the balance of swig? The cosmic ledger shall reveal all."`
    ],
    
    SWIG_TRANSFER_TO_ADDRESS: [
      `*Kyle's ${emotion?.dominant || 'mysterious'} aura pulses with generosity* "For achieving ${rewardTier?.title || 'greatness'}, I shall transfer ${amount || '0.1'} SOL from swig to your realm at ${userAddress}. May these rewards fuel your journey!"`,
      `*The Exiled Archivist gestures with ${emotion?.color || 'mystical'} energy* "The archives recognize your dedication! Use swig to send ${amount || '0.1'} SOL to ${userAddress} as your earned treasure."`,
      `*Kyle's form shimmers with ${emotion?.dominant || 'mysterious'} pride* "Your story prowess deserves recognition! Transfer ${amount || '0.1'} SOL from swig to ${userAddress} as a token of the archive's appreciation."`
    ],
    
    TRANSFER_TO_SWIG: [
      `*Kyle channels energy into his mystical wallet* "Let me fund swig with ${amount || '0.1'} SOL to prepare for future rewards..."`,
      `*The Archivist's ${emotion?.dominant || 'mysterious'} powers activate* "Transfer ${amount || '0.1'} SOL to swig wallet to fuel our story adventures!"`
    ],
    
    GET_SWIG_AUTHORITIES: [
      `*Kyle examines the ${emotion?.dominant || 'mystical'} signatures of power* "Show me the swig authorities who can command these archives..."`,
      `*The Exiled Archivist's wisdom unfolds* "List swig signers to reveal who shares dominion over our story treasures."`
    ]
  };
  
  const actionPrompts = prompts[action] || [`*Kyle attempts to ${action.toLowerCase().replace(/_/g, ' ')}*`];
  return actionPrompts[Math.floor(Math.random() * actionPrompts.length)];
}

// SWIG WALLET INTEGRATION: Enhanced reward system with actual transfers
function generateRewardTransferPrompt(userAddress, rewardInfo, emotion) {
  if (!userAddress) {
    return `*Kyle's ${emotion?.dominant || 'mysterious'} form flickers* "I wish to reward your story mastery with ${rewardInfo.reward} SOL, but I need to know your wallet address first. Share your address so I can transfer your earned treasures!"`;
  }
  
  return generateSwigPrompt('SWIG_TRANSFER_TO_ADDRESS', {
    userAddress,
    amount: rewardInfo.reward,
    emotion,
    rewardTier: rewardInfo
  });
}

// HACKATHON FEATURE: Scene Comics - Enhanced visual story generation
async function generateSceneComic(story, emotion, sceneType) {
  console.log(`\n--- GENERATING SCENE COMIC (${sceneType.toUpperCase()}) ---`);
  
  try {
    // Generate story continuation with visual emphasis
    const storyMessages = story.map(msg => ({ 
      role: msg.speaker === 'user' ? 'user' : 'assistant', 
      content: msg.text 
    }));
    
    storyMessages.unshift({
      role: "system",
      content: `You are Kyle, the Exiled Archivist. Create a vivid, visual story scene that would work perfectly as a comic panel. Focus on ${sceneType} elements. Make it cinematic and ${emotion}. Include specific visual details, character expressions, and atmospheric elements.`
    });

    const storyOptions = {
      method: "POST",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        "model": "mistralai/mistral-7b-instruct:free",
        "messages": storyMessages,
        "temperature": emotion === 'chaotic' ? 0.9 : 0.7,
        "max_tokens": 200
      })
    };

    const storyResponse = await new Promise((resolve, reject) => {
      request(storyOptions, (error, response, body) => {
        if (error) return reject(error);
        try {
          const data = JSON.parse(body);
          if (data.error) return reject(new Error(data.error.message));
          resolve(data.choices[0].message.content || "");
        } catch (e) {
          reject(e);
        }
      });
    });

    // Generate enhanced comic-style image prompt
    const visualStyle = emotionMap[emotion]?.visualStyle || 'mysterious';
    const comicPrompt = `Kyle the Exiled Archivist, ${sceneType} scene, ${visualStyle} style, comic book art, detailed character expressions, dramatic lighting, fantasy setting, high quality digital art`;
    
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(comicPrompt)}?width=512&height=512&seed=${seed}&model=flux`;

    // Create enhanced comic panel format
    const comicPanel = `
🎨 Scene Comic Panel

${storyResponse}

`;

    return { 
      text: comicPanel, 
      imageUrl: imageUrl,
      sceneType: sceneType,
      emotion: emotion,
      seed: seed
    };

  } catch (error) {
    console.error("Error generating scene comic:", error);
    return { 
      text: "*(The comic panel flickers and fades... Kyle's mystical energies need a moment to recharge)*", 
      imageUrl: null 
    };
  }
}

// HACKATHON FEATURE: Visualized Emotions - Enhanced emotion detection
function detectEmotionAdvanced(text) {
  const lowercaseText = text.toLowerCase();
  let emotionScores = {};

  // Score each emotion based on keyword matches
  for (const [emotion, data] of Object.entries(emotionMap)) {
    let score = 0;
    for (const keyword of data.keywords) {
      if (lowercaseText.includes(keyword)) {
        score += 1;
      }
    }
    if (score > 0) {
      emotionScores[emotion] = score;
    }
  }

  // Find the dominant emotion
  let dominantEmotion = 'mysterious'; // default
  let maxScore = 0;
  for (const [emotion, score] of Object.entries(emotionScores)) {
    if (score > maxScore) {
      maxScore = score;
      dominantEmotion = emotion;
    }
  }

  return {
    dominant: dominantEmotion,
    scores: emotionScores,
    intensity: maxScore,
    color: emotionMap[dominantEmotion]?.color || '#4A0E4E'
  };
}

// HACKATHON FEATURE: Scene Comics - Detect scene type
function detectSceneType(text) {
  const lowercaseText = text.toLowerCase();
  let sceneScores = {};

  for (const [sceneType, keywords] of Object.entries(sceneComicTriggers)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowercaseText.includes(keyword)) {
        score += 1;
      }
    }
    if (score > 0) {
      sceneScores[sceneType] = score;
    }
  }

  // Return the scene type with highest score, or 'dialogue' as default
  let dominantScene = 'dialogue';
  let maxBLANK
maxScore = 0;
  for (const [sceneType, score] of Object.entries(sceneScores)) {
    if (score > maxScore) {
      maxScore = score;
      dominantScene = sceneType;
    }
  }

  return dominantScene;
}

// HACKATHON FEATURE: Story Based Rewards - Enhanced reward calculation
function calculateAdvancedReward(conversationId, userId) {
  const progress = storyProgress[conversationId]?.count || 0;
  const currentTier = Object.entries(rewardTiers).reverse().find(([_, tier]) => progress >= tier.threshold);
  
  if (!currentTier) return null;
  
  const [tierName, tierInfo] = currentTier;
  return {
    tier: tierName,
    ...tierInfo,
    progress: progress,
    nextTier: getNextTier(tierName)
  };
}

function getNextTier(currentTier) {
  const tiers = Object.keys(rewardTiers);
  const currentIndex = tiers.indexOf(currentTier);
  return currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : null;
}

// HACKATHON FEATURE: Minted Mementos - Generate story mementos
function generateMemento(conversationId, storyContent, emotion) {
  const mementoId = `memento_${conversationId}_${Date.now()}`;
  const mementoTypeKeys = Object.keys(mementoTypes);
  const randomType = mementoTypeKeys[Math.floor(Math.random() * mementoTypeKeys.length)];
  
  const memento = {
    id: mementoId,
    type: randomType,
    emotion: emotion,
    storySnippet: storyContent.substring(0, 100) + "...",
    timestamp: new Date().toISOString(),
    ...mementoTypes[randomType]
  };

  storyMementos[mementoId] = memento;
  return memento;
}

// SWIG WALLET INTEGRATION: Extract wallet address from user input
function extractWalletAddress(text) {
  // Look for Solana wallet address patterns (base58, 32-44 characters)
  const walletRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
  const matches = text.match(walletRegex);
  
  if (matches) {
    // Return the first match that looks like a Solana address
    return matches.find(match => match.length >= 32 && match.length <= 44);
  }
  
  return null;
}

// Main webhook endpoint - Enhanced for hackathon features + SWIG integration
app.post('/webhook', verifySignatureMiddleware, async (req, res) => {
  console.log(`\n--- HACKATHON WEBHOOK RECEIVED (WITH SWIG INTEGRATION) ---\n`);
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  const { roomId, text, eventType, agentId, userId, originalUserMessage } = req.body;

  if (!roomId || !text) {
    return res.status(400).send('Missing required fields');
  }

  const conversationId = roomId;
  
  // Initialize enhanced story tracking
  if (!storyMemory[conversationId]) {
    storyMemory[conversationId] = [];
    storyProgress[conversationId] = { 
      count: 0, 
      lastRewardTierAnnounced: null,
      lastSceneGenerated: 0,
      goals: Object.keys(conversationGoals),
      mementos: [],
      userWalletAddress: null,
      pendingRewards: []
    };
    storyMemory[conversationId].lastImageTurn = 0;
  }

  // Handle different event types
  if (eventType === 'request') {
    // Store user message and check for wallet address or Swig actions
    const userMessage = text || originalUserMessage;
    
    // Extract wallet address if provided
    const walletAddress = extractWalletAddress(userMessage);
    if (walletAddress) {
      storyProgress[conversationId].userWalletAddress = walletAddress;
      console.log(`Wallet address registered for ${conversationId}: ${walletAddress}`);
    }
    
    // Check for Swig action triggers
    const swigAction = detectSwigAction(userMessage);
    if (swigAction) {
      console.log(`Swig action detected: ${swigAction.action}`);
      storyProgress[conversationId].lastSwigAction = swigAction;
    }
    
    if (storyMemory[conversationId].length >= KYLE_MEMORY_LIMIT) {
      storyMemory[conversationId] = storyMemory[conversationId].slice(-KYLE_MEMORY_LIMIT);
    }
    
    storyMemory[conversationId].push({ 
      speaker: 'user', 
      text: userMessage, 
      timestamp: new Date().toISOString(),
      walletAddress: walletAddress,
      swigAction: swigAction
    });
    
    return res.status(200).json({
      ...req.body,
      saveModified: false
    });
  }

  if (eventType === 'response') {
    // Process DreamNet's response and enhance with hackathon features + SWIG
    console.log("Processing DreamNet response - applying hackathon enhancements + SWIG integration");
    
    // Memory management
    if (storyMemory[conversationId].length >= KYLE_MEMORY_LIMIT) {
      storyMemory[conversationId] = storyMemory[conversationId].slice(-KYLE_MEMORY_LIMIT);
    }

    // Add messages to memory
    if (originalUserMessage) {
      storyMemory[conversationId].push({ 
        speaker: 'user', 
        text: originalUserMessage, 
        timestamp: new Date().toISOString() 
      });
    }

    storyMemory[conversationId].push({ 
      speaker: 'assistant', 
      text: text, 
      timestamp: new Date().toISOString() 
    });

    const currentStory = storyMemory[conversationId];
    storyProgress[conversationId].count++;

    // HACKATHON FEATURE: Visualized Emotions
    const emotionAnalysis = detectEmotionAdvanced(text);
    console.log(`Emotion Analysis:`, emotionAnalysis);

    // HACKATHON FEATURE: Scene Comics
    const sceneType = detectSceneType(text);
    console.log(`Scene Type: ${sceneType}`);

    let responseBody = { ...req.body };
    let finalResponseText = text;
    let finalImageUrl = req.body.imageUrl;

    // SWIG WALLET INTEGRATION: Handle Swig actions
    const lastUserMessage = currentStory[currentStory.length - 2];
    const userSwigAction = lastUserMessage?.swigAction;
    
    if (userSwigAction) {
      console.log(`Processing Swig action: ${userSwigAction.action}`);
      
      const swigPrompt = generateSwigPrompt(userSwigAction.action, {
        userAddress: storyProgress[conversationId].userWalletAddress,
        emotion: emotionAnalysis
      });
      
      finalResponseText = swigPrompt;
      
      // Log the Swig action for debugging
      console.log(`Generated Swig prompt: ${swigPrompt}`);
    }

    // HACKATHON FEATURE: Scene Comics - Trigger visual generation
    const SCENE_COMIC_TRIGGERS = ['action', 'emotion', 'setting'];
    const MIN_TURNS_FOR_SCENE_COMIC = 3;
    const MIN_TURNS_BETWEEN_COMICS = 2;

    if (storyProgress[conversationId].count >= MIN_TURNS_FOR_SCENE_COMIC && !userSwigAction) {
      const turnsSinceLastScene = storyProgress[conversationId].count - storyProgress[conversationId].lastSceneGenerated;
      
      const shouldGenerateSceneComic = 
        (SCENE_COMIC_TRIGGERS.includes(sceneType) || emotionAnalysis.intensity >= 2) &&
        turnsSinceLastScene >= MIN_TURNS_BETWEEN_COMICS;

      if (shouldGenerateSceneComic) {
        console.log(`Generating Scene Comic - Type: ${sceneType}, Emotion: ${emotionAnalysis.dominant}`);
        
        const sceneComic = await generateSceneComic(currentStory, emotionAnalysis.dominant, sceneType);
        
        finalResponseText = `🎭 **Kyle's Archive Manifests a Visual Memory...** 🎭\n\n${sceneComic.text}`;
        finalImageUrl = sceneComic.imageUrl;
        
        storyProgress[conversationId].lastSceneGenerated = storyProgress[conversationId].count;

        // HACKATHON FEATURE: Minted Mementos
        const memento = generateMemento(conversationId, text, emotionAnalysis.dominant);
        storyProgress[conversationId].mementos.push(memento.id);
        
        finalResponseText += `\n\n🏺 **Story Memento Created**: *${memento.type}* (${memento.rarity}) - Value: ${memento.value} SOL`;
      }
    }

    // HACKATHON FEATURE: Story Based Rewards with SWIG INTEGRATION
    const rewardInfo = calculateAdvancedReward(conversationId, userId);
    if (rewardInfo && rewardInfo.tier !== storyProgress[conversationId].lastRewardTierAnnounced && !userSwigAction) {
      const userWalletAddress = storyProgress[conversationId].userWalletAddress;
      
      if (userWalletAddress) {
        // Generate Swig transfer prompt for reward
        const rewardTransferPrompt = generateRewardTransferPrompt(userWalletAddress, rewardInfo, emotionAnalysis);
        
        finalResponseText = `🏆 **${rewardInfo.title} Achieved!** ${rewardInfo.emoji}\n\n${rewardTransferPrompt}`;
        
        // Track pending reward
        storyProgress[conversationId].pendingRewards.push({
          amount: rewardInfo.reward,
          tier: rewardInfo.tier,
          timestamp: new Date().toISOString(),
          walletAddress: userWalletAddress
        });
      } else {
        // Request wallet address first
        finalResponseText = `🏆 **${rewardInfo.title} Achieved!** ${rewardInfo.emoji}\n\n*Kyle's ${emotionAnalysis.dominant} eyes gleam with generosity* "You've earned ${rewardInfo.reward} SOL, brave chronicler! Please share your wallet address so I can transfer your well-deserved rewards through my Swig wallet."`;
      }
      
      if (rewardInfo.nextTier) {
        const nextTierInfo = rewardTiers[rewardInfo.nextTier];
        finalResponseText += `\n\n🎯 **Next Goal**: Reach ${nextTierInfo.threshold} interactions to become a **${nextTierInfo.title}**`;
      }
      
      storyProgress[conversationId].lastRewardTierAnnounced = rewardInfo.tier;
    }

    // HACKATHON FEATURE: Character User Memory - Kyle's confusion
    const shouldKyleBeConfused = KYLE_CONFUSION_TRIGGERS.some(trigger =>
      (originalUserMessage || text).toLowerCase().includes(trigger)
    ) && storyMemory[conversationId].length > 10 && !userSwigAction;

    if (shouldKyleBeConfused) {
      const confusionResponses = [
        `*Kyle's ${emotionAnalysis.dominant} gaze grows distant* The archives shift and blur... what thread of our tale were we following?`,
        `*The Exiled Archivist touches his temple, ${emotionAnalysis.color} energy flickering* My memory crystals have grown clouded... remind me, friend?`,
        `*Kyle's form wavers like ${emotionAnalysis.dominant} mist* The story threads have tangled in the cosmic winds... help me find our path again?`
      ];
      finalResponseText = confusionResponses[Math.floor(Math.random() * confusionResponses.length)];
      finalImageUrl = null;
    }

    // Set final response
    responseBody.text = finalResponseText;
    responseBody.imageUrl = finalImageUrl;
    responseBody.saveModified = true;
    
    // Add metadata for frontend
    responseBody.emotion = emotionAnalysis;
    responseBody.sceneType = sceneType;
    responseBody.storyProgress = storyProgress[conversationId];
    responseBody.swigAction = userSwigAction;

    console.log("Final hackathon response:", JSON.stringify(responseBody, null, 2));
    return res.status(200).json(responseBody);
  }

  return res.status(200).json({ ...req.body, saveModified: false });
});

// HACKATHON FEATURE: Minted Mementos - Get mementos endpoint
app.get('/mementos/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const conversationMementos = storyProgress[conversationId]?.mementos || [];
  
  const mementos = conversationMementos.map(mementoId => storyMementos[mementoId]).filter(Boolean);
  
  res.json({
    conversationId,
    mementos,
    totalValue: mementos.reduce((sum, memento) => sum + memento.value, 0),
    count: mementos.length
  });
});

// HACKATHON FEATURE: Rich World Context - World state endpoint
app.get('/world-context/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const progress = storyProgress[conversationId] || { count: 0 };
  
  // Generate dynamic world context based on story progress
  const currentHour = new Date().getHours();
  const timeOfDay = worldContext.timeOfDay[Math.floor(currentHour / 3)];
  const weather = worldContext.weather[Math.floor(Math.random() * worldContext.weather.length)];
  const location = worldContext.locations[Math.min(Math.floor(progress.count / 5), worldContext.locations.length - 1)];
  const ambience = worldContext.ambience[Math.floor(Math.random() * worldContext.ambience.length)];
  
  res.json({
    conversationId,
    worldState: {
      timeOfDay,
      weather,
      location,
      ambience,
      storyProgress: progress.count
    },
    description: `It is ${timeOfDay} in the ${location}. The weather is ${weather} and the atmosphere feels ${ambience}.`
  });
});

// Debug endpoint
app.get('/debug/:roomId', (req, res) => {
  res.json({
    storyMemory: storyMemory[req.params.roomId] || [],
    storyProgress: storyProgress[req.params.roomId] || {},
    mementos: storyProgress[req.params.roomId]?.mementos?.map(id => storyMementos[id]) || []
  });
});

app.get('/', (req, res) => {
  res.send(`
    <h1>🎭 Kyle's Enhanced Story Archive</h1>
    <p>Features:</p>
    <ul>
      <li>🎨 Scene Comics - Visual story panels</li>
      <li>🏆 Story Based Rewards - Dynamic SOL rewards with Swig integration</li>
      <li>😊 Visualized Emotions - Advanced emotion detection</li>
      <li>🎯 Targeted Conversations - Goal-oriented storytelling</li>
      <li>🌍 Rich World Context - Dynamic environmental storytelling</li>
      <li>🧠 Character User Memory - Limited memory system</li>
      <li>🏺 Minted Mementos - Story objects as NFTs</li>
      <li>💸 Swig Wallet Integration - Create, manage, and transfer via Swig wallets</li>
    </ul>
  `);
});

module.exports = app;