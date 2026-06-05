import type { TrainerProfile } from '../models/trainerProfile.ts';

export interface TrainerListItem {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  qualifications: string[];
  specialties: string[];
  gymName: string;
  postcode: string;
  priceFrom?: number;
  priceUnit: string;
  instagram?: string;
  verified: boolean;
  featured: boolean;
  published: boolean;
  ratingAvg?: number;
  reviewCount: number;
  distanceKm?: number;
  stripeConnectOnboarded?: boolean;
}

export function toTrainerListItem(
  profile: TrainerProfile,
  extras?: { distanceKm?: number }
): TrainerListItem {
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

export function toTrainerDetail(profile: TrainerProfile, extras?: { distanceKm?: number }) {
  return {
    ...toTrainerListItem(profile, extras),
    availabilityNotes: profile.availabilityNotes,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
