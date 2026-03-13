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
    <div className="fixed inset-0 w-full h-full flex bg-[#050505] text-white overflow-hidden font-sans select-none">
      <style>{`
        .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(16px); }
        .cyan-glow { box-shadow: 0 0 30px rgba(0, 242, 255, 0.1); }
        .purple-glow { box-shadow: 0 0 30px rgba(157, 0, 255, 0.2); }
        .neon-border { border: 1px solid rgba(255, 255, 255, 0.1); }
        video { background: black; border-radius: 1.5rem; }
        *::-webkit-scrollbar { width: 4px; }
        *::-webkit-scrollbar-track { background: transparent; }
        *::-webkit-scrollbar-thumb { background: rgba(157, 0, 255, 0.3); border-radius: 10px; }
      `}</style>

      {/* Sidebar Nav */}
      <nav className="w-16 flex-shrink-0 h-full flex flex-col items-center py-8 gap-10 border-r border-white/5 glass z-50">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f2ff] to-[#9d00ff] flex items-center justify-center cyan-glow cursor-pointer transition-transform hover:scale-105 active:scale-95">
          <Film size={20} className="text-white" />
        </div>
        <div className="flex flex-col gap-8 text-white/30">
          <Monitor size={22} className="cursor-pointer hover:text-[#00f2ff] transition-all" />
          <div className="relative cursor-pointer group">
            <Users size={22} className="text-[#00f2ff] group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#00f2ff] rounded-full animate-pulse"></span>
          </div>
          <Radio size={22} className="cursor-pointer hover:text-[#9d00ff] transition-all" />
          <Settings size={22} className="cursor-pointer hover:text-white transition-all" />
        </div>
      </nav>

      {/* Center Display Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-16 px-10 flex flex-shrink-0 items-center justify-between border-b border-white/5 glass">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-black tracking-[0.2em] uppercase italic">
              NEON DISTRICT <span className="text-[#00f2ff] drop-shadow-[0_0_8px_rgba(0,242,255,0.5)]">CINEMA</span>
            </h1>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${isHost ? 'bg-[#9d00ff]/20 text-[#9d00ff] border border-[#9d00ff]/50 purple-glow' : 'bg-white/5 text-white/40 border border-white/10'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isHost ? 'bg-[#9d00ff] animate-pulse' : 'bg-white/20'}`}></div>
              {isHost ? 'Projectionist' : 'Audience'}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <span className="text-[10px] text-white/20 uppercase tracking-widest font-bold mr-2">Watchers: {onlineUsers.length}</span>
            <div className="flex -space-x-2">
              {onlineUsers.slice(0, 4).map((u, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#050505] bg-neutral-800 flex items-center justify-center overflow-hidden ring-1 ring-white/5" title={u.username}>
                   {u.avatar ? (
                     <img src={`https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png`} alt="avatar" className="w-full h-full object-cover" />
                   ) : (
                     <span className="text-[10px] font-bold">{u.username ? u.username[0] : '?'}</span>
                   )}
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Video Stage */}
        <div className="flex-1 p-8 flex flex-col gap-6 min-h-0 overflow-hidden relative">
          <div className="relative flex-1 rounded-[2rem] overflow-hidden glass neon-border cyan-glow bg-black flex items-center justify-center">
            {gameState.videoUrl ? (
              <video 
                ref={videoRef}
                src={gameState.videoUrl}
                className="w-full h-full object-contain pointer-events-auto"
                autoPlay
                controls={isHost}
              />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full border-2 border-white/5 flex items-center justify-center animate-pulse">
                  <Film size={32} className="text-white/10" />
                </div>
                <p className="uppercase tracking-[0.3em] text-[10px] font-black text-white/20">Waiting for transmission</p>
              </div>
            )}
            {!isHost && <div className="absolute inset-0 z-10" />}
          </div>

          {/* Host Input Area */}
          {isHost && (
            <div className="flex-shrink-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <form onSubmit={handleUrlSubmit} className="flex gap-4 p-1 glass rounded-2xl border border-white/10">
                <input 
                  type="text" 
                  placeholder="Insert Direct Media URL (MP4/WebM)..."
                  className="flex-1 bg-transparent border-none px-6 py-3 focus:outline-none text-sm placeholder:text-white/20 font-medium"
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                />
                <button className="bg-[#00f2ff] text-black px-8 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white transition-all shadow-[0_0_15px_rgba(0,242,255,0.4)]">
                  Execute
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Chat Component */}
      <aside className={`flex-shrink-0 h-full border-l border-white/5 glass flex flex-col transition-all duration-500 ease-out relative ${chatOpen ? 'w-80' : 'w-0'}`}>
        <div className={`flex flex-col h-full w-80 transition-opacity duration-300 ${!chatOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h2 className="font-black italic text-xs tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#9d00ff] shadow-[0_0_8px_#9d00ff]"></div>
              SECURE_LINK
            </h2>
            <div className="flex gap-1">
              <div className="w-1 h-3 bg-white/10"></div>
              <div className="w-1 h-3 bg-white/10"></div>
              <div className="w-1 h-3 bg-[#9d00ff]"></div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
            {messages.length === 0 && (
              <div className="mt-20 text-center opacity-10">
                 <Radio size={40} className="mx-auto mb-2" />
                 <p className="text-[10px] uppercase font-bold tracking-widest">Listening...</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className="flex flex-col gap-1.5 group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-[#00f2ff] uppercase tracking-tighter">{m.user}</span>
                  <span className="text-[8px] text-white/10 group-hover:text-white/30 transition-colors">{m.timestamp}</span>
                </div>
                <div className="text-xs bg-white/[0.03] p-3 rounded-2xl rounded-tl-none border border-white/5 leading-relaxed text-white/80">
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={sendMessage} className="p-6 border-t border-white/5">
            <div className="relative group">
              <input 
                type="text"
                placeholder="Broadcast a thought..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-5 pr-12 text-xs focus:outline-none focus:border-[#9d00ff]/50 focus:ring-1 focus:ring-[#9d00ff]/20 transition-all"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#9d00ff] hover:text-[#00f2ff] transition-colors">
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar Controls */}
        <button 
          onClick={() => setChatOpen(!chatOpen)}
          className={`absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center z-[60] hover:scale-110 transition-all shadow-xl ${chatOpen ? 'text-white' : 'text-[#00f2ff] -left-10 bg-black'}`}
        >
          {chatOpen ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
        </button>
      </aside>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#050505] text-white z-[100]">
      <div className="relative mb-8">
        <div className="w-20 h-20 border-t-2 border-[#00f2ff] border-r-2 border-transparent rounded-full animate-spin"></div>
        <Film className="absolute inset-0 m-auto text-[#00f2ff] animate-pulse" size={24} />
      </div>
      <div className="text-center">
        <h2 className="text-xs font-black tracking-[0.8em] uppercase text-white/40 animate-pulse">Establishing Link</h2>
        <div className="mt-4 flex gap-1 justify-center">
           {[...Array(3)].map((_, i) => (
             <div key={i} className="w-1 h-1 bg-[#00f2ff] rounded-full animate-bounce" style={{animationDelay: `${i * 0.2}s`}}></div>
           ))}
        </div>
      </div>
    </div>
  );
}

function Bouncer() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black p-6 text-white z-[100]">
      <div className="max-w-md w-full glass rounded-[2.5rem] p-12 border border-[#ff4646]/20 text-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#ff4646]/10 blur-[80px] rounded-full"></div>
        <ShieldAlert size={48} className="text-[#ff4646] mx-auto mb-8 drop-shadow-[0_0_10px_rgba(255,70,70,0.5)]" />
        <h2 className="text-2xl font-black tracking-tighter mb-4 text-[#ff4646] uppercase italic">Signal Blocked</h2>
        <p className="text-white/40 text-sm leading-relaxed mb-10 font-medium">
          The Discord handshake could not be verified. This activity must be initiated within a secure server environment.
        </p>
        <button onClick={() => window.location.reload()} className="px-8 py-3 bg-[#ff4646]/10 border border-[#ff4646]/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#ff4646]/20 transition-all">
          Retry Handshake
        </button>
      </div>
    </div>
  );
}
