import { useEffect } from "react";

const ComingSoonPage = () => {
  useEffect(() => {
    document.title = "Mr.B. Yatzy – Coming soon";
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", "Mr.B. Yatzy – coming soon on the App Store.");
  }, []);

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-background text-foreground px-6">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gold-gradient">
          Mr.B. Yatzy
        </h1>
        <p className="mt-4 text-base sm:text-lg text-muted-foreground">
          Coming soon on the App Store
        </p>
      </div>
    </main>
  );
};

export default ComingSoonPage;
