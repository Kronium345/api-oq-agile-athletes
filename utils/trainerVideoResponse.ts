import type { TrainerVideo } from '../models/trainerVideo.ts';
import {
  getPublicApiBaseUrl,
  getTrainerVideoPlayUrl,
  getTrainerVideoThumbnailUrl,
} from '../services/trainerVideoStorage.ts';

export interface TrainerVideoClient {
  id: string;
  trainerId: string;
  title: string;
  description: string | null;
  playUrl: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  assignedMemberIds: string[];
  createdAt: string;
}

export async function toTrainerVideoClient(
  video: TrainerVideo,
  viewerUserId: string,
  apiBaseUrl?: string
): Promise<TrainerVideoClient> {
  const base = apiBaseUrl || getPublicApiBaseUrl();
  const [playUrl, thumbnailUrl] = await Promise.all([
    getTrainerVideoPlayUrl(video.storageKey, video.videoId, viewerUserId, base),
    getTrainerVideoThumbnailUrl(video.thumbnailKey, video.videoId, viewerUserId, base),
  ]);

  return {
    id: video.videoId,
    trainerId: video.trainerId,
    title: video.title,
    description: video.description ?? null,
    playUrl,
    thumbnailUrl,
    durationSec: video.durationSec ?? null,
    assignedMemberIds: video.assignedMemberIds,
    createdAt: video.createdAt,
  };
}

export async function toTrainerVideoClients(
  videos: TrainerVideo[],
  viewerUserId: string,
  apiBaseUrl?: string
): Promise<TrainerVideoClient[]> {
  return Promise.all(videos.map((video) => toTrainerVideoClient(video, viewerUserId, apiBaseUrl)));
}
