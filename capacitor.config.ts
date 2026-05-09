import type { CapacitorConfig } from "@capacitor/cli";

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
