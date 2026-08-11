"use client";

import { type ReactNode, useState } from "react";
import { WagmiProvider, type State } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWagmiConfig } from "@/lib/wagmi";
import { AuthProvider } from "@/lib/auth-context";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { DepositReturnRedirector } from "@/components/DepositReturnRedirector";
import type { Locale } from "@/lib/i18n/locales";

export function Providers({
  children,
  initialWagmiState,
  initialLocale,
  walletConnectProjectId,
}: {
  children: ReactNode;
  initialWagmiState?: State;
  initialLocale: Locale;
  // Resolved server-side in layout.tsx (DB override, env fallback) and
  // passed down as a plain string so the client builds the SAME config
  // shape the server used for initialWagmiState — building it fresh
  // here (not importing a static singleton) is what lets an admin's
  // saved Project ID actually reach the walletConnect connector.
  walletConnectProjectId?: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  // Deliberately NOT branching this on `typeof window !== "undefined"`
  // (or any other window.ethereum check) — that reads differently
  // during the server's render pass (no window, always "false") than
  // during the client's very first hydration render (window already
  // exists, so it can read "true" if a wallet extension is installed),
  // which is a textbook React hydration mismatch: the server built a
  // config WITH the WalletConnect connector while the client built one
  // WITHOUT it, so WagmiProvider's cookie-derived initialState
  // reconciled into different isConnected/session state on each pass —
  // this is what was making ConnectWalletButton render a different
  // branch server vs. client. Always matching layout.tsx's server-side
  // createWagmiConfig(walletConnectProjectId) call exactly (no
  // conditional) keeps the first client render identical to the
  // server's output; createWagmiConfig's own projectId-keyed cache
  // means this still only constructs the WalletConnect connector once
  // per app lifetime, not per render.
  const [wagmiConfig] = useState(() => createWagmiConfig(walletConnectProjectId));

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <WagmiProvider config={wagmiConfig} initialState={initialWagmiState}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <DepositReturnRedirector />
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </LocaleProvider>
  );
}
