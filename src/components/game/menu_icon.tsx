export function MenuIcon({ id }: { id: string }) {
  const paths: Record<string, string> = {
    education: "M3 5h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 7v15",
    home: "M2 11 12 3l10 8 M5 9v12h14V9 M9 21v-7h6v7",
    grandparents:
      "M10 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M20 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M2 21v-5a3 3 0 0 1 3-3h2l5 4 5-4h2a3 3 0 0 1 3 3v5 M6 21v-4l6 4 6-4v4",
    afterschool:
      "M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-4-5-6-9-6 M7 9h.1 M10 6h.1 M16 7h.1 M6 14h.1",
    work: "M3 7h18v14H3z M8 7V3h8v4 M3 12l9 3 9-3 M12 12v5",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[id] ?? paths.home} />
    </svg>
  );
}
