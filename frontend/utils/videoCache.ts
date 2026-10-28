import { clearVideoCacheAsync, setVideoCacheSizeAsync } from "expo-video";
import Storage from "expo-sqlite/kv-store";

// Reels are cached on disk so scrolling back replays without downloading again.
// The cache is small and evicts least-recently-watched videos first (expo-video's default is 1 GB).
const CACHE_BYTES = 150 * 1024 * 1024;

// expo-video can only clear its cache while no video is loaded. If one is, we remember
// and clear it on the next app start, before any video loads.
const PENDING_KEY = "videoCache.clearPending";

const setPending = (pending: boolean) => {
  try {
    if (pending) Storage.setItemSync(PENDING_KEY, "1");
    else Storage.removeItemSync(PENDING_KEY);
  } catch {
    // not saved: the cache still stays under its size limit
  }
};

const isPending = () => {
  try {
    return Storage.getItemSync(PENDING_KEY) === "1";
  } catch {
    return false;
  }
};

// At app start, before any video player exists
export const initVideoCache = async () => {
  try {
    if (isPending()) {
      await clearVideoCacheAsync();
      setPending(false);
    }
    await setVideoCacheSizeAsync(CACHE_BYTES);
  } catch (err) {
    console.info("video cache setup failed", err);
  }
};

export const clearVideoCache = async () => {
  try {
    await clearVideoCacheAsync();
    setPending(false);
  } catch {
    setPending(true); // a video is loaded right now: finish on the next start
  }
};
