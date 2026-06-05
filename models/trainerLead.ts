import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_TRAINER_LEADS_COLLECTION || 'trainer_leads';

export type LeadStatus = 'pending' | 'read' | 'replied';

export interface TrainerLead {
  leadId: string;
  trainerId: string;
  memberId: string;
  memberName: string;
  message: string;
  goal?: string;
  budget?: string;
  status: LeadStatus;
  createdAt: string;
}

function getCollection(): Collection<TrainerLead> {
  return getMongoClient().db(getMongoDbName()).collection<TrainerLead>(COLLECTION);
}

export async function createTrainerLead(params: {
  trainerId: string;
  memberId: string;
  memberName: string;
  message: string;
  goal?: string;
  budget?: string;
}): Promise<TrainerLead> {
  const doc: TrainerLead = {
    leadId: uuidv4(),
    trainerId: params.trainerId,
    memberId: params.memberId,
    memberName: params.memberName.trim(),
    message: params.message.trim(),
    goal: params.goal?.trim(),
    budget: params.budget?.trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await getCollection().insertOne(doc);
  return doc;
}

export async function listLeadsForTrainer(trainerId: string): Promise<TrainerLead[]> {
  return getCollection().find({ trainerId }).sort({ createdAt: -1 }).toArray();
}

export async function getLeadById(leadId: string): Promise<TrainerLead | null> {
  return getCollection().findOne({ leadId });
}

export async function updateLeadStatus(
  leadId: string,
  trainerId: string,
  status: LeadStatus
): Promise<TrainerLead | null> {
  await getCollection().updateOne({ leadId, trainerId }, { $set: { status } });
  return getCollection().findOne({ leadId, trainerId });
}
