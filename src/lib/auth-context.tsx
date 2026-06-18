import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { settingsStore, type Department } from "@/lib/settings-store";

export type Role = "admin" | "user";
export type AccountStatus = "pending" | "approved" | "rejected";

export type Account = {
  id: string;
  email: string;
  password: string;
  name: string;
  dept: Department;
  role: Role;
  status: AccountStatus;
  createdAt: number;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  dept: Department;
  role: Role;
  status: AccountStatus;
};

const ACCOUNTS_KEY = "sws.accounts.v2";
const CURRENT_KEY = "sws.currentUser.v2";
const EVT = "sws:accounts-updated";

const ADMIN_EMAIL = "gangnamsenior@daum.net";
const ADMIN_PASSWORD = "gangnam2026!";

const seedAdmin = (): Account => ({
  id: "admin_seed",
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  name: "관리자",
  dept: "평생교육팀",
  role: "admin",
  status: "approved",
  createdAt: Date.now(),
});

const normalizeEmail = (e: string) => e.trim().toLowerCase();
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function readAccounts(): Account[] {
  if (typeof window === "undefined") return [seedAdmin()];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) {
      const list = JSON.parse(raw) as Account[];
      // ensure built-in admin always exists
      if (!list.some((a) => normalizeEmail(a.email) === ADMIN_EMAIL)) {
        list.unshift(seedAdmin());
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
      }
      return list;
    }
  } catch {}
  const seeded = [seedAdmin()];
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(seeded));
  return seeded;
}

function writeAccounts(list: Account[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVT));
}

function readCurrent(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (raw) return JSON.parse(raw) as CurrentUser;
  } catch {}
  return null;
}

const toCurrentUser = (a: Account): CurrentUser => ({
  id: a.id,
  email: a.email,
  name: a.name,
  dept: a.dept,
  role: a.role,
  status: a.status,
});

type Result = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  currentUser: CurrentUser | null;
  loading: boolean;
  displayName: string;
  accounts: Account[];
  signIn: (email: string, password: string) => Result;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
    dept: Department;
  }) => Result;
  signOut: () => Promise<void>;
  changePassword: (currentPw: string, newPw: string, confirmPw: string) => Result;
  approveAccount: (id: string) => void;
  rejectAccount: (id: string) => void;
  deleteAccount: (id: string) => Result;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAccounts(readAccounts());
    const u = readCurrent();
    if (u) {
      setCurrentUser(u);
      if (u.dept) settingsStore.update({ department: u.dept });
    }
    setLoading(false);
    const onUpd = () => setAccounts(readAccounts());
    window.addEventListener(EVT, onUpd);
    return () => window.removeEventListener(EVT, onUpd);
  }, []);

  const displayName = currentUser?.name || "사용자";

  const persistAccounts = (list: Account[]) => {
    writeAccounts(list);
    setAccounts(list);
    // If the currently logged-in user's record changed, refresh it
    if (currentUser) {
      const fresh = list.find((a) => a.id === currentUser.id);
      if (fresh) {
        const next = toCurrentUser(fresh);
        localStorage.setItem(CURRENT_KEY, JSON.stringify(next));
        setCurrentUser(next);
      }
    }
  };

  const signIn: AuthContextValue["signIn"] = (email, password) => {
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) return { ok: false, error: "이메일 형식이 올바르지 않습니다." };
    const list = readAccounts();
    const match = list.find((a) => normalizeEmail(a.email) === e && a.password === password);
    if (!match) return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    const user = toCurrentUser(match);
    localStorage.setItem(CURRENT_KEY, JSON.stringify(user));
    if (user.dept) settingsStore.update({ department: user.dept });
    setCurrentUser(user);
    setAccounts(list);
    return { ok: true };
  };

  const signUp: AuthContextValue["signUp"] = ({ name, email, password, dept }) => {
    const e = normalizeEmail(email);
    if (!name.trim()) return { ok: false, error: "이름을 입력해 주세요." };
    if (!isValidEmail(e)) return { ok: false, error: "이메일 형식이 올바르지 않습니다." };
    if (password.length < 4) return { ok: false, error: "비밀번호는 4자 이상이어야 합니다." };
    if (!dept) return { ok: false, error: "소속 부서를 선택해 주세요." };
    const list = readAccounts();
    if (list.some((a) => normalizeEmail(a.email) === e)) {
      return { ok: false, error: "이미 가입된 이메일입니다." };
    }
    const next: Account = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email: e,
      password,
      name: name.trim(),
      dept,
      role: "user",
      status: "pending",
      createdAt: Date.now(),
    };
    persistAccounts([...list, next]);
    return { ok: true };
  };

  const signOut = async () => {
    if (typeof window !== "undefined") localStorage.removeItem(CURRENT_KEY);
    setCurrentUser(null);
  };

  const changePassword: AuthContextValue["changePassword"] = (currentPw, newPw, confirmPw) => {
    if (!currentUser) return { ok: false, error: "로그인이 필요합니다." };
    const list = readAccounts();
    const idx = list.findIndex((a) => a.id === currentUser.id);
    if (idx < 0) return { ok: false, error: "계정을 찾을 수 없습니다." };
    if (list[idx].password !== currentPw) return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };
    if (newPw.length < 4) return { ok: false, error: "비밀번호는 4자 이상이어야 합니다." };
    if (newPw !== confirmPw) return { ok: false, error: "새 비밀번호가 일치하지 않습니다." };
    const next = [...list];
    next[idx] = { ...next[idx], password: newPw };
    persistAccounts(next);
    return { ok: true };
  };

  const setStatus = (id: string, status: AccountStatus) => {
    const list = readAccounts();
    const next = list.map((a) => (a.id === id ? { ...a, status } : a));
    persistAccounts(next);
  };

  const approveAccount = (id: string) => setStatus(id, "approved");
  const rejectAccount = (id: string) => setStatus(id, "rejected");

  const deleteAccount: AuthContextValue["deleteAccount"] = (id) => {
    const list = readAccounts();
    const target = list.find((a) => a.id === id);
    if (!target) return { ok: false, error: "계정을 찾을 수 없습니다." };
    if (normalizeEmail(target.email) === ADMIN_EMAIL) {
      return { ok: false, error: "기본 관리자 계정은 삭제할 수 없습니다." };
    }
    if (currentUser?.id === id) {
      return { ok: false, error: "현재 로그인된 계정은 삭제할 수 없습니다." };
    }
    persistAccounts(list.filter((a) => a.id !== id));
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        displayName,
        accounts,
        signIn,
        signUp,
        signOut,
        changePassword,
        approveAccount,
        rejectAccount,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}