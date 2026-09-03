import type { ReactNode } from "react";
import PreviewBanner from "../common/PreviewBanner";
import TopBar from "./TopBar";
import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./AppShell.module.css";

export default function AppShell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <>
      {runtimeConfig.previewMode && <PreviewBanner />}
      <TopBar />
      <main className={styles.main}>{children}</main>
      {footer}
    </>
  );
}
