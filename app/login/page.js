export default async function LoginPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const from = typeof sp.from === "string" ? sp.from : "/";
  const hasError = sp.error === "1";

  return (
    <main
      style={{
        maxWidth: 360,
        margin: "15vh auto",
        padding: "0 20px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Warehouse Bin Map</h1>

      {hasError && (
        <p style={{ color: "#a3401d", background: "#fdf2f2", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
          Incorrect username or password.
        </p>
      )}

      <form method="POST" action="/api/login" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="hidden" name="from" value={from} />
        <input
          name="username"
          placeholder="Username"
          autoComplete="username"
          required
          style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 16 }}
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 16 }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 12px",
            background: "#1F4E78",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Log in
        </button>
      </form>
    </main>
  );
}
