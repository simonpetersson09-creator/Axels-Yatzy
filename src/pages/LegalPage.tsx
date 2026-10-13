import { useEffect } from "react";

const LegalPage = () => {
  useEffect(() => {
    document.title = "Mr.B. Yatzy – Support & Privacy";
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta(
      "description",
      "Support and privacy policy for Mr.B. Yatzy – contact info, data we collect, how it's used, and third-party services.",
    );
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", "/legal");
  }, []);

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
        <header className="mb-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gold-gradient">
            Mr.B. Yatzy – Support &amp; Privacy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: {new Date().getFullYear()}
          </p>
        </header>

        <section className="glass-card p-6 sm:p-8 mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-3">Support</h2>
          <p className="text-foreground/90 leading-relaxed">
            Need help or want to report a problem?
          </p>
          <p className="mt-3">
            Contact:{" "}
            <a
              href="mailto:simon@shiningdays.se"
              className="text-primary underline underline-offset-4 hover:opacity-90"
            >
              simon@shiningdays.se
            </a>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Typical response time within 48 hours.
          </p>
        </section>

        <section className="glass-card p-6 sm:p-8 space-y-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold mb-2">Privacy Policy</h2>
            <p className="text-sm text-muted-foreground">
              We respect your privacy. This policy explains what data Mr.B. Yatzy collects and how it is used.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Information We Collect</h3>
            <ul className="list-disc pl-5 space-y-1 text-foreground/90">
              <li>Player names</li>
              <li>Multiplayer game data</li>
              <li>Push notification tokens</li>
              <li>Anonymous app-generated identifiers</li>
              <li>Basic analytics events</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">How We Use Data</h3>
            <p className="text-foreground/90 mb-2">The data is used for:</p>
            <ul className="list-disc pl-5 space-y-1 text-foreground/90">
              <li>Multiplayer functionality</li>
              <li>Push notifications</li>
              <li>Gameplay synchronization</li>
              <li>App improvements and analytics</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Third-Party Services</h3>
            <p className="text-foreground/90 mb-2">
              We use Supabase as our backend provider for:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-foreground/90">
              <li>Database hosting</li>
              <li>Realtime multiplayer functionality</li>
            </ul>
            <ul className="list-disc pl-5 space-y-1 text-foreground/90 mt-3">
              <li>No data is sold to third parties</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Advertising (Google AdMob)</h3>
            <p className="text-foreground/90 mb-2">
              The app shows ads (banners and full-screen ads) provided by Google AdMob. To show and measure ads, Google may
              process device information, IP address, the advertising identifier (on Android), and ad interactions.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-foreground/90">
              <li>In the EU/EEA, UK and Switzerland you are asked for consent the first time the app starts. You can accept or decline – the game works the same either way.</li>
              <li>If you decline, you still see ads, but they are not personalized.</li>
              <li>You can change your choice at any time under Settings → Ad privacy settings.</li>
              <li>
                Read more in{' '}
                <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="underline">
                  Google's advertising policy
                </a>.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Tracking</h3>
            <ul className="list-disc pl-5 space-y-1 text-foreground/90">
              <li>We do not ask for permission to track you across other companies' apps and websites (iOS App Tracking Transparency), so the iOS advertising identifier is not used.</li>
              <li>Our own analytics only cover usage inside this app.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Contact</h3>
            <p>
              <a
                href="mailto:simon@shiningdays.se"
                className="text-primary underline underline-offset-4 hover:opacity-90"
              >
                simon@shiningdays.se
              </a>
            </p>
          </div>
        </section>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          <a href="/" className="hover:text-foreground transition-colors">
            ← Back to app
          </a>
        </footer>
      </div>
    </main>
  );
};

export default LegalPage;
