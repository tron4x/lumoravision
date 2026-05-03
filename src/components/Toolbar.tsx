import type { SortConfig, SortField, ViewMode } from '../types/video';

interface ToolbarProps {
  sortConfig: SortConfig;
  onSort: (field: SortField) => void;
  videoCount: number;
  folderName: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onRescan?: () => void;
  onInfo: () => void;
  onDirector?: () => void;
}

function SortButton({
  field,
  label,
  sortConfig,
  onSort,
}: {
  field: SortField;
  label: string;
  sortConfig: SortConfig;
  onSort: (f: SortField) => void;
}) {
  const isActive = sortConfig.field === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        isActive
          ? 'bg-cyan-600 text-white'
          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
      }`}
    >
      {label}
      {isActive && (
        <svg
          className={`w-3 h-3 transition-transform ${sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M7 14l5-5 5 5z" />
        </svg>
      )}
    </button>
  );
}

export function Toolbar({
  sortConfig,
  onSort,
  videoCount,
  folderName,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onRescan,
  onInfo,
  onDirector,
}: ToolbarProps) {
  return (
    <header className="flex-none px-5 py-3" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(15,23,42,0.95) 40%, rgba(2,6,23,0.98) 100%)', borderBottom: '1px solid rgba(6,182,212,0.15)', boxShadow: '0 1px 30px rgba(6,182,212,0.08), 0 4px 20px rgba(0,0,0,0.4)' }}>
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-none">
          <img
            src="/lumoravision.png"
            alt="Lumoravision"
            className="h-7 w-auto object-contain select-none"
            draggable={false}
          />
        </div>

        {/* Folder info */}
        {folderName && (
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-slate-500 flex-none" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
            <span className="text-slate-300 text-sm truncate max-w-48">{folderName}</span>
            <span className="text-slate-600 text-xs flex-none">({videoCount} videos)</span>
          </div>
        )}

        {/* Search */}
        {videoCount > 0 && (
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full bg-slate-800 text-slate-200 placeholder-slate-500 text-sm rounded-lg pl-8 pr-3 py-1.5 border border-slate-700 focus:border-cyan-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Sort buttons */}
        {videoCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 text-xs mr-1">Sort:</span>
            <SortButton field="name" label="Name" sortConfig={sortConfig} onSort={onSort} />
            <SortButton field="size" label="Size" sortConfig={sortConfig} onSort={onSort} />
            <SortButton field="lastModified" label="Date" sortConfig={sortConfig} onSort={onSort} />
            <SortButton field="duration" label="Duration" sortConfig={sortConfig} onSort={onSort} />
          </div>
        )}

        {/* View mode toggle */}
        {videoCount > 0 && (
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              title="Grid view"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 3h7v7H3zm0 11h7v7H3zm11-11h7v7h-7zm0 11h7v7h-7z"/>
              </svg>
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              title="List view"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Director Mode button */}
        {onDirector && videoCount > 0 && (
          <button
            onClick={onDirector}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors flex-none"
            title="Editor"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
            </svg>
            Editor
          </button>
        )}

        {/* Rescan button – only shown when a folder is active */}
        {onRescan && folderName && (
          <button
            onClick={onRescan}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 flex items-center justify-center transition-colors flex-none"
            title="Rescan folder for new files"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        )}

        {/* Info button */}
        <button
          onClick={onInfo}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors flex-none"
          title="About Lumoravision"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
