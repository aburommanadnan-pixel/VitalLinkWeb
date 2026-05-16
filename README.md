# VitalLink Web — ASP.NET Core 8, refactored for the new schema

This version uses the **active_alerts + alert_history** schema we discussed: only currently-unacknowledged alerts live in the hot path, and acknowledging an alert atomically moves it to a partitioned archive. Includes audit logging, role-based access, and a migration tool.

---

## What changed from the previous version

| Concern | Before | Now |
|---|---|---|
| Where alerts live | All in `/alerts` (forever)         | `/active_alerts` (live) + `/alert_history/YYYY/MM/{id}` |
| ER dashboard load time | Downloads ALL alerts ever          | Downloads only currently-active ones |
| History page load time | Downloads ALL alerts ever          | Downloads only the months in your date range |
| Acknowledge button     | One write to `/alerts/{id}/status` | Atomic: write to history + delete from active + audit log |
| Who acknowledged?      | Not recorded                       | Stored in `acknowledged_by` (user UID), shown on History page |
| Audit trail            | None                               | Every acknowledge + every hospital edit logged in `/audit_log` |
| Alert IDs              | User-supplied (`test-001`)         | Firebase push IDs (time-ordered, collision-free) |

---

## Folder map

```
VitalLinkWeb/
├── VitalLinkWeb.csproj
├── Program.cs
├── appsettings.json
├── firebase-rules.json              ← UPDATED — paste into Firebase Console
├── README.md                        ← this file
│
├── Properties/launchSettings.json
│
├── Controllers/
│   ├── HomeController.cs
│   ├── AccountController.cs
│   ├── ErController.cs
│   ├── ManagementController.cs
│   ├── HistoryController.cs
│   ├── HospitalsController.cs
│   └── AdminController.cs           ← NEW — for the migration tool
│
├── Views/
│   ├── _ViewImports.cshtml
│   ├── _ViewStart.cshtml
│   ├── Shared/_Layout.cshtml        ← updated nav (Migration link, admin-only)
│   ├── Home/Index.cshtml
│   ├── Home/Error.cshtml
│   ├── Account/Login.cshtml
│   ├── Account/AccessDenied.cshtml
│   ├── Er/Index.cshtml              ← uses VitalLinkSchema.acknowledgeAlert()
│   ├── Management/Index.cshtml      ← merges live + recent history for KPIs
│   ├── History/Index.cshtml         ← loads month-by-month, shows "Acknowledged by"
│   ├── Hospitals/Index.cshtml
│   └── Admin/Migrate.cshtml         ← NEW — one-click migration from old schema
│
└── wwwroot/
    ├── css/site.css
    └── js/
        ├── auth.js                  ← (unchanged)
        └── schema.js                ← NEW — central path conventions + acknowledge logic
```

---

## Setup if you're starting fresh

(Skip to "Migrating from the old schema" if you already had data.)

1. **Open the project** — double-click `VitalLinkWeb.csproj`. Wait for "Ready" in the status bar.
2. **Paste your Firebase config** into `appsettings.json` (`apiKey`, `authDomain`, `databaseURL`, etc.).
3. **Paste the new security rules** from `firebase-rules.json` into Firebase Console → Realtime Database → Rules → Publish.
4. **Create users** in Firebase Console → Authentication → Users tab. At minimum, create one admin.
5. **Map UIDs to roles** in Realtime Database → Data tab:
   ```
   users/
     {ADMIN_UID}/   role: "admin"
     {MANAGER_UID}/ role: "management"
     {ER_UID}/      role: "er_staff"
   ```
6. **Press F5**, sign in.

---

## Migrating from the old schema

If you already have data in `/alerts` (from the previous version of the dashboard), use the migration tool:

1. Sign in as an **admin** user.
2. Click **Migration** in the navbar (only admins see it).
3. Click **Preview only (no writes)** first — this shows what would happen without changing anything. Review the log to make sure the right records would land in the right places.
4. If it looks right, click **Run migration**. The tool:
   - Reshapes each legacy alert (`patient` → `patient_snapshot`, etc.)
   - Writes active ones to `/active_alerts/{id}`
   - Writes acknowledged ones to `/alert_history/{YYYY}/{MM}/{id}`
   - Logs the migration to `/audit_log`
5. Verify the new tree in Firebase Console → Realtime Database → Data tab.
6. Once you're happy, manually delete the old `/alerts` node from the Firebase Console.
7. **Important**: update your Flask backend (Phase 5 of your guide) to write new alerts to `/active_alerts/{push-id}` instead of `/alerts/{custom-id}`.

---

## What your Flask backend needs to write now

When the ESP32 reports a crash, the new alert structure looks like this:

```json
{
  "patient_id": "P-001",
  "patient_snapshot": {
    "name": "Ahmed Al-Nadi",
    "blood_type": "A+",
    "allergies": ["Penicillin"],
    "conditions": []
  },
  "accident": {
    "lat": 31.9539, "lng": 35.9106,
    "g_force": 6.2, "airbag": true
  },
  "hospital_id": "H-001",
  "hospital_snapshot": {
    "name": "King Hussein Medical Center",
    "eta_seconds": 240
  },
  "status": "active",
  "created_at": 1730000000
}
```

Two key changes from the old format:
1. Patient/hospital data is wrapped in `*_snapshot` to make it explicit that it's a point-in-time copy.
2. There's a separate `patient_id` and `hospital_id` field so the alert references the canonical record in `/patients` and `/hospitals`.

In Python (Firebase Admin SDK):
```python
ref = db.reference('/active_alerts')
new_ref = ref.push(alert_data)   # push() generates the time-ordered ID
new_alert_id = new_ref.key
```

---

## Testing without the ESP32

In Firebase Console → Realtime Database → Data tab, add this under `/active_alerts`:

```json
{
  "-NbTestAlertId001": {
    "patient_id": "P-001",
    "patient_snapshot": {
      "name": "Ahmed Al-Nadi", "blood_type": "A+",
      "allergies": ["Penicillin"], "conditions": []
    },
    "accident": { "lat": 31.95, "lng": 35.91, "g_force": 6.2, "airbag": true },
    "hospital_id": "H-001",
    "hospital_snapshot": {
      "name": "King Hussein Medical Center", "eta_seconds": 240
    },
    "status": "active",
    "created_at": 1730000000
  }
}
```

The ER dashboard plays a beep + shows the card. Clicking Acknowledge:
1. Writes to `/alert_history/2024/10/-NbTestAlertId001` (or whatever year/month based on `created_at`)
2. Deletes from `/active_alerts/-NbTestAlertId001`
3. Adds an entry to `/audit_log`

Check all three in the Firebase Console to confirm the move worked.

---

## How the schema helper works (mental model)

`schema.js` is the single point of contact between your pages and Firebase paths. Every page does this instead of hard-coding `db.ref("/alerts/...")`:

```javascript
// Subscribe to live alerts
VitalLinkSchema.listenActiveAlerts((id, data) => { /* ... */ });

// Acknowledge: ONE call does the move + audit + notification
await VitalLinkSchema.acknowledgeAlert(alertId, alertData);

// Load history for the date range you care about
const alerts = await VitalLinkSchema.loadHistoryRange(fromDate, toDate);
```

If you ever change the database structure again, you only update `schema.js` — every page keeps working without edits.

---

## Common issues

| Symptom                                    | Likely cause                              | Fix                                            |
|--------------------------------------------|-------------------------------------------|------------------------------------------------|
| ER dashboard shows nothing after migration | Migration ran but Flask still writes to `/alerts` | Update Flask to write `/active_alerts`     |
| Migration says "Permission denied"         | New rules not published yet               | Publish `firebase-rules.json` first            |
| History page shows "loaded 0 months"       | Date range is in the future               | Pick a from-date in the past                   |
| `Acknowledged by` column shows the UID     | Acknowledger has no `/users/{uid}/email` field | Add `email` to the user's record in Firebase  |
| Audit log won't load (admin only sees it)  | Trying to view as a non-admin role        | Sign in as admin                               |
