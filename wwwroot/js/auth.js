// ════════════════════════════════════════════════════════════════════════════
//  auth.js — handles sign-in, sign-out, role lookup, and navbar updates.
// ════════════════════════════════════════════════════════════════════════════

(function () {
    if (firebase.apps.length === 0) {
        firebase.initializeApp(window.firebaseConfig);
    }
    const auth = firebase.auth();

    // ── إجبار Firebase على long polling بدل WebSocket (مطلوب على Railway) ──
    const db = firebase.database();
    db.ref(".info/serverTimeOffset").once("value").catch(() => {});
    // تعطيل WebSocket وتفعيل long polling
    if (typeof firebase.database.enableLogging === 'function') {
        firebase.database.enableLogging(false);
    }
    // Force long polling
    const dbUrl = window.firebaseConfig.databaseURL;
    firebase.app().options.databaseURL = dbUrl;

    let currentUser = null;
    let currentRole = null;

    function hasAccess(role, allowedRoles) {
        if (!role) return false;
        if (allowedRoles == null) return true;
        if (role === "admin") return true;
        return allowedRoles.includes(role);
    }

    let resolveAuthReady;
    const authReady = new Promise(r => { resolveAuthReady = r; });

    auth.onAuthStateChanged(async user => {
        currentUser = user;
        if (user) {
            try {
                const snap = await db.ref("/users/" + user.uid).once("value");
                currentRole = snap.val()?.role || "er_staff";
            } catch (e) {
                console.error("Could not read role from Firebase:", e);
                currentRole = "er_staff";
            }
        } else {
            currentRole = null;
        }
        resolveAuthReady();
        updateNavbar();
    });

    async function requireAuth(allowedRoles) {
        await authReady;
        if (!currentUser) {
            window.location.href = "/Account/Login";
            return new Promise(() => { });
        }
        if (!hasAccess(currentRole, allowedRoles)) {
            window.location.href = "/Account/AccessDenied";
            return new Promise(() => { });
        }
        return { user: currentUser, role: currentRole };
    }

    async function signIn(email, password) {
        const credential = await auth.signInWithEmailAndPassword(email, password);
        const snap = await db.ref("/users/" + credential.user.uid).once("value");
        currentUser = credential.user;
        currentRole = snap.val()?.role || "er_staff";
        return { user: currentUser, role: currentRole };
    }

    async function signOut() {
        await auth.signOut();
        currentUser = null;
        currentRole = null;
        window.location.href = "/Account/Login";
    }

    function updateNavbar() {
        document.querySelectorAll("[data-role-required]").forEach(el => {
            const required = el.dataset.roleRequired.split(",").map(r => r.trim());
            const allowed = required.includes("any")
                ? !!currentUser
                : hasAccess(currentRole, required);
            el.style.display = allowed ? "" : "none";
        });

        const userInfo = document.getElementById("user-info");
        if (!userInfo) return;
        if (currentUser) {
            userInfo.innerHTML =
                '<span class="text-secondary me-2 d-none d-md-inline">' +
                '  <i class="bi bi-person-circle"></i> ' + escapeHtml(currentUser.email) +
                '</span>' +
                '<span class="badge bg-info me-2">' + escapeHtml(currentRole || "...") + '</span>' +
                '<a href="#" id="logout-link" class="text-light text-decoration-none">' +
                '  <i class="bi bi-box-arrow-right"></i> Logout' +
                '</a>';
            document.getElementById("logout-link").onclick = e => {
                e.preventDefault();
                signOut();
            };
        } else {
            userInfo.innerHTML =
                '<a href="/Account/Login" class="text-light text-decoration-none">' +
                '  <i class="bi bi-box-arrow-in-right"></i> Login' +
                '</a>';
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    window.VitalLinkAuth = {
        requireAuth, signIn, signOut, db, auth,
        getCurrentRole: () => currentRole,
        getCurrentUser: () => currentUser
    };
})();