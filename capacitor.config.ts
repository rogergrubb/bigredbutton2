// Capacitor 6 wrapper config. Type imported when @capacitor/cli is installed
// (only needed when generating native shells via `npx cap add ios|android`).
// Using a local interface here so the web build doesn't require the dep.

interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: { androidScheme?: string; url?: string; cleartext?: boolean };
  ios?: { contentInset?: string; backgroundColor?: string };
  android?: { backgroundColor?: string };
}

const config: CapacitorConfig = {
  appId: "now.sellfast.thebrb",
  appName: "TheBRB",
  webDir: "out",
  server: {
    androidScheme: "https",
    // For dev: point Capacitor at the deployed web app instead of the static export.
    // url: "https://thebrb.vercel.app",
    // cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0A0A0B",
  },
  android: {
    backgroundColor: "#0A0A0B",
  },
};

export default config;
