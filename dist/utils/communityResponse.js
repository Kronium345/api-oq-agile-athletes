import { getDisplayName } from "./userDisplay.js";
export function toCommunityUserProfile(user) {
    const profile = user;
    const goal = profile && typeof profile.goal === 'string'
        ? profile.goal
        : profile && typeof profile.fitnessGoal === 'string'
            ? profile.fitnessGoal
            : undefined;
    return {
        userId: profile ? String(profile.userId) : '',
        displayName: profile ? getDisplayName(profile) : 'User',
        gymName: typeof profile?.gymName === 'string' ? profile.gymName : undefined,
        postcode: typeof profile?.postcode === 'string' ? profile.postcode : undefined,
        experience: typeof profile?.experience === 'string' ? profile.experience : undefined,
        gender: typeof profile?.gender === 'string' ? profile.gender : undefined,
        weight: typeof profile?.weight === 'number' ? profile.weight : undefined,
        unit: typeof profile?.unit === 'string' ? profile.unit : undefined,
        goal,
    };
}
export function toPartnerListItem(user) {
    return {
        ...toCommunityUserProfile(user),
        avatar: typeof user.avatar === 'string' ? user.avatar : null,
    };
}
export function toPendingConnectionRequest(request, otherUser, direction) {
    return {
        id: request.requestId,
        status: 'pending',
        direction,
        createdAt: request.createdAt,
        user: toCommunityUserProfile(otherUser),
    };
}
export function toAcceptedConnection(friendUser, connectionId) {
    return {
        id: connectionId,
        status: 'accepted',
        user: toCommunityUserProfile(friendUser),
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
