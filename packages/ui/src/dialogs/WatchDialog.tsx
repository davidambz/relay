// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, type FormEvent } from "react";
import { CODE_LENGTH, isValidCode, normalizeCode } from "@relay/core";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { useI18n } from "../i18n/I18nContext";
import screen from "../screens/Screen.module.css";
import styles from "./WatchDialog.module.css";

interface WatchDialogProps {
  onClose: () => void;
  onWatch: (code: string) => void;
  /** The person's own broadcast code, while on air: watching it would loop. */
  ownCode?: string;
  /** The code just submitted is connecting; the dialog closes once it plays. */
  connecting?: boolean;
  /** Why the code just submitted couldn't be watched. */
  error?: string;
}

/** Types a share code; the broadcast joins the stage once it connects. */
export function WatchDialog({ onClose, onWatch, ownCode, connecting = false, error }: WatchDialogProps) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // The last code handed to onWatch: `error` is about that one only.
  const [sentCode, setSentCode] = useState<string | null>(null);
  const showError = error !== undefined && !connecting && code === sentCode;
  const valid = isValidCode(code);
  const own = valid && code === ownCode;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (valid && !own) {
      setSentCode(code);
      onWatch(code);
    }
  }

  return (
    <Dialog
      title={t.watch.title}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.watch.cancel}
          </Button>
          <Button type="submit" form="watch-form" variant="primary" disabled={code.length !== CODE_LENGTH || connecting}>
            {connecting ? t.watch.connecting : t.watch.watch}
          </Button>
        </>
      }
    >
      <form id="watch-form" className={styles.form} onSubmit={submit}>
        <label htmlFor="watch-code" className="label">
          {t.watch.codeLabel}
        </label>
        <div className={styles.visor}>
          <input
            id="watch-code"
            className={styles.input}
            value={code}
            onChange={(event) => {
              setCode(normalizeCode(event.target.value).slice(0, CODE_LENGTH));
              setSubmitted(false);
            }}
            maxLength={CODE_LENGTH + 4}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            aria-describedby="watch-code-hint"
            aria-invalid={(submitted && (!valid || own)) || showError}
            placeholder={"·".repeat(CODE_LENGTH)}
            readOnly={connecting}
            autoFocus
          />
        </div>
        <p id="watch-code-hint" className={screen.description}>
          {t.watch.codeHint}
        </p>
        {submitted && !valid && (
          <p className={screen.error} role="alert">
            {t.watch.codeInvalid}
          </p>
        )}
        {submitted && own && (
          <p className={screen.error} role="alert">
            {t.watch.ownCode}
          </p>
        )}
        {showError && (
          <p className={screen.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
