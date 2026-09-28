import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { HistoryRow, matchClient } from "./MatchClient";

/** Real server-recorded matches for this player. Refetches on focus; never example rows. */
export function useMatchHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");

  const refresh = useCallback(async () => {
    const r = await matchClient.getHistory();
    if (r) {
      setRows(r);
      setStatus("ready");
    } else {
      setStatus("offline");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { rows, status, refresh };
}
