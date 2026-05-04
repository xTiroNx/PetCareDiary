declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        version?: string;
        platform?: string;
        isFullscreen?: boolean;
        viewportHeight?: number;
        viewportStableHeight?: number;
        safeAreaInset?: TelegramInset;
        contentSafeAreaInset?: TelegramInset;
        ready: () => void;
        expand: () => void;
        close: () => void;
        isVersionAtLeast?: (version: string) => boolean;
        colorScheme?: "light" | "dark";
        themeParams?: Record<string, string>;
        BackButton?: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
          notificationOccurred: (type: "error" | "success" | "warning") => void;
          selectionChanged: () => void;
        };
        showAlert?: (message: string, callback?: () => void) => void;
        showConfirm?: (message: string, callback?: (confirmed: boolean) => void) => void;
        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
        requestFullscreen?: () => void;
        exitFullscreen?: () => void;
        addToHomeScreen?: () => void;
        checkHomeScreenStatus?: (callback: (status: string) => void) => void;
        openInvoice?: (url: string, callback?: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
      };
    };
  }
}

type TelegramInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

const devMockInitData = import.meta.env.DEV ? import.meta.env.VITE_MOCK_INIT_DATA : "";
const devBrowserSession = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === "true" ? "dev-browser-session" : "";

export function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

export function getInitData() {
  return getTelegramWebApp()?.initData || devMockInitData || devBrowserSession || "";
}

export function isTelegram() {
  return Boolean(getTelegramWebApp()?.initData);
}

function isSupported(version: string) {
  const webApp = getTelegramWebApp();
  return Boolean(webApp?.isVersionAtLeast?.(version));
}

function setPxVariable(name: string, value: number | undefined) {
  document.documentElement.style.setProperty(name, `${Math.max(0, value ?? 0)}px`);
}

function platformChromeFallback(platform: string | undefined) {
  const normalized = platform?.toLowerCase() ?? "";
  if (normalized.includes("ios") || normalized.includes("ipad")) return 56;
  if (normalized.includes("android")) return 28;
  return 40;
}

function updateTelegramChromeOffset() {
  const webApp = getTelegramWebApp();
  const contentTop = Math.max(0, webApp?.contentSafeAreaInset?.top ?? 0);
  const safeTop = Math.max(0, webApp?.safeAreaInset?.top ?? 0);
  const reportedTop = Math.max(contentTop, safeTop);
  const fallbackTop = platformChromeFallback(webApp?.platform);
  const offset = webApp?.isFullscreen && reportedTop < fallbackTop ? fallbackTop - reportedTop : 0;

  setPxVariable("--tg-chrome-top-offset", offset);
}

function updateSafeAreaVariables() {
  const webApp = getTelegramWebApp();
  const safe = webApp?.safeAreaInset;
  const content = webApp?.contentSafeAreaInset;

  setPxVariable("--tg-safe-top", safe?.top);
  setPxVariable("--tg-safe-right", safe?.right);
  setPxVariable("--tg-safe-bottom", safe?.bottom);
  setPxVariable("--tg-safe-left", safe?.left);
  setPxVariable("--tg-content-safe-top", content?.top);
  setPxVariable("--tg-content-safe-right", content?.right);
  setPxVariable("--tg-content-safe-bottom", content?.bottom);
  setPxVariable("--tg-content-safe-left", content?.left);
  updateTelegramChromeOffset();
}

export function setupTelegramUi() {
  const webApp = getTelegramWebApp();
  webApp?.ready();
  webApp?.expand();
  requestTelegramFullscreen();
  const theme = webApp?.themeParams;
  if (theme?.bg_color) document.documentElement.style.setProperty("--tg-bg", theme.bg_color);
  if (theme?.text_color) document.documentElement.style.setProperty("--tg-text", theme.text_color);
  updateSafeAreaVariables();
  webApp?.onEvent?.("viewportChanged", updateSafeAreaVariables);
  webApp?.onEvent?.("safeAreaChanged", updateSafeAreaVariables);
  webApp?.onEvent?.("contentSafeAreaChanged", updateSafeAreaVariables);
  webApp?.onEvent?.("fullscreenChanged", updateSafeAreaVariables);
}

export function onTelegramEvent(eventType: string, handler: () => void) {
  const webApp = getTelegramWebApp();
  webApp?.onEvent?.(eventType, handler);
  return () => webApp?.offEvent?.(eventType, handler);
}

export function telegramImpact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
  if (!isSupported("6.1")) return;
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function telegramSelection() {
  if (!isSupported("6.1")) return;
  getTelegramWebApp()?.HapticFeedback?.selectionChanged();
}

export function telegramSuccess() {
  if (!isSupported("6.1")) return;
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
}

export function telegramError() {
  if (!isSupported("6.1")) return;
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred("error");
}

export function telegramAlert(message: string) {
  const webApp = getTelegramWebApp();
  if (webApp?.showAlert && isSupported("6.2")) {
    return new Promise<void>((resolve) => webApp.showAlert?.(message, resolve));
  }
  window.alert(message);
  return Promise.resolve();
}

export function telegramConfirm(message: string) {
  const webApp = getTelegramWebApp();
  if (webApp?.showConfirm && isSupported("6.2")) {
    return new Promise<boolean>((resolve) => webApp.showConfirm?.(message, resolve));
  }
  return Promise.resolve<boolean | null>(null);
}

export function configureTelegramBackButton(visible: boolean, onClick: () => void) {
  const backButton = getTelegramWebApp()?.BackButton;
  if (!backButton || !isSupported("6.1")) return () => undefined;
  if (!visible) {
    backButton.hide();
    return () => undefined;
  }
  backButton.show();
  backButton.onClick(onClick);
  return () => backButton.offClick(onClick);
}

export function hideTelegramBackButton() {
  const backButton = getTelegramWebApp()?.BackButton;
  if (!backButton || !isSupported("6.1")) return;
  backButton.hide();
}

export function isTelegramFullscreen() {
  return Boolean(getTelegramWebApp()?.isFullscreen);
}

export function requestTelegramFullscreen() {
  const webApp = getTelegramWebApp();
  if (!webApp?.requestFullscreen || !isSupported("8.0")) return false;
  webApp.requestFullscreen();
  return true;
}

export function exitTelegramFullscreen() {
  const webApp = getTelegramWebApp();
  if (!webApp?.exitFullscreen || !isSupported("8.0")) return false;
  webApp.exitFullscreen();
  return true;
}

export function addTelegramHomeScreenShortcut() {
  const webApp = getTelegramWebApp();
  if (!webApp?.addToHomeScreen || !isSupported("8.0")) return false;
  webApp.addToHomeScreen();
  return true;
}

export function closeTelegramApp() {
  const webApp = getTelegramWebApp();
  if (!webApp?.close) return false;
  webApp.close();
  return true;
}

export function openTelegramInvoice(invoiceLink: string, onDone: () => void) {
  const webApp = getTelegramWebApp();
  if (webApp?.openInvoice) {
    webApp.openInvoice(invoiceLink, (status) => {
      if (status === "paid") onDone();
    });
    return;
  }
  window.location.href = invoiceLink;
}
