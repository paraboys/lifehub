import { useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

const ROLE_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "shopkeeper", label: "Grocery Shopkeeper" },
  { value: "provider", label: "Service Provider" },
  { value: "delivery", label: "Delivery Partner" },
  { value: "business", label: "Business Partner" }
];

export default function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState("login");
  const [loginMethod, setLoginMethod] = useState("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [otpRequested, setOtpRequested] = useState(false);
  const [signupOtpRequested, setSignupOtpRequested] = useState(false);
  const [forgotOtpRequested, setForgotOtpRequested] = useState(false);

  const [loginForm, setLoginForm] = useState({
    phone: "",
    password: ""
  });
  const [otpForm, setOtpForm] = useState({
    phone: "",
    code: ""
  });
  const [signupForm, setSignupForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    role: "customer",
    otpCode: ""
  });
  const [forgotForm, setForgotForm] = useState({
    phone: "",
    code: "",
    newPassword: "",
    confirmPassword: ""
  });

  const title = useMemo(() => {
    if (mode === "signup") return "Create your verified LifeHub account";
    if (mode === "forgot") return "Reset your password securely";
    return "Welcome back to LifeHub";
  }, [mode]);

  function resetMessages() {
    setError("");
    setStatus("");
  }

  function switchMode(next) {
    setMode(next);
    resetMessages();
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    resetMessages();
    try {
      const data = await request("/auth/login", loginForm);
      onAuthSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestLoginOtp(event) {
    event.preventDefault();
    setLoading(true);
    resetMessages();
    try {
      await request("/auth/otp/request", { phone: otpForm.phone });
      setOtpRequested(true);
      setStatus("OTP sent to your phone.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyLoginOtp(event) {
    event.preventDefault();
    setLoading(true);
    resetMessages();
    try {
      const data = await request("/auth/otp/verify", {
        phone: otpForm.phone,
        code: otpForm.code
      });
      onAuthSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestSignupOtp(event) {
    event.preventDefault();
    setLoading(true);
    resetMessages();
    try {
      await request("/auth/signup/otp/request", { phone: signupForm.phone });
      setSignupOtpRequested(true);
      setStatus("Signup OTP sent. Enter code to complete registration.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    setLoading(true);
    resetMessages();
    try {
      if (!signupOtpRequested) {
        throw new Error("Request OTP first to verify your phone number.");
      }
      if (!signupForm.otpCode.trim()) {
        throw new Error("Enter the OTP sent to your phone.");
      }

      await request("/auth/signup", {
        name: signupForm.name,
        phone: signupForm.phone,
        email: signupForm.email,
        password: signupForm.password,
        role: signupForm.role,
        otpCode: signupForm.otpCode
      });

      const data = await request("/auth/login", {
        phone: signupForm.phone,
        password: signupForm.password
      });
      onAuthSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestForgotOtp(event) {
    event.preventDefault();
    setLoading(true);
    resetMessages();
    try {
      await request("/auth/password/otp/request", { phone: forgotForm.phone });
      setForgotOtpRequested(true);
      setStatus("Password reset OTP sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setLoading(true);
    resetMessages();
    try {
      if (!forgotOtpRequested) {
        throw new Error("Request OTP first.");
      }
      if (!forgotForm.code.trim()) {
        throw new Error("Enter OTP code.");
      }
      if (forgotForm.newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }
      if (forgotForm.newPassword !== forgotForm.confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      await request("/auth/password/reset", {
        phone: forgotForm.phone,
        code: forgotForm.code,
        newPassword: forgotForm.newPassword
      });
      setStatus("Password reset successful. Please login.");
      setMode("login");
      setLoginMethod("password");
      setLoginForm(prev => ({
        ...prev,
        phone: forgotForm.phone,
        password: ""
      }));
      setForgotOtpRequested(false);
      setForgotForm({
        phone: forgotForm.phone,
        code: "",
        newPassword: "",
        confirmPassword: ""
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell auth-shell-modern">
      <div className="auth-hero auth-hero-modern">
        <h1>LifeHub</h1>
        <p>
          Marketplace, services, chat, secure wallet, and realtime operations in one software.
        </p>
        <div className="auth-pill-row">
          <span className="auth-pill">Verified Signup OTP</span>
          <span className="auth-pill">Secure Password Reset</span>
          <span className="auth-pill">P2P Wallet Transfers</span>
        </div>
        <div className="auth-stat-grid">
          <div className="auth-stat-card">
            <strong>Unified</strong>
            <small>Shopping + Services + Chat</small>
          </div>
          <div className="auth-stat-card">
            <strong>Realtime</strong>
            <small>Notifications and Presence</small>
          </div>
          <div className="auth-stat-card">
            <strong>Mobile First</strong>
            <small>Designed for easy touch usage</small>
          </div>
        </div>
      </div>

      <div className="auth-card auth-card-modern">
        <div className="auth-tabs auth-tabs-modern">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => switchMode("signup")}
          >
            Sign Up
          </button>
          <button
            type="button"
            className={mode === "forgot" ? "active" : ""}
            onClick={() => switchMode("forgot")}
          >
            Forgot Password
          </button>
        </div>

        <h2>{title}</h2>
        {!!error && <div className="auth-error">{error}</div>}
        {!!status && <div className="auth-success">{status}</div>}

        {mode === "login" && (
          <>
            <div className="auth-methods auth-methods-modern">
              <button
                type="button"
                className={loginMethod === "password" ? "active" : ""}
                onClick={() => {
                  setLoginMethod("password");
                  resetMessages();
                }}
              >
                Password Login
              </button>
              <button
                type="button"
                className={loginMethod === "otp" ? "active" : ""}
                onClick={() => {
                  setLoginMethod("otp");
                  resetMessages();
                }}
              >
                OTP Login
              </button>
            </div>

            {loginMethod === "password" ? (
              <form className="auth-form auth-form-modern" onSubmit={handleLogin}>
                <label>
                  Phone
                  <input
                    value={loginForm.phone}
                    onChange={event =>
                      setLoginForm(prev => ({ ...prev, phone: event.target.value }))
                    }
                    placeholder="+919000000001"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={event =>
                      setLoginForm(prev => ({ ...prev, password: event.target.value }))
                    }
                    placeholder="Enter your password"
                    required
                  />
                </label>
                <button type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            ) : (
              <form
                className="auth-form auth-form-modern"
                onSubmit={otpRequested ? verifyLoginOtp : requestLoginOtp}
              >
                <label>
                  Phone
                  <input
                    value={otpForm.phone}
                    onChange={event => {
                      const nextPhone = event.target.value;
                      setOtpForm(prev => ({ ...prev, phone: nextPhone }));
                      if (otpRequested) {
                        setOtpRequested(false);
                        setOtpForm(prev => ({ ...prev, code: "" }));
                      }
                    }}
                    placeholder="+919000000001"
                    required
                  />
                </label>
                {otpRequested && (
                  <label>
                    OTP Code
                    <input
                      value={otpForm.code}
                      onChange={event =>
                        setOtpForm(prev => ({ ...prev, code: event.target.value }))
                      }
                      placeholder="Enter 6-digit OTP"
                      required
                    />
                  </label>
                )}
                <button type="submit" disabled={loading}>
                  {loading
                    ? "Please wait..."
                    : otpRequested
                      ? "Verify OTP and Login"
                      : "Send Login OTP"}
                </button>
                {otpRequested && (
                  <button
                    type="button"
                    className="ghost-btn auth-secondary-btn"
                    onClick={requestLoginOtp}
                    disabled={loading}
                  >
                    Resend OTP
                  </button>
                )}
              </form>
            )}
          </>
        )}

        {mode === "signup" && (
          <form className="auth-form auth-form-modern" onSubmit={handleSignup}>
            <label>
              Full Name
              <input
                value={signupForm.name}
                onChange={event =>
                  setSignupForm(prev => ({ ...prev, name: event.target.value }))
                }
                placeholder="Your full name"
                required
              />
            </label>
            <label>
              Phone
              <div className="auth-inline-input">
                <input
                  value={signupForm.phone}
                  onChange={event => {
                    const nextPhone = event.target.value;
                    setSignupForm(prev => ({ ...prev, phone: nextPhone, otpCode: "" }));
                    setSignupOtpRequested(false);
                  }}
                  placeholder="+919000000001"
                  required
                />
                <button
                  type="button"
                  className="ghost-btn auth-secondary-btn"
                  onClick={requestSignupOtp}
                  disabled={loading || !signupForm.phone.trim()}
                >
                  {signupOtpRequested ? "Resend OTP" : "Send OTP"}
                </button>
              </div>
            </label>
            {signupOtpRequested && (
              <label>
                Signup OTP
                <input
                  value={signupForm.otpCode}
                  onChange={event =>
                    setSignupForm(prev => ({ ...prev, otpCode: event.target.value }))
                  }
                  placeholder="Enter OTP"
                  required
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={signupForm.email}
                onChange={event =>
                  setSignupForm(prev => ({ ...prev, email: event.target.value }))
                }
                placeholder="you@lifehub.app"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={signupForm.password}
                onChange={event =>
                  setSignupForm(prev => ({ ...prev, password: event.target.value }))
                }
                placeholder="Minimum 6 characters"
                required
              />
            </label>
            <label>
              Role
              <select
                value={signupForm.role}
                onChange={event =>
                  setSignupForm(prev => ({ ...prev, role: event.target.value }))
                }
              >
                {ROLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create Verified Account"}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form
            className="auth-form auth-form-modern"
            onSubmit={forgotOtpRequested ? handleForgotPassword : requestForgotOtp}
          >
            <label>
              Registered Phone
              <div className="auth-inline-input">
                <input
                  value={forgotForm.phone}
                  onChange={event => {
                    const nextPhone = event.target.value;
                    setForgotForm(prev => ({
                      ...prev,
                      phone: nextPhone,
                      code: "",
                      newPassword: "",
                      confirmPassword: ""
                    }));
                    setForgotOtpRequested(false);
                  }}
                  placeholder="+919000000001"
                  required
                />
                <button
                  type="button"
                  className="ghost-btn auth-secondary-btn"
                  onClick={requestForgotOtp}
                  disabled={loading || !forgotForm.phone.trim()}
                >
                  {forgotOtpRequested ? "Resend OTP" : "Send OTP"}
                </button>
              </div>
            </label>
            {forgotOtpRequested && (
              <>
                <label>
                  OTP Code
                  <input
                    value={forgotForm.code}
                    onChange={event =>
                      setForgotForm(prev => ({ ...prev, code: event.target.value }))
                    }
                    placeholder="Enter OTP"
                    required
                  />
                </label>
                <label>
                  New Password
                  <input
                    type="password"
                    value={forgotForm.newPassword}
                    onChange={event =>
                      setForgotForm(prev => ({ ...prev, newPassword: event.target.value }))
                    }
                    placeholder="Minimum 6 characters"
                    required
                  />
                </label>
                <label>
                  Confirm Password
                  <input
                    type="password"
                    value={forgotForm.confirmPassword}
                    onChange={event =>
                      setForgotForm(prev => ({ ...prev, confirmPassword: event.target.value }))
                    }
                    placeholder="Re-enter new password"
                    required
                  />
                </label>
              </>
            )}
            <button type="submit" disabled={loading}>
              {loading
                ? "Please wait..."
                : forgotOtpRequested
                  ? "Reset Password"
                  : "Request Reset OTP"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
