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

### 🏺 **Minted Mementos**
*Problem: Story objects are ephemeral and not ownable.*

**Solution**: On-chain NFT mementos minted to user's wallet
- Story-generated images can be minted as unique NFTs.
- Frontend-initiated minting using user's connected Solana wallet.
- Backend prepares NFT metadata and uploads assets to Arweave via Irys.
- Each memento is a permanent, verifiable record of a story moment.

### 🎙️ **Audio Generation**
*Problem: Text-only responses lack auditory immersion.*

**Solution**: Dynamic audio synthesis for character responses
- Pollinations AI generates natural-sounding speech from text.
- Backend proxy ensures seamless audio playback, bypassing browser CORS restrictions.
- Enhances character presence and user engagement.

## 🛠️ Technical Implementation

### Core Blockchain Features
- **Client-Side NFT Minting**: Utilizes `@solana/wallet-adapter-react` and Umi for direct user wallet interaction.
- **Backend Metadata Preparation**: `/prepare-mint` endpoint handles image upload to Arweave (via Irys) and metadata URI generation.
- **Progressive SOL Rewards**: Swig smart wallet integration for dynamic rewards based on story engagement.

### Visual Generation Pipeline
```javascript
// Multi-modal content creation
Story Generation → Image Prompt Extraction → AI Visual Creation → Response Enhancement
```

### Audio Proxy
- **Server-side Proxy**: `/audio-proxy` endpoint fetches audio from Pollinations AI and streams it to the frontend.
- **CORS Bypass**: Ensures audio playback reliability across different browser environments.

### Memory Management System
```javascript
// Realistic character limitations
if (storyMemory[conversationId].length >= MEMORY_LIMIT) {
  storyMemory[conversationId] = storyMemory[conversationId].slice(-MEMORY_LIMIT);
}
```

### Reward Calculation for fun to interact with users
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
- **Pollinations AI**: Dynamic image and audio creation
- **Solana Blockchain**: Transactions for rewards and NFTs
- **Dreamnet Webhooks**: Character message processing
- **Metaplex Umi**: Solana NFT standard implementation
- **Solana Wallet Adapter**: Frontend wallet connectivity
- **Irys**: Decentralized storage for NFT assets

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
- **POST** `/prepare-mint` - Prepares NFT metadata for client-side minting
- **GET** `/mementos/:conversationId` - Retrieves minted mementos for a conversation
- **GET** `/world-context/:conversationId` - Provides dynamic world state information
- **GET** `/debug/:roomId` - Memory and progress tracking (for development)

## 🔧 Setup

### Backend (Webhook)
```bash
# Environment variables
WEBHOOK_SECRET=your_dreamnet_secret
OPENROUTER_API_KEY=your_openrouter_key
SOLANA_RPC_URL=https://api.devnet.solana.com # Or your preferred Solana RPC

```

### Frontend (Next.js App)
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

---

*Transforming AI storytelling through blockchain rewards, visual generation, and authentic character limitations.*
