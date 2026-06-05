import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_PARTNER_CONNECT_COLLECTION || 'partner_connect_requests';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
export async function createPartnerRequest(fromUserId, toUserId) {
    const existing = await getCollection().findOne({
        $or: [
            { fromUserId, toUserId },
            { fromUserId: toUserId, toUserId: fromUserId },
        ],
    });
    if (existing)
        return existing;
    const doc = {
        requestId: uuidv4(),
        fromUserId,
        toUserId,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };
    await getCollection().insertOne(doc);
    return doc;
}
export async function acceptPartnerRequest(fromUserId, toUserId) {
    await getCollection().updateOne({ fromUserId, toUserId, status: 'pending' }, { $set: { status: 'accepted' } });
    return getCollection().findOne({ fromUserId, toUserId });
}
export async function getPartnerRequestBetween(userA, userB) {
    return getCollection().findOne({
        $or: [
            { fromUserId: userA, toUserId: userB },
            { fromUserId: userB, toUserId: userA },
        ],
    });
}
