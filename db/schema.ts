import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const appointmentSlots=sqliteTable('appointment_slots',{
 id:text('id').primaryKey(),date:text('date').notNull(),time:text('time').notNull(),
 therapistId:text('therapist_id').notNull(),therapist:text('therapist').notNull(),
 serviceId:text('service_id').notNull(),service:text('service').notNull(),
 minutes:integer('minutes').notNull(),priceCAD:integer('price_cad').notNull(),
},t=>[uniqueIndex('slot_resource_time').on(t.therapistId,t.date,t.time)]);
export const appointmentBookings=sqliteTable('appointment_bookings',{
 id:text('id').primaryKey(),slotId:text('slot_id').notNull().references(()=>appointmentSlots.id),
 patient:text('patient').notNull(),requestId:text('request_id').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('booking_one_per_slot').on(t.slotId),uniqueIndex('booking_request_once').on(t.requestId)]);
