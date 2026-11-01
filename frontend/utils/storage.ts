import { Directory, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { clearVideoCache } from "./videoCache";

// The app's cache folder: cached photos, reel videos and downloaded files.
// Chats and messages live in the database, not here, so clearing this never deletes them.
export const cacheSize = () => {
  try {
    return new Directory(Paths.cache).size ?? 0;
  } catch {
    return 0;
  }
};

export const clearCache = async () => {
  await Image.clearDiskCache().catch(() => undefined);
  await clearVideoCache();
  // Downloaded files, and unlocked chat media (downloaded again and unlocked when shown next)
  for (const name of ["downloads", "media"]) {
    try {
      const dir = new Directory(Paths.cache, name);
      if (dir.exists) dir.delete();
    } catch (err) {
      console.info(`${name} folder not cleared`, err);
    }
  }
};
