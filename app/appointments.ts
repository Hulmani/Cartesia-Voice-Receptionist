import type {Slot,Booking} from './demo/clinic';
export type SavedBooking=Booking & {createdAt:string};
export type AppointmentState={anchor:string;slots:Slot[];bookings:SavedBooking[]};
export type PendingBooking={slot:Slot;requestId:string};
export const pendingBookingKey='voice-lab-pending-booking-v1';
