/**
 * CollectionModal
 *
 * A full-screen overlay that lets the user manage a single Collection:
 *  - Rename it (inline edit)
 *  - Change its accent color
 *  - Add / remove videos and images from all loaded folders
 *  - Delete the collection
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import type { VideoFile, ImageFile } from '../types/video';
import type { Collection, CollectionColor } from '../hooks/useCollections';
import { COLLECTION_COLORS } from '../hooks/useCollections';
import { runThumbJob } from '../utils/thumbQueue';

// ── Thumbnail cache — shared module-level Map (capped + survives re-renders) ─
const THUMB_CACHE_MAX = 200;
const thumbCache = new Map<string, string>();
function thumbCachePut(id: string, dataUrl: string) {
  if (thumbCache.size >= THUMB_CACHE_MAX && !thumbCache.has(id)) {
    const firstKey = thumbCache.keys().next().value;
    if (firstKey !== undefined) thumbCache.delete(firstKey);
  }
  thumbCache.set(id, dataUrl);
}

function useVideoThumb(video: VideoFile): string | null {
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(video.id) ?? null);
  // Track mounted state to avoid setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (thumb) return;
    runThumbJob(() => new Promise<void>(resolve => {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      let done = false;
      const finishOnce = () => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        try { v.src = ''; v.load(); } catch { /* ignore */ }
        resolve();
      };
      const capture = () => {
        v.removeEventListener('seeked', capture);
        if (done) return;
        const c = document.createElement('canvas'); c.width = 160; c.height = 90;
        const ctx = c.getContext('2d');
        if (!ctx) { finishOnce(); return; }
        try {
          ctx.drawImage(v, 0, 0, 160, 90);
          const url = c.toDataURL('image/jpeg', 0.75);
          thumbCachePut(video.id, url);
          if (mountedRef.current) setThumb(url);
        } catch { /* ignore */ }
        finishOnce();
      };
      // Watchdog – if the browser never fires seeked/loadeddata (corrupt or
      // unsupported codec), free resources after 10s instead of leaking.
      const timeoutId = setTimeout(finishOnce, 10000);
      v.onloadeddata = () => {
        if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration * 0.1;
        else capture();
      };
      v.addEventListener('seeked', capture, { once: true });
      v.onerror = () => { finishOnce(); };
      v.src = video.url; v.load();
    }));
  }, [video, thumb]);

  return thumb;
}

interface CollectionModalProps {
  collection: Collection;
  /** All videos from ALL loaded folders */
  allVideos: VideoFile[];
  /** All images from ALL loaded folders */
  allImages: ImageFile[];
  onClose: () => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: CollectionColor) => void;
  onToggle: (collectionId: string, fileId: string) => void;
  onDelete: (id: string) => void;
}

const COLOR_OPTIONS: CollectionColor[] = ['cyan', 'purple', 'amber', 'emerald', 'rose', 'blue', 'orange'];

export function CollectionModal({
  collection,
  allVideos,
  allImages,
  onClose,
  onRename,
  onRecolor,
  onToggle,
  onDelete,
}: CollectionModalProps) {
  const [nameValue, setNameValue] = useState(collection.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'videos' | 'images'>('videos');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const colors = COLLECTION_COLORS[collection.color];

  // Focus name input when editing starts
  useEffect(() => {
    if (isEditingName) nameInputRef.current?.focus();
  }, [isEditingName]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditingName) { setIsEditingName(false); setNameValue(collection.name); }
        else if (confirmDelete) setConfirmDelete(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditingName, confirmDelete, collection.name, onClose]);

  const commitRename = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== collection.name) onRename(collection.id, trimmed);
    else setNameValue(collection.name);
    setIsEditingName(false);
  };

  const memberSet = useMemo(() => new Set(collection.memberIds), [collection.memberIds]);

  const filteredVideos = useMemo(() => {
    const q = search.toLowerCase();
    return allVideos
      .filter(v => !showSelectedOnly || memberSet.has(v.id))
      .filter(v => !q || v.name.toLowerCase().includes(q));
  }, [allVideos, search, showSelectedOnly, memberSet]);

  const filteredImages = useMemo(() => {
    const q = search.toLowerCase();
    return allImages
      .filter(img => !showSelectedOnly || memberSet.has(img.id))
      .filter(img => !q || img.name.toLowerCase().includes(q));
  }, [allImages, search, showSelectedOnly, memberSet]);

  const memberVideos = useMemo(() => allVideos.filter(v => memberSet.has(v.id)), [allVideos, memberSet]);
  const memberImages = useMemo(() => allImages.filter(img => memberSet.has(img.id)), [allImages, memberSet]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-slate-950 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-slate-800/60 w-full max-w-3xl"
        style={{ height: 'calc(100vh - 4rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Title bar ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/60 flex-none">
          <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 flex-none" title="Close (Esc)" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />

          {/* Collection dot */}
          <div className={`w-2.5 h-2.5 rounded-full flex-none ml-2 ${colors.dot}`} />

          {/* Editable name */}
          {isEditingName ? (
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setIsEditingName(false); setNameValue(collection.name); } }}
              className="flex-1 bg-slate-800 text-slate-100 text-sm font-semibold px-2 py-0.5 rounded-lg border border-cyan-500/60 focus:outline-none"
              maxLength={60}
            />
          ) : (
            <button
              className="flex-1 text-left text-slate-200 font-semibold text-sm truncate hover:text-white transition-colors"
              onClick={() => setIsEditingName(true)}
              title="Click to rename"
            >
              {collection.name}
              <svg className="inline w-3 h-3 text-slate-600 ml-1.5 mb-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
          )}

          <span className="text-xs text-slate-600 flex-none">
            {collection.memberIds.length} item{collection.memberIds.length !== 1 ? 's' : ''}
          </span>

          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors flex-none ml-1">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* ── Color picker + stats bar ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/50 border-b border-slate-800/40 flex-none">
          <span className="text-xs text-slate-600">Color:</span>
          <div className="flex items-center gap-1.5">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                onClick={() => onRecolor(collection.id, c)}
                className={`w-5 h-5 rounded-full transition-all ${COLLECTION_COLORS[c].dot} ${c === collection.color ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-slate-900 scale-110' : 'opacity-60 hover:opacity-100'}`}
                title={c}
              />
            ))}
          </div>

          <div className="flex-1" />

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-slate-600">
            {memberVideos.length > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-cyan-600" fill="currentColor" viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
                {memberVideos.length} video{memberVideos.length !== 1 ? 's' : ''}
              </span>
            )}
            {memberImages.length > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                {memberImages.length} image{memberImages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Delete button */}
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-400">Delete collection?</span>
              <button
                onClick={() => { onDelete(collection.id); onClose(); }}
                className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-colors"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 px-2 py-1 bg-red-600/10 hover:bg-red-600/25 text-red-500 text-xs rounded-lg border border-red-500/20 transition-colors"
              title="Delete collection"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              Delete
            </button>
          )}
        </div>

        {/* ── Body: tabs + search + file list ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar + search */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800/40 flex-none">
            <div className="flex items-center bg-slate-800/60 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setTab('videos')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === 'videos' ? `${colors.bg} ${colors.text}` : 'text-slate-500 hover:text-slate-300'}`}
              >
                Videos
                <span className="ml-1.5 text-slate-600 text-xs">{allVideos.length}</span>
              </button>
              <button
                onClick={() => setTab('images')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === 'images' ? `${colors.bg} ${colors.text}` : 'text-slate-500 hover:text-slate-300'}`}
              >
                Images
                <span className="ml-1.5 text-slate-600 text-xs">{allImages.length}</span>
              </button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                placeholder="Filter files…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 placeholder-slate-600 text-xs rounded-lg pl-7 pr-3 py-1.5 border border-slate-700 focus:border-slate-500 focus:outline-none transition-colors"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              )}
            </div>

            {/* Show selected only toggle */}
            <button
              onClick={() => setShowSelectedOnly(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex-none ${
                showSelectedOnly
                  ? `${colors.bg} ${colors.text} ${colors.border}`
                  : 'bg-slate-800/60 text-slate-500 border-slate-700 hover:text-slate-300'
              }`}
              title="Show only selected files"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              Selected only
              {showSelectedOnly && (
                <span className="ml-0.5 opacity-70">
                  ({tab === 'videos' ? memberVideos.length : memberImages.length})
                </span>
              )}
            </button>

            <span className="text-xs text-slate-600 flex-none">
              Click to toggle
            </span>
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'videos' && (
              filteredVideos.length === 0 ? (
                <EmptyState message={search ? `No videos matching "${search}"` : 'No videos in any folder'} />
              ) : (
                <div className="p-2 space-y-0.5">
                  {filteredVideos.map(video => (
                    <VideoFileRow
                      key={video.id}
                      video={video}
                      isMember={memberSet.has(video.id)}
                      color={collection.color}
                      onToggle={() => onToggle(collection.id, video.id)}
                    />
                  ))}
                </div>
              )
            )}

            {tab === 'images' && (
              filteredImages.length === 0 ? (
                <EmptyState message={search ? `No images matching "${search}"` : 'No images in any folder'} />
              ) : (
                <div className="p-2 space-y-0.5">
                  {filteredImages.map(image => (
                    <ImageFileRow
                      key={image.id}
                      image={image}
                      isMember={memberSet.has(image.id)}
                      color={collection.color}
                      onToggle={() => onToggle(collection.id, image.id)}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Image row with actual image thumbnail preview */
function ImageFileRow({
  image,
  isMember,
  color,
  onToggle,
}: {
  image: ImageFile;
  isMember: boolean;
  color: CollectionColor;
  onToggle: () => void;
}) {
  const colors = COLLECTION_COLORS[color];
  const sizeKB = Math.round(image.size / 1024);
  const sizeTxt = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left group ${
        isMember
          ? `${colors.bg} border ${colors.border}`
          : 'border border-transparent hover:bg-slate-800/60'
      }`}
    >
      {/* Image thumbnail */}
      <div className="flex-none w-24 h-14 rounded-lg overflow-hidden bg-slate-800 relative">
        <img
          src={image.url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
          draggable={false}
        />
        {/* Member badge */}
        {isMember && (
          <div className={`absolute top-1 right-1 w-4 h-4 rounded-full ${colors.dot} flex items-center justify-center`}>
            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </div>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate font-medium ${isMember ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
          {image.name.replace(/\.[^/.]+$/, '')}
        </p>
        <p className="text-xs text-slate-600 mt-0.5">
          {image.extension.toUpperCase()} · {sizeTxt}
        </p>
      </div>

      {/* Add / remove button */}
      <div className={`flex-none w-7 h-7 rounded-full flex items-center justify-center transition-all ${
        isMember
          ? `${colors.dot} text-white`
          : 'bg-slate-700 text-slate-500 group-hover:bg-slate-600 group-hover:text-slate-300'
      }`}>
        {isMember ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        )}
      </div>
    </button>
  );
}

/** Video row with thumbnail + hover-to-play preview */
function VideoFileRow({
  video,
  isMember,
  color,
  onToggle,
}: {
  video: VideoFile;
  isMember: boolean;
  color: CollectionColor;
  onToggle: () => void;
}) {
  const colors = COLLECTION_COLORS[color];
  const thumb = useVideoThumb(video);
  const [hovering, setHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Play/pause on hover
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (hovering) {
      el.currentTime = 0;
      el.play().catch(() => {});
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [hovering]);

  const sizeKB = Math.round(video.size / 1024);
  const sizeTxt = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
  const ext = video.extension.toUpperCase();

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left group ${
        isMember
          ? `${colors.bg} border ${colors.border}`
          : 'border border-transparent hover:bg-slate-800/60'
      }`}
    >
      {/* Thumbnail / hover-video */}
      <div className="flex-none w-24 h-14 rounded-lg overflow-hidden bg-slate-800 relative">
        {/* Static thumbnail */}
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${hovering ? 'opacity-0' : 'opacity-100'}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-600 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
            </svg>
          </div>
        )}

        {/* Hover video preview */}
        <video
          ref={videoRef}
          src={video.url}
          muted
          playsInline
          loop
          preload="none"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${hovering ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* Play indicator overlay */}
        {hovering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
              <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        )}

        {/* Member badge */}
        {isMember && (
          <div className={`absolute top-1 right-1 w-4 h-4 rounded-full ${colors.dot} flex items-center justify-center`}>
            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </div>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate font-medium ${isMember ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
          {video.name.replace(/\.[^/.]+$/, '')}
        </p>
        <p className="text-xs text-slate-600 mt-0.5">
          {ext} · {sizeTxt}
          {video.duration ? ` · ${Math.floor(video.duration / 60)}:${String(Math.floor(video.duration % 60)).padStart(2, '0')}` : ''}
        </p>
        <p className="text-xs text-slate-700 mt-0.5 truncate">{video.file.name}</p>
      </div>

      {/* Add / remove button */}
      <div className={`flex-none w-7 h-7 rounded-full flex items-center justify-center transition-all ${
        isMember
          ? `${colors.dot} text-white`
          : 'bg-slate-700 text-slate-500 group-hover:bg-slate-600 group-hover:text-slate-300'
      }`}>
        {isMember ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        )}
      </div>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 gap-2">
      <svg className="w-8 h-8 text-slate-700" fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
      </svg>
      <p className="text-slate-600 text-sm">{message}</p>
    </div>
  );
}
