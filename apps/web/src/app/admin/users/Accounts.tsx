'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  api,
  type ApiAdminUser,
  type ApiRoleChange,
  type Profile,
} from '../../../lib/api';
import styles from '../admin.module.css';

const ROLES = [
  { value: 'user', label: 'User' },
  { value: 'coach', label: 'Coach' },
  { value: 'admin', label: 'Admin' },
] as const;

const ROLE_LABEL: Readonly<Record<string, string>> = {
  user: 'User',
  coach: 'Coach',
  admin: 'Admin',
};

/**
 * Accounts, and what they are allowed to be.
 *
 * The console's most consequential screen: granting `admin` grants the safety
 * queue, and that holds what someone said at the moment they said they were
 * not safe. So it is a search rather than a list — nobody should scroll past
 * everybody to find one person — and the server refuses the two changes that
 * should not be easy, with the reason shown here rather than guessed at.
 *
 * It shows a name, an address and a role. Never any session content.
 */
export default function Accounts() {
  const [me, setMe] = useState<Profile | null>(null);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [users, setUsers] = useState<readonly ApiAdminUser[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [trail, setTrail] = useState<readonly ApiRoleChange[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await api.adminUsers({ q: query, role });
      setUsers(page.items);
      setCursor(page.nextCursor);
      setTotal(page.total);
      setAdminCount(page.adminCount);
      setProblem(null);
    } catch (e: unknown) {
      setProblem(
        e instanceof ApiError && (e.isUnauthenticated || e.status === 404)
          ? 'Accounts are for staff. Sign in with an admin account.'
          : 'Could not load accounts. Check your connection.',
      );
    }
  }, [query, role]);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => {
        setMe(null);
      });
  }, []);

  useEffect(() => {
    // Debounced, so typing a name is one search rather than one per keystroke.
    const timer = setTimeout(() => {
      void load();
    }, 350);
    return () => {
      clearTimeout(timer);
    };
  }, [load]);

  const refreshTrail = useCallback(() => {
    api
      .roleChanges(20)
      .then((page) => {
        setTrail(page.items);
      })
      .catch(() => {
        // The trail is a record, not a control. Failing to show it should not
        // stop anyone administering an account.
      });
  }, []);

  useEffect(() => {
    refreshTrail();
  }, [refreshTrail]);

  const change = async (user: ApiAdminUser, to: string) => {
    if (to === user.role) return;
    setSaving(user.id);
    try {
      const updated = await api.setUserRole(user.id, to);
      setUsers((current) => (current ?? []).map((u) => (u.id === updated.id ? updated : u)));
      setProblem(null);
      refreshTrail();
      // The admin count moves with it, and the screen explains refusals from it.
      void load();
    } catch (e: unknown) {
      // The server's own reason, not a guess at one: it knows whether this is
      // the last admin and this screen does not.
      setProblem(
        e instanceof ApiError ? e.message : 'Could not change that. Check your connection.',
      );
    } finally {
      setSaving(null);
    }
  };

  const loadMore = async () => {
    if (cursor === null) return;
    try {
      const page = await api.adminUsers({ q: query, role }, undefined, cursor);
      setUsers((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setProblem('Could not load more. Check your connection.');
    }
  };

  if (users === null && problem !== null) {
    return (
      <>
        <h1 className={styles.title}>Accounts</h1>
        <p className={styles.sub}>{problem}</p>
      </>
    );
  }

  const rows = users ?? [];

  return (
    <>
      <h1 className={styles.title}>Accounts</h1>
      <p className={styles.sub}>
        {users === null
          ? 'Loading…'
          : `${String(total)} ${total === 1 ? 'account' : 'accounts'} · ${String(adminCount)} ${
              adminCount === 1 ? 'admin' : 'admins'
            }`}
      </p>

      <div className={styles.inviteRow}>
        <input
          className={styles.input}
          type="search"
          placeholder="Name or email"
          aria-label="Search accounts"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <label className={styles.field} style={{ maxWidth: '12rem' }}>
          Role
          <select
            className={styles.input}
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
            }}
          >
            <option value="">Any</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {problem === null ? null : (
        <p className={styles.sub} role="alert">
          {problem}
        </p>
      )}

      {users !== null && rows.length === 0 ? (
        <p className={styles.sub}>No account matches that.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Email</th>
              <th className={styles.th}>Plan</th>
              <th className={styles.th}>Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => {
              const isMe = me !== null && String(me.id) === user.id;
              return (
                <tr key={user.id}>
                  <td className={styles.td}>
                    {user.name}
                    {isMe ? ' (you)' : ''}
                  </td>
                  <td className={styles.td}>{user.email}</td>
                  <td className={styles.td}>{user.plan}</td>
                  <td className={styles.td}>
                    {isMe ? (
                      // Nobody changes their own role, so there is nothing to
                      // offer here — and saying why is better than a disabled
                      // control with no explanation.
                      <span className={styles.statLabel}>
                        {ROLE_LABEL[user.role] ?? user.role} · ask another admin to change yours
                      </span>
                    ) : (
                      <select
                        className={styles.input}
                        value={user.role}
                        disabled={saving === user.id}
                        aria-label={`Role for ${user.name}`}
                        onChange={(e) => {
                          void change(user, e.target.value);
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {cursor === null ? null : (
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={() => {
            void loadMore();
          }}
        >
          Load more ({rows.length} of {total})
        </button>
      )}

      <span className={styles.label} style={{ marginTop: 24 }}>
        ROLE CHANGES
      </span>
      <p className={styles.sub}>
        Granting Admin grants the safety queue. Every change is recorded here, with who made it.
      </p>
      {trail.length === 0 ? (
        <p className={styles.sub}>No role has been changed yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>When</th>
              <th className={styles.th}>Account</th>
              <th className={styles.th}>Change</th>
              <th className={styles.th}>By</th>
            </tr>
          </thead>
          <tbody>
            {trail.map((c) => (
              <tr key={c.id}>
                <td className={styles.td}>
                  {c.at === null ? '—' : new Date(c.at).toLocaleString('en-IN')}
                </td>
                <td className={styles.td}>{c.userEmail}</td>
                <td className={styles.td}>
                  {ROLE_LABEL[c.fromRole] ?? c.fromRole} → {ROLE_LABEL[c.toRole] ?? c.toRole}
                </td>
                <td className={styles.td}>{c.changedByEmail ?? 'a deleted account'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
