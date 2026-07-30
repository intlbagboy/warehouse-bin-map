import "./globals.css";

export const metadata = {
  title: "Warehouse Bin Map",
  description: "Live warehouse relocation tracker",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
