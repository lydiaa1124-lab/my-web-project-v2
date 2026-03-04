import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  getDoc,
} from "firebase/firestore";
import {
  Settings,
  Gift,
  Users,
  RotateCcw,
  Play,
  CheckCircle2,
  Lock,
} from "lucide-react";

// 你的專屬 Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyD22KFwTyoab7ZueQZUJKig0mk7SY4XhTM",
  authDomain: "ibm-lottery.firebaseapp.com",
  projectId: "ibm-lottery",
  storageBucket: "ibm-lottery.firebasestorage.app",
  messagingSenderId: "112431414314",
  appId: "1:112431414314:web:5de6d233e65d2218b61753",
  measurementId: "G-BV5CNCMJDS",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "ibm-spring-lottery";

const LOTTERY_COLLECTION = "lottery_data";
const MAIN_DOC_ID = "current_state";

export default function SpringLotteryApp() {
  const [user, setUser] = useState(null);
  const [lotteryState, setLotteryState] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  // 幫你把預設人數先設定為 81 人
  const [maxParticipants, setMaxParticipants] = useState(81);
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
    onConfirm: null,
  });

  const [isAnimating, setIsAnimating] = useState(false);
  const [displayNumbers, setDisplayNumbers] = useState([]);
  const [lastDrawTime, setLastDrawTime] = useState(0);

  // 1. 登入與連線驗證 (Firebase Auth)
  useEffect(() => {
    if (!auth) return;

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. 即時資料同步 (Firestore即時監聽)
  useEffect(() => {
    if (!user || !db) return;

    const docRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      LOTTERY_COLLECTION,
      MAIN_DOC_ID
    );

    const initDoc = async () => {
      try {
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          await setDoc(docRef, {
            history: [],
            currentWinners: [],
            maxParticipants: 81,
            drawTimestamp: 0,
            drawCount: 1,
          });
        }
      } catch (err) {
        console.error("Init Doc Error:", err);
      }
    };
    initDoc();

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setLotteryState(data);
          setMaxParticipants(data.maxParticipants || 81);
        }
      },
      (error) => {
        console.error("Snapshot Error:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 3. 抽獎跳號動畫邏輯
  useEffect(() => {
    if (!lotteryState) return;

    if (lotteryState.drawTimestamp > lastDrawTime) {
      setLastDrawTime(lotteryState.drawTimestamp);
      setIsAnimating(true);

      const count = lotteryState.currentWinners.length;
      let duration = 3000;
      let intervalSpeed = 80;

      const interval = setInterval(() => {
        const randomNums = Array.from(
          { length: count },
          () => Math.floor(Math.random() * lotteryState.maxParticipants) + 1
        );
        setDisplayNumbers(randomNums);
      }, intervalSpeed);

      setTimeout(() => {
        clearInterval(interval);
        setDisplayNumbers(lotteryState.currentWinners);
        setIsAnimating(false);
      }, duration);
    } else if (!isAnimating) {
      if (lotteryState.history.length === 0) {
        setDisplayNumbers([]);
      } else if (lotteryState.currentWinners.length > 0) {
        setDisplayNumbers(lotteryState.currentWinners);
      }
    }
  }, [
    lotteryState?.drawTimestamp,
    lotteryState?.currentWinners,
    lotteryState?.history,
  ]);

  // 4. 管理員操作
  const handleAdminAuth = () => {
    if (adminPin === "8888") {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setAdminPin("");
    } else {
      setModalConfig({
        isOpen: true,
        type: "info",
        title: "登入失敗",
        message: "密碼錯誤！",
      });
    }
  };

  const handleDraw = async (count) => {
    if (!isAdmin || !lotteryState || isAnimating || !db) return;

    const allNumbers = Array.from(
      { length: lotteryState.maxParticipants },
      (_, i) => i + 1
    );
    const availableNumbers = allNumbers.filter(
      (n) => !lotteryState.history.includes(n)
    );

    if (availableNumbers.length < count) {
      setModalConfig({
        isOpen: true,
        type: "info",
        title: "提示",
        message: `剩餘未中獎人數不足 ${count} 人！`,
      });
      return;
    }

    const shuffled = availableNumbers.sort(() => 0.5 - Math.random());
    const newWinners = shuffled.slice(0, count);
    newWinners.sort((a, b) => a - b);

    const docRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      LOTTERY_COLLECTION,
      MAIN_DOC_ID
    );
    try {
      await setDoc(docRef, {
        ...lotteryState,
        currentWinners: newWinners,
        history: [...lotteryState.history, ...newWinners],
        drawTimestamp: Date.now(),
        drawCount: count,
      });
    } catch (err) {
      console.error("Draw Error:", err);
      setModalConfig({
        isOpen: true,
        type: "info",
        title: "錯誤",
        message: "連線異常，請重試。",
      });
    }
  };

  const handleUpdateSettings = async () => {
    if (!isAdmin || !lotteryState || !db) return;
    const docRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      LOTTERY_COLLECTION,
      MAIN_DOC_ID
    );
    try {
      await setDoc(docRef, {
        ...lotteryState,
        maxParticipants: maxParticipants,
      });
      setModalConfig({
        isOpen: true,
        type: "info",
        title: "成功",
        message: "總人數設定已同步至雲端！",
      });
    } catch (err) {
      console.error("Update Error:", err);
    }
  };

  const handleReset = () => {
    if (!isAdmin || !lotteryState || !db) return;

    setModalConfig({
      isOpen: true,
      type: "confirm",
      title: "重置確認",
      message: "確定要清除所有中獎紀錄並重新開始嗎？全場手機將同步歸零。",
      onConfirm: async () => {
        const docRef = doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          LOTTERY_COLLECTION,
          MAIN_DOC_ID
        );
        try {
          await setDoc(docRef, {
            history: [],
            currentWinners: [],
            maxParticipants: lotteryState.maxParticipants,
            drawTimestamp: 0,
            drawCount: 1,
          });
          setDisplayNumbers([]);
          setLastDrawTime(0);
          setModalConfig((prev) => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error("Reset Error:", err);
        }
      },
    });
  };

  if (!user || !lotteryState) {
    return (
      <div className="min-h-screen bg-[#8a0f0f] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <Gift className="w-16 h-16 text-yellow-400 mb-4 animate-bounce" />
          <p className="text-yellow-400 text-xl font-bold tracking-widest">
            系統連線中...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#8a0f0f] relative overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-yellow-500 rounded-full mix-blend-screen filter blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-red-500 rounded-full mix-blend-screen filter blur-[100px]"></div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 relative z-10 flex flex-col min-h-screen">
        <header className="flex justify-between items-center mb-10">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-yellow-300 to-yellow-600 p-2 rounded-xl shadow-lg shadow-yellow-500/20">
              <Gift className="w-8 h-8 text-red-900" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-500 drop-shadow-md">
              IBM聯合春酒抽獎
            </h1>
          </div>

          <button
            onClick={() =>
              isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)
            }
            className="p-2 rounded-full bg-red-800/50 text-yellow-500 hover:bg-red-800 transition-colors border border-red-700 shadow-md"
            title="主持人模式"
          >
            {isAdmin ? (
              <Settings className="w-6 h-6" />
            ) : (
              <Lock className="w-6 h-6" />
            )}
          </button>
        </header>

        <div className="flex-grow flex flex-col items-center justify-center mb-12">
          <div className="text-yellow-400 text-xl md:text-2xl mb-8 font-medium tracking-widest uppercase">
            {isAnimating
              ? "緊張刺激！開獎中..."
              : displayNumbers.length > 0
              ? "恭喜以下幸運兒"
              : "等待主持人開獎"}
          </div>

          <div className="flex flex-wrap justify-center gap-6 md:gap-8 w-full">
            {displayNumbers.length > 0 ? (
              displayNumbers.map((num, idx) => (
                <div
                  key={idx}
                  className={`
                  relative w-32 h-40 md:w-48 md:h-60 rounded-3xl flex items-center justify-center
                  shadow-[0_10px_40px_rgba(0,0,0,0.5)] border-4 border-yellow-500/30 transition-all duration-300
                  ${
                    isAnimating
                      ? "bg-gradient-to-br from-red-600 to-red-800 scale-95"
                      : "bg-gradient-to-br from-yellow-400 via-yellow-300 to-yellow-600 scale-100 animate-[bounce_0.5s_ease-out]"
                  }
                `}
                >
                  <div
                    className={`absolute inset-2 border-2 rounded-2xl ${
                      isAnimating ? "border-red-500/30" : "border-yellow-100/50"
                    }`}
                  ></div>
                  <span
                    className={`text-6xl md:text-8xl font-black tabular-nums tracking-tighter ${
                      isAnimating
                        ? "text-white/90 blur-[1px]"
                        : "text-red-900 drop-shadow-md"
                    }`}
                  >
                    {num.toString().padStart(3, "0")}
                  </span>
                </div>
              ))
            ) : (
              <div className="w-full h-40 md:h-60 flex items-center justify-center border-4 border-dashed border-red-700/50 rounded-3xl bg-red-900/20 backdrop-blur-sm">
                <span className="text-red-400/50 text-2xl font-bold tracking-widest">
                  ? ? ?
                </span>
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="bg-red-950/80 backdrop-blur-md border border-red-800 p-6 rounded-3xl shadow-2xl mb-8">
            <h2 className="text-yellow-500 font-bold text-lg mb-6 flex items-center">
              <Settings className="w-5 h-5 mr-2" /> 主持人控制台
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-red-300 text-sm font-semibold uppercase tracking-wider">
                  執行抽獎
                </h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleDraw(1)}
                    disabled={isAnimating}
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 text-red-950 font-black py-4 px-6 rounded-2xl shadow-lg disabled:opacity-50 transition-transform active:scale-95 flex items-center justify-center text-lg"
                  >
                    <Play className="w-5 h-5 mr-2" /> 抽 1 人
                  </button>
                  <button
                    onClick={() => handleDraw(3)}
                    disabled={isAnimating}
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 text-red-950 font-black py-4 px-6 rounded-2xl shadow-lg disabled:opacity-50 transition-transform active:scale-95 flex items-center justify-center text-lg"
                  >
                    <Play className="w-5 h-5 mr-2" /> 抽 3 人
                  </button>
                  <button
                    onClick={() => handleDraw(5)}
                    disabled={isAnimating}
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 text-red-950 font-black py-4 px-6 rounded-2xl shadow-lg disabled:opacity-50 transition-transform active:scale-95 flex items-center justify-center text-lg"
                  >
                    <Play className="w-5 h-5 mr-2" /> 抽 5 人
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-red-300 text-sm font-semibold uppercase tracking-wider">
                  系統設定
                </h3>
                <div className="flex items-center gap-3 bg-red-900/50 p-3 rounded-2xl border border-red-800">
                  <Users className="text-red-400 w-5 h-5 ml-2" />
                  <span className="text-red-200">總參與人數</span>
                  <input
                    type="number"
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(Number(e.target.value))}
                    className="bg-red-950 text-yellow-400 font-bold px-3 py-2 rounded-xl w-24 outline-none border border-red-700 text-center ml-auto"
                  />
                  <button
                    onClick={handleUpdateSettings}
                    className="bg-red-800 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-medium transition-colors"
                  >
                    更新
                  </button>
                </div>
                <button
                  onClick={handleReset}
                  className="w-full bg-transparent border border-red-800 hover:bg-red-900/50 text-red-400 py-3 rounded-2xl flex items-center justify-center font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> 重置所有抽獎紀錄
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-black/20 backdrop-blur-sm rounded-3xl p-6 border border-red-900/50 mt-auto shadow-inner">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-red-300 font-medium flex items-center tracking-wider">
              <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />{" "}
              已開出序號 (共 {lotteryState.history.length} 人)
            </h3>
            <span className="text-red-500 text-sm font-bold bg-red-950 px-3 py-1 rounded-full border border-red-800">
              剩餘 {lotteryState.maxParticipants - lotteryState.history.length}{" "}
              個
            </span>
          </div>

          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {lotteryState.history.length === 0 ? (
              <p className="text-red-800 w-full text-center py-4 font-medium">
                尚未抽出任何序號
              </p>
            ) : (
              [...lotteryState.history].reverse().map((num, idx) => (
                <div
                  key={idx}
                  className="bg-red-900/60 text-yellow-500 border border-red-700 px-4 py-2 rounded-xl font-mono text-xl font-bold shadow-sm"
                >
                  {num.toString().padStart(3, "0")}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showAdminLogin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-red-950 border border-red-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl transform transition-all">
            <h2 className="text-2xl font-bold text-yellow-500 mb-2 text-center">
              主持人登入
            </h2>
            <p className="text-red-400 text-sm text-center mb-6">
              請輸入管理員密碼以開啟抽獎控制台
            </p>

            <input
              type="password"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="請輸入密碼"
              className="w-full bg-red-900/50 border border-red-700 text-yellow-400 text-center text-2xl tracking-widest py-4 rounded-2xl mb-6 outline-none focus:border-yellow-500 transition-colors placeholder:text-red-800/50"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAdminAuth()}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowAdminLogin(false)}
                className="flex-1 py-3 text-red-300 hover:bg-red-900/50 rounded-xl transition-colors font-medium border border-transparent hover:border-red-800"
              >
                取消
              </button>
              <button
                onClick={handleAdminAuth}
                className="flex-1 py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-red-950 rounded-xl font-black shadow-lg hover:shadow-yellow-500/20 active:scale-95 transition-all"
              >
                解鎖
              </button>
            </div>
          </div>
        </div>
      )}

      {modalConfig.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-red-950 border border-red-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl transform transition-all text-center">
            <h2 className="text-xl font-bold text-yellow-500 mb-4">
              {modalConfig.title}
            </h2>
            <p className="text-red-200 mb-8 font-medium">
              {modalConfig.message}
            </p>

            <div className="flex gap-3">
              {modalConfig.type === "confirm" && (
                <button
                  onClick={() =>
                    setModalConfig((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="flex-1 py-3 text-red-300 border border-red-800 hover:bg-red-900/50 rounded-xl transition-colors font-medium"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  if (modalConfig.type === "confirm" && modalConfig.onConfirm)
                    modalConfig.onConfirm();
                  else setModalConfig((prev) => ({ ...prev, isOpen: false }));
                }}
                className="flex-1 py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-red-950 rounded-xl font-black shadow-lg"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(138, 15, 15, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(234, 179, 8, 0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(234, 179, 8, 0.5); }
      `,
        }}
      />
    </div>
  );
}
