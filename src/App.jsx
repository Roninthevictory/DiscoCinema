
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EmbeddedAppSdk } from '@discord/embedded-app-sdk';
import { io } from 'socket.io-client';
import { Play, Pause, Link, Users, Film, Clock, Loader2, X, Volume2, VolumeX, Maximize, Minimize, AlertCircle, Mic, MicOff, MonitorPlay } from 'lucide-react';

const socket = io(window.location.origin);

function App() {
  const [sdk, setSdk] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [hostName, setHostName] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoState, setVideoState] = useState({
    url: null,
    isPlaying: false,
    timestamp: 0
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [participantCount, setParticipantCount] = useState(1);
  const [notification, setNotification] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [guestsMuted, setGuestsMuted] = useState(true); // Guests force muted by default
  const [participants, setParticipants] = useState([]);
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  // Show notification
  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Initialize Discord SDK
  useEffect(() => {
    const initSdk = async () => {
      try {
        const embeddedSdk = new EmbeddedAppSdk({
          debug: true,
          origin: window.location.origin
        });
        
        setSdk(embeddedSdk);
        
        // Wait for SDK ready
        await embeddedSdk.ready();
        console.log('SDK Ready');
        
        // Authorize with Discord
        const { code } = await embeddedSdk.authorize();
        
        // Exchange code for token via our server
        const tokenResponse = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        
        if (!tokenResponse.ok) {
          throw new Error('Failed to authenticate with Discord');
        }
        
        const tokenData = await tokenResponse.json();
        
        // Get user info
        const userResponse = await fetch('/api/user', {
          headers: { 
            'Authorization': `Bearer ${tokenData.access_token}` 
          }
        });
        
        if (!userResponse.ok) {
          throw new Error('Failed to get user info');
        }
        
        const userData = await userResponse.json();
        setUser(userData);
        setAuthenticated(true);
        
        // Get channel info from SDK
        const channelId = embeddedSdk.channelId;
        const guildId = embeddedSdk.guildId;
        
        // Join the socket room
        socket.emit('join_channel', {
          channelId,
          guildId,
          userId: userData.id,
          userName: userData.username
        });
        
        setIsLoading(false);
      } catch (err) {
        console.error('Initialization error:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };
    
    initSdk();
    
    return () => {
      if (sdk) {
        sdk.destroy();
      }
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    socket.on('role_assigned', ({ isHost, hostId, hostName, videoUrl, isPlaying, timestamp, participants }) => {
      setIsHost(isHost);
      setHostId(hostId);
      setHostName(hostName);
      console.log('Assigned role:', isHost ? 'Host' : 'Guest');
      
      if (videoUrl) {
        setVideoState({ url: videoUrl, isPlaying, timestamp });
      }
      
      if (participants) {
        setParticipants(Object.values(participants));
      }
    });

    socket.on('video_state_update', (state) => {
      console.log('Video state update:', state);
      setVideoState(state);
      setHostId(state.hostId);
      setHostName(state.hostName);
      setGuestsMuted(state.guestsMuted || false);
      
      if (videoRef.current && state.url) {
        // Only sync if difference is significant (>0.5 seconds)
        if (Math.abs(videoRef.current.currentTime - state.timestamp) > 0.5) {
          videoRef.current.currentTime = state.timestamp;
        }
        
        if (state.isPlaying && videoRef.current.paused) {
          videoRef.current.play().catch(console.error);
        } else if (!state.isPlaying && !videoRef.current.paused) {
          videoRef.current.pause();
        }
      }
    });

    socket.on('became_host', ({ previousHost, videoUrl, isPlaying, timestamp, guestsMuted }) => {
      setIsHost(true);
      setVideoState({ url: videoUrl, isPlaying, timestamp });
      setGuestsMuted(guestsMuted);
      showNotification(`You are now the host! ${previousHost ? `(${previousHost} left)` : ''}`, 'success');
      console.log('You became the host!');
    });

    socket.on('host_changed', ({ newHostId, newHostName, previousHost }) => {
      setHostId(newHostId);
      setHostName(newHostName);
      if (!isHost) {
        showNotification(`${newHostName} is now the host`, 'info');
      }
    });

    socket.on('session_started', ({ hostId, hostName, participants }) => {
      setSessionEnded(false);
      setHostId(hostId);
      setHostName(hostName);
      setGuestsMuted(true); // Force mute guests when session starts
      console.log(`Session started by ${hostName}`);
    });

    socket.on('session_ended', ({ endedBy, hostName }) => {
      setSessionEnded(true);
      setVideoState({ url: null, isPlaying: false, timestamp: 0 });
      showNotification(`Session ended by ${endedBy === 'host' ? 'host' : 'the previous host'}`, 'error');
      console.log('Session ended');
    });

    socket.on('user_joined', ({ userId, userName, isHost, participantCount, participantsList }) => {
      setParticipantCount(participantCount);
      if (participantsList) {
        setParticipants(participantsList);
      }
      if (!isHost) {
        showNotification(`${userName} joined the watch party`, 'info');
      }
    });

    socket.on('user_left', ({ userId, userName, participantCount, participantsList }) => {
      setParticipantCount(participantCount);
      if (participantsList) {
        setParticipants(participantsList);
      }
    });

    socket.on('participants_update', ({ participants: participantsList }) => {
      setParticipants(participantsList);
    });

    socket.on('guests_muted_changed', ({ guestsMuted }) => {
      setGuestsMuted(guestsMuted);
      showNotification(guestsMuted ? 'Host muted all guests' : 'Host unmuted guests', 'info');
    });

    socket.on('error', ({ message }) => {
      setError(message);
      showNotification(message, 'error');
    });

    return () => {
      socket.off('role_assigned');
      socket.off('video_state_update');
      socket.off('became_host');
      socket.off('host_changed');
      socket.off('session_started');
      socket.off('session_ended');
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('participants_update');
      socket.off('guests_muted_changed');
      socket.off('error');
    };
  }, [isHost, showNotification]);

  // Video event handlers
  const handleVideoLoad = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handlePlay = () => {
    if (isHost && videoState.url) {
      socket.emit('video_control', {
        channelId: sdk?.channelId,
        action: 'play',
        data: { timestamp: videoRef.current?.currentTime || 0 }
      });
    }
  };

  const handlePause = () => {
    if (isHost && videoState.url) {
      socket.emit('video_control', {
        channelId: sdk?.channelId,
        action: 'pause',
        data: { timestamp: videoRef.current?.currentTime || 0 }
      });
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
    if (isHost) {
      socket.emit('video_control', {
        channelId: sdk?.channelId,
        action: 'seek',
        data: { timestamp: time }
      });
    }
  };

  const handleSetUrl = (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    
    // Basic URL validation
    const url = videoUrl.trim();
    if (!url.match(/^https?:\/\/.+\..+/) && !url.match(/^blob:.+/)) {
      showNotification('Please enter a valid video URL', 'error');
      return;
    }
    
    socket.emit('video_control', {
      channelId: sdk?.channelId,
      action: 'set_url',
      data: { url }
    });
    
    setVideoUrl('');
  };

  const handleEndSession = () => {
    if (isHost) {
      socket.emit('end_session', {
        channelId: sdk?.channelId
      });
    }
  };

  const toggleGuestsMute = () => {
    if (isHost) {
      const newMutedState = !guestsMuted;
      socket.emit('mute_control', {
        channelId: sdk?.channelId,
        action: 'toggle_guests',
        data: { guestsMuted: newMutedState }
      });
    }
  };

  const requestSync = () => {
    socket.emit('video_control', {
      channelId: sdk?.channelId,
      action: 'sync'
    });
    showNotification('Sync requested', 'info');
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const toggleFullscreen = () => {
    if (playerRef.current) {
      if (!document.fullscreenElement) {
        playerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Initializing CinemaSync...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-400">{error}</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Session ended state
  if (sessionEnded) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Watch Party Ended</h2>
          <p className="text-gray-400 mb-4">The host has ended this session.</p>
          <p className="text-gray-500 text-sm">Close this activity and start a new one to watch together again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          notification.type === 'error' ? 'bg-red-500/90' :
          notification.type === 'success' ? 'bg-green-500/90' :
          'bg-blue-500/90'
        }`}>
          <AlertCircle className="w-5 h-5" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700/50 p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Film className="w-8 h-8 text-purple-500" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              CinemaSync
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-1.5 rounded-full">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">{participantCount} watching</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-1.5 rounded-full">
              <span className="text-sm text-gray-300">
                {user?.username || 'Loading...'}
              </span>
              {isHost && (
                <span className="bg-purple-500/20 text-purple-400 text-xs px-2 py-0.5 rounded-full font-semibold">
                  HOST
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4">
        {/* Video URL Input (Host Only) */}
        {isHost && (
          <div className="mb-6">
            <form onSubmit={handleSetUrl} className="flex gap-3">
              <div className="flex-1 relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Paste video URL (.mp4, .webm, direct video links)"
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Load Video
              </button>
            </form>
            <p className="text-gray-500 text-sm mt-2">
              Supported: Direct MP4/WebM links, CDN links, or any direct video URL
            </p>
          </div>
        )}

        {/* Host Controls Bar */}
        {isHost && (
          <div className="mb-4 flex items-center justify-between bg-gray-800/30 border border-gray-700/30 rounded-lg px-4 py-2">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                Current Host: <span className="text-white font-medium">{hostName}</span>
              </span>
              {videoState.url && (
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  videoState.isPlaying ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {videoState.isPlaying ? 'Playing' : 'Paused'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Mute Guests Button */}
              <button
                onClick={toggleGuestsMute}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  guestsMuted 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                    : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                }`}
                title={guestsMuted ? 'Unmute all guests' : 'Mute all guests'}
              >
                {guestsMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {guestsMuted ? 'Guests Muted' : 'Guests Unmuted'}
              </button>
              
              {/* End Session Button */}
              <button
                onClick={handleEndSession}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
                title="End session for everyone"
              >
                <X className="w-4 h-4" />
                End Session
              </button>
            </div>
          </div>
        )}

        {/* Guest Info Bar */}
        {!isHost && videoState.url && (
          <div className="mb-4 flex items-center justify-between bg-gray-800/30 border border-gray-700/30 rounded-lg px-4 py-2">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                Host: <span className="text-white font-medium">{hostName}</span>
              </span>
              {guestsMuted && (
                <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium">
                  <MicOff className="w-3 h-3" />
                  Muted by host
                </span>
              )}
            </div>
            <button
              onClick={requestSync}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              <MonitorPlay className="w-4 h-4" />
              Request Sync
            </button>
          </div>
        )}

        {/* Video Player */}
        <div 
          ref={playerRef}
          className="relative bg-black rounded-xl overflow-hidden aspect-video mb-4"
        >
          {videoState.url ? (
            <video
              ref={videoRef}
              src={videoState.url}
              className="w-full h-full"
              onLoadedMetadata={handleVideoLoad}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              playsInline
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800/30">
              <Film className="w-20 h-20 text-gray-600 mb-4" />
              <p className="text-gray-500 text-lg">
                {isHost ? 'Enter a video URL above to start' : 'Waiting for host to load a video...'}
              </p>
              {!isHost && (
                <button
                  onClick={requestSync}
                  className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
                >
                  Request Sync
                </button>
              )}
            </div>
          )}
        </div>

        {/* Video Controls */}
        {videoState.url && (
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (videoRef.current) {
                    if (videoState.isPlaying) {
                      videoRef.current.pause();
                    } else {
                      videoRef.current.play();
                    }
                  }
                }}
                disabled={!isHost}
                className={`p-3 rounded-full transition-colors ${
                  isHost 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {videoState.isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>
              
              <div className="flex-1 flex items-center gap-3">
                <span className="text-sm text-gray-400 font-mono w-12">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={!isHost}
                  className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer ${
                    isHost 
                      ? 'bg-gray-700 accent-purple-500' 
                      : 'bg-gray-800 cursor-not-allowed'
                  }`}
                />
                <span className="text-sm text-gray-400 font-mono w-12">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Volume Control */}
              <button
                onClick={toggleMute}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-gray-400" /> : <Volume2 className="w-5 h-5 text-gray-400" />}
              </button>
              
              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                {isFullscreen ? <Minimize className="w-5 h-5 text-gray-400" /> : <Maximize className="w-5 h-5 text-gray-400" />}
              </button>
              
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Clock className="w-4 h-4" />
                <span>
                  {videoState.isPlaying ? 'Playing' : 'Paused'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Info Panel */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-medium mb-2">Your Role</h3>
            <p className="text-xl font-semibold text-purple-400">
              {isHost ? 'Host (Control Playback)' : 'Guest (Follow Host)'}
            </p>
          </div>
          <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-medium mb-2">Sync Status</h3>
            <p className="text-xl font-semibold text-green-400">
              {videoState.url ? 'Connected' : 'Waiting for Video'}
            </p>
          </div>
          <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-medium mb-2">Instructions</h3>
            <p className="text-sm text-gray-300">
              {isHost 
                ? 'Paste a video URL above to start playback. Your guests will automatically sync. Use the mute button to control guest audio.'
                : 'Your playback is controlled by the host. Use "Request Sync" if out of sync. The host may mute you during the movie.'
              }
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

