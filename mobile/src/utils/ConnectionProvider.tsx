import { Connection, type ConnectionConfig } from "@solana/web3.js";
import React, {
  type FC,
  type ReactNode,
  useMemo,
  createContext,
  useContext,
} from "react";
import { useCluster } from "../components/cluster/cluster-data-access";

export interface ConnectionProviderProps {
  children: ReactNode;
  config?: ConnectionConfig;
}

export const ConnectionProvider: FC<ConnectionProviderProps> = ({
  children,
  config = { commitment: "confirmed" },
}) => {
  const { selectedCluster } = useCluster();

  // One shared Connection per endpoint + commitment. Keyed on primitives so a
  // re-render (or an inline config object) never creates a new one.
  const commitment = config.commitment;
  const quiet = config.disableRetryOnRateLimit ?? true;
  const connection = useMemo(
    () => new Connection(selectedCluster.endpoint, { ...config, disableRetryOnRateLimit: quiet }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCluster.endpoint, commitment, quiet]
  );

  return (
    <ConnectionContext.Provider value={{ connection }}>
      {children}
    </ConnectionContext.Provider>
  );
};

export interface ConnectionContextState {
  connection: Connection;
}

export const ConnectionContext = createContext<ConnectionContextState>(
  {} as ConnectionContextState
);

export function useConnection(): ConnectionContextState {
  return useContext(ConnectionContext);
}
