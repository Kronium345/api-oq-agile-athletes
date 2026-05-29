import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const USER_FRIENDS_TABLE = process.env.MONGO_USER_FRIENDS_COLLECTION || 'user_friends';

export interface UserFriendDocument {
  userId: string;
  friendUserId: string;
  createdAt: string;
}

function getUserFriendsCollection(): Collection<UserFriendDocument> {
  const client = getMongoClient();
  return client.db(getMongoDbName()).collection<UserFriendDocument>(USER_FRIENDS_TABLE);
}

async function getFriendUserIds(userId: string): Promise<string[]> {
  const rows = await getUserFriendsCollection()
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
  return rows.map((r) => r.friendUserId);
}

async function friendshipExists(userId: string, friendUserId: string): Promise<boolean> {
  const row = await getUserFriendsCollection().findOne({ userId, friendUserId });
  return Boolean(row);
}

async function addFriend(userId: string, friendUserId: string): Promise<UserFriendDocument> {
  const createdAt = new Date().toISOString();
  const doc: UserFriendDocument = { userId, friendUserId, createdAt };
  await getUserFriendsCollection().insertOne(doc);
  return doc;
}

async function removeFriend(userId: string, friendUserId: string): Promise<boolean> {
  const result = await getUserFriendsCollection().deleteOne({ userId, friendUserId });
  return result.deletedCount === 1;
}

async function deleteAllFriendshipsForUser(userId: string): Promise<void> {
  const collection = getUserFriendsCollection();
  await collection.deleteMany({
    $or: [{ userId }, { friendUserId: userId }],
  });
}

export {
  addFriend,
  deleteAllFriendshipsForUser,
  friendshipExists,
  getFriendUserIds,
  removeFriend,
};
