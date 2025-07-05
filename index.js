const express = require('express');
const crypto = require('crypto');
const { put } = require('@vercel/blob');
const cors = require('cors');
const bodyParser = require('body-parser');
const request = require('request');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createGenericFile, generateSigner, signerIdentity, sol } = require('@metaplex-foundation/umi');
const { mplTokenMetadata } = require('@metaplex-foundation/mpl-token-metadata');
const { irysUploader } = require('@metaplex-foundation/umi-uploader-irys');
const fetch = require('node-fetch');
const app = express();

const SELF_PING_INTERVAL = 14 * 60 * 1000; // 14 minutes (before 15min timeout)
const WEBHOOK_URL = process.env.WEBHOOK_URL;
let keepAliveTimer = null;

app.get('/health', (req, res) => {
  const stats = keepAliveSystem ? keepAliveSystem.getStats() : null;

  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    keepAlive: {
      active: keepAliveSystem ? keepAliveSystem.isRunning : false,
      stats: stats
    }
  });
});

app.get('/keepalive-stats', (req, res) => {
  if (!keepAliveSystem) {
    return res.status(200).json({
      status: 'Keep-alive system not initialized',
      reason: process.env.NODE_ENV !== 'production' ? 'Development mode' : 'No webhook URL'
    });
  }

  res.status(200).json({
    system: 'active',
    ...keepAliveSystem.getStats()
  });
});

app.get('/warmup', async (req, res) => {
  console.log('Warming up webhook...');

  // Pre-load any heavy operations
  const startTime = Date.now();

  // Simulate typical webhook operations without side effects
  try {
    // Test API connections
    const testPromises = [];

    if (OPENROUTER_API_KEY) {
      testPromises.push(new Promise((resolve) => {
        setTimeout(() => resolve('openrouter'), 100);
      }));
    }

    if (GEMINI_API_KEY) {
      testPromises.push(new Promise((resolve) => {
        setTimeout(() => resolve('gemini'), 100);
      }));
    }

    await Promise.all(testPromises);

    const warmupTime = Date.now() - startTime;
    console.log(`Webhook warmed up in ${warmupTime}ms`);

    res.status(200).json({
      status: 'warmed',
      warmupTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Warmup failed', message: error.message });
  }
});

// KEEP-ALIVE STRATEGY 5: Advanced UptimeRobot-style keep-alive
const https = require('https');
const http = require('http');

class WebhookKeepAlive {
  constructor(webhookUrl, options = {}) {
    this.webhookUrl = webhookUrl;
    this.interval = options.interval || 14 * 60 * 1000; // 14 minutes
    this.timeout = options.timeout || 10000; // 10 seconds
    this.retries = options.retries || 3;
    this.timer = null;
    this.isRunning = false;
    this.stats = {
      totalPings: 0,
      successfulPings: 0,
      failedPings: 0,
      lastPing: null,
      lastSuccess: null,
      lastError: null
    };
  }

  async ping() {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const url = new URL(this.webhookUrl + '/health');
      const module = url.protocol === 'https:' ? https : http;

      const req = module.request(url, {
        method: 'GET',
        timeout: this.timeout,
        headers: {
          'User-Agent': 'WebhookKeepAlive/1.0'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - startTime;

          if (res.statusCode === 200) {
            this.stats.successfulPings++;
            this.stats.lastSuccess = new Date();
            console.log(`✅ Webhook ping successful (${responseTime}ms)`);
            resolve({ success: true, responseTime, statusCode: res.statusCode });
          } else {
            this.stats.failedPings++;
            this.stats.lastError = new Date();
            console.log(`❌ Webhook ping failed with status ${res.statusCode}`);
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        this.stats.failedPings++;
        this.stats.lastError = new Date();
        console.error(`❌ Webhook ping error:`, error.message);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        this.stats.failedPings++;
        this.stats.lastError = new Date();
        console.error(`❌ Webhook ping timeout after ${this.timeout}ms`);
        reject(new Error('Timeout'));
      });

      req.end();
    });
  }

  async pingWithRetry() {
    this.stats.totalPings++;
    this.stats.lastPing = new Date();

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const result = await this.ping();
        return result;
      } catch (error) {
        console.log(`Ping attempt ${attempt}/${this.retries} failed:`, error.message);

        if (attempt === this.retries) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  Keep-alive is already running');
      return;
    }

    console.log(`🚀 Starting webhook keep-alive for ${this.webhookUrl}`);
    console.log(`📊 Ping interval: ${this.interval / 1000} seconds`);

    this.isRunning = true;

    // Initial ping
    this.pingWithRetry().catch(error => {
      console.error('Initial ping failed:', error.message);
    });

    // Set up interval
    this.timer = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.pingWithRetry();
      } catch (error) {
        console.error('Keep-alive ping failed after all retries:', error.message);
      }
    }, this.interval);

    // Cleanup on process exit
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  stop() {
    if (!this.isRunning) return;

    console.log('🛑 Stopping webhook keep-alive');
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStats() {
    return {
      ...this.stats,
      uptime: this.isRunning ? Date.now() - this.stats.lastPing : 0,
      successRate: this.stats.totalPings > 0 ?
        (this.stats.successfulPings / this.stats.totalPings * 100).toFixed(2) + '%' : 'N/A'
    };
  }
}

// Initialize keep-alive system
let keepAliveSystem = null;

function startSelfPing() {
  if (process.env.NODE_ENV === 'production' && WEBHOOK_URL) {
    console.log('Starting advanced keep-alive system...');

    keepAliveSystem = new WebhookKeepAlive(WEBHOOK_URL, {
      interval: SELF_PING_INTERVAL,
      timeout: 10000,
      retries: 3
    });

    keepAliveSystem.start();
  }
}


// Enhanced for Hackathon: Scene Comics + Story Rewards + Visualized Emotions + SWIG WALLET ACTIONS
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;


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
      content: `You are an AI agent. Create a vivid, visual story scene that would work perfectly as a comic panel. Focus on ${sceneType} elements. Make it cinematic and ${emotion}. Include specific visual details, character expressions, and atmospheric elements.`
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
    const comicPrompt = `A scene with ${sceneType} elements, ${visualStyle} style, comic book art, detailed character expressions, dramatic lighting, fantasy setting, high quality digital art`;

    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(comicPrompt)}?width=512&height=512&seed=${seed}&model=flux`;

    // Create enhanced comic panel format
    const comicPanel = `
## 🎨 Scene Comic Panel

**${sceneType.toUpperCase()} SCENE**

${storyResponse}

---

**Visual Style**: ${visualStyle}  
**Emotion**: ${emotion}  
**Soundtrack**: ${emotionMap[emotion]?.soundtrack || 'ambient mystical tones'}  

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

// HACKATHON FEATURE: Audio Generation - Generate audio URL from Pollinations.ai
function generateAudioUrl(emotion, text) {
  // Ensure the text is properly encoded for the URL
  return `${process.env.WEBHOOK_URL}/audio-proxy?text=${encodeURIComponent(text)}`;
}



// Main webhook endpoint - Enhanced for hackathon features + SWIG integration
app.post('/webhook', verifySignatureMiddleware, async (req, res) => {
  console.log(`
--- HACKATHON WEBHOOK RECEIVED ---
`);
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

    };
    storyMemory[conversationId].lastImageTurn = 0;
  }

  // Handle different event types
  if (eventType === 'request') {
    const userMessage = text || originalUserMessage;

    if (storyMemory[conversationId].length >= KYLE_MEMORY_LIMIT) {
      storyMemory[conversationId] = storyMemory[conversationId].slice(-KYLE_MEMORY_LIMIT);
    }

    storyMemory[conversationId].push({
      speaker: 'user',
      text: userMessage,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      ...req.body,
      saveModified: false
    });
  }

  if (eventType === 'response') {
    // Process DreamNet's response and enhance with hackathon features
    console.log("Processing DreamNet response - applying hackathon enhancements");

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
    let finalAudioUrl = null;

    // HACKATHON FEATURE: Audio Generation
    finalAudioUrl = generateAudioUrl(emotionAnalysis.dominant, text);



    // HACKATHON FEATURE: Scene Comics - Trigger visual generation
    const SCENE_COMIC_TRIGGERS = ['action', 'emotion', 'setting'];
    const MIN_TURNS_FOR_SCENE_COMIC = 3;
    const MIN_TURNS_BETWEEN_COMICS = 2;

    if (storyProgress[conversationId].count >= MIN_TURNS_FOR_SCENE_COMIC) {
      const turnsSinceLastScene = storyProgress[conversationId].count - storyProgress[conversationId].lastSceneGenerated;

      console.log(`Image Generation Check: Turns since last scene: ${turnsSinceLastScene}, Current count: ${storyProgress[conversationId].count}`);
      console.log(`Scene Type: ${sceneType}, Emotion Intensity: ${emotionAnalysis.intensity}`);

      const shouldGenerateSceneComic =
        (SCENE_COMIC_TRIGGERS.includes(sceneType) || emotionAnalysis.intensity >= 2) &&
        turnsSinceLastScene >= MIN_TURNS_BETWEEN_COMICS;

      console.log(`Should Generate Scene Comic: ${shouldGenerateSceneComic}`);

      if (shouldGenerateSceneComic) {
        console.log(`Generating Scene Comic - Type: ${sceneType}, Emotion: ${emotionAnalysis.dominant}`);

        const sceneComic = await generateSceneComic(currentStory, emotionAnalysis.dominant, sceneType);

        finalResponseText = `🎭 **A Visual Memory Manifests...** 🎭

${sceneComic.text}`;
        finalImageUrl = sceneComic.imageUrl;

        storyProgress[conversationId].lastSceneGenerated = storyProgress[conversationId].count;

        // HACKATHON FEATURE: Minted Mementos
        const memento = generateMemento(conversationId, text, emotionAnalysis.dominant);
        storyProgress[conversationId].mementos.push(memento.id);

        finalResponseText += `

🏺 **Story Memento Created**: *${memento.type}* (${memento.rarity}) - Value: ${memento.value} SOL`;

        responseBody.mementoId = memento.id; // Add mementoId to the response
      }
    }

    // HACKATHON FEATURE: Story Based Rewards
    const rewardInfo = calculateAdvancedReward(conversationId, userId);
    if (rewardInfo && rewardInfo.tier !== storyProgress[conversationId].lastRewardTierAnnounced) {
      finalResponseText = `🏆 **${rewardInfo.title} Achieved!** ${rewardInfo.emoji}\n\n*Kyle's ${emotionAnalysis.dominant} eyes gleam with generosity* "You've earned a virtual reward of ${rewardInfo.reward} SOL!"`;

      if (rewardInfo.nextTier) {
        const nextTierInfo = rewardTiers[rewardInfo.nextTier];
        finalResponseText += `\n\n🎯 **Next Goal**: Reach ${nextTierInfo.threshold} interactions to become a **${nextTierInfo.title}**`;
      }

      storyProgress[conversationId].lastRewardTierAnnounced = rewardInfo.tier;
    }

    // HACKATHON FEATURE: Character User Memory - Kyle's confusion
    const shouldKyleBeConfused = KYLE_CONFUSION_TRIGGERS.some(trigger =>
      (originalUserMessage || text).toLowerCase().includes(trigger)
    ) && storyMemory[conversationId].length > 10;

    if (shouldKyleBeConfused) {
      const confusionResponses = [
        `*My ${emotionAnalysis.dominant} gaze grows distant* The archives shift and blur... what thread of our tale were we following?`,
        `*I touch my temple, ${emotionAnalysis.color} energy flickering* My memory crystals have grown clouded... remind me, friend?`,
        `*My form wavers like ${emotionAnalysis.dominant} mist* The story threads have tangled in the cosmic winds... help me find our path again?`
      ];
      finalResponseText = confusionResponses[Math.floor(Math.random() * confusionResponses.length)];
      finalImageUrl = null;
    }

    // Set final response
    responseBody.text = finalResponseText;
    responseBody.imageUrl = finalImageUrl;
    responseBody.audioText = text; // Pass original text for frontend audio generation
    responseBody.saveModified = true;

    // Add metadata for frontend
    responseBody.emotion = emotionAnalysis;
    responseBody.sceneType = sceneType;
    responseBody.storyProgress = storyProgress[conversationId];


    console.log("Final hackathon response:", JSON.stringify(responseBody, null, 2));
    return res.status(200).json(responseBody);
  }

  return res.status(200).json({ ...req.body, saveModified: false });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, cleaning up...');
  if (keepAliveSystem) {
    keepAliveSystem.stop();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...');
  if (keepAliveSystem) {
    keepAliveSystem.stop();
  }
  process.exit(0);
});

// Start keep-alive system
startSelfPing();

// HACKATHON FEATURE: Minted Mementos - Get mementos endpoint
app.get('/mementos/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const conversationMementos = storyProgress[conversationId]?.mementos || [];

  const mementos = conversationMementos.map(mementoId => storyMementos[mementoId]).filter(Boolean);

  res.json({
    conversationId,
    mementos,

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

app.get('/audio-proxy', async (req, res) => {
  const { text } = req.query;
  if (!text) {
    return res.status(400).send('Missing text parameter');
  }

  try {
    const audioUrl = `https://text.pollinations.ai/${encodeURIComponent(text)}?model=openai-audio&voice=nova`;
    const response = await fetch(audioUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    // Set appropriate headers for audio streaming
    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for a year
    response.body.pipe(res);
  } catch (error) {
    console.error('Error proxying audio:', error);
    res.status(500).send('Error proxying audio');
  }
});

app.post('/prepare-mint', async (req, res) => {
  const { mementoId, imageUrl, sceneType } = req.body;

  if (!mementoId || !imageUrl || !sceneType) {
    return res.status(400).send('Missing required fields');
  }

  const memento = storyMementos[mementoId];

  if (!memento) {
    return res.status(404).send('Memento not found');
  }

  try {
    const umi = createUmi(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com")
      .use(mplTokenMetadata())
      .use(
        irysUploader({
          address: "https://devnet.irys.xyz",
        })
      );

    const signer = generateSigner(umi);
    umi.use(signerIdentity(signer));

    await umi.rpc.airdrop(umi.identity.publicKey, sol(1));

    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.buffer();
    const umiImageFile = createGenericFile(imageBuffer, "memento.png", {
      tags: [{ name: "Content-Type", value: "image/png" }],
    });
    const imageUri = await umi.uploader.upload([umiImageFile]);

    const nftMetadata = {
      name: `Echoes of Creation: ${memento.type}`,
      description: memento.storySnippet,
      image: imageUri[0],
      attributes: [
        {
          trait_type: "Emotion",
          value: memento.emotion,
        },
        {
          trait_type: "Rarity",
          value: memento.rarity,
        },
        {
          trait_type: "Scene Type",
          value: sceneType,
        },
      ],
      properties: {
        files: [
          {
            uri: imageUri[0],
            type: "image/png",
          },
        ],
        category: "image",
      },
    };

    const metadataUri = await umi.uploader.uploadJson(nftMetadata);

    res.json({ metadataUri });
  } catch (error) {
    console.error("Error preparing mint:", error);
    res.status(500).send('Error preparing mint');
  }
});


app.get('/', (req, res) => {
  const stats = keepAliveSystem ? keepAliveSystem.getStats() : null;

  res.send(`
    <h1>🎭 Kyle's Enhanced Story Archive</h1>
    <p>Status: <strong>ALIVE</strong> ✅</p>
    <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
    <p>Keep-alive: ${keepAliveSystem && keepAliveSystem.isRunning ? 'ACTIVE' : 'INACTIVE'}</p>
    ${stats ? `
    <div style="background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 5px;">
      <h3>📊 Keep-Alive Stats</h3>
      <p>Total Pings: ${stats.totalPings}</p>
      <p>Success Rate: ${stats.successRate}</p>
      <p>Last Success: ${stats.lastSuccess ? new Date(stats.lastSuccess).toLocaleString() : 'N/A'}</p>
      <p>Last Error: ${stats.lastError ? new Date(stats.lastError).toLocaleString() : 'N/A'}</p>
    </div>
    ` : ''}
    <p>Features:</p>
    <ul>
      <li>🎨 Scene Comics - Visual story panels</li>
      <li>🏆 Story Based Rewards - Dynamic SOL rewards</li>
      <li>😊 Visualized Emotions - Advanced emotion detection</li>
      <li>🎯 Targeted Conversations - Goal-oriented storytelling</li>
      <li>🌍 Rich World Context - Dynamic environmental storytelling</li>
      <li>🧠 Character User Memory - Limited memory system</li>
      <li>🏺 Minted Mementos - Story objects as NFTs</li>
      <li>⚡ UptimeRobot-style Keep-Alive - Advanced uptime monitoring</li>
    </ul>
  `);
});

module.exports = app;