export interface VideoFile {
  id: string;
  name: string;
  extension: string;
  size: number;
  lastModified: number;
  file: File;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
}

export type ViewMode = 'grid' | 'list';
export type SortField = 'name' | 'size' | 'lastModified' | 'duration';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export const SUPPORTED_VIDEO_FORMATS = [
  'mp4', 'mov', 'webm', 'mkv', 'avi', 'ogv', 'ogg',
  'm4v', 'wmv', 'flv', '3gp', 'ts', 'mts', 'm2ts'
];

export interface ImageFile {
  id: string;
  name: string;
  extension: string;
  size: number;
  lastModified: number;
  file: File;
  url: string;
}

export const SUPPORTED_IMAGE_FORMATS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tiff', 'tif', 'svg', 'heic', 'heif'
];
