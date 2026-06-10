import { getDisplayName } from "./userDisplay.js";
export function toPartnerListItem(user) {
    const displayName = getDisplayName(user);
    const goal = typeof user.goal === 'string'
        ? user.goal
        : typeof user.fitnessGoal === 'string'
            ? user.fitnessGoal
            : null;
    return {
        userId: String(user.userId),
        displayName,
        avatar: typeof user.avatar === 'string' ? user.avatar : null,
        gymName: typeof user.gymName === 'string' ? user.gymName : null,
        goal,
        experience: typeof user.experience === 'string' ? user.experience : null,
    };
}
export function toConnectionRequestItem(request, otherUser, direction) {
    const profile = otherUser;
    const goal = profile && typeof profile.goal === 'string'
        ? profile.goal
        : profile && typeof profile.fitnessGoal === 'string'
            ? profile.fitnessGoal
            : null;
    const otherUserId = direction === 'incoming' ? request.fromUserId : request.toUserId;
    return {
        requestId: request.requestId,
        direction,
        userId: otherUserId,
        displayName: otherUser ? getDisplayName(otherUser) : 'User',
        avatar: otherUser && typeof otherUser.avatar === 'string' ? otherUser.avatar : null,
        gymName: otherUser && typeof otherUser.gymName === 'string' ? otherUser.gymName : null,
        experience: otherUser && typeof otherUser.experience === 'string' ? otherUser.experience : null,
        goal,
        status: 'pending',
        createdAt: request.createdAt,
    };
}
export function toClientGroup(group) {
    return {
        id: group.groupId,
        _id: group.groupId,
        name: group.name,
        description: group.description,
        gymName: group.gymName,
        postcode: group.postcode,
        city: group.city,
        category: group.category,
        scheduleSummary: group.scheduleSummary,
        memberCount: group.memberCount,
        verified: group.verified ?? false,
        source: group.source,
        lastVerified: group.lastVerified,
        sourceUrl: group.sourceUrl,
    };
}
export function parseQueryNumber(value) {
    if (typeof value === 'string' && value.trim()) {
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return undefined;
}
