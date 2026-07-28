import React from "react";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import "../../styles/layout-shell.css";
import "./home.css";
import { BenefitsSection, CallToActionSection, HeroSection, WhySection } from "./HomeSections";
import { useHomeScrollPosition } from "./useHomeEffects";

export const HomePage = () => {
  useHomeScrollPosition();
  return (
    <div className="shell">
      <Header />
      <main id="main-content">
        <HeroSection />
        <WhySection />
        <BenefitsSection />
        <CallToActionSection />
      </main>
      <Footer />
    </div>
  );
};
