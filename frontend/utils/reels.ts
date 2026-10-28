import { CHATAPI } from "@/utils/api";

// conversation-service: /reels and /social
export interface ReelAuthor {
  phone: string;
  username: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  profile_image: string | null;
}

export interface Reel {
  _id: string;
  type?: "video" | "image";
  mediaUrl?: string;
  videoUrl: string;
  caption: string;
  duration: number | null;
  // Video size as shown (rotation applied), from the uploader; missing on older reels
  width?: number | null;
  height?: number | null;
  photos?: string[] | null;
  createdAt: string;
  author: ReelAuthor;
  isMine: boolean;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  likedByMe?: boolean;
  suggested?: boolean;
}

export interface ReelComment {
  _id: string;
  text: string;
  createdAt: string;
  author: ReelAuthor;
  isMine: boolean;
  canDelete: boolean;
}

export interface ReelPage {
  reels: Reel[];
  nextCursor: string | null;
}

export interface SocialProfile {
  user: ReelAuthor;
  counts: { reels: number; followers: number; following: number };
  isMe: boolean;
  isFollowing: boolean;
  canViewReels: boolean;
}

const cursor = (before?: string | null) => (before ? `?before=${encodeURIComponent(before)}` : "");

export const fetchFeed = async (before?: string | null): Promise<ReelPage> =>
  (await CHATAPI.get(`/reels/feed${cursor(before)}`)).data;

export const fetchSuggested = async (before?: string | null): Promise<ReelPage> => {
  const page: ReelPage = (await CHATAPI.get(`/reels/suggested${cursor(before)}`)).data;
  return { ...page, reels: page.reels.map((r) => ({ ...r, suggested: true })) };
};

export const fetchUserReels = async (phone: string, before?: string | null): Promise<ReelPage> =>
  (await CHATAPI.get(`/reels/user/${phone}${cursor(before)}`)).data;

export const fetchSocialProfile = async (phone: string): Promise<SocialProfile> =>
  (await CHATAPI.get(`/social/profile/${phone}`)).data;

export interface FollowListUser extends ReelAuthor {
  isMe: boolean;
  isFollowing: boolean;
}

export const fetchFollowList = async (
  phone: string,
  side: "followers" | "following",
  before?: string | null,
): Promise<{ users: FollowListUser[]; nextCursor: string | null }> =>
  (await CHATAPI.get(`/social/${side}/${phone}${cursor(before)}`)).data;

export const followUser = (phone: string) => CHATAPI.post(`/social/follow/${phone}`);
export const unfollowUser = (phone: string) => CHATAPI.delete(`/social/follow/${phone}`);
export const deleteReel = (id: string) => CHATAPI.delete(`/reels/${id}`);

// Likes / comments / shares. Each returns the fresh count from the server.
export const likeReel = async (id: string): Promise<number> => (await CHATAPI.post(`/reels/${id}/like`)).data.likeCount;
export const unlikeReel = async (id: string): Promise<number> => (await CHATAPI.delete(`/reels/${id}/like`)).data.likeCount;
export const countReelShare = async (id: string): Promise<number> => (await CHATAPI.post(`/reels/${id}/share`)).data.shareCount;

export const fetchComments = async (id: string, before?: string | null): Promise<{ comments: ReelComment[]; nextCursor: string | null; commentCount: number }> =>
  (await CHATAPI.get(`/reels/${id}/comments${cursor(before)}`)).data;
export const addReelComment = async (id: string, text: string): Promise<{ comment: ReelComment; commentCount: number }> =>
  (await CHATAPI.post(`/reels/${id}/comments`, { text })).data;
export const deleteReelComment = async (id: string, commentId: string): Promise<number> =>
  (await CHATAPI.delete(`/reels/${id}/comments/${commentId}`)).data.commentCount;

export const compactCount = (n?: number) => {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/.0$/, "")}M`;
};

export const reelMediaUrl = (r: Reel) => r.mediaUrl || r.videoUrl;
export const isPhotoReel = (r: Reel) => r.type === "image";
export const reelPhotos = (r: Reel) => (r.photos?.length ? r.photos : [reelMediaUrl(r)]);

type UploadFile = { uri: string; mimeType: string };

const putFile = async (file: UploadFile, onProgress: (percent: number) => void): Promise<string> => {
  const { data } = await CHATAPI.post("/reels/upload-url", { mediaType: file.mimeType });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.uploadUrl);
    xhr.setRequestHeader("Content-Type", file.mimeType);
    xhr.upload.onprogress = (e) => e.total && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send({ uri: file.uri, type: file.mimeType, name: "reel" } as any);
  });
  return data.fileUrl;
};

export async function uploadReel(
  files: UploadFile[],
  caption: string,
  onProgress: (percent: number) => void,
  duration?: number | null,
  size?: { width: number; height: number } | null,
): Promise<Reel> {
  const fileUrls: string[] = [];
  for (const [i, file] of files.entries()) {
    fileUrls.push(await putFile(file, (p) => onProgress(Math.round((i * 100 + p) / files.length))));
  }
  const res = await CHATAPI.post("/reels", {
    ...(fileUrls.length > 1 ? { fileUrls } : { fileUrl: fileUrls[0] }),
    caption,
    ...(duration ? { duration } : {}),
    ...(size ? { width: size.width, height: size.height } : {}),
  });
  return res.data.reel;
}

// Hand-off from a profile grid to the full-screen viewer, so the viewer opens on the
// tapped reel and keeps paging from where the grid left off
let viewerList: { phone: string; reels: Reel[]; nextCursor: string | null } | null = null;
export const setViewerList = (phone: string, reels: Reel[], nextCursor: string | null) => {
  viewerList = { phone, reels, nextCursor };
};
export const getViewerList = (phone: string) => (viewerList?.phone === phone ? viewerList : null);

// Set after posting, so the feed reloads when the user returns to it
let feedStale = false;
export const markFeedStale = () => { feedStale = true; };
export const takeFeedStale = () => { const stale = feedStale; feedStale = false; return stale; };

export const displayName = (a?: Partial<ReelAuthor> | null) =>
  a?.full_name || (a?.username ? `@${a.username}` : a?.phone ? `+${a.phone}` : "Unknown");
