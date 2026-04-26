import type { VideoFolder } from '../hooks/useFileSystem';

interface SidebarProps {
  folders: VideoFolder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onRemoveFolder: (id: string) => void;
  onAddFolder: () => void;
  onReopenFolder: (id?: string) => void;
  isLoading: boolean;
}

export function Sidebar({
  folders,
  activeFolderId,
  onSelectFolder,
  onRemoveFolder,
  onAddFolder,
  onReopenFolder,
  isLoading,
}: SidebarProps) {
  return (
    <aside className="w-56 flex-none flex flex-col overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(6,182,212,0.05) 0%, rgba(15,23,42,0.95) 30%, rgba(2,6,23,0.98) 100%)', borderRight: '1px solid rgba(6,182,212,0.12)', boxShadow: '2px 0 20px rgba(0,0,0,0.3)' }}>
      {/* Header */}
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

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-2">
        {folders.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <svg className="w-8 h-8 text-slate-700 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
            <p className="text-slate-600 text-xs">No folders yet</p>
          </div>
        ) : (
          folders.map(folder => (
            <FolderItem
              key={folder.id}
              folder={folder}
              isActive={folder.id === activeFolderId}
              onSelect={() => onSelectFolder(folder.id)}
              onRemove={() => onRemoveFolder(folder.id)}
              onReopen={() => onReopenFolder(folder.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {folders.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-800/60">
          <p className="text-slate-700 text-xs text-center">
            {folders.length} {folders.length === 1 ? 'folder' : 'folders'} saved
          </p>
        </div>
      )}
    </aside>
  );
}

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
      {/* Folder icon */}
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

      {/* Name + status */}
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

      {/* Remove button */}
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
