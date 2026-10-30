import {
  BaseWalletAdapter,
  WalletNotReadyError,
  WalletReadyState,
  type SupportedTransactionVersions,
  type WalletName,
} from "@solana/wallet-adapter-base";

/**
 * A wallet that isn't installed yet: it shows up in the "Connect wallet" list
 * and opens the wallet's download page when picked. Once the real extension
 * is installed it registers itself (Wallet Standard) under the same name and
 * replaces this placeholder automatically.
 */
class InstallOnlyAdapter extends BaseWalletAdapter {
  readonly supportedTransactionVersions: SupportedTransactionVersions = null;
  readonly readyState = WalletReadyState.NotDetected;
  readonly publicKey = null;
  readonly connecting = false;
  constructor(readonly name: WalletName, readonly url: string, readonly icon: string) {
    super();
  }
  async connect() {
    throw new WalletNotReadyError();
  }
  async disconnect() {}
  async sendTransaction(): Promise<never> {
    throw new WalletNotReadyError();
  }
}

const svg = (body: string, bg: string) =>
  `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${bg}"/>${body}</svg>`) : ""}`;

export const installOnlyWallets = () => [
  new InstallOnlyAdapter(
    "MetaMask" as WalletName,
    "https://metamask.io/download/",
    svg('<path d="M7 8l7 5-1.3-3zM25 8l-7 5 1.3-3zM9 21l2.5 3.5 3.5-1.5zM23 21l-2.5 3.5-3.5-1.5zM10 14l-1 4 5 .3zM22 14l1 4-5 .3zM13 18.5l3 3 3-3-3-1z" fill="#fff"/>', "#F6851B"),
  ),
  new InstallOnlyAdapter(
    "Backpack" as WalletName,
    "https://backpack.app/downloads",
    svg('<rect x="10" y="9" width="12" height="15" rx="3" fill="#fff"/><rect x="13" y="6" width="6" height="4" rx="2" fill="#fff"/><rect x="12" y="15" width="8" height="3" rx="1" fill="#E33E3F"/>', "#E33E3F"),
  ),
];
