import type { ReactNode } from "react";
import CaBanner from "../common/CaBanner";
import PreviewBanner from "../common/PreviewBanner";
import TopBar from "./TopBar";
import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./AppShell.module.css";

export default function AppShell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <>
      <div className={styles.stickyBanners}>
        <CaBanner />
        {runtimeConfig.previewMode && <PreviewBanner />}
      </div>
      <TopBar />
      <main className={styles.main}>{children}</main>
      {footer}
    </>
  );
}
