import { useAccount } from "wagmi";
import { FACTIONS } from "../../domain/factions";
import { shortAddress } from "../../domain/format";
import { runtimeConfig } from "../../config/runtimeConfig";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
import type { UserPressState } from "../../domain/types";
import styles from "./IdentityPanel.module.css";

export default function IdentityPanel({ preview, userPress }: { preview: PreviewClockState; userPress: UserPressState }) {
  const { address } = useAccount();

  const hasPressed = runtimeConfig.previewMode ? preview.pressed : userPress.hasPressed;
  const factionId = runtimeConfig.previewMode ? preview.faction : userPress.faction;
  const remaining = runtimeConfig.previewMode ? preview.remaining : userPress.remaining;
  const loaded = runtimeConfig.previewMode || userPress.loaded;
  const connected = runtimeConfig.previewMode || Boolean(address);
  const faction = FACTIONS[factionId] ?? FACTIONS[0];

  const status = !connected ? "DISCONNECTED" : !loaded ? "READING…" : hasPressed ? "SPENT" : "UNSPENT";

  return (
    <div className={styles.panel} aria-label="Your identity">
      <div>
        <span>WALLET</span>
        <strong>{address ? shortAddress(address) : runtimeConfig.previewMode ? "PREVIEW" : "N/A"}</strong>
      </div>
      <div>
        <span>PRESSED AT</span>
        <strong>{hasPressed ? `${remaining}s` : "N/A"}</strong>
      </div>
      <div>
        <span>FACTION</span>
        <strong style={{ color: hasPressed ? faction.color : undefined }}>{hasPressed ? faction.name : "GREY"}</strong>
      </div>
      <div>
        <span>STATUS</span>
        <strong>{status}</strong>
      </div>
    </div>
  );
}
