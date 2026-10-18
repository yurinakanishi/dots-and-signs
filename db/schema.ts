import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Counts only. Audio, transcripts, images and visitor identities are never stored.
export const liveUsage = sqliteTable('live_usage', {
  day: text('day').primaryKey(),
  used: integer('used').notNull(),
  lastStartedAt: integer('last_started_at').notNull(),
});
