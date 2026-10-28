import { Hostel } from '../models/Hostel.js';
import { Payment } from '../models/Payment.js';
import { RentDue } from '../models/RentDue.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { getOccupancyByRoom } from '../utils/roomOccupancy.js';

const dayInKolkata = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const dateFromDay = (day) => new Date(`${day}T00:00:00+05:30`);

export async function ownerDashboard(user, query = {}) {
  const hostels = await Hostel.find({ ...(user.role === 'OWNER' ? { ownerId: user._id, isBlocked: { $ne: true } } : {}), isDeleted: false }).select('_id isActive').lean();
  const hostelIds = hostels.map((hostel) => hostel._id);
  const activeHostelIds = hostels.filter((hostel) => hostel.isActive).map((hostel) => hostel._id);
  const activeStayIds = await Stay.distinct('_id', { hostelId: { $in: hostelIds }, status: 'ACTIVE' });
  const activeStayFilter = { stayId: { $in: activeStayIds } };
  const today = dateFromDay(dayInKolkata(new Date()));
  const selectedMonth = query.month || dayInKolkata(new Date()).slice(0, 7);
  const monthFilter = { billingPeriod: new RegExp(`^${selectedMonth}`) };
  const [rooms, totalRooms, stays, totals, overdue, recentPayments] = await Promise.all([
    Room.find({ hostelId: { $in: activeHostelIds }, isDeleted: false, isActive: true }).select('_id maxCapacity sharingType').lean(),
    Room.countDocuments({ hostelId: { $in: hostelIds }, isDeleted: false }),
    Stay.countDocuments({ hostelId: { $in: hostelIds }, status: 'ACTIVE' }),
    RentDue.aggregate([{ $match: { hostelId: { $in: hostelIds }, ...activeStayFilter, ...monthFilter } }, { $group: {
      _id: null,
      overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', today] }, { $gt: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] }] }, { $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } },
    } }]),
    RentDue.find({ hostelId: { $in: hostelIds }, ...activeStayFilter, ...monthFilter, dueDate: { $lt: today }, $expr: { $gt: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } }).sort({ dueDate: 1 }).limit(8).populate('tenantId', 'name email').populate('roomId', 'identifier').lean(),
    Payment.find({ hostelId: { $in: hostelIds }, ...activeStayFilter, status: { $in: ['APPROVED', 'REJECTED'] } }).sort({ decidedAt: -1 }).limit(8).populate('tenantId', 'name').populate('hostelId', 'name').lean(),
  ]);
  const roomIds = rooms.map((room) => room._id);
  const roomOccupancy = await getOccupancyByRoom(roomIds);
  const occupied = [...roomOccupancy.values()].reduce((sum, count) => sum + count, 0);
  const sharingSummary = new Map();
  let availableRooms = 0;
  let fullyOccupiedRooms = 0;
  for (const room of rooms) {
    const count = roomOccupancy.get(String(room._id)) || 0;
    const availableBeds = Math.max(0, room.maxCapacity - count);
    const current = sharingSummary.get(room.sharingType) || { sharingType: room.sharingType, totalRooms: 0, totalCapacity: 0, occupiedBeds: 0, availableBeds: 0 };
    current.totalRooms += 1;
    current.totalCapacity += room.maxCapacity;
    current.occupiedBeds += count;
    current.availableBeds += availableBeds;
    sharingSummary.set(room.sharingType, current);
    if (availableBeds > 0) availableRooms += 1;
    else fullyOccupiedRooms += 1;
  }
  const totalBeds = rooms.reduce((sum, room) => sum + room.maxCapacity, 0);
  const totalsRow = totals[0] || {};
  return {
    totalHostels: hostels.length, totalRooms, availableRooms, fullyOccupiedRooms, totalBeds,
    occupiedBeds: occupied, availableBeds: Math.max(0, totalBeds - occupied), sharingSummary: [...sharingSummary.values()].sort((a, b) => a.sharingType - b.sharingType),
    activeTenants: stays,
    selectedMonth, overduePaise: totalsRow.overdue || 0, overdue, recentPayments,
  };
}
