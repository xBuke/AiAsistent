import { supabase } from '../db/supabase.js';
/**
 * Runs GDPR retention cleanup to delete old data.
 *
 * Deletes:
 * - Messages older than 90 days (based on created_at)
 * - Tickets older than 90 days (based on updated_at)
 *
 * @returns Object with counts of deleted rows
 */
export async function runRetentionCleanup() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffDateISO = cutoffDate.toISOString();
    console.log(`[Retention Cleanup] Starting cleanup for data older than ${cutoffDateISO}`);
    // Delete old messages (based on created_at)
    const { data: messagesData, error: messagesError, count: messagesCount } = await supabase
        .from('messages')
        .delete()
        .lt('created_at', cutoffDateISO)
        .select('*', { count: 'exact', head: false });
    if (messagesError) {
        console.error(`[Retention Cleanup] Error deleting messages:`, messagesError);
        throw new Error(`Failed to delete messages: ${messagesError.message}`);
    }
    const messagesDeleted = messagesCount ?? (messagesData?.length ?? 0);
    console.log(`[Retention Cleanup] Deleted ${messagesDeleted} message(s)`);
    // Delete old tickets (based on updated_at)
    const { data: ticketsData, error: ticketsError, count: ticketsCount } = await supabase
        .from('tickets')
        .delete()
        .lt('updated_at', cutoffDateISO)
        .select('*', { count: 'exact', head: false });
    if (ticketsError) {
        console.error(`[Retention Cleanup] Error deleting tickets:`, ticketsError);
        throw new Error(`Failed to delete tickets: ${ticketsError.message}`);
    }
    const ticketsDeleted = ticketsCount ?? (ticketsData?.length ?? 0);
    console.log(`[Retention Cleanup] Deleted ${ticketsDeleted} ticket(s)`);
    console.log(`[Retention Cleanup] Cleanup completed. Total: ${messagesDeleted + ticketsDeleted} row(s) deleted`);
    return {
        messagesDeleted,
        ticketsDeleted,
    };
}
