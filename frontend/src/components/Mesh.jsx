/** The slowly drifting colour blobs behind every glass panel (styled in styles.css). */
export default function Mesh() {
  return (
    <div className="mesh" aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

/** Centered column on the mesh background, for full-screen steps like sign-in and onboarding. */
export function CenteredScreen({ children }) {
  return (
    <>
      <Mesh />
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">{children}</main>
    </>
  );
}
