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
const REQUIRED_GUILD_ID = process.env.REQUIRED_GUILD_ID || null;

// In-memory storage for video state (per channel)
const channelSessions = new Map();

// Channel session structure:
// {
//   channelId: string,
//   hostId: string,
//   hostName: string,
//   videoUrl: string | null,
//   isPlaying: boolean,
//   timestamp: number,
//   participants: Map<socketId, { userId, userName, joinedAt }>
// }

function createSession(channelId, hostId, hostName) {
  return {
    channelId,
    hostId,
    hostName,
    videoUrl: null,
    isPlaying: false,
    timestamp: 0,
    guestsMuted: true, // Guests force muted by default for movie nights
    participants: new Map(),
    createdAt: Date.now()
  };
}

function getNextHost(session) {
  // Find the earliest participant who isn't the current host
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

// Content Security Policy middleware for Discord iframe
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors https://*.discord.com; default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: ws: https://*.discord.com; media-src 'self' https: blob:;"
  );
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Discord OAuth2 token exchange endpoint
app.post('/api/token', async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' });
  }

  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await response.json();
    res.json(tokenData);
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).json({ error: 'Failed to exchange authorization code' });
  }
});

// Get user info from Discord
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

// Get channel session info
app.get('/api/session/:channelId', (req, res) => {
  const { channelId } = req.params;
  const session = channelSessions.get(channelId);
  
  if (!session) {
    return res.json({ exists: false });
  }
  
  res.json({
    exists: true,
    hostId: session.hostId,
    hostName: session.hostName,
    videoUrl: session.videoUrl,
    isPlaying: session.isPlaying,
    timestamp: session.timestamp,
    participantCount: session.participants.size
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  let currentChannelId = null;
  let currentUserId = null;
  let currentUserName = null;

  // Join a channel room
  socket.on('join_channel', ({ channelId, guildId, userId, userName }) => {
    // Optional guild lock check
    if (REQUIRED_GUILD_ID && guildId !== REQUIRED_GUILD_ID) {
      socket.emit('error', { message: 'This activity is locked to a specific server' });
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
      // First user creates the session and becomes host
      session = createSession(channelId, userId, userName);
      isHost = true;
      isNewSession = true;
      console.log(`New session created for channel ${channelId} by ${userName} (Host)`);
    } else {
      // Check if previous host still in session
      const hostStillInSession = Array.from(session.participants.values()).some(p => p.userId === session.hostId);
      
      if (!hostStillInSession) {
        // Previous host left, assign new host
        const nextHost = getNextHost(session);
        if (nextHost) {
          session.hostId = nextHost.userId;
          session.hostName = nextHost.userName;
          console.log(`New host assigned: ${nextHost.userName} (previous host left)`);
          
          // Notify the new host
          io.to(nextHost.socketId).emit('became_host', {
            previousHost: session.hostName,
            videoUrl: session.videoUrl,
            isPlaying: session.isPlaying,
            timestamp: session.timestamp
          });
        }
      }
      
      isHost = session.hostId === userId;
    }
    
    // Add participant to session
    session.participants.set(socket.id, {
      userId,
      userName,
      joinedAt: Date.now()
    });
    
    channelSessions.set(channelId, session);
    
    // Notify user of their role
    socket.emit('role_assigned', { 
      isHost, 
      userId,
      hostId: session.hostId,
      hostName: session.hostName,
      videoUrl: session.videoUrl,
      isPlaying: session.isPlaying,
      timestamp: session.timestamp
    });

    // Notify others in channel
    socket.to(channelId).emit('user_joined', { 
      userId, 
      userName, 
      isHost,
      participantCount: session.participants.size
    });
    
    // If this is a new session, notify all
    if (isNewSession) {
      broadcastToChannel(channelId, 'session_started', {
        hostId: userId,
        hostName: userName
      });
    }
    
    console.log(`User ${userName} joined channel ${channelId} as ${isHost ? 'Host' : 'Guest'} (${session.participants.size} participants)`);
  });

  // Host controls - update video state
  socket.on('video_control', ({ channelId, action, data }) => {
    if (!currentChannelId || currentChannelId !== channelId) return;
    
    const session = channelSessions.get(channelId);
    if (!session || session.hostId !== currentUserId) {
      socket.emit('error', { message: 'Only the host can control playback' });
      return;
    }

    switch (action) {
      case 'set_url':
        session.videoUrl = data.url;
        session.timestamp = 0;
        session.isPlaying = false;
        console.log(`Host set video URL: ${data.url}`);
        break;
      case 'play':
        session.isPlaying = true;
        session.timestamp = data.timestamp || 0;
        console.log(`Host playing at timestamp: ${session.timestamp}`);
        break;
      case 'pause':
        session.isPlaying = false;
        session.timestamp = data.timestamp || 0;
        console.log(`Host paused at timestamp: ${session.timestamp}`);
        break;
      case 'seek':
        session.timestamp = data.timestamp;
        console.log(`Host seeked to: ${session.timestamp}`);
        break;
      case 'sync':
        // Guests request sync - host sends current state
        socket.emit('video_state_update', {
          videoUrl: session.videoUrl,
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          hostId: session.hostId,
          hostName: session.hostName
        });
        return;
    }

    // Broadcast to all in channel including sender
    broadcastToChannel(channelId, 'video_state_update', {
      videoUrl: session.videoUrl,
      isPlaying: session.isPlaying,
      timestamp: session.timestamp,
      hostId: session.hostId,
      hostName: session.hostName
    });
  });

  // End session (host only)
  socket.on('end_session', ({ channelId }) => {
    if (!currentChannelId || currentChannelId !== channelId) return;
    
    const session = channelSessions.get(channelId);
    if (!session || session.hostId !== currentUserId) {
      socket.emit('error', { message: 'Only the host can end the session' });
      return;
    }

    console.log(`Host ${currentUserName} ended the session`);
    
    // Notify all participants
    broadcastToChannel(channelId, 'session_ended', {
      endedBy: 'host',
      hostName: currentUserName
    });
    
    // Clean up session
    channelSessions.delete(channelId);
    
    // Disconnect all participants
    const roomSockets = io.sockets.adapter.rooms.get(channelId);
    if (roomSockets) {
      roomSockets.forEach(socketId => {
        io.sockets.sockets.get(socketId)?.disconnect(true);
      });
    }
  });

  // Host mute control (for movie nights - force mute guests in VC)
  socket.on('mute_control', ({ channelId, action, data }) => {
    if (!currentChannelId || currentChannelId !== channelId) return;
    
    const session = channelSessions.get(channelId);
    if (!session || session.hostId !== currentUserId) {
      socket.emit('error', { message: 'Only the host can control mute' });
      return;
    }

    switch (action) {
      case 'toggle_guests':
        session.guestsMuted = data.guestsMuted;
        console.log(`Host ${currentUserName} ${session.guestsMuted ? 'muted' : 'unmuted'} all guests`);
        
        // Broadcast to all in channel
        broadcastToChannel(channelId, 'guests_muted_changed', {
          guestsMuted: session.guestsMuted
        });
        
        // Also update video state with mute status
        broadcastToChannel(channelId, 'video_state_update', {
          videoUrl: session.videoUrl,
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          hostId: session.hostId,
          hostName: session.hostName,
          guestsMuted: session.guestsMuted
        });
        break;
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    if (currentChannelId && currentUserId) {
      const session = channelSessions.get(currentChannelId);
      
      if (session) {
        // Remove participant
        session.participants.delete(socket.id);
        
        // Check if host left
        if (session.hostId === currentUserId) {
          console.log(`Host ${currentUserName} left the session`);
          
          // Find next host
          const nextHost = getNextHost(session);
          
          if (nextHost) {
            // Promote new host
            session.hostId = nextHost.userId;
            session.hostName = nextHost.userName;
            
            console.log(`New host assigned: ${nextHost.userName}`);
            
            // Notify the new host
            io.to(nextHost.socketId).emit('became_host', {
              previousHost: currentUserName,
              videoUrl: session.videoUrl,
              isPlaying: session.isPlaying,
              timestamp: session.timestamp
            });
            
            // Notify all participants about new host
            broadcastToChannel(currentChannelId, 'host_changed', {
              newHostId: nextHost.userId,
              newHostName: nextHost.userName,
              previousHost: currentUserName
            });
          } else {
            // No participants left, clean up session
            console.log(`Session ended (no participants left)`);
            broadcastToChannel(currentChannelId, 'session_ended', {
              endedBy: 'host_left',
              hostName: currentUserName
            });
            channelSessions.delete(currentChannelId);
            return;
          }
        }
        
        // Notify others that user left
        socket.to(currentChannelId).emit('user_left', { 
          userId: currentUserId,
          userName: currentUserName,
          participantCount: session.participants.size
        });
        
        console.log(`User ${currentUserName} left (${session.participants.size} participants remaining)`);
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`CinemaSync server running on port ${PORT}`);
});
