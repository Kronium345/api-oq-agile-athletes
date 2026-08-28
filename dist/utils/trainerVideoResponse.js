import { getPublicApiBaseUrl, getTrainerVideoPlayUrl, getTrainerVideoThumbnailUrl, } from "../services/trainerVideoStorage.js";
export async function toTrainerVideoClient(video, viewerUserId, apiBaseUrl) {
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
export async function toTrainerVideoClients(videos, viewerUserId, apiBaseUrl) {
    return Promise.all(videos.map((video) => toTrainerVideoClient(video, viewerUserId, apiBaseUrl)));
}
