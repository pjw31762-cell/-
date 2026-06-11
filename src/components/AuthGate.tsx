import { useState, type FormEvent, type ReactNode } from "react";
import { ScanLine, LogIn, UserPlus, Clock, XCircle, LogOut, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { Department } from "@/lib/settings-store";

const DEPARTMENTS: Department[] = ["평생교육팀", "스마트복지팀", "지역복지과"];

type Mode = "login" | "signup";

export function AuthGate({ children }: { children: ReactNode }) {
  const { currentUser, loading, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [dept, setDept] = useState<Department>("평생교육팀");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        불러오는 중…
      </div>
    );
  }

  // 로그인은 됐지만 아직 승인되지 않은 사용자
  if (currentUser && currentUser.status !== "approved") {
    const rejected = currentUser.status === "rejected";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-elevated)]">
          <div
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl ${
              rejected ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-600"
            }`}
          >
            {rejected ? <XCircle className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">
            {rejected ? "접속이 거부되었습니다" : "관리자 승인 대기 중"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {rejected
              ? "관리자가 계정 접속을 거부했습니다. 자세한 내용은 관리자에게 문의해주세요."
              : "회원가입이 완료되었습니다. 관리자가 계정을 승인하면 플랫폼을 이용하실 수 있습니다."}
          </p>
          <div className="mt-4 rounded-lg bg-secondary px-4 py-3 text-left text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">이메일</span>
              <span className="font-medium">{currentUser.email}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">소속</span>
              <span className="font-medium">{currentUser.dept}</span>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" /> 로그아웃
          </button>
        </div>
      </div>
    );
  }

  if (currentUser) return <>{children}</>;

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    const result = signIn(email, password);
    if (!result.ok) setError(result.error);
  };

  const handleSignup = (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    const result = signUp({ email, password, name, dept });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMode("login");
    setPassword("");
    setInfo("회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.");
  };

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4">
      <form
        onSubmit={mode === "login" ? handleLogin : handleSignup}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elevated)]"
      >
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

        <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              resetMessages();
            }}
            className={`rounded-md py-2 font-medium transition-colors ${
              mode === "login" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              resetMessages();
            }}
            className={`rounded-md py-2 font-medium transition-colors ${
              mode === "signup" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            회원가입
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {mode === "signup" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="name@example.com"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={inputCls}
            />
          </div>
          {mode === "signup" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">소속 부서</label>
              <select value={dept} onChange={(e) => setDept(e.target.value as Department)} className={inputCls}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {mode === "login" ? (
            <>
              <LogIn className="h-4 w-4" /> 로그인
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" /> 회원가입 신청
            </>
          )}
        </button>

        {info && (
          <p className="mt-4 flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {info}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}

        {mode === "signup" && (
          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            회원가입 후 관리자 승인을 받아야 플랫폼에 접속할 수 있습니다.
          </p>
        )}
      </form>
    </div>
  );
}
