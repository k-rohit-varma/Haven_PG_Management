import { Room } from '../models/Room.js';

export const ACTIVE_STAY_STATUS = 'ACTIVE';

export function activeRoomOccupancyStages() {
  return [
    { $lookup: { from: 'stays', let: { roomId: '$_id' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$roomId', '$$roomId'] }, { $eq: ['$status', ACTIVE_STAY_STATUS] }] } } },
      { $count: 'count' },
    ], as: 'activeStayCounts' } },
    { $addFields: { occupancy: { $ifNull: [{ $arrayElemAt: ['$activeStayCounts.count', 0] }, 0] } } },
    { $addFields: { availableBeds: { $max: [0, { $subtract: ['$maxCapacity', '$occupancy'] }] } } },
  ];
}

export async function getRoomOccupancy(roomId, session) {
  const aggregate = Room.aggregate([
    { $match: { _id: roomId } },
    ...activeRoomOccupancyStages(),
    { $project: { _id: 1, maxCapacity: 1, occupancy: 1, availableBeds: 1 } },
  ]);
  if (session) aggregate.session(session);
  return (await aggregate)[0] || null;
}

export async function getOccupancyByRoom(roomIds) {
  if (!roomIds.length) return new Map();
  const rooms = await Room.aggregate([
    { $match: { _id: { $in: roomIds } } },
    ...activeRoomOccupancyStages(),
    { $project: { _id: 1, occupancy: 1 } },
  ]);
  return new Map(rooms.map((room) => [String(room._id), room.occupancy]));
}
