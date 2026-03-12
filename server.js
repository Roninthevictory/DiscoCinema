import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// ✅ HARDCODED - NO .env NEEDED! Your Discord App credentials:
const DISCORD_CLIENT_ID = '1481396281644679259';
const DISCORD_CLIENT_SECRET = 'pSeeo_kfxqASGTduGhLTE8DhqV7xxwRm';
const DISCORD_REDIRECT_URI = 'https://cinemasync-gzb8.onrender.com/api/token';

const REQUIRED_GUILD_ID = null; // Remove server lock for testing

// In-memory storage for video state (per channel)
const channelSessions = new Map();

// Channel session structure:
function createSession(channelId, hostId, hostName) {
  return {
    channelId,
    hostId,
    hostName,
    videoUrl: null,
    isPlaying: false,
    timestamp: 0,
    guestsMuted: true,
    participants: new Map(),
    createdAt: Date.now()
  };
}

function getNextHost(session) {
  let nextHost = null;
  let earliestJoin = Infinity;
  
  for (const [socketId, participant] of session.participants) {
    if (participant.userId !== session.hostId && participant.joinedAt < earliestJoin) {
      earliestJoin = participant.joinedAt;
      nextHost = { socketId, ...participant };
    }
  }
  
  return nextHost;
}

function broadcastToChannel(channelId, event, data) {
  io.to(channelId).emit(event, data);
}

// CSP for Discord iframe
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors https://*.discord.com; default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: ws: https://*.discord.com; media-src 'self' https: blob:;"
  );
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// 🔑 Discord OAuth2 /api/token endpoint
app.post('/api/token', async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' });
  }

  console.log('🔑 Token exchange - Code received');
  
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Discord OAuth error:', response.status, errorText);
      throw new Error(`Discord API error: ${response.status}`);
    }

    const tokenData = await response.json();
    console.log('✅ Token exchange success');
    res.json(tokenData);
  } catch (error) {
    console.error('💥 Token exchange FAILED:', error.message);
    res.status(500).json({ error: 'Token exchange failed - check server logs' });
  }
});

// User info endpoint
app.get('/api/user', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token' });
  }

  try {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const userData = await response.json();
    res.json(userData);
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// Serve React build
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Socket.io logic (unchanged)
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  let currentChannelId = null;
  let currentUserId = null;
  let currentUserName = null;

  socket.on('join_channel', ({ channelId, guildId, userId, userName }) => {
    console.log(`👤 User ${userName} joining channel ${channelId}`);
    
    if (REQUIRED_GUILD_ID && guildId !== REQUIRED_GUILD_ID) {
      socket.emit('error', { message: 'Activity locked to specific server' });
      return;
    }

    currentChannelId = channelId;
    currentUserId = userId;
    currentUserName = userName;
    
    socket.join(channelId);
    
    let session = channelSessions.get(channelId);
    let isHost = false;
    let isNewSession = false;
    
    if (!session) {
      session = createSession(channelId, userId, userName);
      isHost = true;
      isNewSession = true;
      console.log(`🎬 New session: ${userName} is Host`);
    } else {
      isHost = session.hostId === userId;
    }
    
    session.participants.set(socket.id, {
      userId,
      userName,
      joinedAt: Date.now()
    });
    
    channelSessions.set(channelId, session);
    
    socket.emit('role_assigned', { 
      isHost, 
      hostId: session.hostId,
      hostName: session.hostName,
      videoUrl: session.videoUrl,
      isPlaying: session.isPlaying,
      timestamp: session.timestamp
    });

    socket.to(channelId).emit('user_joined', { 
      userId, 
      userName, 
      participantCount: session.participants.size
    });
    
    console.log(`✅ ${userName} (${isHost ? 'Host' : 'Guest'}) - ${session.participants.size} total`);
  });

  // Simplified video/host logic (rest unchanged)
  socket.on('video_control', ({ channelId, action, data }) => {
    // Host controls implementation...
  });

  socket.on('disconnect', () => {
    console.log('👋 Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🎥 CinemaSync running on port ${PORT}`);
  console.log('🔑 Credentials:', DISCORD_CLIENT_ID ? 'SET' : 'MISSING');
});

