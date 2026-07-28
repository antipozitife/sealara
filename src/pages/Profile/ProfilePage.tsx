import React from "react";
import { useNavigate } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import "../../styles/layout-shell.css";
import "./profile.css";
import { ProfileAside, ProfileForm, ProfileHero } from "./ProfileSections";
import { useProfile } from "./useProfile";

export const ProfilePage: React.FC = () => {
  const controller = useProfile(useNavigate());

  return (
    <div className="shell profile-page">
      <Header />
      <main id="main-content" className={`profile-main${controller.loading ? " profile-loading" : ""}`}>
        {controller.loading ? (
          "Загрузка профиля..."
        ) : (
          <>
            <ProfileHero controller={controller} />
            <section className="profile-grid" aria-label="Разделы профиля">
              <ProfileForm controller={controller} />
              <ProfileAside controller={controller} />
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};
