import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_TRAINER_LEADS_COLLECTION || 'trainer_leads';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
export async function createTrainerLead(params) {
    const doc = {
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
export async function listLeadsForTrainer(trainerId) {
    return getCollection().find({ trainerId }).sort({ createdAt: -1 }).toArray();
}
export async function getLeadById(leadId) {
    return getCollection().findOne({ leadId });
}
export async function updateLeadStatus(leadId, trainerId, status) {
    await getCollection().updateOne({ leadId, trainerId }, { $set: { status } });
    return getCollection().findOne({ leadId, trainerId });
}
