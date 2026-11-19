// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ViewerEndReason } from "@relay/core";
import type { ViewerState } from "./useViewerSession";
import { ViewerSessionRunner } from "./ViewerSessionRunner";

/**
 * One viewer session per code, each connected while its code is in the
 * list. Returns their states and the (invisible) elements that hold them,
 * to render anywhere that stays mounted. A session that ends on its own
 * is reported through `onEnded`.
 */
export function useViewerSessions(
  codes: string[],
  onEnded: (code: string, reason: ViewerEndReason) => void,
): [Record<string, ViewerState>, ReactNode] {
  const [states, setStates] = useState<Record<string, ViewerState>>({});

  const handleState = useCallback(
    (code: string, state: ViewerState | null) => {
      if (state === null) {
        setStates(({ [code]: _gone, ...rest }) => rest);
        return;
      }
      setStates((current) => (current[code] === state ? current : { ...current, [code]: state }));
      if (state.status === "ended") onEnded(code, state.reason);
    },
    [onEnded],
  );

  // Only the codes still in the list: a left session's last state is stale.
  const visible = useMemo(() => {
    const result: Record<string, ViewerState> = {};
    for (const code of codes) result[code] = states[code] ?? { status: "connecting" };
    return result;
  }, [codes, states]);

  const runners = codes.map((code) => <ViewerSessionRunner key={code} code={code} onState={handleState} />);
  return [visible, runners];
}
