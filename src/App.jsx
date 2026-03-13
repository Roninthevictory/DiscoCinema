import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Play, Pause, Send, Users, 
  ChevronRight, ChevronLeft, ShieldAlert,
  Film, Radio, Monitor, Settings
} from 'lucide-react';

const DiscordSDK = window.DiscordSDK?.DiscordSDK || class {
  constructor() { this.commands = { authorize: async () => ({ code: '' }), authenticate: async () => ({ user: { username: 'User', id: '0' } }) }; this.ready = async () => {}; }
};

// --- CONFIGURATION ---
const CLIENT_ID = "1481396281644679259"; 
const discordSdk = new DiscordSDK(CLIENT_ID);
const socket = io();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  
  const [gameState, setGameState] = useState({
    videoUrl: "",
    playing: false,
    currentTime: 0,
    hostId: null
  });

  const videoRef = useRef(null);

  useEffect(() => {
    const setupDiscord = async () => {
      try {
        await discordSdk.ready();

        // Detect if we are in the real Discord client activity environment
        // Discord activities usually run on a specific domain or within an iframe with specific properties
        const isActualDiscordClient = window.location.host.includes('discord') && !window.location.host.includes('usercontent.goog');

        if (isActualDiscordClient) {
          const { code } = await discordSdk.commands.authorize({
            client_id: CLIENT_ID,
            response_type: 'code',
            scope: ['identify', 'guilds', 'rpc.activities.write'],
            prompt: 'none',
          });

          const tokenUrl = `${window.location.origin}/api/token`;
          const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          
          // If the server-side exchange fails (likely due to missing Client Secret on Render),
          // we gracefully fall back to a simplified identifying state so the app doesn't crash.
          if (!response.ok) {
            console.warn("Auth Token Exchange Failed at server. Falling back to anonymous.");
            throw new Error("Handshake Fail");
          }
          
          const { access_token } = await response.json();
          const newAuth = await discordSdk.commands.authenticate({ access_token });

          socket.emit('join-room', { 
            guildId: discordSdk.guildId || "unknown-guild", 
            user: { 
              username: newAuth.user.username, 
              discordId: newAuth.user.id,
              avatar: newAuth.user.avatar
            } 
          });
        } else {
          // Bypass auth exchange for previews and internal testing environments
          // This prevents the "Auth Token Exchange Failed" error when the backend isn't reachable or configured
          socket.emit('join-room', { 
            guildId: "preview-room", 
            user: { 
              username: "Guest User", 
              discordId: "0",
              avatar: null
            } 
          });
        }

        setIsReady(true);
      } catch (error) {
        console.error("Discord initialization failed:", error);
        
        // Final fallback: allow entry as a guest if we aren't in the strict Discord client
        if (!window.location.host.includes('discord.com')) {
            socket.emit('join-room', { 
              guildId: "guest-room", 
              user: { username: "Guest", discordId: "0", avatar: null } 
            });
            setIsReady(true);
        } else {
            setAccessDenied(true);
        }
      }
    };

    setupDiscord();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    socket.on('access-denied', () => setAccessDenied(true));
    
    socket.on('sync-state', ({ state, hostId }) => {
      setGameState(prev => {
        if (videoRef.current && socket.id !== hostId) {
          const drift = Math.abs(videoRef.current.currentTime - state.currentTime);
          if (drift > 1.5) {
            videoRef.current.currentTime = state.currentTime;
          }
          
          if (state.playing) videoRef.current.play().catch(() => {});
          else videoRef.current.pause();
        }
        return { ...state, hostId };
      });
    });

    socket.on('host-changed', (newHostId) => {
      setGameState(prev => ({ ...prev, hostId: newHostId }));
    });

    socket.on('new-message', (msg) => {
      setMessages(prev => [...prev.slice(-50), msg]);
    });

    socket.on('user-update', (users) => setOnlineUsers(users));

    return () => {
      socket.off('access-denied');
      socket.off('sync-state');
      socket.off('host-changed');
      socket.off('new-message');
      socket.off('user-update');
    };
  }, [isReady]);

  useEffect(() => {
    if (gameState.hostId === socket.id) {
      const interval = setInterval(() => {
        if (videoRef.current) {
          socket.emit('update-video', {
            currentTime: videoRef.current.currentTime,
            playing: !videoRef.current.paused
          });
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState.hostId, isReady]);

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (gameState.hostId !== socket.id) return;
    socket.emit('update-video', { videoUrl: videoUrlInput, currentTime: 0, playing: true });
    setVideoUrlInput("");
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('send-message', chatInput);
    setChatInput("");
  };

  if (accessDenied) return <Bouncer />;
  if (!isReady) return <LoadingScreen />;

  const isHost = gameState.hostId === socket.id;

  return (
    <div className="h-screen w-screen flex bg-[#050505] text-white overflow-hidden relative">
      <nav className="w-16 h-full flex flex-col items-center py-6 gap-8 border-r border-white/10 glass z-50">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f2ff] to-[#9d00ff] flex items-center justify-center cyan-glow">
          <Film size={20} />
        </div>
        <div className="flex flex-col gap-6 text-white/40">
          <Monitor size={22} className="cursor-pointer hover:text-white transition-colors" />
          <div className="relative">
            <Users size={22} className="cursor-pointer hover:text-white transition-colors" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#00f2ff] rounded-full animate-ping"></span>
          </div>
          <Settings size={22} className="cursor-pointer hover:text-white transition-colors" />
        </div>
      </nav>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-16 px-8 flex items-center justify-between border-b border-white/10 glass">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tighter uppercase italic">NEON DISTRICT <span className="text-[#00f2ff]">CINEMA</span></h1>
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${isHost ? 'bg-[#9d00ff] purple-glow' : 'bg-white/10'}`}>
              {isHost ? 'Master Control' : 'Sync Active'}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {onlineUsers.slice(0, 5).map((u, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#050505] bg-gray-700 flex items-center justify-center overflow-hidden" title={u.username}>
                   {u.avatar ? (
                     <img src={`https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png`} alt="avatar" />
                   ) : (
                     <div className="text-[10px] uppercase">{u.username ? u.username[0] : '?'}</div>
                   )}
                </div>
              ))}
              {onlineUsers.length > 5 && (
                <div className="w-8 h-8 rounded-full border-2 border-[#050505] bg-white/10 flex items-center justify-center text-[10px]">
                  +{onlineUsers.length - 5}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 flex flex-col gap-6">
          <div className="relative group flex-1 rounded-3xl overflow-hidden glass border-white/5 cyan-glow bg-black flex items-center justify-center">
            {gameState.videoUrl ? (
              <video 
                ref={videoRef}
                src={gameState.videoUrl}
                className="w-full h-full object-contain"
                autoPlay
                controls={isHost}
                onPlay={() => isHost && socket.emit('update-video', { playing: true })}
                onPause={() => isHost && socket.emit('update-video', { playing: false })}
              />
            ) : (
              <div className="text-center text-white/20">
                <Film size={64} className="mx-auto mb-4 opacity-20" />
                <p className="uppercase tracking-[0.2em] text-sm">Waiting for transmission...</p>
              </div>
            )}
            {!isHost && <div className="absolute inset-0 z-10 cursor-not-allowed" />}
          </div>

          {isHost && (
            <form onSubmit={handleUrlSubmit} className="flex gap-4">
              <input 
                type="text" 
                placeholder="Direct MP4 URL (e.g. https://example.com/movie.mp4)"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-6 py-3 focus:outline-none focus:border-[#00f2ff] transition-all text-sm"
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
              />
              <button className="bg-gradient-to-r from-[#00f2ff] to-[#9d00ff] px-8 rounded-xl font-bold hover:opacity-90 transition-opacity text-sm whitespace-nowrap">
                BROADCAST
              </button>
            </form>
          )}
        </div>
      </main>

      <aside className={`${chatOpen ? 'w-80' : 'w-0'} transition-all duration-500 h-full border-l border-[#9d00ff]/30 glass flex flex-col relative`}>
        <button 
          onClick={() => setChatOpen(!chatOpen)}
          className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#9d00ff] flex items-center justify-center z-50 hover:scale-110 transition-transform shadow-lg"
        >
          {chatOpen ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
        </button>

        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2 text-sm"><Send size={14} className="text-[#9d00ff]"/> COMMS_CHANNEL</h2>
          <span className="text-[9px] text-white/30 uppercase tracking-widest font-bold">V-SYNC</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center text-white/10 text-xs italic">No incoming transmissions</div>
          )}
          {messages.map(m => (
            <div key={m.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-[#00f2ff] uppercase tracking-tighter">{m.user}</span>
                <span className="text-[8px] text-white/20">{m.timestamp}</span>
              </div>
              <p className="text-xs bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/5 leading-relaxed">{m.text}</p>
            </div>
          ))}
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t border-white/10">
          <div className="relative">
            <input 
              type="text"
              placeholder="Type a message..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-4 pr-12 text-xs focus:outline-none focus:border-[#9d00ff]"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9d00ff] hover:text-[#00f2ff] transition-colors">
              <Send size={16} />
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#050505] gap-6">
      <div className="relative">
        <div className="w-24 h-24 border-t-2 border-[#00f2ff] border-r-2 border-transparent rounded-full animate-spin"></div>
        <Film className="absolute inset-0 m-auto text-[#00f2ff] animate-pulse" size={28} />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-bold tracking-[0.4em] animate-pulse uppercase text-[#00f2ff]">Connecting</h2>
        <p className="text-[9px] text-white/20 uppercase tracking-[0.2em] mt-2">Bypassing internal firewalls...</p>
      </div>
    </div>
  );
}

function Bouncer() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-black p-6">
      <div className="max-w-md w-full glass rounded-3xl p-10 border-[#ff4646]/30 text-center relative overflow-hidden">
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-[#ff4646]/20 blur-[100px] rounded-full"></div>
        <ShieldAlert size={48} className="text-[#ff4646] mx-auto mb-6" />
        <h2 className="text-2xl font-black tracking-tighter mb-4 text-[#ff4646] uppercase">Identity Check Failed</h2>
        <p className="text-white/60 text-sm leading-relaxed mb-8">
          The Discord handshake could not be completed. Please ensure you are running this as an Activity within a Discord server.
        </p>
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-[#ff4646] w-1/3 animate-[shimmer_2s_infinite]"></div>
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
