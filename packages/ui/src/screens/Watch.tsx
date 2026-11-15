// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, type FormEvent } from "react";
import { CODE_LENGTH, isValidCode, normalizeCode } from "@relay/core";
import { Button } from "../components/Button";
import { BackIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import screen from "./Screen.module.css";
import styles from "./Watch.module.css";

export function Watch({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const valid = isValidCode(code);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form className={screen.screen} onSubmit={submit}>
      <section className={[screen.panel, styles.panel].join(" ")}>
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
            aria-invalid={submitted && !valid}
            placeholder={"·".repeat(CODE_LENGTH)}
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
        {submitted && valid && (
          <p className={screen.note} role="status">
            {t.watch.connectionPending}
          </p>
        )}
      </section>

      <div className={screen.actions}>
        <Button type="button" variant="ghost" onClick={onBack}>
          <BackIcon /> {t.watch.back}
        </Button>
        <Button type="submit" variant="primary" disabled={code.length !== CODE_LENGTH}>
          {t.watch.watch}
        </Button>
      </div>
    </form>
  );
}
