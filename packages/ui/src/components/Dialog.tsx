// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/I18nContext";
import { CloseIcon } from "./icons";
import styles from "./Dialog.module.css";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal panel in the instrument-panel style: nameplate header, focus trap, Esc closes. */
export function Dialog({ title, onClose, children, footer }: DialogProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  // Read through a ref rather than depending on onClose directly: callers
  // pass inline-defined onClose callbacks that get a new identity on every
  // render, which (with onClose in the dependency array) would rerun the
  // effect below and yank focus back to the panel each time.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      // Focus trap: WAI-ARIA APG modal dialogs must keep Tab/Shift+Tab
      // cycling within the panel rather than leaking focus into the page
      // behind the (still visually covering) overlay — browsers don't
      // enforce this just because aria-modal="true" is set.
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Right after opening, focus sits on the panel itself (tabIndex=-1,
      // excluded from `focusable` on purpose) rather than on `first` — a
      // Shift+Tab from there must still wrap to `last`, or it falls
      // through to the browser's default and escapes into whatever
      // precedes the panel in DOM order (e.g. the header behind the
      // still-open overlay).
      const onPanel = active === panelRef.current;
      if (event.shiftKey && (active === first || onPanel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Portaled to document.body: the overlay is `position: fixed`, which
  // only covers the window when no ancestor sets transform/filter/contain.
  // A portal keeps it centered over everything whatever the caller's
  // ancestors do. Same component as Umbra's settings UI.
  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t.dialog.close}
            title={t.dialog.close}
          >
            <CloseIcon />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
