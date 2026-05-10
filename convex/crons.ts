import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

/**
 * Scheduled jobs. The unified-email sync runs every 5 minutes and dispatches
 * per-account sync (OAuth → gmail.syncAccount, IMAP → imap.syncAccountImap).
 *
 * If Gmail Pub/Sub is also wired (POST /gmail/push), this cron acts as a
 * defensive fallback for accounts that miss push notifications.
 */
const crons = cronJobs();

crons.interval('email sync', { minutes: 5 }, internal.gmail.runScheduledSync, {});

export default crons;
