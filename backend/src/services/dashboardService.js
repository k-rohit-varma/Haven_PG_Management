import { Hostel } from '../models/Hostel.js';
import { Payment } from '../models/Payment.js';
import { RentDue } from '../models/RentDue.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { TenantApplication } from '../models/TenantApplication.js';

const dayInKolkata = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const dateFromDay = (day) => new Date(`${day}T00:00:00+05:30`);

export async function ownerDashboard(user, query = {}) {
  const hostels = await Hostel.find({ ...(user.role === 'OWNER' ? { ownerId: user._id, isBlocked: { $ne: true } } : {}), isDeleted: false }).select('_id').lean();
  const hostelIds = hostels.map((hostel) => hostel._id);
  const today = dateFromDay(dayInKolkata(new Date()));
  const selectedMonth = query.month || dayInKolkata(new Date()).slice(0, 7);
  const monthFilter = { billingPeriod: new RegExp(`^${selectedMonth}`) };
  const [rooms, stays, pendingApplications, pendingPayments, totals, overdue, upcoming, recentPayments] = await Promise.all([
    Room.find({ hostelId: { $in: hostelIds }, isDeleted: false }).select('_id maxCapacity').lean(),
    Stay.countDocuments({ hostelId: { $in: hostelIds }, status: 'ACTIVE' }),
    TenantApplication.countDocuments({ hostelId: { $in: hostelIds }, status: 'PENDING' }),
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
  const occupied = await Stay.countDocuments({ roomId: { $in: roomIds }, status: 'ACTIVE' });
  const totalsRow = totals[0] || { due: 0, settled: 0 };
  return {
    totalHostels: hostels.length, totalRooms: rooms.length, totalBeds: rooms.reduce((sum, room) => sum + room.maxCapacity, 0),
    occupiedBeds: occupied, availableBeds: Math.max(0, rooms.reduce((sum, room) => sum + room.maxCapacity, 0) - occupied),
    activeTenants: stays, pendingApplications, pendingPayments,
    rentDuePaise: totalsRow.due, rentCollectedPaise: totalsRow.settled, outstandingPaise: totalsRow.due - totalsRow.settled,
    selectedMonth, overduePaise: totalsRow.overdue || 0, upcomingPaise: totalsRow.upcoming || 0, overdue, upcoming, recentPayments,
  };
}

export async function tenantDashboard(user) {
  const blockedHostels = await Hostel.find({ isBlocked: true }).select('_id').lean();
  const visibleHostel = { $nin: blockedHostels.map(({ _id }) => _id) };
  const [stays, applications, dues, dueTotals, nextDue, pendingPayments, recentPayments] = await Promise.all([
    Stay.find({ tenantId: user._id, hostelId: visibleHostel }).sort({ moveInDate: -1 }).limit(8).populate('hostelId', 'name city address').populate('roomId', 'identifier sharingType').lean(),
    TenantApplication.find({ tenantId: user._id, hostelId: visibleHostel }).sort({ submittedAt: -1 }).limit(5).populate('hostelId', 'name city').lean(),
    RentDue.find({ tenantId: user._id, hostelId: visibleHostel }).sort({ dueDate: -1 }).limit(12).populate('hostelId', 'name city').lean(),
    RentDue.aggregate([
      { $match: { tenantId: user._id, hostelId: visibleHostel } },
      { $group: { _id: null, outstanding: { $sum: { $max: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } } } },
    ]),
    RentDue.findOne({ tenantId: user._id, hostelId: visibleHostel, dueDate: { $gte: new Date('1970-01-01') }, $expr: { $gt: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } }).sort({ dueDate: 1 }).populate('hostelId', 'name city').lean(),
    Payment.countDocuments({ tenantId: user._id, hostelId: visibleHostel, status: 'PENDING' }),
    Payment.find({ tenantId: user._id, hostelId: visibleHostel }).sort({ submittedAt: -1 }).limit(8).populate('rentDueId', 'billingPeriod dueDate').populate('hostelId', 'name').lean(),
  ]);
  const outstanding = dueTotals[0]?.outstanding || 0;
  return { currentStay: stays.find((stay) => stay.status === 'ACTIVE') || null, stays, applications, dues, outstandingPaise: outstanding, nextDue, pendingPayments, recentPayments };
}
