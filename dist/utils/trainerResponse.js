export function toTrainerListItem(profile, extras) {
    return {
        id: profile.trainerId,
        userId: profile.userId,
        displayName: profile.displayName,
        bio: profile.bio,
        qualifications: profile.qualifications || [],
        specialties: profile.specialties || [],
        gymName: profile.gymName,
        postcode: profile.postcode,
        priceFrom: profile.priceFrom,
        priceUnit: profile.priceUnit,
        instagram: profile.instagram,
        verified: profile.verified,
        featured: profile.featured,
        published: profile.published,
        ratingAvg: profile.ratingAvg,
        reviewCount: profile.reviewCount,
        distanceKm: extras?.distanceKm,
        stripeConnectOnboarded: profile.stripeConnectOnboarded,
    };
}
export function toTrainerDetail(profile, extras) {
    return {
        ...toTrainerListItem(profile, extras),
        availabilityNotes: profile.availabilityNotes,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
    };
}
