import { canCreateBusiness, hasAccess, hrefOf, routeOf, safeNext, type AdminRoute } from "@miramenu/admin-core";
import type { SessionActor } from "@miramenu/contracts";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { InvitationScreen } from "../auth/InvitationScreen";
import { SignInScreen } from "../auth/SignInScreen";
import { BranchScreen } from "../branch/BranchScreen";
import { BusinessScreen } from "../business/BusinessScreen";
import { NewBusinessScreen } from "../business/NewBusinessScreen";
import { TeamScreen } from "../team/TeamScreen";
import { HomeScreen } from "../home/HomeScreen";
import { t } from "../i18n";
import { navigate, useLocation, type AppLocation } from "../platform/location";
import { AppShell } from "../shell/AppShell";
import { AppLink } from "../ui/AppLink";
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

const toHome = (
  <AppLink className={controls.link} href="/">
    {t("notFound.home")}
  </AppLink>
);

/** The screen a page behind the session shows; every one lives in the home's section. */
function screenOf(route: AdminRoute, actor: SessionActor): ReactNode {
  switch (route.screen) {
    case "home":
      return <HomeScreen actor={actor} />;
    case "newBusiness":
      return canCreateBusiness(actor) ? <NewBusinessScreen /> : <StatusScreen kind="forbidden" inShell action={toHome} />;
    case "business":
      return <BusinessScreen key={route.businessId} actor={actor} businessId={route.businessId} />;
    case "team":
      return <TeamScreen key={route.businessId} actor={actor} businessId={route.businessId} />;
    case "branch":
      return <BranchScreen key={route.branchId} actor={actor} branchId={route.branchId} />;
    default:
      return <StatusScreen kind="notFound" inShell action={toHome} />;
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
    return (
      <AppShell actor={actor} section={route.screen === "notFound" ? null : "home"}>
        {screenOf(route, actor)}
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
