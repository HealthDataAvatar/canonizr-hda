import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Formats } from "./components/Formats";
import { Pricing } from "./components/Pricing";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Formats />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
