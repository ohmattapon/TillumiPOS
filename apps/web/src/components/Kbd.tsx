/** A keyboard-shortcut hint shown on the control it triggers. */
export const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border bg-background/20 px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium">
    {children}
  </kbd>
)
