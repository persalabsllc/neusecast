import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "NeuseCast",
    template: "%s · NeuseCast",
  },
  description:
    "The local screen network for businesses, advertisers, and community stories across Eastern North Carolina.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ClerkProvider
          afterSignOutUrl="/"
          appearance={{
            variables: {
              colorPrimary: "#43ddc1",
              colorBackground: "#0a171c",
              colorForeground: "#f5f7f2",
              borderRadius: "0.75rem",
            },
            elements: {
              card: { backgroundColor: "#0c1d23", border: "1px solid rgba(130, 178, 181, 0.2)", boxShadow: "0 24px 80px rgba(0, 0, 0, 0.38)" },
              headerTitle: { color: "#f5f7f2" },
              headerSubtitle: { color: "#a9bdbe" },
              socialButtonsBlockButton: { color: "#f5f7f2", borderColor: "rgba(130, 178, 181, 0.28)" },
              formFieldLabel: { color: "#e7efeb" },
              formFieldInput: { color: "#f5f7f2", backgroundColor: "#081419", borderColor: "rgba(130, 178, 181, 0.28)" },
              footerActionText: { color: "#a9bdbe" },
              footerActionLink: { color: "#43ddc1" },
              userButtonPopoverCard: { backgroundColor: "#0c1d23", border: "1px solid rgba(130, 178, 181, 0.2)" },
              userButtonPopoverActionButton: { color: "#f5f7f2" },
              userButtonPopoverActionButtonText: { color: "#f5f7f2" },
              userButtonPopoverActionButtonIcon: { color: "#43ddc1" },
              userPreviewMainIdentifier: { color: "#f5f7f2" },
              userPreviewSecondaryIdentifier: { color: "#a9bdbe" },
              userButtonPopoverFooter: { backgroundColor: "#0c1d23", color: "#a9bdbe" },
            },
          }}
          localization={{
            signIn: { start: { title: "Sign in to NeuseCast", subtitle: "Welcome back. Sign in to continue." } },
            signUp: { start: { title: "Create your NeuseCast account", subtitle: "One secure login for your NeuseCast workspace." } },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
