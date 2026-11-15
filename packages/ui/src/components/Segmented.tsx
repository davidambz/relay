// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import { handleRadioGroupKeyDown } from "../radioGroupNav";
import styles from "./Segmented.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A bank of rocker cells (Umbra's header nav, generalized): one radiogroup,
 * roving tabIndex, arrow keys move selection.
 */
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.bank} onKeyDown={handleRadioGroupKeyDown}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={styles.cell}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            <span className={styles.text}>
              <span className={styles.cellLabel}>{option.label}</span>
              {option.hint && <span className={styles.hint}>{option.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
