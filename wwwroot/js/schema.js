// ════════════════════════════════════════════════════════════════════════════
//  schema.js — central helper for the new database schema.
//
//  Every page uses these functions instead of touching Firebase paths
//  directly. Benefits:
//    1. If a path ever changes, you change it in ONE place.
//    2. Acknowledging an alert atomically moves it from active_alerts →
//       alert_history AND writes an audit log entry. Hard to get right
//       without this helper.
//    3. Writes to push() keys (time-ordered IDs) instead of custom keys —
//       prevents accidental overwrites if two crashes happen at once.
//
//  Public API (exposed as window.VitalLinkSchema):
//
//    listenActiveAlerts(onChild)       → subscribe to /active_alerts
//    acknowledgeAlert(alertId, alert)  → atomic move + audit log + notification
//    loadHistoryMonth(year, month)     → returns Promise<{id, ...}[]>
//    loadHistoryRange(fromDate, toDate)→ load N months, merge results
//    listAuditLog(limit)               → admin-only audit viewer
//
//  This file depends on auth.js (uses VitalLinkAuth.db and .getCurrentUser).
// ════════════════════════════════════════════════════════════════════════════

(function () {
    const db = () => VitalLinkAuth.db;
    const me = () => VitalLinkAuth.getCurrentUser();

    // ──────────────────────────────────────────────────────────────────
    //  PATH CONVENTIONS (all in one place — never hardcode paths elsewhere)
    // ──────────────────────────────────────────────────────────────────
    const Paths = {
        activeAlerts:     ()        => "/active_alerts",
        activeAlert:      (id)      => "/active_alerts/" + id,

        // Partition history by year + zero-padded month for paged loads.
        historyMonth:     (y, m)    => `/alert_history/${y}/${pad2(m)}`,
        historyAlert:     (y, m, id)=> `/alert_history/${y}/${pad2(m)}/${id}`,

        patients:         ()        => "/patients",
        patient:          (pid)     => "/patients/" + pid,

        hospitals:        ()        => "/hospitals",
        hospital:         (hid)     => "/hospitals/" + hid,

        auditLog:         ()        => "/audit_log",
        userNotifications:(uid)     => "/notifications/" + uid,

        // Legacy — only used by the migration tool.
        legacyAlerts:     ()        => "/alerts"
    };

    function pad2(n) { return String(n).padStart(2, "0"); }

    // ──────────────────────────────────────────────────────────────────
    //  listenActiveAlerts(onChild) — subscribe to live alerts.
    //  Calls onChild(alertId, data) for every existing AND every new alert.
    // ──────────────────────────────────────────────────────────────────
    function listenActiveAlerts(onChild) {
        return db().ref(Paths.activeAlerts()).on("child_added", snap => {
            if (snap.val()) onChild(snap.key, snap.val());
        });
    }

    // ──────────────────────────────────────────────────────────────────
    //  acknowledgeAlert(alertId, alert) — atomically:
    //    1. Add acknowledged_by + acknowledged_at fields to the alert
    //    2. Write it to /alert_history/{year}/{month}/{alertId}
    //    3. Delete it from /active_alerts/{alertId}
    //    4. Append an entry to /audit_log
    //
    //  Uses a Firebase "multi-path update" — all writes succeed or all fail.
    //  The alert object passed in is the snapshot from listenActiveAlerts.
    // ──────────────────────────────────────────────────────────────────
    async function acknowledgeAlert(alertId, alert) {
        const user = me();
        if (!user) throw new Error("Not signed in");

        const now = Date.now();
        const ts = Math.floor(now / 1000);
        const created = (alert.created_at || ts) * 1000;
        const d = new Date(created);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;

        const historyRecord = {
            ...alert,
            status: "acknowledged",
            acknowledged_by: user.uid,
            acknowledged_at: ts
        };

        const auditId = db().ref(Paths.auditLog()).push().key;
        const auditRecord = {
            user_uid: user.uid,
            user_email: user.email,
            action: "acknowledge_alert",
            target: Paths.historyAlert(year, month, alertId),
            details: { previous_status: "active" },
            created_at: ts
        };

        // The single atomic update — all four paths in one round trip.
        const updates = {};
        updates[Paths.historyAlert(year, month, alertId)] = historyRecord;
        updates[Paths.activeAlert(alertId)]               = null;          // null = delete
        updates[Paths.auditLog() + "/" + auditId]         = auditRecord;

        await db().ref().update(updates);

        return { historyPath: Paths.historyAlert(year, month, alertId) };
    }

    // ──────────────────────────────────────────────────────────────────
    //  loadHistoryMonth(year, month) — load one month of archived alerts.
    //  Returns an array of {id, ...alert} objects, newest first.
    // ──────────────────────────────────────────────────────────────────
    async function loadHistoryMonth(year, month) {
        const snap = await db().ref(Paths.historyMonth(year, month)).once("value");
        const obj = snap.val() || {};
        return Object.entries(obj)
            .map(([id, a]) => ({ id, ...a }))
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    }

    // ──────────────────────────────────────────────────────────────────
    //  loadHistoryRange(fromDate, toDate) — load every month touched by
    //  the date range. Both dates are JS Date objects.
    //  If no dates are given, defaults to the last 3 months.
    // ──────────────────────────────────────────────────────────────────
    async function loadHistoryRange(fromDate, toDate) {
        if (!toDate)   toDate   = new Date();
        if (!fromDate) {
            fromDate = new Date();
            fromDate.setMonth(fromDate.getMonth() - 2);
            fromDate.setDate(1);
        }

        // Build the list of (year, month) pairs to load.
        const months = [];
        const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
        const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
        while (cursor <= end) {
            months.push([cursor.getFullYear(), cursor.getMonth() + 1]);
            cursor.setMonth(cursor.getMonth() + 1);
        }

        // Load all months in parallel for speed.
        const results = await Promise.all(
            months.map(([y, m]) => loadHistoryMonth(y, m))
        );

        // Flatten and sort newest first.
        return results.flat()
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    }

    // ──────────────────────────────────────────────────────────────────
    //  listAuditLog(limit) — read the most recent audit entries.
    //  Admin-only (the rules block reads for other roles).
    // ──────────────────────────────────────────────────────────────────
    async function listAuditLog(limit) {
        limit = limit || 100;
        const snap = await db().ref(Paths.auditLog())
            .orderByChild("created_at")
            .limitToLast(limit)
            .once("value");
        const obj = snap.val() || {};
        return Object.entries(obj)
            .map(([id, e]) => ({ id, ...e }))
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    }

    // Expose to the world.
    window.VitalLinkSchema = {
        Paths,
        listenActiveAlerts,
        acknowledgeAlert,
        loadHistoryMonth,
        loadHistoryRange,
        listAuditLog
    };
})();
