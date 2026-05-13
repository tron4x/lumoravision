import { useState } from 'react';
import type { VideoFolder } from '../hooks/useFileSystem';
import type { Collection, CollectionColor } from '../hooks/useCollections';
import { COLLECTION_COLORS } from '../hooks/useCollections';

interface SidebarProps {
  folders: VideoFolder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onRemoveFolder: (id: string) => void;
  onAddFolder: () => void;
  onReopenFolder: (id?: string) => void;
  isLoading: boolean;
  // Collections
  collections: Collection[];
  activeCollectionId: string | null;
  onSelectCollection: (id: string) => void;
  onCreateCollection: () => void;
  onOpenCollectionModal: (id: string) => void;
}

export function Sidebar({
  folders,
  activeFolderId,
  onSelectFolder,
  onRemoveFolder,
  onAddFolder,
  onReopenFolder,
  isLoading,
  collections,
  activeCollectionId,
  onSelectCollection,
  onCreateCollection,
  onOpenCollectionModal,
}: SidebarProps) {
  const [collectionsExpanded, setCollectionsExpanded] = useState(true);
  const [foldersExpanded, setFoldersExpanded] = useState(true);

  return (
    <aside
      className="w-56 flex-none flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(6,182,212,0.05) 0%, rgba(15,23,42,0.95) 30%, rgba(2,6,23,0.98) 100%)',
        borderRight: '1px solid rgba(6,182,212,0.12)',
        boxShadow: '2px 0 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* ── Add Folder button ── */}
      <div className="px-3 py-3 border-b border-white/5">
        <button
          onClick={onAddFolder}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          )}
          Add Folder
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto py-1">

        {/* ── FOLDERS section ── */}
        <div className="mb-1">
          <button
            onClick={() => setFoldersExpanded(p => !p)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left group"
          >
            <svg
              className={`w-3 h-3 text-slate-600 transition-transform flex-none ${foldersExpanded ? 'rotate-90' : ''}`}
              fill="currentColor" viewBox="0 0 24 24"
            >
              <path d="M10 17l5-5-5-5v10z" />
            </svg>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider group-hover:text-slate-400 transition-colors">
              Folders
            </span>
            <span className="text-xs text-slate-700 ml-auto">{folders.length}</span>
          </button>

          {foldersExpanded && (
            <div className="pb-1">
              {folders.length === 0 ? (
                <div className="px-4 py-3 text-center">
                  <p className="text-slate-700 text-xs">No folders yet</p>
                </div>
              ) : (
                folders.map(folder => (
                  <FolderItem
                    key={folder.id}
                    folder={folder}
                    isActive={folder.id === activeFolderId && activeCollectionId === null}
                    onSelect={() => onSelectFolder(folder.id)}
                    onRemove={() => onRemoveFolder(folder.id)}
                    onReopen={() => onReopenFolder(folder.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div className="mx-3 border-t border-slate-800/60 my-1" />

        {/* ── COLLECTIONS section ── */}
        <div>
          <div className="flex items-center">
            <button
              onClick={() => setCollectionsExpanded(p => !p)}
              className="flex-1 flex items-center gap-1.5 px-3 py-1.5 text-left group"
            >
              <svg
                className={`w-3 h-3 text-slate-600 transition-transform flex-none ${collectionsExpanded ? 'rotate-90' : ''}`}
                fill="currentColor" viewBox="0 0 24 24"
              >
                <path d="M10 17l5-5-5-5v10z" />
              </svg>
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider group-hover:text-slate-400 transition-colors">
                Collections
              </span>
              {collections.length > 0 && (
                <span className="text-xs text-slate-700 ml-auto">{collections.length}</span>
              )}
            </button>
            {/* New collection button */}
            <button
              onClick={onCreateCollection}
              className="w-7 h-7 flex items-center justify-center text-slate-600 hover:text-purple-400 transition-colors mr-1"
              title="New collection"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </button>
          </div>

          {collectionsExpanded && (
            <div className="pb-2">
              {collections.length === 0 ? (
                <div className="px-4 py-3 text-center">
                  <p className="text-slate-700 text-xs leading-relaxed">
                    No collections yet.
                    <br />
                    <button
                      onClick={onCreateCollection}
                      className="text-purple-500 hover:text-purple-400 transition-colors mt-0.5 inline-block"
                    >
                      + Create one
                    </button>
                  </p>
                </div>
              ) : (
                collections.map(col => (
                  <CollectionItem
                    key={col.id}
                    collection={col}
                    isActive={col.id === activeCollectionId}
                    onSelect={() => onSelectCollection(col.id)}
                    onEdit={() => onOpenCollectionModal(col.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      {(folders.length > 0 || collections.length > 0) && (
        <div className="px-3 py-2 border-t border-slate-800/60">
          <p className="text-slate-700 text-xs text-center">
            {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
            {collections.length > 0 && ` · ${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}`}
          </p>
        </div>
      )}
    </aside>
  );
}

// ── FolderItem ────────────────────────────────────────────────────────────────

interface FolderItemProps {
  folder: VideoFolder;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onReopen: () => void;
}

function FolderItem({ folder, isActive, onSelect, onRemove, onReopen }: FolderItemProps) {
  const needsReopen = folder.needsReopen === true;

  return (
    <div
      className={`group flex items-center gap-2 mx-2 px-2 py-2 rounded-lg cursor-pointer transition-all ${
        isActive
          ? 'bg-cyan-600/20 border border-cyan-500/30 glow-active'
          : needsReopen
          ? 'hover:bg-amber-900/20 border border-amber-800/20'
          : 'hover:bg-slate-800/60 border border-transparent'
      }`}
      onClick={needsReopen ? onReopen : onSelect}
      title={needsReopen ? `Reopen "${folder.name}"` : folder.name}
    >
      <div className={`flex-none w-7 h-7 rounded-md flex items-center justify-center ${
        isActive ? 'bg-cyan-600' : needsReopen ? 'bg-amber-800/40' : 'bg-slate-800'
      }`}>
        {needsReopen ? (
          <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        ) : (
          <svg className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${
          isActive ? 'text-cyan-300' : needsReopen ? 'text-amber-400' : 'text-slate-300 group-hover:text-white'
        }`}>
          {folder.name}
        </p>
        <p className={`text-xs ${needsReopen ? 'text-amber-600' : 'text-slate-600'}`}>
          {needsReopen
            ? '↺ Click to reopen'
            : `${folder.videos.length} ${folder.videos.length === 1 ? 'video' : 'videos'}`
          }
        </p>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="flex-none opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
        title="Remove folder"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

// ── CollectionItem ────────────────────────────────────────────────────────────

interface CollectionItemProps {
  collection: Collection;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
}

function CollectionItem({ collection, isActive, onSelect, onEdit }: CollectionItemProps) {
  const colors = COLLECTION_COLORS[collection.color];

  return (
    <div
      className={`group flex items-center gap-2 mx-2 px-2 py-2 rounded-lg cursor-pointer transition-all ${
        isActive
          ? `${colors.bg} border ${colors.border}`
          : 'hover:bg-slate-800/60 border border-transparent'
      }`}
      onClick={onSelect}
      title={collection.name}
    >
      {/* Color dot icon */}
      <div className={`flex-none w-7 h-7 rounded-md flex items-center justify-center ${isActive ? colors.bg : 'bg-slate-800'}`}>
        <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${isActive ? colors.text : 'text-slate-300 group-hover:text-white'}`}>
          {collection.name}
        </p>
        <p className="text-xs text-slate-600">
          {collection.memberIds.length} {collection.memberIds.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* Edit button */}
      <button
        onClick={e => { e.stopPropagation(); onEdit(); }}
        className="flex-none opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-all"
        title="Edit collection"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      </button>
    </div>
  );
}

// ── NewCollectionDialog ───────────────────────────────────────────────────────
// Exported so App.tsx can render it as a modal overlay

const COLOR_OPTIONS: CollectionColor[] = ['cyan', 'purple', 'amber', 'emerald', 'rose', 'blue', 'orange'];

interface NewCollectionDialogProps {
  onConfirm: (name: string, color: CollectionColor) => void;
  onCancel: () => void;
}

export function NewCollectionDialog({ onConfirm, onCancel }: NewCollectionDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<CollectionColor>('purple');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/60">
          <button onClick={onCancel} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 flex-none" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
          <span className="flex-1 text-center text-sm font-semibold text-slate-300">New Collection</span>
        </div>

        <div className="p-5 space-y-4">
          {/* Name input */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Name</label>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Project Berlin 2024"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && name.trim()) onConfirm(name, color);
                if (e.key === 'Escape') onCancel();
              }}
              maxLength={60}
              className="w-full bg-slate-800 text-slate-100 placeholder-slate-600 text-sm px-3 py-2 rounded-xl border border-slate-700 focus:border-purple-500/60 focus:outline-none transition-colors"
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Accent Color</label>
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-all ${COLLECTION_COLORS[c].dot} ${
                    c === color
                      ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-slate-900 scale-110'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLLECTION_COLORS[color].bg} border ${COLLECTION_COLORS[color].border}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${COLLECTION_COLORS[color].dot}`} />
            <span className={`text-sm font-medium ${COLLECTION_COLORS[color].text}`}>
              {name.trim() || 'New Collection'}
            </span>
            <span className="text-xs text-slate-600 ml-auto">0 items</span>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (name.trim()) onConfirm(name, color); }}
              disabled={!name.trim()}
              className={`flex-1 px-4 py-2 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${COLLECTION_COLORS[color].dot.replace('bg-', 'bg-').replace('-500', '-600')} hover:opacity-90`}
              style={{ backgroundColor: color === 'cyan' ? '#0891b2' : color === 'purple' ? '#9333ea' : color === 'amber' ? '#d97706' : color === 'emerald' ? '#059669' : color === 'rose' ? '#e11d48' : color === 'blue' ? '#2563eb' : '#ea580c' }}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
