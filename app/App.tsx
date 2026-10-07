import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  Share,
  useWindowDimensions,
  ActivityIndicator,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  useFonts,
  NotoSansThai_400Regular,
  NotoSansThai_500Medium,
  NotoSansThai_700Bold,
} from "@expo-google-fonts/noto-sans-thai";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import { File, Paths } from "expo-file-system";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  ShieldCheck,
  House,
  ScanLine,
  Clock3,
  Network,
  Flag,
  Settings2,
  Sun,
  Moon,
  Languages,
  UserRound,
  LogOut,
  Menu,
  X,
  ArrowRight,
  ImagePlus,
  QrCode,
  Camera,
  FileSpreadsheet,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  LayoutDashboard,
  Search,
  LockKeyhole,
  Plus,
  Bell,
  BookOpen,
} from "lucide-react-native";
import {
  UIContext,
  palette,
  Txt,
  Button,
  Panel,
  Field,
  Pill,
  Note,
  Empty,
  Heading,
  useCopy,
  levelCopy,
  statusCopy,
} from "./src/ui";
import { api, post, setAuthToken, fileForm } from "./src/api";
import { storage } from "./src/storage";
import { Home, Checker, InputKind } from "./src/Check";
import { Result } from "./src/Result";
import { GraphCanvas } from "./src/GraphCanvas";
import { HistoryPage, ReportsPage } from "./src/Records";
import { AuthModal, SettingsPage } from "./src/Account";
import { LoginScreen } from "./src/LoginScreen";
import { BrandMark } from "./src/Brand";
import { MotionView, GradientSurface } from "./src/visual";
import { HelpPage, AlertsPage, WebappPanel } from "./src/Support";
import { useWebapp } from "./src/webapp";
import {
  finishOAuthRedirect,
  isOAuthCallback,
  hasOAuthRetry,
  retryOAuthExchange,
  clearOAuthState,
  authErrorMessage,
} from "./src/social";
import type { OAuthResult } from "./src/social";
import { useCallerEvidenceRefresh } from "./src/callerSync";
import { AdminPage } from "./src/Admin";
import type { User, Analysis, GraphData, Job } from "../shared/api";

type ResultSnapshot = Readonly<{
  text: string;
  kind: InputKind;
  analysisId: string;
  historyId: string | null;
}>;

const menus = [
  ["home", House, "หน้าหลัก", "Home"],
  ["check", ScanLine, "ตรวจสอบ", "Analyze"],
  ["history", Clock3, "ประวัติ", "History"],
  ["alerts", Bell, "แจ้งเตือน", "Alerts"],
  ["graph", Network, "เครือข่ายความสัมพันธ์", "Connections"],
  ["reports", Flag, "แจ้งเบาะแส", "Report a clue"],
  ["help", BookOpen, "ศูนย์ช่วยเหลือ", "Help center"],
  ["settings", Settings2, "โปรไฟล์", "Profile"],
] as const;
export default function App() {
  useCallerEvidenceRefresh();
  const [fontsLoaded] = useFonts({
    Thai: NotoSansThai_400Regular,
    ThaiMedium: NotoSansThai_500Medium,
    ThaiBold: NotoSansThai_700Bold,
  });
  const { width } = useWindowDimensions();
  const desktop = width >= 980;
  const webapp = useWebapp();
  const [dark, setDarkValue] = useState(false),
    [english, setEnglishValue] = useState(false),
    [page, setPage] = useState("home");
  const [text, setText] = useState(""),
    [kind, setKind] = useState<InputKind>("text"),
    [result, setResult] = useState<Analysis | null>(null),
    [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [authOpen, setAuthOpen] = useState(false),
    [health, setHealth] = useState<any>(null);
  const [guest, setGuest] = useState(false),
    [sessionReady, setSessionReady] = useState(false),
    [signInError, setSignInError] = useState(""),
    [oauthRetry, setOAuthRetry] = useState(false),
    [oauthRetryBusy, setOAuthRetryBusy] = useState(false);
  const [toast, setToast] = useState<{
      message: string;
      error: boolean;
    } | null>(null),
    [preview, setPreview] = useState<any>(null),
    [uploadBusy, setUploadBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false),
    [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const [batchJob, setBatchJob] = useState<Job | null>(null),
    [batchOpen, setBatchOpen] = useState(false),
    [reportText, setReportText] = useState(""),
    [reportKind, setReportKind] = useState<InputKind>("text");
  const currentBatchJob = useRef<Job | null>(null);
  const updateBatchJob = (next: Job | null) => {
    currentBatchJob.current = next;
    setBatchJob(next);
  };
  const [graph, setGraph] = useState<GraphData | null>(null),
    [graphError, setGraphError] = useState(""),
    [includeSample, setIncludeSample] = useState(true);
  const scroll = useRef<ScrollView>(null);
  const currentUser = useRef<User | null>(null);
  currentUser.current = user;
  const currentEnglish = useRef(english);
  currentEnglish.current = english;
  const initialized = useRef(false);
  const queuedOAuthUrl = useRef<string | null>(null);
  const handledOAuthUrls = useRef(new Set<string>());
  const privateGeneration = useRef(0);
  const analysisRevision = useRef(0);
  const resultSnapshot = useRef<ResultSnapshot | null>(null);
  const viewGeneration = privateGeneration.current;
  const tokenWrites = useRef<Promise<void>>(Promise.resolve());
  const persistToken = (action: () => Promise<void>) => {
    tokenWrites.current = tokenWrites.current.catch(() => {}).then(action);
    return tokenWrites.current;
  };
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const c = dark ? palette.dark : palette.light;
  const t = (th: string, en: string) => (english ? en : th);
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };
  const navigate = (next: string) => {
    setPage(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const invalidateAnalysis = () => {
    analysisRevision.current += 1;
    resultSnapshot.current = null;
    setResult(null);
    setBusy(false);
  };
  const editText = (value: string) => {
    invalidateAnalysis();
    setText(value);
  };
  const editKind = (value: InputKind) => {
    invalidateAnalysis();
    setKind(value);
  };
  const displayResult = (
    next: Analysis,
    input: string,
    type: InputKind,
    historyId: string | null = null,
  ) => {
    // The visible result always owns its input. Draft edits and older requests
    // cannot change the content used by Save, Share, Export or Report.
    analysisRevision.current += 1;
    resultSnapshot.current = { text: input, kind: type, analysisId: next.id, historyId };
    setText(input);
    setKind(type);
    setResult(next);
    setBusy(false);
  };
  const currentResultSnapshot = () => {
    const snapshot = resultSnapshot.current;
    return result && snapshot?.analysisId === result.id ? snapshot : null;
  };
  const setDark = (v: boolean) => {
    setDarkValue(v);
    storage.set("scamgraph-dark", String(v));
  };
  const setEnglish = (v: boolean) => {
    setEnglishValue(v);
    storage.set("scamgraph-en", String(v));
  };
  const checkHealth = async () => {
    try {
      setHealth(await api("/health"));
    } catch {
      setHealth(null);
    }
  };
  const applyOAuthResult = (response: OAuthResult | null) => {
    if (!response) return;
    if ("token" in response) authSuccess(response.token, response.user);
    else if (response.linked) {
      if (currentUser.current?.id === response.user.id) {
        currentUser.current = response.user;
        setUser(response.user);
        setSignInError("");
        navigate("settings");
        notify(currentEnglish.current ? "Account linked" : "เชื่อมบัญชีแล้ว");
      } else {
        setSignInError(
          currentEnglish.current
            ? "Account linked. Sign in again to open Settings."
            : "เชื่อมบัญชีแล้ว เข้าสู่ระบบอีกครั้งเพื่อเปิดหน้าตั้งค่า",
        );
      }
    }
  };
  const handleOAuthUrl = async (url: string | null) => {
    if (!isOAuthCallback(url) || !url || handledOAuthUrls.current.has(url))
      return;
    handledOAuthUrls.current.add(url);
    const generation = privateGeneration.current;
    try {
      const response = await finishOAuthRedirect(url);
      if (generation === privateGeneration.current) applyOAuthResult(response);
    } catch (e: any) {
      if (generation !== privateGeneration.current) return;
      const message = authErrorMessage(e.message, currentEnglish.current);
      setSignInError(message);
      if (currentUser.current) {
        navigate("settings");
        notify(message, true);
      }
    } finally {
      if (generation === privateGeneration.current)
        setOAuthRetry(await hasOAuthRetry().catch(() => false));
    }
  };
  const retryOAuth = async () => {
    if (oauthRetryBusy) return;
    const generation = privateGeneration.current;
    setOAuthRetryBusy(true);
    try {
      const response = await retryOAuthExchange();
      if (generation === privateGeneration.current) applyOAuthResult(response);
    } catch (e: any) {
      if (generation !== privateGeneration.current) return;
      const message = authErrorMessage(e.message, currentEnglish.current);
      setSignInError(message);
      if (currentUser.current) notify(message, true);
    } finally {
      if (generation === privateGeneration.current) {
        setOAuthRetryBusy(false);
        setOAuthRetry(await hasOAuthRetry().catch(() => false));
      }
    }
  };
  useEffect(() => {
    const handleLink = (url: string | null) => {
      if (url?.startsWith("scamgraph://caller")) navigate("settings");
      if (!isOAuthCallback(url)) return;
      if (!initialized.current) queuedOAuthUrl.current = url;
      else void handleOAuthUrl(url);
    };
    const subscription = Linking.addEventListener("url", (event) =>
      handleLink(event.url),
    );
    (async () => {
      try {
        const [token, d, e, initialUrl] = await Promise.all([
          storage.get("scamgraph-token"),
          storage.get("scamgraph-dark"),
          storage.get("scamgraph-en"),
          Platform.OS === "web"
            ? Promise.resolve(location.href)
            : Linking.getInitialURL(),
        ]);
        setDarkValue(d === null ? true : d === "true");
        setEnglishValue(e === "true");
        currentEnglish.current = e === "true";
        if (token) {
          setAuthToken(token);
          try {
            const restored = await api<User>("/auth/me", {}, 8000);
            currentUser.current = restored;
            setUser(restored);
          } catch (e: any) {
            setAuthToken(null);
            if (e.status === 401) await storage.remove("scamgraph-token");
            else setSignInError(e.message);
          }
        }
        if (initialUrl?.startsWith("scamgraph://caller")) navigate("settings");
        const callbackUrl = isOAuthCallback(initialUrl)
          ? initialUrl
          : queuedOAuthUrl.current;
        queuedOAuthUrl.current = null;
        await handleOAuthUrl(callbackUrl);
        setOAuthRetry(await hasOAuthRetry().catch(() => false));
      } catch (e: any) {
        setSignInError(e.message);
      } finally {
        initialized.current = true;
        setSessionReady(true);
        const queued = queuedOAuthUrl.current;
        queuedOAuthUrl.current = null;
        if (queued) void handleOAuthUrl(queued);
      }
    })();
    checkHealth();
    return () => {
      subscription.remove();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const authSuccess = (token: string, next: User) => {
    if (currentUser.current && currentUser.current.id !== next.id)
      resetPrivateViews();
    setAuthToken(token);
    currentUser.current = next;
    setUser(next);
    setGuest(false);
    setSignInError("");
    setOAuthRetry(false);
    persistToken(() => storage.set("scamgraph-token", token)).catch(() =>
      notify(
        t(
          "บันทึกเซสชันในอุปกรณ์ไม่ได้ เข้าสู่ระบบใหม่เมื่อเปิดแอพครั้งถัดไป",
          "Session could not be saved on this device. Sign in again next time.",
        ),
        true,
      ),
    );
  };
  const resetPrivateViews = () => {
    privateGeneration.current += 1;
    invalidateAnalysis();
    updateBatchJob(null);
    setText("");
    setReportText("");
    setReportKind("text");
    setKind("text");
    setPreview(null);
    setScannerOpen(false);
    scanLock.current = false;
    setAuthOpen(false);
    setBatchOpen(false);
    setUploadBusy(false);
    setGraph(null);
    setGraphError("");
    setOAuthRetry(false);
    setOAuthRetryBusy(false);
    setSignInError("");
    handledOAuthUrls.current.clear();
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    navigate("home");
  };
  const clearPrivateState = async () => {
    resetPrivateViews();
    setAuthToken(null);
    currentUser.current = null;
    setUser(null);
    setGuest(false);
    await Promise.all([
      persistToken(() => storage.remove("scamgraph-token")),
      clearOAuthState(),
    ]);
  };
  const logout = async () => {
    const revocation = post("/auth/logout", {}).catch(() => {});
    await clearPrivateState();
    const generation = privateGeneration.current;
    await revocation;
    if (generation === privateGeneration.current && !currentUser.current)
      notify(t("ออกจากระบบแล้ว", "Signed out"));
  };
  const analyze = async (input = text, type = kind) => {
    const generation = privateGeneration.current;
    if (!input.trim()) {
      notify(
        t("กรุณาใส่ข้อมูลที่ต้องการตรวจสอบ", "Enter content to analyze"),
        true,
      );
      return;
    }
    if (type === "url") {
      try {
        const u = new URL(input.trim());
        if (!["http:", "https:"].includes(u.protocol)) throw Error();
      } catch {
        notify(
          t(
            "กรอก URL แบบ http:// หรือ https:// ที่ถูกต้อง",
            "Enter a valid http:// or https:// URL",
          ),
          true,
        );
        return;
      }
    }
    if (type === "phone" && !/^\+?[\d\s()-]{7,20}$/.test(input.trim())) {
      notify(
        t("ตรวจสอบรูปแบบหมายเลขโทรศัพท์", "Check the phone number format"),
        true,
      );
      return;
    }
    if (type === "account" && !/^[\d\s-]{6,25}$/.test(input.trim())) {
      notify(
        t(
          "กรอกหมายเลขบัญชีหรือพร้อมเพย์ให้ถูกต้อง",
          "Enter a valid account or PromptPay number",
        ),
        true,
      );
      return;
    }
    invalidateAnalysis();
    const revision = analysisRevision.current;
    setText(input);
    setKind(type);
    setBusy(true);
    try {
      const data = await post<Analysis>("/analyze", {
        text: input.trim(),
        kind: type,
      });
      if (generation !== privateGeneration.current || revision !== analysisRevision.current) return;
      displayResult(data, input.trim(), type);
      navigate("check");
      notify(t("วิเคราะห์เสร็จแล้ว", "Analysis complete"));
    } catch (e: any) {
      if (generation === privateGeneration.current && revision === analysisRevision.current) notify(e.message, true);
    } finally {
      if (generation === privateGeneration.current && revision === analysisRevision.current) setBusy(false);
    }
  };
  const decodePayload = async (payload: string) => {
    const generation = privateGeneration.current;
    try {
      setUploadBusy(true);
      const decoded = await post("/qr/decode", { payload });
      if (generation !== privateGeneration.current) return;
      setPreview({ ...decoded, kind: "qr", text: decoded.payload || payload });
    } catch (e: any) {
      if (generation === privateGeneration.current) notify(e.message, true);
    } finally {
      if (generation === privateGeneration.current) setUploadBusy(false);
    }
  };
  const media = async (type: string) => {
    const generation = privateGeneration.current;
    if (type === "batch") {
      if (!user) {
        notify(
          t(
            "เข้าสู่ระบบเพื่อติดตามงานตรวจ CSV ของคุณ",
            "Sign in to follow your batch job",
          ),
        );
        setAuthOpen(true);
        return;
      }
      try {
        const picked = await DocumentPicker.getDocumentAsync({
          type: ["text/csv", "text/plain", "application/vnd.ms-excel"],
          copyToCacheDirectory: true,
        });
        if (picked.canceled || generation !== privateGeneration.current) return;
        setUploadBusy(true);
        const body = await fileForm(picked.assets[0]);
        if (generation !== privateGeneration.current) return;
        const job = await api<Job>("/batch", {
          method: "POST",
          body,
        });
        if (generation !== privateGeneration.current) return;
        updateBatchJob(job);
        setBatchOpen(true);
      } catch (e: any) {
        if (generation === privateGeneration.current) notify(e.message, true);
      } finally {
        if (generation === privateGeneration.current) setUploadBusy(false);
      }
      return;
    }
    try {
      if (type === "scan") {
        if (Platform.OS === "web") {
          notify(
            t(
              "เดโมเว็บอ่าน QR จากไฟล์ภาพ เลือกอัปโหลดภาพ QR",
              "The web demo reads QR images. Choose a QR file.",
            ),
          );
          return media("qr");
        }
        const p = await requestPermission();
        if (generation !== privateGeneration.current) return;
        if (!p.granted) {
          notify(
            t(
              "ไม่ได้รับสิทธิ์กล้อง คุณเลือกอัปโหลด QR แทนได้",
              "Camera permission denied. You can upload a QR image instead.",
            ),
            true,
          );
          return;
        }
        scanLock.current = false;
        setScannerOpen(true);
        return;
      }
      let picked: ImagePicker.ImagePickerResult;
      if (type === "camera") {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (generation !== privateGeneration.current) return;
        if (!p.granted) {
          notify(
            t(
              "ไม่ได้รับสิทธิ์กล้อง คุณอัปโหลดภาพแทนได้",
              "Camera permission denied. Upload an image instead.",
            ),
            true,
          );
          return;
        }
        picked = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.85,
        });
      } else {
        if (Platform.OS !== "web") {
          const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (generation !== privateGeneration.current) return;
          if (!p.granted) {
            notify(t("ไม่ได้รับสิทธิ์รูปภาพ", "Photo access denied"), true);
            return;
          }
        }
        picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 1,
        });
      }
      if (picked.canceled || generation !== privateGeneration.current) return;
      const asset = picked.assets[0];
      if (asset.fileSize && asset.fileSize > 8388608) {
        notify(
          t("ไฟล์ต้องมีขนาดไม่เกิน 8 MB", "Maximum file size is 8 MB"),
          true,
        );
        return;
      }
      setUploadBusy(true);
      const body = await fileForm({
        uri: asset.uri,
        name: asset.fileName || undefined,
        mimeType: asset.mimeType,
        file: asset.file,
      });
      if (generation !== privateGeneration.current) return;
      const response = await api(type === "qr" ? "/qr" : "/image", {
        method: "POST",
        body,
      });
      if (generation !== privateGeneration.current) return;
      setPreview({
        ...response,
        kind: type === "qr" ? "qr" : "ocr",
        image: asset.uri,
        text:
          type === "qr"
            ? response.payload || ""
            : response.extracted_text || "",
      });
    } catch (e: any) {
      if (generation === privateGeneration.current) notify(e.message, true);
    } finally {
      if (generation === privateGeneration.current) setUploadBusy(false);
    }
  };
  const confirmPreview = () => {
    const p = preview;
    if (!p.text.trim()) return;
    if (p.kind === "qr" && p.payment && !p.entities?.length) {
      notify(
        t(
          "ถอดรหัสได้ แต่ยังไม่มีแหล่งข้อมูลตรวจผู้รับการชำระเงินประเภทนี้",
          "Decoded successfully, but receiver lookup for this payment format is unavailable",
        ),
        true,
      );
      return;
    }
    setPreview(null);
    if (p.kind === "qr" && p.payment && p.entities?.length) {
      const entity = p.entities.find((e: any) =>
        ["account", "phone", "wallet"].includes(e.type),
      );
      if (entity) {
        analyze(
          entity.value,
          entity.type === "phone"
            ? "phone"
            : entity.type === "wallet"
              ? "wallet"
              : "account",
        );
        return;
      }
    }
    analyze(p.text, /^https?:\/\//i.test(p.text.trim()) ? "url" : "text");
  };
  useEffect(() => {
    if (
      !batchJob ||
      !["queued", "running", "pending"].includes(batchJob.status)
    )
      return;
    const generation = privateGeneration.current;
    const timer = setInterval(async () => {
      try {
        const updated = await api<Job>(`/jobs/${batchJob.id}`);
        if (generation === privateGeneration.current && currentBatchJob.current?.id === batchJob.id) updateBatchJob(updated);
      } catch (e: any) {
        if (generation === privateGeneration.current && currentBatchJob.current?.id === batchJob.id) notify(e.message, true);
        clearInterval(timer);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [batchJob?.id, batchJob?.status]);
  const save = async () => {
    const generation = privateGeneration.current;
    const snapshot = currentResultSnapshot();
    if (!snapshot) return;
    if (snapshot.historyId) {
      notify(t("ผลนี้บันทึกแล้ว", "This result is already saved"));
      return;
    }
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    try {
      const row = await post("/history", { text: snapshot.text, kind: snapshot.kind });
      if (generation !== privateGeneration.current || snapshot !== resultSnapshot.current) return;
      displayResult(row.result, snapshot.text, snapshot.kind, row.id);
      notify(
        t("บันทึกผลในประวัติส่วนตัวแล้ว", "Saved to your private history"),
      );
    } catch (e: any) {
      if (generation === privateGeneration.current && snapshot === resultSnapshot.current) notify(e.message, true);
    } finally {
      if (generation === privateGeneration.current && snapshot === resultSnapshot.current) setBusy(false);
    }
  };
  const exportObject = async (
    data: unknown,
    filename = "scamgraph-report.json",
    isCurrent: () => boolean = () => true,
  ) => {
    const generation = privateGeneration.current;
    const active = () => generation === privateGeneration.current && isCurrent();
    if (!active()) return;
    const contents = JSON.stringify(data, null, 2);
    if (Platform.OS === "web") {
      const url = URL.createObjectURL(
        new Blob([contents], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!active()) return;
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(contents);
      if (sharingAvailable)
        await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
      else await Clipboard.setStringAsync(contents);
    }
    if (active()) notify(t("ส่งออกข้อมูลแบบปกปิดแล้ว", "Masked data exported"));
  };
  const maskedReport = async (snapshot: ResultSnapshot) =>
    snapshot.historyId
      ? api(`/history/${snapshot.historyId}/share`)
      : post("/export", { text: snapshot.text, kind: snapshot.kind });
  const exportReport = async () => {
    const snapshot = currentResultSnapshot();
    if (!snapshot) return;
    const generation = privateGeneration.current;
    try {
      const data = await maskedReport(snapshot);
      if (generation !== privateGeneration.current || snapshot !== resultSnapshot.current) return;
      await exportObject(data, "scamgraph-report.json", () => snapshot === resultSnapshot.current);
    } catch (e: any) {
      if (generation === privateGeneration.current && snapshot === resultSnapshot.current) notify(e.message, true);
    }
  };
  const shareReport = async () => {
    const snapshot = currentResultSnapshot();
    if (!snapshot) return;
    const generation = privateGeneration.current;
    try {
      const data = await maskedReport(snapshot);
      if (generation !== privateGeneration.current || snapshot !== resultSnapshot.current) return;
      const r = data.result;
      const message = `ScamGraph AI\n${t("คะแนนความเสี่ยง", "Risk score")}: ${r.score ?? "—"}/100 · ${r.level}\n${r.summary}\n${(r.entities || []).map((e: any) => `${e.type}: ${e.value}`).join("\n")}\n${t("ปกปิดข้อมูลส่วนบุคคล • ไม่ใช่คำตัดสินว่ามีการโกง", "Personal identifiers masked · Not a fraud verdict")}`;
      if (Platform.OS === "web") {
        if (navigator.share)
          await navigator.share({ title: "ScamGraph AI", text: message });
        else {
          await Clipboard.setStringAsync(message);
          notify(t("คัดลอกรายงานแบบปกปิดแล้ว", "Masked report copied"));
        }
      } else await Share.share({ message, title: "ScamGraph AI" });
    } catch (e: any) {
      if (e.name !== "AbortError" && generation === privateGeneration.current && snapshot === resultSnapshot.current) notify(e.message, true);
    }
  };
  const feedback = async (correct: boolean) => {
    const snapshot = currentResultSnapshot();
    if (!snapshot) return;
    const generation = privateGeneration.current;
    try {
      await post("/feedback", {
        analysis_id: snapshot.analysisId,
        verdict: correct ? "correct" : "incorrect",
      });
      if (generation !== privateGeneration.current || snapshot !== resultSnapshot.current) return;
      notify(
        t(
          "รับ feedback แล้ว จะตรวจสอบก่อนใช้ข้อมูล",
          "Feedback received for review",
        ),
      );
    } catch (e: any) {
      if (generation === privateGeneration.current && snapshot === resultSnapshot.current) notify(e.message, true);
    }
  };
  const loadGraph = async () => {
    setGraphError("");
    try {
      setGraph(await api<GraphData>(`/graph?include_sample=${includeSample}`));
    } catch (e: any) {
      setGraphError(e.message);
    }
  };
  useEffect(() => {
    if (page === "graph") loadGraph();
  }, [page, includeSample]);
  const checker = {
    text,
    setText: editText,
    kind,
    setKind: editKind,
    busy,
    analyze: () => analyze(),
    media,
  };
  const pageTitle =
    page === "admin"
      ? t("ผู้ดูแลระบบ", "Administration")
      : menus.find((m) => m[0] === page)?.[english ? 3 : 2] || "ScamGraph AI";
  if (!fontsLoaded || !sessionReady)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.bg,
        }}
      >
        <ActivityIndicator color={c.teal} />
        <View style={{ marginTop: 14 }}>
          <BrandMark size={35} />
        </View>
      </View>
    );
  const navItem = (
    m: readonly [string, any, string, string],
    mobile = false,
  ) => {
    const [key, Icon, th, en] = m;
    const selected = page === key;
    const color = mobile ? selected ? c.teal : c.muted : selected ? "#c6b7ff" : "#b6c3db";
    const scanner = mobile && key === "check";
    return (
      <Pressable key={key} onPress={() => navigate(key)} accessibilityRole="button"
        accessibilityLabel={t(th, en)} accessibilityState={{ selected }}
        style={({ pressed }) => ({ flexDirection: mobile ? "column" : "row", alignItems: "center", justifyContent: mobile ? "center" : "flex-start", gap: mobile ? 3 : 12, flex: mobile ? 1 : undefined, paddingHorizontal: mobile ? 3 : 16, paddingVertical: mobile ? 8 : 12, borderRadius: 14, backgroundColor: selected && !scanner ? mobile ? c.soft : "#252a4f" : "transparent", opacity: pressed ? 0.72 : 1, minHeight: mobile ? 61 : 46 })}>
        {scanner ? <GradientSurface radius={19} style={{ width: 48, height: 48, marginTop: -25, alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(80,64,210,.27)" }}><View style={{ zIndex: 1 }}><Icon size={24} color="#fff" /></View></GradientSurface> : <Icon size={mobile ? 21 : 18} color={color} strokeWidth={selected ? 2.1 : 1.8} />}
        <Txt size={mobile ? 9 : 12} bold={selected} style={{ color }}>{scanner ? t("สแกน", "Scan") : t(th, en)}</Txt>
      </Pressable>
    );
  };
  const oauthRetryPanel = oauthRetry ? (
    <Panel style={{ gap: 10, margin: 14 }}>
      <Txt size={12}>
        {t(
          "การเชื่อมต่อขัดข้อง ลองยืนยันคำขอเดิมอีกครั้งได้ในช่วงสั้น ๆ หากหมดอายุให้เริ่มเข้าสู่ระบบใหม่",
          "The connection failed. Retry the same short-lived sign-in request, or start again if it has expired.",
        )}
      </Txt>
      <Button
        small
        loading={oauthRetryBusy}
        disabled={oauthRetryBusy}
        onPress={retryOAuth}
        icon={RefreshCw}
      >
        {t("ลองยืนยันอีกครั้ง", "Retry sign-in")}
      </Button>
    </Panel>
  ) : null;
  if (!user && !guest)
    return (
      <SafeAreaProvider>
        <UIContext.Provider value={{ dark, english, c }}>
          <StatusBar style={dark ? "light" : "dark"} />
          <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
            {!!signInError && (
              <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
                <Note>{signInError}</Note>
              </View>
            )}
            {oauthRetryPanel}
            <LoginScreen
              onSuccess={authSuccess}
              onGuest={() => {
                setGuest(true);
                navigate("home");
              }}
              initialError=""
            />
          </SafeAreaView>
        </UIContext.Provider>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <UIContext.Provider value={{ dark, english, c }}>
        <StatusBar style={dark ? "light" : "dark"} />
        <SafeAreaView
          style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}
        >
          {desktop && (
            <View
              style={{
                width: 218,
                backgroundColor: "#111d38",
                borderRightWidth: 1,
                borderColor: c.line,
                padding: 19,
              }}
            >
              <Pressable
                onPress={() => navigate("home")}
                style={{
                  flexDirection: "row",
                  gap: 10,
                  alignItems: "center",
                  paddingHorizontal: 4,
                  paddingTop: 8,
                  paddingBottom: 28,
                }}
              >
                <View
                  style={{
                    padding: 8,
                    borderRadius: 12,
                    backgroundColor: c.soft,
                  }}
                >
                  <BrandMark size={30} />
                </View>
                <View>
                  <Txt bold size={18} style={{ lineHeight: 24, color: "#fff" }}>
                    ScamGraph{" "}
                    <Txt bold size={18} style={{ color: "#b9a5ff" }}>
                      AI
                    </Txt>
                  </Txt>
                  <Txt size={7} muted style={{ letterSpacing: 0.8, color: "#a9b9d9" }}>
                    SEE THE CONNECTIONS
                  </Txt>
                </View>
              </Pressable>
              <Txt
                muted
                size={9}
                style={{
                  letterSpacing: 1.2,
                  color: "#91a4c8",
                  paddingLeft: 17,
                  marginBottom: 12,
                }}
              >
                {t("พื้นที่ของคุณ", "YOUR WORKSPACE")}
              </Txt>
              <View style={{ gap: 6 }}>
                {menus.map((m) => navItem(m))}
                {user?.role === "admin" &&
                  navItem([
                    "admin",
                    LayoutDashboard,
                    "ผู้ดูแลระบบ",
                    "Administration",
                  ])}
              </View>
              <View style={{ flex: 1 }} />
              <View
                style={{
                  padding: 15,
                  borderRadius: 12,
                  gap: 8,
                  marginBottom: 22,
                  backgroundColor: "#1d2b48",
                }}
              >
                <ShieldCheck size={21} color="#a9c4ff" />
                <Txt bold size={12} style={{ color: "#e5edff" }}>
                  {t("เชื่ออย่างมีข้อมูล", "Make informed decisions")}
                </Txt>
                <Txt muted size={10} style={{ color: "#adc0e0" }}>
                  {t(
                    "อ่านเหตุผลและข้อมูลที่ขาด ก่อนตัดสินใจทุกครั้ง",
                    "Review evidence and missing data before acting.",
                  )}
                </Txt>
              </View>
              <Pressable
                onPress={() =>
                  user ? navigate("settings") : setAuthOpen(true)
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingTop: 16,
                  borderTopWidth: 1,
                  borderColor: c.line,
                }}
              >
                <View
                  style={{
                    backgroundColor: c.bg,
                    borderRadius: 30,
                    padding: 10,
                  }}
                >
                  <UserRound size={17} color={c.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt bold size={12} style={{ color: "#e5edff" }}>
                    {user?.name || t("ผู้เยี่ยมชม", "Guest")}
                  </Txt>
                  <Txt muted size={10} style={{ color: "#adc0e0" }}>
                    {user
                      ? t("จัดการบัญชี", "Manage account")
                      : t(
                          "เข้าสู่ระบบเพื่อบันทึกผล",
                          "Sign in to save results",
                        )}
                  </Txt>
                </View>
                <ChevronRight size={14} color={c.muted} />
              </Pressable>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View
              style={{
                height: desktop ? 72 : 64,
                backgroundColor: c.card,
                borderBottomWidth: 1,
                borderColor: c.line,
                paddingHorizontal: desktop ? 32 : 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                {!desktop && <BrandMark size={30} />}
                <Txt bold size={desktop ? 13 : width < 360 ? 14 : 17}>
                  {desktop ? pageTitle : "ScamGraph AI"}
                </Txt>
                {desktop && (
                  <Txt muted size={10}>
                    /{" "}
                    {t(
                      "ตรวจให้เข้าใจ ก่อนตัดสินใจ",
                      "Understand before you act",
                    )}
                  </Txt>
                )}
              </View>
              <View
                style={{ flexDirection: "row", gap: desktop ? 16 : 2, alignItems: "center" }}
              >
                {width >= 720 && (
                  <Pill>
                    {t("เดโม • ข้อมูลตัวอย่าง", "Demo · sample data")}
                  </Pill>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel={t("เปิดแจ้งเตือน", "Open alerts")} onPress={() => navigate("alerts")} style={{ width: 32, height: 36, alignItems: "center", justifyContent: "center" }}><Bell size={18} color={c.muted} /></Pressable>
                {width >= 360 && <Pressable
                  accessibilityRole="button"
                  style={{ width: 32, height: 36, alignItems: "center", justifyContent: "center" }}
                  accessibilityLabel={t("สลับภาษา", "Switch language")}
                  onPress={() => setEnglish(!english)}
                >
                  <Txt bold muted size={11}>
                    {english ? "TH" : "EN"}
                  </Txt>
                </Pressable>}
                <Pressable
                  accessibilityRole="button"
                  style={{ width: 32, height: 36, alignItems: "center", justifyContent: "center" }}
                  accessibilityLabel={t("สลับโหมดมืด", "Toggle dark mode")}
                  onPress={() => setDark(!dark)}
                >
                  {dark ? (
                    <Sun size={18} color={c.muted} />
                  ) : (
                    <Moon size={18} color={c.muted} />
                  )}
                </Pressable>
                {!desktop && (
                  <Pressable
                    accessibilityRole="button"
                    style={{ width: 32, height: 36, alignItems: "center", justifyContent: "center" }}
                    accessibilityLabel={t("บัญชี", "Account")}
                    onPress={() =>
                      user ? navigate("settings") : setAuthOpen(true)
                    }
                  >
                    <UserRound size={19} color={c.muted} />
                  </Pressable>
                )}
              </View>
            </View>
            <ScrollView
              ref={scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                padding: desktop ? 30 : 18,
                paddingBottom: desktop ? 35 : 20,
                maxWidth: 1260,
                width: "100%",
                alignSelf: "center",
              }}
              keyboardShouldPersistTaps="handled"
            >
              {webapp.isWeb && !webapp.online && <View style={{ marginBottom: 16 }}><Note>{t("ออฟไลน์ — เชื่อมต่ออินเทอร์เน็ตเพื่อตรวจสอบและโหลดข้อมูลส่วนตัว", "Offline — connect to analyze content and load private data")}</Note></View>}
              {oauthRetryPanel}
              <MotionView key={page}>
              {page === "home" && (
                <Home
                  checker={checker}
                  health={health}
                  user={user}
                  onExample={(input, type) => {
                    invalidateAnalysis();
                    setText(input);
                    setKind(type);
                    navigate("check");
                  }}
                  onGo={navigate}
                />
              )}
              {page === "check" &&
                (result ? (
                  <Result
                    result={result}
                    busy={busy}
                    onBack={() => {
                      invalidateAnalysis();
                      setText("");
                    }}
                    onSave={save}
                    onShare={shareReport}
                    onExport={exportReport}
                    onReport={() => {
                      const snapshot = currentResultSnapshot();
                      if (!snapshot) return;
                      setReportText(snapshot.text);
                      setReportKind(snapshot.kind);
                      navigate("reports");
                    }}
                    onFeedback={feedback}
                  />
                ) : (
                  <View style={{ gap: 20 }}>
                    <Heading
                      title={t("ตรวจสอบความเสี่ยง", "Analyze risk")}
                      subtitle={t(
                        "วางข้อมูล หรือเลือกภาพที่คุณต้องการตรวจสอบ",
                        "Paste content, or select an image to inspect.",
                      )}
                    />
                    <Checker {...checker} />
                    <Panel style={{ gap: 13 }}>
                      <Txt bold size={15}>
                        {t(
                          "ตรวจภาพและ QR แบบตรวจทานก่อน",
                          "Review images and QR before analysis",
                        )}
                      </Txt>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <Button
                          small
                          secondary
                          icon={Camera}
                          onPress={() => media("camera")}
                        >
                          {t("ถ่ายภาพ", "Take photo")}
                        </Button>
                        <Button
                          small
                          secondary
                          icon={QrCode}
                          onPress={() => media("scan")}
                        >
                          {t("สแกน QR ด้วยกล้อง", "Scan QR with camera")}
                        </Button>
                        <Button
                          small
                          secondary
                          icon={ImagePlus}
                          onPress={() => media("qr")}
                        >
                          {t("อัปโหลดรูป QR", "Upload QR image")}
                        </Button>
                      </View>
                      <Note>
                        {t(
                          "QR จะถูกถอดรหัสเพื่อแสดงข้อมูลก่อน ไม่มีการเปิดลิงก์หรือชำระเงินอัตโนมัติ",
                          "Decoded QR content is shown first. Links and payment actions are never opened automatically.",
                        )}
                      </Note>
                    </Panel>
                  </View>
                ))}
              {page === "history" && (
                <HistoryPage
                  user={user}
                  onLogin={() => setAuthOpen(true)}
                  notify={notify}
                  onOpen={(r, input, type, id) => {
                    if (
                      viewGeneration !== privateGeneration.current ||
                      !user ||
                      currentUser.current?.id !== user.id
                    )
                      return;
                    displayResult(r, input, type as InputKind, id);
                    navigate("check");
                  }}
                />
              )}
              {page === "reports" && (
                <ReportsPage
                  user={user}
                  onLogin={() => setAuthOpen(true)}
                  notify={notify}
                  initialText={reportText}
                  initialKind={reportKind}
                />
              )}
              {page === "help" && <HelpPage onGo={navigate} />}
              {page === "alerts" && <AlertsPage user={user} onLogin={() => setAuthOpen(true)} onGo={navigate} onOpen={(r, input, type, id) => { if (viewGeneration !== privateGeneration.current || !user || currentUser.current?.id !== user.id) return; displayResult(r, input, type as InputKind, id); navigate("check"); }} />}
              {page === "settings" && (
                <View>
                <WebappPanel state={webapp} install={webapp.install} applyUpdate={webapp.applyUpdate} />
                <SettingsPage
                  user={user}
                  onLogin={() => setAuthOpen(true)}
                  onLogout={logout}
                  onUserUpdate={(next) => {
                    if (
                      viewGeneration !== privateGeneration.current ||
                      currentUser.current?.id !== next.id
                    )
                      return;
                    currentUser.current = next;
                    setUser(next);
                  }}
                  setDark={setDark}
                  setEnglish={setEnglish}
                  notify={notify}
                  onExport={async () => {
                    try {
                      const data = await api("/auth/export");
                      if (viewGeneration !== privateGeneration.current) return;
                      await exportObject(data, "scamgraph-my-data.json", () => viewGeneration === privateGeneration.current);
                    } catch (e: any) {
                      if (viewGeneration === privateGeneration.current) notify(e.message, true);
                    }
                  }}
                  onDelete={async () => {
                    const generation = privateGeneration.current;
                    try {
                      await api("/auth/me", { method: "DELETE" });
                      if (generation !== privateGeneration.current) return;
                      await clearPrivateState();
                      notify(
                        t(
                          "ลบบัญชีและข้อมูลส่วนตัวแล้ว",
                          "Account and private data deleted",
                        ),
                      );
                    } catch (e: any) {
                      notify(e.message, true);
                    }
                  }}
                />
                </View>
              )}
              {page === "admin" && <AdminPage user={user} notify={notify} />}
              {page === "graph" && (
                <View style={{ gap: 20 }}>
                  <Heading
                    title={t("เครือข่ายความสัมพันธ์", "Evidence connections")}
                    subtitle={t(
                      "สำรวจว่าเบาะแสเชื่อมกันจากหลักฐานใด",
                      "Explore the evidence behind each connection.",
                    )}
                    action={
                      <Button
                        small
                        secondary
                        icon={RefreshCw}
                        onPress={loadGraph}
                      >
                        {t("รีเฟรช", "Refresh")}
                      </Button>
                    }
                  />
                  <View style={{ flexDirection: "row", gap: 9 }}>
                    <Button
                      small
                      secondary
                      onPress={() => setIncludeSample(!includeSample)}
                    >
                      {includeSample
                        ? t("ซ่อนข้อมูลตัวอย่าง", "Hide sample data")
                        : t("แสดงกราฟตัวอย่าง", "Show sample graph")}
                    </Button>
                    {includeSample && (
                      <Pill>
                        {t(
                          "มีข้อมูลตัวอย่างสำหรับเดโม",
                          "Includes demo sample data",
                        )}
                      </Pill>
                    )}
                  </View>
                  {graphError ? (
                    <Panel>
                      <Empty
                        title={t(
                          "โหลดเครือข่ายไม่สำเร็จ",
                          "Could not load graph",
                        )}
                        detail={graphError}
                        action={
                          <Button onPress={loadGraph}>
                            {t("ลองอีกครั้ง", "Retry")}
                          </Button>
                        }
                      />
                    </Panel>
                  ) : graph ? (
                    <Panel style={{ gap: 18 }}>
                      <GraphCanvas data={graph} dark={dark} english={english} />
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 25,
                          flexWrap: "wrap",
                        }}
                      >
                        {Object.entries(graph.features || {})
                          .filter(([key]) => key !== "risk_used")
                          .map(([key, value]) => (
                            <View key={key}>
                              <Txt muted size={10}>
                                {(
                                  {
                                    connection_count: t(
                                      "จำนวนความสัมพันธ์",
                                      "Connections",
                                    ),
                                    reported_neighbors: t(
                                      "รายการใกล้เคียงที่มีรายงาน",
                                      "Reported neighbors",
                                    ),
                                    cluster_size: t(
                                      "ขนาดกลุ่มที่เชื่อมกัน",
                                      "Connected cluster size",
                                    ),
                                  } as Record<string, string>
                                )[key] || key}
                              </Txt>
                              <Txt bold size={18}>
                                {String(value)}
                              </Txt>
                            </View>
                          ))}
                      </View>
                    </Panel>
                  ) : (
                    <Panel>
                      <ActivityIndicator color={c.teal} />
                    </Panel>
                  )}
                  <Note>
                    {t(
                      "ความสัมพันธ์มีที่มาและเวลา ไม่ได้หมายความว่า entity ที่เชื่อมกันทั้งหมดมีความผิด ข้อมูลตัวอย่างไม่ใช้เพิ่มคะแนนความเสี่ยง",
                      "Connections have provenance and timestamps. A linked entity is not automatically fraudulent. Sample data does not increase risk scores.",
                    )}
                  </Note>
                </View>
              )}
              </MotionView>
              <View
                style={{
                  marginTop: 30,
                  paddingTop: 18,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 15,
                  flexWrap: "wrap",
                }}
              >
                <Txt muted size={9}>
                  ScamGraph AI · Predict Before It Gets Reported
                </Txt>
                <Txt muted size={9}>
                  {t(
                    "ไม่พบประวัติ ไม่ได้แปลว่าปลอดภัย",
                    "No history does not mean safe",
                  )}
                </Txt>
              </View>
            </ScrollView>
            {!desktop && (
              <View
                style={{
                  backgroundColor: c.card,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  paddingVertical: 4,
                  boxShadow: "0 -4px 24px rgba(40,65,110,.05)",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 9 }}>
                  {["home", "history", "check", "alerts", "settings"].map(key => navItem(menus.find(m => m[0] === key)!, true))}
                </View>
              </View>
            )}
          </View>
          {toast && (
            <Pressable
              onPress={() => setToast(null)}
              style={{
                position: "absolute",
                bottom: desktop ? 25 : 96,
                right: 20,
                left: desktop ? undefined : 20,
                maxWidth: desktop ? 520 : undefined,
                backgroundColor: toast.error ? "#963b47" : "#303e76",
                borderRadius: 12,
                padding: 17,
                flexDirection: "row",
                gap: 10,
                alignItems: "center",
                shadowColor: "#000",
                shadowOpacity: 0.1,
                shadowRadius: 15,
                elevation: 5,
              }}
            >
              {toast.error ? (
                <AlertCircle size={18} color="#fff" />
              ) : (
                <CheckCircle2 size={18} color="#94dfc4" />
              )}
              <Txt size={12} style={{ color: "#fff", flex: 1 }}>
                {toast.message}
              </Txt>
              <X size={15} color="#ffffff88" />
            </Pressable>
          )}
          <AuthModal
            visible={authOpen}
            onClose={() => setAuthOpen(false)}
            onSuccess={authSuccess}
            notify={notify}
          />
          <Modal transparent visible={uploadBusy} animationType="fade">
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#071d35aa",
              }}
            >
              <Panel style={{ gap: 17, alignItems: "center", padding: 35 }}>
                <ActivityIndicator color={c.teal} />
                <Txt>
                  {t("กำลังอ่านข้อความ / ถอดรหัส…", "Reading text / decoding…")}
                </Txt>
              </Panel>
            </View>
          </Modal>
          <Modal
            transparent
            visible={!!preview}
            animationType="fade"
            onRequestClose={() => setPreview(null)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "#071d35aa",
                padding: 20,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Panel
                style={{
                  width: "100%",
                  maxWidth: 660,
                  maxHeight: "90%",
                  padding: 23,
                }}
              >
                <ScrollView keyboardShouldPersistTaps="handled">
                  <View style={{ gap: 16 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Txt bold size={20}>
                        {preview?.kind === "qr"
                          ? t("ตรวจข้อมูลใน QR ก่อน", "Review QR content")
                          : t("ตรวจทานข้อความจากภาพ", "Review extracted text")}
                      </Txt>
                      <Pressable onPress={() => setPreview(null)}>
                        <X size={20} color={c.muted} />
                      </Pressable>
                    </View>
                    {preview?.image && (
                      <Image
                        source={{ uri: preview.image }}
                        style={{ height: 150, width: "100%", borderRadius: 10 }}
                        resizeMode="contain"
                      />
                    )}
                    <Pill kind="muted">
                      {statusCopy(preview?.status || "", english)}
                    </Pill>
                    <Txt muted size={12}>
                      {preview?.message}
                    </Txt>
                    <Field
                      multiline
                      value={preview?.text || ""}
                      onChangeText={(v) =>
                        setPreview((p: any) => ({
                          ...p,
                          text: v,
                          payment: null,
                        }))
                      }
                      label={
                        preview?.kind === "qr"
                          ? t("Payload (แก้ไขได้)", "Payload (editable)")
                          : t(
                              "ข้อความ OCR (แก้ไขก่อนวิเคราะห์ได้)",
                              "OCR text (editable)",
                            )
                      }
                    />
                    {preview?.payment && (
                      <>
                        <PaymentDetails
                          payment={preview.payment}
                          english={english}
                        />
                        <Note>
                          {t(
                            "ข้อมูลการชำระเงินที่ถูกต้องตามรูปแบบไม่ได้ยืนยันว่าผู้รับเชื่อถือได้",
                            "Valid payment format does not establish recipient trust.",
                          )}
                        </Note>
                      </>
                    )}
                    <Note>
                      {t(
                        "ตรวจเฉพาะข้อมูลที่แสดง ไม่เปิดลิงก์หรือทำธุรกรรม",
                        "Only the displayed content is analyzed. No link or transaction is opened.",
                      )}
                    </Note>
                    <Button
                      icon={Search}
                      disabled={
                        !preview?.text?.trim() ||
                        (preview?.kind === "qr" &&
                          preview?.status === "invalid")
                      }
                      onPress={confirmPreview}
                    >
                      {t("ยืนยันข้อมูลและวิเคราะห์", "Confirm and analyze")}
                    </Button>
                  </View>
                </ScrollView>
              </Panel>
            </View>
          </Modal>
          <Modal
            visible={scannerOpen}
            onRequestClose={() => setScannerOpen(false)}
          >
            <View style={{ flex: 1, backgroundColor: "#0d1e2b" }}>
              <View
                style={{
                  padding: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Txt bold size={20} style={{ color: "#fff" }}>
                  {t("สแกน QR Code", "Scan a QR code")}
                </Txt>
                <Pressable onPress={() => setScannerOpen(false)}>
                  <X size={24} color="#fff" />
                </Pressable>
              </View>
              {permission?.granted && (
                <CameraView
                  style={{ flex: 1 }}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => {
                    if (scanLock.current) return;
                    scanLock.current = true;
                    setScannerOpen(false);
                    decodePayload(data);
                  }}
                />
              )}
              <View style={{ padding: 25 }}>
                <Txt style={{ color: "#fff" }}>
                  {t(
                    "วาง QR ในกรอบเพื่ออ่านข้อมูลก่อนดำเนินการ",
                    "Place the QR code in view to review its payload.",
                  )}
                </Txt>
              </View>
            </View>
          </Modal>
          <Modal
            transparent
            visible={batchOpen}
            onRequestClose={() => setBatchOpen(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "#071d35aa",
                padding: 20,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Panel style={{ width: "100%", maxWidth: 760, maxHeight: "85%" }}>
                <ScrollView>
                  <View style={{ gap: 16 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Txt bold size={20}>
                        {t("ตรวจหลายรายการจาก CSV", "Batch CSV analysis")}
                      </Txt>
                      <Pressable onPress={() => setBatchOpen(false)}>
                        <X size={20} color={c.muted} />
                      </Pressable>
                    </View>
                    <Pill kind="muted">
                      {statusCopy(batchJob?.status || "", english)} ·{" "}
                      {batchJob?.progress ?? 0}%
                    </Pill>
                    {["queued", "running"].includes(batchJob?.status || "") && (
                      <ActivityIndicator color={c.teal} />
                    )}
                    <Txt muted size={11}>
                      {batchJob?.id}
                    </Txt>
                    {batchJob?.error && <Note>{batchJob.error}</Note>}
                    {!!batchJob?.result && (
                      <>
                        <Button
                          small
                          secondary
                          icon={Download}
                          onPress={async () => {
                            const generation = privateGeneration.current;
                            const jobId = batchJob?.id;
                            const active = () => generation === privateGeneration.current && currentBatchJob.current?.id === jobId;
                            if (!jobId || !active()) return;
                            try {
                              const data = await api(`/jobs/${jobId}/export`);
                              if (!active()) return;
                              await exportObject(
                                data,
                                "scamgraph-batch.json",
                                active,
                              );
                            } catch (e: any) {
                              if (active()) notify(e.message, true);
                            }
                          }}
                        >
                          {t("ส่งออกผลแบบปกปิด", "Export masked results")}
                        </Button>
                        <View style={{ gap: 10 }}>
                          {((batchJob.result as any)?.items || []).map(
                            (row: any) => (
                              <Panel
                                key={row.row}
                                style={{ padding: 15, gap: 8 }}
                              >
                                <View
                                  style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  <Txt bold size={13}>
                                    {t("รายการ", "Row")} {row.row}
                                  </Txt>
                                  <Pill kind={row.result.level}>
                                    {levelCopy(row.result.level, english)} ·{" "}
                                    {row.result.score ?? "—"}/100
                                  </Pill>
                                </View>
                                <Txt size={12}>{row.result.summary}</Txt>
                                <Button
                                  small
                                  secondary
                                  onPress={() => {
                                    displayResult(row.result, row.text || "", row.kind || "text");
                                    setBatchOpen(false);
                                    navigate("check");
                                  }}
                                >
                                  {t("ดูหลักฐาน", "View evidence")}
                                </Button>
                              </Panel>
                            ),
                          )}
                        </View>
                      </>
                    )}
                  </View>
                </ScrollView>
              </Panel>
            </View>
          </Modal>
        </SafeAreaView>
      </UIContext.Provider>
    </SafeAreaProvider>
  );
}

function PaymentDetails({
  payment,
  english,
}: {
  payment: any;
  english: boolean;
}) {
  const labels: Record<string, [string, string]> = {
    amount: ["จำนวนเงิน", "Amount"],
    currency: ["รหัสสกุลเงิน", "Currency code"],
    country: ["ประเทศ", "Country"],
    merchant_name: ["ชื่อผู้รับตาม QR", "Merchant name"],
    biller_id: ["รหัสผู้รับ Bill Payment", "Bill-payment biller ID"],
    reference_1: [
      "เลขอ้างอิง 1 (ไม่ใช่เลขบัญชี)",
      "Reference 1 (not an account)",
    ],
    reference_2: [
      "เลขอ้างอิง 2 (ไม่ใช่เลขบัญชี)",
      "Reference 2 (not an account)",
    ],
  };
  return (
    <View style={{ gap: 7 }}>
      <Pill kind="muted">
        {payment.crc_valid
          ? english
            ? "Structure and checksum valid"
            : "รูปแบบและ checksum ถูกต้อง"
          : english
            ? "Checksum invalid"
            : "checksum ไม่ผ่าน"}
      </Pill>
      {Object.entries(labels)
        .filter(([key]) => payment[key])
        .map(([key, label]) => (
          <View
            key={key}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            <Txt muted size={11}>
              {label[english ? 1 : 0]}
            </Txt>
            <Txt size={12} selectable>
              {String(payment[key])}
            </Txt>
          </View>
        ))}
      {payment.supported_receiver === false && (
        <Note>
          {english
            ? "This payment receiver type cannot be looked up yet. The references are not bank account numbers."
            : "ยังไม่รองรับการตรวจผู้รับประเภทนี้ เลขอ้างอิงการชำระเงินไม่ใช่เลขบัญชี"}
        </Note>
      )}
    </View>
  );
}
