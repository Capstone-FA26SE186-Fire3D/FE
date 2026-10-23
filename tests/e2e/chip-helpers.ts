import { expect, type Locator, type Page } from "@playwright/test";

/** Filter chips (`src/components/ui/filter-chip.tsx`): a button "Label: value" that opens a listbox or a small form. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const chip = (scope: Page | Locator, label: string) => scope.getByRole("button", { name: new RegExp(`^${escape(label)}:`) });

export const chipOptions = (scope: Page | Locator, label: string) => scope.locator(`[role="listbox"][aria-label="${label}"] [role="option"]`);

/** Opens the chip (if closed) and picks an option by its raw value or by its visible text. */
export async function pick(scope: Page | Locator, label: string, choice: { value: string } | { text: string }) {
  await openChip(scope, label);
  const options = chipOptions(scope, label);
  await ("value" in choice ? options.and(scope.locator(`[data-value="${choice.value}"]`)) : options.filter({ hasText: choice.text })).first().click();
}

export async function openChip(scope: Page | Locator, label: string) {
  const button = chip(scope, label);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
}

export const expectChipValue = (scope: Page | Locator, label: string, value: string) => expect(chip(scope, label)).toHaveAttribute("data-value", value);
