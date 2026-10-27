import { clearVideoCacheAsync, setVideoCacheSizeAsync } from "expo-video";

// Reels are cached on disk so scrolling back replays without downloading again.
// The cache is small and evicts least-recently-watched videos first (expo-video's default is 1 GB).
const CACHE_BYTES = 150 * 1024 * 1024;

export const initVideoCache = () => {
  setVideoCacheSizeAsync(CACHE_BYTES).catch((err) => console.info("video cache size not set", err));
};

export const clearVideoCache = () => clearVideoCacheAsync().catch((err) => console.info("video cache not cleared", err));
