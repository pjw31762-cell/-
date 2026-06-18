import { useState, type FormEvent, type ReactNode } from "react";
import { ScanLine, LogIn, UserPlus, Clock, LogOut, User, ShieldCheck, ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import type { Department } from "@/lib/settings-store";
import logoAsset from "@/assets/gangnam-senior-logo.png.asset.json";

type View = "select" | "login" | "signup";
type LoginRole = "user" | "admin";
const DEPTS: Department[] = ["평생교육팀", "스마트복지팀", "지역복지과"];

export function AuthGate({ children }: { children: ReactNode }) {
  const { currentUser, loading, signIn, signUp, signOut } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("select");
  const [loginRole, setLoginRole] = useState<LoginRole>("user");

  // login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // signup fields
  const [name, setName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [dept, setDept] = useState<Department>("평생교육팀");

  const [error, setError] = useState<string | null>(null);
  const [pendingModal, setPendingModal] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        불러오는 중…
      </div>
    );
  }

  // Logged in but not approved → pending/rejected screen
  if (currentUser && currentUser.status !== "approved") {
    const rejected = currentUser.status === "rejected";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-elevated)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Clock className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">
            {rejected ? "가입이 거부되었습니다" : "관리자 승인 대기 중"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {rejected
              ? "관리자에 의해 가입이 거부되었습니다. 자세한 사항은 관리자에게 문의해 주세요."
              : "관리자가 회원가입을 승인한 후에 이용하실 수 있습니다. 잠시만 기다려 주세요."}
          </p>
          <div className="mt-5 rounded-lg bg-secondary px-4 py-3 text-left text-xs text-muted-foreground">
            <div><span className="font-medium text-foreground">이름</span> · {currentUser.name}</div>
            <div><span className="font-medium text-foreground">이메일</span> · {currentUser.email}</div>
            <div><span className="font-medium text-foreground">소속 부서</span> · {currentUser.dept}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" /> 로그아웃
          </button>
        </div>
      </div>
    );
  }

  if (currentUser) return <>{children}</>;

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = signIn(email, password);
    if (!result.ok) {
      // Detect pending account to show friendly modal instead of error text
      const normalized = email.trim().toLowerCase();
      try {
        const raw = localStorage.getItem("sws.accounts.v2");
        if (raw) {
          const list = JSON.parse(raw) as Array<{ email: string; password: string; status: string }>;
          const match = list.find((a) => a.email.toLowerCase() === normalized && a.password === password);
          if (match && match.status === "pending") {
            setPendingModal(true);
            return;
          }
        }
      } catch {}
      setError(result.error);
      return;
    }
    // Role mismatch guard
    try {
      const raw = localStorage.getItem("sws.currentUser.v2");
      const u = raw ? (JSON.parse(raw) as { role: "admin" | "user" }) : null;
      if (u) {
        if (loginRole === "admin" && u.role !== "admin") {
          setError("관리자 계정이 아닙니다. [직원] 탭에서 다시 로그인해 주세요.");
          return;
        }
        if (loginRole === "user" && u.role === "admin") {
          setError("일반 직원 계정이 아닙니다. [관리자] 화면에서 로그인해 주세요.");
          return;
        }
        if (u.role === "admin") {
          navigate({ to: "/users" });
        }
      }
    } catch {}
  };

  const handleSignup = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = signUp({ name, email: suEmail, password: suPassword, dept });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("회원가입이 완료되었습니다. 관리자 승인 후 이용하실 수 있습니다.");
    setView("select");
    setEmail(suEmail);
    setName("");
    setSuEmail("");
    setSuPassword("");
  };

  const Header = (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[image:var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-soft)]">
        <ScanLine className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        스마트 웰 서베이
        <span className="ml-2 text-base font-medium text-muted-foreground">Smart Well-Survey</span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">강남시니어플라자 만족도 자동화 플랫폼</p>
    </div>
  );

  // ───────── View: select role ─────────
  if (view === "select") {
    const roles: { key: LoginRole; num: string; title: string; sub: string; desc: string; Icon: typeof User }[] = [
      { key: "user", num: "01", title: "직원 로그인", sub: "평생교육팀 · 스마트복지팀 · 지역복지과", desc: "설문 구성·업로드·분석 등 운영 업무를 수행합니다.", Icon: User },
      { key: "admin", num: "02", title: "관리자 로그인", sub: "시스템 관리자", desc: "계정 승인·전체 운영 현황을 관리합니다.", Icon: ShieldCheck },
    ];
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-10">
        <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elevated)]">
          {Header}
          <p className="mt-4 text-center text-sm text-muted-foreground">사용자 유형을 선택해 주세요.</p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {roles.map(({ key, num, title, sub, desc, Icon }) => (
              <button
                key={key}
                onClick={() => { setLoginRole(key); setError(null); setView("login"); }}
                className="group relative aspect-square rounded-2xl border border-border bg-background p-6 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-elevated)]"
              >
                <span className="absolute right-5 top-5 text-xs font-semibold text-muted-foreground">{num}</span>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-5">
                  <div className="text-base font-semibold">{title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{desc}</p>
                <div className="absolute bottom-5 left-6 inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                  로그인 <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            아직 가입하지 않으셨나요?{" "}
            <button
              type="button"
              onClick={() => { setError(null); setView("signup"); }}
              className="font-medium text-primary hover:underline"
            >
              회원가입
            </button>
          </div>
          <div className="mt-6 flex justify-center">
            <img
              src={logoAsset.url}
              alt="강남시니어플라자"
              className="h-10 w-auto object-contain opacity-90"
            />
          </div>
        </div>

        {pendingModal && <PendingModal onClose={() => setPendingModal(false)} />}
      </div>
    );
  }

  // ───────── View: login (per role) ─────────
  if (view === "login") {
    const isAdmin = loginRole === "admin";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elevated)]">
          {Header}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setError(null); setView("select"); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> 유형 선택
            </button>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isAdmin ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"}`}>
              {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
              {isAdmin ? "관리자 로그인" : "직원 로그인"}
            </span>
          </div>
          <form onSubmit={handleLogin} className="mt-5 space-y-3">
            <Field label="이메일">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            <Field label="비밀번호">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <LogIn className="h-4 w-4" /> 로그인
            </button>
          </form>
          {error && (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            아직 가입하지 않으셨나요?{" "}
            <button
              type="button"
              onClick={() => { setError(null); setView("signup"); }}
              className="font-medium text-primary hover:underline"
            >
              회원가입
            </button>
          </div>
          <div className="mt-6 flex justify-center">
            <img
              src={logoAsset.url}
              alt="강남시니어플라자"
              className="h-8 w-auto object-contain opacity-80"
            />
          </div>
        </div>

        {pendingModal && <PendingModal onClose={() => setPendingModal(false)} />}
      </div>
    );
  }

  // ───────── View: signup ─────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elevated)]">
        {Header}
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          <button
            type="button"
            onClick={() => { setError(null); setView("select"); }}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            로그인
          </button>
          <button
            type="button"
            className="rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm"
          >
            회원가입
          </button>
        </div>
        <form onSubmit={handleSignup} className="mt-5 space-y-3">
            <Field label="이름">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            <Field label="이메일">
              <input
                type="email"
                value={suEmail}
                onChange={(e) => setSuEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            <Field label="비밀번호 (4자 이상)">
              <input
                type="password"
                value={suPassword}
                onChange={(e) => setSuPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            <Field label="소속 부서">
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value as Department)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {DEPTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" /> 회원가입 신청
            </button>
            <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-xs font-medium text-amber-800">
              가입 후 관리자가 승인하면 이용하실 수 있습니다.
            </div>
          </form>
        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
      </div>

      {pendingModal && <PendingModal onClose={() => setPendingModal(false)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function PendingModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-elevated)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Clock className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">승인 대기 중인 계정입니다</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          아직 관리자 승인이 완료되지 않았습니다.<br />승인 후 다시 로그인해 주세요.
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          확인
        </button>
      </div>
    </div>
  );
}