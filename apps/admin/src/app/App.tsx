import { hasAccess, hrefOf, routeOf, safeNext, type AdminRoute } from "@miramenu/admin-core";
import { useEffect, useRef } from "react";
import { InvitationScreen } from "../auth/InvitationScreen";
import { SignInScreen } from "../auth/SignInScreen";
import { HomeScreen } from "../home/HomeScreen";
import { t } from "../i18n";
import { navigate, useLocation, type AppLocation } from "../platform/location";
import { AppShell } from "../shell/AppShell";
import controls from "../ui/controls.module.css";
import { useSession, useSignOut } from "./session";
import { LoadingScreen, StatusScreen } from "./StatusScreen";

/** The admin app: the screen the URL names, behind the session where it must be. */
export function App() {
  const location = useLocation();
  const route = routeOf(location);
  switch (route.screen) {
    case "signIn":
      return <SignInScreen route={route} />;
    case "invitation":
      return <InvitationScreen />;
    default:
      return <SessionGate route={route} location={location} />;
  }
}

function NoAccess() {
  const signOut = useSignOut();
  return (
    <StatusScreen
      kind="noAccess"
      action={
        <button type="button" className={controls.secondary} onClick={() => signOut.mutate()}>
          {t("shell.signOut")}
        </button>
      }
    />
  );
}

/**
 * Without a session, to signing in, keeping where the admin was going. A session that
 * ends while in use (any 401) says so on the sign-in screen.
 */
function SessionGate({ route, location }: { route: AdminRoute; location: AppLocation }) {
  const session = useSession();
  const actor = session.data;
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (actor) {
      wasSignedIn.current = true;
    } else if (actor === null) {
      const next = safeNext(`${location.pathname}${location.search}`);
      const notice = wasSignedIn.current ? "ended" : null;
      navigate(hrefOf({ screen: "signIn", next: next === "/" ? null : next, notice }), {
        replace: true,
      });
    }
  }, [actor, location.pathname, location.search]);

  if (actor) {
    if (!hasAccess(actor)) return <NoAccess />;
    return route.screen === "home" ? (
      <AppShell actor={actor} section="home">
        <HomeScreen actor={actor} />
      </AppShell>
    ) : (
      <AppShell actor={actor} section={null}>
        <StatusScreen
          kind="notFound"
          inShell
          action={
            <a
              className={controls.link}
              href="/"
              onClick={(event) => {
                event.preventDefault();
                navigate("/");
              }}
            >
              {t("notFound.home")}
            </a>
          }
        />
      </AppShell>
    );
  }
  if (session.isError)
    return (
      <StatusScreen
        kind="unavailable"
        action={
          <button type="button" className={controls.primary} onClick={() => void session.refetch()}>
            {t("status.retry")}
          </button>
        }
      />
    );
  return <LoadingScreen />;
}
