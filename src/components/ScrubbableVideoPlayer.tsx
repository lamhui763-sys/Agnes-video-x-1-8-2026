import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Maximize2, Download, Loader2, Volume2 } from 'lucide-react';
import { speakDialogue } from '../lib/ttsUtils';

export const ScrubbableVideoPlayer = ({ src, className, dialogue }: { src: string, className?: string, dialogue?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const proxiedSrc = src && (src.startsWith('http') || src.startsWith('/assets/'))
    ? `/api/video-proxy?url=${encodeURIComponent(src)}`
    : src;

  const playPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    
    const video = videoRef.current;
    if (video) {
      if (playPromiseRef.current) {
        // If there is an active play promise, wait for it before loading to avoid AbortError
        playPromiseRef.current
          .catch(() => {})
          .finally(() => {
            if (videoRef.current) {
              videoRef.current.load();
            }
          });
      } else {
        video.load();
      }
    }
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => setDuration(video.duration);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      if (playPromiseRef.current) {
        // Wait for the active play request to finish before pausing to prevent DOMException
        playPromiseRef.current
          .then(() => {
            if (videoRef.current) videoRef.current.pause();
          })
          .catch(() => {
            if (videoRef.current) videoRef.current.pause();
          });
      } else {
        video.pause();
      }
    } else {
      if (dialogue) {
        speakDialogue(dialogue);
      }
      const promise = video.play();
      if (promise !== undefined) {
        playPromiseRef.current = promise;
        promise
          .then(() => {
            playPromiseRef.current = null;
          })
          .catch((error) => {
            playPromiseRef.current = null;
            if (error.name !== 'AbortError') {
              console.warn("Playback failed or was interrupted:", error);
            }
          });
      }
    }
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDownloading) return;
    try {
      setIsDownloading(true);
      try {
        const res = await fetch(`/api/download?url=${encodeURIComponent(src)}`);
        if (!res.ok) throw new Error("API download failed");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = "video.mp4";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch (dlErr) {
        console.warn("Proxy download endpoint failed, falling back to direct anchor download:", dlErr);
        const a = document.createElement("a");
        a.href = src;
        a.target = "_blank";
        a.download = "video.mp4";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download video:", error);
      alert("下載失敗，請稍後再試");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div 
      className={`relative flex flex-col overflow-hidden bg-black ${className || ''}`} 
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {proxiedSrc ? (
        <video
          ref={videoRef}
          src={proxiedSrc}
          className="w-full h-full object-contain cursor-pointer"
          onClick={togglePlay}
          playsInline
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full text-slate-400 text-xs text-center p-4">
          無效的影片來源
        </div>
      )}
      
      <div 
        className={`absolute bottom-0 left-0 right-0 px-3 py-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 ${isHovering || !isPlaying ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="flex flex-col gap-2">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.01"
            value={currentTime}
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 hover:h-2 transition-all"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={togglePlay} 
                className="text-white hover:text-emerald-400 transition-colors"
                title={isPlaying ? "暫停" : "播放"}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>
              <span className="text-white text-[11px] font-mono opacity-80">
                {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
              </span>
              {dialogue && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    speakDialogue(dialogue);
                  }}
                  className="flex items-center gap-1 text-[10px] font-mono text-pink-300 bg-pink-500/20 hover:bg-pink-500/30 px-2 py-0.5 rounded-full border border-pink-500/30 transition cursor-pointer"
                  title="朗讀對白語音"
                >
                  <Volume2 className="w-3 h-3 text-pink-400" />
                  <span>朗讀對白</span>
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownload}
                className={`text-white hover:text-emerald-400 transition-colors ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="下載影片"
                disabled={isDownloading}
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
              <button 
                onClick={handleFullscreen} 
                className="text-white hover:text-emerald-400 transition-colors"
                title="全螢幕"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
