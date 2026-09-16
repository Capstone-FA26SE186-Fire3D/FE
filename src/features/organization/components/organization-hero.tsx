"use client";
import { useEffect, useState, type ReactNode } from "react";
import { takeSceneHandoff } from "@/features/landing/handoff";
import styles from "./public.module.css";

export function OrganizationHero({ children }: { children: ReactNode }) {
  const [image, setImage] = useState("/assets/landing-cutaway.webp");
  useEffect(() => {
    const timer = setTimeout(() => { const handoff = takeSceneHandoff(); if (handoff) setImage(handoff.image); }, 0);
    return () => clearTimeout(timer);
  }, []);
  return <section className={styles.hero} style={{ backgroundImage: `url("${image}")` }}>
    <div className={styles.scrim} /><div className={styles.heroCopy}>{children}</div>
  </section>;
}
