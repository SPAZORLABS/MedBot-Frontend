import "@/app/styles/globals.css";

export const metadata = {
  title: "AI-CPA | Clinical Pharmacist Assistant",
  description: "ADR risk prediction with explainable AI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


