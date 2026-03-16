const API = "https://ongyq0dv61.execute-api.ap-south-1.amazonaws.com";
const clientId = "5hc863qm9r2qp6ggk5d9ujh4ts";
const domain = "ap-south-1904yj9qc6";
const redirect = "http://payroll-host-bucket.s3-website.ap-south-1.amazonaws.com";
const poolData = {
    UserPoolId: "ap-south-1_904yj9qc6",
    ClientId: clientId
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

let currentRunId = null;

/* =============================================
   TOAST NOTIFICATION SYSTEM
   ============================================= */

function showToast(type, title, message, duration = 4000) {
    const container = document.getElementById("toastContainer");

    const icons = {
        success: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
        error:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        warning: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        info:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    };

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-msg">${message}</div>` : ""}
        </div>
        <button class="toast-close" onclick="dismissToast(this.closest('.toast'))">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;

    container.appendChild(toast);

    const timer = setTimeout(() => dismissToast(toast), duration);
    toast._timer = timer;

    return toast;
}

function dismissToast(toast) {
    if (!toast || toast._dismissed) return;
    toast._dismissed = true;
    clearTimeout(toast._timer);
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), 280);
}

/* =============================================
   PASSWORD VALIDATION HELPERS
   ============================================= */

const pwRules = {
    len:   v => v.length >= 8,
    upper: v => /[A-Z]/.test(v),
    num:   v => /[0-9]/.test(v),
    sym:   v => /[^A-Za-z0-9]/.test(v)
};

function livePasswordCheck(value) {
    const checks = {
        len:   pwRules.len(value),
        upper: pwRules.upper(value),
        num:   pwRules.num(value),
        sym:   pwRules.sym(value)
    };

    for (const [key, passed] of Object.entries(checks)) {
        const el = document.getElementById(`chk-${key}`);
        if (el) el.classList.toggle("met", passed);
    }

    const score = Object.values(checks).filter(Boolean).length;
    const fill  = document.getElementById("pwStrengthFill");
    const colors = ["#f87171", "#fb923c", "#facc15", "#4ade80"];
    if (fill) {
        fill.style.width  = value.length ? `${(score / 4) * 100}%` : "0%";
        fill.style.background = value.length ? colors[score - 1] || "#e5e7eb" : "";
    }

    // Also re-check confirm match if already filled
    const confirm = document.getElementById("confirmPassword");
    if (confirm && confirm.value) liveConfirmCheck(confirm.value);
}

function liveConfirmCheck(value) {
    const pw  = document.getElementById("signupPassword").value;
    const msg = document.getElementById("confirmMatchMsg");
    if (!msg) return;
    if (!value) { msg.textContent = ""; msg.className = "match-msg"; return; }
    if (value === pw) {
        msg.textContent = "✓ Passwords match";
        msg.className   = "match-msg ok";
    } else {
        msg.textContent = "✗ Passwords do not match";
        msg.className   = "match-msg err";
    }
}

function validatePassword(pw) {
    if (!pwRules.len(pw))   return { ok: false, msg: "Password must be at least 8 characters long." };
    if (!pwRules.upper(pw)) return { ok: false, msg: "Password must contain at least one uppercase letter." };
    if (!pwRules.num(pw))   return { ok: false, msg: "Password must contain at least one number." };
    if (!pwRules.sym(pw))   return { ok: false, msg: "Password must contain at least one special character (e.g. @, #, !)." };
    return { ok: true };
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.style.color = showing ? "" : "var(--accent)";
}

/* =============================================
   AUTH GUARDS & PAGE PROTECTION
   ============================================= */

function protectPage() {
    const token = localStorage.getItem("idToken");
    const dashboard = document.getElementById("dashboardContent");
    if (!token) {
        dashboard.style.pointerEvents = "none";
        dashboard.style.opacity = "0.45";
        dashboard.style.filter  = "blur(0.5px)";
    } else {
        dashboard.style.pointerEvents = "auto";
        dashboard.style.opacity = "1";
        dashboard.style.filter  = "";
    }
}

function protectActions() {
    const token   = localStorage.getItem("idToken");
    const startBtn = document.getElementById("startPayrollBtn");
    if (startBtn) startBtn.disabled = !token;

    const notice = document.getElementById("loginNotice");
    if (notice) notice.style.display = token ? "none" : "flex";
}

/* =============================================
   COGNITO AUTH HANDLING
   ============================================= */

function handleLoginResponse() {
    const hash = window.location.hash;
    if (hash.includes("id_token")) {
        const params  = new URLSearchParams(hash.substring(1));
        const idToken = params.get("id_token");
        localStorage.setItem("idToken", idToken);
        window.location.hash = "";
    }
}

handleLoginResponse();

function login() {
    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        showToast("warning", "Missing fields", "Please enter your email and password.");
        return;
    }

    const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({ Username: email, Password: password });
    const userData    = { Username: email, Pool: userPool };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.authenticateUser(authDetails, {
        onSuccess(result) {
            const idToken = result.getIdToken().getJwtToken();
            localStorage.setItem("idToken", idToken);
            document.getElementById("authModal").style.display = "none";
            updateUI();
            protectPage();
            protectActions();
            showToast("success", "Welcome back!", "You've been logged in successfully.");
        },
        onFailure(err) {
            showToast("error", "Login failed", err.message || "Invalid credentials. Please try again.");
        }
    });
}

function logout() {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) cognitoUser.signOut();
    localStorage.removeItem("idToken");
    document.getElementById("profileDropdown").style.display = "none";
    updateUI();
    protectPage();
    protectActions();
    showToast("info", "Signed out", "You've been logged out successfully.");
}

function toggleDropdown() {
    const dd = document.getElementById("profileDropdown");
    dd.style.display = dd.style.display === "block" ? "none" : "block";
}

// Close dropdown on outside click
document.addEventListener("click", (e) => {
    const ps = document.getElementById("profileSection");
    const dd = document.getElementById("profileDropdown");
    if (ps && dd && !ps.contains(e.target)) dd.style.display = "none";
});

function updateUI() {
    const token = localStorage.getItem("idToken");
    if (token) {
        document.getElementById("loginBtn").style.display = "none";
        document.getElementById("profileSection").style.display = "inline-block";
        const payload = JSON.parse(atob(token.split('.')[1]));
        const email   = payload.email || "";
        document.getElementById("userEmail").innerText = email;
        document.getElementById("dropdownEmail").innerText = email;
        const initial = document.getElementById("avatarInitial");
        if (initial) initial.innerText = email.charAt(0).toUpperCase();
    } else {
        document.getElementById("loginBtn").style.display = "inline-flex";
        document.getElementById("profileSection").style.display = "none";
    }
}

updateUI();

function checkSession() {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
        cognitoUser.getSession(function(err, session) {
            if (err) { console.log(err); return; }
            if (session.isValid()) {
                localStorage.setItem("idToken", session.getIdToken().getJwtToken());
                updateUI();
            }
        });
    }
}

checkSession();

/* =============================================
   MODAL HELPERS
   ============================================= */

function showAuthModal() {
    document.getElementById("authModal").style.display = "flex";
}

function closeAuthModal() {
    document.getElementById("authModal").style.display = "none";
}

function switchTab(tab) {
    document.getElementById("loginForm").style.display  = tab === "login"  ? "block" : "none";
    document.getElementById("signupForm").style.display = tab === "signup" ? "block" : "none";
    document.getElementById("tabLogin").classList.toggle("active",  tab === "login");
    document.getElementById("tabSignup").classList.toggle("active", tab === "signup");
}

/* =============================================
   SIGNUP & OTP
   ============================================= */

let signupEmail    = null;
let signupPassword = null;

function signup() {
    const email   = document.getElementById("signupEmail").value.trim();
    const pw      = document.getElementById("signupPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (!email) {
        showToast("warning", "Email required", "Please enter your email address.");
        return;
    }

    const pwCheck = validatePassword(pw);
    if (!pwCheck.ok) {
        showToast("error", "Weak password", pwCheck.msg);
        return;
    }

    if (pw !== confirm) {
        showToast("error", "Passwords don't match", "Please make sure both passwords are identical.");
        return;
    }

    signupEmail    = email;
    signupPassword = pw;

    const attributeList = [
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "email", Value: email })
    ];

    userPool.signUp(email, pw, attributeList, null, function(err, result) {
        if (err) {
            showToast("error", "Signup failed", err.message || "Something went wrong. Please try again.");
            return;
        }
        showToast("success", "Account created!", "Check your email for a verification code.");
        showOTPModal(email);
    });
}

function showOTPModal(email) {
    signupEmail = email;
    document.getElementById("authModal").style.display = "none";
    document.getElementById("otpModal").style.display  = "flex";
}

function verifyOTP() {
    const code = document.getElementById("otpCode").value.trim();

    if (!code) {
        showToast("warning", "Code required", "Please enter the verification code from your email.");
        return;
    }

    const userData    = { Username: signupEmail, Pool: userPool };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.confirmRegistration(code, true, function(err, result) {
        if (err) {
            showToast("error", "Verification failed", err.message || "Invalid code. Please try again.");
            return;
        }

        showToast("success", "Email verified!", "Your account is ready. Logging you in...");

        document.getElementById("otpModal").style.display  = "none";
        document.getElementById("authModal").style.display = "flex";
        switchTab("login");

        document.getElementById("loginEmail").value    = signupEmail;
        document.getElementById("loginPassword").value = signupPassword;
    });
}

/* =============================================
   PAYROLL ACTIONS
   ============================================= */

async function startPayroll() {
    const button = document.getElementById("startPayrollBtn");
    button.disabled  = true;
    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Processing...`;

    const style = document.createElement("style");
    style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);

    try {
        const response = await fetch(`${API}/start-payroll`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();
        currentRunId = data.run_id;

        document.getElementById("total").innerText     = "0";
        document.getElementById("generated").innerText = "0";

        showToast("info", "Payroll started", "Processing payslips for all employees. Page will refresh shortly.");

        setTimeout(() => location.reload(), 5000);

    } catch (error) {
        console.error("Start payroll failed:", error);
        showToast("error", "Payroll failed", "Could not start payroll. Please try again.");
        button.disabled  = false;
        button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Payroll`;
    }
}

async function checkStatus() {
    if (!currentRunId) return;
    try {
        const response = await fetch(`${API}/payroll-status/${currentRunId}`);
        const data     = await response.json();
        document.getElementById("total").innerText     = data.total_employees;
        document.getElementById("generated").innerText = data.payslips_generated;
    } catch (error) {
        console.error("Status fetch failed:", error);
    }
}

async function loadEmployees() {
    try {
        const response = await fetch(`${API}/employees`);
        const data     = await response.json();
        const table    = document.getElementById("employeeTable");
        table.innerHTML = "";
        if (!data.employees) return;
        data.employees.forEach(emp => {
            const row = `
            <tr>
                <td><code style="font-size:12px;background:var(--surface-2);padding:2px 6px;border-radius:4px;">${emp.employee_id}</code></td>
                <td style="font-weight:500;">${emp.employee_name}</td>
                <td style="color:var(--text-secondary);">${emp.email}</td>
            </tr>`;
            table.innerHTML += row;
        });
    } catch (err) {
        console.error("Load employees failed:", err);
    }
}

loadEmployees();

async function loadHistory() {
    try {
        const response = await fetch(`${API}/payroll-history`);
        const data     = await response.json();
        const table    = document.getElementById("historyTable");
        table.innerHTML = "";

        data.runs
        .sort((a,b)=> b.run_id.localeCompare(a.run_id))
        .forEach((run, index) => {
            const completedBadge = run.completed
                ? `<span class="badge badge-success">✓ Completed</span>`
                : `<span class="badge badge-pending">● Pending</span>`;

            const row = `
            <tr onclick="loadRunDetails('${run.run_id}')">
                <td><code style="font-size:12px;background:var(--surface-2);padding:2px 6px;border-radius:4px;">${run.run_id}</code></td>
                <td style="font-weight:500;">${run.month}</td>
                <td>${run.total_employees}</td>
                <td>${completedBadge}</td>
            </tr>`;
            table.innerHTML += row;

            if (index === 0) {
                currentRunId = run.run_id;
                checkStatus();
                loadRunDetails(run.run_id);
            }
        });
    } catch (err) {
        console.error("Load history failed:", err);
    }
}

loadHistory();

async function loadRunDetails(runId) {
    try {
        const response = await fetch(`${API}/payroll-run/${runId}`);
        const data     = await response.json();
        const table    = document.getElementById("runDetails");
        table.innerHTML = "";

        data.employees.forEach(emp => {
            const payslip = emp.payslip_url
                ? `<a href="${emp.payslip_url}" target="_blank">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                     View
                   </a>`
                : `<span style="color:var(--text-muted);font-size:12px;">Not Ready</span>`;

            const statusClass = emp.status === "done" || emp.status === "completed"
                ? "badge badge-success"
                : emp.status === "error" || emp.status === "failed"
                    ? "badge badge-error"
                    : "badge badge-pending";

            const row = `
            <tr>
                <td><code style="font-size:12px;background:var(--surface-2);padding:2px 6px;border-radius:4px;">${emp.employee_id}</code></td>
                <td style="font-weight:500;">₹${Number(emp.gross).toLocaleString("en-IN")}</td>
                <td style="font-weight:600;color:var(--green);">₹${Number(emp.net_pay).toLocaleString("en-IN")}</td>
                <td><span class="${statusClass}">${emp.status}</span></td>
                <td>${payslip}</td>
            </tr>`;
            table.innerHTML += row;
        });
    } catch (err) {
        console.error("Load run details failed:", err);
    }
}

function downloadCSV() {
    const table = document.getElementById("runDetails");
    let csv = ["Employee ID,Gross,Net Pay,Status,Payslip URL"];

    const rows = table.querySelectorAll("tr");
    rows.forEach(row => {
        const cols  = row.querySelectorAll("td");
        let rowData = [];
        cols.forEach((col, index) => {
            if (index === 4) {
                const link = col.querySelector("a");
                rowData.push(link ? link.href : "");
            } else {
                rowData.push(col.innerText.replace(/,/g, ""));
            }
        });
        if (rowData.length > 0) csv.push(rowData.join(","));
    });

    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${currentRunId}_payroll.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast("success", "CSV exported", `Saved as ${currentRunId}_payroll.csv`);
}

/* =============================================
   INIT
   ============================================= */

protectPage();
protectActions();