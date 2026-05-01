import { useState, useMemo } from 'react';
import type { VideoFile, ImageFile, SortConfig, SortField } from '../types/video';

export function useSort(videos: VideoFile[], images: ImageFile[]) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'lastModified',
    direction: 'desc',
  });

  const sortedVideos = useMemo(() => {
    const sorted = [...videos].sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.field) {
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'lastModified':
          comparison = a.lastModified - b.lastModified;
          break;
        case 'duration':
          comparison = (a.duration ?? 0) - (b.duration ?? 0);
          break;
      }
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [videos, sortConfig]);

  const sortedImages = useMemo(() => {
    const sorted = [...images].sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.field) {
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'lastModified':
          comparison = a.lastModified - b.lastModified;
          break;
        case 'duration':
          // Images have no duration, keep original order for this field
          comparison = 0;
          break;
      }
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [images, sortConfig]);

  const toggleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return { sortedVideos, sortedImages, sortConfig, toggleSort };
}
