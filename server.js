const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// --- CONFIGURATION ---
// IMPORTANT: Replace these with your actual Discord Application credentials
const CLIENT_ID = "1481396281644679259"; // Replace with actual ID
const CLIENT_SECRET = "TJGi3BSIQ81aEvn0BHnoAZYAmxp8i-E4";
const SERVER_NAME = "𝐓𝐡𝐞 𝐍𝐞𝐰 𝐄𝐫𝐚 〣June 2026";

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// --- STATE MANAGEMENT ---
let cinemaState = {
  videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  playing: false,
  currentTime: 0,
  hostId: null,
  lastUpdated: Date.now()
};

let users = new Map(); // socket.id -> userData

// --- API ROUTES ---
app.post('/api/token', async (req, res) => {
  const { code } = req.body;
  try {
    const response = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Token Exchange Error:", error.response?.data || error.message);
    res.status(400).json({ error: 'Failed to exchange token' });
  }
});

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
  socket.on('join-room', ({ guildId, user }) => {
    // UPDATED: Removed strict ALLOWED_GUILD_ID check to allow the app 
    // to work in whichever guild it is currently installed/launched in.
    if (!guildId) {
      socket.emit('access-denied', { message: "No Guild Context Found" });
      return;
    }

    users.set(socket.id, { ...user, id: socket.id, guildId });
    
    // Host Assignment
    if (!cinemaState.hostId) {
      cinemaState.hostId = socket.id;
    }

    socket.emit('sync-state', { state: cinemaState, hostId: cinemaState.hostId });
    io.emit('user-update', Array.from(users.values()));
    
    console.log(`User ${user.username} joined from Guild ${guildId}`);
  });

  socket.on('update-video', (newState) => {
    if (socket.id !== cinemaState.hostId) return;
    
    cinemaState = { 
      ...cinemaState, 
      ...newState, 
      lastUpdated: Date.now() 
    };
    socket.broadcast.emit('sync-state', { state: cinemaState, hostId: cinemaState.hostId });
  });

  socket.on('send-message', (msg) => {
    const user = users.get(socket.id);
    if (user) {
      io.emit('new-message', {
        id: Math.random().toString(36).substr(2, 9),
        user: user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png` : null,
        text: msg,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    if (cinemaState.hostId === socket.id) {
      const nextHost = users.keys().next().value;
      cinemaState.hostId = nextHost || null;
      io.emit('host-changed', cinemaState.hostId);
    }
    io.emit('user-update', Array.from(users.values()));
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`CinemaSync active on port ${PORT}`));
