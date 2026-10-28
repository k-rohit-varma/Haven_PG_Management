import { Hostel } from '../models/Hostel.js';
import { Payment } from '../models/Payment.js';
import { RentDue } from '../models/RentDue.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { getOccupancyByRoom } from '../utils/roomOccupancy.js';

const dayInKolkata = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const dateFromDay = (day) => new Date(`${day}T00:00:00+05:30`);

export async function ownerDashboard(user, query = {}) {
  const hostels = await Hostel.find({ ...(user.role === 'OWNER' ? { ownerId: user._id, isBlocked: { $ne: true } } : {}), isDeleted: false }).select('_id').lean();
  const hostelIds = hostels.map((hostel) => hostel._id);
  const today = dateFromDay(dayInKolkata(new Date()));
  const selectedMonth = query.month || dayInKolkata(new Date()).slice(0, 7);
  const monthFilter = { billingPeriod: new RegExp(`^${selectedMonth}`) };
  const [rooms, stays, pendingPayments, totals, overdue, upcoming, recentPayments] = await Promise.all([
    Room.find({ hostelId: { $in: hostelIds }, isDeleted: false }).select('_id maxCapacity').lean(),
    Stay.countDocuments({ hostelId: { $in: hostelIds }, status: 'ACTIVE' }),
    Payment.countDocuments({ hostelId: { $in: hostelIds }, status: 'PENDING' }),
    RentDue.aggregate([{ $match: { hostelId: { $in: hostelIds }, ...monthFilter } }, { $group: {
      _id: null, due: { $sum: '$amountDuePaise' }, settled: { $sum: '$amountSettledPaise' },
      overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', today] }, { $gt: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] }] }, { $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } },
      upcoming: { $sum: { $cond: [{ $and: [{ $gte: ['$dueDate', today] }, { $gt: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] }] }, { $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } },
    } }]),
    RentDue.find({ hostelId: { $in: hostelIds }, ...monthFilter, dueDate: { $lt: today }, $expr: { $gt: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } }).sort({ dueDate: 1 }).limit(8).populate('tenantId', 'name email').populate('roomId', 'identifier').lean(),
    RentDue.find({ hostelId: { $in: hostelIds }, ...monthFilter, dueDate: { $gte: today }, $expr: { $gt: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } }).sort({ dueDate: 1 }).limit(8).populate('tenantId', 'name email').populate('roomId', 'identifier').lean(),
    Payment.find({ hostelId: { $in: hostelIds }, status: { $in: ['APPROVED', 'REJECTED'] } }).sort({ decidedAt: -1 }).limit(8).populate('tenantId', 'name').populate('hostelId', 'name').lean(),
  ]);
  const roomIds = rooms.map((room) => room._id);
  const roomOccupancy = await getOccupancyByRoom(roomIds);
  const occupied = [...roomOccupancy.values()].reduce((sum, count) => sum + count, 0);
  const totalsRow = totals[0] || { due: 0, settled: 0 };
  return {
    totalHostels: hostels.length, totalRooms: rooms.length, totalBeds: rooms.reduce((sum, room) => sum + room.maxCapacity, 0),
    occupiedBeds: occupied, availableBeds: Math.max(0, rooms.reduce((sum, room) => sum + room.maxCapacity, 0) - occupied),
    activeTenants: stays, pendingPayments,
    rentDuePaise: totalsRow.due, rentCollectedPaise: totalsRow.settled, outstandingPaise: totalsRow.due - totalsRow.settled,
    selectedMonth, overduePaise: totalsRow.overdue || 0, upcomingPaise: totalsRow.upcoming || 0, overdue, upcoming, recentPayments,
  };
}
