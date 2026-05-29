import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const USER_FRIENDS_TABLE = process.env.MONGO_USER_FRIENDS_COLLECTION || 'user_friends';
function getUserFriendsCollection() {
    const client = getMongoClient();
    return client.db(getMongoDbName()).collection(USER_FRIENDS_TABLE);
}
async function getFriendUserIds(userId) {
    const rows = await getUserFriendsCollection()
        .find({ userId })
        .sort({ createdAt: -1 })
        .toArray();
    return rows.map((r) => r.friendUserId);
}
async function friendshipExists(userId, friendUserId) {
    const row = await getUserFriendsCollection().findOne({ userId, friendUserId });
    return Boolean(row);
}
async function addFriend(userId, friendUserId) {
    const createdAt = new Date().toISOString();
    const doc = { userId, friendUserId, createdAt };
    await getUserFriendsCollection().insertOne(doc);
    return doc;
}
async function removeFriend(userId, friendUserId) {
    const result = await getUserFriendsCollection().deleteOne({ userId, friendUserId });
    return result.deletedCount === 1;
}
async function deleteAllFriendshipsForUser(userId) {
    const collection = getUserFriendsCollection();
    await collection.deleteMany({
        $or: [{ userId }, { friendUserId: userId }],
    });
}
export { addFriend, deleteAllFriendshipsForUser, friendshipExists, getFriendUserIds, removeFriend, };
