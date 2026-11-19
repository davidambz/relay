// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "react";
import { useViewerSession, type ViewerState } from "./useViewerSession";

interface RunnerProps {
  code: string;
  onState: (code: string, state: ViewerState | null) => void;
}

/** Holds one viewer session while mounted; renders nothing. */
export function ViewerSessionRunner({ code, onState }: RunnerProps) {
  const state = useViewerSession(code);
  useEffect(() => onState(code, state), [code, state, onState]);
  // Gone: forget its state, so watching the same code again starts fresh.
  useEffect(() => () => onState(code, null), [code, onState]);
  return null;
}

