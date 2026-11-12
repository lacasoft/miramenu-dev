import { sectionsOf, type Section } from "@miramenu/admin-core";
import type { SessionActor } from "@miramenu/contracts";
import type { ReactNode } from "react";
import { useSignOut } from "../app/session";
import { t } from "../i18n";
import { navigate } from "../platform/location";
import controls from "../ui/controls.module.css";
import { Icon, type IconName } from "../ui/Icon";
import styles from "./AppShell.module.css";

const SECTIONS: Record<Section, { href: string; icon: IconName; label: "shell.home" }> = {
  home: { href: "/", icon: "summary", label: "shell.home" },
};

/** Every screen behind the session: the sections this person reaches, and their name. */
export function AppShell({
  actor,
  section,
  children,
}: {
  actor: SessionActor;
  /** The section the screen belongs to, or null (a page that does not exist). */
  section: Section | null;
  children: ReactNode;
}) {
  const signOut = useSignOut();
  const initial = [...actor.user.name.trim()][0]?.toLocaleUpperCase("es-MX") ?? "";
  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label={t("shell.navigation")}>
        <ul className={styles.sections}>
          {sectionsOf(actor).map((each) => {
            const { href, icon, label } = SECTIONS[each];
            return (
              <li key={each}>
                <a
                  className={styles.item}
                  href={href}
                  aria-current={each === section ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(href);
                  }}
                >
                  <span className={styles.icon}>
                    <Icon name={icon} />
                  </span>
                  {t(label)}
                </a>
              </li>
            );
          })}
        </ul>
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <button
            type="button"
            className={styles.item}
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            <span className={styles.icon}>
              <Icon name="logout" />
            </span>
            {t("shell.signOut")}
          </button>
        </div>
      </nav>
      <div>
        <header className={styles.header}>
          <p className={styles.greeting}>{t("shell.greeting", { name: actor.user.name })}</p>
          {actor.isSuperadmin && <p className={styles.identity}>{t("role.superadmin")}</p>}
        </header>
        {signOut.isError && (
          <p className={`${controls.problem} ${styles.problem}`} role="alert">
            {t("shell.signOutFailed")}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
