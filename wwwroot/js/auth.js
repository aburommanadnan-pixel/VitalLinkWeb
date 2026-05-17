// auth.js — Firebase Auth + RTDB via REST (no WebSocket, works on Railway)

(function () {
    if (firebase.apps.length === 0) {
        firebase.initializeApp(window.firebaseConfig);
    }
    const auth = firebase.auth();
    const RTDB_URL = window.firebaseConfig.databaseURL;
    let _idToken = null;

    async function getToken() {
        if (auth.currentUser) _idToken = await auth.currentUser.getIdToken();
        return _idToken;
    }

    async function restGet(path) {
        const token = await getToken();
        const url = `${RTDB_URL}${path}.json${token ? '?auth=' + token : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`REST GET failed: ${res.status}`);
        return res.json();
    }

    async function restSet(path, data) {
        const token = await getToken();
        const url = `${RTDB_URL}${path}.json${token ? '?auth=' + token : ''}`;
        const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error(`REST SET failed: ${res.status}`);
        return res.json();
    }

    async function restPush(path, data) {
        const token = await getToken();
        const url = `${RTDB_URL}${path}.json${token ? '?auth=' + token : ''}`;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error(`REST PUSH failed: ${res.status}`);
        return res.json();
    }

    async function restDelete(path) {
        const token = await getToken();
        const url = `${RTDB_URL}${path}.json${token ? '?auth=' + token : ''}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error(`REST DELETE failed: ${res.status}`);
        return true;
    }

    async function restUpdate(updates) {
        const token = await getToken();
        const url = `${RTDB_URL}/.json${token ? '?auth=' + token : ''}`;
        const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
        if (!res.ok) throw new Error(`REST UPDATE failed: ${res.status}`);
        return res.json();
    }

    // Polling بديل WebSocket — كل 3 ثواني
    const _listeners = {};
    function startPolling(path, callback, intervalMs = 3000) {
        if (_listeners[path]) stopPolling(path);
        let lastData = null;
        const poll = async () => {
            try {
                const data = await restGet(path);
                const str = JSON.stringify(data);
                if (str !== lastData) { lastData = str; callback(data); }
            } catch (e) { console.warn('Polling:', path, e.message); }
        };
        poll();
        _listeners[path] = setInterval(poll, intervalMs);
        return path;
    }
    function stopPolling(path) {
        if (_listeners[path]) { clearInterval(_listeners[path]); delete _listeners[path]; }
    }

    let currentUser = null, currentRole = null;
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
            _idToken = await user.getIdToken();
            try {
                const data = await restGet('/users/' + user.uid);
                currentRole = data?.role || "er_staff";
            } catch (e) { currentRole = "er_staff"; }
        } else { currentRole = null; _idToken = null; }
        resolveAuthReady();
        updateNavbar();
    });

    async function requireAuth(allowedRoles) {
        await authReady;
        if (!currentUser) { window.location.href = "/Account/Login"; return new Promise(() => {}); }
        if (!hasAccess(currentRole, allowedRoles)) { window.location.href = "/Account/AccessDenied"; return new Promise(() => {}); }
        return { user: currentUser, role: currentRole };
    }

    async function signIn(email, password) {
        const credential = await auth.signInWithEmailAndPassword(email, password);
        _idToken = await credential.user.getIdToken();
        const data = await restGet('/users/' + credential.user.uid);
        currentUser = credential.user;
        currentRole = data?.role || "er_staff";
        return { user: currentUser, role: currentRole };
    }

    async function signOut() {
        Object.keys(_listeners).forEach(stopPolling);
        await auth.signOut();
        currentUser = null; currentRole = null; _idToken = null;
        window.location.href = "/Account/Login";
    }

    function updateNavbar() {
        document.querySelectorAll("[data-role-required]").forEach(el => {
            const required = el.dataset.roleRequired.split(",").map(r => r.trim());
            const allowed = required.includes("any") ? !!currentUser : hasAccess(currentRole, required);
            el.style.display = allowed ? "" : "none";
        });
        const userInfo = document.getElementById("user-info");
        if (!userInfo) return;
        if (currentUser) {
            userInfo.innerHTML =
                '<span class="text-secondary me-2 d-none d-md-inline"><i class="bi bi-person-circle"></i> ' + escapeHtml(currentUser.email) + '</span>' +
                '<span class="badge bg-info me-2">' + escapeHtml(currentRole || "...") + '</span>' +
                '<a href="#" id="logout-link" class="text-light text-decoration-none"><i class="bi bi-box-arrow-right"></i> Logout</a>';
            document.getElementById("logout-link").onclick = e => { e.preventDefault(); signOut(); };
        } else {
            userInfo.innerHTML = '<a href="/Account/Login" class="text-light text-decoration-none"><i class="bi bi-box-arrow-in-right"></i> Login</a>';
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    window.VitalLinkAuth = {
        requireAuth, signIn, signOut,
        getCurrentRole: () => currentRole,
        getCurrentUser: () => currentUser,
        restGet, restSet, restPush, restDelete, restUpdate,
        startPolling, stopPolling,
        db: firebase.database()
    };
})();