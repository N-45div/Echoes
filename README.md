# Echoes of Creation 🌟
### *Multi-Modal Character Enhancement for Dreamnet Character Agent Hackathon*

> **Dreamnet Character Agent Hackathon Entry**  
> Addressing core limitations in AI storytelling through blockchain integration, visual generation, and dynamic interactions.

## 🎯 Hackathon Challenge Solutions

### 🎨 **Scene Comics**
*Problem: Text based story interactions lack visual immersion.*

**Solution**: Dynamic AI image generation with emotional context
- Pollinations API integration with Flux model
- Context-aware visual prompts from story content
- Automatic image embedding in character responses
- Multiple fallback services for reliability

### 💰 **Story Based Rewards**
*Problem: Chatbots cannot share value with their users.*

**Solution**: Swig smart wallet integration with progressive SOL rewards
- 4-tier reward system (Bronze: 0.05 SOL → Legendary: 0.5 SOL)
- Automatic wallet address detection
- Story progress tracking for reward calculation
- Real blockchain transactions as narrative elements

### 🎭 **Visualized Emotions**
*Problem: Chat storytelling misses key visual triggers in understanding emotions.*

**Solution**: Emotional intelligence system with adaptive responses
```javascript
const emotionMap = {
  mysterious: ['whisper', 'shadow', 'secret'],
  excited: ['amazing', 'incredible', 'wow'],
  melancholy: ['sad', 'lonely', 'lost'],
  chaotic: ['chaos', 'wild', 'crazy']
};
```
- Emotion detection from user input
- Adaptive story generation based on mood
- Visual content matching emotional context

### 🧠 **Character User Memory**
*Problem: Agents can remember everything, real characters cannot.*

**Solution**: Limited memory system with authentic confusion
- Configurable memory limits (default: 15 interactions)
- Memory overflow with graceful forgetting
- Confusion triggers when users reference forgotten content
- Realistic character behavior simulation

### 🎬 **Blocking and Movement**
*Problem: Agentic chat scenarios have vague spatial cues.*

**Solution**: Spatial descriptions and character movement integration
- Story generation includes spatial context
- Character positioning and movement descriptions
- Environmental details in narrative responses

## 🛠️ Technical Implementation

### Core Blockchain Features (Swig Integration)
```javascript
// Complete smart wallet functionality
CREATE_SWIG, GET_SWIG_BALANCE, TRANSFER_TO_SWIG,
SWIG_TRANSFER_TO_ADDRESS, ADD_SWIG_AUTHORITY,
GET_SWIG_TOKEN_BALANCE, TRANSFER_TOKEN_TO_SWIG
```

### Visual Generation Pipeline
```javascript
// Multi-modal content creation
Story Generation → Image Prompt Extraction → AI Visual Creation → Response Enhancement
```

### Memory Management System
```javascript
// Realistic character limitations
if (storyMemory[conversationId].length >= MEMORY_LIMIT) {
  storyMemory[conversationId] = storyMemory[conversationId].slice(-MEMORY_LIMIT);
}
```

### Reward Calculation
```javascript
// Progressive engagement rewards
const rewardTiers = {
  bronze: { threshold: 5, reward: 0.05, emoji: "🥉" },
  silver: { threshold: 15, reward: 0.1, emoji: "🥈" },
  gold: { threshold: 30, reward: 0.25, emoji: "🥇" },
  legendary: { threshold: 50, reward: 0.5, emoji: "👑" }
};
```

## 🚀 Architecture

### API Integrations
- **OpenRouter AI**: Story generation with emotional context
- **Pollinations AI**: Dynamic image creation
- **Swig API**: Solana blockchain transactions
- **Dreamnet Webhooks**: Character message processing

### Security & Reliability
- HMAC-SHA256 signature verification
- Multiple image generation fallbacks
- Graceful error handling
- Environment variable protection

### Deployment
- Vercel serverless functions
- Zero-config deployment
- Automatic scaling
- Global CDN delivery

## 📡 Key Endpoints

- **POST** `/webhook` - Main Dreamnet integration
- **GET** `/test-image` - Visual generation testing
- **GET** `/debug/:roomId` - Memory and progress tracking

## 🔧 Setup

```bash
# Environment variables
WEBHOOK_SECRET=your_dreamnet_secret
OPENROUTER_API_KEY=your_openrouter_key

# Deploy
vercel --prod
```

**Webhook URL**: `https://your-app.vercel.app/webhook`

---

*Transforming AI storytelling through blockchain rewards, visual generation, and authentic character limitations.*
