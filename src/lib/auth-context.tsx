import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { settingsStore, type Department } from "@/lib/settings-store";

export type Role = "admin" | "user";
export type AccountStatus = "pending" | "approved" | "rejected";

export type Account = {
  id: string; // 이메일을 식별자로 사용
  email: string;
  password: string;
  role: Role;
  status: AccountStatus;
  dept: Department;
  name: string;
  createdAt: number;
};

export type CurrentUser = {
  id: string; // = email (설정 화면 호환용)
  email: string;
  role: Role;
  status: AccountStatus;
  dept: Department;
  name: string;
};

const ACCOUNTS_KEY = "accounts.v2";
const CURRENT_KEY = "currentUser.v2";

// 관리자 계정 — 강남시니어플라자 만족도 자동화 플랫폼
export const ADMIN_EMAIL = "gangnamsenior@daum.net";
const ADMIN_DEFAULT_PASSWORD = "gangnam2026!";

const DEFAULT_ACCOUNTS: Account[] = [
  {
    id: ADMIN_EMAIL,
    email: ADMIN_EMAIL,
    password: ADMIN_DEFAULT_PASSWORD,
    role: "admin",
    status: "approved",
    dept: "평생교육팀",
    name: "관리자",
    createdAt: Date.now(),
  },
];

const norm = (s: string) => s.trim().toLowerCase();

function writeAccounts(list: Account[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

function readAccounts(): Account[] {
  if (typeof window === "undefined") return DEFAULT_ACCOUNTS;
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) {
      const list = JSON.parse(raw) as Account[];
      // 관리자 계정이 없으면 항상 보강
      if (!list.some((a) => a.role === "admin")) {
        list.push(DEFAULT_ACCOUNTS[0]);
        writeAccounts(list);
      }
      return list;
    }
  } catch {}
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(DEFAULT_ACCOUNTS));
  return DEFAULT_ACCOUNTS;
}

function readCurrent(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (raw) return JSON.parse(raw) as CurrentUser;
  } catch {}
  return null;
}

function toCurrent(a: Account): CurrentUser {
  return { id: a.email, email: a.email, role: a.role, status: a.status, dept: a.dept, name: a.name };
}

type Result = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  currentUser: CurrentUser | null;
  loading: boolean;
  displayName: string;
  isAdmin: boolean;
  accounts: Account[];
  pendingCount: number;
  signIn: (email: string, password: string) => Result;
  signUp: (input: { email: string; password: string; name: string; dept: Department }) => Result;
  signOut: () => Promise<void>;
  approveUser: (id: string) => void;
  rejectUser: (id: string) => void;
  deleteUser: (id: string) => void;
  refreshAccounts: () => void;
  changePassword: (currentPw: string, newPw: string, confirmPw: string) => Result;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshAccounts = () => setAccounts(readAccounts());

  useEffect(() => {
    const list = readAccounts();
    setAccounts(list);
    const u = readCurrent();
    if (u) {
      // 저장된 세션의 상태를 최신 계정 정보로 동기화
      const fresh = list.find((a) => a.id === u.id);
      if (fresh) {
        const cu = toCurrent(fresh);
        setCurrentUser(cu);
        localStorage.setItem(CURRENT_KEY, JSON.stringify(cu));
        settingsStore.update({ department: cu.dept });
      } else {
        localStorage.removeItem(CURRENT_KEY);
      }
    }
    setLoading(false);
  }, []);

  const displayName = currentUser?.name || "사용자";
  const isAdmin = currentUser?.role === "admin";
  const pendingCount = accounts.filter((a) => a.status === "pending").length;

  const signIn: AuthContextValue["signIn"] = (email, password) => {
    const list = readAccounts();
    setAccounts(list);
    const match = list.find((a) => a.id === norm(email) && a.password === password);
    if (!match) {
      return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }
    const cu = toCurrent(match);
    localStorage.setItem(CURRENT_KEY, JSON.stringify(cu));
    settingsStore.update({ department: cu.dept });
    setCurrentUser(cu);
    return { ok: true };
  };

  const signUp: AuthContextValue["signUp"] = ({ email, password, name, dept }) => {
    const id = norm(email);
    if (!id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) {
      return { ok: false, error: "올바른 이메일 형식이 아닙니다." };
    }
    if (password.length < 4) {
      return { ok: false, error: "비밀번호는 4자 이상이어야 합니다." };
    }
    if (!name.trim()) {
      return { ok: false, error: "이름을 입력해주세요." };
    }
    const list = readAccounts();
    if (list.some((a) => a.id === id)) {
      return { ok: false, error: "이미 등록된 이메일입니다." };
    }
    const acc: Account = {
      id,
      email: id,
      password,
      role: "user",
      status: "pending",
      dept,
      name: name.trim(),
      createdAt: Date.now(),
    };
    const next = [...list, acc];
    writeAccounts(next);
    setAccounts(next);
    return { ok: true };
  };

  const signOut = async () => {
    if (typeof window !== "undefined") localStorage.removeItem(CURRENT_KEY);
    setCurrentUser(null);
  };

  const mutate = (id: string, patch: Partial<Account>) => {
    const list = readAccounts();
    const next = list.map((a) => (a.id === id ? { ...a, ...patch } : a));
    writeAccounts(next);
    setAccounts(next);
    // 현재 로그인한 사용자가 영향을 받으면 세션도 갱신
    if (currentUser?.id === id) {
      const fresh = next.find((a) => a.id === id);
      if (fresh) {
        const cu = toCurrent(fresh);
        localStorage.setItem(CURRENT_KEY, JSON.stringify(cu));
        setCurrentUser(cu);
      }
    }
  };

  const approveUser = (id: string) => mutate(id, { status: "approved" });
  const rejectUser = (id: string) => mutate(id, { status: "rejected" });

  const deleteUser = (id: string) => {
    const list = readAccounts();
    const target = list.find((a) => a.id === id);
    if (target?.role === "admin") return; // 관리자 계정은 삭제 불가
    const next = list.filter((a) => a.id !== id);
    writeAccounts(next);
    setAccounts(next);
  };

  const changePassword: AuthContextValue["changePassword"] = (currentPw, newPw, confirmPw) => {
    if (!currentUser) return { ok: false, error: "로그인이 필요합니다." };
    const list = readAccounts();
    const idx = list.findIndex((a) => a.id === currentUser.id);
    if (idx < 0) return { ok: false, error: "계정을 찾을 수 없습니다." };
    if (list[idx].password !== currentPw) {
      return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };
    }
    if (newPw.length < 4) {
      return { ok: false, error: "비밀번호는 4자 이상이어야 합니다." };
    }
    if (newPw !== confirmPw) {
      return { ok: false, error: "새 비밀번호가 일치하지 않습니다." };
    }
    list[idx] = { ...list[idx], password: newPw };
    writeAccounts(list);
    setAccounts(list);
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        displayName,
        isAdmin,
        accounts,
        pendingCount,
        signIn,
        signUp,
        signOut,
        approveUser,
        rejectUser,
        deleteUser,
        refreshAccounts,
        changePassword,
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
