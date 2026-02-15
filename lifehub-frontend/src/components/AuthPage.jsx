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
  const [otpRequested, setOtpRequested] = useState(false);
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
    role: "customer"
  });

  const title = useMemo(
    () =>
      mode === "login"
        ? "Welcome back to LifeHub"
        : "Create your LifeHub account",
    [mode]
  );

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await request("/auth/login", loginForm);
      onAuthSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await request("/auth/signup", signupForm);
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

  async function requestOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await request("/auth/otp/request", { phone: otpForm.phone });
      setOtpRequested(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
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

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <h1>LifeHub</h1>
        <p>
          Unified marketplace + services + chat platform with workflow automation,
          fair transactions, and multi-role operations.
        </p>
      </div>

      <div className="auth-card">
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
          >
            Sign Up
          </button>
        </div>

        <h2>{title}</h2>
        {error && <div className="auth-error">{error}</div>}

        {mode === "login" ? (
          <>
            <div className="auth-methods">
              <button
                type="button"
                className={loginMethod === "password" ? "active" : ""}
                onClick={() => setLoginMethod("password")}
              >
                Password
              </button>
              <button
                type="button"
                className={loginMethod === "otp" ? "active" : ""}
                onClick={() => setLoginMethod("otp")}
              >
                OTP
              </button>
            </div>
            {loginMethod === "password" ? (
              <form className="auth-form" onSubmit={handleLogin}>
                <label>
                  Phone
                  <input
                    value={loginForm.phone}
                    onChange={event =>
                      setLoginForm(prev => ({ ...prev, phone: event.target.value }))
                    }
                    placeholder="9000000001"
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
                    placeholder="Your password"
                    required
                  />
                </label>
                <button type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={otpRequested ? verifyOtp : requestOtp}>
                <label>
                  Phone
                  <input
                    value={otpForm.phone}
                    onChange={event =>
                      setOtpForm(prev => ({ ...prev, phone: event.target.value }))
                    }
                    placeholder="9000000001"
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
                      ? "Verify OTP"
                      : "Send OTP"}
                </button>
              </form>
            )}
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSignup}>
            <label>
              Full Name
              <input
                value={signupForm.name}
                onChange={event =>
                  setSignupForm(prev => ({ ...prev, name: event.target.value }))
                }
                placeholder="Your name"
                required
              />
            </label>
            <label>
              Phone
              <input
                value={signupForm.phone}
                onChange={event =>
                  setSignupForm(prev => ({ ...prev, phone: event.target.value }))
                }
                placeholder="9000000007"
                required
              />
            </label>
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
                placeholder="Strong password"
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
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
