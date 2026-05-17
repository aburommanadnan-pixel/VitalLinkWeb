// schema.js — RTDB via REST API (Railway compatible)

(function () {
    function pad2(n) { return String(n).padStart(2, "0"); }

    const Paths = {
        activeAlerts:      ()         => "/active_alerts",
        activeAlert:       (id)       => "/active_alerts/" + id,
        historyMonth:      (y, m)     => `/alert_history/${y}/${pad2(m)}`,
        historyAlert:      (y, m, id) => `/alert_history/${y}/${pad2(m)}/${id}`,
        patients:          ()         => "/patients",
        patient:           (pid)      => "/patients/" + pid,
        hospitals:         ()         => "/hospitals",
        hospital:          (hid)      => "/hospitals/" + hid,
        auditLog:          ()         => "/audit_log",
        userNotifications: (uid)      => "/notifications/" + uid,
        legacyAlerts:      ()         => "/alerts"
    };

    // ── listenActiveAlerts — polling كل 3 ثواني بدل WebSocket ──────────
    function listenActiveAlerts(onChild) {
        let knownKeys = new Set();

        VitalLinkAuth.startPolling('/active_alerts', (data) => {
            if (!data || typeof data !== 'object') return;
            Object.entries(data).forEach(([id, val]) => {
                if (val && !knownKeys.has(id)) {
                    knownKeys.add(id);
                    onChild(id, val);
                }
            });
        }, 3000);
    }

    // ── acknowledgeAlert — atomic move via REST multi-path update ───────
    async function acknowledgeAlert(alertId, alert) {
        const user = VitalLinkAuth.getCurrentUser();
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

        const auditId = "audit_" + Date.now();
        const auditRecord = {
            user_uid: user.uid,
            user_email: user.email,
            action: "acknowledge_alert",
            target: Paths.historyAlert(year, month, alertId),
            details: { previous_status: "active" },
            created_at: ts
        };

        const updates = {};
        updates[Paths.historyAlert(year, month, alertId)] = historyRecord;
        updates[Paths.activeAlert(alertId)] = null;
        updates[Paths.auditLog() + "/" + auditId] = auditRecord;

        await VitalLinkAuth.restUpdate(updates);
        return { historyPath: Paths.historyAlert(year, month, alertId) };
    }

    // ── loadHistoryMonth ─────────────────────────────────────────────────
    async function loadHistoryMonth(year, month) {
        const data = await VitalLinkAuth.restGet(Paths.historyMonth(year, month));
        if (!data) return [];
        return Object.entries(data)
            .map(([id, a]) => ({ id, ...a }))
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    }

    // ── loadHistoryRange ─────────────────────────────────────────────────
    async function loadHistoryRange(fromDate, toDate) {
        if (!toDate) toDate = new Date();
        if (!fromDate) {
            fromDate = new Date();
            fromDate.setMonth(fromDate.getMonth() - 2);
            fromDate.setDate(1);
        }
        const months = [];
        const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
        const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
        while (cursor <= end) {
            months.push([cursor.getFullYear(), cursor.getMonth() + 1]);
            cursor.setMonth(cursor.getMonth() + 1);
        }
        const results = await Promise.all(months.map(([y, m]) => loadHistoryMonth(y, m)));
        return results.flat().sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    }

    // ── listAuditLog ─────────────────────────────────────────────────────
    async function listAuditLog(limit) {
        limit = limit || 100;
        const data = await VitalLinkAuth.restGet(Paths.auditLog());
        if (!data) return [];
        return Object.entries(data)
            .map(([id, e]) => ({ id, ...e }))
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
            .slice(0, limit);
    }

    window.VitalLinkSchema = {
        Paths,
        listenActiveAlerts,
        acknowledgeAlert,
        loadHistoryMonth,
        loadHistoryRange,
        listAuditLog
    };
})();