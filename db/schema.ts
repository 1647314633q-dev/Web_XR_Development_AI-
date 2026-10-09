import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const catalogs = sqliteTable('catalogs', {
 ownerId:text('owner_id').primaryKey(), payload:text('payload').notNull(), revision:integer('revision').notNull(), updatedAt:integer('updated_at').notNull()
});
export const rooms = sqliteTable('rooms', {
 code:text('code').primaryKey(), ownerId:text('owner_id').notNull(), inviteHash:text('invite_hash').notNull(), hostHash:text('host_hash').notNull(), guestHash:text('guest_hash'),
 createdAt:integer('created_at').notNull(), expiresAt:integer('expires_at').notNull(), hostSeen:integer('host_seen').notNull().default(0), guestSeen:integer('guest_seen').notNull().default(0), closed:integer('closed').notNull().default(0)
}, t=>[index('rooms_owner_created').on(t.ownerId,t.createdAt)]);
export const signals = sqliteTable('signals', {
 id:integer('id').primaryKey({autoIncrement:true}), roomCode:text('room_code').notNull(), sender:text('sender').notNull(), payload:text('payload').notNull(), createdAt:integer('created_at').notNull()
}, t=>[index('signals_room_cursor').on(t.roomCode,t.id)]);
export const records = sqliteTable('records', {
 id:text('id').primaryKey(), ownerId:text('owner_id').notNull(), title:text('title').notNull(), payload:text('payload').notNull(), checksDone:integer('checks_done').notNull(), updatedAt:integer('updated_at').notNull()
}, t=>[index('records_owner_updated').on(t.ownerId,t.updatedAt)]);
