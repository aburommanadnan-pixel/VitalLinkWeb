// ════════════════════════════════════════════════════════════════════════════
//  auth.js — handles sign-in, sign-out, role lookup, and navbar updates.
//
//  Replaces the old firebase-init.js. Every page loads this file via _Layout.
//
//  Public API (exposed as window.VitalLinkAuth):
//
//    VitalLinkAuth.requireAuth([allowedRoles])  → Promise<{user, role}>
//        Awaits Firebase init. If not signed in, redirects to /Account/Login.
//        If signed in but role isn't in allowedRoles, redirects to AccessDenied.
//        Pass null/omit to require ANY logged-in user.
//
//    VitalLinkAuth.signIn(email, password)      → Promise<{user, role}>
//    VitalLinkAuth.signOut()                    → Promise (then redirects)
//
//    VitalLinkAuth.db / .auth                   → direct Firebase refs
//
//  Roles supported:
//    "admin"      — full access
//    "management" — Management dashboard, History, Hospital CRUD
//    "er_staff"   — ER dashboard, History (read-only)
// ════════════════════════════════════════════════════════════════════════════

(function () {
    // Initialize Firebase exactly once.
    if (firebase.apps.length === 0) {
        firebase.initializeApp(window.firebaseConfig);
    }
    const auth = firebase.auth();
    const db = firebase.database();

    // Cached state — populated as soon as Firebase tells us who's signed in.
    let currentUser = null;
    let currentRole = null;

    // Role hierarchy. Higher = more permissive. Used to decide if the
    // current user can access a page that requires a particular role.
    function hasAccess(role, allowedRoles) {
        if (!role) return false;
        if (allowedRoles == null) return true;             // any logged-in user OK
        if (role === "admin") return true;                  // admin → always allowed
        return allowedRoles.includes(role);
    }

    // ── Wait for Firebase to tell us the auth state, then read the role. ──
    // onAuthStateChanged fires:
    //   1. Once at startup (with the persisted session — could be null)
    //   2. Whenever the user signs in or signs out
    // We resolve `authReady` after the FIRST callback so requireAuth() knows
    // when it's safe to make decisions.
    let resolveAuthReady;
    const authReady = new Promise(r => { resolveAuthReady = r; });

    auth.onAuthStateChanged(async user => {
        currentUser = user;
        if (user) {
            // Look up the user's role from /users/{uid}/role.
            // If no record exists, default to er_staff (least privilege).
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
        resolveAuthReady();      // safe to call multiple times — only the first matters
        updateNavbar();
    });

    // ── PUBLIC: requireAuth ───────────────────────────────────────────────
    async function requireAuth(allowedRoles) {
        await authReady;
        if (!currentUser) {
            window.location.href = "/Account/Login";
            // Returning a never-resolving Promise stops callers' .then() from running.
            return new Promise(() => { });
        }
        if (!hasAccess(currentRole, allowedRoles)) {
            window.location.href = "/Account/AccessDenied";
            return new Promise(() => { });
        }
        return { user: currentUser, role: currentRole };
    }

    // ── PUBLIC: signIn ────────────────────────────────────────────────────
    async function signIn(email, password) {
        const credential = await auth.signInWithEmailAndPassword(email, password);
        // After sign-in we re-read the role immediately (don't wait for the
        // onAuthStateChanged listener — caller wants the role NOW).
        const snap = await db.ref("/users/" + credential.user.uid).once("value");
        currentUser = credential.user;
        currentRole = snap.val()?.role || "er_staff";
        return { user: currentUser, role: currentRole };
    }

    // ── PUBLIC: signOut ───────────────────────────────────────────────────
    async function signOut() {
        await auth.signOut();
        currentUser = null;
        currentRole = null;
        window.location.href = "/Account/Login";
    }

    // ── Update the navbar based on auth state. ────────────────────────────
    // Looks for elements tagged with data-role-required="role1,role2"
    // and hides those that don't match the current role.
    function updateNavbar() {
        document.querySelectorAll("[data-role-required]").forEach(el => {
            const required = el.dataset.roleRequired.split(",").map(r => r.trim());
            const allowed = required.includes("any")
                ? !!currentUser                // any logged-in user
                : hasAccess(currentRole, required);
            el.style.display = allowed ? "" : "none";
        });

        // Fill in the "user info" placeholder on the right side of the navbar.
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

    // Expose to all pages.
    window.VitalLinkAuth = {
        requireAuth, signIn, signOut, db, auth,
        getCurrentRole: () => currentRole,
        getCurrentUser: () => currentUser
    };
})();
